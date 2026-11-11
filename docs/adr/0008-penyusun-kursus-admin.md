# ADR-0008: Penyusun kursus di panel admin

Status: diterima, 12 November 2026 (Fase 3; disetujui pemilik proyek)

## Konteks

Fase 2 menghadirkan kursus berbab dan pelajaran, tetapi bab dan pelajaran baru hanya dapat dibuat lewat seed
atau SQL. Pengelola konten membutuhkan penyusun di panel admin: membuat dan mengurutkan bab dan pelajaran,
menyunting isi menurut jenis materi, melihat hasilnya seperti peserta, dan menerbitkan dengan aman.

## Keputusan

1. **Status draf/terbit per bab dan per pelajaran** lewat kolom `is_published` (migrasi 0004, hanya
   `ALTER TABLE ADD COLUMN`; data lama tetap terbit). Status kursus (`kursus.is_published`) tetap gerbang
   terluar. Bab dan pelajaran baru dari penyusun dibuat sebagai **draf**. Peserta tidak pernah melihat draf:
   silabus, isi pelajaran, hitungan progres, durasi, dan gerbang ujian akhir semuanya hanya menghitung yang terbit.
2. **Penguncian optimistis dan penyunting terakhir.** Bab dan pelajaran mendapat `version`, `updated_at`,
   `updated_by` seperti tabel admin lain. Perubahan dengan versi usang ditolak 409.
3. **Riwayat perubahan memakai `audit_log` yang sudah ada**, bukan tabel baru. Setiap perubahan bab, pelajaran,
   dan soal latihan menyertakan `kursus_id` di nilai sebelum/sesudah agar riwayat per kursus dapat disaring,
   termasuk untuk entitas yang sudah dihapus. Kunci jawaban latihan tetap disembunyikan dari audit.
4. **Urutan lewat tombol naik/turun**, bukan seret-lepas: dapat dioperasikan dengan papan ketik dan layar
   sentuh tanpa pustaka tambahan. API menerima daftar id berurutan dan menulisnya atomik (urutan sementara
   negatif agar tidak melanggar `UNIQUE (bab_id, urutan)`).
5. **Isi diperiksa dengan skema bersama** (`periksaIsiPelajaran`) yang sama dengan seed. Tautan video hanya
   `youtube-nocookie.com`; tautan YouTube biasa dinormalkan penyunting ke bentuk embed sebelum disimpan.
6. **PDF hanya tautan https**, tanpa unggah berkas. Unggah memerlukan R2 dan perubahan CSP (`frame-src`) yang
   di luar cakupan; ditunda dan dicatat di rencana kerja.
7. **Penghapusan dibatasi.** Bab atau pelajaran yang sudah punya progres peserta tidak dapat dihapus (409);
   gunakan status draf agar riwayat belajar tidak hilang.
8. **Pratinjau sebagai peserta** lewat endpoint admin yang menyajikan bentuk data sama dengan endpoint
   peserta (termasuk draf), sehingga tampilan memakai kode penyaji yang sama. Latihan di pratinjau dinilai
   tanpa mencatat progres.
9. **Pemeriksaan kesiapan** (`GET /admin/lms/kursus/:id/kesiapan`) menampilkan daftar masalah sebelum terbit
   (bab kosong, latihan tanpa soal, tautan tidak valid, soal ujian akhir kurang). Sifatnya peringatan, bukan
   penghalang, agar kursus lama tetap dapat diterbitkan.
10. **Hak akses tidak berubah**: seluruh rute berada di bawah peran `pengelola_lms`.

## Konsekuensi

- Satu migrasi aditif; tidak ada tabel baru.
- Kursus yang seluruh pelajarannya draf tampil di peserta seperti kursus tanpa pelajaran (silabus kosong).
- Pengurutan ulang memerlukan beberapa pernyataan dalam satu batch; D1 menjalankannya sebagai satu transaksi.
