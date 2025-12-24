/**
 * Main ECG interpretation engine
 * @module interpretation/interpret-ecg
 */

import { ECGInterpretation, InterpretationFinding } from '../types/interpretation';
import { getNormalsForAge, AgeNormals } from '../data/pediatricNormals';
import { isPediatric } from '../data/ageGroups';
import {
  analyzeRate,
  analyzeAxis,
  analyzeIntervals,
  analyzeHypertrophy,
  analyzeRepolarization,
  analyzePreexcitation,
  analyzeBrugada,
  VoltageData,
  TWavePolarity,
  PreexcitationInput,
  BrugadaInput,
} from './analyzers';
import { combineFindings } from './summary';

/**
 * ECG measurements from signal analysis
 */
export interface ECGMeasurements {
  hr: number;       // Heart rate (bpm)
  rr: number;       // R-R interval (ms)
  pr: number;       // PR interval (ms)
  qrs: number;      // QRS duration (ms)
  qt: number;       // QT interval (ms)
  qtc: number;      // Corrected QT (Bazett)
  pAxis: number;    // P wave axis (degrees)
  qrsAxis: number;  // QRS axis (degrees)
  tAxis: number;    // T wave axis (degrees)
}

/**
 * Input for ECG interpretation
 */
export interface InterpretationInput {
  /** Core measurements from calculateECGMeasurements() */
  measurements: ECGMeasurements;

  /** Optional voltage measurements for hypertrophy detection (mm) */
  voltages?: VoltageData;

  /** Optional T-wave polarity in V1 for age-specific assessment */
  tWaveV1Polarity?: TWavePolarity;

  /** Optional pre-excitation/WPW detection input */
  preexcitation?: Partial<PreexcitationInput>;

  /** Optional Brugada pattern detection input */
  brugada?: BrugadaInput;
}

/**
 * Options for ECG interpretation
 */
export interface InterpretationOptions {
  /** Use strict interpretation (fewer borderline findings) */
  strictMode?: boolean;

  /** Include clinical notes in findings */
  includeClinicalNotes?: boolean;

  /** Confidence threshold (0-1), findings below this are excluded */
  confidenceThreshold?: number;

  /** Software version string */
  version?: string;
}

/**
 * Default interpretation options
 */
const DEFAULT_OPTIONS: InterpretationOptions = {
  strictMode: false,
  includeClinicalNotes: true,
  confidenceThreshold: 0,
  version: 'peds-ecg-viewer v0.1.0',
};

/**
 * Filter findings by confidence threshold
 */
function filterByConfidence(
  findings: InterpretationFinding[],
  threshold: number
): InterpretationFinding[] {
  if (threshold <= 0) return findings;
  return findings.filter(f => (f.confidence ?? 1) >= threshold);
}

/**
 * Remove clinical notes if not requested
 */
function removeClinicalNotes(findings: InterpretationFinding[]): InterpretationFinding[] {
  return findings.map(f => {
    const { clinicalNote, ...rest } = f;
    return rest as InterpretationFinding;
  });
}

/**
 * Main interpretation function
 *
 * Analyzes ECG measurements and generates a complete interpretation
 * with age-adjusted normal values for pediatric patients.
 *
 * @param input - ECG measurements and optional voltage/morphology data
 * @param ageDays - Patient age in days
 * @param options - Interpretation options
 * @returns Complete ECG interpretation
 *
 * @example
 * ```typescript
 * import { interpretECG } from './interpretation';
 * import { calculateECGMeasurements } from './signal/analysis/ecg-measurements';
 *
 * const measurements = calculateECGMeasurements(leadII, leadI, leadAVF, 500);
 * const ageDays = 365 * 5; // 5 years old
 *
 * const interpretation = interpretECG({ measurements }, ageDays);
 *
 * console.log(interpretation.summary.conclusion); // "Normal ECG" or "Abnormal ECG"
 * console.log(interpretation.summary.oneLiner);   // "Normal ECG for age"
 * ```
 */
export function interpretECG(
  input: InterpretationInput,
  ageDays: number,
  options?: InterpretationOptions
): ECGInterpretation {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { measurements, voltages, tWaveV1Polarity } = input;

  // Get age-adjusted normal values
  const normals: AgeNormals = getNormalsForAge(ageDays);

  // Collect all findings
  let findings: InterpretationFinding[] = [];

  // 1. Rate analysis
  findings.push(...analyzeRate(measurements.hr, normals.heartRate, ageDays));

  // 2. Axis analysis
  findings.push(...analyzeAxis(measurements.qrsAxis, normals.qrsAxis, ageDays));

  // 3. Interval analysis (PR, QRS, QTc)
  findings.push(
    ...analyzeIntervals(
      measurements.pr,
      measurements.qrs,
      measurements.qtc,
      measurements.hr,
      {
        prInterval: normals.prInterval,
        qrsDuration: normals.qrsDuration,
        qtcBazett: normals.qtcBazett,
      },
      ageDays
    )
  );

  // 4. Hypertrophy analysis (if voltages provided)
  if (voltages) {
    findings.push(
      ...analyzeHypertrophy(
        voltages,
        measurements.qrsAxis,
        {
          rWaveV1: normals.rWaveV1,
          sWaveV1: normals.sWaveV1,
          rWaveV6: normals.rWaveV6,
          sWaveV6: normals.sWaveV6,
          rsRatioV1: normals.rsRatioV1,
          rsRatioV6: normals.rsRatioV6,
          qWaveV6: normals.qWaveV6,
          qrsAxis: normals.qrsAxis,
        },
        ageDays
      )
    );
  }

  // 5. Repolarization analysis
  findings.push(
    ...analyzeRepolarization(
      tWaveV1Polarity,
      measurements.tAxis,
      measurements.qrsAxis,
      normals.tWaveV1,
      ageDays
    )
  );

  // 6. Pre-excitation (WPW) analysis
  // Always run with PR and QRS from measurements; delta wave info is optional
  findings.push(
    ...analyzePreexcitation(
      {
        pr: measurements.pr,
        qrs: measurements.qrs,
        deltaWaveDetected: input.preexcitation?.deltaWaveDetected,
        deltaWaveDuration: input.preexcitation?.deltaWaveDuration,
      },
      ageDays
    )
  );

  // 7. Brugada pattern analysis (if ST/morphology data provided)
  if (input.brugada) {
    findings.push(...analyzeBrugada(input.brugada, ageDays));
  }

  // Apply confidence filter
  findings = filterByConfidence(findings, opts.confidenceThreshold ?? 0);

  // Remove clinical notes if not requested
  if (!opts.includeClinicalNotes) {
    findings = removeClinicalNotes(findings);
  }

  // Generate summary
  const { summary, rhythm, orderedFindings } = combineFindings(findings, measurements.hr);

  // Build final interpretation
  const interpretation: ECGInterpretation = {
    rhythm,
    findings: orderedFindings,
    summary,
    method: 'automated',
    confidence: calculateOverallConfidence(orderedFindings),
    interpretedAt: new Date(),
    interpretedBy: opts.version ?? 'peds-ecg-viewer',
    patientAgeDays: ageDays,
    pediatricInterpretation: isPediatric(ageDays),
    rawStatements: orderedFindings
      .filter(f => f.severity !== 'normal')
      .map(f => f.statement),
  };

  return interpretation;
}

/**
 * Calculate overall interpretation confidence
 */
function calculateOverallConfidence(findings: InterpretationFinding[]): number {
  if (findings.length === 0) return 0.5;

  const confidences = findings.map(f => f.confidence ?? 0.8);
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

  // Reduce confidence if many abnormal findings (more complex interpretation)
  const abnormalCount = findings.filter(f => f.severity !== 'normal').length;
  const complexityPenalty = Math.min(0.1, abnormalCount * 0.02);

  return Math.max(0.5, avgConfidence - complexityPenalty);
}
