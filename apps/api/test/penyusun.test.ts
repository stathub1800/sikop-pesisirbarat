/**
 * Fase 3 (ADR-0008): penyusun kursus di admin: bab, pelajaran, soal latihan, urutan, draf/terbit,
 * pratinjau, kesiapan, riwayat, dan hak akses.
 */
import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { jadikanAdmin, klien, pesertaBaru, type Klien } from './helpers.ts';

const KURSUS = 'susun-uji';
const A = `/admin/lms`;

interface Struktur {
  kursus: { id: string };
  bab: {
    id: number;
    urutan: number;
    version: number;
    is_published: boolean;
    pelajaran: {
      id: number;
      urutan: number;
      version: number;
      jenis: string;
      is_published: boolean;
      isi: Record<string, unknown>;
    }[];
  }[];
  modul: { id: number }[];
}

let adm: Klien;
let peserta: Klien;

const struktur = async (): Promise<Struktur> =>
  (await adm.json<Struktur>(`${A}/kursus/${KURSUS}/struktur`)).body;

async function buatBab(judul: string, ekstra: Record<string, unknown> = {}): Promise<number> {
  const r = await adm.json<{ id: number }>(`${A}/kursus/${KURSUS}/bab`, {
    method: 'POST',
    body: { judul, ...ekstra },
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.id;
}
async function buatPelajaran(
  babId: number,
  body: Record<string, unknown>,
): Promise<{ status: number; id: number; body: unknown }> {
  const r = await adm.json<{ id: number }>(`${A}/bab/${babId}/pelajaran`, {
    method: 'POST',
    body,
  });
  return { status: r.status, id: r.body.id, body: r.body };
}

beforeAll(async () => {
  await env.DB.prepare(
    "INSERT INTO kursus (id, kode, judul, deskripsi, is_published, urutan) VALUES (?, 'SUSUN-1', 'Kursus Penyusun Uji', 'Kursus untuk menguji penyusun.', 1, 90)",
  )
    .bind(KURSUS)
    .run();
  adm = await jadikanAdmin('penyusun@uji.go.id', 'pengelola_lms');
  peserta = await pesertaBaru('peserta-penyusun@uji.id');
});

describe('Hak akses penyusun', () => {
  it('ditolak untuk anonim, peserta, dan admin peran lain', async () => {
    expect((await klien().json(`${A}/kursus/${KURSUS}/struktur`)).status).toBe(401);
    expect((await peserta.json(`${A}/kursus/${KURSUS}/struktur`)).status).toBe(403);
    const lain = await jadikanAdmin('editor-lain@uji.go.id', 'editor_data');
    expect((await lain.json(`${A}/kursus/${KURSUS}/struktur`)).status).toBe(403);
    expect(
      (await lain.json(`${A}/kursus/${KURSUS}/bab`, { method: 'POST', body: { judul: 'Gelap' } }))
        .status,
    ).toBe(403);
  });

  it('kursus tidak dikenal 404', async () => {
    expect((await adm.json(`${A}/kursus/tidak-ada/struktur`)).status).toBe(404);
  });
});

describe('Bab: buat, ubah, urutan', () => {
  it('bab baru berstatus draf, urutan bertambah, versi dijaga', async () => {
    const b1 = await buatBab('Bab pertama');
    const b2 = await buatBab('Bab kedua');
    const b3 = await buatBab('Bab ketiga');
    let s = await struktur();
    expect(s.bab.map((b) => b.id)).toEqual([b1, b2, b3]);
    expect(s.bab.map((b) => b.urutan)).toEqual([1, 2, 3]);
    expect(s.bab.every((b) => !b.is_published)).toBe(true);

    const ubah = await adm.json(`${A}/bab/${b1}`, {
      method: 'PUT',
      body: { judul: 'Bab pertama revisi', is_published: false, version: 1 },
    });
    expect(ubah.status).toBe(200);
    // Versi usang ditolak.
    const usang = await adm.json(`${A}/bab/${b1}`, {
      method: 'PUT',
      body: { judul: 'Tabrakan', version: 1 },
    });
    expect(usang.status).toBe(409);
    // Versi wajib.
    expect(
      (await adm.json(`${A}/bab/${b1}`, { method: 'PUT', body: { judul: 'Tanpa versi' } })).status,
    ).toBe(422);

    // Urutan: balik.
    const urut = await adm.json(`${A}/kursus/${KURSUS}/bab/urutan`, {
      method: 'PUT',
      body: { ids: [b3, b2, b1] },
    });
    expect(urut.status).toBe(200);
    s = await struktur();
    expect(s.bab.map((b) => b.id)).toEqual([b3, b2, b1]);
    expect(s.bab.map((b) => b.urutan)).toEqual([1, 2, 3]);
    // Daftar tidak lengkap atau berlebih ditolak.
    expect(
      (
        await adm.json(`${A}/kursus/${KURSUS}/bab/urutan`, {
          method: 'PUT',
          body: { ids: [b1, b2] },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await adm.json(`${A}/kursus/${KURSUS}/bab/urutan`, {
          method: 'PUT',
          body: { ids: [b1, b2, b3, 999999] },
        })
      ).status,
    ).toBe(422);
  });

  it('modul tautan harus milik kursus dan tidak dipakai bab lain', async () => {
    // Modul milik kursus lain.
    const salah = await adm.json(`${A}/kursus/${KURSUS}/bab`, {
      method: 'POST',
      body: { judul: 'Bab salah modul', modul_id: 2001 },
    });
    expect(salah.status).toBe(422);
    await env.DB.prepare(
      `INSERT INTO modul (id, kursus_id, nomor, kode, judul, deskripsi, nilai_lulus, is_published)
       VALUES (7001, ?, 1, 'SUSUN-M1', 'Modul evaluasi', 'x', 70, 1)`,
    )
      .bind(KURSUS)
      .run();
    const ok = await adm.json<{ id: number }>(`${A}/kursus/${KURSUS}/bab`, {
      method: 'POST',
      body: { judul: 'Bab ber-evaluasi', modul_id: 7001 },
    });
    expect(ok.status).toBe(201);
    const dobel = await adm.json(`${A}/kursus/${KURSUS}/bab`, {
      method: 'POST',
      body: { judul: 'Bab ganda modul', modul_id: 7001 },
    });
    expect(dobel.status).toBe(409);
  });
});

describe('Pelajaran: isi per jenis, soal latihan, urutan', () => {
  it('video dinormalkan, tautan buruk dan jenis tetap dijaga', async () => {
    const bab = await buatBab('Bab pelajaran');
    const v = await buatPelajaran(bab, {
      judul: 'Video pengantar',
      jenis: 'video',
      isi: { url: 'https://youtu.be/tUXqJ1xyqIk' },
      durasi_menit: 7,
    });
    expect(v.status).toBe(201);
    let s = await struktur();
    const p = s.bab.find((b) => b.id === bab)!.pelajaran[0]!;
    expect(p.isi.url).toBe('https://www.youtube-nocookie.com/embed/tUXqJ1xyqIk');
    expect(p.is_published).toBe(false);

    expect(
      (
        await buatPelajaran(bab, {
          judul: 'Video buruk',
          jenis: 'video',
          isi: { url: 'https://evil.example/x' },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await buatPelajaran(bab, {
          judul: 'Dokumen http',
          jenis: 'pdf',
          isi: { url: 'http://a.id/x.pdf' },
        })
      ).status,
    ).toBe(422);

    // Mengganti jenis ditolak.
    const ganti = await adm.json(`${A}/pelajaran/${v.id}`, {
      method: 'PUT',
      body: {
        judul: 'Video pengantar',
        jenis: 'bacaan',
        isi: { markdown: 'x' },
        version: p.version,
      },
    });
    expect(ganti.status).toBe(409);

    const b = await buatPelajaran(bab, {
      judul: 'Bacaan inti',
      jenis: 'bacaan',
      isi: { markdown: '# Isi' },
    });
    const d = await buatPelajaran(bab, {
      judul: 'Dokumen BPS',
      jenis: 'pdf',
      isi: { url: 'https://www.bps.go.id/id/publication', penerbit: 'BPS' },
      wajib: false,
    });
    s = await struktur();
    expect(s.bab.find((x) => x.id === bab)!.pelajaran.map((x) => x.urutan)).toEqual([1, 2, 3]);
    // Urutan: pindahkan dokumen ke depan.
    const urut = await adm.json(`${A}/bab/${bab}/pelajaran/urutan`, {
      method: 'PUT',
      body: { ids: [d.id, v.id, b.id] },
    });
    expect(urut.status).toBe(200);
    s = await struktur();
    expect(s.bab.find((x) => x.id === bab)!.pelajaran.map((x) => x.id)).toEqual([d.id, v.id, b.id]);
    expect(
      (await adm.json(`${A}/bab/${bab}/pelajaran/urutan`, { method: 'PUT', body: { ids: [d.id] } }))
        .status,
    ).toBe(422);
  });

  it('soal latihan: hanya untuk latihan, kunci valid, kunci tidak masuk audit', async () => {
    const bab = await buatBab('Bab latihan');
    const teks = await buatPelajaran(bab, {
      judul: 'Bacaan biasa',
      jenis: 'bacaan',
      isi: { markdown: 'x' },
    });
    const lat = await buatPelajaran(bab, {
      judul: 'Latihan satu',
      jenis: 'latihan',
      isi: { nilai_lulus: 50 },
    });
    const soal = {
      pertanyaan: 'Pencacahan seluruh populasi disebut...',
      opsi: [
        { id: 'A', text: 'Sensus' },
        { id: 'B', text: 'Survei' },
      ],
      kunci: 'A',
      pembahasan: 'Sensus mencacah semua.',
    };
    expect(
      (await adm.json(`${A}/pelajaran/${teks.id}/soal`, { method: 'POST', body: soal })).status,
    ).toBe(409);
    expect(
      (
        await adm.json(`${A}/pelajaran/${lat.id}/soal`, {
          method: 'POST',
          body: { ...soal, kunci: 'D' },
        })
      ).status,
    ).toBe(422);
    const baru = await adm.json<{ id: number }>(`${A}/pelajaran/${lat.id}/soal`, {
      method: 'POST',
      body: soal,
    });
    expect(baru.status).toBe(201);
    const daftar = await adm.json<{ soal: { id: number; kunci: string }[] }>(
      `${A}/pelajaran/${lat.id}/soal`,
    );
    expect(daftar.body.soal).toHaveLength(1);
    expect(daftar.body.soal[0]!.kunci).toBe('A');
    expect(
      (
        await adm.json(`${A}/soal-latihan/${baru.body.id}`, {
          method: 'PUT',
          body: { ...soal, kunci: 'B' },
        })
      ).status,
    ).toBe(200);

    const audit = await env.DB.prepare(
      "SELECT sesudah FROM audit_log WHERE entitas = 'soal_latihan' AND entitas_id = ? ORDER BY id",
    )
      .bind(String(baru.body.id))
      .all<{ sesudah: string }>();
    expect(audit.results.length).toBe(2);
    for (const a of audit.results) expect(a.sesudah).toContain('[disembunyikan]');

    expect((await adm.json(`${A}/soal-latihan/${baru.body.id}`, { method: 'DELETE' })).status).toBe(
      200,
    );
    expect((await adm.json(`${A}/soal-latihan/${baru.body.id}`, { method: 'DELETE' })).status).toBe(
      404,
    );
  });
});

describe('Draf dan terbit di sisi peserta, pratinjau, kesiapan, hapus, riwayat', () => {
  let bab = 0;
  let video = 0;
  let latihan = 0;
  let soalId = 0;

  it('draf tidak pernah tampil ke peserta dan terbit membuatnya tampil', async () => {
    bab = await buatBab('Bab draf lalu terbit');
    video = (
      await buatPelajaran(bab, {
        judul: 'Video bab terbit',
        jenis: 'video',
        isi: { url: 'https://www.youtube.com/watch?v=tUXqJ1xyqIk' },
        durasi_menit: 10,
      })
    ).id;
    latihan = (
      await buatPelajaran(bab, {
        judul: 'Latihan bab terbit',
        jenis: 'latihan',
        isi: { nilai_lulus: 50 },
      })
    ).id;
    soalId = (
      await adm.json<{ id: number }>(`${A}/pelajaran/${latihan}/soal`, {
        method: 'POST',
        body: {
          pertanyaan: 'Contoh pertanyaan latihan uji?',
          opsi: [
            { id: 'A', text: 'Benar' },
            { id: 'B', text: 'Salah' },
          ],
          kunci: 'A',
        },
      })
    ).body.id;

    const sebelum = await klien().json<{ bab: { id: number }[] }>(`/lms/kursus/${KURSUS}`);
    expect(sebelum.body.bab.find((b) => b.id === bab)).toBeUndefined();
    expect((await peserta.json(`/lms/pelajaran/${video}`)).status).toBe(404);

    // Bab terbit, pelajaran masih draf: bab ada tetapi kosong dan isi tetap tertutup.
    let s = await struktur();
    const b = s.bab.find((x) => x.id === bab)!;
    expect(
      (
        await adm.json(`${A}/bab/${bab}`, {
          method: 'PUT',
          body: { judul: 'Bab draf lalu terbit', is_published: true, version: b.version },
        })
      ).status,
    ).toBe(200);
    const tengah = await klien().json<{ bab: { id: number; pelajaran: unknown[] }[] }>(
      `/lms/kursus/${KURSUS}`,
    );
    expect(tengah.body.bab.find((x) => x.id === bab)?.pelajaran).toEqual([]);
    expect((await peserta.json(`/lms/pelajaran/${video}`)).status).toBe(404);

    // Terbitkan kedua pelajaran.
    s = await struktur();
    for (const p of s.bab.find((x) => x.id === bab)!.pelajaran) {
      const isi = p.jenis === 'video' ? { url: String(p.isi.url) } : { nilai_lulus: 50 };
      const r = await adm.json(`${A}/pelajaran/${p.id}`, {
        method: 'PUT',
        body: {
          judul: p.jenis === 'video' ? 'Video bab terbit' : 'Latihan bab terbit',
          jenis: p.jenis,
          isi,
          durasi_menit: p.jenis === 'video' ? 10 : 5,
          is_published: true,
          version: p.version,
        },
      });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    }
    const sesudah = await klien().json<{ bab: { id: number; pelajaran: { id: number }[] }[] }>(
      `/lms/kursus/${KURSUS}`,
    );
    expect(sesudah.body.bab.find((x) => x.id === bab)?.pelajaran.map((x) => x.id)).toEqual([
      video,
      latihan,
    ]);
    const isiPeserta = await peserta.json<{
      pelajaran: { isi: { url: string }; soal?: { kunci?: string }[] };
    }>(`/lms/pelajaran/${video}`);
    expect(isiPeserta.status).toBe(200);
    expect(isiPeserta.body.pelajaran.isi.url).toContain('youtube-nocookie.com');
    const lat = await peserta.json<{ pelajaran: { soal: Record<string, unknown>[] } }>(
      `/lms/pelajaran/${latihan}`,
    );
    expect(JSON.stringify(lat.body)).not.toContain('"kunci"');
    // Katalog menghitung hanya yang terbit.
    const kat = await klien().json<{ kursus: { id: string; jumlah_pelajaran: number }[] }>(
      '/lms/kursus',
    );
    expect(kat.body.kursus.find((k) => k.id === KURSUS)?.jumlah_pelajaran).toBe(2);
  });

  it('pratinjau admin mencakup draf, tanpa kunci, dan latihan tidak mencatat progres', async () => {
    const draf = await buatBab('Bab hanya draf');
    const pdraf = await buatPelajaran(draf, {
      judul: 'Bacaan draf',
      jenis: 'bacaan',
      isi: { markdown: '# Draf' },
    });
    const pr = await adm.json<{
      pelajaran: { isi: { markdown: string } };
      bab: unknown[];
    }>(`${A}/pelajaran/${pdraf.id}/pratinjau`);
    expect(pr.status).toBe(200);
    expect(pr.body.pelajaran.isi.markdown).toBe('# Draf');
    expect(pr.body.bab.length).toBeGreaterThan(0);
    expect((await peserta.json(`/lms/pelajaran/${pdraf.id}`)).status).toBe(404);

    const p2 = await adm.json<{ pelajaran: { soal: { id: number }[] } }>(
      `${A}/pelajaran/${latihan}/pratinjau`,
    );
    expect(JSON.stringify(p2.body)).not.toContain('"kunci"');
    const sebelum = await env.DB.prepare('SELECT COUNT(*) AS n FROM progres_pelajaran').first<{
      n: number;
    }>();
    const nilai = await adm.json<{ lulus: boolean; selesai: boolean }>(
      `${A}/pelajaran/${latihan}/pratinjau/latihan`,
      { method: 'POST', body: { jawaban: { [String(soalId)]: 'A' } } },
    );
    expect(nilai.status).toBe(200);
    expect(nilai.body.lulus).toBe(true);
    expect(nilai.body.selesai).toBe(false);
    const sesudah = await env.DB.prepare('SELECT COUNT(*) AS n FROM progres_pelajaran').first<{
      n: number;
    }>();
    expect(sesudah!.n).toBe(sebelum!.n);
  });

  it('kesiapan melaporkan masalah dan menjadi siap setelah diperbaiki', async () => {
    const k = await adm.json<{ siap: boolean; item: { tingkat: string; pesan: string }[] }>(
      `${A}/kursus/${KURSUS}/kesiapan`,
    );
    expect(k.status).toBe(200);
    // Bab draf kosong tidak menghalangi; bab terbit tanpa pelajaran terbit menghalangi.
    const kosongTerbit = await buatBab('Bab terbit kosong', { is_published: true });
    const r1 = await adm.json<{ siap: boolean; item: { pesan: string }[] }>(
      `${A}/kursus/${KURSUS}/kesiapan`,
    );
    expect(r1.body.siap).toBe(false);
    expect(r1.body.item.some((i) => i.pesan.includes('Bab terbit kosong'))).toBe(true);
    expect((await adm.json(`${A}/bab/${kosongTerbit}`, { method: 'DELETE' })).status).toBe(200);
    // Latihan terbit tanpa soal aktif.
    await adm.json(`${A}/soal-latihan/${soalId}`, {
      method: 'PUT',
      body: {
        pertanyaan: 'Contoh pertanyaan latihan uji?',
        opsi: [
          { id: 'A', text: 'Benar' },
          { id: 'B', text: 'Salah' },
        ],
        kunci: 'A',
        is_active: false,
      },
    });
    const r2 = await adm.json<{ siap: boolean; item: { pesan: string }[] }>(
      `${A}/kursus/${KURSUS}/kesiapan`,
    );
    expect(r2.body.item.some((i) => i.pesan.includes('tanpa soal aktif'))).toBe(true);
    await adm.json(`${A}/soal-latihan/${soalId}`, {
      method: 'PUT',
      body: {
        pertanyaan: 'Contoh pertanyaan latihan uji?',
        opsi: [
          { id: 'A', text: 'Benar' },
          { id: 'B', text: 'Salah' },
        ],
        kunci: 'A',
        is_active: true,
      },
    });
    const r3 = await adm.json<{ item: { pesan: string }[] }>(`${A}/kursus/${KURSUS}/kesiapan`);
    expect(r3.body.item.some((i) => i.pesan.includes('tanpa soal aktif'))).toBe(false);
  });

  it('pelajaran dengan progres tidak dapat dihapus; tanpa progres dapat', async () => {
    expect(
      (await peserta.json(`/lms/saya/progres/${video}`, { method: 'POST', body: {} })).status,
    ).toBe(200);
    expect((await adm.json(`${A}/pelajaran/${video}`, { method: 'DELETE' })).status).toBe(409);
    expect((await adm.json(`${A}/bab/${bab}`, { method: 'DELETE' })).status).toBe(409);

    const tmp = await buatBab('Bab sementara');
    const p = await buatPelajaran(tmp, {
      judul: 'Bacaan sementara',
      jenis: 'bacaan',
      isi: { markdown: 'x' },
    });
    expect((await adm.json(`${A}/pelajaran/${p.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await adm.json(`${A}/pelajaran/${p.id}`, { method: 'DELETE' })).status).toBe(404);
    const p2 = await buatPelajaran(tmp, {
      judul: 'Bacaan kedua',
      jenis: 'bacaan',
      isi: { markdown: 'y' },
    });
    expect((await adm.json(`${A}/bab/${tmp}`, { method: 'DELETE' })).status).toBe(200);
    const sisa = await env.DB.prepare('SELECT COUNT(*) AS n FROM pelajaran WHERE id = ?')
      .bind(p2.id)
      .first<{ n: number }>();
    expect(sisa!.n).toBe(0);
  });

  it('riwayat memuat perubahan kursus, termasuk entitas yang sudah dihapus', async () => {
    const r = await adm.json<{ riwayat: { aksi: string; entitas: string; aktor: string }[] }>(
      `${A}/kursus/${KURSUS}/riwayat`,
    );
    expect(r.status).toBe(200);
    const aksi = new Set(r.body.riwayat.map((x) => `${x.aksi}:${x.entitas}`));
    expect(aksi.has('buat:bab')).toBe(true);
    expect(aksi.has('ubah:bab')).toBe(true);
    expect(aksi.has('buat:pelajaran')).toBe(true);
    expect(aksi.has('hapus:pelajaran')).toBe(true);
    expect(aksi.has('urut:bab')).toBe(true);
    expect(r.body.riwayat[0]!.aktor).toBe('penyusun@uji.go.id');
    // Riwayat kursus lain tidak ikut.
    const lain = await adm.json<{ riwayat: unknown[] }>(`${A}/kursus/uji/riwayat`);
    expect(lain.body.riwayat.every((x) => (x as { entitas: string }).entitas !== 'pelajaran')).toBe(
      true,
    );
  });
});
