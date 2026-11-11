/**
 * Verifikasi ID token "Masuk dengan Google" (OIDC) di server.
 *
 * Mengapa Google dan bukan kata sandi: hash kata sandi yang aman (Argon2/PBKDF2 kuat) melampaui
 * batas CPU 10 ms Workers gratis. Verifikasi tanda tangan RS256 hanya butuh < 1 ms, tidak ada
 * kata sandi yang disimpan, dan verifikasi dua langkah ditangani akun Google (ADR-0003).
 */
import { HttpError } from '../lib/http.ts';

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUER = new Set(['accounts.google.com', 'https://accounts.google.com']);

interface Jwk extends JsonWebKey {
  kid: string;
}

let cacheJwks: { keys: Jwk[]; kedaluwarsa: number } | null = null;

async function ambilJwks(paksa = false): Promise<Jwk[]> {
  if (!paksa && cacheJwks && cacheJwks.kedaluwarsa > Date.now()) return cacheJwks.keys;
  const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok)
    throw new HttpError(
      503,
      'google_tidak_tersedia',
      'Layanan masuk Google sedang tidak dapat dihubungi. Coba lagi.',
    );
  const body = (await res.json()) as { keys: Jwk[] };
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('Cache-Control') ?? '')?.[1] ?? 3600);
  cacheJwks = { keys: body.keys, kedaluwarsa: Date.now() + Math.min(maxAge, 86400) * 1000 };
  return body.keys;
}

const b64urlDecode = (s: string): Uint8Array => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (ch) => ch.charCodeAt(0));
};

export interface KlaimGoogle {
  sub: string;
  email: string;
  nama: string;
}

const tolak = (): HttpError =>
  new HttpError(401, 'token_tidak_valid', 'Proses masuk gagal. Silakan coba lagi.');

export async function verifikasiIdToken(
  token: string,
  clientId: string,
  now = Date.now(),
): Promise<KlaimGoogle> {
  if (!clientId)
    throw new HttpError(503, 'google_belum_diatur', 'Fitur masuk belum diaktifkan oleh pengelola.');
  const bagian = token.split('.');
  if (bagian.length !== 3) throw tolak();
  const [h, p, s] = bagian as [string, string, string];
  let header: { alg?: string; kid?: string };
  let klaim: {
    iss?: string;
    aud?: string;
    exp?: number;
    iat?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(h)));
    klaim = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
  } catch {
    throw tolak();
  }
  if (header.alg !== 'RS256' || !header.kid) throw tolak();

  let jwk = (await ambilJwks()).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await ambilJwks(true)).find((k) => k.kid === header.kid); // rotasi kunci Google
  if (!jwk) throw tolak();

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const sah = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlDecode(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!sah) throw tolak();

  const detik = Math.floor(now / 1000);
  if (!klaim.iss || !ISSUER.has(klaim.iss)) throw tolak();
  if (klaim.aud !== clientId) throw tolak();
  if (!klaim.exp || klaim.exp < detik - 60) throw tolak();
  if (klaim.iat && klaim.iat > detik + 300) throw tolak();
  if (!klaim.sub || !klaim.email || klaim.email_verified !== true) throw tolak();
  return {
    sub: klaim.sub,
    email: klaim.email.toLowerCase(),
    nama: (klaim.name ?? klaim.email).slice(0, 120),
  };
}

/** Hanya untuk pengujian: mengosongkan cache JWKS. */
export const _resetJwksCache = (): void => {
  cacheJwks = null;
};
