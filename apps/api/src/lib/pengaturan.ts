import { PENGATURAN_PUBLIK, type KunciPengaturan } from '@sikop/shared';

export type Pengaturan = Partial<Record<KunciPengaturan, string>>;

export async function bacaPengaturan(db: D1Database): Promise<Pengaturan> {
  const { results } = await db
    .prepare('SELECT kunci, nilai FROM pengaturan')
    .all<{ kunci: KunciPengaturan; nilai: string }>();
  return Object.fromEntries(results.map((r) => [r.kunci, r.nilai]));
}

/** Hanya kunci publik; kunci internal (penandatangan, sakelar sertifikat) tidak pernah dikirim ke pengunjung. */
export function pengaturanPublik(p: Pengaturan): Pengaturan {
  return Object.fromEntries(PENGATURAN_PUBLIK.map((k) => [k, p[k] ?? '']));
}
