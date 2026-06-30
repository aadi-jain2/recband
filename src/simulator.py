"""
RecoverPath — Live Patient Biomarker Simulator
Generates 25 patients with realistic slowly-changing vitals,
runs REAL RecoverPathRiskEngine, and pushes to Firebase every 30s.

Usage:
    python src/simulator.py [--dry-run]   # dry-run prints to console only
    python src/simulator.py               # full Firebase push
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import random
import sys
import threading
import time
from copy import deepcopy
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional

import numpy as np

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT))

from inference import RecoverPathRiskEngine

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("simulator")

# ── Constants ──────────────────────────────────────────────────────────────────
UPDATE_INTERVAL_S = 30   # seconds between simulation steps
RNG = np.random.default_rng(42)


# ── Patient state machine ──────────────────────────────────────────────────────

class PatientState(str, Enum):
    STABLE         = "STABLE"
    DETERIORATING  = "DETERIORATING"
    CRITICAL_EVENT = "CRITICAL_EVENT"
    RECOVERING     = "RECOVERING"


# Starting vitals per diagnosis
DIAGNOSIS_BASELINES = {
    "CHF":        {"spo2": 94.0, "hrv_sdnn": 32.0, "bioz_ohms": 405.0, "rr_imu": 19.0, "hr_ecg": 84.0},
    "COPD":       {"spo2": 92.0, "hrv_sdnn": 28.0, "bioz_ohms": 390.0, "rr_imu": 21.0, "hr_ecg": 78.0},
    "Diabetic":   {"spo2": 96.0, "hrv_sdnn": 38.0, "bioz_ohms": 420.0, "rr_imu": 17.0, "hr_ecg": 80.0},
    "PostSurg":   {"spo2": 97.0, "hrv_sdnn": 44.0, "bioz_ohms": 430.0, "rr_imu": 16.0, "hr_ecg": 76.0},
}


@dataclass
class PatientVitals:
    """Current vital signs for one patient."""
    spo2: float           # SpO2 %
    hrv_sdnn: float       # HRV SDNN ms
    bioz_ohms: float      # Bioimpedance ohms
    rr_imu: float         # Respiratory rate bpm
    hr_ecg: float         # Heart rate bpm
    cough_sum: float = 0.0
    wheeze_pct: float = 0.0
    afib_pct: float = 0.0
    afib_days: int = 0
    activity: float = 0.4
    qt_interval: float = 405.0
    posture_supine: float = 0.35
    nocturnal_activity: float = 0.15
    bioz_trend: float = 0.0    # ohms/hr (+ = fluid accumulating)
    bioz_baseline: float = 0.0  # reference at admit
    days_since_discharge: int = 7

    def __post_init__(self):
        if self.bioz_baseline == 0.0:
            self.bioz_baseline = self.bioz_ohms


@dataclass
class PatientRecord:
    """Full patient record including demographics and live vitals."""
    patient_id: str
    name: str
    age: int
    diagnosis: str
    days_since_discharge: int
    num_medications: int
    num_diagnoses: int
    num_prior_admissions: int
    diabetes_flag: bool
    copd_flag: bool
    chf_flag: bool

    # Live state
    state: PatientState = PatientState.STABLE
    state_ticks: int = 0        # ticks spent in current state
    critical_duration: int = 0  # remaining critical ticks
    vitals: PatientVitals = field(default_factory=PatientVitals)


# ── 25 patient roster ──────────────────────────────────────────────────────────
PATIENT_ROSTER = [
    # CHF (8)
    ("P001", "Arjun Sharma",      72, "CHF",      4,  14, 8, 2, False, False, True),
    ("P002", "Kavitha Nair",      68, "COPD",     6,  11, 7, 1, False, True,  False),
    ("P003", "Rajan Pillai",      77, "CHF",      3,  16, 9, 3, False, False, True),
    ("P004", "Sunita Rao",        64, "Diabetic", 9,  10, 5, 1, True,  False, False),
    ("P005", "Mohan Das",         71, "COPD",     7,  12, 6, 2, False, True,  False),
    ("P006", "Priya Krishnan",    59, "CHF",      12,  9, 7, 1, False, False, True),
    ("P007", "Venkat Iyer",       66, "CHF",      5,  13, 8, 2, False, False, True),
    ("P008", "Lakshmi Devi",      74, "COPD",     8,  10, 6, 1, False, True,  False),
    ("P009", "Ashok Patel",       58, "Diabetic", 14,  8, 4, 0, True,  False, False),
    ("P010", "Meena Agarwal",     62, "PostSurg", 11,  7, 4, 0, False, False, False),
    ("P011", "Rajesh Kumar",      55, "COPD",     16,  9, 5, 1, False, True,  False),
    ("P012", "Deepa Menon",       67, "CHF",      19, 11, 7, 2, False, False, True),
    ("P013", "Suresh Nambiar",    70, "Diabetic", 13,  9, 5, 1, True,  False, False),
    ("P014", "Geetha Subramanian",63, "PostSurg", 18,  6, 4, 0, False, False, False),
    ("P015", "Harish Bose",       56, "COPD",     21,  8, 5, 0, False, True,  False),
    ("P016", "Ananya Singh",      48, "Diabetic", 10,  7, 4, 0, True,  False, False),
    ("P017", "Prakash Reddy",     61, "CHF",      22, 10, 6, 1, False, False, True),
    ("P018", "Usha Krishnamurthy",69, "PostSurg", 17,  8, 5, 0, False, False, False),
    ("P019", "Vijay Shankar",     52, "Diabetic", 24,  6, 3, 0, True,  False, False),
    ("P020", "Radha Balakrishnan",57, "PostSurg", 20,  5, 3, 0, False, False, False),
    ("P021", "Naresh Choudhary",  44, "Diabetic", 26,  7, 3, 0, True,  False, False),
    ("P022", "Sarala Iyer",       60, "COPD",     23,  9, 5, 1, False, True,  False),
    ("P023", "Dinesh Nair",       49, "PostSurg", 28,  6, 3, 0, False, False, False),
    ("P024", "Padma Venkatesh",   65, "CHF",      25, 10, 6, 1, False, False, True),
    ("P025", "Ramesh Joshi",      53, "Diabetic", 27,  8, 4, 0, True,  False, False),
]


def _build_initial_vitals(diag: str, days_out: int) -> PatientVitals:
    """Build starting vitals with small random offset from baseline."""
    base = DIAGNOSIS_BASELINES.get(diag, DIAGNOSIS_BASELINES["PostSurg"])
    jitter = lambda v, pct=0.05: v + RNG.normal(0, v * pct)
    cough_base = 4.0 if diag == "COPD" else 1.0
    bioz = jitter(base["bioz_ohms"])
    # Long-discharged patients slightly more stable
    stability = min(1.0, days_out / 14.0)
    return PatientVitals(
        spo2=jitter(base["spo2"]),
        hrv_sdnn=jitter(base["hrv_sdnn"]),
        bioz_ohms=bioz,
        bioz_baseline=bioz,
        bioz_trend=RNG.normal(0, 0.3) * (1 - stability),
        rr_imu=jitter(base["rr_imu"]),
        hr_ecg=jitter(base["hr_ecg"]),
        cough_sum=float(RNG.poisson(cough_base * 24)),
        wheeze_pct=0.05 if diag == "COPD" else 0.01,
        afib_pct=0.05 if diag == "CHF" else 0.01,
        afib_days=1 if diag == "CHF" else 0,
        activity=jitter(0.45, 0.15),
        qt_interval=jitter(400.0, 0.03),
        posture_supine=jitter(0.38, 0.1),
        nocturnal_activity=jitter(0.12, 0.15),
        days_since_discharge=days_out,
    )


def build_patients() -> list[PatientRecord]:
    patients = []
    for row in PATIENT_ROSTER:
        pid, name, age, diag, days_out, n_meds, n_diag, n_prior, dm, copd, chf = row
        # Randomise initial state: 10% start DETERIORATING, rest STABLE
        init_state = PatientState.DETERIORATING if RNG.random() < 0.10 else PatientState.STABLE
        p = PatientRecord(
            patient_id=pid,
            name=name,
            age=age,
            diagnosis=diag,
            days_since_discharge=days_out,
            num_medications=n_meds,
            num_diagnoses=n_diag,
            num_prior_admissions=n_prior,
            diabetes_flag=dm,
            copd_flag=copd,
            chf_flag=chf,
            state=init_state,
            vitals=_build_initial_vitals(diag, days_out),
        )
        patients.append(p)
    return patients


# ── Vital sign update logic ────────────────────────────────────────────────────

def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def update_vitals(patient: PatientRecord) -> None:
    """Apply one simulation step to patient vitals based on current state."""
    v = patient.vitals
    diag = patient.diagnosis
    state = patient.state
    n = RNG.normal

    if state == PatientState.STABLE:
        # Gentle random walk toward healthy baseline
        v.spo2       = _clamp(v.spo2     + n(0.0,  0.3),  94.0, 99.0)
        v.hrv_sdnn   = _clamp(v.hrv_sdnn + n(0.2,  1.5),  25.0, 65.0)
        v.bioz_ohms  = _clamp(v.bioz_ohms + n(0.0, 0.4),  v.bioz_baseline - 5, v.bioz_baseline + 5)
        v.bioz_trend = _clamp(v.bioz_trend + n(0.0, 0.3), -2.0, 2.0)
        v.rr_imu     = _clamp(v.rr_imu   + n(0.0,  0.5),  12.0, 22.0)
        v.hr_ecg     = _clamp(v.hr_ecg   + n(0.0,  1.5),  55.0, 100.0)
        v.cough_sum  = max(0, v.cough_sum + n(0.0, 2.0))
        v.afib_pct   = _clamp(v.afib_pct + n(0.0, 0.01),  0.0, 0.15)
        v.activity   = _clamp(v.activity + n(0.0, 0.03),  0.15, 0.75)

    elif state == PatientState.DETERIORATING:
        # Diagnosis-specific deterioration
        if diag == "CHF":
            v.spo2      = _clamp(v.spo2    - abs(n(0.3, 0.1)),  78.0, 96.0)
            v.hrv_sdnn  = _clamp(v.hrv_sdnn - abs(n(1.0, 0.5)), 8.0, 35.0)
            v.bioz_trend= _clamp(v.bioz_trend + abs(n(0.8, 0.2)), -2.0, 5.0)
            v.bioz_ohms = _clamp(v.bioz_ohms + abs(n(0.8, 0.2)), 350.0, 470.0)
            v.rr_imu    = _clamp(v.rr_imu + abs(n(0.4, 0.15)), 14.0, 35.0)
            v.hr_ecg    = _clamp(v.hr_ecg + n(0.5, 1.0), 60.0, 140.0)
            v.afib_pct  = _clamp(v.afib_pct + abs(n(0.02, 0.01)), 0.0, 0.60)
            v.afib_days = min(7, v.afib_days + (1 if RNG.random() < 0.25 else 0))
        elif diag == "COPD":
            v.spo2     = _clamp(v.spo2 - abs(n(0.4, 0.15)), 74.0, 94.0)
            v.rr_imu   = _clamp(v.rr_imu + abs(n(0.6, 0.2)), 14.0, 40.0)
            v.cough_sum= max(0, v.cough_sum + float(RNG.poisson(2)))
            v.wheeze_pct= _clamp(v.wheeze_pct + abs(n(0.04, 0.01)), 0.0, 0.90)
            v.hrv_sdnn = _clamp(v.hrv_sdnn - abs(n(0.5, 0.3)), 8.0, 35.0)
        elif diag in ("Diabetic", "PostSurg"):
            v.spo2     = _clamp(v.spo2 - abs(n(0.2, 0.1)), 82.0, 97.0)
            v.hrv_sdnn = _clamp(v.hrv_sdnn - abs(n(0.7, 0.4)), 10.0, 45.0)
            v.hr_ecg   = _clamp(v.hr_ecg + abs(n(0.5, 0.3)), 60.0, 130.0)
            v.rr_imu   = _clamp(v.rr_imu + abs(n(0.3, 0.15)), 14.0, 32.0)
        v.activity = _clamp(v.activity - abs(n(0.02, 0.01)), 0.05, 0.60)

    elif state == PatientState.CRITICAL_EVENT:
        # Acute spike: 1-2 biomarkers suddenly worsen
        if patient.state_ticks == 0:
            # Initial spike
            if diag == "CHF":
                v.spo2 = _clamp(v.spo2 - n(3.0, 0.5), 76.0, 92.0)
                v.hrv_sdnn = _clamp(v.hrv_sdnn - n(4.0, 1.0), 8.0, 20.0)
                v.bioz_trend = _clamp(v.bioz_trend + 2.5, -2.0, 6.0)
            elif diag == "COPD":
                v.spo2 = _clamp(v.spo2 - n(4.0, 0.5), 72.0, 91.0)
                v.wheeze_pct = _clamp(v.wheeze_pct + 0.4, 0.0, 1.0)
                v.cough_sum += float(RNG.poisson(8))
            else:
                v.hrv_sdnn = _clamp(v.hrv_sdnn - n(5.0, 1.0), 8.0, 20.0)
                v.spo2 = _clamp(v.spo2 - n(2.0, 0.5), 78.0, 93.0)
        else:
            # Hold critical — small noise
            v.spo2     += n(0, 0.2)
            v.hrv_sdnn += n(0, 0.5)
            v.bioz_ohms += n(0, 0.3)

    elif state == PatientState.RECOVERING:
        # Trend back toward stable baseline
        target_spo2  = DIAGNOSIS_BASELINES[diag]["spo2"]
        target_hrv   = DIAGNOSIS_BASELINES[diag]["hrv_sdnn"]
        target_bioz  = v.bioz_baseline
        v.spo2     = _clamp(v.spo2    + (target_spo2  - v.spo2)    * 0.08 + n(0, 0.2), 78.0, 100.0)
        v.hrv_sdnn = _clamp(v.hrv_sdnn+ (target_hrv   - v.hrv_sdnn)* 0.10 + n(0, 0.8), 10.0, 70.0)
        v.bioz_ohms= _clamp(v.bioz_ohms+(target_bioz  - v.bioz_ohms)*0.06 + n(0, 0.3), 340.0, 480.0)
        v.bioz_trend= _clamp(v.bioz_trend * 0.85 + n(0, 0.2), -3.0, 3.0)
        v.rr_imu   = _clamp(v.rr_imu  + (DIAGNOSIS_BASELINES[diag]["rr_imu"] - v.rr_imu) * 0.08 + n(0, 0.3), 12.0, 35.0)
        v.cough_sum= max(0, v.cough_sum * 0.85 + n(0, 1.0))
        v.wheeze_pct= _clamp(v.wheeze_pct * 0.80, 0.0, 1.0)
        v.afib_pct  = _clamp(v.afib_pct * 0.90, 0.0, 0.60)
        v.activity  = _clamp(v.activity + abs(n(0.03, 0.01)), 0.15, 0.75)


# ── State transition engine ────────────────────────────────────────────────────

# Transition probabilities per step (30s)
TRANSITION_PROBS = {
    PatientState.STABLE:         {"deteriorate": 0.020},
    PatientState.DETERIORATING:  {"critical_threshold": 75},
    PatientState.CRITICAL_EVENT: {"min_ticks": 3, "max_ticks": 6},
    PatientState.RECOVERING:     {"stable_threshold": 30},
}


def advance_state(patient: PatientRecord, current_risk: float) -> None:
    """Advance patient state machine, may trigger state transitions."""
    patient.state_ticks += 1

    if patient.state == PatientState.STABLE:
        if RNG.random() < TRANSITION_PROBS[PatientState.STABLE]["deteriorate"]:
            patient.state = PatientState.DETERIORATING
            patient.state_ticks = 0
            log.info(
                f"  [{patient.patient_id}] {patient.name} — "
                f"STATE: STABLE -> DETERIORATING"
            )

    elif patient.state == PatientState.DETERIORATING:
        threshold = TRANSITION_PROBS[PatientState.DETERIORATING]["critical_threshold"]
        if current_risk > threshold:
            patient.state = PatientState.CRITICAL_EVENT
            patient.critical_duration = RNG.integers(
                TRANSITION_PROBS[PatientState.CRITICAL_EVENT]["min_ticks"],
                TRANSITION_PROBS[PatientState.CRITICAL_EVENT]["max_ticks"] + 1,
            )
            patient.state_ticks = 0
            log.warning(
                f"  [{patient.patient_id}] {patient.name} — "
                f"STATE: DETERIORATING -> CRITICAL_EVENT (risk={current_risk:.0f})"
            )

    elif patient.state == PatientState.CRITICAL_EVENT:
        patient.critical_duration -= 1
        if patient.critical_duration <= 0:
            patient.state = PatientState.RECOVERING
            patient.state_ticks = 0
            log.info(
                f"  [{patient.patient_id}] {patient.name} — "
                f"STATE: CRITICAL_EVENT -> RECOVERING"
            )

    elif patient.state == PatientState.RECOVERING:
        stable_thresh = TRANSITION_PROBS[PatientState.RECOVERING]["stable_threshold"]
        if current_risk < stable_thresh:
            patient.state = PatientState.STABLE
            patient.state_ticks = 0
            log.info(
                f"  [{patient.patient_id}] {patient.name} — "
                f"STATE: RECOVERING -> STABLE"
            )


# ── Feature dict builder (vitals → ML model input) ────────────────────────────

def vitals_to_features(patient: PatientRecord) -> dict:
    """Convert current PatientVitals to the full ML feature dictionary."""
    v = patient.vitals
    hr_ppg = v.hr_ecg + float(RNG.normal(0, 1.5))
    bioz_delta = v.bioz_ohms - v.bioz_baseline
    rr_interval_mean = 60000.0 / max(30, v.hr_ecg)

    return {
        # PPG (MAX30102)
        "spo2_mean":              v.spo2,
        "spo2_min":               v.spo2 - abs(float(RNG.normal(0, 1.5))),
        "spo2_std":               abs(float(RNG.normal(0.8, 0.4))),
        "spo2_time_below_92_pct": max(0.0, (92.0 - v.spo2) / 12.0),
        "hr_ppg_mean":            hr_ppg,
        "hr_ppg_std":             abs(float(RNG.normal(5, 2))),
        "hr_ppg_max":             hr_ppg + abs(float(RNG.normal(15, 5))),
        "hr_ppg_trend_6hr":       float(RNG.normal(0, 2)),
        # ECG (MAX30003)
        "hr_ecg_mean":            v.hr_ecg,
        "rr_interval_mean":       rr_interval_mean,
        "rr_interval_std":        abs(float(RNG.normal(40, 15))),
        "hrv_sdnn":               v.hrv_sdnn,
        "hrv_rmssd":              v.hrv_sdnn * float(RNG.uniform(0.85, 1.15)),
        "qt_interval_mean":       v.qt_interval,
        "afib_pct_readings":      v.afib_pct,
        "afib_days_in_window":    float(v.afib_days),
        # BioZ (MAX30009)
        "bioz_ohms_mean":         v.bioz_ohms,
        "bioz_ohms_trend_24hr":   v.bioz_trend,
        "bioz_delta_from_baseline": bioz_delta,
        "thoracic_fluid_index":   _clamp(0.35 + bioz_delta / 80.0, 0.0, 1.0),
        "bioz_rr_mean":           v.rr_imu + float(RNG.normal(0, 0.8)),
        # IMU (MPU6050)
        "rr_imu_mean":            v.rr_imu,
        "rr_imu_std":             abs(float(RNG.normal(1.5, 0.5))),
        "activity_mean":          v.activity,
        "nocturnal_activity_mean":v.nocturnal_activity,
        "posture_supine_pct":     v.posture_supine,
        # Audio (INMP441)
        "cough_sum_24hr":         max(0, v.cough_sum),
        "cough_max_hourly":       max(0, v.cough_sum / 24.0 + abs(float(RNG.normal(0, 1)))),
        "cough_trend_6hr":        float(RNG.normal(0, 0.3)),
        "wheeze_pct_hours":       v.wheeze_pct,
        # Patient context
        "age":                    float(patient.age),
        "days_since_discharge":   float(patient.days_since_discharge),
        "num_prior_admissions_90d": float(patient.num_prior_admissions),
        "num_medications":        float(patient.num_medications),
        "num_diagnoses":          float(patient.num_diagnoses),
        "diabetes_flag":          float(patient.diabetes_flag),
        "copd_flag":              float(patient.copd_flag),
        "chf_flag":               float(patient.chf_flag),
        # Placeholder ECG spectral features
        "hrv_lf_hf_ratio":        float("nan"),
        "qt_corrected":           float("nan"),
    }


# ── Firebase writer ────────────────────────────────────────────────────────────

class FirebaseWriter:
    """Wraps Firebase Admin DB writes. Falls back to console-only in dry-run."""

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self._db = None
        if not dry_run:
            self._init_firebase()

    def _init_firebase(self):
        try:
            import firebase_admin
            from firebase_admin import credentials, db

            cred_path = ROOT / "firebase_credentials.json"
            db_url = os.getenv("FIREBASE_DATABASE_URL", "")

            if not cred_path.exists() or not db_url:
                log.warning(
                    "Firebase credentials not found — switching to dry-run mode.\n"
                    "  To enable Firebase: set FIREBASE_DATABASE_URL and place "
                    "firebase_credentials.json in the project root."
                )
                self.dry_run = True
                return

            if not firebase_admin._apps:
                firebase_admin.initialize_app(
                    credentials.Certificate(str(cred_path)),
                    {"databaseURL": db_url},
                )
            self._db = db
            log.info("Firebase connected.")
        except ImportError:
            log.warning("firebase-admin not installed — dry-run mode.")
            self.dry_run = True
        except Exception as e:
            log.warning(f"Firebase init failed ({e}) — dry-run mode.")
            self.dry_run = True

    def write(self, path: str, data: dict) -> None:
        if self.dry_run or self._db is None:
            return
        try:
            self._db.reference(path).set(data)
        except Exception as e:
            log.warning(f"Firebase write failed at {path}: {e}")

    def write_push(self, path: str, data: dict) -> None:
        """Push a new child (auto-key) under path."""
        if self.dry_run or self._db is None:
            return
        try:
            self._db.reference(path).push(data)
        except Exception as e:
            log.warning(f"Firebase push failed at {path}: {e}")


# ── Simulator class ────────────────────────────────────────────────────────────

class RecoverPathSimulator:
    """
    Main simulation loop. Holds all 25 patients, updates vitals,
    runs real ML model, writes to Firebase.
    """

    def __init__(self, dry_run: bool = False, interval: float = UPDATE_INTERVAL_S):
        self.interval = interval
        self.patients = build_patients()
        self.engine = RecoverPathRiskEngine()
        self.firebase = FirebaseWriter(dry_run=dry_run)
        self._running = False
        self._tick = 0
        self._risk_cache: dict[str, float] = {}  # patient_id -> last risk score

    def start_engine(self):
        model_dir = ROOT / "models"
        if not (model_dir / "recoverpath_risk_model.pkl").exists():
            log.error("Model not found. Run src/train.py first.")
            sys.exit(1)
        self.engine.load_models(str(model_dir))
        log.info("ML engine loaded.")

    def _score_patient(self, patient: PatientRecord) -> dict:
        features = vitals_to_features(patient)
        result = self.engine.score_from_features(features, patient_id=patient.patient_id)
        return result

    def _write_patient(self, patient: PatientRecord, result: dict) -> None:
        ts = datetime.now(timezone.utc).isoformat()
        v = patient.vitals

        latest = {
            "patient_id":         patient.patient_id,
            "name":               patient.name,
            "timestamp":          ts,
            "spo2":               round(v.spo2, 1),
            "hr_ecg":             round(v.hr_ecg, 1),
            "hrv_sdnn":           round(v.hrv_sdnn, 1),
            "bioz_ohms":          round(v.bioz_ohms, 1),
            "rr_imu":             round(v.rr_imu, 1),
            "cough_sum":          round(v.cough_sum, 1),
            "wheeze_pct":         round(v.wheeze_pct, 3),
            "afib_pct":           round(v.afib_pct, 3),
            "afib_days":          v.afib_days,
            "state":              patient.state.value,
        }

        risk_assessment = {
            "risk_score":        result["risk_score"],
            "risk_tier":         result["risk_tier"],
            "risk_probability":  result["risk_probability"],
            "anomaly_scores":    result["anomaly_scores"],
            "triggered_alerts":  result["triggered_alerts"],
            "recommended_action":result["recommended_action"],
            "top_risk_features": result["top_risk_features"],
            "days_since_discharge": patient.days_since_discharge,
            "timestamp":         ts,
            "simulation_state":  patient.state.value,
        }

        # Static demographics (written once, cheap to re-write)
        demographics = {
            "patient_id":          patient.patient_id,
            "name":                patient.name,
            "age":                 patient.age,
            "diagnosis":           patient.diagnosis,
            "days_since_discharge":patient.days_since_discharge,
            "chf_flag":            patient.chf_flag,
            "copd_flag":           patient.copd_flag,
            "diabetes_flag":       patient.diabetes_flag,
        }

        base = f"patients/{patient.patient_id}"
        self.firebase.write(f"{base}/latest_reading",  latest)
        self.firebase.write(f"{base}/risk_assessment", risk_assessment)
        self.firebase.write(f"{base}/demographics",    demographics)
        # Historical record (keyed by unix ms to keep ordered)
        hist_key = str(int(time.time() * 1000))
        self.firebase.write(f"{base}/readings/{hist_key}", {
            **latest, "risk_score": result["risk_score"], "risk_tier": result["risk_tier"]
        })

    def _console_log(self, patient: PatientRecord, result: dict, prev_risk: float) -> None:
        tier_emoji = {"CRITICAL": "🔴", "HIGH": "🟠", "MEDIUM": "🟡", "LOW": "🟢"}.get(result["risk_tier"], "⚪")
        arrow = "↑" if result["risk_score"] > prev_risk + 0.5 else ("↓" if result["risk_score"] < prev_risk - 0.5 else "→")
        top_alert = result["triggered_alerts"][0] if result["triggered_alerts"] else "All clear"
        print(
            f"  {patient.patient_id} {patient.name:<22} [{patient.diagnosis:<8}] "
            f"{patient.state.value:<14} | Risk: {prev_risk:5.1f} {arrow} {result['risk_score']:5.1f} "
            f"{tier_emoji} {result['risk_tier']:<8} | {top_alert[:60]}"
        )

    def step(self) -> None:
        """Run one simulation step for all patients."""
        self._tick += 1
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        print(f"\n{'='*100}")
        print(f"  RecoverPath Simulator — Tick #{self._tick:04d}  {ts}  "
              f"(interval: {self.interval}s)")
        print(f"{'='*100}")

        for patient in self.patients:
            prev_risk = self._risk_cache.get(patient.patient_id, 0.0)

            # 1. Update vitals
            update_vitals(patient)

            # 2. Score with real ML
            result = self._score_patient(patient)
            current_risk = result["risk_score"]
            self._risk_cache[patient.patient_id] = current_risk

            # 3. Advance state machine
            advance_state(patient, current_risk)

            # 4. Write to Firebase
            self._write_patient(patient, result)

            # 5. Console output
            self._console_log(patient, result, prev_risk)

    def run(self) -> None:
        """Main blocking simulation loop."""
        self._running = True
        log.info(f"Simulation starting — {len(self.patients)} patients, "
                 f"{self.interval}s interval, "
                 f"{'DRY-RUN (no Firebase)' if self.firebase.dry_run else 'LIVE Firebase'}")

        while self._running:
            t0 = time.time()
            try:
                self.step()
            except KeyboardInterrupt:
                self.stop()
                return
            except Exception as e:
                log.error(f"Step error: {e}", exc_info=True)

            elapsed = time.time() - t0
            sleep_for = max(0, self.interval - elapsed)
            if sleep_for > 0:
                log.debug(f"Step took {elapsed:.1f}s, sleeping {sleep_for:.1f}s")
                time.sleep(sleep_for)

    def stop(self) -> None:
        self._running = False
        log.info("Simulator stopped.")

    def run_in_thread(self) -> threading.Thread:
        t = threading.Thread(target=self.run, name="simulator", daemon=True)
        t.start()
        return t


# ── Controlled step API (used by demo_scenario.py) ────────────────────────────

def get_patient(simulator: RecoverPathSimulator, patient_id: str) -> Optional[PatientRecord]:
    for p in simulator.patients:
        if p.patient_id == patient_id:
            return p
    return None


def force_state(simulator: RecoverPathSimulator, patient_id: str, state: PatientState) -> None:
    p = get_patient(simulator, patient_id)
    if p:
        old = p.state
        p.state = state
        p.state_ticks = 0
        if state == PatientState.CRITICAL_EVENT:
            p.critical_duration = 5
        log.info(f"[FORCE] {patient_id} {p.name}: {old.value} -> {state.value}")


# ── CLI entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RecoverPath Patient Simulator")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print to console only — do not write to Firebase",
    )
    parser.add_argument(
        "--interval", type=float, default=UPDATE_INTERVAL_S,
        help=f"Seconds between updates (default: {UPDATE_INTERVAL_S})",
    )
    args = parser.parse_args()

    sim = RecoverPathSimulator(dry_run=args.dry_run, interval=args.interval)
    sim.start_engine()
    sim.run()
