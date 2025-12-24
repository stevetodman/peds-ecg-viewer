/**
 * Utility exports
 * @module utils
 */

// Math utilities
export {
  clamp,
  lerp,
  round,
  mean,
  median,
  standardDeviation,
  percentile,
  degreesToRadians,
  radiansToDegrees,
  normalizeAngle,
  rms,
  findLocalMaxima,
  findLocalMinima,
} from './math';

// Validation utilities
export {
  ValidationError,
  validateECGSignal,
  validateAge,
  validateMeasurement,
  MEASUREMENT_RANGES,
} from './validation';
