@echo off
setlocal

cd /d "%~dp0"

echo.
echo shortsCreator Windows EXE builder
echo ==================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found.
  echo Install Node.js LTS from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo ERROR: package.json was not found. Run this file from the shortsCreator folder.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo Building Windows installer...
call npm run build:win
if errorlevel 1 (
  echo.
  echo ERROR: Windows installer build failed.
  pause
  exit /b 1
)

echo.
echo Done. Your installer should be in:
echo %CD%\dist
echo.
dir "%CD%\dist\*.exe" 2>nul
echo.
pause
