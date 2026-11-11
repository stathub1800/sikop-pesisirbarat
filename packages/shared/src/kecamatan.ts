/**
 * Master 11 kecamatan Kabupaten Pesisir Barat.
 *
 * Mengapa di kode dan bukan hanya di basis data: kode wilayah adalah kode referensi
 * yang dipakai bersama oleh pipeline data, API, dan frontend. Menyimpannya di satu
 * modul mencegah ejaan berbeda-beda (temuan R01: "Bengkunat" vs "Bangkunat").
 * Sumber kode BPS: Master File Desa BPS. Kode Kemendagri dipakai untuk mencocokkan
 * berkas batas wilayah turunan BIG.
 */
export interface Kecamatan {
  readonly kode: string;
  readonly kodeKemendagri: string;
  readonly nama: string;
  readonly urutan: number;
}

export const KODE_KABUPATEN = '1813';
export const NAMA_KABUPATEN = 'Kabupaten Pesisir Barat';

export const KECAMATAN: readonly Kecamatan[] = [
  { kode: '1813010', kodeKemendagri: '18.13.03', nama: 'Lemong', urutan: 1 },
  { kode: '1813020', kodeKemendagri: '18.13.04', nama: 'Pesisir Utara', urutan: 2 },
  { kode: '1813030', kodeKemendagri: '18.13.06', nama: 'Pulau Pisang', urutan: 3 },
  { kode: '1813040', kodeKemendagri: '18.13.05', nama: 'Karya Penggawa', urutan: 4 },
  { kode: '1813050', kodeKemendagri: '18.13.07', nama: 'Way Krui', urutan: 5 },
  { kode: '1813060', kodeKemendagri: '18.13.01', nama: 'Pesisir Tengah', urutan: 6 },
  { kode: '1813070', kodeKemendagri: '18.13.08', nama: 'Krui Selatan', urutan: 7 },
  { kode: '1813080', kodeKemendagri: '18.13.02', nama: 'Pesisir Selatan', urutan: 8 },
  { kode: '1813090', kodeKemendagri: '18.13.09', nama: 'Ngambur', urutan: 9 },
  { kode: '1813100', kodeKemendagri: '18.13.10', nama: 'Ngaras', urutan: 10 },
  { kode: '1813110', kodeKemendagri: '18.13.11', nama: 'Bangkunat', urutan: 11 },
] as const;

const BY_KODE = new Map(KECAMATAN.map((k) => [k.kode, k]));
const BY_KEMENDAGRI = new Map(KECAMATAN.map((k) => [k.kodeKemendagri, k]));

/**
 * Ejaan lain yang dijumpai di data sumber, dipetakan ke nama baku.
 * "Bengkunat" sengaja TIDAK dipetakan: nama itu ambigu antara Bangkunat dan Ngaras
 * (temuan T01), sehingga baris dengan nama tersebut harus ditinjau manusia.
 */
const ALIAS: Readonly<Record<string, string>> = {
  KARYAPENGGAWA: 'Karya Penggawa',
};

const normalizeKey = (s: string): string =>
  s
    .toUpperCase()
    .replace(/^KEC(AMATAN)?\.?\s+/, '')
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const BY_NAMA = new Map<string, Kecamatan>();
for (const k of KECAMATAN) BY_NAMA.set(normalizeKey(k.nama), k);
for (const [alias, nama] of Object.entries(ALIAS)) {
  const k = KECAMATAN.find((x) => x.nama === nama);
  if (k) BY_NAMA.set(alias, k);
}

export const isKodeKecamatan = (kode: string): boolean => BY_KODE.has(kode);
export const kecamatanByKode = (kode: string): Kecamatan | undefined => BY_KODE.get(kode);
export const kecamatanByKemendagri = (kode: string): Kecamatan | undefined =>
  BY_KEMENDAGRI.get(kode);

/**
 * Mencocokkan nama kecamatan dari data sumber (mis. "KEC. KARYAPENGGAWA", "Kec. Lemong").
 * @returns kecamatan baku, atau undefined bila tidak dikenali.
 */
export function kecamatanByNama(raw: string): Kecamatan | undefined {
  return BY_NAMA.get(normalizeKey(raw));
}

/** Kotak batas kabupaten (dengan penyangga kecil) untuk pemeriksaan koordinat kasar. */
export const BBOX_KABUPATEN = {
  minLat: -5.95,
  maxLat: -4.75,
  minLon: 103.55,
  maxLon: 104.72,
} as const;

export const isInBbox = (lat: number, lon: number): boolean =>
  lat >= BBOX_KABUPATEN.minLat &&
  lat <= BBOX_KABUPATEN.maxLat &&
  lon >= BBOX_KABUPATEN.minLon &&
  lon <= BBOX_KABUPATEN.maxLon;
