@echo off
rem Modo SIN INTERNET: usa la base local de esta PC (no la de Vercel).
rem Sirve si se corta internet. Lo que se cargue aca NO aparece en Vercel.
set "MADERO_FORCE_LOCAL=1"
call "%~dp0MaderoSys-Iniciar.bat"
