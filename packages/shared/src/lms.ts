/**
 * Domain ruang belajar (LMS): penilaian, aturan kelulusan, dan nomor sertifikat.
 * Fungsi di sini dijalankan di SERVER (Worker). Frontend hanya menerima soal tanpa kunci (K01, K02).
 */
import { z } from 'zod';

export const JENIS_UJIAN = ['pre', 'post', 'akhir'] as const;
export type JenisUjian = (typeof JENIS_UJIAN)[number];

export const LABEL_UJIAN: Readonly<Record<JenisUjian, string>> = {
  pre: 'Pre-test',
  post: 'Post-test',
  akhir: 'Ujian Akhir',
};

export interface Opsi {
  id: string;
  text: string;
}

export interface SoalDenganKunci {
  id: number;
  kunci: string;
}

export interface HasilPenilaian {
  benar: number;
  total: number;
  /** Nilai 0 sampai 100, dibulatkan 2 desimal. */
  nilai: number;
}

/**
 * Menilai jawaban. Soal yang tidak dijawab dihitung salah. Jawaban untuk soal yang tidak
 * termasuk dalam percobaan diabaikan, sehingga peserta tidak dapat menambah soal sendiri.
 */
export function nilaiJawaban(
  soal: readonly SoalDenganKunci[],
  jawaban: Readonly<Record<string, string>>,
): HasilPenilaian {
  const total = soal.length;
  let benar = 0;
  for (const s of soal) {
    const j = jawaban[String(s.id)];
    if (typeof j === 'string' && j.trim().toUpperCase() === s.kunci.trim().toUpperCase()) benar++;
  }
  const nilai = total === 0 ? 0 : Math.round((benar / total) * 10000) / 100;
  return { benar, total, nilai };
}

/** Durasi bawaan per jenis ujian (menit) bila tidak diatur di basis data. */
export const DURASI_BAWAAN: Readonly<Record<JenisUjian, number>> = { pre: 10, post: 15, akhir: 45 };

/** Tenggang waktu jaringan saat penyerahan setelah batas waktu (detik). */
export const TENGGANG_DETIK = 30;

/** Batas percobaan ujian akhir dalam 24 jam, untuk mencegah tebak-tebakan berulang. */
export const MAKS_PERCOBAAN_AKHIR_PER_HARI = 3;

/** Format nomor sertifikat: SIKOP/<KODE-KURSUS>/<TAHUN>/<URUT 5 digit>. */
export const formatNomorSertifikat = (kodeKursus: string, tahun: number, urut: number): string =>
  `SIKOP/${kodeKursus}/${tahun}/${String(urut).padStart(5, '0')}`;

/** Alfabet tanpa karakter yang mudah tertukar (0/O, 1/I/L) untuk kode verifikasi. */
export const ALFABET_KODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const RE_KODE_VERIFIKASI = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/;

export const JawabanSchema = z.record(
  z.string().regex(/^\d{1,9}$/),
  z.string().regex(/^[A-Ea-e]$/),
);

export const OpsiSchema = z.object({
  id: z.string().regex(/^[A-E]$/),
  text: z.string().trim().min(1).max(500),
});

/** Skema soal untuk admin. Kunci wajib salah satu id opsi. */
export const SoalInputSchema = z
  .object({
    kursus_id: z.string().min(1).max(60),
    modul_id: z.number().int().positive().nullable(),
    jenis: z.enum(JENIS_UJIAN),
    pertanyaan: z.string().trim().min(5).max(2000),
    opsi: z.array(OpsiSchema).min(2).max(5),
    kunci: z.string().regex(/^[A-E]$/),
    pembahasan: z.string().trim().max(3000).nullable().optional(),
    urutan: z.number().int().min(0).max(10000).default(0),
    is_active: z.boolean().default(true),
  })
  .refine((s) => s.opsi.some((o) => o.id === s.kunci), {
    message: 'Kunci jawaban harus salah satu opsi',
    path: ['kunci'],
  })
  .refine((s) => new Set(s.opsi.map((o) => o.id)).size === s.opsi.length, {
    message: 'ID opsi tidak boleh ganda',
    path: ['opsi'],
  })
  .refine((s) => (s.jenis === 'akhir') === (s.modul_id === null), {
    message: 'Soal ujian akhir tidak terikat modul; soal pre/post wajib terikat modul',
    path: ['modul_id'],
  });
export type SoalInput = z.infer<typeof SoalInputSchema>;
