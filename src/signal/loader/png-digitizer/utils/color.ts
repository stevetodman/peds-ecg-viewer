/**
 * Color Utilities
 * Color manipulation and distance calculations
 *
 * @module signal/loader/png-digitizer/utils/color
 */

/**
 * RGB color
 */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Calculate Euclidean distance between two colors
 */
export function colorDistance(c1: RGB, c2: RGB): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Calculate darkness of a color (0 = white, 255 = black)
 */
export function colorDarkness(c: RGB): number {
  return 255 - (c.r + c.g + c.b) / 3;
}

/**
 * Check if two colors are similar
 */
export function colorsAreSimilar(c1: RGB, c2: RGB, threshold: number = 30): boolean {
  return colorDistance(c1, c2) < threshold;
}

/**
 * Convert RGB to hex string
 */
export function rgbToHex(c: RGB): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

/**
 * Parse hex string to RGB
 */
export function hexToRgb(hex: string): RGB | null {
  const match = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return null;

  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

/**
 * Check if color is grayscale
 */
export function isGrayscale(c: RGB, tolerance: number = 10): boolean {
  const avg = (c.r + c.g + c.b) / 3;
  return (
    Math.abs(c.r - avg) < tolerance &&
    Math.abs(c.g - avg) < tolerance &&
    Math.abs(c.b - avg) < tolerance
  );
}

/**
 * Blend two colors
 */
export function blendColors(c1: RGB, c2: RGB, alpha: number): RGB {
  return {
    r: c1.r * (1 - alpha) + c2.r * alpha,
    g: c1.g * (1 - alpha) + c2.g * alpha,
    b: c1.b * (1 - alpha) + c2.b * alpha,
  };
}
