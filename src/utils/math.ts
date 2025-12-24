/**
 * Mathematical utilities
 * @module utils/math
 */

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Round to specified decimal places
 */
export function round(value: number, decimals: number = 0): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Calculate mean of an array
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate median of an array
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculate standard deviation
 */
export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;

  const avg = mean(values);
  const squareDiffs = values.map(value => Math.pow(value - avg, 2));
  const avgSquareDiff = mean(squareDiffs);

  return Math.sqrt(avgSquareDiff);
}

/**
 * Calculate percentile of a sorted array
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (p <= 0) return sortedValues[0];
  if (p >= 100) return sortedValues[sortedValues.length - 1];

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sortedValues[lower];

  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

/**
 * Convert degrees to radians
 */
export function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 */
export function radiansToDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Normalize angle to -180 to +180 range
 */
export function normalizeAngle(degrees: number): number {
  let normalized = degrees % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized < -180) normalized += 360;
  return normalized;
}

/**
 * Calculate RMS (Root Mean Square)
 */
export function rms(values: number[]): number {
  if (values.length === 0) return 0;
  const squares = values.map(v => v * v);
  return Math.sqrt(mean(squares));
}

/**
 * Find local maxima in an array
 */
export function findLocalMaxima(
  values: number[],
  minDistance: number = 1
): number[] {
  const maxima: number[] = [];

  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] > values[i - 1] && values[i] > values[i + 1]) {
      // Check minimum distance from previous maximum
      if (maxima.length === 0 || i - maxima[maxima.length - 1] >= minDistance) {
        maxima.push(i);
      } else if (values[i] > values[maxima[maxima.length - 1]]) {
        // Replace previous maximum if this one is higher
        maxima[maxima.length - 1] = i;
      }
    }
  }

  return maxima;
}

/**
 * Find local minima in an array
 */
export function findLocalMinima(
  values: number[],
  minDistance: number = 1
): number[] {
  const minima: number[] = [];

  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] < values[i - 1] && values[i] < values[i + 1]) {
      if (minima.length === 0 || i - minima[minima.length - 1] >= minDistance) {
        minima.push(i);
      } else if (values[i] < values[minima[minima.length - 1]]) {
        minima[minima.length - 1] = i;
      }
    }
  }

  return minima;
}
