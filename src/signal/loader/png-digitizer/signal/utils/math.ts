/**
 * Mathematical Utility Functions
 *
 * Consolidated math operations used across signal processing modules.
 * Includes peak finding, threshold calculation, and direction analysis.
 *
 * @module signal/utils/math
 */

import { percentile } from './statistics';

// =============================================================================
// Peak and Extrema Finding
// =============================================================================

/**
 * Find the index of the local maximum in a range
 *
 * @param signal Input signal array
 * @param start Start index (inclusive)
 * @param end End index (inclusive)
 * @param useAbsolute If true, find maximum of absolute values
 */
export function findLocalMaximum(
  signal: number[],
  start: number,
  end: number,
  useAbsolute: boolean = false
): number {
  start = Math.max(0, start);
  end = Math.min(signal.length - 1, end);

  if (start > end) return start;

  let maxIdx = start;
  let maxVal = useAbsolute ? Math.abs(signal[start]) : signal[start];

  for (let i = start + 1; i <= end; i++) {
    const val = useAbsolute ? Math.abs(signal[i]) : signal[i];
    if (val > maxVal) {
      maxVal = val;
      maxIdx = i;
    }
  }

  return maxIdx;
}

/**
 * Find the index of the local minimum in a range
 */
export function findLocalMinimum(
  signal: number[],
  start: number,
  end: number,
  useAbsolute: boolean = false
): number {
  start = Math.max(0, start);
  end = Math.min(signal.length - 1, end);

  if (start > end) return start;

  let minIdx = start;
  let minVal = useAbsolute ? Math.abs(signal[start]) : signal[start];

  for (let i = start + 1; i <= end; i++) {
    const val = useAbsolute ? Math.abs(signal[i]) : signal[i];
    if (val < minVal) {
      minVal = val;
      minIdx = i;
    }
  }

  return minIdx;
}

/**
 * Find all local maxima (peaks) in a signal
 *
 * @param signal Input signal array
 * @param minHeight Minimum peak height
 * @param minDistance Minimum distance between peaks
 */
export function findAllPeaks(
  signal: number[],
  minHeight: number = -Infinity,
  minDistance: number = 1
): number[] {
  const peaks: number[] = [];

  for (let i = 1; i < signal.length - 1; i++) {
    if (
      signal[i] > signal[i - 1] &&
      signal[i] > signal[i + 1] &&
      signal[i] >= minHeight
    ) {
      // Check minimum distance from last peak
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDistance) {
        peaks.push(i);
      } else if (signal[i] > signal[peaks[peaks.length - 1]]) {
        // Replace last peak if this one is higher
        peaks[peaks.length - 1] = i;
      }
    }
  }

  return peaks;
}

/**
 * Find all local minima (troughs) in a signal
 */
export function findAllTroughs(
  signal: number[],
  maxHeight: number = Infinity,
  minDistance: number = 1
): number[] {
  const troughs: number[] = [];

  for (let i = 1; i < signal.length - 1; i++) {
    if (
      signal[i] < signal[i - 1] &&
      signal[i] < signal[i + 1] &&
      signal[i] <= maxHeight
    ) {
      if (troughs.length === 0 || i - troughs[troughs.length - 1] >= minDistance) {
        troughs.push(i);
      } else if (signal[i] < signal[troughs[troughs.length - 1]]) {
        troughs[troughs.length - 1] = i;
      }
    }
  }

  return troughs;
}

/**
 * Refine peak location using parabolic interpolation
 * Returns sub-sample accurate peak location
 */
export function refinePeakLocation(
  signal: number[],
  peakIndex: number
): { index: number; value: number } {
  if (peakIndex <= 0 || peakIndex >= signal.length - 1) {
    return { index: peakIndex, value: signal[peakIndex] };
  }

  const y0 = signal[peakIndex - 1];
  const y1 = signal[peakIndex];
  const y2 = signal[peakIndex + 1];

  // Parabolic interpolation
  const d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2));

  if (Math.abs(d) > 1) {
    // Interpolation failed, return original
    return { index: peakIndex, value: y1 };
  }

  const refinedIndex = peakIndex + d;
  const refinedValue = y1 - 0.25 * (y0 - y2) * d;

  return { index: refinedIndex, value: refinedValue };
}

// =============================================================================
// Direction and Slope Analysis
// =============================================================================

/**
 * Count the number of direction changes in a signal segment
 * Useful for detecting notches, QRS complexity, etc.
 */
export function countDirectionChanges(
  signal: number[],
  start: number,
  end: number
): number {
  start = Math.max(0, start);
  end = Math.min(signal.length - 1, end);

  if (end - start < 2) return 0;

  let changes = 0;
  let prevDirection = 0;

  for (let i = start + 1; i <= end; i++) {
    const direction = Math.sign(signal[i] - signal[i - 1]);
    if (direction !== 0 && direction !== prevDirection) {
      if (prevDirection !== 0) {
        changes++;
      }
      prevDirection = direction;
    }
  }

  return changes;
}

/**
 * Calculate the slope at a point using central difference
 */
export function slopeAt(signal: number[], index: number): number {
  if (index <= 0) {
    return signal[1] - signal[0];
  }
  if (index >= signal.length - 1) {
    return signal[signal.length - 1] - signal[signal.length - 2];
  }
  return (signal[index + 1] - signal[index - 1]) / 2;
}

/**
 * Calculate the maximum slope in a range
 */
export function maxSlope(
  signal: number[],
  start: number,
  end: number
): { index: number; slope: number } {
  start = Math.max(1, start);
  end = Math.min(signal.length - 2, end);

  let maxIdx = start;
  let maxSlopeVal = Math.abs(slopeAt(signal, start));

  for (let i = start + 1; i <= end; i++) {
    const slope = Math.abs(slopeAt(signal, i));
    if (slope > maxSlopeVal) {
      maxSlopeVal = slope;
      maxIdx = i;
    }
  }

  return { index: maxIdx, slope: slopeAt(signal, maxIdx) };
}

/**
 * Find zero crossings in a signal segment
 */
export function findZeroCrossings(
  signal: number[],
  start: number = 0,
  end?: number
): number[] {
  end = end ?? signal.length - 1;
  start = Math.max(0, start);
  end = Math.min(signal.length - 1, end);

  const crossings: number[] = [];

  for (let i = start; i < end; i++) {
    if (
      (signal[i] <= 0 && signal[i + 1] > 0) ||
      (signal[i] >= 0 && signal[i + 1] < 0)
    ) {
      // Linear interpolation for more accurate crossing point
      const t = -signal[i] / (signal[i + 1] - signal[i]);
      crossings.push(i + t);
    }
  }

  return crossings;
}

// =============================================================================
// Threshold Calculation
// =============================================================================

/**
 * Calculate adaptive threshold using IQR method
 */
export function adaptiveThresholdIQR(
  data: number[],
  factor: number = 0.5
): number {
  const q = { q1: percentile(data, 0.25), q3: percentile(data, 0.75) };
  return q.q1 + factor * (q.q3 - q.q1);
}

/**
 * Calculate adaptive threshold using percentile
 */
export function adaptiveThresholdPercentile(
  data: number[],
  p: number = 0.75
): number {
  return percentile(data, p);
}

/**
 * Calculate Otsu's threshold for bimodal distribution
 */
export function otsuThreshold(data: number[], numBins: number = 256): number {
  if (data.length === 0) return 0;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;

  if (range === 0) return min;

  // Build histogram
  const histogram = new Array(numBins).fill(0);
  for (const val of data) {
    const bin = Math.min(
      numBins - 1,
      Math.floor(((val - min) / range) * (numBins - 1))
    );
    histogram[bin]++;
  }

  // Normalize histogram
  const total = data.length;
  const prob = histogram.map((h) => h / total);

  // Find threshold that maximizes between-class variance
  let maxVariance = 0;
  let threshold = 0;

  let w0 = 0;
  let sum0 = 0;
  let sumTotal = 0;

  for (let i = 0; i < numBins; i++) {
    sumTotal += i * prob[i];
  }

  for (let t = 0; t < numBins; t++) {
    w0 += prob[t];
    if (w0 === 0) continue;

    const w1 = 1 - w0;
    if (w1 === 0) break;

    sum0 += t * prob[t];

    const mean0 = sum0 / w0;
    const mean1 = (sumTotal - sum0) / w1;

    const betweenVariance = w0 * w1 * Math.pow(mean0 - mean1, 2);

    if (betweenVariance > maxVariance) {
      maxVariance = betweenVariance;
      threshold = t;
    }
  }

  return min + (threshold / (numBins - 1)) * range;
}

// =============================================================================
// Smoothing and Differentiation
// =============================================================================

/**
 * Apply moving average smoothing
 */
export function movingAverage(signal: number[], windowSize: number): number[] {
  if (windowSize < 1) return [...signal];
  if (signal.length === 0) return [];

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
 * Apply weighted moving average (triangular window)
 */
export function weightedMovingAverage(
  signal: number[],
  windowSize: number
): number[] {
  if (windowSize < 1) return [...signal];
  if (signal.length === 0) return [];

  const halfWindow = Math.floor(windowSize / 2);
  const output = new Array(signal.length);

  for (let i = 0; i < signal.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(signal.length - 1, i + halfWindow);

    let sum = 0;
    let weightSum = 0;

    for (let j = start; j <= end; j++) {
      const weight = halfWindow + 1 - Math.abs(j - i);
      sum += signal[j] * weight;
      weightSum += weight;
    }

    output[i] = sum / weightSum;
  }

  return output;
}

/**
 * Calculate first derivative using central difference
 */
export function differentiate(signal: number[]): number[] {
  if (signal.length < 2) return [];

  const derivative = new Array(signal.length);

  // Forward difference at start
  derivative[0] = signal[1] - signal[0];

  // Central difference in middle
  for (let i = 1; i < signal.length - 1; i++) {
    derivative[i] = (signal[i + 1] - signal[i - 1]) / 2;
  }

  // Backward difference at end
  derivative[signal.length - 1] =
    signal[signal.length - 1] - signal[signal.length - 2];

  return derivative;
}

/**
 * Calculate second derivative
 */
export function secondDerivative(signal: number[]): number[] {
  if (signal.length < 3) return [];

  const derivative = new Array(signal.length);

  derivative[0] = 0;
  derivative[signal.length - 1] = 0;

  for (let i = 1; i < signal.length - 1; i++) {
    derivative[i] = signal[i - 1] - 2 * signal[i] + signal[i + 1];
  }

  return derivative;
}

// =============================================================================
// Interpolation
// =============================================================================

/**
 * Linear interpolation between two points
 */
export function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

/**
 * Interpolate signal value at fractional index
 */
export function interpolateAt(signal: number[], index: number): number {
  if (index <= 0) return signal[0];
  if (index >= signal.length - 1) return signal[signal.length - 1];

  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const t = index - lower;

  return lerp(signal[lower], signal[upper], t);
}

/**
 * Resample signal to new length using linear interpolation
 */
export function resampleLinear(signal: number[], newLength: number): number[] {
  if (signal.length === 0 || newLength <= 0) return [];
  if (signal.length === newLength) return [...signal];

  const output = new Array(newLength);
  const ratio = (signal.length - 1) / (newLength - 1);

  for (let i = 0; i < newLength; i++) {
    output[i] = interpolateAt(signal, i * ratio);
  }

  return output;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Clamp a value to a range
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Normalize signal to range [0, 1]
 */
export function normalize(signal: number[]): number[] {
  if (signal.length === 0) return [];

  const min = Math.min(...signal);
  const max = Math.max(...signal);
  const range = max - min;

  if (range === 0) return signal.map(() => 0.5);

  return signal.map((val) => (val - min) / range);
}

/**
 * Normalize signal to have zero mean and unit variance
 */
export function standardize(signal: number[]): number[] {
  if (signal.length === 0) return [];

  const avg =
    signal.reduce((sum, val) => sum + val, 0) / signal.length;
  const std = Math.sqrt(
    signal.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / signal.length
  );

  if (std === 0) return signal.map(() => 0);

  return signal.map((val) => (val - avg) / std);
}
