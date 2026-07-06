"""Debug anomaly scores for healthy vs critical patient."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from inference import RecoverPathRiskEngine
import numpy as np

engine = RecoverPathRiskEngine()
engine.load_models(str(Path(__file__).parent.parent / "models"))

healthy = {
    'spo2_mean':98,'spo2_min':97,'spo2_std':0.4,'spo2_time_below_92_pct':0,
    'hr_ppg_mean':68,'hr_ppg_std':5,'hr_ppg_max':85,'hr_ppg_trend_6hr':0,
    'hr_ecg_mean':68,'rr_interval_mean':882,'rr_interval_std':45,
    'hrv_sdnn':52,'hrv_rmssd':55,'qt_interval_mean':400,
    'afib_pct_readings':0,'afib_days_in_window':0,
    'bioz_ohms_mean':72,'bioz_ohms_trend_24hr':0,'bioz_delta_from_baseline':-0.5,
    'thoracic_fluid_index':0.3,'bioz_rr_mean':15,'rr_imu_mean':15,'rr_imu_std':1,
    'activity_mean':0.5,'nocturnal_activity_mean':0.1,'posture_supine_pct':0.4,
    'cough_sum_24hr':0,'cough_max_hourly':0,'cough_trend_6hr':0,'wheeze_pct_hours':0,
    'age':58,'days_since_discharge':25,'num_prior_admissions_90d':0,
    'num_medications':3,'num_diagnoses':2,'diabetes_flag':0,'copd_flag':0,'chf_flag':0,
    'hrv_lf_hf_ratio':float('nan'),'qt_corrected':float('nan'),
}
critical = {
    'spo2_mean':87,'spo2_min':83,'spo2_std':3.5,'spo2_time_below_92_pct':0.45,
    'hr_ppg_mean':108,'hr_ppg_std':22,'hr_ppg_max':155,'hr_ppg_trend_6hr':8,
    'hr_ecg_mean':108,'rr_interval_mean':555,'rr_interval_std':110,
    'hrv_sdnn':9,'hrv_rmssd':10,'qt_interval_mean':455,
    'afib_pct_readings':0.38,'afib_days_in_window':6,
    'bioz_ohms_mean':43,'bioz_ohms_trend_24hr':0.8,'bioz_delta_from_baseline':19,
    'thoracic_fluid_index':0.82,'bioz_rr_mean':28,'rr_imu_mean':30,'rr_imu_std':5,
    'activity_mean':0.06,'nocturnal_activity_mean':0.28,'posture_supine_pct':0.82,
    'cough_sum_24hr':90,'cough_max_hourly':14,'cough_trend_6hr':2.5,'wheeze_pct_hours':0.52,
    'age':78,'days_since_discharge':2,'num_prior_admissions_90d':4,
    'num_medications':16,'num_diagnoses':9,'diabetes_flag':1,'copd_flag':1,'chf_flag':1,
    'hrv_lf_hf_ratio':float('nan'),'qt_corrected':float('nan'),
}

for label, feat in [("HEALTHY", healthy), ("CRITICAL", critical)]:
    r = engine.score_from_features(feat, patient_id=label)
    print(f"\n{label}:")
    print(f"  risk_score={r['risk_score']}  prob={r['risk_probability']}")
    print(f"  anomaly_scores: {r['anomaly_scores']}")
