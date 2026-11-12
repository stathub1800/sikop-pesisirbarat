/**
 * Penyusun kursus (ADR-0008): bab, pelajaran, soal latihan, urutan, pratinjau, kesiapan, riwayat.
 * Dipasang di bawah /admin/lms sehingga peran `pengelola_lms` sudah diwajibkan oleh induknya.
 */
import { Hono } from 'hono';
import {
  BabInputSchema,
  idVideoYoutube,
  JawabanLatihanSchema,
  PelajaranInputSchema,
  SoalLatihanInputSchema,
  UrutanInputSchema,
} from '@sikop/shared';
import type { AppEnv } from '../../env.ts';
import { auditStmt } from '../../lib/audit.ts';
import { bacaBody, HttpError, konflikVersi, sekarang, tidakDitemukan } from '../../lib/http.ts';
import {
  ambilPelajaran,
  nilaiLatihan,
  silabusKursus,
  soalLatihanUntukPeserta,
} from '../../services/pelajaran.ts';

export const adminPenyusun = new Hono<AppEnv>();

const idParam = (v: string | undefined): number => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 1) throw tidakDitemukan();
  return n;
};
const penyunting = (c: { get: (k: 'akun') => { email: string } | undefined }): string =>
  c.get('akun')!.email;

interface BarisBab {
  id: number;
  kursus_id: string;
  modul_id: number | null;
  urutan: number;
  judul: string;
  is_published: number;
  version: number;
  updated_at: string;
  updated_by: string;
}
interface BarisPelajaran {
  id: number;
  bab_id: number;
  urutan: number;
  judul: string;
  jenis: string;
  isi_json: string;
  durasi_menit: number;
  wajib: number;
  is_published: number;
  version: number;
  updated_at: string;
  updated_by: string;
}

const ambilBab = async (db: D1Database, id: number): Promise<BarisBab> => {
  const b = await db.prepare('SELECT * FROM bab WHERE id = ?').bind(id).first<BarisBab>();
  if (!b) throw tidakDitemukan('Bab');
  return b;
};
const ambilBarisPelajaran = async (
  db: D1Database,
  id: number,
): Promise<BarisPelajaran & { kursus_id: string }> => {
  const p = await db
    .prepare(
      'SELECT p.*, b.kursus_id FROM pelajaran p JOIN bab b ON b.id = p.bab_id WHERE p.id = ?',
    )
    .bind(id)
    .first<BarisPelajaran & { kursus_id: string }>();
  if (!p) throw tidakDitemukan('Pelajaran');
  return p;
};

/** Modul tautan bab harus milik kursus yang sama dan belum dipakai bab lain. */
async function periksaModul(
  db: D1Database,
  kursusId: string,
  modulId: number | null,
  babId: number | null,
): Promise<void> {
  if (modulId === null) return;
  const m = await db
    .prepare('SELECT id FROM modul WHERE id = ? AND kursus_id = ?')
    .bind(modulId, kursusId)
    .first();
  if (!m)
    throw new HttpError(422, 'validasi', 'Modul tidak ditemukan pada kursus ini.', {
      modul_id: ['Pilih modul dari kursus yang sama.'],
    });
  const dipakai = await db
    .prepare('SELECT id FROM bab WHERE modul_id = ? AND id <> ?')
    .bind(modulId, babId ?? 0)
    .first();
  if (dipakai)
    throw new HttpError(409, 'duplikat', 'Modul ini sudah dipakai bab lain.', {
      modul_id: ['Satu modul hanya dapat ditautkan ke satu bab.'],
    });
}

/* ------------------------------- Struktur ------------------------------- */

adminPenyusun.get('/kursus/:id/struktur', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const kursus = await db
    .prepare(
      'SELECT id, kode, judul, subjudul, is_published, version, jumlah_soal_akhir, updated_at, updated_by FROM kursus WHERE id = ?',
    )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!kursus) throw tidakDitemukan('Kursus');
  const [bab, pel, modul] = await db.batch([
    db
      .prepare(
        `SELECT b.*, m.judul AS modul_judul, m.is_published AS modul_terbit
           FROM bab b LEFT JOIN modul m ON m.id = b.modul_id
          WHERE b.kursus_id = ? ORDER BY b.urutan`,
      )
      .bind(id),
    db
      .prepare(
        `SELECT p.*,
                (SELECT COUNT(*) FROM soal_latihan s WHERE s.pelajaran_id = p.id AND s.is_active = 1) AS jumlah_soal,
                (SELECT COUNT(*) FROM progres_pelajaran r WHERE r.pelajaran_id = p.id) AS jumlah_progres
           FROM pelajaran p JOIN bab b ON b.id = p.bab_id
          WHERE b.kursus_id = ? ORDER BY b.urutan, p.urutan`,
      )
      .bind(id),
    db
      .prepare(
        'SELECT id, nomor, kode, judul, is_published FROM modul WHERE kursus_id = ? ORDER BY nomor',
      )
      .bind(id),
  ]);
  const pelajaran = (pel?.results ?? []) as (BarisPelajaran & Record<string, unknown>)[];
  return c.json({
    kursus,
    bab: ((bab?.results ?? []) as (BarisBab & Record<string, unknown>)[]).map((b) => ({
      ...b,
      is_published: b.is_published === 1,
      pelajaran: pelajaran
        .filter((p) => p.bab_id === b.id)
        .map(({ isi_json, ...p }) => ({
          ...p,
          isi: JSON.parse(isi_json),
          wajib: p.wajib === 1,
          is_published: p.is_published === 1,
        })),
    })),
    modul: modul?.results ?? [],
  });
});

/* --------------------------------- Bab ---------------------------------- */

adminPenyusun.post('/kursus/:id/bab', async (c) => {
  const v = await bacaBody(c, BabInputSchema);
  const db = c.env.DB;
  const kursusId = c.req.param('id');
  if (!(await db.prepare('SELECT 1 FROM kursus WHERE id = ?').bind(kursusId).first()))
    throw tidakDitemukan('Kursus');
  await periksaModul(db, kursusId, v.modul_id, null);
  const r = await db
    .prepare(
      `INSERT INTO bab (kursus_id, modul_id, urutan, judul, is_published, updated_at, updated_by)
       SELECT ?1, ?2, COALESCE(MAX(urutan), 0) + 1, ?3, ?4, ?5, ?6 FROM bab WHERE kursus_id = ?1
       RETURNING id`,
    )
    .bind(kursusId, v.modul_id, v.judul, v.is_published ? 1 : 0, sekarang(), penyunting(c))
    .first<{ id: number }>();
  await (
    await auditStmt(c, 'buat', 'bab', r?.id ?? null, null, { ...v, kursus_id: kursusId })
  ).run();
  return c.json({ id: r?.id }, 201);
});

adminPenyusun.put('/bab/:id', async (c) => {
  const v = await bacaBody(c, BabInputSchema);
  if (v.version === undefined)
    throw new HttpError(422, 'validasi', 'Versi data wajib dikirim.', {
      version: ['Wajib diisi.'],
    });
  const db = c.env.DB;
  const id = idParam(c.req.param('id'));
  const lama = await ambilBab(db, id);
  await periksaModul(db, lama.kursus_id, v.modul_id, id);
  const res = await db.batch([
    db
      .prepare(
        `UPDATE bab SET judul=?, modul_id=?, is_published=?, version=version+1, updated_at=?, updated_by=?
          WHERE id=? AND version=?`,
      )
      .bind(v.judul, v.modul_id, v.is_published ? 1 : 0, sekarang(), penyunting(c), id, v.version),
    await auditStmt(c, 'ubah', 'bab', id, lama, { ...v, kursus_id: lama.kursus_id }),
  ]);
  if (!res[0]?.meta.changes) throw konflikVersi();
  return c.json({ ok: true });
});

adminPenyusun.delete('/bab/:id', async (c) => {
  const db = c.env.DB;
  const id = idParam(c.req.param('id'));
  const lama = await ambilBab(db, id);
  const progres = await db
    .prepare(
      'SELECT COUNT(*) AS n FROM progres_pelajaran r JOIN pelajaran p ON p.id = r.pelajaran_id WHERE p.bab_id = ?',
    )
    .bind(id)
    .first<{ n: number }>();
  if ((progres?.n ?? 0) > 0)
    throw new HttpError(
      409,
      'ada_progres',
      'Bab ini sudah punya progres peserta. Jadikan draf agar riwayat belajar tidak hilang.',
    );
  await db.batch([
    db.prepare('DELETE FROM bab WHERE id = ?').bind(id),
    await auditStmt(c, 'hapus', 'bab', id, lama, null),
  ]);
  return c.json({ ok: true });
});

/** Menulis urutan baru secara atomik. Urutan sementara negatif agar UNIQUE tidak bertabrakan. */
async function tulisUrutan(
  c: Parameters<typeof auditStmt>[0],
  tabel: 'bab' | 'pelajaran',
  ids: number[],
  entitas: string,
  kursusId: string,
): Promise<void> {
  const db = c.env.DB;
  const waktu = sekarang();
  const oleh = penyunting(c);
  const tanda = ids.map(() => '?').join(',');
  const stmts = [
    db.prepare(`UPDATE ${tabel} SET urutan = -id WHERE id IN (${tanda})`).bind(...ids),
    ...ids.map((id, i) =>
      db
        .prepare(`UPDATE ${tabel} SET urutan = ?, updated_at = ?, updated_by = ? WHERE id = ?`)
        .bind(i + 1, waktu, oleh, id),
    ),
    await auditStmt(c, 'urut', entitas, kursusId, null, { kursus_id: kursusId, ids }),
  ];
  await db.batch(stmts);
}

adminPenyusun.put('/kursus/:id/bab/urutan', async (c) => {
  const { ids } = await bacaBody(c, UrutanInputSchema);
  const db = c.env.DB;
  const kursusId = c.req.param('id');
  const { results } = await db
    .prepare('SELECT id FROM bab WHERE kursus_id = ?')
    .bind(kursusId)
    .all<{ id: number }>();
  if (results.length !== ids.length || !results.every((r) => ids.includes(r.id)))
    throw new HttpError(422, 'validasi', 'Daftar bab tidak sesuai dengan isi kursus.', {
      ids: ['Kirim semua bab kursus ini tepat satu kali.'],
    });
  await tulisUrutan(c, 'bab', ids, 'bab', kursusId);
  return c.json({ ok: true });
});

/* ------------------------------- Pelajaran ------------------------------- */

adminPenyusun.post('/bab/:id/pelajaran', async (c) => {
  const v = await bacaBody(c, PelajaranInputSchema);
  const db = c.env.DB;
  const babId = idParam(c.req.param('id'));
  const bab = await ambilBab(db, babId);
  const r = await db
    .prepare(
      `INSERT INTO pelajaran (bab_id, urutan, judul, jenis, isi_json, durasi_menit, wajib, is_published, updated_at, updated_by)
       SELECT ?1, COALESCE(MAX(urutan), 0) + 1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9 FROM pelajaran WHERE bab_id = ?1
       RETURNING id`,
    )
    .bind(
      babId,
      v.judul,
      v.jenis,
      JSON.stringify(v.isi),
      v.durasi_menit,
      v.wajib ? 1 : 0,
      v.is_published ? 1 : 0,
      sekarang(),
      penyunting(c),
    )
    .first<{ id: number }>();
  await (
    await auditStmt(c, 'buat', 'pelajaran', r?.id ?? null, null, { ...v, kursus_id: bab.kursus_id })
  ).run();
  return c.json({ id: r?.id }, 201);
});

adminPenyusun.put('/pelajaran/:id', async (c) => {
  const v = await bacaBody(c, PelajaranInputSchema);
  if (v.version === undefined)
    throw new HttpError(422, 'validasi', 'Versi data wajib dikirim.', {
      version: ['Wajib diisi.'],
    });
  const db = c.env.DB;
  const id = idParam(c.req.param('id'));
  const lama = await ambilBarisPelajaran(db, id);
  if (lama.jenis !== v.jenis)
    throw new HttpError(
      409,
      'jenis_tetap',
      'Jenis pelajaran tidak dapat diubah. Buat pelajaran baru bila jenisnya berbeda.',
    );
  const res = await db.batch([
    db
      .prepare(
        `UPDATE pelajaran SET judul=?, isi_json=?, durasi_menit=?, wajib=?, is_published=?,
                version=version+1, updated_at=?, updated_by=? WHERE id=? AND version=?`,
      )
      .bind(
        v.judul,
        JSON.stringify(v.isi),
        v.durasi_menit,
        v.wajib ? 1 : 0,
        v.is_published ? 1 : 0,
        sekarang(),
        penyunting(c),
        id,
        v.version,
      ),
    await auditStmt(
      c,
      'ubah',
      'pelajaran',
      id,
      { ...lama, isi: JSON.parse(lama.isi_json), isi_json: undefined },
      { ...v, kursus_id: lama.kursus_id },
    ),
  ]);
  if (!res[0]?.meta.changes) throw konflikVersi();
  return c.json({ ok: true });
});

adminPenyusun.delete('/pelajaran/:id', async (c) => {
  const db = c.env.DB;
  const id = idParam(c.req.param('id'));
  const lama = await ambilBarisPelajaran(db, id);
  const progres = await db
    .prepare('SELECT COUNT(*) AS n FROM progres_pelajaran WHERE pelajaran_id = ?')
    .bind(id)
    .first<{ n: number }>();
  if ((progres?.n ?? 0) > 0)
    throw new HttpError(
      409,
      'ada_progres',
      'Pelajaran ini sudah punya progres peserta. Jadikan draf agar riwayat belajar tidak hilang.',
    );
  await db.batch([
    db.prepare('DELETE FROM pelajaran WHERE id = ?').bind(id),
    await auditStmt(c, 'hapus', 'pelajaran', id, { ...lama, isi_json: undefined }, null),
  ]);
  return c.json({ ok: true });
});

adminPenyusun.put('/bab/:id/pelajaran/urutan', async (c) => {
  const { ids } = await bacaBody(c, UrutanInputSchema);
  const db = c.env.DB;
  const babId = idParam(c.req.param('id'));
  const bab = await ambilBab(db, babId);
  const { results } = await db
    .prepare('SELECT id FROM pelajaran WHERE bab_id = ?')
    .bind(babId)
    .all<{ id: number }>();
  if (results.length !== ids.length || !results.every((r) => ids.includes(r.id)))
    throw new HttpError(422, 'validasi', 'Daftar pelajaran tidak sesuai dengan isi bab.', {
      ids: ['Kirim semua pelajaran bab ini tepat satu kali.'],
    });
  await tulisUrutan(c, 'pelajaran', ids, 'pelajaran', bab.kursus_id);
  return c.json({ ok: true });
});

/* ----------------------------- Soal latihan ----------------------------- */

async function pelajaranLatihan(
  db: D1Database,
  id: number,
): Promise<BarisPelajaran & { kursus_id: string }> {
  const p = await ambilBarisPelajaran(db, id);
  if (p.jenis !== 'latihan')
    throw new HttpError(409, 'bukan_latihan', 'Soal hanya dapat dibuat untuk pelajaran latihan.');
  return p;
}

adminPenyusun.get('/pelajaran/:id/soal', async (c) => {
  const id = idParam(c.req.param('id'));
  await pelajaranLatihan(c.env.DB, id);
  const { results } = await c.env.DB.prepare(
    'SELECT id, urutan, pertanyaan, opsi_json, kunci, pembahasan, is_active FROM soal_latihan WHERE pelajaran_id = ? ORDER BY urutan, id',
  )
    .bind(id)
    .all<Record<string, unknown> & { opsi_json: string; is_active: number }>();
  return c.json({
    soal: results.map(({ opsi_json, is_active, ...s }) => ({
      ...s,
      opsi: JSON.parse(opsi_json),
      is_active: is_active === 1,
    })),
  });
});

adminPenyusun.post('/pelajaran/:id/soal', async (c) => {
  const v = await bacaBody(c, SoalLatihanInputSchema);
  const db = c.env.DB;
  const id = idParam(c.req.param('id'));
  const p = await pelajaranLatihan(db, id);
  const r = await db
    .prepare(
      `INSERT INTO soal_latihan (pelajaran_id, urutan, pertanyaan, opsi_json, kunci, pembahasan, is_active)
       SELECT ?1, COALESCE(NULLIF(?2, 0), COALESCE(MAX(urutan), 0) + 1), ?3, ?4, ?5, ?6, ?7
         FROM soal_latihan WHERE pelajaran_id = ?1 RETURNING id`,
    )
    .bind(
      id,
      v.urutan,
      v.pertanyaan,
      JSON.stringify(v.opsi),
      v.kunci,
      v.pembahasan ?? null,
      v.is_active ? 1 : 0,
    )
    .first<{ id: number }>();
  await (
    await auditStmt(c, 'buat', 'soal_latihan', r?.id ?? null, null, {
      ...v,
      pelajaran_id: id,
      kursus_id: p.kursus_id,
    })
  ).run();
  return c.json({ id: r?.id }, 201);
});

adminPenyusun.put('/soal-latihan/:id', async (c) => {
  const v = await bacaBody(c, SoalLatihanInputSchema);
  const db = c.env.DB;
  const id = idParam(c.req.param('id'));
  const lama = await db
    .prepare(
      `SELECT s.*, b.kursus_id FROM soal_latihan s JOIN pelajaran p ON p.id = s.pelajaran_id
         JOIN bab b ON b.id = p.bab_id WHERE s.id = ?`,
    )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!lama) throw tidakDitemukan('Soal latihan');
  await db.batch([
    db
      .prepare(
        'UPDATE soal_latihan SET urutan=?, pertanyaan=?, opsi_json=?, kunci=?, pembahasan=?, is_active=? WHERE id=?',
      )
      .bind(
        v.urutan,
        v.pertanyaan,
        JSON.stringify(v.opsi),
        v.kunci,
        v.pembahasan ?? null,
        v.is_active ? 1 : 0,
        id,
      ),
    await auditStmt(c, 'ubah', 'soal_latihan', id, lama, { ...v, kursus_id: lama.kursus_id }),
  ]);
  return c.json({ ok: true });
});

adminPenyusun.delete('/soal-latihan/:id', async (c) => {
  const db = c.env.DB;
  const id = idParam(c.req.param('id'));
  const lama = await db
    .prepare(
      `SELECT s.*, b.kursus_id FROM soal_latihan s JOIN pelajaran p ON p.id = s.pelajaran_id
         JOIN bab b ON b.id = p.bab_id WHERE s.id = ?`,
    )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!lama) throw tidakDitemukan('Soal latihan');
  await db.batch([
    db.prepare('DELETE FROM soal_latihan WHERE id = ?').bind(id),
    await auditStmt(c, 'hapus', 'soal_latihan', id, lama, null),
  ]);
  return c.json({ ok: true });
});

/* ------------------------------- Pratinjau ------------------------------- */

/** Bentuk sama dengan GET /lms/pelajaran/:id, tetapi mencakup draf dan tidak mencatat progres. */
adminPenyusun.get('/pelajaran/:id/pratinjau', async (c) => {
  const db = c.env.DB;
  const p = await ambilPelajaran(db, idParam(c.req.param('id')), true);
  if (!p) throw tidakDitemukan('Pelajaran');
  const bab = await silabusKursus(db, p.kursus_id, true);
  const kursus = await db
    .prepare('SELECT id, kode, judul FROM kursus WHERE id = ?')
    .bind(p.kursus_id)
    .first();
  const urut = bab.flatMap((b) => b.pelajaran);
  const i = urut.findIndex((x) => x.id === p.id);
  const wajib = urut.filter((x) => x.wajib);
  return c.json({
    kursus,
    pelajaran: {
      id: p.id,
      bab_id: p.bab_id,
      bab_judul: p.bab_judul,
      modul_id: p.modul_id,
      kursus_id: p.kursus_id,
      judul: p.judul,
      jenis: p.jenis,
      durasi_menit: p.durasi_menit,
      wajib: p.wajib === 1,
      isi: JSON.parse(p.isi_json),
      selesai: false,
      selesai_pada: null,
      ...(p.jenis === 'latihan' ? { soal: await soalLatihanUntukPeserta(db, p.id) } : {}),
    },
    sebelumnya: i > 0 ? urut[i - 1]!.id : null,
    berikutnya: i >= 0 && i < urut.length - 1 ? urut[i + 1]!.id : null,
    bab,
    progres: {
      selesai: [],
      total: urut.length,
      wajib_total: wajib.length,
      wajib_selesai: 0,
      persen: 0,
      lanjut: urut[0]?.id ?? null,
    },
  });
});

adminPenyusun.post('/pelajaran/:id/pratinjau/latihan', async (c) => {
  const { jawaban } = await bacaBody(c, JawabanLatihanSchema);
  const db = c.env.DB;
  const p = await ambilPelajaran(db, idParam(c.req.param('id')), true);
  if (!p) throw tidakDitemukan('Pelajaran');
  const hasil = await nilaiLatihan(db, p, jawaban);
  return c.json({ ...hasil, selesai: false });
});

/* ------------------------------- Kesiapan ------------------------------- */

interface ItemKesiapan {
  tingkat: 'masalah' | 'peringatan' | 'info';
  pesan: string;
  bab_id?: number;
  pelajaran_id?: number;
}

adminPenyusun.get('/kursus/:id/kesiapan', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const kursus = await db
    .prepare('SELECT is_published, jumlah_soal_akhir FROM kursus WHERE id = ?')
    .bind(id)
    .first<{ is_published: number; jumlah_soal_akhir: number }>();
  if (!kursus) throw tidakDitemukan('Kursus');
  const [bab, pel, akhir] = await db.batch([
    db
      .prepare(
        `SELECT b.id, b.judul, b.is_published, b.modul_id, m.is_published AS modul_terbit
           FROM bab b LEFT JOIN modul m ON m.id = b.modul_id WHERE b.kursus_id = ? ORDER BY b.urutan`,
      )
      .bind(id),
    db
      .prepare(
        `SELECT p.id, p.bab_id, p.judul, p.jenis, p.isi_json, p.is_published,
                (SELECT COUNT(*) FROM soal_latihan s WHERE s.pelajaran_id = p.id AND s.is_active = 1) AS soal
           FROM pelajaran p JOIN bab b ON b.id = p.bab_id WHERE b.kursus_id = ? ORDER BY b.urutan, p.urutan`,
      )
      .bind(id),
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM soal WHERE kursus_id = ? AND jenis = 'akhir' AND is_active = 1",
      )
      .bind(id),
  ]);
  const babs = (bab?.results ?? []) as {
    id: number;
    judul: string;
    is_published: number;
    modul_id: number | null;
    modul_terbit: number | null;
  }[];
  const pels = (pel?.results ?? []) as {
    id: number;
    bab_id: number;
    judul: string;
    jenis: string;
    isi_json: string;
    is_published: number;
    soal: number;
  }[];
  const item: ItemKesiapan[] = [];
  if (!kursus.is_published)
    item.push({
      tingkat: 'info',
      pesan: 'Kursus masih berstatus draf dan belum tampil di katalog.',
    });
  if (babs.length === 0) item.push({ tingkat: 'masalah', pesan: 'Kursus belum punya bab.' });
  for (const b of babs) {
    const dalam = pels.filter((p) => p.bab_id === b.id);
    const terbit = dalam.filter((p) => p.is_published === 1);
    if (b.is_published === 1 && terbit.length === 0)
      item.push({
        tingkat: 'masalah',
        pesan: `Bab "${b.judul}" terbit tetapi tidak punya pelajaran terbit.`,
        bab_id: b.id,
      });
    if (b.is_published === 0 && terbit.length > 0)
      item.push({
        tingkat: 'peringatan',
        pesan: `Bab "${b.judul}" masih draf sehingga ${terbit.length} pelajaran terbitnya tidak tampil.`,
        bab_id: b.id,
      });
    if (b.is_published === 1 && b.modul_id !== null && b.modul_terbit !== 1)
      item.push({
        tingkat: 'peringatan',
        pesan: `Bab "${b.judul}" menunjuk modul evaluasi yang belum terbit, sehingga bab tidak tampil.`,
        bab_id: b.id,
      });
  }
  for (const p of pels) {
    if (p.jenis === 'latihan' && p.is_published === 1 && p.soal === 0)
      item.push({
        tingkat: 'masalah',
        pesan: `Latihan "${p.judul}" terbit tanpa soal aktif.`,
        pelajaran_id: p.id,
      });
    if (p.jenis === 'video') {
      const url = String((JSON.parse(p.isi_json) as { url?: string }).url ?? '');
      if (!idVideoYoutube(url))
        item.push({
          tingkat: 'masalah',
          pesan: `Tautan video "${p.judul}" tidak valid.`,
          pelajaran_id: p.id,
        });
    }
  }
  const nAkhir = (akhir?.results?.[0] as { n: number } | undefined)?.n ?? 0;
  if (nAkhir === 0)
    item.push({
      tingkat: 'info',
      pesan: 'Belum ada soal ujian akhir aktif: kursus tidak menerbitkan sertifikat.',
    });
  else if (nAkhir < kursus.jumlah_soal_akhir)
    item.push({
      tingkat: 'masalah',
      pesan: `Soal ujian akhir aktif (${nAkhir}) kurang dari jumlah soal per ujian (${kursus.jumlah_soal_akhir}).`,
    });
  return c.json({ siap: !item.some((x) => x.tingkat === 'masalah'), item });
});

/* -------------------------------- Riwayat -------------------------------- */

adminPenyusun.get('/kursus/:id/riwayat', async (c) => {
  const id = c.req.param('id');
  const batas = Math.min(100, Math.max(1, Number(c.req.query('batas') ?? 50) || 50));
  const { results } = await c.env.DB.prepare(
    `SELECT id, aktor, aksi, entitas, entitas_id, waktu AS created_at
       FROM audit_log
      WHERE (entitas IN ('bab','pelajaran','soal_latihan')
             AND (json_extract(sesudah, '$.kursus_id') = ?1 OR json_extract(sebelum, '$.kursus_id') = ?1))
         OR (entitas = 'kursus' AND entitas_id = ?1)
      ORDER BY id DESC LIMIT ?2`,
  )
    .bind(id, batas)
    .all();
  return c.json({ riwayat: results });
});
