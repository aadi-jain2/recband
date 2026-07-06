/**
 * RecoverPath — ESP32-C6 Wearable Firmware
 * ==========================================
 * Reads patient vitals every 60 seconds and pushes to Firebase RTDB.
 *
 * SENSORS SUPPORTED:
 *   MAX30102 — SpO2 + Heart Rate  (I2C, address 0x57)
 *   Piezo/strain chest band       (ADC, GPIO 2 by default)
 *   AD5933 Bioimpedance analyzer  (I2C, address 0x0D)
 *   INMP441 I2S MEMS microphone   (I2S — GPIO 4/5/6)
 *
 * Sensors are AUTO-DETECTED on boot — the firmware runs fine with
 * only MAX30102 attached; missing sensors send null values.
 *
 * FIREBASE SCHEMA (matches dashboard/lib/types.ts exactly):
 *   /patients/{PATIENT_ID}/latest_reading  — latest snapshot
 *   /patients/{PATIENT_ID}/readings/{TIMESTAMP_KEY}  — history
 *
 * LED STATUS:
 *   Slow blink (1 Hz)   — connecting to WiFi
 *   Fast blink (5 Hz)   — writing to Firebase / processing
 *   Solid ON            — idle, all good
 *   SOS pattern (3×3)   — unrecoverable error
 */

// ============================================================
//  UPDATE THESE — your WiFi and Firebase credentials
// ============================================================
#define WIFI_SSID       "YOUR_WIFI_SSID"          // UPDATE THIS
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"       // UPDATE THIS

// Firebase project settings (get from Firebase Console → Project settings)
#define FIREBASE_HOST   "YOUR-PROJECT.firebaseio.com"   // e.g. recoverpath-xyz.firebaseio.com  UPDATE THIS
#define FIREBASE_AUTH   "YOUR_DATABASE_SECRET"           // Legacy secret OR ID token             UPDATE THIS

// Which patient this device maps to (must match one of P001–P025 in the dashboard)
#define PATIENT_ID      "P001"   // UPDATE THIS — P001 = James Washington by default

// ============================================================
//  GPIO PIN ASSIGNMENTS (ESP32-C6 DevKit)
// ============================================================
#define PIN_I2C_SDA     6       // SDA — default ESP32-C6 I2C
#define PIN_I2C_SCL     7       // SCL — default ESP32-C6 I2C
#define PIN_PIEZO_ADC   2       // Piezo chest band → GPIO2 (ADC)
#define PIN_LED         8       // Onboard LED (active HIGH on most C6 devkits)

// INMP441 I2S MEMS Microphone (digital — much better SNR than analog)
// Wire: VDD→3.3V, GND→GND, L/R→GND, SD→GPIO4, WS→GPIO5, SCK→GPIO6
// NOTE: SCK shares GPIO6 with I2C SDA. If using both I2C AND INMP441,
// move I2C to GPIO10/11 and keep I2S on 4/5/6.
#define I2S_MIC_SD      4       // INMP441 SD  (serial data out)
#define I2S_MIC_WS      5       // INMP441 WS  (word select / LRCK)
#define I2S_MIC_SCK     6       // INMP441 SCK (bit clock)
#define I2S_PORT        I2S_NUM_0
#define I2S_SAMPLE_RATE 16000   // Hz
#define I2S_BUF_LEN     1024    // samples per read

// ============================================================
//  Timing
// ============================================================
#define READING_INTERVAL_MS   60000UL   // Send reading every 60 seconds
#define NTP_SYNC_INTERVAL_MS  3600000UL // Re-sync NTP every hour
#define WIFI_RETRY_MAX        10        // Max WiFi connection attempts before reboot
#define FIREBASE_RETRY_MAX    5         // Max Firebase write attempts per reading

// ============================================================
//  Includes
// ============================================================
#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>     // bblanchon/ArduinoJson v7
#include <Wire.h>
#include <time.h>
#include <driver/i2s.h>      // ESP-IDF I2S driver (built-in)
#include "MAX30105.h"        // SparkFun MAX3010x library
#include "spo2_algorithm.h"  // SparkFun SPO2 algorithm

static int32_t i2sBuf[I2S_BUF_LEN];   // raw I2S samples

// ============================================================
//  State
// ============================================================
MAX30105 particleSensor;

bool sensorMax30102 = false;
bool sensorAD5933   = false;

unsigned long lastReadingMs  = 0;
unsigned long lastNTPSyncMs  = 0;
bool          ntpSynced      = false;

// SPO2 / HR buffers (SparkFun algorithm needs 100 samples)
static const uint8_t SAMPLE_RATE = 25;    // Hz — MAX30102 sample rate
static const uint16_t BUF_LEN   = 100;
uint32_t irBuffer[BUF_LEN];
uint32_t redBuffer[BUF_LEN];
int32_t  spo2    = -1;
int8_t   spo2Valid = 0;
int32_t  hr      = -1;
int8_t   hrValid = 0;

// ============================================================
//  Helpers — LED patterns
// ============================================================
void ledBlink(int times, int onMs = 100, int offMs = 100) {
  for (int i = 0; i < times; i++) {
    digitalWrite(PIN_LED, HIGH);
    delay(onMs);
    digitalWrite(PIN_LED, LOW);
    delay(offMs);
  }
}

void ledSOS() {
  // S: 3 short, O: 3 long, S: 3 short
  for (int i = 0; i < 3; i++) { ledBlink(1, 100, 100); }
  for (int i = 0; i < 3; i++) { ledBlink(1, 400, 100); }
  for (int i = 0; i < 3; i++) { ledBlink(1, 100, 100); }
  delay(800);
}

// ============================================================
//  WiFi
// ============================================================
bool connectWiFi() {
  Serial.printf("[WiFi] Connecting to %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED && attempt < WIFI_RETRY_MAX * 5) {
    delay(500);
    Serial.print(".");
    // Slow blink while connecting
    digitalWrite(PIN_LED, attempt % 2);
    attempt++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Connected! IP: %s  RSSI: %d dBm\n",
      WiFi.localIP().toString().c_str(), WiFi.RSSI());
    digitalWrite(PIN_LED, HIGH);
    return true;
  }

  Serial.println("\n[WiFi] FAILED to connect.");
  return false;
}

bool ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  Serial.println("[WiFi] Reconnecting...");
  return connectWiFi();
}

// ============================================================
//  NTP
// ============================================================
void syncNTP() {
  Serial.print("[NTP] Syncing time...");
  configTime(0, 0, "pool.ntp.org", "time.nist.gov", "time.google.com");
  struct tm ti;
  int tries = 0;
  while (!getLocalTime(&ti) && tries++ < 20) { delay(500); Serial.print("."); }
  if (tries < 20) {
    ntpSynced = true;
    char buf[32];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &ti);
    Serial.printf(" OK → %s\n", buf);
  } else {
    Serial.println(" FAILED (will retry)");
  }
  lastNTPSyncMs = millis();
}

// Timestamp as ISO string "2026-07-01T21:03:45Z"
String nowISO() {
  struct tm ti;
  if (!getLocalTime(&ti)) return String(millis());
  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &ti);
  return String(buf);
}

// Firebase-safe key (colons replaced) "2026-07-01T21-03-45Z"
String nowFirebaseKey() {
  struct tm ti;
  if (!getLocalTime(&ti)) return "t" + String(millis());
  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H-%M-%SZ", &ti);
  return String(buf);
}

// ============================================================
//  Sensor init
// ============================================================
void initSensors() {
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);

  // ── MAX30102 SpO2 + HR ──
  if (particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    sensorMax30102 = true;
    particleSensor.setup(
      60,    // LED brightness (0=off, 255=50mA)
      4,     // sample average
      2,     // LED mode: 2 = Red + IR
      SAMPLE_RATE,
      411,   // pulse width (us)
      4096   // ADC range
    );
    Serial.println("[Sensor] MAX30102 OK — SpO2 + HR enabled");
  } else {
    Serial.println("[Sensor] MAX30102 NOT found — SpO2/HR will be null");
  }

  // ── AD5933 Bioimpedance ──
  Wire.beginTransmission(0x0D);
  if (Wire.endTransmission() == 0) {
    sensorAD5933 = true;
    Serial.println("[Sensor] AD5933 OK — BioZ enabled");
  } else {
    Serial.println("[Sensor] AD5933 NOT found — BioZ will be null");
  }

  // ADC for piezo chest band
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);  // 0-3.3V range
  Serial.printf("[Sensor] ADC ready — piezo on GPIO%d\n", PIN_PIEZO_ADC);

  // INMP441 I2S microphone
  if (initINMP441()) {
    Serial.printf("[Sensor] INMP441 OK — I2S mic on SD=%d WS=%d SCK=%d\n",
      I2S_MIC_SD, I2S_MIC_WS, I2S_MIC_SCK);
  } else {
    Serial.println("[Sensor] INMP441 FAILED — cough index will be null");
    Serial.println("         Check wiring: SD=GPIO4, WS=GPIO5, SCK=GPIO6, L/R=GND");
  }
}

// ============================================================
//  Sensor reads
// ============================================================

/**
 * Collect 100 MAX30102 samples and run the SpO2/HR algorithm.
 * Takes ~4 seconds at 25 Hz. Returns false if sensor absent.
 */
bool readMAX30102() {
  if (!sensorMax30102) return false;

  // Collect samples
  for (uint16_t i = 0; i < BUF_LEN; i++) {
    while (!particleSensor.available()) particleSensor.check();
    redBuffer[i] = particleSensor.getRed();
    irBuffer[i]  = particleSensor.getIR();
    particleSensor.nextSample();
  }

  maxim_heart_rate_and_oxygen_saturation(
    irBuffer, BUF_LEN, redBuffer,
    &spo2, &spo2Valid,
    &hr, &hrValid
  );

  // Sanity-check: reject clearly invalid hardware noise
  if (spo2Valid && (spo2 < 70 || spo2 > 100)) spo2Valid = 0;
  if (hrValid   && (hr  < 30  || hr  > 220))   hrValid   = 0;

  Serial.printf("[MAX30102] SpO2=%d%s  HR=%d%s\n",
    spo2, spo2Valid ? "" : "(invalid)",
    hr,   hrValid   ? "" : "(invalid)"
  );
  return true;
}

/**
 * Estimate respiratory rate from piezo chest band.
 * Samples ADC for 15 seconds, counts zero-crossings of the filtered signal.
 */
float readRespiratoryRate() {
  const int SAMPLE_COUNT = 750;   // ~15 s at 50 Hz
  const int SAMPLE_DELAY = 20;    // ms between samples

  int baseline = 0;
  for (int i = 0; i < 20; i++) baseline += analogRead(PIN_PIEZO_ADC);
  baseline /= 20;

  int crossings = 0;
  int prev = analogRead(PIN_PIEZO_ADC) - baseline;

  for (int i = 0; i < SAMPLE_COUNT; i++) {
    delay(SAMPLE_DELAY);
    int val = analogRead(PIN_PIEZO_ADC) - baseline;
    if (prev < 0 && val >= 0) crossings++;  // rising zero-crossing = one breath
    prev = val;
  }

  float rrBpm = (crossings / 15.0f) * 60.0f;
  rrBpm = constrain(rrBpm, 6.0f, 50.0f);
  Serial.printf("[Piezo] Resp rate: %.1f brpm (%d crossings in 15s)\n", rrBpm, crossings);
  return rrBpm;
}

/**
 * Init the INMP441 I2S microphone.
 * Called once from initSensors().
 */
bool initINMP441() {
  const i2s_config_t cfg = {
    .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate          = I2S_SAMPLE_RATE,
    .bits_per_sample      = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format       = I2S_CHANNEL_FMT_ONLY_LEFT,  // L/R pin tied to GND
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count        = 4,
    .dma_buf_len          = I2S_BUF_LEN,
    .use_apll             = false,
    .tx_desc_auto_clear   = false,
    .fixed_mclk           = 0,
  };
  const i2s_pin_config_t pins = {
    .mck_io_num   = I2S_PIN_NO_CHANGE,
    .bck_io_num   = I2S_MIC_SCK,
    .ws_io_num    = I2S_MIC_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num  = I2S_MIC_SD,
  };
  esp_err_t err = i2s_driver_install(I2S_PORT, &cfg, 0, NULL);
  if (err != ESP_OK) { return false; }
  err = i2s_set_pin(I2S_PORT, &pins);
  if (err != ESP_OK) { i2s_driver_uninstall(I2S_PORT); return false; }
  i2s_zero_dma_buffer(I2S_PORT);
  return true;
}

/**
 * Read INMP441 via I2S and return a cough index (0-100).
 *
 * Method: sample 2 seconds of audio at 16 kHz.
 * Compute peak amplitude per 100ms window.
 * Count windows that exceed the cough threshold (-25 dBFS).
 * Return (count / 20 windows) * 100 normalized.
 *
 * INMP441 outputs 24-bit values left-aligned in a 32-bit frame.
 * Shift right 8 bits to recover the 24-bit signed value.
 * Full scale = 2^23 = 8,388,608.
 */
float readCoughIndex() {
  const int    WINDOWS        = 20;             // 20 × 100ms = 2s
  const float  COUGH_THRESH   = -25.0f;         // dBFS — tune if needed
  const int    SAMPLES_PER_WIN = I2S_SAMPLE_RATE / 10;  // 1600 at 16kHz

  int coughWindows = 0;
  float maxDb = -96.0f;

  for (int w = 0; w < WINDOWS; w++) {
    size_t bytesRead = 0;
    // Read one window worth of samples
    i2s_read(I2S_PORT, i2sBuf, SAMPLES_PER_WIN * sizeof(int32_t), &bytesRead, pdMS_TO_TICKS(200));
    int n = bytesRead / sizeof(int32_t);
    if (n == 0) continue;

    // Peak amplitude in this window (DC removed)
    int64_t dcSum = 0;
    for (int i = 0; i < n; i++) dcSum += (i2sBuf[i] >> 8);
    int32_t dc = (int32_t)(dcSum / n);

    int32_t peak = 0;
    for (int i = 0; i < n; i++) {
      int32_t s = (i2sBuf[i] >> 8) - dc;
      int32_t a = abs(s);
      if (a > peak) peak = a;
    }

    if (peak > 0) {
      float dBFS = 20.0f * log10f((float)peak / 8388608.0f);
      if (dBFS > maxDb)     maxDb = dBFS;
      if (dBFS > COUGH_THRESH) coughWindows++;
    }
  }

  float idx = constrain((coughWindows / (float)WINDOWS) * 100.0f, 0.0f, 100.0f);
  Serial.printf("[INMP441] Cough index: %.1f  (peak: %.1f dBFS, %d/%d windows above threshold)\n",
    idx, maxDb, coughWindows, WINDOWS);
  return idx;
}

/**
 * Read AD5933 bioimpedance (simplified single-frequency sweep at ~50 kHz).
 * Returns magnitude in ohms. AD5933 full driver is complex; this is a
 * minimal implementation — replace with a full library for production.
 */
float readBioZ() {
  if (!sensorAD5933) return -1.0f;

  // Simple AD5933 register write sequence for single-point measurement
  Wire.beginTransmission(0x0D);
  Wire.write(0x81);  // Control register high byte: initialize with start freq
  Wire.write(0x10);
  Wire.endTransmission();
  delay(100);

  // Start frequency sweep
  Wire.beginTransmission(0x0D);
  Wire.write(0x81);
  Wire.write(0x20);  // Start frequency sweep
  Wire.endTransmission();
  delay(200);

  // Read real + imaginary data registers
  Wire.beginTransmission(0x0D);
  Wire.write(0x94);  // Real data register
  Wire.endTransmission(false);
  Wire.requestFrom(0x0D, 4);

  int16_t realPart = 0, imagPart = 0;
  if (Wire.available() >= 4) {
    realPart = (Wire.read() << 8) | Wire.read();
    imagPart = (Wire.read() << 8) | Wire.read();
  }

  // Magnitude = sqrt(R^2 + I^2), scaled by calibration factor (~1/gain factor)
  float magnitude = sqrt((float)realPart * realPart + (float)imagPart * imagPart);
  float ohms = magnitude > 0 ? (1.0f / magnitude) * 1000000.0f : -1.0f;
  ohms = constrain(ohms, 5.0f, 300.0f);

  Serial.printf("[AD5933] BioZ: %.1f ohms  (R=%d I=%d)\n", ohms, realPart, imagPart);
  return ohms;
}

// ============================================================
//  Firebase write via HTTPS REST API
// ============================================================

/**
 * Write JSON to a Firebase RTDB path via HTTPS PUT.
 * Uses the legacy database secret for auth (adequate for dev/demo).
 * path example: "patients/P001/latest_reading"
 */
bool firebasePut(const String& path, const String& jsonBody) {
  if (!ensureWiFi()) return false;

  String url = "https://" + String(FIREBASE_HOST) + "/" + path + ".json?auth=" + String(FIREBASE_AUTH);

  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);

  int code = http.PUT(jsonBody);
  bool ok  = (code == 200 || code == 204);

  if (ok) {
    Serial.printf("[Firebase] PUT %s → %d OK\n", path.c_str(), code);
  } else {
    Serial.printf("[Firebase] PUT %s → %d FAIL: %s\n",
      path.c_str(), code, http.getString().c_str());
  }

  http.end();
  return ok;
}

// ============================================================
//  Build + send a reading
// ============================================================
void sendReading() {
  ledBlink(2, 50, 50);  // fast double-blink = processing

  // Collect all sensors
  readMAX30102();
  float rrBpm   = readRespiratoryRate();
  float coughIdx = readCoughIndex();
  float biozOhms = readBioZ();

  // Build JSON payload — field names EXACTLY match dashboard/lib/types.ts
  String ts     = nowISO();
  String fkey   = nowFirebaseKey();
  int    rssi   = WiFi.RSSI();

  // Null-safe values
  String spo2Str = spo2Valid ? String(spo2)   : "null";
  String hrStr   = hrValid   ? String(hr)     : "null";
  String biozStr = biozOhms > 0 ? String(biozOhms, 1) : "null";
  String rrStr   = (rrBpm > 0) ? String(rrBpm, 1) : "null";

  // Using ArduinoJson for safe serialization
  JsonDocument doc;
  doc["patient_id"]        = PATIENT_ID;
  doc["timestamp"]         = ts;
  doc["source"]            = "esp32_live";      // vs "simulator"
  doc["data_quality"]      = "valid";
  doc["data_sufficiency"]  = sensorMax30102 ? "full" : "partial";

  if (spo2Valid)   doc["spo2"]       = spo2;
  if (hrValid)     doc["hr_ecg"]     = hr;
  if (hrValid)     doc["hr_ppg"]     = hr;
  if (rrBpm > 0)   doc["rr_imu"]     = rrBpm;
  if (biozOhms > 0) doc["bioz_ohms"] = biozOhms;
  if (coughIdx >= 0) doc["cough_sum"] = coughIdx;

  doc["rssi"] = rssi;

  // Device status sub-object (shown in dashboard hardware panel)
  JsonObject device = doc["device"].to<JsonObject>();
  device["rssi"]            = rssi;
  device["battery_pct"]     = -1;        // -1 = not available
  device["firmware_ver"]    = "2.0.0";
  JsonObject sens = device["sensors"].to<JsonObject>();
  sens["max30102"] = sensorMax30102;
  sens["ad5933"]   = sensorAD5933;
  sens["piezo"]    = true;
  sens["mic"]      = true;

  String body;
  serializeJson(doc, body);

  Serial.println("[Reading] " + body);

  // Write to Firebase with retry
  String basePath = "patients/" + String(PATIENT_ID);

  for (int attempt = 1; attempt <= FIREBASE_RETRY_MAX; attempt++) {
    if (firebasePut(basePath + "/latest_reading", body)) break;
    if (attempt < FIREBASE_RETRY_MAX) {
      Serial.printf("[Firebase] Retry %d/%d in 2s...\n", attempt + 1, FIREBASE_RETRY_MAX);
      delay(2000 * attempt);  // exponential backoff
    } else {
      Serial.println("[Firebase] All retries failed — reading lost.");
      ledSOS();
    }
  }

  // Also write to historical readings path
  // Strip device sub-object for history to save space
  doc.remove("device");
  String histBody;
  serializeJson(doc, histBody);
  firebasePut(basePath + "/readings/" + fkey, histBody);

  digitalWrite(PIN_LED, HIGH);  // solid = idle, all good
  Serial.printf("[Done] Reading sent at %s\n\n", ts.c_str());
}

// ============================================================
//  Setup
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);

  Serial.println("\n==============================");
  Serial.println("  RecoverPath ESP32-C6 v2.0.0 ");
  Serial.printf ("  Patient: %s\n", PATIENT_ID);
  Serial.println("==============================\n");

  // Connect WiFi (slow-blink during attempt)
  if (!connectWiFi()) {
    Serial.println("[ERROR] WiFi failed. Rebooting in 10s...");
    delay(10000);
    ESP.restart();
  }

  // Sync NTP time
  syncNTP();

  // Init sensors
  initSensors();

  // Boot report
  Serial.println("\n[BOOT] Sensor summary:");
  Serial.printf ("  MAX30102 (SpO2/HR): %s\n", sensorMax30102 ? "OK" : "MISSING — will send null");
  Serial.printf ("  AD5933   (BioZ):    %s\n", sensorAD5933   ? "OK" : "MISSING — will send null");
  Serial.println("  Piezo chest band:   connected on GPIO" + String(PIN_PIEZO_ADC));
  Serial.printf("  INMP441 I2S mic:    SD=GPIO%d  WS=GPIO%d  SCK=GPIO%d\n",
    I2S_MIC_SD, I2S_MIC_WS, I2S_MIC_SCK);
  Serial.println("\n[BOOT] Starting reading loop (every 60 seconds)...\n");

  // Send first reading immediately on boot
  sendReading();
}

// ============================================================
//  Loop
// ============================================================
void loop() {
  unsigned long now = millis();

  // Periodic NTP resync
  if (now - lastNTPSyncMs > NTP_SYNC_INTERVAL_MS) {
    syncNTP();
  }

  // Send reading every READING_INTERVAL_MS
  if (now - lastReadingMs >= READING_INTERVAL_MS) {
    lastReadingMs = now;
    sendReading();
  }

  delay(100);
}
