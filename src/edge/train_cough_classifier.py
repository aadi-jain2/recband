"""
RecoverPath — Edge Cough/Wheeze Classifier
Trains a lightweight CNN for on-device inference on ESP32C6 via TFLite Micro.

Target: <100 KB int8 TFLite model
Classes: [cough, throat_clear, speech, silence, wheeze]
"""

from __future__ import annotations

import os
import sys
import struct
import warnings
from pathlib import Path

import numpy as np

warnings.filterwarnings("ignore")

ROOT = Path(__file__).parent.parent.parent
MODELS_EDGE_DIR = ROOT / "models" / "edge"
MODELS_EDGE_DIR.mkdir(parents=True, exist_ok=True)

TFLITE_PATH = MODELS_EDGE_DIR / "cough_classifier.tflite"
C_ARRAY_PATH = MODELS_EDGE_DIR / "cough_model_data.cc"

CLASSES = ["cough", "throat_clear", "speech", "silence", "wheeze"]
N_CLASSES = len(CLASSES)
SR = 16000          # sample rate Hz
WINDOW_SEC = 1.0    # 1-second windows
N_MFCC = 13
HOP_LENGTH = 512
N_FFT = 1024

SEED = 42
rng = np.random.default_rng(SEED)


# ── Audio feature extraction ───────────────────────────────────────────────────

def _hz_to_mel(hz: float) -> float:
    return 2595 * np.log10(1 + hz / 700)


def _mel_to_hz(mel: float) -> float:
    return 700 * (10 ** (mel / 2595) - 1)


def _mel_filterbank(n_filters: int, n_fft: int, sr: int) -> np.ndarray:
    low_mel = _hz_to_mel(0)
    high_mel = _hz_to_mel(sr / 2)
    mel_points = np.linspace(low_mel, high_mel, n_filters + 2)
    hz_points = np.array([_mel_to_hz(m) for m in mel_points])
    bin_points = np.floor((n_fft + 1) * hz_points / sr).astype(int)
    filters = np.zeros((n_filters, n_fft // 2 + 1))
    for i in range(1, n_filters + 1):
        start, center, end = bin_points[i-1], bin_points[i], bin_points[i+1]
        for j in range(start, center):
            filters[i-1, j] = (j - start) / max(center - start, 1)
        for j in range(center, end):
            filters[i-1, j] = (end - j) / max(end - center, 1)
    return filters


_FILTERBANK = _mel_filterbank(26, N_FFT, SR)


def extract_features(audio: np.ndarray) -> np.ndarray:
    """
    Extract MFCC (13) + ZCR (1) + RMS (1) + spectral centroid (1) = 16 features.
    Input: 1-second float32 audio at SR Hz
    """
    audio = audio.astype(np.float32)
    # Normalize
    audio = audio / (np.max(np.abs(audio)) + 1e-9)

    # Zero crossing rate
    zcr = float(np.mean(np.abs(np.diff(np.sign(audio)))) / 2)

    # RMS energy
    rms = float(np.sqrt(np.mean(audio ** 2)))

    # Spectrogram via manual STFT-like approach
    n_samples = len(audio)
    hop = HOP_LENGTH
    n_fft = N_FFT
    n_frames = max(1, (n_samples - n_fft) // hop + 1)
    window = np.hanning(n_fft)
    power_spec = np.zeros((n_fft // 2 + 1, n_frames))
    for t in range(n_frames):
        frame = audio[t*hop: t*hop + n_fft]
        if len(frame) < n_fft:
            frame = np.pad(frame, (0, n_fft - len(frame)))
        spectrum = np.abs(np.fft.rfft(frame * window)) ** 2
        power_spec[:, t] = spectrum

    # Mean power spectrum
    mean_spec = np.mean(power_spec, axis=1)

    # Spectral centroid
    freqs = np.linspace(0, SR / 2, n_fft // 2 + 1)
    centroid = float(np.sum(freqs * mean_spec) / (np.sum(mean_spec) + 1e-9))

    # Mel-scale filterbank energies
    mel_energies = np.dot(_FILTERBANK, mean_spec)
    mel_energies = np.log(mel_energies + 1e-9)

    # DCT for MFCCs (manual)
    n_mel = len(mel_energies)
    dct_matrix = np.array([
        [np.cos(np.pi * n / n_mel * (k + 0.5)) for k in range(n_mel)]
        for n in range(N_MFCC)
    ])
    mfcc = dct_matrix @ mel_energies

    features = np.concatenate([mfcc, [zcr, rms, centroid / (SR / 2)]])
    return features.astype(np.float32)


# ── Synthetic audio generation ─────────────────────────────────────────────────

def _generate_class_audio(label: int, n: int) -> np.ndarray:
    """Generate synthetic 1-second audio resembling each class."""
    n_samples = int(SR * WINDOW_SEC)
    batch = np.zeros((n, n_samples), dtype=np.float32)

    for i in range(n):
        t = np.linspace(0, WINDOW_SEC, n_samples)
        if label == 0:  # cough: burst + high freq
            burst = np.zeros(n_samples)
            burst_start = rng.integers(0, n_samples // 2)
            burst_len = rng.integers(SR // 10, SR // 3)
            burst_end = min(burst_start + burst_len, n_samples)
            env = np.exp(-np.linspace(0, 8, burst_end - burst_start))
            f = rng.uniform(200, 500)
            burst[burst_start:burst_end] = env * np.sin(2 * np.pi * f * t[:burst_end - burst_start])
            batch[i] = burst + rng.normal(0, 0.02, n_samples)

        elif label == 1:  # throat_clear: short mid-freq burst
            t0 = rng.integers(0, n_samples // 2)
            duration = rng.integers(SR // 8, SR // 4)
            t1 = min(t0 + duration, n_samples)
            env = np.sin(np.pi * np.linspace(0, 1, t1 - t0))
            f = rng.uniform(100, 300)
            seg = env * np.sin(2 * np.pi * f * t[:t1 - t0])
            batch[i, t0:t1] = seg * 0.6
            batch[i] += rng.normal(0, 0.01, n_samples)

        elif label == 2:  # speech: harmonic + formants
            f0 = rng.uniform(80, 300)
            sig = np.zeros(n_samples)
            for h in range(1, 8):
                sig += np.sin(2 * np.pi * f0 * h * t) / h
            batch[i] = sig * 0.3 + rng.normal(0, 0.02, n_samples)

        elif label == 3:  # silence: near-zero noise
            batch[i] = rng.normal(0, 0.005, n_samples)

        elif label == 4:  # wheeze: sustained narrow-band tone
            f = rng.uniform(100, 500)
            batch[i] = (
                np.sin(2 * np.pi * f * t) * 0.4
                + rng.normal(0, 0.02, n_samples)
            )

    return batch


def generate_synthetic_dataset(n_per_class: int = 2000):
    """Returns X (features) and y (labels)."""
    print(f"[EDGE] Generating synthetic audio features ({n_per_class}/class) …")
    X_list, y_list = [], []
    for label_idx, cls in enumerate(CLASSES):
        audio_batch = _generate_class_audio(label_idx, n_per_class)
        feats = np.array([extract_features(a) for a in audio_batch])
        X_list.append(feats)
        y_list.extend([label_idx] * n_per_class)
        print(f"  [{cls}] {n_per_class} samples → features shape {feats.shape}")
    X = np.vstack(X_list).astype(np.float32)
    y = np.array(y_list, dtype=np.int32)
    # Shuffle
    idx = rng.permutation(len(X))
    return X[idx], y[idx]


# ── Model definition ───────────────────────────────────────────────────────────

def build_model(input_shape: tuple) -> "tf.keras.Model":
    import tensorflow as tf
    inp = tf.keras.Input(shape=input_shape, name="input")
    x = tf.keras.layers.Reshape((input_shape[0], 1))(inp)

    # Conv block 1
    x = tf.keras.layers.Conv1D(16, 3, padding="same", activation="relu")(x)
    x = tf.keras.layers.MaxPooling1D(2)(x)

    # Conv block 2
    x = tf.keras.layers.Conv1D(32, 3, padding="same", activation="relu")(x)
    x = tf.keras.layers.GlobalAveragePooling1D()(x)

    # Dense
    x = tf.keras.layers.Dense(32, activation="relu")(x)
    x = tf.keras.layers.Dropout(0.3)(x)
    out = tf.keras.layers.Dense(N_CLASSES, activation="softmax", name="output")(x)

    model = tf.keras.Model(inputs=inp, outputs=out)
    return model


# ── TFLite conversion + C array ───────────────────────────────────────────────

def convert_to_tflite(model, X_train: np.ndarray) -> bytes:
    import tensorflow as tf

    def representative_data_gen():
        for sample in X_train[:200]:
            yield [sample.reshape(1, -1).astype(np.float32)]

    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.representative_dataset = representative_data_gen
    converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
    converter.inference_input_type = tf.int8
    converter.inference_output_type = tf.int8
    tflite_model = converter.convert()
    return tflite_model


def save_c_array(tflite_bytes: bytes, out_path: Path):
    """Generate a C array from TFLite model bytes for ESP32C6 firmware."""
    var_name = "g_cough_model_data"
    lines = [
        "// Auto-generated by RecoverPath edge trainer",
        "// Include this file in your ESP32C6 firmware project",
        '#include "cough_model_data.h"',
        "",
        f"const unsigned char {var_name}[] = {{",
    ]
    hex_bytes = [f"0x{b:02x}" for b in tflite_bytes]
    for i in range(0, len(hex_bytes), 12):
        row = ", ".join(hex_bytes[i:i+12])
        lines.append(f"  {row},")
    lines += [
        "};",
        f"const unsigned int {var_name}_len = {len(tflite_bytes)};",
    ]
    header_lines = [
        "// Auto-generated by RecoverPath edge trainer",
        "#ifndef COUGH_MODEL_DATA_H",
        "#define COUGH_MODEL_DATA_H",
        "#ifdef __cplusplus",
        'extern "C" {',
        "#endif",
        f"extern const unsigned char {var_name}[];",
        f"extern const unsigned int {var_name}_len;",
        "#ifdef __cplusplus",
        "}",
        "#endif",
        "#endif // COUGH_MODEL_DATA_H",
    ]
    out_path.write_text("\n".join(lines))
    header_path = out_path.with_suffix(".h")
    header_path.write_text("\n".join(header_lines))
    print(f"[EDGE] C array saved → {out_path}")
    print(f"[EDGE] Header saved  → {header_path}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("RecoverPath — Edge Cough Classifier Training")
    print("=" * 60)

    try:
        import tensorflow as tf
        print(f"[EDGE] TensorFlow {tf.__version__}")
    except ImportError:
        print("[EDGE] TensorFlow not found. Run: pip install tensorflow")
        return

    # ── Dataset ──
    try:
        import librosa
        import requests, zipfile, io
        esc50_csv = ROOT / "datasets" / "esc50_labels.csv"
        print("[EDGE] Attempting ESC-50 download …")
        r = requests.get(
            "https://github.com/karoldvl/ESC-50/archive/master.zip",
            timeout=60, stream=True
        )
        r.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            z.extractall(ROOT / "datasets" / "esc50_raw")
        print("[EDGE] ESC-50 downloaded — using synthetic fallback for reproducibility.")
        raise RuntimeError("Using synthetic for consistency")
    except Exception:
        pass

    # Always use synthetic for reproducibility
    X, y = generate_synthetic_dataset(n_per_class=2000)
    n_features = X.shape[1]
    print(f"[EDGE] Dataset: {len(X)} samples, {n_features} features, {N_CLASSES} classes")

    # Normalize
    mean = X.mean(axis=0)
    std = X.std(axis=0) + 1e-9
    X_norm = ((X - mean) / std).astype(np.float32)

    # Split
    n_train = int(0.80 * len(X_norm))
    X_train, X_val = X_norm[:n_train], X_norm[n_train:]
    y_train, y_val = y[:n_train], y[n_train:]

    import tensorflow as tf
    y_train_cat = tf.keras.utils.to_categorical(y_train, N_CLASSES)
    y_val_cat = tf.keras.utils.to_categorical(y_val, N_CLASSES)

    # ── Build & train ──
    model = build_model(input_shape=(n_features,))
    model.compile(
        optimizer="adam",
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )
    model.summary()

    print("\n[EDGE] Training …")
    history = model.fit(
        X_train, y_train_cat,
        validation_data=(X_val, y_val_cat),
        epochs=30,
        batch_size=64,
        callbacks=[
            tf.keras.callbacks.EarlyStopping(patience=5, restore_best_weights=True),
        ],
        verbose=1,
    )

    val_acc = max(history.history["val_accuracy"])
    print(f"\n[EDGE] Best val accuracy: {val_acc:.3f}")

    # ── TFLite conversion ──
    print("[EDGE] Converting to int8 TFLite …")
    tflite_bytes = convert_to_tflite(model, X_train)
    TFLITE_PATH.write_bytes(tflite_bytes)

    size_kb = len(tflite_bytes) / 1024
    print(f"[EDGE] TFLite model size: {size_kb:.1f} KB")
    if size_kb > 100:
        print(f"[EDGE] WARNING: Model exceeds 100 KB — consider reducing layers.")
    else:
        print(f"[EDGE] ✓ Model fits ESP32C6 SRAM (<100 KB)")

    # ── C array ──
    save_c_array(tflite_bytes, C_ARRAY_PATH)

    # ── Quick inference test ──
    interp = tf.lite.Interpreter(model_content=tflite_bytes)
    interp.allocate_tensors()
    inp_detail = interp.get_input_details()[0]
    out_detail = interp.get_output_details()[0]

    scale, zero_point = inp_detail["quantization"]
    sample = X_val[:1]
    if inp_detail["dtype"] == np.int8:
        sample_q = (sample / scale + zero_point).astype(np.int8)
    else:
        sample_q = sample

    interp.set_tensor(inp_detail["index"], sample_q)
    interp.invoke()
    output = interp.get_tensor(out_detail["index"])
    pred_class = CLASSES[np.argmax(output)]
    true_class = CLASSES[y_val[0]]
    print(f"\n[EDGE] Inference test — true: {true_class}, predicted: {pred_class}")

    print("\n[EDGE] Edge classifier complete.")
    print(f"  TFLite: {TFLITE_PATH}")
    print(f"  C array: {C_ARRAY_PATH}")
    print(f"  Size: {size_kb:.1f} KB")
    print(f"  Val acc: {val_acc:.3f}")

    return {
        "tflite_path": str(TFLITE_PATH),
        "c_array_path": str(C_ARRAY_PATH),
        "size_kb": size_kb,
        "val_accuracy": val_acc,
    }


if __name__ == "__main__":
    main()
