"""
ECG Augmentations v2
====================

Enhanced augmentations with 9-lead masking for robust training.
"""

import numpy as np
from typing import Optional, Tuple


class ECGAugmentor:
    """
    Comprehensive ECG augmentation pipeline.

    Augmentations:
    1. Random time shift (circular)
    2. Amplitude scaling per-lead
    3. Gaussian noise
    4. Baseline wander
    5. 9-lead masking (zero V2, V4, V6) - NEW

    Args:
        p_time_shift: Probability of time shift
        p_amplitude: Probability of amplitude scaling
        p_noise: Probability of adding noise
        p_baseline: Probability of baseline wander
        p_nine_lead_mask: Probability of masking to 9-lead format
        max_shift_ratio: Max shift as ratio of signal length
        amplitude_range: (min, max) scaling factors
        noise_std: Standard deviation of Gaussian noise
        baseline_amplitude: Max amplitude of baseline wander
    """

    def __init__(
        self,
        p_time_shift: float = 0.5,
        p_amplitude: float = 0.5,
        p_noise: float = 0.3,
        p_baseline: float = 0.3,
        p_nine_lead_mask: float = 0.15,  # Match 13% 9-lead in data + extra margin
        max_shift_ratio: float = 0.1,
        amplitude_range: Tuple[float, float] = (0.8, 1.2),
        noise_std: float = 0.05,
        baseline_amplitude: float = 0.1,
    ):
        self.p_time_shift = p_time_shift
        self.p_amplitude = p_amplitude
        self.p_noise = p_noise
        self.p_baseline = p_baseline
        self.p_nine_lead_mask = p_nine_lead_mask
        self.max_shift_ratio = max_shift_ratio
        self.amplitude_range = amplitude_range
        self.noise_std = noise_std
        self.baseline_amplitude = baseline_amplitude

    def __call__(self, signal: np.ndarray) -> np.ndarray:
        """
        Apply augmentations to signal.

        Args:
            signal: ECG signal of shape (12, n_samples)

        Returns:
            Augmented signal of shape (12, n_samples)
        """
        signal = signal.copy()
        n_leads, n_samples = signal.shape

        # 1. Time shift
        if np.random.random() < self.p_time_shift:
            max_shift = int(n_samples * self.max_shift_ratio)
            shift = np.random.randint(-max_shift, max_shift + 1)
            signal = np.roll(signal, shift, axis=1)

        # 2. Amplitude scaling (per-lead)
        if np.random.random() < self.p_amplitude:
            scales = np.random.uniform(
                self.amplitude_range[0],
                self.amplitude_range[1],
                size=(n_leads, 1)
            )
            signal = signal * scales

        # 3. Gaussian noise
        if np.random.random() < self.p_noise:
            noise = np.random.normal(0, self.noise_std, signal.shape)
            signal = signal + noise

        # 4. Baseline wander (low-frequency sinusoid)
        if np.random.random() < self.p_baseline:
            freq = np.random.uniform(0.1, 0.5)  # Hz
            phase = np.random.uniform(0, 2 * np.pi)
            t = np.linspace(0, 10, n_samples)  # 10 seconds
            amplitude = np.random.uniform(0, self.baseline_amplitude)
            wander = amplitude * np.sin(2 * np.pi * freq * t + phase)
            signal = signal + wander

        # 5. 9-lead masking (zero V2, V4, V6 - indices 7, 9, 11)
        if np.random.random() < self.p_nine_lead_mask:
            # Standard 12-lead order: I, II, III, aVR, aVL, aVF, V1, V2, V3, V4, V5, V6
            # Indices to mask: V2=7, V4=9, V6=11
            signal[7, :] = 0.0  # V2
            signal[9, :] = 0.0  # V4
            signal[11, :] = 0.0  # V6

        return signal.astype(np.float32)


def get_train_augmentor() -> ECGAugmentor:
    """Get standard training augmentor."""
    return ECGAugmentor()


def get_light_augmentor() -> ECGAugmentor:
    """Get lighter augmentation for fine-tuning."""
    return ECGAugmentor(
        p_time_shift=0.3,
        p_amplitude=0.3,
        p_noise=0.2,
        p_baseline=0.2,
        p_nine_lead_mask=0.10,
    )


def create_lead_mask(n_leads: int) -> np.ndarray:
    """
    Create a binary mask indicating which leads are present.

    For 9-lead ECGs, V2, V4, V6 are missing.

    Args:
        n_leads: Number of leads in the original recording (9 or 12)

    Returns:
        Binary mask of shape (12,) where 1 = lead present, 0 = missing
    """
    mask = np.ones(12, dtype=np.float32)
    if n_leads == 9:
        mask[7] = 0.0  # V2
        mask[9] = 0.0  # V4
        mask[11] = 0.0  # V6
    return mask


class SignalQualityModifier:
    """
    Modify confidence based on signal quality.

    Uses bSQI (beat signal quality index) to adjust prediction confidence.
    Higher quality signals get higher confidence multipliers.
    """

    def __init__(
        self,
        low_quality_threshold: float = 0.8,
        high_quality_threshold: float = 0.95,
        low_quality_multiplier: float = 0.8,
    ):
        """
        Args:
            low_quality_threshold: bSQI below this reduces confidence
            high_quality_threshold: bSQI above this maintains full confidence
            low_quality_multiplier: Multiply confidence by this for low quality
        """
        self.low_threshold = low_quality_threshold
        self.high_threshold = high_quality_threshold
        self.low_multiplier = low_quality_multiplier

    def get_confidence_modifier(self, bsqi: float) -> float:
        """
        Get confidence modifier based on signal quality.

        Args:
            bsqi: Average bSQI score (0-1)

        Returns:
            Confidence multiplier (0.8-1.0)
        """
        if bsqi >= self.high_threshold:
            return 1.0
        elif bsqi <= self.low_threshold:
            return self.low_multiplier
        else:
            # Linear interpolation
            ratio = (bsqi - self.low_threshold) / (self.high_threshold - self.low_threshold)
            return self.low_multiplier + ratio * (1.0 - self.low_multiplier)


if __name__ == "__main__":
    # Test augmentations
    print("Testing ECG Augmentations v2")
    print("=" * 50)

    # Create dummy signal
    np.random.seed(42)
    signal = np.random.randn(12, 5000).astype(np.float32)

    print(f"Input shape: {signal.shape}")
    print(f"Input mean: {signal.mean():.3f}, std: {signal.std():.3f}")

    # Test augmentor
    aug = get_train_augmentor()
    augmented = aug(signal)

    print(f"\nAfter augmentation:")
    print(f"Shape: {augmented.shape}")
    print(f"Mean: {augmented.mean():.3f}, std: {augmented.std():.3f}")

    # Test 9-lead masking
    print("\n9-lead masking test:")
    aug_9lead = ECGAugmentor(
        p_time_shift=0, p_amplitude=0, p_noise=0, p_baseline=0, p_nine_lead_mask=1.0
    )
    masked = aug_9lead(signal)
    print(f"V2 (idx 7) mean: {masked[7].mean():.6f} (should be 0)")
    print(f"V4 (idx 9) mean: {masked[9].mean():.6f} (should be 0)")
    print(f"V6 (idx 11) mean: {masked[11].mean():.6f} (should be 0)")
    print(f"V1 (idx 6) mean: {masked[6].mean():.3f} (should be non-zero)")

    # Test lead mask creation
    print("\nLead mask creation:")
    mask_12 = create_lead_mask(12)
    mask_9 = create_lead_mask(9)
    print(f"12-lead mask: {mask_12}")
    print(f"9-lead mask:  {mask_9}")

    # Test quality modifier
    print("\nSignal quality modifier:")
    sqm = SignalQualityModifier()
    for bsqi in [0.7, 0.8, 0.9, 0.95, 1.0]:
        mod = sqm.get_confidence_modifier(bsqi)
        print(f"  bSQI {bsqi:.2f} -> confidence modifier {mod:.2f}")
