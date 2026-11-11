# ADR-0006: Peta Tematik sebagai satu pintu data visual

Status: diterima, 11 November 2026

## Konteks

SIKOP sempat memiliki menu terpisah per sumber data (Data Sekolah, Potret Desa). Setiap data baru akan
menambah menu, sehingga pimpinan daerah harus berpindah halaman untuk membandingkan satu kecamatan dari
berbagai sisi. Arahan: bupati dan pemerintah daerah perlu melihat data secara **menyeluruh**, bukan per
tema per menu.

## Keputusan

1. Menu utama SIKOP ada dua: **Peta Tematik** (semua data visual) dan **Ruang Belajar** (LMS). Beranda dan
   Layanan Data tetap ada sebagai menu pendukung.
2. Semua data kewilayahan masuk ke Peta Tematik sebagai **indikator**. Kolom `kategori` berarti **tema**
   (Pendidikan, Kesehatan, Ekonomi, dan seterusnya), bukan nama sumber. Indikator Dapodik dan Podes untuk
   tema yang sama tampil berdampingan; sumber ditandai pada setiap kartu.
3. Tema dipadatkan agar mudah dipahami pimpinan: Pendidikan, Kesehatan, Ekonomi, Infrastruktur,
   Kebencanaan, serta Tata kelola dan sosial, ditambah Wilayah yang tampil sebagai fakta di kartu profil.
   Urutannya diatur di `URUTAN_TEMA` (`packages/shared/src/indikator.ts`); tema baru dari admin otomatis
   muncul sebagai tab tambahan.
4. Pola antarmuka mengikuti SIGER Desa (BPS Provinsi Lampung): peta penuh layar; panel kanan berurutan
   **profil wilayah -> tab tema -> kartu indikator**; klik kartu mewarnai peta dengan label angka per
   kecamatan, peringkat, dan legenda; klik kecamatan menelusuri ke kecamatan itu (wilayah lain diredupkan,
   kartu menampilkan angka kecamatan, pembanding kabupaten, dan peringkat). Tersedia mode presentasi.
5. Halaman rinci yang berupa direktori (daftar sekolah, profil sekolah, profil kecamatan) tetap ada sebagai
   halaman turunan yang dibuka dari Peta Tematik, bukan sebagai menu.
6. Alamat lama `/podes/` dialihkan permanen ke `/peta/`.

## Cara menambah data baru

- Data per kecamatan yang sederhana: isi lewat panel admin, menu Indikator (sumber, tahun, dan cara hitung
  wajib lengkap), pilih tema yang ada atau tulis tema baru.
- Data yang perlu diolah dari berkas mentah (seperti Podes): buat skrip agregasi di `scripts/` yang
  menghasilkan CSV per kecamatan di `data/raw/`, lalu muat lewat `scripts/build-data.mjs`.

Dalam dua cara itu tidak ada halaman, menu, atau kode tampilan baru yang perlu dibuat.

## Akibat

- Satu halaman memuat lebih banyak indikator; panel kiri dilengkapi pencarian (Ctrl K) dan saringan tema.
- Halaman Peta Tematik memuat MapLibre (sekitar 290 kB gzip), tetapi hanya di halaman ini.
