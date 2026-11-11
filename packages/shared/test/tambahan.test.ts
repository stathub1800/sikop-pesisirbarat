import { describe, expect, it } from 'vitest';
import {
  bboxOf,
  CekPermohonanSchema,
  isKodeKecamatan,
  jumlahRuangKelas,
  kecamatanByKemendagri,
  kecamatanByKode,
  KursusInputSchema,
  ModulInputSchema,
  PengaturanUpdateSchema,
  ProfilPesertaSchema,
  titleCase,
  AdminUserSchema,
  JawabanSchema,
  normalisasiBarisSekolah,
} from '../src/index.ts';

describe('utilitas tambahan', () => {
  it('bboxOf Polygon dan MultiPolygon', () => {
    const p = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [104, -5],
          [105, -5.5],
          [104.5, -6],
          [104, -5],
        ],
      ],
    };
    expect(bboxOf(p)).toEqual([104, -6, 105, -5]);
    expect(bboxOf({ type: 'MultiPolygon', coordinates: [p.coordinates] })).toEqual([
      104, -6, 105, -5,
    ]);
  });
  it('titleCase', () => {
    expect(titleCase('kec. lemong')).toBe('Kec. Lemong');
  });
  it('pencarian kecamatan per kode', () => {
    expect(kecamatanByKode('1813100')?.nama).toBe('Ngaras');
    expect(kecamatanByKemendagri('18.13.01')?.nama).toBe('Pesisir Tengah');
    expect(isKodeKecamatan('1813999')).toBe(false);
  });
  it('jumlah ruang kelas', () => {
    expect(
      jumlahRuangKelas({ rk_baik: 1, rk_rusak_ringan: 2, rk_rusak_sedang: 3, rk_rusak_berat: 4 }),
    ).toBe(10);
  });
});

describe('skema tambahan', () => {
  it('cek tiket', () => {
    expect(
      CekPermohonanSchema.safeParse({ tiket: 'pst-20261109-ab12c', email: 'a@b.id' }).success,
    ).toBe(true);
    expect(CekPermohonanSchema.safeParse({ tiket: 'PST-1', email: 'a@b.id' }).success).toBe(false);
  });
  it('profil peserta memvalidasi NIP dan persetujuan', () => {
    const ok = {
      nama: 'Siti Aminah',
      nip: '198501012010012001',
      instansi: 'Diskominfo',
      jabatan: 'Statistisi',
      setuju_privasi: true,
    };
    expect(ProfilPesertaSchema.safeParse(ok).success).toBe(true);
    expect(ProfilPesertaSchema.safeParse({ ...ok, nip: '111' }).success).toBe(false);
    expect(ProfilPesertaSchema.safeParse({ ...ok, setuju_privasi: false }).success).toBe(false);
  });
  it('pengaturan: whatsapp, url https, json mitra', () => {
    expect(PengaturanUpdateSchema.safeParse({ pst_whatsapp: '6281234567890' }).success).toBe(true);
    expect(PengaturanUpdateSchema.safeParse({ pst_whatsapp: '0812' }).success).toBe(false);
    expect(PengaturanUpdateSchema.safeParse({ sosmed_x: 'http://x.com' }).success).toBe(false);
    expect(PengaturanUpdateSchema.safeParse({ mitra_json: '[{"nama":"Bappeda"}]' }).success).toBe(
      true,
    );
    expect(PengaturanUpdateSchema.safeParse({ mitra_json: '[{"x":1}]' }).success).toBe(false);
    expect(PengaturanUpdateSchema.safeParse({ penandatangan_nip: '12' }).success).toBe(false);
  });
  it('modul hanya menerima video embed YouTube', () => {
    const m = {
      kursus_id: 'pss-2026',
      nomor: 1,
      kode: 'PSS-MOD-01',
      judul: 'Judul modul',
      deskripsi: 'Deskripsi modul panjang',
      nilai_lulus: 75,
      video: [{ judul: 'Video', url: 'https://www.youtube.com/embed/abcdef123' }],
      kompetensi: [],
      sumber: [],
      is_published: true,
      version: 0,
    };
    expect(ModulInputSchema.safeParse(m).success).toBe(true);
    expect(
      ModulInputSchema.safeParse({ ...m, video: [{ judul: 'Video', url: 'javascript:alert(1)' }] })
        .success,
    ).toBe(false);
  });
  it('kursus dan admin', () => {
    expect(
      KursusInputSchema.safeParse({
        kode: 'PSS-2026',
        judul: 'Pembinaan',
        deskripsi: 'Deskripsi kursus',
        nilai_lulus_akhir: 80,
        durasi_akhir_menit: 45,
        jumlah_soal_akhir: 30,
        is_published: true,
        version: 1,
      }).success,
    ).toBe(true);
    expect(
      AdminUserSchema.safeParse({ email: 'a@b.id', nama: 'Admin', peran: 'root' }).success,
    ).toBe(false);
  });
  it('jawaban hanya huruf A sampai E dengan id numerik', () => {
    expect(JawabanSchema.safeParse({ '12': 'b' }).success).toBe(true);
    expect(JawabanSchema.safeParse({ '12': 'Z' }).success).toBe(false);
    expect(JawabanSchema.safeParse({ abc: 'A' }).success).toBe(false);
  });
  it('baris sekolah: status salah, kabupaten lain, kontak tidak valid, koordinat dikoreksi', () => {
    const base = {
      npsn: '12345678',
      nama_sekolah: 'TK A',
      bentuk_pendidikan: 'TK',
      status_sekolah: 'SWASTA',
      kecamatan: 'KEC. LEMONG',
      jml_peserta_didik: '0',
    };
    expect(normalisasiBarisSekolah({ ...base, status_sekolah: 'X' }, 1).data).toBeNull();
    expect(normalisasiBarisSekolah({ ...base, kabupaten: 'Kab. Tanggamus' }, 1).data).toBeNull();
    const r = normalisasiBarisSekolah(
      { ...base, email: 'bukan', telepon: 'abc', latitude: '5.2', longitude: '103.9' },
      1,
    );
    expect(r.data?.email).toBeNull();
    expect(r.data?.koordinat_status).toBe('diperbaiki');
    expect(r.temuan.map((t) => t.kolom).sort()).toEqual(['email', 'latitude', 'telepon']);
  });
});
