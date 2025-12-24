/**
 * QRS-Based Calibration Validation
 * Validates and adjusts calibration settings using QRS complex characteristics
 *
 * @module signal/loader/png-digitizer/signal/qrs-calibration
 */

import type { ECGSignal, LeadName } from '../../../../types';
import type { CalibrationAnalysis, GridAnalysis } from '../types';

/**
 * QRS validation result
 */
export interface QRSValidationResult {
  /** Is calibration valid */
  isValid: boolean;

  /** Confidence in validation */
  confidence: number;

  /** Detected heart rate */
  heartRateBpm: number;

  /** Detected QRS width in ms */
  qrsWidthMs: number;

  /** Suggested calibration adjustment */
  suggestedCalibration: CalibrationAnalysis | null;

  /** Issues found */
  issues: string[];

  /** Debug info */
  debugInfo: {
    detectedQRSCount: number;
    avgRRInterval: number;
    qrsAmplitudeMv: number;
  };
}

/**
 * Normal physiological ranges
 */
const PHYSIOLOGICAL_RANGES = {
  // Heart rate (bpm)
  HR_MIN: 30,
  HR_MAX: 220,
  HR_NORMAL_MIN: 50,
  HR_NORMAL_MAX: 120,

  // QRS width (ms)
  QRS_MIN: 60,
  QRS_MAX: 200,
  QRS_NORMAL_MAX: 120,

  // QRS amplitude in leads (mV)
  QRS_AMPLITUDE_MIN: 0.3,
  QRS_AMPLITUDE_MAX: 4.0,
  QRS_AMPLITUDE_TYPICAL: 1.0,

  // PR interval (ms)
  PR_MIN: 120,
  PR_MAX: 200,

  // QT interval (ms)
  QT_MIN: 300,
  QT_MAX: 500,
};

/**
 * QRS calibration validator
 */
export class QRSCalibrationValidator {
  private sampleRate: number;

  constructor(sampleRate: number = 500) {
    this.sampleRate = sampleRate;
  }

  /**
   * Validate calibration using detected QRS characteristics
   */
  validate(
    signal: ECGSignal,
    calibration: CalibrationAnalysis,
    grid: GridAnalysis
  ): QRSValidationResult {
    const issues: string[] = [];

    // Detect QRS complexes in lead II (most reliable) or any available limb lead
    const analysisLead = this.selectAnalysisLead(signal);
    if (!analysisLead) {
      return this.createInvalidResult('No suitable leads for QRS analysis');
    }

    const samples = signal.leads[analysisLead];
    if (!samples) {
      return this.createInvalidResult('Lead samples not available');
    }
    const qrsDetection = this.detectQRSComplexes(samples);

    if (qrsDetection.positions.length < 2) {
      return this.createInvalidResult('Insufficient QRS complexes detected');
    }

    // Calculate heart rate from RR intervals
    const rrIntervals = this.calculateRRIntervals(qrsDetection.positions);
    const avgRRInterval = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
    const heartRateBpm = 60 / (avgRRInterval / this.sampleRate);

    // Calculate QRS width
    const qrsWidthSamples = qrsDetection.avgWidth;
    const qrsWidthMs = (qrsWidthSamples / this.sampleRate) * 1000;

    // Calculate QRS amplitude
    const qrsAmplitudeMv = this.calculateQRSAmplitude(samples, qrsDetection.positions);

    // Validate physiological plausibility
    let isValid = true;
    let confidence = 1.0;

    // Check heart rate
    if (heartRateBpm < PHYSIOLOGICAL_RANGES.HR_MIN || heartRateBpm > PHYSIOLOGICAL_RANGES.HR_MAX) {
      issues.push(`Heart rate ${heartRateBpm.toFixed(0)} bpm is outside physiological range`);
      isValid = false;
      confidence *= 0.5;
    } else if (heartRateBpm < PHYSIOLOGICAL_RANGES.HR_NORMAL_MIN || heartRateBpm > PHYSIOLOGICAL_RANGES.HR_NORMAL_MAX) {
      issues.push(`Heart rate ${heartRateBpm.toFixed(0)} bpm is unusual (may be valid)`);
      confidence *= 0.8;
    }

    // Check QRS width
    if (qrsWidthMs < PHYSIOLOGICAL_RANGES.QRS_MIN || qrsWidthMs > PHYSIOLOGICAL_RANGES.QRS_MAX) {
      issues.push(`QRS width ${qrsWidthMs.toFixed(0)}ms is outside normal range - possible calibration error`);
      isValid = false;
      confidence *= 0.5;
    } else if (qrsWidthMs > PHYSIOLOGICAL_RANGES.QRS_NORMAL_MAX) {
      issues.push(`Wide QRS complex ${qrsWidthMs.toFixed(0)}ms (may indicate bundle branch block)`);
      confidence *= 0.9;
    }

    // Check amplitude
    if (qrsAmplitudeMv < PHYSIOLOGICAL_RANGES.QRS_AMPLITUDE_MIN) {
      issues.push(`Low QRS amplitude ${qrsAmplitudeMv.toFixed(2)}mV - check gain setting`);
      confidence *= 0.7;
    } else if (qrsAmplitudeMv > PHYSIOLOGICAL_RANGES.QRS_AMPLITUDE_MAX) {
      issues.push(`High QRS amplitude ${qrsAmplitudeMv.toFixed(2)}mV - possible gain miscalibration`);
      isValid = false;
      confidence *= 0.5;
    }

    // Suggest calibration adjustment if needed
    let suggestedCalibration: CalibrationAnalysis | null = null;

    if (!isValid) {
      suggestedCalibration = this.suggestCalibrationAdjustment(
        calibration,
        grid,
        heartRateBpm,
        qrsWidthMs,
        qrsAmplitudeMv
      );
    }

    return {
      isValid,
      confidence,
      heartRateBpm,
      qrsWidthMs,
      suggestedCalibration,
      issues,
      debugInfo: {
        detectedQRSCount: qrsDetection.positions.length,
        avgRRInterval,
        qrsAmplitudeMv,
      },
    };
  }

  /**
   * Select best lead for analysis
   */
  private selectAnalysisLead(signal: ECGSignal): LeadName | null {
    // Prefer Lead II, then other limb leads
    const preference: LeadName[] = ['II', 'I', 'III', 'aVF', 'aVL', 'V1', 'V5'];

    for (const lead of preference) {
      if (signal.leads[lead] && signal.leads[lead].length > 100) {
        return lead;
      }
    }

    // Fall back to any available lead
    for (const lead of Object.keys(signal.leads) as LeadName[]) {
      if (signal.leads[lead] && signal.leads[lead].length > 100) {
        return lead;
      }
    }

    return null;
  }

  /**
   * Detect QRS complexes
   */
  private detectQRSComplexes(samples: number[]): {
    positions: number[];
    avgWidth: number;
  } {
    const positions: number[] = [];
    const widths: number[] = [];

    // Calculate threshold from signal statistics
    const absMax = Math.max(...samples.map(Math.abs));
    const threshold = absMax * 0.4;

    // Minimum distance between peaks (300ms at sampleRate)
    const minDistance = Math.floor(this.sampleRate * 0.3);

    let lastPeak = -minDistance;
    let i = 1;

    while (i < samples.length - 1) {
      // Look for peak (local maximum of absolute value)
      if (
        Math.abs(samples[i]) > threshold &&
        Math.abs(samples[i]) >= Math.abs(samples[i - 1]) &&
        Math.abs(samples[i]) >= Math.abs(samples[i + 1]) &&
        i - lastPeak >= minDistance
      ) {
        positions.push(i);
        lastPeak = i;

        // Measure QRS width
        const width = this.measureQRSWidth(samples, i, threshold * 0.2);
        widths.push(width);

        i += Math.floor(minDistance * 0.5); // Skip ahead
      }
      i++;
    }

    const avgWidth = widths.length > 0
      ? widths.reduce((a, b) => a + b, 0) / widths.length
      : 50; // Default 100ms at 500Hz

    return { positions, avgWidth };
  }

  /**
   * Measure QRS width around a peak
   */
  private measureQRSWidth(samples: number[], peakIdx: number, threshold: number): number {
    let start = peakIdx;
    let end = peakIdx;

    // Find start
    while (start > 0 && Math.abs(samples[start]) > threshold) {
      start--;
    }

    // Find end
    while (end < samples.length - 1 && Math.abs(samples[end]) > threshold) {
      end++;
    }

    return end - start;
  }

  /**
   * Calculate RR intervals
   */
  private calculateRRIntervals(positions: number[]): number[] {
    const intervals: number[] = [];
    for (let i = 1; i < positions.length; i++) {
      intervals.push(positions[i] - positions[i - 1]);
    }
    return intervals;
  }

  /**
   * Calculate QRS amplitude in mV
   */
  private calculateQRSAmplitude(samples: number[], positions: number[]): number {
    if (positions.length === 0) return 0;

    const amplitudes: number[] = [];
    for (const pos of positions) {
      // Find max and min around the peak
      const windowStart = Math.max(0, pos - 20);
      const windowEnd = Math.min(samples.length, pos + 20);
      const window = samples.slice(windowStart, windowEnd);

      const max = Math.max(...window);
      const min = Math.min(...window);
      amplitudes.push(max - min);
    }

    // Return median amplitude (in microvolts, convert to mV)
    amplitudes.sort((a, b) => a - b);
    return amplitudes[Math.floor(amplitudes.length / 2)] / 1000;
  }

  /**
   * Suggest calibration adjustment
   */
  private suggestCalibrationAdjustment(
    current: CalibrationAnalysis,
    _grid: GridAnalysis,
    _heartRateBpm: number,
    qrsWidthMs: number,
    qrsAmplitudeMv: number
  ): CalibrationAnalysis | null {
    // Try different calibration settings
    const candidates: Array<{
      calibration: CalibrationAnalysis;
      score: number;
    }> = [];

    const paperSpeeds = [25, 50];
    const gains = [5, 10, 20];

    for (const paperSpeed of paperSpeeds) {
      for (const gain of gains) {
        // Recalculate measurements with new calibration
        const adjustedQRSWidth = qrsWidthMs * (current.paperSpeed / paperSpeed);
        const adjustedAmplitude = qrsAmplitudeMv * (current.gain / gain);

        // Score based on physiological plausibility
        let score = 0;

        // QRS width score
        if (adjustedQRSWidth >= 60 && adjustedQRSWidth <= 120) {
          score += 1;
        } else if (adjustedQRSWidth >= 40 && adjustedQRSWidth <= 200) {
          score += 0.5;
        }

        // Amplitude score
        if (adjustedAmplitude >= 0.5 && adjustedAmplitude <= 2.5) {
          score += 1;
        } else if (adjustedAmplitude >= 0.3 && adjustedAmplitude <= 4.0) {
          score += 0.5;
        }

        // Heart rate doesn't change with paper speed (it's measured in samples)
        // But if we're way off, adjusting paper speed might help interpretation

        if (score > 0) {
          candidates.push({
            calibration: {
              ...current,
              paperSpeed,
              gain,
              speedSource: 'standard_assumed',
              gainSource: 'standard_assumed',
              confidence: score / 2,
            },
            score,
          });
        }
      }
    }

    // Return best candidate
    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length > 0 && candidates[0].score > 1) {
      return candidates[0].calibration;
    }

    return null;
  }

  /**
   * Create invalid result
   */
  private createInvalidResult(reason: string): QRSValidationResult {
    return {
      isValid: false,
      confidence: 0,
      heartRateBpm: 0,
      qrsWidthMs: 0,
      suggestedCalibration: null,
      issues: [reason],
      debugInfo: {
        detectedQRSCount: 0,
        avgRRInterval: 0,
        qrsAmplitudeMv: 0,
      },
    };
  }
}

/**
 * Convenience function for QRS-based calibration validation
 */
export function validateCalibrationWithQRS(
  signal: ECGSignal,
  calibration: CalibrationAnalysis,
  grid: GridAnalysis,
  sampleRate: number = 500
): QRSValidationResult {
  const validator = new QRSCalibrationValidator(sampleRate);
  return validator.validate(signal, calibration, grid);
}
