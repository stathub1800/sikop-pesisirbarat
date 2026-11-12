import { describe, expect, it } from 'vitest';
import {
  cocokSaringan,
  sesuaiKategori,
  urutkanUntukPeserta,
  type Kursus,
} from './belajar-ruang.ts';

const k = {
  judul: 'Membaca Data BPS',
  kategori: 'Literasi Data',
  level: 'dasar',
  sasaran: ['pelajar'],
} as Kursus;
const kosong = { sasaran: '', level: '', tema: '', q: '' };

describe('cocokSaringan', () => {
  it('tanpa saringan semua cocok', () => expect(cocokSaringan(k, kosong)).toBe(true));
  it('sasaran, level, tema, dan judul', () => {
    expect(cocokSaringan(k, { ...kosong, sasaran: 'pelajar' })).toBe(true);
    expect(cocokSaringan(k, { ...kosong, sasaran: 'asn' })).toBe(false);
    expect(cocokSaringan(k, { ...kosong, level: 'lanjut' })).toBe(false);
    expect(cocokSaringan(k, { ...kosong, tema: 'Literasi Data' })).toBe(true);
    expect(cocokSaringan(k, { ...kosong, q: ' data bps ' })).toBe(true);
    expect(cocokSaringan(k, { ...kosong, q: 'lain' })).toBe(false);
  });
  it('sasaran kosong berarti untuk semua kategori', () =>
    expect(cocokSaringan({ ...k, sasaran: [] }, { ...kosong, sasaran: 'mitra' })).toBe(true));
});

describe('rekomendasi menurut kategori peserta', () => {
  const umum = { ...k, judul: 'Untuk semua', sasaran: [] } as Kursus;
  const asn = { ...k, judul: 'Khusus ASN', sasaran: ['asn'] } as Kursus;
  it('hanya kursus yang menyasar kategori itu yang ditandai sesuai', () => {
    expect(sesuaiKategori(k, 'pelajar')).toBe(true);
    expect(sesuaiKategori(umum, 'pelajar')).toBe(false);
    expect(sesuaiKategori(k, undefined)).toBe(false);
  });
  it('kursus yang sesuai didahulukan, urutan lain tetap', () => {
    expect(urutkanUntukPeserta([umum, asn, k], 'pelajar').map((x) => x.judul)).toEqual([
      'Membaca Data BPS',
      'Untuk semua',
      'Khusus ASN',
    ]);
    expect(urutkanUntukPeserta([umum, asn, k], undefined).map((x) => x.judul)).toEqual([
      'Untuk semua',
      'Khusus ASN',
      'Membaca Data BPS',
    ]);
  });
});
