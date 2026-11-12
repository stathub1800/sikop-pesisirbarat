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

/* ---------- Struktur kursus: kategori peserta, level, bab, pelajaran (ADR-0007) ---------- */

export const KATEGORI_PESERTA = ['asn', 'umum', 'pelajar', 'mitra'] as const;
export type KategoriPeserta = (typeof KATEGORI_PESERTA)[number];
export const LABEL_KATEGORI_PESERTA: Readonly<Record<KategoriPeserta, string>> = {
  asn: 'ASN / OPD Pemda',
  umum: 'Masyarakat umum',
  pelajar: 'Pelajar dan mahasiswa',
  mitra: 'Petugas dan mitra BPS',
};

export const LEVEL_KURSUS = ['dasar', 'menengah', 'lanjut'] as const;
export type LevelKursus = (typeof LEVEL_KURSUS)[number];
export const LABEL_LEVEL_KURSUS: Readonly<Record<LevelKursus, string>> = {
  dasar: 'Dasar',
  menengah: 'Menengah',
  lanjut: 'Lanjut',
};

export const JENIS_PELAJARAN = ['video', 'bacaan', 'pdf', 'latihan'] as const;
export type JenisPelajaran = (typeof JENIS_PELAJARAN)[number];
export const LABEL_JENIS_PELAJARAN: Readonly<Record<JenisPelajaran, string>> = {
  video: 'Video',
  bacaan: 'Bacaan',
  pdf: 'Dokumen',
  latihan: 'Latihan',
};

/** Nilai minimal latihan bila tidak diatur pada isi pelajaran. */
export const NILAI_LULUS_LATIHAN_BAWAAN = 60;

const RE_ID_YOUTUBE = /^[A-Za-z0-9_-]{6,20}$/;

/**
 * Mengambil ID video dari tautan YouTube (watch, youtu.be, embed, shorts). Mengembalikan null bila
 * bukan tautan YouTube yang dikenali, sehingga hanya youtube-nocookie.com yang pernah dipasang di iframe.
 */
export function idVideoYoutube(url: string): string | null {
  // Tanpa kelas URL: paket bersama tidak bergantung pada pustaka DOM.
  const m =
    /^https:\/\/(?:www\.|m\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)(\/[^?#]*)?(?:\?([^#]*))?(?:#.*)?$/i.exec(
      url.trim(),
    );
  if (!m) return null;
  const host = m[1]!.toLowerCase();
  const bagian = (m[2] ?? '').split('/').filter(Boolean);
  let id: string | undefined;
  if (host === 'youtu.be') id = bagian[0];
  else if (bagian[0] === 'watch')
    id = (m[3] ?? '')
      .split('&')
      .map((kv) => kv.split('='))
      .find(([k]) => k === 'v')?.[1];
  else if (bagian[0] === 'embed' || bagian[0] === 'shorts') id = bagian[1];
  return id && RE_ID_YOUTUBE.test(id) ? id : null;
}

export const urlEmbedYoutube = (id: string): string =>
  `https://www.youtube-nocookie.com/embed/${id}`;

const urlHttps = z
  .string()
  .trim()
  .max(500)
  .regex(/^https:\/\/[^\s]+$/, 'Harus diawali https://');

/** Isi pelajaran menurut jenisnya. Latihan hanya memuat petunjuk; soal dan kunci di tabel soal_latihan. */
export const IsiVideoSchema = z.object({
  url: z
    .string()
    .trim()
    .refine((v) => {
      const id = idVideoYoutube(v);
      return id !== null && v.startsWith('https://www.youtube-nocookie.com/embed/');
    }, 'Gunakan tautan embed youtube-nocookie.com'),
  durasi: z.string().trim().max(10).nullish(),
});
export const IsiBacaanSchema = z.object({ markdown: z.string().max(30_000) });
export const IsiPdfSchema = z.object({
  url: urlHttps,
  penerbit: z.string().trim().max(120).nullish(),
  halaman: z.number().int().min(1).max(5000).nullish(),
});
export const IsiLatihanSchema = z.object({
  petunjuk: z.string().trim().max(1000).nullish(),
  nilai_lulus: z.number().int().min(0).max(100).default(NILAI_LULUS_LATIHAN_BAWAAN),
});

export const IsiPelajaranSchemas = {
  video: IsiVideoSchema,
  bacaan: IsiBacaanSchema,
  pdf: IsiPdfSchema,
  latihan: IsiLatihanSchema,
} as const;

/** Memeriksa dan merapikan isi_json untuk jenis tertentu. Dipakai API, skrip seed, dan uji. */
export function periksaIsiPelajaran(
  jenis: JenisPelajaran,
  isi: unknown,
): { sukses: true; isi: Record<string, unknown> } | { sukses: false; pesan: string } {
  const r = IsiPelajaranSchemas[jenis].safeParse(isi);
  return r.success
    ? { sukses: true, isi: r.data as Record<string, unknown> }
    : {
        sukses: false,
        pesan: r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; '),
      };
}

/** Skema jawaban latihan: sama dengan jawaban ujian (id soal ke huruf opsi). */
export const JawabanLatihanSchema = z.object({ jawaban: JawabanSchema });

/** Format durasi menit untuk tampilan: 90 menjadi "1 jam 30 menit". */
export function formatDurasiMenit(menit: number): string {
  const m = Math.max(0, Math.round(menit));
  if (m === 0) return '';
  if (m < 60) return `${m} menit`;
  const j = Math.floor(m / 60);
  const s = m % 60;
  return s === 0 ? `${j} jam` : `${j} jam ${s} menit`;
}

/* ---------- Penyusun kursus di admin (ADR-0008) ---------- */

export const BabInputSchema = z.object({
  judul: z.string().trim().min(3, 'Judul bab minimal 3 karakter').max(160),
  /** Modul yang menyimpan pre-test dan post-test bab ini; null bila bab tanpa evaluasi. */
  modul_id: z.number().int().positive().nullable().default(null),
  is_published: z.boolean().default(false),
  version: z.number().int().positive().optional(),
});
export type BabInput = z.infer<typeof BabInputSchema>;

/** Tautan YouTube biasa (watch, youtu.be, shorts) dinormalkan ke bentuk embed youtube-nocookie. */
export function normalkanIsiVideo(isi: unknown): unknown {
  if (!isi || typeof isi !== 'object' || Array.isArray(isi)) return isi;
  const o = isi as Record<string, unknown>;
  const id = typeof o.url === 'string' ? idVideoYoutube(o.url) : null;
  return id ? { ...o, url: urlEmbedYoutube(id) } : isi;
}

export const PelajaranInputSchema = z
  .object({
    judul: z.string().trim().min(3, 'Judul pelajaran minimal 3 karakter').max(160),
    jenis: z.enum(JENIS_PELAJARAN),
    isi: z.record(z.string(), z.unknown()),
    durasi_menit: z.number().int().min(0).max(600).default(0),
    wajib: z.boolean().default(true),
    is_published: z.boolean().default(false),
    version: z.number().int().positive().optional(),
  })
  .transform((v, ctx) => {
    const r = periksaIsiPelajaran(v.jenis, v.jenis === 'video' ? normalkanIsiVideo(v.isi) : v.isi);
    if (!r.sukses) {
      ctx.addIssue({ code: 'custom', message: r.pesan, path: ['isi'] });
      return z.NEVER;
    }
    return { ...v, isi: r.isi };
  });
export type PelajaranInput = z.output<typeof PelajaranInputSchema>;

/** Urutan baru: daftar id dalam urutan yang diinginkan, tanpa duplikat. */
export const UrutanInputSchema = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1)
    .max(200)
    .refine((a) => new Set(a).size === a.length, 'ID tidak boleh ganda'),
});

export const SoalLatihanInputSchema = z
  .object({
    pertanyaan: z.string().trim().min(5).max(2000),
    opsi: z.array(OpsiSchema).min(2).max(5),
    kunci: z.string().regex(/^[A-E]$/),
    pembahasan: z.string().trim().max(3000).nullish(),
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
  });
export type SoalLatihanInput = z.infer<typeof SoalLatihanInputSchema>;
