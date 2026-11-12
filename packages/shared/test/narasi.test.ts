import { describe, expect, it } from 'vitest';
import {
  INDIKATOR_PODES,
  NARASI_INDIKATOR,
  narasiIndikator,
  unitPenyebutRingkas,
} from '../src/index.ts';

describe('Narasi indikator', () => {
  it('setiap indikator Podes punya narasi dengan jenis yang sesuai', () => {
    for (const i of INDIKATOR_PODES) {
      const n = NARASI_INDIKATOR[i.id];
      expect(n, i.id).toBeDefined();
      expect(n!.jenis, i.id).toBe(i.jenis);
    }
  });

  it('persen: menjelaskan pembilang, penyebut, dan maksud "Ada SD/MI"', () => {
    const t = narasiIndikator('podes_ada_sd', {
      wilayah: 'Kecamatan Ngambur',
      nilai: 100,
      satuan: '%',
      desimal: 1,
      pembilang: 9,
      penyebut: 9,
    });
    expect(t).toBe(
      'Di Kecamatan Ngambur, 9 dari 9 desa/kelurahan (100,0%) memiliki sedikitnya satu SD atau MI (negeri maupun swasta) di dalam wilayah desanya sendiri.',
    );
  });

  it('penyebut khusus: tata kelola hanya desa, tsunami hanya desa pesisir', () => {
    expect(unitPenyebutRingkas('podes_sid')).toBe('desa, tanpa kelurahan');
    expect(unitPenyebutRingkas('podes_peringatan_tsunami')).toBe('desa pesisir');
    expect(unitPenyebutRingkas('podes_ada_sd')).toBe('desa/kelurahan');
    expect(unitPenyebutRingkas('indikator_admin', 'keluarga')).toBe('keluarga');
  });

  it('median dan data sekolah memakai templat kalimat lengkap', () => {
    expect(
      narasiIndikator('podes_jarak_sma', {
        wilayah: 'Kecamatan Ngambur',
        nilai: 4.5,
        satuan: 'km',
        desimal: 1,
        pembilang: null,
        penyebut: 6,
      }),
    ).toContain('Ada 6 desa/kelurahan di Kecamatan Ngambur yang belum memiliki SMA');
    expect(
      narasiIndikator('jumlah_sekolah', {
        wilayah: 'Kabupaten Pesisir Barat',
        nilai: 364,
        satuan: 'unit',
        desimal: 0,
      }),
    ).toContain('Terdapat 364 satuan pendidikan');
  });

  it('tanpa angka atau tanpa narasi mengembalikan null', () => {
    const dasar = { wilayah: 'X', satuan: '%', desimal: 1, pembilang: 1, penyebut: 2 };
    expect(narasiIndikator('podes_ada_sd', { ...dasar, nilai: null })).toBeNull();
    expect(narasiIndikator('tidak_dikenal', { ...dasar, nilai: 50 })).toBeNull();
  });
});
