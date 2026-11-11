/**
 * Audit trail: siapa, apa, kapan, dari mana, nilai sebelum dan sesudah.
 * Tabel audit_log dilindungi trigger sehingga tidak dapat diubah atau dihapus.
 * Fungsi mengembalikan prepared statement agar dapat digabung dalam satu batch atomik
 * bersama perubahan datanya: perubahan dan jejaknya tercatat bersama atau tidak sama sekali.
 */
import type { Context } from 'hono';
import type { AppEnv } from '../env.ts';
import { hashIp } from './crypto.ts';

/** Kolom yang tidak boleh masuk audit karena rahasia. */
const KOLOM_RAHASIA = new Set(['token_hash', 'kunci']);

function bersihkan(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = JSON.stringify(v, (k, val: unknown) =>
    KOLOM_RAHASIA.has(k) ? '[disembunyikan]' : val,
  );
  return s.length > 20_000 ? s.slice(0, 20_000) : s;
}

export async function auditStmt(
  c: Context<AppEnv>,
  aksi: string,
  entitas: string,
  entitasId: string | number | null,
  sebelum: unknown,
  sesudah: unknown,
): Promise<D1PreparedStatement> {
  const akun = c.get('akun');
  const ip = await hashIp(c.req.header('CF-Connecting-IP'), c.env.IP_SALT);
  return c.env.DB.prepare(
    'INSERT INTO audit_log (aktor, peran, aksi, entitas, entitas_id, sebelum, sesudah, request_id, ip_hash) VALUES (?,?,?,?,?,?,?,?,?)',
  ).bind(
    akun?.email ?? 'publik',
    akun?.peran ?? null,
    aksi,
    entitas,
    entitasId === null ? null : String(entitasId),
    bersihkan(sebelum),
    bersihkan(sesudah),
    c.get('requestId'),
    ip,
  );
}
