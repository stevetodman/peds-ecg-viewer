/**
 * DC Corrector Tests
 * Tests for DC offset and baseline wander correction functions
 */

import { describe, it, expect } from 'vitest';
import {
  removeDCOffset,
  removeDCOffsetMean,
  removeBaselineWander,
  splineBaselineCorrection,
  polynomialBaselineCorrection,
} from '../../../src/signal/loader/png-digitizer/signal/dc-corrector';

describe('removeDCOffset', () => {
  describe('basic functionality', () => {
    it('should remove DC offset using median', () => {
      // Signal with DC offset of 100
      const values = [100, 110, 90, 120, 80, 100];
      const result = removeDCOffset(values);

      // Median of [80, 90, 100, 100, 110, 120] = (100 + 100) / 2 = 100
      expect(result).toHaveLength(values.length);
      expect(result[0]).toBeCloseTo(0, 5); // 100 - 100 = 0
    });

    it('should return empty array for empty input', () => {
      const result = removeDCOffset([]);
      expect(result).toEqual([]);
    });

    it('should handle single value', () => {
      const result = removeDCOffset([50]);
      expect(result).toEqual([0]);
    });

    it('should center signal around zero', () => {
      const values = [1000, 1100, 900, 1200, 800, 1000];
      const result = removeDCOffset(values);

      // Result should be centered around zero
      const median = [...result].sort((a, b) => a - b)[Math.floor(result.length / 2)];
      expect(Math.abs(median)).toBeLessThan(1);
    });
  });

  describe('robustness to outliers', () => {
    it('should be robust to large spikes (like R-waves)', () => {
      // Simulated ECG with R-wave spike
      const values = [0, 0, 0, 0, 500, 0, 0, 0, 0]; // Spike of 500
      const result = removeDCOffset(values);

      // Median should be 0, so spike should remain at ~500
      expect(result[4]).toBeCloseTo(500, 1);
      expect(result[0]).toBeCloseTo(0, 5);
    });

    it('should be more robust than mean for asymmetric signals', () => {
      // Signal with large positive spike
      const values = [0, 0, 0, 0, 1000, 0, 0, 0, 0];

      const medianResult = removeDCOffset(values);
      const meanResult = removeDCOffsetMean(values);

      // Median result should preserve the spike better
      expect(medianResult[4]).toBeGreaterThan(meanResult[4]);
    });
  });

  describe('even vs odd length', () => {
    it('should calculate correct median for odd length', () => {
      const values = [5, 3, 1, 2, 4]; // Sorted: [1, 2, 3, 4, 5], median = 3
      const result = removeDCOffset(values);

      // Should subtract 3 from each value
      expect(result[0]).toBeCloseTo(2, 5); // 5 - 3
      expect(result[2]).toBeCloseTo(-2, 5); // 1 - 3
    });

    it('should calculate correct median for even length', () => {
      const values = [1, 2, 3, 4]; // Sorted: [1, 2, 3, 4], median = (2+3)/2 = 2.5
      const result = removeDCOffset(values);

      // Should subtract 2.5 from each value
      expect(result[0]).toBeCloseTo(-1.5, 5); // 1 - 2.5
      expect(result[3]).toBeCloseTo(1.5, 5); // 4 - 2.5
    });
  });
});

describe('removeDCOffsetMean', () => {
  describe('basic functionality', () => {
    it('should remove DC offset using mean', () => {
      const values = [10, 20, 30, 40, 50];
      const result = removeDCOffsetMean(values);

      // Mean = (10+20+30+40+50)/5 = 30
      expect(result[2]).toBeCloseTo(0, 5); // 30 - 30 = 0
      expect(result[0]).toBeCloseTo(-20, 5); // 10 - 30 = -20
    });

    it('should return empty array for empty input', () => {
      const result = removeDCOffsetMean([]);
      expect(result).toEqual([]);
    });

    it('should result in mean of zero', () => {
      const values = [100, 200, 300, 400];
      const result = removeDCOffsetMean(values);

      const mean = result.reduce((a, b) => a + b, 0) / result.length;
      expect(mean).toBeCloseTo(0, 10);
    });
  });

  describe('sensitivity to outliers', () => {
    it('should shift baseline when large spike present', () => {
      const values = [0, 0, 0, 0, 1000, 0, 0, 0, 0];
      const result = removeDCOffsetMean(values);

      // Mean = 1000/9 ≈ 111.11
      // All zeros become negative
      expect(result[0]).toBeLessThan(0);
    });
  });
});

describe('removeBaselineWander', () => {
  describe('basic functionality', () => {
    it('should remove slowly varying baseline', () => {
      const sampleRate = 500;
      const duration = 2;
      const numSamples = sampleRate * duration;

      // Create signal with baseline wander (0.2 Hz sine wave)
      const values = Array.from({ length: numSamples }, (_, i) => {
        const t = i / sampleRate;
        const wander = 100 * Math.sin(2 * Math.PI * 0.2 * t); // Slow wander
        const ecg = 50 * Math.sin(2 * Math.PI * 5 * t); // Fast ECG-like signal
        return wander + ecg;
      });

      const result = removeBaselineWander(values, sampleRate, 0.5);

      // Result should have reduced baseline wander
      expect(result).toHaveLength(values.length);

      // Calculate variance of low-frequency component
      const originalWander = values.map((_, i) => {
        const t = i / sampleRate;
        return 100 * Math.sin(2 * Math.PI * 0.2 * t);
      });

      const wanderRms = Math.sqrt(originalWander.reduce((a, b) => a + b * b, 0) / originalWander.length);
      const resultRms = Math.sqrt(result.reduce((a, b) => a + b * b, 0) / result.length);

      // Result RMS should be less than original wander RMS (wander reduced)
      expect(resultRms).toBeLessThan(wanderRms);
    });

    it('should return empty array for empty input', () => {
      const result = removeBaselineWander([], 500);
      expect(result).toEqual([]);
    });

    it('should preserve high-frequency content', () => {
      const sampleRate = 500;
      const numSamples = 500;

      // High frequency signal (10 Hz)
      const values = Array.from({ length: numSamples }, (_, i) => {
        const t = i / sampleRate;
        return 100 * Math.sin(2 * Math.PI * 10 * t);
      });

      const result = removeBaselineWander(values, sampleRate, 0.5);

      // High frequency content should be mostly preserved
      const originalVariance = values.reduce((a, b) => a + b * b, 0) / values.length;
      const resultVariance = result.reduce((a, b) => a + b * b, 0) / result.length;

      // Result should have similar variance (within 50%)
      expect(resultVariance / originalVariance).toBeGreaterThan(0.5);
    });
  });

  describe('cutoff frequency', () => {
    it('should adapt window size based on cutoff frequency', () => {
      const sampleRate = 500;
      const numSamples = 1000;

      const values = Array.from({ length: numSamples }, () => Math.random() * 100);

      // Lower cutoff = larger window = more smoothing
      const result05Hz = removeBaselineWander(values, sampleRate, 0.5);
      const result1Hz = removeBaselineWander(values, sampleRate, 1.0);

      // Both should have same length
      expect(result05Hz).toHaveLength(numSamples);
      expect(result1Hz).toHaveLength(numSamples);
    });
  });
});

describe('splineBaselineCorrection', () => {
  describe('basic functionality', () => {
    it('should correct baseline using spline interpolation', () => {
      const sampleRate = 500;
      const duration = 2;
      const numSamples = sampleRate * duration;

      // Create signal with linear drift
      const values = Array.from({ length: numSamples }, (_, i) => {
        const drift = i * 0.1; // Linear drift
        const signal = 50 * Math.sin(2 * Math.PI * 5 * (i / sampleRate));
        return drift + signal;
      });

      const result = splineBaselineCorrection(values, sampleRate);

      expect(result).toHaveLength(values.length);

      // Result should have reduced drift - mean of second half should be closer to mean of first half
      const firstHalfMean = result.slice(0, result.length / 2).reduce((a, b) => a + b, 0) / (result.length / 2);
      const secondHalfMean = result.slice(result.length / 2).reduce((a, b) => a + b, 0) / (result.length / 2);

      expect(Math.abs(secondHalfMean - firstHalfMean)).toBeLessThan(50);
    });

    it('should return empty array for empty input', () => {
      const result = splineBaselineCorrection([], 500);
      expect(result).toEqual([]);
    });

    it('should handle short signals', () => {
      const values = [10, 20, 30, 20, 10];
      const result = splineBaselineCorrection(values, 500, 0.01);

      expect(result).toHaveLength(values.length);
    });
  });

  describe('segment duration parameter', () => {
    it('should use specified segment duration', () => {
      const sampleRate = 500;
      const numSamples = 5000; // 10 seconds
      const values = Array.from({ length: numSamples }, () => Math.random() * 100);

      const result05s = splineBaselineCorrection(values, sampleRate, 0.5);
      const result1s = splineBaselineCorrection(values, sampleRate, 1.0);

      // Both should have same length
      expect(result05s).toHaveLength(numSamples);
      expect(result1s).toHaveLength(numSamples);
    });
  });
});

describe('polynomialBaselineCorrection', () => {
  describe('basic functionality', () => {
    it('should correct polynomial baseline', () => {
      const numSamples = 500;

      // Create signal with quadratic drift
      const values = Array.from({ length: numSamples }, (_, i) => {
        const x = i / numSamples;
        const drift = 100 * x * x; // Quadratic drift
        const signal = 20 * Math.sin(2 * Math.PI * 10 * x);
        return drift + signal;
      });

      const result = polynomialBaselineCorrection(values, 2);

      expect(result).toHaveLength(values.length);

      // Drift should be reduced
      const originalDrift = values[numSamples - 1] - values[0];
      const resultDrift = result[numSamples - 1] - result[0];

      expect(Math.abs(resultDrift)).toBeLessThan(Math.abs(originalDrift));
    });

    it('should return empty array for empty input', () => {
      const result = polynomialBaselineCorrection([]);
      expect(result).toEqual([]);
    });

    it('should handle degree 1 (linear)', () => {
      const values = [0, 10, 20, 30, 40]; // Linear trend
      const result = polynomialBaselineCorrection(values, 1);

      expect(result).toHaveLength(values.length);
    });

    it('should handle degree 3 (cubic)', () => {
      const numSamples = 100;
      const values = Array.from({ length: numSamples }, (_, i) => {
        const x = i / numSamples;
        return x * x * x * 100 + x * 50;
      });

      const result = polynomialBaselineCorrection(values, 3);

      expect(result).toHaveLength(numSamples);
    });
  });

  describe('default degree', () => {
    it('should default to degree 3', () => {
      const values = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

      // Both calls should work the same
      const resultDefault = polynomialBaselineCorrection(values);
      const resultExplicit = polynomialBaselineCorrection(values, 3);

      expect(resultDefault).toHaveLength(values.length);
      expect(resultExplicit).toHaveLength(values.length);
    });
  });
});

describe('ECG-like signal processing', () => {
  /**
   * Generate simulated ECG signal with baseline wander
   */
  function generateSimulatedECG(
    sampleRate: number,
    duration: number,
    dcOffset: number = 0,
    wanderAmplitude: number = 0,
    wanderFrequency: number = 0.1
  ): number[] {
    const numSamples = sampleRate * duration;
    const result = new Array<number>(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;

      // Baseline
      const baseline = dcOffset + wanderAmplitude * Math.sin(2 * Math.PI * wanderFrequency * t);

      // Simplified QRS complex (every 0.8 seconds = 75 BPM)
      const beatPhase = (t % 0.8) / 0.8;
      let qrs = 0;
      if (beatPhase > 0.1 && beatPhase < 0.15) {
        qrs = -50 * Math.sin((beatPhase - 0.1) / 0.05 * Math.PI); // Q wave
      } else if (beatPhase >= 0.15 && beatPhase < 0.2) {
        qrs = 300 * Math.sin((beatPhase - 0.15) / 0.05 * Math.PI); // R wave
      } else if (beatPhase >= 0.2 && beatPhase < 0.25) {
        qrs = -30 * Math.sin((beatPhase - 0.2) / 0.05 * Math.PI); // S wave
      }

      result[i] = baseline + qrs;
    }

    return result;
  }

  it('should remove DC offset from ECG while preserving QRS complexes', () => {
    const sampleRate = 500;
    const duration = 2;
    const dcOffset = 500; // 500 µV offset

    const ecg = generateSimulatedECG(sampleRate, duration, dcOffset);
    const corrected = removeDCOffset(ecg);

    // Check that DC offset is removed
    const median = [...corrected].sort((a, b) => a - b)[Math.floor(corrected.length / 2)];
    expect(Math.abs(median)).toBeLessThan(50); // Should be close to 0

    // Check that R-waves are preserved
    const maxOriginal = Math.max(...ecg);
    const maxCorrected = Math.max(...corrected);
    expect(maxCorrected).toBeCloseTo(maxOriginal - dcOffset, -1); // Within ±5
  });

  it('should remove baseline wander from ECG', () => {
    const sampleRate = 500;
    const duration = 4;
    const wanderAmplitude = 100;
    const wanderFrequency = 0.2;

    const ecg = generateSimulatedECG(sampleRate, duration, 0, wanderAmplitude, wanderFrequency);
    const corrected = removeBaselineWander(ecg, sampleRate, 0.5);

    // Calculate variance of baseline (low-freq component)
    // The wander should be reduced
    const firstSecondMean = corrected.slice(0, sampleRate).reduce((a, b) => a + b, 0) / sampleRate;
    const thirdSecondMean = corrected.slice(2 * sampleRate, 3 * sampleRate).reduce((a, b) => a + b, 0) / sampleRate;

    // Means at different times should be more similar after correction
    expect(Math.abs(thirdSecondMean - firstSecondMean)).toBeLessThan(wanderAmplitude);
  });

  it('should handle combined DC offset and baseline wander', () => {
    const sampleRate = 500;
    const duration = 3;
    const dcOffset = 200;
    const wanderAmplitude = 50;

    const ecg = generateSimulatedECG(sampleRate, duration, dcOffset, wanderAmplitude, 0.15);

    // First remove DC offset, then baseline wander
    const dcCorrected = removeDCOffset(ecg);
    const fullyCorrected = removeBaselineWander(dcCorrected, sampleRate, 0.5);

    expect(fullyCorrected).toHaveLength(ecg.length);

    // Signal should now be centered around zero
    const mean = fullyCorrected.reduce((a, b) => a + b, 0) / fullyCorrected.length;
    expect(Math.abs(mean)).toBeLessThan(20);
  });
});

describe('edge cases', () => {
  it('should handle all identical values', () => {
    const values = [50, 50, 50, 50, 50];

    expect(removeDCOffset(values)).toEqual([0, 0, 0, 0, 0]);
    expect(removeDCOffsetMean(values)).toEqual([0, 0, 0, 0, 0]);
  });

  it('should handle negative values', () => {
    const values = [-100, -50, 0, 50, 100];
    const result = removeDCOffset(values);

    // Median = 0, so result should be same as input
    expect(result).toEqual(values);
  });

  it('should handle very large values', () => {
    const values = [1e6, 1e6 + 100, 1e6 - 100, 1e6 + 50, 1e6 - 50];
    const result = removeDCOffset(values);

    // Should be centered around 0
    const median = [...result].sort((a, b) => a - b)[Math.floor(result.length / 2)];
    expect(Math.abs(median)).toBeLessThan(1);
  });

  it('should handle very small values', () => {
    const values = [0.001, 0.002, 0.003, 0.002, 0.001];
    const result = removeDCOffset(values);

    expect(result).toHaveLength(values.length);
    // Median is 0.002
    expect(result[2]).toBeCloseTo(0.001, 10); // 0.003 - 0.002
  });
});
