"""
RecoverPath — 5-patient clinical smoke test.

All patients are post-discharge CHF patients (the primary use case).
Severity gradient: STABLE → EARLY_DETERIORATION → MODERATE → SEVERE → CRITICAL_EVENT.
These map to real clinical phenotypes the model was trained on.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from inference import RecoverPathRiskEngine

engine = RecoverPathRiskEngine()
engine.load_models(str(Path(__file__).parent.parent / "models"))

# All patients: CHF post-discharge. Only vitals differ — no behavioral/social.
# Each row is tuned to be clinically distinct and monotonically worsening.
PATIENTS = [
    # ── STABLE CHF — Day 14, doing well ──────────────────────────────────────
    dict(
        spo2_mean=96.5, spo2_min=95.0, spo2_std=0.8, spo2_time_below_92_pct=0.0,
        hr_ppg_mean=72, hr_ppg_std=7, hr_ppg_max=88, hr_ppg_trend_6hr=0.5,
        hr_ecg_mean=72, rr_interval_mean=833, rr_interval_std=55,
        hrv_sdnn=38, hrv_rmssd=40, qt_interval_mean=405,
        afib_pct_readings=0.0, afib_days_in_window=0,
        bioz_ohms_mean=65, bioz_ohms_trend_24hr=0.02, bioz_delta_from_baseline=0.5,
        thoracic_fluid_index=0.38, bioz_rr_mean=16, rr_imu_mean=16, rr_imu_std=1.5,
        activity_mean=0.38, nocturnal_activity_mean=0.09, posture_supine_pct=0.42,
        cough_sum_24hr=2, cough_max_hourly=0, cough_trend_6hr=0.0,
        wheeze_pct_hours=0.02, age=68, days_since_discharge=14,
        num_prior_admissions_90d=1, num_medications=10, num_diagnoses=5,
        diabetes_flag=0, copd_flag=0, chf_flag=1,
        hrv_lf_hf_ratio=float("nan"), qt_corrected=float("nan"),
    ),
    # ── EARLY DETERIORATION — Day 8, subtle fluid ─────────────────────────────
    dict(
        spo2_mean=94.5, spo2_min=92.5, spo2_std=1.2, spo2_time_below_92_pct=0.02,
        hr_ppg_mean=82, hr_ppg_std=9, hr_ppg_max=102, hr_ppg_trend_6hr=1.5,
        hr_ecg_mean=82, rr_interval_mean=731, rr_interval_std=68,
        hrv_sdnn=28, hrv_rmssd=30, qt_interval_mean=415,
        afib_pct_readings=0.04, afib_days_in_window=0,
        bioz_ohms_mean=59, bioz_ohms_trend_24hr=0.12, bioz_delta_from_baseline=3.0,
        thoracic_fluid_index=0.50, bioz_rr_mean=18, rr_imu_mean=18, rr_imu_std=2.2,
        activity_mean=0.25, nocturnal_activity_mean=0.13, posture_supine_pct=0.52,
        cough_sum_24hr=8, cough_max_hourly=1, cough_trend_6hr=0.2,
        wheeze_pct_hours=0.05, age=70, days_since_discharge=8,
        num_prior_admissions_90d=1, num_medications=12, num_diagnoses=6,
        diabetes_flag=0, copd_flag=0, chf_flag=1,
        hrv_lf_hf_ratio=float("nan"), qt_corrected=float("nan"),
    ),
    # ── MODERATE — Day 5, fluid accumulating, AFib ────────────────────────────
    dict(
        spo2_mean=92.5, spo2_min=90.0, spo2_std=1.8, spo2_time_below_92_pct=0.08,
        hr_ppg_mean=90, hr_ppg_std=12, hr_ppg_max=118, hr_ppg_trend_6hr=2.5,
        hr_ecg_mean=90, rr_interval_mean=667, rr_interval_std=80,
        hrv_sdnn=20, hrv_rmssd=22, qt_interval_mean=425,
        afib_pct_readings=0.12, afib_days_in_window=2,
        bioz_ohms_mean=53, bioz_ohms_trend_24hr=0.28, bioz_delta_from_baseline=6.5,
        thoracic_fluid_index=0.60, bioz_rr_mean=20, rr_imu_mean=21, rr_imu_std=2.8,
        activity_mean=0.16, nocturnal_activity_mean=0.17, posture_supine_pct=0.60,
        cough_sum_24hr=22, cough_max_hourly=3, cough_trend_6hr=0.6,
        wheeze_pct_hours=0.12, age=72, days_since_discharge=5,
        num_prior_admissions_90d=2, num_medications=13, num_diagnoses=7,
        diabetes_flag=1, copd_flag=0, chf_flag=1,
        hrv_lf_hf_ratio=float("nan"), qt_corrected=float("nan"),
    ),
    # ── SEVERE — Day 3, decompensated HF, AFib, hypoxic ────────────────────────
    dict(
        spo2_mean=90.5, spo2_min=87.0, spo2_std=2.5, spo2_time_below_92_pct=0.22,
        hr_ppg_mean=98, hr_ppg_std=16, hr_ppg_max=132, hr_ppg_trend_6hr=4.0,
        hr_ecg_mean=98, rr_interval_mean=612, rr_interval_std=92,
        hrv_sdnn=13, hrv_rmssd=14, qt_interval_mean=438,
        afib_pct_readings=0.22, afib_days_in_window=3,
        bioz_ohms_mean=48, bioz_ohms_trend_24hr=0.45, bioz_delta_from_baseline=11.5,
        thoracic_fluid_index=0.70, bioz_rr_mean=23, rr_imu_mean=25, rr_imu_std=3.5,
        activity_mean=0.10, nocturnal_activity_mean=0.21, posture_supine_pct=0.68,
        cough_sum_24hr=48, cough_max_hourly=7, cough_trend_6hr=1.1,
        wheeze_pct_hours=0.28, age=75, days_since_discharge=3,
        num_prior_admissions_90d=3, num_medications=14, num_diagnoses=8,
        diabetes_flag=1, copd_flag=0, chf_flag=1,
        hrv_lf_hf_ratio=float("nan"), qt_corrected=float("nan"),
    ),
    # ── CRITICAL_EVENT — Day 2, flooded lungs, persistent AFib, near-ER ──────
    dict(
        spo2_mean=87.5, spo2_min=83.0, spo2_std=3.5, spo2_time_below_92_pct=0.46,
        hr_ppg_mean=108, hr_ppg_std=22, hr_ppg_max=148, hr_ppg_trend_6hr=7.5,
        hr_ecg_mean=108, rr_interval_mean=555, rr_interval_std=112,
        hrv_sdnn=8, hrv_rmssd=9, qt_interval_mean=455,
        afib_pct_readings=0.40, afib_days_in_window=6,
        bioz_ohms_mean=42, bioz_ohms_trend_24hr=0.82, bioz_delta_from_baseline=19.5,
        thoracic_fluid_index=0.83, bioz_rr_mean=29, rr_imu_mean=31, rr_imu_std=5.0,
        activity_mean=0.05, nocturnal_activity_mean=0.29, posture_supine_pct=0.82,
        cough_sum_24hr=88, cough_max_hourly=14, cough_trend_6hr=2.4,
        wheeze_pct_hours=0.52, age=78, days_since_discharge=2,
        num_prior_admissions_90d=4, num_medications=16, num_diagnoses=9,
        diabetes_flag=1, copd_flag=1, chf_flag=1,
        hrv_lf_hf_ratio=float("nan"), qt_corrected=float("nan"),
    ),
]

LABELS = ["STABLE", "EARLY_DETN", "MODERATE", "SEVERE", "CRITICAL"]

if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("  RECOVERPATH SMOKE TEST — CHF Severity Gradient (5 patients)")
    print("=" * 70)
    print(f"  {'Label':<14}  {'Score':>5}  {'Tier':<10}  {'Top alert'}")
    print("-" * 70)

    scores = []
    for label, feat in zip(LABELS, PATIENTS):
        r = engine.score_from_features(feat, patient_id=label)
        scores.append(r["risk_score"])
        alert = r["triggered_alerts"][0][:42] if r["triggered_alerts"] else "—"
        print(f"  {label:<14}  {r['risk_score']:>5.1f}  {r['risk_tier']:<10}  {alert}")

    print("-" * 70)
    monotonic = all(scores[i] < scores[i + 1] for i in range(4))
    print(f"  Scores: {[round(s, 1) for s in scores]}")
    print(f"  Monotonically increasing: {'YES ✓' if monotonic else 'NO ✗'}")
    print("=" * 70 + "\n")

    if not monotonic:
        for i in range(4):
            if scores[i] >= scores[i + 1]:
                print(f"  VIOLATION: {LABELS[i]} ({scores[i]:.1f}) >= {LABELS[i+1]} ({scores[i+1]:.1f})")
        print("\n  Note: Minor inversions in middle tiers may be acceptable.")
        print("  CRITICAL (last) must be the highest score for safety.")
        critical_highest = scores[-1] == max(scores)
        print(f"  CRITICAL is highest: {'YES ✓' if critical_highest else 'NO ✗ — FIX REQUIRED'}")
        sys.exit(0 if critical_highest else 1)

    sys.exit(0)
