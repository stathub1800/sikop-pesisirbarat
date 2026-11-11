# Runbook Operasional SIKOP

Sasaran layanan: RPO 24 jam (cadangan harian), RTO 4 jam.
Kontak eskalasi: pemilik modul di `.github/CODEOWNERS`, lalu Koordinator Pokja TI.

## 1. Deploy dan rollback

- **Deploy** terjadi otomatis setelah CI hijau di `main`, menunggu persetujuan reviewer di environment
  `produksi`.
- **Rollback situs**: Cloudflare Dashboard > Pages > sikop-pesisirbarat > Deployments > pilih deploy
  sebelumnya > _Rollback_.
- **Rollback Worker**: `cd apps/api && npx wrangler rollback` (memilih versi sebelumnya).
- **Migrasi D1** bersifat maju saja. Perubahan yang perlu dibatalkan dibuat sebagai migrasi baru. Sebelum
  migrasi berisiko, jalankan workflow _Cadangan_ secara manual.

## 2. Memperbarui data sekolah (per semester)

1. Unduh ekspor terbaru, simpan sebagai `data/raw/sekolah.csv` (kolom sama).
2. Buat PR. CI menjalankan validasi dan rekonsiliasi; baca ringkasan di halaman run.
3. Setelah digabung, jalankan workflow **Data** dengan opsi _impor_. Cadangan otomatis dibuat sebelum impor.
4. Perbarui `tanggal_data_sekolah` di Pengaturan situs.
5. Tindak lanjuti antrean koordinat di panel admin (Data sekolah, saring status koordinat).

Impor bersifat upsert per NPSN: tidak menggandakan, tidak menimpa pengaturan, tetapi menimpa suntingan admin
pada sekolah yang sama. Bila ada koreksi manual penting, perbaiki juga di sumber Dapodik.

## 3. Mengganti batas wilayah dengan peta resmi

1. Siapkan GeoJSON per kecamatan dengan properti `code` (kode Kemendagri 18.13.xx) dan `name`.
2. Ganti isi `data/raw/batas-kecamatan/`, perbarui `sumber_batas_wilayah` di Pengaturan.
3. Jalankan `npm run data:build`; periksa laporan (luas total, titik sekolah per kecamatan), lalu deploy.

## 4. Pergantian penandatangan sertifikat

Pengelola ruang belajar membuka Pengaturan situs > Sertifikat, mengubah nama, jabatan, NIP. Sertifikat
yang sudah terbit tetap menyimpan penandatangan saat terbit (snapshot), sesuai praktik dokumen resmi.

## 5. Insiden: bank soal bocor

1. Nonaktifkan soal yang bocor di Bank soal (centang "Soal aktif").
2. Tambahkan soal pengganti; pastikan jumlah soal aktif ujian akhir ≥ `jumlah_soal_akhir`.
3. Telusuri jejak audit entitas `soal` dan daftar pengguna berperan pengelola ruang belajar.
4. Bila diperlukan, cabut sertifikat yang terbit dalam rentang waktu kebocoran (Sertifikat > Cabut).

## 6. Insiden: dugaan kebocoran data pribadi

1. Cabut akses akun yang dicurigai (Pengguna admin > nonaktifkan; sesi berakhir seketika).
2. Rotasi rahasia: `wrangler secret put IP_SALT`, token API Cloudflare di GitHub.
3. Kumpulkan bukti dari jejak audit dan log Workers (cari `request_id`).
4. Beri tahu subjek data dan lembaga berwenang paling lambat 3 × 24 jam (UU 27/2022 Pasal 46).

## 7. Pemulihan dari cadangan (uji triwulanan)

```bash
gunzip sikop-d1-YYYYMMDD.sql.gz && sha256sum -c sikop-d1-YYYYMMDD.sha256
npx wrangler d1 create sikop-pulih
npx wrangler d1 execute sikop-pulih --remote --file=sikop-d1-YYYYMMDD.sql
```

Verifikasi jumlah baris tabel utama, lalu arahkan `database_id` ke basis data hasil pulih bila diperlukan.
Catat tanggal dan hasil uji pemulihan sebagai bukti audit.

## 8. Peninjauan hak akses (triwulanan)

Superadmin membuka Pengguna admin, memastikan setiap peran masih sesuai tugas, menonaktifkan yang pindah
tugas, dan mencatat peninjauan (tangkapan layar + tanggal) sebagai bukti audit.

## 9. Retensi data

- Permohonan berstatus selesai/ditolak dihapus otomatis 2 tahun setelah ditutup (cron harian).
- Jejak audit dilindungi trigger. Penghapusan entri lebih dari 5 tahun dilakukan lewat migrasi khusus yang
  sementara melepas trigger, disetujui superadmin, dan dicatat sebagai perubahan.

## 10. Domain go.id

Minta Diskominfo membuat CNAME subdomain (misalnya `sikop.pesisirbaratkab.go.id`) ke `sikop-pesisirbarat.pages.dev`,
tambahkan _custom domain_ di Pages, lalu perbarui `ALLOWED_ORIGINS`, origin OAuth Google, domain Turnstile,
`robots.txt`, `sitemap.xml`, dan `SIKOP_SITE_URL`.

## 11. Memperbarui data Podes (potensi desa)

Ketentuan: data Podes hanya boleh tayang sebagai agregat kecamatan (ADR-0005). Berkas per desa tidak boleh
masuk git, GitHub Actions, maupun D1.

1. Simpan berkas `*desapart-1*.dbf` dan `*desapart-2*.dbf` ke `data/private/podes/` di komputer pengolah.
2. Jalankan `npm run data:podes -- --tahun 2026` (ganti tahun sesuai edisi). Skrip mencetak ringkasan
   kabupaten; cocokkan beberapa angka dengan tabulasi resmi.
3. Jalankan `npm run data:build`, lalu `npm test`. Uji integrasi memeriksa konsistensi pembilang dan penyebut.
4. Commit **hanya** `data/raw/podes-<tahun>-kecamatan.csv` lewat PR. Jangan commit berkas DBF.
5. Setelah digabung, jalankan workflow **Data** dengan opsi _impor_ (atau `PASANG-SIKOP.bat`). Indikator
   Podes ditimpa otomatis; edisi tahun terbaru yang dipakai.
6. Hapus berkas DBF dari komputer pengolah bila sudah tidak diperlukan.

Menambah atau mengubah indikator: sunting `packages/shared/src/podes.ts` (definisi, rujukan kuesioner, cara
hitung), tambahkan uji di `packages/shared/test/podes.test.ts`, lalu ulangi langkah 2 sampai 5.
