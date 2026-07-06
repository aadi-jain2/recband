"""
RecoverPath — Production-Grade Firebase Listener

Event-driven: scores every new reading as it arrives (not polling).
Handles:
  - Automatic reconnection with exponential backoff
  - Local write buffer with retry if Firebase write fails
  - Concurrent multi-patient listening without blocking
  - Full error logging to file
  - MONITORING_GAP detection for stale patients
"""

from __future__ import annotations

import json
import logging
import os
import queue
import sys
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# ── Logging ────────────────────────────────────────────────────────────────────
LOG_DIR = Path(__file__).parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "firebase_listener.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("recoverpath.listener")


# ── Firebase init ──────────────────────────────────────────────────────────────

def _init_firebase() -> Optional[Any]:
    """Initialize Firebase Admin SDK. Returns db reference or None."""
    try:
        import firebase_admin
        from firebase_admin import credentials, db as firebase_db

        cred_path = os.environ.get("FIREBASE_CREDENTIALS_PATH", "firebase-credentials.json")
        db_url    = os.environ.get("FIREBASE_DATABASE_URL", "")

        if not db_url:
            log.warning("FIREBASE_DATABASE_URL not set — listener will not connect")
            return None

        if not firebase_admin._apps:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred, {"databaseURL": db_url})

        return firebase_db
    except Exception as e:
        log.error("Firebase init failed: %s", e)
        return None


# ── Local write buffer ─────────────────────────────────────────────────────────

class _WriteBuffer:
    """Thread-safe buffer for failed Firebase writes. Retries with backoff."""

    MAX_SIZE = 5000

    def __init__(self, db_module: Any) -> None:
        self._buf: deque = deque(maxlen=self.MAX_SIZE)
        self._db = db_module
        self._lock = threading.Lock()
        self._thread = threading.Thread(target=self._retry_loop, daemon=True)
        self._thread.start()

    def push(self, path: str, data: dict) -> None:
        with self._lock:
            self._buf.append((path, data, time.time()))
        log.debug("Buffered write to %s (buffer size=%d)", path, len(self._buf))

    def _retry_loop(self) -> None:
        while True:
            time.sleep(30)
            if not self._buf:
                continue
            with self._lock:
                items = list(self._buf)
                self._buf.clear()
            retried, failed = 0, 0
            for path, data, ts in items:
                try:
                    self._db.reference(path).set(data)
                    retried += 1
                except Exception as e:
                    failed += 1
                    with self._lock:
                        self._buf.append((path, data, ts))
                    log.warning("Retry write failed for %s: %s", path, e)
            if retried:
                log.info("Buffer retry: %d succeeded, %d still pending", retried, failed)


# ── Patient reading buffer (rolling 24h window) ────────────────────────────────

class PatientBuffer:
    """Thread-safe rolling buffer of 1440 readings (24h @ 1/min)."""

    MAX_READINGS = 1440

    def __init__(self, patient_id: str) -> None:
        self.patient_id = patient_id
        self._readings: deque = deque(maxlen=self.MAX_READINGS)
        self._lock = threading.Lock()

    def add(self, reading: dict) -> None:
        with self._lock:
            self._readings.append(reading)

    def get_all(self) -> list[dict]:
        with self._lock:
            return list(self._readings)

    def count(self) -> int:
        with self._lock:
            return len(self._readings)


# ── Per-patient listener ───────────────────────────────────────────────────────

class PatientReadingListener:
    """
    Listens to /patients/{id}/readings/ and scores on every new entry.
    Event-driven — does not poll.
    """

    def __init__(
        self,
        patient_id: str,
        engine: Any,          # RecoverPathRiskEngine
        db_module: Any,
        write_buffer: _WriteBuffer,
        score_worker: "ScoringWorker",
    ) -> None:
        self.patient_id = patient_id
        self._engine = engine
        self._db = db_module
        self._write_buffer = write_buffer
        self._score_worker = score_worker
        self._buffer = PatientBuffer(patient_id)
        self._listener_handle = None
        self._last_key_seen: Optional[str] = None

    def start(self) -> None:
        path = f"patients/{self.patient_id}/readings"
        try:
            ref = self._db.reference(path)
            self._listener_handle = ref.listen(self._on_new_data)
            log.info("Listener started for %s at %s", self.patient_id, path)
        except Exception as e:
            log.error("Failed to start listener for %s: %s", self.patient_id, e)

    def stop(self) -> None:
        if self._listener_handle:
            try:
                self._listener_handle.close()
            except Exception:
                pass

    def _on_new_data(self, event: Any) -> None:
        """Called by Firebase SDK for each change in /readings/ subtree."""
        try:
            if event.data is None:
                return
            if event.event_type == "put" and isinstance(event.data, dict):
                # Single new key written
                key = event.path.strip("/")
                if key and key != self._last_key_seen:
                    self._last_key_seen = key
                    reading = event.data
                    self._buffer.add(reading)
                    log.debug("%s: new reading at key %s", self.patient_id, key)
                    # Queue for scoring
                    self._score_worker.enqueue(self.patient_id, self._buffer.get_all())
        except Exception as e:
            log.error("%s: error processing event: %s", self.patient_id, e)


# ── Scoring worker (background thread) ────────────────────────────────────────

class ScoringWorker:
    """
    Runs ML scoring in a background thread.
    Receives (patient_id, readings_list) tasks via a queue.
    Writes results back to Firebase.
    """

    SCORE_EVERY_N = 1    # score on every new reading for real-time updates

    def __init__(self, engine: Any, db_module: Any, write_buffer: _WriteBuffer) -> None:
        self._engine = engine
        self._db = db_module
        self._write_buffer = write_buffer
        self._queue: queue.Queue = queue.Queue(maxsize=500)
        self._counts: dict[str, int] = {}
        self._thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._thread.start()

    def enqueue(self, patient_id: str, readings: list[dict]) -> None:
        try:
            self._queue.put_nowait((patient_id, readings))
        except queue.Full:
            log.warning("Scoring queue full — dropping task for %s", patient_id)

    def _worker_loop(self) -> None:
        while True:
            try:
                patient_id, readings = self._queue.get(timeout=5)
            except queue.Empty:
                continue

            self._counts[patient_id] = self._counts.get(patient_id, 0) + 1
            if self._counts[patient_id] % self.SCORE_EVERY_N != 0:
                continue

            try:
                self._score_and_write(patient_id, readings)
            except Exception as e:
                log.error("Scoring error for %s: %s", patient_id, e)

    def _score_and_write(self, patient_id: str, readings: list[dict]) -> None:
        from feature_engineering import aggregate_firebase_window
        features = aggregate_firebase_window(readings)
        result   = self._engine.score_composite(
            vitals_features=features,
            patient_id=patient_id,
        )
        now = datetime.now(timezone.utc).isoformat()
        payload = {**result, "scored_at": now, "reading_count": len(readings)}

        path = f"patients/{patient_id}/risk_assessment"
        try:
            self._db.reference(path).set(payload)
            log.info(
                "%s scored: %.1f (%s) from %d readings",
                patient_id, result["risk_score"], result["risk_tier"], len(readings)
            )
        except Exception as e:
            log.error("Firebase write failed for %s: %s — buffering", patient_id, e)
            self._write_buffer.push(path, payload)


# ── Main service ───────────────────────────────────────────────────────────────

class RecoverPathFirebaseService:
    """
    Multi-patient listener manager with automatic reconnection.
    """

    RECONNECT_BASE_S  = 5
    RECONNECT_MAX_S   = 300   # 5 min ceiling on backoff
    STALE_CHECK_S     = 120   # check for stale patients every 2 min

    def __init__(self, patient_ids: list[str]) -> None:
        self.patient_ids = patient_ids
        self._db = None
        self._engine = None
        self._listeners: dict[str, PatientReadingListener] = {}
        self._write_buffer: Optional[_WriteBuffer] = None
        self._score_worker: Optional[ScoringWorker] = None
        self._running = False
        self._reconnect_delay = self.RECONNECT_BASE_S

    def _load_engine(self) -> None:
        sys.path.insert(0, str(Path(__file__).parent))
        from inference import RecoverPathRiskEngine
        model_dir = Path(__file__).parent.parent / "models"
        self._engine = RecoverPathRiskEngine()
        self._engine.load_models(str(model_dir))
        log.info("ML engine loaded")

    def _connect(self) -> bool:
        self._db = _init_firebase()
        if self._db is None:
            return False
        self._write_buffer = _WriteBuffer(self._db)
        self._score_worker = ScoringWorker(self._engine, self._db, self._write_buffer)
        return True

    def _start_listeners(self) -> None:
        for pid in self.patient_ids:
            if pid not in self._listeners:
                listener = PatientReadingListener(
                    pid, self._engine, self._db,
                    self._write_buffer, self._score_worker
                )
                listener.start()
                self._listeners[pid] = listener

    def _stop_listeners(self) -> None:
        for listener in self._listeners.values():
            listener.stop()
        self._listeners.clear()

    def _stale_monitor_loop(self) -> None:
        """Background thread: marks patients with no data in >2h as MONITORING_GAP."""
        while self._running:
            time.sleep(self.STALE_CHECK_S)
            if self._db is None:
                continue
            for pid in self.patient_ids:
                last_ref = self._db.reference(f"patients/{pid}/latest_reading/timestamp")
                try:
                    ts_str = last_ref.get()
                    if ts_str:
                        ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                        elapsed = (datetime.now(timezone.utc) - ts).total_seconds()
                        if elapsed > 7200:
                            log.warning("%s: MONITORING GAP — last reading %dh ago", pid, int(elapsed/3600))
                            gap_ref = self._db.reference(f"patients/{pid}/monitoring_status")
                            gap_ref.set({
                                "status": "MONITORING_GAP",
                                "last_seen": ts_str,
                                "elapsed_seconds": elapsed,
                            })
                except Exception as e:
                    log.debug("Stale check error for %s: %s", pid, e)

    def run(self) -> None:
        """Main entry point. Blocks forever, reconnecting on failure."""
        self._load_engine()
        self._running = True

        stale_thread = threading.Thread(target=self._stale_monitor_loop, daemon=True)
        stale_thread.start()

        while self._running:
            log.info("Connecting to Firebase …")
            connected = self._connect()
            if not connected:
                log.error(
                    "Firebase unavailable. Retrying in %ds …",
                    self._reconnect_delay
                )
                time.sleep(self._reconnect_delay)
                self._reconnect_delay = min(self._reconnect_delay * 2, self.RECONNECT_MAX_S)
                continue

            self._reconnect_delay = self.RECONNECT_BASE_S  # reset backoff on success
            log.info("Firebase connected. Starting %d patient listeners …", len(self.patient_ids))
            self._start_listeners()

            # Keep alive — SDK handles events in background threads
            try:
                while self._running:
                    time.sleep(30)
                    log.debug("Listener heartbeat — %d patients active", len(self._listeners))
            except Exception as e:
                log.error("Listener loop error: %s — reconnecting", e)
                self._stop_listeners()

    def stop(self) -> None:
        self._running = False
        self._stop_listeners()


# ── CLI ────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="RecoverPath Firebase Listener")
    parser.add_argument("--patients", nargs="+", default=[f"P{str(i).zfill(3)}" for i in range(1, 26)])
    args = parser.parse_args()

    log.info("RecoverPath Firebase Listener starting for %d patients …", len(args.patients))
    service = RecoverPathFirebaseService(args.patients)
    try:
        service.run()
    except KeyboardInterrupt:
        log.info("Shutting down …")
        service.stop()
