/**
 * Tipe dan pembantu indikator yang dipakai bersama oleh Beranda dan Peta Tematik,
 * agar angka, satuan, ikon tema, dan pembanding kabupaten tampil sama di kedua halaman.
 */
import { formatAngka, sumberSingkat } from '@sikop/shared';
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
/** Nilai ringkas untuk label peta dan peringkat: "86%" atau "5,0". */
export const fmtRingkas = (i: Indikator, v: number | null | undefined): string =>
  v === null || v === undefined
    ? '–'
    : persen(i)
      ? `${formatAngka(v, v >= 99.95 || Number.isInteger(v) ? 0 : 1)}%`
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
  const unit = i.unitPenyebut ?? 'desa';
  return persen(i)
    ? `${formatAngka(r.pembilang)} dari ${formatAngka(r.penyebut)} ${unit}`
    : `median dari ${formatAngka(r.penyebut)} ${unit}`;
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
export function banding(i: Indikator, v: number | null): { teks: string; kelas: string } | null {
  if (v === null || i.kabupaten === null) return null;
  const selisih = v - i.kabupaten;
  if (Math.abs(selisih) < 10 ** -i.desimal / 2)
    return { teks: 'Setara kabupaten', kelas: 'netral' };
  const atas = selisih > 0;
  const baik = i.arah === 'netral' ? null : (i.arah === 'naik_baik') === atas;
  return {
    teks: `${atas ? 'Di atas' : 'Di bawah'} kabupaten`,
    kelas: baik === null ? 'netral' : baik ? 'baik' : 'buruk',
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
  const berarah = indikator.filter(
    (i) => i.arah !== 'netral' && Object.values(i.nilai).filter((v) => v !== null).length >= 6,
  );
  const hitung = new Map<string, Indikator[]>();
  for (const i of berarah) {
    const ada = urutKecamatan(i, kecamatan).filter((x) => x.v !== null);
    const n = ada.length;
    for (const x of ada) {
      const p = peringkat(i, kecamatan, x.kode);
      if (p !== null && p > n - 3) hitung.set(x.kode, [...(hitung.get(x.kode) ?? []), i]);
    }
  }
  return kecamatan
    .map((k) => ({
      ...k,
      jumlah: hitung.get(k.kode)?.length ?? 0,
      dari: berarah.length,
      contoh: hitung.get(k.kode) ?? [],
    }))
    .sort((a, b) => b.jumlah - a.jumlah || a.nama.localeCompare(b.nama, 'id'))
    .slice(0, ambil);
}
