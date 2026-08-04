import { describe, expect, it } from 'vitest';
import { measureCaliper, type CaliperCalibration } from '../../src/calipers';

const calibration: CaliperCalibration = {
  pixelsPerMm: 4,
  paperSpeedMmPerSecond: 25,
  gainMmPerMv: 10,
};

const invalidCalibrations: Array<[CaliperCalibration, string]> = [
  [{ ...calibration, pixelsPerMm: 0 }, 'pixelsPerMm'],
  [{ ...calibration, paperSpeedMmPerSecond: Number.NaN }, 'paperSpeedMmPerSecond'],
  [{ ...calibration, gainMmPerMv: -1 }, 'gainMmPerMv'],
];

describe('measureCaliper', () => {
  it('calculates interval, signed amplitude, rate, and local calibration provenance', () => {
    const measurement = measureCaliper({ x: 20, y: 100 }, { x: 120, y: 60 }, calibration);

    expect(measurement.intervalMs).toBe(1000);
    expect(measurement.amplitudeMv).toBe(1);
    expect(measurement.rateBpm).toBe(60);
    expect(measurement.provenance).toEqual({
      tool: 'manual-calipers',
      calibration,
      horizontalPixels: 100,
      verticalPixels: 40,
    });
    expect(measurement.deltaTime).toBe(1000);
    expect(measurement.deltaVoltage).toBe(1000);
    expect(measurement.heartRate).toBe(60);
  });

  it('preserves amplitude polarity while using absolute horizontal distance for interval', () => {
    const measurement = measureCaliper({ x: 120, y: 60 }, { x: 20, y: 100 }, calibration);

    expect(measurement.intervalMs).toBe(1000);
    expect(measurement.amplitudeMv).toBe(-1);
    expect(measurement.rateBpm).toBe(60);
  });

  it('does not derive a rate for a zero-width interval', () => {
    const measurement = measureCaliper({ x: 10, y: 10 }, { x: 10, y: 30 }, calibration);

    expect(measurement.intervalMs).toBe(0);
    expect(measurement.rateBpm).toBeNull();
    expect(measurement.heartRate).toBe(0);
  });

  it.each(invalidCalibrations)('rejects invalid calibration %#', (invalidCalibration, field) => {
    expect(() => measureCaliper({ x: 0, y: 0 }, { x: 1, y: 1 }, invalidCalibration))
      .toThrow(`${field} must be a finite number greater than zero`);
  });
});
