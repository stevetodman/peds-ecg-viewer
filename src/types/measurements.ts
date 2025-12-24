/**
 * ECG measurement types
 * @module types/measurements
 */

import type { LeadName } from './ecg';

/**
 * Heart rate measurement
 */
export interface HeartRateMeasurement {
  /** Heart rate in beats per minute */
  value: number;

  /** Method used for calculation */
  method: 'average' | 'instantaneous' | 'median';

  /** Number of beats used in calculation */
  beatCount: number;

  /** R-R interval variability */
  variability?: {
    /** Minimum RR interval (ms) */
    minRR: number;
    /** Maximum RR interval (ms) */
    maxRR: number;
    /** SDNN - Standard deviation of NN intervals (ms) */
    sdnn: number;
    /** RMSSD - Root mean square of successive differences (ms) */
    rmssd?: number;
  };
}

/**
 * Interval measurement with optional per-lead values
 */
export interface IntervalMeasurement {
  /** Global/representative value in milliseconds */
  value: number;

  /** Per-lead measurements (ms) */
  perLead?: Partial<Record<LeadName, number>>;

  /** Method used for measurement */
  method?: 'global' | 'lead_specific' | 'median';

  /** Confidence (0-1) */
  confidence?: number;
}

/**
 * QTc correction formulas
 */
export interface QTcMeasurements {
  /** Bazett: QTc = QT / sqrt(RR) - most common */
  bazett: number;

  /** Fridericia: QTc = QT / cuberoot(RR) - better at extremes */
  fridericia: number;

  /** Framingham: QTc = QT + 0.154(1-RR) */
  framingham: number;

  /** Hodges: QTc = QT + 1.75(HR-60) */
  hodges?: number;
}

/**
 * Axis measurement
 */
export interface AxisMeasurement {
  /** Axis value in degrees (-180 to +180) */
  value: number;

  /** Quadrant classification */
  quadrant: 'normal' | 'left' | 'right' | 'extreme' | 'indeterminate';

  /** Method used */
  method: 'area' | 'amplitude' | 'visual';
}

/**
 * Amplitude measurement per lead
 */
export interface AmplitudeMeasurements {
  /** R-wave amplitudes (uV or mm) */
  rWave: Partial<Record<LeadName, number>>;

  /** S-wave amplitudes (uV or mm) - stored as positive values */
  sWave: Partial<Record<LeadName, number>>;

  /** Q-wave amplitudes (uV or mm) - stored as positive values */
  qWave?: Partial<Record<LeadName, number>>;

  /** T-wave amplitudes (uV or mm) */
  tWave: Partial<Record<LeadName, number>>;

  /** P-wave amplitudes (uV or mm) */
  pWave: Partial<Record<LeadName, number>>;

  /** ST segment level at J+60/80ms (uV or mm) */
  stLevel?: Partial<Record<LeadName, number>>;

  /** Unit for values */
  unit: 'uV' | 'mm';
}

/**
 * Complete ECG measurements
 */
export interface ECGMeasurements {
  /** Heart rate */
  heartRate: HeartRateMeasurement;

  /** PR interval (ms) */
  prInterval: IntervalMeasurement;

  /** QRS duration (ms) */
  qrsDuration: IntervalMeasurement;

  /** QT interval (ms) */
  qtInterval: IntervalMeasurement;

  /** Corrected QT intervals (ms) */
  qtc: QTcMeasurements;

  /** P-wave axis */
  pAxis: AxisMeasurement | null;

  /** QRS axis */
  qrsAxis: AxisMeasurement;

  /** T-wave axis */
  tAxis: AxisMeasurement | null;

  /** Amplitude measurements */
  amplitudes?: AmplitudeMeasurements;

  /** R-R intervals in ms (for arrhythmia analysis) */
  rrIntervals?: number[];

  /** QRS onset sample index (global) */
  qrsOnset?: number;

  /** QRS offset sample index (global) */
  qrsOffset?: number;

  /** Measurement timestamp */
  measuredAt?: Date;

  /** Software version that performed measurement */
  softwareVersion?: string;
}

/**
 * Interpretation of a measurement relative to normal range
 */
export type MeasurementInterpretation = 'low' | 'borderline_low' | 'normal' | 'borderline_high' | 'high';

/**
 * Measurement with normal range comparison
 */
export interface MeasurementWithNormal<T = number> {
  /** Measured value */
  value: T;

  /** Normal range for patient's age/sex */
  normalRange: {
    /** 2nd percentile (lower limit) */
    p2: T;
    /** 50th percentile (median) */
    p50: T;
    /** 98th percentile (upper limit) */
    p98: T;
  };

  /** Interpretation relative to normal */
  interpretation: MeasurementInterpretation;

  /** Calculated percentile (if available) */
  percentile?: number;

  /** Is this value flagged for attention */
  flagged: boolean;
}

/**
 * Calculate QTc using different formulas
 * @param qtMs - QT interval in milliseconds
 * @param rrMs - RR interval in milliseconds
 * @returns QTc values using different formulas
 */
export function calculateQTc(qtMs: number, rrMs: number): QTcMeasurements {
  const rrSec = rrMs / 1000;
  const hr = 60000 / rrMs;

  return {
    bazett: Math.round(qtMs / Math.sqrt(rrSec)),
    fridericia: Math.round(qtMs / Math.cbrt(rrSec)),
    framingham: Math.round(qtMs + 154 * (1 - rrSec)),
    hodges: Math.round(qtMs + 1.75 * (hr - 60)),
  };
}

/**
 * Determine measurement interpretation
 */
export function interpretMeasurement(
  value: number,
  p2: number,
  p98: number
): MeasurementInterpretation {
  if (value < p2) return 'low';
  if (value > p98) return 'high';

  // Borderline zones: within 10% of limits
  const range = p98 - p2;
  const borderlineWidth = range * 0.1;

  if (value < p2 + borderlineWidth) return 'borderline_low';
  if (value > p98 - borderlineWidth) return 'borderline_high';

  return 'normal';
}
