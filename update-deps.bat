@echo off
echo Updating dependencies to fix version conflicts...
echo.
npm install --legacy-peer-deps
echo.
echo Done! Now run start.bat
pause
