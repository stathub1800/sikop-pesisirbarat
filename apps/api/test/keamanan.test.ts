/**
 * Uji regresi untuk temuan keamanan laporan pengujian (K01, K02, T09, S06) dan kontrol tambahan.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { app } from '../src/index.ts';
import {
  jadikanAdmin,
  kerjakan,
  klien,
  kunciBenar,
  masukSebagai,
  pesertaBaru,
  type UjianPayload,
} from './helpers.ts';

describe('K01: kunci jawaban tidak pernah terkirim ke browser', () => {
  it('katalog dan detail kursus publik tidak memuat soal atau kunci', async () => {
    const k = klien();
    for (const path of ['/lms/kursus', '/lms/kursus/uji']) {
      const teks = await (await k.req(path)).text();
      expect(teks).not.toMatch(/"kunci"|"pembahasan"|"pertanyaan"/);
    }
  });

  it('soal ujian dikirim tanpa kunci/pembahasan dan urutan opsi diacak', async () => {
    const k = await pesertaBaru('k01@uji.id');
    const res = await k.req('/lms/ujian', {
      method: 'POST',
      body: { kursus_id: 'uji', jenis: 'pre', modul_id: 901 },
    });
    expect(res.status).toBe(200);
    const teks = await res.text();
    expect(teks).not.toMatch(/"kunci"|"pembahasan"|answerHash|correct/i);
    const body = JSON.parse(teks) as UjianPayload;
    expect(body.soal).toHaveLength(2);
    expect(body.soal[0]!.opsi.map((o) => o.id).sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('pengacakan opsi bervariasi antar percobaan (menetralkan bias kunci)', async () => {
    const urutan = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const k = await pesertaBaru(`acak${i}@uji.id`);
      const r = await k.json<UjianPayload>('/lms/ujian', {
        method: 'POST',
        body: { kursus_id: 'uji', jenis: 'pre', modul_id: 901 },
      });
      urutan.add(r.body.soal.map((s) => s.opsi.map((o) => o.id).join('')).join('|'));
    }
    expect(urutan.size).toBeGreaterThan(1);
  });

  it('pembahasan dibuka hanya setelah post-test modul lulus, dan tidak pernah untuk ujian akhir', async () => {
    const k = await pesertaBaru('pembahasan@uji.id');
    const pre = (await kerjakan(k, { kursus_id: 'uji', jenis: 'pre', modul_id: 901 }, false)) as {
      percobaan: { id: string };
    };
    expect(
      (await k.json<{ pembahasan: unknown }>(`/lms/ujian/${pre.percobaan.id}`)).body.pembahasan,
    ).toBeNull();
    await kerjakan(k, { kursus_id: 'uji', jenis: 'post', modul_id: 901 }, true);
    const sesudah = await k.json<{ pembahasan: { kunci: string }[] }>(
      `/lms/ujian/${pre.percobaan.id}`,
    );
    expect(sesudah.body.pembahasan).toHaveLength(2);
    expect(sesudah.body.pembahasan[0]!.kunci).toMatch(/^[A-D]$/);
  });
});

describe('K02: penilaian dan sertifikat hanya di server', () => {
  it('ujian butuh login dan profil peserta', async () => {
    expect(
      (
        await klien().req('/lms/ujian', {
          method: 'POST',
          body: { kursus_id: 'uji', jenis: 'pre', modul_id: 901 },
        })
      ).status,
    ).toBe(401);
    const tanpaProfil = await masukSebagai('tanpaprofil@uji.id');
    expect(
      (
        await tanpaProfil.req('/lms/ujian', {
          method: 'POST',
          body: { kursus_id: 'uji', jenis: 'pre', modul_id: 901 },
        })
      ).status,
    ).toBe(403);
  });

  it('tidak ada endpoint untuk menulis nilai atau sertifikat dari browser', async () => {
    const k = await pesertaBaru('tulisnilai@uji.id');
    for (const [path, method] of [
      ['/lms/sertifikat', 'POST'],
      ['/lms/ujian/x/nilai', 'PUT'],
      ['/lms/saya/sertifikat', 'POST'],
    ] as const) {
      expect((await k.req(path, { method, body: { nilai: 100 } })).status).toBe(404);
    }
  });

  it('jawaban di luar soal percobaan diabaikan; percobaan orang lain tidak dapat diakses', async () => {
    const a = await pesertaBaru('pemilik@uji.id');
    const b = await pesertaBaru('penyusup@uji.id');
    const m = await a.json<UjianPayload>('/lms/ujian', {
      method: 'POST',
      body: { kursus_id: 'uji', jenis: 'pre', modul_id: 902 },
    });
    expect(
      (await b.req(`/lms/ujian/${m.body.id}/serahkan`, { method: 'POST', body: { jawaban: {} } }))
        .status,
    ).toBe(404);
    expect((await b.req(`/lms/ujian/${m.body.id}`)).status).toBe(404);
    const r = await a.json<{ percobaan: { benar: number; total: number } }>(
      `/lms/ujian/${m.body.id}/serahkan`,
      { method: 'POST', body: { jawaban: { '9001': 'A', '1': 'A' } } },
    );
    expect(r.body.percobaan.total).toBe(2);
  });

  it('batas waktu ditegakkan server: penyerahan terlambat memakai jawaban tersimpan', async () => {
    const k = await pesertaBaru('terlambat@uji.id');
    const m = await k.json<UjianPayload>('/lms/ujian', {
      method: 'POST',
      body: { kursus_id: 'uji', jenis: 'pre', modul_id: 901 },
    });
    await env.DB.prepare('UPDATE percobaan SET batas_at = ? WHERE id = ?')
      .bind(new Date(Date.now() - 120_000).toISOString(), m.body.id)
      .run();
    expect(
      (await k.req(`/lms/ujian/${m.body.id}/jawaban`, { method: 'PUT', body: { jawaban: {} } }))
        .status,
    ).toBe(410);
    const kunci = await kunciBenar(m.body.soal.map((s) => s.id));
    const r = await k.json<{ percobaan: { benar: number } }>(`/lms/ujian/${m.body.id}/serahkan`, {
      method: 'POST',
      body: { jawaban: kunci },
    });
    expect(r.body.percobaan.benar).toBe(0);
  });

  it('penyerahan ganda idempoten', async () => {
    const k = await pesertaBaru('ganda@uji.id');
    const m = await k.json<UjianPayload>('/lms/ujian', {
      method: 'POST',
      body: { kursus_id: 'uji', jenis: 'pre', modul_id: 901 },
    });
    const kunci = await kunciBenar(m.body.soal.map((s) => s.id));
    const r1 = await k.json<{ percobaan: { nilai: number } }>(`/lms/ujian/${m.body.id}/serahkan`, {
      method: 'POST',
      body: { jawaban: kunci },
    });
    const r2 = await k.json<{ percobaan: { nilai: number } }>(`/lms/ujian/${m.body.id}/serahkan`, {
      method: 'POST',
      body: { jawaban: {} },
    });
    expect(r1.body.percobaan.nilai).toBe(100);
    expect(r2.body.percobaan.nilai).toBe(100);
  });

  it('aturan urutan: post-test butuh pre-test; pre-test sekali; ujian akhir butuh semua modul lulus', async () => {
    const k = await pesertaBaru('aturan@uji.id');
    expect(
      (
        await k.req('/lms/ujian', {
          method: 'POST',
          body: { kursus_id: 'uji', jenis: 'post', modul_id: 901 },
        })
      ).status,
    ).toBe(409);
    await kerjakan(k, { kursus_id: 'uji', jenis: 'pre', modul_id: 901 }, true);
    expect(
      (
        await k.req('/lms/ujian', {
          method: 'POST',
          body: { kursus_id: 'uji', jenis: 'pre', modul_id: 901 },
        })
      ).status,
    ).toBe(409);
    expect(
      (await k.req('/lms/ujian', { method: 'POST', body: { kursus_id: 'uji', jenis: 'akhir' } }))
        .status,
    ).toBe(409);
    expect(
      (
        await k.req('/lms/ujian', {
          method: 'POST',
          body: { kursus_id: 'uji', jenis: 'pre', modul_id: 909 },
        })
      ).status,
    ).toBe(404);
  });
});

describe('T09: otorisasi diperiksa di server per peran', () => {
  it('tanpa login 401, peserta 403', async () => {
    expect((await klien().req('/admin/dasbor')).status).toBe(401);
    const p = await pesertaBaru('bukanadmin@uji.id');
    for (const path of [
      '/admin/dasbor',
      '/admin/sekolah',
      '/admin/lms/soal',
      '/admin/permohonan',
      '/admin/audit',
      '/admin/pengguna',
    ]) {
      expect((await p.req(path)).status, path).toBe(403);
    }
  });

  it('pemisahan tugas: tiap peran hanya domainnya', async () => {
    const editor = await jadikanAdmin('editor@uji.go.id', 'editor_data');
    const pst = await jadikanAdmin('pst@uji.go.id', 'petugas_pst');
    const lmsAdm = await jadikanAdmin('lms@uji.go.id', 'pengelola_lms');
    expect((await editor.req('/admin/sekolah')).status).toBe(200);
    expect((await editor.req('/admin/lms/soal')).status).toBe(403);
    expect((await editor.req('/admin/permohonan')).status).toBe(403);
    expect((await pst.req('/admin/permohonan')).status).toBe(200);
    expect((await pst.req('/admin/sekolah')).status).toBe(403);
    expect((await lmsAdm.req('/admin/lms/soal?kursus=uji')).status).toBe(200);
    expect((await lmsAdm.req('/admin/audit')).status).toBe(403);
    expect(
      (
        await editor.req('/admin/pengaturan', {
          method: 'PUT',
          body: {
            sertifikat_aktif: '1',
            penandatangan_nama: 'X Y',
            penandatangan_jabatan: 'Kepala',
          },
        })
      ).status,
    ).toBe(403);
  });

  it('superadmin bootstrap dari variabel lingkungan dan tidak dapat menurunkan diri sendiri', async () => {
    const s = await masukSebagai('super@uji.id', 'Super');
    expect((await s.req('/admin/audit')).status).toBe(200);
    const r = await s.json('/admin/pengguna', {
      method: 'PUT',
      body: { email: 'super@uji.id', nama: 'Super', peran: 'editor_data', is_active: true },
    });
    expect(r.status).toBe(422);
  });

  it('pencabutan peran berlaku seketika', async () => {
    const s = await masukSebagai('super@uji.id', 'Super');
    const target = await jadikanAdmin('dicabut@uji.go.id', 'editor_data');
    expect((await target.req('/admin/sekolah')).status).toBe(200);
    const r = await s.json('/admin/pengguna', {
      method: 'PUT',
      body: {
        email: 'dicabut@uji.go.id',
        nama: 'Admin Dicabut',
        peran: 'editor_data',
        is_active: false,
      },
    });
    expect(r.status).toBe(200);
    expect((await target.req('/admin/sekolah')).status).toBe(401);
  });
});

describe('Kontrol keamanan umum', () => {
  it('CSRF: tulis tanpa header X-SIKOP atau dari origin asing ditolak', async () => {
    const k = klien();
    const body = {
      nama: 'Budi',
      email: 'b@c.id',
      kategori: 'lainnya',
      pesan: 'Pesan yang cukup panjang untuk lolos.',
      setuju_privasi: true,
    };
    expect(
      (await k.req('/layanan/permohonan', { method: 'POST', body, header: { 'X-SIKOP': '0' } }))
        .status,
    ).toBe(403);
    expect(
      (
        await k.req('/layanan/permohonan', {
          method: 'POST',
          body,
          header: { Origin: 'https://jahat.example' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await k.req('/layanan/permohonan', {
          method: 'POST',
          body,
          header: { Origin: 'http://localhost:5173' },
        })
      ).status,
    ).toBe(201);
  });

  it('login pengembang mati di lingkungan produksi', async () => {
    const res = await app.request(
      '/api/v1/auth/dev',
      {
        method: 'POST',
        headers: { 'X-SIKOP': '1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.id', nama: 'A' }),
      },
      { ...env, ENVIRONMENT: 'production' },
    );
    expect(res.status).toBe(404);
  });

  it('token Google palsu ditolak', async () => {
    const r = await klien().json('/auth/google', {
      method: 'POST',
      body: { credential: `${'a'.repeat(60)}.${'b'.repeat(60)}.${'c'.repeat(60)}` },
    });
    expect(r.status).toBe(401);
  });

  it('audit log tidak dapat diubah atau dihapus, bahkan lewat SQL langsung', async () => {
    await env.DB.prepare(
      "INSERT INTO audit_log (aktor, aksi, entitas) VALUES ('uji', 'uji', 'uji')",
    ).run();
    await expect(env.DB.prepare("UPDATE audit_log SET aktor = 'palsu'").run()).rejects.toThrow(
      /tidak dapat diubah/,
    );
    await expect(env.DB.prepare('DELETE FROM audit_log').run()).rejects.toThrow(
      /tidak dapat dihapus/,
    );
  });

  it('header keamanan dan pesan galat generik', async () => {
    const res = await klien().req('/tidak-ada');
    expect(res.status).toBe(404);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
  });

  it('injeksi SQL pada pencarian diperlakukan sebagai teks', async () => {
    const r = await klien().json<{ total: number }>(
      `/sekolah?q=${encodeURIComponent("' OR 1=1 --")}`,
    );
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(0);
    const pct = await klien().json<{ total: number }>('/sekolah?q=%25');
    expect(pct.body.total).toBe(0);
  });

  it('pembatas laju menolak permintaan ke-11 dalam satu menit', async () => {
    const k = klien();
    const kode: number[] = [];
    for (let i = 0; i < 11; i++) kode.push((await k.req('/sertifikat/AAAAAAAAAA')).status);
    expect(kode.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(kode[10]).toBe(429);
  });
});
