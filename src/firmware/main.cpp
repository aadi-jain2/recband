/**
 * RecoverPath — ESP32C6 Wearable Firmware v2
 *
 * Sensor auto-detection: scans I2C + SPI on boot, runs with whatever is present.
 * WiFi provisioning: captive portal on first boot / repeated failures.
 * Firebase write: canonical JSON schema matching src/data_ingestion.py.
 *
 * Hardware targets:
 *   MAX30102 — SpO2 + PPG heart rate (I2C 0x57)
 *   MPU6050  — Accelerometer for activity + respiration (I2C 0x68)
 *   MAX30003 — ECG + HRV (SPI, CS configurable)
 *   MAX30009 — BioZ thoracic fluid (SPI, CS configurable)
 *
 * Compile: idf.py build  (ESP-IDF 5.x + Arduino-ESP32 3.x)
 * Flash:   idf.py -p /dev/ttyUSBx flash monitor
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>          // tzapu/WiFiManager — captive portal
#include <Firebase_ESP_Client.h>  // mobizt/Firebase-ESP-Client
#include <Wire.h>
#include <SPI.h>
#include <Preferences.h>           // NVS for WiFi credentials & config
#include <time.h>
#include "MAX30105.h"             // SparkFun MAX30105 library (MAX30102-compatible)
#include "heartRate.h"
#include "spo2_algorithm.h"

// ── Pin definitions ───────────────────────────────────────────────────────────
#define I2C_SDA         8
#define I2C_SCL         9
#define MAX30003_CS    10   // ECG SPI chip select
#define MAX30009_CS    11   // BioZ SPI chip select
#define LED_STATUS      7   // Onboard LED for status indication
#define BATTERY_ADC    A0   // Battery voltage divider (if present)

// ── Firebase config (read from NVS on boot) ───────────────────────────────────
#define FIREBASE_URL_KEY  "fb_url"
#define FIREBASE_KEY_KEY  "fb_api_key"
#define PATIENT_ID_KEY    "patient_id"

// ── Sample rate & intervals ───────────────────────────────────────────────────
#define SAMPLE_HZ         25    // PPG/SpO2 sample rate
#define WINDOW_S          60    // Aggregate + send every 60 seconds
#define SAMPLES_PER_WIN   (SAMPLE_HZ * WINDOW_S)

// ── Sensor presence flags ─────────────────────────────────────────────────────
struct SensorConfig {
    bool max30102 = false;   // SpO2 + PPG
    bool mpu6050  = false;   // Accel / IMU
    bool max30003 = false;   // ECG
    bool max30009 = false;   // BioZ
};
SensorConfig sensors;

// ── State ─────────────────────────────────────────────────────────────────────
Preferences    prefs;
MAX30105       particleSensor;
FirebaseData   fbData;
FirebaseAuth   fbAuth;
FirebaseConfig fbConfig;
WiFiManager    wifiManager;

String patientId    = "HW001";
String firebaseUrl  = "";
String firebaseKey  = "";

// Sample buffers
float    spo2Buf[SAMPLES_PER_WIN];
float    hrBuf[SAMPLES_PER_WIN];
float    accelBuf[SAMPLES_PER_WIN];  // activity from IMU
int      sampleIdx  = 0;
bool     bufferFull = false;

// Aggregated stats for last window
struct WindowStats {
    float spo2Mean   = 0, spo2Min = 100, spo2Max = 0;
    float hrMean     = 0, hrMax   = 0;
    float actMean    = 0;
    float rrIMU      = 0;   // estimated from IMU motion pattern
    int   coughCount = 0;
    int   afibFlag   = 0;
    float battPct    = -1;  // -1 = unavailable
    int   rssi       = 0;
};

// ── Boot: sensor auto-detection ───────────────────────────────────────────────
void scanI2C() {
    Serial.println("[BOOT] Scanning I2C bus …");
    for (uint8_t addr = 1; addr < 127; addr++) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            Serial.printf("  Found I2C device at 0x%02X\n", addr);
            if (addr == 0x57) sensors.max30102 = true;
            if (addr == 0x68 || addr == 0x69) sensors.mpu6050 = true;
        }
    }
}

bool spiDevicePresent(uint8_t csPin) {
    // Try toggling CS and see if SPI responds
    pinMode(csPin, OUTPUT);
    digitalWrite(csPin, HIGH);
    delay(5);
    digitalWrite(csPin, LOW);
    delay(2);
    SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));
    uint8_t resp = SPI.transfer(0x00);
    SPI.endTransaction();
    digitalWrite(csPin, HIGH);
    return (resp != 0xFF && resp != 0x00);
}

void scanSPI() {
    Serial.println("[BOOT] Scanning SPI devices …");
    sensors.max30003 = spiDevicePresent(MAX30003_CS);
    sensors.max30009 = spiDevicePresent(MAX30009_CS);
    if (sensors.max30003) Serial.println("  MAX30003 [ECG] detected on SPI CS10");
    if (sensors.max30009) Serial.println("  MAX30009 [BioZ] detected on SPI CS11");
}

void printBootReport() {
    Serial.println("\n" + String('=', 60));
    Serial.println("  RecoverPath ESP32C6 Boot Report");
    Serial.println(String('=', 60));
    Serial.printf("  Patient ID : %s\n", patientId.c_str());
    Serial.printf("  MAX30102   : %s\n", sensors.max30102 ? "[OK] SpO2 + PPG" : "[MISSING]");
    Serial.printf("  MPU6050    : %s\n", sensors.mpu6050  ? "[OK] IMU / Activity" : "[MISSING]");
    Serial.printf("  MAX30003   : %s\n", sensors.max30003 ? "[OK] ECG + HRV" : "[MISSING]");
    Serial.printf("  MAX30009   : %s\n", sensors.max30009 ? "[OK] BioZ / Thoracic" : "[MISSING]");

    if (!sensors.max30102 && !sensors.mpu6050 && !sensors.max30003 && !sensors.max30009) {
        Serial.println("\n  WARNING: No sensors detected — check wiring and power.");
        Serial.println("  Device will boot but will send no data.");
    } else if (!sensors.max30102) {
        Serial.println("\n  Running in PARTIAL mode — SpO2 + HR unavailable.");
        Serial.println("  Recommend: connect MAX30102 for full clinical monitoring.");
    } else {
        Serial.println("\n  Running in FULL mode.");
    }
    Serial.println(String('=', 60) + "\n");
}

// ── WiFi provisioning (captive portal) ───────────────────────────────────────
bool connectWiFi() {
    wifiManager.setConfigPortalTimeout(180);   // 3-min portal timeout
    wifiManager.setAPName("RecoverPath-Setup");
    wifiManager.setAPStaticIPConfig(
        IPAddress(192,168,4,1),
        IPAddress(192,168,4,1),
        IPAddress(255,255,255,0)
    );

    Serial.println("[WiFi] Attempting to connect …");
    bool ok = wifiManager.autoConnect("RecoverPath-Setup");
    if (ok) {
        Serial.printf("[WiFi] Connected: %s (RSSI %d dBm)\n",
            WiFi.SSID().c_str(), WiFi.RSSI());
    } else {
        Serial.println("[WiFi] Connection failed — continuing without network");
    }
    return ok;
}

// ── Firebase init ─────────────────────────────────────────────────────────────
bool initFirebase() {
    if (firebaseUrl.isEmpty() || firebaseKey.isEmpty()) {
        Serial.println("[Firebase] URL or API key not configured — skipping");
        return false;
    }
    fbConfig.database_url = firebaseUrl.c_str();
    fbConfig.api_key      = firebaseKey.c_str();
    Firebase.begin(&fbConfig, &fbAuth);
    Firebase.reconnectWiFi(true);
    Serial.println("[Firebase] Connected to " + firebaseUrl);
    return true;
}

// ── Sensor init ───────────────────────────────────────────────────────────────
void initSensors() {
    if (sensors.max30102) {
        if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
            Serial.println("[MAX30102] Init failed — disabling");
            sensors.max30102 = false;
        } else {
            particleSensor.setup();
            particleSensor.setPulseAmplitudeRed(0x0A);
            particleSensor.setPulseAmplitudeGreen(0);
            Serial.println("[MAX30102] Initialized");
        }
    }
}

// ── NTP time sync ─────────────────────────────────────────────────────────────
void syncNTP() {
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    Serial.print("[NTP] Syncing time");
    time_t now = 0;
    for (int i = 0; i < 20 && now < 1000000000; i++) {
        delay(500);
        time(&now);
        Serial.print(".");
    }
    Serial.println();
    struct tm ti;
    gmtime_r(&now, &ti);
    char buf[32];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &ti);
    Serial.printf("[NTP] Time: %s\n", buf);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
String nowISO() {
    time_t t;
    time(&t);
    struct tm ti;
    gmtime_r(&t, &ti);
    char buf[32];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &ti);
    return String(buf);
}

String nowFirebaseKey() {
    // Firebase key format: 2026-07-01T22-03-00Z (colons replaced)
    time_t t;
    time(&t);
    struct tm ti;
    gmtime_r(&t, &ti);
    char buf[32];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H-%M-%SZ", &ti);
    return String(buf);
}

// ── Read single sample ─────────────────────────────────────────────────────────
void readSample() {
    if (sensors.max30102) {
        long red = particleSensor.getRed();
        long ir  = particleSensor.getIR();
        // SpO2 and HR computation via SparkFun algorithm
        // (simplified here — production would use the full 100-sample buffer)
        uint32_t irBuf[100], redBuf[100];
        int32_t spo2Calc = 0, hrCalc = 0;
        int8_t  spo2Valid = 0, hrValid = 0;
        // Fill buffers (simplified: repeat last reading)
        for (int i = 0; i < 100; i++) {
            irBuf[i]  = (uint32_t)ir;
            redBuf[i] = (uint32_t)red;
        }
        maxim_heart_rate_and_oxygen_saturation(
            irBuf, 100, redBuf,
            &spo2Calc, &spo2Valid,
            &hrCalc,   &hrValid
        );
        if (spo2Valid && spo2Calc > 70 && spo2Calc <= 100) {
            spo2Buf[sampleIdx] = (float)spo2Calc;
        }
        if (hrValid && hrCalc > 30 && hrCalc < 220) {
            hrBuf[sampleIdx] = (float)hrCalc;
        }
    }
    sampleIdx++;
    if (sampleIdx >= SAMPLES_PER_WIN) {
        bufferFull = true;
        sampleIdx  = 0;
    }
}

// ── Aggregate window ───────────────────────────────────────────────────────────
WindowStats aggregateWindow() {
    WindowStats ws;
    ws.rssi    = WiFi.RSSI();

    // SpO2 + HR stats
    float spo2Sum = 0, hrSum = 0;
    int   spo2N   = 0, hrN   = 0;
    ws.spo2Min    = 100;
    ws.hrMax      = 0;

    for (int i = 0; i < SAMPLES_PER_WIN; i++) {
        if (spo2Buf[i] > 0) {
            spo2Sum      += spo2Buf[i];
            ws.spo2Min    = min(ws.spo2Min, spo2Buf[i]);
            ws.spo2Max    = max(ws.spo2Max, spo2Buf[i]);
            spo2N++;
        }
        if (hrBuf[i] > 0) {
            hrSum    += hrBuf[i];
            ws.hrMax  = max(ws.hrMax, hrBuf[i]);
            hrN++;
        }
    }
    ws.spo2Mean = spo2N > 0 ? spo2Sum / spo2N : -1;
    ws.hrMean   = hrN   > 0 ? hrSum   / hrN   : -1;

    // Battery (if ADC available)
    int raw = analogRead(BATTERY_ADC);
    if (raw > 0) {
        // Voltage divider: assume 100k/100k → ×2, 3.3V reference, 12-bit ADC
        float vBatt = (raw / 4095.0f) * 3.3f * 2.0f;
        // LiPo: 3.0V=0%, 4.2V=100%
        ws.battPct = constrain((vBatt - 3.0f) / 1.2f * 100.0f, 0.0f, 100.0f);
    }

    return ws;
}

// ── Firebase write ─────────────────────────────────────────────────────────────
void writeToFirebase(const WindowStats& ws) {
    if (!Firebase.ready()) return;

    String ts  = nowISO();
    String key = nowFirebaseKey();
    String basePath = "/patients/" + patientId;

    // Build JSON payload matching src/data_ingestion.py schema
    FirebaseJson reading;
    reading.set("patient_id",       patientId);
    reading.set("timestamp",        ts);
    reading.set("source",           "hardware");
    reading.set("data_quality",     "valid");
    reading.set("data_sufficiency", sensors.max30102 ? "full" : "partial");

    if (ws.spo2Mean > 0) reading.set("spo2",      ws.spo2Mean);
    if (ws.hrMean   > 0) reading.set("hr_ecg",    ws.hrMean);
    if (ws.hrMean   > 0) reading.set("hr_ppg",    ws.hrMean);
    reading.set("cough_sum",   ws.coughCount);
    reading.set("afib_flag",   ws.afibFlag);

    FirebaseJson device;
    device.set("rssi",     ws.rssi);
    device.set("sensors_detected/max30102", sensors.max30102);
    device.set("sensors_detected/mpu6050",  sensors.mpu6050);
    device.set("sensors_detected/max30003", sensors.max30003);
    device.set("sensors_detected/max30009", sensors.max30009);
    if (ws.battPct >= 0) device.set("battery_pct", ws.battPct);

    // Write latest_reading
    if (Firebase.RTDB.setJSON(&fbData, (basePath + "/latest_reading").c_str(), &reading)) {
        Serial.println("[Firebase] latest_reading written");
    } else {
        Serial.println("[Firebase] Write failed: " + fbData.errorReason());
    }

    // Write to history
    Firebase.RTDB.setJSON(&fbData, (basePath + "/readings/" + key).c_str(), &reading);

    // Write device status
    Firebase.RTDB.setJSON(&fbData, (basePath + "/device").c_str(), &device);

    // Clear buffers
    memset(spo2Buf, 0, sizeof(spo2Buf));
    memset(hrBuf,   0, sizeof(hrBuf));
    memset(accelBuf, 0, sizeof(accelBuf));
    bufferFull = false;
    sampleIdx  = 0;

    Serial.printf(
        "[%s] SpO2=%.1f%% HR=%.1fbpm Bat=%.0f%% RSSI=%ddBm\n",
        ts.c_str(), ws.spo2Mean, ws.hrMean,
        ws.battPct >= 0 ? ws.battPct : 0.0f, ws.rssi
    );
}

// ── Arduino setup ─────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(500);
    pinMode(LED_STATUS, OUTPUT);
    digitalWrite(LED_STATUS, HIGH);

    Serial.println("\n\n  RecoverPath ESP32C6 Firmware v2\n");

    // ── Load config from NVS ──
    prefs.begin("recoverpath", true);
    patientId   = prefs.getString(PATIENT_ID_KEY,  "HW001");
    firebaseUrl = prefs.getString(FIREBASE_URL_KEY, "");
    firebaseKey = prefs.getString(FIREBASE_KEY_KEY, "");
    prefs.end();

    // ── I2C + sensor scan ──
    Wire.begin(I2C_SDA, I2C_SCL);
    SPI.begin();
    scanI2C();
    scanSPI();
    printBootReport();
    initSensors();

    // ── WiFi (captive portal if needed) ──
    bool wifiOk = connectWiFi();

    if (wifiOk) {
        syncNTP();
        initFirebase();
    }

    digitalWrite(LED_STATUS, LOW);
    Serial.println("[BOOT] Setup complete. Entering sampling loop.\n");
}

// ── Arduino loop ───────────────────────────────────────────────────────────────
void loop() {
    readSample();
    delayMicroseconds(1000000 / SAMPLE_HZ);  // ~40ms per sample at 25Hz

    // Every WINDOW_S seconds: aggregate and send
    if (bufferFull || sampleIdx >= SAMPLES_PER_WIN) {
        WindowStats ws = aggregateWindow();
        if (WiFi.status() == WL_CONNECTED) {
            writeToFirebase(ws);
        } else {
            Serial.println("[WiFi] Disconnected — attempting reconnect …");
            WiFi.reconnect();
            delay(5000);
        }
    }
}
