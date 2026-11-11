/**
 * Penanganan galat HTTP yang seragam.
 * Pesan ke pengguna selalu generik dan berbahasa Indonesia; detail teknis hanya di log (Bagian 5.2 #13).
 */
import type { Context } from 'hono';
import type { ZodType } from 'zod';
import type { AppEnv } from '../env.ts';

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429 | 500 | 503,
    readonly kode: string,
    message: string,
    readonly rincian?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export const tidakDitemukan = (apa = 'Data'): HttpError =>
  new HttpError(404, 'tidak_ditemukan', `${apa} tidak ditemukan.`);
export const dilarang = (): HttpError =>
  new HttpError(403, 'dilarang', 'Anda tidak memiliki akses untuk tindakan ini.');
export const perluLogin = (): HttpError =>
  new HttpError(401, 'perlu_login', 'Silakan masuk terlebih dahulu.');
export const konflikVersi = (): HttpError =>
  new HttpError(
    409,
    'konflik_versi',
    'Data telah diubah orang lain. Muat ulang halaman, lalu ulangi perubahan Anda.',
  );

/** Memvalidasi body JSON dengan skema Zod; galat dikembalikan per kolom agar form dapat menandainya. */
export async function bacaBody<T>(c: Context<AppEnv>, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, 'json_tidak_valid', 'Format permintaan tidak valid.');
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const rincian: Record<string, string[]> = {};
    for (const i of r.error.issues) {
      const k = i.path.join('.') || '_';
      (rincian[k] ??= []).push(i.message);
    }
    throw new HttpError(422, 'validasi', 'Periksa kembali isian yang ditandai.', rincian);
  }
  return r.data;
}

/** Bilangan bulat positif dari query string dengan batas atas. */
export function angkaQuery(v: string | undefined, bawaan: number, maks: number): number {
  const n = Number.parseInt(v ?? '', 10);
  if (!Number.isFinite(n) || n < 1) return bawaan;
  return Math.min(n, maks);
}

export const sekarang = (): string => new Date().toISOString();
