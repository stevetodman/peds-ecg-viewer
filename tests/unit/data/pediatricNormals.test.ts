/**
 * Pediatric normals tests
 */

import { describe, it, expect } from 'vitest';
import {
  PEDIATRIC_NORMALS,
  getNormalsForAge,
  getNormals,
  classifyValue,
  estimatePercentile,
  isTWaveV1Normal,
} from '../../../src/data/pediatricNormals';
import { AGE_GROUPS, ageToDays } from '../../../src/data/ageGroups';

describe('PEDIATRIC_NORMALS', () => {
  it('should have values for all age groups', () => {
    for (const group of AGE_GROUPS) {
      expect(PEDIATRIC_NORMALS[group.id]).toBeDefined();
    }
  });

  it('should have required fields for each age group', () => {
    for (const group of AGE_GROUPS) {
      const normals = PEDIATRIC_NORMALS[group.id];

      expect(normals.heartRate).toBeDefined();
      expect(normals.prInterval).toBeDefined();
      expect(normals.qrsDuration).toBeDefined();
      expect(normals.qtcBazett).toBeDefined();
      expect(normals.qrsAxis).toBeDefined();
      expect(normals.rWaveV1).toBeDefined();
      expect(normals.sWaveV1).toBeDefined();
      expect(normals.rWaveV6).toBeDefined();
      expect(normals.sWaveV6).toBeDefined();
      expect(normals.tWaveV1).toBeDefined();
    }
  });

  it('should have valid percentile ordering (p2 < p50 < p98)', () => {
    for (const group of AGE_GROUPS) {
      const normals = PEDIATRIC_NORMALS[group.id];

      expect(normals.heartRate.p2).toBeLessThan(normals.heartRate.p50);
      expect(normals.heartRate.p50).toBeLessThan(normals.heartRate.p98);

      expect(normals.prInterval.p2).toBeLessThan(normals.prInterval.p50);
      expect(normals.prInterval.p50).toBeLessThan(normals.prInterval.p98);
    }
  });

  it('should show decreasing heart rate with age', () => {
    const neonate = PEDIATRIC_NORMALS['neonate_0_24h'];
    const child = PEDIATRIC_NORMALS['child_8_12yr'];
    const adolescent = PEDIATRIC_NORMALS['adolescent_16_18yr'];

    expect(neonate.heartRate.p50).toBeGreaterThan(child.heartRate.p50);
    expect(child.heartRate.p50).toBeGreaterThan(adolescent.heartRate.p50);
  });

  it('should show decreasing R-wave V1 with age (RV dominance decreasing)', () => {
    const neonate = PEDIATRIC_NORMALS['neonate_0_24h'];
    const child = PEDIATRIC_NORMALS['child_8_12yr'];

    expect(neonate.rWaveV1.p98).toBeGreaterThan(child.rWaveV1.p98);
  });

  it('should show increasing R-wave V6 with age (LV dominance increasing)', () => {
    const neonate = PEDIATRIC_NORMALS['neonate_0_24h'];
    const child = PEDIATRIC_NORMALS['child_8_12yr'];

    expect(child.rWaveV6.p50).toBeGreaterThan(neonate.rWaveV6.p50);
  });
});

describe('getNormalsForAge', () => {
  it('should return correct normals for newborn', () => {
    const normals = getNormalsForAge(0);
    expect(normals.heartRate.p50).toBeGreaterThan(130);
  });

  it('should return correct normals for 6-month infant', () => {
    const normals = getNormalsForAge(180);
    expect(normals.heartRate.p50).toBeGreaterThan(100);
    expect(normals.heartRate.p50).toBeLessThan(160);
  });

  it('should return correct normals for 10-year-old', () => {
    const normals = getNormalsForAge(ageToDays(10, 'years'));
    expect(normals.heartRate.p50).toBeLessThan(100);
  });
});

describe('getNormals', () => {
  it('should work with age group object', () => {
    const normals = getNormals(AGE_GROUPS[0]);
    expect(normals).toBeDefined();
  });

  it('should work with age group ID', () => {
    const normals = getNormals('infant_6_12mo');
    expect(normals).toBeDefined();
  });

  it('should throw for invalid ID', () => {
    expect(() => getNormals('invalid_id')).toThrow();
  });
});

describe('classifyValue', () => {
  const testRange = { p2: 60, p50: 80, p98: 100 };

  it('should classify values below p2 as low', () => {
    expect(classifyValue(50, testRange)).toBe('low');
  });

  it('should classify values above p98 as high', () => {
    expect(classifyValue(110, testRange)).toBe('high');
  });

  it('should classify middle values as normal', () => {
    expect(classifyValue(80, testRange)).toBe('normal');
  });

  it('should classify values near p2 as borderline_low', () => {
    expect(classifyValue(62, testRange)).toBe('borderline_low');
  });

  it('should classify values near p98 as borderline_high', () => {
    expect(classifyValue(98, testRange)).toBe('borderline_high');
  });
});

describe('estimatePercentile', () => {
  const testRange = { p2: 60, p50: 80, p98: 100 };

  it('should return ~50 for median value', () => {
    const percentile = estimatePercentile(80, testRange);
    expect(percentile).toBeCloseTo(50, 0);
  });

  it('should return ~2 for p2 value', () => {
    const percentile = estimatePercentile(60, testRange);
    expect(percentile).toBeCloseTo(2, 0);
  });

  it('should return ~98 for p98 value', () => {
    const percentile = estimatePercentile(100, testRange);
    expect(percentile).toBeCloseTo(98, 0);
  });

  it('should return < 2 for values below p2', () => {
    const percentile = estimatePercentile(30, testRange);
    expect(percentile).toBeLessThan(2);
  });

  it('should return > 98 for values above p98', () => {
    const percentile = estimatePercentile(120, testRange);
    expect(percentile).toBeGreaterThan(98);
  });
});

describe('isTWaveV1Normal', () => {
  it('should accept upright T in V1 for first day of life', () => {
    expect(isTWaveV1Normal('upright', 0)).toBe(true);
  });

  it('should reject upright T in V1 after day 7', () => {
    expect(isTWaveV1Normal('upright', 10)).toBe(false);
  });

  it('should accept inverted T in V1 for infants', () => {
    expect(isTWaveV1Normal('inverted', 100)).toBe(true);
  });

  it('should accept inverted T in V1 for children', () => {
    expect(isTWaveV1Normal('inverted', ageToDays(8, 'years'))).toBe(true);
  });

  it('should accept upright T in V1 for older adolescents', () => {
    expect(isTWaveV1Normal('upright', ageToDays(16, 'years'))).toBe(true);
  });
});
