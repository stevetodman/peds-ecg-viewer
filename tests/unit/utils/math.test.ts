/**
 * Math utilities tests
 */

import { describe, it, expect } from 'vitest';
import {
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
} from '../../../src/utils/math';

describe('clamp', () => {
  it('should return value if within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('should return min if value is below', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('should return max if value is above', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe('lerp', () => {
  it('should return a when t=0', () => {
    expect(lerp(0, 10, 0)).toBe(0);
  });

  it('should return b when t=1', () => {
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('should return midpoint when t=0.5', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

describe('round', () => {
  it('should round to whole number by default', () => {
    expect(round(3.7)).toBe(4);
    expect(round(3.2)).toBe(3);
  });

  it('should round to specified decimals', () => {
    expect(round(3.14159, 2)).toBe(3.14);
    expect(round(3.14159, 3)).toBe(3.142);
  });
});

describe('mean', () => {
  it('should calculate mean of numbers', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });

  it('should return 0 for empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('should handle single value', () => {
    expect(mean([5])).toBe(5);
  });
});

describe('median', () => {
  it('should calculate median of odd count', () => {
    expect(median([1, 2, 3, 4, 5])).toBe(3);
  });

  it('should calculate median of even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('should handle unsorted array', () => {
    expect(median([5, 1, 3, 2, 4])).toBe(3);
  });

  it('should return 0 for empty array', () => {
    expect(median([])).toBe(0);
  });
});

describe('standardDeviation', () => {
  it('should calculate standard deviation', () => {
    const sd = standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(sd).toBeCloseTo(2, 0);
  });

  it('should return 0 for single value', () => {
    expect(standardDeviation([5])).toBe(0);
  });

  it('should return 0 for empty array', () => {
    expect(standardDeviation([])).toBe(0);
  });
});

describe('percentile', () => {
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('should return minimum for 0th percentile', () => {
    expect(percentile(sorted, 0)).toBe(1);
  });

  it('should return maximum for 100th percentile', () => {
    expect(percentile(sorted, 100)).toBe(10);
  });

  it('should return median for 50th percentile', () => {
    expect(percentile(sorted, 50)).toBeCloseTo(5.5, 1);
  });
});

describe('angle conversions', () => {
  it('should convert degrees to radians', () => {
    expect(degreesToRadians(180)).toBeCloseTo(Math.PI);
    expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2);
  });

  it('should convert radians to degrees', () => {
    expect(radiansToDegrees(Math.PI)).toBeCloseTo(180);
    expect(radiansToDegrees(Math.PI / 2)).toBeCloseTo(90);
  });
});

describe('normalizeAngle', () => {
  it('should keep angles in -180 to 180 range', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(180)).toBe(180);
    expect(normalizeAngle(-180)).toBe(-180);
  });

  it('should normalize angles > 180', () => {
    expect(normalizeAngle(270)).toBe(-90);
    expect(normalizeAngle(360)).toBe(0);
  });

  it('should normalize angles < -180', () => {
    expect(normalizeAngle(-270)).toBe(90);
    expect(normalizeAngle(-360)).toBeCloseTo(0);
  });
});

describe('rms', () => {
  it('should calculate root mean square', () => {
    expect(rms([1, 1, 1, 1])).toBe(1);
    expect(rms([3, 4])).toBeCloseTo(3.54, 1); // sqrt((9+16)/2) = sqrt(12.5)
  });

  it('should return 0 for empty array', () => {
    expect(rms([])).toBe(0);
  });
});

describe('findLocalMaxima', () => {
  it('should find local maxima', () => {
    const values = [1, 3, 2, 5, 3, 4, 2];
    const maxima = findLocalMaxima(values);
    expect(maxima).toContain(1); // value 3
    expect(maxima).toContain(3); // value 5
    expect(maxima).toContain(5); // value 4
  });

  it('should respect minimum distance', () => {
    const values = [1, 3, 2, 5, 3, 4, 2];
    const maxima = findLocalMaxima(values, 3);
    expect(maxima.length).toBeLessThanOrEqual(2);
  });

  it('should return empty for monotonic increasing', () => {
    const values = [1, 2, 3, 4, 5];
    expect(findLocalMaxima(values)).toEqual([]);
  });
});

describe('findLocalMinima', () => {
  it('should find local minima', () => {
    const values = [5, 2, 4, 1, 3, 2, 4];
    const minima = findLocalMinima(values);
    expect(minima).toContain(1); // value 2
    expect(minima).toContain(3); // value 1
    expect(minima).toContain(5); // value 2
  });

  it('should return empty for monotonic decreasing', () => {
    const values = [5, 4, 3, 2, 1];
    expect(findLocalMinima(values)).toEqual([]);
  });
});
