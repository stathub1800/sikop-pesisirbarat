# ADR-0003: Masuk dengan Google, peran dari daftar email

Status: diterima, 9 November 2026

## Konteks

v1 memakai kata sandi minimal 6 karakter dan pemeriksaan admin di browser (S06, T09). Hash kata sandi yang
layak (Argon2id, atau PBKDF2 dengan iterasi tinggi) melampaui batas CPU 10 ms Workers gratis.

## Keputusan

- Peserta dan admin masuk dengan **Google Identity Services**. Worker memverifikasi ID token RS256 terhadap
  kunci publik Google (`iss`, `aud`, `exp`, `email_verified`). Tidak ada kata sandi yang disimpan.
- Sesi berupa token acak 256 bit di cookie `__Host-sikop_sesi` (HttpOnly, Secure, SameSite=Lax). D1 hanya
  menyimpan SHA-256 token. Sesi admin 8 jam, peserta 7 hari.
- Peran admin ditentukan tabel `admin_peran` (email → peran), dibaca ulang setiap permintaan sehingga
  pencabutan berlaku seketika. Superadmin pertama dari rahasia `SUPERADMIN_EMAILS`.
- Empat peran untuk pemisahan tugas: superadmin, editor data, pengelola ruang belajar, petugas PST.
- CSRF: header khusus `X-SIKOP` wajib untuk semua permintaan tulis + pemeriksaan `Origin`.
- Login pengembang hanya aktif bila `ENVIRONMENT=development` dan `DEV_LOGIN=aktif`; CI memastikan keduanya
  tidak ada di konfigurasi produksi.

## Konsekuensi

- Verifikasi dua langkah mengikuti akun Google. Kebijakan: admin wajib mengaktifkan 2-Step Verification.
- Peserta tanpa akun Google tidak dapat masuk; alternatif yang dapat ditambahkan kemudian: tautan masuk via
  email (membutuhkan layanan pengirim email).
- Opsional lapis tambahan: lindungi `/admin/*` dengan Cloudflare Access (gratis sampai 50 pengguna).
