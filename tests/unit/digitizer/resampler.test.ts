/**
 * Resampler Tests
 * Tests for signal resampling functions
 */

import { describe, it, expect } from 'vitest';
import {
  resampleToRate,
  downsample,
  upsample,
  changeSampleRate,
} from '../../../src/signal/loader/png-digitizer/signal/resampler';

describe('resampleToRate', () => {
  describe('basic functionality', () => {
    it('should resample irregular samples to uniform rate', () => {
      const values = [0, 100, 0, -100, 0];
      const times = [0, 0.25, 0.5, 0.75, 1.0];
      const duration = 1.0;
      const targetRate = 10; // 10 Hz = 10 samples per second

      const result = resampleToRate(values, times, duration, targetRate);

      expect(result).toHaveLength(10);
      expect(result[0]).toBe(0); // t=0
      expect(result[5]).toBe(0); // t=0.5
    });

    it('should return empty array for empty input', () => {
      const result = resampleToRate([], [], 1.0, 100);

      expect(result).toEqual([]);
    });

    it('should throw error for mismatched array lengths', () => {
      expect(() => resampleToRate([1, 2, 3], [0, 1], 1.0, 100)).toThrow(
        'Values and times arrays must have same length'
      );
    });

    it('should handle single sample', () => {
      const result = resampleToRate([42], [0], 0.01, 100);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toBe(42);
    });
  });

  describe('linear interpolation', () => {
    it('should interpolate linearly between points', () => {
      // Two points: 0 at t=0, 100 at t=1
      const values = [0, 100];
      const times = [0, 1];
      const duration = 1.0;
      const targetRate = 10;

      const result = resampleToRate(values, times, duration, targetRate, 'linear');

      // Should interpolate linearly: 0, 10, 20, ..., 90
      expect(result[0]).toBeCloseTo(0, 5);
      expect(result[5]).toBeCloseTo(50, 5);
      expect(result[9]).toBeCloseTo(90, 5);
    });

    it('should clamp to first value before start time', () => {
      const values = [50, 100];
      const times = [0.5, 1.0]; // starts at t=0.5
      const duration = 1.0;
      const targetRate = 10;

      const result = resampleToRate(values, times, duration, targetRate, 'linear');

      // Before t=0.5, should return first value (50)
      expect(result[0]).toBe(50); // t=0
      expect(result[4]).toBe(50); // t=0.4
    });

    it('should clamp to last value after end time', () => {
      const values = [0, 50];
      const times = [0, 0.5]; // ends at t=0.5
      const duration = 1.0;
      const targetRate = 10;

      const result = resampleToRate(values, times, duration, targetRate, 'linear');

      // After t=0.5, should return last value (50)
      expect(result[5]).toBe(50); // t=0.5
      expect(result[9]).toBe(50); // t=0.9
    });

    it('should handle non-uniform input sampling', () => {
      // Non-uniform time intervals
      const values = [0, 100, 200, 300];
      const times = [0, 0.1, 0.5, 1.0];
      const duration = 1.0;
      const targetRate = 10;

      const result = resampleToRate(values, times, duration, targetRate, 'linear');

      expect(result).toHaveLength(10);
      expect(result[0]).toBeCloseTo(0, 5);
      expect(result[1]).toBeCloseTo(100, 5); // t=0.1
    });
  });

  describe('sinc interpolation', () => {
    it('should use sinc interpolation when specified', () => {
      const values = [0, 100, 0, -100, 0];
      const times = [0, 0.25, 0.5, 0.75, 1.0];
      const duration = 1.0;
      const targetRate = 20;

      const result = resampleToRate(values, times, duration, targetRate, 'sinc');

      expect(result).toHaveLength(20);
      // Sinc interpolation should give smooth results
      expect(result[0]).toBeCloseTo(0, 1);
    });

    it('should handle exact sample times with sinc', () => {
      const values = [100, 200, 300];
      const times = [0, 0.5, 1.0];
      const duration = 1.0;
      const targetRate = 2;

      const result = resampleToRate(values, times, duration, targetRate, 'sinc');

      expect(result).toHaveLength(2);
      // At exact sample times, should return exact values (or very close)
      expect(result[0]).toBeCloseTo(100, 0);
    });
  });

  describe('sample rate calculation', () => {
    it('should produce correct number of samples', () => {
      const values = [0, 100];
      const times = [0, 1];

      // 500 Hz for 1 second = 500 samples
      expect(resampleToRate(values, times, 1.0, 500)).toHaveLength(500);

      // 250 Hz for 2 seconds = 500 samples
      expect(resampleToRate(values, times, 2.0, 250)).toHaveLength(500);

      // 100 Hz for 0.5 seconds = 50 samples
      expect(resampleToRate(values, times, 0.5, 100)).toHaveLength(50);
    });

    it('should produce at least 1 sample', () => {
      const values = [42];
      const times = [0];

      const result = resampleToRate(values, times, 0.001, 10);

      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ECG-like signals', () => {
    it('should resample simulated ECG waveform correctly', () => {
      // Simulate QRS complex with irregular sampling
      const values = [0, 10, 50, 100, 50, -20, 0, 5, 0];
      const times = [0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1];
      const duration = 0.1;
      const targetRate = 500; // Medical ECG rate

      const result = resampleToRate(values, times, duration, targetRate, 'linear');

      expect(result).toHaveLength(50);
      // Peak should be near 100
      expect(Math.max(...result)).toBeCloseTo(100, 0);
      // Should have negative deflection
      expect(Math.min(...result)).toBeLessThan(0);
    });
  });
});

describe('downsample', () => {
  describe('basic functionality', () => {
    it('should downsample by averaging', () => {
      const values = [10, 20, 30, 40];
      const result = downsample(values, 2);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(15); // (10 + 20) / 2
      expect(result[1]).toBe(35); // (30 + 40) / 2
    });

    it('should return original for factor <= 1', () => {
      const values = [1, 2, 3, 4];

      expect(downsample(values, 1)).toEqual(values);
      expect(downsample(values, 0.5)).toEqual(values);
      expect(downsample(values, 0)).toEqual(values);
    });

    it('should handle non-integer factors', () => {
      const values = [10, 20, 30, 40, 50];
      const result = downsample(values, 2.5);

      expect(result.length).toBe(Math.ceil(5 / 2.5));
    });

    it('should handle single value', () => {
      const values = [42];
      const result = downsample(values, 2);

      expect(result).toEqual([42]);
    });

    it('should handle empty array', () => {
      const result = downsample([], 2);

      expect(result).toEqual([]);
    });
  });

  describe('averaging behavior', () => {
    it('should correctly average partial last group', () => {
      // 5 values with factor 2: groups are [0,1], [2,3], [4]
      const values = [10, 20, 30, 40, 50];
      const result = downsample(values, 2);

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(15);
      expect(result[1]).toBe(35);
      expect(result[2]).toBe(50); // single value in last group
    });

    it('should preserve mean value', () => {
      const values = [10, 20, 30, 40, 50, 60, 70, 80];
      const originalMean = values.reduce((a, b) => a + b, 0) / values.length;

      const result = downsample(values, 2);
      const resultMean = result.reduce((a, b) => a + b, 0) / result.length;

      expect(resultMean).toBeCloseTo(originalMean, 5);
    });
  });

  describe('large factor', () => {
    it('should handle factor larger than array', () => {
      const values = [10, 20, 30];
      const result = downsample(values, 10);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(20); // mean of all values
    });
  });
});

describe('upsample', () => {
  describe('basic functionality', () => {
    it('should upsample using linear interpolation', () => {
      const values = [0, 100];
      const result = upsample(values, 2);

      expect(result).toHaveLength(4);
      expect(result[0]).toBe(0);
      expect(result[1]).toBe(50); // interpolated
      expect(result[2]).toBe(100);
      expect(result[3]).toBe(100); // clamped to last
    });

    it('should return original for factor <= 1', () => {
      const values = [1, 2, 3, 4];

      expect(upsample(values, 1)).toEqual(values);
      expect(upsample(values, 0.5)).toEqual(values);
    });

    it('should handle single value', () => {
      const values = [42];
      const result = upsample(values, 4);

      expect(result).toHaveLength(4);
      result.forEach((v) => expect(v).toBe(42));
    });

    it('should handle empty array', () => {
      const result = upsample([], 2);

      expect(result).toEqual([]);
    });
  });

  describe('interpolation accuracy', () => {
    it('should interpolate linearly between samples', () => {
      const values = [0, 100, 200];
      const result = upsample(values, 3);

      expect(result).toHaveLength(9);
      // Between 0 and 100
      expect(result[0]).toBeCloseTo(0, 5);
      expect(result[1]).toBeCloseTo(33.33, 1);
      expect(result[2]).toBeCloseTo(66.67, 1);
      // At 100
      expect(result[3]).toBeCloseTo(100, 5);
    });

    it('should preserve original sample positions approximately', () => {
      const values = [10, 50, 30, 80];
      const result = upsample(values, 2);

      expect(result[0]).toBe(10);
      expect(result[2]).toBe(50);
      expect(result[4]).toBe(30);
      expect(result[6]).toBe(80);
    });
  });

  describe('large factor', () => {
    it('should handle large upsampling factor', () => {
      const values = [0, 100];
      const result = upsample(values, 100);

      expect(result).toHaveLength(200);
      expect(result[0]).toBe(0);
      expect(result[50]).toBeCloseTo(50, 0);
      expect(result[100]).toBeCloseTo(100, 0);
    });
  });
});

describe('changeSampleRate', () => {
  describe('basic functionality', () => {
    it('should return original when rates are equal', () => {
      const values = [1, 2, 3, 4, 5];

      expect(changeSampleRate(values, 100, 100)).toEqual(values);
    });

    it('should upsample when toRate > fromRate', () => {
      const values = [0, 100];
      const result = changeSampleRate(values, 100, 200);

      expect(result).toHaveLength(4);
    });

    it('should downsample when toRate < fromRate', () => {
      const values = [0, 50, 100, 150];
      const result = changeSampleRate(values, 400, 200);

      expect(result).toHaveLength(2);
    });
  });

  describe('rate conversion accuracy', () => {
    it('should produce correct number of samples', () => {
      const values = new Array(500).fill(0).map((_, i) => i);

      // 500 samples at 500 Hz = 1 second
      // At 250 Hz = 250 samples
      const result = changeSampleRate(values, 500, 250);
      expect(result).toHaveLength(250);
    });

    it('should preserve signal shape', () => {
      // Create a simple sine-like pattern
      const values = [0, 100, 0, -100, 0, 100, 0, -100, 0, 100];

      // Upsample
      const upsampled = changeSampleRate(values, 100, 200);
      expect(upsampled.length).toBeGreaterThan(values.length);

      // Peak values should be preserved approximately
      expect(Math.max(...upsampled)).toBeCloseTo(100, 0);
      expect(Math.min(...upsampled)).toBeCloseTo(-100, 0);
    });
  });

  describe('common ECG rate conversions', () => {
    it('should convert 500 Hz to 250 Hz', () => {
      const values = new Array(5000).fill(0).map((_, i) => Math.sin(i * 0.01) * 100);

      const result = changeSampleRate(values, 500, 250);

      expect(result).toHaveLength(2500);
    });

    it('should convert 250 Hz to 500 Hz', () => {
      const values = new Array(2500).fill(0).map((_, i) => Math.sin(i * 0.02) * 100);

      const result = changeSampleRate(values, 250, 500);

      expect(result).toHaveLength(5000);
    });

    it('should convert 1000 Hz to 500 Hz', () => {
      const values = new Array(10000).fill(0).map((_, i) => Math.sin(i * 0.005) * 100);

      const result = changeSampleRate(values, 1000, 500);

      expect(result).toHaveLength(5000);
    });
  });

  describe('edge cases', () => {
    it('should handle empty array', () => {
      const result = changeSampleRate([], 100, 200);

      expect(result).toEqual([]);
    });

    it('should handle single value', () => {
      const result = changeSampleRate([42], 100, 200);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(42);
      expect(result[1]).toBe(42);
    });

    it('should handle very large rate difference', () => {
      const values = [0, 100];
      const result = changeSampleRate(values, 10, 1000);

      expect(result).toHaveLength(200);
    });
  });
});

describe('round-trip accuracy', () => {
  it('should preserve signal characteristics after upsample then downsample', () => {
    const original = [10, 50, 30, 80, 20];

    const upsampled = upsample(original, 4);
    const downsampled = downsample(upsampled, 4);

    expect(downsampled).toHaveLength(original.length);

    // Due to linear interpolation + averaging, exact values aren't preserved
    // but the overall signal shape (min, max, mean) should be similar
    const originalMean = original.reduce((a, b) => a + b, 0) / original.length;
    const downsampledMean = downsampled.reduce((a, b) => a + b, 0) / downsampled.length;
    expect(downsampledMean).toBeCloseTo(originalMean, -1); // Within ±5

    // Peak should be near original peak position
    const originalPeakIdx = original.indexOf(Math.max(...original));
    const downsampledPeakIdx = downsampled.indexOf(Math.max(...downsampled));
    expect(Math.abs(originalPeakIdx - downsampledPeakIdx)).toBeLessThanOrEqual(1);
  });

  it('should approximate original after rate change round-trip', () => {
    const original = new Array(100).fill(0).map((_, i) => Math.sin(i * 0.1) * 100);

    const converted = changeSampleRate(original, 100, 500);
    const restored = changeSampleRate(converted, 500, 100);

    expect(restored).toHaveLength(original.length);
    // Allow some interpolation error
    original.forEach((val, i) => {
      expect(restored[i]).toBeCloseTo(val, 0);
    });
  });
});
