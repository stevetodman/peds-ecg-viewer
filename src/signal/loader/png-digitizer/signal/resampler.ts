/**
 * Signal Resampler
 * Resample irregular samples to uniform sample rate
 *
 * @module signal/loader/png-digitizer/signal/resampler
 */

/**
 * Resample values at irregular time points to uniform sample rate
 *
 * @param values - Signal values
 * @param times - Time points in seconds (must be sorted ascending)
 * @param duration - Total duration in seconds
 * @param targetRate - Target sample rate in Hz
 * @param method - Interpolation method
 * @returns Uniformly sampled signal
 */
export function resampleToRate(
  values: number[],
  times: number[],
  duration: number,
  targetRate: number,
  method: 'linear' | 'sinc' = 'linear'
): number[] {
  if (values.length === 0 || times.length === 0) {
    return [];
  }

  if (values.length !== times.length) {
    throw new Error('Values and times arrays must have same length');
  }

  const numSamples = Math.max(1, Math.round(duration * targetRate));
  const result = new Array<number>(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / targetRate;
    result[i] = method === 'sinc'
      ? sincInterpolate(values, times, t)
      : linearInterpolate(values, times, t);
  }

  return result;
}

/**
 * Linear interpolation at time t
 */
function linearInterpolate(values: number[], times: number[], t: number): number {
  // Handle edge cases
  if (t <= times[0]) return values[0];
  if (t >= times[times.length - 1]) return values[values.length - 1];

  // Binary search for surrounding samples
  let left = 0;
  let right = times.length - 1;

  while (right - left > 1) {
    const mid = Math.floor((left + right) / 2);
    if (times[mid] <= t) {
      left = mid;
    } else {
      right = mid;
    }
  }

  // Linear interpolation
  const leftT = times[left];
  const rightT = times[right];
  const alpha = (t - leftT) / (rightT - leftT);

  return values[left] * (1 - alpha) + values[right] * alpha;
}

/**
 * Sinc interpolation at time t (higher quality but slower)
 * Uses windowed sinc function
 */
function sincInterpolate(values: number[], times: number[], t: number): number {
  // Window size (number of samples on each side)
  const windowSize = 4;

  // Find nearest sample
  let nearestIdx = 0;
  let minDist = Math.abs(times[0] - t);
  for (let i = 1; i < times.length; i++) {
    const dist = Math.abs(times[i] - t);
    if (dist < minDist) {
      minDist = dist;
      nearestIdx = i;
    }
  }

  // Calculate average sample interval (approximate)
  const avgInterval = (times[times.length - 1] - times[0]) / (times.length - 1);

  // Windowed sinc interpolation
  let sum = 0;
  let weightSum = 0;

  const startIdx = Math.max(0, nearestIdx - windowSize);
  const endIdx = Math.min(times.length - 1, nearestIdx + windowSize);

  for (let i = startIdx; i <= endIdx; i++) {
    const dt = (t - times[i]) / avgInterval;

    // Sinc function with Lanczos window
    let weight: number;
    if (Math.abs(dt) < 1e-10) {
      weight = 1;
    } else {
      const sincVal = Math.sin(Math.PI * dt) / (Math.PI * dt);
      const windowVal = Math.abs(dt) < windowSize
        ? Math.sin(Math.PI * dt / windowSize) / (Math.PI * dt / windowSize)
        : 0;
      weight = sincVal * windowVal;
    }

    sum += values[i] * weight;
    weightSum += weight;
  }

  return weightSum > 0 ? sum / weightSum : values[nearestIdx];
}

/**
 * Downsample a signal by averaging
 */
export function downsample(values: number[], factor: number): number[] {
  if (factor <= 1) return values;

  const newLength = Math.ceil(values.length / factor);
  const result = new Array<number>(newLength);

  for (let i = 0; i < newLength; i++) {
    const start = Math.floor(i * factor);
    const end = Math.min(Math.floor((i + 1) * factor), values.length);

    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += values[j];
    }
    result[i] = sum / (end - start);
  }

  return result;
}

/**
 * Upsample a signal using linear interpolation
 */
export function upsample(values: number[], factor: number): number[] {
  if (factor <= 1) return values;

  const newLength = Math.round(values.length * factor);
  const result = new Array<number>(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIdx = i / factor;
    const leftIdx = Math.floor(srcIdx);
    const rightIdx = Math.min(leftIdx + 1, values.length - 1);
    const alpha = srcIdx - leftIdx;

    result[i] = values[leftIdx] * (1 - alpha) + values[rightIdx] * alpha;
  }

  return result;
}

/**
 * Change sample rate of uniformly sampled signal
 */
export function changeSampleRate(
  values: number[],
  fromRate: number,
  toRate: number
): number[] {
  if (fromRate === toRate) return values;

  const ratio = toRate / fromRate;
  const newLength = Math.round(values.length * ratio);
  const result = new Array<number>(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIdx = i / ratio;
    const leftIdx = Math.floor(srcIdx);
    const rightIdx = Math.min(leftIdx + 1, values.length - 1);
    const alpha = srcIdx - leftIdx;

    result[i] = values[leftIdx] * (1 - alpha) + values[rightIdx] * alpha;
  }

  return result;
}
