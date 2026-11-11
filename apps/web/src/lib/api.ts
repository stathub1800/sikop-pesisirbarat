/**
 * Klien API: timeout, retry dengan backoff untuk GET (idempoten), header CSRF untuk tulis,
 * dan galat terstruktur yang membawa rincian per kolom untuk ditampilkan di form.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly kode: string,
    message: string,
    readonly rincian: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

const BASE = '/api/v1';
const TIMEOUT_MS = 15_000;

async function sekali<T>(path: string, init: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, signal: ctrl.signal, credentials: 'same-origin' });
  } catch {
    throw new ApiError(
      0,
      'jaringan',
      'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.',
    );
  } finally {
    clearTimeout(t);
  }
  const ct = res.headers.get('Content-Type') ?? '';
  const body = ct.includes('application/json') ? ((await res.json()) as unknown) : null;
  if (!res.ok) {
    const g = (
      body as {
        galat?: { kode?: string; pesan?: string; rincian?: Record<string, string[]> };
      } | null
    )?.galat;
    throw new ApiError(
      res.status,
      g?.kode ?? 'http',
      g?.pesan ?? `Permintaan gagal (${res.status}).`,
      g?.rincian ?? {},
    );
  }
  return body as T;
}

const jeda = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** GET dengan retry eksponensial + jitter hanya untuk galat jaringan/5xx. */
export async function get<T>(path: string): Promise<T> {
  let terakhir: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await sekali<T>(path, { method: 'GET' });
    } catch (e) {
      terakhir = e;
      if (!(e instanceof ApiError) || (e.status !== 0 && e.status < 500)) throw e;
      await jeda(300 * 2 ** i + Math.random() * 200);
    }
  }
  throw terakhir;
}

export function kirim<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: unknown = {},
): Promise<T> {
  return sekali<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-SIKOP': '1' },
    body: JSON.stringify(body),
  });
}

/** Membangun query string dari objek, melewati nilai kosong. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}
