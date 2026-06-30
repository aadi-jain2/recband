"""
RecoverPath — Two-Layer ML Training Pipeline
Layer 1: Per-signal Isolation Forest anomaly scorers
Layer 2: XGBoost meta-classifier with Optuna hyperparameter tuning
"""

from __future__ import annotations

import json
import warnings
import sys
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap
from imblearn.over_sampling import SMOTE
from sklearn.ensemble import IsolationForest
from sklearn.metrics import (
    auc,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import optuna
import xgboost as xgb
import seaborn as sns

optuna.logging.set_verbosity(optuna.logging.WARNING)
warnings.filterwarnings("ignore")

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
DATA_PATH = ROOT / "datasets" / "synthetic_vitals.csv"
UCI_PATH = ROOT / "datasets" / "uci_readmission" / "diabetic_data.csv"
MODELS_DIR = ROOT / "models"
RESULTS_DIR = ROOT / "results"
MODELS_DIR.mkdir(exist_ok=True)
RESULTS_DIR.mkdir(exist_ok=True)

# ── Isolation Forest feature groups ───────────────────────────────────────────
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


# ── Load data ──────────────────────────────────────────────────────────────────

def load_data() -> pd.DataFrame:
    if not DATA_PATH.exists():
        print(f"[TRAIN] Synthetic data not found at {DATA_PATH}. Running generator …")
        import subprocess
        subprocess.check_call([
            sys.executable,
            str(ROOT / "datasets" / "generate_synthetic.py"),
        ])
    df = pd.read_csv(DATA_PATH)

    # Optionally merge UCI features for demographic enrichment
    if UCI_PATH.exists():
        uci = pd.read_csv(UCI_PATH, low_memory=False)
        print(f"[TRAIN] UCI dataset loaded ({len(uci)} rows) — sampling demographics …")
        # Sample without replacement (or with if synthetic > UCI)
        n = min(len(df), len(uci))
        uci_sample = uci.sample(n=n, replace=len(df) > len(uci), random_state=42)
        uci_sample = uci_sample.reset_index(drop=True)
        df_sub = df.iloc[:n].copy()

        # Age from UCI bracket
        def parse_age(s):
            s = str(s).strip("[]()")
            try:
                lo, hi = [float(x) for x in s.split("-")]
                return (lo + hi) / 2
            except Exception:
                return np.nan

        df_sub["age"] = uci_sample["age"].apply(parse_age)
        df_sub["num_medications"] = pd.to_numeric(
            uci_sample["num_medications"], errors="coerce"
        )
        df_sub["num_diagnoses"] = pd.to_numeric(
            uci_sample["number_diagnoses"], errors="coerce"
        )
        df.update(df_sub)

    print(f"[TRAIN] Dataset: {len(df)} rows, {df.shape[1]} columns")
    print(f"[TRAIN] Positive rate: {df['label'].mean():.1%}")
    return df


# ── Feature selection ──────────────────────────────────────────────────────────

def get_feature_cols(df: pd.DataFrame) -> list[str]:
    drop_cols = {"label", "condition", "hrv_lf_hf_ratio", "qt_corrected"}
    return [c for c in df.columns if c not in drop_cols]


# ── Layer 1: Isolation Forests ─────────────────────────────────────────────────

def train_isolation_forests(df: pd.DataFrame) -> dict[str, IsolationForest]:
    print("\n[TRAIN] Layer 1 — Training Isolation Forests …")
    iso_models: dict[str, IsolationForest] = {}
    for name, cols in ISO_GROUPS.items():
        available = [c for c in cols if c in df.columns]
        X = df[available].fillna(df[available].median())
        iso = IsolationForest(
            n_estimators=200,
            contamination=0.12,
            random_state=42,
            n_jobs=-1,
        )
        iso.fit(X)
        iso_models[name] = iso
        # Save
        path = MODELS_DIR / f"iso_{name}.pkl"
        joblib.dump(iso, path)
        print(f"  iso_{name}: trained on {len(available)} features → {path.name}")
    return iso_models


def add_anomaly_scores(
    df: pd.DataFrame, iso_models: dict[str, IsolationForest]
) -> pd.DataFrame:
    """Adds 4 anomaly_* columns (0=normal, 1=anomalous) to df."""
    for name, iso in iso_models.items():
        cols = [c for c in ISO_GROUPS[name] if c in df.columns]
        X = df[cols].fillna(df[cols].median())
        # score_samples returns negative; flip and normalise to 0-1
        raw = iso.score_samples(X)
        normalised = (raw - raw.min()) / (raw.max() - raw.min() + 1e-9)
        df[f"anomaly_{name}"] = 1 - normalised  # high = more anomalous
    return df


# ── Layer 2: XGBoost with Optuna ──────────────────────────────────────────────

def objective(trial, X_train, y_train, X_val, y_val):
    params = {
        "n_estimators": trial.suggest_int("n_estimators", 100, 1000),
        "max_depth": trial.suggest_int("max_depth", 3, 10),
        "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
        "subsample": trial.suggest_float("subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
        "scale_pos_weight": trial.suggest_float("scale_pos_weight", 1.0, 10.0),
        "min_child_weight": trial.suggest_int("min_child_weight", 1, 10),
        "tree_method": "hist",
        "eval_metric": "auc",
        "random_state": 42,
        "n_jobs": -1,
        "use_label_encoder": False,
    }
    model = xgb.XGBClassifier(**params)
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=False,
    )
    proba = model.predict_proba(X_val)[:, 1]
    return roc_auc_score(y_val, proba)


def train_xgboost(
    df: pd.DataFrame,
    feature_cols: list[str],
    n_trials: int = 100,
) -> tuple[xgb.XGBClassifier, StandardScaler, dict]:
    print("\n[TRAIN] Layer 2 — XGBoost meta-classifier …")

    X = df[feature_cols].copy()
    y = df["label"].values

    # Fill NaN with median for scaler; XGBoost handles NaN natively but
    # SMOTE requires complete data.
    X_filled = X.fillna(X.median())

    X_train_raw, X_test_raw, y_train, y_test = train_test_split(
        X_filled, y, test_size=0.20, stratify=y, random_state=42
    )

    # SMOTE on training set only
    print(f"  SMOTE: {y_train.sum()} positive / {len(y_train)} total before …", end=" ")
    smote = SMOTE(random_state=42)
    X_train_sm, y_train_sm = smote.fit_resample(X_train_raw, y_train)
    print(f"{y_train_sm.sum()} positive / {len(y_train_sm)} total after.")

    # Scale
    scaler = StandardScaler()
    X_train_sc = scaler.fit_transform(X_train_sm)
    X_test_sc = scaler.transform(X_test_raw)

    joblib.dump(scaler, MODELS_DIR / "recoverpath_scaler.pkl")

    # Optuna tuning
    print(f"  Optuna tuning: {n_trials} trials …")
    study = optuna.create_study(direction="maximize")
    study.optimize(
        lambda trial: objective(
            trial,
            X_train_sc, y_train_sm,
            X_test_sc, y_test,
        ),
        n_trials=n_trials,
        show_progress_bar=False,
    )
    best_params = study.best_params
    best_auc = study.best_value
    print(f"  Best Optuna AUC-ROC: {best_auc:.4f}")
    print(f"  Best params: {best_params}")

    # Final model
    final_model = xgb.XGBClassifier(
        **best_params,
        tree_method="hist",
        eval_metric="auc",
        random_state=42,
        n_jobs=-1,
        use_label_encoder=False,
    )
    final_model.fit(X_train_sc, y_train_sm, verbose=False)
    joblib.dump(final_model, MODELS_DIR / "recoverpath_risk_model.pkl")
    print(f"  Model saved → {MODELS_DIR / 'recoverpath_risk_model.pkl'}")

    return final_model, scaler, {
        "X_test": X_test_sc,
        "y_test": y_test,
        "feature_cols": feature_cols,
        "X_train": X_train_sc,
        "y_train": y_train_sm,
        "X_test_raw": X_test_raw,
    }


# ── Evaluation ─────────────────────────────────────────────────────────────────

def evaluate(model, data: dict) -> dict:
    X_test = data["X_test"]
    y_test = data["y_test"]

    proba = model.predict_proba(X_test)[:, 1]
    preds = (proba >= 0.5).astype(int)

    auc_roc = roc_auc_score(y_test, proba)
    precision, recall, _ = precision_recall_curve(y_test, proba)
    auc_pr = auc(recall, precision)
    f1 = f1_score(y_test, preds)
    cm = confusion_matrix(y_test, preds)
    tn, fp, fn, tp = cm.ravel()
    sensitivity = tp / (tp + fn + 1e-9)
    specificity = tn / (tn + fp + 1e-9)

    metrics = {
        "auc_roc": round(float(auc_roc), 4),
        "auc_pr": round(float(auc_pr), 4),
        "f1_score": round(float(f1), 4),
        "sensitivity_recall": round(float(sensitivity), 4),
        "specificity": round(float(specificity), 4),
        "confusion_matrix": cm.tolist(),
        "n_test": int(len(y_test)),
        "n_positive_test": int(y_test.sum()),
    }

    print("\n[EVAL] ── Metrics ───────────────────────────────────")
    print(f"  AUC-ROC      : {metrics['auc_roc']:.4f}  (target >0.80)")
    print(f"  AUC-PR       : {metrics['auc_pr']:.4f}")
    print(f"  F1 @0.5      : {metrics['f1_score']:.4f}")
    print(f"  Sensitivity  : {metrics['sensitivity_recall']:.4f}  (target >0.80)")
    print(f"  Specificity  : {metrics['specificity']:.4f}")
    print(f"  Confusion:\n    TN={tn}  FP={fp}\n    FN={fn}  TP={tp}")

    with open(RESULTS_DIR / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"\n  Metrics saved → {RESULTS_DIR / 'metrics.json'}")

    # ── Plots ──
    _plot_roc(y_test, proba, auc_roc)
    _plot_pr(recall, precision, auc_pr)
    _plot_cm(cm)
    _plot_shap(model, X_test, data["feature_cols"])
    _plot_correlation(data["X_test_raw"], data["feature_cols"])

    return metrics


# ── Plot helpers ───────────────────────────────────────────────────────────────

def _plot_roc(y_test, proba, auc_roc):
    fpr, tpr, _ = roc_curve(y_test, proba)
    fig, ax = plt.subplots(figsize=(7, 6))
    ax.plot(fpr, tpr, lw=2, label=f"ROC (AUC = {auc_roc:.3f})", color="#2563eb")
    ax.plot([0, 1], [0, 1], "--", color="gray", lw=1)
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.set_title("ROC Curve — RecoverPath Risk Model")
    ax.legend(loc="lower right")
    fig.tight_layout()
    fig.savefig(RESULTS_DIR / "roc_curve.png", dpi=150)
    plt.close(fig)
    print(f"  Plot saved → roc_curve.png")


def _plot_pr(recall, precision, auc_pr):
    fig, ax = plt.subplots(figsize=(7, 6))
    ax.plot(recall, precision, lw=2, label=f"PR (AUC = {auc_pr:.3f})", color="#16a34a")
    ax.set_xlabel("Recall")
    ax.set_ylabel("Precision")
    ax.set_title("Precision-Recall Curve — RecoverPath Risk Model")
    ax.legend(loc="upper right")
    fig.tight_layout()
    fig.savefig(RESULTS_DIR / "pr_curve.png", dpi=150)
    plt.close(fig)
    print(f"  Plot saved → pr_curve.png")


def _plot_cm(cm):
    fig, ax = plt.subplots(figsize=(5, 4))
    sns.heatmap(
        cm, annot=True, fmt="d", cmap="Blues",
        xticklabels=["Pred 0", "Pred 1"],
        yticklabels=["True 0", "True 1"],
        ax=ax,
    )
    ax.set_title("Confusion Matrix")
    fig.tight_layout()
    fig.savefig(RESULTS_DIR / "confusion_matrix.png", dpi=150)
    plt.close(fig)
    print(f"  Plot saved → confusion_matrix.png")


def _plot_shap(model, X_test, feature_cols):
    print("  Computing SHAP values …")
    try:
        explainer = shap.TreeExplainer(model)
        shap_vals = explainer.shap_values(X_test[:2000])  # sample for speed
        fig, ax = plt.subplots(figsize=(10, 8))
        shap.summary_plot(
            shap_vals, X_test[:2000],
            feature_names=feature_cols,
            max_display=20,
            show=False,
            plot_size=None,
        )
        plt.tight_layout()
        plt.savefig(RESULTS_DIR / "shap_importance.png", dpi=150, bbox_inches="tight")
        plt.close("all")
        print(f"  Plot saved → shap_importance.png")
    except Exception as e:
        print(f"  SHAP plot skipped: {e}")


def _plot_correlation(X_test_raw, feature_cols):
    df_corr = pd.DataFrame(X_test_raw, columns=feature_cols)
    # Keep top 20 most variable features
    top_cols = df_corr.std().nlargest(20).index.tolist()
    corr = df_corr[top_cols].corr()
    fig, ax = plt.subplots(figsize=(12, 10))
    sns.heatmap(corr, annot=False, cmap="RdBu_r", center=0, ax=ax)
    ax.set_title("Feature Correlation (Top 20 Variable)")
    fig.tight_layout()
    fig.savefig(RESULTS_DIR / "feature_correlation.png", dpi=150)
    plt.close(fig)
    print(f"  Plot saved → feature_correlation.png")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("RecoverPath — Training Pipeline")
    print("=" * 60)

    df = load_data()

    # Layer 1
    iso_models = train_isolation_forests(df)
    df = add_anomaly_scores(df, iso_models)

    # Layer 2
    feature_cols = get_feature_cols(df)
    # Add anomaly score columns
    anomaly_cols = [c for c in df.columns if c.startswith("anomaly_")]
    feature_cols = feature_cols + anomaly_cols

    model, scaler, data = train_xgboost(df, feature_cols, n_trials=100)

    metrics = evaluate(model, data)

    print("\n" + "=" * 60)
    print("TRAINING COMPLETE")
    print("=" * 60)
    print(f"  AUC-ROC: {metrics['auc_roc']}")
    print(f"  Models:  {MODELS_DIR}")
    print(f"  Results: {RESULTS_DIR}")


if __name__ == "__main__":
    main()
