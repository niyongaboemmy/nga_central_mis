@echo off
setlocal enabledelayedexpansion
title Central MIS - 1-Click Dev Launcher
cd /d "%~dp0"

echo ===================================================
echo       NGA Central MIS - 1-Click Local Dev
echo ===================================================
echo.

:: 1. Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: 2. Setup .env files if missing
echo [1/4] Checking environment configuration...
if not exist "backend\.env" (
    if exist "backend\.env.example" (
        copy "backend\.env.example" "backend\.env" >nul
        echo   - Created backend\.env from example
    )
)
if not exist "frontend\.env" (
    if exist "frontend\.env.example" (
        copy "frontend\.env.example" "frontend\.env" >nul
        echo   - Created frontend\.env from example
    )
)
if not exist "file-server\.env" (
    if exist "file-server\.env.example" (
        copy "file-server\.env.example" "file-server\.env" >nul
        echo   - Created file-server\.env from example
    )
)

:: 3. Locate MySQL (PATH or XAMPP)
echo [2/4] Checking MySQL connection...
set "MYSQL_CMD="
where mysql >nul 2>&1
if not errorlevel 1 (
    set "MYSQL_CMD=mysql"
) else if exist "C:\xampp\mysql\bin\mysql.exe" (
    set "MYSQL_CMD=C:\xampp\mysql\bin\mysql.exe"
) else if exist "D:\xampp\mysql\bin\mysql.exe" (
    set "MYSQL_CMD=D:\xampp\mysql\bin\mysql.exe"
)

if "%MYSQL_CMD%"=="" (
    echo [WARNING] MySQL command not found in PATH or standard XAMPP folders.
    echo If you use XAMPP, please make sure MySQL is started in XAMPP Control Panel.
    echo Skipping automatic DB import.
) else (
    :: Check if MySQL is running
    "%MYSQL_CMD%" -u root -e "SELECT 1;" >nul 2>&1
    if errorlevel 1 (
        echo.
        echo [!] MySQL server is not running!
        echo Please open XAMPP Control Panel and click 'Start' next to MySQL.
        echo.
        echo Press any key after starting MySQL to retry...
        pause >nul
    )

    :: Check/Create database and import SQL if empty
    "%MYSQL_CMD%" -u root -e "CREATE DATABASE IF NOT EXISTS ngarw_mis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" >nul 2>&1
    
    :: Check if tables exist
    "%MYSQL_CMD%" -u root -e "USE ngarw_mis; SELECT 1 FROM users LIMIT 1;" >nul 2>&1
    if errorlevel 1 (
        echo   - Database 'ngarw_mis' is empty. Importing ngarw_mis.sql...
        if exist "ngarw_mis.sql" (
            "%MYSQL_CMD%" -u root ngarw_mis < "ngarw_mis.sql"
            echo   - Successfully imported ngarw_mis.sql!
        ) else (
            echo   - [WARNING] ngarw_mis.sql not found in root.
        )
    ) else (
        echo   - Database 'ngarw_mis' is ready.
    )
)

:: 4. Install dependencies if needed
echo [3/4] Checking dependencies...
if not exist "node_modules" (
    echo   - Installing root dependencies...
    call npm install
)
if not exist "backend\node_modules" (
    echo   - Installing backend dependencies...
    call npm install --prefix backend
)
if not exist "frontend\node_modules" (
    echo   - Installing frontend dependencies...
    call npm install --prefix frontend
)

:: 5. Start development servers
echo [4/4] Starting Central MIS (Backend + Frontend)...
echo.
echo ===================================================
echo   Backend:  http://localhost:5001
echo   Frontend: http://localhost:5173
echo ===================================================
echo.
call npm run dev
pause
