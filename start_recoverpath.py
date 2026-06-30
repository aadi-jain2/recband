"""
RecoverPath — Master Startup Script
Launches simulator + firebase listener in background threads,
then blocks until Ctrl+C.

Usage:
    python start_recoverpath.py [--dry-run] [--interval 30]
"""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).parent

# ANSI
CYAN  = "\033[96m"
GREEN = "\033[92m"
BOLD  = "\033[1m"
DIM   = "\033[2m"
RESET = "\033[0m"


def print_banner():
    print(f"""
{CYAN}{BOLD}
  ██████╗ ███████╗ ██████╗ ██████╗ ██╗   ██╗███████╗██████╗     ██████╗  █████╗ ████████╗██╗  ██╗
  ██╔══██╗██╔════╝██╔════╝██╔═══██╗██║   ██║██╔════╝██╔══██╗    ██╔══██╗██╔══██╗╚══██╔══╝██║  ██║
  ██████╔╝█████╗  ██║     ██║   ██║██║   ██║█████╗  ██████╔╝    ██████╔╝███████║   ██║   ███████║
  ██╔══██╗██╔══╝  ██║     ██║   ██║╚██╗ ██╔╝██╔══╝  ██╔══██╗    ██╔═══╝ ██╔══██║   ██║   ██╔══██║
  ██║  ██║███████╗╚██████╗╚██████╔╝ ╚████╔╝ ███████╗██║  ██║    ██║     ██║  ██║   ██║   ██║  ██║
  ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝    ╚═╝     ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝
{RESET}
{GREEN}  Post-Discharge Readmission Prevention — AI-Powered Wearable System{RESET}
""")


def run_simulator(dry_run: bool, interval: float) -> None:
    """Runs simulator in this thread (blocking)."""
    sys.path.insert(0, str(ROOT))
    sys.path.insert(0, str(ROOT / "src"))

    from simulator import RecoverPathSimulator
    sim = RecoverPathSimulator(dry_run=dry_run, interval=interval)
    sim.start_engine()
    sim.run()


def run_firebase_listener() -> None:
    """Runs firebase_listener.py in this thread (blocking)."""
    script = ROOT / "src" / "firebase_listener.py"
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("firebase_listener", script)
        mod = importlib.util.module_from_spec(spec)  # type: ignore
        spec.loader.exec_module(mod)  # type: ignore
    except Exception as e:
        print(f"[firebase_listener] Warning: {e}")


def main():
    parser = argparse.ArgumentParser(description="RecoverPath — Start Everything")
    parser.add_argument("--dry-run",  action="store_true",
                        help="Simulator writes to console only (no Firebase)")
    parser.add_argument("--interval", type=float, default=30.0,
                        help="Simulator update interval in seconds (default: 30)")
    parser.add_argument("--no-listener", action="store_true",
                        help="Skip firebase_listener (simulator only)")
    args = parser.parse_args()

    print_banner()
    print(f"{BOLD}  Configuration:{RESET}")
    print(f"    Simulator interval : {args.interval}s")
    print(f"    Firebase writes    : {'DISABLED (dry-run)' if args.dry_run else 'ENABLED'}")
    print(f"    Dashboard URL      : http://localhost:3000/dashboard")
    print()

    threads: list[threading.Thread] = []

    # ── Simulator thread ──────────────────────────────────────────────────────
    print(f"[1/2] Starting patient simulator…")
    sim_thread = threading.Thread(
        target=run_simulator,
        args=(args.dry_run, args.interval),
        name="simulator",
        daemon=True,
    )
    sim_thread.start()
    threads.append(sim_thread)
    time.sleep(2)  # let simulator load models before listener starts

    # ── Firebase listener thread ──────────────────────────────────────────────
    if not args.no_listener:
        print(f"[2/2] Starting Firebase listener…")
        listener_thread = threading.Thread(
            target=run_firebase_listener,
            name="firebase_listener",
            daemon=True,
        )
        listener_thread.start()
        threads.append(listener_thread)

    print(f"\n{GREEN}{BOLD}RecoverPath live.{RESET}")
    print(f"  Open {CYAN}http://localhost:3000/dashboard{RESET} to see live risk scores")
    print(f"  Open {CYAN}http://localhost:3000/demo{RESET}      for the competition demo view")
    print(f"  Run  {CYAN}python src/demo_scenario.py{RESET}      for the scripted TiE pitch")
    print(f"\n{DIM}  Press Ctrl+C to stop.{RESET}\n")

    try:
        while True:
            # Check threads are alive
            for t in threads:
                if not t.is_alive():
                    print(f"[WARNING] Thread '{t.name}' exited unexpectedly.")
            time.sleep(5)
    except KeyboardInterrupt:
        print(f"\n{DIM}Shutting down RecoverPath…{RESET}")
        sys.exit(0)


if __name__ == "__main__":
    main()
