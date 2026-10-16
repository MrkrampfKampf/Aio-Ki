# 💳 Wallet Reskin Tool

A sleek Windows GUI that makes reskinning your Apple Wallet cards dead simple.
Wraps the [dhava-gautama/AirCard-Windows](https://github.com/dhava-gautama/AirCard-Windows)
fork's CLI with a friendly interface — pick an image, position it, one click, done.

> **⚠️ Important:** This tool requires the **dhava-gautama fork** of AirCard-Windows,
> NOT the original Lumid-Off version. Only the fork has CLI support (`--probe`,
> `--flash`, `--save-original`, `--restore-original`). The original is GUI-only.

![Windows 10/11](https://img.shields.io/badge/Windows-10%2F11-0078D6?logo=windows)
![iOS 18–27.0.1](https://img.shields.io/badge/iOS-18.0–27.0.1-000?logo=apple)
![Python 3.10+](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

| | |
|---|---|
| 📱 **Auto-Detect** | Finds your iPhone automatically via USB (polls every 5 s) |
| ✅ **iOS Version Check** | Warns you if your iOS version is patched (27.2+) |
| 💳 **Card Management** | Add, name, and manage your card hashes with validation |
| 🎨 **Image Editor** | Drag to position, scroll to zoom — live card-shaped preview |
| ✂️ **Smart Crop** | Automatically cuts your image to 1536 × 969 px (@3x Apple card size) |
| ✨ **One-Click Apply** | Skins the card and walks you through reopening Wallet |
| 💾 **Backup First** | Prompts you to save the original before any change |
| 🔙 **Restore** | Reverts to the original card image with one click |
| 📂 **Saved Cards** | Remembers your cards between sessions (shares AirCard's cards.json) |
| 🌑 **Dark UI** | Modern dark theme that matches iOS |

---

## 📋 What You Need to Download

### 1. This tool

Clone the repo or download the files.

### 2. `aircard.exe` — the dhava-gautama fork ⚡

**Download:** [github.com/dhava-gautama/AirCard-Windows/releases](https://github.com/dhava-gautama/AirCard-Windows/releases)

Place `aircard.exe` in the same folder as `app.py`.

> ❌ Do NOT use the Lumid-Off original — it has no CLI and won't work with this tool.
>
> ✅ The dhava-gautama fork adds: CLI flags, Grappa handshake fix for iOS 26+,
> batched file writes, Apple Devices (Microsoft Store) support.

### 3. iTunes or Apple Devices

One of these, for the USB drivers:

- **iTunes** (desktop version from [apple.com](https://www.apple.com/itunes/)) — NOT the Microsoft Store version
- **Or** the **Apple Devices** app from the Microsoft Store (the fork supports both)

### 4. Python 3.10+ *(only if running from source)*

Download from [python.org](https://www.python.org/downloads/) — check **"Add Python to PATH"** during install.

Not needed if you build the standalone `.exe`.

---

## 🚀 Quick Start

### Option A: Double-click setup

```
1.  Put aircard.exe next to app.py
2.  Double-click setup.bat
    → installs Python packages, launches the app
```

### Option B: Build standalone .exe

```
1.  Double-click build.bat
    → builds dist/WalletReskin.exe
2.  Copy WalletReskin.exe anywhere
3.  Put aircard.exe next to it
4.  Run WalletReskin.exe — no Python needed
```

### Option C: Manual

```bash
pip install customtkinter Pillow
python app.py
```

---

## 🎯 How to Use

### Step 1: Get your card hash

The card hash identifies which Wallet card to skin. You get it from AirCard's scan:

1. Open `aircard.exe` directly (it has its own GUI too)
2. Go to the **Wallet** tab → click **Scan**
3. On your iPhone, open **Wallet** and **tap the card** you want to reskin
4. AirCard shows the card hash — **copy it**

### Step 2: Use this tool

1. **Plug in your iPhone** via USB → the app detects it automatically
2. Click **+ Add Card** → paste the card hash
3. Give it a name (e.g. "Visa ending 4242")
4. Click **📁 Choose Image** → pick any photo
5. **Drag** the preview to position, **scroll** to zoom
6. Click **💾 Save Original** (backs up the original — do this first!)
7. Click **✨ Apply Skin**
8. On your iPhone: **force-close Wallet** (swipe up in App Switcher) → reopen it

Your card now shows your image. 🎉

---

## 🔧 How It Works

```
┌──────────────────────┐       CLI calls        ┌──────────────────────┐
│                      │ ─────────────────────▸  │                      │
│   Wallet Reskin UI   │   --probe               │   aircard.exe        │
│   (this app)         │   --flash HASH path     │   (dhava-gautama     │
│                      │   --save-original HASH  │    fork only!)       │
│   Python / Tkinter   │   --restore-original    │                      │
│                      │ ◂─────────────────────  │   Rust / airlift     │
└──────────────────────┘    exit code + text     └──────────────────────┘
         │                                                │
         │ image crop → 1536×969 PNG                      │ AirTraffic sync
         ▼                                                ▼
   temp/card_XXXX.png                               iPhone Wallet
```

The **airlift** exploit (by 0xjohnny) uses Apple's Books sync mechanism to write
card artwork files outside the AirTraffic sandbox. It replaces:
- `cardBackgroundCombined@3x.png` (1536×969)
- `cardBackgroundCombined@2x.png` (1024×646)
- `cardBackgroundCombined.pdf`

And invalidates the FrontFace/PlaceHolder/Preview caches.

This tool handles image editing and exports the @3x PNG. AirCard handles
the @2x downscale, PDF generation, and the actual AirTraffic sync.

---

## 📁 Project Structure

```
.
├── app.py              Main application — GUI, image processing, AirCard CLI bridge
├── requirements.txt    Python dependencies (customtkinter, Pillow)
├── setup.bat           One-click setup & launch
├── build.bat           Build standalone .exe via PyInstaller
├── README.md           This file
└── .gitignore
```

---

## 🔍 Card Hash Format

Card hashes are base64-encoded SHA-1 (20 bytes) or SHA-256 (32 bytes) — NOT bank
card numbers. They look like `aBcDeFgHiJkLmNoPqRsTuVwXyZa=` (28 chars for SHA-1)
or a 44-character string for SHA-256. Both standard and URL-safe base64 (`-` and
`_`) are accepted. The app validates hashes before accepting them.

---

## ⚠️ Disclaimer

- This tool modifies Wallet card artwork through an **unofficial iOS exploit**
- Only the **visual appearance** changes — your payment data and card numbers are untouched
- **Back up your iPhone** before using this tool
- **Do NOT update past iOS 27.0.1** if you want to keep using it — Apple patched the exploit in 27.2 beta 3
- The card image may revert after an iOS update or if the bank pushes new card art
- **Close iTunes/Apple Devices** before flashing — they steal the AirTraffic session
- Use at your own risk

---

## 🙏 Credits

- [dhava-gautama](https://github.com/dhava-gautama/AirCard-Windows) — AirCard-Windows fork with CLI, Grappa fix, batch writes
- [Lumid-Off](https://github.com/Lumid-Off/AirCard-Windows) — Original AirCard-Windows (GUI)
- [Mak5er](https://github.com/Mak5er/AirCard) — Original AirCard for macOS
- [0xjohnny](https://github.com/0xjohnnydev) — airlift AirTraffic sandbox escape exploit

## 📄 License

MIT
