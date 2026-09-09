@echo off
title Shulas Cafe - Punto de Venta
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  ERROR: Node.js no esta instalado en esta computadora.
  echo  Descarguelo gratis desde https://nodejs.org  ^(version LTS^)
  echo  e instalelo, luego vuelva a abrir este archivo.
  echo.
  pause
  exit /b 1
)

set NODE_FLAGS=
node -e "require('node:sqlite')" >nul 2>nul
if errorlevel 1 set NODE_FLAGS=--experimental-sqlite

echo ============================================================
echo   SHULAS CAFE - Sistema de Punto de Venta
echo ============================================================
echo   Para cerrar el sistema, cierre esta ventana.
echo.

start "" http://localhost:5178
node %NODE_FLAGS% server.js

echo.
echo El sistema se detuvo. Cierre esta ventana.
pause
