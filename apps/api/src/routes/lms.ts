/**
 * Endpoint ruang belajar. Katalog dan materi bersifat publik; ujian dan profil wajib login.
 * Tidak ada endpoint di berkas ini yang memilih kolom soal.kunci kecuali hasilUjian() setelah lulus.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { JawabanSchema, JENIS_UJIAN, ProfilPesertaSchema, samarkanNip } from '@sikop/shared';
import type { AppEnv } from '../env.ts';
import { wajibLogin } from '../auth/sesi.ts';
import { auditStmt } from '../lib/audit.ts';
import { bacaBody, HttpError, tidakDitemukan } from '../lib/http.ts';
import { cachePublik } from '../lib/middleware.ts';
import { bacaPengaturan } from '../lib/pengaturan.ts';
import { hasilUjian, mulaiUjian, serahkan, simpanJawaban } from '../services/lms.ts';

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

lms.get('/kursus', cachePublik(300), async (c) => {
  const db = c.env.DB;
  const [k, m] = await db.batch([
    db.prepare(
      'SELECT id, kode, judul, subjudul, deskripsi, kategori, estimasi, nilai_lulus_akhir, durasi_akhir_menit, jumlah_soal_akhir FROM kursus WHERE is_published = 1 ORDER BY urutan',
    ),
    db.prepare(
      'SELECT kursus_id, COUNT(*) AS n FROM modul WHERE is_published = 1 GROUP BY kursus_id',
    ),
  ]);
  const jumlah = new Map(
    ((m?.results ?? []) as { kursus_id: string; n: number }[]).map((r) => [r.kursus_id, r.n]),
  );
  return c.json({
    kursus: ((k?.results ?? []) as { id: string }[]).map((r) => ({
      ...r,
      jumlah_modul: jumlah.get(r.id) ?? 0,
    })),
  });
});

lms.get('/kursus/:id', cachePublik(300), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const [k, m, s] = await db.batch([
    db
      .prepare(
        'SELECT id, kode, judul, subjudul, deskripsi, kategori, estimasi, nilai_lulus_akhir, durasi_akhir_menit, jumlah_soal_akhir FROM kursus WHERE id = ? AND is_published = 1',
      )
      .bind(id),
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
  const kursus = k?.results?.[0];
  if (!kursus) throw tidakDitemukan('Kursus');
  const jumlah = (s?.results ?? []) as { modul_id: number | null; jenis: string; n: number }[];
  const modul = ((m?.results ?? []) as Record<string, unknown>[]).map((row) => ({
    ...parseModul(row),
    jumlah_soal: Object.fromEntries(
      jumlah.filter((j) => j.modul_id === row.id).map((j) => [j.jenis, j.n]),
    ),
  }));
  return c.json({
    kursus,
    modul,
    jumlah_soal_akhir_tersedia: jumlah.find((j) => j.jenis === 'akhir')?.n ?? 0,
  });
});

lms.use('/saya/*', wajibLogin);
lms.use('/ujian/*', wajibLogin);
lms.use('/ujian', wajibLogin);

lms.get('/saya/profil', async (c) => {
  const akun = c.get('akun')!;
  const p = await c.env.DB.prepare(
    'SELECT nama, nip, instansi, jabatan, status, catatan, created_at, verified_at FROM peserta WHERE akun_id = ?',
  )
    .bind(akun.id)
    .first<Record<string, string>>();
  return c.json({
    akun: { email: akun.email, nama: akun.nama },
    peserta: p ? { ...p, nip: samarkanNip(p.nip ?? '') } : null,
  });
});

/** Mendaftar / memperbarui profil peserta. Data pribadi hanya disimpan setelah persetujuan eksplisit (T07). */
lms.post('/saya/profil', async (c) => {
  const akun = c.get('akun')!;
  const input = await bacaBody(c, ProfilPesertaSchema);
  const nip = input.nip.replace(/\s/g, '');
  const db = c.env.DB;
  const lama = await db
    .prepare('SELECT nama, nip, instansi, jabatan, status FROM peserta WHERE akun_id = ?')
    .bind(akun.id)
    .first<Record<string, string>>();
  if (lama && lama.status === 'terverifikasi' && lama.nip !== nip)
    throw new HttpError(
      409,
      'nip_terkunci',
      'NIP peserta yang sudah diverifikasi tidak dapat diubah. Hubungi pengelola.',
    );
  const dipakai = await db
    .prepare('SELECT 1 FROM peserta WHERE nip = ? AND akun_id <> ?')
    .bind(nip, akun.id)
    .first();
  if (dipakai)
    throw new HttpError(
      409,
      'nip_dipakai',
      'NIP ini sudah terdaftar pada akun lain. Hubungi pengelola bila ini NIP Anda.',
    );
  const p = await bacaPengaturan(db);
  const waktu = new Date().toISOString();
  const statusBaru = lama?.status === 'terverifikasi' ? 'terverifikasi' : 'menunggu';
  await db.batch([
    db
      .prepare(
        `INSERT INTO peserta (akun_id, nama, nip, instansi, jabatan, status, setuju_privasi_at, privasi_versi) VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(akun_id) DO UPDATE SET nama = excluded.nama, nip = excluded.nip, instansi = excluded.instansi, jabatan = excluded.jabatan,
           status = ?, setuju_privasi_at = excluded.setuju_privasi_at, privasi_versi = excluded.privasi_versi, updated_at = ?`,
      )
      .bind(
        akun.id,
        input.nama,
        nip,
        input.instansi,
        input.jabatan,
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
      lama ? { ...lama, nip: samarkanNip(lama.nip ?? '') } : null,
      { nama: input.nama, instansi: input.instansi, jabatan: input.jabatan, nip: samarkanNip(nip) },
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
  const sehari = semua.filter(
    (p) => p.jenis === 'akhir' && Date.parse(p.mulai_at) > Date.now() - 86_400_000,
  ).length;
  return c.json({
    modul,
    akhir: {
      boleh_mulai:
        modul.length > 0 && modul.every((m) => m.lulus) && !akhir.some((p) => p.lulus === 1),
      percobaan: akhir.map((p) => ({
        id: p.id,
        nilai: p.nilai,
        lulus: p.lulus === 1,
        selesai_at: p.selesai_at,
      })),
      percobaan_24_jam: sehari,
      lulus: akhir.some((p) => p.lulus === 1),
    },
    sertifikat: sert?.results?.[0] ?? null,
  });
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
