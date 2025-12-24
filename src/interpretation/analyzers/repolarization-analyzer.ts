/**
 * Repolarization analysis for pediatric ECG interpretation
 * T-wave patterns and QRS-T angle analysis
 * @module interpretation/analyzers/repolarization-analyzer
 */

import { InterpretationFinding } from '../../types/interpretation';

/**
 * T-wave polarity type
 */
export type TWavePolarity = 'upright' | 'inverted' | 'flat' | 'biphasic';

interface TWavePattern {
  normal: TWavePolarity[];
  abnormal: TWavePolarity[];
  notes?: string;
}

/**
 * Analyze T-wave and repolarization abnormalities
 * @param tWaveV1Polarity - T wave polarity in V1
 * @param tAxis - T wave axis in degrees
 * @param qrsAxis - QRS axis in degrees
 * @param tWavePattern - Age-specific T-wave pattern from normals
 * @param ageDays - Patient age in days
 * @returns Repolarization-related findings
 */
export function analyzeRepolarization(
  tWaveV1Polarity: TWavePolarity | undefined,
  tAxis: number,
  qrsAxis: number,
  tWavePattern: TWavePattern,
  ageDays: number
): InterpretationFinding[] {
  const findings: InterpretationFinding[] = [];

  // T-wave in V1 analysis (highly age-dependent in pediatrics)
  if (tWaveV1Polarity) {
    const isNormal = tWavePattern.normal.includes(tWaveV1Polarity);
    const isAbnormal = tWavePattern.abnormal.includes(tWaveV1Polarity);

    if (isAbnormal) {
      // Most commonly: upright T in V1 after first week of life suggests RVH
      if (tWaveV1Polarity === 'upright' && ageDays > 7) {
        findings.push({
          code: 'T_WAVE_ABNORMALITY',
          statement: 'Upright T wave in V1 (abnormal for age > 1 week)',
          severity: 'abnormal',
          category: 'morphology',
          evidence: {
            tWaveV1: tWaveV1Polarity,
            ageDays,
          },
          ageAdjusted: true,
          pediatricSpecific: true,
          confidence: 0.85,
          clinicalNote: `Suggests RV strain or hypertrophy. ${tWavePattern.notes || ''}`,
        });
      } else if (tWaveV1Polarity === 'inverted' && ageDays <= 1) {
        // Inverted T in first day is unusual
        findings.push({
          code: 'T_WAVE_ABNORMALITY',
          statement: 'Inverted T wave in V1 (unusual in first day of life)',
          severity: 'borderline',
          category: 'morphology',
          evidence: {
            tWaveV1: tWaveV1Polarity,
            ageDays,
          },
          ageAdjusted: true,
          pediatricSpecific: true,
          confidence: 0.7,
        });
      }
    } else if (isNormal && tWaveV1Polarity === 'inverted' && ageDays >= 1096 && ageDays < 5844) {
      // Juvenile T-wave pattern (3-16 years) - normal but worth noting
      findings.push({
        code: 'JUVENILE_T_PATTERN',
        statement: 'Juvenile T-wave pattern (inverted T in V1 - normal for age)',
        severity: 'normal',
        category: 'morphology',
        evidence: {
          tWaveV1: tWaveV1Polarity,
          ageDays,
        },
        ageAdjusted: true,
        pediatricSpecific: true,
        confidence: 0.9,
      });
    }
  }

  // QRS-T angle analysis (T axis relative to QRS axis)
  if (!isNaN(tAxis) && !isNaN(qrsAxis)) {
    let qrsTAngle = Math.abs(qrsAxis - tAxis);
    // Normalize to 0-180 range
    if (qrsTAngle > 180) {
      qrsTAngle = 360 - qrsTAngle;
    }

    // Wide QRS-T angle suggests primary repolarization abnormality
    if (qrsTAngle > 135) {
      findings.push({
        code: 'T_WAVE_ABNORMALITY',
        statement: `Wide QRS-T angle (${Math.round(qrsTAngle)} degrees)`,
        severity: 'abnormal',
        category: 'morphology',
        evidence: {
          qrsAxis: Math.round(qrsAxis),
          tAxis: Math.round(tAxis),
          qrsTAngle: Math.round(qrsTAngle),
        },
        confidence: 0.75,
        clinicalNote: 'May indicate primary repolarization abnormality, ischemia, or cardiomyopathy',
      });
    } else if (qrsTAngle > 100) {
      findings.push({
        code: 'T_WAVE_ABNORMALITY',
        statement: `Borderline wide QRS-T angle (${Math.round(qrsTAngle)} degrees)`,
        severity: 'borderline',
        category: 'morphology',
        evidence: {
          qrsAxis: Math.round(qrsAxis),
          tAxis: Math.round(tAxis),
          qrsTAngle: Math.round(qrsTAngle),
        },
        confidence: 0.65,
      });
    }
  }

  return findings;
}
