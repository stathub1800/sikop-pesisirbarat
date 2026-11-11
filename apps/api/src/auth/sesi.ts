/**
 * Sesi berbasis cookie HttpOnly. Token asli tidak pernah disimpan; basis data hanya menyimpan
 * SHA-256-nya, sehingga kebocoran basis data tidak memberi akses ke sesi aktif.
 */
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Peran } from '@sikop/shared';
import type { AkunSesi, AppEnv } from '../env.ts';
import { sha256Hex, tokenAcak } from '../lib/crypto.ts';
import { dilarang, perluLogin } from '../lib/http.ts';
import type { KlaimGoogle } from './google.ts';

export const NAMA_COOKIE = '__Host-sikop_sesi';
const NAMA_COOKIE_DEV = 'sikop_sesi';
const DURASI_JAM_ADMIN = 8;
const DURASI_JAM_PESERTA = 24 * 7;

const namaCookie = (c: Context<AppEnv>): string =>
  c.env.ENVIRONMENT === 'development' ? NAMA_COOKIE_DEV : NAMA_COOKIE;

/** Membuat/menautkan akun dari klaim Google, lalu membuat sesi baru. */
export async function masuk(c: Context<AppEnv>, klaim: KlaimGoogle): Promise<AkunSesi> {
  const db = c.env.DB;
  const ada = await db
    .prepare('SELECT id FROM akun WHERE google_sub = ?')
    .bind(klaim.sub)
    .first<{ id: string }>();
  const akunId = ada?.id ?? crypto.randomUUID();
  if (ada) {
    await db
      .prepare(
        "UPDATE akun SET email = ?, nama = ?, last_login = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
      )
      .bind(klaim.email, klaim.nama, akunId)
      .run();
  } else {
    await db
      .prepare(
        "INSERT INTO akun (id, google_sub, email, nama, last_login) VALUES (?,?,?,?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
      )
      .bind(akunId, klaim.sub, klaim.email, klaim.nama)
      .run();
  }

  // Bootstrap superadmin pertama dari variabel rahasia, agar tidak perlu SQL manual.
  const bootstrap = (c.env.SUPERADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (bootstrap.includes(klaim.email)) {
    await db
      .prepare(
        "INSERT OR IGNORE INTO admin_peran (email, nama, peran, created_by) VALUES (?, ?, 'superadmin', 'bootstrap')",
      )
      .bind(klaim.email, klaim.nama)
      .run();
  }

  const peran = await peranAktif(db, klaim.email);
  const token = tokenAcak();
  const jam = peran ? DURASI_JAM_ADMIN : DURASI_JAM_PESERTA;
  const kedaluwarsa = new Date(Date.now() + jam * 3600_000);
  // Rotasi sesi: sesi lama akun ini dihapus agar tidak menumpuk (session fixation).
  await db.batch([
    db
      .prepare('DELETE FROM sesi WHERE akun_id = ? AND expires_at < ?')
      .bind(akunId, new Date().toISOString()),
    db
      .prepare('INSERT INTO sesi (token_hash, akun_id, expires_at, ua) VALUES (?,?,?,?)')
      .bind(
        await sha256Hex(token),
        akunId,
        kedaluwarsa.toISOString(),
        (c.req.header('User-Agent') ?? '').slice(0, 200),
      ),
  ]);
  setCookie(c, namaCookie(c), token, {
    httpOnly: true,
    secure: c.env.ENVIRONMENT !== 'development',
    sameSite: 'Lax',
    path: '/',
    expires: kedaluwarsa,
  });
  return { id: akunId, email: klaim.email, nama: klaim.nama, peran };
}

async function peranAktif(db: D1Database, email: string): Promise<Peran | null> {
  const r = await db
    .prepare('SELECT peran FROM admin_peran WHERE email = ? AND is_active = 1')
    .bind(email)
    .first<{ peran: Peran }>();
  return r?.peran ?? null;
}

export async function keluar(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, namaCookie(c));
  if (token)
    await c.env.DB.prepare('DELETE FROM sesi WHERE token_hash = ?')
      .bind(await sha256Hex(token))
      .run();
  deleteCookie(c, namaCookie(c), { path: '/', secure: c.env.ENVIRONMENT !== 'development' });
}

/** Middleware: memuat akun dari cookie bila ada. Peran dibaca ulang tiap permintaan agar pencabutan berlaku seketika. */
export const muatSesi: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('akun', null);
  const token = getCookie(c, namaCookie(c));
  if (token && token.length >= 40 && token.length <= 64) {
    const row = await c.env.DB.prepare(
      `SELECT a.id, a.email, a.nama, ap.peran
         FROM sesi s JOIN akun a ON a.id = s.akun_id
         LEFT JOIN admin_peran ap ON ap.email = a.email AND ap.is_active = 1
        WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
      .bind(await sha256Hex(token), new Date().toISOString())
      .first<AkunSesi>();
    if (row)
      c.set('akun', { id: row.id, email: row.email, nama: row.nama, peran: row.peran ?? null });
  }
  await next();
};

export const wajibLogin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('akun')) throw perluLogin();
  await next();
};

/** Otorisasi per peran, diperiksa di server untuk setiap permintaan (least privilege). Superadmin selalu lolos. */
export const wajibPeran =
  (...peran: Peran[]): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const akun = c.get('akun');
    if (!akun) throw perluLogin();
    if (!akun.peran || (akun.peran !== 'superadmin' && !peran.includes(akun.peran)))
      throw dilarang();
    await next();
  };
