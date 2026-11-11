# Catatan Perubahan

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/) dan [Semantic Versioning](https://semver.org/lang/id/).

## [2.1.0] - 2026-11-11

### Diubah

- **Peta Tematik menjadi satu pintu data visual** dengan antarmuka bergaya SIGER Desa (ADR-0006): peta
  penuh layar; panel kanan profil wilayah, 6 tab tema, dan kartu indikator (ikon, angka, rincian desa,
  bilah progres, penjelasan); label angka per kecamatan; peringkat dan legenda; telusur kecamatan dengan
  pembanding kabupaten dan peringkat; pencarian Ctrl K untuk kecamatan, sekolah, dan indikator; mode
  presentasi. Kategori indikator kini berarti tema.
- Menu utama dirampingkan menjadi Beranda, Peta Tematik, Ruang Belajar, dan Layanan Data. Daftar sekolah
  tetap tersedia dari Peta Tematik, profil kecamatan, dan footer.
- Profil kecamatan menampilkan semua indikator dalam satu tabel lintas tema.

### Ditambahkan

- 48 indikator Podes 2026 (agregat kecamatan) di 9 tema, dengan teks "x dari y desa".
- Pipeline `npm run data:podes`: membaca DBF Podes dan menghasilkan agregat kecamatan saja (ADR-0005).
- Migrasi 0002: kolom pembilang dan penyebut untuk indikator berbasis hitungan desa.
- Pengalihan permanen `/podes/` ke `/peta/`.

### Keamanan

- Data Podes per desa tidak pernah keluar dari komputer pengolah; skrip menolak kode selain kecamatan.
- CI menolak berkas `.dbf` atau isi `data/private/` yang ter-commit.
- Indikator Podes tidak dapat disunting manual di panel admin; butir kejadian sensitif tidak ditayangkan.

## [2.0.0] - 2026-11-09

Pembangunan ulang menyeluruh berdasarkan Laporan Pengujian SIKOP (2 sampai 3 November 2026).

### Ditambahkan

- Arsitektur Cloudflare Pages + Workers + D1 + GitHub Actions (ADR-0001).
- Data sekolah: 364 satuan pendidikan, pencarian, saringan, profil, ekspor CSV.
- Profil kecamatan untuk 11 kecamatan termasuk Ngaras.
- Layanan permohonan data dengan nomor tiket dan pelacakan status.
- Verifikasi keaslian sertifikat publik dengan kode dan QR.
- Panel admin berbasis peran dengan jejak audit yang tidak dapat diubah.
- Kebijakan privasi sesuai UU 27/2022 dan persetujuan eksplisit.
- Pipeline data: validasi, koreksi koordinat bertanda, uji titik dalam wilayah, rekonsiliasi.
- CI (lint, tipe, uji unit/integrasi/E2E, pemindaian rahasia), deploy, impor data, cadangan harian.

### Diubah

- Penilaian ujian dan penerbitan sertifikat dipindah ke server; urutan soal dan opsi diacak per percobaan.
- Masuk dengan Google menggantikan kata sandi.
- Peta dasar OpenFreeMap dengan latar cadangan; berkas batas 1.029 KB menjadi 74 KB.
- Semua angka dihitung dari satu sumber dengan sumber, tahun, dan cara hitung.

### Dihapus

- Kunci jawaban dan "hash" kunci di browser.
- Logo mitra contoh templat, penandatangan fiktif, janji fitur yang belum ada.
- Klasifikasi desil berlabel "Standar BPS RI", layer bank 5 titik, angka tertulis tetap.
- Video contoh templat dan tautan unduhan "#".
- Profil ASN contoh berisi NIP di kode.
