"""
RecoverPath — Unified Data Ingestion Layer

Single abstraction accepting readings from three sources:
  1. ESP32C6 hardware (real sensor data via Firebase)
  2. Simulator (synthetic patients for demo/dev)
  3. Manual entry (coordinator-entered vitals)

All three write to the same Firebase schema. The ML model never knows
or cares which source the data came from.
"""

from __future__ import annotations

import logging
import math
import threading
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger("recoverpath.ingestion")


# ── Source tag ─────────────────────────────────────────────────────────────────

class ReadingSource(Enum):
    ESP32_HARDWARE = "hardware"
    SIMULATOR      = "simulator"
    MANUAL_ENTRY   = "manual"


# ── Data quality flags ─────────────────────────────────────────────────────────

class DataQuality(Enum):
    VALID            = "valid"
    SENSOR_ERROR     = "sensor_error"     # out-of-range reading
    MISSING_FIELDS   = "missing_fields"   # >3 critical fields missing
    STALE            = "stale"            # no data for >2 hours


# ── Validated reading ──────────────────────────────────────────────────────────

@dataclass
class ValidatedReading:
    patient_id: str
    timestamp: str                    # ISO 8601 wall-clock UTC
    firebase_key: str                 # safe key: YYYY-MM-DDTHH-MM-SSZ
    source: ReadingSource

    # Vitals (all may be None if sensor absent)
    spo2: Optional[float]             = None
    hr_ecg: Optional[float]           = None
    hr_ppg: Optional[float]           = None
    hrv_sdnn: Optional[float]         = None
    bioz_ohms: Optional[float]        = None
    rr_imu: Optional[float]           = None
    cough_sum: Optional[float]        = None
    wheeze_pct: Optional[float]       = None
    afib_pct: Optional[float]         = None
    afib_days: Optional[int]          = None
    state: str                        = "UNKNOWN"

    quality: DataQuality              = DataQuality.VALID
    quality_notes: list[str]          = field(default_factory=list)
    data_sufficiency: str             = "full"   # full | partial | insufficient


# ── Validation rules ───────────────────────────────────────────────────────────

VALID_RANGES: dict[str, tuple[float, float]] = {
    "spo2":      (70.0, 100.0),
    "hr_ecg":    (30.0, 220.0),
    "hr_ppg":    (30.0, 220.0),
    "hrv_sdnn":  (0.0,  300.0),
    "bioz_ohms": (5.0,  300.0),
    "rr_imu":    (4.0,  60.0),
    "cough_sum": (0.0,  500.0),
    "wheeze_pct":(0.0,  1.0),
    "afib_pct":  (0.0,  1.0),
}

CRITICAL_FIELDS = {"spo2", "hr_ecg", "hr_ppg"}


def validate_reading(
    patient_id: str,
    raw: dict[str, Any],
    source: ReadingSource,
) -> ValidatedReading:
    """
    Validate a raw reading dict.
    Returns a ValidatedReading with quality flags set appropriately.
    Never raises — always returns something usable.
    """
    now    = datetime.now(timezone.utc)
    ts     = now.isoformat()
    fkey   = now.strftime("%Y-%m-%dT%H-%M-%SZ")

    notes: list[str] = []
    quality = DataQuality.VALID
    missing_critical = 0

    def _get(key: str) -> Optional[float]:
        nonlocal missing_critical, quality
        val = raw.get(key)
        if val is None or (isinstance(val, float) and math.isnan(val)):
            if key in CRITICAL_FIELDS:
                missing_critical += 1
            return None
        val = float(val)
        lo, hi = VALID_RANGES.get(key, (-1e9, 1e9))
        if val < lo or val > hi:
            notes.append(f"{key}={val:.1f} out of range [{lo},{hi}] — flagged as sensor error")
            quality = DataQuality.SENSOR_ERROR
            return None   # treat out-of-range as missing
        return val

    spo2      = _get("spo2")
    hr_ecg    = _get("hr_ecg")
    hr_ppg    = _get("hr_ppg") or hr_ecg
    hrv_sdnn  = _get("hrv_sdnn")
    bioz_ohms = _get("bioz_ohms")
    rr_imu    = _get("rr_imu")
    cough_sum = _get("cough_sum")
    wheeze_pct = _get("wheeze_pct")
    afib_pct  = _get("afib_pct")
    afib_days = int(raw.get("afib_days", 0) or 0)
    state     = str(raw.get("state", "UNKNOWN"))

    if missing_critical >= 3:
        quality = DataQuality.MISSING_FIELDS
        notes.append(f"Too many critical fields missing ({missing_critical})")

    # Data sufficiency
    available = sum(1 for v in [spo2, hr_ecg, hrv_sdnn, bioz_ohms, rr_imu, afib_pct] if v is not None)
    if available >= 5:
        sufficiency = "full"
    elif available >= 2:
        sufficiency = "partial"
    else:
        sufficiency = "insufficient"

    return ValidatedReading(
        patient_id       = patient_id,
        timestamp        = ts,
        firebase_key     = fkey,
        source           = source,
        spo2             = spo2,
        hr_ecg           = hr_ecg,
        hr_ppg           = hr_ppg,
        hrv_sdnn         = hrv_sdnn,
        bioz_ohms        = bioz_ohms,
        rr_imu           = rr_imu,
        cough_sum        = cough_sum,
        wheeze_pct       = wheeze_pct,
        afib_pct         = afib_pct,
        afib_days        = afib_days,
        state            = state,
        quality          = quality,
        quality_notes    = notes,
        data_sufficiency = sufficiency,
    )


def reading_to_firebase_dict(r: ValidatedReading) -> dict:
    """Serialize a validated reading to the canonical Firebase schema."""
    return {
        "patient_id":      r.patient_id,
        "timestamp":       r.timestamp,
        "source":          r.source.value,
        "spo2":            r.spo2,
        "hr_ecg":          r.hr_ecg,
        "hr_ppg":          r.hr_ppg,
        "hrv_sdnn":        r.hrv_sdnn,
        "bioz_ohms":       r.bioz_ohms,
        "rr_imu":          r.rr_imu,
        "cough_sum":       r.cough_sum,
        "wheeze_pct":      r.wheeze_pct,
        "afib_pct":        r.afib_pct,
        "afib_days":       r.afib_days,
        "state":           r.state,
        "data_quality":    r.quality.value,
        "quality_notes":   r.quality_notes,
        "data_sufficiency": r.data_sufficiency,
    }


# ── Stale monitoring ───────────────────────────────────────────────────────────

class MonitoringGapTracker:
    """
    Tracks last-seen time per patient.
    If a patient hasn't had a reading in >2 hours, marks them MONITORING_GAP.
    """
    STALE_THRESHOLD_S = 7200   # 2 hours

    def __init__(self) -> None:
        self._last_seen: dict[str, datetime] = {}
        self._lock = threading.Lock()

    def record(self, patient_id: str) -> None:
        with self._lock:
            self._last_seen[patient_id] = datetime.now(timezone.utc)

    def is_stale(self, patient_id: str) -> bool:
        with self._lock:
            ts = self._last_seen.get(patient_id)
            if ts is None:
                return False  # never seen = not our patient
            elapsed = (datetime.now(timezone.utc) - ts).total_seconds()
            return elapsed > self.STALE_THRESHOLD_S

    def seconds_since(self, patient_id: str) -> Optional[float]:
        with self._lock:
            ts = self._last_seen.get(patient_id)
            if ts is None:
                return None
            return (datetime.now(timezone.utc) - ts).total_seconds()

    def all_stale(self) -> list[str]:
        with self._lock:
            result = []
            now = datetime.now(timezone.utc)
            for pid, ts in self._last_seen.items():
                if (now - ts).total_seconds() > self.STALE_THRESHOLD_S:
                    result.append(pid)
            return result


# ── Ingestion pipeline ─────────────────────────────────────────────────────────

class DataIngestionPipeline:
    """
    Single entry point for all incoming patient readings.
    Validates, tags source, then calls registered callbacks.

    Usage:
        pipeline = DataIngestionPipeline()
        pipeline.register_callback(on_new_reading)
        pipeline.ingest("P001", raw_dict, ReadingSource.SIMULATOR)
    """

    def __init__(self) -> None:
        self._callbacks: list[Callable[[ValidatedReading], None]] = []
        self._gap_tracker = MonitoringGapTracker()
        self._lock = threading.Lock()
        self._stats: dict[str, int] = {
            "total": 0, "valid": 0, "sensor_errors": 0, "insufficient": 0
        }

    def register_callback(self, fn: Callable[[ValidatedReading], None]) -> None:
        with self._lock:
            self._callbacks.append(fn)

    def ingest(
        self,
        patient_id: str,
        raw: dict[str, Any],
        source: ReadingSource,
    ) -> ValidatedReading:
        """Validate and dispatch a reading. Returns the validated reading."""
        reading = validate_reading(patient_id, raw, source)
        self._gap_tracker.record(patient_id)

        with self._lock:
            self._stats["total"] += 1
            if reading.quality == DataQuality.VALID:
                self._stats["valid"] += 1
            elif reading.quality == DataQuality.SENSOR_ERROR:
                self._stats["sensor_errors"] += 1
            if reading.data_sufficiency == "insufficient":
                self._stats["insufficient"] += 1

        if reading.quality == DataQuality.MISSING_FIELDS:
            logger.warning(
                "Patient %s: reading rejected — too many missing fields: %s",
                patient_id, reading.quality_notes
            )
        elif reading.quality == DataQuality.SENSOR_ERROR:
            logger.warning(
                "Patient %s: sensor error flagged: %s",
                patient_id, reading.quality_notes
            )

        for fn in self._callbacks:
            try:
                fn(reading)
            except Exception as e:
                logger.error("Callback error for %s: %s", patient_id, e)

        return reading

    def check_stale_patients(self) -> list[str]:
        """Return list of patient IDs with no data in >2 hours."""
        return self._gap_tracker.all_stale()

    def stats(self) -> dict:
        with self._lock:
            return dict(self._stats)


# ── Singleton for process-wide use ────────────────────────────────────────────
_pipeline: Optional[DataIngestionPipeline] = None


def get_pipeline() -> DataIngestionPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = DataIngestionPipeline()
    return _pipeline
