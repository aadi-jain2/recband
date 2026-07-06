#!/usr/bin/env python3
"""
RecoverPath — Single-command orchestrator

Detects ESP32C6 hardware → uses real sensor data (HARDWARE mode).
Falls back to simulator → uses synthetic data (SIMULATOR mode).

Usage:
    python start_recoverpath.py [--dry-run] [--no-browser]
"""

from __future__ import annotations

import argparse
import os
import platform
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT         = Path(__file__).parent
DASHBOARD    = ROOT / "dashboard"
SRC          = ROOT / "src"
LOG_DIR      = ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)

# ── Terminal colors ────────────────────────────────────────────────────────────
def _c(code, text): return f"\033[{code}m{text}\033[0m"
def ok(m):   print(_c("32", "  ✓ ") + m)
def err(m):  print(_c("31", "  ✗ ") + m)
def info(m): print(_c("36", "  → ") + m)
def warn(m): print(_c("33", "  ! ") + m)
def hdr(m):  print("\n" + _c("1;36", m))


# ── ESP32C6 detection ──────────────────────────────────────────────────────────
def detect_hardware() -> str | None:
    """Return serial port of a connected ESP32C6, or None."""
    try:
        import serial.tools.list_ports
        ports = list(serial.tools.list_ports.comports())
        for p in ports:
            desc = (p.description or "").lower()
            mfr  = (p.manufacturer or "").lower()
            if any(k in desc + mfr for k in ["esp", "ch340", "cp210", "ftdi", "silabs"]):
                return p.device
        return None
    except ImportError:
        return None


# ── Process management ─────────────────────────────────────────────────────────
_procs: list[subprocess.Popen] = []

def _start(cmd: list[str], name: str, cwd: Path | None = None, log_file: str | None = None) -> subprocess.Popen:
    """Start a background subprocess, log output to file."""
    log_path = LOG_DIR / f"{log_file or name}.log" if log_file is not False else None
    fout = open(log_path, "w") if log_path else None  # noqa: SIM115
    proc = subprocess.Popen(
        cmd,
        cwd=cwd or ROOT,
        stdout=fout or subprocess.DEVNULL,
        stderr=fout or subprocess.DEVNULL,
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
    )
    _procs.append(proc)
    info(f"Started: {name}  (PID {proc.pid})")
    return proc


def _kill_all():
    for p in _procs:
        try: p.terminate()
        except Exception: pass
    time.sleep(1)
    for p in _procs:
        try: p.kill()
        except Exception: pass
    print("\n[RecoverPath] All services stopped.")


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run",    action="store_true", help="Don't write to Firebase")
    parser.add_argument("--no-browser", action="store_true", help="Don't open browser")
    args = parser.parse_args()

    print("\n" + "="*65)
    print("  RecoverPath Clinical Monitor  —  starting up")
    print("="*65)

    # ── Step 1: detect hardware ──
    hdr("1/4  Hardware detection")
    hw_port = detect_hardware()
    if hw_port:
        ok(f"ESP32C6 detected on {hw_port} — HARDWARE mode")
        data_source = "hardware"
    else:
        warn("No ESP32C6 detected — SIMULATOR mode (synthetic patients)")
        warn("To connect hardware: python setup_esp32.py")
        data_source = "simulator"

    # ── Step 2: start data pipeline ──
    hdr("2/4  Starting data pipeline")
    if data_source == "simulator":
        cmd = [sys.executable, str(SRC / "simulator.py")]
        if args.dry_run:
            cmd.append("--dry-run")
        _start(cmd, "simulator", log_file="simulator")
        ok("Simulator started (60s update cycle, 25 synthetic patients)")
        ok("Simulator log: logs/simulator.log")
    else:
        # Hardware: start firebase listener that scores real sensor data
        cmd = [sys.executable, str(SRC / "firebase_listener.py")]
        _start(cmd, "firebase_listener", log_file="firebase_listener")
        ok("Firebase listener started — scoring real sensor data on arrival")

    # ── Step 3: start Next.js dashboard ──
    hdr("3/4  Starting dashboard")
    npm_cmd = "npm.cmd" if platform.system() == "Windows" else "npm"
    npm_path = DASHBOARD / "node_modules" / ".bin"
    if not (DASHBOARD / "node_modules").exists():
        info("Installing dashboard dependencies …")
        subprocess.check_call([npm_cmd, "install"], cwd=DASHBOARD)

    dashboard_proc = _start(
        [npm_cmd, "run", "dev"],
        "dashboard",
        cwd=DASHBOARD,
        log_file="dashboard",
    )
    ok("Dashboard starting … (this takes ~10 seconds)")
    ok("Dashboard log: logs/dashboard.log")

    # ── Step 4: open browser ──
    hdr("4/4  Ready")
    time.sleep(8)   # give Next.js time to compile

    url = "http://localhost:3000/dashboard"
    if not args.no_browser:
        webbrowser.open(url)
        ok(f"Browser opened: {url}")
    else:
        ok(f"Dashboard URL: {url}")

    print("\n" + "="*65)
    print(f"  Mode:           {data_source.upper()}")
    print(f"  Dashboard:      {url}")
    print(f"  Logs:           {LOG_DIR}/")
    print("  Press Ctrl+C to stop all services")
    print("="*65 + "\n")

    # ── Keep alive ──
    try:
        while True:
            # Restart crashed subprocesses
            for proc in list(_procs):
                if proc.poll() is not None:
                    warn(f"Process {proc.pid} exited — check logs/")
            time.sleep(30)
    except KeyboardInterrupt:
        pass
    finally:
        _kill_all()


if __name__ == "__main__":
    main()
