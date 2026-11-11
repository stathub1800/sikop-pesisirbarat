# Panduan delegasi: melanjutkan SIKOP bersama staf dan asisten AI

Tujuan: siapa pun yang melanjutkan SIKOP, dengan Claude, Gemini, atau tanpa AI, menghasilkan perubahan yang
selaras dengan keputusan yang sudah diambil. Keselarasan dijaga oleh tiga lapis, bukan oleh ingatan orang
atau percakapan AI.

```
Lapis 1  ATURAN TERTULIS   AGENTS.md (satu sumber) + ADR di docs/adr/
         dibaca otomatis   CLAUDE.md dan GEMINI.md hanya mengimpor AGENTS.md
            │
Lapis 2  PAGAR OTOMATIS    npm run check  →  cek-pagar, cek-konfigurasi, lint, tipe, uji
         di CI             GitHub Actions menolak pull request yang melanggar
            │
Lapis 3  GERBANG REVIEW    CODEOWNERS + templat pull request
         oleh pemilik      tidak ada yang masuk ke main tanpa persetujuan pemilik proyek
```

Aturan di lapis 1 bisa dilupakan atau disalahpahami AI. Karena itu aturan yang paling penting juga dijaga
mesin di lapis 2, dan keputusan yang tidak bisa diperiksa mesin dijaga manusia di lapis 3.

## 1. Persiapan sekali oleh pemilik proyek

1. Ganti `@pengelola-sikop` di `.github/CODEOWNERS` dengan akun GitHub pemilik proyek.
2. Di GitHub: Settings → Branches → aturan untuk `main`:
   - Require a pull request before merging, dengan 1 persetujuan dan **Require review from Code Owners**.
   - Require status checks to pass: centang job **CI / Lint, tipe, uji unit dan integrasi, build** dan
     **CI / Uji ujung-ke-ujung (browser)**.
   - Do not allow bypassing the above settings.
3. Beri staf akses **Write** (bukan Admin) ke repositori.

## 2. Persiapan oleh setiap staf, sesuai alat AI

| Alat                                               | Yang dibaca otomatis            | Yang perlu dilakukan                                                                                                                                 |
| -------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code (terminal, desktop, web)               | `CLAUDE.md` → `AGENTS.md`       | Buka folder repositori. Tidak perlu pengaturan lain.                                                                                                 |
| Gemini CLI                                         | `GEMINI.md` → `AGENTS.md`       | Buka folder repositori. Tidak perlu pengaturan lain.                                                                                                 |
| Alat lain (Codex, Copilot, Cursor, dan sebagainya) | `AGENTS.md` bila alat mendukung | Bila tidak terbaca otomatis, tulis di pesan pertama: "Baca dan patuhi AGENTS.md".                                                                    |
| Claude.ai Project (obrolan)                        | tidak membaca repositori        | Buat Project "SIKOP". Tempel isi `AGENTS.md` ke _Project instructions_. Unggah `AGENTS.md`, semua `docs/adr/*.md`, dan berkas kode yang akan diubah. |
| Gemini Gem (obrolan)                               | tidak membaca repositori        | Buat Gem "SIKOP". Tempel isi `AGENTS.md` ke _Instructions_. Unggah berkas yang sama ke _Knowledge_.                                                  |

Untuk alat obrolan, perbarui instruksi Project atau Gem setiap kali `AGENTS.md` berubah. Hasil dari alat
obrolan tetap wajib melalui cabang, `npm run check`, dan pull request.

## 3. Kartu tugas dan prompt baku

- Pemilik proyek membuat isu GitHub dengan templat **Kartu tugas** (`.github/ISSUE_TEMPLATE/tugas.md`).
  Ambil butirnya dari `docs/rencana-kerja.md`, satu butir satu isu.
- Staf memulai sesi AI dengan `docs/prompt/1-mulai-tugas.md` (teks sama untuk Claude dan Gemini).
- Bila sesi terputus atau pindah tangan: `docs/prompt/2-lanjutkan-sesi.md`.
- Pemilik proyek memeriksa hasil dengan Claude memakai `docs/prompt/3-periksa-pr.md`.

## 4. Alur kerja staf

```
Isu (kartu tugas) → cabang feat/... → kerja dengan AI → npm run check + test:e2e
   → pull request (templat terisi, tangkapan layar) → CI hijau → review pemilik → gabung ke main → deploy
```

## 5. Yang diperiksa pemilik proyek saat review

- Apakah perubahan sesuai kartu tugas dan tidak melebar ke berkas lain?
- Apakah ada menu, halaman, dependensi, layanan, atau tabel baru? Bila ya, apakah sudah disetujui dan ada ADR?
- Apakah data yang tampil tetap agregat kecamatan?
- Apakah tangkapan layar desktop dan ponsel, terang dan gelap, rapi?
- Apakah uji benar-benar menguji perilaku baru, bukan sekadar lolos?

## 6. Mengubah aturan

Aturan boleh berubah, tetapi hanya lewat pull request ke `AGENTS.md` (dan ADR bila menyangkut arsitektur)
yang disetujui pemilik proyek. Jangan menulis aturan tambahan di `CLAUDE.md`, `GEMINI.md`, atau instruksi
Project/Gem saja, karena staf lain dengan alat berbeda tidak akan membacanya.
