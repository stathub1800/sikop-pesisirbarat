/** Admin: dasbor, pengguna admin, audit log. */
import { Hono } from 'hono';
import { AdminUserSchema, PERAN } from '@sikop/shared';
import type { AppEnv } from '../../env.ts';
import { wajibPeran } from '../../auth/sesi.ts';
import { auditStmt } from '../../lib/audit.ts';
import { angkaQuery, bacaBody, HttpError } from '../../lib/http.ts';
import { bacaPengaturan } from '../../lib/pengaturan.ts';

export const adminSistem = new Hono<AppEnv>();

/** Dasbor: angka hanya dikirim sesuai peran pembaca. */
adminSistem.get('/dasbor', wajibPeran(...PERAN), async (c) => {
  const db = c.env.DB;
  const peran = c.get('akun')!.peran!;
  const boleh = (p: string): boolean => peran === 'superadmin' || peran === p;
  const [sek, koord, perm, pes, sert, ujian] = await db.batch([
    db.prepare('SELECT COUNT(*) AS total, SUM(is_published) AS tayang FROM sekolah'),
    db.prepare(
      'SELECT koordinat_status AS status, COUNT(*) AS n FROM sekolah GROUP BY koordinat_status',
    ),
    db.prepare('SELECT status, COUNT(*) AS n FROM permohonan GROUP BY status'),
    db.prepare('SELECT status, COUNT(*) AS n FROM peserta GROUP BY status'),
    db.prepare('SELECT status, COUNT(*) AS n FROM sertifikat GROUP BY status'),
    db.prepare(
      'SELECT jenis, COUNT(*) AS n, ROUND(AVG(nilai), 1) AS rata FROM percobaan WHERE selesai_at IS NOT NULL GROUP BY jenis',
    ),
  ]);
  const p = await bacaPengaturan(db);
  return c.json({
    peran,
    sekolah: boleh('editor_data')
      ? { ...(sek?.results?.[0] as object), koordinat: koord?.results ?? [] }
      : null,
    permohonan: boleh('petugas_pst') ? (perm?.results ?? []) : null,
    lms: boleh('pengelola_lms')
      ? {
          peserta: pes?.results ?? [],
          sertifikat: sert?.results ?? [],
          ujian: ujian?.results ?? [],
          sertifikat_aktif: p.sertifikat_aktif === '1',
          penandatangan_lengkap: Boolean(p.penandatangan_nama && p.penandatangan_jabatan),
        }
      : null,
  });
});

/* -------------------------------- Pengguna -------------------------------- */

adminSistem.get('/pengguna', wajibPeran(), async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT ap.email, ap.nama, ap.peran, ap.is_active, ap.created_at, ap.created_by, a.last_login FROM admin_peran ap LEFT JOIN akun a ON a.email = ap.email ORDER BY ap.peran, ap.nama',
  ).all();
  return c.json({ pengguna: results });
});

adminSistem.put('/pengguna', wajibPeran(), async (c) => {
  const v = await bacaBody(c, AdminUserSchema);
  const saya = c.get('akun')!;
  if (v.email === saya.email && (v.peran !== 'superadmin' || !v.is_active))
    throw new HttpError(
      422,
      'validasi',
      'Anda tidak dapat menurunkan atau menonaktifkan peran Anda sendiri.',
    );
  const db = c.env.DB;
  const lama = await db.prepare('SELECT * FROM admin_peran WHERE email = ?').bind(v.email).first();
  if (v.peran !== 'superadmin' || !v.is_active) {
    const sisa = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM admin_peran WHERE peran = 'superadmin' AND is_active = 1 AND email <> ?",
      )
      .bind(v.email)
      .first<{ n: number }>();
    if ((sisa?.n ?? 0) < 1)
      throw new HttpError(422, 'validasi', 'Harus tersisa minimal satu superadmin aktif.');
  }
  const stmts = [
    db
      .prepare(
        `INSERT INTO admin_peran (email, nama, peran, is_active, created_by) VALUES (?,?,?,?,?)
         ON CONFLICT(email) DO UPDATE SET nama = excluded.nama, peran = excluded.peran, is_active = excluded.is_active, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      )
      .bind(v.email, v.nama, v.peran, v.is_active ? 1 : 0, saya.email),
    await auditStmt(c, lama ? 'ubah' : 'buat', 'admin_peran', v.email, lama, v),
  ];
  // Penonaktifan atau perubahan peran berlaku seketika: semua sesi pengguna itu diakhiri.
  const berubah = lama && ((lama as { peran: string }).peran !== v.peran || !v.is_active);
  if (berubah)
    stmts.push(
      db
        .prepare('DELETE FROM sesi WHERE akun_id IN (SELECT id FROM akun WHERE email = ?)')
        .bind(v.email),
    );
  await db.batch(stmts);
  return c.json({ ok: true });
});

/* ------------------------------- Audit log -------------------------------- */

adminSistem.get('/audit', wajibPeran(), async (c) => {
  const q = c.req.query();
  const w = ['1=1'];
  const p: string[] = [];
  if (q.entitas) {
    w.push('entitas = ?');
    p.push(q.entitas);
  }
  if (q.aktor) {
    w.push('aktor = ?');
    p.push(q.aktor.toLowerCase());
  }
  if (q.entitas_id) {
    w.push('entitas_id = ?');
    p.push(q.entitas_id);
  }
  const ukuran = angkaQuery(q.ukuran, 50, 200);
  const halaman = angkaQuery(q.halaman, 1, 100_000);
  const db = c.env.DB;
  const [items, total] = await db.batch([
    db
      .prepare(`SELECT * FROM audit_log WHERE ${w.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .bind(...p, ukuran, (halaman - 1) * ukuran),
    db.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE ${w.join(' AND ')}`).bind(...p),
  ]);
  return c.json({
    items: items?.results ?? [],
    total: (total?.results?.[0] as { n: number }).n,
    halaman,
    ukuran,
  });
});
