/**
 * Logika ruang belajar di sisi server (perbaikan K01, K02).
 *
 * - Soal dikirim TANPA kunci; urutan soal dan opsi diacak per percobaan (kunci lama 63% "A").
 * - Batas waktu dicatat di server (batas_at). Penyerahan yang terlambat memakai jawaban tersimpan terakhir.
 * - Penilaian dan penerbitan sertifikat hanya terjadi di sini; browser tidak dapat menulis nilai/sertifikat.
 */
import {
  ALFABET_KODE,
  DURASI_BAWAAN,
  MAKS_PERCOBAAN_AKHIR_PER_HARI,
  nilaiJawaban,
  samarkanNip,
  TENGGANG_DETIK,
  type JenisUjian,
  type Opsi,
} from '@sikop/shared';
import { acak, kodeAcak } from '../lib/crypto.ts';
import { HttpError, tidakDitemukan } from '../lib/http.ts';
import { bacaPengaturan } from '../lib/pengaturan.ts';
import { pelajaranWajibBelum } from './pelajaran.ts';

export const JEDA_POST_DETIK = 60;

interface Urutan {
  id: number;
  o: string[];
}

interface Percobaan {
  id: string;
  akun_id: string;
  kursus_id: string;
  modul_id: number | null;
  jenis: JenisUjian;
  soal_ids_json: string;
  jawaban_json: string;
  mulai_at: string;
  batas_at: string;
  selesai_at: string | null;
  benar: number | null;
  total: number | null;
  nilai: number | null;
  lulus: number | null;
}

export interface StatusSertifikat {
  status: 'terbit' | 'sudah_ada' | 'menunggu_verifikasi' | 'ditangguhkan' | 'belum_lulus';
  nomor?: string;
  kode_verifikasi?: string;
}

const iso = (ms = Date.now()): string => new Date(ms).toISOString();

export async function pastikanPeserta(db: D1Database, akunId: string): Promise<{ status: string }> {
  const p = await db
    .prepare('SELECT status FROM peserta WHERE akun_id = ?')
    .bind(akunId)
    .first<{ status: string }>();
  if (!p) throw new HttpError(403, 'profil', 'Lengkapi profil peserta terlebih dahulu.');
  if (p.status === 'ditolak' || p.status === 'nonaktif')
    throw new HttpError(
      403,
      'peserta_nonaktif',
      'Akun peserta Anda tidak aktif. Hubungi pengelola ruang belajar.',
    );
  return p;
}

/** Menyelesaikan percobaan kedaluwarsa yang ditinggalkan, memakai jawaban tersimpan. */
export async function tutupKedaluwarsa(
  db: D1Database,
  filter: { akunId?: string } = {},
): Promise<number> {
  const batas = iso(Date.now() - TENGGANG_DETIK * 1000);
  const { results } = await db
    .prepare(
      `SELECT id, akun_id FROM percobaan WHERE selesai_at IS NULL AND batas_at < ? ${filter.akunId ? 'AND akun_id = ?' : ''} LIMIT 200`,
    )
    .bind(...(filter.akunId ? [batas, filter.akunId] : [batas]))
    .all<{ id: string; akun_id: string }>();
  for (const r of results) await serahkan(db, r.akun_id, r.id, null);
  return results.length;
}

/** Memulai ujian, atau melanjutkan percobaan yang masih berjalan (aman saat halaman dimuat ulang). */
export async function mulaiUjian(
  db: D1Database,
  akunId: string,
  input: { kursus_id: string; jenis: JenisUjian; modul_id: number | null },
): Promise<Record<string, unknown>> {
  await pastikanPeserta(db, akunId);
  const kursus = await db
    .prepare(
      'SELECT id, durasi_akhir_menit, jumlah_soal_akhir FROM kursus WHERE id = ? AND is_published = 1',
    )
    .bind(input.kursus_id)
    .first<{ id: string; durasi_akhir_menit: number; jumlah_soal_akhir: number }>();
  if (!kursus) throw tidakDitemukan('Kursus');
  if (input.jenis === 'akhir') input.modul_id = null;
  else {
    if (!input.modul_id) throw new HttpError(422, 'validasi', 'Modul wajib dipilih.');
    const m = await db
      .prepare('SELECT id FROM modul WHERE id = ? AND kursus_id = ? AND is_published = 1')
      .bind(input.modul_id, kursus.id)
      .first();
    if (!m) throw tidakDitemukan('Modul');
  }

  await tutupKedaluwarsa(db, { akunId });
  const aktif = await db
    .prepare(
      `SELECT * FROM percobaan WHERE akun_id = ? AND kursus_id = ? AND jenis = ? AND modul_id IS ? AND selesai_at IS NULL ORDER BY mulai_at DESC LIMIT 1`,
    )
    .bind(akunId, kursus.id, input.jenis, input.modul_id)
    .first<Percobaan>();
  if (aktif) return payloadUjian(db, aktif);

  await periksaAturan(db, akunId, kursus.id, input.jenis, input.modul_id);

  const { results: soal } = input.modul_id
    ? await db
        .prepare(
          'SELECT id, opsi_json FROM soal WHERE modul_id = ? AND jenis = ? AND is_active = 1',
        )
        .bind(input.modul_id, input.jenis)
        .all<{ id: number; opsi_json: string }>()
    : await db
        .prepare(
          "SELECT id, opsi_json FROM soal WHERE kursus_id = ? AND jenis = 'akhir' AND is_active = 1",
        )
        .bind(kursus.id)
        .all<{ id: number; opsi_json: string }>();
  if (soal.length === 0)
    throw new HttpError(409, 'soal_kosong', 'Soal untuk ujian ini belum tersedia.');

  const terpilih = acak(soal).slice(
    0,
    input.jenis === 'akhir' ? kursus.jumlah_soal_akhir : soal.length,
  );
  const urutan: Urutan[] = terpilih.map((s) => ({
    id: s.id,
    o: acak((JSON.parse(s.opsi_json) as Opsi[]).map((o) => o.id)),
  }));
  const menit = input.jenis === 'akhir' ? kursus.durasi_akhir_menit : DURASI_BAWAAN[input.jenis];
  const p: Percobaan = {
    id: crypto.randomUUID(),
    akun_id: akunId,
    kursus_id: kursus.id,
    modul_id: input.modul_id,
    jenis: input.jenis,
    soal_ids_json: JSON.stringify(urutan),
    jawaban_json: '{}',
    mulai_at: iso(),
    batas_at: iso(Date.now() + menit * 60_000),
    selesai_at: null,
    benar: null,
    total: null,
    nilai: null,
    lulus: null,
  };
  await db
    .prepare(
      'INSERT INTO percobaan (id, akun_id, kursus_id, modul_id, jenis, soal_ids_json, mulai_at, batas_at) VALUES (?,?,?,?,?,?,?,?)',
    )
    .bind(
      p.id,
      p.akun_id,
      p.kursus_id,
      p.modul_id,
      p.jenis,
      p.soal_ids_json,
      p.mulai_at,
      p.batas_at,
    )
    .run();
  return payloadUjian(db, p);
}

async function periksaAturan(
  db: D1Database,
  akunId: string,
  kursusId: string,
  jenis: JenisUjian,
  modulId: number | null,
): Promise<void> {
  if (jenis === 'pre') {
    const sudah = await db
      .prepare(
        "SELECT 1 FROM percobaan WHERE akun_id = ? AND modul_id = ? AND jenis = 'pre' AND selesai_at IS NOT NULL",
      )
      .bind(akunId, modulId)
      .first();
    if (sudah)
      throw new HttpError(409, 'sudah_dikerjakan', 'Pre-test modul ini sudah Anda kerjakan.');
    return;
  }
  if (jenis === 'post') {
    const pre = await db
      .prepare(
        "SELECT 1 FROM percobaan WHERE akun_id = ? AND modul_id = ? AND jenis = 'pre' AND selesai_at IS NOT NULL",
      )
      .bind(akunId, modulId)
      .first();
    if (!pre) throw new HttpError(409, 'urutan', 'Kerjakan pre-test modul ini terlebih dahulu.');
    const terakhir = await db
      .prepare(
        "SELECT selesai_at FROM percobaan WHERE akun_id = ? AND modul_id = ? AND jenis = 'post' AND selesai_at IS NOT NULL ORDER BY selesai_at DESC LIMIT 1",
      )
      .bind(akunId, modulId)
      .first<{ selesai_at: string }>();
    if (terakhir && Date.now() - Date.parse(terakhir.selesai_at) < JEDA_POST_DETIK * 1000)
      throw new HttpError(
        429,
        'jeda',
        `Tunggu ${JEDA_POST_DETIK} detik sebelum mengulang post-test. Gunakan waktu ini untuk meninjau materi.`,
      );
    return;
  }
  const belum = await db
    .prepare(
      `SELECT m.judul FROM modul m
        WHERE m.kursus_id = ? AND m.is_published = 1
          AND NOT EXISTS (SELECT 1 FROM percobaan p WHERE p.akun_id = ? AND p.modul_id = m.id AND p.jenis = 'post' AND p.lulus = 1)
        ORDER BY m.nomor`,
    )
    .bind(kursusId, akunId)
    .all<{ judul: string }>();
  if (belum.results.length)
    throw new HttpError(
      409,
      'modul_belum_lulus',
      `Selesaikan post-test semua modul terlebih dahulu. Belum lulus: ${belum.results.map((r) => r.judul).join('; ')}.`,
    );
  const belumPel = await pelajaranWajibBelum(db, akunId, kursusId);
  if (belumPel.length)
    throw new HttpError(
      409,
      'pelajaran_belum_selesai',
      `Selesaikan semua pelajaran wajib terlebih dahulu. Belum selesai: ${belumPel.join('; ')}.`,
    );
  const lulus = await db
    .prepare(
      "SELECT 1 FROM percobaan WHERE akun_id = ? AND kursus_id = ? AND jenis = 'akhir' AND lulus = 1",
    )
    .bind(akunId, kursusId)
    .first();
  if (lulus) throw new HttpError(409, 'sudah_lulus', 'Anda sudah lulus ujian akhir kursus ini.');
  const hari = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM percobaan WHERE akun_id = ? AND kursus_id = ? AND jenis = 'akhir' AND mulai_at > ?",
    )
    .bind(akunId, kursusId, iso(Date.now() - 86_400_000))
    .first<{ n: number }>();
  if ((hari?.n ?? 0) >= MAKS_PERCOBAAN_AKHIR_PER_HARI)
    throw new HttpError(
      429,
      'batas_percobaan',
      `Batas ${MAKS_PERCOBAAN_AKHIR_PER_HARI} percobaan ujian akhir per 24 jam telah tercapai. Silakan coba lagi besok.`,
    );
}

/** Bentuk yang dikirim ke browser: soal dan opsi dalam urutan acak, TANPA kunci dan pembahasan. */
async function payloadUjian(db: D1Database, p: Percobaan): Promise<Record<string, unknown>> {
  const urutan = JSON.parse(p.soal_ids_json) as Urutan[];
  const ids = urutan.map((u) => u.id);
  const { results } = await db
    .prepare(
      `SELECT id, pertanyaan, opsi_json FROM soal WHERE id IN (${ids.map(() => '?').join(',')})`,
    )
    .bind(...ids)
    .all<{ id: number; pertanyaan: string; opsi_json: string }>();
  const peta = new Map(results.map((r) => [r.id, r]));
  const soal = urutan.flatMap((u) => {
    const s = peta.get(u.id);
    if (!s) return [];
    const opsi = new Map((JSON.parse(s.opsi_json) as Opsi[]).map((o) => [o.id, o.text]));
    return [
      {
        id: s.id,
        pertanyaan: s.pertanyaan,
        opsi: u.o.filter((id) => opsi.has(id)).map((id) => ({ id, text: opsi.get(id) })),
      },
    ];
  });
  return {
    id: p.id,
    jenis: p.jenis,
    kursus_id: p.kursus_id,
    modul_id: p.modul_id,
    mulai_at: p.mulai_at,
    batas_at: p.batas_at,
    waktu_server: iso(),
    jawaban: JSON.parse(p.jawaban_json),
    soal,
  };
}

/** Simpan jawaban sementara (autosave). Ditolak setelah batas waktu. */
export async function simpanJawaban(
  db: D1Database,
  akunId: string,
  id: string,
  jawaban: Record<string, string>,
): Promise<void> {
  const p = await db
    .prepare(
      'SELECT soal_ids_json, batas_at, selesai_at FROM percobaan WHERE id = ? AND akun_id = ?',
    )
    .bind(id, akunId)
    .first<Percobaan>();
  if (!p) throw tidakDitemukan('Ujian');
  if (p.selesai_at) throw new HttpError(409, 'sudah_selesai', 'Ujian ini sudah diserahkan.');
  if (Date.now() > Date.parse(p.batas_at) + TENGGANG_DETIK * 1000)
    throw new HttpError(410, 'waktu_habis', 'Waktu ujian telah habis.');
  const sah = saringJawaban(p.soal_ids_json, jawaban);
  await db
    .prepare('UPDATE percobaan SET jawaban_json = ? WHERE id = ? AND selesai_at IS NULL')
    .bind(JSON.stringify(sah), id)
    .run();
}

function saringJawaban(
  soalIdsJson: string,
  jawaban: Record<string, string> | null,
): Record<string, string> {
  if (!jawaban) return {};
  const izin = new Map(
    (JSON.parse(soalIdsJson) as Urutan[]).map((u) => [String(u.id), new Set(u.o)]),
  );
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(jawaban)) {
    const up = v.toUpperCase();
    if (izin.get(k)?.has(up)) out[k] = up;
  }
  return out;
}

/**
 * Menyerahkan dan menilai. Idempoten: penyerahan kedua mengembalikan hasil yang sama.
 * @param jawaban null berarti pakai jawaban tersimpan (penutupan otomatis).
 */
export async function serahkan(
  db: D1Database,
  akunId: string,
  id: string,
  jawaban: Record<string, string> | null,
): Promise<{ percobaan: Record<string, unknown>; sertifikat?: StatusSertifikat }> {
  const p = await db
    .prepare('SELECT * FROM percobaan WHERE id = ? AND akun_id = ?')
    .bind(id, akunId)
    .first<Percobaan>();
  if (!p) throw tidakDitemukan('Ujian');
  if (p.selesai_at) return { percobaan: ringkas(p) };

  const terlambat = Date.now() > Date.parse(p.batas_at) + TENGGANG_DETIK * 1000;
  const final = saringJawaban(
    p.soal_ids_json,
    terlambat || jawaban === null ? JSON.parse(p.jawaban_json) : jawaban,
  );
  const urutan = JSON.parse(p.soal_ids_json) as Urutan[];
  const { results: kunci } = await db
    .prepare(`SELECT id, kunci FROM soal WHERE id IN (${urutan.map(() => '?').join(',')})`)
    .bind(...urutan.map((u) => u.id))
    .all<{ id: number; kunci: string }>();
  const hasil = nilaiJawaban(kunci, final);

  const ambang =
    p.jenis === 'akhir'
      ? await db
          .prepare('SELECT nilai_lulus_akhir AS n FROM kursus WHERE id = ?')
          .bind(p.kursus_id)
          .first<{ n: number }>()
      : await db
          .prepare('SELECT nilai_lulus AS n FROM modul WHERE id = ?')
          .bind(p.modul_id)
          .first<{ n: number }>();
  const lulus = p.jenis === 'pre' ? null : hasil.nilai >= (ambang?.n ?? 100) ? 1 : 0;
  const selesai = terlambat ? p.batas_at : iso();

  const upd = await db
    .prepare(
      'UPDATE percobaan SET selesai_at = ?, jawaban_json = ?, benar = ?, total = ?, nilai = ?, lulus = ? WHERE id = ? AND selesai_at IS NULL',
    )
    .bind(selesai, JSON.stringify(final), hasil.benar, hasil.total, hasil.nilai, lulus, id)
    .run();
  const sekarang = await db
    .prepare('SELECT * FROM percobaan WHERE id = ?')
    .bind(id)
    .first<Percobaan>();
  if (!sekarang) throw tidakDitemukan('Ujian');
  if (!upd.meta.changes) return { percobaan: ringkas(sekarang) }; // diserahkan oleh permintaan lain lebih dulu

  if (p.jenis === 'akhir' && lulus === 1) {
    return {
      percobaan: ringkas(sekarang),
      sertifikat: await terbitkanSertifikat(db, akunId, p.kursus_id),
    };
  }
  return { percobaan: ringkas(sekarang) };
}

const ringkas = (p: Percobaan): Record<string, unknown> => ({
  id: p.id,
  jenis: p.jenis,
  kursus_id: p.kursus_id,
  modul_id: p.modul_id,
  mulai_at: p.mulai_at,
  selesai_at: p.selesai_at,
  benar: p.benar,
  total: p.total,
  nilai: p.nilai,
  lulus: p.lulus === null ? null : p.lulus === 1,
});

/**
 * Menerbitkan sertifikat bila SEMUA syarat terpenuhi. Dipanggil setelah lulus ujian akhir,
 * setelah admin memverifikasi peserta, atau saat admin menerbitkan sertifikat tertunda.
 * Nomor urut dihitung di dalam satu pernyataan INSERT...SELECT sehingga atomik.
 */
export async function terbitkanSertifikat(
  db: D1Database,
  akunId: string,
  kursusId: string,
  aktor = 'sistem',
): Promise<StatusSertifikat> {
  const ada = await db
    .prepare('SELECT nomor, kode_verifikasi FROM sertifikat WHERE akun_id = ? AND kursus_id = ?')
    .bind(akunId, kursusId)
    .first<{ nomor: string; kode_verifikasi: string }>();
  if (ada) return { status: 'sudah_ada', ...ada };
  const lulus = await db
    .prepare(
      "SELECT id, nilai FROM percobaan WHERE akun_id = ? AND kursus_id = ? AND jenis = 'akhir' AND lulus = 1 ORDER BY nilai DESC, selesai_at LIMIT 1",
    )
    .bind(akunId, kursusId)
    .first<{ id: string; nilai: number }>();
  if (!lulus) return { status: 'belum_lulus' };
  const peserta = await db
    .prepare('SELECT nama, nip, instansi, status FROM peserta WHERE akun_id = ?')
    .bind(akunId)
    .first<{ nama: string; nip: string | null; instansi: string; status: string }>();
  if (!peserta || peserta.status !== 'terverifikasi') return { status: 'menunggu_verifikasi' };
  const p = await bacaPengaturan(db);
  if (p.sertifikat_aktif !== '1' || !p.penandatangan_nama || !p.penandatangan_jabatan)
    return { status: 'ditangguhkan' };
  const kursus = await db
    .prepare('SELECT kode, judul FROM kursus WHERE id = ?')
    .bind(kursusId)
    .first<{ kode: string; judul: string }>();
  if (!kursus) return { status: 'ditangguhkan' };

  const kode = kodeAcak(10, ALFABET_KODE);
  const tahun = Number(iso(Date.now() + 7 * 3600_000).slice(0, 4));
  const terbit = iso();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO sertifikat (nomor, kode_verifikasi, akun_id, kursus_id, percobaan_id, urut, tahun, nama_peserta, nip_samaran,
                                   instansi, judul_kursus, nilai, terbit_at, penandatangan_nama, penandatangan_jabatan, penandatangan_nip)
           SELECT 'SIKOP/' || ? || '/' || CAST(? AS INTEGER) || '/' || printf('%05d', n), ?, ?, ?, ?, n, CAST(? AS INTEGER), ?, ?, ?, ?, ?, ?, ?, ?, ?
             FROM (SELECT COALESCE(MAX(urut), 0) + 1 AS n FROM sertifikat WHERE kursus_id = ? AND tahun = CAST(? AS INTEGER))`,
        )
        .bind(
          kursus.kode,
          tahun,
          kode,
          akunId,
          kursusId,
          lulus.id,
          tahun,
          peserta.nama,
          // Peserta non-ASN tidak punya NIP; kolom wajib terisi, jadi string kosong dan tidak ditampilkan.
          peserta.nip ? samarkanNip(peserta.nip) : '',
          peserta.instansi,
          kursus.judul,
          lulus.nilai,
          terbit,
          p.penandatangan_nama,
          p.penandatangan_jabatan,
          p.penandatangan_nip || null,
          kursusId,
          tahun,
        ),
      db
        .prepare(
          "INSERT INTO audit_log (aktor, aksi, entitas, entitas_id, sesudah) VALUES (?, 'terbit', 'sertifikat', ?, ?)",
        )
        .bind(
          aktor,
          `${akunId}/${kursusId}`,
          JSON.stringify({ kode_verifikasi: kode, nilai: lulus.nilai }),
        ),
    ]);
  } catch (e) {
    // Balapan dengan penerbitan paralel untuk akun yang sama: kembalikan yang sudah ada.
    const lagi = await db
      .prepare('SELECT nomor, kode_verifikasi FROM sertifikat WHERE akun_id = ? AND kursus_id = ?')
      .bind(akunId, kursusId)
      .first<{ nomor: string; kode_verifikasi: string }>();
    if (lagi) return { status: 'sudah_ada', ...lagi };
    throw e;
  }
  const baru = await db
    .prepare('SELECT nomor, kode_verifikasi FROM sertifikat WHERE akun_id = ? AND kursus_id = ?')
    .bind(akunId, kursusId)
    .first<{ nomor: string; kode_verifikasi: string }>();
  return { status: 'terbit', ...(baru ?? {}) };
}

/** Hasil percobaan untuk pemiliknya. Pembahasan hanya dibuka setelah post-test modul itu lulus; ujian akhir tidak pernah. */
export async function hasilUjian(
  db: D1Database,
  akunId: string,
  id: string,
): Promise<Record<string, unknown>> {
  const p = await db
    .prepare('SELECT * FROM percobaan WHERE id = ? AND akun_id = ?')
    .bind(id, akunId)
    .first<Percobaan>();
  if (!p) throw tidakDitemukan('Ujian');
  if (!p.selesai_at) return { percobaan: ringkas(p), pembahasan: null };
  if (p.jenis === 'akhir') return { percobaan: ringkas(p), pembahasan: null };
  const lulusModul = await db
    .prepare(
      "SELECT 1 FROM percobaan WHERE akun_id = ? AND modul_id = ? AND jenis = 'post' AND lulus = 1",
    )
    .bind(akunId, p.modul_id)
    .first();
  if (!lulusModul) return { percobaan: ringkas(p), pembahasan: null };
  const urutan = JSON.parse(p.soal_ids_json) as Urutan[];
  const jawaban = JSON.parse(p.jawaban_json) as Record<string, string>;
  const { results } = await db
    .prepare(
      `SELECT id, pertanyaan, opsi_json, kunci, pembahasan FROM soal WHERE id IN (${urutan.map(() => '?').join(',')})`,
    )
    .bind(...urutan.map((u) => u.id))
    .all<{
      id: number;
      pertanyaan: string;
      opsi_json: string;
      kunci: string;
      pembahasan: string | null;
    }>();
  const peta = new Map(results.map((r) => [r.id, r]));
  return {
    percobaan: ringkas(p),
    pembahasan: urutan.flatMap((u) => {
      const s = peta.get(u.id);
      if (!s) return [];
      const opsi = new Map((JSON.parse(s.opsi_json) as Opsi[]).map((o) => [o.id, o.text]));
      return [
        {
          id: s.id,
          pertanyaan: s.pertanyaan,
          opsi: u.o.map((o) => ({ id: o, text: opsi.get(o) ?? '' })),
          jawaban_anda: jawaban[String(s.id)] ?? null,
          kunci: s.kunci,
          pembahasan: s.pembahasan,
        },
      ];
    }),
  };
}
