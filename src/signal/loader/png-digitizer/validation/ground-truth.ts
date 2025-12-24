/**
 * Ground Truth Validation Tools
 * Validate digitization accuracy against known reference ECGs
 *
 * Supports benchmarking against:
 * - PTB-XL database (PhysioNet)
 * - MIT-BIH Arrhythmia Database
 * - Custom annotated datasets
 *
 * Metrics calculated:
 * - RMSE (Root Mean Square Error)
 * - Correlation coefficient
 * - PRD (Percent Root-mean-square Difference)
 * - SNR (Signal-to-Noise Ratio)
 * - QRS detection accuracy
 * - Interval measurement accuracy
 *
 * @module signal/loader/png-digitizer/validation/ground-truth
 */

import type { LeadName } from '../types';

/**
 * Reference annotation for validation
 */
export interface ReferenceAnnotation {
  /** Beat positions (sample indices) */
  beatPositions?: number[];

  /** Beat types */
  beatTypes?: string[];

  /** Intervals (ms) */
  intervals?: {
    pr?: number;
    qrs?: number;
    qt?: number;
    qtc?: number;
    rr?: number;
  };

  /** Heart rate */
  heartRate?: number;

  /** Rhythm label */
  rhythm?: string;

  /** Diagnostic labels */
  diagnoses?: string[];

  /** ST levels per lead (mV) */
  stLevels?: Partial<Record<LeadName, number>>;

  /** Axis (degrees) */
  axis?: number;
}

/**
 * Reference ECG for validation
 */
export interface ReferenceECG {
  /** Unique identifier */
  id: string;

  /** Source database */
  source: 'ptb-xl' | 'mit-bih' | 'custom' | 'other';

  /** Lead data */
  leads: Partial<Record<LeadName, number[]>>;

  /** Sample rate */
  sampleRate: number;

  /** Duration in seconds */
  duration: number;

  /** Annotations */
  annotations: ReferenceAnnotation;

  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Per-lead validation result
 */
export interface LeadValidationResult {
  /** Lead name */
  lead: LeadName;

  /** RMSE (microvolts) */
  rmse: number;

  /** Normalized RMSE (percentage) */
  nrmse: number;

  /** Correlation coefficient */
  correlation: number;

  /** PRD (Percent Root-mean-square Difference) */
  prd: number;

  /** SNR (dB) */
  snr: number;

  /** Sample count used */
  sampleCount: number;

  /** Quality assessment */
  quality: 'excellent' | 'good' | 'acceptable' | 'poor' | 'failed';
}

/**
 * Beat detection validation result
 */
export interface BeatDetectionResult {
  /** True positives */
  truePositives: number;

  /** False positives */
  falsePositives: number;

  /** False negatives */
  falseNegatives: number;

  /** Sensitivity (recall) */
  sensitivity: number;

  /** Positive predictive value (precision) */
  ppv: number;

  /** F1 score */
  f1Score: number;

  /** Mean timing error (ms) */
  meanTimingError: number;

  /** Std of timing error (ms) */
  stdTimingError: number;
}

/**
 * Interval measurement validation result
 */
export interface IntervalValidationResult {
  /** Interval name */
  interval: string;

  /** Reference value (ms) */
  referenceValue: number;

  /** Measured value (ms) */
  measuredValue: number;

  /** Absolute error (ms) */
  absoluteError: number;

  /** Relative error (%) */
  relativeError: number;

  /** Within acceptable tolerance */
  withinTolerance: boolean;
}

/**
 * Complete validation result
 */
export interface ValidationResult {
  /** Reference ECG ID */
  referenceId: string;

  /** Validation timestamp */
  timestamp: string;

  /** Overall pass/fail */
  passed: boolean;

  /** Overall score (0-100) */
  overallScore: number;

  /** Per-lead results */
  leadResults: Partial<Record<LeadName, LeadValidationResult>>;

  /** Beat detection results */
  beatDetection?: BeatDetectionResult;

  /** Interval validation results */
  intervalResults: IntervalValidationResult[];

  /** Rhythm classification match */
  rhythmMatch?: {
    reference: string;
    detected: string;
    match: boolean;
  };

  /** Diagnosis classification match */
  diagnosisMatch?: {
    reference: string[];
    detected: string[];
    matchedCount: number;
    totalReference: number;
    accuracy: number;
  };

  /** Summary */
  summary: string[];

  /** Detailed issues */
  issues: string[];
}

/**
 * Batch validation result
 */
export interface BatchValidationResult {
  /** Total records validated */
  totalRecords: number;

  /** Records passed */
  passedRecords: number;

  /** Pass rate */
  passRate: number;

  /** Average overall score */
  averageScore: number;

  /** Average RMSE across all leads */
  averageRMSE: number;

  /** Average correlation */
  averageCorrelation: number;

  /** Beat detection summary */
  beatDetectionSummary?: {
    averageSensitivity: number;
    averagePPV: number;
    averageF1: number;
  };

  /** Individual results */
  results: ValidationResult[];

  /** Common issues */
  commonIssues: { issue: string; count: number }[];
}

/**
 * Validation thresholds
 */
export interface ValidationThresholds {
  /** Maximum acceptable NRMSE (default: 10%) */
  maxNRMSE?: number;

  /** Minimum acceptable correlation (default: 0.9) */
  minCorrelation?: number;

  /** Maximum interval error (ms) (default: 20ms) */
  maxIntervalError?: number;

  /** Beat timing tolerance (ms) (default: 50ms) */
  beatTimingTolerance?: number;

  /** Minimum beat detection sensitivity (default: 0.95) */
  minBeatSensitivity?: number;

  /** Minimum overall score to pass (default: 70) */
  minPassScore?: number;
}

const DEFAULT_THRESHOLDS: Required<ValidationThresholds> = {
  maxNRMSE: 10,
  minCorrelation: 0.9,
  maxIntervalError: 20,
  beatTimingTolerance: 50,
  minBeatSensitivity: 0.95,
  minPassScore: 70,
};

/**
 * Ground Truth Validator
 */
export class GroundTruthValidator {
  private thresholds: Required<ValidationThresholds>;

  constructor(thresholds?: ValidationThresholds) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Validate digitized ECG against reference
   */
  validate(
    digitized: {
      leads: Partial<Record<LeadName, number[]>>;
      sampleRate: number;
      annotations?: ReferenceAnnotation;
    },
    reference: ReferenceECG
  ): ValidationResult {
    const timestamp = new Date().toISOString();
    const issues: string[] = [];
    const summary: string[] = [];

    // Validate sample rates match (or resample)
    if (digitized.sampleRate !== reference.sampleRate) {
      issues.push(`Sample rate mismatch: ${digitized.sampleRate} vs ${reference.sampleRate}`);
    }

    // Validate each lead
    const leadResults: Partial<Record<LeadName, LeadValidationResult>> = {};
    const commonLeads = Object.keys(digitized.leads).filter(
      l => reference.leads[l as LeadName]
    ) as LeadName[];

    for (const lead of commonLeads) {
      const digLead = digitized.leads[lead]!;
      const refLead = reference.leads[lead]!;

      leadResults[lead] = this.validateLead(lead, digLead, refLead, reference.sampleRate);
    }

    // Beat detection validation
    let beatDetection: BeatDetectionResult | undefined;
    if (reference.annotations.beatPositions && digitized.annotations?.beatPositions) {
      beatDetection = this.validateBeatDetection(
        digitized.annotations.beatPositions,
        reference.annotations.beatPositions,
        reference.sampleRate
      );
    }

    // Interval validation
    const intervalResults: IntervalValidationResult[] = [];
    if (reference.annotations.intervals && digitized.annotations?.intervals) {
      for (const [name, refValue] of Object.entries(reference.annotations.intervals)) {
        const measuredValue = digitized.annotations.intervals[name as keyof typeof digitized.annotations.intervals];
        if (refValue !== undefined && measuredValue !== undefined) {
          intervalResults.push(this.validateInterval(name, measuredValue, refValue));
        }
      }
    }

    // Rhythm match
    let rhythmMatch: ValidationResult['rhythmMatch'];
    if (reference.annotations.rhythm) {
      const detectedRhythm = digitized.annotations?.rhythm || 'unknown';
      rhythmMatch = {
        reference: reference.annotations.rhythm,
        detected: detectedRhythm,
        match: this.rhythmsMatch(detectedRhythm, reference.annotations.rhythm),
      };
    }

    // Calculate overall score
    const overallScore = this.calculateOverallScore(
      leadResults,
      beatDetection,
      intervalResults,
      rhythmMatch
    );

    const passed = overallScore >= this.thresholds.minPassScore;

    // Generate summary
    const avgCorr = this.averageCorrelation(leadResults);
    const avgRMSE = this.averageRMSE(leadResults);
    summary.push(`Overall Score: ${overallScore.toFixed(1)}/100`);
    summary.push(`Average Correlation: ${avgCorr.toFixed(3)}`);
    summary.push(`Average RMSE: ${avgRMSE.toFixed(1)} µV`);
    if (beatDetection) {
      summary.push(`Beat Detection F1: ${(beatDetection.f1Score * 100).toFixed(1)}%`);
    }
    summary.push(passed ? 'PASSED' : 'FAILED');

    return {
      referenceId: reference.id,
      timestamp,
      passed,
      overallScore,
      leadResults,
      beatDetection,
      intervalResults,
      rhythmMatch,
      summary,
      issues,
    };
  }

  /**
   * Validate single lead
   */
  private validateLead(
    lead: LeadName,
    digitized: number[],
    reference: number[],
    _sampleRate: number
  ): LeadValidationResult {
    // Align signals (handle different lengths)
    const minLength = Math.min(digitized.length, reference.length);
    const digAligned = digitized.slice(0, minLength);
    const refAligned = reference.slice(0, minLength);

    // Calculate RMSE
    let sumSquaredError = 0;
    for (let i = 0; i < minLength; i++) {
      sumSquaredError += Math.pow(digAligned[i] - refAligned[i], 2);
    }
    const rmse = Math.sqrt(sumSquaredError / minLength);

    // Calculate NRMSE (normalized by signal range)
    const refRange = Math.max(...refAligned) - Math.min(...refAligned);
    const nrmse = refRange > 0 ? (rmse / refRange) * 100 : 0;

    // Calculate correlation
    const correlation = this.calculateCorrelation(digAligned, refAligned);

    // Calculate PRD
    const prd = this.calculatePRD(digAligned, refAligned);

    // Calculate SNR
    const snr = this.calculateSNR(digAligned, refAligned);

    // Determine quality
    let quality: LeadValidationResult['quality'] = 'failed';
    if (correlation >= 0.98 && nrmse < 5) quality = 'excellent';
    else if (correlation >= 0.95 && nrmse < 10) quality = 'good';
    else if (correlation >= 0.90 && nrmse < 15) quality = 'acceptable';
    else if (correlation >= 0.80) quality = 'poor';

    return {
      lead,
      rmse,
      nrmse,
      correlation,
      prd,
      snr,
      sampleCount: minLength,
      quality,
    };
  }

  /**
   * Validate beat detection
   */
  private validateBeatDetection(
    detected: number[],
    reference: number[],
    sampleRate: number
  ): BeatDetectionResult {
    const toleranceSamples = Math.floor(
      (this.thresholds.beatTimingTolerance / 1000) * sampleRate
    );

    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    const timingErrors: number[] = [];

    const matchedRef = new Set<number>();

    // Match detected beats to reference beats
    for (const detBeat of detected) {
      let bestMatch = -1;
      let bestDistance = Infinity;

      for (let i = 0; i < reference.length; i++) {
        if (matchedRef.has(i)) continue;

        const distance = Math.abs(detBeat - reference[i]);
        if (distance <= toleranceSamples && distance < bestDistance) {
          bestMatch = i;
          bestDistance = distance;
        }
      }

      if (bestMatch >= 0) {
        truePositives++;
        matchedRef.add(bestMatch);
        timingErrors.push((bestDistance / sampleRate) * 1000); // ms
      } else {
        falsePositives++;
      }
    }

    falseNegatives = reference.length - truePositives;

    const sensitivity = truePositives / (truePositives + falseNegatives) || 0;
    const ppv = truePositives / (truePositives + falsePositives) || 0;
    const f1Score = 2 * (sensitivity * ppv) / (sensitivity + ppv) || 0;

    const meanTimingError = timingErrors.length > 0
      ? timingErrors.reduce((a, b) => a + b, 0) / timingErrors.length
      : 0;

    const stdTimingError = timingErrors.length > 1
      ? Math.sqrt(
          timingErrors.reduce((sum, e) => sum + Math.pow(e - meanTimingError, 2), 0) /
          (timingErrors.length - 1)
        )
      : 0;

    return {
      truePositives,
      falsePositives,
      falseNegatives,
      sensitivity,
      ppv,
      f1Score,
      meanTimingError,
      stdTimingError,
    };
  }

  /**
   * Validate interval measurement
   */
  private validateInterval(
    name: string,
    measured: number,
    reference: number
  ): IntervalValidationResult {
    const absoluteError = Math.abs(measured - reference);
    const relativeError = (absoluteError / reference) * 100;
    const withinTolerance = absoluteError <= this.thresholds.maxIntervalError;

    return {
      interval: name,
      referenceValue: reference,
      measuredValue: measured,
      absoluteError,
      relativeError,
      withinTolerance,
    };
  }

  /**
   * Check if rhythms match (with normalization)
   */
  private rhythmsMatch(detected: string, reference: string): boolean {
    const normalize = (s: string) => s.toLowerCase()
      .replace(/[^a-z]/g, '')
      .replace('sinusrhythm', 'nsr')
      .replace('normalsinusrhythm', 'nsr')
      .replace('atrialfibrillation', 'afib')
      .replace('ventricularfibrillation', 'vfib');

    return normalize(detected) === normalize(reference);
  }

  /**
   * Calculate correlation coefficient
   */
  private calculateCorrelation(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length);
    if (n === 0) return 0;

    const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
    const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n;

    let numerator = 0;
    let denomA = 0;
    let denomB = 0;

    for (let i = 0; i < n; i++) {
      const diffA = a[i] - meanA;
      const diffB = b[i] - meanB;
      numerator += diffA * diffB;
      denomA += diffA * diffA;
      denomB += diffB * diffB;
    }

    const denom = Math.sqrt(denomA * denomB);
    return denom === 0 ? 0 : numerator / denom;
  }

  /**
   * Calculate PRD (Percent Root-mean-square Difference)
   */
  private calculatePRD(digitized: number[], reference: number[]): number {
    const n = Math.min(digitized.length, reference.length);
    if (n === 0) return 100;

    let sumSquaredError = 0;
    let sumSquaredRef = 0;

    for (let i = 0; i < n; i++) {
      sumSquaredError += Math.pow(digitized[i] - reference[i], 2);
      sumSquaredRef += Math.pow(reference[i], 2);
    }

    return sumSquaredRef === 0 ? 100 : 100 * Math.sqrt(sumSquaredError / sumSquaredRef);
  }

  /**
   * Calculate SNR
   */
  private calculateSNR(digitized: number[], reference: number[]): number {
    const n = Math.min(digitized.length, reference.length);
    if (n === 0) return 0;

    let signalPower = 0;
    let noisePower = 0;

    for (let i = 0; i < n; i++) {
      signalPower += reference[i] * reference[i];
      noisePower += Math.pow(digitized[i] - reference[i], 2);
    }

    if (noisePower === 0) return 60; // Perfect match
    return 10 * Math.log10(signalPower / noisePower);
  }

  /**
   * Calculate overall score
   */
  private calculateOverallScore(
    leadResults: Partial<Record<LeadName, LeadValidationResult>>,
    beatDetection: BeatDetectionResult | undefined,
    intervalResults: IntervalValidationResult[],
    rhythmMatch: ValidationResult['rhythmMatch']
  ): number {
    let score = 0;
    let weights = 0;

    // Lead signal quality (50% weight)
    const leads = Object.values(leadResults);
    if (leads.length > 0) {
      const avgCorr = leads.reduce((s, l) => s + l.correlation, 0) / leads.length;
      const corrScore = Math.max(0, (avgCorr - 0.5) * 200); // 0.5 -> 0, 1.0 -> 100
      score += corrScore * 0.5;
      weights += 0.5;
    }

    // Beat detection (25% weight)
    if (beatDetection) {
      const beatScore = beatDetection.f1Score * 100;
      score += beatScore * 0.25;
      weights += 0.25;
    }

    // Interval accuracy (15% weight)
    if (intervalResults.length > 0) {
      const intervalsWithinTol = intervalResults.filter(i => i.withinTolerance).length;
      const intervalScore = (intervalsWithinTol / intervalResults.length) * 100;
      score += intervalScore * 0.15;
      weights += 0.15;
    }

    // Rhythm match (10% weight)
    if (rhythmMatch) {
      const rhythmScore = rhythmMatch.match ? 100 : 0;
      score += rhythmScore * 0.1;
      weights += 0.1;
    }

    return weights > 0 ? score / weights : 0;
  }

  /**
   * Average correlation across leads
   */
  private averageCorrelation(
    leadResults: Partial<Record<LeadName, LeadValidationResult>>
  ): number {
    const leads = Object.values(leadResults);
    if (leads.length === 0) return 0;
    return leads.reduce((s, l) => s + l.correlation, 0) / leads.length;
  }

  /**
   * Average RMSE across leads
   */
  private averageRMSE(
    leadResults: Partial<Record<LeadName, LeadValidationResult>>
  ): number {
    const leads = Object.values(leadResults);
    if (leads.length === 0) return 0;
    return leads.reduce((s, l) => s + l.rmse, 0) / leads.length;
  }

  /**
   * Batch validate multiple ECGs
   */
  batchValidate(
    digitizedECGs: Array<{
      leads: Partial<Record<LeadName, number[]>>;
      sampleRate: number;
      annotations?: ReferenceAnnotation;
    }>,
    referenceECGs: ReferenceECG[]
  ): BatchValidationResult {
    if (digitizedECGs.length !== referenceECGs.length) {
      throw new Error('Digitized and reference ECG arrays must have same length');
    }

    const results: ValidationResult[] = [];
    const issueCounts: Record<string, number> = {};

    for (let i = 0; i < digitizedECGs.length; i++) {
      const result = this.validate(digitizedECGs[i], referenceECGs[i]);
      results.push(result);

      // Count issues
      for (const issue of result.issues) {
        issueCounts[issue] = (issueCounts[issue] || 0) + 1;
      }
    }

    const passedRecords = results.filter(r => r.passed).length;
    const averageScore = results.reduce((s, r) => s + r.overallScore, 0) / results.length;

    // Calculate aggregate metrics
    let totalRMSE = 0;
    let totalCorr = 0;
    let leadCount = 0;

    for (const result of results) {
      for (const leadResult of Object.values(result.leadResults)) {
        totalRMSE += leadResult.rmse;
        totalCorr += leadResult.correlation;
        leadCount++;
      }
    }

    // Beat detection summary
    let beatDetectionSummary: BatchValidationResult['beatDetectionSummary'];
    const beatResults = results.filter(r => r.beatDetection).map(r => r.beatDetection!);
    if (beatResults.length > 0) {
      beatDetectionSummary = {
        averageSensitivity: beatResults.reduce((s, b) => s + b.sensitivity, 0) / beatResults.length,
        averagePPV: beatResults.reduce((s, b) => s + b.ppv, 0) / beatResults.length,
        averageF1: beatResults.reduce((s, b) => s + b.f1Score, 0) / beatResults.length,
      };
    }

    // Sort issues by frequency
    const commonIssues = Object.entries(issueCounts)
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalRecords: results.length,
      passedRecords,
      passRate: passedRecords / results.length,
      averageScore,
      averageRMSE: leadCount > 0 ? totalRMSE / leadCount : 0,
      averageCorrelation: leadCount > 0 ? totalCorr / leadCount : 0,
      beatDetectionSummary,
      results,
      commonIssues,
    };
  }
}

/**
 * Convenience function to validate ECG
 */
export function validateAgainstReference(
  digitized: {
    leads: Partial<Record<LeadName, number[]>>;
    sampleRate: number;
    annotations?: ReferenceAnnotation;
  },
  reference: ReferenceECG,
  thresholds?: ValidationThresholds
): ValidationResult {
  const validator = new GroundTruthValidator(thresholds);
  return validator.validate(digitized, reference);
}

/**
 * Calculate signal similarity metrics
 */
export function calculateSimilarity(
  signal1: number[],
  signal2: number[]
): {
  rmse: number;
  correlation: number;
  prd: number;
  snr: number;
} {
  const n = Math.min(signal1.length, signal2.length);
  if (n === 0) {
    return { rmse: 0, correlation: 0, prd: 100, snr: 0 };
  }

  // RMSE
  let sumSquaredError = 0;
  let sumSquaredRef = 0;
  for (let i = 0; i < n; i++) {
    sumSquaredError += Math.pow(signal1[i] - signal2[i], 2);
    sumSquaredRef += Math.pow(signal2[i], 2);
  }
  const rmse = Math.sqrt(sumSquaredError / n);

  // Correlation
  const mean1 = signal1.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const mean2 = signal2.slice(0, n).reduce((s, v) => s + v, 0) / n;

  let numerator = 0;
  let denom1 = 0;
  let denom2 = 0;

  for (let i = 0; i < n; i++) {
    const diff1 = signal1[i] - mean1;
    const diff2 = signal2[i] - mean2;
    numerator += diff1 * diff2;
    denom1 += diff1 * diff1;
    denom2 += diff2 * diff2;
  }

  const correlation = Math.sqrt(denom1 * denom2) === 0 ? 0 : numerator / Math.sqrt(denom1 * denom2);

  // PRD
  const prd = sumSquaredRef === 0 ? 100 : 100 * Math.sqrt(sumSquaredError / sumSquaredRef);

  // SNR
  let signalPower = 0;
  for (let i = 0; i < n; i++) {
    signalPower += signal2[i] * signal2[i];
  }
  const noisePower = sumSquaredError;
  const snr = noisePower === 0 ? 60 : 10 * Math.log10(signalPower / noisePower);

  return { rmse, correlation, prd, snr };
}
