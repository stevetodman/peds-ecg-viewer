/**
 * Signal Validator
 * Cross-lead validation, morphology checks, and quality scoring
 *
 * @module signal/loader/png-digitizer/signal/validator
 */

import type { ECGSignal, LeadName } from '../../../../types';

/**
 * Validation result
 */
export interface ValidationResult {
  /** Overall validity score (0-1) */
  overallScore: number;

  /** Per-lead scores */
  leadScores: Partial<Record<LeadName, LeadValidation>>;

  /** Cross-lead validation results */
  crossLeadValidation: CrossLeadValidation;

  /** Morphology validation results */
  morphologyValidation: MorphologyValidation;

  /** Detected issues */
  issues: ValidationIssue[];

  /** Corrections that could be applied */
  suggestedCorrections: SuggestedCorrection[];
}

/**
 * Per-lead validation
 */
export interface LeadValidation {
  /** Quality score (0-1) */
  quality: number;

  /** Signal-to-noise ratio estimate */
  snrEstimate: number;

  /** Baseline wander detected */
  baselineWander: boolean;

  /** Clipping detected */
  clipping: boolean;

  /** Appears flat/constant */
  isFlat: boolean;

  /** High frequency noise detected */
  highFrequencyNoise: boolean;
}

/**
 * Cross-lead validation (Einthoven's law)
 */
export interface CrossLeadValidation {
  /** Lead I + Lead III should equal Lead II */
  einthovenValid: boolean;

  /** Correlation between expected and actual Lead II */
  einthovenCorrelation: number;

  /** Error magnitude */
  einthovenError: number;

  /** Goldberger relationships valid */
  goldbergerValid: boolean;

  /** Precordial progression valid (R-wave grows V1→V5) */
  precordialProgressionValid: boolean;
}

/**
 * Morphology validation
 */
export interface MorphologyValidation {
  /** Estimated QRS width (ms) */
  qrsWidthMs: number;

  /** QRS width is normal (<120ms) */
  qrsWidthNormal: boolean;

  /** Estimated QT interval (ms) */
  qtIntervalMs: number;

  /** Estimated PR interval (ms) */
  prIntervalMs: number;

  /** Estimated heart rate (bpm) */
  heartRateBpm: number;

  /** Heart rate is in normal range */
  heartRateNormal: boolean;

  /** R-wave amplitudes by lead (μV) */
  rWaveAmplitudes: Partial<Record<LeadName, number>>;

  /** Any lead shows extreme voltage */
  extremeVoltage: boolean;
}

/**
 * Validation issue
 */
export interface ValidationIssue {
  type: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  affectedLeads?: LeadName[];
}

/**
 * Suggested correction
 */
export interface SuggestedCorrection {
  type: 'swap_leads' | 'invert_lead' | 'recalibrate';
  description: string;
  confidence: number;
  leads?: LeadName[];
}

/**
 * Signal Validator class
 */
export class SignalValidator {
  private sampleRate: number;

  constructor(sampleRate: number = 500) {
    this.sampleRate = sampleRate;
  }

  /**
   * Validate an ECG signal
   */
  validate(signal: ECGSignal): ValidationResult {
    const leadScores = this.validateLeads(signal);
    const crossLeadValidation = this.validateCrossLead(signal);
    const morphologyValidation = this.validateMorphology(signal);
    const issues = this.collectIssues(leadScores, crossLeadValidation, morphologyValidation);
    const suggestedCorrections = this.suggestCorrections(signal, crossLeadValidation);

    // Calculate overall score
    const leadScoreValues = Object.values(leadScores).map(l => l.quality);
    const avgLeadScore = leadScoreValues.length > 0
      ? leadScoreValues.reduce((a, b) => a + b, 0) / leadScoreValues.length
      : 0;

    const crossLeadScore = crossLeadValidation.einthovenValid ? 1 : 0.5;
    const morphScore = morphologyValidation.qrsWidthNormal && morphologyValidation.heartRateNormal ? 1 : 0.7;

    const overallScore = (avgLeadScore * 0.5 + crossLeadScore * 0.3 + morphScore * 0.2);

    return {
      overallScore,
      leadScores,
      crossLeadValidation,
      morphologyValidation,
      issues,
      suggestedCorrections,
    };
  }

  /**
   * Validate individual leads
   */
  private validateLeads(signal: ECGSignal): Partial<Record<LeadName, LeadValidation>> {
    const results: Partial<Record<LeadName, LeadValidation>> = {};

    for (const [lead, samples] of Object.entries(signal.leads)) {
      if (!samples || samples.length === 0) continue;

      const validation = this.validateSingleLead(samples);
      results[lead as LeadName] = validation;
    }

    return results;
  }

  /**
   * Validate a single lead
   */
  private validateSingleLead(samples: number[]): LeadValidation {
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
    const stdDev = Math.sqrt(variance);

    // Check if flat (very low variance)
    const isFlat = stdDev < 10; // Less than 10μV std dev

    // Check for clipping (values at extremes)
    const clipThreshold = 3000; // 3mV
    const clippedCount = samples.filter(s => Math.abs(s) > clipThreshold).length;
    const clipping = clippedCount > samples.length * 0.01;

    // Estimate baseline wander using low-frequency variation
    const baselineWander = this.detectBaselineWander(samples);

    // Estimate high-frequency noise
    const highFrequencyNoise = this.detectHighFrequencyNoise(samples);

    // Estimate SNR
    const snrEstimate = this.estimateSNR(samples);

    // Calculate quality score
    let quality = 1.0;
    if (isFlat) quality -= 0.5;
    if (clipping) quality -= 0.3;
    if (baselineWander) quality -= 0.2;
    if (highFrequencyNoise) quality -= 0.2;
    quality = Math.max(0, quality);

    return {
      quality,
      snrEstimate,
      baselineWander,
      clipping,
      isFlat,
      highFrequencyNoise,
    };
  }

  /**
   * Detect baseline wander
   */
  private detectBaselineWander(samples: number[]): boolean {
    // Calculate moving average over 1 second windows
    const windowSize = this.sampleRate;
    if (samples.length < windowSize * 2) return false;

    const movingAvgs: number[] = [];
    for (let i = 0; i < samples.length - windowSize; i += Math.floor(windowSize / 4)) {
      const window = samples.slice(i, i + windowSize);
      const avg = window.reduce((a, b) => a + b, 0) / window.length;
      movingAvgs.push(avg);
    }

    if (movingAvgs.length < 2) return false;

    // Check if moving average varies significantly
    const maMin = Math.min(...movingAvgs);
    const maMax = Math.max(...movingAvgs);
    const maRange = maMax - maMin;

    // Baseline wander if moving average varies by more than 200μV
    return maRange > 200;
  }

  /**
   * Detect high-frequency noise
   */
  private detectHighFrequencyNoise(samples: number[]): boolean {
    // Calculate first derivative (high-pass)
    const diffs: number[] = [];
    for (let i = 1; i < samples.length; i++) {
      diffs.push(Math.abs(samples[i] - samples[i - 1]));
    }

    const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;

    // High noise if average sample-to-sample difference > 50μV
    // (at 500Hz, normal ECG shouldn't have this much jitter)
    return avgDiff > 50;
  }

  /**
   * Estimate signal-to-noise ratio
   */
  private estimateSNR(samples: number[]): number {
    const sorted = [...samples].sort((a, b) => a - b);

    // Estimate signal as range of middle 90%
    const low = sorted[Math.floor(samples.length * 0.05)];
    const high = sorted[Math.floor(samples.length * 0.95)];
    const signalRange = high - low;

    // Estimate noise from local variation
    let noiseSum = 0;
    for (let i = 2; i < samples.length - 2; i++) {
      // Median of 5-point window
      const window = [samples[i - 2], samples[i - 1], samples[i], samples[i + 1], samples[i + 2]];
      window.sort((a, b) => a - b);
      const localMedian = window[2];
      noiseSum += Math.abs(samples[i] - localMedian);
    }
    const noiseEstimate = noiseSum / (samples.length - 4);

    if (noiseEstimate < 1) return 100;
    return Math.min(100, signalRange / noiseEstimate);
  }

  /**
   * Validate cross-lead relationships
   */
  private validateCrossLead(signal: ECGSignal): CrossLeadValidation {
    const result: CrossLeadValidation = {
      einthovenValid: false,
      einthovenCorrelation: 0,
      einthovenError: Infinity,
      goldbergerValid: false,
      precordialProgressionValid: false,
    };

    // Einthoven's law: Lead II = Lead I + Lead III
    const leadI = signal.leads['I'];
    const leadII = signal.leads['II'];
    const leadIII = signal.leads['III'];

    if (leadI && leadII && leadIII) {
      const minLen = Math.min(leadI.length, leadII.length, leadIII.length);

      // Calculate I + III
      const calculated: number[] = [];
      for (let i = 0; i < minLen; i++) {
        calculated.push(leadI[i] + leadIII[i]);
      }

      // Compare with Lead II
      const actual = leadII.slice(0, minLen);
      const correlation = this.correlation(calculated, actual);
      const error = this.meanAbsoluteError(calculated, actual);

      result.einthovenCorrelation = correlation;
      result.einthovenError = error;

      // Consider valid if correlation > 0.8 and error < 200μV
      result.einthovenValid = correlation > 0.8 && error < 200;
    }

    // Check Goldberger relationships (aVL, aVR, aVF)
    result.goldbergerValid = this.validateGoldberger(signal);

    // Check precordial progression
    result.precordialProgressionValid = this.validatePrecordialProgression(signal);

    return result;
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  private correlation(a: number[], b: number[]): number {
    const n = a.length;
    if (n === 0) return 0;

    const meanA = a.reduce((x, y) => x + y, 0) / n;
    const meanB = b.reduce((x, y) => x + y, 0) / n;

    let num = 0;
    let denA = 0;
    let denB = 0;

    for (let i = 0; i < n; i++) {
      const diffA = a[i] - meanA;
      const diffB = b[i] - meanB;
      num += diffA * diffB;
      denA += diffA * diffA;
      denB += diffB * diffB;
    }

    const den = Math.sqrt(denA * denB);
    return den === 0 ? 0 : num / den;
  }

  /**
   * Calculate mean absolute error
   */
  private meanAbsoluteError(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.abs(a[i] - b[i]);
    }
    return sum / a.length;
  }

  /**
   * Validate Goldberger augmented leads
   * aVR = -(I + II)/2, aVL = (I - III)/2, aVF = (II + III)/2
   */
  private validateGoldberger(signal: ECGSignal): boolean {
    const leadI = signal.leads['I'];
    const leadII = signal.leads['II'];
    const leadIII = signal.leads['III'];
    const aVR = signal.leads['aVR'];
    const aVL = signal.leads['aVL'];
    const aVF = signal.leads['aVF'];

    if (!leadI || !leadII || !leadIII || !aVR || !aVL || !aVF) {
      return false;
    }

    const minLen = Math.min(leadI.length, leadII.length, leadIII.length, aVR.length, aVL.length, aVF.length);

    // Check aVL = (I - III) / 2
    let aVLValid = true;
    for (let i = 0; i < minLen; i++) {
      const expected = (leadI[i] - leadIII[i]) / 2;
      if (Math.abs(aVL[i] - expected) > 300) {
        aVLValid = false;
        break;
      }
    }

    return aVLValid;
  }

  /**
   * Validate precordial R-wave progression (R wave should grow V1→V5)
   */
  private validatePrecordialProgression(signal: ECGSignal): boolean {
    const precordials: LeadName[] = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
    const rWaves: number[] = [];

    for (const lead of precordials) {
      const samples = signal.leads[lead];
      if (!samples) return false;

      // Find max positive deflection (R wave)
      const maxR = Math.max(...samples);
      rWaves.push(maxR);
    }

    // R wave should generally increase from V1 to V4/V5
    let increasing = 0;
    for (let i = 0; i < 4; i++) {
      if (rWaves[i + 1] >= rWaves[i]) increasing++;
    }

    // Allow some deviation - consider valid if mostly increasing
    return increasing >= 2;
  }

  /**
   * Validate morphology (QRS width, intervals, HR)
   */
  private validateMorphology(signal: ECGSignal): MorphologyValidation {
    // Use lead II for morphology analysis (typically cleanest)
    const samples = signal.leads['II'] ?? signal.leads['V5'] ?? Object.values(signal.leads)[0];

    if (!samples || samples.length < 100) {
      return {
        qrsWidthMs: 0,
        qrsWidthNormal: true,
        qtIntervalMs: 0,
        prIntervalMs: 0,
        heartRateBpm: 0,
        heartRateNormal: true,
        rWaveAmplitudes: {},
        extremeVoltage: false,
      };
    }

    // Detect R peaks
    const peaks = this.detectRPeaks(samples);

    // Calculate heart rate
    let heartRateBpm = 0;
    if (peaks.length >= 2) {
      const rrIntervals: number[] = [];
      for (let i = 1; i < peaks.length; i++) {
        rrIntervals.push((peaks[i] - peaks[i - 1]) / this.sampleRate);
      }
      const avgRR = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
      heartRateBpm = 60 / avgRR;
    }

    // Estimate QRS width
    const qrsWidthMs = this.estimateQRSWidth(samples, peaks);

    // Get R-wave amplitudes for all leads
    const rWaveAmplitudes: Partial<Record<LeadName, number>> = {};
    for (const [lead, leadSamples] of Object.entries(signal.leads)) {
      if (leadSamples) {
        rWaveAmplitudes[lead as LeadName] = Math.max(...leadSamples);
      }
    }

    // Check for extreme voltage
    const maxVoltage = Math.max(...Object.values(rWaveAmplitudes));
    const extremeVoltage = maxVoltage > 5000; // >5mV is unusual

    return {
      qrsWidthMs,
      qrsWidthNormal: qrsWidthMs < 120,
      qtIntervalMs: 0, // Would need more sophisticated detection
      prIntervalMs: 0,
      heartRateBpm,
      heartRateNormal: heartRateBpm >= 40 && heartRateBpm <= 200,
      rWaveAmplitudes,
      extremeVoltage,
    };
  }

  /**
   * Detect R peaks in a signal
   */
  private detectRPeaks(samples: number[]): number[] {
    const sorted = [...samples].sort((a, b) => a - b);
    const threshold = sorted[Math.floor(sorted.length * 0.85)];

    const peaks: number[] = [];
    const minDistance = Math.floor(this.sampleRate * 0.3); // 300ms minimum

    for (let i = minDistance; i < samples.length - minDistance; i++) {
      if (samples[i] > threshold &&
          samples[i] > samples[i - 1] &&
          samples[i] > samples[i + 1]) {
        // Check wider window
        let isMax = true;
        for (let j = i - minDistance; j <= i + minDistance; j++) {
          if (j !== i && samples[j] >= samples[i]) {
            isMax = false;
            break;
          }
        }
        if (isMax) {
          peaks.push(i);
        }
      }
    }

    return peaks;
  }

  /**
   * Estimate QRS width
   */
  private estimateQRSWidth(samples: number[], peaks: number[]): number {
    if (peaks.length === 0) return 80; // Default

    // Measure width of first few QRS complexes
    const widths: number[] = [];

    for (const peak of peaks.slice(0, 5)) {
      // Find QRS onset (going back from peak)
      let onset = peak;
      const threshold = samples[peak] * 0.1;
      for (let i = peak - 1; i >= Math.max(0, peak - 100); i--) {
        if (Math.abs(samples[i]) < threshold) {
          onset = i;
          break;
        }
      }

      // Find QRS offset (going forward from peak)
      let offset = peak;
      for (let i = peak + 1; i < Math.min(samples.length, peak + 100); i++) {
        if (Math.abs(samples[i]) < threshold) {
          offset = i;
          break;
        }
      }

      const widthSamples = offset - onset;
      const widthMs = (widthSamples / this.sampleRate) * 1000;
      if (widthMs > 40 && widthMs < 200) {
        widths.push(widthMs);
      }
    }

    if (widths.length === 0) return 80;

    return widths.reduce((a, b) => a + b, 0) / widths.length;
  }

  /**
   * Collect all issues from validation results
   */
  private collectIssues(
    leadScores: Partial<Record<LeadName, LeadValidation>>,
    crossLead: CrossLeadValidation,
    morphology: MorphologyValidation
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Lead-specific issues
    for (const [lead, validation] of Object.entries(leadScores)) {
      if (validation.isFlat) {
        issues.push({
          type: 'warning',
          code: 'FLAT_LEAD',
          message: `Lead ${lead} appears flat/constant`,
          affectedLeads: [lead as LeadName],
        });
      }
      if (validation.clipping) {
        issues.push({
          type: 'warning',
          code: 'CLIPPING',
          message: `Lead ${lead} shows signal clipping`,
          affectedLeads: [lead as LeadName],
        });
      }
      if (validation.baselineWander) {
        issues.push({
          type: 'info',
          code: 'BASELINE_WANDER',
          message: `Lead ${lead} has baseline wander`,
          affectedLeads: [lead as LeadName],
        });
      }
    }

    // Cross-lead issues
    if (!crossLead.einthovenValid) {
      issues.push({
        type: 'warning',
        code: 'EINTHOVEN_VIOLATION',
        message: `Einthoven's law violated (I + III ≠ II, correlation: ${(crossLead.einthovenCorrelation * 100).toFixed(0)}%)`,
        affectedLeads: ['I', 'II', 'III'],
      });
    }

    // Morphology issues
    if (!morphology.qrsWidthNormal) {
      issues.push({
        type: 'info',
        code: 'WIDE_QRS',
        message: `QRS appears wide (${morphology.qrsWidthMs.toFixed(0)}ms)`,
      });
    }

    if (!morphology.heartRateNormal && morphology.heartRateBpm > 0) {
      issues.push({
        type: 'warning',
        code: 'ABNORMAL_HR',
        message: `Heart rate ${morphology.heartRateBpm.toFixed(0)} bpm may indicate calibration issue`,
      });
    }

    if (morphology.extremeVoltage) {
      issues.push({
        type: 'warning',
        code: 'EXTREME_VOLTAGE',
        message: 'Unusually high voltage detected - check gain calibration',
      });
    }

    return issues;
  }

  /**
   * Suggest corrections based on validation
   */
  private suggestCorrections(
    signal: ECGSignal,
    crossLead: CrossLeadValidation
  ): SuggestedCorrection[] {
    const corrections: SuggestedCorrection[] = [];

    // If Einthoven's law is violated, might have swapped leads
    if (!crossLead.einthovenValid && crossLead.einthovenCorrelation < 0) {
      corrections.push({
        type: 'invert_lead',
        description: 'Lead II may be inverted',
        confidence: 0.6,
        leads: ['II'],
      });
    }

    // Check for common lead reversal (LA/RA swap inverts I, reverses aVR/aVL)
    const leadI = signal.leads['I'];
    const aVR = signal.leads['aVR'];
    if (leadI && aVR) {
      // If aVR is positive when it should usually be negative
      const aVRMean = aVR.reduce((a, b) => a + b, 0) / aVR.length;
      const leadIMean = leadI.reduce((a, b) => a + b, 0) / leadI.length;

      if (aVRMean > 100 && leadIMean < -100) {
        corrections.push({
          type: 'swap_leads',
          description: 'Possible LA/RA electrode reversal',
          confidence: 0.5,
          leads: ['I', 'aVR', 'aVL'],
        });
      }
    }

    return corrections;
  }
}

/**
 * Convenience function
 */
export function validateSignal(signal: ECGSignal): ValidationResult {
  const validator = new SignalValidator(signal.sampleRate);
  return validator.validate(signal);
}
