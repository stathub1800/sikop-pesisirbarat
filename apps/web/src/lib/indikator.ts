/**
 * Tipe dan pembantu indikator yang dipakai bersama oleh Beranda dan Peta Tematik,
 * agar angka, satuan, ikon tema, dan pembanding kabupaten tampil sama di kedua halaman.
 */
import { formatAngka, narasiIndikator, sumberSingkat, unitPenyebutRingkas } from '@sikop/shared';
import { h } from './dom.ts';

export interface Rincian {
  pembilang: number | null;
  penyebut: number | null;
}
export interface Indikator {
  id: string;
  nama: string;
  satuan: string;
  kategori: string;
  sumber: string;
  tahun: string;
  metode: string;
  desimal: number;
  arah: 'naik_baik' | 'turun_baik' | 'netral';
  /** "jumlah" bila nilai kecamatan dapat dijumlahkan menjadi nilai kabupaten. */
  agregasi?: string;
  jenis: string;
  nilai: Record<string, number | null>;
  kabupaten: number | null;
  diperbarui: string | null;
  rincian?: Record<string, Rincian>;
  rincianKabupaten?: Rincian;
  unitPenyebut?: string;
}
export interface Kecamatan {
  kode: string;
  nama: string;
}

/** Tema "Wilayah" tampil sebagai fakta di kartu profil, bukan sebagai tab. */
export const TEMA_PROFIL = 'Wilayah';
export const LABEL_TAB: Record<string, string> = { 'Tata kelola dan sosial': 'Tata kelola' };
export const IKON_TEMA: Record<string, string> = {
  Pendidikan: 'M3 9.5 12 5l9 4.5-9 4.5-9-4.5Z M7 11.6V16c0 1.4 2.2 3 5 3s5-1.6 5-3v-4.4 M21 9.5V15',
  Kesehatan:
    'M12 20s-7-4.3-7-9.6A4 4 0 0 1 12 7.8a4 4 0 0 1 7 2.6C19 15.7 12 20 12 20Z M9 12h6 M12 9v6',
  Ekonomi: 'M4 10h16 M5.5 10 7 5h10l1.5 5 M6 10v9h12v-9 M10 19v-5h4v5',
  Infrastruktur: 'M12 21V11 M8.5 8a5 5 0 0 1 7 0 M5.5 5a9 9 0 0 1 13 0 M9 21h6',
  Kebencanaan: 'M12 4 3 20h18L12 4Z M12 10v4.5 M12 17.2v.01',
  'Tata kelola dan sosial':
    'M3 10h18 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 20h18 M12 4l8.5 4.5h-17L12 4Z',
  Wilayah:
    'M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11Z M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z',
};
export const IKON_BAWAAN = 'M5 20V10 M12 20V4 M19 20v-7';

export function ikon(tema: string, kelas = ''): SVGSVGElement {
  return h(
    'svg',
    { viewBox: '0 0 24 24', class: kelas, 'aria-hidden': 'true' },
    h('path', {
      d: IKON_TEMA[tema] ?? IKON_BAWAAN,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.8',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  ) as SVGSVGElement;
}

/* ------------------------------ Format angka ------------------------------ */

export const persen = (i: Indikator): boolean => i.satuan === '%';
/** Nilai lengkap dengan satuan: "86,0%", "5,0 km", "11,6 peserta didik per guru". */
export const fmt = (i: Indikator, v: number | null | undefined): string =>
  v === null || v === undefined
    ? 'Tidak ada data'
    : `${formatAngka(v, i.desimal)}${persen(i) ? '%' : ` ${i.satuan}`}`;
/**
 * Nilai ringkas untuk kartu, peringkat, dan tabel: "86,0%" atau "5,0". Persentase selalu satu desimal
 * agar angka dalam satu daftar sebanding (bukan "25%" di samping "61,5%").
 */
export const fmtRingkas = (i: Indikator, v: number | null | undefined): string =>
  v === null || v === undefined
    ? '–'
    : persen(i)
      ? `${formatAngka(v, 1)}%`
      : formatAngka(v, i.desimal);
/** Label di atas peta: bilangan bulat agar label kecamatan yang berdekatan tidak saling tumpuk. */
export const fmtPil = (i: Indikator, v: number | null | undefined): string =>
  v === null || v === undefined
    ? '–'
    : `${formatAngka(v, persen(i) || Math.abs(v) >= 10 ? 0 : Math.min(i.desimal, 1))}${persen(i) ? '%' : ''}`;
export const labelSumber = (i: Indikator): string => {
  const s = sumberSingkat(i.sumber);
  return s.includes(i.tahun) ? s : `${s} ${i.tahun}`.trim();
};
export function rinci(i: Indikator, r: Rincian | null | undefined): string {
  if (!r || r.penyebut === null) return '';
  const unit = unitPenyebutRingkas(i.id, i.unitPenyebut ?? 'desa');
  return persen(i)
    ? `${formatAngka(r.pembilang)} dari ${formatAngka(r.penyebut)} ${unit}`
    : `median dari ${formatAngka(r.penyebut)} ${unit}`;
}

/**
 * Kalimat penjelasan angka untuk satu wilayah, mis. "Di Kecamatan Ngambur, 9 dari 9 desa/kelurahan
 * (100%) memiliki sedikitnya satu SD atau MI ...". kode kosong = kabupaten.
 */
export function narasi(i: Indikator, wilayah: string, kode = ''): string | null {
  const r = kode ? i.rincian?.[kode] : i.rincianKabupaten;
  return narasiIndikator(i.id, {
    wilayah,
    nilai: kode ? (i.nilai[kode] ?? null) : i.kabupaten,
    satuan: i.satuan,
    desimal: i.desimal,
    pembilang: r?.pembilang ?? null,
    penyebut: r?.penyebut ?? null,
  });
}

/** Indikator berupa jumlah (unit, orang): angka kecamatan selalu bagian dari total kabupaten. */
export const jenisJumlah = (i: Indikator): boolean =>
  i.agregasi ? i.agregasi === 'jumlah' : i.satuan === 'unit' || i.satuan === 'orang';

/** Untuk indikator jumlah: rata-rata per kecamatan dan porsi kecamatan terhadap kabupaten. */
export function konteksJumlah(
  i: Indikator,
  v: number | null,
  jumlahKecamatan: number,
): { rataRata: number; porsi: number | null } | null {
  if (!jenisJumlah(i) || i.kabupaten === null || jumlahKecamatan < 1) return null;
  return {
    rataRata: i.kabupaten / jumlahKecamatan,
    porsi: v === null || i.kabupaten === 0 ? null : (100 * v) / i.kabupaten,
  };
}

/* ------------------------------ Peringkat ------------------------------ */

export type BarisPeringkat = Kecamatan & { v: number | null };

/** Kecamatan berurutan dari yang terbaik (mengikuti arah indikator), tanpa data di akhir. */
export function urutKecamatan(i: Indikator, kecamatan: Kecamatan[]): BarisPeringkat[] {
  const turun = i.arah === 'turun_baik';
  return kecamatan
    .map((k) => ({ ...k, v: i.nilai[k.kode] ?? null }))
    .sort((a, b) => {
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      return turun ? a.v - b.v : b.v - a.v;
    });
}
/** Peringkat 1 = terbaik; nilai sama berbagi peringkat (1, 1, 3, ...). */
export function peringkat(i: Indikator, kecamatan: Kecamatan[], kode: string): number | null {
  const v = i.nilai[kode];
  if (v === null || v === undefined) return null;
  const u = urutKecamatan(i, kecamatan).filter((x) => x.v !== null);
  return 1 + u.filter((x) => (i.arah === 'turun_baik' ? x.v! < v : x.v! > v)).length;
}
/** Banyaknya kecamatan (termasuk kecamatan ini) yang nilainya sama persis. */
export function jumlahSeri(i: Indikator, kecamatan: Kecamatan[], kode: string): number {
  const v = i.nilai[kode];
  if (v === null || v === undefined) return 0;
  return kecamatan.filter((k) => i.nilai[k.kode] === v).length;
}
/** Teks peringkat, mis. "Peringkat 1 dari 11 (sama dengan 4 kecamatan lain)". */
export function teksPeringkat(i: Indikator, kecamatan: Kecamatan[], kode: string): string | null {
  const p = peringkat(i, kecamatan, kode);
  if (p === null) return null;
  const seri = jumlahSeri(i, kecamatan, kode);
  const sama = seri > 1 ? `, sama dengan ${seri - 1} kecamatan lain` : '';
  return i.arah === 'netral'
    ? `Urutan ${p} dari ${kecamatan.length} menurut nilai tertinggi${sama}`
    : `Peringkat ${p} dari ${kecamatan.length} (1 = terbaik${sama})`;
}

/**
 * Pembanding angka kecamatan. Untuk persentase dan rasio dibandingkan dengan angka kabupaten.
 * Untuk indikator jumlah (unit, orang) dibandingkan dengan rata-rata per kecamatan, karena angka
 * kecamatan selalu lebih kecil dari total kabupaten.
 */
export function banding(
  i: Indikator,
  v: number | null,
  jumlahKecamatan = 11,
): { teks: string; kelas: string } | null {
  if (v === null || i.kabupaten === null) return null;
  const jumlah = konteksJumlah(i, v, jumlahKecamatan);
  const acuan = jumlah ? jumlah.rataRata : i.kabupaten;
  const nama = jumlah ? 'rata-rata kecamatan' : 'kabupaten';
  const selisih = v - acuan;
  if (Math.abs(selisih) < 10 ** -i.desimal / 2) return { teks: `Setara ${nama}`, kelas: 'netral' };
  const atas = selisih > 0;
  const baik = i.arah === 'netral' ? null : (i.arah === 'naik_baik') === atas;
  return {
    teks: `${atas ? 'Di atas' : 'Di bawah'} ${nama}`,
    kelas: baik === null ? 'netral' : baik ? 'baik' : 'buruk',
  };
}

/**
 * Selisih bertanda terhadap kabupaten: positif = lebih baik. Persentase dalam poin persen / 100,
 * selain itu relatif terhadap kabupaten, agar indikator dengan skala berbeda dapat dibandingkan.
 */
function keunggulanRelatif(i: Indikator, v: number): number | null {
  if (i.kabupaten === null || i.arah === 'netral') return null;
  const s = persen(i)
    ? (v - i.kabupaten) / 100
    : (v - i.kabupaten) / Math.max(1e-9, Math.abs(i.kabupaten));
  return i.arah === 'naik_baik' ? s : -s;
}

const indikatorBerarah = (indikator: Indikator[]): Indikator[] =>
  indikator.filter(
    (i) => i.arah !== 'netral' && Object.values(i.nilai).filter((v) => v !== null).length >= 6,
  );

export interface ButirRingkasan {
  indikator: Indikator;
  nilai: number;
  peringkat: number;
  seri: number;
}

/**
 * Ringkasan pimpinan untuk satu kecamatan: hingga tiga keunggulan (tiga teratas dan lebih baik dari
 * kabupaten) dan tiga tantangan (tiga terbawah dan lebih buruk dari kabupaten), diurutkan dari
 * selisih terbesar terhadap kabupaten. Penanda awal untuk ditelusuri, bukan penilaian kinerja.
 */
export function ringkasanKecamatan(
  indikator: Indikator[],
  kecamatan: Kecamatan[],
  kode: string,
  ambil = 3,
): { keunggulan: ButirRingkasan[]; tantangan: ButirRingkasan[] } {
  const keunggulan: (ButirRingkasan & { g: number })[] = [];
  const tantangan: (ButirRingkasan & { g: number })[] = [];
  for (const i of indikatorBerarah(indikator)) {
    const v = i.nilai[kode];
    if (v === null || v === undefined) continue;
    const p = peringkat(i, kecamatan, kode);
    const g = keunggulanRelatif(i, v);
    if (p === null || g === null) continue;
    const n = Object.values(i.nilai).filter((x) => x !== null).length;
    const seri = jumlahSeri(i, kecamatan, kode);
    const butir = { indikator: i, nilai: v, peringkat: p, seri, g };
    if (p <= 3 && g > 0) keunggulan.push(butir);
    else if (p > n - 3 && g < 0) tantangan.push(butir);
  }
  // Keunggulan yang dimiliki banyak kecamatan sekaligus (nilai sama) kurang khas, jadi diletakkan belakang.
  keunggulan.sort((a, b) => a.seri - b.seri || b.g - a.g);
  tantangan.sort((a, b) => a.g - b.g);
  const bersih = (b: ButirRingkasan): ButirRingkasan => ({
    indikator: b.indikator,
    nilai: b.nilai,
    peringkat: b.peringkat,
    seri: b.seri,
  });
  return {
    keunggulan: keunggulan.slice(0, ambil).map(bersih),
    tantangan: tantangan.slice(0, ambil).map(bersih),
  };
}

/**
 * Kecamatan yang paling sering berada di tiga terbawah pada indikator berarah
 * (naik_baik atau turun_baik). Dipakai Beranda sebagai penanda awal, bukan indeks komposit.
 */
export function perluPerhatian(
  indikator: Indikator[],
  kecamatan: Kecamatan[],
  ambil = 3,
): { kode: string; nama: string; jumlah: number; dari: number; contoh: Indikator[] }[] {
  const berarah = indikatorBerarah(indikator);
  const hitung = new Map<string, Indikator[]>();
  for (const i of berarah) {
    const ada = urutKecamatan(i, kecamatan).filter((x) => x.v !== null);
    const n = ada.length;
    for (const x of ada) {
      const p = peringkat(i, kecamatan, x.kode);
      if (p !== null && p > n - 3) hitung.set(x.kode, [...(hitung.get(x.kode) ?? []), i]);
    }
  }
  // Contoh diurutkan dari yang paling jauh di bawah kabupaten, agar selisih kecil tidak ditonjolkan.
  const parah = (i: Indikator, kode: string): number =>
    keunggulanRelatif(i, i.nilai[kode] ?? 0) ?? 0;
  return kecamatan
    .map((k) => ({
      ...k,
      jumlah: hitung.get(k.kode)?.length ?? 0,
      dari: berarah.length,
      contoh: [...(hitung.get(k.kode) ?? [])]
        .filter((i) => parah(i, k.kode) < 0)
        .sort((a, b) => parah(a, k.kode) - parah(b, k.kode)),
    }))
    .sort((a, b) => b.jumlah - a.jumlah || a.nama.localeCompare(b.nama, 'id'))
    .slice(0, ambil);
}
