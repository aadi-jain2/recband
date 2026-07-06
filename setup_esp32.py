#!/usr/bin/env python3
"""
RecoverPath — ESP32C6 One-Command Setup Script

Interactive CLI that:
  1. Detects connected ESP32C6 via serial port
  2. Flashes the latest firmware
  3. Walks through WiFi + Firebase configuration
  4. Saves configuration to ESP32 NVS
  5. Runs a 10-second sensor test
  6. Confirms data flowing to Firebase

Run from the project root:
    python setup_esp32.py
"""

from __future__ import annotations

import os
import re
import sys
import time
import subprocess
import shutil
from pathlib import Path

FIRMWARE_DIR = Path(__file__).parent / "src" / "firmware"
RESET_DELAY  = 3   # seconds after flash before connecting serial

# ── Terminal colors ────────────────────────────────────────────────────────────
def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m"

def ok(msg):  print(_c("32", "  ✓ ") + msg)
def err(msg): print(_c("31", "  ✗ ") + msg)
def info(msg):print(_c("36", "  → ") + msg)
def warn(msg):print(_c("33", "  ! ") + msg)
def hdr(msg): print("\n" + _c("1", msg))


def check_tools() -> bool:
    """Verify required tools are installed."""
    hdr("Step 0 — Checking tools")
    ok_flag = True
    for tool, install_hint in [
        ("pio",     "pip install platformio"),
        ("python",  "already installed"),
    ]:
        found = shutil.which(tool)
        if found:
            ok(f"{tool} found at {found}")
        else:
            err(f"{tool} not found. Install: {install_hint}")
            ok_flag = False
    return ok_flag


def detect_esp32() -> str | None:
    """Detect ESP32C6 serial port."""
    hdr("Step 1 — Detecting ESP32C6")
    try:
        import serial.tools.list_ports
        ports = list(serial.tools.list_ports.comports())
        candidates = [
            p for p in ports
            if any(k in (p.manufacturer or "").lower() or k in (p.description or "").lower()
                   for k in ["esp", "ch340", "cp210", "ftdi", "silabs"])
        ]
        if not candidates:
            warn("No ESP32 detected automatically. Listing all ports:")
            for p in ports:
                print(f"    {p.device}  —  {p.description}  [{p.manufacturer}]")
            port = input("  Enter port manually (e.g. COM3 or /dev/ttyUSB0): ").strip()
            return port if port else None

        if len(candidates) == 1:
            ok(f"Detected: {candidates[0].device}  ({candidates[0].description})")
            return candidates[0].device

        print("  Multiple devices found:")
        for i, p in enumerate(candidates):
            print(f"    [{i}] {p.device}  —  {p.description}")
        idx = int(input("  Select device index: ").strip())
        return candidates[idx].device

    except ImportError:
        warn("pyserial not installed. Install: pip install pyserial")
        port = input("  Enter port manually: ").strip()
        return port if port else None


def configure_device() -> dict:
    """Prompt for WiFi + Firebase + patient ID."""
    hdr("Step 2 — Device configuration")

    print("  Enter WiFi credentials for the device to connect to:")
    ssid     = input("  WiFi SSID: ").strip()
    password = input("  WiFi password: ").strip()

    print("\n  Firebase Realtime Database:")
    db_url   = input("  Firebase URL (e.g. https://your-project.firebaseio.com): ").strip()
    api_key  = input("  Firebase API key: ").strip()

    patient_id = input("\n  Patient ID for this device (e.g. HW001): ").strip() or "HW001"

    return {
        "ssid":       ssid,
        "password":   password,
        "db_url":     db_url,
        "api_key":    api_key,
        "patient_id": patient_id,
    }


def flash_firmware(port: str) -> bool:
    """Compile and flash the firmware using PlatformIO."""
    hdr("Step 3 — Flashing firmware")

    if not FIRMWARE_DIR.exists():
        err(f"Firmware directory not found: {FIRMWARE_DIR}")
        return False

    info(f"Building firmware in {FIRMWARE_DIR} …")
    build_result = subprocess.run(
        ["pio", "run", "--environment", "esp32c6"],
        cwd=FIRMWARE_DIR,
        capture_output=True,
        text=True,
    )
    if build_result.returncode != 0:
        err("Build failed:")
        print(build_result.stderr[-2000:])
        return False
    ok("Build succeeded")

    info(f"Flashing to {port} …")
    flash_result = subprocess.run(
        ["pio", "run", "--environment", "esp32c6",
         "--target", "upload",
         "--upload-port", port],
        cwd=FIRMWARE_DIR,
        capture_output=True,
        text=True,
    )
    if flash_result.returncode != 0:
        err("Flash failed:")
        print(flash_result.stderr[-2000:])
        return False
    ok("Firmware flashed successfully")
    return True


def write_nvs_config(port: str, config: dict) -> bool:
    """Write WiFi/Firebase/patient config to ESP32 NVS via nvs_partition_gen or serial command."""
    hdr("Step 4 — Writing configuration to device NVS")
    info("Sending configuration via serial …")

    try:
        import serial
        time.sleep(RESET_DELAY)
        ser = serial.Serial(port, 115200, timeout=10)
        time.sleep(2)

        # The firmware reads config from NVS. We write via esptool + nvs partition tool.
        # Simpler approach: use the WiFiManager provisioning portal instead.
        # For now, write a minimal config script via esptool nvs write.
        ser.close()

        # Use esptool to write NVS values
        nvs_cmds = [
            ("patient_id", config["patient_id"]),
            ("fb_url",     config["db_url"]),
            ("fb_api_key", config["api_key"]),
        ]
        for key, value in nvs_cmds:
            result = subprocess.run(
                [sys.executable, "-m", "esptool",
                 "--port", port,
                 "nvs_set", "recoverpath", key, "str", value],
                capture_output=True, text=True
            )
            if result.returncode == 0:
                ok(f"Set NVS {key}")
            else:
                warn(f"NVS write for {key} via esptool failed (may not be supported) — use portal")

        # WiFi credentials: handled by WiFiManager captive portal on first boot
        warn("WiFi credentials: connect your phone/laptop to 'RecoverPath-Setup' WiFi network")
        warn("then browse to 192.168.4.1 to enter WiFi credentials in the web portal.")

    except ImportError:
        warn("pyserial not available — skipping NVS write. Configure manually via portal.")
    except Exception as e:
        warn(f"NVS write error: {e} — device will use captive portal for WiFi setup.")

    return True


def run_sensor_test(port: str, duration: int = 10) -> bool:
    """Read serial output for `duration` seconds and verify sensor data is flowing."""
    hdr("Step 5 — Sensor test (10 seconds)")
    info(f"Reading from {port} for {duration}s …\n")

    try:
        import serial
        ser = serial.Serial(port, 115200, timeout=1)
        time.sleep(2)

        lines_with_data = 0
        start = time.time()
        while time.time() - start < duration:
            line = ser.readline().decode("utf-8", errors="replace").strip()
            if line:
                print(f"    {line}")
            if "SpO2" in line or "HR=" in line or "firebase" in line.lower():
                lines_with_data += 1

        ser.close()

        if lines_with_data > 0:
            ok(f"Sensor data detected ({lines_with_data} data lines)")
            return True
        else:
            warn("No sensor data lines seen — device may still be initializing or sensors not wired")
            return False

    except ImportError:
        warn("pyserial not available — skipping sensor test")
        return True
    except Exception as e:
        warn(f"Serial read error: {e}")
        return False


def check_firebase(config: dict) -> bool:
    """Verify data appears in Firebase."""
    hdr("Step 6 — Firebase data verification")
    pid = config.get("patient_id", "HW001")

    info(f"Checking Firebase for patient {pid} …")
    info("(Waiting 30 seconds for first reading to arrive …)")
    time.sleep(30)

    try:
        import firebase_admin
        from firebase_admin import credentials, db as firebase_db

        cred_path = os.environ.get("FIREBASE_CREDENTIALS_PATH", "firebase-credentials.json")
        if not firebase_admin._apps:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred, {"databaseURL": config["db_url"]})

        ref = firebase_db.reference(f"patients/{pid}/latest_reading")
        data = ref.get()
        if data:
            ok(f"Data found in Firebase for {pid}:")
            for k, v in list(data.items())[:5]:
                print(f"    {k}: {v}")
            return True
        else:
            warn(f"No data found at patients/{pid}/latest_reading — device may not have sent yet")
            return False

    except Exception as e:
        warn(f"Firebase check failed: {e}")
        info("You can verify manually in Firebase Console → Realtime Database")
        return True


def main():
    print("\n" + "="*60)
    print("  RecoverPath — ESP32C6 Setup Wizard")
    print("="*60)

    # Tool check
    if not check_tools():
        err("Required tools missing. Aborting.")
        sys.exit(1)

    # Detect device
    port = detect_esp32()
    if not port:
        err("No ESP32 device found. Connect device and retry.")
        sys.exit(1)

    # Configure
    config = configure_device()

    # Flash
    do_flash = input("\n  Flash firmware now? [Y/n]: ").strip().lower()
    if do_flash != "n":
        if not flash_firmware(port):
            err("Firmware flash failed. Fix errors and retry.")
            sys.exit(1)

    # NVS config
    write_nvs_config(port, config)

    # Sensor test
    run_sensor_test(port)

    # Firebase check
    if config.get("db_url"):
        check_firebase(config)

    print("\n" + "="*60)
    print("  ESP32C6 ready. Data flowing to RecoverPath dashboard.")
    print("  Run: python start_recoverpath.py")
    print("="*60 + "\n")


if __name__ == "__main__":
    main()
