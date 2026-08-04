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
  pr: number | null,
  prNormals: NormalRange,
  ageDays: number,
  strictness: 'lenient' | 'standard' | 'strict'
): InterpretationFinding[] {
  const findings: InterpretationFinding[] = [];
  if (pr === null || !Number.isFinite(pr) || pr <= 0) return findings;
  const classification = classifyValue(pr, prNormals, strictness);

  if (classification === 'high' || classification === 'borderline_high') {
    const severity: Severity = pr > 200 ? 'abnormal' : 'borderline';

    findings.push({
      code: 'PR_PROLONGED',
      statement: `Prolonged PR interval (${Math.round(pr)} ms, upper reference limit ${prNormals.p98} for age)`,
      severity,
      category: 'intervals',
      evidence: {
        pr: Math.round(pr),
        upperLimit: prNormals.p98,
        ageDays,
      },
      ageAdjusted: true,
      confidence: 0.85,
      clinicalNote: 'A prolonged PR measurement alone does not establish first-degree AV block without confirming 1:1 atrioventricular conduction.',
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
      clinicalNote: 'A short PR alone is nonspecific; review P-wave and QRS morphology for possible pre-excitation or an ectopic atrial origin.',
    });
  }

  return findings;
}

/**
 * Analyze QRS duration
 */
function analyzeQRS(
  qrs: number | null,
  qrsNormals: NormalRange,
  ageDays: number,
  strictness: 'lenient' | 'standard' | 'strict'
): InterpretationFinding[] {
  const findings: InterpretationFinding[] = [];
  if (qrs === null || !Number.isFinite(qrs) || qrs <= 0) return findings;
  const classification = classifyValue(qrs, qrsNormals, strictness);

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
  qtc: number | null,
  qtcNormals: NormalRange,
  hr: number | null,
  strictness: 'lenient' | 'standard' | 'strict'
): InterpretationFinding[] {
  const findings: InterpretationFinding[] = [];
  if (qtc === null || !Number.isFinite(qtc) || qtc <= 0) return findings;

  const classification = classifyValue(qtc, qtcNormals, strictness);

  if (qtc > 500) {
    findings.push({
      code: 'QTC_PROLONGED',
      statement: `Markedly prolonged QTc (${Math.round(qtc)} ms) - Risk of Torsades de Pointes`,
      severity: 'critical',
      category: 'intervals',
      evidence: {
        qtc: Math.round(qtc),
        hr: hr === null ? 'unavailable' : Math.round(hr),
        threshold: 500,
      },
      confidence: 0.9,
      clinicalNote: 'URGENT: Review medications (especially QT-prolonging drugs), check electrolytes (K, Mg, Ca), consider Long QT syndrome workup',
    });
  } else if (classification === 'high') {
    findings.push({
      code: 'QTC_PROLONGED',
      statement: `Prolonged QTc (${Math.round(qtc)} ms)`,
      severity: 'abnormal',
      category: 'intervals',
      evidence: {
        qtc: Math.round(qtc),
        upperLimit: qtcNormals.p98,
        hr: hr === null ? 'unavailable' : Math.round(hr),
      },
      confidence: 0.85,
      clinicalNote: 'Consider Long QT syndrome screening, medication review, electrolyte check',
    });
  } else if (classification === 'borderline_high') {
    findings.push({
      code: 'QTC_BORDERLINE',
      statement: `Borderline prolonged QTc (${Math.round(qtc)} ms)`,
      severity: 'borderline',
      category: 'intervals',
      evidence: {
        qtc: Math.round(qtc),
        upperLimit: qtcNormals.p98,
      },
      confidence: 0.8,
    });
  } else if (classification === 'low' || classification === 'borderline_low') {
    findings.push({
      code: 'QTC_SHORT',
      statement: `Short QTc (${Math.round(qtc)} ms)`,
      severity: classification === 'low' ? 'abnormal' : 'borderline',
      category: 'intervals',
      evidence: {
        qtc: Math.round(qtc),
      },
      confidence: 0.75,
      clinicalNote: classification === 'low'
        ? 'QTc below the age-specific reference interval; verify the measurement and assess clinically for short-QT causes.'
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
  pr: number | null,
  qrs: number | null,
  qtc: number | null,
  hr: number | null,
  normals: IntervalNormals,
  ageDays: number,
  strictness: 'lenient' | 'standard' | 'strict' = 'standard'
): InterpretationFinding[] {
  const findings: InterpretationFinding[] = [];

  // Analyze each interval
  findings.push(...analyzePR(pr, normals.prInterval, ageDays, strictness));
  findings.push(...analyzeQRS(qrs, normals.qrsDuration, ageDays, strictness));
  findings.push(...analyzeQTc(qtc, normals.qtcBazett, hr, strictness));

  return findings;
}
