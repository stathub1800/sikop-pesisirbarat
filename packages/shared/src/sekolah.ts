/**
 * Domain data sekolah: normalisasi baris sumber, validasi, pemeriksaan koordinat, dan skema edit.
 * Dipakai oleh pipeline (impor awal), API (impor dan edit admin), dan frontend (form admin).
 */
import { z } from 'zod';
import { isInBbox, isKodeKecamatan, kecamatanByNama } from './kecamatan.ts';

export const JENJANG = ['PAUD', 'SD/MI', 'SMP/MTs', 'SMA/SMK/MA', 'SLB', 'Nonformal'] as const;
export type Jenjang = (typeof JENJANG)[number];

/**
 * Jumlah peserta didik, guru, dan rombongan belajar per sekolah belum lengkap di sumber
 * (contoh: madrasah tercatat 0 karena datanya ada di EMIS Kemenag, bukan Dapodik).
 * Selama false, angka tersebut dan indikator turunannya tidak ditayangkan di situs, API publik,
 * maupun CSV unduhan. Admin tetap dapat melihat dan memperbaikinya. Ubah ke true setelah data lengkap.
 */
export const TAYANG_PD_GURU = false;
/** Indikator turunan yang bergantung pada peserta didik, guru, atau rombel. */
export const INDIKATOR_PD_GURU: readonly string[] = [
  'jumlah_peserta_didik',
  'jumlah_guru',
  'rasio_murid_guru',
  'rasio_murid_rombel',
];

const BENTUK_KE_JENJANG: Readonly<Record<string, Jenjang>> = {
  TK: 'PAUD',
  KB: 'PAUD',
  RA: 'PAUD',
  SPS: 'PAUD',
  TPA: 'PAUD',
  SD: 'SD/MI',
  MI: 'SD/MI',
  SMP: 'SMP/MTs',
  MTS: 'SMP/MTs',
  SMA: 'SMA/SMK/MA',
  SMK: 'SMA/SMK/MA',
  MA: 'SMA/SMK/MA',
  SLB: 'SLB',
  PKBM: 'Nonformal',
  SKB: 'Nonformal',
  KURSUS: 'Nonformal',
  'PONDOK PESANTREN': 'Nonformal',
};

/** Mengelompokkan bentuk pendidikan ke jenjang tampilan. Bentuk tak dikenal masuk Nonformal. */
export const jenjangDari = (bentuk: string): Jenjang =>
  BENTUK_KE_JENJANG[bentuk.trim().toUpperCase()] ?? 'Nonformal';

export const KOORDINAT_STATUS = [
  'valid',
  'diperbaiki',
  'beda_kecamatan',
  'di_luar_batas',
  'tidak_ada',
] as const;
export type KoordinatStatus = (typeof KOORDINAT_STATUS)[number];

/** Status yang titiknya layak ditampilkan di peta publik. */
export const KOORDINAT_TAMPIL: readonly KoordinatStatus[] = [
  'valid',
  'diperbaiki',
  'beda_kecamatan',
];

export const KOORDINAT_LABEL: Readonly<Record<KoordinatStatus, string>> = {
  valid: 'Valid',
  diperbaiki: 'Dikoreksi otomatis, perlu verifikasi',
  beda_kecamatan: 'Titik berada di kecamatan lain',
  di_luar_batas: 'Di luar wilayah kabupaten',
  tidak_ada: 'Belum ada koordinat',
};

export interface Sekolah {
  npsn: string;
  sekolah_id: string | null;
  nama: string;
  bentuk: string;
  jenjang: Jenjang;
  status: 'Negeri' | 'Swasta';
  akreditasi: string | null;
  alamat: string | null;
  dusun: string | null;
  rt: string | null;
  rw: string | null;
  kode_pos: string | null;
  kode_kec: string;
  telepon: string | null;
  email: string | null;
  website: string | null;
  yayasan: string | null;
  lat: number | null;
  lon: number | null;
  koordinat_status: KoordinatStatus;
  koordinat_catatan: string | null;
  waktu_penyelenggaraan: string | null;
  kurikulum: string | null;
  sumber_listrik: string | null;
  daya_listrik: number | null;
  akses_internet: string | null;
  luas_tanah: number | null;
  pd: number;
  pd_l: number;
  pd_p: number;
  rombel: number;
  guru: number;
  guru_l: number;
  guru_p: number;
  rk_baik: number;
  rk_rusak_ringan: number;
  rk_rusak_sedang: number;
  rk_rusak_berat: number;
}

export interface Temuan {
  npsn: string;
  baris: number;
  tingkat: 'galat' | 'peringatan';
  kolom: string;
  pesan: string;
}

export interface KoordinatHasil {
  lat: number | null;
  lon: number | null;
  status: KoordinatStatus;
  catatan: string | null;
}

/**
 * Memeriksa dan, bila polanya jelas, mengoreksi koordinat.
 * Koreksi hanya untuk dua pola yang pasti: bujur bergeser -360 dan tanda lintang terbalik.
 * Koreksi selalu ditandai "diperbaiki" agar diverifikasi petugas, tidak pernah dianggap valid.
 */
export function periksaKoordinat(latRaw: string | number, lonRaw: string | number): KoordinatHasil {
  const lat =
    typeof latRaw === 'number' ? latRaw : Number.parseFloat(String(latRaw).replace(',', '.'));
  const lon =
    typeof lonRaw === 'number' ? lonRaw : Number.parseFloat(String(lonRaw).replace(',', '.'));
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    (Math.abs(lat) < 0.01 && Math.abs(lon) < 0.01)
  ) {
    return { lat: null, lon: null, status: 'tidak_ada', catatan: null };
  }
  if (isInBbox(lat, lon)) return { lat, lon, status: 'valid', catatan: null };
  if (lon < -180 && isInBbox(lat, lon + 360)) {
    return {
      lat,
      lon: round6(lon + 360),
      status: 'diperbaiki',
      catatan: `Bujur asli ${lon} dikoreksi +360.`,
    };
  }
  if (lat > 0 && isInBbox(-lat, lon)) {
    return {
      lat: -lat,
      lon,
      status: 'diperbaiki',
      catatan: `Lintang asli ${lat} dibalik tandanya.`,
    };
  }
  return {
    lat: null,
    lon: null,
    status: 'di_luar_batas',
    catatan: `Koordinat asli (${lat}, ${lon}) di luar wilayah kabupaten.`,
  };
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

const kosongKeNull = (s: string | undefined): string | null => {
  const t = (s ?? '').trim();
  return t === '' || t === '-' ? null : t;
};

function toInt(s: string | undefined): number | null {
  const t = (s ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const RE_URL = /^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/[^\s]*)?$/i;
const RE_TELP = /^\+?[0-9 ()-]{6,20}$/;

/** Email/URL/telepon tidak valid dibuang (null) dan dicatat sebagai peringatan, bukan galat. */
function bersihkanKontak(
  row: Record<string, string>,
  push: (kolom: string, pesan: string) => void,
): Pick<Sekolah, 'email' | 'website' | 'telepon'> {
  const email = kosongKeNull(row.email);
  const web = kosongKeNull(row.website);
  const telp = kosongKeNull(row.telepon);
  const out = {
    email: null as string | null,
    website: null as string | null,
    telepon: null as string | null,
  };
  if (email) {
    if (RE_EMAIL.test(email)) out.email = email.toLowerCase();
    else push('email', `Email tidak valid: "${email}"`);
  }
  if (web && web !== 'http://' && web !== 'https://') {
    if (RE_URL.test(web) && !web.includes('@')) out.website = web;
    else push('website', `Alamat situs tidak valid: "${web}"`);
  }
  if (telp) {
    if (RE_TELP.test(telp)) out.telepon = telp;
    else push('telepon', `Nomor telepon tidak valid: "${telp}"`);
  }
  return out;
}

const KOLOM_ANGKA = [
  ['pd', 'jml_peserta_didik'],
  ['pd_l', 'jml_pd_laki'],
  ['pd_p', 'jml_pd_perempuan'],
  ['rombel', 'jml_rombel'],
  ['guru', 'jml_guru_total'],
  ['guru_l', 'jml_guru_laki'],
  ['guru_p', 'jml_guru_perempuan'],
  ['rk_baik', 'ruang_kelas_baik'],
  ['rk_rusak_ringan', 'ruang_kelas_rusak_ringan'],
  ['rk_rusak_sedang', 'ruang_kelas_rusak_sedang'],
  ['rk_rusak_berat', 'ruang_kelas_rusak_berat'],
] as const;

/**
 * Mengubah satu baris CSV sumber (format ekspor Dapodik) menjadi rekaman Sekolah.
 * @returns rekaman (null bila ada galat) beserta daftar temuan untuk laporan mutu data.
 */
export function normalisasiBarisSekolah(
  row: Record<string, string>,
  baris: number,
): { data: Sekolah | null; temuan: Temuan[] } {
  const npsn = (row.npsn ?? '').trim().toUpperCase();
  const temuan: Temuan[] = [];
  const galat = (kolom: string, pesan: string): void => {
    temuan.push({ npsn, baris, tingkat: 'galat', kolom, pesan });
  };
  const peringatan = (kolom: string, pesan: string): void => {
    temuan.push({ npsn, baris, tingkat: 'peringatan', kolom, pesan });
  };

  if (!/^[0-9A-Z]{8}$/.test(npsn)) galat('npsn', `NPSN harus 8 karakter, ditemukan "${npsn}"`);
  const nama = (row.nama_sekolah ?? '').trim().replace(/\s+/g, ' ');
  if (!nama) galat('nama_sekolah', 'Nama sekolah kosong');
  const kec = kecamatanByNama(row.kecamatan ?? '');
  if (!kec) galat('kecamatan', `Kecamatan tidak dikenali: "${row.kecamatan}"`);
  const kab = (row.kabupaten ?? '').toUpperCase();
  if (kab && !kab.includes('PESISIR BARAT'))
    galat('kabupaten', `Bukan Pesisir Barat: "${row.kabupaten}"`);
  const statusRaw = (row.status_sekolah ?? '').trim().toUpperCase();
  if (statusRaw !== 'NEGERI' && statusRaw !== 'SWASTA')
    galat('status_sekolah', `Status tidak dikenali: "${row.status_sekolah}"`);

  const angka: Record<string, number> = {};
  for (const [kunci, kolom] of KOLOM_ANGKA) {
    const n = toInt(row[kolom]);
    if (n === null || n < 0) {
      if ((row[kolom] ?? '').trim() === '') angka[kunci] = 0;
      else galat(kolom, `Harus bilangan bulat ≥ 0, ditemukan "${row[kolom]}"`);
    } else angka[kunci] = n;
  }
  if ((angka.pd_l ?? 0) + (angka.pd_p ?? 0) !== angka.pd)
    galat('jml_peserta_didik', 'Jumlah peserta didik ≠ laki-laki + perempuan');
  if ((angka.guru_l ?? 0) + (angka.guru_p ?? 0) !== angka.guru)
    galat('jml_guru_total', 'Jumlah guru ≠ laki-laki + perempuan');

  const koordinat = periksaKoordinat(row.latitude ?? '', row.longitude ?? '');
  if (koordinat.status === 'tidak_ada') peringatan('latitude', 'Koordinat kosong');
  else if (koordinat.status !== 'valid')
    peringatan('latitude', koordinat.catatan ?? koordinat.status);

  const kontak = bersihkanKontak(row, peringatan);
  if (temuan.some((t) => t.tingkat === 'galat') || !kec) return { data: null, temuan };

  const akreditasi = kosongKeNull(row.akreditasi);
  const data: Sekolah = {
    npsn,
    sekolah_id: kosongKeNull(row.sekolah_id),
    nama,
    bentuk: (row.bentuk_pendidikan ?? '').trim(),
    jenjang: jenjangDari(row.bentuk_pendidikan ?? ''),
    status: statusRaw === 'NEGERI' ? 'Negeri' : 'Swasta',
    akreditasi,
    alamat: kosongKeNull(row.alamat_jalan),
    dusun: kosongKeNull(row.nama_dusun),
    rt: row.rt && row.rt !== '0' ? row.rt.trim() : null,
    rw: row.rw && row.rw !== '0' ? row.rw.trim() : null,
    kode_pos: /^\d{5}$/.test((row.kode_pos ?? '').trim()) ? (row.kode_pos ?? '').trim() : null,
    kode_kec: kec.kode,
    ...kontak,
    yayasan: kosongKeNull(row.yayasan),
    lat: koordinat.lat,
    lon: koordinat.lon,
    koordinat_status: koordinat.status,
    koordinat_catatan: koordinat.catatan,
    waktu_penyelenggaraan: kosongKeNull(row.waktu_penyelenggaraan),
    kurikulum: kosongKeNull(row.kurikulum),
    sumber_listrik: kosongKeNull(row.sumber_listrik),
    daya_listrik: toInt(row.daya_listrik),
    akses_internet: kosongKeNull(row.akses_internet),
    luas_tanah: toInt(row.luas_tanah_milik),
    pd: angka.pd ?? 0,
    pd_l: angka.pd_l ?? 0,
    pd_p: angka.pd_p ?? 0,
    rombel: angka.rombel ?? 0,
    guru: angka.guru ?? 0,
    guru_l: angka.guru_l ?? 0,
    guru_p: angka.guru_p ?? 0,
    rk_baik: angka.rk_baik ?? 0,
    rk_rusak_ringan: angka.rk_rusak_ringan ?? 0,
    rk_rusak_sedang: angka.rk_rusak_sedang ?? 0,
    rk_rusak_berat: angka.rk_rusak_berat ?? 0,
  };
  return { data, temuan };
}

export const jumlahRuangKelas = (
  s: Pick<Sekolah, 'rk_baik' | 'rk_rusak_ringan' | 'rk_rusak_sedang' | 'rk_rusak_berat'>,
): number => s.rk_baik + s.rk_rusak_ringan + s.rk_rusak_sedang + s.rk_rusak_berat;

const teks = (max: number) => z.string().trim().max(max);
const teksOpsional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v));
const bulat = z.number().int().min(0).max(1_000_000);

/** Skema edit sekolah oleh admin. Koordinat divalidasi ulang di server terhadap batas kabupaten. */
export const SekolahEditSchema = z
  .object({
    nama: teks(200).min(3),
    bentuk: teks(40).min(1),
    status: z.enum(['Negeri', 'Swasta']),
    akreditasi: teksOpsional(30),
    alamat: teksOpsional(300),
    dusun: teksOpsional(100),
    kode_pos: z
      .string()
      .regex(/^\d{5}$/, 'Kode pos 5 digit')
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    kode_kec: z.string().refine(isKodeKecamatan, 'Kode kecamatan tidak dikenal'),
    telepon: z
      .string()
      .regex(RE_TELP, 'Nomor telepon tidak valid')
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    email: z
      .string()
      .regex(RE_EMAIL, 'Email tidak valid')
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    website: z
      .string()
      .regex(RE_URL, 'Alamat situs tidak valid')
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    lat: z.number().min(-90).max(90).nullable(),
    lon: z.number().min(-180).max(180).nullable(),
    pd_l: bulat,
    pd_p: bulat,
    rombel: bulat,
    guru_l: bulat,
    guru_p: bulat,
    rk_baik: bulat,
    rk_rusak_ringan: bulat,
    rk_rusak_sedang: bulat,
    rk_rusak_berat: bulat,
    is_published: z.boolean(),
    version: z.number().int().min(1),
  })
  .refine((v) => (v.lat === null) === (v.lon === null), {
    message: 'Lintang dan bujur harus diisi bersamaan',
    path: ['lat'],
  })
  .refine((v) => v.lat === null || v.lon === null || isInBbox(v.lat, v.lon), {
    message: 'Koordinat berada di luar wilayah Kabupaten Pesisir Barat',
    path: ['lat'],
  });
export type SekolahEdit = z.infer<typeof SekolahEditSchema>;
