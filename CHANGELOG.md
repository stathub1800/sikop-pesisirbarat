# Catatan Perubahan

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/) dan [Semantic Versioning](https://semver.org/lang/id/).

## [Belum dirilis]

### Diubah

- Nama indikator Podes dan Dapodik memakai bahasa Indonesia baku dan huruf kapital kalimat yang seragam,
  misalnya "Ada SMA/MA/SMK" menjadi "Ketersediaan SMA/MA/SMK" dan "Jumlah Satuan Pendidikan" menjadi
  "Jumlah satuan pendidikan". Nama di D1 ikut berubah setelah alur data dijalankan ulang.
- Beranda: peta sorotan kini punya legenda warna Rendah sampai Tinggi. Keterangan lama "warna makin gelap
  berarti nilai makin tinggi" keliru pada mode gelap (skala warnanya terbalik) dan dihapus.
- Beranda: kepanjangan SIKOP tampil di pembuka, "Data terakhir dimuat" menjadi "Data terakhir diperbarui",
  dan keterangan kartu sorotan menjadi "Kabupaten: 19 dari 121 desa/kelurahan".
- Keterbacaan: ukuran teks terkecil (`--t-xs`) naik dari 12 px ke 13 px, teks 10 px di peta dihapus, dan
  jarak antarkata sedikit dilebarkan.
- Peta Tematik di ponsel: tombol peta tidak lagi menimpa teks atribusi.
- Beranda: selama belum ada kursus terbit, tombol kedua di pembuka mengarah ke "Ajukan permohonan data"
  dan kembali ke Ruang Belajar dengan sendirinya setelah kursus pertama terbit.
- Tombol "Masuk peserta" di kepala halaman menjadi "Masuk Ruang Belajar" agar jelas untuk siapa.
- Peta Tematik: label kecamatan punya tooltip nama dan nilai, dan legenda memberi petunjuk bila sebagian
  nama kecamatan disembunyikan karena letaknya berdekatan.

### Keamanan

- MapLibre GL dinaikkan ke 6.17 untuk menutup CVE-2026-85061 (XSS lewat atribusi peta). Worker MapLibre
  kini dimuat sebagai berkas terpisah dari `/assets`.

### Ditambahkan

- **Perbaikan hasil uji pengalaman pengguna (12 November 2026)**, lihat ADR-0008:
  - Tabel dinamis `/tabel/`: bandingkan hingga 15 indikator antarkecamatan (urutkan, tukar baris dan kolom,
    tampilkan peringkat, unduh CSV) dan tabulasi silang sekolah menurut kecamatan, jenjang, status, dan
    akreditasi (jumlah atau persen baris, kolom, total). Endpoint baru `GET /api/v1/sekolah/rekap`.
  - Ringkasan untuk pimpinan di profil kecamatan: tiga keunggulan dan tiga tantangan dibanding kabupaten,
    serta tombol "Cetak / simpan PDF" dengan tata letak cetak berwarna terang.
  - Kalimat penjelasan untuk setiap indikator (mis. arti "Ada SD/MI") di kartu Peta Tematik, sorotan
    Beranda, dan tabel profil kecamatan.
  - Tombol tema tampilan (ikuti sistem, terang, gelap) di kepala halaman.
  - Rekap banyaknya sekolah per jenjang di atas daftar sekolah (dapat diklik untuk menyaring).
  - Penanda "Tahap pengembangan" untuk Ruang Belajar dan kontak PST.

- `docs/rencana-kerja.md` (peta jalan resmi Fase 2 dan 3), prompt baku di `docs/prompt/` untuk memulai
  tugas, melanjutkan sesi, dan memeriksa pull request, serta templat isu "Kartu tugas".

- **Ruang Belajar Fase 2 (sisi peserta)**: skema kursus berbab (ADR-0007, migrasi `0003_lms_pelajaran.sql`),
  katalog bersaringan (sasaran, level, tema, cari judul, tersimpan di URL) dengan "Lanjutkan belajar", halaman
  kursus dengan silabus bab dan pelajaran, pemutar `#/belajar/:kursus/:pelajaran` (video YouTube nocookie,
  bacaan Markdown disanitasi, tautan dokumen, latihan dinilai server tanpa membocorkan kunci), pendaftaran
  bercabang per kategori (ASN, umum, pelajar, mitra; NIP hanya untuk ASN), halaman "Kursus saya", dan kursus
  contoh sintetis "Membaca Data BPS untuk Perencanaan Daerah" (`npm run data:lms:contoh`). Ujian akhir kini
  juga menunggu pelajaran wajib selesai. Uji migrasi `npm run uji:migrasi` dan E2E desktop serta ponsel.

### Diubah

- Jumlah peserta didik, guru, dan rombel sementara tidak ditayangkan (madrasah tercatat 0 di Dapodik);
  indikator turunannya ikut disembunyikan dari publik (`TAYANG_PD_GURU`).
- Indikator jumlah (mis. jumlah satuan pendidikan) kini dibandingkan dengan rata-rata per kecamatan dan
  porsi terhadap total kabupaten, bukan "di bawah kabupaten".
- Panel peringkat memakai istilah netral ("nilai tertinggi/terendah"); nilai sama ditandai "=" dan teks
  peringkat menyebut banyaknya kecamatan bernilai sama.
- Label peta selalu memuat nama kecamatan; label yang bertabrakan digeser, lalu dipendekkan, agar tidak
  saling menimpa (termasuk di ponsel).
- Penyebut khusus dijelaskan ("desa, tanpa kelurahan", "desa pesisir"); contoh di "Kecamatan yang perlu
  perhatian" diurutkan dari selisih terbesar dan menyebut indikator berarah.
- Satuan tampil di kartu ringkas (mis. "5,0 km"); tombol lapisan peta kini berlabel "Lapisan".
- Data Sekolah dan profil sekolah memakai remah "Peta Tematik / Data Sekolah"; tombol "Masuk" menjadi
  "Masuk peserta"; teks keterangan kecil di peta diperbesar ke 12 px.
- Server pengembangan dan pratinjau Vite kini menerapkan `public/_redirects`, sehingga uji E2E pengalihan
  `/podes/` lolos di CI. Sebelumnya uji ini selalu gagal, CI `main` merah, dan alur Deploy (yang menunggu CI
  hijau) tidak pernah berjalan.
- Sertifikat peserta non-ASN terbit tanpa NIP. Pratinjau PDF belum ada (CSP `frame-src`); dokumen dibuka di tab baru.
- CI memakai Chrome bawaan runner untuk uji browser, sehingga tidak bergantung pada mirror apt Ubuntu.
- Pemasang mencoba ulang galat jaringan ke Cloudflare dan menampilkan langkah perbaikannya.

- **Beranda menjadi pintu masuk ringkas**: dua pintu utama (Peta Tematik dan Ruang Belajar), kartu "Isi
  SIKOP saat ini", sorotan lintas tema (satu indikator kunci per tema yang mewarnai peta dan peringkat
  kecamatan), kecamatan yang perlu perhatian (paling sering di tiga terbawah, dengan catatan cara hitung),
  kursus terbaru, pintasan Layanan Data, dan pita sumber data. Semua angka dibaca dari API.
- Tipe dan pembantu indikator dipindah ke `apps/web/src/lib/indikator.ts` agar Beranda dan Peta Tematik
  memakai format angka, ikon tema, dan peringkat yang sama.

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
