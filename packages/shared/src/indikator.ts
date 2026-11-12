/**
 * Indikator kewilayahan.
 *
 * Prinsip (perbaikan T03/T04):
 * 1. Satu sumber: setiap angka dihitung dari tabel di basis data, tidak ada angka yang ditulis tetap.
 * 2. Agregat kabupaten dihitung dari pembilang dan penyebut total, BUKAN rata-rata nilai kecamatan,
 *    sehingga tidak bergantung pada jumlah poligon.
 * 3. Setiap indikator wajib punya sumber, tahun, dan cara hitung sebelum boleh tayang.
 */
import type { Sekolah } from './sekolah.ts';
import { jumlahRuangKelas } from './sekolah.ts';

export type ArahIndikator = 'naik_baik' | 'turun_baik' | 'netral';
export type AgregasiIndikator = 'jumlah' | 'rasio' | 'tidak_ada';

export interface IndikatorMeta {
  id: string;
  nama: string;
  satuan: string;
  kategori: string;
  metode: string;
  desimal: number;
  arah: ArahIndikator;
  agregasi: AgregasiIndikator;
}

/** Pasangan pembilang/penyebut per kecamatan; nilai = pembilang / penyebut × pengali. */
interface Komponen {
  pembilang: number;
  penyebut: number;
}

interface IndikatorTurunan extends IndikatorMeta {
  pengali: number;
  komponen: (s: SekolahRingkas) => Komponen;
}

export type SekolahRingkas = Pick<
  Sekolah,
  | 'kode_kec'
  | 'pd'
  | 'guru'
  | 'rombel'
  | 'akreditasi'
  | 'akses_internet'
  | 'sumber_listrik'
  | 'rk_baik'
  | 'rk_rusak_ringan'
  | 'rk_rusak_sedang'
  | 'rk_rusak_berat'
>;

const INTERNET_ADA = new Set(['Fibre Optic', 'Wireless', 'Seluler', 'Vsat', 'ADSL', 'Satelit']);
const LISTRIK_ADA = new Set([
  'PLN',
  'Tenaga Surya',
  'Diesel',
  'Lainnya',
  'Menumpang',
  'PLN & Diesel',
]);

/**
 * Indikator yang diturunkan otomatis dari data sekolah.
 * Untuk persentase, sekolah yang isian sumbernya kosong dikeluarkan dari penyebut agar
 * data yang belum diisi tidak dianggap "tidak ada".
 */
export const INDIKATOR_SEKOLAH: readonly IndikatorTurunan[] = [
  {
    id: 'jumlah_sekolah',
    nama: 'Jumlah satuan pendidikan',
    satuan: 'unit',
    kategori: 'Pendidikan',
    metode: 'Banyaknya satuan pendidikan (formal dan nonformal) yang terdaftar di kecamatan.',
    desimal: 0,
    arah: 'netral',
    agregasi: 'jumlah',
    pengali: 1,
    komponen: () => ({ pembilang: 1, penyebut: 1 }),
  },
  {
    id: 'jumlah_peserta_didik',
    nama: 'Jumlah peserta didik',
    satuan: 'orang',
    kategori: 'Pendidikan',
    metode: 'Jumlah peserta didik pada seluruh satuan pendidikan di kecamatan.',
    desimal: 0,
    arah: 'netral',
    agregasi: 'jumlah',
    pengali: 1,
    komponen: (s) => ({ pembilang: s.pd, penyebut: 1 }),
  },
  {
    id: 'jumlah_guru',
    nama: 'Jumlah guru',
    satuan: 'orang',
    kategori: 'Pendidikan',
    metode: 'Jumlah guru pada seluruh satuan pendidikan di kecamatan.',
    desimal: 0,
    arah: 'netral',
    agregasi: 'jumlah',
    pengali: 1,
    komponen: (s) => ({ pembilang: s.guru, penyebut: 1 }),
  },
  {
    id: 'rasio_murid_guru',
    nama: 'Rasio peserta didik per guru',
    satuan: 'peserta didik per guru',
    kategori: 'Pendidikan',
    metode: 'Total peserta didik dibagi total guru di kecamatan. Makin kecil makin baik.',
    desimal: 1,
    arah: 'turun_baik',
    agregasi: 'rasio',
    pengali: 1,
    komponen: (s) => ({ pembilang: s.pd, penyebut: s.guru }),
  },
  {
    id: 'rasio_murid_rombel',
    nama: 'Rata-rata peserta didik per rombongan belajar',
    satuan: 'peserta didik per rombel',
    kategori: 'Pendidikan',
    metode: 'Total peserta didik dibagi total rombongan belajar di kecamatan.',
    desimal: 1,
    arah: 'netral',
    agregasi: 'rasio',
    pengali: 1,
    komponen: (s) => ({ pembilang: s.pd, penyebut: s.rombel }),
  },
  {
    id: 'persen_kelas_baik',
    nama: 'Ruang kelas dalam kondisi baik',
    satuan: '%',
    kategori: 'Pendidikan',
    metode:
      'Ruang kelas kondisi baik dibagi seluruh ruang kelas (baik + rusak ringan, sedang, berat) × 100.',
    desimal: 1,
    arah: 'naik_baik',
    agregasi: 'rasio',
    pengali: 100,
    komponen: (s) => ({ pembilang: s.rk_baik, penyebut: jumlahRuangKelas(s) }),
  },
  {
    id: 'persen_akses_internet',
    nama: 'Sekolah dengan akses internet',
    satuan: '%',
    kategori: 'Pendidikan',
    metode:
      'Sekolah yang melaporkan akses internet (fiber, nirkabel, seluler, VSAT) dibagi sekolah yang mengisi isian akses internet × 100.',
    desimal: 1,
    arah: 'naik_baik',
    agregasi: 'rasio',
    pengali: 100,
    komponen: (s) =>
      s.akses_internet
        ? { pembilang: INTERNET_ADA.has(s.akses_internet) ? 1 : 0, penyebut: 1 }
        : { pembilang: 0, penyebut: 0 },
  },
  {
    id: 'persen_listrik',
    nama: 'Sekolah dengan sumber listrik',
    satuan: '%',
    kategori: 'Pendidikan',
    metode:
      'Sekolah yang memiliki sumber listrik dibagi sekolah yang mengisi isian sumber listrik × 100.',
    desimal: 1,
    arah: 'naik_baik',
    agregasi: 'rasio',
    pengali: 100,
    komponen: (s) =>
      s.sumber_listrik
        ? { pembilang: LISTRIK_ADA.has(s.sumber_listrik) ? 1 : 0, penyebut: 1 }
        : { pembilang: 0, penyebut: 0 },
  },
  {
    id: 'persen_akreditasi_ab',
    nama: 'Sekolah terakreditasi A atau B',
    satuan: '%',
    kategori: 'Pendidikan',
    metode: 'Sekolah berakreditasi A atau B dibagi seluruh satuan pendidikan × 100.',
    desimal: 1,
    arah: 'naik_baik',
    agregasi: 'rasio',
    pengali: 100,
    komponen: (s) => ({
      pembilang: s.akreditasi === 'A' || s.akreditasi === 'B' ? 1 : 0,
      penyebut: 1,
    }),
  },
];

export interface NilaiIndikator {
  /** Nilai per kode kecamatan; null bila penyebut 0 (tidak dapat dihitung). */
  perKecamatan: Record<string, number | null>;
  kabupaten: number | null;
}

const bagi = (a: number, b: number, k: number): number | null => (b > 0 ? (a / b) * k : null);

/** Menghitung satu indikator turunan untuk seluruh kecamatan dan agregat kabupaten. */
export function hitungIndikator(
  ind: IndikatorTurunan,
  sekolah: readonly SekolahRingkas[],
  kodeKecamatan: readonly string[],
): NilaiIndikator {
  const acc = new Map<string, Komponen>(
    kodeKecamatan.map((k) => [k, { pembilang: 0, penyebut: 0 }]),
  );
  let totA = 0;
  let totB = 0;
  for (const s of sekolah) {
    const c = ind.komponen(s);
    const a = acc.get(s.kode_kec);
    if (a) {
      a.pembilang += c.pembilang;
      a.penyebut += c.penyebut;
    }
    totA += c.pembilang;
    totB += c.penyebut;
  }
  const perKecamatan: Record<string, number | null> = {};
  for (const [k, c] of acc) {
    perKecamatan[k] =
      ind.agregasi === 'jumlah' ? c.pembilang : bagi(c.pembilang, c.penyebut, ind.pengali);
  }
  return {
    perKecamatan,
    kabupaten: ind.agregasi === 'jumlah' ? totA : bagi(totA, totB, ind.pengali),
  };
}

/** Kelas warna peta: batas kuantil yang dibulatkan, agar legenda mudah dibaca. */
export function batasKelas(values: readonly (number | null)[], jumlahKelas = 5): number[] {
  const v = values
    .filter((x): x is number => x !== null && Number.isFinite(x))
    .sort((a, b) => a - b);
  if (v.length === 0) return [];
  const unik = [...new Set(v)];
  if (unik.length <= jumlahKelas) return unik.slice(1);
  const out: number[] = [];
  for (let i = 1; i < jumlahKelas; i++) {
    const idx = (i / jumlahKelas) * (v.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const q = (v[lo] as number) + ((v[hi] as number) - (v[lo] as number)) * (idx - lo);
    if (out.length === 0 || q > (out[out.length - 1] as number)) out.push(q);
  }
  return out;
}

/** Indeks kelas (0..n) untuk sebuah nilai berdasarkan batas dari batasKelas(). */
export const kelasDari = (value: number, batas: readonly number[]): number => {
  let i = 0;
  while (i < batas.length && value >= (batas[i] as number)) i++;
  return i;
};

/* ------------------------------ Tema lintas sumber ------------------------------ */

/**
 * Urutan tema di Peta Tematik. Kategori indikator = tema (bukan nama sumber), sehingga data dari
 * sumber berbeda (Dapodik, Podes, data tambahan kelak) berkumpul dalam satu tema yang sama.
 * Tema baru dari admin otomatis muncul di akhir, berurutan abjad.
 */
export const URUTAN_TEMA = [
  'Pendidikan',
  'Kesehatan',
  'Ekonomi',
  'Infrastruktur',
  'Kebencanaan',
  'Tata kelola dan sosial',
  'Wilayah',
] as const;

export function urutkanTema(tema: Iterable<string>): string[] {
  const posisi = (t: string): number => {
    const i = (URUTAN_TEMA as readonly string[]).indexOf(t);
    return i === -1 ? URUTAN_TEMA.length : i;
  };
  return [...new Set(tema)].sort((a, b) => posisi(a) - posisi(b) || a.localeCompare(b, 'id'));
}

/**
 * Label sumber ringkas untuk kartu: akronim satu kata dalam kurung bila ada ("Dapodik"),
 * selain itu bagian sebelum koma atau kurung ("Podes 2026").
 */
export function sumberSingkat(sumber: string): string {
  const akronim = /\(([A-Za-z]{3,12})\)/.exec(sumber)?.[1];
  if (akronim) return akronim;
  return (sumber.split(/\s*[,(]/)[0] ?? sumber).trim();
}
