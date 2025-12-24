/**
 * Interpolation Utilities
 * Various interpolation methods for signal processing
 *
 * @module signal/loader/png-digitizer/utils/interpolation
 */

/**
 * Linear interpolation
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Clamp value to range
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Cubic interpolation (Catmull-Rom spline)
 */
export function cubicInterpolate(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number
): number {
  const t2 = t * t;
  const t3 = t2 * t;

  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/**
 * Sinc function
 */
export function sinc(x: number): number {
  if (Math.abs(x) < 1e-10) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

/**
 * Lanczos window function
 */
export function lanczos(x: number, a: number): number {
  if (Math.abs(x) < 1e-10) return 1;
  if (Math.abs(x) >= a) return 0;
  return sinc(x) * sinc(x / a);
}

/**
 * Sinc interpolation with Lanczos window
 */
export function sincInterpolate(
  values: number[],
  index: number,
  windowSize: number = 3
): number {
  const intIndex = Math.floor(index);
  const frac = index - intIndex;

  if (frac < 1e-10 && intIndex >= 0 && intIndex < values.length) {
    return values[intIndex];
  }

  let sum = 0;
  let weightSum = 0;

  const start = Math.max(0, intIndex - windowSize + 1);
  const end = Math.min(values.length - 1, intIndex + windowSize);

  for (let i = start; i <= end; i++) {
    const x = index - i;
    const weight = lanczos(x, windowSize);
    sum += values[i] * weight;
    weightSum += weight;
  }

  return weightSum > 0 ? sum / weightSum : 0;
}

/**
 * Hermite interpolation
 */
export function hermiteInterpolate(
  p0: number,
  p1: number,
  m0: number,
  m1: number,
  t: number
): number {
  const t2 = t * t;
  const t3 = t2 * t;

  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
}

/**
 * Smooth step interpolation
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Smoother step interpolation (Ken Perlin's improved version)
 */
export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
