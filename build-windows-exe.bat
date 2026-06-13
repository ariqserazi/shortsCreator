@echo off
setlocal

cd /d "%~dp0"

echo.
echo build-windows-exe.bat has been replaced by shortsCreator-windows.bat.
echo Starting the Windows launcher now...
echo.

call "%~dp0shortsCreator-windows.bat"
