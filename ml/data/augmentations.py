"""
ECG Data Augmentations
======================

Simple, effective augmentations for ECG signals.
"""

import numpy as np
import torch
from typing import Optional


class ECGAugmentor:
    """
    ECG augmentation pipeline.

    All augmentations are applied with a probability and preserve signal shape.
    """

    def __init__(
        self,
        time_shift_prob: float = 0.5,
        time_shift_max: float = 0.1,  # Max shift as fraction of signal length
        amplitude_scale_prob: float = 0.5,
        amplitude_scale_range: tuple = (0.8, 1.2),
        noise_prob: float = 0.3,
        noise_std: float = 0.05,
        baseline_wander_prob: float = 0.3,
        baseline_wander_max: float = 0.1,
        lead_dropout_prob: float = 0.1,
        lead_dropout_max: int = 2,
    ):
        self.time_shift_prob = time_shift_prob
        self.time_shift_max = time_shift_max
        self.amplitude_scale_prob = amplitude_scale_prob
        self.amplitude_scale_range = amplitude_scale_range
        self.noise_prob = noise_prob
        self.noise_std = noise_std
        self.baseline_wander_prob = baseline_wander_prob
        self.baseline_wander_max = baseline_wander_max
        self.lead_dropout_prob = lead_dropout_prob
        self.lead_dropout_max = lead_dropout_max

    def __call__(self, signal: np.ndarray) -> np.ndarray:
        """
        Apply augmentations to ECG signal.

        Args:
            signal: Shape (n_leads, n_samples)

        Returns:
            Augmented signal with same shape
        """
        signal = signal.copy()

        # Time shift (circular)
        if np.random.random() < self.time_shift_prob:
            signal = self._time_shift(signal)

        # Amplitude scaling
        if np.random.random() < self.amplitude_scale_prob:
            signal = self._amplitude_scale(signal)

        # Gaussian noise
        if np.random.random() < self.noise_prob:
            signal = self._add_noise(signal)

        # Baseline wander
        if np.random.random() < self.baseline_wander_prob:
            signal = self._baseline_wander(signal)

        # Lead dropout (zeros out random leads)
        if np.random.random() < self.lead_dropout_prob:
            signal = self._lead_dropout(signal)

        return signal

    def _time_shift(self, signal: np.ndarray) -> np.ndarray:
        """Circular time shift."""
        n_samples = signal.shape[1]
        max_shift = int(n_samples * self.time_shift_max)
        shift = np.random.randint(-max_shift, max_shift + 1)
        return np.roll(signal, shift, axis=1)

    def _amplitude_scale(self, signal: np.ndarray) -> np.ndarray:
        """Random amplitude scaling per lead."""
        n_leads = signal.shape[0]
        scales = np.random.uniform(
            self.amplitude_scale_range[0],
            self.amplitude_scale_range[1],
            size=(n_leads, 1)
        )
        return signal * scales

    def _add_noise(self, signal: np.ndarray) -> np.ndarray:
        """Add Gaussian noise."""
        noise = np.random.normal(0, self.noise_std, signal.shape)
        return signal + noise

    def _baseline_wander(self, signal: np.ndarray) -> np.ndarray:
        """Add low-frequency baseline wander."""
        n_leads, n_samples = signal.shape

        # Generate slow sine wave
        freq = np.random.uniform(0.1, 0.5)  # Hz (assuming ~500Hz sample rate)
        t = np.linspace(0, n_samples / 500, n_samples)
        amplitude = np.random.uniform(0, self.baseline_wander_max)
        phase = np.random.uniform(0, 2 * np.pi)

        wander = amplitude * np.sin(2 * np.pi * freq * t + phase)

        # Apply to all leads with slight variation
        for i in range(n_leads):
            lead_amp = np.random.uniform(0.8, 1.2)
            signal[i] += wander * lead_amp

        return signal

    def _lead_dropout(self, signal: np.ndarray) -> np.ndarray:
        """Zero out random leads (simulates missing leads)."""
        n_leads = signal.shape[0]
        n_dropout = np.random.randint(1, min(self.lead_dropout_max + 1, n_leads))
        dropout_leads = np.random.choice(n_leads, n_dropout, replace=False)
        signal[dropout_leads] = 0
        return signal


class ECGAugmentorTorch:
    """
    PyTorch-compatible augmentor that works with tensors.
    """

    def __init__(self, **kwargs):
        self.augmentor = ECGAugmentor(**kwargs)

    def __call__(self, signal: torch.Tensor) -> torch.Tensor:
        """
        Apply augmentations to tensor.

        Args:
            signal: Shape (n_leads, n_samples)

        Returns:
            Augmented tensor
        """
        # Convert to numpy, augment, convert back
        signal_np = signal.numpy()
        augmented = self.augmentor(signal_np)
        return torch.from_numpy(augmented).float()


def get_train_augmentor() -> ECGAugmentor:
    """Get default training augmentor."""
    return ECGAugmentor(
        time_shift_prob=0.5,
        time_shift_max=0.1,
        amplitude_scale_prob=0.5,
        amplitude_scale_range=(0.8, 1.2),
        noise_prob=0.3,
        noise_std=0.05,
        baseline_wander_prob=0.3,
        baseline_wander_max=0.1,
        lead_dropout_prob=0.1,
        lead_dropout_max=2,
    )


def get_light_augmentor() -> ECGAugmentor:
    """Get lighter augmentation for less aggressive training."""
    return ECGAugmentor(
        time_shift_prob=0.3,
        time_shift_max=0.05,
        amplitude_scale_prob=0.3,
        amplitude_scale_range=(0.9, 1.1),
        noise_prob=0.2,
        noise_std=0.02,
        baseline_wander_prob=0.2,
        baseline_wander_max=0.05,
        lead_dropout_prob=0.05,
        lead_dropout_max=1,
    )


if __name__ == "__main__":
    # Test augmentations
    import matplotlib.pyplot as plt

    # Create dummy ECG signal
    np.random.seed(42)
    t = np.linspace(0, 10, 5000)

    # Simulate lead II with some QRS-like features
    signal = np.zeros((12, 5000))
    for i in range(12):
        # Base signal with periodic spikes
        base = 0.1 * np.sin(2 * np.pi * 1.2 * t)  # ~72 bpm
        # Add QRS-like spikes
        for j in range(12):
            spike_loc = int(j * 5000 / 12)
            if spike_loc < 5000 - 50:
                base[spike_loc:spike_loc+20] += 1.0 * (1 + 0.1 * i)
                base[spike_loc+20:spike_loc+50] -= 0.3
        signal[i] = base + 0.05 * np.random.randn(5000)

    # Apply augmentation
    augmentor = get_train_augmentor()
    augmented = augmentor(signal)

    # Plot comparison
    fig, axes = plt.subplots(2, 1, figsize=(12, 6))

    axes[0].plot(signal[1], 'b-', linewidth=0.5)
    axes[0].set_title('Original Lead II')
    axes[0].set_ylabel('Amplitude')

    axes[1].plot(augmented[1], 'r-', linewidth=0.5)
    axes[1].set_title('Augmented Lead II')
    axes[1].set_ylabel('Amplitude')
    axes[1].set_xlabel('Sample')

    plt.tight_layout()
    plt.savefig('ml/data/augmentation_example.png', dpi=150)
    print("Saved augmentation example to ml/data/augmentation_example.png")
