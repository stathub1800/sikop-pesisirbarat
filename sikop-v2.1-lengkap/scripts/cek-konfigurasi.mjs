#!/usr/bin/env node
/**
 * Pemeriksaan konfigurasi produksi (dijalankan di CI dan sebelum deploy).
 * Menggagalkan pipeline bila ada pengaturan yang melemahkan keamanan.
 *
 *   node scripts/cek-konfigurasi.mjs            pemeriksaan umum (CI)
 *   node scripts/cek-konfigurasi.mjs --produksi  juga mewajibkan nilai produksi terisi (deploy)
 */
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const produksi = process.argv.includes('--produksi');
const galat = [];
const api = readFileSync('apps/api/wrangler.toml', 'utf8');
const vars = api.slice(api.indexOf('[vars]'));

if (/DEV_LOGIN/.test(vars.replace(/^#.*$/gm, '')))
  galat.push('DEV_LOGIN tidak boleh ada di [vars] wrangler.toml (hanya .dev.vars lokal).');
if (!/ENVIRONMENT\s*=\s*"production"/.test(vars))
  galat.push('ENVIRONMENT harus "production" di wrangler.toml.');
if (!/workers_dev\s*=\s*false/.test(api))
  galat.push('workers_dev harus false: API hanya boleh diakses lewat Pages.');
if (/ALLOWED_ORIGINS\s*=\s*".*\*/.test(vars))
  galat.push('ALLOWED_ORIGINS tidak boleh memakai wildcard.');
if (produksi) {
  if (/GANTI_DENGAN_ID_DATABASE_D1/.test(api))
    galat.push('database_id D1 belum diisi di apps/api/wrangler.toml.');
  if (/GOOGLE_CLIENT_ID\s*=\s*""/.test(vars))
    galat.push('GOOGLE_CLIENT_ID belum diisi: peserta dan admin tidak akan bisa masuk.');
}

// Berkas berisi kunci jawaban atau rahasia tidak boleh dilacak git.
try {
  const terlacak = execSync('git ls-files', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).split('\n');
  for (const f of ['data/lms/bank-soal.json', 'apps/api/.dev.vars', '.env', 'build/seed-lms.sql']) {
    if (terlacak.includes(f))
      galat.push(`${f} ter-commit ke git. Hapus dari riwayat dan rotasi isinya.`);
  }
  // Salinan bank soal yang diserahkan (RAHASIA-*.json) juga tidak boleh ikut ter-commit.
  for (const f of terlacak.filter((x) => /(^|\/)RAHASIA-/.test(x)))
    galat.push(`${f} ter-commit ke git. Hapus dari riwayat dan rotasi isinya.`);
  // Data per desa (mis. DBF Podes) hanya boleh berada di komputer pengolah (ADR-0005).
  for (const f of terlacak.filter((x) => /\.dbf$/i.test(x) || x.startsWith('data/private/')))
    galat.push(`${f} ter-commit ke git. Data per desa tidak boleh di-commit; hapus dari riwayat.`);
} catch {
  /* bukan repositori git (mis. arsip zip); lewati */
}

const headers = existsSync('apps/web/public/_headers')
  ? readFileSync('apps/web/public/_headers', 'utf8')
  : '';
const csp = /Content-Security-Policy:(.*)/.exec(headers)?.[1] ?? '';
if (!csp) galat.push('Content-Security-Policy tidak ditemukan di apps/web/public/_headers.');
if (/'unsafe-inline'|'unsafe-eval'/.test(csp))
  galat.push("CSP tidak boleh memuat 'unsafe-inline' atau 'unsafe-eval' (R03).");
if (!/frame-ancestors 'none'/.test(csp)) galat.push("CSP harus memuat frame-ancestors 'none'.");

if (galat.length) {
  console.error('Pemeriksaan konfigurasi GAGAL:\n- ' + galat.join('\n- '));
  process.exit(1);
}
console.log(`Pemeriksaan konfigurasi lolos${produksi ? ' (mode produksi)' : ''}.`);
