"""
AIO Wallet Reskin Tool
──────────────────────
A modern Windows GUI for reskinning Apple Wallet cards via AirCard-Windows.
Wraps aircard.exe CLI and adds image editing, auto-detection, backup/restore.
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
from pathlib import Path
from tkinter import filedialog, messagebox
from typing import Optional

# ─── Constants ────────────────────────────────────────────────────────────────

CARD_WIDTH = 1536
CARD_HEIGHT = 969
CARD_ASPECT = CARD_WIDTH / CARD_HEIGHT  # ~1.585

PREVIEW_WIDTH = 480
PREVIEW_HEIGHT = int(PREVIEW_WIDTH / CARD_ASPECT)  # ~303

APP_NAME = "AIO Wallet Reskin"
APP_VERSION = "1.0.0"

# Paths
APP_DIR = Path(__file__).parent.resolve()
BACKUP_DIR = APP_DIR / "backups"
TEMP_DIR = APP_DIR / "temp"
AIRCARD_NAMES = ["aircard.exe", "AirCard.exe"]


# ─── AirCard Bridge ──────────────────────────────────────────────────────────

class AirCardBridge:
    """Communicates with aircard.exe CLI."""

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
                "aircard.exe not found. Download it from "
                "https://github.com/Lumid-Off/AirCard-Windows/releases "
                "and place it next to this app."
            )
        cmd = [str(self.exe_path)] + args
        return subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )

    def probe(self) -> dict:
        """Probe for connected iPhone. Returns device info dict."""
        result = self._run(["--probe"], timeout=15)
        if result.returncode != 0:
            return {"connected": False, "error": result.stderr.strip()}

        output = result.stdout.strip()
        # Parse probe output — format varies, try JSON first, then text
        try:
            data = json.loads(output)
            data["connected"] = True
            return data
        except (json.JSONDecodeError, ValueError):
            # Parse text output
            info = {"connected": True, "raw": output}
            for line in output.splitlines():
                line = line.strip()
                if ":" in line:
                    key, _, val = line.partition(":")
                    info[key.strip().lower().replace(" ", "_")] = val.strip()
            return info

    def scan_start(self) -> subprocess.Popen:
        """Start scanning for wallet cards (interactive — returns Popen)."""
        if not self.available:
            raise FileNotFoundError("aircard.exe not found.")
        cmd = [str(self.exe_path), "--scan"]
        return subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )

    def flash(self, card_hash: str, image_path: str) -> tuple[bool, str]:
        """Flash a card skin. Returns (success, message)."""
        result = self._run(
            ["--flash", card_hash, str(image_path)],
            timeout=120,
        )
        success = result.returncode == 0
        msg = result.stdout.strip() if success else result.stderr.strip()
        return success, msg or ("Card skin applied!" if success else "Flash failed.")

    def save_original(self, card_hash: str) -> tuple[bool, str]:
        """Save the original card artwork as backup."""
        result = self._run(["--save-original", card_hash], timeout=30)
        success = result.returncode == 0
        msg = result.stdout.strip() if success else result.stderr.strip()
        return success, msg or ("Original saved." if success else "Save failed.")

    def restore_original(self, card_hash: str) -> tuple[bool, str]:
        """Restore the original card artwork."""
        result = self._run(["--restore-original", card_hash], timeout=30)
        success = result.returncode == 0
        msg = result.stdout.strip() if success else result.stderr.strip()
        return success, msg or ("Original restored." if success else "Restore failed.")


# ─── Image Processor ─────────────────────────────────────────────────────────

class ImageProcessor:
    """Handles loading, cropping, and exporting card images."""

    def __init__(self):
        self.source_image: Optional[Image.Image] = None
        self.offset_x: float = 0.5  # 0..1, center of crop
        self.offset_y: float = 0.5
        self.zoom: float = 1.0  # 1.0 = fit, >1 = zoom in

    def load(self, path: str):
        """Load an image from disk."""
        self.source_image = Image.open(path).convert("RGBA")
        self.offset_x = 0.5
        self.offset_y = 0.5
        self.zoom = 1.0

    @property
    def loaded(self) -> bool:
        return self.source_image is not None

    def get_cropped(self, width: int = CARD_WIDTH, height: int = CARD_HEIGHT) -> Image.Image:
        """Return the image cropped and scaled to card dimensions."""
        if not self.source_image:
            raise ValueError("No image loaded.")

        src = self.source_image
        src_w, src_h = src.size
        target_aspect = width / height

        # Calculate the crop region based on zoom and offset
        if src_w / src_h > target_aspect:
            # Source is wider — crop horizontally
            fit_h = src_h
            fit_w = int(fit_h * target_aspect)
        else:
            # Source is taller — crop vertically
            fit_w = src_w
            fit_h = int(fit_w / target_aspect)

        # Apply zoom (zoom > 1 means we take a smaller region)
        crop_w = int(fit_w / self.zoom)
        crop_h = int(fit_h / self.zoom)
        crop_w = min(crop_w, src_w)
        crop_h = min(crop_h, src_h)

        # Apply offset (0.5 = center)
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
        """Export the final card image as PNG."""
        final = self.get_cropped()
        # Convert to RGB (no alpha for card artwork)
        if final.mode == "RGBA":
            bg = Image.new("RGB", final.size, (0, 0, 0))
            bg.paste(final, mask=final.split()[3])
            final = bg
        final.save(output_path, "PNG", optimize=True)


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
        self.scan_process: Optional[subprocess.Popen] = None
        self._drag_start = None

        # ── Build UI ──
        self._build_ui()

        # ── Initial checks ──
        self.after(500, self._check_aircard)
        self.after(1000, self._auto_probe)

        # ── Poll for device every 5 seconds ──
        self._poll_device()

    # ── UI Construction ───────────────────────────────────────────────────

    def _build_ui(self):
        """Build the complete UI layout."""
        # Top bar
        self._build_top_bar()

        # Main content area (two panels)
        self.main_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.main_frame.pack(fill="both", expand=True, padx=16, pady=(0, 16))
        self.main_frame.grid_columnconfigure(0, weight=1, minsize=280)
        self.main_frame.grid_columnconfigure(1, weight=2, minsize=400)
        self.main_frame.grid_rowconfigure(0, weight=1)

        # Left panel — device & cards
        self._build_left_panel()

        # Right panel — image editor & preview
        self._build_right_panel()

        # Bottom status bar
        self._build_status_bar()

    def _build_top_bar(self):
        """Top bar with title, device status, and settings."""
        bar = ctk.CTkFrame(self, height=56, corner_radius=0)
        bar.pack(fill="x", padx=0, pady=0)
        bar.pack_propagate(False)

        # App title
        title = ctk.CTkLabel(
            bar, text=f"💳  {APP_NAME}",
            font=ctk.CTkFont(size=18, weight="bold"),
        )
        title.pack(side="left", padx=20)

        # Device indicator
        self.device_indicator = ctk.CTkLabel(
            bar, text="⚪  No device",
            font=ctk.CTkFont(size=13),
            text_color="#888",
        )
        self.device_indicator.pack(side="left", padx=20)

        # Version
        ver = ctk.CTkLabel(
            bar, text=f"v{APP_VERSION}",
            font=ctk.CTkFont(size=11),
            text_color="#555",
        )
        ver.pack(side="right", padx=20)

    def _build_left_panel(self):
        """Left panel: device info + card list."""
        left = ctk.CTkFrame(self.main_frame, corner_radius=12)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 8), pady=0)

        # ── Device section ──
        dev_label = ctk.CTkLabel(
            left, text="📱 Device",
            font=ctk.CTkFont(size=14, weight="bold"),
            anchor="w",
        )
        dev_label.pack(fill="x", padx=16, pady=(16, 4))

        self.device_name_label = ctk.CTkLabel(
            left, text="Not connected",
            font=ctk.CTkFont(size=12),
            text_color="#aaa",
            anchor="w",
        )
        self.device_name_label.pack(fill="x", padx=16, pady=(0, 4))

        self.ios_version_label = ctk.CTkLabel(
            left, text="",
            font=ctk.CTkFont(size=11),
            text_color="#777",
            anchor="w",
        )
        self.ios_version_label.pack(fill="x", padx=16, pady=(0, 8))

        # Refresh button
        self.refresh_btn = ctk.CTkButton(
            left, text="🔄 Refresh Device",
            command=self._on_refresh_device,
            height=32,
            font=ctk.CTkFont(size=12),
        )
        self.refresh_btn.pack(fill="x", padx=16, pady=(0, 12))

        # Separator
        sep = ctk.CTkFrame(left, height=1, fg_color="#333")
        sep.pack(fill="x", padx=16, pady=4)

        # ── Cards section ──
        cards_header = ctk.CTkFrame(left, fg_color="transparent")
        cards_header.pack(fill="x", padx=16, pady=(12, 4))

        cards_label = ctk.CTkLabel(
            cards_header, text="💳 Wallet Cards",
            font=ctk.CTkFont(size=14, weight="bold"),
            anchor="w",
        )
        cards_label.pack(side="left")

        self.scan_btn = ctk.CTkButton(
            cards_header, text="Scan",
            command=self._on_scan_cards,
            width=70, height=28,
            font=ctk.CTkFont(size=11),
        )
        self.scan_btn.pack(side="right")

        # Scan instructions
        self.scan_hint = ctk.CTkLabel(
            left,
            text="Tap 'Scan', then open Wallet\non your iPhone and tap a card.",
            font=ctk.CTkFont(size=11),
            text_color="#666",
            anchor="w",
            justify="left",
        )
        self.scan_hint.pack(fill="x", padx=16, pady=(4, 8))

        # Card list (scrollable)
        self.card_list_frame = ctk.CTkScrollableFrame(
            left, fg_color="transparent", corner_radius=8,
        )
        self.card_list_frame.pack(fill="both", expand=True, padx=12, pady=(0, 12))

        # Placeholder when no cards
        self.no_cards_label = ctk.CTkLabel(
            self.card_list_frame,
            text="No cards scanned yet.\nConnect your iPhone and tap Scan.",
            font=ctk.CTkFont(size=11),
            text_color="#555",
            justify="center",
        )
        self.no_cards_label.pack(pady=40)

    def _build_right_panel(self):
        """Right panel: image editor with card preview."""
        right = ctk.CTkFrame(self.main_frame, corner_radius=12)
        right.grid(row=0, column=1, sticky="nsew", padx=(8, 0), pady=0)

        # ── Header ──
        header = ctk.CTkFrame(right, fg_color="transparent")
        header.pack(fill="x", padx=20, pady=(16, 8))

        self.editor_title = ctk.CTkLabel(
            header, text="🎨 Card Editor",
            font=ctk.CTkFont(size=14, weight="bold"),
            anchor="w",
        )
        self.editor_title.pack(side="left")

        self.selected_card_label = ctk.CTkLabel(
            header, text="No card selected",
            font=ctk.CTkFont(size=12),
            text_color="#888",
        )
        self.selected_card_label.pack(side="right")

        # ── Card preview canvas ──
        self.preview_frame = ctk.CTkFrame(
            right, width=PREVIEW_WIDTH + 32, height=PREVIEW_HEIGHT + 32,
            corner_radius=16, fg_color="#1a1a1a",
        )
        self.preview_frame.pack(padx=20, pady=8)
        self.preview_frame.pack_propagate(False)

        # The actual preview label (shows the card image)
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

        # ── Controls under preview ──
        controls = ctk.CTkFrame(right, fg_color="transparent")
        controls.pack(fill="x", padx=20, pady=(4, 8))

        # Zoom slider
        zoom_frame = ctk.CTkFrame(controls, fg_color="transparent")
        zoom_frame.pack(fill="x", pady=4)

        ctk.CTkLabel(
            zoom_frame, text="🔍 Zoom",
            font=ctk.CTkFont(size=11), text_color="#888",
        ).pack(side="left")

        self.zoom_slider = ctk.CTkSlider(
            zoom_frame, from_=1.0, to=3.0,
            command=self._on_zoom_change,
            width=200,
        )
        self.zoom_slider.set(1.0)
        self.zoom_slider.pack(side="left", padx=12)

        self.zoom_label = ctk.CTkLabel(
            zoom_frame, text="1.0×",
            font=ctk.CTkFont(size=11), text_color="#888",
            width=40,
        )
        self.zoom_label.pack(side="left")

        # Buttons row
        btn_frame = ctk.CTkFrame(controls, fg_color="transparent")
        btn_frame.pack(fill="x", pady=8)

        self.choose_img_btn = ctk.CTkButton(
            btn_frame, text="📁 Choose Image",
            command=self._on_choose_image,
            height=36, font=ctk.CTkFont(size=13),
        )
        self.choose_img_btn.pack(side="left", padx=(0, 8))

        self.reset_crop_btn = ctk.CTkButton(
            btn_frame, text="↺ Reset Crop",
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
            fg_color="#333", hover_color="#444",
            state="disabled",
        )
        self.backup_btn.pack(side="left", expand=True, fill="x", padx=(0, 4))

        self.restore_btn = ctk.CTkButton(
            restore_frame, text="🔙 Restore Original",
            command=self._on_restore_original,
            height=34, font=ctk.CTkFont(size=12),
            fg_color="#333", hover_color="#444",
            state="disabled",
        )
        self.restore_btn.pack(side="left", expand=True, fill="x", padx=(4, 0))

        # ── Info text ──
        info = ctk.CTkLabel(
            right,
            text="Drag the image to position · Scroll to zoom · 1536 × 969 px output",
            font=ctk.CTkFont(size=10),
            text_color="#555",
        )
        info.pack(pady=(0, 12))

    def _build_status_bar(self):
        """Bottom status bar."""
        bar = ctk.CTkFrame(self, height=28, corner_radius=0, fg_color="#1a1a1a")
        bar.pack(fill="x", side="bottom")
        bar.pack_propagate(False)

        self.status_label = ctk.CTkLabel(
            bar, text="Ready — connect your iPhone via USB",
            font=ctk.CTkFont(size=11),
            text_color="#666",
        )
        self.status_label.pack(side="left", padx=16)

        self.aircard_status = ctk.CTkLabel(
            bar,
            text="",
            font=ctk.CTkFont(size=11),
            text_color="#666",
        )
        self.aircard_status.pack(side="right", padx=16)

    # ── Preview helpers ───────────────────────────────────────────────────

    def _show_empty_preview(self):
        """Show an empty card placeholder."""
        img = Image.new("RGB", (PREVIEW_WIDTH, PREVIEW_HEIGHT), "#2a2a2e")
        draw = ImageDraw.Draw(img)

        # Card outline
        draw.rounded_rectangle(
            [4, 4, PREVIEW_WIDTH - 5, PREVIEW_HEIGHT - 5],
            radius=18, outline="#444", width=2,
        )

        # Center text
        text = "Drop an image here\nor click Choose Image"
        bbox = draw.textbbox((0, 0), text, font=None)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
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
        # Convert RGBA to RGB for display
        if preview.mode == "RGBA":
            bg = Image.new("RGB", preview.size, "#1a1a1a")
            bg.paste(preview, mask=preview.split()[3])
            preview = bg

        # Add rounded corners overlay
        mask = Image.new("L", preview.size, 0)
        draw = ImageDraw.Draw(mask)
        draw.rounded_rectangle([0, 0, preview.width - 1, preview.height - 1], radius=16, fill=255)

        result = Image.new("RGB", preview.size, "#1a1a1a")
        result.paste(preview, mask=mask)

        # Add subtle border
        draw2 = ImageDraw.Draw(result)
        draw2.rounded_rectangle(
            [0, 0, result.width - 1, result.height - 1],
            radius=16, outline="#444", width=1,
        )

        self._set_preview_image(result)

    def _set_preview_image(self, pil_image: Image.Image):
        """Set the preview label to show a PIL image."""
        photo = ImageTk.PhotoImage(pil_image)
        self.preview_label.configure(image=photo, text="")
        self.preview_label._photo = photo  # prevent GC

    # ── Device & Card callbacks ───────────────────────────────────────────

    def _check_aircard(self):
        """Check if aircard.exe is available."""
        if self.bridge.available:
            self.aircard_status.configure(
                text=f"✅ aircard.exe found: {self.bridge.exe_path.name}",
                text_color="#4a4",
            )
        else:
            self.aircard_status.configure(
                text="❌ aircard.exe not found — place it next to this app",
                text_color="#c44",
            )
            self._set_status("⚠️ aircard.exe not found. Download from GitHub and place it here.", "#c44")

    def _auto_probe(self):
        """Try to detect the device on startup."""
        self._on_refresh_device()

    def _poll_device(self):
        """Periodically check for device connection."""
        if not self.device_info.get("connected"):
            threading.Thread(target=self._probe_device_bg, daemon=True).start()
        self.after(5000, self._poll_device)

    def _probe_device_bg(self):
        """Background device probe."""
        if not self.bridge.available:
            return
        try:
            info = self.bridge.probe()
            self.after(0, lambda: self._update_device_ui(info))
        except Exception:
            pass

    def _on_refresh_device(self):
        """Manual device refresh."""
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
        """Update the device info in the UI."""
        self.device_info = info

        if info.get("connected"):
            name = info.get("device_name", info.get("name", "iPhone"))
            ios = info.get("ios_version", info.get("product_version", ""))
            udid_short = info.get("udid", "")[:8]

            self.device_indicator.configure(
                text=f"🟢  {name}", text_color="#4a4",
            )
            self.device_name_label.configure(
                text=name, text_color="#ddd",
            )
            version_text = f"iOS {ios}" if ios else ""
            if udid_short:
                version_text += f"  •  {udid_short}…"
            self.ios_version_label.configure(text=version_text)

            self._set_status(f"✅ Connected: {name}" + (f" (iOS {ios})" if ios else ""))
            self.scan_btn.configure(state="normal")
        else:
            self.device_indicator.configure(
                text="⚪  No device", text_color="#888",
            )
            self.device_name_label.configure(
                text="Not connected", text_color="#aaa",
            )
            self.ios_version_label.configure(text="")
            error = info.get("error", "")
            self._set_status(
                f"No iPhone detected. {error}" if error
                else "No iPhone detected — connect via USB and trust the computer."
            )

    def _on_scan_cards(self):
        """Start scanning for Wallet cards."""
        if not self.bridge.available:
            return

        # For now, simulate with a manual hash entry since the scan CLI
        # is interactive. In a real setup, we'd parse the scan output.
        dialog = ctk.CTkInputDialog(
            text=(
                "AirCard scan is interactive:\n\n"
                "1. Open a terminal and run:\n"
                "   aircard.exe --scan\n\n"
                "2. On your iPhone, open Wallet\n"
                "   and tap the card.\n\n"
                "3. Copy the card hash from the\n"
                "   terminal output and paste it here:"
            ),
            title="Enter Card Hash",
        )
        card_hash = dialog.get_input()

        if card_hash and card_hash.strip():
            card_hash = card_hash.strip()
            # Check for duplicates
            for c in self.cards:
                if c.card_hash == card_hash:
                    self._set_status(f"Card {card_hash[-6:]} already in list.")
                    return

            card = CardInfo(card_hash)
            self.cards.append(card)
            self._rebuild_card_list()
            self._select_card(card)
            self._set_status(f"✅ Card added: …{card_hash[-6:]}")

    def _rebuild_card_list(self):
        """Rebuild the card list UI."""
        # Clear existing
        for widget in self.card_list_frame.winfo_children():
            widget.destroy()

        if not self.cards:
            self.no_cards_label = ctk.CTkLabel(
                self.card_list_frame,
                text="No cards scanned yet.",
                font=ctk.CTkFont(size=11),
                text_color="#555",
            )
            self.no_cards_label.pack(pady=40)
            return

        for card in self.cards:
            self._create_card_row(card)

    def _create_card_row(self, card: CardInfo):
        """Create a row widget for a card."""
        is_selected = self.selected_card and self.selected_card.card_hash == card.card_hash
        bg = "#2a2a4a" if is_selected else "#222"

        row = ctk.CTkFrame(
            self.card_list_frame, height=52, corner_radius=8,
            fg_color=bg, cursor="hand2",
        )
        row.pack(fill="x", pady=2)
        row.pack_propagate(False)

        icon = "💳"
        if card.has_backup:
            icon = "🛡️"

        label = ctk.CTkLabel(
            row, text=f" {icon}  {card.label}",
            font=ctk.CTkFont(size=12),
            anchor="w",
        )
        label.pack(side="left", padx=8)

        hash_label = ctk.CTkLabel(
            row, text=f"…{card.card_hash[-8:]}",
            font=ctk.CTkFont(size=10),
            text_color="#666",
        )
        hash_label.pack(side="right", padx=8)

        # Bind click
        for widget in [row, label, hash_label]:
            widget.bind("<Button-1>", lambda e, c=card: self._select_card(c))

    def _select_card(self, card: CardInfo):
        """Select a card for editing."""
        self.selected_card = card
        self.selected_card_label.configure(text=card.label)
        self._rebuild_card_list()

        # Enable action buttons
        self.backup_btn.configure(state="normal")
        self.restore_btn.configure(state="normal")
        self._update_apply_state()

        self._set_status(f"Selected: {card.label}")

    def _update_apply_state(self):
        """Enable/disable the Apply button based on state."""
        can_apply = (
            self.selected_card is not None
            and self.processor.loaded
            and self.bridge.available
        )
        self.apply_btn.configure(state="normal" if can_apply else "disabled")

    # ── Image editor callbacks ────────────────────────────────────────────

    def _on_choose_image(self):
        """Open file dialog to choose an image."""
        filetypes = [
            ("Images", "*.png *.jpg *.jpeg *.webp *.bmp *.tiff"),
            ("PNG", "*.png"),
            ("JPEG", "*.jpg *.jpeg"),
            ("WebP", "*.webp"),
            ("All files", "*.*"),
        ]
        path = filedialog.askopenfilename(
            title="Choose Card Image",
            filetypes=filetypes,
        )
        if path:
            try:
                self.processor.load(path)
                self.zoom_slider.set(1.0)
                self.zoom_label.configure(text="1.0×")
                self._update_preview()
                self._update_apply_state()

                w, h = self.processor.source_image.size
                self._set_status(f"📷 Loaded: {Path(path).name} ({w}×{h})")
            except Exception as e:
                self._set_status(f"❌ Failed to load image: {e}", "#c44")

    def _on_reset_crop(self):
        """Reset crop position and zoom."""
        self.processor.offset_x = 0.5
        self.processor.offset_y = 0.5
        self.processor.zoom = 1.0
        self.zoom_slider.set(1.0)
        self.zoom_label.configure(text="1.0×")
        self._update_preview()

    def _on_zoom_change(self, value: float):
        """Handle zoom slider change."""
        self.processor.zoom = value
        self.zoom_label.configure(text=f"{value:.1f}×")
        self._update_preview()

    def _on_drag_start(self, event):
        """Start dragging to pan the image."""
        self._drag_start = (event.x, event.y)

    def _on_drag(self, event):
        """Handle drag to pan the cropped region."""
        if not self._drag_start or not self.processor.loaded:
            return

        dx = event.x - self._drag_start[0]
        dy = event.y - self._drag_start[1]
        self._drag_start = (event.x, event.y)

        # Convert pixel drag to offset change (inverted: drag right = move crop left)
        sensitivity = 0.003 / self.processor.zoom
        self.processor.offset_x = max(0, min(1, self.processor.offset_x - dx * sensitivity))
        self.processor.offset_y = max(0, min(1, self.processor.offset_y - dy * sensitivity))

        self._update_preview()

    def _on_drag_end(self, event):
        """End drag."""
        self._drag_start = None

    def _on_scroll_zoom(self, event):
        """Handle mouse wheel for zooming."""
        if not self.processor.loaded:
            return

        delta = event.delta / 1200  # Small increments
        new_zoom = max(1.0, min(3.0, self.processor.zoom + delta))
        self.processor.zoom = new_zoom
        self.zoom_slider.set(new_zoom)
        self.zoom_label.configure(text=f"{new_zoom:.1f}×")
        self._update_preview()

    # ── AirCard action callbacks ──────────────────────────────────────────

    def _on_apply_skin(self):
        """Apply the current image to the selected card."""
        if not self.selected_card or not self.processor.loaded:
            return

        card = self.selected_card

        # Confirm
        ok = messagebox.askyesno(
            "Apply Card Skin",
            f"Apply this image to card …{card.card_hash[-6:]}?\n\n"
            "Make sure you've saved the original first!\n"
            "After applying, force-close Wallet and reopen it.",
        )
        if not ok:
            return

        self.apply_btn.configure(state="disabled", text="⏳ Applying…")
        self._set_status("⏳ Exporting image and flashing card…")

        def _do_apply():
            try:
                # Export the cropped image
                TEMP_DIR.mkdir(parents=True, exist_ok=True)
                export_path = str(TEMP_DIR / f"card_{card.card_hash[-8:]}.png")
                self.processor.export(export_path)

                # Flash via AirCard
                success, msg = self.bridge.flash(card.card_hash, export_path)

                if success:
                    card.custom_image_path = export_path
                    self.after(0, lambda: [
                        self._set_status(f"✅ Skin applied! Now force-close Wallet and reopen it.", "#4a4"),
                        self.apply_btn.configure(state="normal", text="✨ Apply Skin"),
                        messagebox.showinfo(
                            "Success!",
                            "Card skin applied! 🎉\n\n"
                            "Now on your iPhone:\n"
                            "1. Open the App Switcher\n"
                            "2. Swipe Wallet away (force-close)\n"
                            "3. Reopen Wallet\n\n"
                            "Your new card image should appear!",
                        ),
                    ])
                else:
                    self.after(0, lambda: [
                        self._set_status(f"❌ Flash failed: {msg}", "#c44"),
                        self.apply_btn.configure(state="normal", text="✨ Apply Skin"),
                        messagebox.showerror("Flash Failed", f"Could not apply skin:\n\n{msg}"),
                    ])
            except Exception as e:
                self.after(0, lambda: [
                    self._set_status(f"❌ Error: {e}", "#c44"),
                    self.apply_btn.configure(state="normal", text="✨ Apply Skin"),
                ])

        threading.Thread(target=_do_apply, daemon=True).start()

    def _on_save_original(self):
        """Save the original card artwork."""
        if not self.selected_card:
            return

        card = self.selected_card
        self._set_status("💾 Saving original card artwork…")
        self.backup_btn.configure(state="disabled")

        def _do_save():
            try:
                success, msg = self.bridge.save_original(card.card_hash)
                if success:
                    card.has_backup = True
                    self.after(0, lambda: [
                        self._set_status(f"✅ Original saved for …{card.card_hash[-6:]}", "#4a4"),
                        self.backup_btn.configure(state="normal"),
                        self._rebuild_card_list(),
                    ])
                else:
                    self.after(0, lambda: [
                        self._set_status(f"❌ Save failed: {msg}", "#c44"),
                        self.backup_btn.configure(state="normal"),
                    ])
            except Exception as e:
                self.after(0, lambda: [
                    self._set_status(f"❌ Error: {e}", "#c44"),
                    self.backup_btn.configure(state="normal"),
                ])

        threading.Thread(target=_do_save, daemon=True).start()

    def _on_restore_original(self):
        """Restore the original card artwork."""
        if not self.selected_card:
            return

        card = self.selected_card
        ok = messagebox.askyesno(
            "Restore Original",
            f"Restore the original artwork for card …{card.card_hash[-6:]}?",
        )
        if not ok:
            return

        self._set_status("🔙 Restoring original…")
        self.restore_btn.configure(state="disabled")

        def _do_restore():
            try:
                success, msg = self.bridge.restore_original(card.card_hash)
                if success:
                    self.after(0, lambda: [
                        self._set_status(f"✅ Original restored! Force-close Wallet to see it.", "#4a4"),
                        self.restore_btn.configure(state="normal"),
                    ])
                else:
                    self.after(0, lambda: [
                        self._set_status(f"❌ Restore failed: {msg}", "#c44"),
                        self.restore_btn.configure(state="normal"),
                    ])
            except Exception as e:
                self.after(0, lambda: [
                    self._set_status(f"❌ Error: {e}", "#c44"),
                    self.restore_btn.configure(state="normal"),
                ])

        threading.Thread(target=_do_restore, daemon=True).start()

    # ── Status helper ─────────────────────────────────────────────────────

    def _set_status(self, text: str, color: str = "#888"):
        """Update the status bar."""
        self.status_label.configure(text=text, text_color=color)


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    app = WalletReskinApp()
    app.mainloop()


if __name__ == "__main__":
    main()
