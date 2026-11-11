import { describe, expect, it } from 'vitest';
import {
  areaKm2,
  batasKelas,
  formatAngka,
  formatNomorSertifikat,
  formatPersen,
  formatTanggal,
  hitungIndikator,
  INDIKATOR_SEKOLAH,
  jenjangDari,
  kecamatanByNama,
  kelasDari,
  KECAMATAN,
  nilaiJawaban,
  normalisasiBarisSekolah,
  parseCsv,
  periksaKoordinat,
  pointInArea,
  samarkanNip,
  SoalInputSchema,
  toCsv,
  validasiNip,
  PermohonanSchema,
  PengaturanUpdateSchema,
  IndikatorManualSchema,
  SekolahEditSchema,
  type SekolahRingkas,
} from '../src/index.ts';

describe('csv', () => {
  it('mengurai kutip, koma di dalam kutip, kutip ganda, CRLF, dan BOM', () => {
    const rows = parseCsv('﻿a,b,c\r\n"1,5","x ""y""",z\r\n\r\n');
    expect(rows).toEqual([{ a: '1,5', b: 'x "y"', c: 'z' }]);
  });
  it('baris kosong dan berkas kosong', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('a,b\n')).toEqual([]);
  });
  it('menulis CSV dan menetralkan formula injection', () => {
    const out = toCsv([{ n: '=HYPERLINK("x")', m: -5, k: 'a,b' }], ['n', 'm', 'k']);
    expect(out).toBe('n,m,k\r\n"\'=HYPERLINK(""x"")",-5,"a,b"\r\n');
  });
});

describe('kecamatan', () => {
  it('memiliki 11 kecamatan termasuk Ngaras dengan kode unik', () => {
    expect(KECAMATAN).toHaveLength(11);
    expect(new Set(KECAMATAN.map((k) => k.kode)).size).toBe(11);
    expect(KECAMATAN.some((k) => k.nama === 'Ngaras')).toBe(true);
  });
  it.each([
    ['KEC. KARYAPENGGAWA', '1813040'],
    ['Kec. Lemong', '1813010'],
    ['KEC. PESISIR SELATAN', '1813080'],
    ['kecamatan ngaras', '1813100'],
  ])('mengenali "%s"', (raw, kode) => {
    expect(kecamatanByNama(raw)?.kode).toBe(kode);
  });
  it('tidak menebak nama ambigu "Bengkunat"', () => {
    expect(kecamatanByNama('KEC. BENGKUNAT')).toBeUndefined();
  });
});

describe('periksaKoordinat', () => {
  it('valid di dalam kabupaten', () => {
    expect(periksaKoordinat('-5.2378', '103.9575')).toMatchObject({
      status: 'valid',
      lat: -5.2378,
    });
  });
  it.each([
    ['0', '0'],
    ['', ''],
    ['0.0002', '0.0001'],
    ['abc', '1'],
  ])('kosong/placeholder %s,%s', (a, b) => {
    expect(periksaKoordinat(a, b)).toMatchObject({ status: 'tidak_ada', lat: null });
  });
  it('mengoreksi bujur -256 menjadi +104 dan menandainya', () => {
    const r = periksaKoordinat('-5.1401', '-255.9923');
    expect(r.status).toBe('diperbaiki');
    expect(r.lon).toBeCloseTo(104.0077, 4);
  });
  it('membalik lintang positif', () => {
    expect(periksaKoordinat('5.2108', '103.9191')).toMatchObject({
      status: 'diperbaiki',
      lat: -5.2108,
    });
  });
  it('menolak koordinat jauh di luar wilayah', () => {
    expect(periksaKoordinat('-0.0037', '-0.0235').status).toBe('di_luar_batas');
    expect(periksaKoordinat('-6.2', '106.8')).toMatchObject({ status: 'di_luar_batas', lat: null });
  });
});

const barisContoh = (over: Record<string, string> = {}): Record<string, string> => ({
  sekolah_id: 'X',
  npsn: '10803624',
  nama_sekolah: 'SD NEGERI 47 KRUI',
  bentuk_pendidikan: 'SD',
  status_sekolah: 'NEGERI',
  akreditasi: 'B',
  kecamatan: 'KEC. NGAMBUR',
  kabupaten: 'Kab. Pesisir Barat',
  email: 'sdn1ulokmukti@yahoo.com',
  website: 'http://www.sdn47krui@yahoo.com',
  telepon: '081279656571',
  latitude: '-5.3937',
  longitude: '104.1293',
  jml_peserta_didik: '300',
  jml_pd_laki: '144',
  jml_pd_perempuan: '156',
  jml_rombel: '13',
  jml_guru_total: '18',
  jml_guru_laki: '4',
  jml_guru_perempuan: '14',
  ruang_kelas_baik: '15',
  ruang_kelas_rusak_ringan: '0',
  ruang_kelas_rusak_sedang: '0',
  ruang_kelas_rusak_berat: '0',
  rt: '0',
  kode_pos: '34883',
  ...over,
});

describe('normalisasiBarisSekolah', () => {
  it('menormalkan baris valid dan membuang situs tidak valid sebagai peringatan', () => {
    const { data, temuan } = normalisasiBarisSekolah(barisContoh(), 2);
    expect(data).toMatchObject({
      npsn: '10803624',
      kode_kec: '1813090',
      jenjang: 'SD/MI',
      status: 'Negeri',
      website: null,
      rt: null,
    });
    expect(temuan).toEqual([expect.objectContaining({ tingkat: 'peringatan', kolom: 'website' })]);
  });
  it('menolak jumlah PD yang tidak sama dengan L + P', () => {
    const { data, temuan } = normalisasiBarisSekolah(barisContoh({ jml_pd_laki: '100' }), 3);
    expect(data).toBeNull();
    expect(temuan.some((t) => t.kolom === 'jml_peserta_didik' && t.tingkat === 'galat')).toBe(true);
  });
  it('menolak kecamatan tak dikenal, NPSN salah, dan angka negatif', () => {
    expect(normalisasiBarisSekolah(barisContoh({ kecamatan: 'KEC. ANTAH' }), 4).data).toBeNull();
    expect(normalisasiBarisSekolah(barisContoh({ npsn: '123' }), 5).data).toBeNull();
    expect(normalisasiBarisSekolah(barisContoh({ jml_rombel: '-1' }), 6).data).toBeNull();
  });
  it('NPSN nonformal berawalan huruf diterima', () => {
    expect(normalisasiBarisSekolah(barisContoh({ npsn: 'p9954146' }), 7).data?.npsn).toBe(
      'P9954146',
    );
  });
});

describe('jenjang', () => {
  it.each([
    ['TK', 'PAUD'],
    ['MTs', 'SMP/MTs'],
    ['SMK', 'SMA/SMK/MA'],
    ['Pondok Pesantren', 'Nonformal'],
    ['Tidak Dikenal', 'Nonformal'],
  ])('%s → %s', (b, j) => expect(jenjangDari(b)).toBe(j));
});

const s = (kode_kec: string, o: Partial<SekolahRingkas> = {}): SekolahRingkas => ({
  kode_kec,
  pd: 0,
  guru: 0,
  rombel: 0,
  akreditasi: null,
  akses_internet: null,
  sumber_listrik: null,
  rk_baik: 0,
  rk_rusak_ringan: 0,
  rk_rusak_sedang: 0,
  rk_rusak_berat: 0,
  ...o,
});
const ind = (id: string) => INDIKATOR_SEKOLAH.find((i) => i.id === id)!;

describe('hitungIndikator', () => {
  const data = [
    s('1813010', {
      pd: 100,
      guru: 10,
      akses_internet: 'Seluler',
      akreditasi: 'A',
      rk_baik: 3,
      rk_rusak_berat: 1,
    }),
    s('1813010', { pd: 50, guru: 0, akses_internet: 'Tidak Ada', akreditasi: 'C' }),
    s('1813020', { pd: 30, guru: 5, akses_internet: null }),
  ];
  const kode = ['1813010', '1813020', '1813030'];

  it('jumlah: total kabupaten = jumlah kecamatan (rekonsiliasi)', () => {
    const r = hitungIndikator(ind('jumlah_peserta_didik'), data, kode);
    expect(r.perKecamatan).toEqual({ '1813010': 150, '1813020': 30, '1813030': 0 });
    expect(r.kabupaten).toBe(180);
  });
  it('rasio kabupaten dihitung dari total, bukan rata-rata kecamatan', () => {
    const r = hitungIndikator(ind('rasio_murid_guru'), data, kode);
    expect(r.perKecamatan['1813010']).toBe(15);
    expect(r.perKecamatan['1813020']).toBe(6);
    expect(r.perKecamatan['1813030']).toBeNull();
    expect(r.kabupaten).toBe(12); // 180 / 15, bukan (15 + 6) / 2
  });
  it('persentase mengeluarkan isian kosong dari penyebut', () => {
    const r = hitungIndikator(ind('persen_akses_internet'), data, kode);
    expect(r.perKecamatan['1813010']).toBe(50);
    expect(r.perKecamatan['1813020']).toBeNull();
    expect(r.kabupaten).toBe(50);
  });
  it('persen kelas baik dan akreditasi', () => {
    expect(hitungIndikator(ind('persen_kelas_baik'), data, kode).perKecamatan['1813010']).toBe(75);
    expect(hitungIndikator(ind('persen_akreditasi_ab'), data, kode).kabupaten).toBeCloseTo(
      33.333,
      2,
    );
  });
});

describe('kelas warna', () => {
  it('batas kuantil naik dan kelas sesuai', () => {
    const b = batasKelas([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null]);
    expect(b.length).toBe(4);
    expect([...b].sort((x, y) => x - y)).toEqual(b);
    expect(kelasDari(1, b)).toBe(0);
    expect(kelasDari(10, b)).toBe(4);
  });
  it('nilai sedikit dan kosong', () => {
    expect(batasKelas([])).toEqual([]);
    expect(batasKelas([5, 5, 7])).toEqual([7]);
  });
});

describe('geo', () => {
  const kotak = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [104, -5],
        [105, -5],
        [105, -6],
        [104, -6],
        [104, -5],
      ],
    ],
  };
  const berlubang = {
    type: 'Polygon' as const,
    coordinates: [
      kotak.coordinates[0]!,
      [
        [104.4, -5.4],
        [104.6, -5.4],
        [104.6, -5.6],
        [104.4, -5.6],
        [104.4, -5.4],
      ],
    ],
  };
  it('titik dalam, luar, dan di dalam lubang', () => {
    expect(pointInArea(-5.5, 104.2, kotak)).toBe(true);
    expect(pointInArea(-4.5, 104.2, kotak)).toBe(false);
    expect(pointInArea(-5.5, 104.5, berlubang)).toBe(false);
    expect(
      pointInArea(-5.5, 104.5, { type: 'MultiPolygon', coordinates: [kotak.coordinates] }),
    ).toBe(true);
  });
  it('luas kotak 1° × 1° di dekat ekuator sekitar 12.200 km²', () => {
    expect(areaKm2(kotak)).toBeGreaterThan(12000);
    expect(areaKm2(kotak)).toBeLessThan(12500);
  });
});

describe('NIP', () => {
  it('menerima NIP berstruktur benar', () => {
    expect(validasiNip('198501012010011001', 2026).valid).toBe(true);
    expect(validasiNip('1985 0101 2010 01 1 001', 2026).valid).toBe(true);
  });
  it.each([
    ['12345', '18 digit'],
    ['198513012010011001', 'tanggal lahir'],
    ['198501012030011001', 'TMT'],
    ['198501012010013001', 'ke-15'],
    ['123456789012345678', 'tanggal lahir'],
  ])('menolak %s', (nip, pesan) => {
    const r = validasiNip(nip, 2026);
    expect(r.valid).toBe(false);
    expect(r.pesan).toContain(pesan);
  });
  it('menyamarkan NIP', () => {
    expect(samarkanNip('198501012010011001')).toBe('19850101********01');
  });
});

describe('penilaian ujian', () => {
  const soal = [
    { id: 1, kunci: 'A' },
    { id: 2, kunci: 'B' },
    { id: 3, kunci: 'C' },
  ];
  it('menilai benar, kosong dihitung salah, huruf kecil diterima', () => {
    expect(nilaiJawaban(soal, { '1': 'a', '2': 'B' })).toEqual({
      benar: 2,
      total: 3,
      nilai: 66.67,
    });
  });
  it('jawaban untuk soal di luar percobaan diabaikan', () => {
    expect(nilaiJawaban(soal, { '99': 'A', '1': 'A' })).toEqual({
      benar: 1,
      total: 3,
      nilai: 33.33,
    });
  });
  it('tanpa soal bernilai 0', () => {
    expect(nilaiJawaban([], {})).toEqual({ benar: 0, total: 0, nilai: 0 });
  });
  it('nomor sertifikat', () => {
    expect(formatNomorSertifikat('PSS-2026', 2026, 42)).toBe('SIKOP/PSS-2026/2026/00042');
  });
  it('skema soal menolak kunci yang bukan opsi dan soal akhir yang terikat modul', () => {
    const dasar = {
      kursus_id: 'pss-2026',
      modul_id: 1,
      jenis: 'post',
      pertanyaan: 'Apa itu SDI?',
      opsi: [
        { id: 'A', text: 'x' },
        { id: 'B', text: 'y' },
      ],
      kunci: 'A',
    };
    expect(SoalInputSchema.safeParse(dasar).success).toBe(true);
    expect(SoalInputSchema.safeParse({ ...dasar, kunci: 'C' }).success).toBe(false);
    expect(SoalInputSchema.safeParse({ ...dasar, jenis: 'akhir' }).success).toBe(false);
  });
});

describe('format id-ID', () => {
  it('angka, persen, tanggal', () => {
    expect(formatAngka(1234567)).toBe('1.234.567');
    expect(formatAngka(32.44, 1)).toBe('32,4');
    expect(formatAngka(null)).toBe('–');
    expect(formatPersen(12.5)).toBe('12,5%');
    expect(formatTanggal('2026-11-04T18:00:00Z')).toBe('5 November 2026');
    expect(formatTanggal('2026-11-05T03:07:00Z', true)).toBe('5 November 2026, 10.07 WIB');
    expect(formatTanggal('bukan tanggal')).toBe('–');
  });
});

describe('skema API', () => {
  const ok = {
    nama: 'Budi',
    email: 'Budi@Contoh.id',
    kategori: 'permintaan_data',
    pesan: 'Mohon data jumlah sekolah per kecamatan 2026.',
    setuju_privasi: true,
  };
  it('permohonan valid dan email dinormalkan', () => {
    const r = PermohonanSchema.parse(ok);
    expect(r.email).toBe('budi@contoh.id');
    expect(r.no_hp ?? null).toBeNull();
  });
  it('permohonan tanpa persetujuan, pesan pendek, atau jebakan bot terisi ditolak', () => {
    expect(PermohonanSchema.safeParse({ ...ok, setuju_privasi: false }).success).toBe(false);
    expect(PermohonanSchema.safeParse({ ...ok, pesan: 'pendek' }).success).toBe(false);
    expect(PermohonanSchema.safeParse({ ...ok, situs: 'http://spam' }).success).toBe(false);
  });
  it('sertifikat tidak bisa diaktifkan tanpa penandatangan', () => {
    expect(PengaturanUpdateSchema.safeParse({ sertifikat_aktif: '1' }).success).toBe(false);
    expect(
      PengaturanUpdateSchema.safeParse({
        sertifikat_aktif: '1',
        penandatangan_nama: 'A B',
        penandatangan_jabatan: 'Kepala',
      }).success,
    ).toBe(true);
  });
  it('indikator manual tidak bisa tayang tanpa sumber', () => {
    const v = {
      id: 'jumlah_pekon',
      nama: 'Jumlah Pekon',
      satuan: 'pekon',
      kategori: 'Wilayah',
      desimal: 0,
      arah: 'netral',
      agregasi: 'jumlah',
      is_published: true,
      nilai: {},
      version: 0,
    };
    expect(IndikatorManualSchema.safeParse(v).success).toBe(false);
    expect(
      IndikatorManualSchema.safeParse({
        ...v,
        sumber: 'Kecamatan Dalam Angka',
        tahun: '2025',
        metode: 'Hitungan',
      }).success,
    ).toBe(true);
    expect(
      IndikatorManualSchema.safeParse({ ...v, is_published: false, nilai: { '9999999': 1 } })
        .success,
    ).toBe(false);
  });
  it('edit sekolah menolak koordinat di luar kabupaten dan lintang tanpa bujur', () => {
    const dasar = {
      nama: 'SD X',
      bentuk: 'SD',
      status: 'Negeri',
      kode_kec: '1813010',
      lat: -5.2,
      lon: 104,
      pd_l: 1,
      pd_p: 1,
      rombel: 1,
      guru_l: 1,
      guru_p: 0,
      rk_baik: 1,
      rk_rusak_ringan: 0,
      rk_rusak_sedang: 0,
      rk_rusak_berat: 0,
      is_published: true,
      version: 1,
    };
    expect(SekolahEditSchema.safeParse(dasar).success).toBe(true);
    expect(SekolahEditSchema.safeParse({ ...dasar, lat: -6.2, lon: 106.8 }).success).toBe(false);
    expect(SekolahEditSchema.safeParse({ ...dasar, lon: null }).success).toBe(false);
  });
});
