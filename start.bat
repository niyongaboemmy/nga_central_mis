@echo off
setlocal enabledelayedexpansion
title Central MIS - local development
cd /d "%~dp0"

echo ===================================================
echo    NGA Central MIS  -  local development
echo ===================================================
echo.

:: ---------------------------------------------------------------- 1. Node.js
echo [1/5] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo   [X] Node.js is not installed, or not on your PATH.
    echo       Install the LTS build from https://nodejs.org/ and run this again.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%V in ('node -v') do echo   - Node %%V

:: -------------------------------------------------------- 2. .env from template
echo [2/5] Checking configuration...
if not exist "backend\.env" (
    copy "backend\.env.example" "backend\.env" >nul
    echo   - Created backend\.env
)
if not exist "frontend\.env" (
    copy "frontend\.env.example" "frontend\.env" >nul
    echo   - Created frontend\.env
)
:: backend\.env is git-ignored: your local settings can never be pushed.
echo   - Configuration present

:: --------------------------------------------------------------- 3. Database
echo [3/5] Checking MySQL...
set "MYSQL_CMD="
where mysql >nul 2>&1
if not errorlevel 1 set "MYSQL_CMD=mysql"
if "!MYSQL_CMD!"=="" if exist "C:\xampp\mysql\bin\mysql.exe" set "MYSQL_CMD=C:\xampp\mysql\bin\mysql.exe"
if "!MYSQL_CMD!"=="" if exist "D:\xampp\mysql\bin\mysql.exe" set "MYSQL_CMD=D:\xampp\mysql\bin\mysql.exe"

if "!MYSQL_CMD!"=="" (
    echo.
    echo   [X] Could not find MySQL. Install MySQL 8, or start MySQL in the
    echo       XAMPP Control Panel, then run this again.
    echo.
    pause
    exit /b 1
)

"!MYSQL_CMD!" -u root -e "SELECT 1;" >nul 2>&1
if errorlevel 1 (
    echo.
    echo   [warn] MySQL is installed but not accepting connections.
    echo       Start it ^(XAMPP Control Panel - Start next to MySQL^), then
    echo       press any key to retry...
    pause >nul
    "!MYSQL_CMD!" -u root -e "SELECT 1;" >nul 2>&1
    if errorlevel 1 (
        echo   [X] Still cannot reach MySQL. Fix that first.
        pause
        exit /b 1
    )
)
echo   - MySQL ready

:: ------------------------------------------------------------ 4. Dependencies
:: Dependencies come before the database here: db:setup is a TypeScript script
:: run through the backend's own node_modules, so it cannot run until they exist.
echo [4/5] Checking dependencies...
if not exist "node_modules" (
    echo   - Installing root packages...
    call npm install
)
if not exist "backend\node_modules" (
    echo   - Installing backend packages ^(first run, takes a few minutes^)...
    call npm install --prefix backend
)
if not exist "frontend\node_modules" (
    echo   - Installing frontend packages...
    call npm install --prefix frontend
)
echo   - Dependencies ready

"!MYSQL_CMD!" -u root -e "USE ngarw_mis; SELECT 1 FROM User LIMIT 1;" >nul 2>&1
if errorlevel 1 (
    echo   - Building the database ^(first run, takes a few minutes^)...
    pushd backend
    call npm run db:setup
    if errorlevel 1 (
        popd
        echo.
        echo   [X] Database setup failed - see the error above.
        echo       To wipe and rebuild an existing database:
        echo           cd backend ^&^& npm run db:setup -- --force
        echo.
        pause
        exit /b 1
    )
    popd
) else (
    echo   - Database ready
)

:: ----------------------------------------------------------------- 5. Launch
echo [5/5] Starting Central MIS...
echo.
echo ===================================================
echo   Open:  http://localhost:5173
echo   API:   http://localhost:5001
echo.
echo   Sign in as  superadmin  /  Admin@1234
echo   The 6-digit code is shown on the login page
echo   itself - no email is sent in development.
echo.
echo   Press Ctrl+C in this window to stop.
echo ===================================================
echo.
call npm run dev
pause
