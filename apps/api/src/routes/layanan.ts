/**
 * Layanan permohonan data PST (perbaikan K03).
 * Permohonan BENAR-BENAR disimpan, diberi nomor tiket, dapat dilacak pemohon, dan masuk kotak
 * masuk petugas PST di panel admin. Pesan "terkirim" hanya tampil setelah basis data mengonfirmasi.
 */
import { Hono } from 'hono';
import { CekPermohonanSchema, PermohonanSchema } from '@sikop/shared';
import type { AppEnv } from '../env.ts';
import { auditStmt } from '../lib/audit.ts';
import { kodeAcak } from '../lib/crypto.ts';
import { bacaBody, HttpError, tidakDitemukan } from '../lib/http.ts';
import { batasiLaju } from '../lib/middleware.ts';
import { bacaPengaturan } from '../lib/pengaturan.ts';

export const layanan = new Hono<AppEnv>();

/** Verifikasi Cloudflare Turnstile (anti-bot gratis). Dilewati bila rahasia belum diatur (lingkungan lokal). */
async function verifikasiTurnstile(
  secret: string | undefined,
  token: string,
  ip: string | undefined,
): Promise<boolean> {
  if (!secret) return true;
  if (!token) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

const tanggalWib = (): string =>
  new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '');

layanan.post('/permohonan', batasiLaju('permohonan'), async (c) => {
  const input = await bacaBody(c, PermohonanSchema);
  if (
    !(await verifikasiTurnstile(
      c.env.TURNSTILE_SECRET,
      input.turnstile_token,
      c.req.header('CF-Connecting-IP'),
    ))
  ) {
    throw new HttpError(
      422,
      'turnstile',
      'Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi.',
    );
  }
  const p = await bacaPengaturan(c.env.DB);
  const waktu = new Date().toISOString();
  // Nomor tiket acak (tidak berurutan) agar status permohonan orang lain tidak dapat ditebak.
  for (let percobaan = 0; percobaan < 3; percobaan++) {
    const tiket = `PST-${tanggalWib()}-${kodeAcak(5, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789')}`;
    try {
      const res = await c.env.DB.batch([
        c.env.DB.prepare(
          `INSERT INTO permohonan (tiket, nama, email, no_hp, instansi, kategori, pesan, setuju_privasi_at, privasi_versi)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        ).bind(
          tiket,
          input.nama,
          input.email,
          input.no_hp ?? null,
          input.instansi,
          input.kategori,
          input.pesan,
          waktu,
          p.privasi_versi ?? '1.0',
        ),
        await auditStmt(c, 'buat', 'permohonan', tiket, null, { kategori: input.kategori }),
      ]);
      if (!res[0]?.meta.changes) throw new Error('tidak tersimpan');
      return c.json({ tiket, status: 'baru', created_at: waktu }, 201);
    } catch (e) {
      if (!String(e).includes('UNIQUE')) throw e;
    }
  }
  throw new HttpError(503, 'tiket', 'Permohonan belum dapat disimpan. Silakan coba lagi.');
});

/** Pemohon mengecek status dengan nomor tiket + email (keduanya harus cocok). */
layanan.post('/permohonan/status', batasiLaju('cek-permohonan'), async (c) => {
  const { tiket, email } = await bacaBody(c, CekPermohonanSchema);
  const r = await c.env.DB.prepare(
    'SELECT tiket, kategori, status, tanggapan, created_at, updated_at FROM permohonan WHERE tiket = ? AND email = ?',
  )
    .bind(tiket, email)
    .first();
  if (!r) throw tidakDitemukan('Permohonan dengan nomor tiket dan email tersebut');
  return c.json({ permohonan: r });
});
