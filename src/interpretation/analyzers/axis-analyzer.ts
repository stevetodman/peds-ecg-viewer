/**
 * QRS axis analysis for pediatric ECG interpretation
 * @module interpretation/analyzers/axis-analyzer
 */

import { InterpretationFinding, Severity } from '../../types/interpretation';
import { NormalRange } from '../../data/pediatricNormals';

/**
 * Normalize axis to -180 to +180 range
 */
function normalizeAxis(axis: number): number {
  let normalized = axis;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

/**
 * Analyze QRS axis for age-adjusted abnormalities
 * @param qrsAxis - QRS axis in degrees
 * @param qrsAxisNormals - Age-adjusted normal range
 * @param ageDays - Patient age in days
 * @returns Axis-related findings
 */
export function analyzeAxis(
  qrsAxis: number,
  qrsAxisNormals: NormalRange,
  ageDays: number
): InterpretationFinding[] {
  const findings: InterpretationFinding[] = [];
  const normalizedAxis = normalizeAxis(qrsAxis);

  const { p2: lowerLimit, p98: upperLimit } = qrsAxisNormals;

  // Check for extreme axis deviation (Northwest axis: -90 to -180)
  if (normalizedAxis >= -180 && normalizedAxis < -90) {
    findings.push({
      code: 'EXTREME_AXIS',
      statement: `Extreme axis deviation (${Math.round(normalizedAxis)} degrees)`,
      severity: 'abnormal',
      category: 'axis',
      evidence: {
        qrsAxis: Math.round(normalizedAxis),
        normalRange: `${lowerLimit} to ${upperLimit}`,
      },
      ageAdjusted: true,
      confidence: 0.95,
      clinicalNote: 'Consider ventricular hypertrophy, conduction abnormality, or lead misplacement',
    });
  } else if (normalizedAxis < lowerLimit) {
    // Left axis deviation
    const deviation = lowerLimit - normalizedAxis;
    const severity: Severity = deviation > 30 ? 'abnormal' : 'borderline';

    findings.push({
      code: 'LEFT_AXIS_DEVIATION',
      statement: `Left axis deviation for age (${Math.round(normalizedAxis)} degrees, lower limit ${lowerLimit})`,
      severity,
      category: 'axis',
      evidence: {
        qrsAxis: Math.round(normalizedAxis),
        lowerLimit,
        deviation: Math.round(deviation),
      },
      ageAdjusted: true,
      pediatricSpecific: true,
      confidence: 0.85,
      clinicalNote: 'Consider LAFB, LVH, primum ASD, or AV canal defect',
    });
  } else if (normalizedAxis > upperLimit) {
    // Right axis deviation
    const deviation = normalizedAxis - upperLimit;
    const severity: Severity = deviation > 30 ? 'abnormal' : 'borderline';

    // Neonates normally have rightward axis - be more lenient
    const isNeonatalPeriod = ageDays < 30;
    const adjustedSeverity: Severity = isNeonatalPeriod && normalizedAxis < 180
      ? 'borderline'
      : severity;

    findings.push({
      code: 'RIGHT_AXIS_DEVIATION',
      statement: `Right axis deviation for age (${Math.round(normalizedAxis)} degrees, upper limit ${upperLimit})`,
      severity: adjustedSeverity,
      category: 'axis',
      evidence: {
        qrsAxis: Math.round(normalizedAxis),
        upperLimit,
        deviation: Math.round(deviation),
        neonatalPeriod: isNeonatalPeriod ? 'yes' : 'no',
      },
      ageAdjusted: true,
      pediatricSpecific: true,
      confidence: 0.85,
      clinicalNote: 'Consider RVH, RBBB, pulmonary hypertension, or secundum ASD',
    });
  } else {
    // Normal axis
    findings.push({
      code: 'AXIS_NORMAL',
      statement: `Normal QRS axis for age (${Math.round(normalizedAxis)} degrees)`,
      severity: 'normal',
      category: 'axis',
      evidence: {
        qrsAxis: Math.round(normalizedAxis),
        normalRange: `${lowerLimit} to ${upperLimit}`,
      },
      ageAdjusted: true,
      confidence: 0.9,
    });
  }

  return findings;
}
