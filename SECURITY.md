# Kebijakan Keamanan

## Melaporkan kerentanan

Jangan membuka _issue_ publik. Kirim laporan melalui halaman Layanan Data dengan jenis "Lainnya" dan judul
"Laporan keamanan", atau langsung ke Koordinator Pokja TI BPS Provinsi Lampung. Sertakan langkah reproduksi.
Kami menanggapi dalam 3 hari kerja.

## Kontrol yang diterapkan

- Otorisasi per peran di server untuk setiap permintaan; pemisahan tugas empat peran.
- Sesi cookie `__Host-`, HttpOnly, Secure, SameSite=Lax; token disimpan sebagai hash.
- CSRF: header khusus + pemeriksaan Origin. CSP ketat tanpa `unsafe-inline`.
- Query terparameter; validasi Zod di server; keluaran DOM lewat `textContent` (innerHTML dilarang lint).
- Pembatas laju dan Turnstile pada endpoint publik yang menulis.
- Jejak audit dilindungi trigger basis data.
- Data pribadi minimal; NIP disamarkan di keluaran publik; IP disimpan sebagai hash bergaram.
- Rahasia hanya di Cloudflare secrets dan GitHub secrets; gitleaks di CI.
