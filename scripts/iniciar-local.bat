@echo off
setlocal EnableExtensions EnableDelayedExpansion
title MaderoSys - Iniciar (modo local)
cd /d "%~dp0.."

echo ============================================================
echo   MaderoSys - Inicio en modo local (esta PC)
echo   No cierres las ventanas negras mientras trabajes.
echo ============================================================
echo.

rem ---------- 1. Node.js ----------
where node >nul 2>&1
if errorlevel 1 goto :sin_node
for /f "delims=" %%v in ('node -v') do set "NODEVER=%%v"
set "NODEVER_NUM=%NODEVER:~1%"
for /f "tokens=1 delims=." %%a in ("%NODEVER_NUM%") do set "NODEMAJOR=%%a"
if "%NODEMAJOR%"=="22" goto :node_ok
if "%NODEMAJOR%"=="20" goto :node_ok
goto :node_mal
:node_ok
echo [OK] Node.js %NODEVER%

rem ---------- 1b. Inicio automatico con Windows (se deja listo una sola vez) ----------
if exist "scripts\autoinicio.mjs" node "scripts\autoinicio.mjs"

rem ---------- 2. PIN de administrador (solo la primera vez) ----------
if exist ".env.local" goto :env_ok
if exist "maderosys.db" goto :env_ok
echo.
echo Primera vez en esta PC: hay que elegir un PIN de administrador.
echo Es el numero que se usa para entrar al panel (4 numeros o mas).
:pedir_pin
set "PIN="
set /p "PIN=Escribi el PIN y apreta Enter: "
echo !PIN!| findstr /r "^[0-9][0-9][0-9][0-9][0-9]*$" >nul
if errorlevel 1 (
  echo El PIN debe tener solo numeros y al menos 4. Proba de nuevo.
  goto :pedir_pin
)
> ".env.local" echo ADMIN_PIN=!PIN!
set "PIN="
cls
echo [OK] PIN guardado. Anotalo en un lugar seguro.
:env_ok

rem ---------- 3. Componentes (solo la primera vez) ----------
if not exist "node_modules" goto :instalar
if exist ".needs-install" goto :instalar
goto :deps_ok
:instalar
echo.
echo Instalando componentes. Puede tardar varios minutos...
call npm install
if errorlevel 1 goto :fallo_npm
if exist ".needs-install" del ".needs-install"
:deps_ok

node -e "const D=require('better-sqlite3');new D(':memory:').close()" >nul 2>&1
if not errorlevel 1 goto :sqlite_ok
echo Reparando el componente de base de datos local...
call npm rebuild better-sqlite3
node -e "const D=require('better-sqlite3');new D(':memory:').close()" >nul 2>&1
if errorlevel 1 goto :fallo_sqlite
:sqlite_ok
echo [OK] Componentes de base de datos listos

rem ---------- 3b. Que base usar: la misma que Vercel o la local de esta PC ----------
rem Se pregunta una sola vez (scripts\configurar-base.mjs) y queda en .env.local.
rem MADERO_FORCE_LOCAL=1 (acceso "SIN INTERNET") fuerza la base local de esta PC.
set "MODO_BASE=local"
if "%MADERO_FORCE_LOCAL%"=="1" goto :base_decidida
if exist "scripts\configurar-base.mjs" node "scripts\configurar-base.mjs"
findstr /b /c:"DATABASE_URL=postgres" ".env.local" >nul 2>&1
if not errorlevel 1 set "MODO_BASE=compartida"
:base_decidida
if "%MODO_BASE%"=="compartida" goto :msg_compartida
echo [OK] Base de datos: LOCAL de esta PC ^(no es la de Vercel^)
goto :base_msg_fin
:msg_compartida
echo [OK] Base de datos: la MISMA que Vercel
:base_msg_fin

rem ---------- 4. Armar la aplicacion (solo si hace falta) ----------
set "NECESITA_BUILD=0"
if not exist ".next\BUILD_ID" set "NECESITA_BUILD=1"
if "%NECESITA_BUILD%"=="1" goto :build_decidido
powershell -NoProfile -Command "$b=(Get-Item '.next\BUILD_ID').LastWriteTime; $n=Get-ChildItem app,components,lib,db,data,middleware.ts,package.json,next.config.mjs -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $b } | Select-Object -First 1; if ($n) { exit 1 } else { exit 0 }"
if errorlevel 1 set "NECESITA_BUILD=1"
:build_decidido
if not "%NECESITA_BUILD%"=="1" goto :build_ok
echo.
echo Armando la aplicacion. Tarda entre 1 y 5 minutos...
call npm run build
if errorlevel 1 goto :fallo_build
:build_ok
echo [OK] Aplicacion lista

rem ---------- 5. Servidor ----------
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Uri http://localhost:3000/admin/login -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 goto :abrir
echo.
echo Arrancando el servidor...
rem MADERO_AUTO=1 = arranque automatico al encender la PC: la ventana del servidor queda minimizada.
set "VENTANA_MIN="
if "%MADERO_AUTO%"=="1" set "VENTANA_MIN=/min "
if "%MODO_BASE%"=="compartida" goto :iniciar_compartida
start %VENTANA_MIN%"MaderoSys - Servidor (NO CERRAR esta ventana)" cmd /k "set DATABASE_URL=&& npm start"
goto :esperar_servidor
:iniciar_compartida
start %VENTANA_MIN%"MaderoSys - Servidor (NO CERRAR esta ventana)" cmd /k "npm start"
:esperar_servidor
powershell -NoProfile -Command "for ($i=0; $i -lt 90; $i++) { try { Invoke-WebRequest -UseBasicParsing -Uri http://localhost:3000/admin/login -TimeoutSec 2 | Out-Null; exit 0 } catch { Start-Sleep -Seconds 1 } }; exit 1"
if errorlevel 1 goto :fallo_server

:abrir
rem Arranque automatico: no se abre el navegador ni se espera una tecla.
if "%MADERO_AUTO%"=="1" exit /b 0
start "" "http://localhost:3000/admin"
echo.
echo ============================================================
echo   LISTO. Se abrio MaderoSys en el navegador.
echo   Direccion: http://localhost:3000/admin
echo   NO cierres la ventana "MaderoSys - Servidor".
echo   Esta ventana la podes cerrar.
echo ============================================================
pause
exit /b 0

rem ---------- Mensajes de error ----------
:sin_node
echo.
echo [ERROR] No se encontro Node.js en esta PC.
echo Instala Node.js 22 y volve a abrir este archivo.
goto :fin_mal

:node_mal
echo.
echo [ERROR] La version de Node.js instalada es %NODEVER%.
echo MaderoSys necesita la version 22 (tambien funciona la 20).
echo Las versiones mas nuevas no son compatibles con la base de datos local.
echo Desinstala Node.js, instala Node.js 22 y volve a abrir este archivo.
goto :fin_mal

:fallo_npm
echo.
echo [ERROR] Fallo la instalacion de componentes. Revisa la conexion a internet.
goto :fin_mal

:fallo_sqlite
echo.
echo [ERROR] No se pudo preparar la base de datos local.
echo Casi siempre es por la version de Node.js (%NODEVER%): hace falta la 22.
goto :fin_mal

:fallo_build
echo.
echo [ERROR] Fallo el armado de la aplicacion. Mira el texto rojo de arriba.
goto :fin_mal

:fallo_server
echo.
echo [ERROR] El servidor no arranco a tiempo. Mira la ventana "MaderoSys - Servidor".
goto :fin_mal

:fin_mal
echo.
echo ------------------------------------------------------------
echo   NO SE PUDO INICIAR. Saca una foto de esta pantalla y
echo   mandasela a Claude.
echo ------------------------------------------------------------
pause
exit /b 1
