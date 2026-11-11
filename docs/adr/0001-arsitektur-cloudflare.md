# ADR-0001: Pages + Workers + D1 + GitHub Actions

Status: diterima, 9 November 2026

## Konteks

SIKOP v1 berjalan di Vercel + Supabase. Logika penting (penilaian ujian, penerbitan sertifikat, cek admin)
berada di browser sehingga mudah dicurangi (K01, K02, T09). Anggaran operasional Rp0 dan tim pemelihara kecil.

## Keputusan

- **Cloudflare Pages** menyajikan situs statis multi-halaman (pengunjung + panel admin).
- **Cloudflare Worker** memegang seluruh logika dan otorisasi. Pages meneruskan `/api/*` ke Worker melalui
  _service binding_ (`functions/api/[[path]].ts`), sehingga situs dan API satu origin: cookie sesi `__Host-`
  dengan `SameSite=Lax` tanpa CORS dan tanpa cookie pihak ketiga. `workers_dev = false` agar Worker tidak
  dapat diakses langsung.
- **D1** menyimpan data. Skema berversi di `apps/api/migrations/`.
- **GitHub Actions** menjalankan komputasi yang melampaui batas CPU 10 ms Workers gratis: penyederhanaan
  geometri, uji titik dalam wilayah, rekonsiliasi, impor, dan cadangan harian.
- Frontend tanpa framework (TypeScript + Vite) agar ringan dan mudah dipelihara tim yang terbiasa HTML/JS.

## Konsekuensi

- Biaya Rp0 dalam kuota gratis (Workers 100.000 permintaan/hari, D1 5 GB, 5 juta baris dibaca/hari).
- Tanpa _cold start_ berarti dan tanpa jeda tidur seperti layanan gratis berbasis kontainer.
- Batas CPU 10 ms menuntut logika per permintaan tetap ringan; operasi berat dipindah ke Actions.
- Ketergantungan pada satu penyedia; mitigasi: data dapat diekspor penuh (SQL) setiap hari.
