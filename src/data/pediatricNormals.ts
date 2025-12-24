/**
 * Pediatric ECG normal values by age group
 *
 * Data compiled from:
 * - Davignon A, et al. Normal ECG standards for infants and children.
 *   Pediatr Cardiol. 1979/80;1:123-131
 * - Rijnbeek PR, et al. New normal limits for the pediatric electrocardiogram.
 *   Eur Heart J. 2001;22:702-711
 * - Macfarlane PW, et al. Comprehensive Electrocardiology. 2010
 * - Schwartz PJ, et al. Guidelines for the interpretation of the neonatal
 *   electrocardiogram. Eur Heart J. 2002;23:1329-1344
 * - Dickinson DF. The normal ECG in childhood and adolescence.
 *   Heart. 2005;91:1626-1630
 *
 * @module data/pediatricNormals
 */

import { getAgeGroup, type AgeGroup } from './ageGroups';

/**
 * Statistical normal range with percentiles
 */
export interface NormalRange {
  /** 2nd percentile (lower limit of normal) */
  p2: number;
  /** 5th percentile */
  p5?: number;
  /** 25th percentile */
  p25?: number;
  /** 50th percentile (median) */
  p50: number;
  /** 75th percentile */
  p75?: number;
  /** 95th percentile */
  p95?: number;
  /** 98th percentile (upper limit of normal) */
  p98: number;
  /** Mean (if available, may differ from median) */
  mean?: number;
  /** Standard deviation */
  sd?: number;
}

/**
 * T-wave polarity description
 */
export type TWavePolarity = 'upright' | 'flat' | 'inverted' | 'biphasic';

/**
 * T-wave normal patterns for V1
 */
export interface TWavePattern {
  /** Polarities considered normal */
  normal: TWavePolarity[];
  /** Polarities that suggest pathology */
  abnormal: TWavePolarity[];
  /** Clinical significance notes */
  notes?: string;
}

/**
 * Complete normal values for an age group
 */
export interface AgeNormals {
  /** Heart rate in bpm */
  heartRate: NormalRange;

  /** PR interval in ms */
  prInterval: NormalRange;

  /** QRS duration in ms */
  qrsDuration: NormalRange;

  /** QTc (Bazett) in ms */
  qtcBazett: NormalRange;

  /** QRS axis in degrees */
  qrsAxis: NormalRange;

  /** P-wave axis in degrees */
  pAxis?: NormalRange;

  // Voltage criteria (in mm at standard 10mm/mV)

  /** R-wave amplitude in V1 */
  rWaveV1: NormalRange;

  /** S-wave amplitude in V1 */
  sWaveV1: NormalRange;

  /** R-wave amplitude in V6 */
  rWaveV6: NormalRange;

  /** S-wave amplitude in V6 */
  sWaveV6: NormalRange;

  /** R/S ratio in V1 */
  rsRatioV1: NormalRange;

  /** R/S ratio in V6 */
  rsRatioV6: NormalRange;

  /** T-wave pattern in V1 */
  tWaveV1: TWavePattern;

  /** Q-wave in V6 (mm) - important for LVH */
  qWaveV6?: NormalRange;

  /** R-wave in aVR (should be negative/small) */
  rWaveAVR?: NormalRange;

  /** Additional clinical notes */
  notes?: string;
}

/**
 * Complete pediatric normal values database
 * Values are derived from published reference data
 */
export const PEDIATRIC_NORMALS: Readonly<Record<string, AgeNormals>> = {
  neonate_0_24h: {
    heartRate: { p2: 90, p50: 145, p98: 180, mean: 143, sd: 25 },
    prInterval: { p2: 70, p50: 100, p98: 140 },
    qrsDuration: { p2: 40, p50: 60, p98: 80 },
    qtcBazett: { p2: 370, p50: 420, p98: 470 },
    qrsAxis: { p2: 60, p50: 135, p98: 195 },
    pAxis: { p2: 0, p50: 50, p98: 90 },
    rWaveV1: { p2: 5, p50: 15, p98: 27 },
    sWaveV1: { p2: 0, p50: 5, p98: 15 },
    rWaveV6: { p2: 0, p50: 4, p98: 12 },
    sWaveV6: { p2: 0, p50: 4, p98: 10 },
    rsRatioV1: { p2: 0.5, p50: 3.0, p98: 19.0 },
    rsRatioV6: { p2: 0.1, p50: 1.0, p98: 4.0 },
    tWaveV1: {
      normal: ['upright', 'flat'],
      abnormal: [],
      notes: 'Upright T in V1 normal in first 24 hours of life',
    },
    notes: 'Transitional circulation. Extreme right axis normal.',
  },

  neonate_1_3d: {
    heartRate: { p2: 90, p50: 140, p98: 175, mean: 138, sd: 22 },
    prInterval: { p2: 70, p50: 100, p98: 140 },
    qrsDuration: { p2: 40, p50: 60, p98: 80 },
    qtcBazett: { p2: 370, p50: 420, p98: 470 },
    qrsAxis: { p2: 65, p50: 125, p98: 185 },
    pAxis: { p2: 0, p50: 50, p98: 90 },
    rWaveV1: { p2: 5, p50: 13, p98: 25 },
    sWaveV1: { p2: 0, p50: 5, p98: 15 },
    rWaveV6: { p2: 1, p50: 5, p98: 13 },
    sWaveV6: { p2: 0, p50: 3, p98: 10 },
    rsRatioV1: { p2: 0.5, p50: 2.5, p98: 15.0 },
    rsRatioV6: { p2: 0.2, p50: 1.5, p98: 5.0 },
    tWaveV1: {
      normal: ['upright', 'inverted', 'flat'],
      abnormal: [],
      notes: 'Transitional period. T-wave may be upright or inverting.',
    },
    notes: 'Transitional circulation continuing. T-wave inversion beginning.',
  },

  neonate_3_7d: {
    heartRate: { p2: 90, p50: 140, p98: 175, mean: 138, sd: 22 },
    prInterval: { p2: 70, p50: 100, p98: 140 },
    qrsDuration: { p2: 40, p50: 60, p98: 80 },
    qtcBazett: { p2: 370, p50: 420, p98: 470 },
    qrsAxis: { p2: 65, p50: 125, p98: 185 },
    pAxis: { p2: 0, p50: 50, p98: 90 },
    rWaveV1: { p2: 5, p50: 13, p98: 25 },
    sWaveV1: { p2: 0, p50: 5, p98: 15 },
    rWaveV6: { p2: 1, p50: 5, p98: 13 },
    sWaveV6: { p2: 0, p50: 3, p98: 10 },
    rsRatioV1: { p2: 0.5, p50: 2.5, p98: 15.0 },
    rsRatioV6: { p2: 0.2, p50: 1.5, p98: 5.0 },
    tWaveV1: {
      normal: ['inverted', 'flat'],
      abnormal: ['upright'],
      notes: 'T-wave should be inverted. Upright T suggests RVH.',
    },
    notes: 'T-wave inversion in V1 expected. Upright T abnormal.',
  },

  neonate_8_30d: {
    heartRate: { p2: 100, p50: 150, p98: 190, mean: 149, sd: 24 },
    prInterval: { p2: 70, p50: 100, p98: 140 },
    qrsDuration: { p2: 40, p50: 60, p98: 80 },
    qtcBazett: { p2: 370, p50: 410, p98: 460 },
    qrsAxis: { p2: 45, p50: 110, p98: 170 },
    pAxis: { p2: 0, p50: 50, p98: 80 },
    rWaveV1: { p2: 3, p50: 10, p98: 22 },
    sWaveV1: { p2: 0, p50: 5, p98: 15 },
    rWaveV6: { p2: 3, p50: 8, p98: 17 },
    sWaveV6: { p2: 0, p50: 3, p98: 10 },
    rsRatioV1: { p2: 0.3, p50: 2.0, p98: 10.0 },
    rsRatioV6: { p2: 0.5, p50: 2.5, p98: 8.0 },
    tWaveV1: {
      normal: ['inverted', 'flat'],
      abnormal: ['upright'],
      notes: 'Upright T in V1 abnormal, suggests RVH or RV strain.',
    },
    notes: 'RV dominance decreasing. LV becoming more dominant.',
  },

  infant_1_3mo: {
    heartRate: { p2: 105, p50: 150, p98: 185, mean: 148, sd: 21 },
    prInterval: { p2: 70, p50: 100, p98: 145 },
    qrsDuration: { p2: 40, p50: 60, p98: 80 },
    qtcBazett: { p2: 370, p50: 410, p98: 460 },
    qrsAxis: { p2: 30, p50: 80, p98: 135 },
    pAxis: { p2: 0, p50: 50, p98: 80 },
    rWaveV1: { p2: 3, p50: 9, p98: 20 },
    sWaveV1: { p2: 1, p50: 6, p98: 17 },
    rWaveV6: { p2: 5, p50: 12, p98: 22 },
    sWaveV6: { p2: 0, p50: 3, p98: 10 },
    rsRatioV1: { p2: 0.2, p50: 1.5, p98: 6.0 },
    rsRatioV6: { p2: 1.0, p50: 4.0, p98: 12.0 },
    tWaveV1: {
      normal: ['inverted', 'flat'],
      abnormal: ['upright'],
    },
    notes: 'Transition to LV dominance. Axis moving leftward.',
  },

  infant_3_6mo: {
    heartRate: { p2: 105, p50: 145, p98: 180, mean: 143, sd: 20 },
    prInterval: { p2: 70, p50: 105, p98: 150 },
    qrsDuration: { p2: 40, p50: 60, p98: 85 },
    qtcBazett: { p2: 370, p50: 410, p98: 455 },
    qrsAxis: { p2: 20, p50: 65, p98: 115 },
    pAxis: { p2: 0, p50: 50, p98: 80 },
    rWaveV1: { p2: 3, p50: 9, p98: 20 },
    sWaveV1: { p2: 1, p50: 7, p98: 18 },
    rWaveV6: { p2: 6, p50: 13, p98: 23 },
    sWaveV6: { p2: 0, p50: 3, p98: 10 },
    rsRatioV1: { p2: 0.2, p50: 1.2, p98: 5.0 },
    rsRatioV6: { p2: 1.5, p50: 4.5, p98: 15.0 },
    tWaveV1: {
      normal: ['inverted', 'flat'],
      abnormal: ['upright'],
    },
    notes: 'LV dominance establishing.',
  },

  infant_6_12mo: {
    heartRate: { p2: 95, p50: 135, p98: 170, mean: 132, sd: 20 },
    prInterval: { p2: 75, p50: 110, p98: 155 },
    qrsDuration: { p2: 45, p50: 65, p98: 85 },
    qtcBazett: { p2: 370, p50: 410, p98: 450 },
    qrsAxis: { p2: 10, p50: 55, p98: 105 },
    pAxis: { p2: 0, p50: 50, p98: 80 },
    rWaveV1: { p2: 2, p50: 8, p98: 18 },
    sWaveV1: { p2: 2, p50: 8, p98: 20 },
    rWaveV6: { p2: 7, p50: 14, p98: 24 },
    sWaveV6: { p2: 0, p50: 3, p98: 9 },
    rsRatioV1: { p2: 0.1, p50: 1.0, p98: 4.0 },
    rsRatioV6: { p2: 2.0, p50: 5.0, p98: 18.0 },
    tWaveV1: {
      normal: ['inverted', 'flat'],
      abnormal: ['upright'],
    },
    notes: 'LV dominance established.',
  },

  toddler_1_3yr: {
    heartRate: { p2: 80, p50: 120, p98: 155, mean: 119, sd: 19 },
    prInterval: { p2: 80, p50: 115, p98: 160 },
    qrsDuration: { p2: 45, p50: 65, p98: 85 },
    qtcBazett: { p2: 370, p50: 405, p98: 445 },
    qrsAxis: { p2: 10, p50: 55, p98: 100 },
    pAxis: { p2: 0, p50: 50, p98: 75 },
    rWaveV1: { p2: 2, p50: 7, p98: 15 },
    sWaveV1: { p2: 3, p50: 10, p98: 22 },
    rWaveV6: { p2: 8, p50: 15, p98: 25 },
    sWaveV6: { p2: 0, p50: 2, p98: 7 },
    rsRatioV1: { p2: 0.1, p50: 0.7, p98: 3.0 },
    rsRatioV6: { p2: 2.5, p50: 7.0, p98: 25.0 },
    qWaveV6: { p2: 0, p50: 2, p98: 4 },
    tWaveV1: {
      normal: ['inverted', 'flat'],
      abnormal: ['upright'],
    },
    notes: 'Adult-like axis. HR decreasing with age.',
  },

  child_3_5yr: {
    heartRate: { p2: 70, p50: 105, p98: 140, mean: 105, sd: 18 },
    prInterval: { p2: 85, p50: 120, p98: 165 },
    qrsDuration: { p2: 50, p50: 70, p98: 90 },
    qtcBazett: { p2: 370, p50: 405, p98: 445 },
    qrsAxis: { p2: 10, p50: 55, p98: 100 },
    pAxis: { p2: 0, p50: 50, p98: 75 },
    rWaveV1: { p2: 2, p50: 6, p98: 14 },
    sWaveV1: { p2: 4, p50: 12, p98: 24 },
    rWaveV6: { p2: 9, p50: 17, p98: 27 },
    sWaveV6: { p2: 0, p50: 2, p98: 6 },
    rsRatioV1: { p2: 0.05, p50: 0.5, p98: 2.0 },
    rsRatioV6: { p2: 3.0, p50: 9.0, p98: 30.0 },
    qWaveV6: { p2: 0, p50: 2, p98: 4 },
    tWaveV1: {
      normal: ['inverted', 'flat'],
      abnormal: ['upright'],
      notes: 'Juvenile T-wave pattern (inverted T V1-V3) normal.',
    },
    notes: 'High voltages common due to thin chest wall.',
  },

  child_5_8yr: {
    heartRate: { p2: 60, p50: 95, p98: 125, mean: 94, sd: 16 },
    prInterval: { p2: 90, p50: 125, p98: 170 },
    qrsDuration: { p2: 55, p50: 75, p98: 95 },
    qtcBazett: { p2: 370, p50: 400, p98: 440 },
    qrsAxis: { p2: 5, p50: 55, p98: 100 },
    pAxis: { p2: 0, p50: 50, p98: 75 },
    rWaveV1: { p2: 1, p50: 5, p98: 12 },
    sWaveV1: { p2: 5, p50: 13, p98: 25 },
    rWaveV6: { p2: 10, p50: 18, p98: 28 },
    sWaveV6: { p2: 0, p50: 2, p98: 5 },
    rsRatioV1: { p2: 0.03, p50: 0.4, p98: 1.5 },
    rsRatioV6: { p2: 3.5, p50: 10.0, p98: 35.0 },
    qWaveV6: { p2: 0, p50: 2, p98: 4 },
    tWaveV1: {
      normal: ['inverted', 'flat'],
      abnormal: ['upright'],
      notes: 'Juvenile T-wave pattern persists.',
    },
    notes: 'Approaching adult pattern but with higher voltages.',
  },

  child_8_12yr: {
    heartRate: { p2: 55, p50: 85, p98: 115, mean: 84, sd: 15 },
    prInterval: { p2: 95, p50: 130, p98: 175 },
    qrsDuration: { p2: 55, p50: 80, p98: 100 },
    qtcBazett: { p2: 370, p50: 400, p98: 440 },
    qrsAxis: { p2: 0, p50: 55, p98: 95 },
    pAxis: { p2: 0, p50: 50, p98: 75 },
    rWaveV1: { p2: 1, p50: 4, p98: 10 },
    sWaveV1: { p2: 5, p50: 13, p98: 25 },
    rWaveV6: { p2: 10, p50: 19, p98: 30 },
    sWaveV6: { p2: 0, p50: 2, p98: 5 },
    rsRatioV1: { p2: 0.02, p50: 0.3, p98: 1.2 },
    rsRatioV6: { p2: 4.0, p50: 12.0, p98: 40.0 },
    qWaveV6: { p2: 0, p50: 2, p98: 3.5 },
    tWaveV1: {
      normal: ['inverted', 'flat'],
      abnormal: ['upright'],
      notes: 'Juvenile T-wave pattern common.',
    },
    notes: 'Prepubertal. Voltages may be high.',
  },

  adolescent_12_16yr: {
    heartRate: { p2: 50, p50: 75, p98: 105, mean: 76, sd: 14 },
    prInterval: { p2: 100, p50: 140, p98: 185 },
    qrsDuration: { p2: 60, p50: 85, p98: 105 },
    qtcBazett: { p2: 370, p50: 400, p98: 440 },
    qrsAxis: { p2: -5, p50: 55, p98: 95 },
    pAxis: { p2: 0, p50: 50, p98: 75 },
    rWaveV1: { p2: 0, p50: 3, p98: 9 },
    sWaveV1: { p2: 4, p50: 12, p98: 24 },
    rWaveV6: { p2: 9, p50: 18, p98: 30 },
    sWaveV6: { p2: 0, p50: 2, p98: 5 },
    rsRatioV1: { p2: 0.01, p50: 0.25, p98: 1.0 },
    rsRatioV6: { p2: 4.0, p50: 12.0, p98: 45.0 },
    qWaveV6: { p2: 0, p50: 1.5, p98: 3 },
    tWaveV1: {
      normal: ['inverted', 'flat', 'upright'],
      abnormal: [],
      notes: 'T-wave may become upright. Transition period.',
    },
    notes: 'Pubertal changes. Athletic heart patterns may appear.',
  },

  adolescent_16_18yr: {
    heartRate: { p2: 50, p50: 70, p98: 100, mean: 72, sd: 13 },
    prInterval: { p2: 110, p50: 150, p98: 200 },
    qrsDuration: { p2: 65, p50: 90, p98: 110 },
    qtcBazett: { p2: 370, p50: 400, p98: 440 },
    qrsAxis: { p2: -15, p50: 50, p98: 90 },
    pAxis: { p2: 0, p50: 50, p98: 75 },
    rWaveV1: { p2: 0, p50: 3, p98: 8 },
    sWaveV1: { p2: 3, p50: 10, p98: 22 },
    rWaveV6: { p2: 8, p50: 16, p98: 28 },
    sWaveV6: { p2: 0, p50: 2, p98: 5 },
    rsRatioV1: { p2: 0.01, p50: 0.3, p98: 1.0 },
    rsRatioV6: { p2: 4.0, p50: 10.0, p98: 35.0 },
    qWaveV6: { p2: 0, p50: 1.5, p98: 3 },
    tWaveV1: {
      normal: ['inverted', 'flat', 'upright'],
      abnormal: [],
      notes: 'Adult pattern acceptable.',
    },
    notes: 'Near-adult patterns. Adult criteria may apply.',
  },
} as const;

/**
 * Get normal values for a specific age in days
 * @param ageDays - Age in days
 * @returns Normal values for that age group
 */
export function getNormalsForAge(ageDays: number): AgeNormals {
  const ageGroup = getAgeGroup(ageDays);
  return PEDIATRIC_NORMALS[ageGroup.id];
}

/**
 * Get normal values for a specific age group
 * @param ageGroup - Age group object or ID
 * @returns Normal values for that age group
 */
export function getNormals(ageGroup: AgeGroup | string): AgeNormals {
  const id = typeof ageGroup === 'string' ? ageGroup : ageGroup.id;
  const normals = PEDIATRIC_NORMALS[id];
  if (!normals) {
    throw new Error(`No normal values found for age group: ${id}`);
  }
  return normals;
}

/**
 * Check if a value is within normal range
 * @param value - Measured value
 * @param normalRange - Normal range to compare against
 * @param strictness - How strictly to apply limits
 * @returns Classification of the value
 */
export function classifyValue(
  value: number,
  normalRange: NormalRange,
  strictness: 'lenient' | 'standard' | 'strict' = 'standard'
): 'low' | 'borderline_low' | 'normal' | 'borderline_high' | 'high' {
  // Adjust thresholds based on strictness
  const factor = strictness === 'lenient' ? 0.95 : strictness === 'strict' ? 1.0 : 0.98;
  const lowThreshold = normalRange.p2 * (2 - factor); // Slightly lower for lenient
  const highThreshold = normalRange.p98 * factor;

  if (value < lowThreshold) return 'low';
  if (value > highThreshold) return 'high';

  // Borderline zones: within 10% of limits
  const range = normalRange.p98 - normalRange.p2;
  const borderlineWidth = range * 0.1;

  if (value < normalRange.p2 + borderlineWidth) return 'borderline_low';
  if (value > normalRange.p98 - borderlineWidth) return 'borderline_high';

  return 'normal';
}

/**
 * Calculate approximate percentile for a value
 * Uses linear interpolation between known percentiles
 * @param value - Measured value
 * @param normalRange - Normal range with percentiles
 * @returns Approximate percentile (0-100)
 */
export function estimatePercentile(value: number, normalRange: NormalRange): number {
  const { p2, p50, p98 } = normalRange;

  if (value <= p2) {
    // Below 2nd percentile - estimate 0-2
    const ratio = value / p2;
    return Math.max(0, ratio * 2);
  }

  if (value >= p98) {
    // Above 98th percentile - estimate 98-100
    const excess = (value - p98) / (p98 - p50);
    return Math.min(100, 98 + excess * 2);
  }

  if (value <= p50) {
    // Between 2nd and 50th - linear interpolation
    const ratio = (value - p2) / (p50 - p2);
    return 2 + ratio * 48;
  }

  // Between 50th and 98th - linear interpolation
  const ratio = (value - p50) / (p98 - p50);
  return 50 + ratio * 48;
}

/**
 * Check if T-wave polarity is normal for age in V1
 * @param polarity - Observed T-wave polarity
 * @param ageDays - Age in days
 * @returns Whether the polarity is normal
 */
export function isTWaveV1Normal(polarity: TWavePolarity, ageDays: number): boolean {
  const normals = getNormalsForAge(ageDays);
  return normals.tWaveV1.normal.includes(polarity);
}

/**
 * Get clinical notes for an age group
 * @param ageDays - Age in days
 * @returns Clinical notes string
 */
export function getClinicalNotes(ageDays: number): string {
  const ageGroup = getAgeGroup(ageDays);
  const normals = PEDIATRIC_NORMALS[ageGroup.id];
  return [ageGroup.clinicalNotes, normals.notes, normals.tWaveV1.notes]
    .filter(Boolean)
    .join(' ');
}
