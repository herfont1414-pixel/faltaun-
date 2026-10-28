@echo off
rem Vuelve a pedir la direccion del menu online y la clave de conexion (ver configurar-nube.mjs).
cd /d "%~dp0.."
node "scripts\configurar-nube.mjs" --forzar
echo.
echo Cerra y volve a abrir MaderoSys para que tome el cambio.
pause
