"""
RecoverPath — Feature Engineering Pipeline
Aggregates 24-hour Firebase JSON streams into ML-ready feature dicts.
"""

from __future__ import annotations

import math
import numpy as np
from typing import Any


# ── Constants ─────────────────────────────────────────────────────────────────

MISSING_THRESHOLD = 0.20   # interpolate if < 20% missing, else NaN
WINDOW_MINUTES = 1440      # 24 hours × 60 min

FEATURE_SCHEMA = [
    # PPG
    "spo2_mean", "spo2_min", "spo2_std", "spo2_time_below_92_pct",
    "hr_ppg_mean", "hr_ppg_std", "hr_ppg_max", "hr_ppg_trend_6hr",
    # ECG
    "hr_ecg_mean", "rr_interval_mean", "rr_interval_std",
    "hrv_sdnn", "hrv_rmssd", "qt_interval_mean",
    "afib_pct_readings", "afib_days_in_window",
    # BioZ
    "bioz_ohms_mean", "bioz_ohms_trend_24hr", "bioz_delta_from_baseline",
    "thoracic_fluid_index", "bioz_rr_mean",
    # IMU
    "rr_imu_mean", "rr_imu_std", "activity_mean",
    "nocturnal_activity_mean", "posture_supine_pct",
    # Audio
    "cough_sum_24hr", "cough_max_hourly", "cough_trend_6hr", "wheeze_pct_hours",
    # Cross-sensor
    "hr_sensor_disagreement", "rr_sensor_disagreement",
    # Context
    "age", "days_since_discharge", "num_prior_admissions_90d",
    "num_medications", "num_diagnoses",
    "diabetes_flag", "copd_flag", "chf_flag",
    # Placeholder ECG
    "hrv_lf_hf_ratio", "qt_corrected",
]


# ── Interpolation helpers ─────────────────────────────────────────────────────

def _extract_series(records: list[dict], key: str) -> list[float | None]:
    return [r.get(key) for r in records]


def _clean_series(values: list[float | None]) -> np.ndarray | None:
    """
    Returns a float array with NaN for missing, or None if too sparse to use.
    """
    arr = np.array([v if v is not None else np.nan for v in values], dtype=float)
    total = len(arr)
    n_missing = np.isnan(arr).sum()
    if total == 0:
        return None
    missing_frac = n_missing / total
    if missing_frac > (1 - MISSING_THRESHOLD):
        return None
    if 0 < n_missing <= total * MISSING_THRESHOLD:
        # Linear interpolation over short gaps
        nans = np.isnan(arr)
        x = np.arange(total)
        arr[nans] = np.interp(x[nans], x[~nans], arr[~nans])
    return arr


def _safe_stat(values: list[float | None], stat: str = "mean") -> float:
    arr = _clean_series(values)
    if arr is None or len(arr) == 0:
        return float("nan")
    fns = {
        "mean": np.nanmean,
        "min": np.nanmin,
        "max": np.nanmax,
        "std": np.nanstd,
        "sum": np.nansum,
    }
    return float(fns[stat](arr))


def _linear_trend(arr: np.ndarray) -> float:
    """Slope of least-squares fit (units per sample)."""
    valid = ~np.isnan(arr)
    if valid.sum() < 2:
        return float("nan")
    x = np.where(valid)[0].astype(float)
    y = arr[valid]
    coef = np.polyfit(x, y, 1)
    return float(coef[0])


# ── Main aggregation function ─────────────────────────────────────────────────

def aggregate_firebase_window(records: list[dict]) -> dict:
    """
    Aggregate up to 1440 Firebase JSON records (60-second intervals, 24 hours)
    into a single feature dictionary matching FEATURE_SCHEMA.

    Args:
        records: list of dicts, each representing one 60-second reading.

    Returns:
        Feature dict (keys = FEATURE_SCHEMA). Missing/sparse fields = NaN.
    """
    feat: dict[str, Any] = {}

    # ── PPG (MAX30102) ────────────────────────────────────────────────────────
    spo2_vals = _extract_series(records, "spo2_pct")
    hr_ppg_vals = _extract_series(records, "hr_ppg_bpm")

    spo2_arr = _clean_series(spo2_vals)
    if spo2_arr is not None:
        feat["spo2_mean"] = float(np.nanmean(spo2_arr))
        feat["spo2_min"] = float(np.nanmin(spo2_arr))
        feat["spo2_std"] = float(np.nanstd(spo2_arr))
        feat["spo2_time_below_92_pct"] = float(np.nanmean(spo2_arr < 92))
    else:
        feat.update({"spo2_mean": np.nan, "spo2_min": np.nan,
                     "spo2_std": np.nan, "spo2_time_below_92_pct": np.nan})

    hr_ppg_arr = _clean_series(hr_ppg_vals)
    if hr_ppg_arr is not None:
        feat["hr_ppg_mean"] = float(np.nanmean(hr_ppg_arr))
        feat["hr_ppg_std"] = float(np.nanstd(hr_ppg_arr))
        feat["hr_ppg_max"] = float(np.nanmax(hr_ppg_arr))
        # 6-hour trend: last 360 readings vs first 360
        n6 = min(360, len(hr_ppg_arr) // 4)
        feat["hr_ppg_trend_6hr"] = float(
            np.nanmean(hr_ppg_arr[-n6:]) - np.nanmean(hr_ppg_arr[:n6])
        )
    else:
        feat.update({"hr_ppg_mean": np.nan, "hr_ppg_std": np.nan,
                     "hr_ppg_max": np.nan, "hr_ppg_trend_6hr": np.nan})

    # ── ECG (MAX30003) ────────────────────────────────────────────────────────
    hr_ecg_vals = _extract_series(records, "hr_ecg_bpm")
    rr_vals = _extract_series(records, "rr_interval_ms")
    hrv_sdnn_vals = _extract_series(records, "hrv_sdnn_ms")
    hrv_rmssd_vals = _extract_series(records, "hrv_rmssd_ms")
    qt_vals = _extract_series(records, "qt_interval_ms")
    afib_vals = _extract_series(records, "afib_flag")

    feat["hr_ecg_mean"] = _safe_stat(hr_ecg_vals, "mean")
    feat["rr_interval_mean"] = _safe_stat(rr_vals, "mean")
    feat["rr_interval_std"] = _safe_stat(rr_vals, "std")
    feat["hrv_sdnn"] = _safe_stat(hrv_sdnn_vals, "mean")
    feat["hrv_rmssd"] = _safe_stat(hrv_rmssd_vals, "mean")
    feat["qt_interval_mean"] = _safe_stat(qt_vals, "mean")

    afib_arr = _clean_series(afib_vals)
    if afib_arr is not None:
        feat["afib_pct_readings"] = float(np.nanmean(afib_arr > 0))
        # Approximate days: each reading is 1 min → 1440 readings/day
        minutes_per_day = 1440
        day_flags = [
            np.nanmean(afib_arr[i:i+minutes_per_day]) > 0
            for i in range(0, len(afib_arr), minutes_per_day)
        ]
        feat["afib_days_in_window"] = int(sum(day_flags))
    else:
        feat["afib_pct_readings"] = np.nan
        feat["afib_days_in_window"] = np.nan

    feat["hrv_lf_hf_ratio"] = np.nan   # requires spectral analysis, not available
    feat["qt_corrected"] = np.nan       # requires RR-based correction

    # ── BioZ (MAX30009) ───────────────────────────────────────────────────────
    bioz_vals = _extract_series(records, "bioz_ohms")
    bioz_rr_vals = _extract_series(records, "bioz_rr_bpm")
    tfi_vals = _extract_series(records, "thoracic_fluid_index")

    bioz_arr = _clean_series(bioz_vals)
    if bioz_arr is not None:
        feat["bioz_ohms_mean"] = float(np.nanmean(bioz_arr))
        feat["bioz_ohms_trend_24hr"] = _linear_trend(bioz_arr) * len(bioz_arr)
        feat["bioz_delta_from_baseline"] = float(
            np.nanmean(bioz_arr[-60:]) - np.nanmean(bioz_arr[:60])
        )
    else:
        feat.update({"bioz_ohms_mean": np.nan, "bioz_ohms_trend_24hr": np.nan,
                     "bioz_delta_from_baseline": np.nan})

    feat["thoracic_fluid_index"] = _safe_stat(tfi_vals, "mean")
    feat["bioz_rr_mean"] = _safe_stat(bioz_rr_vals, "mean")

    # ── IMU (MPU6050) ─────────────────────────────────────────────────────────
    rr_imu_vals = _extract_series(records, "rr_imu_bpm")
    activity_vals = _extract_series(records, "activity_score")
    posture_vals = _extract_series(records, "posture_supine")

    feat["rr_imu_mean"] = _safe_stat(rr_imu_vals, "mean")
    feat["rr_imu_std"] = _safe_stat(rr_imu_vals, "std")
    feat["activity_mean"] = _safe_stat(activity_vals, "mean")

    act_arr = _clean_series(activity_vals)
    if act_arr is not None:
        # Nocturnal: assume first 480 records = 8 hours from sleep onset
        night_seg = act_arr[:480] if len(act_arr) >= 480 else act_arr
        feat["nocturnal_activity_mean"] = float(np.nanmean(night_seg))
    else:
        feat["nocturnal_activity_mean"] = np.nan

    post_arr = _clean_series(posture_vals)
    feat["posture_supine_pct"] = (
        float(np.nanmean(post_arr > 0.5)) if post_arr is not None else np.nan
    )

    # ── Audio (INMP441) ───────────────────────────────────────────────────────
    cough_vals = _extract_series(records, "cough_count")
    wheeze_vals = _extract_series(records, "wheeze_flag")

    cough_arr = _clean_series(cough_vals)
    if cough_arr is not None:
        feat["cough_sum_24hr"] = float(np.nansum(cough_arr))
        # Hourly buckets (60 readings each)
        hourly = [np.nansum(cough_arr[i:i+60]) for i in range(0, len(cough_arr), 60)]
        feat["cough_max_hourly"] = float(max(hourly)) if hourly else np.nan
        # 6-hour trend
        n6 = max(1, len(hourly) // 4)
        feat["cough_trend_6hr"] = float(
            np.mean(hourly[-n6:]) - np.mean(hourly[:n6])
        ) if len(hourly) >= 2 else 0.0
    else:
        feat.update({"cough_sum_24hr": np.nan, "cough_max_hourly": np.nan,
                     "cough_trend_6hr": np.nan})

    wheeze_arr = _clean_series(wheeze_vals)
    if wheeze_arr is not None:
        # pct of hours with wheeze
        hourly_wheeze = [
            float(np.nanmean(wheeze_arr[i:i+60]) > 0)
            for i in range(0, len(wheeze_arr), 60)
        ]
        feat["wheeze_pct_hours"] = float(np.mean(hourly_wheeze)) if hourly_wheeze else np.nan
    else:
        feat["wheeze_pct_hours"] = np.nan

    # ── Patient context (populated by merge_uci_features or defaults) ─────────
    for key in ["age", "days_since_discharge", "num_prior_admissions_90d",
                "num_medications", "num_diagnoses",
                "diabetes_flag", "copd_flag", "chf_flag"]:
        feat.setdefault(key, np.nan)

    # ── Cross-sensor ──────────────────────────────────────────────────────────
    feat = compute_cross_sensor_features(feat)

    return feat


# ── UCI merge ─────────────────────────────────────────────────────────────────

def merge_uci_features(window_features: dict, uci_row: dict) -> dict:
    """
    Merge UCI demographic/clinical columns into a windowed feature dict.

    Relevant UCI columns mapped to RecoverPath schema:
        age                 → age
        time_in_hospital    → (informational)
        num_medications     → num_medications
        number_diagnoses    → num_diagnoses
        readmitted          → (label, not merged here)
        diag_1/2/3          → diabetes_flag, chf_flag, copd_flag (ICD proxy)
    """
    merged = dict(window_features)

    if "age" in uci_row:
        # UCI age is a bracket like "[60-70)" — take midpoint
        age_str = str(uci_row["age"]).strip("[])(")
        try:
            lo, hi = [float(x) for x in age_str.split("-")]
            merged["age"] = (lo + hi) / 2
        except Exception:
            merged["age"] = window_features.get("age", np.nan)

    if "num_medications" in uci_row:
        try:
            merged["num_medications"] = int(uci_row["num_medications"])
        except Exception:
            pass

    if "number_diagnoses" in uci_row:
        try:
            merged["num_diagnoses"] = int(uci_row["number_diagnoses"])
        except Exception:
            pass

    # ICD-9 proxy flags
    diag_codes = [
        str(uci_row.get(f"diag_{i}", "")) for i in range(1, 4)
    ]
    # Diabetes: ICD9 250.x
    merged["diabetes_flag"] = int(any(d.startswith("250") for d in diag_codes))
    # CHF: ICD9 428.x
    merged["chf_flag"] = int(any(d.startswith("428") for d in diag_codes))
    # COPD: ICD9 491-496
    merged["copd_flag"] = int(
        any(d[:3].isdigit() and 491 <= int(d[:3]) <= 496 for d in diag_codes)
    )

    return merged


# ── Cross-sensor features ─────────────────────────────────────────────────────

def compute_cross_sensor_features(features: dict) -> dict:
    """
    Add cross-sensor disagreement features.
    These flag potential sensor failures or physiological anomalies.
    """
    hr_ecg = features.get("hr_ecg_mean", np.nan)
    hr_ppg = features.get("hr_ppg_mean", np.nan)
    bioz_rr = features.get("bioz_rr_mean", np.nan)
    rr_imu = features.get("rr_imu_mean", np.nan)

    features["hr_sensor_disagreement"] = (
        abs(hr_ecg - hr_ppg)
        if not (math.isnan(hr_ecg) or math.isnan(hr_ppg))
        else np.nan
    )
    features["rr_sensor_disagreement"] = (
        abs(bioz_rr - rr_imu)
        if not (math.isnan(bioz_rr) or math.isnan(rr_imu))
        else np.nan
    )
    return features
