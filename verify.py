"""Final verification script for RecoverPath v2."""
from pathlib import Path
import sys

ROOT = Path(__file__).parent

FILES = [
    "src/data_ingestion.py",
    "src/firebase_listener.py",
    "src/smoke_test.py",
    "src/inference.py",
    "src/simulator.py",
    "src/firmware/main.cpp",
    "src/firmware/platformio.ini",
    "setup_esp32.py",
    "start_recoverpath.py",
    "models/recoverpath_risk_model.pkl",
    "models/iso_cardiac.pkl",
    "models/iso_respiratory.pkl",
    "models/iso_fluid.pkl",
    "models/iso_activity.pkl",
    "models/recoverpath_scaler.pkl",
    "datasets/synthetic_vitals.csv",
    "dashboard/app/globals.css",
    "dashboard/app/dashboard/page.tsx",
    "dashboard/app/dashboard/patient/[id]/page.tsx",
    "dashboard/app/dashboard/alerts/page.tsx",
    "dashboard/app/dashboard/analytics/page.tsx",
    "dashboard/components/dashboard/sidebar.tsx",
    "dashboard/components/dashboard/topbar.tsx",
]

print("\nRecoverPath v2 — File Inventory")
print("=" * 55)
all_ok = True
for f in FILES:
    p = ROOT / f
    if p.exists():
        size = p.stat().st_size
        print(f"  OK  {f:<48} {size:>8,} bytes")
    else:
        print(f"  XX  {f:<48} MISSING")
        all_ok = False

print("=" * 55)
print(f"  {'All files present.' if all_ok else 'MISSING FILES — see XX above.'}")
print()

# Check weights in inference.py
inf = (ROOT / "src/inference.py").read_text()
w55 = "0.55" in inf
w30 = "0.30" in inf
w15 = "0.15" in inf
print(f"  Composite weights 55/30/15: {'OK' if (w55 and w30 and w15) else 'WRONG'}")

# Check data_sufficiency in inference.py
has_sufficiency = "data_sufficiency" in inf
print(f"  data_sufficiency field:     {'OK' if has_sufficiency else 'MISSING'}")

# Check firmware sensor auto-detect
fw = (ROOT / "src/firmware/main.cpp").read_text()
has_autodetect = "scanI2C" in fw and "printBootReport" in fw
print(f"  Firmware sensor auto-detect: {'OK' if has_autodetect else 'MISSING'}")

# Check WiFi provisioning
has_wifi_ap = "RecoverPath-Setup" in fw
print(f"  Firmware WiFi AP:           {'OK' if has_wifi_ap else 'MISSING'}")

# Check data ingestion source tag
di = (ROOT / "src/data_ingestion.py").read_text()
has_source = "ReadingSource" in di and "SIMULATOR" in di and "ESP32_HARDWARE" in di
print(f"  Data ingestion source tags: {'OK' if has_source else 'MISSING'}")

# Check clean UI (no gradient/glowing in overview page)
overview = (ROOT / "dashboard/app/dashboard/page.tsx").read_text()
no_gradient = "gradient" not in overview
no_glowing  = "glowing" not in overview
print(f"  Overview page clean design: {'OK' if (no_gradient and no_glowing) else 'HAS DECORATIVE ELEMENTS'}")

print()
sys.exit(0 if all_ok else 1)
