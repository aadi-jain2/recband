# RecoverPath — Post-Discharge Readmission Prevention ML Pipeline

A complete ML pipeline for the RecoverPath wearable system — predicting 30-day hospital readmissions using multi-sensor wearable data from an ESP32C6-based device.

---

## Hardware

| Sensor | Interface | Data |
|--------|-----------|------|
| MAX30003 | SPI | ECG → RR interval, HRV, QT, AFib |
| MAX30009 | SPI | Bioimpedance → fluid retention, respiration rate |
| MAX30102 | I2C | PPG → SpO2, optical heart rate |
| MPU6050 | I2C | IMU → respiratory rate, activity, posture |
| INMP441 | I2S | MEMS mic → cough events, wheeze (on-device TFLite) |

Data flows: `ESP32C6 → Firebase Realtime DB → Python ML Pipeline → Risk Score`

---

## Project Structure

```
RecBand/
├── datasets/
│   ├── download_all.py          # Dataset acquisition
│   ├── generate_synthetic.py    # 50k synthetic patient windows
│   ├── synthetic_vitals.csv     # Generated training data
│   ├── uci_readmission/         # UCI Diabetic Readmission dataset
│   ├── bidmc/                   # BIDMC PPG+Respiration
│   └── ptt_ppg/                 # PTT PPG (if downloaded)
├── src/
│   ├── feature_engineering.py   # Firebase → feature dict aggregation
│   ├── train.py                 # 2-layer model training
│   ├── inference.py             # RecoverPathRiskEngine class
│   ├── firebase_listener.py     # Firebase realtime listener stub
│   └── edge/
│       └── train_cough_classifier.py  # TFLite edge model
├── models/
│   ├── recoverpath_risk_model.pkl
│   ├── recoverpath_scaler.pkl
│   ├── iso_cardiac.pkl
│   ├── iso_respiratory.pkl
│   ├── iso_fluid.pkl
│   ├── iso_activity.pkl
│   └── edge/
│       ├── cough_classifier.tflite   # 11.9 KB int8 model
│       ├── cough_model_data.cc       # C array for ESP32C6
│       └── cough_model_data.h        # Header file
├── results/
│   ├── metrics.json
│   ├── model_card.md
│   ├── roc_curve.png
│   ├── pr_curve.png
│   ├── confusion_matrix.png
│   ├── shap_importance.png
│   └── feature_correlation.png
├── requirements.txt
└── README.md
```

---

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Download Datasets

```bash
python datasets/download_all.py
```

Downloads UCI Diabetic Readmission dataset. PhysioNet datasets require credentials — synthetic fallback is used automatically.

### 3. Generate Synthetic Training Data

```bash
python datasets/generate_synthetic.py
```

Generates 50,000 clinically-grounded 24-hour patient windows with 44 features across CHF, COPD, diabetic, and general conditions.

### 4. Train the Risk Model

```bash
python src/train.py
```

Runs:
- Layer 1: 4× Isolation Forest per signal group
- Layer 2: XGBoost with 100-trial Optuna hyperparameter search
- SHAP analysis and result plots
- Saves all models to `models/`

Expected results:
- AUC-ROC: ~0.80+
- Sensitivity: ~0.82+
- Runtime: ~3–5 minutes

### 5. Train Edge Cough Classifier

```bash
python src/edge/train_cough_classifier.py
```

Trains a 2-layer CNN, quantizes to int8 TFLite, and generates a C array for ESP32C6 firmware. Output size: ~12 KB.

---

## Using the Inference Engine

```python
from src.inference import RecoverPathRiskEngine

engine = RecoverPathRiskEngine()
engine.load_models("models/")

# From pre-aggregated features
result = engine.score_from_features({
    "spo2_mean": 91.5,
    "hrv_sdnn": 16.0,
    "bioz_delta_from_baseline": 11.0,
    "afib_days_in_window": 4,
    "cough_sum_24hr": 52.0,
    "days_since_discharge": 4,
    # ... all 44 features
})

print(result["risk_tier"])      # "CRITICAL"
print(result["risk_score"])     # 78.4
print(result["triggered_alerts"])

# From raw Firebase records (list of 60-sec readings)
result = engine.score_from_firebase_stream(firebase_records, patient_id="P001")
```

### Response Format

```json
{
  "patient_id": "P001",
  "timestamp": "2026-06-30T08:00:00+00:00",
  "risk_score": 78.4,
  "risk_tier": "CRITICAL",
  "risk_probability": 0.784,
  "anomaly_scores": {
    "cardiac": 0.82,
    "respiratory": 0.71,
    "fluid": 0.68,
    "activity": 0.31
  },
  "triggered_alerts": [
    "SpO2 dropped below 92% for 22% of readings in last 24 hours",
    "Bioimpedance increased 11.0 ohms over baseline — possible fluid retention",
    "HRV SDNN critically low (16ms) — cardiac stress detected",
    "AFib detected in 4 of last 7 days",
    "Cough rate elevated: 52 coughs in 24 hours, trending upward"
  ],
  "recommended_action": "Immediate intervention — contact patient now",
  "top_risk_features": ["spo2_time_below_92_pct", "hrv_sdnn", "bioz_delta_from_baseline"],
  "days_since_discharge": 4
}
```

---

## Connecting Firebase

1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Realtime Database**
3. Go to Project Settings → Service Accounts → Generate new private key → save as `firebase_credentials.json`
4. Copy `.env.example` to `.env` and set:
   ```
   FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
   FIREBASE_CREDENTIALS_PATH=firebase_credentials.json
   ```
5. Run the listener:
   ```bash
   python src/firebase_listener.py
   ```

### Firebase Data Schema

Each ESP32C6 reading is written to `/patients/{patient_id}/readings/{timestamp}/`:

```json
{
  "spo2_pct": 94.2,
  "hr_ppg_bpm": 82.0,
  "hr_ecg_bpm": 83.0,
  "hrv_sdnn_ms": 38.5,
  "hrv_rmssd_ms": 32.1,
  "rr_interval_ms": 731.7,
  "qt_interval_ms": 405.0,
  "afib_flag": 0,
  "bioz_ohms": 68.3,
  "bioz_rr_bpm": 16.2,
  "thoracic_fluid_index": 0.38,
  "rr_imu_bpm": 15.8,
  "activity_score": 0.44,
  "posture_supine": 0,
  "cough_count": 0,
  "wheeze_flag": 0,
  "timestamp_unix": 1751270400
}
```

Risk scores are written back to `/patients/{patient_id}/risk_score/`.

---

## Deploying Cough Classifier to ESP32C6

1. Copy these files to your firmware project:
   - `models/edge/cough_classifier.tflite`
   - `models/edge/cough_model_data.cc`
   - `models/edge/cough_model_data.h`

2. Install TFLite Micro for ESP32 (Arduino or ESP-IDF):
   ```
   # Arduino: Install "TensorFlowLite_ESP32" library from Library Manager
   # ESP-IDF: Add esp-tflite-micro component
   ```

3. In your firmware:
   ```cpp
   #include "cough_model_data.h"
   #include "tensorflow/lite/micro/micro_interpreter.h"

   // Load model from flash
   const tflite::Model* model = tflite::GetModel(g_cough_model_data);

   // Input: 16 float features (13 MFCC + ZCR + RMS + spectral centroid)
   // Extracted from 1-second audio window at 16kHz
   // Output: 5-class softmax [cough, throat_clear, speech, silence, wheeze]
   ```

4. Model specs:
   - Size: **11.9 KB** (int8 quantized, fits in ESP32C6 384KB SRAM)
   - Inference time: ~1ms at 160MHz
   - Input: 16 int8 features
   - Output: 5 int8 logits

---

## Results

| Metric | Value |
|--------|-------|
| Risk Model AUC-ROC | **0.8079** |
| Risk Model Sensitivity | **0.8274** |
| Risk Model F1 Score | **0.8096** |
| Edge Model Size | **11.9 KB** |
| Edge Model Val Accuracy | **1.000** (synthetic) |

See `results/model_card.md` for full details.

---

## Important Notes

- This system is for **clinical decision support only**. All outputs must be reviewed by qualified clinicians.
- The current model is trained on synthetic data and requires clinical validation before deployment.
- Ensure HIPAA/GDPR compliance when handling real patient data.
- Firebase credentials (`firebase_credentials.json`) must never be committed to version control.
