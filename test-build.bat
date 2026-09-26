@echo off
echo Installing dependencies...
call npm install

echo.
echo Checking TypeScript compilation...
call npm run lint

echo.
echo Build completed!
pause
