@echo off
rem Restaura los datos desde una copia de seguridad (con MaderoSys cerrado).
cd /d "%~dp0.."
node "scripts\restaurar-copia.mjs" %*
echo.
pause
