"""
RecoverPath — Firebase Realtime Database Listener (Stub)

Connects to Firebase, accumulates patient readings, and triggers
risk scoring when enough data has been collected.

Setup:
  1. Download your Firebase service account JSON from:
     Firebase Console → Project Settings → Service Accounts → Generate new private key
  2. Save it as firebase_credentials.json in the project root (NEVER commit this file)
  3. Copy .env.example to .env and fill in FIREBASE_DATABASE_URL
  4. Run: python src/firebase_listener.py
"""

from __future__ import annotations

import os
import sys
import time
import threading
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

# Load .env for Firebase config
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass  # python-dotenv optional

# ── Configuration ──────────────────────────────────────────────────────────────
FIREBASE_DATABASE_URL = os.getenv("FIREBASE_DATABASE_URL", "")
FIREBASE_CREDENTIALS_PATH = os.getenv(
    "FIREBASE_CREDENTIALS_PATH",
    str(Path(__file__).parent.parent / "firebase_credentials.json"),
)

SCORE_EVERY_N_READINGS = 60    # 1 hour of data (60 readings × 60s = 1hr)
FULL_WINDOW_READINGS = 1440    # 24 hours

MODELS_DIR = Path(__file__).parent.parent / "models"


# ── Firebase Admin SDK initialization ─────────────────────────────────────────

def init_firebase():
    """
    Initialize Firebase Admin SDK.
    Requires FIREBASE_DATABASE_URL env variable and credentials JSON file.
    """
    try:
        import firebase_admin
        from firebase_admin import credentials, db

        if not firebase_admin._apps:
            cred = credentials.Certificate(FIREBASE_CREDENTIALS_PATH)
            firebase_admin.initialize_app(cred, {
                "databaseURL": FIREBASE_DATABASE_URL,
            })
            print(f"[Firebase] Initialized with URL: {FIREBASE_DATABASE_URL}")
        return db
    except ImportError:
        print("[Firebase] firebase-admin not installed. Run: pip install firebase-admin")
        return None
    except Exception as e:
        print(f"[Firebase] Initialization failed: {e}")
        print("  → Check FIREBASE_DATABASE_URL and firebase_credentials.json")
        return None


# ── Risk Engine loader ─────────────────────────────────────────────────────────

def load_risk_engine():
    """Load the RecoverPath inference engine."""
    sys.path.insert(0, str(Path(__file__).parent))
    from inference import RecoverPathRiskEngine

    engine = RecoverPathRiskEngine()
    try:
        engine.load_models(str(MODELS_DIR))
        print("[Engine] Risk engine loaded successfully.")
        return engine
    except Exception as e:
        print(f"[Engine] Could not load models: {e}")
        print("  → Run src/train.py to generate models first.")
        return None


# ── Patient reading buffer ─────────────────────────────────────────────────────

class PatientBuffer:
    """Thread-safe rolling buffer of raw readings per patient."""

    def __init__(self, max_size: int = FULL_WINDOW_READINGS):
        self._buffers: dict[str, list[dict]] = defaultdict(list)
        self._lock = threading.Lock()
        self._max_size = max_size

    def add(self, patient_id: str, reading: dict) -> int:
        """Add a reading; returns current buffer size."""
        with self._lock:
            buf = self._buffers[patient_id]
            buf.append(reading)
            if len(buf) > self._max_size:
                buf.pop(0)  # sliding window
            return len(buf)

    def get(self, patient_id: str) -> list[dict]:
        with self._lock:
            return list(self._buffers[patient_id])

    def clear(self, patient_id: str):
        with self._lock:
            self._buffers[patient_id].clear()


# ── Firebase listener callbacks ────────────────────────────────────────────────

class PatientReadingListener:
    """
    Listens to /patients/{patient_id}/readings/ and triggers scoring.

    Firebase path structure expected:
      /patients/{patient_id}/readings/{timestamp}/
        spo2_pct: float
        hr_ppg_bpm: float
        hr_ecg_bpm: float
        hrv_sdnn_ms: float
        hrv_rmssd_ms: float
        rr_interval_ms: float
        qt_interval_ms: float
        afib_flag: int (0 or 1)
        bioz_ohms: float
        bioz_rr_bpm: float
        thoracic_fluid_index: float
        rr_imu_bpm: float
        activity_score: float
        posture_supine: int (0 or 1)
        cough_count: int
        wheeze_flag: int (0 or 1)
        timestamp_unix: int
    """

    def __init__(
        self,
        patient_id: str,
        db_module,
        buffer: PatientBuffer,
        engine,
    ):
        self.patient_id = patient_id
        self.db = db_module
        self.buffer = buffer
        self.engine = engine

    def on_new_reading(self, event):
        """
        Called by Firebase SDK whenever a new reading is written.
        """
        if event.data is None:
            return

        reading = event.data
        if not isinstance(reading, dict):
            return

        n = self.buffer.add(self.patient_id, reading)
        print(f"[{self.patient_id}] Reading #{n} received "
              f"(SpO2={reading.get('spo2_pct', '?')}, "
              f"HR={reading.get('hr_ppg_bpm', '?')})")

        should_score = (n % SCORE_EVERY_N_READINGS == 0) or (n >= FULL_WINDOW_READINGS)
        if should_score and self.engine:
            self._run_scoring()

    def _run_scoring(self):
        records = self.buffer.get(self.patient_id)
        print(f"[{self.patient_id}] Scoring with {len(records)} readings …")
        try:
            result = self.engine.score_from_firebase_stream(
                records, patient_id=self.patient_id
            )
            self._write_risk_score(result)
        except Exception as e:
            print(f"[{self.patient_id}] Scoring error: {e}")

    def _write_risk_score(self, result: dict):
        """Write risk score result back to Firebase."""
        path = f"patients/{self.patient_id}/risk_score"
        try:
            ref = self.db.reference(path)
            ref.set({
                "risk_score": result["risk_score"],
                "risk_tier": result["risk_tier"],
                "risk_probability": result["risk_probability"],
                "anomaly_scores": result["anomaly_scores"],
                "triggered_alerts": result["triggered_alerts"],
                "recommended_action": result["recommended_action"],
                "top_risk_features": result["top_risk_features"],
                "days_since_discharge": result["days_since_discharge"],
                "scored_at": result["timestamp"],
            })
            print(
                f"[{self.patient_id}] Risk score written → Firebase {path}\n"
                f"  Tier: {result['risk_tier']}  Score: {result['risk_score']}"
            )
        except Exception as e:
            print(f"[{self.patient_id}] Failed to write score to Firebase: {e}")


# ── Multi-patient listener ─────────────────────────────────────────────────────

class RecoverPathFirebaseService:
    """
    Manages listeners for all active patients.

    Usage:
      service = RecoverPathFirebaseService()
      service.start(patient_ids=["P001", "P002"])
      service.run_forever()
    """

    def __init__(self):
        self.db = init_firebase()
        self.engine = load_risk_engine()
        self.buffer = PatientBuffer()
        self._listeners: list = []

    def start(self, patient_ids: list[str]):
        if self.db is None:
            print("[Service] Firebase not initialized. Listener cannot start.")
            return

        for pid in patient_ids:
            path = f"patients/{pid}/readings"
            try:
                ref = self.db.reference(path)
                listener_obj = PatientReadingListener(
                    pid, self.db, self.buffer, self.engine
                )
                # Firebase SDK streaming listener
                ref.listen(listener_obj.on_new_reading)
                self._listeners.append((pid, ref))
                print(f"[Service] Listening on /{path}")
            except Exception as e:
                print(f"[Service] Failed to start listener for {pid}: {e}")

    def run_forever(self):
        print("[Service] RecoverPath Firebase listener running. Press Ctrl+C to stop.")
        try:
            while True:
                time.sleep(5)
        except KeyboardInterrupt:
            print("[Service] Shutting down.")


# ── .env.example generator ────────────────────────────────────────────────────

def create_env_example():
    env_example = Path(__file__).parent.parent / ".env.example"
    if not env_example.exists():
        env_example.write_text(
            "# RecoverPath Firebase Configuration\n"
            "FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com\n"
            "FIREBASE_CREDENTIALS_PATH=firebase_credentials.json\n"
        )
        print(f"[Setup] Created {env_example}")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    create_env_example()

    if not FIREBASE_DATABASE_URL:
        print("\n[Service] No FIREBASE_DATABASE_URL set in .env.")
        print("  1. Create a Firebase project at https://console.firebase.google.com")
        print("  2. Enable Realtime Database")
        print("  3. Download service account key → firebase_credentials.json")
        print("  4. Copy .env.example to .env and set FIREBASE_DATABASE_URL")
        print("  5. Re-run this script")
        sys.exit(0)

    service = RecoverPathFirebaseService()
    # Replace with real patient IDs from your Firebase project
    service.start(patient_ids=["P001", "P002", "P003"])
    service.run_forever()
