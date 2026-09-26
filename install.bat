@echo off
echo ========================================
echo Installing Spec Companion Dependencies
echo ========================================
echo.

echo [Step 1/6] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found!
    echo Please install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)

node -v
npm -v
echo Node.js environment OK
echo.

echo [Step 2/6] Cleaning old files...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del /f /q package-lock.json
if exist .vite rmdir /s /q .vite
echo Cleanup completed
echo.

echo [Step 3/6] Cleaning npm cache...
call npm cache clean --force
echo Cache cleaned
echo.

echo [Step 4/6] Setting up npm registry mirror...
call npm config set registry https://registry.npmmirror.com
echo Mirror configured
echo.

echo [Step 5/6] Installing dependencies (this may take a few minutes)...
echo Downloading and installing packages...
call npm install --legacy-peer-deps

if errorlevel 1 (
    echo.
    echo Installation failed!
    echo.
    echo Trying with default registry...
    call npm config set registry https://registry.npmjs.org
    call npm install --legacy-peer-deps

    if errorlevel 1 (
        echo.
        echo Still failed, please check your network connection
        pause
        exit /b 1
    )
)

echo Dependencies installed successfully
echo.

echo [Step 6/6] Verifying installation...
if not exist node_modules (
    echo ERROR: node_modules directory not created
    pause
    exit /b 1
)

if not exist node_modules\react (
    echo ERROR: React not installed correctly
    pause
    exit /b 1
)

if not exist node_modules\vite (
    echo ERROR: Vite not installed correctly
    pause
    exit /b 1
)

echo All dependencies verified
echo.

echo ========================================
echo Installation completed successfully!
echo ========================================
echo.
echo Next steps:
echo   1. Run start-dev.bat to start the dev server
echo   2. Or run: npm run dev
echo   3. Open browser to: http://localhost:3000
echo.
echo IMPORTANT: Clear browser cache before first run!
echo   Press F12, go to Application tab, click Clear site data
echo.
pause
