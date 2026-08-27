@echo off
title MaderoSys - Modo local
cd /d "%~dp0"

echo ============================================
echo   MaderoSys - Modo local (sin internet)
echo   Usa una base de datos propia en esta PC.
echo ============================================
echo.

set DATABASE_URL=

if not exist node_modules (
  echo Primera vez: instalando, esperá un momento...
  call npm install
)

echo Preparando la aplicación, esperá unos segundos...
call npm run build

start "MaderoSys - Servidor (NO CERRAR esta ventana)" cmd /k "set DATABASE_URL=&& npm start"

echo Esperando que arranque el servidor...
timeout /t 4 /nobreak >nul

start "" http://localhost:3000/admin

echo.
echo Listo. Se abrio el panel en tu navegador.
echo No cierres la ventana negra del servidor mientras trabajes.
echo Cuando termines el dia, podes cerrar las dos ventanas.
echo.
pause
