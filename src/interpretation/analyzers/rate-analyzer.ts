/**
 * Heart rate analysis for pediatric ECG interpretation
 * @module interpretation/analyzers/rate-analyzer
 */

import { InterpretationFinding, Severity } from '../../types/interpretation';
import { NormalRange, classifyValue } from '../../data/pediatricNormals';

/**
 * Analyze heart rate for age-adjusted abnormalities
 * @param hr - Heart rate in bpm
 * @param heartRateNormals - Age-adjusted normal range
 * @param ageDays - Patient age in days
 * @returns Rate-related findings
 */
export function analyzeRate(
  hr: number | null,
  heartRateNormals: NormalRange,
  ageDays: number,
  strictness: 'lenient' | 'standard' | 'strict' = 'standard'
): InterpretationFinding[] {
  const findings: InterpretationFinding[] = [];
  if (hr === null || !Number.isFinite(hr) || hr <= 0) return findings;
  const classification = classifyValue(hr, heartRateNormals, strictness);

  if (classification === 'high' || classification === 'borderline_high') {
    // Calculate severity based on % above upper limit
    const percentAbove = (hr - heartRateNormals.p98) / heartRateNormals.p98;
    const severity: Severity = percentAbove > 0.2 ? 'abnormal' : 'borderline';

    findings.push({
      code: 'RATE_HIGH',
      statement: `High ventricular rate for age (${Math.round(hr)} bpm, upper reference limit ${heartRateNormals.p98})`,
      severity,
      category: 'rate',
      evidence: {
        hr: Math.round(hr),
        upperLimit: heartRateNormals.p98,
        percentAbove: Math.round(percentAbove * 100),
        ageDays,
      },
      ageAdjusted: true,
      pediatricSpecific: true,
      confidence: 0.9,
      clinicalNote: 'Rate alone does not establish sinus tachycardia; confirm atrial activity and rhythm origin.',
    });
  } else if (classification === 'low' || classification === 'borderline_low') {
    // Calculate severity based on % below lower limit
    const percentBelow = (heartRateNormals.p2 - hr) / heartRateNormals.p2;
    const severity: Severity = percentBelow > 0.2 ? 'abnormal' : 'borderline';

    findings.push({
      code: 'RATE_LOW',
      statement: `Low ventricular rate for age (${Math.round(hr)} bpm, lower reference limit ${heartRateNormals.p2})`,
      severity,
      category: 'rate',
      evidence: {
        hr: Math.round(hr),
        lowerLimit: heartRateNormals.p2,
        percentBelow: Math.round(percentBelow * 100),
        ageDays,
      },
      ageAdjusted: true,
      pediatricSpecific: true,
      confidence: 0.9,
      clinicalNote: 'Rate alone does not establish sinus bradycardia; confirm atrial activity and AV relationship.',
    });
  } else {
    // Normal heart rate
    findings.push({
      code: 'RATE_NORMAL',
      statement: `Normal heart rate for age (${Math.round(hr)} bpm)`,
      severity: 'normal',
      category: 'rate',
      evidence: {
        hr: Math.round(hr),
        normalRange: `${heartRateNormals.p2}-${heartRateNormals.p98}`,
      },
      ageAdjusted: true,
      confidence: 0.95,
    });
  }

  return findings;
}
