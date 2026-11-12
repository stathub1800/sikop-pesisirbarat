#!/usr/bin/env node
/**
 * Pagar otomatis untuk aturan di AGENTS.md. Dijalankan di CI dan sebelum pull request:
 *
 *   node scripts/cek-pagar.mjs                 pemeriksaan isi repositori
 *   PAGAR_BASE=origin/main node scripts/cek-pagar.mjs   juga memeriksa perubahan terhadap main
 *
 * Setiap pelanggaran menyebut nomor aturan AGENTS.md agar pengembang (atau asisten AI) tahu alasannya.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { extname, join } from 'node:path';

const galat = [];
const LEWATI = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  'playwright-report',
  'test-results',
]);

function telusuri(dir, ekstensi) {
  let hasil = [];
  let isi;
  try {
    isi = readdirSync(dir);
  } catch {
    return hasil;
  }
  for (const nama of isi) {
    if (LEWATI.has(nama)) continue;
    const p = join(dir, nama);
    if (statSync(p).isDirectory()) hasil = hasil.concat(telusuri(p, ekstensi));
    else if (ekstensi.includes(extname(nama))) hasil.push(p);
  }
  return hasil;
}
const baca = (p) => readFileSync(p, 'utf8');

/* C. Tanpa em dash (U+2014) di teks antarmuka, kode, dan dokumen. */
const EM_DASH = String.fromCharCode(0x2014);
const berkasTeks = [
  ...telusuri('apps', ['.ts', '.html', '.css', '.md', '.mjs']),
  ...telusuri('packages', ['.ts', '.md']),
  ...telusuri('scripts', ['.mjs', '.ts']),
  ...telusuri('docs', ['.md']),
  'README.md',
  'CHANGELOG.md',
  'AGENTS.md',
];
for (const f of berkasTeks) {
  let teks;
  try {
    teks = baca(f);
  } catch {
    continue;
  }
  teks.split('\n').forEach((baris, n) => {
    if (baris.includes(EM_DASH))
      galat.push(
        `[C] ${f}:${n + 1} memakai em dash. Ganti dengan titik dua, koma, atau kalimat baru.`,
      );
  });
}

/* B. Menu utama tetap empat (ADR-0006). */
const vite = baca('apps/web/vite.config.ts');
const nav = vite.slice(vite.indexOf('const NAV'), vite.indexOf('];', vite.indexOf('const NAV')));
const idNav = [...nav.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
if (idNav.join(',') !== 'beranda,peta,belajar,layanan')
  galat.push(
    `[B] Menu utama berubah menjadi "${idNav.join(', ')}". Data baru masuk sebagai indikator di Peta Tematik (ADR-0006); perubahan menu wajib ADR baru dan persetujuan pemilik.`,
  );

/* A1. Tidak ada kode desa 10 digit di data publik. */
for (const f of [
  ...telusuri('data/raw', ['.csv', '.json', '.geojson']),
  ...telusuri('apps/web/public', ['.csv', '.json', '.geojson']),
]) {
  if (/(^|[^0-9])1813\d{6}([^0-9]|$)/m.test(baca(f)))
    galat.push(
      `[A1] ${f} memuat kode wilayah 10 digit (tingkat desa). Podes hanya agregat kecamatan.`,
    );
}

/* A2. Butir Podes sensitif tidak dipakai. */
const podes = baca('packages/shared/src/podes.ts');
for (const r of ['R1101', 'R1104', 'R1105', 'R1106'])
  if (podes.includes(r))
    galat.push(`[A2] packages/shared/src/podes.ts memakai butir sensitif ${r}.`);

/* A6. Tanpa HTML atau gaya sebaris dari skrip (CSP ketat). */
for (const f of telusuri('apps/web/src', ['.ts'])) {
  const teks = baca(f);
  if (
    /\.(outerHTML|insertAdjacentHTML)\b|\binnerHTML\s*=|setAttribute\(\s*['"]style['"]/.test(teks)
  )
    galat.push(`[A6] ${f} mengisi HTML atau atribut style secara langsung. Pakai h() dan CSSOM.`);
}
for (const f of telusuri('apps/web', ['.html'])) {
  if (/<script(?![^>]*\bsrc=)[^>]*>|\sstyle="/.test(baca(f)))
    galat.push(`[A6] ${f} memuat <script> sebaris atau atribut style. CSP akan memblokirnya.`);
}

/* C. Warna baru wajib lewat token. Angka ini hanya boleh turun (warna lama dipindah ke token). */
const BATAS_WARNA_LAMA = 19;
let jumlahHex = 0;
for (const f of telusuri('apps/web/src/styles', ['.css'])) {
  if (f.endsWith('tokens.css')) continue;
  jumlahHex += (baca(f).match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
}
if (jumlahHex > BATAS_WARNA_LAMA)
  galat.push(
    `[C] Ada ${jumlahHex} kode warna heksadesimal di luar tokens.css (batas ${BATAS_WARNA_LAMA}). Tambahkan token di tokens.css.`,
  );

/* A8. Migrasi yang sudah ada tidak boleh diubah atau dihapus. */
const base = process.env.PAGAR_BASE;
if (base) {
  try {
    const diff = execSync(`git diff --name-status ${base}...HEAD -- apps/api/migrations`, {
      encoding: 'utf8',
    });
    for (const baris of diff.split('\n').filter(Boolean)) {
      const [status, berkas] = baris.split(/\s+/);
      // Hanya berkas migrasi .sql yang dijaga; berkas sistem seperti desktop.ini boleh dihapus.
      if (status !== 'A' && berkas?.endsWith('.sql'))
        galat.push(
          `[A8] ${berkas} (${status}): migrasi lama tidak boleh diubah. Buat migrasi baru.`,
        );
    }
  } catch (e) {
    galat.push(`[A8] Tidak dapat membandingkan dengan ${base}: ${e.message}`);
  }
}

/* F. Catatan serah terima tidak boleh ikut digabung ke main. */
if (base) {
  try {
    readFileSync('CATATAN-SERAH-TERIMA.md');
    galat.push('[F] CATATAN-SERAH-TERIMA.md masih ada. Hapus sebelum pull request digabung.');
  } catch {
    /* tidak ada: benar */
  }
}

if (galat.length) {
  console.error(`Pagar AGENTS.md GAGAL (${galat.length}):\n- ${galat.join('\n- ')}`);
  process.exit(1);
}
console.log(
  `Pagar AGENTS.md lolos (${berkasTeks.length} berkas teks, warna lama ${jumlahHex}/${BATAS_WARNA_LAMA}).`,
);
