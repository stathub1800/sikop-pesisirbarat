@echo off
REM Pemasang SIKOP: klik dua kali berkas ini untuk memasang situs dari nol sampai tayang.
REM Dapat dijalankan ulang; langkah yang sudah selesai akan dilewati.
chcp 65001 >nul
title Pemasang SIKOP BPS Kabupaten Pesisir Barat
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang. Memasang Node.js LTS melalui winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo Node.js sudah dipasang. TUTUP jendela ini, lalu klik dua kali PASANG-SIKOP.bat sekali lagi.
  pause
  exit /b 0
)

node scripts\pasang.mjs %*
if errorlevel 1 (
  echo.
  echo Pemasangan berhenti. Baca pesan di atas, perbaiki, lalu jalankan ulang berkas ini.
  pause
  exit /b 1
)
pause
