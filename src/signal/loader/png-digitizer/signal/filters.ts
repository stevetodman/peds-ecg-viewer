/**
 * ECG Signal Filters
 * Baseline wander correction, powerline noise removal, and artifact detection
 *
 * @module signal/loader/png-digitizer/signal/filters
 */

import type { LeadName } from '../../../../types';

/**
 * Filter configuration
 */
export interface FilterConfig {
  /** Enable baseline wander correction */
  removeBaselineWander?: boolean;

  /** Enable powerline noise removal */
  removePowerlineNoise?: boolean;

  /** Powerline frequency (50 or 60 Hz) */
  powerlineFrequency?: 50 | 60;

  /** Enable muscle artifact detection */
  detectMuscleArtifact?: boolean;

  /** Sample rate of the signal */
  sampleRate: number;
}

/**
 * Filter result
 */
export interface FilterResult {
  /** Filtered signal samples */
  filtered: number[];

  /** Detected baseline wander (for visualization) */
  baselineWander?: number[];

  /** Detected powerline noise level (0-1) */
  powerlineNoiseLevel?: number;

  /** Detected muscle artifact regions */
  muscleArtifactRegions?: Array<{ start: number; end: number; severity: number }>;

  /** Quality improvement score (0-1) */
  qualityImprovement: number;
}

/**
 * ECG Signal Filter
 */
export class ECGSignalFilter {
  private config: Required<FilterConfig>;

  constructor(config: FilterConfig) {
    this.config = {
      removeBaselineWander: config.removeBaselineWander ?? true,
      removePowerlineNoise: config.removePowerlineNoise ?? true,
      powerlineFrequency: config.powerlineFrequency ?? 60,
      detectMuscleArtifact: config.detectMuscleArtifact ?? true,
      sampleRate: config.sampleRate,
    };
  }

  /**
   * Apply all filters to signal
   */
  filter(samples: number[]): FilterResult {
    let filtered = [...samples];
    let qualityImprovement = 0;

    // Step 1: Remove baseline wander using high-pass filter (0.5 Hz cutoff)
    let baselineWander: number[] | undefined;
    if (this.config.removeBaselineWander) {
      const { signal, baseline } = this.removeBaselineWander(filtered);
      filtered = signal;
      baselineWander = baseline;
      qualityImprovement += 0.2;
    }

    // Step 2: Remove powerline noise using notch filter
    let powerlineNoiseLevel: number | undefined;
    if (this.config.removePowerlineNoise) {
      const noiseLevel = this.estimatePowerlineNoise(filtered);
      if (noiseLevel > 0.05) {
        filtered = this.applyNotchFilter(filtered, this.config.powerlineFrequency);
        powerlineNoiseLevel = noiseLevel;
        qualityImprovement += noiseLevel * 0.5;
      }
    }

    // Step 3: Detect muscle artifact
    let muscleArtifactRegions: Array<{ start: number; end: number; severity: number }> | undefined;
    if (this.config.detectMuscleArtifact) {
      muscleArtifactRegions = this.detectMuscleArtifact(filtered);
    }

    return {
      filtered,
      baselineWander,
      powerlineNoiseLevel,
      muscleArtifactRegions,
      qualityImprovement: Math.min(1, qualityImprovement),
    };
  }

  /**
   * Remove baseline wander using moving average subtraction
   * More robust than high-pass filter for ECG
   */
  private removeBaselineWander(samples: number[]): {
    signal: number[];
    baseline: number[];
  } {
    // Use cubic spline interpolation of median values
    const windowSize = Math.floor(this.config.sampleRate * 0.6); // 600ms window
    const baseline = new Array(samples.length);

    // Calculate baseline using median filter with large window
    for (let i = 0; i < samples.length; i++) {
      const start = Math.max(0, i - Math.floor(windowSize / 2));
      const end = Math.min(samples.length, i + Math.floor(windowSize / 2));
      const window = samples.slice(start, end);

      // Use median for robustness to QRS complexes
      window.sort((a, b) => a - b);
      baseline[i] = window[Math.floor(window.length / 2)];
    }

    // Smooth baseline with moving average
    const smoothWindow = Math.floor(this.config.sampleRate * 0.2);
    const smoothedBaseline = this.movingAverage(baseline, smoothWindow);

    // Subtract baseline
    const signal = samples.map((s, i) => s - smoothedBaseline[i]);

    return { signal, baseline: smoothedBaseline };
  }

  /**
   * Moving average filter
   */
  private movingAverage(samples: number[], windowSize: number): number[] {
    const result = new Array(samples.length);
    const halfWindow = Math.floor(windowSize / 2);

    for (let i = 0; i < samples.length; i++) {
      const start = Math.max(0, i - halfWindow);
      const end = Math.min(samples.length, i + halfWindow + 1);
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += samples[j];
      }
      result[i] = sum / (end - start);
    }

    return result;
  }

  /**
   * Estimate powerline noise level using FFT
   */
  private estimatePowerlineNoise(samples: number[]): number {
    // Simple DFT at powerline frequency
    const freq = this.config.powerlineFrequency;
    const sampleRate = this.config.sampleRate;

    // Use a segment of the signal
    const segmentLength = Math.min(samples.length, sampleRate * 2);
    const segment = samples.slice(0, segmentLength);

    // Calculate power at powerline frequency and harmonics
    let powerlineEnergy = 0;
    let totalEnergy = 0;

    for (let harmonic = 1; harmonic <= 3; harmonic++) {
      const targetFreq = freq * harmonic;
      const { real, imag } = this.goertzel(segment, targetFreq, sampleRate);
      powerlineEnergy += real * real + imag * imag;
    }

    // Estimate total signal energy
    for (const s of segment) {
      totalEnergy += s * s;
    }

    if (totalEnergy < 1e-10) return 0;

    return Math.sqrt(powerlineEnergy / totalEnergy);
  }

  /**
   * Goertzel algorithm for single-frequency DFT
   */
  private goertzel(
    samples: number[],
    targetFreq: number,
    sampleRate: number
  ): { real: number; imag: number } {
    const k = Math.round((samples.length * targetFreq) / sampleRate);
    const w = (2 * Math.PI * k) / samples.length;
    const cosW = Math.cos(w);
    const sinW = Math.sin(w);
    const coeff = 2 * cosW;

    let s0 = 0;
    let s1 = 0;
    let s2 = 0;

    for (const sample of samples) {
      s0 = sample + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }

    const real = s1 - s2 * cosW;
    const imag = s2 * sinW;

    return { real, imag };
  }

  /**
   * Apply notch filter at specified frequency
   */
  private applyNotchFilter(samples: number[], frequency: number): number[] {
    // IIR notch filter design
    const fs = this.config.sampleRate;
    const f0 = frequency;
    const Q = 30; // Quality factor (higher = narrower notch)

    const w0 = (2 * Math.PI * f0) / fs;
    const alpha = Math.sin(w0) / (2 * Q);

    // Notch filter coefficients (biquad)
    const b0 = 1;
    const b1 = -2 * Math.cos(w0);
    const b2 = 1;
    const a0 = 1 + alpha;
    const a1 = -2 * Math.cos(w0);
    const a2 = 1 - alpha;

    // Normalize coefficients
    const nb0 = b0 / a0;
    const nb1 = b1 / a0;
    const nb2 = b2 / a0;
    const na1 = a1 / a0;
    const na2 = a2 / a0;

    // Apply filter (forward and backward for zero phase)
    let filtered = this.applyBiquad(samples, nb0, nb1, nb2, na1, na2);

    // Reverse and apply again
    filtered.reverse();
    filtered = this.applyBiquad(filtered, nb0, nb1, nb2, na1, na2);
    filtered.reverse();

    // Also filter harmonics (2nd and 3rd)
    for (let harmonic = 2; harmonic <= 3; harmonic++) {
      const hf = frequency * harmonic;
      if (hf < fs / 2) {
        const hw0 = (2 * Math.PI * hf) / fs;
        const halpha = Math.sin(hw0) / (2 * Q);

        const hb1 = -2 * Math.cos(hw0);
        const ha0 = 1 + halpha;
        const ha1 = -2 * Math.cos(hw0);
        const ha2 = 1 - halpha;

        const hnb0 = 1 / ha0;
        const hnb1 = hb1 / ha0;
        const hnb2 = 1 / ha0;
        const hna1 = ha1 / ha0;
        const hna2 = ha2 / ha0;

        filtered = this.applyBiquad(filtered, hnb0, hnb1, hnb2, hna1, hna2);
        filtered.reverse();
        filtered = this.applyBiquad(filtered, hnb0, hnb1, hnb2, hna1, hna2);
        filtered.reverse();
      }
    }

    return filtered;
  }

  /**
   * Apply biquad filter
   */
  private applyBiquad(
    samples: number[],
    b0: number,
    b1: number,
    b2: number,
    a1: number,
    a2: number
  ): number[] {
    const result = new Array(samples.length);
    let x1 = 0, x2 = 0;
    let y1 = 0, y2 = 0;

    for (let i = 0; i < samples.length; i++) {
      const x0 = samples[i];
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;

      result[i] = y0;

      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
    }

    return result;
  }

  /**
   * Detect muscle artifact regions
   */
  private detectMuscleArtifact(
    samples: number[]
  ): Array<{ start: number; end: number; severity: number }> {
    const regions: Array<{ start: number; end: number; severity: number }> = [];

    // Calculate high-frequency energy in sliding windows
    const windowSize = Math.floor(this.config.sampleRate * 0.1); // 100ms window
    const stepSize = Math.floor(windowSize / 2);

    // High-pass filter to isolate high-frequency noise
    const highPassed = this.highPassFilter(samples, 40); // 40 Hz cutoff

    let regionStart = -1;
    let maxSeverity = 0;

    for (let i = 0; i < samples.length - windowSize; i += stepSize) {
      const window = highPassed.slice(i, i + windowSize);

      // Calculate RMS of high-frequency content
      const rms = Math.sqrt(window.reduce((sum, v) => sum + v * v, 0) / window.length);

      // Calculate signal RMS in same window
      const signalWindow = samples.slice(i, i + windowSize);
      const signalRms = Math.sqrt(signalWindow.reduce((sum, v) => sum + v * v, 0) / window.length);

      // Severity is ratio of high-freq to total
      const severity = signalRms > 0 ? rms / signalRms : 0;

      // Threshold for artifact detection
      const threshold = 0.3;

      if (severity > threshold) {
        if (regionStart < 0) {
          regionStart = i;
          maxSeverity = severity;
        } else {
          maxSeverity = Math.max(maxSeverity, severity);
        }
      } else if (regionStart >= 0) {
        regions.push({
          start: regionStart,
          end: i,
          severity: Math.min(1, maxSeverity),
        });
        regionStart = -1;
        maxSeverity = 0;
      }
    }

    // Close any open region
    if (regionStart >= 0) {
      regions.push({
        start: regionStart,
        end: samples.length,
        severity: Math.min(1, maxSeverity),
      });
    }

    return regions;
  }

  /**
   * Simple high-pass filter
   */
  private highPassFilter(samples: number[], cutoffHz: number): number[] {
    const rc = 1 / (2 * Math.PI * cutoffHz);
    const dt = 1 / this.config.sampleRate;
    const alpha = rc / (rc + dt);

    const result = new Array(samples.length);
    result[0] = samples[0];

    for (let i = 1; i < samples.length; i++) {
      result[i] = alpha * (result[i - 1] + samples[i] - samples[i - 1]);
    }

    return result;
  }
}

/**
 * Filter all leads in an ECG signal
 */
export function filterECGSignal(
  leads: Partial<Record<LeadName, number[]>>,
  sampleRate: number,
  config?: Partial<FilterConfig>
): {
  filtered: Partial<Record<LeadName, number[]>>;
  results: Partial<Record<LeadName, FilterResult>>;
} {
  const filter = new ECGSignalFilter({ sampleRate, ...config });
  const filtered: Partial<Record<LeadName, number[]>> = {};
  const results: Partial<Record<LeadName, FilterResult>> = {};

  for (const [lead, samples] of Object.entries(leads) as [LeadName, number[]][]) {
    if (samples && samples.length > 0) {
      const result = filter.filter(samples);
      filtered[lead] = result.filtered;
      results[lead] = result;
    }
  }

  return { filtered, results };
}

/**
 * Detect signal quality issues
 */
export interface SignalQualityIssue {
  type: 'baseline_wander' | 'powerline_noise' | 'muscle_artifact' | 'saturation' | 'flat_line';
  severity: 'minor' | 'moderate' | 'severe';
  description: string;
  affectedLeads?: LeadName[];
  regions?: Array<{ start: number; end: number }>;
}

/**
 * Comprehensive signal quality analysis
 */
export function analyzeSignalQuality(
  leads: Partial<Record<LeadName, number[]>>,
  sampleRate: number
): {
  overallQuality: number;
  issues: SignalQualityIssue[];
  perLeadQuality: Partial<Record<LeadName, number>>;
} {
  const issues: SignalQualityIssue[] = [];
  const perLeadQuality: Partial<Record<LeadName, number>> = {};
  let totalQuality = 0;
  let leadCount = 0;

  for (const [lead, samples] of Object.entries(leads) as [LeadName, number[]][]) {
    if (!samples || samples.length === 0) continue;

    let quality = 1.0;

    // Check for flat line
    const variance = calculateVariance(samples);
    if (variance < 10) {
      issues.push({
        type: 'flat_line',
        severity: 'severe',
        description: `Lead ${lead} appears to be flat or disconnected`,
        affectedLeads: [lead],
      });
      quality *= 0.1;
    }

    // Check for saturation (clipping)
    const { maxClip, minClip } = detectSaturation(samples);
    if (maxClip > 0.05 || minClip > 0.05) {
      issues.push({
        type: 'saturation',
        severity: maxClip > 0.1 || minClip > 0.1 ? 'severe' : 'moderate',
        description: `Lead ${lead} shows signal clipping (${((maxClip + minClip) * 100).toFixed(1)}% of samples)`,
        affectedLeads: [lead],
      });
      quality *= (1 - (maxClip + minClip));
    }

    // Check for baseline wander
    const wanderAmount = detectBaselineWander(samples, sampleRate);
    if (wanderAmount > 0.3) {
      issues.push({
        type: 'baseline_wander',
        severity: wanderAmount > 0.6 ? 'severe' : wanderAmount > 0.4 ? 'moderate' : 'minor',
        description: `Lead ${lead} has baseline wander`,
        affectedLeads: [lead],
      });
      quality *= (1 - wanderAmount * 0.3);
    }

    perLeadQuality[lead] = quality;
    totalQuality += quality;
    leadCount++;
  }

  return {
    overallQuality: leadCount > 0 ? totalQuality / leadCount : 0,
    issues,
    perLeadQuality,
  };
}

/**
 * Calculate variance
 */
function calculateVariance(samples: number[]): number {
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return samples.reduce((sum, x) => sum + (x - mean) ** 2, 0) / samples.length;
}

/**
 * Detect signal saturation
 */
function detectSaturation(samples: number[]): { maxClip: number; minClip: number } {
  const max = Math.max(...samples);
  const min = Math.min(...samples);
  const range = max - min;

  // Count samples at extreme values
  const threshold = range * 0.02;
  let maxClipCount = 0;
  let minClipCount = 0;

  for (const s of samples) {
    if (s >= max - threshold) maxClipCount++;
    if (s <= min + threshold) minClipCount++;
  }

  return {
    maxClip: maxClipCount / samples.length,
    minClip: minClipCount / samples.length,
  };
}

/**
 * Detect baseline wander severity
 */
function detectBaselineWander(samples: number[], sampleRate: number): number {
  // Calculate low-frequency content
  const windowSize = Math.floor(sampleRate * 2);
  const baseline: number[] = [];

  for (let i = 0; i < samples.length; i += windowSize) {
    const end = Math.min(i + windowSize, samples.length);
    const window = samples.slice(i, end);
    baseline.push(window.reduce((a, b) => a + b, 0) / window.length);
  }

  if (baseline.length < 2) return 0;

  // Calculate drift
  const maxDrift = Math.max(...baseline) - Math.min(...baseline);
  const signalRange = Math.max(...samples) - Math.min(...samples);

  return signalRange > 0 ? maxDrift / signalRange : 0;
}

// ============================================================================
// ADVANCED FILTERING FUNCTIONS
// Added for improved ECG signal quality during digitization
// ============================================================================

/**
 * Savitzky-Golay filter coefficients for different window sizes and polynomial orders
 * These are pre-computed for common configurations
 */
const SG_COEFFICIENTS: Record<string, number[]> = {
  // Window size 5, polynomial order 2 (quadratic smoothing)
  '5_2': [-3, 12, 17, 12, -3].map(c => c / 35),
  // Window size 7, polynomial order 2
  '7_2': [-2, 3, 6, 7, 6, 3, -2].map(c => c / 21),
  // Window size 9, polynomial order 2
  '9_2': [-21, 14, 39, 54, 59, 54, 39, 14, -21].map(c => c / 231),
  // Window size 11, polynomial order 2
  '11_2': [-36, 9, 44, 69, 84, 89, 84, 69, 44, 9, -36].map(c => c / 429),
  // Window size 5, polynomial order 4 (better derivative preservation)
  '5_4': [35, -30, -30, -30, 35].map(c => c / 70),
  // Window size 7, polynomial order 4
  '7_4': [5, -30, 75, 131, 75, -30, 5].map(c => c / 231),
};

/**
 * Apply Savitzky-Golay smoothing filter
 * Preserves QRS morphology better than moving average by fitting polynomials
 *
 * @param samples - Input signal samples
 * @param windowSize - Filter window size (must be odd: 5, 7, 9, or 11)
 * @param polyOrder - Polynomial order (2 or 4)
 * @returns Smoothed signal
 */
export function savitzkyGolayFilter(
  samples: number[],
  windowSize: 5 | 7 | 9 | 11 = 7,
  polyOrder: 2 | 4 = 2
): number[] {
  const key = `${windowSize}_${polyOrder}`;
  let coeffs = SG_COEFFICIENTS[key];

  // Fall back to window 7, order 2 if invalid combination
  if (!coeffs) {
    coeffs = SG_COEFFICIENTS['7_2'];
  }

  const halfWindow = Math.floor(coeffs.length / 2);
  const result = new Array(samples.length);

  for (let i = 0; i < samples.length; i++) {
    let sum = 0;

    for (let j = -halfWindow; j <= halfWindow; j++) {
      const idx = i + j;
      // Mirror boundary conditions
      const sampleIdx = idx < 0
        ? -idx
        : idx >= samples.length
          ? 2 * samples.length - idx - 2
          : idx;

      sum += samples[Math.max(0, Math.min(samples.length - 1, sampleIdx))] * coeffs[j + halfWindow];
    }

    result[i] = sum;
  }

  return result;
}

/**
 * Butterworth low-pass filter implementation
 * More aggressive smoothing for very noisy signals
 *
 * @param samples - Input signal samples
 * @param cutoffHz - Cutoff frequency in Hz
 * @param sampleRate - Sample rate in Hz
 * @param order - Filter order (1-4, default 2)
 * @returns Filtered signal
 */
export function butterworthLowPass(
  samples: number[],
  cutoffHz: number,
  sampleRate: number,
  order: number = 2
): number[] {
  // Normalized cutoff frequency
  const wc = Math.tan((Math.PI * cutoffHz) / sampleRate);
  const k = wc;
  const k2 = k * k;

  // Second-order section coefficients
  const sections: Array<{ b0: number; b1: number; b2: number; a1: number; a2: number }> = [];

  // Design Butterworth filter as cascaded biquads
  const numSections = Math.ceil(order / 2);

  for (let i = 0; i < numSections; i++) {
    const theta = (Math.PI * (2 * i + 1)) / (2 * order);
    const pole = Math.cos(theta);

    // Bilinear transform
    const norm = 1 / (1 + 2 * pole * k + k2);

    sections.push({
      b0: k2 * norm,
      b1: 2 * k2 * norm,
      b2: k2 * norm,
      a1: 2 * (k2 - 1) * norm,
      a2: (1 - 2 * pole * k + k2) * norm,
    });
  }

  // Apply each section (forward-backward for zero phase)
  let result = [...samples];

  for (const section of sections) {
    result = applyBiquadSection(result, section);
    result.reverse();
    result = applyBiquadSection(result, section);
    result.reverse();
  }

  return result;
}

/**
 * Apply a single biquad filter section
 */
function applyBiquadSection(
  samples: number[],
  section: { b0: number; b1: number; b2: number; a1: number; a2: number }
): number[] {
  const { b0, b1, b2, a1, a2 } = section;
  const result = new Array(samples.length);

  let x1 = 0, x2 = 0;
  let y1 = 0, y2 = 0;

  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;

    result[i] = y0;

    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return result;
}

/**
 * Adaptive denoising using wavelet-inspired multi-scale approach
 * Removes noise while preserving sharp transients (QRS complexes)
 *
 * @param samples - Input signal samples
 * @param sampleRate - Sample rate in Hz
 * @param aggressiveness - Denoising aggressiveness 0-1 (default 0.5)
 * @returns Denoised signal
 */
export function adaptiveDenoise(
  samples: number[],
  sampleRate: number,
  aggressiveness: number = 0.5
): number[] {
  // Use multi-resolution analysis with different window sizes
  const scales = [
    Math.floor(sampleRate * 0.005), // ~5ms - preserves QRS
    Math.floor(sampleRate * 0.02),  // ~20ms - P/T wave detail
    Math.floor(sampleRate * 0.05),  // ~50ms - general smoothing
  ].filter(s => s >= 3);

  // Estimate noise level using MAD (Median Absolute Deviation)
  const noiseEstimate = estimateNoiseLevel(samples);

  // Threshold based on noise and aggressiveness
  const threshold = noiseEstimate * (1 + 2 * aggressiveness);

  // Apply denoising at each scale
  let result = [...samples];

  for (const windowSize of scales) {
    result = denoiseAtScale(result, windowSize, threshold);
  }

  return result;
}

/**
 * Estimate noise level using MAD (Median Absolute Deviation)
 * Robust to outliers (QRS complexes)
 */
function estimateNoiseLevel(samples: number[]): number {
  // Calculate first differences (high-frequency content)
  const diffs: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    diffs.push(samples[i] - samples[i - 1]);
  }

  // MAD estimate
  const sortedDiffs = diffs.map(d => Math.abs(d)).sort((a, b) => a - b);
  const mad = sortedDiffs[Math.floor(sortedDiffs.length / 2)];

  // Convert MAD to standard deviation estimate (for Gaussian noise)
  return mad / 0.6745;
}

/**
 * Denoise at a specific scale using soft thresholding
 */
function denoiseAtScale(samples: number[], windowSize: number, threshold: number): number[] {
  const halfWindow = Math.floor(windowSize / 2);
  const result = new Array(samples.length);

  for (let i = 0; i < samples.length; i++) {
    // Calculate local statistics
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(samples.length, i + halfWindow + 1);

    const localWindow = samples.slice(start, end);
    const localMean = localWindow.reduce((a, b) => a + b, 0) / localWindow.length;
    const deviation = samples[i] - localMean;

    // Soft thresholding: shrink small deviations, preserve large ones
    if (Math.abs(deviation) < threshold) {
      // Shrink toward local mean
      const shrinkFactor = Math.max(0, 1 - threshold / (Math.abs(deviation) + 1e-10));
      result[i] = localMean + deviation * shrinkFactor;
    } else {
      // Preserve (likely signal, not noise)
      result[i] = samples[i];
    }
  }

  return result;
}

/**
 * Enhanced filtering pipeline optimized for digitized ECG signals
 * Combines multiple techniques for best results
 *
 * @param samples - Input signal samples
 * @param sampleRate - Sample rate in Hz
 * @param options - Filtering options
 * @returns Enhanced signal
 */
export function enhancedDigitizerFilter(
  samples: number[],
  sampleRate: number,
  options: {
    /** Apply Savitzky-Golay smoothing (default: true) */
    smoothing?: boolean;
    /** Smoothing window size (default: 7) */
    smoothingWindow?: 5 | 7 | 9 | 11;
    /** Apply adaptive denoising (default: true) */
    denoise?: boolean;
    /** Denoising aggressiveness 0-1 (default: 0.3) */
    denoiseLevel?: number;
    /** Apply low-pass filter (default: false) */
    lowPass?: boolean;
    /** Low-pass cutoff in Hz (default: 40) */
    lowPassCutoff?: number;
  } = {}
): number[] {
  const {
    smoothing = true,
    smoothingWindow = 7,
    denoise = true,
    denoiseLevel = 0.3,
    lowPass = false,
    lowPassCutoff = 40,
  } = options;

  let result = [...samples];

  // Step 1: Adaptive denoising (preserves QRS while removing noise)
  if (denoise) {
    result = adaptiveDenoise(result, sampleRate, denoiseLevel);
  }

  // Step 2: Savitzky-Golay smoothing (preserves morphology)
  if (smoothing) {
    result = savitzkyGolayFilter(result, smoothingWindow, 2);
  }

  // Step 3: Optional low-pass filter for very noisy signals
  if (lowPass) {
    result = butterworthLowPass(result, lowPassCutoff, sampleRate, 2);
  }

  return result;
}
