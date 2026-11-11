import { describe, expect, it } from 'vitest';
import { cocokSaringan, type Kursus } from './belajar-ruang.ts';

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
