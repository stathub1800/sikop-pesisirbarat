# Prompt 3: Pemeriksaan pull request oleh pemilik proyek (Claude)

Dipakai pemilik proyek untuk meminta Claude memeriksa hasil kerja staf, apa pun alat AI yang mereka pakai.
Claude di sesi baru tidak mengingat percakapan lama; semua patokan pemeriksaan sudah ada di repositori
(`AGENTS.md`, ADR, `docs/rencana-kerja.md`, uji), jadi hasilnya tetap konsisten.

```text
Periksa pull request SIKOP berikut sebagai peninjau independen. Anda tidak menulis kode ini.

Repositori : <akun>/sikop-pesisirbarat
Pull request: #<nomor>  (atau tautan lengkap)
Kartu tugas: isu #<nomor>
Alat AI yang dipakai staf: <Claude / Gemini / tanpa AI>

Langkah:
1. Tambahkan repositori ke sesi, ambil cabang PR, baca AGENTS.md, docs/rencana-kerja.md, ADR terkait,
   kartu tugas, dan seluruh diff (git diff main...<cabang>).
2. Jalankan npm ci, npm run check, dan uji E2E. Ambil tangkapan layar halaman yang berubah di desktop dan
   ponsel, terang dan gelap. Gunakan bank soal sintetis; jangan meminta rahasia produksi.
3. Periksa:
   a. Aturan mutlak AGENTS.md bagian A, satu per satu (Podes agregat kecamatan, butir sensitif, kunci
      jawaban, rahasia, data pribadi, CSP, Rp0, migrasi).
   b. Kesesuaian dengan kartu tugas: semua kriteria selesai terpenuhi, tidak ada perubahan di luar lingkup.
   c. Hal yang wajib ditanyakan (AGENTS.md bagian E): menu, dependensi, skema, autentikasi, penilaian.
   d. Mutu: pola kode yang ada diikuti, tidak ada duplikasi pembantu, aksesibilitas, mode gelap, ponsel.
   e. Uji: benar-benar menguji perilaku baru (bukan sekadar lolos), tidak ada uji yang dimatikan.
   f. Dokumen: CHANGELOG, rencana-kerja, ADR baru bila ada keputusan arsitektur.
4. Jangan mengubah kode, jangan memberi komentar di GitHub, dan jangan menggabungkan PR kecuali saya minta.

Laporan (Bahasa Indonesia formal, tanpa em dash):
- Keputusan: SETUJUI / SETUJUI DENGAN CATATAN / MINTA PERUBAHAN, dengan alasan satu paragraf.
- Temuan berurutan dari yang terberat: KRITIS (melanggar aturan A atau merusak), PENTING (harus diperbaiki
  sebelum gabung), SARAN (boleh menyusul). Setiap temuan: berkas:baris, masalah, bukti, perbaikan yang
  disarankan.
- Bukti pemeriksaan: ringkasan hasil npm run check dan E2E, serta tangkapan layar.
- Komentar siap tempel untuk staf di PR, ringkas dan dapat ditindaklanjuti.
```

## Variasi singkat

- **Pemeriksaan cepat** (perubahan kecil, mis. teks atau data): tambahkan "Lewati tangkapan layar bila tidak
  ada perubahan tampilan."
- **Pemeriksaan ulang** setelah staf memperbaiki: "Periksa ulang PR #<nomor>. Fokus pada temuan
  sebelumnya: <tempel daftar temuan>. Pastikan perbaikannya tidak menimbulkan masalah baru."
- **Izinkan komentar langsung**: ganti langkah 4 dengan "Setelah saya setujui laporannya, kirim komentar
  ulasan ke PR atas nama saya."
