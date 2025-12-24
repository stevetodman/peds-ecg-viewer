/**
 * Automated ECG Interpretation Engine
 *
 * Provides age-adjusted interpretation of pediatric ECGs
 * using established clinical criteria and normal values.
 *
 * @module interpretation
 *
 * @example
 * ```typescript
 * import { interpretECG } from 'peds-ecg-viewer';
 * import { calculateECGMeasurements } from 'peds-ecg-viewer';
 *
 * // Get measurements from ECG signal
 * const measurements = calculateECGMeasurements(leadII, leadI, leadAVF, sampleRate);
 *
 * // Interpret for a 5-year-old (age in days)
 * const ageDays = 365 * 5;
 * const interpretation = interpretECG({ measurements }, ageDays);
 *
 * // Check results
 * console.log(interpretation.summary.conclusion);  // "Normal ECG" | "Abnormal ECG" | "Borderline ECG"
 * console.log(interpretation.summary.oneLiner);    // "Normal ECG for age"
 * console.log(interpretation.summary.urgency);     // "routine" | "attention" | "urgent" | "critical"
 *
 * // Access individual findings
 * for (const finding of interpretation.findings) {
 *   console.log(`${finding.code}: ${finding.statement} (${finding.severity})`);
 * }
 * ```
 */

// Main API
export {
  interpretECG,
  type InterpretationInput,
  type InterpretationOptions,
  type ECGMeasurements,
} from './interpret-ecg';

// Analyzers (for advanced usage)
export {
  analyzeRate,
  analyzeAxis,
  analyzeIntervals,
  analyzeHypertrophy,
  analyzeRepolarization,
  type VoltageData,
  type TWavePolarity,
} from './analyzers';

// Summary generation
export { combineFindings } from './summary';

// Re-export interpretation types for convenience
export type {
  ECGInterpretation,
  InterpretationFinding,
  InterpretationSummary,
  RhythmDescription,
  Severity,
  FindingCategory,
  FindingCode,
} from '../types/interpretation';
