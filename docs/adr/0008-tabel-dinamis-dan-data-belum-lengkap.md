# ADR-0008: Tabel dinamis dan penahanan data sekolah yang belum lengkap

Status: diterima, 12 November 2026

## Konteks

Hasil uji pengalaman pengguna (sudut pandang masyarakat dan pemerintah daerah) menemukan dua hal:

1. Madrasah tercatat 0 peserta didik dan 0 guru karena datanya ada di EMIS Kemenag, bukan Dapodik. Angka
   0 tampak seperti kesalahan dan membuat total kabupaten (34.651 peserta didik) diragukan.
2. Pimpinan dan perencana ingin menyusun tabel sendiri, misalnya beberapa indikator antarkecamatan atau
   banyaknya sekolah menurut dua variabel, tanpa mengunduh CSV dan mengolahnya di Excel.

## Keputusan

1. Peserta didik, guru, dan rombongan belajar per sekolah **tidak ditayangkan** selama sumbernya belum
   lengkap. Saklarnya satu: `TAYANG_PD_GURU` di `packages/shared/src/sekolah.ts`. Selama `false`, API
   publik tidak mengirim kolom tersebut (daftar, profil, CSV, rekap kecamatan, ringkasan) dan indikator
   turunannya (`INDIKATOR_PD_GURU`) tidak tayang. Admin tetap melihat dan dapat memperbaikinya.
2. Halaman turunan **Tabel dinamis** (`/tabel/`) dibuka dari Peta Tematik, bukan menu baru (sesuai
   ADR-0006 butir 5). Isinya hanya data yang sudah tayang:
   - indikator per kecamatan dari `/indikator` (Podes tetap agregat kecamatan, ADR-0005);
   - tabulasi silang sekolah dari endpoint baru `GET /sekolah/rekap`, dengan variabel dari daftar putih
     (kecamatan, jenjang, status, akreditasi). Tidak ada nama kolom SQL yang berasal dari input.
3. Arti angka dijelaskan dengan kalimat (`packages/shared/src/narasi.ts`), misalnya "9 dari 9
   desa/kelurahan memiliki sedikitnya satu SD atau MI di dalam wilayah desanya sendiri". Narasi disusun dari
   pembilang dan penyebut yang sudah ada, sehingga tidak menambah data baru.

## Akibat

- Untuk menayangkan kembali peserta didik dan guru: lengkapi data madrasah, ubah `TAYANG_PD_GURU` menjadi
  `true`, sesuaikan uji di `apps/api/test/data.test.ts`.
- Indikator Podes baru wajib diberi narasi; uji `packages/shared/test/narasi.test.ts` gagal bila lupa.
