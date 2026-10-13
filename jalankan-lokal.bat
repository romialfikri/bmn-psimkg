@echo off
title BMN PSIMKG - Jalankan Lokal
echo ===================================================
echo     APLIKASI BMN PSIMKG - SERVER LOKAL
echo ===================================================
echo.
cd /d "%~dp0"

if not exist "backend\node_modules" (
  echo Menginstall dependensi backend...
  call npm --prefix backend install
)
if not exist "frontend\node_modules" (
  echo Menginstall dependensi frontend...
  call npm --prefix frontend install
)
echo Membangun frontend (vite build)...
call npm --prefix frontend run build
if errorlevel 1 (
  echo Build frontend gagal. Periksa pesan error di atas.
  pause
  exit /b 1
)

echo [1/2] Menjalankan Backend API (Port 8022)...
start "BMN-API (Backend)" cmd /k "cd backend && node server.js"

timeout /t 2 /nobreak >nul

echo [2/2] Menjalankan Frontend Web (Port 3022)...
start "BMN-WEB (Frontend)" cmd /k "node server-static.js"

timeout /t 2 /nobreak >nul

echo.
echo ===================================================
echo Aplikasi berhasil dijalankan!
echo URL Browser: http://localhost:3022
echo ===================================================
start http://localhost:3022
