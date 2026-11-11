/**
 * Fase 2 (ADR-0007): silabus bab dan pelajaran, isi pelajaran, latihan dinilai server, progres,
 * pendaftaran berkategori, dan gerbang ujian akhir. Kursus contoh sintetis: membaca-data-bps.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import {
  jadikanAdmin,
  kerjakan,
  klien,
  masukSebagai,
  nipUji,
  pesertaBaru,
  type Klien,
} from './helpers.ts';

const KURSUS = 'membaca-data-bps';
const MODUL = [2001, 2002, 2003];
const PEL_WAJIB = [200101, 200102, 200103, 200201, 200203, 200301, 200302, 200303];
const LATIHAN = [200103, 200203, 200303];

interface Silabus {
  kursus: Record<string, unknown>;
  modul: { id: number }[];
  bab: {
    id: number;
    modul_id: number | null;
    pelajaran: { id: number; jenis: string; wajib: boolean }[];
  }[];
}

async function kunciLatihan(pelajaranId: number): Promise<Record<string, string>> {
  const { results } = await env.DB.prepare(
    'SELECT id, kunci FROM soal_latihan WHERE pelajaran_id = ?',
  )
    .bind(pelajaranId)
    .all<{ id: number; kunci: string }>();
  return Object.fromEntries(results.map((r) => [String(r.id), r.kunci]));
}

async function lulusLatihan(k: Klien, pelajaranId: number): Promise<void> {
  const r = await k.json<{ lulus: boolean }>(`/lms/pelajaran/${pelajaranId}/latihan`, {
    method: 'POST',
    body: { jawaban: await kunciLatihan(pelajaranId) },
  });
  expect(r.body.lulus).toBe(true);
}

async function selesaikanSemuaPelajaran(k: Klien): Promise<void> {
  for (const id of PEL_WAJIB) {
    if (LATIHAN.includes(id)) await lulusLatihan(k, id);
    else
      expect((await k.json(`/lms/saya/progres/${id}`, { method: 'POST', body: {} })).status).toBe(
        200,
      );
  }
}

describe('Katalog kursus: metadata dan saringan', () => {
  it('memuat level, sasaran, hasil belajar, durasi, jumlah pelajaran, dan label bersertifikat', async () => {
    const r = await klien().json<{ kursus: Record<string, unknown>[] }>('/lms/kursus');
    expect(r.status).toBe(200);
    const k = r.body.kursus.find((x) => x.id === KURSUS)!;
    expect(k).toMatchObject({
      level: 'dasar',
      sasaran: ['asn', 'umum', 'pelajar', 'mitra'],
      jumlah_pelajaran: 9,
      jumlah_modul: 3,
      bersertifikat: true,
      gambar_url: '/gambar/kursus-contoh.svg',
    });
    expect((k.hasil_belajar as string[]).length).toBe(4);
    // Durasi dihitung dari jumlah durasi pelajaran bila kolom durasi_menit = 0.
    expect(k.durasi_menit).toBe(15 + 8 + 5 + 10 + 10 + 8 + 5 + 8 + 5);
    // Kursus lama tanpa bab tetap tampil dengan nilai bawaan.
    const lama = r.body.kursus.find((x) => x.id === 'uji')!;
    expect(lama).toMatchObject({ level: 'dasar', sasaran: [], jumlah_pelajaran: 0 });
  });

  it('saringan level dan sasaran bekerja; sasaran kosong berarti semua kategori', async () => {
    const ids = async (q: string): Promise<string[]> =>
      (await klien().json<{ kursus: { id: string }[] }>(`/lms/kursus${q}`)).body.kursus.map(
        (x) => x.id,
      );
    expect(await ids('?level=dasar')).toContain(KURSUS);
    expect(await ids('?level=lanjut')).not.toContain(KURSUS);
    expect(await ids('?sasaran=pelajar')).toContain(KURSUS);
    expect(await ids('?sasaran=pelajar')).toContain('uji');
    expect(await ids('?level=menengah&sasaran=asn')).not.toContain(KURSUS);
    const buruk = await klien().json('/lms/kursus?level=ahli');
    expect(buruk.status).toBe(422);
    expect((await klien().json('/lms/kursus?sasaran=semua')).status).toBe(422);
  });
});

describe('Silabus publik tidak membocorkan isi atau soal', () => {
  it('bab dan pelajaran terurut, hanya judul, jenis, durasi, dan wajib', async () => {
    const res = await klien().req(`/lms/kursus/${KURSUS}`);
    const teks = await res.text();
    const d = JSON.parse(teks) as Silabus;
    expect(d.bab.map((b) => b.id)).toEqual([2001, 2002, 2003]);
    expect(d.bab.map((b) => b.modul_id)).toEqual([2001, 2002, 2003]);
    const jenis = new Set(d.bab.flatMap((b) => b.pelajaran.map((p) => p.jenis)));
    expect([...jenis].sort()).toEqual(['bacaan', 'latihan', 'pdf', 'video']);
    expect(d.bab[1]!.pelajaran.find((p) => p.jenis === 'pdf')!.wajib).toBe(false);
    expect(d.kursus).toMatchObject({ jumlah_pelajaran: 9, jumlah_pelajaran_wajib: 8 });
    // Tidak ada isi pelajaran, soal latihan, kunci, atau pembahasan.
    expect(teks).not.toMatch(/"kunci"|"pembahasan"|"pertanyaan"|"isi"|"isi_json"|markdown|youtube/);
  });

  it('bab dari modul yang belum terbit disembunyikan, begitu juga pelajarannya', async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO modul (id, kursus_id, nomor, kode, judul, deskripsi, is_published) VALUES (2099, ?, 99, 'MDB-DRAF', 'Draf', 'Belum terbit.', 0)",
      ).bind(KURSUS),
      env.DB.prepare(
        "INSERT INTO bab (id, kursus_id, modul_id, urutan, judul) VALUES (2099, ?, 2099, 99, 'Bab draf')",
      ).bind(KURSUS),
      env.DB.prepare(
        "INSERT INTO pelajaran (id, bab_id, urutan, judul, jenis, isi_json) VALUES (209901, 2099, 1, 'Rahasia draf', 'bacaan', '{\"markdown\":\"belum tayang\"}')",
      ),
    ]);
    const d = await klien().json<Silabus>(`/lms/kursus/${KURSUS}`);
    expect(d.body.bab.map((b) => b.id)).not.toContain(2099);
    const p = await pesertaBaru('draf@uji.id');
    expect((await p.req('/lms/pelajaran/209901')).status).toBe(404);
  });
});

describe('Isi pelajaran hanya untuk peserta terdaftar', () => {
  it('tanpa login 401; tanpa profil 403; peserta menerima isi dan navigasi', async () => {
    expect((await klien().req('/lms/pelajaran/200102')).status).toBe(401);
    const tanpaProfil = await masukSebagai('belumdaftar@uji.id');
    const r = await tanpaProfil.json<{ galat: { kode: string } }>('/lms/pelajaran/200102');
    expect(r.status).toBe(403);
    expect(r.body.galat.kode).toBe('profil');

    const p = await pesertaBaru('baca@uji.id');
    const d = await p.json<{
      pelajaran: { jenis: string; isi: { markdown: string }; selesai: boolean };
      sebelumnya: number | null;
      berikutnya: number | null;
      progres: { total: number; wajib_total: number };
    }>('/lms/pelajaran/200102');
    expect(d.status).toBe(200);
    expect(d.body.pelajaran.isi.markdown).toContain('Empat pertanyaan');
    expect(d.body.pelajaran.selesai).toBe(false);
    expect(d.body.sebelumnya).toBe(200101);
    expect(d.body.berikutnya).toBe(200103);
    expect(d.body.progres).toMatchObject({ total: 9, wajib_total: 8 });
    expect((await p.req('/lms/pelajaran/999999')).status).toBe(404);
    expect((await p.req('/lms/pelajaran/abc')).status).toBe(404);
  });

  it('latihan dikirim tanpa kunci dan pembahasan; opsi tetap lengkap', async () => {
    const p = await pesertaBaru('soallatihan@uji.id');
    const res = await p.req('/lms/pelajaran/200103');
    const teks = await res.text();
    expect(teks).not.toMatch(/"kunci"|"pembahasan"|correct|answer/i);
    const d = JSON.parse(teks) as {
      pelajaran: { soal: { id: number; opsi: { id: string }[] }[]; isi: { nilai_lulus: number } };
    };
    expect(d.pelajaran.soal).toHaveLength(3);
    expect(d.pelajaran.soal[0]!.opsi.map((o) => o.id).sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(d.pelajaran.isi.nilai_lulus).toBe(60);
  });
});

describe('Latihan dinilai di server dan boleh diulang', () => {
  it('jawaban salah tidak menyelesaikan; benar menyelesaikan; respons tanpa huruf kunci', async () => {
    const p = await pesertaBaru('latihan@uji.id');
    const kunci = await kunciLatihan(200103);
    const salah = Object.fromEntries(
      Object.entries(kunci).map(([id, k]) => [id, k === 'A' ? 'B' : 'A']),
    );
    const gagal = await p.json<{
      lulus: boolean;
      nilai: number;
      selesai: boolean;
      hasil: { id: number; benar: boolean }[];
    }>('/lms/pelajaran/200103/latihan', { method: 'POST', body: { jawaban: salah } });
    expect(gagal.status).toBe(200);
    expect(gagal.body).toMatchObject({ lulus: false, nilai: 0, selesai: false });
    expect(gagal.body.hasil.every((h) => h.benar === false)).toBe(true);
    const sebelum = await p.json<{ pelajaran: { selesai: boolean } }>('/lms/pelajaran/200103');
    expect(sebelum.body.pelajaran.selesai).toBe(false);

    // Ulangi: satu soal benar dari tiga (33,33) masih di bawah ambang 60.
    const sebagian = { ...salah, [Object.keys(kunci)[0]!]: Object.values(kunci)[0]! };
    const r2 = await p.json<{ lulus: boolean; nilai: number }>('/lms/pelajaran/200103/latihan', {
      method: 'POST',
      body: { jawaban: sebagian },
    });
    expect(r2.body).toMatchObject({ lulus: false, nilai: 33.33 });

    const ok = await p.req('/lms/pelajaran/200103/latihan', {
      method: 'POST',
      body: { jawaban: kunci },
    });
    const teks = await ok.text();
    expect(teks).not.toMatch(/"kunci"/);
    expect(JSON.parse(teks)).toMatchObject({ lulus: true, nilai: 100, selesai: true, ambang: 60 });
    const sesudah = await p.json<{ pelajaran: { selesai: boolean } }>('/lms/pelajaran/200103');
    expect(sesudah.body.pelajaran.selesai).toBe(true);

    // Boleh diulang walau sudah selesai, dan kemajuan tidak hilang bila percobaan berikutnya salah.
    const lagi = await p.json<{ lulus: boolean }>('/lms/pelajaran/200103/latihan', {
      method: 'POST',
      body: { jawaban: salah },
    });
    expect(lagi.body.lulus).toBe(false);
    expect(
      (await p.json<{ pelajaran: { selesai: boolean } }>('/lms/pelajaran/200103')).body.pelajaran
        .selesai,
    ).toBe(true);
  });

  it('jawaban untuk soal lain diabaikan; bukan latihan ditolak; butuh login dan profil', async () => {
    const p = await pesertaBaru('latihan2@uji.id');
    const kunciLain = await kunciLatihan(200203);
    const r = await p.json<{ nilai: number }>('/lms/pelajaran/200103/latihan', {
      method: 'POST',
      body: { jawaban: kunciLain },
    });
    expect(r.body.nilai).toBe(0);
    const bukan = await p.json<{ galat: { kode: string } }>('/lms/pelajaran/200102/latihan', {
      method: 'POST',
      body: { jawaban: {} },
    });
    expect(bukan.status).toBe(409);
    expect(bukan.body.galat.kode).toBe('bukan_latihan');
    expect(
      (
        await klien().req('/lms/pelajaran/200103/latihan', {
          method: 'POST',
          body: { jawaban: {} },
        })
      ).status,
    ).toBe(401);
    const tanpaProfil = await masukSebagai('latihan3@uji.id');
    expect(
      (
        await tanpaProfil.req('/lms/pelajaran/200103/latihan', {
          method: 'POST',
          body: { jawaban: {} },
        })
      ).status,
    ).toBe(403);
  });
});

describe('Progres pelajaran dan Kursus saya', () => {
  it('tandai selesai idempoten; latihan tidak bisa ditandai manual; daftar kursus saya', async () => {
    const p = await pesertaBaru('progres@uji.id');
    expect((await p.json<{ kursus: unknown[] }>('/lms/saya/kursus')).body.kursus).toEqual([]);

    const a = await p.json<{ ok: boolean; progres: { wajib_selesai: number; lanjut: number } }>(
      '/lms/saya/progres/200101',
      { method: 'POST', body: {} },
    );
    expect(a.status).toBe(200);
    expect(a.body.progres.wajib_selesai).toBe(1);
    expect(a.body.progres.lanjut).toBe(200102);
    const b = await p.json<{ progres: { wajib_selesai: number } }>('/lms/saya/progres/200101', {
      method: 'POST',
      body: {},
    });
    expect(b.body.progres.wajib_selesai).toBe(1);
    const n = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM progres_pelajaran WHERE pelajaran_id = 200101',
    ).first<{ n: number }>();
    expect(n!.n).toBeGreaterThanOrEqual(1);

    const latihan = await p.json<{ galat: { kode: string } }>('/lms/saya/progres/200103', {
      method: 'POST',
      body: {},
    });
    expect(latihan.status).toBe(409);
    expect(latihan.body.galat.kode).toBe('latihan_wajib_lulus');
    expect((await p.req('/lms/saya/progres/999999', { method: 'POST', body: {} })).status).toBe(
      404,
    );
    expect(
      (await klien().req('/lms/saya/progres/200101', { method: 'POST', body: {} })).status,
    ).toBe(401);

    const s = await p.json<{
      kursus: {
        id: string;
        status: string;
        persen: number;
        pelajaran_selesai: number;
        pelajaran_total: number;
        lanjut_pelajaran_id: number;
        sertifikat: unknown;
      }[];
    }>('/lms/saya/kursus');
    expect(s.body.kursus).toHaveLength(1);
    expect(s.body.kursus[0]).toMatchObject({
      id: KURSUS,
      status: 'berjalan',
      persen: 13,
      pelajaran_selesai: 1,
      pelajaran_total: 9,
      lanjut_pelajaran_id: 200102,
      sertifikat: null,
    });

    const pr = await p.json<{ pelajaran: { selesai: number[]; wajib_total: number } }>(
      `/lms/saya/progres/${KURSUS}`,
    );
    expect(pr.body.pelajaran.selesai).toEqual([200101]);
  });

  it('progres milik akun lain tidak terlihat', async () => {
    const a = await pesertaBaru('pa@uji.id');
    const b = await pesertaBaru('pb@uji.id');
    await a.json('/lms/saya/progres/200102', { method: 'POST', body: {} });
    const d = await b.json<{ pelajaran: { selesai: boolean } }>('/lms/pelajaran/200102');
    expect(d.body.pelajaran.selesai).toBe(false);
  });
});

describe('Ujian akhir terbuka setelah semua pelajaran wajib selesai', () => {
  it('post-test lulus saja belum cukup; setelah pelajaran wajib selesai, ujian akhir dan sertifikat berjalan', async () => {
    const p = await pesertaBaru('gerbang@uji.id');
    for (const m of MODUL) {
      await kerjakan(p, { kursus_id: KURSUS, jenis: 'pre', modul_id: m }, false);
      const post = (await kerjakan(p, { kursus_id: KURSUS, jenis: 'post', modul_id: m }, true)) as {
        percobaan: { lulus: boolean };
      };
      expect(post.percobaan.lulus).toBe(true);
    }
    const prog = await p.json<{ akhir: { boleh_mulai: boolean; pelajaran_wajib_belum: number } }>(
      `/lms/saya/progres/${KURSUS}`,
    );
    expect(prog.body.akhir).toMatchObject({ boleh_mulai: false, pelajaran_wajib_belum: 8 });
    const tutup = await p.json<{ galat: { kode: string; pesan: string } }>('/lms/ujian', {
      method: 'POST',
      body: { kursus_id: KURSUS, jenis: 'akhir' },
    });
    expect(tutup.status).toBe(409);
    expect(tutup.body.galat.kode).toBe('pelajaran_belum_selesai');
    expect(tutup.body.galat.pesan).toContain('Belum selesai');

    await selesaikanSemuaPelajaran(p);
    const buka = await p.json<{ akhir: { boleh_mulai: boolean } }>(`/lms/saya/progres/${KURSUS}`);
    expect(buka.body.akhir.boleh_mulai).toBe(true);
    const akhir = (await kerjakan(p, { kursus_id: KURSUS, jenis: 'akhir' }, true)) as {
      percobaan: { lulus: boolean; total: number };
      sertifikat: { status: string };
    };
    expect(akhir.percobaan).toMatchObject({ lulus: true, total: 6 });
    expect(akhir.sertifikat.status).toBe('menunggu_verifikasi');

    const s = await p.json<{ kursus: { status: string; persen: number }[] }>('/lms/saya/kursus');
    expect(s.body.kursus[0]).toMatchObject({ status: 'selesai', persen: 100 });
  });

  it('kursus lama tanpa pelajaran tidak terkunci (kompatibel mundur)', async () => {
    const p = await pesertaBaru('lamaakhir@uji.id');
    for (const m of [901, 902]) {
      await kerjakan(p, { kursus_id: 'uji', jenis: 'pre', modul_id: m }, false);
      await kerjakan(p, { kursus_id: 'uji', jenis: 'post', modul_id: m }, true);
    }
    const akhir = (await kerjakan(p, { kursus_id: 'uji', jenis: 'akhir' }, true)) as {
      percobaan: { lulus: boolean };
    };
    expect(akhir.percobaan.lulus).toBe(true);
  });
});

describe('Pendaftaran peserta berkategori: NIP hanya wajib untuk ASN', () => {
  const dasar = { nama: 'Budi Santoso', setuju_privasi: true };
  const daftar = (
    email: string,
    body: unknown,
  ): Promise<{ k: Klien; status: number; body: Record<string, unknown> }> =>
    masukSebagai(email).then(async (k) => {
      const r = await k.json('/lms/saya/profil', { method: 'POST', body });
      return { k, status: r.status, body: r.body };
    });

  it('umum, pelajar, dan mitra mendaftar tanpa NIP; data disimpan sebagai asal peserta', async () => {
    const umum = await daftar('umum@uji.id', {
      ...dasar,
      kategori: 'umum',
      pekerjaan: 'Wiraswasta',
    });
    expect(umum.status).toBe(201);
    const pelajar = await daftar('pelajar@uji.id', {
      ...dasar,
      kategori: 'pelajar',
      sekolah: 'SMAN 1 Pesisir Barat',
    });
    expect(pelajar.status).toBe(201);
    const mitra = await daftar('mitra@uji.id', {
      ...dasar,
      kategori: 'mitra',
      kegiatan: 'Sensus Ekonomi 2026',
    });
    expect(mitra.status).toBe(201);
    const p = await umum.k.json<{ peserta: Record<string, unknown> }>('/lms/saya/profil');
    expect(p.body.peserta).toMatchObject({
      kategori: 'umum',
      nip: null,
      instansi: 'Wiraswasta',
      jabatan: null,
      status: 'menunggu',
    });
    const saya = await mitra.k.json<{ peserta: { kategori: string } }>('/auth/saya');
    expect(saya.body.peserta.kategori).toBe('mitra');
  });

  it('ASN wajib NIP, instansi, dan jabatan; kategori lain tidak diminta NIP', async () => {
    const asn = await daftar('asnkosong@uji.id', { ...dasar, kategori: 'asn' });
    expect(asn.status).toBe(422);
    const rincian = (asn.body as { galat: { rincian: Record<string, string[]> } }).galat.rincian;
    expect(Object.keys(rincian).sort()).toEqual(['instansi', 'jabatan', 'nip']);
    const tanpaPekerjaan = await daftar('umumkosong@uji.id', { ...dasar, kategori: 'umum' });
    expect(tanpaPekerjaan.status).toBe(422);
    expect(
      Object.keys((tanpaPekerjaan.body as { galat: { rincian: object } }).galat.rincian),
    ).toEqual(['pekerjaan']);
    const tidakDikenal = await daftar('aneh@uji.id', { ...dasar, kategori: 'pengusaha' });
    expect(tidakDikenal.status).toBe(422);
    // Persetujuan privasi tetap wajib untuk semua kategori.
    const tanpaSetuju = await daftar('tanpasetuju@uji.id', {
      nama: 'Budi Santoso',
      kategori: 'umum',
      pekerjaan: 'Petani',
      setuju_privasi: false,
    });
    expect(tanpaSetuju.status).toBe(422);
  });

  it('permintaan lama tanpa kategori diperlakukan sebagai ASN', async () => {
    const lama = await daftar('klienlama@uji.id', {
      ...dasar,
      nip: nipUji(),
      instansi: 'Dinas Uji',
      jabatan: 'Staf',
    });
    expect(lama.status).toBe(201);
    const p = await lama.k.json<{ peserta: { kategori: string } }>('/lms/saya/profil');
    expect(p.body.peserta.kategori).toBe('asn');
  });

  it('NIP ganda hanya diperiksa untuk ASN; banyak peserta tanpa NIP boleh', async () => {
    const a = await daftar('umum2@uji.id', { ...dasar, kategori: 'umum', pekerjaan: 'Nelayan' });
    const b = await daftar('umum3@uji.id', { ...dasar, kategori: 'umum', pekerjaan: 'Guru' });
    expect([a.status, b.status]).toEqual([201, 201]);
  });

  it('kategori peserta terverifikasi tidak dapat diubah sendiri', async () => {
    const u = await daftar('kunci@uji.id', { ...dasar, kategori: 'umum', pekerjaan: 'Petani' });
    const { akun_id } = (await env.DB.prepare(
      "SELECT akun_id FROM peserta p JOIN akun a ON a.id = p.akun_id WHERE a.email = 'kunci@uji.id'",
    ).first<{ akun_id: string }>())!;
    const adm = await jadikanAdmin('lms3@uji.go.id', 'pengelola_lms');
    expect(
      (
        await adm.json(`/admin/lms/peserta/${akun_id}`, {
          method: 'PUT',
          body: { status: 'terverifikasi' },
        })
      ).status,
    ).toBe(200);
    const ubah = await u.k.json<{ galat: { kode: string } }>('/lms/saya/profil', {
      method: 'POST',
      body: { ...dasar, kategori: 'pelajar', sekolah: 'SMPN 2' },
    });
    expect(ubah.status).toBe(409);
    expect(ubah.body.galat.kode).toBe('kategori_terkunci');
    const boleh = await u.k.json('/lms/saya/profil', {
      method: 'POST',
      body: { ...dasar, kategori: 'umum', pekerjaan: 'Pedagang' },
    });
    expect(boleh.status).toBe(200);
    // Admin melihat kategori dan NIP kosong tanpa galat.
    const daftarAdmin = await adm.json<{ items: { kategori: string; nip: string | null }[] }>(
      '/admin/lms/peserta?q=kunci@uji.id',
    );
    expect(daftarAdmin.body.items[0]).toMatchObject({ kategori: 'umum', nip: null });
  });
});

describe('Admin: metadata kursus', () => {
  it('menyimpan level, sasaran, hasil belajar, dan gambar; menolak gambar dari domain luar', async () => {
    const adm = await jadikanAdmin('lms4@uji.go.id', 'pengelola_lms');
    const { body } = await adm.json<{ kursus: { id: string; version: number }[] }>(
      '/admin/lms/kursus',
    );
    const lama = body.kursus.find((k) => k.id === 'uji')!;
    const isian = {
      kode: 'UJI-2026',
      judul: 'Kursus Uji Otomatis',
      subjudul: '',
      deskripsi: 'Kursus sintetis untuk pengujian.',
      kategori: 'Uji',
      estimasi: '1 jam',
      nilai_lulus_akhir: 80,
      durasi_akhir_menit: 30,
      jumlah_soal_akhir: 5,
      is_published: true,
      version: lama.version,
    };
    const buruk = await adm.json('/admin/lms/kursus/uji', {
      method: 'PUT',
      body: { ...isian, gambar_url: 'https://situs-luar.example/gambar.png' },
    });
    expect(buruk.status).toBe(422);
    const ok = await adm.json('/admin/lms/kursus/uji', {
      method: 'PUT',
      body: {
        ...isian,
        level: 'menengah',
        sasaran: ['asn', 'mitra'],
        hasil_belajar: ['Memahami contoh pengujian.'],
        durasi_menit: 90,
        gambar_url: '/gambar/uji.svg',
      },
    });
    expect(ok.status).toBe(200);
    const d = await klien().json<{
      kursus: { id: string; level: string; sasaran: string[]; durasi_menit: number }[];
    }>('/lms/kursus?level=menengah');
    expect(d.body.kursus.find((k) => k.id === 'uji')).toMatchObject({
      level: 'menengah',
      sasaran: ['asn', 'mitra'],
      durasi_menit: 90,
    });
    // Penyimpanan tanpa metadata tidak menghapus nilai yang sudah ada.
    const versi = (
      await adm.json<{ kursus: { id: string; version: number }[] }>('/admin/lms/kursus')
    ).body.kursus.find((k) => k.id === 'uji')!.version;
    await adm.json('/admin/lms/kursus/uji', { method: 'PUT', body: { ...isian, version: versi } });
    const lagi = await klien().json<{ kursus: { id: string; level: string }[] }>('/lms/kursus');
    expect(lagi.body.kursus.find((k) => k.id === 'uji')!.level).toBe('menengah');
  });
});
