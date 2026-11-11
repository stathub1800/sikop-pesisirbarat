#!/usr/bin/env node
/**
 * Membuat build/seed-lms.sql dari data/lms/bank-soal.json.
 *
 * bank-soal.json berisi KUNCI JAWABAN, sehingga:
 *  - berkas itu ada di .gitignore dan tidak boleh di-commit;
 *  - seed hanya dijalankan oleh pengelola dari komputer kerja, bukan dari CI.
 * Setelah tersimpan di D1, kunci hanya dapat dibaca lewat endpoint admin.
 *
 * Seed bersifat idempoten: kursus/modul/soal yang sudah ada TIDAK ditimpa (INSERT OR IGNORE),
 * agar suntingan admin di panel tidak hilang.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ModulInputSchema,
  KursusInputSchema,
  SoalInputSchema,
} from '../packages/shared/src/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'data/lms/bank-soal.json');
if (!existsSync(SRC)) {
  console.error(
    'data/lms/bank-soal.json tidak ditemukan. Lihat data/lms/bank-soal.example.json untuk formatnya.',
  );
  process.exit(1);
}
const bank = JSON.parse(readFileSync(SRC, 'utf8'));
const q = (v) =>
  v === null || v === undefined
    ? 'NULL'
    : typeof v === 'number'
      ? String(v)
      : `'${String(v).replace(/'/g, "''")}'`;
const b = (v) => (v ? 1 : 0);
const sql = [
  '-- Dihasilkan oleh scripts/build-lms-seed.mjs. BERISI KUNCI JAWABAN: jangan di-commit.',
  'PRAGMA foreign_keys = ON;',
];
const galat = [];

for (const k of bank.kursus) {
  const v = KursusInputSchema.safeParse({ ...k, version: 1 });
  if (!v.success) galat.push(`kursus ${k.id}: ${v.error.issues.map((i) => i.message).join('; ')}`);
  sql.push(
    `INSERT OR IGNORE INTO kursus (id, kode, judul, subjudul, deskripsi, kategori, estimasi, nilai_lulus_akhir, durasi_akhir_menit, jumlah_soal_akhir, is_published, urutan) VALUES (${[
      k.id,
      k.kode,
      k.judul,
      k.subjudul,
      k.deskripsi,
      k.kategori,
      k.estimasi,
      k.nilai_lulus_akhir,
      k.durasi_akhir_menit,
      k.jumlah_soal_akhir,
    ]
      .map(q)
      .join(', ')}, ${b(k.is_published)}, ${k.urutan ?? 1});`,
  );
}

for (const m of bank.modul) {
  const v = ModulInputSchema.safeParse({ ...m, version: 1 });
  if (!v.success)
    galat.push(
      `modul ${m.kode}: ${v.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
    );
  sql.push(
    `INSERT OR IGNORE INTO modul (id, kursus_id, nomor, kode, judul, subjudul, deskripsi, kategori, estimasi, nilai_lulus, ringkasan, video_json, kompetensi_json, sumber_json, is_published) VALUES (${[
      m.id,
      m.kursus_id,
      m.nomor,
      m.kode,
      m.judul,
      m.subjudul,
      m.deskripsi,
      m.kategori,
      m.estimasi,
      m.nilai_lulus,
      m.ringkasan,
      JSON.stringify(m.video),
      JSON.stringify(m.kompetensi),
      JSON.stringify(m.sumber),
    ]
      .map(q)
      .join(', ')}, ${b(m.is_published)});`,
  );
}

const idSoal = new Set();
for (const s of bank.soal) {
  const v = SoalInputSchema.safeParse(s);
  if (!v.success) galat.push(`soal ${s.id}: ${v.error.issues.map((i) => i.message).join('; ')}`);
  if (idSoal.has(s.id)) galat.push(`soal ${s.id}: id ganda`);
  idSoal.add(s.id);
  sql.push(
    `INSERT OR IGNORE INTO soal (id, kursus_id, modul_id, jenis, urutan, pertanyaan, opsi_json, kunci, pembahasan, is_active) VALUES (${[
      s.id,
      s.kursus_id,
      s.modul_id,
      s.jenis,
      s.urutan,
      s.pertanyaan,
      JSON.stringify(s.opsi),
      s.kunci,
      s.pembahasan ?? null,
    ]
      .map(q)
      .join(', ')}, ${b(s.is_active ?? true)});`,
  );
}

if (galat.length) {
  console.error('Bank soal tidak valid:\n- ' + galat.join('\n- '));
  process.exit(1);
}
mkdirSync(join(ROOT, 'build'), { recursive: true });
writeFileSync(join(ROOT, 'build/seed-lms.sql'), sql.join('\n') + '\n');
const per = bank.soal.reduce((a, s) => ((a[s.jenis] = (a[s.jenis] ?? 0) + 1), a), {});
console.log(
  `OK: ${bank.kursus.length} kursus, ${bank.modul.length} modul, ${bank.soal.length} soal (${JSON.stringify(per)}) → build/seed-lms.sql`,
);
