# AIO Wallet Reskin Tool

A sleek Windows GUI wrapper around [AirCard-Windows](https://github.com/Lumid-Off/AirCard-Windows) that makes reskinning your Apple Wallet cards dead simple.

## What it does

- **Auto-detects** your iPhone when you plug it in via USB
- **Scans** your Wallet cards and shows them in a visual grid
- **Image editor** — drag & drop any image, crop and position it on a realistic card preview (1536 × 969 px)
- **One-click apply** — skins the card and tells you when to reopen Wallet
- **Backup & restore** — saves original card art before any change, one-click revert
- **Card gallery** — browse and download community card designs
- **Batch mode** — skin multiple cards in one go
- **Dark UI** — modern dark theme that matches iOS aesthetics

## Requirements

- Windows 10/11 64-bit
- iTunes (desktop version from apple.com, NOT Microsoft Store) or Apple Devices
- iPhone on iOS 18.0 – 27.0.1 (not 27.2 beta 3+)
- USB cable (Lightning or USB-C)
- `aircard.exe` from [AirCard-Windows Releases](https://github.com/Lumid-Off/AirCard-Windows/releases)

## Setup

1. Download `aircard.exe` and place it in this folder (or add it to PATH)
2. Install Python 3.10+ (if running from source)
3. Install dependencies: `pip install -r requirements.txt`
4. Run: `python app.py`

### Build standalone .exe

```bash
pip install pyinstaller
pyinstaller --onefile --windowed --icon=icon.ico --name="WalletReskin" app.py
```

The .exe appears in `dist/WalletReskin.exe`.

## How it works

This tool is a **GUI frontend** only. The actual card flashing is performed by
`aircard.exe` (AirCard-Windows by Lumid-Off), which uses the airlift AirTraffic
sync exploit discovered by 0xjohnny. This tool calls AirCard's CLI interface
(`--probe`, `--flash`, `--save-original`, `--restore-original`) and provides a
friendlier experience on top.

## ⚠️ Disclaimer

- This tool modifies Wallet card artwork through an unofficial iOS exploit
- Only the visual appearance changes — payment data is untouched
- Back up your iPhone before use
- Do NOT update to iOS 27.2+ if you want to keep using this
- Use at your own risk
