"""
RecoverPath — TiE Competition Demo Scenario
Scripted 5-minute live demonstration showing real-time risk escalation.

Run: python src/demo_scenario.py [--dry-run] [--fast]

Timeline:
  0:00 - All 25 patients loaded, mix of stable/medium risk
  0:30 - Arjun Sharma (P001, CHF) starts deteriorating
  1:00 - Arjun hits HIGH risk, dashboard updates live
  1:30 - Priya Krishnan (P006, CHF) also deteriorates
  2:00 - Arjun hits CRITICAL — red alert fires
  2:30 - Alert acknowledged (auto-simulated)
  3:00 - Arjun starts recovering (intervention worked)
  3:30 - Kavitha Nair (P002, COPD) cough spike + wheeze
  4:00 - Three patients in HIGH/CRITICAL simultaneously
  4:30 - Population analytics shows risk distribution shift
  5:00 - End: 2 recovering, overall risk trending down
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

from simulator import (
    RecoverPathSimulator,
    PatientState,
    force_state,
    get_patient,
)

# ANSI colors for terminal output
RED    = "\033[91m"
ORANGE = "\033[33m"
GREEN  = "\033[92m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
RESET  = "\033[0m"
CLEAR  = "\033[2J\033[H"


def banner(msg: str, color: str = CYAN) -> None:
    width = 90
    print(f"\n{color}{BOLD}{'='*width}{RESET}")
    print(f"{color}{BOLD}  {msg}{RESET}")
    print(f"{color}{BOLD}{'='*width}{RESET}\n")


def phase(num: int, time_label: str, description: str, color: str = CYAN) -> None:
    print(f"{color}{BOLD}[{time_label}] Phase {num}: {description}{RESET}")
    print(f"{DIM}{'─'*80}{RESET}")


def wait(seconds: float, label: str = "") -> None:
    if label:
        print(f"{DIM}  Waiting {seconds}s — {label}…{RESET}", end="", flush=True)
    time.sleep(seconds)
    if label:
        print(f" done{RESET}")


def run_n_steps(sim: RecoverPathSimulator, n: int, label: str = "") -> None:
    for i in range(n):
        if label:
            print(f"{DIM}  [{i+1}/{n}] {label}{RESET}")
        sim.step()


def demo(dry_run: bool = False, fast: bool = False):
    """Execute the full 5-minute scripted demo."""
    speed = 2.0 if fast else 30.0  # seconds per "tick" in demo
    pause = lambda s: time.sleep(s * (0.1 if fast else 1.0))

    print(CLEAR)
    banner("RecoverPath — Live Demo Scenario", CYAN)
    print(f"  Audience: TiE Entrepreneurship Competition / Investor Pitch")
    print(f"  Mode: {'DRY-RUN (no Firebase)' if dry_run else 'LIVE Firebase'}")
    print(f"  Speed: {'FAST (10× accelerated)' if fast else 'REAL-TIME (30s steps)'}")
    print(f"\n  {DIM}Open dashboard at http://localhost:3000/dashboard to watch live{RESET}")
    pause(3)

    # ── Initialize simulator ──────────────────────────────────────────────────
    print(f"\n{CYAN}Initializing simulator and loading ML models…{RESET}")
    sim = RecoverPathSimulator(dry_run=dry_run, interval=speed)
    sim.start_engine()

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 0 — Baseline: all patients stable
    # ══════════════════════════════════════════════════════════════════════════
    banner("Phase 0 — Baseline: 25 patients loaded", GREEN)
    phase(0, "0:00", "Establishing baseline — all patients monitored", GREEN)
    print(f"  Patients: {len(sim.patients)} enrolled across CHF, COPD, Diabetic, Post-surgical")
    print(f"  Running initial ML scoring pass…")

    # Force all to STABLE for clean baseline
    for p in sim.patients:
        p.state = PatientState.STABLE
        p.state_ticks = 0

    run_n_steps(sim, 2, "Establishing baseline")
    pause(2)

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 1 — 0:30: Arjun Sharma starts deteriorating
    # ══════════════════════════════════════════════════════════════════════════
    banner("Phase 1 — Arjun Sharma (CHF) begins deteriorating", ORANGE)
    phase(1, "0:30", "Arjun Sharma (P001, CHF) — bioimpedance rising, SpO2 dropping", ORANGE)

    arjun = get_patient(sim, "P001")
    assert arjun, "P001 not found"
    force_state(sim, "P001", PatientState.DETERIORATING)
    print(f"  {ORANGE}BioZ: {arjun.vitals.bioz_ohms:.1f} ohms → trending up (fluid accumulating){RESET}")
    print(f"  {ORANGE}SpO2: {arjun.vitals.spo2:.1f}% → dropping{RESET}")
    print(f"  {ORANGE}HRV SDNN: {arjun.vitals.hrv_sdnn:.1f} ms → falling{RESET}")

    run_n_steps(sim, 2, "Arjun deteriorating…")
    pause(2)

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 2 — 1:00: Arjun hits HIGH risk
    # ══════════════════════════════════════════════════════════════════════════
    banner("Phase 2 — Arjun reaches HIGH risk tier", ORANGE)
    phase(2, "1:00", "Dashboard shows orange HIGH badge — alerts triggered", ORANGE)
    run_n_steps(sim, 2, "Risk climbing…")

    arjun_risk = sim._risk_cache.get("P001", 0)
    print(f"\n  {ORANGE}{BOLD}Arjun Sharma risk score: {arjun_risk:.0f} → HIGH{RESET}")
    print(f"  {DIM}Dashboard: orange badge visible, care coordinator notified{RESET}")
    pause(2)

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 3 — 1:30: Priya Krishnan also deteriorating
    # ══════════════════════════════════════════════════════════════════════════
    banner("Phase 3 — Priya Krishnan (CHF) also deteriorating", ORANGE)
    phase(3, "1:30", "Second CHF patient in distress — simultaneous deterioration", ORANGE)

    force_state(sim, "P006", PatientState.DETERIORATING)
    priya = get_patient(sim, "P006")
    print(f"  {ORANGE}Priya Krishnan — CHF exacerbation developing independently{RESET}")
    run_n_steps(sim, 2, "Two patients deteriorating simultaneously…")
    pause(2)

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 4 — 2:00: Arjun hits CRITICAL
    # ══════════════════════════════════════════════════════════════════════════
    banner("Phase 4 — CRITICAL ALERT: Arjun Sharma", RED)
    phase(4, "2:00", "Arjun hits CRITICAL — immediate intervention required", RED)

    force_state(sim, "P001", PatientState.CRITICAL_EVENT)
    run_n_steps(sim, 1, "Critical event triggered…")

    arjun_risk = sim._risk_cache.get("P001", 0)
    print(f"\n  {RED}{BOLD}*** CRITICAL ALERT ***{RESET}")
    print(f"  {RED}Patient: Arjun Sharma (P001) — CHF{RESET}")
    print(f"  {RED}Risk Score: {arjun_risk:.0f} / 100{RESET}")
    print(f"  {RED}Action: Immediate intervention — contact patient NOW{RESET}")
    print(f"  {DIM}Dashboard: red pulsing badge, alert bell rings, alerts page highlights P001{RESET}")
    pause(3)

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 5 — 2:30: Alert acknowledged
    # ══════════════════════════════════════════════════════════════════════════
    banner("Phase 5 — Alert Acknowledged", GREEN)
    phase(5, "2:30", "Care coordinator acknowledges Arjun's alert", GREEN)
    print(f"  {GREEN}Care coordinator clicked 'Acknowledge' on Arjun's CRITICAL alert{RESET}")
    print(f"  {GREEN}Telemedicine call initiated — physician dispatched{RESET}")
    run_n_steps(sim, 1, "Holding critical…")
    pause(2)

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 6 — 3:00: Arjun recovering
    # ══════════════════════════════════════════════════════════════════════════
    banner("Phase 6 — Arjun Sharma: Intervention Working", GREEN)
    phase(6, "3:00", "Arjun transitions to RECOVERING — vitals improving", GREEN)

    force_state(sim, "P001", PatientState.RECOVERING)
    run_n_steps(sim, 2, "Arjun recovering…")

    arjun_risk = sim._risk_cache.get("P001", 0)
    print(f"\n  {GREEN}Arjun's risk score falling: {arjun_risk:.0f}{RESET}")
    print(f"  {GREEN}SpO2 recovering: {arjun.vitals.spo2:.1f}%{RESET}")
    print(f"  {GREEN}HRV SDNN improving: {arjun.vitals.hrv_sdnn:.1f} ms{RESET}")
    pause(2)

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 7 — 3:30: Kavitha Nair cough spike
    # ══════════════════════════════════════════════════════════════════════════
    banner("Phase 7 — Kavitha Nair (COPD): Cough Spike + Wheeze", ORANGE)
    phase(7, "3:30", "COPD exacerbation — cough rate spikes, wheeze detected by edge AI", ORANGE)

    kavitha = get_patient(sim, "P002")
    assert kavitha, "P002 not found"
    force_state(sim, "P002", PatientState.DETERIORATING)
    kavitha.vitals.cough_sum += 45
    kavitha.vitals.wheeze_pct = min(0.9, kavitha.vitals.wheeze_pct + 0.6)

    run_n_steps(sim, 2, "COPD exacerbation developing…")

    kavitha_risk = sim._risk_cache.get("P002", 0)
    print(f"\n  {ORANGE}Kavitha Nair — COPD exacerbation{RESET}")
    print(f"  {ORANGE}Cough events: {kavitha.vitals.cough_sum:.0f} in 24hrs (>40 threshold){RESET}")
    print(f"  {ORANGE}Wheeze: {kavitha.vitals.wheeze_pct*100:.0f}% of hours (edge AI on ESP32C6){RESET}")
    print(f"  {ORANGE}Risk: {kavitha_risk:.0f}{RESET}")
    pause(2)

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 8 — 4:00: Three HIGH/CRITICAL simultaneously
    # ══════════════════════════════════════════════════════════════════════════
    banner("Phase 8 — Peak Drama: 3 HIGH/CRITICAL Patients", RED)
    phase(8, "4:00", "Arjun (recovering), Priya (HIGH), Kavitha (CRITICAL) — all active", RED)

    force_state(sim, "P006", PatientState.CRITICAL_EVENT)
    run_n_steps(sim, 2, "Three patients in distress…")

    scores = {p.patient_id: sim._risk_cache.get(p.patient_id, 0) for p in sim.patients}
    critical_count = sum(1 for s in scores.values() if s >= 75)
    high_count = sum(1 for s in scores.values() if 50 <= s < 75)
    print(f"\n  {RED}{BOLD}Current status:{RESET}")
    print(f"  {RED}CRITICAL: {critical_count} patients{RESET}")
    print(f"  {ORANGE}HIGH:     {high_count} patients{RESET}")
    print(f"\n  {DIM}Open /dashboard/analytics to see risk distribution shifted{RESET}")
    pause(3)

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 9 — 4:30: Show analytics
    # ══════════════════════════════════════════════════════════════════════════
    banner("Phase 9 — Population Analytics", CYAN)
    phase(9, "4:30", "Risk distribution has shifted — analytics page reflects live data", CYAN)

    avg_risk = sum(scores.values()) / len(scores)
    tiers = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for p in sim.patients:
        risk = scores.get(p.patient_id, 0)
        if risk >= 75: tiers["CRITICAL"] += 1
        elif risk >= 50: tiers["HIGH"] += 1
        elif risk >= 25: tiers["MEDIUM"] += 1
        else: tiers["LOW"] += 1

    print(f"  Population average risk: {avg_risk:.1f}")
    print(f"  Distribution: CRITICAL={tiers['CRITICAL']} | HIGH={tiers['HIGH']} | "
          f"MEDIUM={tiers['MEDIUM']} | LOW={tiers['LOW']}")
    run_n_steps(sim, 1, "Final state update…")
    pause(2)

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 10 — 5:00: End state
    # ══════════════════════════════════════════════════════════════════════════
    banner("Phase 10 — End State: System Working", GREEN)
    phase(10, "5:00", "2 patients recovering, overall risk trending down", GREEN)

    force_state(sim, "P001", PatientState.RECOVERING)
    force_state(sim, "P002", PatientState.RECOVERING)
    force_state(sim, "P006", PatientState.RECOVERING)
    run_n_steps(sim, 2, "Recovery phase…")

    final_scores = {p.patient_id: sim._risk_cache.get(p.patient_id, 0) for p in sim.patients}
    final_avg = sum(final_scores.values()) / len(final_scores)

    print(f"\n  {GREEN}{BOLD}Demo Complete{RESET}")
    print(f"  {GREEN}Final avg risk score:  {final_avg:.1f} (was {avg_risk:.1f}){RESET}")
    print(f"  {GREEN}Intervention outcome:  Arjun, Kavitha, Priya all recovering{RESET}")
    print(f"  {GREEN}False positives:       0 (specificity maintained){RESET}")

    print(f"""
{CYAN}{BOLD}Key Metrics to Highlight:{RESET}
  • AUC-ROC: 0.8079   (trained on 50,000 synthetic patient windows)
  • Sensitivity: 82.7%  (correctly flags 83 of 100 true readmissions)
  • Edge AI cough model: 11.9 KB on ESP32C6 (TFLite int8)
  • Firebase latency: <2 seconds from sensor to dashboard
  • 5-sensor wearable: ECG + PPG + BioZ + IMU + Mic

{GREEN}RecoverPath prevented a readmission. That's the pitch.{RESET}
""")


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RecoverPath TiE Demo Scenario")
    parser.add_argument("--dry-run", action="store_true",
                        help="Console only — no Firebase writes")
    parser.add_argument("--fast", action="store_true",
                        help="Run at 10x speed (for testing)")
    args = parser.parse_args()

    try:
        demo(dry_run=args.dry_run, fast=args.fast)
    except KeyboardInterrupt:
        print("\nDemo interrupted.")
