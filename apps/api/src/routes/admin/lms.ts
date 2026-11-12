/** Admin ruang belajar: kursus, modul, bank soal, peserta, sertifikat. Peran: pengelola_lms. */
import { Hono } from 'hono';
import { z } from 'zod';
import {
  CabutSertifikatSchema,
  KursusInputSchema,
  ModulInputSchema,
  samarkanNip,
  SoalInputSchema,
  STATUS_PESERTA,
  VerifikasiPesertaSchema,
} from '@sikop/shared';
import type { AppEnv } from '../../env.ts';
import { wajibPeran } from '../../auth/sesi.ts';
import { auditStmt } from '../../lib/audit.ts';
import { angkaQuery, bacaBody, HttpError, konflikVersi, tidakDitemukan } from '../../lib/http.ts';
import { terbitkanSertifikat } from '../../services/lms.ts';
import { adminPenyusun } from './penyusun.ts';

export const adminLms = new Hono<AppEnv>();
adminLms.use('*', wajibPeran('pengelola_lms'));
adminLms.route('/', adminPenyusun);

const waktu = (): string => new Date().toISOString();

/* -------------------------------- Kursus -------------------------------- */

adminLms.get('/kursus', async (c) => {
  const db = c.env.DB;
  const [k, m] = await db.batch([
    db.prepare('SELECT * FROM kursus ORDER BY urutan'),
    db.prepare(
      'SELECT id, kursus_id, nomor, kode, judul, is_published, version FROM modul ORDER BY kursus_id, nomor',
    ),
  ]);
  return c.json({ kursus: k?.results ?? [], modul: m?.results ?? [] });
});

adminLms.put('/kursus/:id', async (c) => {
  const v = await bacaBody(c, KursusInputSchema);
  const db = c.env.DB;
  const id = c.req.param('id');
  const lama = await db
    .prepare('SELECT * FROM kursus WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!lama) throw tidakDitemukan('Kursus');
  const res = await db.batch([
    db
      .prepare(
        `UPDATE kursus SET kode=?, judul=?, subjudul=?, deskripsi=?, kategori=?, estimasi=?, nilai_lulus_akhir=?, durasi_akhir_menit=?, jumlah_soal_akhir=?,
           level=COALESCE(?, level), sasaran_json=COALESCE(?, sasaran_json), hasil_belajar_json=COALESCE(?, hasil_belajar_json),
           durasi_menit=COALESCE(?, durasi_menit), gambar_url=COALESCE(?, gambar_url),
           is_published=?, version=version+1, updated_at=?, updated_by=? WHERE id=? AND version=?`,
      )
      .bind(
        v.kode,
        v.judul,
        v.subjudul,
        v.deskripsi,
        v.kategori,
        v.estimasi,
        v.nilai_lulus_akhir,
        v.durasi_akhir_menit,
        v.jumlah_soal_akhir,
        v.level ?? null,
        v.sasaran ? JSON.stringify(v.sasaran) : null,
        v.hasil_belajar ? JSON.stringify(v.hasil_belajar) : null,
        v.durasi_menit ?? null,
        v.gambar_url ?? null,
        v.is_published ? 1 : 0,
        waktu(),
        c.get('akun')!.email,
        id,
        v.version,
      ),
    await auditStmt(c, 'ubah', 'kursus', id, lama, v),
  ]);
  if (!res[0]?.meta.changes) throw konflikVersi();
  return c.json({ ok: true });
});

/* -------------------------------- Modul --------------------------------- */

adminLms.get('/modul/:id', async (c) => {
  const m = await c.env.DB.prepare('SELECT * FROM modul WHERE id = ?')
    .bind(Number(c.req.param('id')))
    .first<Record<string, unknown>>();
  if (!m) throw tidakDitemukan('Modul');
  const { video_json, kompetensi_json, sumber_json, ...rest } = m;
  return c.json({
    modul: {
      ...rest,
      video: JSON.parse(String(video_json)),
      kompetensi: JSON.parse(String(kompetensi_json)),
      sumber: JSON.parse(String(sumber_json)),
    },
  });
});

adminLms.post('/modul', async (c) => {
  const v = await bacaBody(c, ModulInputSchema);
  const db = c.env.DB;
  const r = await db
    .prepare(
      `INSERT INTO modul (kursus_id, nomor, kode, judul, subjudul, deskripsi, kategori, estimasi, nilai_lulus, ringkasan, video_json, kompetensi_json, sumber_json, is_published, updated_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    )
    .bind(
      v.kursus_id,
      v.nomor,
      v.kode,
      v.judul,
      v.subjudul,
      v.deskripsi,
      v.kategori,
      v.estimasi,
      v.nilai_lulus,
      v.ringkasan,
      JSON.stringify(v.video),
      JSON.stringify(v.kompetensi),
      JSON.stringify(v.sumber),
      v.is_published ? 1 : 0,
      c.get('akun')!.email,
    )
    .first<{ id: number }>()
    .catch((e: unknown) => {
      if (String(e).includes('UNIQUE'))
        throw new HttpError(409, 'duplikat', 'Nomor atau kode modul sudah dipakai.');
      throw e;
    });
  await (await auditStmt(c, 'buat', 'modul', r?.id ?? null, null, v)).run();
  return c.json({ id: r?.id }, 201);
});

adminLms.put('/modul/:id', async (c) => {
  const v = await bacaBody(c, ModulInputSchema);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;
  const lama = await db.prepare('SELECT * FROM modul WHERE id = ?').bind(id).first();
  if (!lama) throw tidakDitemukan('Modul');
  const res = await db.batch([
    db
      .prepare(
        `UPDATE modul SET nomor=?, kode=?, judul=?, subjudul=?, deskripsi=?, kategori=?, estimasi=?, nilai_lulus=?, ringkasan=?, video_json=?, kompetensi_json=?, sumber_json=?,
           is_published=?, version=version+1, updated_at=?, updated_by=? WHERE id=? AND version=?`,
      )
      .bind(
        v.nomor,
        v.kode,
        v.judul,
        v.subjudul,
        v.deskripsi,
        v.kategori,
        v.estimasi,
        v.nilai_lulus,
        v.ringkasan,
        JSON.stringify(v.video),
        JSON.stringify(v.kompetensi),
        JSON.stringify(v.sumber),
        v.is_published ? 1 : 0,
        waktu(),
        c.get('akun')!.email,
        id,
        v.version,
      ),
    await auditStmt(c, 'ubah', 'modul', id, lama, v),
  ]);
  if (!res[0]?.meta.changes) throw konflikVersi();
  return c.json({ ok: true });
});

/* ------------------------------- Bank soal ------------------------------- */

adminLms.get('/soal', async (c) => {
  const q = c.req.query();
  const w = ['kursus_id = ?'];
  const p: (string | number)[] = [q.kursus ?? 'pss-2026'];
  if (q.modul) {
    w.push('modul_id = ?');
    p.push(Number(q.modul));
  }
  if (q.jenis) {
    w.push('jenis = ?');
    p.push(q.jenis);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM soal WHERE ${w.join(' AND ')} ORDER BY jenis, modul_id, urutan, id`,
  )
    .bind(...p)
    .all<Record<string, unknown>>();
  const sebaran: Record<string, number> = {};
  for (const r of results)
    if (r.is_active) sebaran[String(r.kunci)] = (sebaran[String(r.kunci)] ?? 0) + 1;
  return c.json({
    soal: results.map(({ opsi_json, ...r }) => ({ ...r, opsi: JSON.parse(String(opsi_json)) })),
    sebaran_kunci: sebaran,
  });
});

adminLms.post('/soal', async (c) => {
  const v = await bacaBody(c, SoalInputSchema);
  const r = await c.env.DB.prepare(
    'INSERT INTO soal (kursus_id, modul_id, jenis, urutan, pertanyaan, opsi_json, kunci, pembahasan, is_active, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id',
  )
    .bind(
      v.kursus_id,
      v.modul_id,
      v.jenis,
      v.urutan,
      v.pertanyaan,
      JSON.stringify(v.opsi),
      v.kunci,
      v.pembahasan ?? null,
      v.is_active ? 1 : 0,
      c.get('akun')!.email,
    )
    .first<{ id: number }>();
  await (await auditStmt(c, 'buat', 'soal', r?.id ?? null, null, { ...v, kunci: undefined })).run();
  return c.json({ id: r?.id }, 201);
});

adminLms.put('/soal/:id', async (c) => {
  const v = await bacaBody(c, SoalInputSchema);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;
  const lama = await db.prepare('SELECT * FROM soal WHERE id = ?').bind(id).first();
  if (!lama) throw tidakDitemukan('Soal');
  await db.batch([
    db
      .prepare(
        "UPDATE soal SET kursus_id=?, modul_id=?, jenis=?, urutan=?, pertanyaan=?, opsi_json=?, kunci=?, pembahasan=?, is_active=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_by=? WHERE id=?",
      )
      .bind(
        v.kursus_id,
        v.modul_id,
        v.jenis,
        v.urutan,
        v.pertanyaan,
        JSON.stringify(v.opsi),
        v.kunci,
        v.pembahasan ?? null,
        v.is_active ? 1 : 0,
        c.get('akun')!.email,
        id,
      ),
    // Kunci tidak dicatat di audit agar log tidak menjadi jalur bocor kunci jawaban.
    await auditStmt(c, 'ubah', 'soal', id, lama, {
      ...v,
      kunci: undefined,
      kunci_berubah: (lama as { kunci: string }).kunci !== v.kunci,
    }),
  ]);
  return c.json({ ok: true });
});

/* -------------------------------- Peserta -------------------------------- */

adminLms.get('/peserta', async (c) => {
  const q = c.req.query();
  const w = ['1=1'];
  const p: string[] = [];
  if (q.status && (STATUS_PESERTA as readonly string[]).includes(q.status)) {
    w.push('p.status = ?');
    p.push(q.status);
  }
  if (q.q) {
    w.push('(p.nama LIKE ? OR p.instansi LIKE ? OR p.nip = ? OR a.email = ?)');
    p.push(
      `%${q.q.slice(0, 60)}%`,
      `%${q.q.slice(0, 60)}%`,
      q.q.replace(/\s/g, ''),
      q.q.toLowerCase(),
    );
  }
  const ukuran = angkaQuery(q.ukuran, 25, 100);
  const halaman = angkaQuery(q.halaman, 1, 10_000);
  const db = c.env.DB;
  const [items, total] = await db.batch([
    db
      .prepare(
        `SELECT p.akun_id, p.kategori, p.nama, p.nip, p.instansi, p.jabatan, p.status, p.catatan, p.created_at, p.verified_at, p.verified_by, a.email,
                (SELECT MAX(nilai) FROM percobaan x WHERE x.akun_id = p.akun_id AND x.jenis = 'akhir') AS nilai_akhir,
                (SELECT nomor FROM sertifikat s WHERE s.akun_id = p.akun_id LIMIT 1) AS sertifikat
           FROM peserta p JOIN akun a ON a.id = p.akun_id WHERE ${w.join(' AND ')} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...p, ukuran, (halaman - 1) * ukuran),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM peserta p JOIN akun a ON a.id = p.akun_id WHERE ${w.join(' AND ')}`,
      )
      .bind(...p),
  ]);
  return c.json({
    items: items?.results ?? [],
    total: (total?.results?.[0] as { n: number }).n,
    halaman,
    ukuran,
  });
});

/** Verifikasi peserta. Bila terverifikasi dan sudah lulus ujian akhir, sertifikat langsung diterbitkan. */
adminLms.put('/peserta/:akun', async (c) => {
  const v = await bacaBody(c, VerifikasiPesertaSchema);
  const akunId = c.req.param('akun');
  const db = c.env.DB;
  const lama = await db
    .prepare('SELECT kategori, nama, nip, status, catatan FROM peserta WHERE akun_id = ?')
    .bind(akunId)
    .first<{ nip: string | null }>();
  if (!lama) throw tidakDitemukan('Peserta');
  const email = c.get('akun')!.email;
  await db.batch([
    db
      .prepare(
        "UPDATE peserta SET status = ?, catatan = ?, verified_at = CASE WHEN ? = 'terverifikasi' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE verified_at END, verified_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE akun_id = ?",
      )
      .bind(v.status, v.catatan, v.status, email, akunId),
    await auditStmt(
      c,
      'verifikasi',
      'peserta',
      akunId,
      { ...lama, nip: lama.nip ? samarkanNip(lama.nip) : null },
      v,
    ),
  ]);
  const sertifikat = [];
  if (v.status === 'terverifikasi') {
    const { results } = await db
      .prepare(
        "SELECT DISTINCT kursus_id FROM percobaan WHERE akun_id = ? AND jenis = 'akhir' AND lulus = 1",
      )
      .bind(akunId)
      .all<{ kursus_id: string }>();
    for (const r of results)
      sertifikat.push(await terbitkanSertifikat(db, akunId, r.kursus_id, email));
  }
  return c.json({ ok: true, sertifikat });
});

/* ------------------------------- Sertifikat ------------------------------ */

adminLms.get('/sertifikat', async (c) => {
  const db = c.env.DB;
  const [terbit, tertunda] = await db.batch([
    db.prepare(
      'SELECT nomor, kode_verifikasi, nama_peserta, instansi, judul_kursus, nilai, terbit_at, status, dicabut_alasan FROM sertifikat ORDER BY terbit_at DESC LIMIT 500',
    ),
    db.prepare(
      `SELECT DISTINCT p.akun_id, p.kursus_id, ps.nama, ps.instansi, ps.status AS status_peserta
         FROM percobaan p JOIN peserta ps ON ps.akun_id = p.akun_id
        WHERE p.jenis = 'akhir' AND p.lulus = 1
          AND NOT EXISTS (SELECT 1 FROM sertifikat s WHERE s.akun_id = p.akun_id AND s.kursus_id = p.kursus_id)`,
    ),
  ]);
  return c.json({ sertifikat: terbit?.results ?? [], tertunda: tertunda?.results ?? [] });
});

adminLms.post('/sertifikat/terbitkan-tertunda', async (c) => {
  const db = c.env.DB;
  const { results } = await db
    .prepare(
      `SELECT DISTINCT p.akun_id, p.kursus_id FROM percobaan p WHERE p.jenis = 'akhir' AND p.lulus = 1
          AND NOT EXISTS (SELECT 1 FROM sertifikat s WHERE s.akun_id = p.akun_id AND s.kursus_id = p.kursus_id) LIMIT 100`,
    )
    .all<{ akun_id: string; kursus_id: string }>();
  const hasil: Record<string, number> = {};
  for (const r of results) {
    const s = await terbitkanSertifikat(db, r.akun_id, r.kursus_id, c.get('akun')!.email);
    hasil[s.status] = (hasil[s.status] ?? 0) + 1;
  }
  return c.json({ hasil });
});

adminLms.post('/sertifikat/cabut', async (c) => {
  const { nomor, alasan } = await bacaBody(
    c,
    CabutSertifikatSchema.extend({ nomor: z.string().min(5).max(60) }),
  );
  const db = c.env.DB;
  const lama = await db
    .prepare('SELECT status FROM sertifikat WHERE nomor = ?')
    .bind(nomor)
    .first();
  if (!lama) throw tidakDitemukan('Sertifikat');
  await db.batch([
    db
      .prepare(
        "UPDATE sertifikat SET status = 'dicabut', dicabut_alasan = ?, dicabut_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), dicabut_by = ? WHERE nomor = ?",
      )
      .bind(alasan, c.get('akun')!.email, nomor),
    await auditStmt(c, 'cabut', 'sertifikat', nomor, lama, { alasan }),
  ]);
  return c.json({ ok: true });
});
