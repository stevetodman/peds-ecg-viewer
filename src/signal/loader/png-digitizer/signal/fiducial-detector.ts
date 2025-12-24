/**
 * Fiducial Point Detection
 * Precise detection of ECG waveform landmarks using Pan-Tompkins and wavelet methods
 *
 * Detects per beat:
 * - P wave: onset, peak, offset
 * - QRS complex: onset, Q, R, S, J-point (offset)
 * - T wave: onset, peak, offset
 * - U wave: onset, peak, offset (if present)
 *
 * Algorithm based on:
 * - Pan-Tompkins (1985) for QRS detection
 * - Martinez et al. (2004) wavelet approach for P/T delineation
 * - Laguna et al. (1994) for validation thresholds
 *
 * @module signal/loader/png-digitizer/signal/fiducial-detector
 */

import type { LeadName } from '../../../../types';

// ============================================================================
// Types
// ============================================================================

/**
 * A single fiducial point with sample index and confidence
 */
export interface FiducialPoint {
  /** Sample index (0-based) */
  index: number;
  /** Time in seconds from start of recording */
  time: number;
  /** Amplitude at this point (µV) */
  amplitude: number;
  /** Detection confidence (0-1) */
  confidence: number;
}

/**
 * Complete P wave annotation
 */
export interface PWaveAnnotation {
  /** P wave detected */
  present: boolean;
  /** P wave onset */
  onset?: FiducialPoint;
  /** P wave peak */
  peak?: FiducialPoint;
  /** P wave offset */
  offset?: FiducialPoint;
  /** P wave duration (ms) */
  duration?: number;
  /** P wave amplitude (µV) */
  amplitude?: number;
  /** P wave morphology */
  morphology?: 'normal' | 'bifid' | 'peaked' | 'inverted' | 'absent';
  /** Detection confidence */
  confidence: number;
}

/**
 * Complete QRS complex annotation
 */
export interface QRSAnnotation {
  /** QRS onset (Q wave start or R wave start if no Q) */
  onset: FiducialPoint;
  /** Q wave nadir (if present) */
  qWave?: FiducialPoint;
  /** R wave peak */
  rPeak: FiducialPoint;
  /** R' wave peak (if present, e.g., RBBB) */
  rPrimePeak?: FiducialPoint;
  /** S wave nadir (if present) */
  sWave?: FiducialPoint;
  /** S' wave nadir (if present) */
  sPrimeWave?: FiducialPoint;
  /** J-point (QRS offset, ST segment start) */
  jPoint: FiducialPoint;
  /** QRS duration (ms) */
  duration: number;
  /** QRS amplitude R-wave (µV) */
  rAmplitude: number;
  /** QRS amplitude S-wave (µV) */
  sAmplitude?: number;
  /** QRS morphology */
  morphology?: 'normal' | 'wide' | 'rsR' | 'qRs' | 'QS' | 'fragmented';
  /** Detection confidence */
  confidence: number;
}

/**
 * Complete T wave annotation
 */
export interface TWaveAnnotation {
  /** T wave detected */
  present: boolean;
  /** T wave onset */
  onset?: FiducialPoint;
  /** T wave peak */
  peak?: FiducialPoint;
  /** T wave offset (end of T, defines QT interval) */
  offset?: FiducialPoint;
  /** T wave duration (ms) */
  duration?: number;
  /** T wave amplitude (µV) */
  amplitude?: number;
  /** T wave morphology */
  morphology?: 'normal' | 'inverted' | 'biphasic' | 'flat' | 'peaked' | 'hyperacute';
  /** T peak to T end interval (ms) - marker of repolarization dispersion */
  tPeakTEnd?: number;
  /** Detection confidence */
  confidence: number;
}

/**
 * U wave annotation (if present)
 */
export interface UWaveAnnotation {
  present: boolean;
  onset?: FiducialPoint;
  peak?: FiducialPoint;
  offset?: FiducialPoint;
  amplitude?: number;
  confidence: number;
}

/**
 * Complete beat annotation with all fiducial points
 */
export interface BeatAnnotation {
  /** Beat index (0-based) */
  beatIndex: number;
  /** Lead this annotation is from */
  lead: LeadName;
  /** P wave annotation */
  pWave: PWaveAnnotation;
  /** QRS annotation */
  qrs: QRSAnnotation;
  /** T wave annotation */
  tWave: TWaveAnnotation;
  /** U wave annotation */
  uWave: UWaveAnnotation;
  /** RR interval to previous beat (ms), null for first beat */
  rrInterval: number | null;
  /** RR interval to next beat (ms), null for last beat */
  rrIntervalNext: number | null;
  /** PR interval (ms) - P onset to QRS onset */
  prInterval: number | null;
  /** QRS duration (ms) */
  qrsDuration: number;
  /** QT interval (ms) - QRS onset to T offset */
  qtInterval: number | null;
  /** Overall beat quality (0-1) */
  quality: number;
}

/**
 * Result of fiducial detection for entire signal
 */
export interface FiducialDetectionResult {
  /** Sample rate of the signal */
  sampleRate: number;
  /** Total duration in seconds */
  duration: number;
  /** Per-lead beat annotations */
  leads: Partial<Record<LeadName, BeatAnnotation[]>>;
  /** Global R-peak indices (from reference lead, usually II or V5) */
  globalRPeaks: number[];
  /** Detection statistics */
  statistics: DetectionStatistics;
  /** Processing time in ms */
  processingTimeMs: number;
}

export interface DetectionStatistics {
  /** Total beats detected */
  totalBeats: number;
  /** Average heart rate (bpm) */
  averageHR: number;
  /** Minimum heart rate */
  minHR: number;
  /** Maximum heart rate */
  maxHR: number;
  /** Beats with P wave detected */
  pWaveDetectionRate: number;
  /** Beats with T wave detected */
  tWaveDetectionRate: number;
  /** Average detection confidence */
  averageConfidence: number;
  /** Number of beats excluded due to noise */
  noisyBeatsExcluded: number;
}

// ============================================================================
// Pan-Tompkins QRS Detector
// ============================================================================

/**
 * Pan-Tompkins QRS Detection Algorithm
 *
 * Steps:
 * 1. Bandpass filter (5-15 Hz) to remove baseline wander and high-frequency noise
 * 2. Derivative to emphasize QRS slope
 * 3. Squaring to make all values positive and emphasize large slopes
 * 4. Moving window integration
 * 5. Adaptive thresholding with search-back
 */
export class PanTompkinsDetector {
  private sampleRate: number;

  // Adaptive thresholds
  private spkI: number = 0;  // Signal peak (integrated)
  private npkI: number = 0;  // Noise peak (integrated)
  private thresholdI1: number = 0;
  private thresholdI2: number = 0;

  private spkF: number = 0;  // Signal peak (filtered)
  private npkF: number = 0;  // Noise peak (filtered)
  private thresholdF1: number = 0;

  // Recent RR intervals for adaptive threshold
  private recentRR: number[] = [];
  private rrAverage1: number = 0;
  private rrAverage2: number = 0;
  private rrLow: number = 0;
  private rrHigh: number = 0;
  private rrMissed: number = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /**
   * Detect QRS complexes in the signal
   * @returns Array of R-peak sample indices
   */
  detect(signal: number[]): number[] {
    if (signal.length < this.sampleRate * 2) {
      // Need at least 2 seconds for reliable detection
      return this.detectShortSignal(signal);
    }

    // Step 1: Bandpass filter (5-15 Hz)
    const bandpassed = this.bandpassFilter(signal);

    // Step 2: Derivative
    const derivative = this.computeDerivative(bandpassed);

    // Step 3: Squaring
    const squared = derivative.map(x => x * x);

    // Step 4: Moving window integration
    const windowSize = Math.round(0.150 * this.sampleRate); // 150ms window
    const integrated = this.movingWindowIntegration(squared, windowSize);

    // Step 5: Find peaks and apply adaptive thresholding
    const rPeaks = this.findRPeaks(signal, bandpassed, integrated);

    // Step 6: Refine R-peak locations to actual signal maxima
    const refinedPeaks = this.refineRPeakLocations(signal, rPeaks);

    return refinedPeaks;
  }

  /**
   * Bandpass filter 5-15 Hz using cascaded low-pass and high-pass
   */
  private bandpassFilter(signal: number[]): number[] {
    // Low-pass filter (15 Hz cutoff)
    const lowPassed = this.lowPassFilter(signal);
    // High-pass filter (5 Hz cutoff)
    const highPassed = this.highPassFilter(lowPassed);
    return highPassed;
  }

  /**
   * Low-pass filter - 2nd order Butterworth approximation
   * H(z) = (1 + 2z^-1 + z^-2) / 32
   */
  private lowPassFilter(signal: number[]): number[] {
    const output = new Array(signal.length).fill(0);

    // Coefficients for ~15Hz cutoff at various sample rates
    const fc = 15; // cutoff frequency
    const RC = 1 / (2 * Math.PI * fc);
    const dt = 1 / this.sampleRate;
    const alpha = dt / (RC + dt);

    // Simple IIR low-pass
    output[0] = signal[0];
    for (let i = 1; i < signal.length; i++) {
      output[i] = output[i - 1] + alpha * (signal[i] - output[i - 1]);
    }

    // Second pass for sharper cutoff
    const output2 = new Array(signal.length).fill(0);
    output2[0] = output[0];
    for (let i = 1; i < signal.length; i++) {
      output2[i] = output2[i - 1] + alpha * (output[i] - output2[i - 1]);
    }

    return output2;
  }

  /**
   * High-pass filter - removes baseline wander
   * H(z) = (-1 + 32z^-16 + z^-32) / 32
   */
  private highPassFilter(signal: number[]): number[] {
    const output = new Array(signal.length).fill(0);

    // Coefficients for ~5Hz cutoff
    const fc = 5;
    const RC = 1 / (2 * Math.PI * fc);
    const dt = 1 / this.sampleRate;
    const alpha = RC / (RC + dt);

    // Simple IIR high-pass
    output[0] = signal[0];
    for (let i = 1; i < signal.length; i++) {
      output[i] = alpha * (output[i - 1] + signal[i] - signal[i - 1]);
    }

    return output;
  }

  /**
   * Five-point derivative
   * y[n] = (1/8T)(-x[n-2] - 2x[n-1] + 2x[n+1] + x[n+2])
   */
  private computeDerivative(signal: number[]): number[] {
    const output = new Array(signal.length).fill(0);
    const T = 1 / this.sampleRate;

    for (let i = 2; i < signal.length - 2; i++) {
      output[i] = (1 / (8 * T)) * (
        -signal[i - 2] -
        2 * signal[i - 1] +
        2 * signal[i + 1] +
        signal[i + 2]
      );
    }

    return output;
  }

  /**
   * Moving window integration
   */
  private movingWindowIntegration(signal: number[], windowSize: number): number[] {
    const output = new Array(signal.length).fill(0);
    let sum = 0;

    // Initialize with first window
    for (let i = 0; i < Math.min(windowSize, signal.length); i++) {
      sum += signal[i];
    }
    output[windowSize - 1] = sum / windowSize;

    // Slide window
    for (let i = windowSize; i < signal.length; i++) {
      sum += signal[i] - signal[i - windowSize];
      output[i] = sum / windowSize;
    }

    return output;
  }

  /**
   * Find R-peaks using adaptive thresholding
   */
  private findRPeaks(
    _originalSignal: number[],
    filteredSignal: number[],
    integratedSignal: number[]
  ): number[] {
    const rPeaks: number[] = [];
    const refractoryPeriod = Math.round(0.200 * this.sampleRate); // 200ms refractory
    const searchWindow = Math.round(0.150 * this.sampleRate); // 150ms search window

    // Initialize thresholds from first 2 seconds
    this.initializeThresholds(integratedSignal, filteredSignal);

    let lastPeak = -refractoryPeriod;

    // Find peaks in integrated signal
    for (let i = 1; i < integratedSignal.length - 1; i++) {
      // Check if this is a local maximum
      if (integratedSignal[i] > integratedSignal[i - 1] &&
          integratedSignal[i] >= integratedSignal[i + 1]) {

        // Check refractory period
        if (i - lastPeak < refractoryPeriod) continue;

        // Apply threshold
        if (integratedSignal[i] > this.thresholdI1) {
          // Potential QRS detected
          // Verify with filtered signal
          const peakF = this.findLocalMax(filteredSignal, i - searchWindow, i + searchWindow);

          if (Math.abs(filteredSignal[peakF]) > this.thresholdF1) {
            // Confirmed QRS
            rPeaks.push(i);
            this.updateThresholds(integratedSignal[i], Math.abs(filteredSignal[peakF]), true);
            this.updateRRStatistics(rPeaks);
            lastPeak = i;
          } else {
            // Noise peak
            this.updateThresholds(integratedSignal[i], Math.abs(filteredSignal[peakF]), false);
          }
        } else if (integratedSignal[i] > this.thresholdI2) {
          // Possible missed beat - search back if RR interval too long
          if (rPeaks.length > 0 && i - lastPeak > this.rrMissed) {
            // Search back for missed beat
            const searchStart = lastPeak + refractoryPeriod;
            const searchEnd = i - refractoryPeriod;
            const missedPeak = this.searchBackForPeak(integratedSignal, searchStart, searchEnd);

            if (missedPeak !== null) {
              rPeaks.push(missedPeak);
              rPeaks.sort((a, b) => a - b);
              this.updateRRStatistics(rPeaks);
            }
          }
        }
      }
    }

    return rPeaks;
  }

  /**
   * Initialize adaptive thresholds from learning phase
   */
  private initializeThresholds(integratedSignal: number[], filteredSignal: number[]): void {
    const learningPeriod = Math.min(
      Math.round(2 * this.sampleRate),
      integratedSignal.length
    );

    // Find maximum in learning period
    let maxI = 0;
    let maxF = 0;
    for (let i = 0; i < learningPeriod; i++) {
      maxI = Math.max(maxI, integratedSignal[i]);
      maxF = Math.max(maxF, Math.abs(filteredSignal[i]));
    }

    // Initialize thresholds
    this.spkI = maxI * 0.25;
    this.npkI = maxI * 0.125;
    this.thresholdI1 = this.npkI + 0.25 * (this.spkI - this.npkI);
    this.thresholdI2 = 0.5 * this.thresholdI1;

    this.spkF = maxF * 0.25;
    this.npkF = maxF * 0.125;
    this.thresholdF1 = this.npkF + 0.25 * (this.spkF - this.npkF);

    // Initialize RR average (assume 75 bpm)
    this.rrAverage1 = 0.8 * this.sampleRate;
    this.rrAverage2 = this.rrAverage1;
    this.updateRRLimits();
  }

  /**
   * Update adaptive thresholds after each peak
   */
  private updateThresholds(peakI: number, peakF: number, isSignal: boolean): void {
    if (isSignal) {
      // Signal peak - update with 0.125 weight
      this.spkI = 0.125 * peakI + 0.875 * this.spkI;
      this.spkF = 0.125 * peakF + 0.875 * this.spkF;
    } else {
      // Noise peak - update with 0.125 weight
      this.npkI = 0.125 * peakI + 0.875 * this.npkI;
      this.npkF = 0.125 * peakF + 0.875 * this.npkF;
    }

    // Update thresholds
    this.thresholdI1 = this.npkI + 0.25 * (this.spkI - this.npkI);
    this.thresholdI2 = 0.5 * this.thresholdI1;
    this.thresholdF1 = this.npkF + 0.25 * (this.spkF - this.npkF);
  }

  /**
   * Update RR interval statistics
   */
  private updateRRStatistics(rPeaks: number[]): void {
    if (rPeaks.length < 2) return;

    const lastRR = rPeaks[rPeaks.length - 1] - rPeaks[rPeaks.length - 2];

    // Keep last 8 RR intervals
    this.recentRR.push(lastRR);
    if (this.recentRR.length > 8) {
      this.recentRR.shift();
    }

    // Calculate RR averages
    if (this.recentRR.length >= 8) {
      // RR AVERAGE 1: last 8 RR intervals
      this.rrAverage1 = this.recentRR.reduce((a, b) => a + b, 0) / this.recentRR.length;

      // RR AVERAGE 2: RR intervals within normal range
      const normalRR = this.recentRR.filter(rr => rr > this.rrLow && rr < this.rrHigh);
      if (normalRR.length > 0) {
        this.rrAverage2 = normalRR.reduce((a, b) => a + b, 0) / normalRR.length;
      }
    }

    this.updateRRLimits();
  }

  /**
   * Update RR interval limits for missed beat detection
   */
  private updateRRLimits(): void {
    this.rrLow = 0.92 * this.rrAverage2;
    this.rrHigh = 1.16 * this.rrAverage2;
    this.rrMissed = 1.66 * this.rrAverage2;
  }

  /**
   * Search back for missed beat
   */
  private searchBackForPeak(
    signal: number[],
    start: number,
    end: number
  ): number | null {
    let maxVal = this.thresholdI2;
    let maxIdx: number | null = null;

    for (let i = start; i < end; i++) {
      if (signal[i] > maxVal) {
        maxVal = signal[i];
        maxIdx = i;
      }
    }

    return maxIdx;
  }

  /**
   * Find local maximum in range
   */
  private findLocalMax(signal: number[], start: number, end: number): number {
    start = Math.max(0, start);
    end = Math.min(signal.length - 1, end);

    let maxIdx = start;
    let maxVal = Math.abs(signal[start]);

    for (let i = start + 1; i <= end; i++) {
      if (Math.abs(signal[i]) > maxVal) {
        maxVal = Math.abs(signal[i]);
        maxIdx = i;
      }
    }

    return maxIdx;
  }

  /**
   * Refine R-peak locations to actual signal maxima
   */
  private refineRPeakLocations(signal: number[], peaks: number[]): number[] {
    const searchWindow = Math.round(0.05 * this.sampleRate); // 50ms window

    return peaks.map(peak => {
      const start = Math.max(0, peak - searchWindow);
      const end = Math.min(signal.length - 1, peak + searchWindow);

      let maxIdx = peak;
      let maxVal = signal[peak];

      // Find actual maximum in original signal
      for (let i = start; i <= end; i++) {
        if (signal[i] > maxVal) {
          maxVal = signal[i];
          maxIdx = i;
        }
      }

      return maxIdx;
    });
  }

  /**
   * Handle short signals (< 2 seconds)
   */
  private detectShortSignal(signal: number[]): number[] {
    // Simple peak detection for short signals
    const peaks: number[] = [];
    const minDistance = Math.round(0.3 * this.sampleRate); // 300ms min RR

    // Find all local maxima above threshold
    const threshold = this.calculateSimpleThreshold(signal);

    for (let i = 1; i < signal.length - 1; i++) {
      if (signal[i] > signal[i - 1] &&
          signal[i] >= signal[i + 1] &&
          signal[i] > threshold) {

        if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDistance) {
          peaks.push(i);
        } else if (signal[i] > signal[peaks[peaks.length - 1]]) {
          peaks[peaks.length - 1] = i;
        }
      }
    }

    return peaks;
  }

  /**
   * Calculate simple threshold for short signals
   */
  private calculateSimpleThreshold(signal: number[]): number {
    const sorted = [...signal].sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    const p25 = sorted[Math.floor(sorted.length * 0.25)];
    return p25 + 0.5 * (p75 - p25);
  }
}

// ============================================================================
// Wavelet-Based P/T Wave Delineator
// ============================================================================

/**
 * Wavelet-based delineation for P and T waves
 * Uses quadratic spline wavelet as in Martinez et al. (2004)
 */
export class WaveletDelineator {
  private sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /**
   * Delineate P wave
   */
  delineatePWave(
    signal: number[],
    qrsOnset: number,
    previousTEnd: number | null
  ): PWaveAnnotation {
    // P wave search window: from previous T end (or 200ms before QRS) to QRS onset
    const searchStart = previousTEnd !== null
      ? previousTEnd + Math.round(0.05 * this.sampleRate) // 50ms after T end
      : Math.max(0, qrsOnset - Math.round(0.3 * this.sampleRate)); // 300ms before QRS
    const searchEnd = qrsOnset - Math.round(0.02 * this.sampleRate); // 20ms before QRS

    if (searchEnd <= searchStart || searchEnd - searchStart < Math.round(0.05 * this.sampleRate)) {
      return { present: false, confidence: 0.3 };
    }

    // Extract search segment
    const segment = signal.slice(searchStart, searchEnd);

    // Compute wavelet transform at scale 4 (optimal for P wave at 500 Hz)
    const scale = Math.round(4 * this.sampleRate / 500);
    const wt = this.computeWaveletTransform(segment, scale);

    // Find P peak as zero-crossing with maximum absolute slope
    const zeroCrossings = this.findZeroCrossings(wt);

    if (zeroCrossings.length === 0) {
      return { present: false, confidence: 0.2 };
    }

    // Find the zero-crossing with largest modulus maximum pair
    let bestCrossing = zeroCrossings[0];
    let bestModulus = 0;

    for (const zc of zeroCrossings) {
      const leftModulus = this.findModulusMax(wt, zc - scale, zc);
      const rightModulus = this.findModulusMax(wt, zc, zc + scale);
      const totalModulus = Math.abs(leftModulus) + Math.abs(rightModulus);

      if (totalModulus > bestModulus) {
        bestModulus = totalModulus;
        bestCrossing = zc;
      }
    }

    // Convert to global index
    const peakIdx = searchStart + bestCrossing;

    // Find onset (left modulus maximum)
    const onsetLocal = this.findWaveOnset(wt, bestCrossing, scale);
    const onsetIdx = searchStart + onsetLocal;

    // Find offset (right modulus maximum)
    const offsetLocal = this.findWaveOffset(wt, bestCrossing, scale, segment.length);
    const offsetIdx = searchStart + offsetLocal;

    // Determine morphology
    const morphology = this.determinePWaveMorphology(signal, onsetIdx, peakIdx, offsetIdx);

    // Calculate confidence based on amplitude and regularity
    const amplitude = signal[peakIdx] - (signal[onsetIdx] + signal[offsetIdx]) / 2;
    const confidence = this.calculatePWaveConfidence(amplitude, offsetIdx - onsetIdx);

    return {
      present: true,
      onset: {
        index: onsetIdx,
        time: onsetIdx / this.sampleRate,
        amplitude: signal[onsetIdx],
        confidence,
      },
      peak: {
        index: peakIdx,
        time: peakIdx / this.sampleRate,
        amplitude: signal[peakIdx],
        confidence,
      },
      offset: {
        index: offsetIdx,
        time: offsetIdx / this.sampleRate,
        amplitude: signal[offsetIdx],
        confidence,
      },
      duration: ((offsetIdx - onsetIdx) / this.sampleRate) * 1000,
      amplitude,
      morphology,
      confidence,
    };
  }

  /**
   * Delineate QRS complex
   */
  delineateQRS(signal: number[], rPeak: number): QRSAnnotation {
    // Search window: ±100ms around R peak
    const searchWindow = Math.round(0.1 * this.sampleRate);
    const start = Math.max(0, rPeak - searchWindow);
    const end = Math.min(signal.length - 1, rPeak + searchWindow);

    // Find QRS onset using wavelet at finer scale
    const scale = Math.round(2 * this.sampleRate / 500);
    const segment = signal.slice(start, end);
    const wt = this.computeWaveletTransform(segment, scale);

    // Find onset: first significant modulus maximum before R peak
    const rLocal = rPeak - start;
    const onsetLocal = this.findQRSOnset(wt, rLocal, scale);
    const onsetIdx = start + onsetLocal;

    // Find J-point (QRS offset)
    const offsetLocal = this.findQRSOffset(wt, rLocal, scale, segment.length);
    const jPointIdx = start + offsetLocal;

    // Find Q wave (local minimum before R peak)
    let qWaveIdx: number | undefined;
    for (let i = rPeak - 1; i >= onsetIdx; i--) {
      if (signal[i] < signal[i - 1] && signal[i] <= signal[i + 1]) {
        if (signal[i] < signal[rPeak] * 0.3) {
          qWaveIdx = i;
          break;
        }
      }
    }

    // Find S wave (local minimum after R peak)
    let sWaveIdx: number | undefined;
    for (let i = rPeak + 1; i < jPointIdx; i++) {
      if (signal[i] < signal[i - 1] && signal[i] <= signal[i + 1]) {
        if (signal[i] < signal[rPeak] * 0.3) {
          sWaveIdx = i;
          break;
        }
      }
    }

    // Calculate QRS duration
    const duration = ((jPointIdx - onsetIdx) / this.sampleRate) * 1000;

    // Determine morphology
    const morphology = this.determineQRSMorphology(signal, onsetIdx, rPeak, jPointIdx, qWaveIdx, sWaveIdx);

    // Calculate confidence
    const confidence = this.calculateQRSConfidence(duration, signal[rPeak]);

    return {
      onset: {
        index: onsetIdx,
        time: onsetIdx / this.sampleRate,
        amplitude: signal[onsetIdx],
        confidence,
      },
      qWave: qWaveIdx !== undefined ? {
        index: qWaveIdx,
        time: qWaveIdx / this.sampleRate,
        amplitude: signal[qWaveIdx],
        confidence,
      } : undefined,
      rPeak: {
        index: rPeak,
        time: rPeak / this.sampleRate,
        amplitude: signal[rPeak],
        confidence,
      },
      sWave: sWaveIdx !== undefined ? {
        index: sWaveIdx,
        time: sWaveIdx / this.sampleRate,
        amplitude: signal[sWaveIdx],
        confidence,
      } : undefined,
      jPoint: {
        index: jPointIdx,
        time: jPointIdx / this.sampleRate,
        amplitude: signal[jPointIdx],
        confidence,
      },
      duration,
      rAmplitude: signal[rPeak],
      sAmplitude: sWaveIdx !== undefined ? signal[sWaveIdx] : undefined,
      morphology,
      confidence,
    };
  }

  /**
   * Delineate T wave
   */
  delineateTWave(
    signal: number[],
    jPoint: number,
    nextQRSOnset: number | null
  ): TWaveAnnotation {
    // T wave search window: from J-point + 50ms to next QRS onset - 50ms (or 400ms after J)
    const searchStart = jPoint + Math.round(0.05 * this.sampleRate);
    const searchEnd = nextQRSOnset !== null
      ? nextQRSOnset - Math.round(0.05 * this.sampleRate)
      : Math.min(signal.length - 1, jPoint + Math.round(0.4 * this.sampleRate));

    if (searchEnd <= searchStart || searchEnd - searchStart < Math.round(0.1 * this.sampleRate)) {
      return { present: false, confidence: 0.3 };
    }

    // Extract search segment
    const segment = signal.slice(searchStart, searchEnd);

    // Compute wavelet transform at scale 8 (optimal for T wave)
    const scale = Math.round(8 * this.sampleRate / 500);
    const wt = this.computeWaveletTransform(segment, scale);

    // Find T peak as zero-crossing with maximum modulus pair
    const zeroCrossings = this.findZeroCrossings(wt);

    if (zeroCrossings.length === 0) {
      return { present: false, confidence: 0.2 };
    }

    // Find the best zero-crossing (usually the last significant one is T peak)
    let bestCrossing = zeroCrossings[0];
    let bestModulus = 0;

    for (const zc of zeroCrossings) {
      const leftModulus = this.findModulusMax(wt, Math.max(0, zc - scale * 2), zc);
      const rightModulus = this.findModulusMax(wt, zc, Math.min(wt.length - 1, zc + scale * 2));
      const totalModulus = Math.abs(leftModulus) + Math.abs(rightModulus);

      if (totalModulus > bestModulus) {
        bestModulus = totalModulus;
        bestCrossing = zc;
      }
    }

    // Convert to global index
    const peakIdx = searchStart + bestCrossing;

    // Find onset
    const onsetLocal = this.findWaveOnset(wt, bestCrossing, scale);
    const onsetIdx = searchStart + onsetLocal;

    // Find offset (critical for QT measurement!)
    const offsetLocal = this.findTWaveOffset(wt, segment, bestCrossing, scale);
    const offsetIdx = searchStart + offsetLocal;

    // Determine morphology
    const morphology = this.determineTWaveMorphology(signal, onsetIdx, peakIdx, offsetIdx);

    // Calculate amplitude
    const amplitude = signal[peakIdx] - (signal[onsetIdx] + signal[offsetIdx]) / 2;

    // Calculate Tpeak-Tend
    const tPeakTEnd = ((offsetIdx - peakIdx) / this.sampleRate) * 1000;

    // Calculate confidence
    const confidence = this.calculateTWaveConfidence(amplitude, offsetIdx - onsetIdx, morphology);

    return {
      present: true,
      onset: {
        index: onsetIdx,
        time: onsetIdx / this.sampleRate,
        amplitude: signal[onsetIdx],
        confidence,
      },
      peak: {
        index: peakIdx,
        time: peakIdx / this.sampleRate,
        amplitude: signal[peakIdx],
        confidence,
      },
      offset: {
        index: offsetIdx,
        time: offsetIdx / this.sampleRate,
        amplitude: signal[offsetIdx],
        confidence,
      },
      duration: ((offsetIdx - onsetIdx) / this.sampleRate) * 1000,
      amplitude,
      morphology,
      tPeakTEnd,
      confidence,
    };
  }

  /**
   * Compute wavelet transform using quadratic spline wavelet
   */
  private computeWaveletTransform(signal: number[], scale: number): number[] {
    // Quadratic spline wavelet approximation
    // Use difference of smoothed signals at adjacent scales
    const smoothed1 = this.smoothSignal(signal, scale);
    const smoothed2 = this.smoothSignal(signal, scale * 2);

    return smoothed1.map((v, i) => smoothed2[i] - v);
  }

  /**
   * Smooth signal using moving average
   */
  private smoothSignal(signal: number[], windowSize: number): number[] {
    const output = new Array(signal.length).fill(0);
    const halfWindow = Math.floor(windowSize / 2);

    for (let i = 0; i < signal.length; i++) {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - halfWindow); j <= Math.min(signal.length - 1, i + halfWindow); j++) {
        sum += signal[j];
        count++;
      }
      output[i] = sum / count;
    }

    return output;
  }

  /**
   * Find zero crossings in wavelet transform
   */
  private findZeroCrossings(wt: number[]): number[] {
    const crossings: number[] = [];

    for (let i = 1; i < wt.length; i++) {
      if ((wt[i - 1] < 0 && wt[i] >= 0) || (wt[i - 1] >= 0 && wt[i] < 0)) {
        crossings.push(i);
      }
    }

    return crossings;
  }

  /**
   * Find modulus maximum in range
   */
  private findModulusMax(wt: number[], start: number, end: number): number {
    start = Math.max(0, start);
    end = Math.min(wt.length - 1, end);

    let maxAbs = 0;
    let maxVal = 0;

    for (let i = start; i <= end; i++) {
      if (Math.abs(wt[i]) > maxAbs) {
        maxAbs = Math.abs(wt[i]);
        maxVal = wt[i];
      }
    }

    return maxVal;
  }

  /**
   * Find wave onset using modulus maximum
   */
  private findWaveOnset(wt: number[], peakIdx: number, scale: number): number {
    const searchStart = Math.max(0, peakIdx - scale * 3);

    // Find first modulus maximum before peak
    let maxModIdx = searchStart;
    let maxMod = 0;

    for (let i = peakIdx - 1; i >= searchStart; i--) {
      if (Math.abs(wt[i]) > maxMod) {
        maxMod = Math.abs(wt[i]);
        maxModIdx = i;
      }
    }

    // Onset is before the modulus maximum where WT approaches zero
    for (let i = maxModIdx - 1; i >= searchStart; i--) {
      if (Math.abs(wt[i]) < maxMod * 0.1) {
        return i;
      }
    }

    return maxModIdx;
  }

  /**
   * Find wave offset using modulus maximum
   */
  private findWaveOffset(wt: number[], peakIdx: number, scale: number, length: number): number {
    const searchEnd = Math.min(length - 1, peakIdx + scale * 3);

    // Find first modulus maximum after peak
    let maxModIdx = peakIdx;
    let maxMod = 0;

    for (let i = peakIdx + 1; i <= searchEnd; i++) {
      if (Math.abs(wt[i]) > maxMod) {
        maxMod = Math.abs(wt[i]);
        maxModIdx = i;
      }
    }

    // Offset is after the modulus maximum where WT approaches zero
    for (let i = maxModIdx + 1; i <= searchEnd; i++) {
      if (Math.abs(wt[i]) < maxMod * 0.1) {
        return i;
      }
    }

    return maxModIdx;
  }

  /**
   * Find QRS onset using derivative sign changes
   */
  private findQRSOnset(wt: number[], rLocal: number, scale: number): number {
    const searchStart = Math.max(0, rLocal - scale * 4);

    // Find significant modulus maximum before R
    for (let i = rLocal - 1; i >= searchStart; i--) {
      if (Math.abs(wt[i]) < Math.abs(wt[rLocal]) * 0.05) {
        return i;
      }
    }

    return searchStart;
  }

  /**
   * Find QRS offset (J-point)
   */
  private findQRSOffset(wt: number[], rLocal: number, scale: number, length: number): number {
    const searchEnd = Math.min(length - 1, rLocal + scale * 4);

    // J-point is where wavelet transform returns to near-zero after S wave
    for (let i = rLocal + 1; i <= searchEnd; i++) {
      if (Math.abs(wt[i]) < Math.abs(wt[rLocal]) * 0.05) {
        return i;
      }
    }

    return searchEnd;
  }

  /**
   * Find T wave offset using tangent method
   */
  private findTWaveOffset(
    wt: number[],
    segment: number[],
    peakLocal: number,
    scale: number
  ): number {
    const searchEnd = Math.min(segment.length - 1, peakLocal + scale * 4);

    // Find modulus maximum after peak
    let maxModIdx = peakLocal;
    let maxMod = 0;

    for (let i = peakLocal + 1; i <= searchEnd; i++) {
      if (Math.abs(wt[i]) > maxMod) {
        maxMod = Math.abs(wt[i]);
        maxModIdx = i;
      }
    }

    // Use tangent method: find where signal intersects baseline
    // Baseline is estimated from end of segment
    const baselineEnd = Math.min(segment.length - 1, searchEnd + scale);
    let baseline = 0;
    let count = 0;
    for (let i = maxModIdx + scale; i <= baselineEnd && i < segment.length; i++) {
      baseline += segment[i];
      count++;
    }
    baseline = count > 0 ? baseline / count : segment[segment.length - 1];

    // Find intersection with baseline
    for (let i = maxModIdx + 1; i <= searchEnd; i++) {
      if (Math.abs(segment[i] - baseline) < Math.abs(segment[peakLocal] - baseline) * 0.1) {
        return i;
      }
    }

    return maxModIdx + Math.round(scale * 0.5);
  }

  // Morphology determination methods
  private determinePWaveMorphology(
    signal: number[],
    onset: number,
    peak: number,
    offset: number
  ): PWaveAnnotation['morphology'] {
    const amplitude = signal[peak] - (signal[onset] + signal[offset]) / 2;

    if (Math.abs(amplitude) < 20) return 'absent';
    if (amplitude < -20) return 'inverted';

    // Check for bifid P wave (M-shaped)
    let hasNotch = false;
    for (let i = onset + 2; i < offset - 2; i++) {
      if (signal[i] < signal[i - 1] && signal[i] < signal[i + 1]) {
        hasNotch = true;
        break;
      }
    }

    if (hasNotch) return 'bifid';
    if (amplitude > 250) return 'peaked'; // Tall P wave

    return 'normal';
  }

  private determineQRSMorphology(
    signal: number[],
    onset: number,
    rPeak: number,
    offset: number,
    _qWave?: number,
    _sWave?: number
  ): QRSAnnotation['morphology'] {
    const duration = ((offset - onset) / this.sampleRate) * 1000;

    if (duration > 120) {
      // Check for rsR' pattern (RBBB)
      // Look for secondary R wave
      for (let i = rPeak + 5; i < offset - 5; i++) {
        if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1] &&
            signal[i] > signal[rPeak] * 0.3) {
          return 'rsR';
        }
      }
      return 'wide';
    }

    // Check for QS pattern (no R wave, just Q and S)
    if (signal[rPeak] < signal[onset] && signal[rPeak] < signal[offset]) {
      return 'QS';
    }

    return 'normal';
  }

  private determineTWaveMorphology(
    signal: number[],
    onset: number,
    peak: number,
    offset: number
  ): TWaveAnnotation['morphology'] {
    const amplitude = signal[peak] - (signal[onset] + signal[offset]) / 2;

    if (Math.abs(amplitude) < 50) return 'flat';
    if (amplitude < -50) return 'inverted';
    if (amplitude > 500) return 'hyperacute'; // Very tall T wave

    // Check for biphasic T wave
    let positivePart = false;
    let negativePart = false;
    const baseline = (signal[onset] + signal[offset]) / 2;

    for (let i = onset; i <= offset; i++) {
      if (signal[i] > baseline + 50) positivePart = true;
      if (signal[i] < baseline - 50) negativePart = true;
    }

    if (positivePart && negativePart) return 'biphasic';

    // Check for peaked T wave (hyperkalemia marker)
    const duration = offset - onset;
    const peakPosition = peak - onset;
    if (peakPosition < duration * 0.3 || peakPosition > duration * 0.7) {
      // Asymmetric peak
      if (amplitude > 300) return 'peaked';
    }

    return 'normal';
  }

  // Confidence calculation methods
  private calculatePWaveConfidence(amplitude: number, duration: number): number {
    let confidence = 0.5;

    // Amplitude check (normal P wave 50-250 µV)
    if (amplitude > 30 && amplitude < 300) {
      confidence += 0.2;
    }

    // Duration check (normal P wave 80-120 ms)
    const durationMs = (duration / this.sampleRate) * 1000;
    if (durationMs > 60 && durationMs < 150) {
      confidence += 0.2;
    }

    // Reasonable absolute amplitude
    if (amplitude > 50) {
      confidence += 0.1;
    }

    return Math.min(1, confidence);
  }

  private calculateQRSConfidence(duration: number, rAmplitude: number): number {
    let confidence = 0.6;

    // Duration check (normal QRS 80-120 ms)
    if (duration > 60 && duration < 150) {
      confidence += 0.2;
    }

    // R amplitude should be significant
    if (rAmplitude > 300) {
      confidence += 0.2;
    }

    return Math.min(1, confidence);
  }

  private calculateTWaveConfidence(
    amplitude: number,
    duration: number,
    morphology: TWaveAnnotation['morphology']
  ): number {
    let confidence = 0.5;

    // Amplitude check
    if (Math.abs(amplitude) > 50 && Math.abs(amplitude) < 800) {
      confidence += 0.2;
    }

    // Duration check (normal T wave 150-250 ms)
    const durationMs = (duration / this.sampleRate) * 1000;
    if (durationMs > 100 && durationMs < 350) {
      confidence += 0.2;
    }

    // Normal morphology
    if (morphology === 'normal') {
      confidence += 0.1;
    }

    return Math.min(1, confidence);
  }
}

// ============================================================================
// Main Fiducial Detector
// ============================================================================

export class FiducialDetector {
  private sampleRate: number;
  private panTompkins: PanTompkinsDetector;
  private waveletDelineator: WaveletDelineator;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.panTompkins = new PanTompkinsDetector(sampleRate);
    this.waveletDelineator = new WaveletDelineator(sampleRate);
  }

  /**
   * Detect all fiducial points in ECG signal
   */
  detect(leads: Partial<Record<LeadName, number[]>>): FiducialDetectionResult {
    const startTime = Date.now();
    const result: FiducialDetectionResult = {
      sampleRate: this.sampleRate,
      duration: 0,
      leads: {},
      globalRPeaks: [],
      statistics: {
        totalBeats: 0,
        averageHR: 0,
        minHR: 0,
        maxHR: 0,
        pWaveDetectionRate: 0,
        tWaveDetectionRate: 0,
        averageConfidence: 0,
        noisyBeatsExcluded: 0,
      },
      processingTimeMs: 0,
    };

    // Choose reference lead for global R-peak detection
    const referenceLead = this.selectReferenceLead(leads);
    if (!referenceLead) {
      result.processingTimeMs = Date.now() - startTime;
      return result;
    }

    const referenceData = leads[referenceLead]!;
    result.duration = referenceData.length / this.sampleRate;

    // Detect R-peaks in reference lead
    result.globalRPeaks = this.panTompkins.detect(referenceData);

    if (result.globalRPeaks.length === 0) {
      result.processingTimeMs = Date.now() - startTime;
      return result;
    }

    // Process each lead
    let totalPWaveDetected = 0;
    let totalTWaveDetected = 0;
    let totalConfidence = 0;
    let beatCount = 0;

    for (const [leadName, leadData] of Object.entries(leads) as [LeadName, number[]][]) {
      if (!leadData || leadData.length === 0) continue;

      const beatAnnotations = this.processLead(
        leadName,
        leadData,
        result.globalRPeaks
      );

      result.leads[leadName] = beatAnnotations;

      // Collect statistics
      for (const beat of beatAnnotations) {
        beatCount++;
        totalConfidence += beat.quality;
        if (beat.pWave.present) totalPWaveDetected++;
        if (beat.tWave.present) totalTWaveDetected++;
      }
    }

    // Calculate statistics
    result.statistics.totalBeats = result.globalRPeaks.length;
    result.statistics.pWaveDetectionRate = beatCount > 0 ? totalPWaveDetected / beatCount : 0;
    result.statistics.tWaveDetectionRate = beatCount > 0 ? totalTWaveDetected / beatCount : 0;
    result.statistics.averageConfidence = beatCount > 0 ? totalConfidence / beatCount : 0;

    // Calculate heart rate statistics from RR intervals
    const rrStats = this.calculateRRStatistics(result.globalRPeaks);
    result.statistics.averageHR = rrStats.averageHR;
    result.statistics.minHR = rrStats.minHR;
    result.statistics.maxHR = rrStats.maxHR;

    result.processingTimeMs = Date.now() - startTime;
    return result;
  }

  /**
   * Select best reference lead for R-peak detection
   */
  private selectReferenceLead(leads: Partial<Record<LeadName, number[]>>): LeadName | null {
    // Preference order: II, V5, I, V2, aVF
    const preferenceOrder: LeadName[] = ['II', 'V5', 'I', 'V2', 'aVF'];

    for (const lead of preferenceOrder) {
      if (leads[lead] && leads[lead].length > 0) {
        return lead;
      }
    }

    // Return first available lead
    for (const [leadName, data] of Object.entries(leads) as [LeadName, number[]][]) {
      if (data && data.length > 0) {
        return leadName;
      }
    }

    return null;
  }

  /**
   * Process single lead to get beat annotations
   */
  private processLead(
    leadName: LeadName,
    leadData: number[],
    globalRPeaks: number[]
  ): BeatAnnotation[] {
    const annotations: BeatAnnotation[] = [];

    // Refine R-peak locations for this lead
    const localRPeaks = this.refineRPeaksForLead(leadData, globalRPeaks);

    for (let i = 0; i < localRPeaks.length; i++) {
      const rPeak = localRPeaks[i];

      // Delineate QRS
      const qrs = this.waveletDelineator.delineateQRS(leadData, rPeak);

      // Get previous T wave end for P wave search
      const prevTEnd = i > 0 && annotations[i - 1].tWave.present
        ? annotations[i - 1].tWave.offset?.index ?? null
        : null;

      // Delineate P wave
      const pWave = this.waveletDelineator.delineatePWave(leadData, qrs.onset.index, prevTEnd);

      // Get next QRS onset for T wave search
      const nextQRSOnset = i < localRPeaks.length - 1
        ? this.estimateNextQRSOnset(leadData, localRPeaks[i + 1])
        : null;

      // Delineate T wave
      const tWave = this.waveletDelineator.delineateTWave(leadData, qrs.jPoint.index, nextQRSOnset);

      // Detect U wave (optional)
      const uWave = this.detectUWave(leadData, tWave, nextQRSOnset);

      // Calculate intervals
      const rrInterval = i > 0
        ? ((rPeak - localRPeaks[i - 1]) / this.sampleRate) * 1000
        : null;
      const rrIntervalNext = i < localRPeaks.length - 1
        ? ((localRPeaks[i + 1] - rPeak) / this.sampleRate) * 1000
        : null;

      const prInterval = pWave.present && pWave.onset
        ? ((qrs.onset.index - pWave.onset.index) / this.sampleRate) * 1000
        : null;

      const qtInterval = tWave.present && tWave.offset
        ? ((tWave.offset.index - qrs.onset.index) / this.sampleRate) * 1000
        : null;

      // Calculate overall beat quality
      const quality = (qrs.confidence +
        (pWave.present ? pWave.confidence : 0.3) +
        (tWave.present ? tWave.confidence : 0.3)) / 3;

      annotations.push({
        beatIndex: i,
        lead: leadName,
        pWave,
        qrs,
        tWave,
        uWave,
        rrInterval,
        rrIntervalNext,
        prInterval,
        qrsDuration: qrs.duration,
        qtInterval,
        quality,
      });
    }

    return annotations;
  }

  /**
   * Refine R-peak locations for specific lead
   */
  private refineRPeaksForLead(leadData: number[], globalRPeaks: number[]): number[] {
    const searchWindow = Math.round(0.05 * this.sampleRate); // 50ms

    return globalRPeaks.map(globalPeak => {
      const start = Math.max(0, globalPeak - searchWindow);
      const end = Math.min(leadData.length - 1, globalPeak + searchWindow);

      let maxIdx = globalPeak;
      let maxVal = leadData[globalPeak];

      for (let i = start; i <= end; i++) {
        if (leadData[i] > maxVal) {
          maxVal = leadData[i];
          maxIdx = i;
        }
      }

      return maxIdx;
    });
  }

  /**
   * Estimate next QRS onset for T wave boundary
   */
  private estimateNextQRSOnset(_leadData: number[], nextRPeak: number): number {
    // Estimate QRS onset as ~50ms before R peak
    return Math.max(0, nextRPeak - Math.round(0.05 * this.sampleRate));
  }

  /**
   * Detect U wave if present
   */
  private detectUWave(
    leadData: number[],
    tWave: TWaveAnnotation,
    nextQRSOnset: number | null
  ): UWaveAnnotation {
    if (!tWave.present || !tWave.offset) {
      return { present: false, confidence: 0.1 };
    }

    const searchStart = tWave.offset.index + Math.round(0.02 * this.sampleRate);
    const searchEnd = nextQRSOnset !== null
      ? nextQRSOnset - Math.round(0.05 * this.sampleRate)
      : Math.min(leadData.length - 1, tWave.offset.index + Math.round(0.2 * this.sampleRate));

    if (searchEnd <= searchStart) {
      return { present: false, confidence: 0.2 };
    }

    // Look for small positive deflection after T wave
    const baseline = tWave.offset.amplitude;
    let peakIdx = searchStart;
    let peakVal = leadData[searchStart];

    for (let i = searchStart; i <= searchEnd; i++) {
      if (leadData[i] > peakVal) {
        peakVal = leadData[i];
        peakIdx = i;
      }
    }

    const amplitude = peakVal - baseline;

    // U wave should be small (< T wave amplitude) and positive
    if (amplitude < 20 || (tWave.amplitude && amplitude > Math.abs(tWave.amplitude) * 0.5)) {
      return { present: false, confidence: 0.3 };
    }

    return {
      present: true,
      peak: {
        index: peakIdx,
        time: peakIdx / this.sampleRate,
        amplitude: peakVal,
        confidence: 0.6,
      },
      amplitude,
      confidence: 0.6,
    };
  }

  /**
   * Calculate RR interval statistics
   */
  private calculateRRStatistics(rPeaks: number[]): {
    averageHR: number;
    minHR: number;
    maxHR: number;
  } {
    if (rPeaks.length < 2) {
      return { averageHR: 0, minHR: 0, maxHR: 0 };
    }

    const rrIntervals: number[] = [];
    for (let i = 1; i < rPeaks.length; i++) {
      const rrMs = ((rPeaks[i] - rPeaks[i - 1]) / this.sampleRate) * 1000;
      // Filter out physiologically implausible RR intervals
      if (rrMs > 200 && rrMs < 3000) { // 20-300 bpm range
        rrIntervals.push(rrMs);
      }
    }

    if (rrIntervals.length === 0) {
      return { averageHR: 0, minHR: 0, maxHR: 0 };
    }

    const averageRR = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
    const minRR = Math.min(...rrIntervals);
    const maxRR = Math.max(...rrIntervals);

    return {
      averageHR: 60000 / averageRR,
      minHR: 60000 / maxRR,  // Max RR = Min HR
      maxHR: 60000 / minRR,  // Min RR = Max HR
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Detect fiducial points in ECG signal
 */
export function detectFiducialPoints(
  leads: Partial<Record<LeadName, number[]>>,
  sampleRate: number
): FiducialDetectionResult {
  const detector = new FiducialDetector(sampleRate);
  return detector.detect(leads);
}

/**
 * Get R-peak indices from single lead
 */
export function detectRPeaks(signal: number[], sampleRate: number): number[] {
  const detector = new PanTompkinsDetector(sampleRate);
  return detector.detect(signal);
}
