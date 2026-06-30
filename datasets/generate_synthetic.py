"""
RecoverPath â€” Synthetic Vitals Generator
Produces 50,000 clinically-grounded 24-hour patient windows.
"""

import numpy as np
import pandas as pd
from pathlib import Path

SEED = 42
N_PATIENTS = 50_000
OUT_DIR = Path(__file__).parent
OUT_PATH = OUT_DIR / "synthetic_vitals.csv"

rng = np.random.default_rng(SEED)


# â”€â”€ Per-condition clinical distributions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _sample_chf(n):
    hr_ppg = rng.normal(88, 15, n).clip(40, 180)
    hr_ecg = hr_ppg + rng.normal(0, 2, n)
    spo2_mean = rng.normal(93, 2.5, n).clip(70, 100)
    rr = rng.normal(21, 4, n).clip(8, 50)
    bioz_baseline = rng.normal(55, 8, n).clip(20, 100)
    bioz_trend = rng.normal(-0.7, 0.4, n)          # drops over time = fluid â†‘
    bioz_delta = bioz_trend * 24
    thoracic_fluid = rng.normal(0.62, 0.12, n).clip(0, 1)
    hrv_sdnn = rng.normal(22, 8, n).clip(5, 100)
    hrv_rmssd = hrv_sdnn * rng.uniform(0.8, 1.2, n)
    afib_pct = rng.beta(1.5, 6, n)
    cough_sum = rng.poisson(4, n).astype(float)
    wheeze_pct = rng.beta(1.2, 8, n)
    activity = rng.normal(0.25, 0.1, n).clip(0, 1)
    posture_supine = rng.normal(0.55, 0.15, n).clip(0, 1)
    return locals()


def _sample_copd(n):
    hr_ppg = rng.normal(82, 12, n).clip(40, 180)
    hr_ecg = hr_ppg + rng.normal(0, 2, n)
    spo2_mean = rng.normal(91, 3, n).clip(70, 100)
    rr = rng.normal(22, 4, n).clip(8, 50)
    bioz_baseline = rng.normal(60, 10, n).clip(20, 120)
    bioz_trend = rng.normal(0.0, 0.3, n)
    bioz_delta = bioz_trend * 24
    thoracic_fluid = rng.normal(0.45, 0.10, n).clip(0, 1)
    hrv_sdnn = rng.normal(28, 10, n).clip(5, 120)
    hrv_rmssd = hrv_sdnn * rng.uniform(0.75, 1.1, n)
    afib_pct = rng.beta(1.2, 8, n)
    cough_sum = rng.poisson(8, n).astype(float) * 24  # hourly * 24
    wheeze_pct = rng.beta(2, 5, n)
    activity = rng.normal(0.30, 0.12, n).clip(0, 1)
    posture_supine = rng.normal(0.45, 0.15, n).clip(0, 1)
    return locals()


def _sample_diabetic(n):
    hr_ppg = rng.normal(82, 12, n).clip(40, 180)
    hr_ecg = hr_ppg + rng.normal(0, 2, n)
    spo2_mean = rng.normal(96, 2, n).clip(70, 100)
    rr = rng.normal(17, 3, n).clip(8, 50)
    bioz_baseline = rng.normal(65, 10, n).clip(20, 120)
    bioz_trend = rng.normal(0.1, 0.25, n)
    bioz_delta = bioz_trend * 24
    thoracic_fluid = rng.normal(0.38, 0.09, n).clip(0, 1)
    hrv_sdnn = rng.normal(30, 12, n).clip(5, 120)
    hrv_rmssd = hrv_sdnn * rng.uniform(0.8, 1.2, n)
    afib_pct = rng.beta(1.0, 10, n)
    cough_sum = rng.poisson(2, n).astype(float)
    wheeze_pct = rng.beta(1.0, 12, n)
    activity = rng.normal(0.40, 0.15, n).clip(0, 1)
    posture_supine = rng.normal(0.40, 0.15, n).clip(0, 1)
    return locals()


def _sample_general(n):
    hr_ppg = rng.normal(75, 10, n).clip(40, 180)
    hr_ecg = hr_ppg + rng.normal(0, 2, n)
    spo2_mean = rng.normal(97, 1.5, n).clip(70, 100)
    rr = rng.normal(16, 2.5, n).clip(8, 50)
    bioz_baseline = rng.normal(70, 8, n).clip(20, 120)
    bioz_trend = rng.normal(0.05, 0.2, n)
    bioz_delta = bioz_trend * 24
    thoracic_fluid = rng.normal(0.32, 0.08, n).clip(0, 1)
    hrv_sdnn = rng.normal(42, 14, n).clip(5, 150)
    hrv_rmssd = hrv_sdnn * rng.uniform(0.85, 1.15, n)
    afib_pct = rng.beta(0.8, 15, n)
    cough_sum = rng.poisson(1, n).astype(float)
    wheeze_pct = rng.beta(0.5, 15, n)
    activity = rng.normal(0.55, 0.18, n).clip(0, 1)
    posture_supine = rng.normal(0.35, 0.12, n).clip(0, 1)
    return locals()


# â”€â”€ Assemble full feature frame â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def build_features(params: dict, condition: str, n: int) -> pd.DataFrame:
    hr_ppg = params["hr_ppg"]
    hr_ecg = params["hr_ecg"]
    spo2_mean = params["spo2_mean"]
    rr = params["rr"]

    df = pd.DataFrame()

    # MAX30102 â€” PPG
    df["spo2_mean"] = spo2_mean
    df["spo2_min"] = spo2_mean - rng.uniform(0, 4, n)
    df["spo2_std"] = rng.uniform(0.5, 3, n)
    df["spo2_time_below_92_pct"] = np.where(
        spo2_mean < 93, rng.uniform(0.05, 0.40, n), rng.uniform(0, 0.08, n)
    )
    df["hr_ppg_mean"] = hr_ppg
    df["hr_ppg_std"] = rng.uniform(3, 18, n)
    df["hr_ppg_max"] = hr_ppg + rng.uniform(10, 35, n)
    df["hr_ppg_trend_6hr"] = rng.normal(0, 3, n)

    # MAX30003 â€” ECG
    df["hr_ecg_mean"] = hr_ecg
    df["rr_interval_mean"] = 60_000 / hr_ecg.clip(30, 200)
    df["rr_interval_std"] = rng.uniform(20, 120, n)
    df["hrv_sdnn"] = params["hrv_sdnn"]
    df["hrv_rmssd"] = params["hrv_rmssd"]
    df["qt_interval_mean"] = rng.normal(400, 30, n).clip(300, 560)
    df["afib_pct_readings"] = params["afib_pct"]
    df["afib_days_in_window"] = (params["afib_pct"] * 7).astype(int).clip(0, 7)

    # MAX30009 â€” BioZ
    df["bioz_ohms_mean"] = params["bioz_baseline"]
    df["bioz_ohms_trend_24hr"] = params["bioz_trend"]
    df["bioz_delta_from_baseline"] = params["bioz_delta"]
    df["thoracic_fluid_index"] = params["thoracic_fluid"]
    df["bioz_rr_mean"] = rr + rng.normal(0, 1.5, n)

    # MPU6050 â€” IMU
    df["rr_imu_mean"] = rr
    df["rr_imu_std"] = rng.uniform(1, 4, n)
    df["activity_mean"] = params["activity"]
    df["nocturnal_activity_mean"] = params["activity"] * rng.uniform(0.1, 0.4, n)
    df["posture_supine_pct"] = params["posture_supine"]

    # INMP441 â€” Audio
    df["cough_sum_24hr"] = params["cough_sum"]
    df["cough_max_hourly"] = params["cough_sum"] / 24 + rng.uniform(0, 2, n)
    df["cough_trend_6hr"] = rng.normal(0, 0.5, n)
    df["wheeze_pct_hours"] = params["wheeze_pct"]

    # Cross-sensor
    df["hr_sensor_disagreement"] = np.abs(hr_ecg - hr_ppg)
    df["rr_sensor_disagreement"] = np.abs(df["bioz_rr_mean"] - df["rr_imu_mean"])

    # Patient context
    df["age"] = rng.integers(45, 90, n)
    df["days_since_discharge"] = rng.integers(0, 30, n)
    df["num_prior_admissions_90d"] = rng.integers(0, 6, n)
    df["num_medications"] = rng.integers(2, 20, n)
    df["num_diagnoses"] = rng.integers(1, 12, n)
    df["diabetes_flag"] = int(condition == "diabetic")
    df["copd_flag"] = int(condition == "copd")
    df["chf_flag"] = int(condition == "chf")

    # Placeholder ECG features (NaN)
    df["hrv_lf_hf_ratio"] = np.nan
    df["qt_corrected"] = np.nan

    df["condition"] = condition
    return df


# â”€â”€ Label logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def assign_labels(df: pd.DataFrame) -> np.ndarray:
    labels = (
        ((df["spo2_mean"] < 93) & (df["days_since_discharge"] < 7))
        | (df["bioz_delta_from_baseline"] > 8)
        | ((df["rr_imu_mean"] > 22) & (df["cough_sum_24hr"] > 40))
        | (df["hrv_sdnn"] < 20)
        | (df["afib_days_in_window"] > 3)
        | (df["spo2_time_below_92_pct"] > 0.15)
    ).astype(int).values

    # 20% label noise
    noise_mask = rng.random(len(labels)) < 0.20
    labels[noise_mask] = 1 - labels[noise_mask]
    return labels


# â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def main():
    if OUT_PATH.exists():
        print(f"[SYNTHETIC] Already exists: {OUT_PATH} â€” skipping regeneration.")
        return

    print(f"[SYNTHETIC] Generating {N_PATIENTS:,} patient windows â€¦")
    counts = {
        "chf": int(N_PATIENTS * 0.30),
        "copd": int(N_PATIENTS * 0.25),
        "diabetic": int(N_PATIENTS * 0.25),
        "general": N_PATIENTS - int(N_PATIENTS * 0.80),
    }

    samplers = {
        "chf": _sample_chf,
        "copd": _sample_copd,
        "diabetic": _sample_diabetic,
        "general": _sample_general,
    }

    parts = []
    for cond, n in counts.items():
        print(f"  Sampling {n:,} {cond.upper()} patients â€¦")
        params = samplers[cond](n)
        part_df = build_features(params, cond, n)
        parts.append(part_df)

    df = pd.concat(parts, ignore_index=True)
    df = df.sample(frac=1, random_state=SEED).reset_index(drop=True)

    df["label"] = assign_labels(df)

    df.to_csv(OUT_PATH, index=False)
    pos_rate = df["label"].mean()
    print(f"[SYNTHETIC] Saved {len(df):,} rows â†’ {OUT_PATH}")
    print(f"[SYNTHETIC] Positive rate (readmitted): {pos_rate:.1%}")
    print(f"[SYNTHETIC] Feature columns: {len(df.columns) - 2} (excl. condition/label)")


if __name__ == "__main__":
    main()

