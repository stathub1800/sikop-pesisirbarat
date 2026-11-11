# ADR-0002: Indikator satu sumber, dihitung saat diminta

Status: diterima, 9 November 2026

## Konteks

Laporan pengujian menemukan skor PODES kabupaten muncul sebagai 74,35, 67,5, 72,3, dan 69,5 di tempat
berbeda (T03), dan klasifikasi desil berlabel "Standar BPS RI" yang tidak tepat (T04).

## Keputusan

1. Tidak ada angka statistik yang ditulis tetap di HTML atau JavaScript.
2. Indikator turunan data sekolah didefinisikan sekali di `packages/shared/src/indikator.ts` sebagai pasangan
   pembilang/penyebut, dan dihitung di Worker dari tabel `sekolah` setiap kali diminta.
3. Agregat kabupaten untuk rasio dihitung dari total pembilang dibagi total penyebut, bukan rata-rata nilai
   kecamatan.
4. Indikator manual (diisi admin) tidak dapat tayang tanpa sumber, tahun, dan cara hitung. Aturan ini
   ditegakkan tiga lapis: skema Zod, validasi API, dan CHECK constraint di D1.
5. Klasifikasi desil dihapus. Bila nanti dibutuhkan, gunakan Indeks Pembangunan Desa resmi per desa.

## Konsekuensi

- Angka di beranda, peta, profil kecamatan, dan CSV selalu identik karena berasal dari fungsi yang sama.
- Uji integrasi merekonsiliasi angka dengan berkas sumber (364 sekolah, 34.651 peserta didik, 2.983 guru).
- Angka lama v1 (penduduk, pekon, pustu) disimpan sebagai draf sampai diverifikasi dengan publikasi resmi.
