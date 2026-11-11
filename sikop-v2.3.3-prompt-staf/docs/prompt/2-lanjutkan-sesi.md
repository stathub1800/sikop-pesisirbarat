# Prompt 2: Melanjutkan pekerjaan yang terputus

Dipakai bila sesi AI kehabisan konteks, berganti hari, atau pekerjaan diambil alih staf lain (termasuk
pindah dari Claude ke Gemini atau sebaliknya). Ingatan AI tidak dibawa; yang dibawa adalah **cabang git**
dan **catatan serah terima**.

## Sebelum menutup sesi: minta catatan serah terima

```text
Sebelum sesi ini berakhir, tulis berkas CATATAN-SERAH-TERIMA.md di akar cabang ini (berkas ini dihapus
sebelum pull request digabung) berisi:
1. Tugas dan nomor isu.
2. Yang sudah selesai (berkas dan uji).
3. Yang belum selesai, berurutan.
4. Keputusan yang sudah disetujui pemilik proyek atau staf, beserta alasannya.
5. Masalah terbuka atau galat terakhir (tempel pesan aslinya).
6. Perintah untuk memeriksa keadaan saat ini.
Lalu commit dan push cabang ini.
```

## Di sesi baru

```text
Anda melanjutkan pekerjaan SIKOP yang terputus di cabang <nama-cabang>.

1. Baca AGENTS.md, docs/rencana-kerja.md, dan CATATAN-SERAH-TERIMA.md.
2. Jalankan: git log --oneline main..HEAD dan git diff --stat main...HEAD untuk melihat yang sudah berubah.
3. Jalankan npm run check untuk mengetahui keadaan saat ini.
4. Ringkas kepada saya: posisi pekerjaan, sisa langkah, dan apakah ada yang bertentangan dengan AGENTS.md.
   Tunggu persetujuan sebelum melanjutkan.

Jangan mengulang pekerjaan yang sudah selesai dan jangan mengubah keputusan di catatan tanpa bertanya.
```
