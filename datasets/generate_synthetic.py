"""
RecoverPath — Synthetic Vitals Generator (v2)
Produces 60,000 clinically-grounded 24-hour patient windows with
an explicit 4-level severity gradient: LOW / MEDIUM / HIGH / CRITICAL.
This ensures the XGBoost meta-classifier learns a monotonic risk function.
"""

import numpy as np
import pandas as pd
from pathlib import Path

SEED = 42
N_PATIENTS = 60_000          # larger dataset for better generalisation
OUT_DIR = Path(__file__).parent
OUT_PATH = OUT_DIR / "synthetic_vitals.csv"

rng = np.random.default_rng(SEED)


# ── Per-severity clinical distributions ──────────────────────────────────────
# Each severity tier maps to a clinical phenotype. We sample from these
# distributions and assign a readmission label probabilistically.

TIERS = {
    "LOW":      {"weight": 0.35, "label_prob": 0.05},   # healthy post-discharge
    "MEDIUM":   {"weight": 0.30, "label_prob": 0.20},   # mild concern
    "HIGH":     {"weight": 0.20, "label_prob": 0.55},   # significant deterioration
    "CRITICAL": {"weight": 0.15, "label_prob": 0.90},   # near-readmission
}

CONDITIONS = ["CHF", "COPD", "Diabetes", "PostSurg"]
COND_WEIGHTS = [0.35, 0.30, 0.20, 0.15]


def _clip(arr, lo, hi):
    return np.clip(arr, lo, hi)


def sample_tier(tier: str, n: int, condition: str) -> dict:
    """Return a dict of feature arrays for n patients at the given severity tier."""

    # ── Severity multipliers ─────────────────────────────────────────────────
    # Each tier degrades physiology relative to LOW (stable) baseline.
    severity = {"LOW": 0.0, "MEDIUM": 0.33, "HIGH": 0.67, "CRITICAL": 1.0}[tier]

    # ── Shared noise ─────────────────────────────────────────────────────────
    noise = lambda mu, sigma, lo, hi: _clip(rng.normal(mu, sigma, n), lo, hi)

    # ── Oxygen saturation ────────────────────────────────────────────────────
    # LOW: ~97-98%, CRITICAL: ~85-89%
    spo2_base = {
        "CHF": 93, "COPD": 91, "Diabetes": 97, "PostSurg": 96
    }.get(condition, 96)
    spo2_drop = severity * {"LOW": 0, "MEDIUM": 2, "HIGH": 5, "CRITICAL": 10}[tier]
    spo2_mean = noise(spo2_base - spo2_drop, 1.5 + severity * 1.5, 72, 100)
    spo2_min  = spo2_mean - noise(1 + severity * 4, 0.5, 0, 8)
    spo2_min  = _clip(spo2_min, 70, 100)
    spo2_std  = noise(0.5 + severity * 2.5, 0.3, 0.1, 5)
    # Time below 92%: LOW ~0%, CRITICAL ~30-50%
    spo2_below = _clip(rng.beta(1 + severity * 4, 8 - severity * 4, n) * (severity * 0.6), 0, 0.8)

    # ── Heart rate ───────────────────────────────────────────────────────────
    hr_base = {"CHF": 88, "COPD": 82, "Diabetes": 80, "PostSurg": 78}.get(condition, 80)
    hr_ppg_mean  = noise(hr_base + severity * 22, 8 + severity * 8, 40, 160)
    hr_ecg_mean  = hr_ppg_mean + noise(0, 2, -5, 5)
    hr_ppg_std   = noise(5 + severity * 14, 2, 1, 25)
    hr_ppg_max   = hr_ppg_mean + noise(15 + severity * 25, 5, 0, 60)
    hr_ppg_trend = noise(0 + severity * 5, 2, -5, 15)

    # ── HRV ─────────────────────────────────────────────────────────────────
    # LOW: ~45-55ms, CRITICAL: ~8-12ms
    hrv_base = {"CHF": 22, "COPD": 28, "Diabetes": 30, "PostSurg": 38}.get(condition, 35)
    hrv_sdnn  = noise(hrv_base * (1 - severity * 0.75), 5, 4, 120)
    hrv_rmssd = hrv_sdnn * noise(0.9, 0.15, 0.5, 1.5)

    # ── Bioimpedance ─────────────────────────────────────────────────────────
    # LOW: stable ~65-75 ohms, CRITICAL: dropping/low ~40-50 ohms
    bioz_base = {"CHF": 55, "COPD": 60, "Diabetes": 65, "PostSurg": 68}.get(condition, 65)
    bioz_ohms_mean     = noise(bioz_base - severity * 20, 6, 20, 100)
    bioz_trend         = noise(-severity * 0.6, 0.2, -2, 1)   # negative = fluid accumulating
    bioz_delta         = noise(severity * 14, 3, -2, 25)      # LOW: ~0, CRITICAL: ~12-18
    thoracic_fluid     = noise(0.30 + severity * 0.45, 0.08, 0, 1)

    # ── Respiratory ──────────────────────────────────────────────────────────
    rr_base = {"CHF": 21, "COPD": 22, "Diabetes": 17, "PostSurg": 16}.get(condition, 17)
    bioz_rr_mean = noise(rr_base + severity * 10, 2, 8, 45)
    rr_imu_mean  = noise(rr_base + severity * 10, 2.5, 8, 45)
    rr_imu_std   = noise(1.5 + severity * 3.5, 0.5, 0.3, 8)
    rr_interval_mean = 60000 / _clip(hr_ppg_mean, 30, 200)
    rr_interval_std  = noise(50 + severity * 60, 10, 20, 200)

    # ── AFib ─────────────────────────────────────────────────────────────────
    afib_a = 0.8 + severity * 5
    afib_b = 15 - severity * 12
    afib_pct  = _clip(rng.beta(afib_a, max(0.5, afib_b), n), 0, 1) * (severity + 0.05)
    afib_days = (afib_pct * 7 + rng.normal(0, 0.3, n)).clip(0, 7).round().astype(int)

    # ── QT interval ──────────────────────────────────────────────────────────
    qt_interval = noise(400 + severity * 50, 15, 350, 500)

    # ── Cough / Wheeze ───────────────────────────────────────────────────────
    is_copd = float(condition == "COPD")
    is_chf  = float(condition == "CHF")
    cough_base = 1 + is_copd * 6 + is_chf * 2
    cough_sum_24hr   = rng.poisson((cough_base + severity * 40) * 1.0, n).astype(float)
    cough_max_hourly = cough_sum_24hr / 24 * noise(2, 0.5, 1, 5)
    cough_trend      = noise(severity * 1.2, 0.5, -1, 4)
    wheeze_pct_hours = _clip(rng.beta(0.5 + severity * 3, max(0.5, 10 - severity * 8), n) * (severity * 0.7 + is_copd * 0.4), 0, 0.9)

    # ── Activity ─────────────────────────────────────────────────────────────
    activity_mean          = noise(0.55 - severity * 0.45, 0.08, 0.01, 0.9)
    nocturnal_activity     = noise(0.08 + severity * 0.18, 0.04, 0, 0.5)
    posture_supine         = noise(0.35 + severity * 0.45, 0.08, 0.1, 0.9)

    # ── Demographics ─────────────────────────────────────────────────────────
    age_base = {"CHF": 72, "COPD": 68, "Diabetes": 62, "PostSurg": 58}.get(condition, 65)
    age = noise(age_base + severity * 5, 8, 35, 90)
    days_since_discharge  = _clip(rng.gamma(2 + (1-severity)*3, 3 + (1-severity)*4, n), 1, 30).astype(int)
    num_prior_admissions  = rng.integers(0, min(int(1 + severity * 4) + 1, 6), n)
    num_medications       = noise(6 + severity * 8, 2, 2, 20)
    num_diagnoses         = noise(3 + severity * 5, 1.5, 1, 12)

    diabetes_flag = (rng.random(n) < (0.3 + severity * 0.3 + (0.3 if condition == "Diabetes" else 0))).astype(int)
    copd_flag     = (rng.random(n) < (0.1 + severity * 0.2 + (0.7 if condition == "COPD"     else 0))).astype(int)
    chf_flag      = (rng.random(n) < (0.1 + severity * 0.3 + (0.8 if condition == "CHF"      else 0))).astype(int)

    return {
        "spo2_mean":               spo2_mean,
        "spo2_min":                spo2_min,
        "spo2_std":                spo2_std,
        "spo2_time_below_92_pct":  spo2_below,
        "hr_ppg_mean":             hr_ppg_mean,
        "hr_ppg_std":              hr_ppg_std,
        "hr_ppg_max":              hr_ppg_max,
        "hr_ppg_trend_6hr":        hr_ppg_trend,
        "hr_ecg_mean":             hr_ecg_mean,
        "rr_interval_mean":        rr_interval_mean,
        "rr_interval_std":         rr_interval_std,
        "hrv_sdnn":                hrv_sdnn,
        "hrv_rmssd":               hrv_rmssd,
        "hrv_lf_hf_ratio":         np.full(n, np.nan),
        "qt_interval_mean":        qt_interval,
        "qt_corrected":            np.full(n, np.nan),
        "afib_pct_readings":       afib_pct,
        "afib_days_in_window":     afib_days.astype(float),
        "bioz_ohms_mean":          bioz_ohms_mean,
        "bioz_ohms_trend_24hr":    bioz_trend,
        "bioz_delta_from_baseline": bioz_delta,
        "thoracic_fluid_index":    thoracic_fluid,
        "bioz_rr_mean":            bioz_rr_mean,
        "rr_imu_mean":             rr_imu_mean,
        "rr_imu_std":              rr_imu_std,
        "activity_mean":           activity_mean,
        "nocturnal_activity_mean": nocturnal_activity,
        "posture_supine_pct":      posture_supine,
        "cough_sum_24hr":          cough_sum_24hr,
        "cough_max_hourly":        cough_max_hourly,
        "cough_trend_6hr":         cough_trend,
        "wheeze_pct_hours":        wheeze_pct_hours,
        "age":                     age,
        "days_since_discharge":    days_since_discharge.astype(float),
        "num_prior_admissions_90d": num_prior_admissions.astype(float),
        "num_medications":         num_medications,
        "num_diagnoses":           num_diagnoses,
        "diabetes_flag":           diabetes_flag.astype(float),
        "copd_flag":               copd_flag.astype(float),
        "chf_flag":                chf_flag.astype(float),
    }


def build_dataset(n_total: int) -> pd.DataFrame:
    frames = []
    for tier, cfg in TIERS.items():
        n_tier = round(n_total * cfg["weight"])
        conds  = rng.choice(CONDITIONS, p=COND_WEIGHTS, size=n_tier)
        for cond in CONDITIONS:
            mask = conds == cond
            n_cond = mask.sum()
            if n_cond == 0:
                continue
            feat = sample_tier(tier, n_cond, cond)
            df_part = pd.DataFrame(feat)
            # Label: Bernoulli sample from tier probability
            df_part["label"] = (rng.random(n_cond) < cfg["label_prob"]).astype(int)
            df_part["condition"] = cond
            df_part["severity_tier"] = tier
            frames.append(df_part)

    df = pd.concat(frames, ignore_index=True).sample(frac=1, random_state=42)
    df = df.reset_index(drop=True)
    return df


if __name__ == "__main__":
    print(f"[GEN] Generating {N_PATIENTS:,} synthetic patient windows …")
    df = build_dataset(N_PATIENTS)
    print(f"[GEN] Dataset: {len(df)} rows, {df.shape[1]} columns")
    print(f"[GEN] Positive rate: {df['label'].mean():.1%}")
    print(f"[GEN] Tier distribution:\n{df['severity_tier'].value_counts().to_string()}")
    # Drop severity_tier (target encoding leak risk) before saving
    df_out = df.drop(columns=["severity_tier"])
    df_out.to_csv(OUT_PATH, index=False)
    print(f"[GEN] Saved -> {OUT_PATH}")
