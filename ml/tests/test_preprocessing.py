import numpy as np
import pytest

from ml.data.preprocessing import PreprocessingError, preprocess_ecg


def test_resampling_preserves_frequency_and_amplitude():
    rate = 250
    time = np.arange(rate * 10) / rate
    lead = 1_000 * np.sin(2 * np.pi * 2 * time)
    signal = np.tile(lead, (12, 1)).astype(np.float32)
    processed = preprocess_ecg(signal, rate, input_unit="uv")
    assert processed.shape == (12, 5000)
    assert 38 <= np.count_nonzero(np.diff(np.signbit(processed[0]))) <= 41
    assert np.max(processed[0]) == pytest.approx(1.0, abs=0.01)


def test_short_input_is_not_stretched_or_padded():
    with pytest.raises(PreprocessingError, match="at least 10 seconds"):
        preprocess_ecg(np.ones((12, 4999), dtype=np.float32), 500, input_unit="mv")


def test_non_finite_input_is_rejected():
    signal = np.ones((12, 5000), dtype=np.float32)
    signal[4, 20] = np.inf
    with pytest.raises(PreprocessingError, match="NaN or infinite"):
        preprocess_ecg(signal, 500, input_unit="mv")
