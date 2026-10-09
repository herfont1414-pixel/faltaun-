@echo off
title MaderoSys
cd /d "%~dp0"

rem Acceso directo del Escritorio: abre MaderoSys en una ventana propia.
rem Si el servidor todavia no esta andando, arranca el lanzador completo (que abre la ventana al terminar).
where node >nul 2>&1
if errorlevel 1 goto :arrancar
node "scripts\abrir-ventana.mjs"
if errorlevel 1 goto :arrancar
exit /b 0

:arrancar
start "MaderoSys - Iniciar" cmd /c "MaderoSys-Iniciar.bat"
exit /b 0
