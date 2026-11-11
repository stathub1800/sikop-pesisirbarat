# Katalog API SIKOP v1

Basis: `/api/v1`. Semua respons JSON kecuali ekspor CSV. Galat berbentuk
`{ "galat": { "kode": "...", "pesan": "...", "rincian": { "kolom": ["pesan"] } } }`.
Permintaan tulis wajib membawa header `X-SIKOP: 1` (perlindungan CSRF).

## Publik

| Metode | Jalur                                                                        | Keterangan                                                                    |
| ------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| GET    | `/health`                                                                    | Status layanan dan basis data                                                 |
| GET    | `/situs`                                                                     | Pengaturan publik, daftar kecamatan, kunci publik Google/Turnstile            |
| GET    | `/ringkasan`                                                                 | Angka beranda dari D1                                                         |
| GET    | `/indikator`                                                                 | Indikator tayang: nilai per kecamatan + kabupaten, sumber, tahun, cara hitung |
| GET    | `/indikator/ekspor.csv`                                                      | Semua indikator × wilayah (CSV, UTF-8 BOM)                                    |
| GET    | `/kecamatan/:kode`                                                           | Profil kecamatan: luas peta, indikator, rekap sekolah                         |
| GET    | `/sekolah?q=&kec=&jenjang=&status=&akreditasi=&urut=&arah=&halaman=&ukuran=` | Daftar sekolah + hitungan total (berpasangan)                                 |
| GET    | `/sekolah/titik`                                                             | GeoJSON titik sekolah yang koordinatnya layak tampil                          |
| GET    | `/sekolah/ekspor.csv`                                                        | Ekspor dengan saringan yang sama                                              |
| GET    | `/sekolah/:npsn`                                                             | Profil sekolah (kolom publik saja)                                            |
| GET    | `/sertifikat/:kode`                                                          | Cek keaslian sertifikat (dibatasi 10/menit/IP)                                |
| POST   | `/layanan/permohonan`                                                        | Ajukan permohonan; mengembalikan tiket (dibatasi laju, Turnstile)             |
| POST   | `/layanan/permohonan/status`                                                 | Status permohonan dengan tiket + email                                        |

## Autentikasi

| Metode | Jalur          | Keterangan                                     |
| ------ | -------------- | ---------------------------------------------- |
| POST   | `/auth/google` | `{ credential }` ID token Google → cookie sesi |
| POST   | `/auth/keluar` | Mengakhiri sesi                                |
| GET    | `/auth/saya`   | Akun dan profil peserta yang sedang masuk      |

## Ruang belajar

| Metode   | Jalur                        | Akses   | Keterangan                                                                    |
| -------- | ---------------------------- | ------- | ----------------------------------------------------------------------------- |
| GET      | `/lms/kursus`                | Publik  | Katalog                                                                       |
| GET      | `/lms/kursus/:id`            | Publik  | Kursus + modul + materi (tanpa soal)                                          |
| GET/POST | `/lms/saya/profil`           | Login   | Profil peserta; POST wajib persetujuan privasi                                |
| GET      | `/lms/saya/progres/:kursus`  | Login   | Kemajuan, kelayakan ujian akhir, sertifikat                                   |
| POST     | `/lms/ujian`                 | Peserta | `{ kursus_id, jenis, modul_id }` mulai atau lanjutkan ujian; soal tanpa kunci |
| PUT      | `/lms/ujian/:id/jawaban`     | Peserta | Simpan jawaban sementara                                                      |
| POST     | `/lms/ujian/:id/serahkan`    | Peserta | Nilai di server; sertifikat bila memenuhi syarat                              |
| GET      | `/lms/ujian/:id`             | Peserta | Hasil; pembahasan bila sudah lulus modul                                      |
| GET      | `/lms/saya/sertifikat/:kode` | Pemilik | Data sertifikat untuk dicetak                                                 |

## Admin (berbasis peran)

| Jalur                                                                                                     | Peran                                           |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `GET /admin/dasbor`                                                                                       | semua peran admin (isi disaring per peran)      |
| `/admin/sekolah`, `/admin/sekolah/:npsn` (PUT, optimistic lock), `/admin/sekolah/impor`                   | editor_data                                     |
| `/admin/indikator`, `/admin/indikator/:id`                                                                | editor_data                                     |
| `/admin/pengaturan`                                                                                       | editor_data (situs), pengelola_lms (sertifikat) |
| `/admin/permohonan`, `/admin/permohonan/:tiket`                                                           | petugas_pst                                     |
| `/admin/lms/kursus`, `/admin/lms/modul`, `/admin/lms/soal`, `/admin/lms/peserta`, `/admin/lms/sertifikat` | pengelola_lms                                   |
| `/admin/pengguna`, `/admin/audit`                                                                         | superadmin                                      |

Superadmin selalu memiliki akses ke semua jalur. Setiap perubahan admin tercatat di `audit_log` dalam batch
atomik yang sama dengan perubahannya.
