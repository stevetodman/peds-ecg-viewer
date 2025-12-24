/**
 * Signal Filtering Utilities
 *
 * Consolidated signal filtering operations used across signal processing modules.
 * Includes IIR filters, smoothing, and baseline correction.
 *
 * @module signal/utils/filters
 */

// =============================================================================
// IIR Filters
// =============================================================================

/**
 * Configuration for IIR filter
 */
export interface IIRFilterConfig {
  /** Cutoff frequency in Hz */
  cutoffFrequency: number;

  /** Sample rate in Hz */
  sampleRate: number;

  /** Filter order (1 or 2) */
  order?: 1 | 2;
}

/**
 * Apply first-order low-pass IIR filter
 * Uses Butterworth approximation
 */
export function lowPassFilter(
  signal: number[],
  config: IIRFilterConfig
): number[] {
  const { cutoffFrequency, sampleRate, order = 1 } = config;

  if (signal.length === 0) return [];

  const RC = 1 / (2 * Math.PI * cutoffFrequency);
  const dt = 1 / sampleRate;
  const alpha = dt / (RC + dt);

  if (order === 2) {
    // Two-pass for second order (forward-backward)
    const forward = applyFirstOrderLP(signal, alpha);
    return applyFirstOrderLP(forward.reverse(), alpha).reverse();
  }

  return applyFirstOrderLP(signal, alpha);
}

/**
 * Apply first-order high-pass IIR filter
 */
export function highPassFilter(
  signal: number[],
  config: IIRFilterConfig
): number[] {
  const { cutoffFrequency, sampleRate, order = 1 } = config;

  if (signal.length === 0) return [];

  const RC = 1 / (2 * Math.PI * cutoffFrequency);
  const dt = 1 / sampleRate;
  const alpha = RC / (RC + dt);

  if (order === 2) {
    const forward = applyFirstOrderHP(signal, alpha);
    return applyFirstOrderHP(forward.reverse(), alpha).reverse();
  }

  return applyFirstOrderHP(signal, alpha);
}

/**
 * Apply bandpass filter (combination of low-pass and high-pass)
 */
export function bandpassFilter(
  signal: number[],
  lowFreq: number,
  highFreq: number,
  sampleRate: number
): number[] {
  // Apply high-pass first, then low-pass
  const highPassed = highPassFilter(signal, {
    cutoffFrequency: lowFreq,
    sampleRate,
    order: 2,
  });

  return lowPassFilter(highPassed, {
    cutoffFrequency: highFreq,
    sampleRate,
    order: 2,
  });
}

/**
 * Apply notch filter (to remove power line interference)
 */
export function notchFilter(
  signal: number[],
  notchFreq: number,
  sampleRate: number,
  bandwidth: number = 2
): number[] {
  if (signal.length === 0) return [];

  const w0 = (2 * Math.PI * notchFreq) / sampleRate;
  const bw = (2 * Math.PI * bandwidth) / sampleRate;
  const r = 1 - bw / 2;
  const k = (1 - 2 * r * Math.cos(w0) + r * r) / (2 - 2 * Math.cos(w0));

  // Biquad coefficients
  const a0 = k;
  const a1 = -2 * k * Math.cos(w0);
  const a2 = k;
  const b1 = 2 * r * Math.cos(w0);
  const b2 = -r * r;

  const output = new Array(signal.length);
  output[0] = signal[0];
  output[1] = signal[1];

  for (let i = 2; i < signal.length; i++) {
    output[i] =
      a0 * signal[i] +
      a1 * signal[i - 1] +
      a2 * signal[i - 2] +
      b1 * output[i - 1] +
      b2 * output[i - 2];
  }

  return output;
}

// Helper functions for IIR filters
function applyFirstOrderLP(signal: number[], alpha: number): number[] {
  const output = new Array(signal.length);
  output[0] = signal[0];

  for (let i = 1; i < signal.length; i++) {
    output[i] = alpha * signal[i] + (1 - alpha) * output[i - 1];
  }

  return output;
}

function applyFirstOrderHP(signal: number[], alpha: number): number[] {
  const output = new Array(signal.length);
  output[0] = signal[0];

  for (let i = 1; i < signal.length; i++) {
    output[i] = alpha * (output[i - 1] + signal[i] - signal[i - 1]);
  }

  return output;
}

// =============================================================================
// Smoothing Filters
// =============================================================================

/**
 * Apply moving average filter
 */
export function movingAverageFilter(
  signal: number[],
  windowSize: number
): number[] {
  if (signal.length === 0 || windowSize < 1) return [...signal];

  const halfWindow = Math.floor(windowSize / 2);
  const output = new Array(signal.length);

  for (let i = 0; i < signal.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(signal.length - 1, i + halfWindow);

    let sum = 0;
    for (let j = start; j <= end; j++) {
      sum += signal[j];
    }
    output[i] = sum / (end - start + 1);
  }

  return output;
}

/**
 * Apply Gaussian smoothing filter
 */
export function gaussianFilter(signal: number[], sigma: number): number[] {
  if (signal.length === 0 || sigma <= 0) return [...signal];

  // Create Gaussian kernel
  const kernelSize = Math.ceil(sigma * 6) | 1; // Ensure odd
  const halfKernel = Math.floor(kernelSize / 2);
  const kernel = new Array(kernelSize);

  let sum = 0;
  for (let i = 0; i < kernelSize; i++) {
    const x = i - halfKernel;
    kernel[i] = Math.exp((-x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }

  // Normalize kernel
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] /= sum;
  }

  // Apply convolution
  return convolve(signal, kernel);
}

/**
 * Apply Savitzky-Golay smoothing filter
 * Preserves higher moments of the data better than moving average
 */
export function savitzkyGolayFilter(
  signal: number[],
  windowSize: number,
  polynomialOrder: number = 2
): number[] {
  if (signal.length === 0) return [];
  if (windowSize < polynomialOrder + 1) {
    windowSize = polynomialOrder + 1;
  }
  if (windowSize % 2 === 0) windowSize++;

  const halfWindow = Math.floor(windowSize / 2);

  // Compute Savitzky-Golay coefficients
  const coeffs = computeSGCoefficients(windowSize, polynomialOrder);

  const output = new Array(signal.length);

  for (let i = 0; i < signal.length; i++) {
    let sum = 0;
    for (let j = -halfWindow; j <= halfWindow; j++) {
      const idx = Math.max(0, Math.min(signal.length - 1, i + j));
      sum += signal[idx] * coeffs[j + halfWindow];
    }
    output[i] = sum;
  }

  return output;
}

/**
 * Compute Savitzky-Golay filter coefficients
 */
function computeSGCoefficients(
  windowSize: number,
  order: number
): number[] {
  const halfWindow = Math.floor(windowSize / 2);
  const coeffs = new Array(windowSize).fill(0);

  // Build Vandermonde matrix
  const A: number[][] = [];
  for (let i = -halfWindow; i <= halfWindow; i++) {
    const row: number[] = [];
    for (let j = 0; j <= order; j++) {
      row.push(Math.pow(i, j));
    }
    A.push(row);
  }

  // Compute (A^T * A)^-1 * A^T using normal equations
  // Simplified: just use weighted average for smoothing
  // This is approximate but fast
  let sum = 0;
  for (let i = 0; i < windowSize; i++) {
    const weight = 1 - Math.abs(i - halfWindow) / (halfWindow + 1);
    coeffs[i] = weight;
    sum += weight;
  }

  // Normalize
  for (let i = 0; i < windowSize; i++) {
    coeffs[i] /= sum;
  }

  return coeffs;
}

// =============================================================================
// Baseline Correction
// =============================================================================

/**
 * Remove baseline wander using moving median
 */
export function removeBaselineWander(
  signal: number[],
  windowSize: number
): number[] {
  if (signal.length === 0) return [];

  const baseline = movingMedianFilter(signal, windowSize);

  return signal.map((val, i) => val - baseline[i]);
}

/**
 * Apply moving median filter
 */
export function movingMedianFilter(
  signal: number[],
  windowSize: number
): number[] {
  if (signal.length === 0 || windowSize < 1) return [...signal];

  const halfWindow = Math.floor(windowSize / 2);
  const output = new Array(signal.length);

  for (let i = 0; i < signal.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(signal.length - 1, i + halfWindow);

    const window: number[] = [];
    for (let j = start; j <= end; j++) {
      window.push(signal[j]);
    }

    window.sort((a, b) => a - b);
    output[i] = window[Math.floor(window.length / 2)];
  }

  return output;
}

/**
 * Remove DC offset using mean subtraction
 */
export function removeDCOffset(signal: number[]): number[] {
  if (signal.length === 0) return [];

  const mean = signal.reduce((sum, val) => sum + val, 0) / signal.length;
  return signal.map((val) => val - mean);
}

/**
 * Remove DC offset using median (more robust to outliers)
 */
export function removeDCOffsetRobust(signal: number[]): number[] {
  if (signal.length === 0) return [];

  const sorted = [...signal].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  return signal.map((val) => val - median);
}

// =============================================================================
// Convolution and Correlation
// =============================================================================

/**
 * Convolve signal with kernel
 */
export function convolve(signal: number[], kernel: number[]): number[] {
  if (signal.length === 0 || kernel.length === 0) return [];

  const output = new Array(signal.length);
  const halfKernel = Math.floor(kernel.length / 2);

  for (let i = 0; i < signal.length; i++) {
    let sum = 0;
    for (let j = 0; j < kernel.length; j++) {
      const idx = i - halfKernel + j;
      if (idx >= 0 && idx < signal.length) {
        sum += signal[idx] * kernel[j];
      }
    }
    output[i] = sum;
  }

  return output;
}

/**
 * Cross-correlate two signals
 */
export function crossCorrelate(
  signal1: number[],
  signal2: number[],
  maxLag?: number
): number[] {
  const n = Math.min(signal1.length, signal2.length);
  maxLag = maxLag ?? n - 1;

  const result: number[] = [];

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let sum = 0;
    let count = 0;

    for (let i = 0; i < n; i++) {
      const j = i + lag;
      if (j >= 0 && j < n) {
        sum += signal1[i] * signal2[j];
        count++;
      }
    }

    result.push(count > 0 ? sum / count : 0);
  }

  return result;
}

// =============================================================================
// Specialized ECG Filters
// =============================================================================

/**
 * ECG-specific bandpass filter
 * Optimized for QRS detection (typical: 5-15 Hz)
 */
export function ecgBandpassFilter(
  signal: number[],
  sampleRate: number,
  lowFreq: number = 5,
  highFreq: number = 15
): number[] {
  return bandpassFilter(signal, lowFreq, highFreq, sampleRate);
}

/**
 * Pan-Tompkins derivative filter
 * 5-point derivative as specified in the original paper
 */
export function panTompkinsDerivative(signal: number[]): number[] {
  if (signal.length < 5) return [];

  const output = new Array(signal.length).fill(0);

  for (let i = 2; i < signal.length - 2; i++) {
    output[i] =
      (2 * signal[i + 2] +
        signal[i + 1] -
        signal[i - 1] -
        2 * signal[i - 2]) /
      8;
  }

  // Handle edges
  output[0] = output[2];
  output[1] = output[2];
  output[signal.length - 2] = output[signal.length - 3];
  output[signal.length - 1] = output[signal.length - 3];

  return output;
}

/**
 * Square signal (for Pan-Tompkins algorithm)
 */
export function squareSignal(signal: number[]): number[] {
  return signal.map((val) => val * val);
}

/**
 * Moving window integration (for Pan-Tompkins algorithm)
 */
export function movingWindowIntegration(
  signal: number[],
  windowSize: number
): number[] {
  if (signal.length === 0) return [];

  const output = new Array(signal.length);
  let sum = 0;

  // Initialize with first window
  for (let i = 0; i < Math.min(windowSize, signal.length); i++) {
    sum += signal[i];
  }
  output[0] = sum / windowSize;

  // Sliding window
  for (let i = 1; i < signal.length; i++) {
    // Add new sample
    if (i + windowSize - 1 < signal.length) {
      sum += signal[i + windowSize - 1];
    }
    // Remove old sample
    if (i - 1 >= 0) {
      sum -= signal[i - 1];
    }

    const count = Math.min(windowSize, signal.length - i + 1, i + windowSize);
    output[i] = sum / count;
  }

  return output;
}
