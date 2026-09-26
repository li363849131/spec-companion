@echo off
echo Cleaning old files...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del /f /q package-lock.json

echo.
echo Installing dependencies...
npm install --legacy-peer-deps

echo.
echo Done! Run start.bat to launch the app
pause
