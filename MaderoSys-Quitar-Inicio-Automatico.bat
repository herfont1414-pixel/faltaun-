@echo off
title MaderoSys - Quitar el inicio automatico
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo No se encontro Node.js.
  pause
  exit /b 1
)
node "scripts\autoinicio.mjs" --quitar
echo.
echo Para volver a activarlo, borra el archivo ".sin-inicio-automatico" de esta carpeta
echo y abri MaderoSys-Iniciar.bat una vez.
pause
