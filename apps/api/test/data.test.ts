/**
 * Uji kebenaran data (T03, S03, S05) dan alur bisnis (K03, sertifikat, admin).
 * Angka acuan 364 / 34.651 / 2.983 berasal dari berkas sumber (lihat build/laporan-mutu-data.md).
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { formatNomorSertifikat } from '@sikop/shared';
import { jadikanAdmin, kerjakan, klien, masukSebagai, pesertaBaru } from './helpers.ts';

interface Ind {
  id: string;
  nilai: Record<string, number | null>;
  kabupaten: number | null;
  sumber: string;
  tahun: string;
  metode: string;
}

describe('T03: satu sumber angka, rekonsiliasi dengan berkas sumber', () => {
  it('ringkasan beranda cocok dengan data sumber', async () => {
    const r = await klien().json<{ sekolah: number; pd: number; guru: number; kecamatan: number }>(
      '/ringkasan',
    );
    expect(r.body).toMatchObject({ kecamatan: 11, sekolah: 364, pd: 34651, guru: 2983 });
  });

  it('indikator: agregat kabupaten = jumlah kecamatan, rasio dari total; setiap indikator bersumber', async () => {
    const { body } = await klien().json<{ indikator: Ind[] }>('/indikator');
    const by = Object.fromEntries(body.indikator.map((i) => [i.id, i]));
    const jumlah = by.jumlah_sekolah!;
    expect(Object.keys(jumlah.nilai)).toHaveLength(11);
    expect(Object.values(jumlah.nilai).reduce((a, b) => (a ?? 0) + (b ?? 0), 0)).toBe(
      jumlah.kabupaten,
    );
    expect(jumlah.kabupaten).toBe(364);
    expect(by.jumlah_peserta_didik!.kabupaten).toBe(34651);
    expect(by.rasio_murid_guru!.kabupaten).toBeCloseTo(34651 / 2983, 6);
    expect(jumlah.nilai['1813100']).toBeGreaterThan(0); // Ngaras kini punya data (T01)
    for (const i of body.indikator) {
      expect(i.sumber, i.id).not.toBe('');
      expect(i.tahun, i.id).toMatch(/^\d{4}/);
      expect(i.metode.length, i.id).toBeGreaterThan(10);
    }
  });

  it('angka lama tanpa sumber tidak tayang (masih draf)', async () => {
    const { body } = await klien().json<{ indikator: Ind[] }>('/indikator');
    expect(body.indikator.map((i) => i.id)).not.toContain('jumlah_penduduk');
  });

  it('profil kecamatan Ngaras tersedia dengan luas dan rekap', async () => {
    const r = await klien().json<{
      kecamatan: { nama: string; luas_km2_peta: number };
      rekap: unknown[];
      indikator: unknown[];
    }>('/kecamatan/1813100');
    expect(r.status).toBe(200);
    expect(r.body.kecamatan.nama).toBe('Ngaras');
    expect(r.body.kecamatan.luas_km2_peta).toBeGreaterThan(50);
    expect(r.body.rekap.length).toBeGreaterThan(0);
    expect((await klien().req('/kecamatan/1813999')).status).toBe(404);
  });
});

describe('Potret Desa (Podes): hanya agregat kecamatan', () => {
  type IndPodes = Ind & {
    kategori: string;
    rincian?: Record<string, { pembilang: number | null; penyebut: number | null }>;
    rincianKabupaten?: { pembilang: number | null; penyebut: number | null };
    unitPenyebut?: string;
  };

  it('indikator Podes tayang dengan pembilang/penyebut per kecamatan yang konsisten dengan kabupaten', async () => {
    const { body } = await klien().json<{ indikator: IndPodes[] }>('/indikator');
    const podes = body.indikator.filter((i) => i.id.startsWith('podes_'));
    expect(podes.length).toBeGreaterThanOrEqual(40);
    const pesisir = podes.find((i) => i.id === 'podes_pesisir')!;
    expect(pesisir.kategori).toBe('Wilayah');
    expect(pesisir.rincianKabupaten).toEqual({ pembilang: 84, penyebut: 121 });
    expect(pesisir.kabupaten).toBeCloseTo(69.4, 1);
    // Rasio kabupaten dari jumlah, bukan rata-rata persentase kecamatan.
    const r = Object.values(pesisir.rincian!);
    expect(r).toHaveLength(11);
    expect(r.reduce((a, x) => a + (x.pembilang ?? 0), 0)).toBe(84);
    expect(r.reduce((a, x) => a + (x.penyebut ?? 0), 0)).toBe(121);
    // Penyebut khusus: peringatan tsunami hanya dihitung di desa pesisir.
    const tsunami = podes.find((i) => i.id === 'podes_peringatan_tsunami')!;
    expect(tsunami.unitPenyebut).toBe('desa pesisir');
    expect(tsunami.rincianKabupaten?.penyebut).toBe(84);
    // Kode wilayah yang keluar hanya kecamatan; tidak ada kode desa 10 digit.
    for (const i of podes) for (const k of Object.keys(i.nilai)) expect(k).toMatch(/^1813\d{3}$/);
    // Butir sensitif tidak pernah ditayangkan.
    expect(podes.map((i) => i.id).join(' ')).not.toMatch(/kekerasan_kejadian|judi|perkelahian/);
  });

  it('profil kecamatan memuat rincian Podes milik kecamatan itu saja', async () => {
    const r = await klien().json<{ indikator: (IndPodes & { rincian?: unknown })[] }>(
      '/kecamatan/1813030',
    );
    const pesisir = r.body.indikator.find((i) => i.id === 'podes_pesisir')!;
    expect(pesisir.rincian).toEqual({ pembilang: 5, penyebut: 6 });
  });

  it('indikator Podes tidak dapat disunting lewat formulir admin', async () => {
    const admin = await masukSebagai('super@uji.id', 'Super Uji');
    const res = await admin.json('/admin/indikator/podes_pesisir', {
      method: 'PUT',
      body: {
        id: 'podes_pesisir',
        nama: 'Ubah',
        satuan: '%',
        kategori: 'Wilayah',
        sumber: 'x',
        tahun: '2026',
        metode: 'cara hitung manual yang panjang',
        desimal: 1,
        arah: 'netral',
        agregasi: 'tidak_ada',
        is_published: true,
        urutan: 1,
        nilai: {},
        version: 1,
      },
    });
    expect(res.status).toBe(409);
  });
});

describe('Data sekolah publik', () => {
  it('filter, paginasi, dan hitungan berpasangan', async () => {
    const r = await klien().json<{
      items: { kode_kec: string; jenjang: string }[];
      total: number;
      ukuran: number;
    }>('/sekolah?kec=1813100&jenjang=SD%2FMI&ukuran=5');
    expect(r.body.items.length).toBeLessThanOrEqual(5);
    expect(r.body.total).toBeGreaterThan(0);
    expect(r.body.items.every((s) => s.kode_kec === '1813100' && s.jenjang === 'SD/MI')).toBe(true);
    expect((await klien().req('/sekolah?kec=9999999')).status).toBe(400);
    expect((await klien().req('/sekolah?ukuran=100000')).status).toBe(200);
  });

  it('titik peta hanya memuat koordinat yang layak tampil', async () => {
    const r = await klien().json<{ features: { geometry: { coordinates: [number, number] } }[] }>(
      '/sekolah/titik',
    );
    const { n } = (await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM sekolah WHERE koordinat_status IN ('valid','diperbaiki','beda_kecamatan')",
    ).first<{ n: number }>())!;
    expect(r.body.features).toHaveLength(n);
    for (const f of r.body.features) {
      const [lon, lat] = f.geometry.coordinates;
      expect(lat).toBeGreaterThan(-6);
      expect(lat).toBeLessThan(-4.7);
      expect(lon).toBeGreaterThan(103.5);
    }
  });

  it('detail sekolah tidak membocorkan kolom internal', async () => {
    const r = await klien().json<{ sekolah: Record<string, unknown> }>('/sekolah/10803624');
    expect(r.status).toBe(200);
    expect(r.body.sekolah.kecamatan).toBe('Ngambur');
    expect(r.body.sekolah).not.toHaveProperty('koordinat_catatan');
    expect(r.body.sekolah).not.toHaveProperty('updated_by');
    expect((await klien().req('/sekolah/ZZZZZZZZ')).status).toBe(404);
  });

  it('ekspor CSV lengkap dengan BOM dan jumlah baris yang benar', async () => {
    const res = await klien().req('/sekolah/ekspor.csv?kec=1813030');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM agar Excel membaca UTF-8
    const teks = new TextDecoder().decode(bytes);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    const baris = teks.trim().split('\r\n');
    const { n } = (await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM sekolah WHERE kode_kec = '1813030'",
    ).first<{ n: number }>())!;
    expect(baris).toHaveLength(n + 1);
    expect(baris[0]).toMatch(/^npsn,nama/);
  });
});

describe('K03: permohonan data benar-benar tersimpan dan dapat dilacak', () => {
  const isian = {
    nama: 'Rina Wati',
    email: 'Rina@Contoh.id',
    no_hp: '081234567890',
    instansi: 'Universitas',
    kategori: 'permintaan_data',
    pesan: 'Mohon data jumlah sekolah per kecamatan tahun 2026 untuk penelitian.',
    setuju_privasi: true,
  };

  it('tersimpan dengan tiket, masuk kotak PST, dan dapat dicek dengan email yang cocok', async () => {
    const r = await klien().json<{ tiket: string }>('/layanan/permohonan', {
      method: 'POST',
      body: isian,
    });
    expect(r.status).toBe(201);
    expect(r.body.tiket).toMatch(/^PST-\d{8}-[A-Z0-9]{5}$/);
    const row = await env.DB.prepare(
      'SELECT email, status, privasi_versi FROM permohonan WHERE tiket = ?',
    )
      .bind(r.body.tiket)
      .first();
    expect(row).toMatchObject({ email: 'rina@contoh.id', status: 'baru', privasi_versi: '1.0' });

    expect(
      (
        await klien().json('/layanan/permohonan/status', {
          method: 'POST',
          body: { tiket: r.body.tiket, email: 'lain@contoh.id' },
        })
      ).status,
    ).toBe(404);
    const cek = await klien().json<{ permohonan: { status: string } }>(
      '/layanan/permohonan/status',
      { method: 'POST', body: { tiket: r.body.tiket, email: 'rina@contoh.id' } },
    );
    expect(cek.body.permohonan.status).toBe('baru');

    const pst = await jadikanAdmin('pst2@uji.go.id', 'petugas_pst');
    expect(
      (
        await pst.json(`/admin/permohonan/${r.body.tiket}`, {
          method: 'PUT',
          body: { status: 'selesai' },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await pst.json(`/admin/permohonan/${r.body.tiket}`, {
          method: 'PUT',
          body: { status: 'selesai', tanggapan: 'Data dikirim lewat email.' },
        })
      ).status,
    ).toBe(200);
    const akhir = await klien().json<{ permohonan: { status: string; tanggapan: string } }>(
      '/layanan/permohonan/status',
      { method: 'POST', body: { tiket: r.body.tiket, email: 'rina@contoh.id' } },
    );
    expect(akhir.body.permohonan).toMatchObject({
      status: 'selesai',
      tanggapan: 'Data dikirim lewat email.',
    });
  });

  it('isian tidak valid ditolak per kolom; tanpa persetujuan privasi ditolak', async () => {
    const r = await klien().json<{ galat: { rincian: Record<string, string[]> } }>(
      '/layanan/permohonan',
      {
        method: 'POST',
        body: { ...isian, email: 'bukan-email', pesan: 'pendek', setuju_privasi: false },
      },
    );
    expect(r.status).toBe(422);
    expect(Object.keys(r.body.galat.rincian).sort()).toEqual(['email', 'pesan', 'setuju_privasi']);
    // Pesan galat berbahasa Indonesia yang ramah (bukan bawaan bahasa Inggris).
    expect(r.body.galat.rincian.email).toEqual(['Format email tidak valid']);
    expect(r.body.galat.rincian.pesan).toEqual(['Minimal 20 karakter.']);
  });
});

describe('Alur sertifikat dari ujian sampai verifikasi publik', () => {
  it('ditangguhkan → menunggu verifikasi → terbit → terverifikasi publik → dicabut', async () => {
    const p = await pesertaBaru('lulusan@uji.id');
    for (const m of [901, 902]) {
      await kerjakan(p, { kursus_id: 'uji', jenis: 'pre', modul_id: m }, false);
      const post = (await kerjakan(p, { kursus_id: 'uji', jenis: 'post', modul_id: m }, true)) as {
        percobaan: { lulus: boolean };
      };
      expect(post.percobaan.lulus).toBe(true);
    }
    const akhir = (await kerjakan(p, { kursus_id: 'uji', jenis: 'akhir' }, true)) as {
      percobaan: { lulus: boolean; total: number };
      sertifikat: { status: string };
    };
    expect(akhir.percobaan.total).toBe(5);
    expect(akhir.percobaan.lulus).toBe(true);
    expect(akhir.sertifikat.status).toBe('menunggu_verifikasi');

    const adm = await jadikanAdmin('lms2@uji.go.id', 'pengelola_lms');
    const { akun_id } = (await env.DB.prepare(
      "SELECT akun_id FROM peserta p JOIN akun a ON a.id = p.akun_id WHERE a.email = 'lulusan@uji.id'",
    ).first<{ akun_id: string }>())!;
    const v1 = await adm.json<{ sertifikat: { status: string }[] }>(
      `/admin/lms/peserta/${akun_id}`,
      { method: 'PUT', body: { status: 'terverifikasi' } },
    );
    expect(v1.body.sertifikat[0]!.status).toBe('ditangguhkan'); // penerbitan belum diaktifkan, penandatangan kosong

    expect(
      (await adm.json('/admin/pengaturan', { method: 'PUT', body: { sertifikat_aktif: '1' } }))
        .status,
    ).toBe(422);
    expect(
      (
        await adm.json('/admin/pengaturan', {
          method: 'PUT',
          body: {
            penandatangan_nama: 'Nama Pejabat Sah',
            penandatangan_jabatan: 'Kepala BPS Kabupaten Pesisir Barat',
            sertifikat_aktif: '1',
          },
        })
      ).status,
    ).toBe(200);
    const t = await adm.json<{ hasil: Record<string, number> }>(
      '/admin/lms/sertifikat/terbitkan-tertunda',
      { method: 'POST', body: {} },
    );
    expect(t.body.hasil.terbit).toBe(1);

    const prog = await p.json<{ sertifikat: { nomor: string; kode_verifikasi: string } }>(
      '/lms/saya/progres/uji',
    );
    const tahun = new Date(Date.now() + 7 * 3600_000).getUTCFullYear();
    expect(prog.body.sertifikat.nomor).toBe(formatNomorSertifikat('UJI-2026', tahun, 1));
    const ver = await klien().json<{
      sertifikat: { status: string; nip_samaran: string; penandatangan_nama: string };
    }>(`/sertifikat/${prog.body.sertifikat.kode_verifikasi}`);
    expect(ver.body.sertifikat).toMatchObject({
      status: 'sah',
      penandatangan_nama: 'Nama Pejabat Sah',
    });
    expect(ver.body.sertifikat.nip_samaran).toMatch(/^\d{8}\*{8}\d{2}$/);

    expect(
      (
        await adm.json('/admin/lms/sertifikat/cabut', {
          method: 'POST',
          body: { nomor: prog.body.sertifikat.nomor, alasan: 'Uji pencabutan sertifikat.' },
        })
      ).status,
    ).toBe(200);
    const dicabut = await klien().json<{ sertifikat: { status: string } }>(
      `/sertifikat/${prog.body.sertifikat.kode_verifikasi}`,
    );
    expect(dicabut.body.sertifikat.status).toBe('dicabut');

    // Sudah lulus: tidak dapat memulai ujian akhir lagi.
    expect(
      (await p.req('/lms/ujian', { method: 'POST', body: { kursus_id: 'uji', jenis: 'akhir' } }))
        .status,
    ).toBe(409);
    const audit = await env.DB.prepare(
      "SELECT aksi FROM audit_log WHERE entitas = 'sertifikat'",
    ).all<{ aksi: string }>();
    expect(audit.results.map((r) => r.aksi)).toEqual(expect.arrayContaining(['terbit', 'cabut']));
  });

  it('batas 3 percobaan ujian akhir per 24 jam', async () => {
    const p = await pesertaBaru('gagalterus@uji.id');
    for (const m of [901, 902]) {
      await kerjakan(p, { kursus_id: 'uji', jenis: 'pre', modul_id: m }, true);
      await kerjakan(p, { kursus_id: 'uji', jenis: 'post', modul_id: m }, true);
    }
    for (let i = 0; i < 3; i++) await kerjakan(p, { kursus_id: 'uji', jenis: 'akhir' }, false);
    const r = await p.json<{ galat: { kode: string } }>('/lms/ujian', {
      method: 'POST',
      body: { kursus_id: 'uji', jenis: 'akhir' },
    });
    expect(r.status).toBe(429);
    expect(r.body.galat.kode).toBe('batas_percobaan');
  });

  it('NIP tidak valid ditolak; NIP yang sama tidak dapat dipakai dua akun', async () => {
    const a = await masukSebagai('nipa@uji.id');
    const isian = {
      nama: 'A B',
      nip: '123',
      instansi: 'Dinas',
      jabatan: 'Staf',
      setuju_privasi: true,
    };
    expect((await a.json('/lms/saya/profil', { method: 'POST', body: isian })).status).toBe(422);
    const nip = '198805052012122002';
    expect(
      (await a.json('/lms/saya/profil', { method: 'POST', body: { ...isian, nip } })).status,
    ).toBe(201);
    const b = await masukSebagai('nipb@uji.id');
    expect(
      (await b.json('/lms/saya/profil', { method: 'POST', body: { ...isian, nip } })).status,
    ).toBe(409);
    const profil = await a.json<{ peserta: { nip: string } }>('/lms/saya/profil');
    expect(profil.body.peserta.nip).toBe('19880505********02');
  });
});

describe('Admin: edit data dengan optimistic locking dan audit', () => {
  it('versi usang ditolak 409; versi benar tersimpan dan tercatat di audit', async () => {
    const ed = await jadikanAdmin('editor2@uji.go.id', 'editor_data');
    const { body } = await ed.json<{ sekolah: Record<string, unknown> }>('/admin/sekolah/10803624');
    const s = body.sekolah;
    const isian = {
      nama: s.nama,
      bentuk: s.bentuk,
      status: s.status,
      akreditasi: s.akreditasi,
      alamat: s.alamat,
      dusun: s.dusun,
      kode_pos: s.kode_pos,
      kode_kec: s.kode_kec,
      telepon: s.telepon,
      email: s.email,
      website: null,
      lat: -5.4,
      lon: 104.13,
      pd_l: s.pd_l,
      pd_p: s.pd_p,
      rombel: s.rombel,
      guru_l: s.guru_l,
      guru_p: s.guru_p,
      rk_baik: s.rk_baik,
      rk_rusak_ringan: s.rk_rusak_ringan,
      rk_rusak_sedang: s.rk_rusak_sedang,
      rk_rusak_berat: s.rk_rusak_berat,
      is_published: true,
      version: s.version,
    };
    expect(
      (
        await ed.json('/admin/sekolah/10803624', {
          method: 'PUT',
          body: { ...isian, version: Number(s.version) + 5 },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await ed.json('/admin/sekolah/10803624', {
          method: 'PUT',
          body: { ...isian, lat: -6.2, lon: 106.8 },
        })
      ).status,
    ).toBe(422);
    expect((await ed.json('/admin/sekolah/10803624', { method: 'PUT', body: isian })).status).toBe(
      200,
    );
    const after = await env.DB.prepare(
      "SELECT lat, koordinat_status, version, updated_by FROM sekolah WHERE npsn = '10803624'",
    ).first();
    expect(after).toMatchObject({
      lat: -5.4,
      koordinat_status: 'valid',
      version: Number(s.version) + 1,
      updated_by: 'editor2@uji.go.id',
    });
    const log = await env.DB.prepare(
      "SELECT aktor, sebelum, sesudah FROM audit_log WHERE entitas = 'sekolah' AND entitas_id = '10803624'",
    ).first<{ aktor: string; sebelum: string }>();
    expect(log?.aktor).toBe('editor2@uji.go.id');
    expect(JSON.parse(log!.sebelum).lat).toBe(-5.3937);
  });

  it('indikator manual tidak dapat tayang tanpa sumber; setelah lengkap, tampil di publik', async () => {
    const ed = await jadikanAdmin('editor3@uji.go.id', 'editor_data');
    const isian = {
      id: 'jumlah_penduduk',
      nama: 'Jumlah Penduduk',
      satuan: 'jiwa',
      kategori: 'Kependudukan',
      desimal: 0,
      arah: 'netral',
      agregasi: 'jumlah',
      is_published: true,
      urutan: 10,
      nilai: {},
      version: 1,
    };
    expect(
      (await ed.json('/admin/indikator/jumlah_penduduk', { method: 'PUT', body: isian })).status,
    ).toBe(422);
    const ok = await ed.json('/admin/indikator/jumlah_penduduk', {
      method: 'PUT',
      body: {
        ...isian,
        sumber: 'Kecamatan Dalam Angka 2025',
        tahun: '2024',
        metode: 'Proyeksi penduduk pertengahan tahun.',
      },
    });
    expect(ok.status).toBe(200);
    const { body } = await klien().json<{ indikator: Ind[] }>('/indikator');
    const ind = body.indikator.find((i) => i.id === 'jumlah_penduduk');
    expect(ind?.kabupaten).toBe(
      13820 + 8740 + 1620 + 16480 + 9870 + 21540 + 11230 + 27650 + 22890 + 10450 + 31240,
    );
  });
});
