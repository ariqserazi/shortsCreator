@echo off
setlocal

cd /d "%~dp0"
set "LOG_FILE=%CD%\windows-launch.log"

echo.
echo shortsCreator Windows launcher
echo ==============================
echo.
echo Log file: %LOG_FILE%
echo.

if exist "%LOG_FILE%" del /q "%LOG_FILE%" >nul 2>nul
echo shortsCreator Windows launcher > "%LOG_FILE%"
echo Started: %DATE% %TIME% >> "%LOG_FILE%"
echo Folder: %CD% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

if not exist "package.json" (
  echo ERROR: package.json was not found.
  echo Download the whole shortsCreator repo/folder, then run this file from inside that folder.
  echo.
  echo ERROR: package.json was not found. >> "%LOG_FILE%"
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found.
  echo Trying to install Node.js LTS with Windows Package Manager...
  echo.
  echo npm was not found. Trying winget install... >> "%LOG_FILE%"

  where winget >nul 2>nul
  if errorlevel 1 (
    echo ERROR: npm was not found, and winget is not available.
    echo Install Node.js LTS from https://nodejs.org/ and run this file again.
    echo.
    echo ERROR: npm and winget were not found. >> "%LOG_FILE%"
    pause
    exit /b 1
  )

  call winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements >> "%LOG_FILE%" 2>&1
  if errorlevel 1 (
    echo.
    echo ERROR: Node.js installation failed.
    echo Install Node.js LTS from https://nodejs.org/ and run this file again.
    echo See this log for details:
    echo %LOG_FILE%
    echo.
    pause
    exit /b 1
  )

  set "PATH=%ProgramFiles%\nodejs;%AppData%\npm;%PATH%"

  where npm >nul 2>nul
  if errorlevel 1 (
    echo.
    echo Node.js installed, but npm is not available in this window yet.
    echo Close this window, then double-click shortsCreator-windows.bat again.
    echo.
    echo Node.js installed, but npm was not found after PATH refresh. >> "%LOG_FILE%"
    pause
    exit /b 1
  )
)

echo Node version:
call node --version
echo npm version:
call npm --version
echo.

echo Node version: >> "%LOG_FILE%"
call node --version >> "%LOG_FILE%" 2>&1
echo npm version: >> "%LOG_FILE%"
call npm --version >> "%LOG_FILE%" 2>&1
echo. >> "%LOG_FILE%"

if not exist "node_modules" (
  echo Installing shortsCreator dependencies...
  echo This can take a few minutes the first time.
  echo.

  if exist "package-lock.json" (
    echo Running npm ci... >> "%LOG_FILE%"
    call npm ci >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
      echo.
      echo npm ci failed. Retrying with npm install...
      echo.
      echo npm ci failed. Retrying with npm install... >> "%LOG_FILE%"
      call npm install >> "%LOG_FILE%" 2>&1
      if errorlevel 1 (
        echo.
        echo ERROR: npm install failed.
        echo See this log for details:
        echo %LOG_FILE%
        echo.
        pause
        exit /b 1
      )
    )
  ) else (
    echo Running npm install... >> "%LOG_FILE%"
    call npm install >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
      echo.
      echo ERROR: npm install failed.
      echo See this log for details:
      echo %LOG_FILE%
      echo.
      pause
      exit /b 1
    )
  )
) else (
  echo Dependencies already installed.
  echo Dependencies already installed. >> "%LOG_FILE%"
)

echo.
echo Starting shortsCreator...
echo Starting shortsCreator... >> "%LOG_FILE%"
call npm start >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: shortsCreator failed to start.
    echo See this log for details:
    echo %LOG_FILE%
    echo.
    pause
    exit /b 1
)

echo.
echo Finished: %DATE% %TIME% >> "%LOG_FILE%"
