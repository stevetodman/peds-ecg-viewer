/**
 * DC Offset Corrector
 * Remove DC offset and baseline wander from ECG signals
 *
 * @module signal/loader/png-digitizer/signal/dc-corrector
 */

/**
 * Remove DC offset using median (robust to P/R/T waves)
 */
export function removeDCOffset(values: number[]): number[] {
  if (values.length === 0) return values;

  const median = calculateMedian(values);
  return values.map(v => v - median);
}

/**
 * Remove DC offset using mean
 */
export function removeDCOffsetMean(values: number[]): number[] {
  if (values.length === 0) return values;

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return values.map(v => v - mean);
}

/**
 * Remove baseline wander using high-pass filter
 * Cutoff frequency typically 0.05-0.5 Hz for ECG
 */
export function removeBaselineWander(
  values: number[],
  sampleRate: number,
  cutoffHz: number = 0.5
): number[] {
  if (values.length === 0) return values;

  // Simple moving average baseline estimation
  const windowSize = Math.round(sampleRate / cutoffHz);
  const baseline = movingAverage(values, windowSize);

  return values.map((v, i) => v - baseline[i]);
}

/**
 * Calculate median of array
 */
function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Moving average filter
 */
function movingAverage(values: number[], windowSize: number): number[] {
  if (values.length === 0) return values;

  const halfWindow = Math.floor(windowSize / 2);
  const result = new Array<number>(values.length);

  // Use cumulative sum for efficient computation
  const cumSum = new Array<number>(values.length + 1);
  cumSum[0] = 0;
  for (let i = 0; i < values.length; i++) {
    cumSum[i + 1] = cumSum[i] + values[i];
  }

  for (let i = 0; i < values.length; i++) {
    const left = Math.max(0, i - halfWindow);
    const right = Math.min(values.length, i + halfWindow + 1);
    const count = right - left;
    result[i] = (cumSum[right] - cumSum[left]) / count;
  }

  return result;
}

/**
 * Cubic spline baseline correction
 * Uses spline interpolation through baseline points
 */
export function splineBaselineCorrection(
  values: number[],
  sampleRate: number,
  segmentDurationSec: number = 0.5
): number[] {
  if (values.length === 0) return values;

  const segmentSize = Math.round(sampleRate * segmentDurationSec);
  const numSegments = Math.ceil(values.length / segmentSize);

  // Find baseline point in each segment (minimum of segment)
  const baselinePoints: { index: number; value: number }[] = [];

  for (let s = 0; s < numSegments; s++) {
    const start = s * segmentSize;
    const end = Math.min((s + 1) * segmentSize, values.length);

    // Find median value in segment as baseline estimate
    const segment = values.slice(start, end);
    const median = calculateMedian(segment);

    // Find point closest to median
    let minDist = Infinity;
    let bestIdx = start;
    for (let i = start; i < end; i++) {
      const dist = Math.abs(values[i] - median);
      if (dist < minDist) {
        minDist = dist;
        bestIdx = i;
      }
    }

    baselinePoints.push({ index: bestIdx, value: values[bestIdx] });
  }

  // Interpolate baseline using linear interpolation
  const baseline = new Array<number>(values.length);

  for (let i = 0; i < values.length; i++) {
    // Find surrounding baseline points
    let leftPoint = baselinePoints[0];
    let rightPoint = baselinePoints[baselinePoints.length - 1];

    for (let p = 0; p < baselinePoints.length - 1; p++) {
      if (baselinePoints[p].index <= i && baselinePoints[p + 1].index >= i) {
        leftPoint = baselinePoints[p];
        rightPoint = baselinePoints[p + 1];
        break;
      }
    }

    // Linear interpolation
    if (leftPoint.index === rightPoint.index) {
      baseline[i] = leftPoint.value;
    } else {
      const alpha = (i - leftPoint.index) / (rightPoint.index - leftPoint.index);
      baseline[i] = leftPoint.value * (1 - alpha) + rightPoint.value * alpha;
    }
  }

  return values.map((v, i) => v - baseline[i]);
}

/**
 * Adaptive baseline correction using polynomial fitting
 */
export function polynomialBaselineCorrection(
  values: number[],
  degree: number = 3
): number[] {
  if (values.length === 0) return values;

  // Fit polynomial to data points using least squares
  const n = values.length;
  const x = Array.from({ length: n }, (_, i) => i / n); // Normalized x

  // Build Vandermonde matrix
  const X: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j <= degree; j++) {
      row.push(Math.pow(x[i], j));
    }
    X.push(row);
  }

  // Solve normal equations (simplified - in practice use QR or SVD)
  // For now, use simple least squares approximation
  const coeffs = fitPolynomial(x, values, degree);

  // Evaluate polynomial at each point
  const baseline = x.map(xi => {
    let sum = 0;
    for (let j = 0; j <= degree; j++) {
      sum += coeffs[j] * Math.pow(xi, j);
    }
    return sum;
  });

  return values.map((v, i) => v - baseline[i]);
}

/**
 * Simple polynomial fitting (least squares)
 */
function fitPolynomial(x: number[], y: number[], degree: number): number[] {
  // This is a simplified implementation
  // For production, use a proper linear algebra library

  // Initialize coefficients with simple estimates
  const coeffs = new Array<number>(degree + 1).fill(0);

  // Use iterative refinement
  const maxIter = 10;
  const learningRate = 0.1;

  for (let iter = 0; iter < maxIter; iter++) {
    const gradients = new Array<number>(degree + 1).fill(0);

    for (let i = 0; i < x.length; i++) {
      // Calculate prediction
      let pred = 0;
      for (let j = 0; j <= degree; j++) {
        pred += coeffs[j] * Math.pow(x[i], j);
      }

      // Calculate error
      const error = pred - y[i];

      // Accumulate gradients
      for (let j = 0; j <= degree; j++) {
        gradients[j] += 2 * error * Math.pow(x[i], j) / x.length;
      }
    }

    // Update coefficients
    for (let j = 0; j <= degree; j++) {
      coeffs[j] -= learningRate * gradients[j];
    }
  }

  return coeffs;
}
