#!/usr/bin/env node
/**
 * Pemasang SIKOP: dari nol sampai situs tayang di Cloudflare, dalam satu perintah.
 * Dipicu oleh PASANG-SIKOP.bat (Windows) atau `npm run pasang` (semua sistem).
 *
 * Sifat:
 *  - Dapat dijalankan ulang. Langkah yang sudah selesai dicatat di .pasang-sikop.json dan dilewati;
 *    langkah deploy selalu dijalankan agar perubahan terbaru ikut terpasang.
 *  - Tidak menyimpan rahasia. Kunci rahasia Turnstile dan garam IP langsung dikirim ke Cloudflare
 *    lewat stdin, tidak ditulis ke berkas mana pun.
 *  - Berhenti dengan pesan jelas bila ada langkah gagal; jalankan ulang setelah diperbaiki.
 *
 * Opsi:
 *   --tanpa-instal   lewati `npm ci` (dependensi sudah terpasang)
 *   --ulang          abaikan catatan langkah selesai, jalankan semua dari awal
 */
import { spawnSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BERKAS_STATUS = join(ROOT, '.pasang-sikop.json');
const ARGS = new Set(process.argv.slice(2));
const WINDOWS = platform() === 'win32';
// Dapat diganti untuk pengujian pemasang tanpa akun Cloudflare sungguhan.
const WRANGLER = process.env.SIKOP_WRANGLER ?? 'npx wrangler';
const NAMA_DB = 'sikop';
const NAMA_WORKER = 'sikop-api';

/* ------------------------------ Tampilan ------------------------------ */

const warna = (k, t) => (process.stdout.isTTY ? `\x1b[${k}m${t}\x1b[0m` : t);
const judul = (n, total, t) => console.log(`\n${warna('1;36', `[${n}/${total}] ${t}`)}`);
const ok = (t) => console.log(`  ${warna('32', 'OK')}  ${t}`);
const info = (t) => console.log(`  ${t}`);
const awas = (t) => console.log(`  ${warna('33', 'PERHATIAN')}  ${t}`);

class GagalPasang extends Error {}
const gagal = (t) => {
  throw new GagalPasang(t);
};

/* ------------------------------ Status ------------------------------ */

const status = (() => {
  if (ARGS.has('--ulang') || !existsSync(BERKAS_STATUS)) return { selesai: [], nilai: {} };
  try {
    return JSON.parse(readFileSync(BERKAS_STATUS, 'utf8'));
  } catch {
    return { selesai: [], nilai: {} };
  }
})();
const simpanStatus = () => writeFileSync(BERKAS_STATUS, JSON.stringify(status, null, 2));
/** Rahasia hanya hidup di memori proses ini, tidak pernah masuk berkas status. */
let rahasiaTurnstile = '';
const tandaiSelesai = (id) => {
  if (!status.selesai.includes(id)) status.selesai.push(id);
  simpanStatus();
};

/* ------------------------------ Perintah ------------------------------ */

/**
 * Menjalankan perintah. `masukan` dikirim lewat stdin (untuk rahasia: tidak pernah menjadi argumen
 * baris perintah, sehingga tidak tampil di daftar proses atau riwayat).
 */
function jalankan(perintah, { cwd = ROOT, masukan, tampil = false, nonInteraktif = true } = {}) {
  const env = { ...process.env };
  if (nonInteraktif)
    env.CI = 'true'; // wrangler melewati pertanyaan konfirmasi
  else delete env.CI; // login harus interaktif (membuka browser)
  if (status.nilai.accountId) env.CLOUDFLARE_ACCOUNT_ID = status.nilai.accountId;
  const r = spawnSync(perintah, {
    cwd,
    env,
    shell: true,
    input: masukan,
    encoding: 'utf8',
    // stdin anak tidak pernah mewarisi masukan pemasang, agar jawaban pengguna tidak "termakan".
    stdio: tampil ? ['ignore', 'inherit', 'inherit'] : ['pipe', 'pipe', 'pipe'],
    maxBuffer: 50 * 1024 * 1024,
  });
  return { kode: r.status ?? 1, keluaran: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}

/** Galat pemuatan kode (bukan galat data): biasanya paket pembaruan diekstrak sebagian atau tercampur versi lama. */
const POLA_KODE_TIDAK_LENGKAP =
  /SyntaxError|does not provide an export|Cannot find module|ERR_MODULE_NOT_FOUND|ERR_UNSUPPORTED/;
const PESAN_KODE_TIDAK_LENGKAP =
  'Berkas kode SIKOP tidak lengkap atau tercampur versi lama (bukan masalah data). Ekstrak ulang paket pembaruan terbaru ke folder ini, timpa semua berkas, lalu jalankan ulang.';

function wajib(perintah, pesanGagal, opsi) {
  const r = jalankan(perintah, opsi);
  if (r.kode !== 0) {
    if (!opsi?.tampil) console.log(r.keluaran.split('\n').slice(-25).join('\n'));
    gagal(POLA_KODE_TIDAK_LENGKAP.test(r.keluaran) ? PESAN_KODE_TIDAK_LENGKAP : pesanGagal);
  }
  return r.keluaran;
}

/** Berkas penanda versi 2.1; bila salah satu hilang, paket pembaruan belum terpasang utuh. */
const BERKAS_WAJIB = [
  'packages/shared/src/index.ts',
  'packages/shared/src/podes.ts',
  'apps/api/migrations/0001_skema_awal.sql',
  'apps/api/migrations/0002_podes.sql',
  'apps/web/peta/index.html',
  'apps/web/src/pages/peta.ts',
  'scripts/build-data.mjs',
  'scripts/build-podes.mjs',
  'scripts/lib/dbf.mjs',
];

function bukaBrowser(url) {
  if (process.env.CI) return;
  const cmd = WINDOWS
    ? `start "" "${url}"`
    : platform() === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  spawn(cmd, { shell: true, stdio: 'ignore', detached: true }).unref();
}

/** Seperti jalankan(), tetapi keluaran ditampilkan langsung sekaligus dikumpulkan untuk diperiksa. */
function jalankanAlir(perintah) {
  return new Promise((selesai) => {
    let keluaran = '';
    const anak = spawn(perintah, {
      cwd: ROOT,
      env: { ...process.env, CI: 'true' },
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const tangkap = (tujuan) => (potong) => {
      keluaran += potong;
      tujuan.write(potong);
    };
    anak.stdout.on('data', tangkap(process.stdout));
    anak.stderr.on('data', tangkap(process.stderr));
    anak.on('error', (e) => selesai({ kode: 1, keluaran: `${keluaran}\n${e.message}` }));
    anak.on('close', (kode) => selesai({ kode: kode ?? 1, keluaran }));
  });
}

/* ------------------------------ Dependensi ------------------------------ */

/**
 * Memastikan node_modules utuh. Di Windows, antivirus atau sinkronisasi OneDrive dapat mengunci berkas
 * saat npm mengekstrak paket (TAR_ENTRY_ERROR); npm tetap keluar "berhasil" padahal ada berkas yang hilang.
 * Pemeriksaan memakai catatan internal npm (node_modules/.package-lock.json) dan menjalankan alat utama.
 */
function periksaDependensi() {
  const catatan = join(ROOT, 'node_modules', '.package-lock.json');
  if (!existsSync(catatan)) return { sehat: false, alasan: 'node_modules belum ada' };
  let paket;
  try {
    paket = JSON.parse(readFileSync(catatan, 'utf8')).packages ?? {};
  } catch {
    return { sehat: false, alasan: 'catatan npm rusak' };
  }
  const rusak = [];
  for (const [rel, p] of Object.entries(paket)) {
    if (!rel.includes('node_modules/') || p.link) continue; // hanya paket unduhan, bukan workspace
    const nama = rel.replace(/^.*node_modules\//, '');
    try {
      JSON.parse(readFileSync(join(ROOT, rel, 'package.json'), 'utf8'));
    } catch {
      rusak.push(nama);
      continue;
    }
    const bin = typeof p.bin === 'string' ? [p.bin] : Object.values(p.bin ?? {});
    if (bin.some((f) => !existsSync(join(ROOT, rel, f)))) rusak.push(nama);
  }
  if (rusak.length)
    return {
      sehat: false,
      alasan: `${rusak.length} paket tidak lengkap, antara lain ${rusak.slice(0, 3).join(', ')}`,
    };
  const uji = [
    ['-e', "require('esbuild').transformSync('let a: number = 1', { loader: 'ts' })"],
    [join(ROOT, 'node_modules/vite/bin/vite.js'), '--version'],
  ];
  for (const args of uji) {
    const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
    if (r.status !== 0) return { sehat: false, alasan: 'alat build tidak dapat dijalankan' };
  }
  return { sehat: true };
}

function hapusNodeModules() {
  const folder = [join(ROOT, 'node_modules')];
  for (const induk of ['apps', 'packages'])
    for (const d of readdirSync(join(ROOT, induk)))
      folder.push(join(ROOT, induk, d, 'node_modules'));
  for (const f of folder) {
    try {
      rmSync(f, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 });
    } catch {
      awas(`Tidak dapat menghapus ${f}. Tutup jendela lain yang membuka folder ini.`);
    }
  }
}

const PERCOBAAN_INSTAL = [
  'npm ci --no-audit --no-fund',
  // Lebih sedikit unduhan serentak berarti lebih sedikit berkas yang ditulis bersamaan.
  'npm ci --no-audit --no-fund --maxsockets=2',
  'npm ci --no-audit --no-fund --maxsockets=1 --prefer-online',
];

async function pasangDependensi() {
  let jaringan = false;
  for (const [i, perintah] of PERCOBAAN_INSTAL.entries()) {
    const terakhir = i === PERCOBAAN_INSTAL.length - 1;
    if (i > 0) {
      info(`Percobaan ${i + 1} dari ${PERCOBAAN_INSTAL.length}: membersihkan sisa pemasangan...`);
      hapusNodeModules();
      jalankan('npm cache clean --force');
    }
    const r = await jalankanAlir(perintah);
    const tulisGagal = /TAR_ENTRY_ERROR|EBADF|EPERM|EBUSY|EACCES/.test(r.keluaran);
    jaringan = /ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|network/i.test(r.keluaran);
    const cek = r.kode === 0 ? periksaDependensi() : { sehat: false, alasan: `kode ${r.kode}` };
    if (cek.sehat && (!tulisGagal || terakhir)) {
      if (tulisGagal) awas('Masih ada peringatan tulis berkas, tetapi semua paket penting utuh.');
      return;
    }
    awas(
      tulisGagal
        ? 'Sebagian berkas gagal ditulis ke disk (TAR_ENTRY_ERROR). Mengulang otomatis.'
        : `Dependensi belum utuh (${cek.alasan}).`,
    );
  }
  if (jaringan)
    gagal(
      'Paket tidak dapat diunduh. Periksa koneksi internet; bila jaringan kantor memakai proxy, coba jaringan lain (mis. tethering ponsel), lalu jalankan ulang.',
    );
  gagal(`Dependensi gagal terpasang utuh setelah ${PERCOBAAN_INSTAL.length} percobaan. Penyebab paling umum di Windows:
    1. Folder berada di OneDrive atau Desktop/Documents yang disinkronkan.
       Pindahkan folder ke C:\\SIKOP.
    2. Antivirus memindai berkas saat ditulis. Tambahkan C:\\SIKOP ke pengecualian:
       Windows Security > Virus & threat protection > Manage settings > Exclusions > Add folder.
    3. Folder sedang dibuka aplikasi lain (VS Code, Explorer). Tutup aplikasi tersebut.
  Setelah itu klik dua kali PASANG-SIKOP.bat lagi.`);
}

/* ------------------------------ Masukan ------------------------------ */

const rl = createInterface({ input: process.stdin, terminal: false });
// Iterator menyangga setiap baris, sehingga jawaban yang ditempel sekaligus tidak hilang.
const barisMasuk = rl[Symbol.asyncIterator]();

async function bacaBaris(prompt) {
  process.stdout.write(prompt);
  const { value, done } = await barisMasuk.next();
  if (done) {
    console.error(
      `\n${warna('1;31', 'BERHENTI:')} masukan terputus sebelum pemasangan selesai. Jalankan ulang pemasang.`,
    );
    process.exit(1);
  }
  if (!process.stdin.isTTY) process.stdout.write(`${value}\n`);
  return value;
}

async function tanya(pertanyaan, { bawaan = '', pola, pesan, boleh_kosong = false } = {}) {
  for (;;) {
    const j =
      (await bacaBaris(`  ${pertanyaan}${bawaan ? ` [${bawaan}]` : ''}: `)).trim() || bawaan;
    if (!j && boleh_kosong) return '';
    if (j && (!pola || pola.test(j))) return j;
    awas(pesan ?? 'Isian tidak valid, coba lagi.');
  }
}
async function yaTidak(pertanyaan, bawaan = true) {
  const j = (await bacaBaris(`  ${pertanyaan} (${bawaan ? 'Y/t' : 'y/T'}): `)).trim().toLowerCase();
  return j === '' ? bawaan : j.startsWith('y');
}

/* ------------------------------ Konfigurasi berkas ------------------------------ */

function ubahBerkas(rel, ganti) {
  const p = join(ROOT, rel);
  const lama = readFileSync(p, 'utf8');
  const baru = ganti(lama);
  if (baru !== lama) writeFileSync(p, baru);
}

const setVar = (toml, kunci, nilai) =>
  toml.replace(new RegExp(`^(${kunci}\\s*=\\s*)".*"`, 'm'), `$1"${nilai}"`);

function terapkanKonfigurasi() {
  const v = status.nilai;
  ubahBerkas('apps/api/wrangler.toml', (t) => {
    let s = t.replace(/^(database_id\s*=\s*)"[^"]*"/m, `$1"${v.databaseId}"`);
    s = setVar(s, 'ALLOWED_ORIGINS', v.origin);
    if (v.googleClientId) s = setVar(s, 'GOOGLE_CLIENT_ID', v.googleClientId);
    if (v.turnstileSiteKey) s = setVar(s, 'TURNSTILE_SITE_KEY', v.turnstileSiteKey);
    return s;
  });
  ubahBerkas('apps/web/wrangler.toml', (t) =>
    t.replace(/^name\s*=\s*".*"/m, `name = "${v.proyek}"`),
  );
  // Alamat situs pada SEO dan alur deploy otomatis GitHub mengikuti domain yang sebenarnya.
  for (const f of [
    'apps/web/public/robots.txt',
    'apps/web/public/sitemap.xml',
    '.github/workflows/deploy.yml',
  ]) {
    ubahBerkas(f, (t) =>
      t
        .replace(/https:\/\/sikop-pesisirbarat\.pages\.dev/g, v.origin)
        .replace(/--project-name [a-z0-9-]+/g, `--project-name ${v.proyek}`),
    );
  }
}

/* ------------------------------ Langkah ------------------------------ */

const LANGKAH = [
  {
    id: 'prasyarat',
    judul: 'Memeriksa prasyarat',
    selalu: true,
    async jalan() {
      const [maj, min] = process.versions.node.split('.').map(Number);
      if (maj < 22 || (maj === 22 && min < 18))
        gagal(
          `Node.js ${process.versions.node} terlalu lama. Pasang Node.js 22.18 atau lebih baru (LTS), lalu jalankan ulang.`,
        );
      ok(`Node.js ${process.versions.node}`);
      if (/[\\/]AppData[\\/]Local[\\/]Temp[\\/]/i.test(ROOT))
        gagal(
          'Pemasang dijalankan dari dalam berkas zip. Klik kanan zip > Extract All, misalnya ke C:\\SIKOP, lalu klik dua kali PASANG-SIKOP.bat di folder hasil ekstrak.',
        );
      if (!existsSync(join(ROOT, 'packages/shared/src/index.ts')))
        gagal('Jalankan pemasang dari folder utama SIKOP (folder yang berisi PASANG-SIKOP.bat).');
      ok(`Folder proyek ditemukan: ${ROOT}`);
      const hilang = BERKAS_WAJIB.filter((f) => !existsSync(join(ROOT, f)));
      if (hilang.length)
        gagal(
          `Paket SIKOP belum lengkap. Berkas berikut tidak ditemukan:\n    - ${hilang.join('\n    - ')}\n  Ekstrak paket pembaruan terbaru ke folder ini (timpa semua berkas), lalu jalankan ulang.`,
        );
      const indeks = readFileSync(join(ROOT, 'packages/shared/src/index.ts'), 'utf8');
      if (!indeks.includes("'./podes.ts'")) gagal(PESAN_KODE_TIDAK_LENGKAP);
      ok('Paket kode lengkap');
      if (/onedrive|dropbox|google drive|icloud/i.test(ROOT)) {
        awas('Folder ini disinkronkan (OneDrive/Dropbox/Google Drive). Sinkronisasi mengunci');
        info('ribuan berkas kecil saat dependensi dipasang dan menyebabkan galat TAR_ENTRY_ERROR.');
        info('Sangat disarankan memindahkan folder ke C:\\SIKOP lalu menjalankan ulang dari sana.');
        if (!(await yaTidak('Tetap lanjutkan di folder ini?', false)))
          gagal('Pindahkan folder ke C:\\SIKOP, lalu klik dua kali PASANG-SIKOP.bat di sana.');
      } else if (WINDOWS && ROOT.length > 60) {
        awas(
          'Alamat folder cukup panjang. Bila pemasangan dependensi gagal, pindahkan ke C:\\SIKOP.',
        );
      }
    },
  },
  {
    id: 'instal',
    judul: 'Memasang dependensi (sekitar 1 sampai 3 menit)',
    // Selalu diperiksa: pemasangan sebelumnya bisa "berhasil" padahal sebagian berkas gagal ditulis.
    selalu: true,
    async jalan() {
      if (ARGS.has('--tanpa-instal')) return info('Dilewati (--tanpa-instal).');
      if (status.selesai.includes('instal')) {
        const cek = periksaDependensi();
        if (cek.sehat) return ok('Dependensi sudah terpasang dan utuh');
        awas(`Dependensi tidak utuh (${cek.alasan}). Memasang ulang.`);
        status.selesai = status.selesai.filter((x) => x !== 'instal');
        simpanStatus();
      }
      await pasangDependensi();
      ok('Dependensi terpasang dan utuh');
    },
  },
  {
    id: 'data',
    judul: 'Memvalidasi dan mengolah data sekolah dan peta',
    async jalan() {
      const k = wajib(
        'npm run data:build',
        'Data sekolah tidak lolos validasi. Lihat build/laporan-mutu-data.md.',
      );
      const sekolah = /Baris di berkas sumber \| (\d+)/.exec(k)?.[1];
      ok(
        `Data lolos rekonsiliasi${sekolah ? ` (${sekolah} sekolah)` : ''}; laporan di build/laporan-mutu-data.md`,
      );
    },
    selalu: true,
  },
  {
    id: 'login',
    judul: 'Masuk ke akun Cloudflare',
    async jalan() {
      let r = jalankan(`${WRANGLER} whoami --json`);
      if (r.kode !== 0) {
        info(
          'Browser akan terbuka. Masuk ke Cloudflare (buat akun gratis bila belum punya), lalu klik "Allow".',
        );
        wajib(`${WRANGLER} login`, 'Login Cloudflare gagal atau dibatalkan.', {
          tampil: true,
          nonInteraktif: false,
        });
        r = jalankan(`${WRANGLER} whoami --json`);
        if (r.kode !== 0) gagal('Belum berhasil masuk ke Cloudflare.');
      }
      const akun = bacaAkun(r.keluaran);
      if (akun.length === 0) gagal('Akun Cloudflare tidak ditemukan pada login ini.');
      let pilih = akun[0];
      if (akun.length > 1) {
        akun.forEach((a, i) => info(`${i + 1}. ${a.name} (${a.id})`));
        const n = Number(
          await tanya('Pilih nomor akun Cloudflare', { bawaan: '1', pola: /^\d+$/ }),
        );
        pilih = akun[n - 1] ?? akun[0];
      }
      status.nilai.accountId = pilih.id;
      ok(`Masuk ke akun "${pilih.name}"`);
    },
  },
  {
    id: 'isian',
    judul: 'Data pengelola',
    async jalan() {
      info(
        'Email ini menjadi superadmin pertama. Gunakan akun Google yang akan dipakai untuk masuk panel admin.',
      );
      status.nilai.superadmin = await tanya('Email Google superadmin', {
        bawaan: status.nilai.superadmin,
        pola: /^[^\s@,]+@[^\s@,]+\.[a-z]{2,}$/i,
        pesan: 'Format email tidak valid.',
      });
      info('Nama proyek menentukan alamat situs: https://NAMA.pages.dev');
      status.nilai.proyek = await tanya('Nama proyek', {
        bawaan: status.nilai.proyek ?? 'sikop-pesisirbarat',
        pola: /^[a-z0-9][a-z0-9-]{2,40}[a-z0-9]$/,
        pesan: 'Huruf kecil, angka, dan tanda hubung; 4 sampai 42 karakter.',
      });
      ok('Tersimpan');
    },
  },
  {
    id: 'd1',
    judul: 'Membuat basis data D1',
    async jalan() {
      let id = cariDatabase();
      if (!id) {
        const r = jalankan(`${WRANGLER} d1 create ${NAMA_DB}`, { cwd: join(ROOT, 'apps/api') });
        id =
          /database_id["'\s=:]+"?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(
            r.keluaran,
          )?.[1] ?? cariDatabase();
        if (!id) {
          console.log(r.keluaran.split('\n').slice(-15).join('\n'));
          gagal('Basis data D1 gagal dibuat.');
        }
        ok(`Basis data "${NAMA_DB}" dibuat`);
      } else ok(`Basis data "${NAMA_DB}" sudah ada, dipakai ulang`);
      status.nilai.databaseId = id;
    },
  },
  {
    id: 'pages',
    judul: 'Membuat proyek Cloudflare Pages',
    async jalan() {
      const ada = jalankan(`${WRANGLER} pages project list --json`);
      if (!new RegExp(`"${status.nilai.proyek}"`).test(ada.keluaran)) {
        const r = jalankan(
          `${WRANGLER} pages project create ${status.nilai.proyek} --production-branch main`,
        );
        if (r.kode !== 0 && !/already exists/i.test(r.keluaran)) {
          console.log(r.keluaran.split('\n').slice(-15).join('\n'));
          gagal(
            'Proyek Pages gagal dibuat. Bila nama sudah dipakai, jalankan ulang dengan --ulang dan pilih nama lain.',
          );
        }
        ok(`Proyek "${status.nilai.proyek}" dibuat`);
      } else ok(`Proyek "${status.nilai.proyek}" sudah ada, dipakai ulang`);
      const daftar = jalankan(`${WRANGLER} pages project list --json`).keluaran;
      // Utamakan domain persis; bila nama sudah dipakai pihak lain, Cloudflare menambahkan akhiran acak.
      const persis = `${status.nilai.proyek}.pages.dev`;
      const domain = daftar.includes(persis)
        ? persis
        : (new RegExp(`(${status.nilai.proyek}-[a-z0-9]+\\.pages\\.dev)`).exec(daftar)?.[1] ??
          persis);
      status.nilai.origin = `https://${domain}`;
      terapkanKonfigurasi();
      ok(`Alamat situs: ${status.nilai.origin}`);
    },
  },
  {
    id: 'google',
    judul: 'Login Google untuk peserta dan admin (langkah manual)',
    async jalan() {
      if (status.nilai.googleClientId) return ok(`Sudah diisi: ${status.nilai.googleClientId}`);
      console.log(`
  Google tidak menyediakan cara otomatis untuk langkah ini. Halaman Google Cloud akan dibuka.
    1. Buat proyek (misalnya "SIKOP"), atau pilih proyek yang ada.
    2. Menu "OAuth consent screen": pilih External, isi nama aplikasi "SIKOP" dan email, simpan.
       Setelah itu klik "Publish app" agar semua akun Google dapat masuk.
    3. Menu "Credentials" > "Create credentials" > "OAuth client ID" > jenis "Web application".
    4. Pada "Authorized JavaScript origins" tambahkan persis:  ${warna('1', status.nilai.origin)}
    5. Klik Create, lalu salin "Client ID" (berakhiran .apps.googleusercontent.com).
`);
      bukaBrowser('https://console.cloud.google.com/apis/credentials');
      const id = await tanya('Tempel Client ID (kosongkan untuk melewati dulu)', {
        boleh_kosong: true,
        pola: /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/,
        pesan: 'Client ID harus berformat 1234...-abcd....apps.googleusercontent.com',
      });
      if (!id) {
        awas(
          'Dilewati. Situs tetap tayang, tetapi belum bisa masuk. Jalankan ulang pemasang setelah Client ID siap.',
        );
        return 'lewati';
      }
      status.nilai.googleClientId = id;
      terapkanKonfigurasi();
      ok('Client ID disimpan');
    },
  },
  {
    id: 'turnstile',
    judul: 'Perlindungan anti-bot formulir (opsional)',
    async jalan() {
      if (status.nilai.turnstileSiteKey) return ok('Sudah diatur');
      info(
        'Turnstile mencegah spam pada formulir permohonan data. Gratis, dibuat di dasbor Cloudflare.',
      );
      if (!(await yaTidak('Atur Turnstile sekarang?', false))) {
        info(
          'Dilewati. Formulir tetap dilindungi pembatas laju. Dapat diatur kapan saja dengan menjalankan ulang.',
        );
        return 'lewati';
      }
      info(
        `Di dasbor: Turnstile > Add widget > domain ${status.nilai.origin.replace('https://', '')} > mode Managed.`,
      );
      bukaBrowser('https://dash.cloudflare.com/?to=/:account/turnstile');
      status.nilai.turnstileSiteKey = await tanya('Site key', {
        pola: /^0x[0-9A-Za-z_-]{10,}$/,
        pesan: 'Site key diawali 0x',
      });
      rahasiaTurnstile = await tanya('Secret key (tidak disimpan ke berkas)', {
        pola: /^0x[0-9A-Za-z_-]{10,}$/,
        pesan: 'Secret key diawali 0x',
      });
      terapkanKonfigurasi();
      ok('Turnstile diatur');
    },
  },
  {
    id: 'migrasi',
    judul: 'Menyiapkan tabel dan mengisi data',
    async jalan() {
      const api = join(ROOT, 'apps/api');
      wajib(`${WRANGLER} d1 migrations apply ${NAMA_DB} --remote`, 'Migrasi skema gagal.', {
        cwd: api,
      });
      ok('Skema basis data terpasang');
      wajib(
        `${WRANGLER} d1 execute ${NAMA_DB} --remote --file=../../build/seed.sql`,
        'Pengisian data sekolah gagal.',
        { cwd: api },
      );
      ok('Data sekolah, kecamatan, dan pengaturan awal terisi');
      const bank = cariBankSoal();
      if (!bank) {
        awas(
          'Bank soal (RAHASIA-bank-soal-kunci-jawaban.json) tidak ditemukan. Ruang belajar akan kosong.',
        );
        info(
          'Letakkan berkas itu di folder SIKOP atau folder Downloads, lalu jalankan ulang pemasang.',
        );
        return 'lewati';
      }
      wajib('npm run data:lms', 'Bank soal tidak valid.');
      wajib(
        `${WRANGLER} d1 execute ${NAMA_DB} --remote --file=../../build/seed-lms.sql`,
        'Pengisian bank soal gagal.',
        { cwd: api },
      );
      ok(`Bank soal terisi dari ${bank}`);
    },
    selalu: true,
  },
  {
    id: 'api',
    judul: 'Memasang API (Cloudflare Worker)',
    async jalan() {
      const api = join(ROOT, 'apps/api');
      wajib('node scripts/cek-konfigurasi.mjs', 'Pemeriksaan konfigurasi keamanan gagal.');
      wajib(`${WRANGLER} deploy`, 'Deploy Worker gagal.', { cwd: api });
      ok(`Worker "${NAMA_WORKER}" tayang`);
      // Rahasia dikirim lewat stdin. IP_SALT hanya dibuat sekali agar hash audit tetap konsisten.
      if (!status.nilai.ipSaltTerpasang) {
        wajib(`${WRANGLER} secret put IP_SALT`, 'Gagal memasang IP_SALT.', {
          cwd: api,
          masukan: randomBytes(32).toString('hex'),
        });
        status.nilai.ipSaltTerpasang = true;
        simpanStatus();
      }
      wajib(`${WRANGLER} secret put SUPERADMIN_EMAILS`, 'Gagal memasang SUPERADMIN_EMAILS.', {
        cwd: api,
        masukan: status.nilai.superadmin,
      });
      if (rahasiaTurnstile) {
        wajib(`${WRANGLER} secret put TURNSTILE_SECRET`, 'Gagal memasang TURNSTILE_SECRET.', {
          cwd: api,
          masukan: rahasiaTurnstile,
        });
        rahasiaTurnstile = '';
      }
      ok('Rahasia terpasang di Cloudflare (tidak disimpan di komputer ini)');
    },
    selalu: true,
  },
  {
    id: 'web',
    judul: 'Membangun dan memasang situs (Cloudflare Pages)',
    async jalan() {
      process.env.SIKOP_SITE_URL = status.nilai.origin; // tautan kanonik mengikuti domain sebenarnya
      wajib('npm run build', 'Build situs gagal.');
      wajib(`${WRANGLER} pages deploy --branch main --commit-dirty=true`, 'Deploy situs gagal.', {
        cwd: join(ROOT, 'apps/web'),
      });
      ok('Situs tayang');
    },
    selalu: true,
  },
  {
    id: 'uji',
    judul: 'Memeriksa situs',
    async jalan() {
      const url = `${status.nilai.origin}/api/v1/health`;
      const percobaan = Number(process.env.SIKOP_PERCOBAAN_UJI ?? 12);
      for (let i = 0; i < percobaan; i++) {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
          const j = await r.json();
          if (j.status === 'sehat') return ok('Situs dan basis data merespons dengan baik');
        } catch {
          /* domain baru butuh waktu menyebar */
        }
        if (i < percobaan - 1) await new Promise((r) => setTimeout(r, 5000));
      }
      awas(
        `Situs belum merespons dalam 1 menit. Domain baru kadang perlu beberapa menit; buka ${status.nilai.origin} sebentar lagi.`,
      );
    },
    selalu: true,
  },
];

/* ------------------------------ Pembantu Cloudflare ------------------------------ */

function bacaAkun(keluaran) {
  try {
    const j = JSON.parse(keluaran.slice(keluaran.indexOf('{'), keluaran.lastIndexOf('}') + 1));
    if (Array.isArray(j.accounts))
      return j.accounts.map((a) => ({ id: a.id, name: a.name ?? a.id }));
  } catch {
    /* jatuh ke pola teks */
  }
  return [...new Set(keluaran.match(/\b[0-9a-f]{32}\b/g) ?? [])].map((id) => ({ id, name: id }));
}

function cariDatabase() {
  const r = jalankan(`${WRANGLER} d1 list --json`);
  try {
    const daftar = JSON.parse(
      r.keluaran.slice(r.keluaran.indexOf('['), r.keluaran.lastIndexOf(']') + 1),
    );
    return daftar.find((d) => d.name === NAMA_DB)?.uuid ?? null;
  } catch {
    return null;
  }
}

function cariBankSoal() {
  const tujuan = join(ROOT, 'data/lms/bank-soal.json');
  if (existsSync(tujuan)) return 'data/lms/bank-soal.json';
  for (const p of [
    join(ROOT, 'RAHASIA-bank-soal-kunci-jawaban.json'),
    join(ROOT, '..', 'RAHASIA-bank-soal-kunci-jawaban.json'),
    join(homedir(), 'Downloads', 'RAHASIA-bank-soal-kunci-jawaban.json'),
  ]) {
    if (existsSync(p)) {
      copyFileSync(p, tujuan); // data/lms/bank-soal.json diabaikan git
      return p;
    }
  }
  return null;
}

/* ------------------------------ Utama ------------------------------ */

async function utama() {
  console.log(warna('1', '\nPemasang SIKOP BPS Kabupaten Pesisir Barat'));
  console.log('Langkah yang sudah selesai pada pemasangan sebelumnya akan dilewati.\n');
  const total = LANGKAH.length;
  for (const [i, l] of LANGKAH.entries()) {
    judul(i + 1, total, l.judul);
    if (!l.selalu && status.selesai.includes(l.id)) {
      ok('Sudah selesai sebelumnya');
      continue;
    }
    const hasil = await l.jalan();
    if (hasil !== 'lewati') tandaiSelesai(l.id);
    else simpanStatus();
  }
  const v = status.nilai;
  console.log(`
${warna('1;32', 'SELESAI. SIKOP sudah tayang.')}

  Situs pengunjung : ${v.origin}
  Panel admin      : ${v.origin}/admin/   (masuk dengan ${v.superadmin})
  Cek sertifikat   : ${v.origin}/sertifikat/
${v.googleClientId ? '' : `\n  ${warna('33', 'Belum bisa masuk:')} Google Client ID belum diisi. Jalankan ulang pemasang setelah siap.\n`}
  Langkah berikutnya di panel admin:
    1. Pengaturan situs: kontak PST, kepanjangan resmi SIKOP, mitra, tim.
    2. Pengaturan sertifikat: nama dan jabatan penandatangan, lalu aktifkan.
    3. Pengguna admin: daftarkan editor data, pengelola ruang belajar, petugas PST.
`);
  bukaBrowser(v.origin);
}

utama()
  .catch((e) => {
    console.error(
      `\n${warna('1;31', 'BERHENTI:')} ${e instanceof GagalPasang ? e.message : (e?.stack ?? e)}`,
    );
    console.error(
      'Perbaiki penyebabnya lalu jalankan ulang. Langkah yang sudah selesai tidak diulang.',
    );
    process.exitCode = 1;
  })
  .finally(() => rl.close());
