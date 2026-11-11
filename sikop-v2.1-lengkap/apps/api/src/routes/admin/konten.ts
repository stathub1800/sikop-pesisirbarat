/** Admin: indikator manual, pengaturan situs, permohonan PST. */
import { Hono } from 'hono';
import {
  IndikatorManualSchema,
  KECAMATAN,
  PengaturanUpdateSchema,
  PermohonanUpdateSchema,
  STATUS_PERMOHONAN,
} from '@sikop/shared';
import type { AppEnv } from '../../env.ts';
import { wajibPeran } from '../../auth/sesi.ts';
import { auditStmt } from '../../lib/audit.ts';
import { angkaQuery, bacaBody, HttpError, konflikVersi, tidakDitemukan } from '../../lib/http.ts';
import { bacaPengaturan } from '../../lib/pengaturan.ts';
import { daftarIndikator } from '../../services/indikator.ts';

/* ------------------------------ Indikator ------------------------------ */

export const adminIndikator = new Hono<AppEnv>();
adminIndikator.use('*', wajibPeran('editor_data'));

adminIndikator.get('/', async (c) => {
  const p = await bacaPengaturan(c.env.DB);
  const { results } = await c.env.DB.prepare(
    'SELECT id, kategori, sumber, tahun, metode, agregasi, kabupaten_nilai, is_published, urutan, catatan_internal, version FROM indikator ORDER BY urutan, nama',
  ).all();
  return c.json({ indikator: await daftarIndikator(c.env.DB, p, true), manual: results });
});

adminIndikator.put('/:id', async (c) => {
  const v = await bacaBody(c, IndikatorManualSchema);
  if (v.id !== c.req.param('id')) throw new HttpError(422, 'validasi', 'ID tidak cocok.');
  // Indikator Podes diisi pipeline dari agregat resmi (pembilang/penyebut); suntingan manual akan
  // membuat angkanya tidak konsisten, jadi ditolak di sini.
  if (v.id.startsWith('podes_'))
    throw new HttpError(
      409,
      'dikelola_pipeline',
      'Indikator Podes dikelola pipeline data (npm run data:podes). Perbarui lewat berkas DBF, bukan formulir ini.',
    );
  const db = c.env.DB;
  const lama = await db
    .prepare('SELECT * FROM indikator WHERE id = ?')
    .bind(v.id)
    .first<Record<string, unknown>>();
  if (lama && lama.version !== v.version) throw konflikVersi();
  if (!lama && v.version !== 0) throw tidakDitemukan('Indikator');
  const email = c.get('akun')!.email;
  const waktu = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [
    lama
      ? db
          .prepare(
            `UPDATE indikator SET nama=?, satuan=?, kategori=?, sumber=?, tahun=?, metode=?, desimal=?, arah=?, agregasi=?, kabupaten_nilai=?,
               is_published=?, urutan=?, version=version+1, updated_at=?, updated_by=? WHERE id=? AND version=?`,
          )
          .bind(
            v.nama,
            v.satuan,
            v.kategori,
            v.sumber,
            v.tahun,
            v.metode,
            v.desimal,
            v.arah,
            v.agregasi,
            v.kabupaten_nilai ?? null,
            v.is_published ? 1 : 0,
            v.urutan,
            waktu,
            email,
            v.id,
            v.version,
          )
      : db
          .prepare(
            `INSERT INTO indikator (id, nama, satuan, kategori, sumber, tahun, metode, desimal, arah, agregasi, kabupaten_nilai, is_published, urutan, updated_at, updated_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            v.id,
            v.nama,
            v.satuan,
            v.kategori,
            v.sumber,
            v.tahun,
            v.metode,
            v.desimal,
            v.arah,
            v.agregasi,
            v.kabupaten_nilai ?? null,
            v.is_published ? 1 : 0,
            v.urutan,
            waktu,
            email,
          ),
  ];
  for (const k of KECAMATAN) {
    if (!(k.kode in v.nilai)) continue;
    stmts.push(
      db
        .prepare(
          'INSERT INTO indikator_nilai (indikator_id, kode_kec, nilai) VALUES (?,?,?) ON CONFLICT(indikator_id, kode_kec) DO UPDATE SET nilai = excluded.nilai',
        )
        .bind(v.id, k.kode, v.nilai[k.kode] ?? null),
    );
  }
  stmts.push(await auditStmt(c, lama ? 'ubah' : 'buat', 'indikator', v.id, lama, v));
  const res = await db.batch(stmts);
  if (lama && !res[0]?.meta.changes) throw konflikVersi();
  return c.json({ ok: true });
});

/* ------------------------------ Pengaturan ------------------------------ */

export const adminPengaturan = new Hono<AppEnv>();

adminPengaturan.get('/', wajibPeran('editor_data', 'pengelola_lms'), async (c) =>
  c.json({ pengaturan: await bacaPengaturan(c.env.DB) }),
);

/** Pengaturan sertifikat hanya dapat diubah pengelola LMS/superadmin; konten situs oleh editor data. */
adminPengaturan.put('/', wajibPeran('editor_data', 'pengelola_lms'), async (c) => {
  const v = await bacaBody(c, PengaturanUpdateSchema);
  const peran = c.get('akun')!.peran;
  const kunciSertifikat = [
    'penandatangan_nama',
    'penandatangan_jabatan',
    'penandatangan_nip',
    'sertifikat_aktif',
  ];
  const diubah = Object.keys(v);
  if (peran === 'editor_data' && diubah.some((k) => kunciSertifikat.includes(k)))
    throw new HttpError(
      403,
      'dilarang',
      'Pengaturan sertifikat hanya dapat diubah pengelola ruang belajar.',
    );
  if (peran === 'pengelola_lms' && diubah.some((k) => !kunciSertifikat.includes(k)))
    throw new HttpError(403, 'dilarang', 'Pengaturan situs hanya dapat diubah editor data.');
  const db = c.env.DB;
  const lama = await bacaPengaturan(db);
  // Validasi silang: sertifikat aktif butuh penandatangan, dengan memperhitungkan nilai yang sudah tersimpan.
  const gabung = { ...lama, ...v };
  if (
    gabung.sertifikat_aktif === '1' &&
    (!gabung.penandatangan_nama || !gabung.penandatangan_jabatan)
  )
    throw new HttpError(
      422,
      'validasi',
      'Isi nama dan jabatan penandatangan sebelum mengaktifkan penerbitan sertifikat.',
      { sertifikat_aktif: ['Penandatangan belum diisi'] },
    );
  const email = c.get('akun')!.email;
  const stmts = Object.entries(v).map(([k, val]) =>
    db
      .prepare(
        "INSERT INTO pengaturan (kunci, nilai, updated_by) VALUES (?,?,?) ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai, updated_by = excluded.updated_by, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
      )
      .bind(k, String(val), email),
  );
  stmts.push(
    await auditStmt(
      c,
      'ubah',
      'pengaturan',
      null,
      Object.fromEntries(diubah.map((k) => [k, lama[k as keyof typeof lama]])),
      v,
    ),
  );
  await db.batch(stmts);
  return c.json({ ok: true });
});

/* ------------------------------ Permohonan ------------------------------ */

export const adminPermohonan = new Hono<AppEnv>();
adminPermohonan.use('*', wajibPeran('petugas_pst'));

adminPermohonan.get('/', async (c) => {
  const q = c.req.query();
  const w = ['1=1'];
  const p: string[] = [];
  if (q.status && (STATUS_PERMOHONAN as readonly string[]).includes(q.status)) {
    w.push('status = ?');
    p.push(q.status);
  }
  if (q.q) {
    w.push('(tiket = ? OR nama LIKE ? OR email = ?)');
    p.push(q.q.toUpperCase(), `%${q.q.slice(0, 60)}%`, q.q.toLowerCase());
  }
  const ukuran = angkaQuery(q.ukuran, 25, 100);
  const halaman = angkaQuery(q.halaman, 1, 10_000);
  const db = c.env.DB;
  const [items, total, rekap] = await db.batch([
    db
      .prepare(
        `SELECT id, tiket, nama, email, no_hp, instansi, kategori, status, created_at, updated_at, ditangani_oleh FROM permohonan WHERE ${w.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...p, ukuran, (halaman - 1) * ukuran),
    db.prepare(`SELECT COUNT(*) AS n FROM permohonan WHERE ${w.join(' AND ')}`).bind(...p),
    db.prepare('SELECT status, COUNT(*) AS n FROM permohonan GROUP BY status'),
  ]);
  return c.json({
    items: items?.results ?? [],
    total: (total?.results?.[0] as { n: number }).n,
    rekap: rekap?.results ?? [],
    halaman,
    ukuran,
  });
});

adminPermohonan.get('/:tiket', async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM permohonan WHERE tiket = ?')
    .bind(c.req.param('tiket'))
    .first();
  if (!r) throw tidakDitemukan('Permohonan');
  return c.json({ permohonan: r });
});

adminPermohonan.put('/:tiket', async (c) => {
  const v = await bacaBody(c, PermohonanUpdateSchema);
  if ((v.status === 'selesai' || v.status === 'ditolak') && !v.tanggapan)
    throw new HttpError(
      422,
      'validasi',
      'Isi tanggapan untuk pemohon sebelum menutup permohonan.',
      { tanggapan: ['Wajib diisi'] },
    );
  const db = c.env.DB;
  const tiket = c.req.param('tiket');
  const lama = await db
    .prepare('SELECT status, tanggapan, catatan_internal FROM permohonan WHERE tiket = ?')
    .bind(tiket)
    .first();
  if (!lama) throw tidakDitemukan('Permohonan');
  await db.batch([
    db
      .prepare(
        "UPDATE permohonan SET status = ?, tanggapan = ?, catatan_internal = ?, ditangani_oleh = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE tiket = ?",
      )
      .bind(v.status, v.tanggapan, v.catatan_internal, c.get('akun')!.email, tiket),
    await auditStmt(c, 'ubah', 'permohonan', tiket, lama, v),
  ]);
  return c.json({ ok: true });
});
