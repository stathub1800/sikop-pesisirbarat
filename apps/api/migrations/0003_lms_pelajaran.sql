-- =====================================================================
-- 0003: Struktur kursus bab dan pelajaran, progres pelajaran, peserta berkategori (ADR-0007)
-- Migrasi 0001 dan 0002 tidak diubah. Tabel modul, soal, dan percobaan tetap dipakai untuk pre-test,
-- post-test, dan ujian akhir; bab menunjuk ke modul lewat modul_id.
-- =====================================================================
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- Metadata katalog kursus. sasaran_json kosong ([]) berarti untuk semua kategori peserta.
-- ---------------------------------------------------------------------
ALTER TABLE kursus ADD COLUMN level TEXT NOT NULL DEFAULT 'dasar' CHECK (level IN ('dasar','menengah','lanjut'));
ALTER TABLE kursus ADD COLUMN sasaran_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE kursus ADD COLUMN hasil_belajar_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE kursus ADD COLUMN durasi_menit INTEGER NOT NULL DEFAULT 0 CHECK (durasi_menit >= 0);   -- 0 = hitung dari pelajaran
ALTER TABLE kursus ADD COLUMN gambar_url TEXT;   -- jalur gambar di situs sendiri (CSP img-src 'self')

-- ---------------------------------------------------------------------
-- Bab dan pelajaran
-- ---------------------------------------------------------------------
CREATE TABLE bab (
  id        INTEGER PRIMARY KEY,
  kursus_id TEXT NOT NULL REFERENCES kursus(id),
  modul_id  INTEGER REFERENCES modul(id),   -- bab yang punya pre-test dan post-test; NULL bila tanpa evaluasi bab
  urutan    INTEGER NOT NULL,
  judul     TEXT NOT NULL,
  UNIQUE (kursus_id, urutan)
);
CREATE INDEX idx_bab_modul ON bab(modul_id);

CREATE TABLE pelajaran (
  id           INTEGER PRIMARY KEY,
  bab_id       INTEGER NOT NULL REFERENCES bab(id) ON DELETE CASCADE,
  urutan       INTEGER NOT NULL,
  judul        TEXT NOT NULL,
  jenis        TEXT NOT NULL CHECK (jenis IN ('video','bacaan','pdf','latihan')),
  isi_json     TEXT NOT NULL DEFAULT '{}',   -- video: {url,durasi}; bacaan: {markdown}; pdf: {url,penerbit}; latihan: {petunjuk,nilai_lulus}
  durasi_menit INTEGER NOT NULL DEFAULT 0 CHECK (durasi_menit >= 0),
  wajib        INTEGER NOT NULL DEFAULT 1 CHECK (wajib IN (0,1)),
  UNIQUE (bab_id, urutan)
);

-- Soal latihan terpisah dari bank soal ujian. Kolom kunci TIDAK PERNAH dipilih oleh endpoint peserta
-- kecuali untuk menilai di server (diuji di test/keamanan).
CREATE TABLE soal_latihan (
  id           INTEGER PRIMARY KEY,
  pelajaran_id INTEGER NOT NULL REFERENCES pelajaran(id) ON DELETE CASCADE,
  urutan       INTEGER NOT NULL DEFAULT 0,
  pertanyaan   TEXT NOT NULL,
  opsi_json    TEXT NOT NULL,
  kunci        TEXT NOT NULL CHECK (kunci IN ('A','B','C','D','E')),
  pembahasan   TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
);
CREATE INDEX idx_soal_latihan ON soal_latihan(pelajaran_id, is_active);

CREATE TABLE progres_pelajaran (
  akun_id      TEXT NOT NULL REFERENCES akun(id) ON DELETE CASCADE,
  pelajaran_id INTEGER NOT NULL REFERENCES pelajaran(id) ON DELETE CASCADE,
  selesai_pada TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (akun_id, pelajaran_id)
);
CREATE INDEX idx_progres_pelajaran ON progres_pelajaran(pelajaran_id);

-- ---------------------------------------------------------------------
-- Pemetaan data modul lama: satu modul = satu bab (id bab sama dengan id modul).
-- Video menjadi pelajaran video, ringkasan menjadi bacaan, sumber menjadi dokumen atau bacaan.
-- Semua pelajaran hasil pemetaan wajib = 0 agar peserta yang sudah lulus post-test tidak terkunci
-- dari ujian akhir. Pelajaran baru yang dibuat pengelola secara bawaan wajib = 1.
-- Urutan: video 1 sampai 10, ringkasan 20, sumber 30 dan seterusnya. ID pelajaran = id modul * 100 + urutan.
-- ---------------------------------------------------------------------
INSERT INTO bab (id, kursus_id, modul_id, urutan, judul)
SELECT id, kursus_id, id, nomor, judul FROM modul;

INSERT INTO pelajaran (id, bab_id, urutan, judul, jenis, isi_json, durasi_menit, wajib)
SELECT m.id * 100 + j.key + 1,
       m.id,
       j.key + 1,
       COALESCE(NULLIF(json_extract(j.value, '$.judul'), ''), 'Video materi'),
       'video',
       json_object('url', json_extract(j.value, '$.url'), 'durasi', NULLIF(json_extract(j.value, '$.durasi'), '')),
       CASE WHEN instr(COALESCE(json_extract(j.value, '$.durasi'), ''), ':') > 0
            THEN CAST(substr(json_extract(j.value, '$.durasi'), 1, instr(json_extract(j.value, '$.durasi'), ':') - 1) AS INTEGER) + 1
            ELSE 0 END,
       0
  FROM modul m, json_each(m.video_json) j;

INSERT INTO pelajaran (id, bab_id, urutan, judul, jenis, isi_json, durasi_menit, wajib)
SELECT m.id * 100 + 20, m.id, 20, 'Ringkasan materi', 'bacaan', json_object('markdown', m.ringkasan), 3, 0
  FROM modul m
 WHERE trim(m.ringkasan) <> '';

INSERT INTO pelajaran (id, bab_id, urutan, judul, jenis, isi_json, durasi_menit, wajib)
SELECT m.id * 100 + 30 + j.key,
       m.id,
       30 + j.key,
       json_extract(j.value, '$.judul'),
       CASE WHEN upper(COALESCE(json_extract(j.value, '$.format'), '')) = 'PDF' THEN 'pdf' ELSE 'bacaan' END,
       CASE WHEN upper(COALESCE(json_extract(j.value, '$.format'), '')) = 'PDF'
            THEN json_object('url', json_extract(j.value, '$.url'), 'penerbit', NULLIF(json_extract(j.value, '$.penerbit'), ''))
            ELSE json_object('markdown', '[' || replace(replace(json_extract(j.value, '$.judul'), '[', '('), ']', ')') || '](' || json_extract(j.value, '$.url') || ')') END,
       5,
       0
  FROM modul m, json_each(m.sumber_json) j;

-- ---------------------------------------------------------------------
-- Peserta berkategori. SQLite tidak dapat melepas NOT NULL, jadi tabel dibangun ulang dan
-- data lama disalin dengan kategori 'asn'. NIP hanya wajib untuk ASN; jabatan hanya untuk ASN.
-- Kolom instansi menyimpan asal peserta (instansi, pekerjaan, sekolah/kampus, atau kegiatan BPS).
-- ---------------------------------------------------------------------
CREATE TABLE peserta_baru (
  akun_id           TEXT PRIMARY KEY REFERENCES akun(id) ON DELETE CASCADE,
  kategori          TEXT NOT NULL DEFAULT 'asn' CHECK (kategori IN ('asn','umum','pelajar','mitra')),
  nama              TEXT NOT NULL,
  nip               TEXT UNIQUE CHECK (nip IS NULL OR length(nip) = 18),
  instansi          TEXT NOT NULL,
  jabatan           TEXT,
  status            TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','terverifikasi','ditolak','nonaktif')),
  catatan           TEXT,
  setuju_privasi_at TEXT NOT NULL,
  privasi_versi     TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  verified_at       TEXT,
  verified_by       TEXT,
  CHECK (kategori <> 'asn' OR nip IS NOT NULL)
);

INSERT INTO peserta_baru (akun_id, kategori, nama, nip, instansi, jabatan, status, catatan, setuju_privasi_at, privasi_versi,
                          created_at, updated_at, verified_at, verified_by)
SELECT akun_id, 'asn', nama, nip, instansi, jabatan, status, catatan, setuju_privasi_at, privasi_versi,
       created_at, updated_at, verified_at, verified_by
  FROM peserta;

DROP TABLE peserta;
ALTER TABLE peserta_baru RENAME TO peserta;
CREATE INDEX idx_peserta_status ON peserta(status);
