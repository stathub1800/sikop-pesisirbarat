#!/usr/bin/env node
/**
 * Membuat seed ruang belajar.
 *
 *   node scripts/build-lms-seed.mjs            data/lms/bank-soal.json  ->  build/seed-lms.sql
 *   node scripts/build-lms-seed.mjs --contoh   data/lms/kursus-contoh.json  ->  apps/api/test/fixtures/seed-lms-contoh.sql
 *   node scripts/build-lms-seed.mjs --contoh --cek   gagal bila berkas seed contoh tidak sesuai sumbernya
 *
 * bank-soal.json berisi KUNCI JAWABAN, sehingga:
 *  - berkas itu ada di .gitignore dan tidak boleh di-commit;
 *  - seed hanya dijalankan oleh pengelola dari komputer kerja, bukan dari CI.
 * Setelah tersimpan di D1, kunci hanya dapat dibaca lewat endpoint admin.
 *
 * Kursus contoh (data/lms/kursus-contoh.json) SINTETIS: soal dan kuncinya dibuat untuk uji, boleh di-commit.
 * Bank soal asli tetap di luar repositori.
 *
 * Seed bersifat idempoten: yang sudah ada TIDAK ditimpa (INSERT OR IGNORE), agar suntingan admin tidak hilang.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bangunSeedLms } from './lib/lms-seed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const contoh = process.argv.includes('--contoh');
const cek = process.argv.includes('--cek');
const SRC = join(ROOT, contoh ? 'data/lms/kursus-contoh.json' : 'data/lms/bank-soal.json');
const OUT = contoh
  ? join(ROOT, 'apps/api/test/fixtures/seed-lms-contoh.sql')
  : join(ROOT, 'build/seed-lms.sql');

if (!existsSync(SRC)) {
  console.error(
    `${SRC.replace(ROOT + '/', '')} tidak ditemukan. Lihat data/lms/bank-soal.example.json untuk formatnya.`,
  );
  process.exit(1);
}
const { sql, galat, ringkasan } = bangunSeedLms(JSON.parse(readFileSync(SRC, 'utf8')));
if (galat.length) {
  console.error('Bank soal tidak valid:\n- ' + galat.join('\n- '));
  process.exit(1);
}
if (cek) {
  const ada = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (ada !== sql) {
    console.error(
      'apps/api/test/fixtures/seed-lms-contoh.sql tidak sesuai data/lms/kursus-contoh.json. Jalankan: npm run data:lms:contoh',
    );
    process.exit(1);
  }
  console.log(`OK: seed kursus contoh sesuai sumbernya (${ringkasan}).`);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, sql);
  console.log(`OK: ${ringkasan} → ${OUT.replace(ROOT + '/', '')}`);
}
