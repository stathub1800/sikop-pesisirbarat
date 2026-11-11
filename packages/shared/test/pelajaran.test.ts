import { describe, expect, it } from 'vitest';
import {
  formatDurasiMenit,
  idVideoYoutube,
  kolomPeserta,
  periksaIsiPelajaran,
  ProfilPesertaSchema,
  urlEmbedYoutube,
} from '../src/index.ts';

describe('idVideoYoutube', () => {
  it('mengenali bentuk tautan YouTube yang umum', () => {
    const id = 'dQw4w9WgXcQ';
    for (const u of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?feature=share&v=${id}&t=10`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}`,
      `https://youtu.be/${id}?t=5`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube-nocookie.com/embed/${id}`,
      `https://www.youtube.com/shorts/${id}`,
    ])
      expect(idVideoYoutube(u), u).toBe(id);
    expect(urlEmbedYoutube(id)).toBe(`https://www.youtube-nocookie.com/embed/${id}`);
  });

  it('menolak tautan selain YouTube, bukan https, atau berisi karakter aneh', () => {
    for (const u of [
      'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.evil.example/watch?v=dQw4w9WgXcQ',
      'https://evil.example/https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=<script>',
      'https://www.youtube.com/watch',
      'https://www.youtube.com/channel/UC1234567890',
      'javascript:alert(1)',
      'bukan url',
      '',
    ])
      expect(idVideoYoutube(u), u).toBeNull();
  });
});

describe('periksaIsiPelajaran', () => {
  it('video hanya menerima embed youtube-nocookie.com', () => {
    expect(
      periksaIsiPelajaran('video', { url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' })
        .sukses,
    ).toBe(true);
    expect(
      periksaIsiPelajaran('video', { url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' }).sukses,
    ).toBe(false);
    expect(periksaIsiPelajaran('video', { url: 'https://evil.example/x' }).sukses).toBe(false);
  });

  it('bacaan, pdf, dan latihan diperiksa menurut jenisnya', () => {
    expect(periksaIsiPelajaran('bacaan', { markdown: '## Judul' }).sukses).toBe(true);
    expect(periksaIsiPelajaran('bacaan', {}).sukses).toBe(false);
    expect(periksaIsiPelajaran('pdf', { url: 'https://bps.go.id/a.pdf' }).sukses).toBe(true);
    expect(periksaIsiPelajaran('pdf', { url: 'http://bps.go.id/a.pdf' }).sukses).toBe(false);
    const l = periksaIsiPelajaran('latihan', {});
    expect(l.sukses && l.isi.nilai_lulus).toBe(60);
    const buruk = periksaIsiPelajaran('latihan', { nilai_lulus: 150 });
    expect(buruk.sukses).toBe(false);
    if (!buruk.sukses) expect(buruk.pesan).toContain('nilai_lulus');
  });
});

describe('ProfilPesertaSchema bercabang menurut kategori', () => {
  const dasar = { nama: 'Siti Aminah', setuju_privasi: true as const };

  it('ASN wajib NIP valid; kategori lain tidak', () => {
    const asn = ProfilPesertaSchema.safeParse({
      ...dasar,
      kategori: 'asn',
      nip: '198501012010011001',
      instansi: 'Dinas Uji',
      jabatan: 'Staf',
    });
    expect(asn.success).toBe(true);
    expect(
      ProfilPesertaSchema.safeParse({ ...dasar, kategori: 'asn', instansi: 'X Y', jabatan: 'XY' })
        .success,
    ).toBe(false);
    expect(
      ProfilPesertaSchema.safeParse({ ...dasar, kategori: 'umum', pekerjaan: 'Petani' }).success,
    ).toBe(true);
    expect(
      ProfilPesertaSchema.safeParse({ ...dasar, kategori: 'pelajar', sekolah: 'SMAN 1' }).success,
    ).toBe(true);
    expect(
      ProfilPesertaSchema.safeParse({ ...dasar, kategori: 'mitra', kegiatan: 'SE2026' }).success,
    ).toBe(true);
    expect(ProfilPesertaSchema.safeParse({ ...dasar, kategori: 'umum' }).success).toBe(false);
  });

  it('tanpa kategori dianggap ASN; nilai bukan objek ditolak', () => {
    const lama = ProfilPesertaSchema.safeParse({
      ...dasar,
      nip: '198501012010011001',
      instansi: 'Dinas Uji',
      jabatan: 'Staf',
    });
    expect(lama.success && lama.data.kategori).toBe('asn');
    expect(ProfilPesertaSchema.safeParse(null).success).toBe(false);
    expect(ProfilPesertaSchema.safeParse([]).success).toBe(false);
  });

  it('kolomPeserta memetakan ke kolom tabel', () => {
    const peta = (v: unknown) => {
      const r = ProfilPesertaSchema.parse(v);
      return kolomPeserta(r);
    };
    expect(
      peta({ ...dasar, nip: '1985 0101 2010 0110 01', instansi: 'Dinas Uji', jabatan: 'Staf' }),
    ).toEqual({
      kategori: 'asn',
      nama: 'Siti Aminah',
      nip: '198501012010011001',
      instansi: 'Dinas Uji',
      jabatan: 'Staf',
    });
    expect(peta({ ...dasar, kategori: 'umum', pekerjaan: 'Petani' })).toMatchObject({
      nip: null,
      jabatan: null,
      instansi: 'Petani',
    });
    expect(peta({ ...dasar, kategori: 'pelajar', sekolah: 'SMAN 1' })).toMatchObject({
      instansi: 'SMAN 1',
    });
    expect(peta({ ...dasar, kategori: 'mitra', kegiatan: 'SE2026' })).toMatchObject({
      instansi: 'SE2026',
    });
  });
});

describe('formatDurasiMenit', () => {
  it('menulis menit dan jam dengan ringkas', () => {
    expect(formatDurasiMenit(0)).toBe('');
    expect(formatDurasiMenit(45)).toBe('45 menit');
    expect(formatDurasiMenit(60)).toBe('1 jam');
    expect(formatDurasiMenit(94)).toBe('1 jam 34 menit');
  });
});
