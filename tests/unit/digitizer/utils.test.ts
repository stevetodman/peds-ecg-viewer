/**
 * Utility Tests
 * Tests for color, geometry, and interpolation utilities
 */

import { describe, it, expect } from 'vitest';
import {
  colorDistance,
  colorDarkness,
  colorsAreSimilar,
  rgbToHex,
  hexToRgb,
  isGrayscale,
  blendColors,
} from '../../../src/signal/loader/png-digitizer/utils/color';
import {
  pointDistance,
  pointInBounds,
  boundsCenter,
  boundsOverlap,
  boundsIntersection,
  expandBounds,
  clampBounds,
  lerpPoint,
  pointAngle,
  rotatePoint,
  scalePoint,
} from '../../../src/signal/loader/png-digitizer/utils/geometry';
import {
  lerp,
  clamp,
  cubicInterpolate,
  sinc,
  lanczos,
  sincInterpolate,
  hermiteInterpolate,
  smoothstep,
  smootherstep,
} from '../../../src/signal/loader/png-digitizer/utils/interpolation';

// ============================================================================
// Color Tests
// ============================================================================

describe('color utilities', () => {
  describe('colorDistance', () => {
    it('should return 0 for identical colors', () => {
      const color = { r: 128, g: 64, b: 192 };
      expect(colorDistance(color, color)).toBe(0);
    });

    it('should calculate Euclidean distance', () => {
      const black = { r: 0, g: 0, b: 0 };
      const white = { r: 255, g: 255, b: 255 };
      // sqrt(255^2 + 255^2 + 255^2) = sqrt(195075) ≈ 441.67
      expect(colorDistance(black, white)).toBeCloseTo(441.67, 1);
    });

    it('should handle single channel difference', () => {
      const c1 = { r: 100, g: 100, b: 100 };
      const c2 = { r: 200, g: 100, b: 100 };
      expect(colorDistance(c1, c2)).toBe(100);
    });
  });

  describe('colorDarkness', () => {
    it('should return 255 for black', () => {
      expect(colorDarkness({ r: 0, g: 0, b: 0 })).toBe(255);
    });

    it('should return 0 for white', () => {
      expect(colorDarkness({ r: 255, g: 255, b: 255 })).toBe(0);
    });

    it('should return 127.5 for mid-gray', () => {
      expect(colorDarkness({ r: 127, g: 128, b: 127 })).toBeCloseTo(127.67, 1);
    });
  });

  describe('colorsAreSimilar', () => {
    it('should return true for identical colors', () => {
      const color = { r: 100, g: 150, b: 200 };
      expect(colorsAreSimilar(color, color)).toBe(true);
    });

    it('should return true for similar colors within threshold', () => {
      const c1 = { r: 100, g: 100, b: 100 };
      const c2 = { r: 110, g: 105, b: 95 };
      expect(colorsAreSimilar(c1, c2, 30)).toBe(true);
    });

    it('should return false for dissimilar colors', () => {
      const c1 = { r: 0, g: 0, b: 0 };
      const c2 = { r: 255, g: 255, b: 255 };
      expect(colorsAreSimilar(c1, c2)).toBe(false);
    });

    it('should use default threshold of 30', () => {
      const c1 = { r: 100, g: 100, b: 100 };
      const c2 = { r: 120, g: 100, b: 100 }; // distance = 20 < 30
      expect(colorsAreSimilar(c1, c2)).toBe(true);
    });
  });

  describe('rgbToHex', () => {
    it('should convert black to #000000', () => {
      expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
    });

    it('should convert white to #ffffff', () => {
      expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe('#ffffff');
    });

    it('should convert colors correctly', () => {
      expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe('#ff0000');
      expect(rgbToHex({ r: 0, g: 255, b: 0 })).toBe('#00ff00');
      expect(rgbToHex({ r: 0, g: 0, b: 255 })).toBe('#0000ff');
    });

    it('should handle single digit values with padding', () => {
      expect(rgbToHex({ r: 1, g: 2, b: 3 })).toBe('#010203');
    });
  });

  describe('hexToRgb', () => {
    it('should parse #000000', () => {
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('should parse #ffffff', () => {
      expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('should parse without hash prefix', () => {
      expect(hexToRgb('ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should be case insensitive', () => {
      expect(hexToRgb('#FF00ff')).toEqual({ r: 255, g: 0, b: 255 });
    });

    it('should return null for invalid hex', () => {
      expect(hexToRgb('invalid')).toBeNull();
      expect(hexToRgb('#fff')).toBeNull(); // 3 digit not supported
      expect(hexToRgb('#gggggg')).toBeNull();
    });
  });

  describe('isGrayscale', () => {
    it('should return true for pure gray', () => {
      expect(isGrayscale({ r: 128, g: 128, b: 128 })).toBe(true);
    });

    it('should return true for black', () => {
      expect(isGrayscale({ r: 0, g: 0, b: 0 })).toBe(true);
    });

    it('should return true for white', () => {
      expect(isGrayscale({ r: 255, g: 255, b: 255 })).toBe(true);
    });

    it('should return true for near-gray within tolerance', () => {
      expect(isGrayscale({ r: 128, g: 130, b: 126 }, 10)).toBe(true);
    });

    it('should return false for colored pixels', () => {
      expect(isGrayscale({ r: 255, g: 0, b: 0 })).toBe(false);
      expect(isGrayscale({ r: 100, g: 200, b: 150 })).toBe(false);
    });
  });

  describe('blendColors', () => {
    it('should return first color at alpha=0', () => {
      const c1 = { r: 100, g: 100, b: 100 };
      const c2 = { r: 200, g: 200, b: 200 };
      const result = blendColors(c1, c2, 0);
      expect(result).toEqual(c1);
    });

    it('should return second color at alpha=1', () => {
      const c1 = { r: 100, g: 100, b: 100 };
      const c2 = { r: 200, g: 200, b: 200 };
      const result = blendColors(c1, c2, 1);
      expect(result).toEqual(c2);
    });

    it('should blend at alpha=0.5', () => {
      const c1 = { r: 0, g: 0, b: 0 };
      const c2 = { r: 200, g: 200, b: 200 };
      const result = blendColors(c1, c2, 0.5);
      expect(result).toEqual({ r: 100, g: 100, b: 100 });
    });
  });
});

// ============================================================================
// Geometry Tests
// ============================================================================

describe('geometry utilities', () => {
  describe('pointDistance', () => {
    it('should return 0 for same point', () => {
      const p = { x: 100, y: 50 };
      expect(pointDistance(p, p)).toBe(0);
    });

    it('should calculate horizontal distance', () => {
      expect(pointDistance({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(10);
    });

    it('should calculate vertical distance', () => {
      expect(pointDistance({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(10);
    });

    it('should calculate diagonal distance (3-4-5 triangle)', () => {
      expect(pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    });
  });

  describe('pointInBounds', () => {
    const bounds = { x: 10, y: 20, width: 100, height: 50 };

    it('should return true for point inside', () => {
      expect(pointInBounds({ x: 50, y: 40 }, bounds)).toBe(true);
    });

    it('should return true for point on edge', () => {
      expect(pointInBounds({ x: 10, y: 20 }, bounds)).toBe(true); // top-left
      expect(pointInBounds({ x: 110, y: 70 }, bounds)).toBe(true); // bottom-right
    });

    it('should return false for point outside', () => {
      expect(pointInBounds({ x: 5, y: 40 }, bounds)).toBe(false);
      expect(pointInBounds({ x: 50, y: 80 }, bounds)).toBe(false);
    });
  });

  describe('boundsCenter', () => {
    it('should calculate center correctly', () => {
      const bounds = { x: 0, y: 0, width: 100, height: 50 };
      expect(boundsCenter(bounds)).toEqual({ x: 50, y: 25 });
    });

    it('should handle offset bounds', () => {
      const bounds = { x: 100, y: 200, width: 40, height: 60 };
      expect(boundsCenter(bounds)).toEqual({ x: 120, y: 230 });
    });
  });

  describe('boundsOverlap', () => {
    it('should return true for overlapping bounds', () => {
      const a = { x: 0, y: 0, width: 100, height: 100 };
      const b = { x: 50, y: 50, width: 100, height: 100 };
      expect(boundsOverlap(a, b)).toBe(true);
    });

    it('should return false for non-overlapping bounds', () => {
      const a = { x: 0, y: 0, width: 50, height: 50 };
      const b = { x: 100, y: 100, width: 50, height: 50 };
      expect(boundsOverlap(a, b)).toBe(false);
    });

    it('should return false for adjacent bounds (touching but not overlapping)', () => {
      const a = { x: 0, y: 0, width: 50, height: 50 };
      const b = { x: 50, y: 0, width: 50, height: 50 };
      expect(boundsOverlap(a, b)).toBe(false);
    });

    it('should return true when one contains other', () => {
      const outer = { x: 0, y: 0, width: 100, height: 100 };
      const inner = { x: 25, y: 25, width: 50, height: 50 };
      expect(boundsOverlap(outer, inner)).toBe(true);
    });
  });

  describe('boundsIntersection', () => {
    it('should return intersection for overlapping bounds', () => {
      const a = { x: 0, y: 0, width: 100, height: 100 };
      const b = { x: 50, y: 50, width: 100, height: 100 };
      expect(boundsIntersection(a, b)).toEqual({ x: 50, y: 50, width: 50, height: 50 });
    });

    it('should return null for non-overlapping bounds', () => {
      const a = { x: 0, y: 0, width: 50, height: 50 };
      const b = { x: 100, y: 100, width: 50, height: 50 };
      expect(boundsIntersection(a, b)).toBeNull();
    });

    it('should return null for adjacent bounds', () => {
      const a = { x: 0, y: 0, width: 50, height: 50 };
      const b = { x: 50, y: 0, width: 50, height: 50 };
      expect(boundsIntersection(a, b)).toBeNull();
    });
  });

  describe('expandBounds', () => {
    it('should expand bounds by margin', () => {
      const bounds = { x: 50, y: 50, width: 100, height: 100 };
      const expanded = expandBounds(bounds, 10);
      expect(expanded).toEqual({ x: 40, y: 40, width: 120, height: 120 });
    });

    it('should handle zero margin', () => {
      const bounds = { x: 50, y: 50, width: 100, height: 100 };
      expect(expandBounds(bounds, 0)).toEqual(bounds);
    });

    it('should handle negative margin (shrink)', () => {
      const bounds = { x: 50, y: 50, width: 100, height: 100 };
      const shrunk = expandBounds(bounds, -10);
      expect(shrunk).toEqual({ x: 60, y: 60, width: 80, height: 80 });
    });
  });

  describe('clampBounds', () => {
    it('should clamp bounds to image dimensions', () => {
      const bounds = { x: -10, y: -10, width: 100, height: 100 };
      const clamped = clampBounds(bounds, 50, 50);
      expect(clamped).toEqual({ x: 0, y: 0, width: 50, height: 50 });
    });

    it('should not modify bounds within image', () => {
      const bounds = { x: 10, y: 10, width: 30, height: 30 };
      const clamped = clampBounds(bounds, 100, 100);
      expect(clamped).toEqual(bounds);
    });

    it('should handle bounds extending beyond image', () => {
      const bounds = { x: 80, y: 80, width: 50, height: 50 };
      const clamped = clampBounds(bounds, 100, 100);
      expect(clamped).toEqual({ x: 80, y: 80, width: 20, height: 20 });
    });
  });

  describe('lerpPoint', () => {
    it('should return first point at t=0', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 100, y: 100 };
      expect(lerpPoint(p1, p2, 0)).toEqual(p1);
    });

    it('should return second point at t=1', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 100, y: 100 };
      expect(lerpPoint(p1, p2, 1)).toEqual(p2);
    });

    it('should return midpoint at t=0.5', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 100, y: 50 };
      expect(lerpPoint(p1, p2, 0.5)).toEqual({ x: 50, y: 25 });
    });
  });

  describe('pointAngle', () => {
    it('should return 0 for horizontal right', () => {
      expect(pointAngle({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    });

    it('should return PI/2 for vertical down', () => {
      expect(pointAngle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(Math.PI / 2, 10);
    });

    it('should return PI for horizontal left', () => {
      expect(Math.abs(pointAngle({ x: 0, y: 0 }, { x: -10, y: 0 }))).toBeCloseTo(Math.PI, 10);
    });
  });

  describe('rotatePoint', () => {
    it('should rotate 90 degrees correctly', () => {
      const point = { x: 10, y: 0 };
      const rotated = rotatePoint(point, Math.PI / 2);
      expect(rotated.x).toBeCloseTo(0, 10);
      expect(rotated.y).toBeCloseTo(10, 10);
    });

    it('should rotate around custom origin', () => {
      const point = { x: 20, y: 10 };
      const origin = { x: 10, y: 10 };
      const rotated = rotatePoint(point, Math.PI / 2, origin);
      expect(rotated.x).toBeCloseTo(10, 10);
      expect(rotated.y).toBeCloseTo(20, 10);
    });

    it('should return same point for 0 rotation', () => {
      const point = { x: 10, y: 20 };
      const rotated = rotatePoint(point, 0);
      expect(rotated).toEqual(point);
    });
  });

  describe('scalePoint', () => {
    it('should scale from origin', () => {
      const point = { x: 10, y: 20 };
      const scaled = scalePoint(point, 2);
      expect(scaled).toEqual({ x: 20, y: 40 });
    });

    it('should scale from custom origin', () => {
      const point = { x: 20, y: 30 };
      const origin = { x: 10, y: 10 };
      const scaled = scalePoint(point, 2, origin);
      expect(scaled).toEqual({ x: 30, y: 50 });
    });

    it('should handle scale of 1', () => {
      const point = { x: 10, y: 20 };
      expect(scalePoint(point, 1)).toEqual(point);
    });
  });
});

// ============================================================================
// Interpolation Tests
// ============================================================================

describe('interpolation utilities', () => {
  describe('lerp', () => {
    it('should return first value at t=0', () => {
      expect(lerp(10, 20, 0)).toBe(10);
    });

    it('should return second value at t=1', () => {
      expect(lerp(10, 20, 1)).toBe(20);
    });

    it('should return midpoint at t=0.5', () => {
      expect(lerp(0, 100, 0.5)).toBe(50);
    });

    it('should extrapolate beyond range', () => {
      expect(lerp(0, 100, 1.5)).toBe(150);
      expect(lerp(0, 100, -0.5)).toBe(-50);
    });
  });

  describe('clamp', () => {
    it('should return value if within range', () => {
      expect(clamp(50, 0, 100)).toBe(50);
    });

    it('should return min if value below range', () => {
      expect(clamp(-10, 0, 100)).toBe(0);
    });

    it('should return max if value above range', () => {
      expect(clamp(150, 0, 100)).toBe(100);
    });

    it('should handle edge values', () => {
      expect(clamp(0, 0, 100)).toBe(0);
      expect(clamp(100, 0, 100)).toBe(100);
    });
  });

  describe('cubicInterpolate', () => {
    it('should return p1 at t=0', () => {
      expect(cubicInterpolate(0, 100, 200, 300, 0)).toBeCloseTo(100, 5);
    });

    it('should return p2 at t=1', () => {
      expect(cubicInterpolate(0, 100, 200, 300, 1)).toBeCloseTo(200, 5);
    });

    it('should interpolate smoothly', () => {
      const mid = cubicInterpolate(0, 100, 200, 300, 0.5);
      expect(mid).toBeGreaterThan(100);
      expect(mid).toBeLessThan(200);
    });
  });

  describe('sinc', () => {
    it('should return 1 at x=0', () => {
      expect(sinc(0)).toBe(1);
    });

    it('should return 0 at integer multiples of PI', () => {
      expect(Math.abs(sinc(1))).toBeLessThan(0.01);
      expect(Math.abs(sinc(2))).toBeLessThan(0.01);
    });

    it('should be symmetric', () => {
      expect(sinc(0.5)).toBeCloseTo(sinc(-0.5), 10);
    });
  });

  describe('lanczos', () => {
    it('should return 1 at x=0', () => {
      expect(lanczos(0, 3)).toBe(1);
    });

    it('should return 0 outside window', () => {
      expect(lanczos(3.5, 3)).toBe(0);
      expect(lanczos(-3.5, 3)).toBe(0);
    });

    it('should be symmetric', () => {
      expect(lanczos(1.5, 3)).toBeCloseTo(lanczos(-1.5, 3), 10);
    });
  });

  describe('sincInterpolate', () => {
    it('should return exact value at integer index', () => {
      const values = [10, 20, 30, 40, 50];
      expect(sincInterpolate(values, 2)).toBe(30);
    });

    it('should interpolate between values', () => {
      const values = [0, 100, 0];
      const mid = sincInterpolate(values, 0.5);
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(100);
    });

    it('should handle edge indices', () => {
      const values = [10, 20, 30];
      expect(sincInterpolate(values, 0)).toBe(10);
      expect(sincInterpolate(values, 2)).toBe(30);
    });
  });

  describe('hermiteInterpolate', () => {
    it('should return p0 at t=0', () => {
      expect(hermiteInterpolate(100, 200, 0, 0, 0)).toBe(100);
    });

    it('should return p1 at t=1', () => {
      expect(hermiteInterpolate(100, 200, 0, 0, 1)).toBe(200);
    });

    it('should respect tangents', () => {
      // With positive tangent at start, curve should initially go up
      const withPositiveTangent = hermiteInterpolate(0, 0, 100, 0, 0.1);
      expect(withPositiveTangent).toBeGreaterThan(0);
    });
  });

  describe('smoothstep', () => {
    it('should return 0 at edge0', () => {
      expect(smoothstep(0, 10, 0)).toBe(0);
    });

    it('should return 1 at edge1', () => {
      expect(smoothstep(0, 10, 10)).toBe(1);
    });

    it('should return 0.5 at midpoint', () => {
      expect(smoothstep(0, 10, 5)).toBe(0.5);
    });

    it('should clamp outside range', () => {
      expect(smoothstep(0, 10, -5)).toBe(0);
      expect(smoothstep(0, 10, 15)).toBe(1);
    });
  });

  describe('smootherstep', () => {
    it('should return 0 at edge0', () => {
      expect(smootherstep(0, 10, 0)).toBe(0);
    });

    it('should return 1 at edge1', () => {
      expect(smootherstep(0, 10, 10)).toBe(1);
    });

    it('should return 0.5 at midpoint', () => {
      expect(smootherstep(0, 10, 5)).toBe(0.5);
    });

    it('should be smoother than smoothstep', () => {
      // At quarter points, smootherstep should be closer to 0/1 than smoothstep
      const ss25 = smoothstep(0, 10, 2.5);
      const ssr25 = smootherstep(0, 10, 2.5);
      expect(ssr25).toBeLessThan(ss25); // smoother = stays near 0 longer
    });
  });
});
