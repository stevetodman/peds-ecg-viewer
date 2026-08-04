"""Versioned ECG preprocessing shared by training and research inference.

Recording duration and physical amplitude are preserved. Inputs that cannot
supply a complete ten-second model window are rejected instead of stretched,
padded, or replaced with synthetic zero data.
"""

from __future__ import annotations

from typing import Literal

import numpy as np

PREPROCESSING_VERSION = "duration-aware-mv-v1"
TARGET_SAMPLE_RATE = 500
TARGET_DURATION_SECONDS = 10.0
TARGET_SAMPLES = int(TARGET_SAMPLE_RATE * TARGET_DURATION_SECONDS)
MIN_SAMPLE_RATE = 100
MAX_SAMPLE_RATE = 2_000
MAX_INPUT_DURATION_SECONDS = 30.0
MAX_ABS_MV = 20.0


class PreprocessingError(ValueError):
    """Raised when an ECG cannot be safely transformed for the model."""


def _validate_signal(signal: np.ndarray, sample_rate: int) -> np.ndarray:
    if isinstance(sample_rate, bool) or not isinstance(sample_rate, (int, np.integer)):
        raise PreprocessingError("sample_rate must be an integer in Hz")
    if not MIN_SAMPLE_RATE <= int(sample_rate) <= MAX_SAMPLE_RATE:
        raise PreprocessingError(
            f"sample_rate must be between {MIN_SAMPLE_RATE} and {MAX_SAMPLE_RATE} Hz"
        )
    try:
        array = np.asarray(signal, dtype=np.float32)
    except (TypeError, ValueError) as exc:
        raise PreprocessingError("signal must be a rectangular numeric array") from exc
    if array.ndim != 2 or array.shape[0] != 12:
        count = array.shape[0] if array.ndim >= 1 else 0
        raise PreprocessingError(f"expected 12 leads, received {count}")
    if array.shape[1] < 2:
        raise PreprocessingError("signal must contain at least two samples per lead")
    if not np.isfinite(array).all():
        raise PreprocessingError("signal contains NaN or infinite values")
    duration = array.shape[1] / float(sample_rate)
    if duration < TARGET_DURATION_SECONDS:
        raise PreprocessingError(
            f"signal must contain at least {TARGET_DURATION_SECONDS:g} seconds of data"
        )
    if duration > MAX_INPUT_DURATION_SECONDS:
        raise PreprocessingError(
            f"signal may contain at most {MAX_INPUT_DURATION_SECONDS:g} seconds of data"
        )
    return array


def preprocess_ecg(
    signal: np.ndarray,
    sample_rate: int,
    *,
    input_unit: Literal["uv", "mv"],
) -> np.ndarray:
    """Return a centered ten-second, 500 Hz ECG in millivolts."""

    array = _validate_signal(signal, sample_rate)
    if input_unit == "uv":
        array = array / 1_000.0
    elif input_unit != "mv":
        raise PreprocessingError("input_unit must be 'uv' or 'mv'")
    if np.max(np.abs(array)) > MAX_ABS_MV:
        raise PreprocessingError(
            f"signal amplitude exceeds the supported {MAX_ABS_MV:g} mV range"
        )

    duration = array.shape[1] / float(sample_rate)
    output_length = int(round(duration * TARGET_SAMPLE_RATE))
    source_time = np.arange(array.shape[1], dtype=np.float64) / float(sample_rate)
    target_time = np.arange(output_length, dtype=np.float64) / TARGET_SAMPLE_RATE
    resampled = np.empty((12, output_length), dtype=np.float32)
    for lead_index in range(12):
        resampled[lead_index] = np.interp(
            target_time, source_time, array[lead_index]
        ).astype(np.float32, copy=False)

    start = (output_length - TARGET_SAMPLES) // 2
    cropped = resampled[:, start:start + TARGET_SAMPLES].copy()
    cropped -= np.median(cropped, axis=1, keepdims=True)
    if cropped.shape != (12, TARGET_SAMPLES) or not np.isfinite(cropped).all():
        raise PreprocessingError("preprocessing did not produce a valid model input")
    return cropped.astype(np.float32, copy=False)
