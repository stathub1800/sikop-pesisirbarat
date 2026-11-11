# Prompt 1: Memulai tugas (staf, Claude atau Gemini)

Dipakai staf sebagai **pesan pertama** di sesi baru. Teksnya sama untuk Claude Code dan Gemini CLI, karena
keduanya membaca aturan yang sama dari `AGENTS.md`. Ganti bagian dalam `<...>`.

## A. Untuk Claude Code atau Gemini CLI (bekerja langsung di folder repositori)

```text
Anda membantu saya melanjutkan pengembangan SIKOP (portal BPS Kabupaten Pesisir Barat) di repositori ini.

LANGKAH 1. PAHAMI DULU, JANGAN MENGUBAH BERKAS
- Baca AGENTS.md sampai habis. Aturan bagian A tidak boleh dilanggar dalam kondisi apa pun.
- Baca docs/rencana-kerja.md, lalu ADR yang disebut di tugas.
- Baca kode di sekitar bagian yang akan diubah dan ikuti polanya (nama berbahasa Indonesia, h() untuk DOM,
  token warna, pembantu di apps/web/src/lib/indikator.ts dan @sikop/shared).

LANGKAH 2. TULIS RENCANA, LALU BERHENTI
Tuliskan dalam Bahasa Indonesia:
1. Pemahaman Anda atas tugas dalam 2 sampai 3 kalimat.
2. Daftar berkas yang akan dibuat atau diubah, dan alasannya.
3. Uji yang akan ditambah (unit, integrasi API, E2E).
4. Risiko terhadap aturan AGENTS.md bagian A dan bagian E (hal yang wajib ditanyakan).
5. Pertanyaan bila ada yang belum jelas.
Tunggu persetujuan saya sebelum mengubah berkas apa pun.

LANGKAH 3. SETELAH SAYA SETUJUI
- Buat cabang baru dari main sesuai AGENTS.md bagian D (feat/..., fix/..., data/...).
- Kerjakan sedikit demi sedikit. Jangan mengubah berkas di luar lingkup tugas.
- Jangan menonaktifkan uji, lint, atau pemeriksaan agar lolos.
- Bila menemukan pertentangan dengan AGENTS.md atau ADR, berhenti dan tanyakan.

LANGKAH 4. SEBELUM MENYATAKAN SELESAI
Jalankan: npm run check dan npm run test:e2e. Perbarui CHANGELOG.md bagian "Belum dirilis" dan status di
docs/rencana-kerja.md bila butirnya selesai. Lalu laporkan:
- Ringkasan perubahan per berkas.
- Hasil perintah pemeriksaan (tempel baris ringkasannya, jangan dikarang).
- Hal yang belum dikerjakan atau masih ragu.
- Draf deskripsi pull request sesuai .github/pull_request_template.md.

TUGAS:
<tempel isi kartu tugas dari isu GitHub, atau tulis: "Kerjakan isu #<nomor>">
```

## B. Untuk Claude.ai Project atau Gemini Gem (obrolan, tanpa akses repositori)

Isi _Project instructions_ / _Gem instructions_ dengan teks berikut, lalu unggah `AGENTS.md`,
`docs/rencana-kerja.md`, semua `docs/adr/*.md`, dan berkas kode yang akan diubah sebagai pengetahuan.

```text
Anda membantu pengembangan SIKOP (portal BPS Kabupaten Pesisir Barat). Berkas AGENTS.md yang terlampir
adalah aturan kerja yang wajib dipatuhi; bagian A tidak boleh dilanggar dalam kondisi apa pun.
docs/rencana-kerja.md adalah peta jalan resmi; jangan mengerjakan hal di luar itu.

Cara kerja:
1. Sebelum menulis kode, tuliskan rencana (berkas yang diubah, uji, risiko terhadap AGENTS.md) dan tunggu
   persetujuan.
2. Selalu berikan BERKAS UTUH yang siap disalin beserta jalurnya, bukan potongan. Jangan mengarang isi
   berkas yang tidak terlampir; minta saya mengunggahnya.
3. Ikuti pola kode yang terlampir. Bahasa Indonesia formal, tanpa em dash.
4. Ingatkan saya bahwa hasil wajib diuji dengan npm run check dan npm run test:e2e sebelum pull request.
```

Pesan pertama di Project/Gem cukup: `Tugas: <isi kartu tugas>`.

## Mengapa susunannya begini

- **Baca dulu** mencegah AI menebak arsitektur dan membuat pola baru.
- **Rencana lalu berhenti** adalah titik kendali staf: kesalahan arah tertangkap sebelum ada kode.
- **Laporan dengan hasil perintah asli** mencegah klaim "sudah diuji" yang tidak benar.
- Teks yang sama untuk Claude dan Gemini membuat hasil kedua tim dapat dibandingkan dan diperiksa dengan
  cara yang sama.
