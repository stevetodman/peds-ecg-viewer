"""
Pytest fixtures for ML tests.
"""
import os
import sys
import pytest
import torch
import numpy as np

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


@pytest.fixture(scope="session")
def device():
    """Get the best available device."""
    if torch.cuda.is_available():
        return torch.device('cuda')
    elif torch.backends.mps.is_available():
        return torch.device('mps')
    return torch.device('cpu')


@pytest.fixture(scope="session")
def checkpoint_path():
    """Path to the production model checkpoint."""
    return 'ml/training/checkpoints/best_hybrid_20251225_091556.pt'


@pytest.fixture(scope="session")
def model(device, checkpoint_path):
    """Load the trained model."""
    from ml.models.hybrid_model import hybrid_model_small

    model = hybrid_model_small(num_conditions=4)
    ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt['model_state_dict'])
    model = model.to(device)
    model.eval()
    return model


@pytest.fixture
def sample_signal():
    """Generate a synthetic ECG signal for testing."""
    # 12 leads, 5000 samples (10 sec at 500 Hz)
    np.random.seed(42)
    signal = np.random.randn(12, 5000).astype(np.float32) * 0.5

    # Add some structure (simulated R-peaks)
    for lead in range(12):
        for peak in range(0, 5000, 500):  # R-peak every 1 second (60 bpm)
            if peak + 50 < 5000:
                signal[lead, peak:peak+20] += 2.0  # R-wave
                signal[lead, peak+20:peak+50] -= 0.5  # S-wave

    return signal


@pytest.fixture
def sample_age_days():
    """Sample age in days (5 year old)."""
    return 5 * 365


@pytest.fixture
def sample_lead_mask():
    """Full 12-lead mask."""
    return [1] * 12


@pytest.fixture
def sample_9lead_mask():
    """9-lead mask (missing V2, V4, V6)."""
    mask = [1] * 12
    mask[7] = 0   # V2
    mask[9] = 0   # V4
    mask[11] = 0  # V6
    return mask
