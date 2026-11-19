@echo off
title MaderoSys - Permitir celulares
rem Deja que los celulares del Wi-Fi del local abran MaderoSys (http://IP-DE-LA-PC:3000/admin).
rem Abre el puerto 3000 de Windows SOLO para la red del local (no para internet) y saca los
rem bloqueos que Windows pudo haber creado si alguna vez se toco "Cancelar" en su aviso.
rem Se usa una sola vez. Pide permiso de administrador.

net session >nul 2>&1
if not errorlevel 1 goto :admin
echo Pidiendo permiso de administrador (Windows va a preguntar: toca "Si")...
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b 0

:admin
echo.
echo Permitiendo que los celulares del local se conecten a MaderoSys...
netsh advfirewall firewall delete rule name="MaderoSys (celulares)" >nul 2>&1
netsh advfirewall firewall add rule name="MaderoSys (celulares)" dir=in action=allow protocol=TCP localport=3000 remoteip=localsubnet profile=any >nul
if errorlevel 1 goto :fallo
powershell -NoProfile -Command "Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Node.js*' -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' } | Remove-NetFirewallRule -ErrorAction SilentlyContinue"
echo.
echo [OK] Listo. Ahora en el panel toca "Usar en el celular" y escanea el codigo con el celular.
echo      (El celular tiene que estar en el mismo Wi-Fi que esta PC.)
echo.
pause
exit /b 0

:fallo
echo.
echo [ERROR] Windows no dejo agregar el permiso. Proba de nuevo con clic derecho en este archivo y
echo         "Ejecutar como administrador".
echo.
pause
exit /b 1
