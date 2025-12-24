/**
 * RR Interval Analysis Utilities
 *
 * Consolidated RR interval processing used across signal processing modules.
 * Handles extraction, filtering, and basic analysis of RR intervals.
 *
 * @module signal/utils/rr-analyzer
 */

import {
  mean,
  median,
  standardDeviation,
  rmssd,
  filterOutliersIQR,
  summarize,
  type StatisticsSummary,
} from './statistics';

// =============================================================================
// Types
// =============================================================================

/**
 * RR interval with metadata
 */
export interface RRInterval {
  /** Duration in milliseconds */
  durationMs: number;

  /** Index of the first R-peak */
  startIndex: number;

  /** Index of the second R-peak */
  endIndex: number;

  /** Time of first R-peak in seconds */
  startTime: number;

  /** Time of second R-peak in seconds */
  endTime: number;

  /** Whether this interval is physiologically plausible */
  isValid: boolean;

  /** Beat classification if available */
  beatClass?: string;
}

/**
 * Configuration for RR interval extraction
 */
export interface RRExtractionConfig {
  /** Minimum RR interval in ms (default: 200 = 300 bpm) */
  minRRMs?: number;

  /** Maximum RR interval in ms (default: 3000 = 20 bpm) */
  maxRRMs?: number;

  /** Maximum allowed change between consecutive intervals as ratio (default: 0.2 = 20%) */
  maxChangeRatio?: number;

  /** Beat classifications for filtering (only 'N' beats if provided) */
  beatClasses?: string[];

  /** Include only normal-to-normal (NN) intervals */
  nnOnly?: boolean;
}

/**
 * RR interval statistics summary
 */
export interface RRStatistics extends StatisticsSummary {
  /** Mean heart rate in bpm */
  meanHR: number;

  /** RMSSD in ms */
  rmssd: number;

  /** pNN50 percentage */
  pNN50: number;

  /** Total recording duration in seconds */
  totalDuration: number;

  /** Number of ectopic beats excluded */
  ectopicCount: number;

  /** Percentage of valid intervals */
  validPercent: number;
}

// =============================================================================
// RR Interval Extraction
// =============================================================================

/**
 * Extract RR intervals from R-peak indices
 */
export function extractRRIntervals(
  rPeakIndices: number[],
  sampleRate: number,
  config: RRExtractionConfig = {}
): RRInterval[] {
  const {
    minRRMs = 200,
    maxRRMs = 3000,
    maxChangeRatio = 0.2,
    beatClasses,
    nnOnly = false,
  } = config;

  if (rPeakIndices.length < 2) return [];

  const intervals: RRInterval[] = [];
  let prevValidRR: number | null = null;

  for (let i = 1; i < rPeakIndices.length; i++) {
    const startIndex = rPeakIndices[i - 1];
    const endIndex = rPeakIndices[i];
    const durationMs = ((endIndex - startIndex) / sampleRate) * 1000;
    const startTime = startIndex / sampleRate;
    const endTime = endIndex / sampleRate;

    // Check physiological plausibility
    let isValid = durationMs >= minRRMs && durationMs <= maxRRMs;

    // Check for sudden changes (ectopy detection)
    if (isValid && prevValidRR !== null) {
      const changeRatio = Math.abs(durationMs - prevValidRR) / prevValidRR;
      if (changeRatio > maxChangeRatio) {
        isValid = false;
      }
    }

    // Check beat classification if provided
    const beatClass = beatClasses?.[i];
    if (nnOnly && beatClass && beatClass !== 'N') {
      isValid = false;
    }

    intervals.push({
      durationMs,
      startIndex,
      endIndex,
      startTime,
      endTime,
      isValid,
      beatClass,
    });

    if (isValid) {
      prevValidRR = durationMs;
    }
  }

  return intervals;
}

/**
 * Extract just the RR durations in milliseconds
 */
export function extractRRDurations(
  rPeakIndices: number[],
  sampleRate: number
): number[] {
  const intervals: number[] = [];
  for (let i = 1; i < rPeakIndices.length; i++) {
    const rrMs = ((rPeakIndices[i] - rPeakIndices[i - 1]) / sampleRate) * 1000;
    intervals.push(rrMs);
  }
  return intervals;
}

/**
 * Get only valid (normal-to-normal) RR intervals
 */
export function getValidRRIntervals(intervals: RRInterval[]): RRInterval[] {
  return intervals.filter((rr) => rr.isValid);
}

/**
 * Get only valid RR durations in milliseconds
 */
export function getValidRRDurations(intervals: RRInterval[]): number[] {
  return intervals.filter((rr) => rr.isValid).map((rr) => rr.durationMs);
}

// =============================================================================
// RR Interval Filtering
// =============================================================================

/**
 * Filter physiologically implausible RR intervals
 */
export function filterPhysiological(
  rrIntervalsMs: number[],
  minMs: number = 200,
  maxMs: number = 3000
): number[] {
  return rrIntervalsMs.filter((rr) => rr >= minMs && rr <= maxMs);
}

/**
 * Filter RR intervals using adaptive outlier detection
 */
export function filterOutliers(
  rrIntervalsMs: number[],
  method: 'iqr' | 'mad' | 'percentage' = 'iqr'
): number[] {
  if (rrIntervalsMs.length < 4) return rrIntervalsMs;

  switch (method) {
    case 'iqr':
      return filterOutliersIQR(rrIntervalsMs, 1.5);

    case 'mad': {
      const med = median(rrIntervalsMs);
      const deviations = rrIntervalsMs.map((rr) => Math.abs(rr - med));
      const mad = median(deviations);
      const threshold = 3 * mad * 1.4826; // Scale factor for normal distribution
      return rrIntervalsMs.filter((rr) => Math.abs(rr - med) <= threshold);
    }

    case 'percentage': {
      const med = median(rrIntervalsMs);
      const threshold = 0.2; // 20% deviation from median
      return rrIntervalsMs.filter(
        (rr) => Math.abs(rr - med) / med <= threshold
      );
    }

    default:
      return rrIntervalsMs;
  }
}

/**
 * Filter ectopic beats based on prematurity
 * Removes beats that are significantly premature
 */
export function filterEctopic(
  rrIntervalsMs: number[],
  prematurityThreshold: number = 0.8
): number[] {
  if (rrIntervalsMs.length < 3) return rrIntervalsMs;

  const result: number[] = [rrIntervalsMs[0]];

  for (let i = 1; i < rrIntervalsMs.length - 1; i++) {
    const prev = rrIntervalsMs[i - 1];
    const curr = rrIntervalsMs[i];
    const next = rrIntervalsMs[i + 1];

    // Check if current interval is premature followed by compensatory pause
    const isPremature = curr < prev * prematurityThreshold;
    const isCompensatory = next > prev * 1.1;

    if (isPremature && isCompensatory) {
      // Skip this ectopic beat
      continue;
    }

    result.push(curr);
  }

  result.push(rrIntervalsMs[rrIntervalsMs.length - 1]);
  return result;
}

// =============================================================================
// Heart Rate Calculations
// =============================================================================

/**
 * Convert RR interval (ms) to heart rate (bpm)
 */
export function rrToHeartRate(rrMs: number): number {
  if (rrMs <= 0) return 0;
  return 60000 / rrMs;
}

/**
 * Convert heart rate (bpm) to RR interval (ms)
 */
export function heartRateToRR(bpm: number): number {
  if (bpm <= 0) return 0;
  return 60000 / bpm;
}

/**
 * Calculate mean heart rate from RR intervals
 */
export function calculateMeanHeartRate(rrIntervalsMs: number[]): number {
  if (rrIntervalsMs.length === 0) return 0;
  const meanRR = mean(rrIntervalsMs);
  return rrToHeartRate(meanRR);
}

/**
 * Calculate instantaneous heart rate at each beat
 */
export function calculateInstantaneousHR(rrIntervalsMs: number[]): number[] {
  return rrIntervalsMs.map((rr) => rrToHeartRate(rr));
}

// =============================================================================
// RR Statistics
// =============================================================================

/**
 * Calculate comprehensive RR interval statistics
 */
export function calculateRRStatistics(
  intervals: RRInterval[]
): RRStatistics {
  const validIntervals = getValidRRIntervals(intervals);
  const rrMs = validIntervals.map((rr) => rr.durationMs);

  // Get base statistics
  const stats = summarize(rrMs);

  // Calculate RMSSD
  const rmssdValue = rmssd(rrMs);

  // Calculate pNN50
  let nn50Count = 0;
  for (let i = 1; i < rrMs.length; i++) {
    if (Math.abs(rrMs[i] - rrMs[i - 1]) > 50) {
      nn50Count++;
    }
  }
  const pNN50 = rrMs.length > 1 ? (nn50Count / (rrMs.length - 1)) * 100 : 0;

  // Calculate total duration
  const totalDuration =
    validIntervals.length > 0
      ? validIntervals[validIntervals.length - 1].endTime -
        validIntervals[0].startTime
      : 0;

  // Count ectopic beats
  const ectopicCount = intervals.length - validIntervals.length;
  const validPercent =
    intervals.length > 0 ? (validIntervals.length / intervals.length) * 100 : 0;

  return {
    ...stats,
    meanHR: rrToHeartRate(stats.mean),
    rmssd: rmssdValue,
    pNN50,
    totalDuration,
    ectopicCount,
    validPercent,
  };
}

/**
 * Calculate basic RR statistics from duration array
 */
export function calculateBasicRRStats(rrIntervalsMs: number[]): {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  count: number;
  meanHR: number;
} {
  if (rrIntervalsMs.length === 0) {
    return {
      mean: 0,
      median: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      count: 0,
      meanHR: 0,
    };
  }

  const meanVal = mean(rrIntervalsMs);

  return {
    mean: meanVal,
    median: median(rrIntervalsMs),
    stdDev: standardDeviation(rrIntervalsMs),
    min: Math.min(...rrIntervalsMs),
    max: Math.max(...rrIntervalsMs),
    count: rrIntervalsMs.length,
    meanHR: rrToHeartRate(meanVal),
  };
}

// =============================================================================
// RR Interval Tachogram
// =============================================================================

/**
 * Generate uniformly sampled tachogram from RR intervals
 * Useful for frequency domain HRV analysis
 *
 * @param intervals RR intervals
 * @param targetSampleRate Target sample rate for tachogram (Hz)
 */
export function generateTachogram(
  intervals: RRInterval[],
  targetSampleRate: number = 4
): { time: number[]; rr: number[] } {
  const validIntervals = getValidRRIntervals(intervals);

  if (validIntervals.length < 2) {
    return { time: [], rr: [] };
  }

  const startTime = validIntervals[0].endTime;
  const endTime = validIntervals[validIntervals.length - 1].endTime;
  const duration = endTime - startTime;

  const numSamples = Math.floor(duration * targetSampleRate);
  const time: number[] = new Array(numSamples);
  const rr: number[] = new Array(numSamples);

  // Create time array
  for (let i = 0; i < numSamples; i++) {
    time[i] = startTime + i / targetSampleRate;
  }

  // Interpolate RR values
  let intervalIdx = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = time[i];

    // Find surrounding intervals
    while (
      intervalIdx < validIntervals.length - 1 &&
      validIntervals[intervalIdx + 1].endTime <= t
    ) {
      intervalIdx++;
    }

    if (intervalIdx >= validIntervals.length - 1) {
      rr[i] = validIntervals[validIntervals.length - 1].durationMs;
    } else {
      // Linear interpolation
      const t0 = validIntervals[intervalIdx].endTime;
      const t1 = validIntervals[intervalIdx + 1].endTime;
      const rr0 = validIntervals[intervalIdx].durationMs;
      const rr1 = validIntervals[intervalIdx + 1].durationMs;

      const alpha = (t - t0) / (t1 - t0);
      rr[i] = rr0 + alpha * (rr1 - rr0);
    }
  }

  return { time, rr };
}

// =============================================================================
// Baseline RR Estimation
// =============================================================================

/**
 * Estimate baseline RR interval using robust median
 * Filters out outliers before calculating
 */
export function estimateBaselineRR(rrIntervalsMs: number[]): number {
  if (rrIntervalsMs.length === 0) return 800; // Default 75 bpm

  // First pass: rough median
  const sorted = [...rrIntervalsMs].sort((a, b) => a - b);
  const roughMedian = sorted[Math.floor(sorted.length / 2)];

  // Filter to reasonable range around median
  const filtered = rrIntervalsMs.filter(
    (rr) => rr >= roughMedian * 0.5 && rr <= roughMedian * 2
  );

  if (filtered.length === 0) return roughMedian;

  // Return median of filtered values
  const filteredSorted = [...filtered].sort((a, b) => a - b);
  return filteredSorted[Math.floor(filteredSorted.length / 2)];
}

/**
 * Calculate expected RR interval for a given heart rate
 */
export function expectedRRForHeartRate(targetBPM: number): number {
  return heartRateToRR(targetBPM);
}
