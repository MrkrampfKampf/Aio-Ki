@echo off
echo ========================================
echo  AIO Wallet Reskin Tool - Quick Setup
echo ========================================
echo.
echo This script will:
echo  1. Install Python dependencies
echo  2. Check for aircard.exe
echo  3. Launch the app
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found!
    echo.
    echo Download Python 3.10+ from: https://www.python.org/downloads/
    echo IMPORTANT: Check "Add Python to PATH" during installation!
    echo.
    pause
    exit /b 1
)

:: Install dependencies
echo [1/3] Installing Python packages...
pip install customtkinter Pillow --quiet
echo       Done.
echo.

:: Check for aircard.exe
echo [2/3] Checking for aircard.exe...
if exist "aircard.exe" (
    echo       Found aircard.exe - good to go!
) else if exist "AirCard.exe" (
    echo       Found AirCard.exe - good to go!
) else (
    echo.
    echo  !! aircard.exe NOT FOUND !!
    echo.
    echo  Download it from:
    echo  https://github.com/Lumid-Off/AirCard-Windows/releases
    echo.
    echo  Place aircard.exe in this folder:
    echo  %~dp0
    echo.
    echo  The app will still open, but flashing won't work without it.
    echo.
)

:: Launch
echo [3/3] Launching AIO Wallet Reskin...
echo.
python app.py

pause
