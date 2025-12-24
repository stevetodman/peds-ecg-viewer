/**
 * Interval analysis for pediatric ECG interpretation
 * PR, QRS duration, and QTc analysis
 * @module interpretation/analyzers/interval-analyzer
 */

import { InterpretationFinding, Severity } from '../../types/interpretation';
import { NormalRange, classifyValue } from '../../data/pediatricNormals';

interface IntervalNormals {
  prInterval: NormalRange;
  qrsDuration: NormalRange;
  qtcBazett: NormalRange;
}

/**
 * Analyze PR interval
 */
function analyzePR(
  pr: number,
  prNormals: NormalRange,
  ageDays: number
): InterpretationFinding[] {
  const findings: InterpretationFinding[] = [];
  const classification = classifyValue(pr, prNormals);

  if (classification === 'high' || classification === 'borderline_high') {
    const severity: Severity = pr > 200 ? 'abnormal' : 'borderline';

    findings.push({
      code: 'FIRST_DEGREE_AV_BLOCK',
      statement: `First-degree AV block (PR ${Math.round(pr)} ms, upper limit ${prNormals.p98} for age)`,
      severity,
      category: 'intervals',
      evidence: {
        pr: Math.round(pr),
        upperLimit: prNormals.p98,
        ageDays,
      },
      ageAdjusted: true,
      confidence: 0.85,
      clinicalNote: severity === 'abnormal'
        ? 'Consider myocarditis, rheumatic fever, medications, or congenital heart disease'
        : undefined,
    });
  } else if (pr < 80 && ageDays > 30) {
    // Short PR - only significant after neonatal period
    findings.push({
      code: 'PR_SHORT',
      statement: `Short PR interval (${Math.round(pr)} ms)`,
      severity: 'borderline',
      category: 'intervals',
      evidence: {
        pr: Math.round(pr),
        lowerLimit: prNormals.p2,
      },
      ageAdjusted: true,
      confidence: 0.8,
      clinicalNote: 'Consider pre-excitation (WPW syndrome) or ectopic atrial rhythm',
    });
  }

  return findings;
}

/**
 * Analyze QRS duration
 */
function analyzeQRS(
  qrs: number,
  qrsNormals: NormalRange,
  ageDays: number
): InterpretationFinding[] {
  const findings: InterpretationFinding[] = [];
  const classification = classifyValue(qrs, qrsNormals);

  if (classification === 'high' || classification === 'borderline_high') {
    // Age-adjusted QRS prolongation thresholds
    // Infants: >100ms concerning, Children: >110ms, Adolescents: >120ms
    let severeThreshold: number;
    if (ageDays < 365) {
      severeThreshold = 100;
    } else if (ageDays < 2922) { // < 8 years
      severeThreshold = 110;
    } else {
      severeThreshold = 120;
    }

    const severity: Severity = qrs > severeThreshold ? 'abnormal' : 'borderline';

    findings.push({
      code: 'QRS_PROLONGED',
      statement: `Prolonged QRS duration (${Math.round(qrs)} ms, upper limit ${qrsNormals.p98} for age)`,
      severity,
      category: 'intervals',
      evidence: {
        qrs: Math.round(qrs),
        upperLimit: qrsNormals.p98,
        severeThreshold,
        ageDays,
      },
      ageAdjusted: true,
      pediatricSpecific: true,
      confidence: 0.85,
      clinicalNote: 'Consider bundle branch block, ventricular hypertrophy, pre-excitation, or electrolyte abnormality',
    });
  }

  return findings;
}

/**
 * Analyze QTc interval - critical for arrhythmia risk
 */
function analyzeQTc(
  qtc: number,
  qtcNormals: NormalRange,
  hr: number
): InterpretationFinding[] {
  const findings: InterpretationFinding[] = [];

  // QTc thresholds are fairly consistent across pediatric ages
  // Critical: >500ms (high risk Torsades)
  // Prolonged: >470ms
  // Borderline: >450ms
  // Short: <340ms

  if (qtc > 500) {
    findings.push({
      code: 'QTC_PROLONGED',
      statement: `Markedly prolonged QTc (${Math.round(qtc)} ms) - Risk of Torsades de Pointes`,
      severity: 'critical',
      category: 'intervals',
      evidence: {
        qtc: Math.round(qtc),
        hr: Math.round(hr),
        threshold: 500,
      },
      confidence: 0.9,
      clinicalNote: 'URGENT: Review medications (especially QT-prolonging drugs), check electrolytes (K, Mg, Ca), consider Long QT syndrome workup',
    });
  } else if (qtc > 470) {
    findings.push({
      code: 'QTC_PROLONGED',
      statement: `Prolonged QTc (${Math.round(qtc)} ms)`,
      severity: 'abnormal',
      category: 'intervals',
      evidence: {
        qtc: Math.round(qtc),
        upperLimit: qtcNormals.p98,
        hr: Math.round(hr),
      },
      confidence: 0.85,
      clinicalNote: 'Consider Long QT syndrome screening, medication review, electrolyte check',
    });
  } else if (qtc > 450) {
    findings.push({
      code: 'QTC_BORDERLINE',
      statement: `Borderline prolonged QTc (${Math.round(qtc)} ms)`,
      severity: 'borderline',
      category: 'intervals',
      evidence: {
        qtc: Math.round(qtc),
      },
      confidence: 0.8,
    });
  } else if (qtc < 340) {
    findings.push({
      code: 'QTC_SHORT',
      statement: `Short QTc (${Math.round(qtc)} ms)`,
      severity: qtc < 320 ? 'abnormal' : 'borderline',
      category: 'intervals',
      evidence: {
        qtc: Math.round(qtc),
      },
      confidence: 0.75,
      clinicalNote: qtc < 320
        ? 'Consider Short QT syndrome - associated with sudden cardiac death risk'
        : undefined,
    });
  }

  return findings;
}

/**
 * Analyze all intervals
 * @param pr - PR interval in ms
 * @param qrs - QRS duration in ms
 * @param qtc - Corrected QT interval in ms
 * @param hr - Heart rate for context
 * @param normals - Age-adjusted normal ranges
 * @param ageDays - Patient age in days
 * @returns Interval-related findings
 */
export function analyzeIntervals(
  pr: number,
  qrs: number,
  qtc: number,
  hr: number,
  normals: IntervalNormals,
  ageDays: number
): InterpretationFinding[] {
  const findings: InterpretationFinding[] = [];

  // Analyze each interval
  findings.push(...analyzePR(pr, normals.prInterval, ageDays));
  findings.push(...analyzeQRS(qrs, normals.qrsDuration, ageDays));
  findings.push(...analyzeQTc(qtc, normals.qtcBazett, hr));

  return findings;
}
