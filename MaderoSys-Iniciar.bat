@echo off
title MaderoSys - Iniciar (modo local)
cd /d "%~dp0"

rem Actualiza MaderoSys solo, desde GitHub, antes de arrancar. Si no hay internet
rem o algo falla, sigue con la version instalada: nunca frena el arranque.
where node >nul 2>&1
if errorlevel 1 goto :arrancar
if exist "scripts\actualizar.mjs" node "scripts\actualizar.mjs"

:arrancar
if not exist "scripts\iniciar-local.bat" goto :falta
call "scripts\iniciar-local.bat"
exit /b %errorlevel%

:falta
echo.
echo [ERROR] Falta el archivo scripts\iniciar-local.bat. Volve a copiar la carpeta de MaderoSys.
pause
exit /b 1
