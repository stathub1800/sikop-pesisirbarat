#!/usr/bin/env node
/**
 * Menguji migrasi 0003 terhadap data bergaya produksi: basis data diisi lewat 0001 dan 0002 dengan
 * kursus, modul (video, ringkasan, sumber), dan peserta lama, lalu 0003 diterapkan dan hasilnya diperiksa.
 * Memakai node:sqlite bawaan Node (tanpa dependensi baru). SQLite D1 adalah SQLite biasa, jadi
 * hasilnya sama dengan D1.
 *
 *   node scripts/uji-migrasi.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const mig = (n) => readFileSync(join(ROOT, 'apps/api/migrations', n), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(mig('0001_skema_awal.sql'));
db.exec(mig('0002_podes.sql'));

/* ---- Data lama bergaya produksi ---- */
db.exec(`
INSERT INTO kursus (id, kode, judul, deskripsi, is_published) VALUES ('lama', 'LAMA-1', 'Kursus Lama', 'Deskripsi kursus lama.', 1);
INSERT INTO modul (id, kursus_id, nomor, kode, judul, deskripsi, ringkasan, video_json, kompetensi_json, sumber_json, is_published) VALUES
 (1, 'lama', 1, 'L-01', 'Modul Satu', 'Deskripsi satu.', 'Ringkasan modul satu.',
  '[{"judul":"Bagian 1","url":"https://www.youtube-nocookie.com/embed/AAAAAAAAAAA","durasi":"14:20"},{"judul":"Bagian 2","url":"https://www.youtube-nocookie.com/embed/BBBBBBBBBBB","durasi":""}]',
  '[]',
  '[{"judul":"Perpres [39]/2019","format":"PDF","url":"https://peraturan.bpk.go.id/a.pdf","penerbit":"JDIH BPK"},{"judul":"Panduan web","format":"HTML","url":"https://contoh.go.id/panduan","penerbit":""}]', 1),
 (2, 'lama', 2, 'L-02', 'Modul Dua', 'Deskripsi dua.', '', '[]', '[]', '[]', 0);
INSERT INTO akun (id, google_sub, email, nama) VALUES ('a1', 'g1', 'a1@contoh.id', 'Ani'), ('a2', 'g2', 'a2@contoh.id', 'Budi');
INSERT INTO peserta (akun_id, nama, nip, instansi, jabatan, status, catatan, setuju_privasi_at, privasi_versi, verified_at, verified_by)
 VALUES ('a1', 'Ani Lestari', '198501012010011001', 'Dinas A', 'Statistisi', 'terverifikasi', NULL, '2026-11-01T00:00:00Z', '1.0', '2026-11-02T00:00:00Z', 'admin@contoh.id'),
        ('a2', 'Budi Santoso', '199001012015011002', 'Dinas B', 'Analis', 'menunggu', 'catatan', '2026-11-03T00:00:00Z', '1.0', NULL, NULL);
`);

/* ---- Terapkan 0003 ---- */
db.exec(mig('0003_lms_pelajaran.sql'));

const semua = (sql) => db.prepare(sql).all();
const satu = (sql) => db.prepare(sql).get();

/* Kursus: kolom baru bernilai bawaan. */
assert.deepEqual(
  {
    ...satu(
      "SELECT level, sasaran_json, hasil_belajar_json, durasi_menit, gambar_url FROM kursus WHERE id = 'lama'",
    ),
  },
  {
    level: 'dasar',
    sasaran_json: '[]',
    hasil_belajar_json: '[]',
    durasi_menit: 0,
    gambar_url: null,
  },
);

/* Bab: satu modul = satu bab, id sama. */
assert.deepEqual(
  semua('SELECT id, kursus_id, modul_id, urutan, judul FROM bab ORDER BY id').map((r) => ({
    ...r,
  })),
  [
    { id: 1, kursus_id: 'lama', modul_id: 1, urutan: 1, judul: 'Modul Satu' },
    { id: 2, kursus_id: 'lama', modul_id: 2, urutan: 2, judul: 'Modul Dua' },
  ],
);

/* Pelajaran: video, ringkasan, sumber; semuanya tidak wajib. */
const pel = semua(
  'SELECT id, bab_id, urutan, judul, jenis, isi_json, durasi_menit, wajib FROM pelajaran ORDER BY id',
).map((r) => ({
  ...r,
  isi: JSON.parse(r.isi_json),
}));
assert.deepEqual(
  pel.map((p) => [p.id, p.bab_id, p.urutan, p.jenis, p.wajib]),
  [
    [101, 1, 1, 'video', 0],
    [102, 1, 2, 'video', 0],
    [120, 1, 20, 'bacaan', 0],
    [130, 1, 30, 'pdf', 0],
    [131, 1, 31, 'bacaan', 0],
  ],
);
assert.equal(pel[0].judul, 'Bagian 1');
assert.deepEqual(pel[0].isi, {
  url: 'https://www.youtube-nocookie.com/embed/AAAAAAAAAAA',
  durasi: '14:20',
});
assert.equal(pel[0].durasi_menit, 15);
assert.deepEqual(pel[1].isi, {
  url: 'https://www.youtube-nocookie.com/embed/BBBBBBBBBBB',
  durasi: null,
});
assert.equal(pel[1].durasi_menit, 0);
assert.deepEqual(pel[2].isi, { markdown: 'Ringkasan modul satu.' });
assert.deepEqual(pel[3].isi, { url: 'https://peraturan.bpk.go.id/a.pdf', penerbit: 'JDIH BPK' });
assert.equal(pel[3].judul, 'Perpres [39]/2019');
assert.deepEqual(pel[4].isi, { markdown: '[Panduan web](https://contoh.go.id/panduan)' });
assert.equal(
  satu('SELECT COUNT(*) AS n FROM pelajaran WHERE bab_id = 2').n,
  0,
  'modul tanpa materi tidak menghasilkan pelajaran',
);

/* Peserta lama: disalin utuh dengan kategori asn. */
const p = semua('SELECT * FROM peserta ORDER BY akun_id').map((r) => ({ ...r }));
assert.equal(p.length, 2);
assert.deepEqual(
  p.map((r) => [
    r.akun_id,
    r.kategori,
    r.nama,
    r.nip,
    r.instansi,
    r.jabatan,
    r.status,
    r.catatan,
    r.verified_by,
  ]),
  [
    [
      'a1',
      'asn',
      'Ani Lestari',
      '198501012010011001',
      'Dinas A',
      'Statistisi',
      'terverifikasi',
      null,
      'admin@contoh.id',
    ],
    [
      'a2',
      'asn',
      'Budi Santoso',
      '199001012015011002',
      'Dinas B',
      'Analis',
      'menunggu',
      'catatan',
      null,
    ],
  ],
);

/* Aturan baru: NIP boleh kosong untuk non-ASN, tetapi wajib untuk ASN. */
db.exec(
  `INSERT INTO akun (id, google_sub, email, nama) VALUES ('a3', 'g3', 'a3@contoh.id', 'Citra'), ('a4', 'g4', 'a4@contoh.id', 'Dedi'), ('a5', 'g5', 'a5@contoh.id', 'Eka')`,
);
const ins = (id, kategori, nip) =>
  db
    .prepare(
      "INSERT INTO peserta (akun_id, kategori, nama, nip, instansi, status, setuju_privasi_at, privasi_versi) VALUES (?, ?, 'X Y Z', ?, 'Asal', 'menunggu', '2026-11-04', '1.0')",
    )
    .run(id, kategori, nip);
ins('a3', 'umum', null);
ins('a4', 'pelajar', null);
assert.throws(() => ins('a5', 'asn', null), /CHECK/);
assert.throws(() => ins('a5', 'asn', '123'), /CHECK/);
assert.throws(() => ins('a5', 'asn', '198501012010011001'), /UNIQUE/);

/* Kunci asing dan indeks. */
assert.deepEqual(semua('PRAGMA foreign_key_check'), []);
assert.ok(
  satu("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_peserta_status'"),
);
assert.ok(satu("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'peserta'"));
assert.equal(satu("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'peserta_baru'").n, 0);

/* Cermin pemetaan di skrip seed menghasilkan hasil yang sama untuk data yang sama. */
const { pemetaanDariModul } = await import('./lib/lms-seed.mjs');
const hasil = pemetaanDariModul([
  {
    id: 1,
    kursus_id: 'lama',
    nomor: 1,
    judul: 'Modul Satu',
    ringkasan: 'Ringkasan modul satu.',
    video: [
      {
        judul: 'Bagian 1',
        url: 'https://www.youtube-nocookie.com/embed/AAAAAAAAAAA',
        durasi: '14:20',
      },
      { judul: 'Bagian 2', url: 'https://www.youtube-nocookie.com/embed/BBBBBBBBBBB', durasi: '' },
    ],
    sumber: [
      {
        judul: 'Perpres [39]/2019',
        format: 'PDF',
        url: 'https://peraturan.bpk.go.id/a.pdf',
        penerbit: 'JDIH BPK',
      },
      { judul: 'Panduan web', format: 'HTML', url: 'https://contoh.go.id/panduan', penerbit: '' },
    ],
  },
]);
assert.deepEqual(
  hasil.pelajaran.map((x) => [
    x.id,
    x.bab_id,
    x.urutan,
    x.jenis,
    x.judul,
    x.isi,
    x.durasi_menit,
    x.wajib,
  ]),
  pel.map((x) => [
    x.id,
    x.bab_id,
    x.urutan,
    x.jenis,
    x.judul,
    x.isi,
    x.durasi_menit,
    Boolean(x.wajib),
  ]),
  'pemetaan skrip seed harus sama dengan migrasi',
);

/* ---- Terapkan 0004: data lama tetap terbit, kolom penyusun tersedia ---- */
db.exec(mig('0004_penyusun_kursus.sql'));
const nBab = satu('SELECT COUNT(*) AS n FROM bab').n;
const nPel = satu('SELECT COUNT(*) AS n FROM pelajaran').n;
assert.ok(nBab > 0 && nPel > 0, 'data bab dan pelajaran hasil 0003 harus ada');
assert.equal(satu('SELECT COUNT(*) AS n FROM bab WHERE is_published = 1 AND version = 1').n, nBab);
assert.equal(
  satu(
    "SELECT COUNT(*) AS n FROM pelajaran WHERE is_published = 1 AND version = 1 AND updated_by = 'pipeline'",
  ).n,
  nPel,
);
assert.throws(() => db.exec('UPDATE bab SET is_published = 2'), /CHECK/);

console.log('Migrasi 0004 lolos: bab dan pelajaran lama tetap terbit, kolom penyusun tersedia.');
console.log(
  'Migrasi 0003 lolos: pemetaan modul ke bab/pelajaran, peserta lama ke kategori asn, aturan NIP baru.',
);
