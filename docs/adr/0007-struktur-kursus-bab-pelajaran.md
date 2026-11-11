# ADR-0007: Struktur kursus bab dan pelajaran

Status: diterima, 12 November 2026 (Fase 2 butir 2.1; disetujui pemilik proyek)

## Konteks

Ruang Belajar v2.0 hanya mengenal kursus dan modul. Satu modul berisi daftar video, satu ringkasan teks, dan
daftar sumber, ditambah pre-test dan post-test. Empat kelompok peserta (ASN dan OPD Pemda, masyarakat umum,
pelajar dan mahasiswa, petugas dan mitra BPS) membutuhkan jalur belajar bertahap seperti situs kursus modern,
dengan materi video, bacaan, dokumen, dan latihan, serta pendaftaran yang tidak memaksa semua orang memiliki NIP.

## Keputusan

1. **Kursus berisi bab, bab berisi pelajaran.** Tabel baru `bab` dan `pelajaran`. Jenis pelajaran: `video`,
   `bacaan`, `pdf`, `latihan`. Isi disimpan di `pelajaran.isi_json` menurut jenis:
   video `{url, durasi}`, bacaan `{markdown}`, pdf `{url, penerbit}`, latihan `{petunjuk, nilai_lulus}`.
   Isi diperiksa dengan skema Zod bersama (`periksaIsiPelajaran` di `@sikop/shared`).
2. **Modul tetap menjadi sarang evaluasi.** Pre-test, post-test, dan ujian akhir tetap memakai `modul`, `soal`,
   dan `percobaan` tanpa perubahan (ADR-0004 berlaku utuh). `bab.modul_id` menautkan sebuah bab ke modul yang
   menyimpan evaluasinya. Bab yang menunjuk modul belum terbit tidak tampil. Satu modul lama sama dengan satu
   bab; pemetaan data lama dilakukan di migrasi 0003 dan dicerminkan di `scripts/lib/lms-seed.mjs`.
3. **Soal latihan terpisah dari bank soal ujian**, di tabel `soal_latihan`. Alasannya: constraint `soal.jenis`
   pada migrasi 0001 hanya mengizinkan `pre`, `post`, `akhir`, dan SQLite tidak dapat mengubah constraint
   tanpa membangun ulang tabel `soal` yang dirujuk `percobaan`. Kunci latihan hanya dibaca fungsi penilaian
   di server (`nilaiLatihan`). Latihan dapat diulang tanpa batas; respons memuat benar atau salah per soal dan
   pembahasan, tidak pernah huruf kunci. Latihan tidak memengaruhi nilai ujian atau sertifikat; ia hanya
   menandai pelajaran selesai bila nilai minimal tercapai.
4. **Progres per pelajaran** di `progres_pelajaran (akun_id, pelajaran_id)`. Penandaan idempoten. Latihan hanya
   selesai karena lulus, bukan karena tombol.
5. **Gerbang ujian akhir**: ujian akhir terbuka bila semua post-test modul lulus (aturan lama) **dan** semua
   pelajaran dengan `wajib = 1` pada bab yang tampil sudah selesai. Kursus lama tanpa pelajaran tidak berubah
   perilakunya. Pelajaran hasil pemetaan data lama diberi `wajib = 0` agar peserta yang sudah lulus post-test
   tidak terkunci dari ujian akhir. Pelajaran baru memakai `wajib = 1` secara bawaan.
6. **Peserta berkategori**: kolom `peserta.kategori` (`asn`, `umum`, `pelajar`, `mitra`). NIP hanya wajib untuk
   ASN (`CHECK (kategori <> 'asn' OR nip IS NOT NULL)`), sehingga `nip` dan `jabatan` boleh kosong. Kolom
   `instansi` menyimpan asal peserta: instansi (ASN), pekerjaan (umum), sekolah atau kampus (pelajar), atau
   kegiatan BPS (mitra). Karena SQLite tidak dapat melepas `NOT NULL`, tabel `peserta` dibangun ulang dengan
   menyalin data lama sebagai `asn`. Permintaan pendaftaran lama tanpa `kategori` diperlakukan sebagai ASN.
   Kategori peserta yang sudah diverifikasi tidak dapat diubah sendiri. Verifikasi admin, syarat sertifikat,
   dan isi sertifikat tidak berubah; sertifikat peserta tanpa NIP memuat NIP tersamar kosong.
7. **Metadata katalog** pada `kursus`: `level` (dasar, menengah, lanjut), `sasaran_json` (daftar kategori;
   kosong berarti untuk semua), `hasil_belajar_json`, `durasi_menit` (0 berarti dihitung dari pelajaran),
   `gambar_url`. `gambar_url` hanya boleh berupa jalur di situs sendiri, karena CSP `img-src` tidak
   mengizinkan domain luar.
8. **Isi pelajaran hanya untuk peserta terdaftar** (`GET /lms/pelajaran/:id`, perlu login dan profil peserta).
   Silabus publik (`GET /lms/kursus/:id`) memuat judul, jenis, durasi, dan status wajib, tanpa isi dan tanpa soal.
9. **Markdown disanitasi di peramban tanpa dependensi baru.** Penyaji kecil di `apps/web/src/lib/markdown.ts`
   hanya membuat elemen lewat `h()`: tanpa HTML mentah, tautan hanya `https:` atau jalur situs sendiri.
10. **Pratinjau PDF belum ada.** CSP `frame-src` tidak mengizinkan `'self'` maupun domain dokumen, dan
    `object-src` bernilai `'none'`. Pelajaran PDF menampilkan tautan buka di tab baru. Pratinjau tertanam
    memerlukan perubahan CSP (aturan mutlak A6) dan ditunda sampai pemilik proyek memutuskan.

## Akibat

- Migrasi `0003_lms_pelajaran.sql` hanya menambah tabel dan kolom, kecuali pembangunan ulang `peserta`
  (data disalin dan diuji oleh `scripts/uji-migrasi.mjs` terhadap data bergaya produksi).
- Admin Fase 2 belum dapat menyusun bab dan pelajaran lewat panel (Fase 3). Sementara itu, bab dan pelajaran
  dibuat lewat seed (`data/lms/*.json`, `npm run data:lms`). Modul baru yang dibuat di panel admin belum
  otomatis memiliki bab dan hanya muncul di halaman modul lama.
- Halaman `#/modul/:id` tetap menjadi pintu evaluasi (pre-test dan post-test) dan tetap menampilkan materi
  lama bila modul belum dipetakan.
- Bank soal asli tetap di luar repositori. Kursus contoh di `data/lms/kursus-contoh.json` sintetis dan boleh
  di-commit; seed-nya `apps/api/test/fixtures/seed-lms-contoh.sql` dibangkitkan oleh `npm run data:lms:contoh`
  dan diperiksa kesesuaiannya di CI.
