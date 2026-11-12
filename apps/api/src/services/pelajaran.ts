/**
 * Struktur kursus bab dan pelajaran serta progres belajar (ADR-0007).
 *
 * Bab yang menunjuk ke modul hanya tampil bila modul itu terbit. Isi pelajaran (isi_json) dan soal latihan
 * tidak pernah ikut di silabus publik; isi hanya dibaca lewat endpoint peserta terdaftar, dan kunci latihan
 * hanya dibaca di fungsi penilaian di server.
 */
import { NILAI_LULUS_LATIHAN_BAWAAN, nilaiJawaban, type JenisPelajaran } from '@sikop/shared';
import { acak } from '../lib/crypto.ts';
import { HttpError } from '../lib/http.ts';

/** Potongan SQL: bab yang boleh tampil (modul terkait terbit, atau bab tanpa modul). */
export const BAB_TAMPIL = '(b.modul_id IS NULL OR m.is_published = 1)';

export interface RingkasPelajaran {
  id: number;
  urutan: number;
  judul: string;
  jenis: JenisPelajaran;
  durasi_menit: number;
  wajib: boolean;
}
export interface RingkasBab {
  id: number;
  modul_id: number | null;
  urutan: number;
  judul: string;
  pelajaran: RingkasPelajaran[];
}

/** Silabus tanpa isi: bab dan pelajaran terurut. */
export async function silabusKursus(db: D1Database, kursusId: string): Promise<RingkasBab[]> {
  const { results } = await db
    .prepare(
      `SELECT b.id AS bab_id, b.modul_id, b.urutan AS bab_urutan, b.judul AS bab_judul,
              p.id, p.urutan, p.judul, p.jenis, p.durasi_menit, p.wajib
         FROM bab b
         LEFT JOIN modul m ON m.id = b.modul_id
         LEFT JOIN pelajaran p ON p.bab_id = b.id
        WHERE b.kursus_id = ? AND ${BAB_TAMPIL}
        ORDER BY b.urutan, p.urutan`,
    )
    .bind(kursusId)
    .all<{
      bab_id: number;
      modul_id: number | null;
      bab_urutan: number;
      bab_judul: string;
      id: number | null;
      urutan: number;
      judul: string;
      jenis: JenisPelajaran;
      durasi_menit: number;
      wajib: number;
    }>();
  const peta = new Map<number, RingkasBab>();
  for (const r of results) {
    let b = peta.get(r.bab_id);
    if (!b) {
      b = {
        id: r.bab_id,
        modul_id: r.modul_id,
        urutan: r.bab_urutan,
        judul: r.bab_judul,
        pelajaran: [],
      };
      peta.set(r.bab_id, b);
    }
    if (r.id !== null)
      b.pelajaran.push({
        id: r.id,
        urutan: r.urutan,
        judul: r.judul,
        jenis: r.jenis,
        durasi_menit: r.durasi_menit,
        wajib: r.wajib === 1,
      });
  }
  return [...peta.values()];
}

export interface PelajaranUtuh {
  id: number;
  bab_id: number;
  kursus_id: string;
  urutan: number;
  judul: string;
  jenis: JenisPelajaran;
  isi_json: string;
  durasi_menit: number;
  wajib: number;
  bab_judul: string;
  modul_id: number | null;
}

/** Pelajaran yang boleh dibaca: kursus terbit dan bab tampil. Null bila tidak ada. */
export async function ambilPelajaran(db: D1Database, id: number): Promise<PelajaranUtuh | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  return db
    .prepare(
      `SELECT p.id, p.bab_id, b.kursus_id, p.urutan, p.judul, p.jenis, p.isi_json, p.durasi_menit, p.wajib,
              b.judul AS bab_judul, b.modul_id
         FROM pelajaran p
         JOIN bab b ON b.id = p.bab_id
         JOIN kursus k ON k.id = b.kursus_id AND k.is_published = 1
         LEFT JOIN modul m ON m.id = b.modul_id
        WHERE p.id = ? AND ${BAB_TAMPIL}`,
    )
    .bind(id)
    .first<PelajaranUtuh>();
}

export interface RingkasProgres {
  selesai: number[];
  total: number;
  wajib_total: number;
  wajib_selesai: number;
  persen: number;
  /** Pelajaran berikutnya yang belum selesai (urutan silabus); null bila semua selesai. */
  lanjut: number | null;
}

export async function progresKursus(
  db: D1Database,
  akunId: string,
  kursusId: string,
): Promise<RingkasProgres> {
  const bab = await silabusKursus(db, kursusId);
  const semua = bab.flatMap((b) => b.pelajaran);
  const { results } = await db
    .prepare(
      `SELECT r.pelajaran_id FROM progres_pelajaran r
         JOIN pelajaran p ON p.id = r.pelajaran_id JOIN bab b ON b.id = p.bab_id
        WHERE r.akun_id = ? AND b.kursus_id = ?`,
    )
    .bind(akunId, kursusId)
    .all<{ pelajaran_id: number }>();
  const selesai = new Set(results.map((r) => r.pelajaran_id));
  const ada = semua.filter((p) => selesai.has(p.id));
  const wajib = semua.filter((p) => p.wajib);
  const wajibSelesai = wajib.filter((p) => selesai.has(p.id)).length;
  const dasar = wajib.length > 0 ? wajib : semua;
  const dasarSelesai = dasar.filter((p) => selesai.has(p.id)).length;
  return {
    selesai: ada.map((p) => p.id),
    total: semua.length,
    wajib_total: wajib.length,
    wajib_selesai: wajibSelesai,
    persen: dasar.length === 0 ? 0 : Math.round((dasarSelesai / dasar.length) * 100),
    lanjut: semua.find((p) => !selesai.has(p.id))?.id ?? null,
  };
}

/** Judul pelajaran wajib yang belum diselesaikan peserta (maksimal 5, untuk pesan galat). */
export async function pelajaranWajibBelum(
  db: D1Database,
  akunId: string,
  kursusId: string,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT p.judul FROM pelajaran p
         JOIN bab b ON b.id = p.bab_id LEFT JOIN modul m ON m.id = b.modul_id
        WHERE b.kursus_id = ? AND p.wajib = 1 AND ${BAB_TAMPIL}
          AND NOT EXISTS (SELECT 1 FROM progres_pelajaran r WHERE r.akun_id = ? AND r.pelajaran_id = p.id)
        ORDER BY b.urutan, p.urutan LIMIT 5`,
    )
    .bind(kursusId, akunId)
    .all<{ judul: string }>();
  return results.map((r) => r.judul);
}

export async function tandaiSelesai(
  db: D1Database,
  akunId: string,
  pelajaranId: number,
): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO progres_pelajaran (akun_id, pelajaran_id) VALUES (?, ?)')
    .bind(akunId, pelajaranId)
    .run();
}

interface OpsiSimpan {
  id: string;
  text: string;
}

/** Soal latihan untuk peserta: opsi diacak per permintaan, TANPA kunci dan pembahasan. */
export async function soalLatihanUntukPeserta(
  db: D1Database,
  pelajaranId: number,
): Promise<{ id: number; pertanyaan: string; opsi: OpsiSimpan[] }[]> {
  const { results } = await db
    .prepare(
      'SELECT id, pertanyaan, opsi_json FROM soal_latihan WHERE pelajaran_id = ? AND is_active = 1 ORDER BY urutan, id',
    )
    .bind(pelajaranId)
    .all<{ id: number; pertanyaan: string; opsi_json: string }>();
  return results.map((s) => ({
    id: s.id,
    pertanyaan: s.pertanyaan,
    opsi: acak(JSON.parse(s.opsi_json) as OpsiSimpan[]),
  }));
}

export interface HasilLatihan {
  nilai: number;
  benar: number;
  total: number;
  ambang: number;
  lulus: boolean;
  hasil: { id: number; benar: boolean; pembahasan: string | null }[];
}

/**
 * Menilai latihan di server. Jawaban untuk soal di luar pelajaran ini diabaikan. Respons memuat benar atau
 * salah per soal dan pembahasan, tetapi tidak pernah huruf kunci. Latihan dapat diulang tanpa batas.
 */
export async function nilaiLatihan(
  db: D1Database,
  pelajaran: PelajaranUtuh,
  jawaban: Record<string, string>,
): Promise<HasilLatihan> {
  if (pelajaran.jenis !== 'latihan')
    throw new HttpError(409, 'bukan_latihan', 'Pelajaran ini bukan latihan.');
  const { results } = await db
    .prepare(
      'SELECT id, kunci, pembahasan FROM soal_latihan WHERE pelajaran_id = ? AND is_active = 1 ORDER BY urutan, id',
    )
    .bind(pelajaran.id)
    .all<{ id: number; kunci: string; pembahasan: string | null }>();
  if (results.length === 0)
    throw new HttpError(409, 'soal_kosong', 'Soal latihan ini belum tersedia.');
  const isi = JSON.parse(pelajaran.isi_json) as { nilai_lulus?: number };
  const ambang = isi.nilai_lulus ?? NILAI_LULUS_LATIHAN_BAWAAN;
  const sah: Record<string, string> = {};
  for (const s of results) {
    const j = jawaban[String(s.id)];
    if (typeof j === 'string') sah[String(s.id)] = j.toUpperCase();
  }
  const skor = nilaiJawaban(results, sah);
  return {
    nilai: skor.nilai,
    benar: skor.benar,
    total: skor.total,
    ambang,
    lulus: skor.nilai >= ambang,
    hasil: results.map((s) => ({
      id: s.id,
      benar: (sah[String(s.id)] ?? '') === s.kunci.toUpperCase(),
      pembahasan: s.pembahasan,
    })),
  };
}
