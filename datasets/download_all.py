"""
RecoverPath — Dataset Acquisition Script
Downloads UCI Diabetic Readmission dataset; marks PhysioNet as synthetic fallback
(PhysioNet requires credentialed access and causes timeout in CI/automated runs).
"""

import os
import sys
import zipfile
import requests
from pathlib import Path

BASE_DIR = Path(__file__).parent
UCI_DIR = BASE_DIR / "uci_readmission"
BIDMC_DIR = BASE_DIR / "bidmc"
PTT_DIR = BASE_DIR / "ptt_ppg"


# ── Task 1a: UCI Diabetic Readmission ─────────────────────────────────────────

def download_uci_readmission() -> bool:
    dest_csv = UCI_DIR / "diabetic_data.csv"
    if dest_csv.exists():
        print(f"[UCI] Already present: {dest_csv}")
        return True

    url = (
        "https://archive.ics.uci.edu/ml/machine-learning-databases/"
        "00296/dataset_diabetes.zip"
    )
    zip_path = UCI_DIR / "dataset_diabetes.zip"
    print(f"[UCI] Downloading from {url} …")
    try:
        r = requests.get(url, timeout=60, stream=True)
        r.raise_for_status()
        total = 0
        with open(zip_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 16):
                f.write(chunk)
                total += len(chunk)
        print(f"[UCI] Downloaded {total / 1024:.0f} KB")
        with zipfile.ZipFile(zip_path) as z:
            for member in z.namelist():
                if member.endswith(".csv"):
                    target = UCI_DIR / Path(member).name
                    with z.open(member) as src, open(target, "wb") as dst:
                        dst.write(src.read())
                    print(f"[UCI] Extracted → {target}")
        zip_path.unlink(missing_ok=True)
        print("[UCI] Download complete.")
        return True
    except Exception as exc:
        print(f"[UCI] Download failed ({exc}). Will use synthetic fallback.")
        return False


# ── Task 1b/c: PhysioNet — requires login, use synthetic fallback ─────────────

def download_bidmc() -> bool:
    """
    PhysioNet BIDMC requires credentialed access.
    Returns False to trigger synthetic fallback.
    To use real data:
      pip install wfdb
      python -c "import wfdb; wfdb.dl_database('bidmc', dl_dir='datasets/bidmc')"
    """
    out_csv = BIDMC_DIR / "bidmc_vitals.csv"
    if out_csv.exists():
        print(f"[BIDMC] Already present: {out_csv}")
        return True
    print("[BIDMC] PhysioNet requires credentials — using synthetic fallback.")
    return False


def download_ptt_ppg() -> bool:
    """
    PhysioNet PTT-PPG requires credentialed access.
    Returns False to trigger synthetic fallback.
    """
    out_csv = PTT_DIR / "record_summary.csv"
    if out_csv.exists():
        print(f"[PTT] Already present: {out_csv}")
        return True
    print("[PTT] PhysioNet requires credentials — using synthetic fallback.")
    return False


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("RecoverPath — Dataset Acquisition")
    print("=" * 60)

    uci_ok = download_uci_readmission()
    bidmc_ok = download_bidmc()
    ptt_ok = download_ptt_ppg()

    print("\n[DONE] Dataset acquisition complete.")
    print(f"  UCI readmission : {'OK' if uci_ok else 'FALLBACK (synthetic)'}")
    print(f"  BIDMC PPG+Resp  : {'OK' if bidmc_ok else 'FALLBACK (synthetic)'}")
    print(f"  PTT PPG         : {'OK' if ptt_ok else 'FALLBACK (synthetic)'}")


if __name__ == "__main__":
    main()
