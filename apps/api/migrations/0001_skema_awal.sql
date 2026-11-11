-- Migration: 0001_skema_awal
-- Skema awal SIKOP v2 untuk Cloudflare D1 (SQLite).
-- Prinsip: kunci jawaban, data pribadi, dan audit log hanya dapat diakses lewat Worker.
-- Setiap tabel yang diedit admin punya kolom version (optimistic locking) dan updated_by.

PRAGMA foreign_keys = ON;

-- =====================================================================
-- WILAYAH
-- =====================================================================
CREATE TABLE kecamatan (
  kode            TEXT PRIMARY KEY CHECK (length(kode) = 7),
  kode_kemendagri TEXT NOT NULL UNIQUE,
  nama            TEXT NOT NULL UNIQUE,
  urutan          INTEGER NOT NULL,
  luas_km2_peta   REAL,              -- dihitung dari poligon batas; bersifat indikatif
  bbox_json       TEXT               -- [minLon, minLat, maxLon, maxLat]
);

-- =====================================================================
-- SEKOLAH
-- =====================================================================
CREATE TABLE sekolah (
  npsn                  TEXT PRIMARY KEY CHECK (length(npsn) = 8),
  sekolah_id            TEXT,
  nama                  TEXT NOT NULL,
  bentuk                TEXT NOT NULL,
  jenjang               TEXT NOT NULL CHECK (jenjang IN ('PAUD','SD/MI','SMP/MTs','SMA/SMK/MA','SLB','Nonformal')),
  status                TEXT NOT NULL CHECK (status IN ('Negeri','Swasta')),
  akreditasi            TEXT,
  alamat                TEXT,
  dusun                 TEXT,
  rt                    TEXT,
  rw                    TEXT,
  kode_pos              TEXT,
  kode_kec              TEXT NOT NULL REFERENCES kecamatan(kode),
  telepon               TEXT,
  email                 TEXT,
  website               TEXT,
  yayasan               TEXT,
  lat                   REAL,
  lon                   REAL,
  koordinat_status      TEXT NOT NULL DEFAULT 'tidak_ada'
                        CHECK (koordinat_status IN ('valid','diperbaiki','beda_kecamatan','di_luar_batas','tidak_ada')),
  koordinat_catatan     TEXT,
  waktu_penyelenggaraan TEXT,
  kurikulum             TEXT,
  sumber_listrik        TEXT,
  daya_listrik          INTEGER,
  akses_internet        TEXT,
  luas_tanah            INTEGER,
  pd                    INTEGER NOT NULL DEFAULT 0 CHECK (pd >= 0),
  pd_l                  INTEGER NOT NULL DEFAULT 0 CHECK (pd_l >= 0),
  pd_p                  INTEGER NOT NULL DEFAULT 0 CHECK (pd_p >= 0),
  rombel                INTEGER NOT NULL DEFAULT 0 CHECK (rombel >= 0),
  guru                  INTEGER NOT NULL DEFAULT 0 CHECK (guru >= 0),
  guru_l                INTEGER NOT NULL DEFAULT 0 CHECK (guru_l >= 0),
  guru_p                INTEGER NOT NULL DEFAULT 0 CHECK (guru_p >= 0),
  rk_baik               INTEGER NOT NULL DEFAULT 0 CHECK (rk_baik >= 0),
  rk_rusak_ringan       INTEGER NOT NULL DEFAULT 0 CHECK (rk_rusak_ringan >= 0),
  rk_rusak_sedang       INTEGER NOT NULL DEFAULT 0 CHECK (rk_rusak_sedang >= 0),
  rk_rusak_berat        INTEGER NOT NULL DEFAULT 0 CHECK (rk_rusak_berat >= 0),
  is_published          INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0,1)),
  version               INTEGER NOT NULL DEFAULT 1,
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by            TEXT NOT NULL DEFAULT 'pipeline',
  CHECK (pd = pd_l + pd_p),
  CHECK (guru = guru_l + guru_p)
);
CREATE INDEX idx_sekolah_kec ON sekolah(kode_kec, jenjang);
CREATE INDEX idx_sekolah_nama ON sekolah(nama COLLATE NOCASE);
CREATE INDEX idx_sekolah_koordinat ON sekolah(koordinat_status);

-- =====================================================================
-- INDIKATOR MANUAL (indikator turunan data sekolah dihitung di Worker)
-- =====================================================================
CREATE TABLE indikator (
  id               TEXT PRIMARY KEY,
  nama             TEXT NOT NULL,
  satuan           TEXT NOT NULL,
  kategori         TEXT NOT NULL,
  sumber           TEXT,
  tahun            TEXT,
  metode           TEXT,
  desimal          INTEGER NOT NULL DEFAULT 0,
  arah             TEXT NOT NULL DEFAULT 'netral' CHECK (arah IN ('naik_baik','turun_baik','netral')),
  agregasi         TEXT NOT NULL DEFAULT 'jumlah' CHECK (agregasi IN ('jumlah','rasio','tidak_ada')),
  kabupaten_nilai  REAL,             -- wajib diisi manual bila agregasi = 'rasio'
  is_published     INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0,1)),
  urutan           INTEGER NOT NULL DEFAULT 100,
  catatan_internal TEXT,
  version          INTEGER NOT NULL DEFAULT 1,
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by       TEXT NOT NULL DEFAULT 'pipeline',
  -- Indikator hanya boleh tayang bila sumber, tahun, dan cara hitung lengkap (T04).
  CHECK (is_published = 0 OR (sumber IS NOT NULL AND tahun IS NOT NULL AND metode IS NOT NULL))
);

CREATE TABLE indikator_nilai (
  indikator_id TEXT NOT NULL REFERENCES indikator(id) ON DELETE CASCADE,
  kode_kec     TEXT NOT NULL REFERENCES kecamatan(kode),
  nilai        REAL,
  PRIMARY KEY (indikator_id, kode_kec)
);

-- =====================================================================
-- AKUN, PERAN, SESI
-- =====================================================================
CREATE TABLE akun (
  id          TEXT PRIMARY KEY,
  google_sub  TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL UNIQUE,
  nama        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_login  TEXT
);

-- Daftar admin berdasar email (provisioning sebelum login pertama).
CREATE TABLE admin_peran (
  email      TEXT PRIMARY KEY,
  nama       TEXT NOT NULL,
  peran      TEXT NOT NULL CHECK (peran IN ('superadmin','editor_data','pengelola_lms','petugas_pst')),
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Token sesi disimpan sebagai hash SHA-256; token asli hanya ada di cookie HttpOnly.
CREATE TABLE sesi (
  token_hash TEXT PRIMARY KEY,
  akun_id    TEXT NOT NULL REFERENCES akun(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  ua         TEXT
);
CREATE INDEX idx_sesi_akun ON sesi(akun_id);
CREATE INDEX idx_sesi_expires ON sesi(expires_at);

-- =====================================================================
-- RUANG BELAJAR (LMS)
-- =====================================================================
CREATE TABLE kursus (
  id                 TEXT PRIMARY KEY,
  kode               TEXT NOT NULL UNIQUE,
  judul              TEXT NOT NULL,
  subjudul           TEXT NOT NULL DEFAULT '',
  deskripsi          TEXT NOT NULL,
  kategori           TEXT NOT NULL DEFAULT '',
  estimasi           TEXT NOT NULL DEFAULT '',
  nilai_lulus_akhir  INTEGER NOT NULL DEFAULT 80,
  durasi_akhir_menit INTEGER NOT NULL DEFAULT 45,
  jumlah_soal_akhir  INTEGER NOT NULL DEFAULT 30,
  is_published       INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0,1)),
  urutan             INTEGER NOT NULL DEFAULT 1,
  version            INTEGER NOT NULL DEFAULT 1,
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by         TEXT NOT NULL DEFAULT 'pipeline'
);

CREATE TABLE modul (
  id             INTEGER PRIMARY KEY,
  kursus_id      TEXT NOT NULL REFERENCES kursus(id),
  nomor          INTEGER NOT NULL,
  kode           TEXT NOT NULL UNIQUE,
  judul          TEXT NOT NULL,
  subjudul       TEXT NOT NULL DEFAULT '',
  deskripsi      TEXT NOT NULL,
  kategori       TEXT NOT NULL DEFAULT '',
  estimasi       TEXT NOT NULL DEFAULT '',
  nilai_lulus    INTEGER NOT NULL DEFAULT 75,
  ringkasan      TEXT NOT NULL DEFAULT '',
  video_json     TEXT NOT NULL DEFAULT '[]',
  kompetensi_json TEXT NOT NULL DEFAULT '[]',
  sumber_json    TEXT NOT NULL DEFAULT '[]',
  is_published   INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0,1)),
  version        INTEGER NOT NULL DEFAULT 1,
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by     TEXT NOT NULL DEFAULT 'pipeline',
  UNIQUE (kursus_id, nomor)
);

-- Kolom kunci TIDAK PERNAH dipilih oleh endpoint publik/peserta (diuji di test/keamanan).
CREATE TABLE soal (
  id          INTEGER PRIMARY KEY,
  kursus_id   TEXT NOT NULL REFERENCES kursus(id),
  modul_id    INTEGER REFERENCES modul(id),
  jenis       TEXT NOT NULL CHECK (jenis IN ('pre','post','akhir')),
  urutan      INTEGER NOT NULL DEFAULT 0,
  pertanyaan  TEXT NOT NULL,
  opsi_json   TEXT NOT NULL,
  kunci       TEXT NOT NULL CHECK (kunci IN ('A','B','C','D','E')),
  pembahasan  TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by  TEXT NOT NULL DEFAULT 'pipeline',
  CHECK ((jenis = 'akhir' AND modul_id IS NULL) OR (jenis <> 'akhir' AND modul_id IS NOT NULL))
);
CREATE INDEX idx_soal_modul ON soal(modul_id, jenis, is_active);
CREATE INDEX idx_soal_kursus ON soal(kursus_id, jenis, is_active);

CREATE TABLE peserta (
  akun_id         TEXT PRIMARY KEY REFERENCES akun(id) ON DELETE CASCADE,
  nama            TEXT NOT NULL,
  nip             TEXT NOT NULL UNIQUE CHECK (length(nip) = 18),
  instansi        TEXT NOT NULL,
  jabatan         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','terverifikasi','ditolak','nonaktif')),
  catatan         TEXT,
  setuju_privasi_at TEXT NOT NULL,
  privasi_versi   TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  verified_at     TEXT,
  verified_by     TEXT
);
CREATE INDEX idx_peserta_status ON peserta(status);

-- Percobaan ujian. Waktu dihitung server (batas_at), bukan browser (perbaikan K02).
CREATE TABLE percobaan (
  id            TEXT PRIMARY KEY,
  akun_id       TEXT NOT NULL REFERENCES akun(id) ON DELETE CASCADE,
  kursus_id     TEXT NOT NULL REFERENCES kursus(id),
  modul_id      INTEGER REFERENCES modul(id),
  jenis         TEXT NOT NULL CHECK (jenis IN ('pre','post','akhir')),
  soal_ids_json TEXT NOT NULL,
  jawaban_json  TEXT NOT NULL DEFAULT '{}',
  mulai_at      TEXT NOT NULL,
  batas_at      TEXT NOT NULL,
  selesai_at    TEXT,
  benar         INTEGER,
  total         INTEGER,
  nilai         REAL,
  lulus         INTEGER CHECK (lulus IN (0,1))
);
CREATE INDEX idx_percobaan_akun ON percobaan(akun_id, kursus_id, jenis, modul_id);

CREATE TABLE sertifikat (
  nomor                 TEXT PRIMARY KEY,
  kode_verifikasi       TEXT NOT NULL UNIQUE,
  akun_id               TEXT NOT NULL REFERENCES akun(id),
  kursus_id             TEXT NOT NULL REFERENCES kursus(id),
  percobaan_id          TEXT NOT NULL UNIQUE REFERENCES percobaan(id),
  urut                  INTEGER NOT NULL,
  tahun                 INTEGER NOT NULL,
  nama_peserta          TEXT NOT NULL,
  nip_samaran           TEXT NOT NULL,
  instansi              TEXT NOT NULL,
  judul_kursus          TEXT NOT NULL,
  nilai                 REAL NOT NULL,
  terbit_at             TEXT NOT NULL,
  penandatangan_nama    TEXT NOT NULL,
  penandatangan_jabatan TEXT NOT NULL,
  penandatangan_nip     TEXT,
  status                TEXT NOT NULL DEFAULT 'sah' CHECK (status IN ('sah','dicabut')),
  dicabut_alasan        TEXT,
  dicabut_at            TEXT,
  dicabut_by            TEXT,
  UNIQUE (akun_id, kursus_id),
  UNIQUE (kursus_id, tahun, urut)
);

-- =====================================================================
-- LAYANAN DATA (PST), perbaikan K03
-- =====================================================================
CREATE TABLE permohonan (
  id                INTEGER PRIMARY KEY,
  tiket             TEXT NOT NULL UNIQUE,
  nama              TEXT NOT NULL,
  email             TEXT NOT NULL,
  no_hp             TEXT,
  instansi          TEXT,
  kategori          TEXT NOT NULL,
  pesan             TEXT NOT NULL,
  setuju_privasi_at TEXT NOT NULL,
  privasi_versi     TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'baru' CHECK (status IN ('baru','diproses','selesai','ditolak')),
  tanggapan         TEXT,
  catatan_internal  TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ditangani_oleh    TEXT
);
CREATE INDEX idx_permohonan_status ON permohonan(status, created_at);

-- =====================================================================
-- PENGATURAN SITUS
-- =====================================================================
CREATE TABLE pengaturan (
  kunci      TEXT PRIMARY KEY,
  nilai      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by TEXT NOT NULL DEFAULT 'pipeline'
);

-- =====================================================================
-- AUDIT TRAIL: tidak dapat diubah atau dihapus (ISO 27001 A.8.15)
-- =====================================================================
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY,
  waktu       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  aktor       TEXT NOT NULL,
  peran       TEXT,
  aksi        TEXT NOT NULL,
  entitas     TEXT NOT NULL,
  entitas_id  TEXT,
  sebelum     TEXT,
  sesudah     TEXT,
  request_id  TEXT,
  ip_hash     TEXT
);
CREATE INDEX idx_audit_entitas ON audit_log(entitas, entitas_id);
CREATE INDEX idx_audit_waktu ON audit_log(waktu);

CREATE TRIGGER audit_log_tanpa_ubah BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log tidak dapat diubah');
END;

CREATE TRIGGER audit_log_tanpa_hapus BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log tidak dapat dihapus');
END;
