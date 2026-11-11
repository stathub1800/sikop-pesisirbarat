import { env } from 'cloudflare:test';
import { exports as workerExports } from 'cloudflare:workers';

/** Handler fetch Worker utama (tipe Exports dari runtime belum memuat default export). */
const worker = (
  workerExports as unknown as { default: { fetch: (r: Request) => Promise<Response> } }
).default;

export const BASE = 'http://localhost/api/v1';
let ipCounter = 1;

export interface Klien {
  cookie: string;
  ip: string;
  req: (
    path: string,
    init?: { method?: string; body?: unknown; header?: Record<string, string> },
  ) => Promise<Response>;
  json: <T = Record<string, unknown>>(
    path: string,
    init?: { method?: string; body?: unknown; header?: Record<string, string> },
  ) => Promise<{ status: number; body: T }>;
}

/** Klien HTTP sederhana dengan cookie jar dan IP unik (agar pembatas laju antar-tes tidak saling memengaruhi). */
export function klien(): Klien {
  const k: Klien = {
    cookie: '',
    ip: `10.0.0.${ipCounter++}`,
    async req(path, init = {}) {
      const headers: Record<string, string> = { 'CF-Connecting-IP': k.ip, ...init.header };
      if (k.cookie) headers.Cookie = k.cookie;
      if (init.body !== undefined) headers['Content-Type'] = 'application/json';
      if (init.method && init.method !== 'GET' && !('X-SIKOP' in headers)) headers['X-SIKOP'] = '1';
      const res = await worker.fetch(
        new Request(`${BASE}${path}`, {
          method: init.method ?? 'GET',
          headers,
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        }),
      );
      const set = res.headers.get('Set-Cookie');
      if (set) {
        const m = /^([^=]+)=([^;]*)/.exec(set);
        if (m) k.cookie = m[2] ? `${m[1]}=${m[2]}` : '';
      }
      return res;
    },
    async json(path, init) {
      const res = await k.req(path, init);
      return { status: res.status, body: (await res.json()) as never };
    },
  };
  return k;
}

/** Masuk sebagai pengguna uji melalui login pengembang. */
export async function masukSebagai(email: string, nama = 'Pengguna Uji'): Promise<Klien> {
  const k = klien();
  const r = await k.json('/auth/dev', { method: 'POST', body: { email, nama } });
  if (r.status !== 200) throw new Error(`login gagal ${r.status}`);
  return k;
}

/** Mendaftarkan peran admin langsung di basis data (setara provisioning oleh superadmin). */
export async function jadikanAdmin(email: string, peran: string): Promise<Klien> {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO admin_peran (email, nama, peran, created_by) VALUES (?, 'Admin Uji', ?, 'uji')",
  )
    .bind(email, peran)
    .run();
  return masukSebagai(email, 'Admin Uji');
}

let nipUrut = 100;
/** NIP sintetis yang lolos validasi struktur. */
export const nipUji = (): string => `19900101201501${'1'}${String(nipUrut++).padStart(3, '0')}`;

export async function pesertaBaru(email: string): Promise<Klien> {
  const k = await masukSebagai(email, 'Peserta Uji');
  const r = await k.json('/lms/saya/profil', {
    method: 'POST',
    body: {
      nama: 'Peserta Uji',
      nip: nipUji(),
      instansi: 'Dinas Uji',
      jabatan: 'Statistisi',
      setuju_privasi: true,
    },
  });
  if (r.status !== 201) throw new Error(`profil gagal ${r.status} ${JSON.stringify(r.body)}`);
  return k;
}

/** Kunci jawaban dibaca langsung dari D1 (mensimulasikan peserta yang benar-benar menguasai materi). */
export async function kunciBenar(soalIds: number[]): Promise<Record<string, string>> {
  const { results } = await env.DB.prepare(
    `SELECT id, kunci FROM soal WHERE id IN (${soalIds.map(() => '?').join(',')})`,
  )
    .bind(...soalIds)
    .all<{ id: number; kunci: string }>();
  return Object.fromEntries(results.map((r) => [String(r.id), r.kunci]));
}

export interface UjianPayload {
  id: string;
  batas_at: string;
  soal: { id: number; pertanyaan: string; opsi: { id: string; text: string }[] }[];
}

/** Menjalankan satu ujian sampai selesai dengan jawaban benar/salah. */
export async function kerjakan(
  k: Klien,
  body: Record<string, unknown>,
  benar: boolean,
): Promise<Record<string, unknown>> {
  const m = await k.json<UjianPayload>('/lms/ujian', { method: 'POST', body });
  if (m.status !== 200) throw new Error(`mulai gagal ${m.status} ${JSON.stringify(m.body)}`);
  const kunci = await kunciBenar(m.body.soal.map((s) => s.id));
  const jawaban = Object.fromEntries(
    Object.entries(kunci).map(([id, kc]) => [id, benar ? kc : kc === 'A' ? 'B' : 'A']),
  );
  const r = await k.json(`/lms/ujian/${m.body.id}/serahkan`, { method: 'POST', body: { jawaban } });
  return r.body;
}
