/**
 * Statistical Utility Functions
 *
 * Consolidated statistical calculations used across signal processing modules.
 * Eliminates duplication of common statistical operations.
 *
 * @module signal/utils/statistics
 */

// =============================================================================
// Basic Statistics
// =============================================================================

/**
 * Calculate the mean (average) of an array
 */
export function mean(data: number[]): number {
  if (data.length === 0) return 0;
  return data.reduce((sum, val) => sum + val, 0) / data.length;
}

/**
 * Calculate the median of an array
 */
export function median(data: number[]): number {
  if (data.length === 0) return 0;
  const sorted = [...data].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Calculate variance of an array
 * @param usePopulation If true, divide by n (population); if false, divide by n-1 (sample)
 */
export function variance(data: number[], usePopulation: boolean = true): number {
  if (data.length === 0) return 0;
  const n = data.length;
  const avg = mean(data);
  const sumSquaredDiff = data.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0);
  return sumSquaredDiff / (usePopulation ? n : Math.max(1, n - 1));
}

/**
 * Calculate standard deviation of an array
 * @param usePopulation If true, use population formula; if false, use sample formula
 */
export function standardDeviation(data: number[], usePopulation: boolean = true): number {
  return Math.sqrt(variance(data, usePopulation));
}

/**
 * Calculate root mean square (RMS) of an array
 */
export function rms(data: number[]): number {
  if (data.length === 0) return 0;
  const sumSquares = data.reduce((sum, val) => sum + val * val, 0);
  return Math.sqrt(sumSquares / data.length);
}

/**
 * Calculate root mean square of successive differences (RMSSD)
 * Common HRV metric
 */
export function rmssd(data: number[]): number {
  if (data.length < 2) return 0;
  let sumSquaredDiff = 0;
  for (let i = 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    sumSquaredDiff += diff * diff;
  }
  return Math.sqrt(sumSquaredDiff / (data.length - 1));
}

// =============================================================================
// Percentiles and Quartiles
// =============================================================================

/**
 * Calculate a specific percentile
 * @param p Percentile value between 0 and 1 (e.g., 0.5 for median)
 */
export function percentile(data: number[], p: number): number {
  if (data.length === 0) return 0;
  if (p <= 0) return Math.min(...data);
  if (p >= 1) return Math.max(...data);

  const sorted = [...data].sort((a, b) => a - b);
  const index = p * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];

  // Linear interpolation
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Calculate quartiles (Q1, Q2, Q3)
 */
export function quartiles(data: number[]): { q1: number; q2: number; q3: number } {
  return {
    q1: percentile(data, 0.25),
    q2: percentile(data, 0.5),
    q3: percentile(data, 0.75),
  };
}

/**
 * Calculate interquartile range (IQR)
 */
export function iqr(data: number[]): number {
  const q = quartiles(data);
  return q.q3 - q.q1;
}

// =============================================================================
// Robust Statistics
// =============================================================================

/**
 * Calculate median absolute deviation (MAD)
 * A robust measure of variability
 */
export function medianAbsoluteDeviation(data: number[]): number {
  if (data.length === 0) return 0;
  const med = median(data);
  const deviations = data.map((val) => Math.abs(val - med));
  return median(deviations);
}

/**
 * Calculate MAD-based standard deviation estimate
 * Uses the consistency constant 1.4826 for normal distributions
 */
export function madStandardDeviation(data: number[]): number {
  return medianAbsoluteDeviation(data) * 1.4826;
}

/**
 * Filter outliers using IQR method
 * @param multiplier IQR multiplier for outlier threshold (default 1.5)
 */
export function filterOutliersIQR(
  data: number[],
  multiplier: number = 1.5
): number[] {
  if (data.length === 0) return [];
  const q = quartiles(data);
  const iqrValue = q.q3 - q.q1;
  const lowerBound = q.q1 - multiplier * iqrValue;
  const upperBound = q.q3 + multiplier * iqrValue;
  return data.filter((val) => val >= lowerBound && val <= upperBound);
}

/**
 * Filter outliers using MAD method
 * @param threshold MAD multiplier for outlier detection (default 3)
 */
export function filterOutliersMAD(
  data: number[],
  threshold: number = 3
): number[] {
  if (data.length === 0) return [];
  const med = median(data);
  const mad = medianAbsoluteDeviation(data);
  if (mad === 0) return data; // All values are the same
  return data.filter((val) => Math.abs(val - med) / mad <= threshold);
}

// =============================================================================
// Correlation and Regression
// =============================================================================

/**
 * Calculate Pearson correlation coefficient between two arrays
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
  );

  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Calculate Spearman rank correlation coefficient
 */
export function spearmanCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  // Convert to ranks
  const rankX = toRanks(x.slice(0, n));
  const rankY = toRanks(y.slice(0, n));

  return pearsonCorrelation(rankX, rankY);
}

/**
 * Convert values to ranks (for Spearman correlation)
 */
function toRanks(data: number[]): number[] {
  const indexed = data.map((val, idx) => ({ val, idx }));
  indexed.sort((a, b) => a.val - b.val);

  const ranks = new Array(data.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    // Handle ties by averaging ranks
    while (j < indexed.length && indexed[j].val === indexed[i].val) {
      j++;
    }
    const avgRank = (i + j + 1) / 2; // Average rank for ties
    for (let k = i; k < j; k++) {
      ranks[indexed[k].idx] = avgRank;
    }
    i = j;
  }

  return ranks;
}

/**
 * Linear regression: returns slope and intercept
 */
export function linearRegression(
  x: number[],
  y: number[]
): { slope: number; intercept: number; r2: number } {
  const n = Math.min(x.length, y.length);
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

  const meanX = mean(x.slice(0, n));
  const meanY = mean(y.slice(0, n));

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denominator += dx * dx;
  }

  const slope = denominator > 0 ? numerator / denominator : 0;
  const intercept = meanY - slope * meanX;

  // Calculate R-squared
  const r = pearsonCorrelation(x.slice(0, n), y.slice(0, n));
  const r2 = r * r;

  return { slope, intercept, r2 };
}

/**
 * Calculate just the slope of linear regression
 */
export function linearRegressionSlope(x: number[], y: number[]): number {
  return linearRegression(x, y).slope;
}

// =============================================================================
// Summary Statistics
// =============================================================================

/**
 * Complete statistical summary of an array
 */
export interface StatisticsSummary {
  n: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  range: number;
  variance: number;
  stdDev: number;
  q1: number;
  q3: number;
  iqr: number;
  mad: number;
}

/**
 * Calculate complete summary statistics
 */
export function summarize(data: number[]): StatisticsSummary {
  if (data.length === 0) {
    return {
      n: 0,
      mean: 0,
      median: 0,
      min: 0,
      max: 0,
      range: 0,
      variance: 0,
      stdDev: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
      mad: 0,
    };
  }

  const sorted = [...data].sort((a, b) => a - b);
  const minVal = sorted[0];
  const maxVal = sorted[sorted.length - 1];
  const q = quartiles(data);

  return {
    n: data.length,
    mean: mean(data),
    median: q.q2,
    min: minVal,
    max: maxVal,
    range: maxVal - minVal,
    variance: variance(data),
    stdDev: standardDeviation(data),
    q1: q.q1,
    q3: q.q3,
    iqr: q.q3 - q.q1,
    mad: medianAbsoluteDeviation(data),
  };
}

// =============================================================================
// Entropy and Complexity
// =============================================================================

/**
 * Calculate sample entropy (approximate entropy variant)
 * Used for HRV non-linear analysis
 *
 * @param data Input time series
 * @param m Embedding dimension (typically 2)
 * @param r Tolerance (typically 0.2 * stdDev)
 */
export function sampleEntropy(
  data: number[],
  m: number = 2,
  r?: number
): number {
  const n = data.length;
  if (n < m + 2) return 0;

  // Default tolerance: 0.2 * std dev
  const tolerance = r ?? 0.2 * standardDeviation(data);
  if (tolerance === 0) return 0;

  // Count template matches for dimension m and m+1
  let B = 0; // Matches for dimension m
  let A = 0; // Matches for dimension m+1

  for (let i = 0; i < n - m; i++) {
    for (let j = i + 1; j < n - m; j++) {
      // Check m-length template match
      let matchM = true;
      for (let k = 0; k < m; k++) {
        if (Math.abs(data[i + k] - data[j + k]) > tolerance) {
          matchM = false;
          break;
        }
      }

      if (matchM) {
        B++;
        // Check (m+1)-length template match
        if (
          i + m < n &&
          j + m < n &&
          Math.abs(data[i + m] - data[j + m]) <= tolerance
        ) {
          A++;
        }
      }
    }
  }

  if (B === 0) return 0;
  return -Math.log(A / B);
}
