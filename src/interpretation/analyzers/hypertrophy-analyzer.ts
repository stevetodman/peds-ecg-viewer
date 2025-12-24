/**
 * Ventricular hypertrophy analysis for pediatric ECG interpretation
 * Uses age-adjusted voltage criteria
 * @module interpretation/analyzers/hypertrophy-analyzer
 */

import { InterpretationFinding, Severity } from '../../types/interpretation';
import { NormalRange } from '../../data/pediatricNormals';

/**
 * Voltage measurements in mm (at standard 10mm/mV)
 */
export interface VoltageData {
  rWaveV1?: number;
  sWaveV1?: number;
  rWaveV6?: number;
  sWaveV6?: number;
  qWaveV6?: number;
}

interface VoltageNormals {
  rWaveV1: NormalRange;
  sWaveV1: NormalRange;
  rWaveV6: NormalRange;
  sWaveV6: NormalRange;
  rsRatioV1: NormalRange;
  rsRatioV6: NormalRange;
  qWaveV6?: NormalRange;
  qrsAxis: NormalRange;
}

/**
 * Analyze voltage criteria for ventricular hypertrophy
 * @param voltages - Voltage measurements in mm
 * @param qrsAxis - QRS axis in degrees
 * @param normals - Age-adjusted normal ranges
 * @param ageDays - Patient age in days
 * @returns Hypertrophy-related findings
 */
export function analyzeHypertrophy(
  voltages: VoltageData,
  qrsAxis: number,
  normals: VoltageNormals,
  ageDays: number
): InterpretationFinding[] {
  const findings: InterpretationFinding[] = [];

  // If no voltage data, cannot assess hypertrophy
  if (!voltages.rWaveV1 && !voltages.rWaveV6 && !voltages.sWaveV1 && !voltages.sWaveV6) {
    return findings;
  }

  // RVH Criteria (age-adjusted)
  const rvhCriteria: string[] = [];
  let rvhScore = 0;

  if (voltages.rWaveV1 !== undefined && voltages.rWaveV1 > normals.rWaveV1.p98) {
    rvhCriteria.push(`R in V1 ${voltages.rWaveV1}mm > ${normals.rWaveV1.p98}mm`);
    rvhScore++;
  }

  if (voltages.sWaveV6 !== undefined && voltages.sWaveV6 > normals.sWaveV6.p98) {
    rvhCriteria.push(`S in V6 ${voltages.sWaveV6}mm > ${normals.sWaveV6.p98}mm`);
    rvhScore++;
  }

  // R/S ratio in V1
  if (voltages.rWaveV1 !== undefined && voltages.sWaveV1 !== undefined && voltages.sWaveV1 > 0) {
    const rsRatioV1 = voltages.rWaveV1 / voltages.sWaveV1;
    if (rsRatioV1 > normals.rsRatioV1.p98) {
      rvhCriteria.push(`R/S ratio V1 ${rsRatioV1.toFixed(1)} > ${normals.rsRatioV1.p98}`);
      rvhScore++;
    }
  }

  // Right axis deviation contributes to RVH
  if (qrsAxis > normals.qrsAxis.p98) {
    rvhCriteria.push('Right axis deviation');
    rvhScore++;
  }

  // RVH findings
  if (rvhScore >= 2) {
    const severity: Severity = rvhScore >= 3 ? 'abnormal' : 'borderline';
    findings.push({
      code: 'RVH',
      statement: rvhScore >= 3
        ? 'Right ventricular hypertrophy by voltage criteria'
        : 'Possible right ventricular hypertrophy',
      severity,
      category: 'hypertrophy',
      evidence: {
        criteria: rvhCriteria.join('; '),
        score: rvhScore,
        ageDays,
      },
      ageAdjusted: true,
      pediatricSpecific: true,
      confidence: rvhScore >= 3 ? 0.85 : 0.65,
      clinicalNote: 'Consider echocardiogram. May indicate pulmonary hypertension, pulmonary stenosis, TOF, or other CHD.',
    });
  }

  // LVH Criteria
  const lvhCriteria: string[] = [];
  let lvhScore = 0;

  if (voltages.rWaveV6 !== undefined && voltages.rWaveV6 > normals.rWaveV6.p98) {
    lvhCriteria.push(`R in V6 ${voltages.rWaveV6}mm > ${normals.rWaveV6.p98}mm`);
    lvhScore++;
  }

  if (voltages.sWaveV1 !== undefined && voltages.sWaveV1 > normals.sWaveV1.p98) {
    lvhCriteria.push(`S in V1 ${voltages.sWaveV1}mm > ${normals.sWaveV1.p98}mm`);
    lvhScore++;
  }

  // R/S ratio in V6
  if (voltages.rWaveV6 !== undefined && voltages.sWaveV6 !== undefined && voltages.sWaveV6 > 0) {
    const rsRatioV6 = voltages.rWaveV6 / voltages.sWaveV6;
    if (rsRatioV6 > normals.rsRatioV6.p98) {
      lvhCriteria.push(`R/S ratio V6 ${rsRatioV6.toFixed(1)} > ${normals.rsRatioV6.p98}`);
      lvhScore++;
    }
  }

  // Deep Q waves in V6 can indicate LVH
  if (voltages.qWaveV6 !== undefined && normals.qWaveV6 && voltages.qWaveV6 > normals.qWaveV6.p98) {
    lvhCriteria.push(`Q in V6 ${voltages.qWaveV6}mm > ${normals.qWaveV6.p98}mm`);
    lvhScore++;
  }

  // Left axis deviation contributes to LVH
  if (qrsAxis < normals.qrsAxis.p2) {
    lvhCriteria.push('Left axis deviation');
    lvhScore++;
  }

  // LVH findings
  if (lvhScore >= 2) {
    const severity: Severity = lvhScore >= 3 ? 'abnormal' : 'borderline';
    findings.push({
      code: 'LVH',
      statement: lvhScore >= 3
        ? 'Left ventricular hypertrophy by voltage criteria'
        : 'Possible left ventricular hypertrophy',
      severity,
      category: 'hypertrophy',
      evidence: {
        criteria: lvhCriteria.join('; '),
        score: lvhScore,
        ageDays,
      },
      ageAdjusted: true,
      pediatricSpecific: true,
      confidence: lvhScore >= 3 ? 0.85 : 0.65,
      clinicalNote: 'Consider echocardiogram. May indicate aortic stenosis, coarctation, hypertension, or cardiomyopathy.',
    });
  }

  // Check for BVH (biventricular hypertrophy)
  if (rvhScore >= 2 && lvhScore >= 2) {
    // Find and upgrade the existing findings
    const rvhFinding = findings.find(f => f.code === 'RVH');
    const lvhFinding = findings.find(f => f.code === 'LVH');

    if (rvhFinding && lvhFinding) {
      // Keep both but add a BVH finding
      findings.push({
        code: 'BVH',
        statement: 'Biventricular hypertrophy by voltage criteria',
        severity: 'abnormal',
        category: 'hypertrophy',
        evidence: {
          rvhCriteria: rvhCriteria.join('; '),
          lvhCriteria: lvhCriteria.join('; '),
          rvhScore,
          lvhScore,
        },
        ageAdjusted: true,
        pediatricSpecific: true,
        confidence: 0.8,
        relatedFindings: ['RVH', 'LVH'],
        clinicalNote: 'Consider echocardiogram. May indicate complex CHD, cardiomyopathy, or severe biventricular disease.',
      });
    }
  }

  return findings;
}
