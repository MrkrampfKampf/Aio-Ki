# 💳 Wallet Reskin Tool

A sleek Windows GUI that makes reskinning your Apple Wallet cards dead simple.
Wraps [AirCard-Windows](https://github.com/Lumid-Off/AirCard-Windows) with a
friendly interface — pick an image, position it, one click, done.

![Windows 10/11](https://img.shields.io/badge/Windows-10%2F11-0078D6?logo=windows)
![iOS 18–27.0.1](https://img.shields.io/badge/iOS-18.0–27.0.1-000?logo=apple)
![Python 3.10+](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

| | |
|---|---|
| 📱 **Auto-Detect** | Finds your iPhone automatically via USB (polls every 5 s) |
| 💳 **Card Scanner** | Lists your Wallet cards so you can pick which one to skin |
| 🎨 **Image Editor** | Drag to position, scroll to zoom — live card-shaped preview |
| ✂️ **Smart Crop** | Automatically cuts your image to 1536 × 969 px (Apple's card size) |
| ✨ **One-Click Apply** | Skins the card and tells you when to reopen Wallet |
| 💾 **Backup** | Saves the original card artwork before any change |
| 🔙 **Restore** | Reverts to the original card image with one click |
| 🌑 **Dark UI** | Modern dark theme that matches iOS |

---

## 📋 Requirements

- **Windows 10 or 11** (64-bit)
- **iTunes** (desktop version from [apple.com](https://www.apple.com/itunes/), **not** the Microsoft Store version) — needed for USB drivers
- **iPhone** on **iOS 18.0 – 27.0.1** (Apple patched the exploit in 27.2 beta 3+)
- **USB cable** (Lightning or USB-C)
- **`aircard.exe`** from [AirCard-Windows Releases](https://github.com/Lumid-Off/AirCard-Windows/releases)

---

## 🚀 Quick Start

### Option A: Run from source

```
1.  Download or clone this repo
2.  Download aircard.exe → place it in the same folder
3.  Double-click setup.bat
```

That's it. `setup.bat` installs Python packages and launches the app.

### Option B: Build a standalone .exe

```
1.  Double-click build.bat
2.  Find WalletReskin.exe in the dist/ folder
3.  Copy it anywhere, put aircard.exe next to it, run it
```

### Option C: Manual

```bash
pip install -r requirements.txt
python app.py
```

---

## 🎯 How to Use

1. **Plug in your iPhone** via USB → the app detects it automatically
2. Click **Scan** → open **Wallet** on your iPhone → **tap the card** you want to reskin
3. Copy the card hash from the terminal and paste it into the app
4. Click **💾 Save Original** (backs up the current card image — do this first!)
5. Click **📁 Choose Image** → pick any photo
6. **Drag** the preview to position, **scroll** to zoom
7. Click **✨ Apply Skin**
8. On your iPhone: **force-close Wallet** (swipe up in App Switcher) → reopen it

Your card now shows your image. 🎉

---

## 🔧 How It Works

```
┌──────────────────────┐       CLI calls        ┌──────────────────────┐
│                      │ ─────────────────────▸  │                      │
│   Wallet Reskin UI   │   --probe               │   aircard.exe        │
│   (this app)         │   --flash HASH path     │   (AirCard-Windows)  │
│                      │   --save-original HASH  │                      │
│   Python / Tkinter   │   --restore-original    │   Rust / airlift     │
│                      │ ◂─────────────────────  │   exploit            │
└──────────────────────┘       stdout/stderr     └──────────────────────┘
         │                                                │
         │ image crop/resize                              │ AirTraffic sync
         ▼                                                ▼
   1536 × 969 PNG                                   iPhone Wallet
```

This tool is a **GUI frontend only**. The actual card flashing is done by
[AirCard-Windows](https://github.com/Lumid-Off/AirCard-Windows) (by Lumid-Off),
which uses the **airlift** AirTraffic sandbox escape discovered by
[0xjohnny](https://github.com/0xjohnnydev). We call its CLI and wrap it with
image editing, auto-detection, and backup/restore.

---

## 📁 Project Structure

```
.
├── app.py              Main application (GUI + image processing + AirCard bridge)
├── requirements.txt    Python dependencies (customtkinter, Pillow)
├── setup.bat           One-click setup & launch script
├── build.bat           Build standalone .exe via PyInstaller
├── README.md           This file
└── .gitignore
```

---

## ⚠️ Disclaimer

- This tool modifies Wallet card artwork through an **unofficial iOS exploit**
- Only the **visual appearance** changes — your payment data and card numbers are untouched
- **Back up your iPhone** before using this tool
- **Do NOT update to iOS 27.2+** if you want to keep using it — Apple patched the exploit there
- **Use at your own risk**

---

## 🙏 Credits

- [Lumid-Off](https://github.com/Lumid-Off) — AirCard-Windows (the Rust CLI this app wraps)
- [Mak5er](https://github.com/Mak5er) — Original AirCard for macOS
- [0xjohnny](https://github.com/0xjohnnydev) — airlift AirTraffic sandbox escape exploit
- [dhava-gautama](https://github.com/dhava-gautama/AirCard-Windows) — Grappa handshake fix for iOS 26+

## 📄 License

MIT
