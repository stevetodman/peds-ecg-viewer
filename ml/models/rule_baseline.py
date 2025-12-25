"""
Rule-Based Baseline for Pediatric ECG Classification
=====================================================

Extracts measurements from raw ECG signals and applies
age-adjusted rule-based classification.

Usage:
    python ml/models/rule_baseline.py
"""

import os
import re
import sys
import warnings
from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
from collections import defaultdict

import numpy as np
import pandas as pd
from tqdm import tqdm

warnings.filterwarnings('ignore')

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from ml.data.pediatric_normals import (
    get_normals_for_age,
    classify_value,
    estimate_percentile,
    NormalRange,
)

# Try imports
try:
    import wfdb
    WFDB_AVAILABLE = True
except ImportError:
    WFDB_AVAILABLE = False
    print("Warning: wfdb not installed. Run: pip install wfdb")

try:
    import neurokit2 as nk
    NK_AVAILABLE = True
except ImportError:
    NK_AVAILABLE = False
    print("Warning: neurokit2 not installed. Run: pip install neurokit2")

try:
    from sklearn.metrics import roc_auc_score, average_precision_score
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False


# Configuration
DATA_DIR = PROJECT_ROOT / "data" / "zzu-pecg"
ECG_DIR = DATA_DIR / "Child_ecg"
OUTPUT_DIR = PROJECT_ROOT / "ml" / "models" / "baseline_results"


@dataclass
class ECGMeasurements:
    """Extracted ECG measurements."""
    heart_rate: Optional[float] = None
    rr_interval: Optional[float] = None  # ms
    pr_interval: Optional[float] = None  # ms
    qrs_duration: Optional[float] = None  # ms
    qt_interval: Optional[float] = None  # ms
    qtc_bazett: Optional[float] = None  # ms
    qrs_axis: Optional[float] = None  # degrees
    # Voltages (mm at 10mm/mV = mV * 10)
    r_wave_v1: Optional[float] = None
    s_wave_v1: Optional[float] = None
    r_wave_v6: Optional[float] = None
    s_wave_v6: Optional[float] = None
    # Quality
    quality_score: float = 0.0
    extraction_success: bool = False
    error_message: str = ""


@dataclass
class RuleBasedPrediction:
    """Rule-based prediction output."""
    # Binary predictions
    is_abnormal: bool = False
    has_tachycardia: bool = False
    has_bradycardia: bool = False
    has_axis_deviation: bool = False
    has_prolonged_qtc: bool = False
    has_short_pr: bool = False  # Pre-excitation concern
    has_prolonged_pr: bool = False  # AV block
    has_wide_qrs: bool = False  # Bundle branch block
    has_rvh: bool = False  # Right ventricular hypertrophy
    has_lvh: bool = False  # Left ventricular hypertrophy

    # Confidence scores (0-1)
    abnormal_score: float = 0.0
    tachycardia_score: float = 0.0
    bradycardia_score: float = 0.0
    axis_deviation_score: float = 0.0
    qtc_prolongation_score: float = 0.0
    conduction_abnormality_score: float = 0.0
    hypertrophy_score: float = 0.0

    # Details
    findings: List[str] = field(default_factory=list)


def load_ecg_record(filepath: str) -> Optional[Tuple[np.ndarray, int, List[str]]]:
    """
    Load ECG record from WFDB format.

    Returns:
        Tuple of (signal_data, sample_rate, lead_names) or None if failed
    """
    if not WFDB_AVAILABLE:
        return None

    try:
        record = wfdb.rdrecord(filepath)
        signal = record.p_signal  # (samples, leads)
        fs = record.fs
        lead_names = record.sig_name
        return signal, fs, lead_names
    except Exception as e:
        return None


def extract_measurements(
    signal: np.ndarray,
    fs: int,
    lead_names: List[str],
) -> ECGMeasurements:
    """
    Extract ECG measurements from raw signal.

    Uses neurokit2 for R-peak detection and interval measurement.
    """
    measurements = ECGMeasurements()

    if not NK_AVAILABLE:
        measurements.error_message = "neurokit2 not available"
        return measurements

    try:
        # Find lead II or best available lead for rhythm analysis
        rhythm_lead_idx = None
        for preferred in ['II', 'I', 'V5', 'V6']:
            if preferred in lead_names:
                rhythm_lead_idx = lead_names.index(preferred)
                break

        if rhythm_lead_idx is None:
            rhythm_lead_idx = 0

        rhythm_signal = signal[:, rhythm_lead_idx]

        # Clean signal
        cleaned = nk.ecg_clean(rhythm_signal, sampling_rate=fs)

        # Detect R-peaks
        _, rpeaks = nk.ecg_peaks(cleaned, sampling_rate=fs)
        r_peaks = rpeaks['ECG_R_Peaks']

        if len(r_peaks) < 3:
            measurements.error_message = "Insufficient R-peaks detected"
            return measurements

        # Heart rate from RR intervals
        rr_intervals = np.diff(r_peaks) / fs * 1000  # ms
        rr_mean = np.median(rr_intervals)  # Use median for robustness
        measurements.rr_interval = rr_mean
        measurements.heart_rate = 60000 / rr_mean if rr_mean > 0 else None

        # Try to delineate ECG (get P, QRS, T waves)
        try:
            _, waves = nk.ecg_delineate(
                cleaned, rpeaks, sampling_rate=fs,
                method='dwt'  # Discrete wavelet transform
            )

            # PR interval (P onset to QRS onset)
            p_onsets = waves.get('ECG_P_Onsets', [])
            qrs_onsets = waves.get('ECG_R_Onsets', [])

            if len(p_onsets) > 0 and len(qrs_onsets) > 0:
                # Get valid pairs
                pr_intervals = []
                for i, (p_on, qrs_on) in enumerate(zip(p_onsets[:10], qrs_onsets[:10])):
                    if not np.isnan(p_on) and not np.isnan(qrs_on) and qrs_on > p_on:
                        pr_ms = (qrs_on - p_on) / fs * 1000
                        if 50 < pr_ms < 400:  # Sanity check
                            pr_intervals.append(pr_ms)

                if pr_intervals:
                    measurements.pr_interval = np.median(pr_intervals)

            # QRS duration (QRS onset to QRS offset)
            qrs_offsets = waves.get('ECG_R_Offsets', [])

            if len(qrs_onsets) > 0 and len(qrs_offsets) > 0:
                qrs_durations = []
                for qrs_on, qrs_off in zip(qrs_onsets[:10], qrs_offsets[:10]):
                    if not np.isnan(qrs_on) and not np.isnan(qrs_off) and qrs_off > qrs_on:
                        qrs_ms = (qrs_off - qrs_on) / fs * 1000
                        if 20 < qrs_ms < 200:
                            qrs_durations.append(qrs_ms)

                if qrs_durations:
                    measurements.qrs_duration = np.median(qrs_durations)

            # QT interval (QRS onset to T offset)
            t_offsets = waves.get('ECG_T_Offsets', [])

            if len(qrs_onsets) > 0 and len(t_offsets) > 0:
                qt_intervals = []
                for qrs_on, t_off in zip(qrs_onsets[:10], t_offsets[:10]):
                    if not np.isnan(qrs_on) and not np.isnan(t_off) and t_off > qrs_on:
                        qt_ms = (t_off - qrs_on) / fs * 1000
                        if 200 < qt_ms < 700:
                            qt_intervals.append(qt_ms)

                if qt_intervals:
                    measurements.qt_interval = np.median(qt_intervals)

                    # Calculate QTc (Bazett formula)
                    if measurements.rr_interval and measurements.rr_interval > 0:
                        rr_sec = measurements.rr_interval / 1000
                        measurements.qtc_bazett = measurements.qt_interval / np.sqrt(rr_sec)

        except Exception:
            # Delineation failed, continue with what we have
            pass

        # Estimate QRS axis from leads I and aVF if available
        if 'I' in lead_names and 'aVF' in lead_names:
            lead_i_idx = lead_names.index('I')
            lead_avf_idx = lead_names.index('aVF')

            # Get amplitude around R-peaks
            lead_i_amps = []
            lead_avf_amps = []

            for r_peak in r_peaks[:10]:
                window = int(0.05 * fs)  # 50ms window
                start = max(0, r_peak - window)
                end = min(len(signal), r_peak + window)

                lead_i_amps.append(np.max(signal[start:end, lead_i_idx]) -
                                   np.min(signal[start:end, lead_i_idx]))
                lead_avf_amps.append(np.max(signal[start:end, lead_avf_idx]) -
                                     np.min(signal[start:end, lead_avf_idx]))

            if lead_i_amps and lead_avf_amps:
                amp_i = np.median(lead_i_amps)
                amp_avf = np.median(lead_avf_amps)

                # Estimate axis using simple quadrant method
                if amp_i > 0 and amp_avf > 0:
                    measurements.qrs_axis = np.degrees(np.arctan2(amp_avf, amp_i))
                elif amp_i < 0 and amp_avf > 0:
                    measurements.qrs_axis = 90 + np.degrees(np.arctan2(abs(amp_i), amp_avf))
                elif amp_i < 0 and amp_avf < 0:
                    measurements.qrs_axis = -90 - np.degrees(np.arctan2(abs(amp_avf), abs(amp_i)))
                else:
                    measurements.qrs_axis = -np.degrees(np.arctan2(abs(amp_avf), amp_i))

        # Extract voltages from V1 and V6 if available
        for lead_name, attr_r, attr_s in [('V1', 'r_wave_v1', 's_wave_v1'),
                                           ('V6', 'r_wave_v6', 's_wave_v6')]:
            if lead_name in lead_names:
                lead_idx = lead_names.index(lead_name)
                lead_signal = signal[:, lead_idx]

                r_amps = []
                s_amps = []

                for r_peak in r_peaks[:10]:
                    window = int(0.08 * fs)  # 80ms window
                    start = max(0, r_peak - window)
                    end = min(len(lead_signal), r_peak + window)
                    segment = lead_signal[start:end]

                    if len(segment) > 0:
                        # R wave is max positive deflection
                        r_amp = np.max(segment)
                        # S wave is max negative deflection after R
                        r_idx = np.argmax(segment)
                        s_segment = segment[r_idx:]
                        s_amp = abs(np.min(s_segment)) if len(s_segment) > 0 else 0

                        # Convert to mm at 10mm/mV (signal is usually in mV)
                        r_amps.append(r_amp * 10)
                        s_amps.append(s_amp * 10)

                if r_amps:
                    setattr(measurements, attr_r, np.median(r_amps))
                if s_amps:
                    setattr(measurements, attr_s, np.median(s_amps))

        measurements.extraction_success = True
        measurements.quality_score = min(len(r_peaks) / 10, 1.0)  # Simple quality metric

    except Exception as e:
        measurements.error_message = str(e)

    return measurements


def apply_rule_based_classification(
    measurements: ECGMeasurements,
    age_days: int,
) -> RuleBasedPrediction:
    """
    Apply rule-based classification using age-adjusted normal values.
    """
    prediction = RuleBasedPrediction()

    if not measurements.extraction_success:
        return prediction

    normals = get_normals_for_age(age_days)

    # Heart Rate Analysis
    if measurements.heart_rate is not None:
        hr_class = classify_value(measurements.heart_rate, normals.heart_rate)

        if hr_class == 'high':
            prediction.has_tachycardia = True
            excess = (measurements.heart_rate - normals.heart_rate.p98) / normals.heart_rate.p98
            prediction.tachycardia_score = min(0.5 + excess, 1.0)
            prediction.findings.append(
                f"Tachycardia ({measurements.heart_rate:.0f} bpm, p98={normals.heart_rate.p98})"
            )
        elif hr_class == 'low':
            prediction.has_bradycardia = True
            deficit = (normals.heart_rate.p2 - measurements.heart_rate) / normals.heart_rate.p2
            prediction.bradycardia_score = min(0.5 + deficit, 1.0)
            prediction.findings.append(
                f"Bradycardia ({measurements.heart_rate:.0f} bpm, p2={normals.heart_rate.p2})"
            )

    # QRS Axis Analysis
    if measurements.qrs_axis is not None:
        axis_class = classify_value(measurements.qrs_axis, normals.qrs_axis)

        if axis_class in ['high', 'low']:
            prediction.has_axis_deviation = True
            if axis_class == 'low':
                prediction.findings.append(
                    f"Left axis deviation ({measurements.qrs_axis:.0f}°, p2={normals.qrs_axis.p2}°)"
                )
            else:
                prediction.findings.append(
                    f"Right axis deviation ({measurements.qrs_axis:.0f}°, p98={normals.qrs_axis.p98}°)"
                )

            deviation = abs(measurements.qrs_axis - normals.qrs_axis.p50)
            normal_range = normals.qrs_axis.p98 - normals.qrs_axis.p2
            prediction.axis_deviation_score = min(deviation / normal_range, 1.0)

        # Extreme axis deviation
        if measurements.qrs_axis < -90 or measurements.qrs_axis > 180:
            prediction.has_axis_deviation = True
            prediction.axis_deviation_score = 1.0
            prediction.findings.append(f"Extreme axis deviation ({measurements.qrs_axis:.0f}°)")

    # QTc Analysis
    if measurements.qtc_bazett is not None:
        qtc = measurements.qtc_bazett
        qtc_class = classify_value(qtc, normals.qtc_bazett)

        # Critical thresholds (absolute, not age-adjusted)
        if qtc > 500:
            prediction.has_prolonged_qtc = True
            prediction.qtc_prolongation_score = 1.0
            prediction.findings.append(f"Critically prolonged QTc ({qtc:.0f} ms)")
        elif qtc > 470:
            prediction.has_prolonged_qtc = True
            prediction.qtc_prolongation_score = 0.8
            prediction.findings.append(f"Prolonged QTc ({qtc:.0f} ms)")
        elif qtc > 450 or qtc_class == 'high':
            prediction.has_prolonged_qtc = True
            prediction.qtc_prolongation_score = 0.5
            prediction.findings.append(f"Borderline prolonged QTc ({qtc:.0f} ms)")
        elif qtc < 340:
            prediction.findings.append(f"Short QTc ({qtc:.0f} ms)")

    # PR Interval Analysis
    if measurements.pr_interval is not None:
        pr = measurements.pr_interval
        pr_class = classify_value(pr, normals.pr_interval)

        # Age-adjusted short PR (pre-excitation concern)
        short_pr_threshold = 100 if age_days < 365 else (110 if age_days < 2920 else 120)

        if pr < short_pr_threshold:
            prediction.has_short_pr = True
            prediction.conduction_abnormality_score = max(
                prediction.conduction_abnormality_score, 0.6
            )
            prediction.findings.append(f"Short PR interval ({pr:.0f} ms)")
        elif pr > 200:
            prediction.has_prolonged_pr = True
            prediction.conduction_abnormality_score = max(
                prediction.conduction_abnormality_score, 0.7
            )
            prediction.findings.append(f"First-degree AV block (PR={pr:.0f} ms)")
        elif pr_class == 'high':
            prediction.has_prolonged_pr = True
            prediction.conduction_abnormality_score = max(
                prediction.conduction_abnormality_score, 0.5
            )
            prediction.findings.append(f"Borderline prolonged PR ({pr:.0f} ms)")

    # QRS Duration Analysis
    if measurements.qrs_duration is not None:
        qrs = measurements.qrs_duration

        # Age-adjusted QRS width limits
        if age_days < 365:
            wide_qrs_threshold = 100
        elif age_days < 2920:
            wide_qrs_threshold = 110
        else:
            wide_qrs_threshold = 120

        if qrs > wide_qrs_threshold:
            prediction.has_wide_qrs = True
            prediction.conduction_abnormality_score = max(
                prediction.conduction_abnormality_score, 0.7
            )
            prediction.findings.append(f"Wide QRS ({qrs:.0f} ms)")

    # Voltage / Hypertrophy Analysis
    rvh_criteria = 0
    lvh_criteria = 0

    if measurements.r_wave_v1 is not None:
        if measurements.r_wave_v1 > normals.r_wave_v1.p98:
            rvh_criteria += 1

    if measurements.s_wave_v6 is not None:
        if measurements.s_wave_v6 > normals.s_wave_v6.p98:
            rvh_criteria += 1

    if measurements.r_wave_v6 is not None:
        if measurements.r_wave_v6 > normals.r_wave_v6.p98:
            lvh_criteria += 1

    if measurements.s_wave_v1 is not None:
        if measurements.s_wave_v1 > normals.s_wave_v1.p98:
            lvh_criteria += 1

    # RVH if axis is rightward and voltage criteria met
    if rvh_criteria >= 1 and prediction.has_axis_deviation and measurements.qrs_axis > normals.qrs_axis.p50:
        prediction.has_rvh = True
        prediction.hypertrophy_score = max(prediction.hypertrophy_score, 0.6 + 0.2 * rvh_criteria)
        prediction.findings.append(f"RVH pattern ({rvh_criteria} voltage criteria)")
    elif rvh_criteria >= 2:
        prediction.has_rvh = True
        prediction.hypertrophy_score = max(prediction.hypertrophy_score, 0.5 + 0.2 * rvh_criteria)
        prediction.findings.append(f"RVH by voltage ({rvh_criteria} criteria)")

    # LVH if axis is leftward and voltage criteria met
    if lvh_criteria >= 1 and prediction.has_axis_deviation and measurements.qrs_axis < normals.qrs_axis.p50:
        prediction.has_lvh = True
        prediction.hypertrophy_score = max(prediction.hypertrophy_score, 0.6 + 0.2 * lvh_criteria)
        prediction.findings.append(f"LVH pattern ({lvh_criteria} voltage criteria)")
    elif lvh_criteria >= 2:
        prediction.has_lvh = True
        prediction.hypertrophy_score = max(prediction.hypertrophy_score, 0.5 + 0.2 * lvh_criteria)
        prediction.findings.append(f"LVH by voltage ({lvh_criteria} criteria)")

    # Overall abnormal score
    prediction.is_abnormal = any([
        prediction.has_tachycardia,
        prediction.has_bradycardia,
        prediction.has_axis_deviation,
        prediction.has_prolonged_qtc,
        prediction.has_short_pr,
        prediction.has_prolonged_pr,
        prediction.has_wide_qrs,
        prediction.has_rvh,
        prediction.has_lvh,
    ])

    prediction.abnormal_score = max([
        prediction.tachycardia_score,
        prediction.bradycardia_score,
        prediction.axis_deviation_score,
        prediction.qtc_prolongation_score,
        prediction.conduction_abnormality_score,
        prediction.hypertrophy_score,
    ])

    if not prediction.findings:
        prediction.findings.append("Normal ECG for age")

    return prediction


def parse_icd_codes(codes_str: str) -> List[str]:
    """Extract ICD-10 codes from string."""
    if pd.isna(codes_str):
        return []
    return re.findall(r"'([^']+)'", str(codes_str))


def parse_aha_codes(codes_str: str) -> List[str]:
    """Extract AHA codes from string."""
    if pd.isna(codes_str):
        return []
    codes = re.findall(r"'([^']+)'", str(codes_str))
    return [c.split('+')[0] for c in codes]


def get_ground_truth_labels(row: pd.Series) -> Dict[str, bool]:
    """Extract ground truth labels from a row."""
    icd_codes = parse_icd_codes(row.get('ICD-10 code', ''))
    aha_codes = parse_aha_codes(row.get('AHA_code', ''))

    labels = {
        'abnormal': 'A1' not in aha_codes and 'A2' not in aha_codes,
        'tachycardia': 'C21' in aha_codes,  # Sinus tachycardia
        'bradycardia': 'C22' in aha_codes,  # Sinus bradycardia
        'axis_deviation': any(c in aha_codes for c in ['J120', 'J121']),  # LAD/RAD
        'qtc_prolonged': any(c in aha_codes for c in ['L148', 'L124', 'L125']),
        'conduction_abnormal': any(c in aha_codes for c in [
            'H80', 'H81', 'H82', 'I105', 'I106', 'I108',  # PR, BBB, WPW
        ]),
        'hypertrophy': any(c in aha_codes for c in ['K142', 'K143']),  # LVH, RVH
        # Disease categories (from ICD-10)
        'chd': any(c.startswith('Q21') or c.startswith('Q22') or c.startswith('Q25')
                   for c in icd_codes),
        'myocarditis': any(c in icd_codes for c in ['I40.0', 'I40.9', 'I51.4']),
        'cardiomyopathy': any(c in icd_codes for c in ['I42.0', 'I42.2', 'I42.9', 'Q24.8']),
    }

    return labels


def run_baseline_evaluation(
    max_samples: int = None,
    save_predictions: bool = True,
) -> Dict:
    """
    Run rule-based baseline on ZZU dataset and compute metrics.
    """
    print("=" * 60)
    print("RULE-BASED BASELINE EVALUATION")
    print("=" * 60)

    # Load metadata
    csv_path = DATA_DIR / "AttributesDictionary.csv"
    df = pd.read_csv(csv_path)

    # Parse age
    df['age_days'] = df['Age'].str.extract(r'(\d+)').astype(int)

    if max_samples:
        df = df.head(max_samples)

    print(f"\nProcessing {len(df)} ECG records...")

    # Storage for predictions and ground truth
    predictions = []
    ground_truths = []
    failed_records = []

    # Process each record
    for idx, row in tqdm(df.iterrows(), total=len(df), desc="Extracting features"):
        filename = row['Filename']
        age_days = row['age_days']

        # Construct filepath
        filepath = str(ECG_DIR / filename)

        # Load ECG
        result = load_ecg_record(filepath)

        if result is None:
            failed_records.append(filename)
            continue

        signal, fs, lead_names = result

        # Extract measurements
        measurements = extract_measurements(signal, fs, lead_names)

        if not measurements.extraction_success:
            failed_records.append(filename)
            continue

        # Apply rule-based classification
        prediction = apply_rule_based_classification(measurements, age_days)

        # Get ground truth
        ground_truth = get_ground_truth_labels(row)

        predictions.append({
            'filename': filename,
            'age_days': age_days,
            'hr': measurements.heart_rate,
            'pr': measurements.pr_interval,
            'qrs': measurements.qrs_duration,
            'qtc': measurements.qtc_bazett,
            'axis': measurements.qrs_axis,
            'pred_abnormal': prediction.is_abnormal,
            'pred_abnormal_score': prediction.abnormal_score,
            'pred_tachycardia': prediction.has_tachycardia,
            'pred_tachycardia_score': prediction.tachycardia_score,
            'pred_bradycardia': prediction.has_bradycardia,
            'pred_axis_deviation': prediction.has_axis_deviation,
            'pred_qtc_prolonged': prediction.has_prolonged_qtc,
            'pred_conduction': prediction.has_short_pr or prediction.has_prolonged_pr or prediction.has_wide_qrs,
            'pred_hypertrophy': prediction.has_rvh or prediction.has_lvh,
            'findings': '; '.join(prediction.findings),
        })

        ground_truths.append({
            'filename': filename,
            **ground_truth,
        })

    print(f"\nSuccessfully processed: {len(predictions)}/{len(df)}")
    print(f"Failed records: {len(failed_records)}")

    if len(predictions) < 100:
        print("Warning: Too few successful extractions for reliable metrics")
        return {}

    # Convert to DataFrames
    pred_df = pd.DataFrame(predictions)
    gt_df = pd.DataFrame(ground_truths)

    # Merge
    merged = pred_df.merge(gt_df, on='filename')

    # Compute metrics
    print("\n" + "-" * 40)
    print("PERFORMANCE METRICS")
    print("-" * 40)

    metrics = {}

    task_mapping = [
        ('abnormal', 'pred_abnormal', 'pred_abnormal_score'),
        ('tachycardia', 'pred_tachycardia', 'pred_tachycardia_score'),
        ('bradycardia', 'pred_bradycardia', None),
        ('axis_deviation', 'pred_axis_deviation', None),
        ('qtc_prolonged', 'pred_qtc_prolonged', None),
        ('conduction_abnormal', 'pred_conduction', None),
        ('hypertrophy', 'pred_hypertrophy', None),
    ]

    for gt_col, pred_col, score_col in task_mapping:
        if gt_col not in merged.columns:
            continue

        y_true = merged[gt_col].values.astype(int)
        y_pred = merged[pred_col].values.astype(int)

        # Only compute if we have positive examples
        n_pos = y_true.sum()
        if n_pos < 5:
            print(f"\n{gt_col}: Insufficient positive examples ({n_pos})")
            continue

        # Accuracy
        accuracy = (y_true == y_pred).mean()

        # Sensitivity (recall)
        true_pos = ((y_true == 1) & (y_pred == 1)).sum()
        sensitivity = true_pos / n_pos if n_pos > 0 else 0

        # Specificity
        n_neg = (y_true == 0).sum()
        true_neg = ((y_true == 0) & (y_pred == 0)).sum()
        specificity = true_neg / n_neg if n_neg > 0 else 0

        # AUROC (if we have score)
        auroc = None
        if score_col and score_col in merged.columns:
            y_score = merged[score_col].values
            try:
                auroc = roc_auc_score(y_true, y_score)
            except:
                pass

        metrics[gt_col] = {
            'n_positive': int(n_pos),
            'n_negative': int(n_neg),
            'accuracy': accuracy,
            'sensitivity': sensitivity,
            'specificity': specificity,
            'auroc': auroc,
        }

        print(f"\n{gt_col}:")
        print(f"  N: {n_pos} pos / {n_neg} neg")
        print(f"  Accuracy:    {accuracy:.3f}")
        print(f"  Sensitivity: {sensitivity:.3f}")
        print(f"  Specificity: {specificity:.3f}")
        if auroc:
            print(f"  AUROC:       {auroc:.3f}")

    # Save results
    if save_predictions:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        merged.to_csv(OUTPUT_DIR / 'rule_baseline_predictions.csv', index=False)

        # Save metrics
        metrics_df = pd.DataFrame(metrics).T
        metrics_df.to_csv(OUTPUT_DIR / 'rule_baseline_metrics.csv')

        print(f"\nResults saved to {OUTPUT_DIR}")

    print("\n" + "=" * 60)
    print("BASELINE EVALUATION COMPLETE")
    print("=" * 60)

    return metrics


def main():
    """Run baseline evaluation."""
    # Check dependencies
    if not WFDB_AVAILABLE:
        print("ERROR: wfdb is required. Install with: pip install wfdb")
        return

    if not NK_AVAILABLE:
        print("ERROR: neurokit2 is required. Install with: pip install neurokit2")
        return

    # Check if ECG files exist
    if not ECG_DIR.exists():
        print(f"ERROR: ECG directory not found: {ECG_DIR}")
        print("Please extract the ZZU-pECG dataset first.")
        return

    # Run evaluation
    metrics = run_baseline_evaluation(max_samples=None)

    return metrics


if __name__ == "__main__":
    main()
