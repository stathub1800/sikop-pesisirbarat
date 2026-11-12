-- Fase 3 (ADR-0008): bab dan pelajaran punya status draf/terbit, versi untuk penguncian optimistis,
-- dan jejak penyunting terakhir. Hanya penambahan kolom; data lama tetap terbit (default 1).
PRAGMA foreign_keys = ON;

ALTER TABLE bab ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0,1));
ALTER TABLE bab ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bab ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
ALTER TABLE bab ADD COLUMN updated_by TEXT NOT NULL DEFAULT 'pipeline';

ALTER TABLE pelajaran ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0,1));
ALTER TABLE pelajaran ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pelajaran ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
ALTER TABLE pelajaran ADD COLUMN updated_by TEXT NOT NULL DEFAULT 'pipeline';
