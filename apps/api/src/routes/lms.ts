/**
 * Endpoint ruang belajar. Katalog dan materi bersifat publik; ujian dan profil wajib login.
 * Tidak ada endpoint di berkas ini yang memilih kolom soal.kunci kecuali hasilUjian() setelah lulus.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import {
  JawabanLatihanSchema,
  JawabanSchema,
  JENIS_UJIAN,
  KATEGORI_PESERTA,
  kolomPeserta,
  LEVEL_KURSUS,
  ProfilPesertaSchema,
  samarkanNip,
} from '@sikop/shared';
import type { AppEnv } from '../env.ts';
import { wajibLogin } from '../auth/sesi.ts';
import { auditStmt } from '../lib/audit.ts';
import { bacaBody, HttpError, tidakDitemukan } from '../lib/http.ts';
import { cachePublik } from '../lib/middleware.ts';
import { bacaPengaturan } from '../lib/pengaturan.ts';
import {
  hasilUjian,
  mulaiUjian,
  pastikanPeserta,
  serahkan,
  simpanJawaban,
} from '../services/lms.ts';
import {
  ambilPelajaran,
  BAB_TAMPIL,
  nilaiLatihan,
  progresKursus,
  silabusKursus,
  soalLatihanUntukPeserta,
  tandaiSelesai,
} from '../services/pelajaran.ts';

export const lms = new Hono<AppEnv>();

const MODUL_PUBLIK = `id, kursus_id, nomor, kode, judul, subjudul, deskripsi, kategori, estimasi, nilai_lulus, ringkasan,
                      video_json, kompetensi_json, sumber_json`;

const parseModul = (m: Record<string, unknown>): Record<string, unknown> => {
  const { video_json, kompetensi_json, sumber_json, ...rest } = m;
  return {
    ...rest,
    video: JSON.parse(String(video_json)),
    kompetensi: JSON.parse(String(kompetensi_json)),
    sumber: JSON.parse(String(sumber_json)),
  };
};

const KOLOM_KURSUS = `id, kode, judul, subjudul, deskripsi, kategori, estimasi, nilai_lulus_akhir, durasi_akhir_menit,
  jumlah_soal_akhir, level, sasaran_json, hasil_belajar_json, durasi_menit, gambar_url`;

/** Metadata katalog dari baris kursus: kolom JSON menjadi larik. */
const bentukKursus = (r: Record<string, unknown>): Record<string, unknown> => {
  const { sasaran_json, hasil_belajar_json, ...rest } = r;
  return {
    ...rest,
    sasaran: JSON.parse(String(sasaran_json ?? '[]')),
    hasil_belajar: JSON.parse(String(hasil_belajar_json ?? '[]')),
  };
};

lms.get('/kursus', cachePublik(300), async (c) => {
  const db = c.env.DB;
  const level = c.req.query('level');
  const sasaran = c.req.query('sasaran');
  if (level && !(LEVEL_KURSUS as readonly string[]).includes(level))
    throw new HttpError(422, 'validasi', 'Level kursus tidak dikenal.', {
      level: ['Pilih dasar, menengah, atau lanjut.'],
    });
  if (sasaran && !(KATEGORI_PESERTA as readonly string[]).includes(sasaran))
    throw new HttpError(422, 'validasi', 'Sasaran peserta tidak dikenal.', {
      sasaran: ['Pilih asn, umum, pelajar, atau mitra.'],
    });
  // Sasaran kosong ([]) berarti kursus untuk semua kategori peserta.
  const saring: string[] = ['is_published = 1'];
  const nilai: string[] = [];
  if (level) {
    saring.push('level = ?');
    nilai.push(level);
  }
  if (sasaran) {
    saring.push(
      "(sasaran_json = '[]' OR EXISTS (SELECT 1 FROM json_each(kursus.sasaran_json) WHERE value = ?))",
    );
    nilai.push(sasaran);
  }
  const [k, m, pel, akhir] = await db.batch([
    db
      .prepare(`SELECT ${KOLOM_KURSUS} FROM kursus WHERE ${saring.join(' AND ')} ORDER BY urutan`)
      .bind(...nilai),
    db.prepare(
      'SELECT kursus_id, COUNT(*) AS n FROM modul WHERE is_published = 1 GROUP BY kursus_id',
    ),
    db.prepare(
      `SELECT b.kursus_id, COUNT(p.id) AS n, COALESCE(SUM(p.durasi_menit), 0) AS menit
         FROM bab b LEFT JOIN modul m ON m.id = b.modul_id JOIN pelajaran p ON p.bab_id = b.id
        WHERE ${BAB_TAMPIL} GROUP BY b.kursus_id`,
    ),
    db.prepare(
      "SELECT kursus_id, COUNT(*) AS n FROM soal WHERE jenis = 'akhir' AND is_active = 1 GROUP BY kursus_id",
    ),
  ]);
  const hitung = (r: D1Result | undefined, kolom: string): Map<string, number> =>
    new Map(
      ((r?.results ?? []) as Record<string, string | number>[]).map((x) => [
        String(x.kursus_id),
        Number(x[kolom]),
      ]),
    );
  const jumlahModul = hitung(m, 'n');
  const jumlahPel = hitung(pel, 'n');
  const menitPel = hitung(pel, 'menit');
  const soalAkhir = hitung(akhir, 'n');
  return c.json({
    kursus: ((k?.results ?? []) as Record<string, unknown>[]).map((r) => {
      const id = String(r.id);
      const bentuk = bentukKursus(r);
      return {
        ...bentuk,
        durasi_menit: Number(r.durasi_menit) > 0 ? r.durasi_menit : (menitPel.get(id) ?? 0),
        jumlah_modul: jumlahModul.get(id) ?? 0,
        jumlah_pelajaran: jumlahPel.get(id) ?? 0,
        bersertifikat: (soalAkhir.get(id) ?? 0) > 0,
      };
    }),
  });
});

lms.get('/kursus/:id', cachePublik(300), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const [k, m, s] = await db.batch([
    db.prepare(`SELECT ${KOLOM_KURSUS} FROM kursus WHERE id = ? AND is_published = 1`).bind(id),
    db
      .prepare(
        `SELECT ${MODUL_PUBLIK} FROM modul WHERE kursus_id = ? AND is_published = 1 ORDER BY nomor`,
      )
      .bind(id),
    db
      .prepare(
        'SELECT modul_id, jenis, COUNT(*) AS n FROM soal WHERE kursus_id = ? AND is_active = 1 GROUP BY modul_id, jenis',
      )
      .bind(id),
  ]);
  const baris = k?.results?.[0] as Record<string, unknown> | undefined;
  if (!baris) throw tidakDitemukan('Kursus');
  const bab = await silabusKursus(db, id);
  const semuaPel = bab.flatMap((b) => b.pelajaran);
  const kursus = {
    ...bentukKursus(baris),
    durasi_menit:
      Number(baris.durasi_menit) > 0
        ? baris.durasi_menit
        : semuaPel.reduce((a, p) => a + p.durasi_menit, 0),
    jumlah_pelajaran: semuaPel.length,
    jumlah_pelajaran_wajib: semuaPel.filter((p) => p.wajib).length,
  };
  const jumlah = (s?.results ?? []) as { modul_id: number | null; jenis: string; n: number }[];
  const modul = ((m?.results ?? []) as Record<string, unknown>[]).map((row) => ({
    ...parseModul(row),
    jumlah_soal: Object.fromEntries(
      jumlah.filter((j) => j.modul_id === row.id).map((j) => [j.jenis, j.n]),
    ),
  }));
  const akhir = jumlah.find((j) => j.jenis === 'akhir')?.n ?? 0;
  return c.json({
    kursus: { ...kursus, bersertifikat: akhir > 0 },
    modul,
    // Silabus bab dan pelajaran: tanpa isi pelajaran dan tanpa soal latihan.
    bab,
    jumlah_soal_akhir_tersedia: akhir,
  });
});

lms.use('/saya/*', wajibLogin);
lms.use('/pelajaran/*', wajibLogin);
lms.use('/ujian/*', wajibLogin);
lms.use('/ujian', wajibLogin);

lms.get('/saya/profil', async (c) => {
  const akun = c.get('akun')!;
  const p = await c.env.DB.prepare(
    'SELECT kategori, nama, nip, instansi, jabatan, status, catatan, created_at, verified_at FROM peserta WHERE akun_id = ?',
  )
    .bind(akun.id)
    .first<Record<string, string | null>>();
  return c.json({
    akun: { email: akun.email, nama: akun.nama },
    peserta: p ? { ...p, nip: p.nip ? samarkanNip(p.nip) : null } : null,
  });
});

/** Mendaftar / memperbarui profil peserta. Data pribadi hanya disimpan setelah persetujuan eksplisit (T07). */
lms.post('/saya/profil', async (c) => {
  const akun = c.get('akun')!;
  const input = await bacaBody(c, ProfilPesertaSchema);
  const k = kolomPeserta(input);
  const db = c.env.DB;
  const lama = await db
    .prepare('SELECT kategori, nama, nip, instansi, jabatan, status FROM peserta WHERE akun_id = ?')
    .bind(akun.id)
    .first<Record<string, string | null>>();
  if (lama && lama.status === 'terverifikasi') {
    if (lama.kategori !== k.kategori)
      throw new HttpError(
        409,
        'kategori_terkunci',
        'Kategori peserta yang sudah diverifikasi tidak dapat diubah. Hubungi pengelola.',
      );
    if (lama.nip !== k.nip)
      throw new HttpError(
        409,
        'nip_terkunci',
        'NIP peserta yang sudah diverifikasi tidak dapat diubah. Hubungi pengelola.',
      );
  }
  if (k.nip) {
    const dipakai = await db
      .prepare('SELECT 1 FROM peserta WHERE nip = ? AND akun_id <> ?')
      .bind(k.nip, akun.id)
      .first();
    if (dipakai)
      throw new HttpError(
        409,
        'nip_dipakai',
        'NIP ini sudah terdaftar pada akun lain. Hubungi pengelola bila ini NIP Anda.',
      );
  }
  const p = await bacaPengaturan(db);
  const waktu = new Date().toISOString();
  const statusBaru = lama?.status === 'terverifikasi' ? 'terverifikasi' : 'menunggu';
  await db.batch([
    db
      .prepare(
        `INSERT INTO peserta (akun_id, kategori, nama, nip, instansi, jabatan, status, setuju_privasi_at, privasi_versi) VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT(akun_id) DO UPDATE SET kategori = excluded.kategori, nama = excluded.nama, nip = excluded.nip,
           instansi = excluded.instansi, jabatan = excluded.jabatan,
           status = ?, setuju_privasi_at = excluded.setuju_privasi_at, privasi_versi = excluded.privasi_versi, updated_at = ?`,
      )
      .bind(
        akun.id,
        k.kategori,
        k.nama,
        k.nip,
        k.instansi,
        k.jabatan,
        statusBaru,
        waktu,
        p.privasi_versi ?? '1.0',
        statusBaru,
        waktu,
      ),
    await auditStmt(
      c,
      lama ? 'ubah' : 'daftar',
      'peserta',
      akun.id,
      lama ? { ...lama, nip: lama.nip ? samarkanNip(lama.nip) : null } : null,
      {
        kategori: k.kategori,
        nama: k.nama,
        instansi: k.instansi,
        jabatan: k.jabatan,
        nip: k.nip ? samarkanNip(k.nip) : null,
      },
    ),
  ]);
  return c.json({ ok: true, status: statusBaru }, lama ? 200 : 201);
});

/** Kemajuan belajar peserta pada satu kursus. */
lms.get('/saya/progres/:kursus', async (c) => {
  const akun = c.get('akun')!;
  const db = c.env.DB;
  const kursusId = c.req.param('kursus');
  const [mod, perc, sert] = await db.batch([
    db
      .prepare(
        'SELECT id, nomor, judul, nilai_lulus FROM modul WHERE kursus_id = ? AND is_published = 1 ORDER BY nomor',
      )
      .bind(kursusId),
    db
      .prepare(
        'SELECT id, modul_id, jenis, nilai, lulus, selesai_at, batas_at, mulai_at FROM percobaan WHERE akun_id = ? AND kursus_id = ? ORDER BY mulai_at',
      )
      .bind(akun.id, kursusId),
    db
      .prepare(
        'SELECT nomor, kode_verifikasi, terbit_at, status FROM sertifikat WHERE akun_id = ? AND kursus_id = ?',
      )
      .bind(akun.id, kursusId),
  ]);
  type P = {
    id: string;
    modul_id: number | null;
    jenis: string;
    nilai: number | null;
    lulus: number | null;
    selesai_at: string | null;
    batas_at: string;
    mulai_at: string;
  };
  const semua = (perc?.results ?? []) as P[];
  const modul = (
    (mod?.results ?? []) as { id: number; nomor: number; judul: string; nilai_lulus: number }[]
  ).map((m) => {
    const milik = semua.filter((p) => p.modul_id === m.id);
    const pre = milik.find((p) => p.jenis === 'pre' && p.selesai_at);
    const post = milik.filter((p) => p.jenis === 'post' && p.selesai_at);
    return {
      ...m,
      pre: pre ? { id: pre.id, nilai: pre.nilai } : null,
      post_terbaik: post.reduce<number | null>(
        (a, p) => (p.nilai !== null && (a === null || p.nilai > a) ? p.nilai : a),
        null,
      ),
      post_percobaan: post.length,
      post_lulus_id: post.find((p) => p.lulus === 1)?.id ?? null,
      lulus: post.some((p) => p.lulus === 1),
    };
  });
  const akhir = semua.filter((p) => p.jenis === 'akhir' && p.selesai_at);
  const pel = await progresKursus(db, akun.id, kursusId);
  const sehari = semua.filter(
    (p) => p.jenis === 'akhir' && Date.parse(p.mulai_at) > Date.now() - 86_400_000,
  ).length;
  return c.json({
    modul,
    akhir: {
      boleh_mulai:
        modul.length > 0 &&
        modul.every((m) => m.lulus) &&
        pel.wajib_selesai === pel.wajib_total &&
        !akhir.some((p) => p.lulus === 1),
      pelajaran_wajib_belum: pel.wajib_total - pel.wajib_selesai,
      percobaan: akhir.map((p) => ({
        id: p.id,
        nilai: p.nilai,
        lulus: p.lulus === 1,
        selesai_at: p.selesai_at,
      })),
      percobaan_24_jam: sehari,
      lulus: akhir.some((p) => p.lulus === 1),
    },
    pelajaran: pel,
    sertifikat: sert?.results?.[0] ?? null,
  });
});

/** Isi pelajaran untuk peserta terdaftar. Soal latihan dikirim tanpa kunci dan pembahasan. */
lms.get('/pelajaran/:id', async (c) => {
  const akun = c.get('akun')!;
  const db = c.env.DB;
  await pastikanPeserta(db, akun.id);
  const p = await ambilPelajaran(db, Number(c.req.param('id')));
  if (!p) throw tidakDitemukan('Pelajaran');
  const [bab, pr, selesai, soal] = await Promise.all([
    silabusKursus(db, p.kursus_id),
    progresKursus(db, akun.id, p.kursus_id),
    db
      .prepare('SELECT selesai_pada FROM progres_pelajaran WHERE akun_id = ? AND pelajaran_id = ?')
      .bind(akun.id, p.id)
      .first<{ selesai_pada: string }>(),
    p.jenis === 'latihan' ? soalLatihanUntukPeserta(db, p.id) : Promise.resolve(null),
  ]);
  const urut = bab.flatMap((b) => b.pelajaran.map((x) => ({ ...x, bab_id: b.id })));
  const i = urut.findIndex((x) => x.id === p.id);
  return c.json({
    pelajaran: {
      id: p.id,
      bab_id: p.bab_id,
      bab_judul: p.bab_judul,
      modul_id: p.modul_id,
      kursus_id: p.kursus_id,
      judul: p.judul,
      jenis: p.jenis,
      durasi_menit: p.durasi_menit,
      wajib: p.wajib === 1,
      isi: JSON.parse(p.isi_json),
      selesai: Boolean(selesai),
      selesai_pada: selesai?.selesai_pada ?? null,
      ...(soal ? { soal } : {}),
    },
    sebelumnya: i > 0 ? urut[i - 1]!.id : null,
    berikutnya: i >= 0 && i < urut.length - 1 ? urut[i + 1]!.id : null,
    progres: pr,
  });
});

/** Menilai latihan di server. Lulus berarti pelajaran otomatis selesai. */
lms.post('/pelajaran/:id/latihan', async (c) => {
  const akun = c.get('akun')!;
  const db = c.env.DB;
  await pastikanPeserta(db, akun.id);
  const { jawaban } = await bacaBody(c, JawabanLatihanSchema);
  const p = await ambilPelajaran(db, Number(c.req.param('id')));
  if (!p) throw tidakDitemukan('Pelajaran');
  const hasil = await nilaiLatihan(db, p, jawaban);
  if (hasil.lulus) await tandaiSelesai(db, akun.id, p.id);
  return c.json({ ...hasil, selesai: hasil.lulus });
});

/** Menandai pelajaran selesai. Latihan hanya selesai dengan lulus, bukan dengan tombol. */
lms.post('/saya/progres/:pelajaran', async (c) => {
  const akun = c.get('akun')!;
  const db = c.env.DB;
  await pastikanPeserta(db, akun.id);
  const p = await ambilPelajaran(db, Number(c.req.param('pelajaran')));
  if (!p) throw tidakDitemukan('Pelajaran');
  if (p.jenis === 'latihan')
    throw new HttpError(
      409,
      'latihan_wajib_lulus',
      'Latihan dinyatakan selesai setelah Anda mencapai nilai minimal.',
    );
  await tandaiSelesai(db, akun.id, p.id);
  return c.json({ ok: true, progres: await progresKursus(db, akun.id, p.kursus_id) });
});

/** Kursus yang sedang atau sudah diikuti peserta, dengan persentase progres dan sertifikat. */
lms.get('/saya/kursus', async (c) => {
  const akun = c.get('akun')!;
  const db = c.env.DB;
  const { results } = await db
    .prepare(
      `SELECT k.id, k.kode, k.judul, k.level, k.gambar_url, k.durasi_menit, k.kategori
         FROM kursus k
        WHERE k.is_published = 1 AND (
              EXISTS (SELECT 1 FROM progres_pelajaran r JOIN pelajaran p ON p.id = r.pelajaran_id JOIN bab b ON b.id = p.bab_id
                       WHERE r.akun_id = ?1 AND b.kursus_id = k.id)
           OR EXISTS (SELECT 1 FROM percobaan x WHERE x.akun_id = ?1 AND x.kursus_id = k.id)
           OR EXISTS (SELECT 1 FROM sertifikat s WHERE s.akun_id = ?1 AND s.kursus_id = k.id))
        ORDER BY k.urutan`,
    )
    .bind(akun.id)
    .all<{
      id: string;
      kode: string;
      judul: string;
      level: string;
      gambar_url: string | null;
      durasi_menit: number;
      kategori: string;
    }>();
  const kursus = [];
  for (const k of results) {
    const [pr, sert, lulus, terakhir] = await Promise.all([
      progresKursus(db, akun.id, k.id),
      db
        .prepare(
          'SELECT nomor, kode_verifikasi, terbit_at, status FROM sertifikat WHERE akun_id = ? AND kursus_id = ?',
        )
        .bind(akun.id, k.id)
        .first(),
      db
        .prepare(
          "SELECT 1 FROM percobaan WHERE akun_id = ? AND kursus_id = ? AND jenis = 'akhir' AND lulus = 1",
        )
        .bind(akun.id, k.id)
        .first(),
      db
        .prepare(
          `SELECT MAX(r.selesai_pada) AS t FROM progres_pelajaran r JOIN pelajaran p ON p.id = r.pelajaran_id
             JOIN bab b ON b.id = p.bab_id WHERE r.akun_id = ? AND b.kursus_id = ?`,
        )
        .bind(akun.id, k.id)
        .first<{ t: string | null }>(),
    ]);
    const selesai = Boolean(sert) || Boolean(lulus);
    kursus.push({
      ...k,
      pelajaran_total: pr.total,
      pelajaran_selesai: pr.selesai.length,
      persen: selesai ? 100 : pr.persen,
      lanjut_pelajaran_id: pr.lanjut,
      status: selesai ? 'selesai' : 'berjalan',
      sertifikat: sert ?? null,
      terakhir_belajar: terakhir?.t ?? null,
    });
  }
  return c.json({ kursus });
});

lms.post('/ujian', async (c) => {
  const input = await bacaBody(
    c,
    z.object({
      kursus_id: z.string().min(1).max(60),
      jenis: z.enum(JENIS_UJIAN),
      modul_id: z.number().int().positive().nullable().default(null),
    }),
  );
  return c.json(await mulaiUjian(c.env.DB, c.get('akun')!.id, input));
});

lms.put('/ujian/:id/jawaban', async (c) => {
  const { jawaban } = await bacaBody(c, z.object({ jawaban: JawabanSchema }));
  await simpanJawaban(c.env.DB, c.get('akun')!.id, c.req.param('id'), jawaban);
  return c.json({ ok: true, waktu_server: new Date().toISOString() });
});

lms.post('/ujian/:id/serahkan', async (c) => {
  const { jawaban } = await bacaBody(c, z.object({ jawaban: JawabanSchema }));
  return c.json(await serahkan(c.env.DB, c.get('akun')!.id, c.req.param('id'), jawaban));
});

lms.get('/ujian/:id', async (c) =>
  c.json(await hasilUjian(c.env.DB, c.get('akun')!.id, c.req.param('id'))),
);

lms.get('/saya/sertifikat/:kode', async (c) => {
  const s = await c.env.DB.prepare(
    `SELECT nomor, kode_verifikasi, nama_peserta, nip_samaran, instansi, judul_kursus, nilai, terbit_at,
            penandatangan_nama, penandatangan_jabatan, penandatangan_nip, status, dicabut_alasan
       FROM sertifikat WHERE kode_verifikasi = ? AND akun_id = ?`,
  )
    .bind(c.req.param('kode').toUpperCase(), c.get('akun')!.id)
    .first();
  if (!s) throw tidakDitemukan('Sertifikat');
  return c.json({ sertifikat: s });
});
