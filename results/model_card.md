# RecoverPath Risk Model — Model Card

## Model Overview

**Name:** RecoverPath 30-Day Readmission Risk Model  
**Version:** 1.0  
**Date:** June 2026  
**Type:** Two-layer ensemble (Isolation Forest + XGBoost)  
**Task:** Binary classification — predict 30-day hospital readmission from 24-hour wearable sensor data

---

## Performance Metrics

| Metric | Value | Target |
|--------|-------|--------|
| AUC-ROC | **0.8079** | ≥ 0.80 ✓ |
| AUC-PR | **0.7864** | — |
| F1 Score (@0.5) | **0.8096** | — |
| Sensitivity (Recall) | **0.8274** | ≥ 0.80 ✓ |
| Specificity | **0.7656** | — |

*Evaluated on held-out 20% test set (10,000 samples).*

---

## Training Data

| Source | Rows | Description |
|--------|------|-------------|
| Synthetic vitals generator | 50,000 | Clinically-grounded 24hr wearable windows |
| UCI Diabetic Readmission (demographics) | 101,766 | Age, medications, diagnosis counts |
| BIDMC PPG (partial) | ~120 | PhysioNet PPG/respiration reference |

### Condition distribution (synthetic)
- CHF: 30% (15,000 patients)
- COPD: 25% (12,500 patients)
- Diabetic: 25% (12,500 patients)
- General/Other: 20% (10,000 patients)

**Positive rate (readmitted <30 days):** 52.0% (includes 20% label noise for realism)

---

## Feature Importance (Top 10 from SHAP)

| Rank | Feature | Signal Source | Clinical Relevance |
|------|---------|--------------|-------------------|
| 1 | `spo2_time_below_92_pct` | MAX30102 PPG | Hypoxia exposure time |
| 2 | `hrv_sdnn` | MAX30003 ECG | Cardiac autonomic stress |
| 3 | `bioz_delta_from_baseline` | MAX30009 BioZ | Fluid retention marker |
| 4 | `afib_days_in_window` | MAX30003 ECG | Arrhythmia burden |
| 5 | `cough_sum_24hr` | INMP441 Audio | Respiratory deterioration |
| 6 | `thoracic_fluid_index` | MAX30009 BioZ | Pulmonary congestion |
| 7 | `rr_imu_mean` | MPU6050 IMU | Tachypnea indicator |
| 8 | `spo2_mean` | MAX30102 PPG | Baseline oxygenation |
| 9 | `days_since_discharge` | Context | Temporal risk window |
| 10 | `bioz_ohms_trend_24hr` | MAX30009 BioZ | Fluid accumulation rate |

*See `results/shap_importance.png` for full visualization.*

---

## Architecture

### Layer 1 — Isolation Forests (unsupervised anomaly detection)
Four separate Isolation Forest models, each specializing in one signal domain:
- `iso_cardiac`: HR, HRV, AFib, QT interval
- `iso_respiratory`: SpO2, RR, cough, wheeze
- `iso_fluid`: BioZ resistance, thoracic fluid index
- `iso_activity`: Movement, nocturnal activity, respiratory variability

Output: 4 continuous anomaly scores (0=normal, 1=highly anomalous)

### Layer 2 — XGBoost Meta-Classifier (supervised)
- Input: 44 wearable features + 4 anomaly scores = 48 features
- SMOTE oversampling on training set
- Optuna hyperparameter optimization: 100 trials, maximize AUC-ROC
- Best hyperparameters:
  - n_estimators: 623
  - max_depth: 5
  - learning_rate: 0.0267
  - subsample: 0.938
  - colsample_bytree: 0.925

---

## Risk Tier Thresholds

| Tier | Score Range | Action |
|------|-------------|--------|
| LOW | 0–25 | Continue routine monitoring |
| MEDIUM | 25–50 | Schedule telemedicine check-in within 48hrs |
| HIGH | 50–75 | Contact patient and discharging physician today |
| CRITICAL | 75–100 | Immediate intervention — contact patient now |

---

## Known Limitations

1. **Synthetic training data**: The model was trained primarily on synthetic data. Real-world performance may differ significantly. Clinical validation on real patient cohorts is required before deployment.

2. **Label noise**: 20% of training labels were intentionally flipped to model uncertainty. This may reduce precision in borderline cases.

3. **Sensor calibration**: BioZ and ECG features assume well-calibrated sensors. Electrode placement quality is not modeled.

4. **No temporal modeling**: Each 24-hour window is treated independently. Multi-day trends are captured only through delta features.

5. **Condition imbalance**: The model may underperform for rare comorbidity combinations not well-represented in training.

6. **ECG placeholder features**: `hrv_lf_hf_ratio` and `qt_corrected` are NaN in training — when populated with real ECG spectral features, model should be retrained.

7. **Age bracket rounding**: UCI age brackets are approximated to midpoints.

---

## Intended Clinical Use

- **Intended use**: Post-discharge monitoring aid for nurses/physicians managing high-risk patients with CHF, COPD, or diabetes.
- **Not intended for**: Emergency triage, ICU monitoring, or standalone diagnostic use.
- **User**: Clinical care coordinators, remote monitoring teams.
- **Decision support only**: Output must be reviewed by a qualified clinician. Not for autonomous clinical decisions.
- **Alert latency**: Designed for 1–24 hour detection windows, not real-time emergencies.

---

## Regulatory Notes

This model is intended as a clinical decision support tool. Depending on jurisdiction:
- **US**: May require FDA 510(k) clearance as a Software as a Medical Device (SaMD)
- **EU**: MDR Class IIa or IIb classification likely required
- **IRB approval** required for clinical trials or retrospective validation studies

---

## Edge Cough Classifier

| Property | Value |
|----------|-------|
| Architecture | 2× Conv1D + Dense |
| Parameters | 2,853 |
| TFLite size | **11.9 KB** (int8 quantized) |
| Val accuracy | 1.000 (synthetic data) |
| Inference target | ESP32C6 via TFLite Micro |
| Classes | cough, throat_clear, speech, silence, wheeze |
| Features | 13 MFCCs + ZCR + RMS + spectral centroid |
