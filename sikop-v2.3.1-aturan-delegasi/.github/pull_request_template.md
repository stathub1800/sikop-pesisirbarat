## Masalah

<!-- Apa yang diperbaiki atau ditambahkan? Tautkan isu. -->

## Solusi

<!-- Ringkas pendekatannya. Sebutkan ADR bila ada keputusan arsitektur baru. -->

## Cara menguji

- [ ] `npm run check` hijau
- [ ] Uji baru untuk bug yang diperbaiki (uji regresi)
- [ ] Tangkapan layar untuk perubahan tampilan (desktop dan ponsel)

## Risiko dan rollback

<!-- Apa yang bisa salah? Bagaimana membatalkannya? Apakah ada migrasi D1? -->

## Daftar periksa keamanan

- [ ] Tidak ada rahasia, NIP, atau data pribadi di kode/log
- [ ] Input divalidasi di server; otorisasi diperiksa di server
- [ ] Tidak ada kunci jawaban yang dapat sampai ke browser peserta

## Kepatuhan AGENTS.md

- [ ] `node scripts/cek-pagar.mjs` lolos
- [ ] Tidak menambah menu, halaman utama, dependensi, atau layanan baru tanpa persetujuan (AGENTS.md bagian E)
- [ ] Tidak ada data, kode, atau nama per desa di keluaran publik (ADR-0005)
- [ ] ADR baru ditambahkan bila ada keputusan arsitektur
- [ ] Tangkapan layar terang dan gelap untuk perubahan tampilan

Alat AI yang dipakai (bila ada): <!-- mis. Claude Code, Gemini CLI, tanpa AI -->
