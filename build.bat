@echo off
echo ========================================
echo  AIO Wallet Reskin Tool - Build Script
echo ========================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.10+ from python.org
    echo         Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)

:: Install dependencies
echo [1/3] Installing dependencies...
pip install -r requirements.txt
pip install pyinstaller
echo.

:: Build the exe
echo [2/3] Building WalletReskin.exe ...
pyinstaller --onefile --windowed --name "WalletReskin" --clean app.py
echo.

:: Check result
if exist "dist\WalletReskin.exe" (
    echo [3/3] Done! Your .exe is at:
    echo.
    echo       dist\WalletReskin.exe
    echo.
    echo Copy it anywhere, put aircard.exe next to it, and run it.
    echo.
    echo IMPORTANT: Use aircard.exe from the dhava-gautama fork:
    echo https://github.com/dhava-gautama/AirCard-Windows/releases
) else (
    echo [ERROR] Build failed. Check the output above for errors.
)

echo.
pause
