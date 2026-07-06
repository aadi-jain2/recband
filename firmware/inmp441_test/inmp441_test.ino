/**
 * ============================================================
 *  INMP441 I2S Microphone — Test Sketch for ESP32-C6
 * ============================================================
 *
 * What this does:
 *   Every 100ms it reads 1024 samples from the INMP441 via I2S,
 *   computes peak amplitude and dBFS, and prints them to Serial.
 *
 * How to use:
 *   1. Wire the INMP441 (see WIRING below)
 *   2. Flash this sketch
 *   3. Open Serial Monitor at 115200 baud
 *   4. You should see amplitude values updating 10x per second
 *   5. Clap near the mic — amplitude should jump to 10,000+
 *   6. Breathe/cough near the mic — should see transients
 *
 * PASSING TEST:
 *   - Ambient noise:  amplitude 50–500,  dBFS around -50 to -35
 *   - Clap (close):   amplitude 5000+,   dBFS above -20
 *   - Silent room:    amplitude < 100
 *
 * FAILING TEST — what each symptom means:
 *   - amplitude = 0 always          → bad wiring (SD or WS)
 *   - amplitude stuck at 2147483647 → L/R pin is HIGH (must be LOW/GND)
 *   - amplitude varies but tiny     → mic too far, or gain issue
 *   - no Serial output at all       → wrong board or baud rate
 *
 * ============================================================
 *  WIRING  (ESP32-C6 DevKit)
 * ============================================================
 *
 *   INMP441 Pin    →   ESP32-C6 GPIO
 *   ─────────────────────────────────
 *   VDD            →   3.3V
 *   GND            →   GND
 *   SD  (Data out) →   GPIO 4   (I2S_DATA_IN)
 *   WS  (Word sel) →   GPIO 5   (I2S_WS / LRCK)
 *   SCK (Bit clk)  →   GPIO 6   (I2S_SCK / BCLK)
 *   L/R            →   GND      (selects LEFT channel — MUST be tied low)
 *
 * You can change the pin numbers below if you've wired differently.
 * ============================================================
 */

#include <Arduino.h>
#include <driver/i2s.h>

// ── Pin assignments — change if your wiring differs ──────────
#define I2S_SD   4    // Serial Data  (INMP441 SD  pin)
#define I2S_WS   5    // Word Select  (INMP441 WS  pin)
#define I2S_SCK  6    // Bit Clock    (INMP441 SCK pin)
// L/R pin on INMP441 → GND (not connected to ESP32)

// ── I2S settings ──────────────────────────────────────────────
#define I2S_PORT          I2S_NUM_0
#define I2S_SAMPLE_RATE   16000      // Hz
#define I2S_SAMPLE_BITS   32         // INMP441 outputs 24-bit in 32-bit frame
#define I2S_BUFFER_COUNT  8
#define I2S_BUFFER_LEN    1024       // samples per DMA buffer

// ── Read buffer ───────────────────────────────────────────────
static int32_t samples[I2S_BUFFER_LEN];

void i2s_init() {
  const i2s_config_t i2s_config = {
    .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate          = I2S_SAMPLE_RATE,
    .bits_per_sample      = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format       = I2S_CHANNEL_FMT_ONLY_LEFT,  // L/R tied to GND = left
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count        = I2S_BUFFER_COUNT,
    .dma_buf_len          = I2S_BUFFER_LEN,
    .use_apll             = false,
    .tx_desc_auto_clear   = false,
    .fixed_mclk           = 0,
  };

  const i2s_pin_config_t pin_config = {
    .mck_io_num   = I2S_PIN_NO_CHANGE,
    .bck_io_num   = I2S_SCK,
    .ws_io_num    = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num  = I2S_SD,
  };

  i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_PORT, &pin_config);
  i2s_zero_dma_buffer(I2S_PORT);

  Serial.println("[I2S] Driver installed OK");
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("==========================================");
  Serial.println("  INMP441 I2S Mic Test — ESP32-C6");
  Serial.println("==========================================");
  Serial.println("  Wiring check:");
  Serial.printf ("    SD  → GPIO %d\n", I2S_SD);
  Serial.printf ("    WS  → GPIO %d\n", I2S_WS);
  Serial.printf ("    SCK → GPIO %d\n", I2S_SCK);
  Serial.println("    L/R → GND  (CRITICAL — must be tied low)");
  Serial.println("    VDD → 3.3V");
  Serial.println();
  Serial.println("  Starting I2S...");

  i2s_init();

  Serial.println("  Ready. Reading every 100ms.");
  Serial.println("  Clap near mic to test — amplitude should spike.");
  Serial.println("==========================================");
  Serial.println("  Raw amplitude | dBFS | Event");
}

// Running peak-hold for cough detection (decays 5%/cycle)
float peakHold = 0;
uint32_t coughCount = 0;

void loop() {
  size_t bytesRead = 0;
  i2s_read(I2S_PORT, samples, sizeof(samples), &bytesRead, portMAX_DELAY);

  int samplesRead = bytesRead / sizeof(int32_t);
  if (samplesRead == 0) {
    Serial.println("  [WARN] 0 samples read — check wiring");
    delay(500);
    return;
  }

  // Find peak amplitude in this batch
  int32_t peak = 0;
  int64_t sum  = 0;
  for (int i = 0; i < samplesRead; i++) {
    // INMP441 outputs 24-bit value left-aligned in 32-bit word
    // Shift right 8 bits to get the actual 24-bit value
    int32_t s = samples[i] >> 8;
    int32_t a = abs(s);
    if (a > peak) peak = a;
    sum += s;
  }

  // DC offset removal (average)
  int32_t dcOffset = (int32_t)(sum / samplesRead);

  // Recompute peak with DC removed
  int32_t peakNoDC = 0;
  for (int i = 0; i < samplesRead; i++) {
    int32_t s = (samples[i] >> 8) - dcOffset;
    int32_t a = abs(s);
    if (a > peakNoDC) peakNoDC = a;
  }

  // Convert to dBFS (full scale = 2^23 = 8388608 for 24-bit signed)
  float dBFS = -96.0f;
  if (peakNoDC > 0) {
    dBFS = 20.0f * log10f((float)peakNoDC / 8388608.0f);
    dBFS = constrain(dBFS, -96.0f, 0.0f);
  }

  // Peak hold with decay (for envelope display)
  if (peakNoDC > peakHold) {
    peakHold = (float)peakNoDC;
  } else {
    peakHold *= 0.90f;  // decay 10% per cycle
  }

  // Simple cough detection: sharp transient above -25 dBFS
  const float COUGH_THRESHOLD_DB = -25.0f;
  bool isCough = dBFS > COUGH_THRESHOLD_DB;
  if (isCough) coughCount++;

  // Bar graph (40 chars wide)
  int barLen = (int)((peakHold / 8388608.0f) * 40.0f);
  barLen = constrain(barLen, 0, 40);
  char bar[41];
  memset(bar, '=', barLen);
  memset(bar + barLen, ' ', 40 - barLen);
  bar[40] = '\0';

  // Print result
  Serial.printf("  %8d | %6.1f dBFS | [%-40s] %s\n",
    peakNoDC,
    dBFS,
    bar,
    isCough ? "<-- SOUND DETECTED" : ""
  );

  // Extra diagnostics every 5 seconds
  static uint32_t lastDiag = 0;
  if (millis() - lastDiag > 5000) {
    lastDiag = millis();
    Serial.printf("  [5s summary] Samples: %d | DC offset: %d | Cough events: %u\n\n",
      samplesRead, dcOffset, coughCount);

    // Warn if amplitude suspiciously flat
    if (peakNoDC < 50) {
      Serial.println("  [WARN] Amplitude very low. Check:");
      Serial.println("         1. L/R pin must be connected to GND");
      Serial.println("         2. VDD must be 3.3V (NOT 5V)");
      Serial.println("         3. SD wire firmly connected to GPIO " + String(I2S_SD));
    }
  }

  delay(90);  // ~100ms loop
}
