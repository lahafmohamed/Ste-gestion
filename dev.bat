@echo off
rem Lance web + api sur des ports libres, puis ouvre le navigateur.
rem Usage : double-clic, ou  dev.bat [--no-open]
rem Ports par defaut 3001 (api) et 5273 (web) ; s'ils sont pris, les suivants.
setlocal
cd /d "%~dp0"
title STE - dev

where node >nul 2>nul
if errorlevel 1 (
    echo [ERREUR] node introuvable dans le PATH.
    pause
    exit /b 1
)

if not exist node_modules (
    echo ==^> Installation des dependances...
    call pnpm install
    if errorlevel 1 (
        echo [ERREUR] pnpm install a echoue.
        pause
        exit /b 1
    )
)

node scripts\dev.mjs %*
if errorlevel 1 pause
