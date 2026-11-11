import { describe, expect, it } from 'vitest';
import {
  agregatPodes,
  INDIKATOR_PODES,
  indikatorPodesById,
  jarakSah,
  median,
  type BarisDesa,
} from '../src/index.ts';

const desa = (id: string, isi: Record<string, unknown>): BarisDesa => ({ IDDESA: id, ...isi });
const ambil = (rows: ReturnType<typeof agregatPodes>, ind: string, kode: string) =>
  rows.find((r) => r.indikator_id === ind && r.kode_wilayah === kode);

describe('Podes: definisi indikator', () => {
  it('id unik, berawalan podes_, punya rujukan dan definisi', () => {
    const ids = INDIKATOR_PODES.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of INDIKATOR_PODES) {
      expect(i.id).toMatch(/^podes_[a-z0-9_]+$/);
      expect(i.rujukan).toMatch(/^R\d/);
      expect(i.definisi.length).toBeGreaterThan(30);
    }
  });

  it('tidak memuat butir kejadian sensitif', () => {
    const teks = INDIKATOR_PODES.map((i) => `${i.id} ${i.rujukan}`).join(' ');
    for (const r of ['R1101', 'R1104', 'R1105', 'R1106']) expect(teks).not.toContain(r);
  });

  it('jarak 99,7 adalah penanda, bukan jarak', () => {
    expect(jarakSah(99.7)).toBe(false);
    expect(jarakSah(0)).toBe(false);
    expect(jarakSah(12.5)).toBe(true);
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('Podes: agregasi ke kecamatan', () => {
  const data = [
    desa('1813010001', {
      R302A: 1,
      R602B: 2,
      R301: 1,
      R1201A: 1,
      R501A1: 90,
      R501A2: 0,
      R501B: 10,
      R701GK12: 8,
    }),
    desa('1813010002', {
      R302A: 1,
      R602B: 1,
      R301: 1,
      R1201A: 3,
      R501A1: 50,
      R501A2: 0,
      R501B: 0,
      R701GK12: 99.7,
    }),
    desa('1813010003', {
      R302A: 2,
      R602B: 3,
      R301: 2,
      R1201A: 0,
      R501A1: 100,
      R501A2: 0,
      R501B: 0,
      R701GK2: 1,
    }),
    desa('1813020001', {
      R302A: 1,
      R602B: 2,
      R301: 1,
      R1201A: 1,
      R501A1: 40,
      R501A2: 0,
      R501B: 0,
      R701GK12: 4,
    }),
    desa('1871010001', { R302A: 1 }), // kabupaten lain, harus diabaikan
  ];
  const hasil = agregatPodes(data, '1813');

  it('hanya menghasilkan kode kecamatan dan kabupaten', () => {
    const kode = new Set(hasil.map((r) => r.kode_wilayah));
    expect([...kode].sort()).toEqual(['1813', '1813010', '1813020']);
    expect(hasil).toHaveLength(INDIKATOR_PODES.length * 3);
  });

  it('persen desa per kecamatan dan rasio dari jumlah untuk kabupaten', () => {
    expect(ambil(hasil, 'podes_pesisir', '1813010')).toMatchObject({
      pembilang: 2,
      penyebut: 3,
      nilai: 66.7,
    });
    expect(ambil(hasil, 'podes_pesisir', '1813')).toMatchObject({
      pembilang: 3,
      penyebut: 4,
      nilai: 75,
    });
  });

  it('penyebut khusus: tsunami hanya desa pesisir, SID tanpa kelurahan, listrik per keluarga', () => {
    expect(ambil(hasil, 'podes_peringatan_tsunami', '1813010')).toMatchObject({
      pembilang: 1,
      penyebut: 2,
    });
    expect(ambil(hasil, 'podes_sid', '1813010')).toMatchObject({
      pembilang: 1,
      penyebut: 2,
      nilai: 50,
    });
    expect(ambil(hasil, 'podes_tanpa_listrik', '1813')).toMatchObject({
      pembilang: 10,
      penyebut: 290,
      nilai: 3.4,
    });
  });

  it('median jarak hanya dari desa tanpa fasilitas dan mengabaikan penanda 99,7', () => {
    // Desa 1: 8 km; desa 2: penanda (diabaikan); desa 3: punya SMA (tidak dihitung).
    expect(ambil(hasil, 'podes_jarak_sma', '1813010')).toMatchObject({
      pembilang: null,
      penyebut: 1,
      nilai: 8,
    });
    expect(ambil(hasil, 'podes_jarak_sma', '1813')).toMatchObject({ penyebut: 2, nilai: 6 });
  });

  it('menolak data tanpa desa kabupaten yang diminta', () => {
    expect(() => agregatPodes(data, '1899')).toThrow(/Tidak ada desa/);
  });

  it('indeks id lengkap', () => {
    expect(indikatorPodesById.get('podes_internet_4g')?.tema).toBe('Infrastruktur');
  });
});
