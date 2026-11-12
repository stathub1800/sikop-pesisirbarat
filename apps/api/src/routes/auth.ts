import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env.ts';
import { verifikasiIdToken } from '../auth/google.ts';
import { keluar, masuk } from '../auth/sesi.ts';
import { auditStmt } from '../lib/audit.ts';
import { bacaBody, tidakDitemukan } from '../lib/http.ts';
import { batasiLaju } from '../lib/middleware.ts';

export const auth = new Hono<AppEnv>();

auth.post('/google', batasiLaju('login'), async (c) => {
  const { credential } = await bacaBody(c, z.object({ credential: z.string().min(100).max(4096) }));
  const klaim = await verifikasiIdToken(credential, c.env.GOOGLE_CLIENT_ID);
  const akun = await masuk(c, klaim);
  c.set('akun', akun);
  await (
    await auditStmt(c, 'masuk', 'akun', akun.id, null, { email: akun.email, peran: akun.peran })
  ).run();
  return c.json({ akun });
});

/**
 * Login pengembang untuk pengujian lokal. Dua syarat sekaligus: ENVIRONMENT=development DAN DEV_LOGIN=aktif.
 * Konfigurasi produksi tidak memuat keduanya; CI memeriksa hal ini (scripts/cek-konfigurasi.mjs).
 */
auth.post('/dev', async (c) => {
  if (c.env.ENVIRONMENT !== 'development' || c.env.DEV_LOGIN !== 'aktif')
    throw tidakDitemukan('Halaman');
  const { email, nama } = await bacaBody(
    c,
    z.object({ email: z.string().email(), nama: z.string().min(1).max(120) }),
  );
  const akun = await masuk(c, { sub: `dev-${email}`, email: email.toLowerCase(), nama });
  return c.json({ akun });
});

auth.post('/keluar', async (c) => {
  await keluar(c);
  return c.json({ ok: true });
});

auth.get('/saya', async (c) => {
  const akun = c.get('akun');
  if (!akun) return c.json({ akun: null });
  const peserta = await c.env.DB.prepare(
    'SELECT kategori, nama, instansi, jabatan, status FROM peserta WHERE akun_id = ?',
  )
    .bind(akun.id)
    .first();
  return c.json({ akun, peserta });
});
