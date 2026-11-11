import { Hono } from 'hono';
import { z } from 'zod';
import { jenjangDari, KECAMATAN, normalisasiBarisSekolah, SekolahEditSchema } from '@sikop/shared';
import type { AppEnv } from '../../env.ts';
import { wajibPeran } from '../../auth/sesi.ts';
import { auditStmt } from '../../lib/audit.ts';
import { angkaQuery, bacaBody, konflikVersi, tidakDitemukan } from '../../lib/http.ts';

export const adminSekolah = new Hono<AppEnv>();
adminSekolah.use('*', wajibPeran('editor_data'));

adminSekolah.get('/', async (c) => {
  const q = c.req.query();
  const w: string[] = ['1=1'];
  const p: (string | number)[] = [];
  if (q.q) {
    w.push("(nama LIKE ? ESCAPE '\\' OR npsn = ?)");
    p.push(`%${q.q.slice(0, 80).replace(/[\\%_]/g, (m) => `\\${m}`)}%`, q.q.toUpperCase());
  }
  if (q.kec) {
    w.push('kode_kec = ?');
    p.push(q.kec);
  }
  if (q.koordinat) {
    w.push('koordinat_status = ?');
    p.push(q.koordinat);
  }
  if (q.tayang === '0' || q.tayang === '1') {
    w.push('is_published = ?');
    p.push(Number(q.tayang));
  }
  const ukuran = angkaQuery(q.ukuran, 25, 100);
  const halaman = angkaQuery(q.halaman, 1, 10_000);
  const db = c.env.DB;
  const where = w.join(' AND ');
  const [items, total] = await db.batch([
    db
      .prepare(
        `SELECT npsn, nama, bentuk, jenjang, status, kode_kec, koordinat_status, is_published, updated_at, updated_by FROM sekolah WHERE ${where} ORDER BY kode_kec, nama LIMIT ? OFFSET ?`,
      )
      .bind(...p, ukuran, (halaman - 1) * ukuran),
    db.prepare(`SELECT COUNT(*) AS n FROM sekolah WHERE ${where}`).bind(...p),
  ]);
  return c.json({
    items: items?.results ?? [],
    total: (total?.results?.[0] as { n: number }).n,
    halaman,
    ukuran,
  });
});

adminSekolah.get('/:npsn', async (c) => {
  const s = await c.env.DB.prepare('SELECT * FROM sekolah WHERE npsn = ?')
    .bind(c.req.param('npsn'))
    .first();
  if (!s) throw tidakDitemukan('Sekolah');
  return c.json({ sekolah: s });
});

/** Edit dengan optimistic locking: version harus sama dengan yang dibaca, jika tidak 409. */
adminSekolah.put('/:npsn', async (c) => {
  const npsn = c.req.param('npsn');
  const v = await bacaBody(c, SekolahEditSchema);
  const db = c.env.DB;
  const lama = await db
    .prepare('SELECT * FROM sekolah WHERE npsn = ?')
    .bind(npsn)
    .first<Record<string, unknown>>();
  if (!lama) throw tidakDitemukan('Sekolah');
  if (lama.version !== v.version) throw konflikVersi();
  const koordinatBerubah = v.lat !== lama.lat || v.lon !== lama.lon;
  // Koordinat yang disunting manusia dianggap terverifikasi; koordinat kosong ditandai tidak_ada.
  const kStatus =
    v.lat === null
      ? 'tidak_ada'
      : koordinatBerubah || lama.koordinat_status !== 'valid'
        ? 'valid'
        : lama.koordinat_status;
  const kCatatan =
    koordinatBerubah || kStatus === 'valid'
      ? `Diverifikasi ${c.get('akun')!.email} ${new Date().toISOString().slice(0, 10)}`
      : lama.koordinat_catatan;
  const baru = {
    nama: v.nama,
    bentuk: v.bentuk,
    jenjang: jenjangDari(v.bentuk),
    status: v.status,
    akreditasi: v.akreditasi,
    alamat: v.alamat,
    dusun: v.dusun,
    kode_pos: v.kode_pos ?? null,
    kode_kec: v.kode_kec,
    telepon: v.telepon ?? null,
    email: v.email ?? null,
    website: v.website ?? null,
    lat: v.lat,
    lon: v.lon,
    koordinat_status: kStatus,
    koordinat_catatan: kCatatan,
    pd: v.pd_l + v.pd_p,
    pd_l: v.pd_l,
    pd_p: v.pd_p,
    rombel: v.rombel,
    guru: v.guru_l + v.guru_p,
    guru_l: v.guru_l,
    guru_p: v.guru_p,
    rk_baik: v.rk_baik,
    rk_rusak_ringan: v.rk_rusak_ringan,
    rk_rusak_sedang: v.rk_rusak_sedang,
    rk_rusak_berat: v.rk_rusak_berat,
    is_published: v.is_published ? 1 : 0,
  };
  const kolom = Object.keys(baru);
  const res = await db.batch([
    db
      .prepare(
        `UPDATE sekolah SET ${kolom.map((k) => `${k} = ?`).join(', ')}, version = version + 1, updated_at = ?, updated_by = ? WHERE npsn = ? AND version = ?`,
      )
      .bind(
        ...Object.values(baru),
        new Date().toISOString(),
        c.get('akun')!.email,
        npsn,
        v.version,
      ),
    await auditStmt(c, 'ubah', 'sekolah', npsn, lama, baru),
  ]);
  if (!res[0]?.meta.changes) throw konflikVersi();
  return c.json({ ok: true, version: v.version + 1 });
});

/**
 * Impor CSV bertahap dari panel admin (maks 100 baris per permintaan agar tetap di bawah batas CPU).
 * Frontend mengurai CSV, server memvalidasi ulang setiap baris dengan aturan yang sama dengan pipeline.
 */
adminSekolah.post('/impor', async (c) => {
  const { baris, mulai } = await bacaBody(
    c,
    z.object({
      baris: z.array(z.record(z.string(), z.string())).min(1).max(100),
      mulai: z.number().int().min(2),
    }),
  );
  const db = c.env.DB;
  const temuan: unknown[] = [];
  const stmts: D1PreparedStatement[] = [];
  const email = c.get('akun')!.email;
  for (const [i, row] of baris.entries()) {
    const r = normalisasiBarisSekolah(row, mulai + i);
    temuan.push(...r.temuan);
    if (!r.data) continue;
    const s = r.data;
    const kolom = Object.keys(s);
    stmts.push(
      db
        .prepare(
          `INSERT INTO sekolah (${kolom.join(', ')}, updated_by) VALUES (${kolom.map(() => '?').join(', ')}, ?)
           ON CONFLICT(npsn) DO UPDATE SET ${kolom
             .filter((k) => k !== 'npsn')
             .map((k) => `${k} = excluded.${k}`)
             .join(', ')},
             version = sekolah.version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_by = excluded.updated_by`,
        )
        .bind(...Object.values(s), email),
    );
  }
  if (stmts.length) {
    stmts.push(
      await auditStmt(c, 'impor', 'sekolah', null, null, {
        jumlah: stmts.length,
        baris_awal: mulai,
      }),
    );
    await db.batch(stmts);
  }
  return c.json({ diproses: baris.length, tersimpan: Math.max(0, stmts.length - 1), temuan });
});

/** Ringkasan antrian verifikasi koordinat per kecamatan. */
adminSekolah.get('/mutu/koordinat', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT kode_kec, koordinat_status, COUNT(*) AS n FROM sekolah GROUP BY kode_kec, koordinat_status',
  ).all();
  return c.json({
    kecamatan: KECAMATAN.map((k) => ({ kode: k.kode, nama: k.nama })),
    rekap: results,
  });
});
