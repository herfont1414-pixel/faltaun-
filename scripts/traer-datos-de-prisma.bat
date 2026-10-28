@echo off
rem Copia los datos de la base en la nube (Prisma) a esta PC. Con MaderoSys CERRADO. Ver el archivo .mjs del mismo nombre.
cd /d "%~dp0.."
node "scripts\traer-datos-de-prisma.mjs"
echo.
pause
