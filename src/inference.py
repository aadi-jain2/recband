"""
RecoverPath — Inference Engine
Produces real-time patient risk scores from Firebase streams or feature dicts.
"""

from __future__ import annotations

import math
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import shap

warnings.filterwarnings("ignore")

# Import feature engineering
import sys
sys.path.insert(0, str(Path(__file__).parent))
from feature_engineering import aggregate_firebase_window, compute_cross_sensor_features

# ── Risk tier thresholds ───────────────────────────────────────────────────────
TIERS = [
    (75, "CRITICAL", "Immediate intervention — contact patient now"),
    (50, "HIGH",     "Contact patient and discharging physician today"),
    (25, "MEDIUM",   "Schedule telemedicine check-in within 48hrs"),
    (0,  "LOW",      "Continue routine monitoring"),
]

ISO_GROUPS = {
    "cardiac": [
        "hr_ppg_mean", "hr_ecg_mean", "hrv_sdnn", "hrv_rmssd",
        "afib_pct_readings", "qt_interval_mean",
    ],
    "respiratory": [
        "spo2_mean", "spo2_min", "rr_imu_mean", "bioz_rr_mean",
        "spo2_time_below_92_pct", "cough_sum_24hr", "wheeze_pct_hours",
    ],
    "fluid": [
        "bioz_ohms_mean", "bioz_ohms_trend_24hr", "bioz_delta_from_baseline",
        "thoracic_fluid_index", "posture_supine_pct",
    ],
    "activity": [
        "activity_mean", "nocturnal_activity_mean", "rr_imu_std",
    ],
}


class RecoverPathRiskEngine:
    """
    Two-layer risk scoring engine for post-discharge readmission prediction.

    Layer 1: Isolation Forest anomaly scores per signal group
    Layer 2: XGBoost meta-classifier → 30-day readmission probability
    """

    def __init__(self):
        self._model = None
        self._scaler = None
        self._iso_models: dict[str, Any] = {}
        self._explainer = None
        self._feature_cols: list[str] = []

    # ── Model Loading ──────────────────────────────────────────────────────────

    def load_models(self, model_dir: str = "models/") -> None:
        model_path = Path(model_dir)

        self._model = joblib.load(model_path / "recoverpath_risk_model.pkl")
        self._scaler = joblib.load(model_path / "recoverpath_scaler.pkl")

        for name in ISO_GROUPS:
            iso_path = model_path / f"iso_{name}.pkl"
            self._iso_models[name] = joblib.load(iso_path)

        # Build SHAP explainer lazily (cached after first call)
        try:
            self._explainer = shap.TreeExplainer(self._model)
        except Exception:
            self._explainer = None

        # Infer feature column order from scaler (stored as n_features_in_)
        # Fall back to a best-effort reconstruction
        if hasattr(self._scaler, "feature_names_in_"):
            self._feature_cols = list(self._scaler.feature_names_in_)
        else:
            # Best-effort: build from schema + anomaly cols
            from feature_engineering import FEATURE_SCHEMA
            self._feature_cols = [
                c for c in FEATURE_SCHEMA
                if c not in {"hrv_lf_hf_ratio", "qt_corrected"}
            ] + [f"anomaly_{g}" for g in ISO_GROUPS]

        print(f"[Engine] Models loaded from {model_path}")

    # ── Public Scoring API ─────────────────────────────────────────────────────

    def score_from_firebase_stream(
        self,
        records: list[dict],
        patient_id: str = "unknown",
    ) -> dict:
        """
        Accepts raw Firebase JSON list (last 24 hours of 60-second readings).
        """
        features = aggregate_firebase_window(records)
        return self.score_from_features(features, patient_id=patient_id)

    # ── Composite scoring API ──────────────────────────────────────────────────

    def score_composite(
        self,
        vitals_features: dict,
        adherence_data: dict | None = None,
        followup_data: dict | None = None,
        sdoh_data: dict | None = None,
        patient_id: str = "unknown",
    ) -> dict:
        """
        Full composite risk score combining:
          clinical (ML vitals model) × 0.60
          behavioral (adherence + follow-up) × 0.25
          social (SDOH) × 0.15

        Compounding effects applied when multiple factors co-occur.
        """
        # ── Layer 1: clinical vitals ──
        clinical_result = self.score_from_features(vitals_features, patient_id=patient_id)
        clinical_score = clinical_result["risk_score"]

        # ── Layer 2: behavioral risk modifier (0-100 scale) ──
        behavioral_score = self._compute_behavioral_risk(adherence_data or {}, followup_data or {})

        # ── Layer 3: social risk modifier (0-100 scale) ──
        social_score = self._compute_social_risk(sdoh_data or {})

        # ── Composite with weights (clinical 55%, behavioral 30%, social 15%) ──
        raw_composite = (
            clinical_score   * 0.55 +
            behavioral_score * 0.30 +
            social_score     * 0.15
        )
        composite_score = round(min(100.0, max(0.0, raw_composite)), 1)
        tier, action = self._get_tier(composite_score)

        # ── Explanation ──
        explanation = self._generate_explanation(
            clinical_score, behavioral_score, social_score,
            adherence_data or {}, followup_data or {}, sdoh_data or {},
            vitals_features=vitals_features,
        )

        # ── Additional behavioral/social alerts ──
        extra_alerts = self._compute_behavioral_alerts(adherence_data or {}, followup_data or {}, sdoh_data or {})
        all_alerts = extra_alerts + clinical_result["triggered_alerts"]

        # Flagged by non-clinical: clinical LOW/MEDIUM but composite HIGH+
        clinical_tier, _ = self._get_tier(clinical_score)
        flagged_by_nonclinical = (
            clinical_tier in ("LOW", "MEDIUM") and
            tier in ("HIGH", "CRITICAL")
        )

        return {
            **clinical_result,
            "risk_score":              composite_score,
            "risk_tier":               tier,
            "recommended_action":      action,
            "triggered_alerts":        all_alerts[:8],
            # Composite breakdown
            "composite_risk_score":    composite_score,
            "clinical_score":          round(clinical_score, 1),
            "behavioral_score":        round(behavioral_score, 1),
            "social_score":            round(social_score, 1),
            "clinical_pct":            round(clinical_score * 0.55 / max(composite_score, 1), 3),
            "behavioral_pct":          round(behavioral_score * 0.30 / max(composite_score, 1), 3),
            "social_pct":              round(social_score * 0.15 / max(composite_score, 1), 3),
            "explanation":             explanation,
            "flagged_by_nonclinical":  flagged_by_nonclinical,
            # Data sufficiency: communicates how complete the input data is
            "data_sufficiency":        vitals_features.get("_data_sufficiency", "full"),
        }

    @staticmethod
    def _compute_behavioral_risk(adherence: dict, followup: dict) -> float:
        score = 0.0

        # Adherence component
        overall_pct = float(adherence.get("overall_pct_7d", 1.0))
        critical_streak = int(adherence.get("critical_missed_streak", 0))
        adherence_tier = adherence.get("adherence_tier", "HIGH")

        if adherence_tier == "LOW":
            score += 30.0
        elif adherence_tier == "MEDIUM":
            score += 15.0

        if critical_streak >= 2:
            score += 20.0 + min(critical_streak * 2.5, 20.0)
        elif critical_streak == 1:
            score += 8.0

        if overall_pct < 0.50:
            score += 15.0
        elif overall_pct < 0.70:
            score += 8.0

        # Follow-up component
        no_show_rate = float(followup.get("no_show_rate", 0.0))
        no_show_count = int(followup.get("no_show_count", 0))
        has_scheduled = bool(followup.get("has_scheduled_within_7d", True))

        if no_show_count >= 2:
            score += 20.0
        elif no_show_count == 1:
            score += 10.0

        if no_show_rate > 0.5:
            score += 10.0

        if not has_scheduled:
            score += 8.0

        # Compounding: missing meds AND no-shows together
        if critical_streak >= 2 and no_show_count >= 1:
            score += 15.0

        return round(min(100.0, score), 1)

    @staticmethod
    def _compute_social_risk(sdoh: dict) -> float:
        score = float(sdoh.get("social_risk_score", 0.0))
        # Already 0-100 from pre-computed SDOH profile
        # Apply compounding if 3+ factors
        factors = sdoh.get("social_risk_factors", [])
        if isinstance(factors, list) and len(factors) >= 3:
            score = min(100.0, score + 10.0)
        return round(score, 1)

    @staticmethod
    def _compute_behavioral_alerts(adherence: dict, followup: dict, sdoh: dict) -> list:
        alerts = []
        critical_streak = int(adherence.get("critical_missed_streak", 0))
        if critical_streak >= 2:
            meds = adherence.get("medications", [])
            critical_meds = [m.get("med_name","") for m in meds if m.get("is_critical")]
            med_str = ", ".join(critical_meds[:2]) if critical_meds else "critical medication"
            alerts.append(
                f"Missed {med_str} for {critical_streak} consecutive days — adherence risk elevated"
            )

        no_show_count = int(followup.get("no_show_count", 0))
        if no_show_count >= 1:
            alerts.append(f"No-showed {no_show_count} follow-up appointment(s) since discharge")

        if not followup.get("has_scheduled_within_7d", True):
            alerts.append("No follow-up appointment scheduled in next 7 days")

        factors = sdoh.get("social_risk_factors", [])
        if isinstance(factors, list) and len(factors) >= 3:
            alerts.append(
                f"High social risk: {len(factors)} SDOH barriers detected "
                f"({', '.join(factors[:2])}...)"
            )
        elif isinstance(factors, list) and len(factors) > 0:
            alerts.append(f"Social risk factor: {factors[0]}")

        return alerts

    @staticmethod
    def _generate_explanation(
        clinical: float, behavioral: float, social: float,
        adherence: dict, followup: dict, sdoh: dict,
        vitals_features: dict | None = None,
    ) -> str:
        """
        Generate a clinical-note-style explanation for the composite risk score.
        Written for care coordinators — direct, actionable, no jargon.
        """
        lines: list[str] = []
        clinical_tier, _ = RecoverPathRiskEngine._get_tier(clinical)

        # ── Clinical component ──
        spo2 = (vitals_features or {}).get("spo2_mean")
        hr   = (vitals_features or {}).get("hr_ppg_mean")
        hrv  = (vitals_features or {}).get("hrv_sdnn")

        if clinical_tier == "CRITICAL":
            vital_str = ""
            if spo2: vital_str += f"SpO2 {spo2:.0f}%, "
            if hr:   vital_str += f"HR {hr:.0f}bpm"
            vital_str = f" ({vital_str.strip(', ')})" if vital_str else ""
            lines.append(f"Vitals in critical range{vital_str} — immediate contact required.")
        elif clinical_tier == "HIGH":
            vital_str = ""
            if spo2: vital_str += f"SpO2 {spo2:.0f}%, "
            if hr:   vital_str += f"HR {hr:.0f}bpm"
            vital_str = f" ({vital_str.strip(', ')})" if vital_str else ""
            lines.append(f"Vitals trending abnormal{vital_str} — contact patient today.")
        elif clinical_tier == "MEDIUM":
            lines.append("Vitals mildly outside normal range — monitor closely.")
        else:
            vital_str = ""
            if spo2: vital_str += f"SpO2 {spo2:.0f}%, "
            if hr:   vital_str += f"HR {hr:.0f}bpm"
            vital_str = f" ({vital_str.strip(', ')})" if vital_str else ""
            lines.append(f"Vitals within normal range{vital_str}.")

        # ── Behavioral component ──
        streak    = int(adherence.get("critical_missed_streak", 0))
        no_shows  = int(followup.get("no_show_count", 0))
        has_appt  = bool(followup.get("has_scheduled_within_7d", True))
        if streak >= 2:
            meds = adherence.get("medications", [])
            cm   = [m.get("med_name", "") for m in meds if m.get("is_critical")]
            med  = cm[0] if cm else "critical medication"
            lines.append(
                f"{streak} consecutive missed doses of {med} — "
                f"recommend care coordinator call today."
            )
        elif streak == 1:
            lines.append("1 missed critical medication dose — remind patient.")

        if no_shows >= 2:
            lines.append(f"Missed {no_shows} follow-up appointments since discharge.")
        elif no_shows == 1:
            lines.append("1 missed follow-up appointment — reschedule.")
        if not has_appt:
            lines.append("No follow-up appointment scheduled in next 7 days — schedule now.")

        # ── Social component ──
        factors = sdoh.get("social_risk_factors", [])
        if isinstance(factors, list) and len(factors) >= 3:
            lines.append(
                f"{len(factors)} social risk factors detected "
                f"({', '.join(factors[:2])} …) — consider social work referral."
            )
        elif isinstance(factors, list) and len(factors) > 0:
            lines.append(f"Social risk: {factors[0]}.")

        return " ".join(lines) if lines else "All components within normal range — continue routine monitoring."

    def score_from_features(
        self,
        features: dict,
        patient_id: str = "unknown",
    ) -> dict:
        """
        Accepts a pre-aggregated feature dict and returns a full risk response.
        """
        features = compute_cross_sensor_features(features)

        # ── Anomaly scores ──
        anomaly_scores: dict[str, float] = {}
        for group_name, cols in ISO_GROUPS.items():
            iso = self._iso_models.get(group_name)
            if iso is None:
                anomaly_scores[group_name] = float("nan")
                continue
            available = [c for c in cols if c in features]
            x = np.array([[features.get(c, np.nan) for c in available]])
            # Replace NaN with median of training distribution (iso handles this)
            x = np.where(np.isnan(x), 0.0, x)
            raw = iso.score_samples(x)[0]
            # Normalize to 0-1
            # Typical score_samples range for IsolationForest: roughly -0.6 to 0
            anomaly_scores[group_name] = float(np.clip((raw + 0.6) / 0.6 * -1 + 1, 0, 1))

        features_with_anomaly = dict(features)
        for g, score in anomaly_scores.items():
            features_with_anomaly[f"anomaly_{g}"] = score

        # ── Build feature vector in correct order ──
        x_vec = np.array([[
            features_with_anomaly.get(c, np.nan)
            for c in self._feature_cols
        ]])
        x_vec = np.where(np.isnan(x_vec), 0.0, x_vec)
        x_scaled = self._scaler.transform(x_vec)

        risk_prob = float(self._model.predict_proba(x_scaled)[0, 1])
        risk_score = round(risk_prob * 100, 1)

        # ── Risk tier ──
        tier, action = self._get_tier(risk_score)

        # ── Alerts ──
        alerts = self._compute_triggered_alerts(features, anomaly_scores, risk_prob)

        # ── Top SHAP features ──
        top_features = self._get_top_shap_features(x_scaled, n=5)

        # ── Data sufficiency ──
        critical_vitals = ["spo2_mean", "hr_ppg_mean", "hrv_sdnn", "bioz_ohms_mean", "rr_imu_mean"]
        present = [k for k in critical_vitals if features.get(k) is not None
                   and not (isinstance(features.get(k), float) and math.isnan(features[k]))]
        if len(present) >= 4:
            sufficiency = "full"
        elif len(present) >= 2:
            sufficiency = "partial"
        else:
            sufficiency = "insufficient"

        missing_note = ""
        if sufficiency != "full":
            missing = [k for k in critical_vitals if k not in present]
            missing_note = (
                f"Risk assessment based on {', '.join(present)} only — "
                f"sensors not providing: {', '.join(missing)}. "
                f"Add missing sensors for more complete assessment."
            )

        return {
            "patient_id":          patient_id,
            "timestamp":           datetime.now(timezone.utc).isoformat(),
            "risk_score":          risk_score,
            "risk_tier":           tier,
            "risk_probability":    round(risk_prob, 4),
            "anomaly_scores": {
                "cardiac":         round(anomaly_scores.get("cardiac",     0), 3),
                "respiratory":     round(anomaly_scores.get("respiratory", 0), 3),
                "fluid":           round(anomaly_scores.get("fluid",       0), 3),
                "activity":        round(anomaly_scores.get("activity",    0), 3),
            },
            "triggered_alerts":    alerts,
            "recommended_action":  action,
            "top_risk_features":   top_features,
            "days_since_discharge": int(features.get("days_since_discharge", -1) or -1),
            "data_sufficiency":    sufficiency,
            "data_sufficiency_note": missing_note,
        }

    # ── Internal helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _get_tier(risk_score: float) -> tuple[str, str]:
        for threshold, tier, action in TIERS:
            if risk_score >= threshold:
                return tier, action
        return "LOW", "Continue routine monitoring"

    def _compute_triggered_alerts(
        self,
        features: dict,
        anomaly_scores: dict[str, float],
        risk_prob: float,
    ) -> list[str]:
        alerts: list[str] = []

        def _v(key: float | None, default=None):
            val = features.get(key)
            if val is None or (isinstance(val, float) and math.isnan(val)):
                return default
            return val

        spo2_below = _v("spo2_time_below_92_pct")
        if spo2_below is not None and spo2_below > 0.10:
            alerts.append(
                f"SpO2 dropped below 92% for {spo2_below*100:.0f}% of readings "
                f"in last 24 hours"
            )

        bioz_delta = _v("bioz_delta_from_baseline")
        if bioz_delta is not None and bioz_delta > 5:
            alerts.append(
                f"Bioimpedance increased {bioz_delta:.1f} ohms over baseline — "
                f"possible fluid retention"
            )

        hrv_sdnn = _v("hrv_sdnn")
        if hrv_sdnn is not None and hrv_sdnn < 25:
            alerts.append(
                f"HRV SDNN critically low ({hrv_sdnn:.0f}ms) — cardiac stress detected"
            )

        afib_days = _v("afib_days_in_window")
        if afib_days is not None and afib_days >= 3:
            alerts.append(
                f"AFib detected in {int(afib_days)} of last 7 days"
            )

        cough_sum = _v("cough_sum_24hr")
        cough_trend = _v("cough_trend_6hr", 0)
        if cough_sum is not None and cough_sum > 30:
            trend_str = "trending upward" if cough_trend > 0 else "stable"
            alerts.append(
                f"Cough rate elevated: {cough_sum:.0f} coughs in 24 hours, {trend_str}"
            )

        spo2_mean = _v("spo2_mean")
        dsd = _v("days_since_discharge")
        if spo2_mean is not None and spo2_mean < 93 and dsd is not None and dsd < 7:
            alerts.append(
                f"SpO2 mean {spo2_mean:.1f}% (low) within {int(dsd)} days of discharge"
            )

        rr = _v("rr_imu_mean")
        if rr is not None and rr > 22:
            alerts.append(
                f"Elevated respiratory rate: {rr:.0f} breaths/min (normal <20)"
            )

        wheeze = _v("wheeze_pct_hours")
        if wheeze is not None and wheeze > 0.25:
            alerts.append(
                f"Wheeze detected in {wheeze*100:.0f}% of monitored hours"
            )

        # Anomaly score alerts
        for group, score in anomaly_scores.items():
            if not math.isnan(score) and score > 0.75:
                alerts.append(
                    f"Anomaly detected in {group} signals (score: {score:.2f})"
                )

        if not alerts:
            alerts.append("No critical alerts — all signals within acceptable range.")

        return alerts

    def _get_top_shap_features(self, x_scaled: np.ndarray, n: int = 5) -> list[str]:
        if self._explainer is None or not self._feature_cols:
            return []
        try:
            shap_vals = self._explainer.shap_values(x_scaled)[0]
            top_idx = np.argsort(np.abs(shap_vals))[::-1][:n]
            return [self._feature_cols[i] for i in top_idx if i < len(self._feature_cols)]
        except Exception:
            return []


# ── CLI demo ───────────────────────────────────────────────────────────────────

def get_mock_features(patient_id: str) -> dict:
    """Return clinically plausible mock features for a given patient_id."""
    import numpy as np
    import hashlib
    seed = int(hashlib.md5(patient_id.encode()).hexdigest()[:8], 16)
    rng = np.random.default_rng(seed)
    tier_seed = seed % 4  # 0=CRITICAL,1=HIGH,2=MEDIUM,3=LOW
    if tier_seed == 0:
        spo2 = float(rng.uniform(87, 92))
        hrv = float(rng.uniform(10, 18))
        bioz_delta = float(rng.uniform(9, 15))
        afib_days = int(rng.integers(3, 6))
        days_out = int(rng.integers(2, 7))
    elif tier_seed == 1:
        spo2 = float(rng.uniform(92, 94))
        hrv = float(rng.uniform(18, 28))
        bioz_delta = float(rng.uniform(4, 9))
        afib_days = int(rng.integers(1, 3))
        days_out = int(rng.integers(6, 14))
    elif tier_seed == 2:
        spo2 = float(rng.uniform(94, 96))
        hrv = float(rng.uniform(28, 40))
        bioz_delta = float(rng.uniform(1, 4))
        afib_days = int(rng.integers(0, 2))
        days_out = int(rng.integers(12, 21))
    else:
        spo2 = float(rng.uniform(96, 99))
        hrv = float(rng.uniform(38, 60))
        bioz_delta = float(rng.uniform(-2, 2))
        afib_days = 0
        days_out = int(rng.integers(20, 28))
    return {
        "spo2_mean": spo2,
        "spo2_min": spo2 - float(rng.uniform(1, 4)),
        "spo2_std": float(rng.uniform(0.5, 2.5)),
        "spo2_time_below_92_pct": max(0, (92 - spo2) / 10),
        "hr_ppg_mean": float(rng.uniform(65, 100)),
        "hr_ppg_std": float(rng.uniform(5, 15)),
        "hr_ppg_max": float(rng.uniform(90, 140)),
        "hr_ppg_trend_6hr": float(rng.normal(0, 3)),
        "hr_ecg_mean": float(rng.uniform(65, 100)),
        "rr_interval_mean": 60000 / max(30, float(rng.uniform(65, 100))),
        "rr_interval_std": float(rng.uniform(30, 100)),
        "hrv_sdnn": hrv,
        "hrv_rmssd": hrv * float(rng.uniform(0.8, 1.2)),
        "qt_interval_mean": float(rng.uniform(380, 450)),
        "afib_pct_readings": afib_days / 7.0,
        "afib_days_in_window": afib_days,
        "bioz_ohms_mean": float(rng.uniform(45, 80)),
        "bioz_ohms_trend_24hr": bioz_delta / 24.0,
        "bioz_delta_from_baseline": bioz_delta,
        "thoracic_fluid_index": float(rng.uniform(0.3, 0.75)),
        "bioz_rr_mean": float(rng.uniform(14, 24)),
        "rr_imu_mean": float(rng.uniform(14, 24)),
        "rr_imu_std": float(rng.uniform(1, 4)),
        "activity_mean": float(rng.uniform(0.1, 0.6)),
        "nocturnal_activity_mean": float(rng.uniform(0.05, 0.25)),
        "posture_supine_pct": float(rng.uniform(0.3, 0.7)),
        "cough_sum_24hr": float(rng.uniform(0, 60)) if tier_seed < 2 else float(rng.uniform(0, 10)),
        "cough_max_hourly": float(rng.uniform(0, 8)),
        "cough_trend_6hr": float(rng.normal(0, 0.5)),
        "wheeze_pct_hours": float(rng.uniform(0, 0.4)) if tier_seed < 2 else float(rng.uniform(0, 0.1)),
        "age": int(rng.integers(55, 80)),
        "days_since_discharge": days_out,
        "num_prior_admissions_90d": int(rng.integers(0, 4)),
        "num_medications": int(rng.integers(4, 15)),
        "num_diagnoses": int(rng.integers(2, 8)),
        "diabetes_flag": int(rng.random() > 0.6),
        "copd_flag": int(rng.random() > 0.7),
        "chf_flag": int(rng.random() > 0.6),
        "hrv_lf_hf_ratio": float("nan"),
        "qt_corrected": float("nan"),
    }


if __name__ == "__main__":
    import argparse, json, sys
    from pathlib import Path

    parser = argparse.ArgumentParser(description="RecoverPath Inference CLI")
    parser.add_argument("--patient_id", type=str, default="demo_patient_001")
    parser.add_argument("--mode", type=str, default="demo", choices=["demo", "api"])
    args = parser.parse_args()

    model_dir = Path(__file__).parent.parent / "models"
    if not (model_dir / "recoverpath_risk_model.pkl").exists():
        print("[Inference] Models not found. Run src/train.py first.", file=sys.stderr)
        sys.exit(1)

    engine = RecoverPathRiskEngine()
    engine.load_models(str(model_dir))

    features = get_mock_features(args.patient_id)

    if args.mode == "api":
        # Clean JSON output only (for Next.js API route parsing)
        result = engine.score_from_features(features, patient_id=args.patient_id)
        print(json.dumps(result))
        sys.exit(0)

    # Synthetic demo patient (original interactive demo)
    import numpy as np
    demo_features = {
        "spo2_mean": 91.5,
        "spo2_min": 88.0,
        "spo2_std": 2.1,
        "spo2_time_below_92_pct": 0.22,
        "hr_ppg_mean": 94.0,
        "hr_ppg_std": 11.0,
        "hr_ppg_max": 128.0,
        "hr_ppg_trend_6hr": 4.0,
        "hr_ecg_mean": 95.0,
        "rr_interval_mean": 630.0,
        "rr_interval_std": 80.0,
        "hrv_sdnn": 16.0,
        "hrv_rmssd": 18.0,
        "qt_interval_mean": 430.0,
        "afib_pct_readings": 0.18,
        "afib_days_in_window": 4,
        "bioz_ohms_mean": 52.0,
        "bioz_ohms_trend_24hr": -1.2,
        "bioz_delta_from_baseline": 11.0,
        "thoracic_fluid_index": 0.72,
        "bioz_rr_mean": 23.0,
        "rr_imu_mean": 24.0,
        "rr_imu_std": 3.5,
        "activity_mean": 0.18,
        "nocturnal_activity_mean": 0.12,
        "posture_supine_pct": 0.68,
        "cough_sum_24hr": 52.0,
        "cough_max_hourly": 8.0,
        "cough_trend_6hr": 1.2,
        "wheeze_pct_hours": 0.33,
        "age": 72,
        "days_since_discharge": 4,
        "num_prior_admissions_90d": 2,
        "num_medications": 11,
        "num_diagnoses": 7,
        "diabetes_flag": 0,
        "copd_flag": 0,
        "chf_flag": 1,
        "hrv_lf_hf_ratio": np.nan,
        "qt_corrected": np.nan,
    }

    result = engine.score_from_features(demo_features, patient_id="demo_patient_001")
    print(json.dumps(result, indent=2))
