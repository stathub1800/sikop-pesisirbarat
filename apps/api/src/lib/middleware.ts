import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env.ts';
import { HttpError } from './http.ts';

/** ID permintaan + log terstruktur JSON (tanpa data pribadi) untuk penelusuran insiden. */
export const logPermintaan: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = c.req.header('CF-Ray') ?? crypto.randomUUID();
  c.set('requestId', id);
  const mulai = Date.now();
  await next();
  c.header('X-Request-Id', id);
  console.info(
    JSON.stringify({
      level: c.res.status >= 500 ? 'ERROR' : c.res.status >= 400 ? 'WARN' : 'INFO',
      request_id: id,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      ms: Date.now() - mulai,
      peran: c.get('akun')?.peran ?? (c.get('akun') ? 'peserta' : 'publik'),
    }),
  );
};

/** Header keamanan untuk respons API (JSON). Header halaman HTML diatur di Pages (_headers). */
export const headerKeamanan: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
};

const METODE_TULIS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Perlindungan CSRF berlapis untuk sesi cookie:
 * 1. Cookie SameSite=Lax.
 * 2. Header khusus X-SIKOP wajib ada: browser tidak dapat mengirim header khusus lintas situs tanpa
 *    preflight CORS, dan API ini tidak membuka CORS.
 * 3. Bila header Origin ada, harus termasuk daftar origin yang sah.
 */
export const lindungiCsrf: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (METODE_TULIS.has(c.req.method)) {
    if (c.req.header('X-SIKOP') !== '1') throw new HttpError(403, 'csrf', 'Permintaan ditolak.');
    const origin = c.req.header('Origin');
    if (origin) {
      const sah = c.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
      if (!sah.includes(origin)) throw new HttpError(403, 'csrf', 'Permintaan ditolak.');
    }
  }
  await next();
};

/** Pembatas laju per IP per kelompok endpoint. Bila binding tidak ada (mis. pengujian), dilewati. */
export const batasiLaju =
  (kelompok: string): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const rl = c.env.RL_TULIS;
    if (rl) {
      const ip = c.req.header('CF-Connecting-IP') ?? 'tanpa-ip';
      const { success } = await rl.limit({ key: `${kelompok}:${ip}` });
      if (!success)
        throw new HttpError(
          429,
          'terlalu_sering',
          'Terlalu banyak permintaan. Tunggu sebentar, lalu coba lagi.',
        );
    }
    await next();
  };

/** Cache browser untuk data publik yang jarang berubah. */
export const cachePublik =
  (detik: number): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    await next();
    if (c.res.status === 200) c.header('Cache-Control', `public, max-age=${detik}`);
  };
