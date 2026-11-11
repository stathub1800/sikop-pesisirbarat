# ADR-0005: Podes hanya ditayangkan sebagai agregat kecamatan

Status: diterima, 11 November 2026

## Konteks

SIKOP menayangkan indikator potensi desa dari Podes (Pemutakhiran Data Perkembangan Desa) BPS. Berkas mentah Podes
berisi satu baris per desa. Ketentuan penyajian yang ditetapkan pimpinan: data Podes yang boleh ditampilkan
hanya **agregat sampai tingkat kecamatan**.

## Keputusan

1. Berkas DBF per desa disimpan hanya di komputer pengolah, di `data/private/podes/` (diabaikan git). Berkas
   ini tidak pernah di-commit, diunggah ke GitHub Actions, atau dikirim ke Worker/D1.
2. `scripts/build-podes.mjs` mengubah berkas itu menjadi `data/raw/podes-<tahun>-kecamatan.csv` yang hanya
   berisi kode kecamatan (7 digit) dan kabupaten (4 digit). Skrip berhenti bila menemukan kode lain.
3. Definisi indikator, cara hitung, dan penyebutnya ada di satu tempat: `packages/shared/src/podes.ts`,
   lengkap dengan uji unit. Agregat kabupaten dihitung sebagai rasio dari jumlah (bukan rata-rata persen).
4. Agregat disimpan di tabel `indikator` yang sudah ada (id berawalan `podes_`, kategori = tema, mis.
   `Konektivitas`), sehingga otomatis tampil di Peta Tematik, profil kecamatan, dan unduhan CSV (ADR-0006).
   Kolom `pembilang` dan `penyebut` (migrasi 0002) memungkinkan teks "84 dari 121 desa".
5. Indikator Podes tidak dapat disunting lewat formulir admin (HTTP 409), agar angka selalu sama dengan
   hasil pipeline.
6. Butir kejadian sensitif (kekerasan terhadap perempuan dan anak, perkelahian massal, konflik adat, judi
   atau perundungan online) tidak dijadikan indikator sama sekali, termasuk di tingkat kabupaten.

## Akibat

- Pembaruan Podes dilakukan pengelola data di komputer sendiri (lihat runbook bagian 11), lalu hanya CSV
  agregat yang masuk PR.
- Pertanyaan per desa (mis. "desa mana yang belum punya SMA") tidak dapat dijawab dari SIKOP; arahkan ke
  layanan PST sesuai ketentuan BPS.
- Kecamatan dengan sedikit desa (Pulau Pisang, 6 desa) tetap ditayangkan karena berada di tingkat yang
  diizinkan. Bila kelak ada aturan ambang minimum sel, tambahkan penyamaran di `agregatPodes()`.
