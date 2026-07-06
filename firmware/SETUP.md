# RecoverPath ESP32-C6 Hardware Setup Guide

**Goal:** Get real sensor readings from your ESP32-C6 board flowing into  
Firebase and appearing live on the RecoverPath dashboard within 10 minutes.

---

## Hardware You Need

| Component | Part | Notes |
|-----------|------|-------|
| Microcontroller | ESP32-C6 DevKit (any variant) | Seeed XIAO ESP32C6 works well |
| SpO2 + Heart Rate | MAX30102 module | Most common purple breakout board |
| Chest band / Resp rate | Piezo film strip or strain gauge | Velcro band around chest |
| Bioimpedance (optional) | AD5933 breakout | For CHF fluid monitoring |
| Microphone (optional) | INMP441 I2S MEMS mic | For cough detection — digital I2S, much better SNR |
| USB cable | USB-C to USB-A/C | For power + programming |

---

## Wiring

```
ESP32-C6 DevKit          Sensor
─────────────────────────────────────────────
GPIO 6  (SDA)      →     MAX30102 SDA
                   →     AD5933 SDA   (same bus)
GPIO 7  (SCL)      →     MAX30102 SCL
                   →     AD5933 SCL   (same bus)
3.3V               →     MAX30102 VIN, AD5933 VCC
GND                →     MAX30102 GND, AD5933 GND

GPIO 2  (ADC)      →     Piezo chest band (+) via 10kΩ resistor to GND

── INMP441 I2S Microphone ────────────────────
GPIO 4  (I2S_SD)   →     INMP441 SD   (serial data out)
GPIO 5  (I2S_WS)   →     INMP441 WS   (word select / LRCK)
GPIO 6  (I2S_SCK)  →     INMP441 SCK  (bit clock)
3.3V               →     INMP441 VDD
GND                →     INMP441 GND
GND                →     INMP441 L/R  ← CRITICAL: must be tied to GND

GPIO 8             →     Onboard LED (or external LED + 220Ω resistor to GND)
```

> **IMPORTANT — INMP441 L/R pin:** This must be connected to GND to select the
> LEFT channel. If L/R is floating or HIGH, the mic will output all zeros or
> max values. This is the most common wiring mistake.
>
> **NOTE — GPIO 6 shared:** GPIO 6 is used for both I2C SDA and I2S SCK.
> If you are using MAX30102 AND the INMP441 at the same time, move I2C to
> GPIO 10 (SDA) and GPIO 11 (SCL), and update `PIN_I2C_SDA`/`PIN_I2C_SCL`
> in `main.cpp`. If you are only using the INMP441 (no MAX30102/AD5933), the
> default wiring above is fine.
>
> **I2C pull-ups:** Add 4.7kΩ resistors from SDA→3.3V and SCL→3.3V if your
> breakout boards don't have them built in. MAX30102 breakouts usually do.

**No sensors wired yet?** The firmware will still boot and send null values  
for missing sensors. You can test WiFi + Firebase connection with just the board.

---

## Software Setup

### Option A: PlatformIO (recommended)

1. Install [VS Code](https://code.visualstudio.com/) + [PlatformIO extension](https://platformio.org/install/ide?install=vscode)
2. Open the folder `firmware/recoverpath_esp32c6/` in VS Code
3. PlatformIO will auto-detect `platformio.ini` and install all libraries
4. Proceed to **Configuration** below

### Option B: Arduino IDE 2.x

1. Install Arduino IDE 2.x
2. Add ESP32 board support: File → Preferences → Additional boards manager URLs:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Tools → Board → Boards Manager → search "esp32" → install **esp32 by Espressif Systems** (≥3.0.0)
4. Install libraries via Library Manager (Sketch → Include Library → Manage Libraries):
   - **SparkFun MAX3010x Pulse and Proximity Sensor Library** by SparkFun
   - **ArduinoJson** by Benoit Blanchon (v7.x)
   - *(Firebase writes use raw HTTPS — no extra Firebase library needed)*
5. Board: Tools → Board → ESP32 Arduino → **ESP32C6 Dev Module**
6. Upload Speed: 921600
7. Rename `main.cpp` to `recoverpath_esp32c6.ino` if using Arduino IDE

---

## Configuration

Edit the top of `main.cpp` — look for the `// UPDATE THESE` markers:

```cpp
// ── UPDATE THESE ──────────────────────────────
#define WIFI_SSID       "YourNetworkName"
#define WIFI_PASSWORD   "YourPassword"

#define FIREBASE_HOST   "your-project.firebaseio.com"
#define FIREBASE_AUTH   "your-database-secret"

#define PATIENT_ID      "P001"   // Which patient this device maps to
// ──────────────────────────────────────────────
```

### Getting Firebase credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project → **Project Settings** (gear icon)
3. **General tab** → scroll to "Your apps" → note the **Project ID**
4. **Service Accounts tab** → scroll to **Database secrets** → click "Show" → copy the secret
5. `FIREBASE_HOST` = `{PROJECT_ID}.firebaseio.com`
6. `FIREBASE_AUTH` = the database secret you just copied

### Firebase Realtime Database security rules (for testing)

In Firebase Console → Realtime Database → Rules tab, set:
```json
{
  "rules": {
    "patients": {
      "$patient_id": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```
> ⚠️ These rules allow open access — fine for a demo, restrict before production.

---

## Flash the Firmware

### PlatformIO
```bash
cd firmware/recoverpath_esp32c6
pio run --target upload
pio device monitor   # Opens serial monitor at 115200 baud
```

### Arduino IDE
1. Connect ESP32-C6 via USB
2. Select correct COM port (Tools → Port)
3. Click Upload (→ button)
4. Open Serial Monitor (Tools → Serial Monitor, 115200 baud)

---

## Verify It's Working

Watch the Serial Monitor. You should see:

```
==============================
  RecoverPath ESP32-C6 v2.0.0
  Patient: P001
==============================

[WiFi] Connecting to YourNetwork ........
[WiFi] Connected! IP: 192.168.1.42  RSSI: -58 dBm
[NTP] Syncing time... OK → 2026-07-01T21:03:10Z

[Sensor] MAX30102 OK — SpO2 + HR enabled
[Sensor] AD5933 NOT found — BioZ will be null
[Sensor] ADC ready — piezo on GPIO2
[Sensor] INMP441 OK — I2S mic on SD=4 WS=5 SCK=6

[BOOT] Starting reading loop (every 60 seconds)...

[MAX30102] SpO2=97  HR=72
[Piezo] Resp rate: 16.0 brpm (4 crossings in 15s)
[INMP441] Cough index: 0.0  (peak: -52.3 dBFS, 0/20 windows above threshold)
[Reading] {"patient_id":"P001","timestamp":"2026-07-01T21:03:14Z","source":"esp32_live",...}
[Firebase] PUT patients/P001/latest_reading → 200 OK
[Firebase] PUT patients/P001/readings/2026-07-01T21-03-14Z → 200 OK
[Done] Reading sent at 2026-07-01T21:03:14Z
```

### Check the dashboard

1. Open `http://localhost:3000/dashboard`
2. Click on **Arjun Sharma** (P001) — or whichever patient ID you set
3. The patient card should show **🟢 Live Device** badge
4. Risk score and vitals will update with your real readings within 60 seconds

---

## Sensor-by-Sensor Testing

If you only have MAX30102 wired, that's enough to start. The firmware sends
`null` for missing sensors and the dashboard handles it gracefully.

| Test | What to check |
|------|---------------|
| WiFi only | Serial shows "Connected!" and "Firebase PUT → 200 OK" |
| + MAX30102 | Serial shows SpO2/HR values, not "invalid" |
| + Piezo | Serial shows "Resp rate: XX brpm" in plausible range (10–25) |
| + INMP441 | Serial shows "INMP441 OK" on boot and "Cough index" each cycle |

---

## INMP441 Microphone Testing

**Step 1 — Flash the standalone test sketch first** (faster feedback, no Firebase needed):

```bash
cd firmware/inmp441_test
pio run --target upload
pio device monitor
```

Or open `firmware/inmp441_test/inmp441_test.ino` in Arduino IDE and flash it.

**Step 2 — Read the Serial Monitor output (115200 baud):**

```
==========================================
  INMP441 I2S Mic Test — ESP32-C6
==========================================
  Starting I2S...
  [I2S] Driver installed OK
  Ready. Reading every 100ms.
  Clap near mic to test — amplitude should spike.
==========================================
  Raw amplitude | dBFS | Event
          142 |  -55.4 dBFS | [                                        ]
          198 |  -52.6 dBFS | [                                        ]
        18432 |  -13.2 dBFS | [====================                   ] <-- SOUND DETECTED
          312 |  -48.6 dBFS | [                                        ]
```

**Step 3 — Interpret the results:**

| What you see | Meaning |
|---|---|
| Amplitude 50–500, dBFS around -50 | Correct — ambient noise, mic is working |
| Amplitude spikes to 5,000+ when you clap | Correct — sensitivity is good |
| Amplitude = 0 always | Bad SD wire or wrong GPIO — check GPIO 4 |
| Amplitude = 8388607 (max) always | L/R pin is floating or HIGH — **connect L/R to GND** |
| "INMP441 FAILED" on boot | I2S driver error — check SCK (GPIO 6) and WS (GPIO 5) |
| Amplitude always < 50, no reaction | VDD is wrong (needs 3.3V, not 5V), or SD broken |

**Step 4 — Live cough trigger test:**

While the test sketch runs, exhale sharply or clap close to the INMP441.
You should see "SOUND DETECTED" appear on the right column.
The main firmware uses a threshold of **-25 dBFS** — any sound louder than that
in a 100ms window counts toward the cough index.

**Step 5 — Once the test passes, flash the main firmware:**

```bash
cd firmware/recoverpath_esp32c6
pio run --target upload
pio device monitor
```

You should see `[Sensor] INMP441 OK` in the boot log, and
`[INMP441] Cough index:` printed every 60 seconds.

---

## Troubleshooting

**Brownout / keeps rebooting**
: USB cable too thin for peak current draw. Use a USB port directly on your laptop (not a hub), or add a 470µF capacitor across 3.3V–GND on the breadboard.

**"MAX30102 NOT found" even when wired**
: Check SDA/SCL are on GPIO 6/7. Some ESP32-C6 boards use different defaults. Run an I2C scanner sketch to confirm address 0x57 is visible.

**"Firebase PUT → 401"**
: Database secret is wrong or expired. Re-copy from Firebase Console → Project Settings → Service Accounts → Database secrets.

**"Firebase PUT → -1" (no HTTP response)**
: SSL handshake failing. ESP32 Arduino core ≥3.0 uses the updated mbedTLS. Update your board package: Arduino IDE → Boards Manager → esp32 → update.

**I2C address conflict**
: MAX30102 is at 0x57, AD5933 is at 0x0D — these don't conflict. If you add other I2C devices, run an I2C scanner to confirm.

**Wrong board selected**
: ESP32-C6 is RISC-V, not Xtensa. Must select "ESP32C6 Dev Module" or a specific C6 variant in the board manager, not the generic "ESP32" boards.

**"INMP441 FAILED" on boot**
: I2S driver could not install. Almost always a pin conflict. Check that GPIO 4, 5, 6 are not already in use by other peripherals. If MAX30102 is sharing GPIO 6 (SDA), move I2C to GPIO 10/11 as described in the Wiring section.

**INMP441 amplitude is always 0**
: SD pin (GPIO 4) is not receiving data. Re-seat the SD wire. Confirm VDD is 3.3V and GND is connected. Try the test sketch before the main firmware.

**INMP441 amplitude is always 8388607 (max/clipped)**
: The L/R pin is floating or tied HIGH. It must be connected to GND. This selects the LEFT I2S channel — without it, the INMP441 does not output valid data.

**INMP441 amplitude is tiny and doesn't react to sound**
: VDD could be underpowered. The INMP441 needs a clean 3.3V. Avoid powering it from 5V through a resistor divider. Also check that the mic opening on the IC package faces toward the sound source (usually there is a small hole on the PCB).

**SpO2 reads 0 or 999**
: Finger not covering the sensor, or too much ambient light. Cup your hand around the MAX30102 and press your fingertip firmly.

---

## Patient ID Reference

Map your physical devices to these patient IDs in the dashboard:

| Device # | `PATIENT_ID` | Patient Name | Condition |
|----------|-------------|--------------|-----------|
| Board 1  | `P001`      | Arjun Sharma | CHF |
| Board 2  | `P002`      | Kavitha Nair | COPD |
| Board 3  | `P003`      | Rajan Pillai | CHF |

The simulator will automatically skip any patient whose `source` field in  
Firebase shows `esp32_live` within the last 90 seconds.
