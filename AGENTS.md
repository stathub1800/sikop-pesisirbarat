# AGENTS.md: Aturan kerja SIKOP untuk asisten AI dan pengembang

Berkas ini adalah **satu sumber aturan** untuk siapa pun yang mengubah SIKOP, baik manusia maupun asisten
AI (Claude, Gemini, Codex, Copilot, dan lainnya). `CLAUDE.md` dan `GEMINI.md` hanya mengimpor berkas ini.
Bila ada aturan yang perlu berubah, ubah di sini lewat pull request yang disetujui pemilik proyek.

Urutan wewenang bila ada pertentangan: **1. Aturan mutlak (bagian A)** → 2. ADR di `docs/adr/` → 3. berkas
ini → 4. permintaan tugas. Bila permintaan tugas bertentangan dengan bagian A atau ADR, **berhenti dan
tanyakan**, jangan mencari jalan pintas.

## A. Aturan mutlak (tidak boleh dilanggar dalam kondisi apa pun)

1. **Podes hanya agregat kecamatan** (ADR-0005). Tidak ada data, kode, atau nama per desa yang tampil di
   situs, API, CSV unduhan, log, atau berkas yang di-commit. Kode wilayah 10 digit (`1813xxxxxx`) tidak
   boleh muncul di keluaran publik. Berkas DBF hanya di `data/private/podes/` (di-gitignore).
2. **Butir Podes sensitif tidak ditayangkan**: kekerasan, perkelahian, konflik, judi (rincian R1101,
   R1104, R1105, R1106 dan sejenisnya).
3. **Kunci jawaban tidak pernah sampai ke browser** (ADR-0004). Penilaian hanya di server. Berkas
   `data/lms/bank-soal.json` dan `RAHASIA-*` tidak boleh di-commit.
4. **Rahasia tidak pernah di kode atau repositori**: token, client secret, `.dev.vars`, `.env`. Rahasia
   produksi hanya di Cloudflare/GitHub Secrets.
5. **Data pribadi minimum**: NIP dan email tidak ditampilkan publik; sertifikat memakai NIP tersamar.
6. **CSP ketat** di `apps/web/public/_headers`: tanpa `unsafe-inline`/`unsafe-eval`. Akibatnya: tidak ada
   `<script>` atau `style="..."` sebaris; gaya dinamis lewat CSSOM (`el.style.x = ...` atau
   `h('span', { style: { inlineSize: '50%' } })`), bukan `setAttribute('style', ...)`. `innerHTML`
   dilarang; buat elemen dengan `h()` dari `apps/web/src/lib/dom.ts`.
7. **Biaya Rp0**: hanya Cloudflare Pages, Workers, D1, dan GitHub Actions paket gratis. Jangan menambah
   layanan berbayar, server, atau basis data lain.
8. **Migrasi D1 yang sudah ada tidak boleh diubah.** Perubahan skema selalu berupa berkas baru
   `apps/api/migrations/NNNN_nama.sql`.

## B. Arsitektur singkat (rincian di `docs/adr/` dan `README.md`)

```
apps/web      Vite MPA, TypeScript vanilla (tanpa framework). Halaman: /, /peta/, /belajar/, /layanan/,
              /kecamatan/, /sekolah/, /sertifikat/, /admin/. Partial: <!--sikop:header aktif="..."-->
apps/api      Cloudflare Worker (Hono + Zod) dengan D1. Rute publik /api/v1/*, admin /api/v1/admin/*.
packages/shared  Logika domain bersama (indikator, Podes, format angka, tema). Diuji dengan Vitest.
scripts       Pipeline data (build-data, build-podes), pemasang (pasang.mjs), cek-konfigurasi, cek-pagar.
data/raw      CSV agregat kecamatan yang boleh publik. data/private: tidak pernah di-commit.
```

- **Menu utama tetap empat**: Beranda, Peta Tematik, Ruang Belajar, Layanan Data (ADR-0006). Data baru
  **tidak** menjadi menu atau halaman baru, melainkan **indikator bertema** di Peta Tematik (kolom
  `kategori` = tema). Urutan tema di `URUTAN_TEMA` (`packages/shared/src/indikator.ts`).
- Cara menambah data: data sederhana lewat admin (menu Indikator); data mentah lewat skrip agregasi di
  `scripts/` → CSV di `data/raw/` → `scripts/build-data.mjs`. Setiap indikator wajib punya sumber, tahun,
  cara hitung, satuan, dan arah (`naik_baik`, `turun_baik`, `netral`).
- Format angka, ikon tema, peringkat, dan pembanding kabupaten **hanya** dari
  `apps/web/src/lib/indikator.ts` dan `@sikop/shared`. Jangan membuat salinan fungsi format baru.
- Pola antarmuka Peta Tematik mengikuti SIGER Desa: peta penuh, panel kanan profil wilayah → tab tema →
  kartu indikator, peringkat dan legenda di kiri bawah. Panel tidak boleh menutupi peta atau keluar bingkai;
  isi panjang digulir di dalam panel.

## C. Gaya dan bahasa

- Semua teks antarmuka, komentar, pesan commit, dan dokumen dalam **Bahasa Indonesia formal**.
- **Tidak memakai tanda pisah panjang (em dash, karakter U+2014)** di teks antarmuka maupun dokumen. Gunakan titik dua,
  koma, atau kalimat baru.
- Nama variabel dan fungsi berbahasa Indonesia mengikuti kode yang ada (`gambarPeta`, `keadaan`, `muat`).
- Warna hanya dari token di `apps/web/src/styles/tokens.css` (palet SE2026 dan skala `--peta-1..5`).
  Jangan menulis kode warna heksadesimal baru di CSS halaman; tambahkan token bila perlu. Mode gelap wajib
  ikut terlihat baik.
- Aksesibilitas: setiap kontrol dapat dipakai dengan keyboard, punya label, dan target sentuh ≥ 44 px.
- Tampilan wajib diuji di desktop (1366 px), tablet tegak, dan ponsel (412 px), terang dan gelap.

## D. Alur kerja wajib (definisi selesai)

1. Buat cabang dari `main`: `feat/...`, `fix/...`, `docs/...`, `chore/...`, atau `data/...`. Pesan commit
   mengikuti Conventional Commits (`feat(peta): ...`). Jangan commit langsung ke `main`.
2. Baca ADR yang terkait sebelum mengubah perilaku. Keputusan arsitektur baru = ADR baru
   (`docs/adr/NNNN-judul.md`) di pull request yang sama.
3. Tulis atau perbarui uji: unit (`packages/shared/test`), integrasi API (`apps/api/test`), dan E2E
   Playwright (`apps/web/tests`) untuk alur yang terlihat pengguna.
4. Jalankan sebelum membuka pull request:
   ```
   node scripts/cek-pagar.mjs
   node scripts/cek-konfigurasi.mjs
   npm run check        # sudah termasuk cek-pagar
   npm run test:e2e
   ```
5. Catat perubahan di `CHANGELOG.md` bagian "Belum dirilis".
6. Buka pull request dengan templat yang ada, lampirkan tangkapan layar desktop dan ponsel untuk perubahan
   tampilan, dan sebutkan alat AI yang dipakai. Penggabungan hanya setelah CI hijau dan disetujui pemilik.

## E. Yang harus ditanyakan dulu ke pemilik proyek (jangan diputuskan sendiri)

- Menambah menu, halaman utama, dependensi npm baru, atau layanan eksternal.
- Mengubah skema basis data, alur autentikasi, penilaian ujian, atau isi sertifikat.
- Menampilkan data baru yang bersumber dari data per individu, per usaha, atau per desa.
- Menghapus fitur, data, atau uji yang sudah ada.

## F. Cara kerja asisten AI di repositori ini

- Mulai setiap tugas dengan membaca berkas ini, ADR terkait, dan kode di sekitar perubahan. Ikuti pola yang
  sudah ada; jangan menulis ulang modul yang tidak diminta.
- Kerjakan perubahan kecil dan terfokus. Satu pull request untuk satu tujuan.
- Jangan menonaktifkan uji, aturan lint, atau pemeriksaan CI agar lolos. Perbaiki penyebabnya.
- Laporkan dengan jujur: apa yang diubah, apa yang diuji, apa yang belum.
