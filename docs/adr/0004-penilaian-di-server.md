# ADR-0004: Penilaian ujian dan penerbitan sertifikat di server

Status: diterima, 9 November 2026

## Konteks

v1 mengirim seluruh soal beserta "hash" kunci ke browser sebelum login, dengan salt tertulis di kode (K01,
X01), lalu browser menulis nilai dan sertifikat ke basis data (K02).

## Keputusan

- Kunci jawaban hanya ada di tabel `soal` dan hanya dibaca endpoint admin serta fungsi penilaian.
- Saat ujian dimulai, server memilih soal (acak untuk ujian akhir), mengacak urutan soal dan opsi, mencatat
  `batas_at`, lalu mengirim soal tanpa kunci. Jawaban sementara disimpan server (autosave).
- Penyerahan setelah batas waktu + tenggang 30 detik memakai jawaban tersimpan terakhir, bukan kiriman baru.
  Percobaan yang ditinggalkan ditutup otomatis oleh cron harian.
- Aturan: pre-test sekali; post-test setelah pre-test dengan jeda 60 detik; ujian akhir setelah semua modul
  lulus, maksimal 3 percobaan per 24 jam.
- Sertifikat terbit di server hanya bila: lulus ujian akhir, peserta terverifikasi admin, penandatangan diisi,
  dan penerbitan diaktifkan. Nomor urut dihitung dalam satu pernyataan `INSERT ... SELECT` (atomik). Kode
  verifikasi 10 karakter acak kriptografis; halaman `/sertifikat/` publik untuk cek keaslian.
- Pembahasan dibuka setelah post-test modul lulus; ujian akhir tidak pernah menampilkan kunci.

## Konsekuensi

- Kecurangan lewat alat pengembang browser tidak lagi mungkin; uji regresi memastikan respons tidak memuat
  `kunci` atau `pembahasan`.
- Bila bank soal bocor dari sisi admin, lakukan rotasi soal (lihat runbook).
