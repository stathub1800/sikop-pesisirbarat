/**
 * Skema validasi payload API. Dipakai di server (wajib) dan di form frontend (kenyamanan).
 */
import { z } from 'zod';
import { isKodeKecamatan } from './kecamatan.ts';
import { KATEGORI_PESERTA, LEVEL_KURSUS } from './lms.ts';
import { validasiNip } from './nip.ts';

const teksWajib = (min: number, max: number) => z.string().trim().min(min).max(max);
const teksOpsional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const email = z.string().trim().toLowerCase().max(120).email('Format email tidak valid');
const noHp = z
  .string()
  .trim()
  .regex(/^(\+62|62|0)8[0-9]{7,12}$/, 'Nomor HP diawali 08 atau +628, 10 sampai 15 digit');

/* ---------- Layanan data (perbaikan K03) ---------- */

export const KATEGORI_PERMOHONAN = [
  'permintaan_data',
  'konsultasi_statistik',
  'rekomendasi_kegiatan',
  'lainnya',
] as const;
export const LABEL_KATEGORI_PERMOHONAN: Readonly<
  Record<(typeof KATEGORI_PERMOHONAN)[number], string>
> = {
  permintaan_data: 'Permintaan data',
  konsultasi_statistik: 'Konsultasi statistik',
  rekomendasi_kegiatan: 'Rekomendasi kegiatan statistik',
  lainnya: 'Lainnya',
};

export const STATUS_PERMOHONAN = ['baru', 'diproses', 'selesai', 'ditolak'] as const;
export type StatusPermohonan = (typeof STATUS_PERMOHONAN)[number];

export const PermohonanSchema = z.object({
  nama: teksWajib(3, 120),
  email,
  no_hp: noHp
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  instansi: teksOpsional(160),
  kategori: z.enum(KATEGORI_PERMOHONAN),
  pesan: teksWajib(20, 3000),
  setuju_privasi: z.literal(true, { error: 'Persetujuan pemrosesan data pribadi wajib dicentang' }),
  turnstile_token: z.string().max(4096).optional().default(''),
  /** Jebakan bot: harus kosong. */
  situs: z.string().max(0).optional().default(''),
});
export type PermohonanInput = z.infer<typeof PermohonanSchema>;

export const RE_TIKET = /^PST-\d{8}-[A-Z0-9]{5}$/;
export const CekPermohonanSchema = z.object({
  tiket: z.string().trim().toUpperCase().regex(RE_TIKET, 'Format nomor tiket: PST-YYYYMMDD-XXXXX'),
  email,
});

export const PermohonanUpdateSchema = z.object({
  status: z.enum(STATUS_PERMOHONAN),
  tanggapan: teksOpsional(3000),
  catatan_internal: teksOpsional(3000),
});

/* ---------- Peserta LMS (perbaikan T07, S06) ---------- */

const NipPesertaSchema = z
  .string()
  .trim()
  .superRefine((v, ctx) => {
    const r = validasiNip(v);
    if (!r.valid) ctx.addIssue({ code: 'custom', message: r.pesan ?? 'NIP tidak valid' });
  });
const dasarPeserta = {
  nama: teksWajib(3, 120),
  setuju_privasi: z.literal(true, { error: 'Persetujuan pemrosesan data pribadi wajib dicentang' }),
};

/**
 * Pendaftaran peserta bercabang menurut kategori (ADR-0007). Data minimum: NIP hanya diminta dari ASN.
 * Permintaan lama tanpa `kategori` diperlakukan sebagai ASN agar klien lama tetap berfungsi.
 */
export const ProfilPesertaSchema = z.preprocess(
  (v) =>
    v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    (v as { kategori?: unknown }).kategori === undefined
      ? { ...v, kategori: 'asn' }
      : v,
  z.discriminatedUnion('kategori', [
    z.object({
      kategori: z.literal('asn'),
      ...dasarPeserta,
      nip: NipPesertaSchema,
      instansi: teksWajib(3, 160),
      jabatan: teksWajib(2, 120),
    }),
    z.object({ kategori: z.literal('umum'), ...dasarPeserta, pekerjaan: teksWajib(3, 120) }),
    z.object({ kategori: z.literal('pelajar'), ...dasarPeserta, sekolah: teksWajib(3, 160) }),
    z.object({ kategori: z.literal('mitra'), ...dasarPeserta, kegiatan: teksWajib(3, 160) }),
  ]),
);
export type ProfilPesertaInput = z.infer<typeof ProfilPesertaSchema>;

/**
 * Memetakan isian per kategori ke kolom tabel peserta. Kolom `instansi` menyimpan asal peserta
 * (instansi, pekerjaan, sekolah/kampus, atau kegiatan BPS); `jabatan` dan `nip` hanya untuk ASN.
 */
export function kolomPeserta(p: ProfilPesertaInput): {
  kategori: ProfilPesertaInput['kategori'];
  nama: string;
  nip: string | null;
  instansi: string;
  jabatan: string | null;
} {
  switch (p.kategori) {
    case 'asn':
      return {
        kategori: 'asn',
        nama: p.nama,
        nip: p.nip.replace(/\s/g, ''),
        instansi: p.instansi,
        jabatan: p.jabatan,
      };
    case 'umum':
      return { kategori: 'umum', nama: p.nama, nip: null, instansi: p.pekerjaan, jabatan: null };
    case 'pelajar':
      return { kategori: 'pelajar', nama: p.nama, nip: null, instansi: p.sekolah, jabatan: null };
    case 'mitra':
      return { kategori: 'mitra', nama: p.nama, nip: null, instansi: p.kegiatan, jabatan: null };
  }
}

export const STATUS_PESERTA = ['menunggu', 'terverifikasi', 'ditolak', 'nonaktif'] as const;
export const VerifikasiPesertaSchema = z.object({
  status: z.enum(STATUS_PESERTA),
  catatan: teksOpsional(500),
});

/* ---------- Admin ---------- */

export const PERAN = ['superadmin', 'editor_data', 'pengelola_lms', 'petugas_pst'] as const;
export type Peran = (typeof PERAN)[number];
export const LABEL_PERAN: Readonly<Record<Peran, string>> = {
  superadmin: 'Superadmin',
  editor_data: 'Editor Data',
  pengelola_lms: 'Pengelola Ruang Belajar',
  petugas_pst: 'Petugas PST',
};

export const AdminUserSchema = z.object({
  email,
  nama: teksWajib(3, 120),
  peran: z.enum(PERAN),
  is_active: z.boolean().default(true),
});

export const INDIKATOR_ID = /^[a-z][a-z0-9_]{2,59}$/;

export const IndikatorManualSchema = z
  .object({
    id: z.string().regex(INDIKATOR_ID, 'ID huruf kecil, angka, garis bawah; 3 sampai 60 karakter'),
    nama: teksWajib(3, 120),
    satuan: teksWajib(1, 40),
    kategori: teksWajib(2, 60),
    sumber: teksOpsional(200),
    tahun: teksOpsional(20),
    metode: teksOpsional(1000),
    desimal: z.number().int().min(0).max(3),
    arah: z.enum(['naik_baik', 'turun_baik', 'netral']),
    agregasi: z.enum(['jumlah', 'rasio', 'tidak_ada']),
    kabupaten_nilai: z.number().finite().nullable().optional(),
    is_published: z.boolean(),
    urutan: z.number().int().min(0).max(1000).default(100),
    nilai: z.record(
      z.string().refine(isKodeKecamatan, 'Kode kecamatan tidak dikenal'),
      z.number().finite().nullable(),
    ),
    version: z.number().int().min(0),
  })
  .refine((v) => !v.is_published || (v.sumber && v.tahun && v.metode), {
    message: 'Indikator hanya boleh tayang bila sumber, tahun, dan cara hitung sudah diisi',
    path: ['is_published'],
  });
export type IndikatorManualInput = z.infer<typeof IndikatorManualSchema>;

/** Pengaturan situs yang boleh diubah admin. Nilai kosong berarti elemen terkait disembunyikan (R02). */
export const PENGATURAN_PUBLIK = [
  'nama_singkat',
  'kepanjangan',
  'nama_instansi',
  'alamat',
  'pst_email',
  'pst_whatsapp',
  'pst_telepon',
  'jam_layanan',
  'sosmed_instagram',
  'sosmed_youtube',
  'sosmed_facebook',
  'sosmed_x',
  'situs_resmi',
  'mitra_json',
  'tim_json',
  'privasi_versi',
  'privasi_tanggal',
  'sumber_data_sekolah',
  'tanggal_data_sekolah',
  'sumber_batas_wilayah',
] as const;
export const PENGATURAN_INTERNAL = [
  'penandatangan_nama',
  'penandatangan_jabatan',
  'penandatangan_nip',
  'sertifikat_aktif',
] as const;
export const SEMUA_PENGATURAN = [...PENGATURAN_PUBLIK, ...PENGATURAN_INTERNAL] as const;
export type KunciPengaturan = (typeof SEMUA_PENGATURAN)[number];

const urlOpsional = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === '' || /^https:\/\/[^\s]+$/.test(v), 'Harus diawali https://');

const MitraSchema = z.array(
  z.object({
    nama: teksWajib(2, 120),
    url: urlOpsional.optional().default(''),
    logo: urlOpsional.optional().default(''),
  }),
);
const TimSchema = z.array(z.object({ nama: teksWajib(2, 120), peran: teksWajib(2, 120) }));

export const PengaturanUpdateSchema = z
  .object({
    nama_singkat: teksWajib(2, 30),
    kepanjangan: teksWajib(5, 160),
    nama_instansi: teksWajib(5, 160),
    alamat: z.string().trim().max(300),
    pst_email: z
      .string()
      .trim()
      .max(120)
      .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v), 'Email tidak valid'),
    pst_whatsapp: z
      .string()
      .trim()
      .max(20)
      .refine((v) => v === '' || /^62\d{8,13}$/.test(v), 'Format 628xxxxxxxxx'),
    pst_telepon: z.string().trim().max(30),
    jam_layanan: z.string().trim().max(160),
    sosmed_instagram: urlOpsional,
    sosmed_youtube: urlOpsional,
    sosmed_facebook: urlOpsional,
    sosmed_x: urlOpsional,
    situs_resmi: urlOpsional,
    mitra_json: z
      .string()
      .refine(
        (v) => MitraSchema.safeParse(JSON.parse(v || '[]')).success,
        'Daftar mitra tidak valid',
      ),
    tim_json: z
      .string()
      .refine((v) => TimSchema.safeParse(JSON.parse(v || '[]')).success, 'Daftar tim tidak valid'),
    privasi_versi: teksWajib(1, 20),
    privasi_tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sumber_data_sekolah: teksWajib(3, 200),
    tanggal_data_sekolah: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sumber_batas_wilayah: teksWajib(3, 300),
    penandatangan_nama: z.string().trim().max(120),
    penandatangan_jabatan: z.string().trim().max(160),
    penandatangan_nip: z
      .string()
      .trim()
      .max(18)
      .refine((v) => v === '' || validasiNip(v).valid, 'NIP penandatangan tidak valid'),
    sertifikat_aktif: z.enum(['0', '1']),
  })
  .partial()
  .refine((v) => v.sertifikat_aktif !== '1' || (v.penandatangan_nama && v.penandatangan_jabatan), {
    message:
      'Penerbitan sertifikat hanya dapat diaktifkan bila nama dan jabatan penandatangan sudah diisi',
    path: ['sertifikat_aktif'],
  });
export type PengaturanUpdate = z.infer<typeof PengaturanUpdateSchema>;

/* ---------- LMS admin ---------- */

const VideoSchema = z.object({
  judul: teksWajib(3, 200),
  url: z
    .string()
    .trim()
    .regex(
      /^https:\/\/(www\.)?(youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)[A-Za-z0-9_-]{6,20}/,
      'Gunakan URL embed YouTube',
    ),
  durasi: z.string().trim().max(10).optional().default(''),
});
const SumberBelajarSchema = z.object({
  judul: teksWajib(3, 200),
  format: teksWajib(2, 10),
  url: z
    .string()
    .trim()
    .regex(/^https:\/\//, 'Harus diawali https://'),
  penerbit: z.string().trim().max(120).optional().default(''),
});
const KompetensiSchema = z.object({ judul: teksWajib(3, 160), uraian: teksWajib(3, 1000) });

export const ModulInputSchema = z.object({
  kursus_id: z.string().min(1).max(60),
  nomor: z.number().int().min(1).max(99),
  kode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{3,30}$/),
  judul: teksWajib(5, 200),
  subjudul: z.string().trim().max(300).default(''),
  deskripsi: teksWajib(10, 2000),
  kategori: z.string().trim().max(80).default(''),
  estimasi: z.string().trim().max(40).default(''),
  nilai_lulus: z.number().int().min(0).max(100),
  ringkasan: z.string().trim().max(4000).default(''),
  video: z.array(VideoSchema).max(10),
  kompetensi: z.array(KompetensiSchema).max(12),
  sumber: z.array(SumberBelajarSchema).max(12),
  is_published: z.boolean(),
  version: z.number().int().min(0),
});
export type ModulInput = z.infer<typeof ModulInputSchema>;

export const KursusInputSchema = z.object({
  kode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{3,30}$/),
  judul: teksWajib(5, 200),
  subjudul: z.string().trim().max(300).default(''),
  deskripsi: teksWajib(10, 2000),
  kategori: z.string().trim().max(80).default(''),
  estimasi: z.string().trim().max(60).default(''),
  nilai_lulus_akhir: z.number().int().min(0).max(100),
  durasi_akhir_menit: z.number().int().min(5).max(240),
  jumlah_soal_akhir: z.number().int().min(5).max(200),
  /** Metadata katalog (ADR-0007). Bila dihilangkan, nilai yang tersimpan tidak diubah. */
  level: z.enum(LEVEL_KURSUS).optional(),
  sasaran: z.array(z.enum(KATEGORI_PESERTA)).max(4).optional(),
  hasil_belajar: z.array(teksWajib(3, 300)).max(12).optional(),
  durasi_menit: z.number().int().min(0).max(100_000).optional(),
  /** Hanya jalur gambar di situs sendiri: CSP img-src tidak mengizinkan domain luar. */
  gambar_url: z
    .string()
    .trim()
    .regex(
      /^\/[A-Za-z0-9/_.-]{1,200}\.(svg|png|jpg|jpeg|webp)$/,
      'Gunakan jalur gambar di situs ini, mis. /belajar/kursus.svg',
    )
    .optional(),
  is_published: z.boolean(),
  version: z.number().int().min(0),
});
export type KursusInput = z.infer<typeof KursusInputSchema>;

export const CabutSertifikatSchema = z.object({ alasan: teksWajib(10, 500) });

/** Kode kecamatan opsional di query string. */
export const KodeKecQuery = z.string().refine(isKodeKecamatan).optional();
