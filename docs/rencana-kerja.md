# Rencana kerja SIKOP

Dokumen ini adalah **peta jalan resmi**. Staf dan asisten AI hanya mengerjakan butir yang tercantum di sini
atau di isu GitHub yang dibuat pemilik proyek. Status diperbarui di pull request yang menyelesaikan butirnya.

## Status saat ini (v2.3)

| Bagian                                                                  | Status          | Rujukan                     |
| ----------------------------------------------------------------------- | --------------- | --------------------------- |
| Infrastruktur Cloudflare Rp0, pemasang `PASANG-SIKOP.bat`, CI, cadangan | Selesai         | ADR-0001, `docs/runbook.md` |
| Indikator satu sumber, Podes agregat kecamatan                          | Selesai         | ADR-0002, ADR-0005          |
| Peta Tematik satu pintu (pola SIGER Desa)                               | Selesai         | ADR-0006                    |
| Beranda "pintu masuk ringkas"                                           | Selesai         | CHANGELOG v2.3              |
| Layanan data, verifikasi sertifikat, direktori sekolah                  | Selesai         | `docs/api.md`               |
| Aturan kerja untuk staf dan AI (AGENTS.md, pagar otomatis)              | Selesai         | `docs/panduan-delegasi.md`  |
| **Fase 2: Ruang Belajar sisi peserta**                                  | **Berikutnya**  | bagian di bawah             |
| Fase 3: Penyusun kursus di admin                                        | Menunggu Fase 2 | bagian di bawah             |

## Fase 2: Ruang Belajar sisi peserta

Tujuan: Ruang Belajar terasa seperti situs kursus modern (pola jalur terstruktur ala Dicoding, Prakerja,
Coursera), dapat dipakai empat kelompok peserta, dengan materi video YouTube, bacaan, PDF/slide, dan latihan.

**Peserta sasaran**: ASN/OPD Pemda, masyarakat umum, pelajar dan mahasiswa, petugas dan mitra BPS.

Pecah menjadi pull request kecil sesuai urutan berikut. Setiap butir = satu isu = satu PR.

### 2.1 Skema dan API (wajib ADR-0007 "Struktur kursus bab dan pelajaran")

- Migrasi baru `0003_lms_pelajaran.sql` (migrasi lama tidak diubah):
  - `kursus`: tambah `level` (`dasar`/`menengah`/`lanjut`), `sasaran_json` (daftar kategori peserta),
    `hasil_belajar_json`, `durasi_menit`, `gambar_url`.
  - Tabel baru `bab` (id, kursus_id, urutan, judul) dan `pelajaran` (id, bab_id, urutan, judul,
    `jenis` IN ('video','bacaan','pdf','latihan'), `isi_json`, `durasi_menit`, `wajib`).
  - Tabel baru `progres_pelajaran` (akun_id, pelajaran_id, selesai_pada), kunci gabungan.
  - `peserta`: tambah `kategori` IN ('asn','umum','pelajar','mitra'); **NIP hanya wajib untuk ASN**.
    Karena SQLite tidak dapat melepas `NOT NULL`, tabel `peserta` dibangun ulang di migrasi dengan
    menyalin data lama (kategori lama = 'asn').
  - Data modul lama dipetakan: satu modul = satu bab; video, ringkasan, dan sumber menjadi pelajaran.
- API publik: `GET /lms/kursus?level=&sasaran=`, `GET /lms/kursus/:id` (silabus lengkap tanpa isi
  latihan), `GET /lms/pelajaran/:id` (isi untuk peserta terdaftar),
  `POST /lms/saya/progres/:pelajaran` (tandai selesai), `GET /lms/saya/kursus`.
- Kunci jawaban latihan dan ujian tetap hanya di server (ADR-0004). Uji integrasi wajib membuktikannya.

### 2.2 Katalog `/belajar/`

- Kartu kursus: gambar, judul, level, durasi, jumlah pelajaran, sasaran peserta, label bersertifikat.
- Saringan: sasaran peserta, level, tema; pencarian judul. Saringan tersimpan di URL.
- Bagian "Lanjutkan belajar" untuk peserta yang sudah masuk.

### 2.3 Halaman kursus `/belajar/#/kursus/:id`

- Pembuka: judul, ringkasan, level, durasi, sasaran, tombol "Mulai belajar" atau "Lanjutkan".
- "Yang akan Anda pelajari" (hasil belajar), silabus bab dan pelajaran yang dapat dibuka-tutup dengan ikon
  jenis materi dan durasi, syarat kelulusan dan sertifikat.

### 2.4 Pemutar materi `/belajar/#/belajar/:kursus/:pelajaran`

- Sidebar kiri: daftar bab dan pelajaran dengan tanda selesai dan persentase progres; di ponsel menjadi laci.
- Area materi sesuai jenis: video (YouTube `youtube-nocookie.com`, sudah diizinkan CSP `frame-src`),
  bacaan (Markdown yang disanitasi, tanpa HTML mentah), PDF (tautan dan pratinjau), latihan (kuis singkat
  dinilai di server, boleh diulang).
- Tombol "Tandai selesai", "Sebelumnya", "Berikutnya"; ujian akhir terbuka setelah semua pelajaran wajib
  selesai; sertifikat seperti alur yang sudah ada.

### 2.5 Pendaftaran dan "Kursus saya"

- Formulir pendaftaran bercabang menurut kategori: ASN (NIP 18 digit, instansi, jabatan), umum (pekerjaan),
  pelajar/mahasiswa (sekolah/kampus), mitra BPS (kegiatan). Data minimum, persetujuan privasi tetap.
- Halaman "Kursus saya": kursus berjalan, selesai, dan sertifikat.

### 2.6 Kursus contoh

- Satu kursus contoh lengkap (mis. "Membaca Data BPS untuk Perencanaan Daerah") dengan 3 bab, semua jenis
  materi, dan bank soal **sintetis** untuk uji. Bank soal asli tetap di luar repositori.

**Kriteria selesai Fase 2**: semua alur di atas tercakup uji E2E (desktop dan ponsel), `npm run check`
hijau, tangkapan layar terang dan gelap terlampir di PR, tidak ada aturan AGENTS.md yang dilanggar.

## Fase 3: Penyusun kursus di admin

- CRUD Kursus → Bab → Pelajaran dengan urutan seret-lepas atau tombol naik/turun.
- Penyunting per jenis materi: tautan YouTube (divalidasi), Markdown dengan pratinjau, unggah atau tautan
  PDF, penyusun soal latihan.
- Pratinjau sebagai peserta sebelum terbit; status draf/terbit; riwayat perubahan (`updated_by`).
- Hak akses mengikuti peran admin yang ada.

## Di luar rencana (perlu persetujuan dan ADR sebelum dikerjakan)

Forum diskusi, pembayaran, aplikasi seluler, integrasi SSO BPS, menu baru di luar empat menu utama.
