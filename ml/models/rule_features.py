"""
Rule-Based Feature Extractor for Hybrid Model
==============================================

Extracts ECG measurements and converts them to normalized features
for fusion with neural network embeddings.

Output feature vector (30 dimensions):
- 12 raw measurements (normalized to 0-1 range)
- 12 z-scores against age-adjusted normals
- 6 derived features (R/S ratios, flags)
"""

import numpy as np
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
import warnings

warnings.filterwarnings('ignore')

try:
    import neurokit2 as nk
    NK_AVAILABLE = True
except ImportError:
    NK_AVAILABLE = False

from ml.data.pediatric_normals import (
    get_normals_for_age,
    estimate_percentile,
    NormalRange,
)


# Feature names for interpretability
RAW_FEATURE_NAMES = [
    'heart_rate', 'rr_interval', 'pr_interval', 'qrs_duration',
    'qt_interval', 'qtc_bazett', 'qrs_axis',
    'r_wave_v1', 's_wave_v1', 'r_wave_v6', 's_wave_v6', 'quality'
]

ZSCORE_FEATURE_NAMES = [
    'hr_zscore', 'pr_zscore', 'qrs_zscore', 'qtc_zscore',
    'axis_zscore', 'r_v1_zscore', 's_v1_zscore', 'r_v6_zscore',
    's_v6_zscore', 'rs_ratio_v1_zscore', 'rs_ratio_v6_zscore', 'reserved'
]

DERIVED_FEATURE_NAMES = [
    'is_tachycardia', 'is_bradycardia', 'is_axis_abnormal',
    'is_qtc_prolonged', 'is_wide_qrs', 'has_any_abnormality'
]

ALL_FEATURE_NAMES = RAW_FEATURE_NAMES + ZSCORE_FEATURE_NAMES + DERIVED_FEATURE_NAMES


@dataclass
class RuleFeatures:
    """Container for extracted rule-based features."""
    # Raw measurements (normalized 0-1)
    raw_features: np.ndarray = field(default_factory=lambda: np.zeros(12, dtype=np.float32))

    # Z-scores against age norms
    zscore_features: np.ndarray = field(default_factory=lambda: np.zeros(12, dtype=np.float32))

    # Binary derived features
    derived_features: np.ndarray = field(default_factory=lambda: np.zeros(6, dtype=np.float32))

    # Extraction metadata
    extraction_success: bool = False
    error_message: str = ""
    quality_score: float = 0.0

    def to_vector(self) -> np.ndarray:
        """Concatenate all features into single vector (30 dims)."""
        return np.concatenate([
            self.raw_features,
            self.zscore_features,
            self.derived_features
        ])

    def to_dict(self) -> Dict[str, float]:
        """Convert to dictionary with named features."""
        vec = self.to_vector()
        return {name: float(vec[i]) for i, name in enumerate(ALL_FEATURE_NAMES)}


def normalize_value(value: float, min_val: float, max_val: float) -> float:
    """Normalize a value to 0-1 range."""
    if max_val <= min_val:
        return 0.5
    return max(0.0, min(1.0, (value - min_val) / (max_val - min_val)))


def compute_zscore(value: float, normal_range: NormalRange) -> float:
    """
    Compute z-score relative to age-adjusted normal range.

    Uses percentile-based normalization:
    - 0 at median (p50)
    - +/- 2 at p98/p2
    """
    p2, p50, p98 = normal_range.p2, normal_range.p50, normal_range.p98

    if value <= p50:
        if p50 == p2:
            return 0.0
        return -2.0 * (p50 - value) / (p50 - p2)
    else:
        if p98 == p50:
            return 0.0
        return 2.0 * (value - p50) / (p98 - p50)


class RuleFeatureExtractor:
    """
    Extracts rule-based features from raw ECG signals.

    These features are used for:
    1. Fusion with neural network embeddings in hybrid model
    2. Interpretable explanations
    3. Fallback predictions when signal quality is low
    """

    # Normalization ranges for raw features
    RAW_RANGES = {
        'heart_rate': (30, 220),
        'rr_interval': (270, 2000),  # ms
        'pr_interval': (50, 300),  # ms
        'qrs_duration': (30, 180),  # ms
        'qt_interval': (200, 600),  # ms
        'qtc_bazett': (300, 600),  # ms
        'qrs_axis': (-180, 180),  # degrees
        'r_wave_v1': (0, 40),  # mm
        's_wave_v1': (0, 40),  # mm
        'r_wave_v6': (0, 40),  # mm
        's_wave_v6': (0, 40),  # mm
    }

    def __init__(self, sampling_rate: int = 500):
        """
        Args:
            sampling_rate: Expected sampling rate of input signals
        """
        self.sampling_rate = sampling_rate

    def extract(
        self,
        signal: np.ndarray,
        age_days: int,
        lead_names: List[str] = None,
    ) -> RuleFeatures:
        """
        Extract rule-based features from ECG signal.

        Args:
            signal: ECG signal of shape (n_leads, n_samples) or (n_samples, n_leads)
            age_days: Patient age in days
            lead_names: Optional list of lead names. If None, assumes standard 12-lead order.

        Returns:
            RuleFeatures object with extracted features
        """
        features = RuleFeatures()

        if not NK_AVAILABLE:
            features.error_message = "neurokit2 not available"
            return features

        # Ensure signal is (n_leads, n_samples)
        if signal.ndim == 1:
            signal = signal.reshape(1, -1)
        elif signal.shape[0] > signal.shape[1]:
            signal = signal.T

        n_leads, n_samples = signal.shape

        # Default lead names
        if lead_names is None:
            lead_names = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF',
                          'V1', 'V2', 'V3', 'V4', 'V5', 'V6'][:n_leads]

        try:
            # Extract measurements
            measurements = self._extract_measurements(signal, lead_names)

            if measurements is None:
                features.error_message = "Measurement extraction failed"
                return features

            # Get age-adjusted normals
            normals = get_normals_for_age(age_days)

            # Build feature vectors
            features.raw_features = self._build_raw_features(measurements)
            features.zscore_features = self._build_zscore_features(measurements, normals)
            features.derived_features = self._build_derived_features(measurements, normals)

            features.extraction_success = True
            features.quality_score = measurements.get('quality', 0.0)

        except Exception as e:
            features.error_message = str(e)

        return features

    def _extract_measurements(
        self,
        signal: np.ndarray,
        lead_names: List[str],
    ) -> Optional[Dict]:
        """Extract raw ECG measurements using neurokit2."""

        # Find rhythm lead (prefer II, then I, then first available)
        rhythm_lead_idx = 0
        for preferred in ['II', 'I', 'V5']:
            if preferred in lead_names:
                rhythm_lead_idx = lead_names.index(preferred)
                break

        rhythm_signal = signal[rhythm_lead_idx]

        # Clean and detect R-peaks
        cleaned = nk.ecg_clean(rhythm_signal, sampling_rate=self.sampling_rate)
        _, rpeaks = nk.ecg_peaks(cleaned, sampling_rate=self.sampling_rate)
        r_peaks = rpeaks['ECG_R_Peaks']

        if len(r_peaks) < 3:
            return None

        measurements = {}

        # Heart rate from RR intervals
        rr_intervals = np.diff(r_peaks) / self.sampling_rate * 1000  # ms
        rr_mean = float(np.median(rr_intervals))
        measurements['rr_interval'] = rr_mean
        measurements['heart_rate'] = 60000 / rr_mean if rr_mean > 0 else None

        # Quality score
        measurements['quality'] = min(len(r_peaks) / 10, 1.0)

        # Try delineation for intervals
        try:
            _, waves = nk.ecg_delineate(
                cleaned, rpeaks, sampling_rate=self.sampling_rate,
                method='dwt'
            )

            # PR interval
            p_onsets = waves.get('ECG_P_Onsets', [])
            qrs_onsets = waves.get('ECG_R_Onsets', [])

            if p_onsets and qrs_onsets:
                pr_intervals = []
                for p_on, qrs_on in zip(p_onsets[:10], qrs_onsets[:10]):
                    if not np.isnan(p_on) and not np.isnan(qrs_on) and qrs_on > p_on:
                        pr_ms = (qrs_on - p_on) / self.sampling_rate * 1000
                        if 50 < pr_ms < 400:
                            pr_intervals.append(pr_ms)
                if pr_intervals:
                    measurements['pr_interval'] = float(np.median(pr_intervals))

            # QRS duration
            qrs_offsets = waves.get('ECG_R_Offsets', [])

            if qrs_onsets and qrs_offsets:
                qrs_durations = []
                for qrs_on, qrs_off in zip(qrs_onsets[:10], qrs_offsets[:10]):
                    if not np.isnan(qrs_on) and not np.isnan(qrs_off) and qrs_off > qrs_on:
                        qrs_ms = (qrs_off - qrs_on) / self.sampling_rate * 1000
                        if 20 < qrs_ms < 200:
                            qrs_durations.append(qrs_ms)
                if qrs_durations:
                    measurements['qrs_duration'] = float(np.median(qrs_durations))

            # QT interval and QTc
            t_offsets = waves.get('ECG_T_Offsets', [])

            if qrs_onsets and t_offsets:
                qt_intervals = []
                for qrs_on, t_off in zip(qrs_onsets[:10], t_offsets[:10]):
                    if not np.isnan(qrs_on) and not np.isnan(t_off) and t_off > qrs_on:
                        qt_ms = (t_off - qrs_on) / self.sampling_rate * 1000
                        if 200 < qt_ms < 700:
                            qt_intervals.append(qt_ms)

                if qt_intervals:
                    measurements['qt_interval'] = float(np.median(qt_intervals))
                    if rr_mean > 0:
                        rr_sec = rr_mean / 1000
                        measurements['qtc_bazett'] = measurements['qt_interval'] / np.sqrt(rr_sec)

        except Exception:
            pass  # Delineation is optional

        # QRS axis from leads I and aVF
        if 'I' in lead_names and 'aVF' in lead_names:
            try:
                lead_i_idx = lead_names.index('I')
                lead_avf_idx = lead_names.index('aVF')

                lead_i_amps = []
                lead_avf_amps = []

                for r_peak in r_peaks[:10]:
                    window = int(0.05 * self.sampling_rate)
                    start = max(0, r_peak - window)
                    end = min(signal.shape[1], r_peak + window)

                    lead_i_amps.append(np.max(signal[lead_i_idx, start:end]) -
                                       np.min(signal[lead_i_idx, start:end]))
                    lead_avf_amps.append(np.max(signal[lead_avf_idx, start:end]) -
                                         np.min(signal[lead_avf_idx, start:end]))

                if lead_i_amps and lead_avf_amps:
                    amp_i = float(np.median(lead_i_amps))
                    amp_avf = float(np.median(lead_avf_amps))

                    # Use net deflection for axis calculation
                    net_i = np.median([signal[lead_i_idx, start:min(signal.shape[1], r + window)].sum()
                                       for r in r_peaks[:10] for start in [max(0, r - window)]])
                    net_avf = np.median([signal[lead_avf_idx, start:min(signal.shape[1], r + window)].sum()
                                         for r in r_peaks[:10] for start in [max(0, r - window)]])

                    measurements['qrs_axis'] = float(np.degrees(np.arctan2(net_avf, net_i)))
            except Exception:
                pass

        # Voltage measurements from V1 and V6
        for lead_name in ['V1', 'V6']:
            if lead_name in lead_names:
                try:
                    lead_idx = lead_names.index(lead_name)
                    lead_signal = signal[lead_idx]

                    r_amps = []
                    s_amps = []

                    for r_peak in r_peaks[:10]:
                        window = int(0.08 * self.sampling_rate)
                        start = max(0, r_peak - window)
                        end = min(len(lead_signal), r_peak + window)
                        segment = lead_signal[start:end]

                        if len(segment) > 0:
                            r_amp = max(0, np.max(segment))
                            r_idx = np.argmax(segment)
                            s_segment = segment[r_idx:]
                            s_amp = abs(min(0, np.min(s_segment))) if len(s_segment) > 0 else 0

                            # Convert to mm at 10mm/mV
                            r_amps.append(r_amp * 10)
                            s_amps.append(s_amp * 10)

                    if r_amps:
                        measurements[f'r_wave_{lead_name.lower()}'] = float(np.median(r_amps))
                    if s_amps:
                        measurements[f's_wave_{lead_name.lower()}'] = float(np.median(s_amps))
                except Exception:
                    pass

        return measurements

    def _build_raw_features(self, measurements: Dict) -> np.ndarray:
        """Build normalized raw feature vector."""
        features = np.zeros(12, dtype=np.float32)

        # Map measurements to feature indices
        mapping = [
            ('heart_rate', 0), ('rr_interval', 1), ('pr_interval', 2),
            ('qrs_duration', 3), ('qt_interval', 4), ('qtc_bazett', 5),
            ('qrs_axis', 6), ('r_wave_v1', 7), ('s_wave_v1', 8),
            ('r_wave_v6', 9), ('s_wave_v6', 10), ('quality', 11)
        ]

        for key, idx in mapping:
            if key in measurements and measurements[key] is not None:
                if key == 'quality':
                    features[idx] = measurements[key]
                elif key in self.RAW_RANGES:
                    min_val, max_val = self.RAW_RANGES[key]
                    features[idx] = normalize_value(measurements[key], min_val, max_val)
                else:
                    features[idx] = 0.5  # Default to middle

        return features

    def _build_zscore_features(self, measurements: Dict, normals) -> np.ndarray:
        """Build z-score feature vector."""
        features = np.zeros(12, dtype=np.float32)

        # Map measurements to normals
        zscore_mapping = [
            ('heart_rate', normals.heart_rate, 0),
            ('pr_interval', normals.pr_interval, 1),
            ('qrs_duration', normals.qrs_duration, 2),
            ('qtc_bazett', normals.qtc_bazett, 3),
            ('qrs_axis', normals.qrs_axis, 4),
            ('r_wave_v1', normals.r_wave_v1, 5),
            ('s_wave_v1', normals.s_wave_v1, 6),
            ('r_wave_v6', normals.r_wave_v6, 7),
            ('s_wave_v6', normals.s_wave_v6, 8),
        ]

        for key, normal_range, idx in zscore_mapping:
            if key in measurements and measurements[key] is not None:
                zscore = compute_zscore(measurements[key], normal_range)
                # Clip to reasonable range and normalize to [-1, 1] -> [0, 1]
                features[idx] = (np.clip(zscore, -4, 4) + 4) / 8

        # R/S ratios
        if measurements.get('r_wave_v1') and measurements.get('s_wave_v1'):
            s_v1 = max(measurements['s_wave_v1'], 0.1)
            rs_v1 = measurements['r_wave_v1'] / s_v1
            features[9] = (np.clip(compute_zscore(rs_v1, normals.rs_ratio_v1), -4, 4) + 4) / 8

        if measurements.get('r_wave_v6') and measurements.get('s_wave_v6'):
            s_v6 = max(measurements['s_wave_v6'], 0.1)
            rs_v6 = measurements['r_wave_v6'] / s_v6
            features[10] = (np.clip(compute_zscore(rs_v6, normals.rs_ratio_v6), -4, 4) + 4) / 8

        return features

    def _build_derived_features(self, measurements: Dict, normals) -> np.ndarray:
        """Build derived binary feature vector."""
        features = np.zeros(6, dtype=np.float32)

        hr = measurements.get('heart_rate')
        if hr is not None:
            features[0] = 1.0 if hr > normals.heart_rate.p98 else 0.0  # tachycardia
            features[1] = 1.0 if hr < normals.heart_rate.p2 else 0.0  # bradycardia

        axis = measurements.get('qrs_axis')
        if axis is not None:
            features[2] = 1.0 if (axis < normals.qrs_axis.p2 or
                                  axis > normals.qrs_axis.p98) else 0.0

        qtc = measurements.get('qtc_bazett')
        if qtc is not None:
            features[3] = 1.0 if qtc > 460 else 0.0  # Prolonged QTc

        qrs = measurements.get('qrs_duration')
        if qrs is not None:
            features[4] = 1.0 if qrs > normals.qrs_duration.p98 else 0.0

        # Any abnormality flag
        features[5] = 1.0 if any(features[:5]) else 0.0

        return features


def extract_batch_features(
    signals: np.ndarray,
    ages: np.ndarray,
    sampling_rate: int = 500,
) -> np.ndarray:
    """
    Extract features for a batch of signals.

    Args:
        signals: Batch of signals (batch_size, n_leads, n_samples)
        ages: Array of ages in days (batch_size,)
        sampling_rate: Signal sampling rate

    Returns:
        Feature matrix (batch_size, 30)
    """
    extractor = RuleFeatureExtractor(sampling_rate)
    batch_size = signals.shape[0]
    features = np.zeros((batch_size, 30), dtype=np.float32)

    for i in range(batch_size):
        result = extractor.extract(signals[i], int(ages[i]))
        if result.extraction_success:
            features[i] = result.to_vector()
        else:
            # Use zeros for failed extractions (model should learn to handle)
            features[i] = np.zeros(30, dtype=np.float32)

    return features


if __name__ == "__main__":
    print("Testing RuleFeatureExtractor")
    print("=" * 50)

    # Create dummy signal
    np.random.seed(42)
    signal = np.random.randn(12, 5000).astype(np.float32) * 0.5

    # Add some structure to lead II (rhythm lead)
    t = np.linspace(0, 10, 5000)
    # Simulate ~100 bpm (600ms RR interval)
    for beat_time in np.arange(0, 10, 0.6):
        idx = int(beat_time * 500)
        if idx + 50 < 5000:
            signal[1, idx:idx+50] += np.sin(np.linspace(0, np.pi, 50)) * 2

    extractor = RuleFeatureExtractor(sampling_rate=500)

    # Test different ages
    for age_days in [10, 90, 365, 1825, 4380]:
        features = extractor.extract(signal, age_days)

        print(f"\nAge: {age_days} days")
        print(f"  Extraction success: {features.extraction_success}")
        print(f"  Quality score: {features.quality_score:.2f}")

        if features.extraction_success:
            print(f"  Feature vector shape: {features.to_vector().shape}")
            print(f"  Sample raw features: {features.raw_features[:4]}")
            print(f"  Sample z-scores: {features.zscore_features[:4]}")
            print(f"  Derived features: {features.derived_features}")
        else:
            print(f"  Error: {features.error_message}")

    # Test batch extraction
    print("\n" + "=" * 50)
    print("Testing batch extraction")

    batch_signals = np.random.randn(4, 12, 5000).astype(np.float32)
    batch_ages = np.array([30, 180, 730, 2920])

    batch_features = extract_batch_features(batch_signals, batch_ages)
    print(f"Batch features shape: {batch_features.shape}")
