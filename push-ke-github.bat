@echo off
title Push BMN PSIMKG ke GitHub
echo ===================================================
echo     PUSH APLIKASI BMN PSIMKG KE GITHUB
echo     Repository: https://github.com/romialfikri/bmn-psimkg.git
echo ===================================================
echo.
cd /d "%~dp0"
git status
echo.
echo Sedang melakukan push ke GitHub...
echo (Jika muncul dialog GitHub di browser, silakan klik Sign in / Authorize)
echo.
git push -u origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo ===================================================
    echo [BERHASIL] Seluruh kode program berhasil di-push ke GitHub!
    echo ===================================================
) else (
    echo ===================================================
    echo [INFO] Jika gagal autentikasi:
    echo Silakan login melalui browser atau gunakan Personal Access Token (PAT).
    echo ===================================================
)
echo.
pause
