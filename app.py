"""
AIO Wallet Reskin Tool
──────────────────────
A modern Windows GUI for reskinning Apple Wallet cards via AirCard-Windows.
Wraps the dhava-gautama/AirCard-Windows fork's CLI and adds image editing,
auto-detection, backup/restore.

IMPORTANT: Only the dhava-gautama fork has CLI support (--probe, --flash,
--save-original, --restore-original). The upstream Lumid-Off repo is GUI-only.

Download from: https://github.com/dhava-gautama/AirCard-Windows/releases
"""

import customtkinter as ctk
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageTk
import subprocess
import threading
import json
import os
import sys
import shutil
import time
import re
import base64
from pathlib import Path
from tkinter import filedialog, messagebox
from typing import Optional

# ─── Constants ────────────────────────────────────────────────────────────────

CARD_WIDTH = 1536
CARD_HEIGHT = 969
CARD_ASPECT = CARD_WIDTH / CARD_HEIGHT  # ~1.585

# AirCard also generates @2x at 1024×646, but we export @3x and let it handle the rest
CARD_WIDTH_2X = 1024
CARD_HEIGHT_2X = 646

PREVIEW_WIDTH = 480
PREVIEW_HEIGHT = int(PREVIEW_WIDTH / CARD_ASPECT)  # ~303

APP_NAME = "AIO Wallet Reskin"
APP_VERSION = "1.1.0"

# Where the dhava-gautama fork stores card data and backups
AIRCARD_DATA_DIR = Path(os.environ.get("LOCALAPPDATA", "")) / "AirCard" if os.name == "nt" else Path.home() / ".aircard"
CARDS_JSON = AIRCARD_DATA_DIR / "cards.json"

# Paths
APP_DIR = Path(__file__).parent.resolve()
TEMP_DIR = APP_DIR / "temp"
AIRCARD_NAMES = ["aircard.exe", "AirCard.exe"]

# Card hash validation: base64-encoded SHA-1 (20 bytes) or SHA-256 (32 bytes)
VALID_HASH_LENGTHS = {27, 28, 43, 44}
HASH_CHARS = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=_-")
REJECT_KEYWORDS = {"com_apple", "mobileasset", "siri", "device", "model", "search"}


# ─── Card Hash Validation ────────────────────────────────────────────────────

def validate_card_hash(raw: str) -> tuple[bool, str]:
    """
    Validate a card hash using the same rules as AirCard's scanner.rs.
    Card hashes are base64-encoded SHA-1 (20 bytes) or SHA-256 (32 bytes).
    Returns (is_valid, cleaned_hash_or_error_message).
    """
    # Strip whitespace and surrounding quotes/punctuation
    h = raw.strip().strip("\"'`.,;:!?()[]{}")

    # Check length
    if len(h) not in VALID_HASH_LENGTHS:
        return False, (
            f"Invalid length ({len(h)}). Card hashes are 27-28 or 43-44 characters.\n"
            "Make sure you copied the full hash from AirCard's scan output."
        )

    # Check character set (standard + URL-safe base64)
    if not all(c in HASH_CHARS for c in h):
        bad = [c for c in h if c not in HASH_CHARS]
        return False, f"Invalid characters: {''.join(set(bad))}. Must be base64 (A-Z, a-z, 0-9, +, /, =, -, _)."

    # Padding only in last 2 positions
    eq_pos = h.find("=")
    if eq_pos != -1 and eq_pos < len(h) - 2:
        return False, "Invalid base64 padding."

    # Reject system keywords
    h_lower = h.lower()
    for kw in REJECT_KEYWORDS:
        if kw in h_lower:
            return False, f"This looks like a system path, not a card hash (contains '{kw}')."

    # Try to decode
    try:
        # Convert URL-safe to standard base64
        std = h.replace("-", "+").replace("_", "/")
        # Pad if needed
        padding = 4 - (len(std) % 4)
        if padding < 4:
            std += "=" * padding
        decoded = base64.b64decode(std)

        if len(decoded) not in (20, 32):
            return False, f"Decoded to {len(decoded)} bytes (expected 20 or 32)."

        # Entropy check: not all identical
        if len(set(decoded)) < 12:
            return False, "Hash has too little entropy — likely not a real card hash."

    except Exception as e:
        return False, f"Base64 decode failed: {e}"

    return True, h


# ─── Saved Cards Persistence ─────────────────────────────────────────────────

def load_saved_cards() -> list[dict]:
    """Load previously scanned cards from AirCard's cards.json."""
    if not CARDS_JSON.is_file():
        return []
    try:
        data = json.loads(CARDS_JSON.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return [c for c in data if isinstance(c, dict) and "hash" in c]
    except (json.JSONDecodeError, OSError):
        pass
    return []


def save_cards_to_json(cards: list) -> None:
    """Save cards in AirCard's cards.json format for interop."""
    AIRCARD_DATA_DIR.mkdir(parents=True, exist_ok=True)
    entries = [{"hash": c.card_hash, "name": c.label} for c in cards]
    CARDS_JSON.write_text(json.dumps(entries, indent=2), encoding="utf-8")


# ─── AirCard Bridge ──────────────────────────────────────────────────────────

class AirCardBridge:
    """
    Communicates with aircard.exe CLI.

    IMPORTANT: CLI support (--probe, --flash, --save-original, --restore-original)
    exists ONLY in the dhava-gautama/AirCard-Windows fork.
    The upstream Lumid-Off repo is GUI-only with no CLI arguments.

    Output format is plain text (println!/eprintln!), NOT JSON.
    Exit codes: 0 = success, 1 = error, 2 = invalid --probe usage.
    """

    FORK_URL = "https://github.com/dhava-gautama/AirCard-Windows/releases"

    def __init__(self):
        self.exe_path: Optional[Path] = None
        self._find_aircard()

    def _find_aircard(self):
        """Locate aircard.exe in common locations."""
        search_paths = [
            APP_DIR,
            APP_DIR / "bin",
            Path.home() / "Downloads",
            Path.home() / "Desktop",
        ]
        # Also check PATH
        for name in AIRCARD_NAMES:
            found = shutil.which(name)
            if found:
                self.exe_path = Path(found)
                return

        for base in search_paths:
            for name in AIRCARD_NAMES:
                candidate = base / name
                if candidate.is_file():
                    self.exe_path = candidate
                    return

    @property
    def available(self) -> bool:
        return self.exe_path is not None and self.exe_path.is_file()

    def _run(self, args: list[str], timeout: int = 60) -> subprocess.CompletedProcess:
        """Run aircard.exe with given arguments."""
        if not self.available:
            raise FileNotFoundError(
                "aircard.exe not found!\n\n"
                "Download it from the dhava-gautama fork (NOT the Lumid-Off original!):\n"
                f"{self.FORK_URL}\n\n"
                "Place aircard.exe next to this app."
            )
        cmd = [str(self.exe_path)] + args
        return subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )

    def _has_cli_support(self) -> bool:
        """
        Check if this aircard.exe actually supports CLI flags.
        The upstream Lumid-Off build will just launch the GUI when given --probe,
        while the dhava-gautama fork will print device info and exit.
        """
        if not self.available:
            return False
        try:
            result = self._run(["--probe"], timeout=10)
            # Exit code 2 = "invalid --probe usage" (fork, no device) → has CLI
            # Exit code 1 = error (fork, device issue) → has CLI
            # Exit code 0 with no stdout = launched GUI (upstream) → no CLI
            return result.returncode in (0, 1, 2) and (
                result.stdout.strip() or result.stderr.strip()
            )
        except subprocess.TimeoutExpired:
            # Timed out = probably launched GUI window → upstream, no CLI
            return False
        except Exception:
            return False

    def probe(self) -> dict:
        """
        Probe for connected iPhone. Returns device info dict.
        Output is plain text with key:value lines.
        """
        result = self._run(["--probe"], timeout=20)

        if result.returncode == 2:
            # Invalid usage / no device
            return {"connected": False, "error": "No device found or invalid probe."}

        if result.returncode != 0:
            error = result.stderr.strip()
            # Parse common errors
            if "no device" in error.lower() or "usbmuxd" in error.lower():
                return {"connected": False, "error": "No iPhone connected. Check USB cable and trust prompt."}
            if "itunes" in error.lower() or "apple mobile" in error.lower():
                return {"connected": False, "error": "iTunes/Apple Mobile Device Support not found. Install iTunes first."}
            return {"connected": False, "error": error or "Probe failed."}

        # Parse plain-text output (key: value lines)
        output = result.stdout.strip()
        info: dict = {"connected": True, "raw": output}

        for line in output.splitlines():
            line = line.strip()
            if ":" in line:
                key, _, val = line.partition(":")
                normalized_key = key.strip().lower().replace(" ", "_")
                info[normalized_key] = val.strip()

        # Map common field names
        if "product_version" in info and "ios_version" not in info:
            info["ios_version"] = info["product_version"]
        if "device_name" not in info:
            for k in ("name", "devicename", "device"):
                if k in info:
                    info["device_name"] = info[k]
                    break

        return info

    def flash(self, card_hash: str, image_path: str) -> tuple[bool, str]:
        """
        Flash a card skin.
        CLI: aircard.exe --flash "<card_hash>" "<image_path>"
        Timeout: 120s (AirTraffic sync overall timeout is 120s in the code).
        Returns (success, message).
        """
        result = self._run(
            ["--flash", card_hash, str(image_path)],
            timeout=180,  # Extra margin over the 120s internal timeout
        )
        success = result.returncode == 0
        # Combine stdout and stderr for the message
        msg = result.stdout.strip()
        if result.stderr.strip():
            msg = (msg + "\n" + result.stderr.strip()).strip()
        return success, msg or ("Card skin applied!" if success else "Flash failed — check connection and try again.")

    def save_original(self, card_hash: str) -> tuple[bool, str]:
        """
        Save the original card artwork as backup.
        CLI: aircard.exe --save-original "<card_hash>"
        Backups go to %LOCALAPPDATA%/AirCard/wallet-originals/{udid}-{hash}/
        """
        result = self._run(["--save-original", card_hash], timeout=60)
        success = result.returncode == 0
        msg = result.stdout.strip()
        if result.stderr.strip():
            msg = (msg + "\n" + result.stderr.strip()).strip()
        return success, msg or ("Original saved." if success else "Save failed.")

    def restore_original(self, card_hash: str) -> tuple[bool, str]:
        """
        Restore the original card artwork from backup.
        CLI: aircard.exe --restore-original "<card_hash>"
        """
        result = self._run(["--restore-original", card_hash], timeout=60)
        success = result.returncode == 0
        msg = result.stdout.strip()
        if result.stderr.strip():
            msg = (msg + "\n" + result.stderr.strip()).strip()
        return success, msg or ("Original restored." if success else "Restore failed.")


# ─── Image Processor ─────────────────────────────────────────────────────────

class ImageProcessor:
    """
    Handles loading, cropping, and exporting card images.

    Matches AirCard's image processing:
    - Crop to card aspect ratio (1536:969 ≈ 1.585:1)
    - Focus point (offset_x, offset_y) controls which part of the image is kept
    - Zoom > 1 takes a smaller region (closer crop)
    - Export at @3x (1536×969) — AirCard generates @2x and PDF internally
    """

    def __init__(self):
        self.source_image: Optional[Image.Image] = None
        self.source_path: Optional[str] = None
        self.offset_x: float = 0.5  # 0..1, focus point
        self.offset_y: float = 0.5
        self.zoom: float = 1.0  # 1.0 = fit, >1 = zoom in

    def load(self, path: str):
        """Load an image from disk."""
        self.source_image = Image.open(path).convert("RGBA")
        self.source_path = path
        self.offset_x = 0.5
        self.offset_y = 0.5
        self.zoom = 1.0

    @property
    def loaded(self) -> bool:
        return self.source_image is not None

    def get_cropped(self, width: int = CARD_WIDTH, height: int = CARD_HEIGHT) -> Image.Image:
        """
        Return the image cropped and scaled to card dimensions.
        Matches AirCard's crop_bounds_for_card() logic:
        - If source wider than target aspect → crop horizontally at focus_x
        - If source taller → crop vertically at focus_y
        """
        if not self.source_image:
            raise ValueError("No image loaded.")

        src = self.source_image
        src_w, src_h = src.size
        target_aspect = width / height

        # Determine fit dimensions (largest rect at target aspect inside source)
        if src_w / src_h > target_aspect:
            # Source is wider than card — crop sides
            fit_h = src_h
            fit_w = int(fit_h * target_aspect)
        else:
            # Source is taller than card — crop top/bottom
            fit_w = src_w
            fit_h = int(fit_w / target_aspect)

        # Apply zoom (zoom > 1 means smaller crop region → more zoomed in)
        crop_w = max(1, int(fit_w / self.zoom))
        crop_h = max(1, int(fit_h / self.zoom))
        crop_w = min(crop_w, src_w)
        crop_h = min(crop_h, src_h)

        # Apply offset/focus point (0.5 = center)
        max_x = src_w - crop_w
        max_y = src_h - crop_h
        left = int(max_x * self.offset_x)
        top = int(max_y * self.offset_y)

        cropped = src.crop((left, top, left + crop_w, top + crop_h))
        return cropped.resize((width, height), Image.LANCZOS)

    def get_preview(self) -> Image.Image:
        """Get a preview-sized cropped image."""
        return self.get_cropped(PREVIEW_WIDTH, PREVIEW_HEIGHT)

    def export(self, output_path: str):
        """
        Export the final card image as PNG at @3x (1536×969).
        AirCard handles @2x and PDF generation internally from this.
        """
        final = self.get_cropped()
        # Convert to RGB (no alpha for card artwork)
        if final.mode == "RGBA":
            bg = Image.new("RGB", final.size, (0, 0, 0))
            bg.paste(final, mask=final.split()[3])
            final = bg
        final.save(output_path, "PNG", optimize=True)

    def get_source_info(self) -> str:
        """Return a human-readable summary of the source image."""
        if not self.source_image:
            return "No image"
        w, h = self.source_image.size
        name = Path(self.source_path).name if self.source_path else "unknown"
        aspect = "wider" if w/h > CARD_ASPECT else "taller" if w/h < CARD_ASPECT else "perfect"
        return f"{name} ({w}×{h}, {aspect} than card)"


# ─── Card Data ───────────────────────────────────────────────────────────────

class CardInfo:
    """Represents a scanned Wallet card."""

    def __init__(self, card_hash: str, label: str = "", card_type: str = ""):
        self.card_hash = card_hash
        self.label = label or f"Card …{card_hash[-6:]}"
        self.card_type = card_type
        self.has_backup = False
        self.custom_image_path: Optional[str] = None


# ─── Main Application ────────────────────────────────────────────────────────

class WalletReskinApp(ctk.CTk):
    """Main application window."""

    def __init__(self):
        super().__init__()

        # ── Window setup ──
        self.title(f"{APP_NAME} v{APP_VERSION}")
        self.geometry("960x680")
        self.minsize(800, 600)
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        # ── State ──
        self.bridge = AirCardBridge()
        self.processor = ImageProcessor()
        self.cards: list[CardInfo] = []
        self.selected_card: Optional[CardInfo] = None
        self.device_info: dict = {}
        self._drag_start = None
        self._cli_verified = False

        # ── Build UI ──
        self._build_ui()

        # ── Load saved cards from AirCard's cards.json ──
        self._load_existing_cards()

        # ── Initial checks ──
        self.after(500, self._check_aircard)
        self.after(1500, self._auto_probe)

        # ── Poll for device every 5 seconds ──
        self._poll_device()

    # ── UI Construction ───────────────────────────────────────────────────

    def _build_ui(self):
        """Build the complete UI layout."""
        self._build_top_bar()

        self.main_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.main_frame.pack(fill="both", expand=True, padx=16, pady=(0, 16))
        self.main_frame.grid_columnconfigure(0, weight=1, minsize=280)
        self.main_frame.grid_columnconfigure(1, weight=2, minsize=400)
        self.main_frame.grid_rowconfigure(0, weight=1)

        self._build_left_panel()
        self._build_right_panel()
        self._build_status_bar()

    def _build_top_bar(self):
        """Top bar with title, device status, and version."""
        bar = ctk.CTkFrame(self, height=56, corner_radius=0)
        bar.pack(fill="x", padx=0, pady=0)
        bar.pack_propagate(False)

        title = ctk.CTkLabel(
            bar, text=f"💳  {APP_NAME}",
            font=ctk.CTkFont(size=18, weight="bold"),
        )
        title.pack(side="left", padx=20)

        self.device_indicator = ctk.CTkLabel(
            bar, text="⚪  No device",
            font=ctk.CTkFont(size=13), text_color="#888",
        )
        self.device_indicator.pack(side="left", padx=20)

        ver = ctk.CTkLabel(
            bar, text=f"v{APP_VERSION}",
            font=ctk.CTkFont(size=11), text_color="#555",
        )
        ver.pack(side="right", padx=20)

    def _build_left_panel(self):
        """Left panel: device info + card list."""
        left = ctk.CTkFrame(self.main_frame, corner_radius=12)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 8), pady=0)

        # ── Device section ──
        ctk.CTkLabel(
            left, text="📱 Device",
            font=ctk.CTkFont(size=14, weight="bold"), anchor="w",
        ).pack(fill="x", padx=16, pady=(16, 4))

        self.device_name_label = ctk.CTkLabel(
            left, text="Not connected",
            font=ctk.CTkFont(size=12), text_color="#aaa", anchor="w",
        )
        self.device_name_label.pack(fill="x", padx=16, pady=(0, 4))

        self.ios_version_label = ctk.CTkLabel(
            left, text="",
            font=ctk.CTkFont(size=11), text_color="#777", anchor="w",
        )
        self.ios_version_label.pack(fill="x", padx=16, pady=(0, 8))

        self.refresh_btn = ctk.CTkButton(
            left, text="🔄 Refresh Device",
            command=self._on_refresh_device, height=32,
            font=ctk.CTkFont(size=12),
        )
        self.refresh_btn.pack(fill="x", padx=16, pady=(0, 12))

        ctk.CTkFrame(left, height=1, fg_color="#333").pack(fill="x", padx=16, pady=4)

        # ── Cards section ──
        cards_header = ctk.CTkFrame(left, fg_color="transparent")
        cards_header.pack(fill="x", padx=16, pady=(12, 4))

        ctk.CTkLabel(
            cards_header, text="💳 Wallet Cards",
            font=ctk.CTkFont(size=14, weight="bold"), anchor="w",
        ).pack(side="left")

        self.add_card_btn = ctk.CTkButton(
            cards_header, text="+ Add Card",
            command=self._on_add_card,
            width=85, height=28, font=ctk.CTkFont(size=11),
        )
        self.add_card_btn.pack(side="right")

        # Instructions
        self.scan_hint = ctk.CTkLabel(
            left,
            text=(
                "To get a card hash:\n"
                "1. Open AirCard GUI → Wallet tab → Scan\n"
                "2. On iPhone, open Wallet, tap card\n"
                "3. Copy the hash → paste here with + Add"
            ),
            font=ctk.CTkFont(size=10), text_color="#666",
            anchor="w", justify="left",
        )
        self.scan_hint.pack(fill="x", padx=16, pady=(4, 8))

        # Card list
        self.card_list_frame = ctk.CTkScrollableFrame(
            left, fg_color="transparent", corner_radius=8,
        )
        self.card_list_frame.pack(fill="both", expand=True, padx=12, pady=(0, 8))

        self.no_cards_label = ctk.CTkLabel(
            self.card_list_frame,
            text="No cards yet.\nAdd a card hash to get started.",
            font=ctk.CTkFont(size=11), text_color="#555", justify="center",
        )
        self.no_cards_label.pack(pady=40)

        # Remove card button
        self.remove_card_btn = ctk.CTkButton(
            left, text="🗑️ Remove Selected",
            command=self._on_remove_card,
            height=28, font=ctk.CTkFont(size=11),
            fg_color="#442222", hover_color="#663333",
            state="disabled",
        )
        self.remove_card_btn.pack(fill="x", padx=16, pady=(0, 12))

    def _build_right_panel(self):
        """Right panel: image editor with card preview."""
        right = ctk.CTkFrame(self.main_frame, corner_radius=12)
        right.grid(row=0, column=1, sticky="nsew", padx=(8, 0), pady=0)

        # ── Header ──
        header = ctk.CTkFrame(right, fg_color="transparent")
        header.pack(fill="x", padx=20, pady=(16, 8))

        self.editor_title = ctk.CTkLabel(
            header, text="🎨 Card Editor",
            font=ctk.CTkFont(size=14, weight="bold"), anchor="w",
        )
        self.editor_title.pack(side="left")

        self.selected_card_label = ctk.CTkLabel(
            header, text="No card selected",
            font=ctk.CTkFont(size=12), text_color="#888",
        )
        self.selected_card_label.pack(side="right")

        # ── Card preview ──
        self.preview_frame = ctk.CTkFrame(
            right, width=PREVIEW_WIDTH + 32, height=PREVIEW_HEIGHT + 32,
            corner_radius=16, fg_color="#1a1a1a",
        )
        self.preview_frame.pack(padx=20, pady=8)
        self.preview_frame.pack_propagate(False)

        self.preview_label = ctk.CTkLabel(
            self.preview_frame, text="",
            width=PREVIEW_WIDTH, height=PREVIEW_HEIGHT,
        )
        self.preview_label.pack(expand=True)
        self.preview_label.bind("<B1-Motion>", self._on_drag)
        self.preview_label.bind("<ButtonPress-1>", self._on_drag_start)
        self.preview_label.bind("<ButtonRelease-1>", self._on_drag_end)
        self.preview_label.bind("<MouseWheel>", self._on_scroll_zoom)

        self._show_empty_preview()

        # ── Controls ──
        controls = ctk.CTkFrame(right, fg_color="transparent")
        controls.pack(fill="x", padx=20, pady=(4, 8))

        # Zoom
        zoom_frame = ctk.CTkFrame(controls, fg_color="transparent")
        zoom_frame.pack(fill="x", pady=4)

        ctk.CTkLabel(
            zoom_frame, text="🔍 Zoom",
            font=ctk.CTkFont(size=11), text_color="#888",
        ).pack(side="left")

        self.zoom_slider = ctk.CTkSlider(
            zoom_frame, from_=1.0, to=3.0,
            command=self._on_zoom_change, width=200,
        )
        self.zoom_slider.set(1.0)
        self.zoom_slider.pack(side="left", padx=12)

        self.zoom_label = ctk.CTkLabel(
            zoom_frame, text="1.0×",
            font=ctk.CTkFont(size=11), text_color="#888", width=40,
        )
        self.zoom_label.pack(side="left")

        # Image size info
        self.img_info_label = ctk.CTkLabel(
            controls, text="",
            font=ctk.CTkFont(size=10), text_color="#555", anchor="w",
        )
        self.img_info_label.pack(fill="x", pady=(0, 4))

        # Buttons
        btn_frame = ctk.CTkFrame(controls, fg_color="transparent")
        btn_frame.pack(fill="x", pady=4)

        self.choose_img_btn = ctk.CTkButton(
            btn_frame, text="📁 Choose Image",
            command=self._on_choose_image,
            height=36, font=ctk.CTkFont(size=13),
        )
        self.choose_img_btn.pack(side="left", padx=(0, 8))

        self.reset_crop_btn = ctk.CTkButton(
            btn_frame, text="↺ Reset",
            command=self._on_reset_crop,
            height=36, font=ctk.CTkFont(size=12),
            fg_color="#444", hover_color="#555",
        )
        self.reset_crop_btn.pack(side="left", padx=(0, 8))

        # ── Action buttons ──
        action_frame = ctk.CTkFrame(right, fg_color="transparent")
        action_frame.pack(fill="x", padx=20, pady=(8, 8))

        self.apply_btn = ctk.CTkButton(
            action_frame, text="✨ Apply Skin",
            command=self._on_apply_skin,
            height=44, font=ctk.CTkFont(size=15, weight="bold"),
            fg_color="#0a84ff", hover_color="#0070dd",
            state="disabled",
        )
        self.apply_btn.pack(fill="x", pady=(0, 8))

        restore_frame = ctk.CTkFrame(action_frame, fg_color="transparent")
        restore_frame.pack(fill="x")

        self.backup_btn = ctk.CTkButton(
            restore_frame, text="💾 Save Original",
            command=self._on_save_original,
            height=34, font=ctk.CTkFont(size=12),
            fg_color="#333", hover_color="#444", state="disabled",
        )
        self.backup_btn.pack(side="left", expand=True, fill="x", padx=(0, 4))

        self.restore_btn = ctk.CTkButton(
            restore_frame, text="🔙 Restore Original",
            command=self._on_restore_original,
            height=34, font=ctk.CTkFont(size=12),
            fg_color="#333", hover_color="#444", state="disabled",
        )
        self.restore_btn.pack(side="left", expand=True, fill="x", padx=(4, 0))

        # Info text
        ctk.CTkLabel(
            right,
            text="Drag to position · Scroll to zoom · Output: 1536 × 969 px (@3x)",
            font=ctk.CTkFont(size=10), text_color="#555",
        ).pack(pady=(0, 12))

    def _build_status_bar(self):
        """Bottom status bar."""
        bar = ctk.CTkFrame(self, height=28, corner_radius=0, fg_color="#1a1a1a")
        bar.pack(fill="x", side="bottom")
        bar.pack_propagate(False)

        self.status_label = ctk.CTkLabel(
            bar, text="Ready — connect your iPhone via USB",
            font=ctk.CTkFont(size=11), text_color="#666",
        )
        self.status_label.pack(side="left", padx=16)

        self.aircard_status = ctk.CTkLabel(
            bar, text="", font=ctk.CTkFont(size=11), text_color="#666",
        )
        self.aircard_status.pack(side="right", padx=16)

    # ── Preview helpers ───────────────────────────────────────────────────

    def _show_empty_preview(self):
        """Show an empty card placeholder."""
        img = Image.new("RGB", (PREVIEW_WIDTH, PREVIEW_HEIGHT), "#2a2a2e")
        draw = ImageDraw.Draw(img)
        draw.rounded_rectangle(
            [4, 4, PREVIEW_WIDTH - 5, PREVIEW_HEIGHT - 5],
            radius=18, outline="#444", width=2,
        )
        text = "Drop an image here\nor click Choose Image"
        bbox = draw.textbbox((0, 0), text, font=None)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(
            ((PREVIEW_WIDTH - tw) / 2, (PREVIEW_HEIGHT - th) / 2),
            text, fill="#666",
        )
        self._set_preview_image(img)

    def _update_preview(self):
        """Re-render the preview from the processor."""
        if not self.processor.loaded:
            self._show_empty_preview()
            return

        preview = self.processor.get_preview()
        if preview.mode == "RGBA":
            bg = Image.new("RGB", preview.size, "#1a1a1a")
            bg.paste(preview, mask=preview.split()[3])
            preview = bg

        # Rounded corners
        mask = Image.new("L", preview.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, preview.width - 1, preview.height - 1], radius=16, fill=255,
        )
        result = Image.new("RGB", preview.size, "#1a1a1a")
        result.paste(preview, mask=mask)

        # Border
        ImageDraw.Draw(result).rounded_rectangle(
            [0, 0, result.width - 1, result.height - 1],
            radius=16, outline="#444", width=1,
        )
        self._set_preview_image(result)

    def _set_preview_image(self, pil_image: Image.Image):
        """Set the preview label to show a PIL image."""
        photo = ImageTk.PhotoImage(pil_image)
        self.preview_label.configure(image=photo, text="")
        self.preview_label._photo = photo  # prevent GC

    # ── Load saved cards ──────────────────────────────────────────────────

    def _load_existing_cards(self):
        """Load cards from AirCard's cards.json on startup."""
        saved = load_saved_cards()
        for entry in saved:
            card_hash = entry.get("hash", "")
            name = entry.get("name", "")
            if card_hash:
                card = CardInfo(card_hash, label=name)
                self.cards.append(card)

        if self.cards:
            self._rebuild_card_list()
            self._set_status(f"Loaded {len(self.cards)} saved card(s) from AirCard data.")

    # ── Device & Card callbacks ───────────────────────────────────────────

    def _check_aircard(self):
        """Check if aircard.exe is available and has CLI support."""
        if self.bridge.available:
            self.aircard_status.configure(
                text=f"✅ aircard.exe: {self.bridge.exe_path.name}",
                text_color="#4a4",
            )
            # Check CLI support in background
            def _verify():
                has_cli = self.bridge._has_cli_support()
                self._cli_verified = has_cli
                if not has_cli:
                    self.after(0, lambda: [
                        self.aircard_status.configure(
                            text="⚠️ aircard.exe found but has no CLI — need dhava-gautama fork",
                            text_color="#ca4",
                        ),
                        self._set_status(
                            "⚠️ This aircard.exe is the Lumid-Off GUI version. "
                            "Download the dhava-gautama fork for CLI support.",
                            "#ca4",
                        ),
                    ])
            threading.Thread(target=_verify, daemon=True).start()
        else:
            self.aircard_status.configure(
                text="❌ aircard.exe not found",
                text_color="#c44",
            )
            self._set_status(
                "⚠️ aircard.exe not found. Download from "
                "github.com/dhava-gautama/AirCard-Windows/releases",
                "#c44",
            )

    def _auto_probe(self):
        self._on_refresh_device()

    def _poll_device(self):
        """Periodically check for device connection."""
        if not self.device_info.get("connected"):
            threading.Thread(target=self._probe_device_bg, daemon=True).start()
        self.after(5000, self._poll_device)

    def _probe_device_bg(self):
        if not self.bridge.available:
            return
        try:
            info = self.bridge.probe()
            self.after(0, lambda: self._update_device_ui(info))
        except Exception:
            pass

    def _on_refresh_device(self):
        if not self.bridge.available:
            self._set_status("aircard.exe not found. Cannot probe device.", "#c44")
            return

        self._set_status("🔍 Probing for iPhone…")
        self.refresh_btn.configure(state="disabled")

        def _probe():
            try:
                info = self.bridge.probe()
                self.after(0, lambda: self._update_device_ui(info))
            except Exception as e:
                self.after(0, lambda: self._set_status(f"Probe error: {e}", "#c44"))
            finally:
                self.after(0, lambda: self.refresh_btn.configure(state="normal"))

        threading.Thread(target=_probe, daemon=True).start()

    def _update_device_ui(self, info: dict):
        self.device_info = info

        if info.get("connected"):
            name = info.get("device_name", info.get("name", "iPhone"))
            ios = info.get("ios_version", info.get("product_version", ""))
            udid_short = info.get("udid", "")[:8]

            self.device_indicator.configure(text=f"🟢  {name}", text_color="#4a4")
            self.device_name_label.configure(text=name, text_color="#ddd")

            version_text = f"iOS {ios}" if ios else ""
            if udid_short:
                version_text += f"  •  {udid_short}…"
            self.ios_version_label.configure(text=version_text)

            # Warn if iOS version is too new
            if ios and self._check_ios_compat(ios):
                self._set_status(f"✅ Connected: {name} (iOS {ios})")
            elif ios:
                self._set_status(
                    f"⚠️ Connected: {name} (iOS {ios}) — may be patched! Works up to 27.0.1.",
                    "#ca4",
                )
            else:
                self._set_status(f"✅ Connected: {name}")
        else:
            self.device_indicator.configure(text="⚪  No device", text_color="#888")
            self.device_name_label.configure(text="Not connected", text_color="#aaa")
            self.ios_version_label.configure(text="")
            error = info.get("error", "")
            self._set_status(
                f"No iPhone detected. {error}" if error
                else "No iPhone detected — connect via USB and trust the computer."
            )

    def _check_ios_compat(self, version_str: str) -> bool:
        """Check if the iOS version is compatible (18.0 – 27.0.1)."""
        try:
            parts = [int(x) for x in version_str.split(".")]
            major = parts[0]
            minor = parts[1] if len(parts) > 1 else 0
            patch = parts[2] if len(parts) > 2 else 0

            if major < 18:
                return False
            if major > 27:
                return False
            if major == 27:
                if minor == 0:
                    return True  # 27.0.x is fine
                if minor >= 2:
                    return False  # 27.2+ is patched
                return True  # 27.1.x should work
            return True  # 18–26 all fine
        except (ValueError, IndexError):
            return True  # Can't parse → don't warn

    def _on_add_card(self):
        """Open dialog to manually add a card hash."""
        dialog = ctk.CTkInputDialog(
            text=(
                "Paste the card hash here.\n\n"
                "To get it, use AirCard's GUI:\n"
                "Wallet tab → Scan → open Wallet\n"
                "on iPhone → tap card → copy hash.\n\n"
                "Hash looks like: aBcDeFgH...XyZ= (28 or 44 chars)"
            ),
            title="Add Card Hash",
        )
        raw = dialog.get_input()

        if not raw or not raw.strip():
            return

        # Validate
        valid, result = validate_card_hash(raw)
        if not valid:
            messagebox.showerror("Invalid Card Hash", result)
            return

        card_hash = result

        # Check for duplicates
        for c in self.cards:
            if c.card_hash == card_hash:
                self._set_status(f"Card …{card_hash[-6:]} already in list.")
                self._select_card(c)
                return

        # Ask for an optional label
        label_dialog = ctk.CTkInputDialog(
            text="Give this card a name (optional):\ne.g. 'Visa ending 4242'",
            title="Card Name",
        )
        label = label_dialog.get_input()

        card = CardInfo(card_hash, label=label.strip() if label else "")
        self.cards.append(card)
        save_cards_to_json(self.cards)
        self._rebuild_card_list()
        self._select_card(card)
        self._set_status(f"✅ Card added: {card.label}")

    def _on_remove_card(self):
        """Remove the selected card from the list."""
        if not self.selected_card:
            return

        ok = messagebox.askyesno(
            "Remove Card",
            f"Remove {self.selected_card.label} from the list?\n"
            "This doesn't change anything on your iPhone.",
        )
        if not ok:
            return

        self.cards.remove(self.selected_card)
        self.selected_card = None
        save_cards_to_json(self.cards)
        self._rebuild_card_list()
        self.selected_card_label.configure(text="No card selected")
        self.backup_btn.configure(state="disabled")
        self.restore_btn.configure(state="disabled")
        self.remove_card_btn.configure(state="disabled")
        self._update_apply_state()

    def _rebuild_card_list(self):
        for widget in self.card_list_frame.winfo_children():
            widget.destroy()

        if not self.cards:
            self.no_cards_label = ctk.CTkLabel(
                self.card_list_frame,
                text="No cards yet.\nAdd a card hash to get started.",
                font=ctk.CTkFont(size=11), text_color="#555", justify="center",
            )
            self.no_cards_label.pack(pady=40)
            return

        for card in self.cards:
            self._create_card_row(card)

    def _create_card_row(self, card: CardInfo):
        is_selected = self.selected_card and self.selected_card.card_hash == card.card_hash
        bg = "#2a2a4a" if is_selected else "#222"

        row = ctk.CTkFrame(
            self.card_list_frame, height=52, corner_radius=8,
            fg_color=bg, cursor="hand2",
        )
        row.pack(fill="x", pady=2)
        row.pack_propagate(False)

        icon = "🛡️" if card.has_backup else "💳"
        label = ctk.CTkLabel(
            row, text=f" {icon}  {card.label}",
            font=ctk.CTkFont(size=12), anchor="w",
        )
        label.pack(side="left", padx=8)

        hash_lbl = ctk.CTkLabel(
            row, text=f"…{card.card_hash[-8:]}",
            font=ctk.CTkFont(size=10), text_color="#666",
        )
        hash_lbl.pack(side="right", padx=8)

        for w in [row, label, hash_lbl]:
            w.bind("<Button-1>", lambda e, c=card: self._select_card(c))

    def _select_card(self, card: CardInfo):
        self.selected_card = card
        self.selected_card_label.configure(text=card.label)
        self._rebuild_card_list()
        self.backup_btn.configure(state="normal")
        self.restore_btn.configure(state="normal")
        self.remove_card_btn.configure(state="normal")
        self._update_apply_state()
        self._set_status(f"Selected: {card.label}")

    def _update_apply_state(self):
        can_apply = (
            self.selected_card is not None
            and self.processor.loaded
            and self.bridge.available
        )
        self.apply_btn.configure(state="normal" if can_apply else "disabled")

    # ── Image editor callbacks ────────────────────────────────────────────

    def _on_choose_image(self):
        filetypes = [
            ("Images", "*.png *.jpg *.jpeg *.webp *.bmp *.tiff"),
            ("PNG", "*.png"),
            ("JPEG", "*.jpg *.jpeg"),
            ("WebP", "*.webp"),
            ("All files", "*.*"),
        ]
        path = filedialog.askopenfilename(title="Choose Card Image", filetypes=filetypes)
        if path:
            try:
                self.processor.load(path)
                self.zoom_slider.set(1.0)
                self.zoom_label.configure(text="1.0×")
                self._update_preview()
                self._update_apply_state()

                info = self.processor.get_source_info()
                self.img_info_label.configure(text=f"📷 {info}")
                self._set_status(f"📷 Loaded: {info}")
            except Exception as e:
                self._set_status(f"❌ Failed to load image: {e}", "#c44")

    def _on_reset_crop(self):
        self.processor.offset_x = 0.5
        self.processor.offset_y = 0.5
        self.processor.zoom = 1.0
        self.zoom_slider.set(1.0)
        self.zoom_label.configure(text="1.0×")
        self._update_preview()

    def _on_zoom_change(self, value: float):
        self.processor.zoom = value
        self.zoom_label.configure(text=f"{value:.1f}×")
        self._update_preview()

    def _on_drag_start(self, event):
        self._drag_start = (event.x, event.y)

    def _on_drag(self, event):
        if not self._drag_start or not self.processor.loaded:
            return
        dx = event.x - self._drag_start[0]
        dy = event.y - self._drag_start[1]
        self._drag_start = (event.x, event.y)

        sensitivity = 0.003 / self.processor.zoom
        self.processor.offset_x = max(0, min(1, self.processor.offset_x - dx * sensitivity))
        self.processor.offset_y = max(0, min(1, self.processor.offset_y - dy * sensitivity))
        self._update_preview()

    def _on_drag_end(self, event):
        self._drag_start = None

    def _on_scroll_zoom(self, event):
        if not self.processor.loaded:
            return
        delta = event.delta / 1200
        new_zoom = max(1.0, min(3.0, self.processor.zoom + delta))
        self.processor.zoom = new_zoom
        self.zoom_slider.set(new_zoom)
        self.zoom_label.configure(text=f"{new_zoom:.1f}×")
        self._update_preview()

    # ── AirCard action callbacks ──────────────────────────────────────────

    def _on_apply_skin(self):
        if not self.selected_card or not self.processor.loaded:
            return

        card = self.selected_card

        if not card.has_backup:
            save_first = messagebox.askyesno(
                "Save Original First?",
                "You haven't saved the original card art yet.\n\n"
                "Save it now before applying? (Recommended!)\n\n"
                "Yes = Save original, then apply skin\n"
                "No = Apply skin without saving original",
            )
            if save_first:
                self._on_save_original(then_apply=True)
                return

        self._do_apply_skin(card)

    def _do_apply_skin(self, card: CardInfo):
        """Actually apply the skin."""
        self.apply_btn.configure(state="disabled", text="⏳ Applying…")
        self._set_status("⏳ Exporting image and flashing card…")

        def _do():
            try:
                TEMP_DIR.mkdir(parents=True, exist_ok=True)
                export_path = str(TEMP_DIR / f"card_{card.card_hash[-8:]}.png")
                self.processor.export(export_path)

                success, msg = self.bridge.flash(card.card_hash, export_path)

                if success:
                    card.custom_image_path = export_path
                    self.after(0, lambda: [
                        self._set_status("✅ Skin applied! Force-close Wallet and reopen it.", "#4a4"),
                        self.apply_btn.configure(state="normal", text="✨ Apply Skin"),
                        messagebox.showinfo(
                            "Success! 🎉",
                            "Card skin applied!\n\n"
                            "Now on your iPhone:\n"
                            "1. Open the App Switcher\n"
                            "   (swipe up from bottom)\n"
                            "2. Swipe Wallet away to close it\n"
                            "3. Reopen Wallet\n\n"
                            "Your new card image should appear!",
                        ),
                    ])
                else:
                    self.after(0, lambda: [
                        self._set_status(f"❌ Flash failed: {msg[:80]}", "#c44"),
                        self.apply_btn.configure(state="normal", text="✨ Apply Skin"),
                        messagebox.showerror(
                            "Flash Failed",
                            f"Could not apply skin:\n\n{msg}\n\n"
                            "Tips:\n"
                            "• Close iTunes / Apple Devices first\n"
                            "• Keep iPhone unlocked during flashing\n"
                            "• Try unplugging and reconnecting USB\n"
                            "• Check that Apple Mobile Device Service is running",
                        ),
                    ])
            except subprocess.TimeoutExpired:
                self.after(0, lambda: [
                    self._set_status("❌ Timeout — AirTraffic sync took too long.", "#c44"),
                    self.apply_btn.configure(state="normal", text="✨ Apply Skin"),
                    messagebox.showerror(
                        "Timeout",
                        "AirTraffic sync timed out.\n\n"
                        "Try:\n"
                        "• Close iTunes / Apple Devices\n"
                        "• Unplug & reconnect the iPhone\n"
                        "• Restart the Apple Mobile Device Service",
                    ),
                ])
            except Exception as e:
                self.after(0, lambda: [
                    self._set_status(f"❌ Error: {e}", "#c44"),
                    self.apply_btn.configure(state="normal", text="✨ Apply Skin"),
                ])

        threading.Thread(target=_do, daemon=True).start()

    def _on_save_original(self, then_apply: bool = False):
        if not self.selected_card:
            return

        card = self.selected_card
        self._set_status("💾 Saving original card artwork…")
        self.backup_btn.configure(state="disabled")

        def _do():
            try:
                success, msg = self.bridge.save_original(card.card_hash)
                if success:
                    card.has_backup = True
                    self.after(0, lambda: [
                        self._set_status(f"✅ Original saved for {card.label}", "#4a4"),
                        self.backup_btn.configure(state="normal"),
                        self._rebuild_card_list(),
                    ])
                    if then_apply:
                        self.after(500, lambda: self._do_apply_skin(card))
                else:
                    self.after(0, lambda: [
                        self._set_status(f"❌ Save failed: {msg[:80]}", "#c44"),
                        self.backup_btn.configure(state="normal"),
                    ])
            except Exception as e:
                self.after(0, lambda: [
                    self._set_status(f"❌ Error: {e}", "#c44"),
                    self.backup_btn.configure(state="normal"),
                ])

        threading.Thread(target=_do, daemon=True).start()

    def _on_restore_original(self):
        if not self.selected_card:
            return

        card = self.selected_card
        ok = messagebox.askyesno(
            "Restore Original",
            f"Restore the original artwork for {card.label}?\n\n"
            "After restoring, force-close and reopen Wallet.",
        )
        if not ok:
            return

        self._set_status("🔙 Restoring original…")
        self.restore_btn.configure(state="disabled")

        def _do():
            try:
                success, msg = self.bridge.restore_original(card.card_hash)
                if success:
                    self.after(0, lambda: [
                        self._set_status("✅ Original restored! Force-close Wallet to see it.", "#4a4"),
                        self.restore_btn.configure(state="normal"),
                    ])
                else:
                    self.after(0, lambda: [
                        self._set_status(f"❌ Restore failed: {msg[:80]}", "#c44"),
                        self.restore_btn.configure(state="normal"),
                    ])
            except Exception as e:
                self.after(0, lambda: [
                    self._set_status(f"❌ Error: {e}", "#c44"),
                    self.restore_btn.configure(state="normal"),
                ])

        threading.Thread(target=_do, daemon=True).start()

    # ── Status ────────────────────────────────────────────────────────────

    def _set_status(self, text: str, color: str = "#888"):
        self.status_label.configure(text=text, text_color=color)


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    app = WalletReskinApp()
    app.mainloop()


if __name__ == "__main__":
    main()
