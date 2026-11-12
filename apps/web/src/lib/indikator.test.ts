import { describe, expect, it } from 'vitest';
import {
  banding,
  jumlahSeri,
  perluPerhatian,
  ringkasanKecamatan,
  teksPeringkat,
  type Indikator,
} from './indikator.ts';

const kec = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((k) => ({ kode: k, nama: `Kec ${k}` }));
const buat = (id: string, nilai: number[], kab: number, x: Partial<Indikator> = {}): Indikator => ({
  id,
  nama: id,
  satuan: '%',
  kategori: 'Uji',
  sumber: 'Uji',
  tahun: '2026',
  metode: 'Uji',
  desimal: 1,
  arah: 'naik_baik',
  jenis: 'manual',
  nilai: Object.fromEntries(kec.map((k, n) => [k.kode, nilai[n] ?? null])),
  kabupaten: kab,
  diperbarui: null,
  ...x,
});

describe('Pembanding dan peringkat', () => {
  it('indikator jumlah dibandingkan dengan rata-rata kecamatan, bukan total kabupaten', () => {
    const i = buat('jumlah_sekolah', [38, 20, 10, 5, 5, 5, 5], 88, {
      satuan: 'unit',
      desimal: 0,
      arah: 'netral',
      agregasi: 'jumlah',
    });
    expect(banding(i, 38, 7)?.teks).toBe('Di atas rata-rata kecamatan');
    expect(banding(i, 5, 7)?.teks).toBe('Di bawah rata-rata kecamatan');
  });

  it('persentase tetap dibandingkan dengan kabupaten', () => {
    const i = buat('p', [90, 80, 70, 60, 50, 40, 30], 60);
    expect(banding(i, 90, 7)).toEqual({ teks: 'Di atas kabupaten', kelas: 'baik' });
  });

  it('nilai sama berbagi peringkat dan disebutkan', () => {
    const i = buat('bencana', [0, 0, 0, 10, 20, 30, 40], 10, { arah: 'turun_baik' });
    expect(jumlahSeri(i, kec, 'A')).toBe(3);
    expect(teksPeringkat(i, kec, 'A')).toBe('Peringkat 1 dari 7 (sama dengan 2 kecamatan lain)');
    expect(teksPeringkat(i, kec, 'G')).toBe('Peringkat 7 dari 7');
  });
});

describe('Ringkasan pimpinan', () => {
  it('keunggulan dari tiga teratas di atas kabupaten; tantangan dari tiga terbawah', () => {
    const baik = buat('baik', [95, 50, 40, 30, 20, 10, 5], 40);
    const buruk = buat('buruk', [1, 50, 40, 30, 20, 10, 60], 30);
    const netral = buat('netral', [1, 2, 3, 4, 5, 6, 7], 4, { arah: 'netral' });
    const r = ringkasanKecamatan([baik, buruk, netral], kec, 'A');
    expect(r.keunggulan.map((b) => b.indikator.id)).toEqual(['baik']);
    expect(r.tantangan.map((b) => b.indikator.id)).toEqual(['buruk']);
  });

  it('contoh kecamatan perlu perhatian tidak menonjolkan nilai yang lebih baik dari kabupaten', () => {
    const kecil = buat('kecil', [0.6, 0.1, 0, 0, 0, 0, 0], 0.7, { arah: 'turun_baik' });
    const besar = buat('besar', [10, 50, 60, 70, 80, 90, 95], 60);
    const [a] = perluPerhatian([kecil, besar], kec, 1);
    expect(a?.kode).toBe('A');
    expect(a?.contoh.map((i) => i.id)).toEqual(['besar']);
  });
});
