/**
 * Signal Processing Utilities
 *
 * Consolidated utility functions for signal processing.
 * These are shared across multiple signal analysis modules.
 *
 * @module signal/utils
 */

// =============================================================================
// Statistics
// =============================================================================

export {
  // Basic statistics
  mean,
  median,
  variance,
  standardDeviation,
  rms,
  rmssd,

  // Percentiles
  percentile,
  quartiles,
  iqr,

  // Robust statistics
  medianAbsoluteDeviation,
  madStandardDeviation,
  filterOutliersIQR,
  filterOutliersMAD,

  // Correlation and regression
  pearsonCorrelation,
  spearmanCorrelation,
  linearRegression,
  linearRegressionSlope,

  // Summary
  summarize,
  type StatisticsSummary,

  // Entropy
  sampleEntropy,
} from './statistics';

// =============================================================================
// Math Utilities
// =============================================================================

export {
  // Peak finding
  findLocalMaximum,
  findLocalMinimum,
  findAllPeaks,
  findAllTroughs,
  refinePeakLocation,

  // Direction and slope
  countDirectionChanges,
  slopeAt,
  maxSlope,
  findZeroCrossings,

  // Thresholds
  adaptiveThresholdIQR,
  adaptiveThresholdPercentile,
  otsuThreshold,

  // Smoothing and differentiation
  movingAverage,
  weightedMovingAverage,
  differentiate,
  secondDerivative,

  // Interpolation
  lerp,
  interpolateAt,
  resampleLinear,

  // Utility
  clamp,
  normalize,
  standardize,
} from './math';

// =============================================================================
// RR Interval Analysis
// =============================================================================

export {
  // Types
  type RRInterval,
  type RRExtractionConfig,
  type RRStatistics,

  // Extraction
  extractRRIntervals,
  extractRRDurations,
  getValidRRIntervals,
  getValidRRDurations,

  // Filtering
  filterPhysiological,
  filterOutliers as filterRROutliers,
  filterEctopic,

  // Heart rate
  rrToHeartRate,
  heartRateToRR,
  calculateMeanHeartRate,
  calculateInstantaneousHR,

  // Statistics
  calculateRRStatistics,
  calculateBasicRRStats,

  // Tachogram
  generateTachogram,

  // Baseline
  estimateBaselineRR,
  expectedRRForHeartRate,
} from './rr-analyzer';

// =============================================================================
// Signal Filters
// =============================================================================

export {
  // IIR filters
  type IIRFilterConfig,
  lowPassFilter,
  highPassFilter,
  bandpassFilter,
  notchFilter,

  // Smoothing
  movingAverageFilter,
  gaussianFilter,
  savitzkyGolayFilter,

  // Baseline correction
  removeBaselineWander,
  movingMedianFilter,
  removeDCOffset,
  removeDCOffsetRobust,

  // Convolution
  convolve,
  crossCorrelate,

  // ECG-specific
  ecgBandpassFilter,
  panTompkinsDerivative,
  squareSignal,
  movingWindowIntegration,
} from './filters';
