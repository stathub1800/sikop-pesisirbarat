/**
 * Endpoint publik (tanpa login): ringkasan, wilayah, indikator, sekolah, verifikasi sertifikat.
 * Hanya kolom yang layak publik yang dipilih; kolom internal (catatan, updated_by) tidak dikirim (S04).
 */
import { Hono } from 'hono';
import {
  isKodeKecamatan,
  JENJANG,
  KECAMATAN,
  KOORDINAT_TAMPIL,
  RE_KODE_VERIFIKASI,
  TAYANG_PD_GURU,
  toCsv,
} from '@sikop/shared';
import type { AppEnv } from '../env.ts';
import { angkaQuery, HttpError, tidakDitemukan } from '../lib/http.ts';
import { batasiLaju, cachePublik } from '../lib/middleware.ts';
import { bacaPengaturan, pengaturanPublik } from '../lib/pengaturan.ts';
import { daftarIndikator } from '../services/indikator.ts';

export const publik = new Hono<AppEnv>();

publik.get('/health', async (c) => {
  const db = await c.env.DB.prepare('SELECT 1 AS ok')
    .first<{ ok: number }>()
    .catch(() => null);
  return c.json(
    { status: db?.ok === 1 ? 'sehat' : 'terganggu', waktu: new Date().toISOString() },
    db ? 200 : 503,
  );
});

publik.get('/situs', cachePublik(300), async (c) => {
  const p = await bacaPengaturan(c.env.DB);
  return c.json({
    pengaturan: pengaturanPublik(p),
    sertifikat_aktif: p.sertifikat_aktif === '1',
    google_client_id: c.env.GOOGLE_CLIENT_ID,
    turnstile_site_key: c.env.TURNSTILE_SITE_KEY,
    mode_dev: c.env.ENVIRONMENT === 'development' && c.env.DEV_LOGIN === 'aktif',
    kecamatan: KECAMATAN.map((k) => ({ kode: k.kode, nama: k.nama })),
  });
});

/** Angka ringkas beranda, semuanya dari basis data (T03: tidak ada angka yang ditulis tetap). */
publik.get('/ringkasan', cachePublik(300), async (c) => {
  const db = c.env.DB;
  const [s, jenjang, kursus, sert] = await db.batch([
    db.prepare(
      TAYANG_PD_GURU
        ? 'SELECT COUNT(*) AS sekolah, COALESCE(SUM(pd),0) AS pd, COALESCE(SUM(guru),0) AS guru, MAX(updated_at) AS diperbarui FROM sekolah WHERE is_published = 1'
        : 'SELECT COUNT(*) AS sekolah, MAX(updated_at) AS diperbarui FROM sekolah WHERE is_published = 1',
    ),
    db.prepare(
      'SELECT jenjang, COUNT(*) AS n FROM sekolah WHERE is_published = 1 GROUP BY jenjang',
    ),
    db.prepare(
      'SELECT (SELECT COUNT(*) FROM kursus WHERE is_published = 1) AS kursus, (SELECT COUNT(*) FROM modul m JOIN kursus k ON k.id = m.kursus_id WHERE m.is_published = 1 AND k.is_published = 1) AS modul',
    ),
    db.prepare("SELECT COUNT(*) AS n FROM sertifikat WHERE status = 'sah'"),
  ]);
  const p = await bacaPengaturan(db);
  return c.json({
    kecamatan: KECAMATAN.length,
    ...(s?.results?.[0] as object),
    per_jenjang: jenjang?.results ?? [],
    ...(kursus?.results?.[0] as object),
    sertifikat: (sert?.results?.[0] as { n: number } | undefined)?.n ?? 0,
    sumber_data_sekolah: p.sumber_data_sekolah ?? '',
    tanggal_data_sekolah: p.tanggal_data_sekolah ?? '',
  });
});

publik.get('/indikator', cachePublik(300), async (c) => {
  const p = await bacaPengaturan(c.env.DB);
  return c.json({ indikator: await daftarIndikator(c.env.DB, p) });
});

/** Unduh data terbuka: semua indikator tayang × kecamatan dalam satu CSV (T06: fitur unduh benar-benar ada). */
publik.get('/indikator/ekspor.csv', async (c) => {
  const p = await bacaPengaturan(c.env.DB);
  const rows = (await daftarIndikator(c.env.DB, p)).flatMap((ind) => [
    ...KECAMATAN.map((k) => ({
      indikator_id: ind.id,
      indikator: ind.nama,
      satuan: ind.satuan,
      kode_wilayah: k.kode,
      wilayah: `Kec. ${k.nama}`,
      nilai: ind.nilai[k.kode] ?? '',
      sumber: ind.sumber,
      tahun: ind.tahun,
    })),
    {
      indikator_id: ind.id,
      indikator: ind.nama,
      satuan: ind.satuan,
      kode_wilayah: '1813',
      wilayah: 'Kabupaten Pesisir Barat',
      nilai: ind.kabupaten ?? '',
      sumber: ind.sumber,
      tahun: ind.tahun,
    },
  ]);
  return csvResponse(
    toCsv(rows, [
      'indikator_id',
      'indikator',
      'satuan',
      'kode_wilayah',
      'wilayah',
      'nilai',
      'sumber',
      'tahun',
    ]),
    'sikop-indikator-kecamatan.csv',
  );
});

publik.get('/kecamatan/:kode', cachePublik(300), async (c) => {
  const kode = c.req.param('kode');
  if (!isKodeKecamatan(kode)) throw tidakDitemukan('Kecamatan');
  const db = c.env.DB;
  const [kec, rekap] = await db.batch([
    db
      .prepare(
        'SELECT kode, kode_kemendagri, nama, luas_km2_peta, bbox_json FROM kecamatan WHERE kode = ?',
      )
      .bind(kode),
    db
      .prepare(
        `SELECT jenjang, status, COUNT(*) AS sekolah${TAYANG_PD_GURU ? ', SUM(pd) AS pd, SUM(guru) AS guru' : ''}
         FROM sekolah WHERE kode_kec = ? AND is_published = 1 GROUP BY jenjang, status`,
      )
      .bind(kode),
  ]);
  const info = kec?.results?.[0] as Record<string, unknown> | undefined;
  if (!info) throw tidakDitemukan('Kecamatan');
  const p = await bacaPengaturan(db);
  const ind = (await daftarIndikator(db, p)).map(({ nilai, rincian, ...rest }) => ({
    ...rest,
    nilai: nilai[kode] ?? null,
    ...(rincian ? { rincian: rincian[kode] ?? null } : {}),
  }));
  return c.json({
    kecamatan: { ...info, bbox: JSON.parse(String(info.bbox_json ?? 'null')) },
    rekap: rekap?.results ?? [],
    indikator: ind,
    sumber_batas: p.sumber_batas_wilayah ?? '',
  });
});

/* ------------------------------ Sekolah ------------------------------ */

/** Kolom peserta didik, guru, dan rombel hanya dikirim bila TAYANG_PD_GURU (lihat @sikop/shared). */
const KOLOM_DAFTAR = `npsn, nama, bentuk, jenjang, status, akreditasi, kode_kec${TAYANG_PD_GURU ? ', pd, guru, rombel' : ''}`;
const URUT: Readonly<Record<string, string>> = {
  nama: 'nama COLLATE NOCASE',
  ...(TAYANG_PD_GURU ? { pd: 'pd', guru: 'guru' } : {}),
  kecamatan: 'kode_kec',
  jenjang: 'jenjang',
};

/** Menyusun WHERE terparameter dari query string. Tidak ada input pengguna yang disambung ke SQL. */
function filterSekolah(
  q: Record<string, string | undefined>,
  t = '',
): { where: string; params: (string | number)[] } {
  const w = [`${t}is_published = 1`];
  const params: (string | number)[] = [];
  const cari = (q.q ?? '').trim().slice(0, 80);
  if (cari) {
    w.push(`(${t}nama LIKE ? ESCAPE '\\' OR ${t}npsn = ?)`);
    params.push(`%${cari.replace(/[\\%_]/g, (m) => `\\${m}`)}%`, cari.toUpperCase());
  }
  if (q.kec) {
    if (!isKodeKecamatan(q.kec))
      throw new HttpError(400, 'filter', 'Kode kecamatan tidak dikenal.');
    w.push(`${t}kode_kec = ?`);
    params.push(q.kec);
  }
  if (q.jenjang) {
    if (!(JENJANG as readonly string[]).includes(q.jenjang))
      throw new HttpError(400, 'filter', 'Jenjang tidak dikenal.');
    w.push(`${t}jenjang = ?`);
    params.push(q.jenjang);
  }
  if (q.status) {
    if (q.status !== 'Negeri' && q.status !== 'Swasta')
      throw new HttpError(400, 'filter', 'Status tidak dikenal.');
    w.push(`${t}status = ?`);
    params.push(q.status);
  }
  if (q.akreditasi) {
    w.push(
      q.akreditasi === 'Belum'
        ? `(${t}akreditasi IS NULL OR ${t}akreditasi = 'Tidak Terakreditasi')`
        : `${t}akreditasi = ?`,
    );
    if (q.akreditasi !== 'Belum') params.push(q.akreditasi.slice(0, 30));
  }
  return { where: w.join(' AND '), params };
}

publik.get('/sekolah', cachePublik(120), async (c) => {
  const q = c.req.query();
  const { where, params } = filterSekolah(q);
  const ukuran = angkaQuery(q.ukuran, 25, 100);
  const halaman = angkaQuery(q.halaman, 1, 10_000);
  const urut = URUT[q.urut ?? 'nama'] ?? URUT.nama;
  const arah = q.arah === 'turun' ? 'DESC' : 'ASC';
  const db = c.env.DB;
  // Pasangan query detail + query hitungan, seperti standar katalog query.
  const [items, total] = await db.batch([
    db
      .prepare(
        `SELECT ${KOLOM_DAFTAR} FROM sekolah WHERE ${where} ORDER BY ${urut} ${arah}, npsn LIMIT ? OFFSET ?`,
      )
      .bind(...params, ukuran, (halaman - 1) * ukuran),
    db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(pd),0) AS pd, COALESCE(SUM(guru),0) AS guru FROM sekolah WHERE ${where}`,
      )
      .bind(...params),
  ]);
  const t = total?.results?.[0] as { n: number; pd: number; guru: number };
  return c.json({
    items: items?.results ?? [],
    total: t.n,
    ...(TAYANG_PD_GURU ? { jumlah_pd: t.pd, jumlah_guru: t.guru } : {}),
    halaman,
    ukuran,
  });
});

/**
 * Tabulasi silang sekolah: banyaknya sekolah menurut dua variabel (baris x kolom), dengan saringan
 * yang sama seperti daftar sekolah. Nama kolom SQL diambil dari daftar putih, bukan dari input.
 */
const VARIABEL_REKAP: Readonly<Record<string, string>> = {
  kecamatan: 'kode_kec',
  jenjang: 'jenjang',
  status: 'status',
  akreditasi: "CASE WHEN akreditasi IN ('A','B','C') THEN akreditasi ELSE 'Belum' END",
};
publik.get('/sekolah/rekap', cachePublik(120), async (c) => {
  const q = c.req.query();
  const baris = VARIABEL_REKAP[q.baris ?? 'kecamatan'];
  const kolom = q.kolom ? VARIABEL_REKAP[q.kolom] : null;
  if (!baris || (q.kolom && !kolom) || (q.kolom && q.kolom === (q.baris ?? 'kecamatan')))
    throw new HttpError(400, 'variabel', 'Variabel baris atau kolom tidak dikenal.');
  const { where, params } = filterSekolah(q);
  const { results } = await c.env.DB.prepare(
    `SELECT ${baris} AS baris, ${kolom ?? "''"} AS kolom, COUNT(*) AS n FROM sekolah WHERE ${where} GROUP BY 1, 2 ORDER BY 1, 2`,
  )
    .bind(...params)
    .all<{ baris: string; kolom: string; n: number }>();
  return c.json({ baris: q.baris ?? 'kecamatan', kolom: q.kolom ?? null, sel: results });
});

publik.get('/sekolah/titik', cachePublik(300), async (c) => {
  const tampil = KOORDINAT_TAMPIL.map(() => '?').join(',');
  const { results } = await c.env.DB.prepare(
    `SELECT npsn, nama, jenjang, status, kode_kec, lat, lon FROM sekolah
      WHERE is_published = 1 AND lat IS NOT NULL AND koordinat_status IN (${tampil})`,
  )
    .bind(...KOORDINAT_TAMPIL)
    .all<{
      npsn: string;
      nama: string;
      jenjang: string;
      status: string;
      kode_kec: string;
      lat: number;
      lon: number;
    }>();
  return c.json({
    type: 'FeatureCollection',
    features: results.map(({ lat, lon, ...props }) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: props,
    })),
  });
});

publik.get('/sekolah/ekspor.csv', async (c) => {
  const { where, params } = filterSekolah(c.req.query(), 's.');
  const kolom = [
    'npsn',
    'nama',
    'bentuk',
    'jenjang',
    'status',
    'akreditasi',
    'kode_kec',
    'kecamatan',
    'alamat',
    'kode_pos',
    'lat',
    'lon',
    'koordinat_status',
    'kurikulum',
    'akses_internet',
    'sumber_listrik',
    ...(TAYANG_PD_GURU
      ? (['pd', 'pd_l', 'pd_p', 'rombel', 'guru', 'guru_l', 'guru_p'] as const)
      : ([] as const)),
    'rk_baik',
    'rk_rusak_ringan',
    'rk_rusak_sedang',
    'rk_rusak_berat',
  ] as const;
  const { results } = await c.env.DB.prepare(
    `SELECT s.*, k.nama AS kecamatan FROM sekolah s JOIN kecamatan k ON k.kode = s.kode_kec WHERE ${where} ORDER BY s.kode_kec, s.jenjang, s.nama`,
  )
    .bind(...params)
    .all<Record<(typeof kolom)[number], unknown>>();
  return csvResponse(toCsv(results, kolom), 'sikop-data-sekolah.csv');
});

publik.get('/sekolah/:npsn', cachePublik(120), async (c) => {
  const npsn = c.req.param('npsn').toUpperCase();
  if (!/^[0-9A-Z]{8}$/.test(npsn)) throw tidakDitemukan('Sekolah');
  const s = await c.env.DB.prepare(
    `SELECT s.npsn, s.nama, s.bentuk, s.jenjang, s.status, s.akreditasi, s.alamat, s.dusun, s.rt, s.rw, s.kode_pos,
            s.kode_kec, k.nama AS kecamatan, s.telepon, s.email, s.website, s.yayasan, s.lat, s.lon, s.koordinat_status,
            s.waktu_penyelenggaraan, s.kurikulum, s.sumber_listrik, s.daya_listrik, s.akses_internet, s.luas_tanah,
            s.pd, s.pd_l, s.pd_p, s.rombel, s.guru, s.guru_l, s.guru_p,
            s.rk_baik, s.rk_rusak_ringan, s.rk_rusak_sedang, s.rk_rusak_berat, s.updated_at
       FROM sekolah s JOIN kecamatan k ON k.kode = s.kode_kec
      WHERE s.npsn = ? AND s.is_published = 1`,
  )
    .bind(npsn)
    .first<Record<string, unknown>>();
  if (!s) throw tidakDitemukan('Sekolah');
  if (!TAYANG_PD_GURU)
    for (const k of ['pd', 'pd_l', 'pd_p', 'rombel', 'guru', 'guru_l', 'guru_p']) delete s[k];
  if (!(KOORDINAT_TAMPIL as readonly unknown[]).includes(s.koordinat_status)) {
    s.lat = null;
    s.lon = null;
  }
  const p = await bacaPengaturan(c.env.DB);
  return c.json({
    sekolah: s,
    sumber: p.sumber_data_sekolah ?? '',
    tanggal_data: p.tanggal_data_sekolah ?? '',
  });
});

/* ------------------------- Verifikasi sertifikat ------------------------- */

publik.get('/sertifikat/:kode', batasiLaju('verifikasi'), async (c) => {
  const kode = c.req.param('kode').toUpperCase();
  if (!RE_KODE_VERIFIKASI.test(kode)) throw tidakDitemukan('Sertifikat');
  const s = await c.env.DB.prepare(
    `SELECT nomor, nama_peserta, nip_samaran, instansi, judul_kursus, nilai, terbit_at,
            penandatangan_nama, penandatangan_jabatan, status, dicabut_alasan, dicabut_at
       FROM sertifikat WHERE kode_verifikasi = ?`,
  )
    .bind(kode)
    .first();
  if (!s) throw tidakDitemukan('Sertifikat');
  return c.json({ sertifikat: s });
});

function csvResponse(body: string, nama: string): Response {
  return new Response('﻿' + body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nama}"`,
      'Cache-Control': 'public, max-age=300',
    },
  });
}
