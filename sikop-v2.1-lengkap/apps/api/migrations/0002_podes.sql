-- =====================================================================
-- 0002: Potret Desa (Podes) per kecamatan
-- Indikator Podes disimpan di tabel indikator yang sama (id berawalan "podes_") agar otomatis
-- tampil di Peta Tematik, profil kecamatan, dan unduhan CSV. Kolom baru menyimpan pembilang dan
-- penyebut agar situs dapat menulis "84 dari 121 desa". Data per desa TIDAK disimpan di sini.
-- =====================================================================
ALTER TABLE indikator_nilai ADD COLUMN pembilang REAL;
ALTER TABLE indikator_nilai ADD COLUMN penyebut REAL;

ALTER TABLE indikator ADD COLUMN unit_penyebut TEXT;       -- mis. 'desa', 'desa pesisir', 'keluarga'
ALTER TABLE indikator ADD COLUMN rujukan TEXT;             -- rujukan pertanyaan kuesioner, mis. 'R904d'
ALTER TABLE indikator ADD COLUMN kabupaten_pembilang REAL;
ALTER TABLE indikator ADD COLUMN kabupaten_penyebut REAL;
