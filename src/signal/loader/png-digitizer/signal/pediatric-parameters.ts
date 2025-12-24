/**
 * Pediatric ECG Parameters
 * Age-adjusted normal values and interpretation for pediatric ECGs
 *
 * @module signal/loader/png-digitizer/signal/pediatric-parameters
 */

/**
 * Age group for pediatric ECG interpretation
 */
export type PediatricAgeGroup =
  | 'neonate_0-7d'      // 0-7 days
  | 'neonate_8-30d'     // 8-30 days
  | 'infant_1-3m'       // 1-3 months
  | 'infant_3-6m'       // 3-6 months
  | 'infant_6-12m'      // 6-12 months
  | 'toddler_1-3y'      // 1-3 years
  | 'child_3-5y'        // 3-5 years
  | 'child_5-8y'        // 5-8 years
  | 'child_8-12y'       // 8-12 years
  | 'adolescent_12-16y' // 12-16 years
  | 'adult';            // 16+ years

/**
 * Normal range for a parameter
 */
export interface NormalRange {
  min: number;
  max: number;
  mean?: number;
  unit: string;
}

/**
 * Age-specific normal values
 */
export interface PediatricNormals {
  heartRate: NormalRange;
  prInterval: NormalRange;
  qrsDuration: NormalRange;
  qtcInterval: NormalRange;
  qrsAxis: NormalRange;
  rWaveV1: NormalRange;
  sWaveV1: NormalRange;
  rWaveV6: NormalRange;
  sWaveV6: NormalRange;
}

/**
 * Pediatric normal values by age group
 * Based on Park's Pediatric Cardiology and other standard references
 */
const PEDIATRIC_NORMALS: Record<PediatricAgeGroup, PediatricNormals> = {
  'neonate_0-7d': {
    heartRate: { min: 90, max: 160, mean: 125, unit: 'bpm' },
    prInterval: { min: 80, max: 160, mean: 120, unit: 'ms' },
    qrsDuration: { min: 40, max: 80, mean: 60, unit: 'ms' },
    qtcInterval: { min: 360, max: 460, mean: 410, unit: 'ms' },
    qrsAxis: { min: 60, max: 190, mean: 135, unit: 'degrees' },
    rWaveV1: { min: 5, max: 26, mean: 15, unit: 'mm' },
    sWaveV1: { min: 0, max: 23, mean: 10, unit: 'mm' },
    rWaveV6: { min: 0, max: 12, mean: 5, unit: 'mm' },
    sWaveV6: { min: 0, max: 10, mean: 4, unit: 'mm' },
  },
  'neonate_8-30d': {
    heartRate: { min: 100, max: 180, mean: 140, unit: 'bpm' },
    prInterval: { min: 80, max: 160, mean: 120, unit: 'ms' },
    qrsDuration: { min: 40, max: 80, mean: 60, unit: 'ms' },
    qtcInterval: { min: 360, max: 460, mean: 410, unit: 'ms' },
    qrsAxis: { min: 60, max: 160, mean: 110, unit: 'degrees' },
    rWaveV1: { min: 3, max: 21, mean: 12, unit: 'mm' },
    sWaveV1: { min: 0, max: 16, mean: 8, unit: 'mm' },
    rWaveV6: { min: 2, max: 16, mean: 8, unit: 'mm' },
    sWaveV6: { min: 0, max: 10, mean: 4, unit: 'mm' },
  },
  'infant_1-3m': {
    heartRate: { min: 100, max: 180, mean: 140, unit: 'bpm' },
    prInterval: { min: 80, max: 160, mean: 120, unit: 'ms' },
    qrsDuration: { min: 40, max: 80, mean: 60, unit: 'ms' },
    qtcInterval: { min: 360, max: 460, mean: 410, unit: 'ms' },
    qrsAxis: { min: 30, max: 120, mean: 75, unit: 'degrees' },
    rWaveV1: { min: 3, max: 18, mean: 10, unit: 'mm' },
    sWaveV1: { min: 0, max: 12, mean: 6, unit: 'mm' },
    rWaveV6: { min: 5, max: 21, mean: 13, unit: 'mm' },
    sWaveV6: { min: 0, max: 6, mean: 2, unit: 'mm' },
  },
  'infant_3-6m': {
    heartRate: { min: 90, max: 170, mean: 130, unit: 'bpm' },
    prInterval: { min: 80, max: 160, mean: 120, unit: 'ms' },
    qrsDuration: { min: 40, max: 80, mean: 60, unit: 'ms' },
    qtcInterval: { min: 360, max: 460, mean: 410, unit: 'ms' },
    qrsAxis: { min: 10, max: 110, mean: 60, unit: 'degrees' },
    rWaveV1: { min: 2, max: 17, mean: 9, unit: 'mm' },
    sWaveV1: { min: 0, max: 15, mean: 7, unit: 'mm' },
    rWaveV6: { min: 6, max: 22, mean: 14, unit: 'mm' },
    sWaveV6: { min: 0, max: 6, mean: 2, unit: 'mm' },
  },
  'infant_6-12m': {
    heartRate: { min: 80, max: 160, mean: 120, unit: 'bpm' },
    prInterval: { min: 80, max: 160, mean: 120, unit: 'ms' },
    qrsDuration: { min: 40, max: 80, mean: 60, unit: 'ms' },
    qtcInterval: { min: 360, max: 460, mean: 410, unit: 'ms' },
    qrsAxis: { min: 10, max: 100, mean: 55, unit: 'degrees' },
    rWaveV1: { min: 2, max: 18, mean: 9, unit: 'mm' },
    sWaveV1: { min: 0.5, max: 18, mean: 8, unit: 'mm' },
    rWaveV6: { min: 6, max: 23, mean: 14, unit: 'mm' },
    sWaveV6: { min: 0, max: 7, mean: 2, unit: 'mm' },
  },
  'toddler_1-3y': {
    heartRate: { min: 70, max: 150, mean: 110, unit: 'bpm' },
    prInterval: { min: 80, max: 160, mean: 120, unit: 'ms' },
    qrsDuration: { min: 40, max: 90, mean: 65, unit: 'ms' },
    qtcInterval: { min: 360, max: 460, mean: 410, unit: 'ms' },
    qrsAxis: { min: 10, max: 100, mean: 55, unit: 'degrees' },
    rWaveV1: { min: 2, max: 18, mean: 9, unit: 'mm' },
    sWaveV1: { min: 1, max: 21, mean: 10, unit: 'mm' },
    rWaveV6: { min: 6, max: 23, mean: 14, unit: 'mm' },
    sWaveV6: { min: 0, max: 7, mean: 2, unit: 'mm' },
  },
  'child_3-5y': {
    heartRate: { min: 65, max: 135, mean: 100, unit: 'bpm' },
    prInterval: { min: 100, max: 180, mean: 140, unit: 'ms' },
    qrsDuration: { min: 50, max: 90, mean: 70, unit: 'ms' },
    qtcInterval: { min: 360, max: 460, mean: 410, unit: 'ms' },
    qrsAxis: { min: 0, max: 100, mean: 50, unit: 'degrees' },
    rWaveV1: { min: 1, max: 16, mean: 8, unit: 'mm' },
    sWaveV1: { min: 2, max: 22, mean: 12, unit: 'mm' },
    rWaveV6: { min: 8, max: 25, mean: 16, unit: 'mm' },
    sWaveV6: { min: 0, max: 5, mean: 1, unit: 'mm' },
  },
  'child_5-8y': {
    heartRate: { min: 60, max: 130, mean: 95, unit: 'bpm' },
    prInterval: { min: 100, max: 180, mean: 140, unit: 'ms' },
    qrsDuration: { min: 50, max: 90, mean: 70, unit: 'ms' },
    qtcInterval: { min: 360, max: 460, mean: 410, unit: 'ms' },
    qrsAxis: { min: 0, max: 100, mean: 50, unit: 'degrees' },
    rWaveV1: { min: 0, max: 14, mean: 6, unit: 'mm' },
    sWaveV1: { min: 3, max: 24, mean: 13, unit: 'mm' },
    rWaveV6: { min: 9, max: 26, mean: 17, unit: 'mm' },
    sWaveV6: { min: 0, max: 4, mean: 1, unit: 'mm' },
  },
  'child_8-12y': {
    heartRate: { min: 55, max: 115, mean: 85, unit: 'bpm' },
    prInterval: { min: 100, max: 200, mean: 150, unit: 'ms' },
    qrsDuration: { min: 50, max: 100, mean: 75, unit: 'ms' },
    qtcInterval: { min: 360, max: 460, mean: 410, unit: 'ms' },
    qrsAxis: { min: -15, max: 100, mean: 45, unit: 'degrees' },
    rWaveV1: { min: 0, max: 12, mean: 5, unit: 'mm' },
    sWaveV1: { min: 3, max: 25, mean: 14, unit: 'mm' },
    rWaveV6: { min: 9, max: 26, mean: 17, unit: 'mm' },
    sWaveV6: { min: 0, max: 4, mean: 1, unit: 'mm' },
  },
  'adolescent_12-16y': {
    heartRate: { min: 50, max: 100, mean: 75, unit: 'bpm' },
    prInterval: { min: 120, max: 200, mean: 160, unit: 'ms' },
    qrsDuration: { min: 60, max: 100, mean: 80, unit: 'ms' },
    qtcInterval: { min: 360, max: 460, mean: 410, unit: 'ms' },
    qrsAxis: { min: -15, max: 100, mean: 45, unit: 'degrees' },
    rWaveV1: { min: 0, max: 10, mean: 4, unit: 'mm' },
    sWaveV1: { min: 3, max: 22, mean: 12, unit: 'mm' },
    rWaveV6: { min: 8, max: 25, mean: 16, unit: 'mm' },
    sWaveV6: { min: 0, max: 4, mean: 1, unit: 'mm' },
  },
  'adult': {
    heartRate: { min: 60, max: 100, mean: 80, unit: 'bpm' },
    prInterval: { min: 120, max: 200, mean: 160, unit: 'ms' },
    qrsDuration: { min: 60, max: 120, mean: 90, unit: 'ms' },
    qtcInterval: { min: 360, max: 460, mean: 410, unit: 'ms' },
    qrsAxis: { min: -30, max: 90, mean: 60, unit: 'degrees' },
    rWaveV1: { min: 0, max: 6, mean: 3, unit: 'mm' },
    sWaveV1: { min: 0, max: 23, mean: 10, unit: 'mm' },
    rWaveV6: { min: 5, max: 26, mean: 15, unit: 'mm' },
    sWaveV6: { min: 0, max: 6, mean: 2, unit: 'mm' },
  },
};

/**
 * Get age group from age in years (or days for neonates)
 */
export function getAgeGroup(ageYears: number, ageDays?: number): PediatricAgeGroup {
  if (ageDays !== undefined) {
    if (ageDays <= 7) return 'neonate_0-7d';
    if (ageDays <= 30) return 'neonate_8-30d';
  }

  if (ageYears < 0.25) return 'infant_1-3m';   // <3 months
  if (ageYears < 0.5) return 'infant_3-6m';    // 3-6 months
  if (ageYears < 1) return 'infant_6-12m';     // 6-12 months
  if (ageYears < 3) return 'toddler_1-3y';     // 1-3 years
  if (ageYears < 5) return 'child_3-5y';       // 3-5 years
  if (ageYears < 8) return 'child_5-8y';       // 5-8 years
  if (ageYears < 12) return 'child_8-12y';     // 8-12 years
  if (ageYears < 16) return 'adolescent_12-16y'; // 12-16 years
  return 'adult';                               // 16+ years
}

/**
 * Get normal values for age group
 */
export function getNormals(ageGroup: PediatricAgeGroup): PediatricNormals {
  return PEDIATRIC_NORMALS[ageGroup];
}

/**
 * Interpretation finding
 */
export interface PediatricFinding {
  parameter: string;
  value: number;
  normalRange: NormalRange;
  status: 'normal' | 'low' | 'high' | 'borderline';
  significance: 'normal' | 'mild' | 'moderate' | 'severe';
  interpretation: string;
}

/**
 * Pediatric ECG interpretation result
 */
export interface PediatricInterpretation {
  ageGroup: PediatricAgeGroup;
  findings: PediatricFinding[];
  summary: string;
  isNormal: boolean;
  abnormalities: string[];
  recommendations: string[];
}

/**
 * Interpret ECG values for pediatric patient
 */
export function interpretPediatric(
  ageYears: number,
  values: {
    heartRate?: number;
    prInterval?: number;
    qrsDuration?: number;
    qtcInterval?: number;
    qrsAxis?: number;
    rWaveV1?: number;
    sWaveV1?: number;
    rWaveV6?: number;
    sWaveV6?: number;
  },
  ageDays?: number
): PediatricInterpretation {
  const ageGroup = getAgeGroup(ageYears, ageDays);
  const normals = getNormals(ageGroup);
  const findings: PediatricFinding[] = [];
  const abnormalities: string[] = [];
  const recommendations: string[] = [];

  // Check each parameter
  if (values.heartRate !== undefined) {
    const finding = evaluateParameter('Heart Rate', values.heartRate, normals.heartRate);
    findings.push(finding);

    if (finding.status === 'low') {
      abnormalities.push('Bradycardia for age');
      if (finding.significance === 'severe') {
        recommendations.push('Evaluate for sick sinus syndrome, heart block, or medication effects');
      }
    } else if (finding.status === 'high') {
      abnormalities.push('Tachycardia for age');
      if (finding.significance === 'severe') {
        recommendations.push('Evaluate for SVT, fever, dehydration, or other causes');
      }
    }
  }

  if (values.prInterval !== undefined) {
    const finding = evaluateParameter('PR Interval', values.prInterval, normals.prInterval);
    findings.push(finding);

    if (finding.status === 'high') {
      abnormalities.push('First degree AV block');
      recommendations.push('Consider Lyme disease, rheumatic fever, or congenital heart block');
    } else if (finding.status === 'low') {
      abnormalities.push('Short PR interval');
      recommendations.push('Evaluate for pre-excitation (WPW syndrome)');
    }
  }

  if (values.qrsDuration !== undefined) {
    const finding = evaluateParameter('QRS Duration', values.qrsDuration, normals.qrsDuration);
    findings.push(finding);

    if (finding.status === 'high') {
      abnormalities.push('Wide QRS for age');
      recommendations.push('Evaluate for bundle branch block, ventricular hypertrophy, or pre-excitation');
    }
  }

  if (values.qtcInterval !== undefined) {
    const finding = evaluateParameter('QTc Interval', values.qtcInterval, normals.qtcInterval);
    findings.push(finding);

    if (finding.status === 'high') {
      abnormalities.push('Prolonged QTc');
      if (values.qtcInterval > 480) {
        recommendations.push('URGENT: Evaluate for Long QT syndrome, electrolyte abnormalities, medications');
      } else {
        recommendations.push('Consider Long QT syndrome screening, check medications and electrolytes');
      }
    }
  }

  if (values.qrsAxis !== undefined) {
    const finding = evaluateParameter('QRS Axis', values.qrsAxis, normals.qrsAxis);
    findings.push(finding);

    if (finding.status !== 'normal') {
      if (values.qrsAxis < normals.qrsAxis.min) {
        abnormalities.push('Left axis deviation for age');
      } else {
        abnormalities.push('Right axis deviation for age');
      }
    }
  }

  // Check R/S wave voltages for ventricular hypertrophy
  if (values.rWaveV1 !== undefined && values.sWaveV1 !== undefined) {
    if (values.rWaveV1 > normals.rWaveV1.max) {
      abnormalities.push('Right ventricular hypertrophy voltage criteria');
      recommendations.push('Consider echocardiogram to evaluate for RVH');
    }
  }

  if (values.rWaveV6 !== undefined && values.sWaveV6 !== undefined) {
    if (values.rWaveV6 > normals.rWaveV6.max) {
      abnormalities.push('Left ventricular hypertrophy voltage criteria');
      recommendations.push('Consider echocardiogram to evaluate for LVH');
    }
  }

  // Generate summary
  const isNormal = abnormalities.length === 0;
  let summary: string;

  if (isNormal) {
    summary = `Normal ECG for ${formatAgeGroup(ageGroup)}`;
  } else {
    summary = `Abnormal ECG for ${formatAgeGroup(ageGroup)}: ${abnormalities.join(', ')}`;
  }

  return {
    ageGroup,
    findings,
    summary,
    isNormal,
    abnormalities,
    recommendations,
  };
}

/**
 * Evaluate a single parameter against normal range
 */
function evaluateParameter(
  name: string,
  value: number,
  normal: NormalRange
): PediatricFinding {
  let status: PediatricFinding['status'];
  let significance: PediatricFinding['significance'];
  let interpretation: string;

  const percentBelow = (normal.min - value) / normal.min;
  const percentAbove = (value - normal.max) / normal.max;

  if (value < normal.min) {
    status = 'low';
    if (percentBelow > 0.2) {
      significance = 'severe';
      interpretation = `Severely low ${name}`;
    } else if (percentBelow > 0.1) {
      significance = 'moderate';
      interpretation = `Moderately low ${name}`;
    } else {
      significance = 'mild';
      interpretation = `Mildly low ${name}`;
    }
  } else if (value > normal.max) {
    status = 'high';
    if (percentAbove > 0.2) {
      significance = 'severe';
      interpretation = `Severely high ${name}`;
    } else if (percentAbove > 0.1) {
      significance = 'moderate';
      interpretation = `Moderately high ${name}`;
    } else {
      significance = 'mild';
      interpretation = `Mildly high ${name}`;
    }
  } else {
    status = 'normal';
    significance = 'normal';
    interpretation = `Normal ${name}`;
  }

  return {
    parameter: name,
    value,
    normalRange: normal,
    status,
    significance,
    interpretation,
  };
}

/**
 * Format age group for display
 */
function formatAgeGroup(ageGroup: PediatricAgeGroup): string {
  const labels: Record<PediatricAgeGroup, string> = {
    'neonate_0-7d': 'neonate (0-7 days)',
    'neonate_8-30d': 'neonate (8-30 days)',
    'infant_1-3m': 'infant (1-3 months)',
    'infant_3-6m': 'infant (3-6 months)',
    'infant_6-12m': 'infant (6-12 months)',
    'toddler_1-3y': 'toddler (1-3 years)',
    'child_3-5y': 'child (3-5 years)',
    'child_5-8y': 'child (5-8 years)',
    'child_8-12y': 'child (8-12 years)',
    'adolescent_12-16y': 'adolescent (12-16 years)',
    'adult': 'adult',
  };
  return labels[ageGroup];
}
