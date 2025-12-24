/**
 * Grid Detector Tests
 * Tests for local ECG grid detection using computer vision
 */

import { describe, it, expect } from 'vitest';
import { LocalGridDetector } from '../../../src/signal/loader/png-digitizer/cv/grid-detector';

/**
 * Create a mock ImageData object
 */
function createImageData(width: number, height: number, fillColor: [number, number, number, number] = [255, 255, 255, 255]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fillColor[0];
    data[i * 4 + 1] = fillColor[1];
    data[i * 4 + 2] = fillColor[2];
    data[i * 4 + 3] = fillColor[3];
  }
  return { width, height, data, colorSpace: 'srgb' };
}

/**
 * Set pixel color in ImageData
 */
function setPixel(imageData: ImageData, x: number, y: number, r: number, g: number, b: number): void {
  if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) return;
  const idx = (y * imageData.width + x) * 4;
  imageData.data[idx] = r;
  imageData.data[idx + 1] = g;
  imageData.data[idx + 2] = b;
  imageData.data[idx + 3] = 255;
}

/**
 * Draw vertical grid lines
 * Offset of 25 ensures corners (20x20) remain clear for background sampling
 */
function drawVerticalGridLines(
  imageData: ImageData,
  spacing: number,
  color: [number, number, number] = [200, 200, 200],
  offset: number = 25
): void {
  for (let x = offset; x < imageData.width - offset; x += spacing) {
    for (let y = 0; y < imageData.height; y++) {
      setPixel(imageData, x, y, color[0], color[1], color[2]);
    }
  }
}

/**
 * Draw horizontal grid lines
 * Offset of 25 ensures corners (20x20) remain clear for background sampling
 */
function drawHorizontalGridLines(
  imageData: ImageData,
  spacing: number,
  color: [number, number, number] = [200, 200, 200],
  offset: number = 25
): void {
  for (let y = offset; y < imageData.height - offset; y += spacing) {
    for (let x = 0; x < imageData.width; x++) {
      setPixel(imageData, x, y, color[0], color[1], color[2]);
    }
  }
}

/**
 * Draw complete grid pattern
 * Default colors are darker to be detected as non-background (threshold is 30 RGB diff)
 */
function drawGrid(
  imageData: ImageData,
  smallBoxSize: number,
  thinColor: [number, number, number] = [200, 150, 150], // Darker pink - will differ from white bg by 55+
  thickColor: [number, number, number] = [180, 100, 100]  // Even darker for thick lines
): void {
  // Draw thin lines (every small box)
  drawVerticalGridLines(imageData, smallBoxSize, thinColor);
  drawHorizontalGridLines(imageData, smallBoxSize, thinColor);

  // Draw thick lines (every 5 small boxes = large box)
  const largeBoxSize = smallBoxSize * 5;
  drawVerticalGridLines(imageData, largeBoxSize, thickColor);
  drawHorizontalGridLines(imageData, largeBoxSize, thickColor);
}

describe('LocalGridDetector', () => {
  describe('constructor', () => {
    it('should accept ImageData', () => {
      const imageData = createImageData(100, 100);
      const detector = new LocalGridDetector(imageData);
      expect(detector).toBeInstanceOf(LocalGridDetector);
    });

    it('should handle various image sizes', () => {
      const sizes = [[100, 100], [1920, 1080], [3300, 2550], [50, 200]];
      for (const [w, h] of sizes) {
        const imageData = createImageData(w, h);
        const detector = new LocalGridDetector(imageData);
        expect(detector).toBeInstanceOf(LocalGridDetector);
      }
    });
  });

  describe('analyze', () => {
    it('should return ECGImageAnalysis structure', async () => {
      const imageData = createImageData(1000, 800);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result).toHaveProperty('grid');
      expect(result).toHaveProperty('layout');
      expect(result).toHaveProperty('calibration');
      expect(result).toHaveProperty('panels');
      expect(result).toHaveProperty('imageQuality');
      expect(result).toHaveProperty('notes');
    });

    it('should include analysis note', async () => {
      const imageData = createImageData(1000, 800);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.notes).toContain('Analyzed using local CV algorithms');
    });
  });

  describe('grid detection', () => {
    it('should detect regular grid pattern', async () => {
      // Larger image with clear grid lines - more realistic ECG image size
      const imageData = createImageData(1000, 800);
      // Use very dark grid lines on white background for clear detection
      drawGrid(imageData, 20, [100, 100, 100], [50, 50, 50]); // Dark gray grid

      const detector = new LocalGridDetector(imageData);
      const result = await detector.analyze();

      expect(result.grid.detected).toBe(true);
      expect(result.grid.type).toBe('standard');
      expect(result.grid.smallBoxPx).toBeGreaterThan(0);
    });

    it('should return no grid for plain white image', async () => {
      const imageData = createImageData(500, 400);
      // No grid drawn - all white

      const detector = new LocalGridDetector(imageData);
      const result = await detector.analyze();

      expect(result.grid.detected).toBe(false);
      expect(result.grid.type).toBe('none');
      expect(result.grid.confidence).toBeLessThan(0.5);
    });

    it('should return no grid for plain colored image', async () => {
      const imageData = createImageData(500, 400, [255, 200, 200, 255]); // Pink
      // No grid drawn

      const detector = new LocalGridDetector(imageData);
      const result = await detector.analyze();

      expect(result.grid.detected).toBe(false);
    });

    it('should detect grid with standard ECG colors', async () => {
      // Larger image with ECG-like pink background
      const imageData = createImageData(1000, 800, [255, 240, 240, 255]); // Light pink bg
      // Grid lines must differ from bg by > 30 in all channels for detection
      // Pink bg is [255, 240, 240], so grid needs to be significantly different
      drawGrid(imageData, 20, [255, 180, 180], [255, 100, 100]); // Pink grid - green diff = 60+

      const detector = new LocalGridDetector(imageData);
      const result = await detector.analyze();

      expect(result.grid.detected).toBe(true);
    });

    it('should calculate confidence based on grid consistency', async () => {
      const imageData = createImageData(1000, 800);
      drawGrid(imageData, 20, [100, 100, 100], [50, 50, 50]);

      const detector = new LocalGridDetector(imageData);
      const result = await detector.analyze();

      expect(result.grid.confidence).toBeGreaterThan(0);
      expect(result.grid.confidence).toBeLessThanOrEqual(1);
    });

    it('should estimate pixels per mm from grid', async () => {
      const imageData = createImageData(1000, 800);
      const smallBoxPx = 20;
      drawGrid(imageData, smallBoxPx, [100, 100, 100], [50, 50, 50]);

      const detector = new LocalGridDetector(imageData);
      const result = await detector.analyze();

      if (result.grid.detected) {
        expect(result.grid.pxPerMm).toBeCloseTo(smallBoxPx, -1);
        expect(result.grid.smallBoxPx).toBeCloseTo(smallBoxPx, -1);
        expect(result.grid.largeBoxPx).toBeCloseTo(smallBoxPx * 5, -1);
      }
    });

    it('should detect background color', async () => {
      const imageData = createImageData(1000, 800, [255, 240, 240, 255]); // Light pink
      drawGrid(imageData, 20, [255, 150, 150], [255, 100, 100]);

      const detector = new LocalGridDetector(imageData);
      const result = await detector.analyze();

      if (result.grid.detected) {
        expect(result.grid.backgroundColor).toBeDefined();
        // Should be close to the pink background
        expect(result.grid.backgroundColor?.toLowerCase()).toMatch(/^#[0-9a-f]{6}$/);
      }
    });

    it('should estimate DPI from grid', async () => {
      const imageData = createImageData(1000, 800);
      drawGrid(imageData, 20, [100, 100, 100], [50, 50, 50]);

      const detector = new LocalGridDetector(imageData);
      const result = await detector.analyze();

      if (result.grid.detected) {
        expect(result.grid.estimatedDpi).toBeGreaterThan(0);
      }
    });
  });

  describe('layout detection', () => {
    it('should detect 12-lead format for landscape image', async () => {
      const imageData = createImageData(1600, 1000); // Landscape
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.layout.format).toBe('12-lead');
      expect(result.layout.columns).toBe(4);
      expect(result.layout.rows).toBe(3);
    });

    it('should detect 6x2 format for portrait image', async () => {
      const imageData = createImageData(600, 1000); // Portrait
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.layout.format).toBe('6x2');
      expect(result.layout.columns).toBe(2);
      expect(result.layout.rows).toBe(6);
    });

    it('should default to 12-lead for square-ish image', async () => {
      const imageData = createImageData(1000, 1000); // Square
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.layout.format).toBe('12-lead');
    });

    it('should include image dimensions', async () => {
      const imageData = createImageData(1920, 1080);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.layout.imageWidth).toBe(1920);
      expect(result.layout.imageHeight).toBe(1080);
    });

    it('should have confidence score', async () => {
      const imageData = createImageData(1000, 800);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.layout.confidence).toBeGreaterThan(0);
      expect(result.layout.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('calibration detection', () => {
    it('should return default calibration values', async () => {
      const imageData = createImageData(1000, 800);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.calibration.found).toBe(false);
      expect(result.calibration.gain).toBe(10); // Standard 10 mm/mV
      expect(result.calibration.paperSpeed).toBe(25); // Standard 25 mm/s
    });

    it('should indicate calibration source as assumed', async () => {
      const imageData = createImageData(1000, 800);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.calibration.gainSource).toBe('standard_assumed');
      expect(result.calibration.speedSource).toBe('standard_assumed');
    });

    it('should have low confidence for assumed calibration', async () => {
      const imageData = createImageData(1000, 800);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.calibration.confidence).toBeLessThan(0.5);
    });
  });

  describe('panel detection', () => {
    it('should create panels for 12-lead layout', async () => {
      const imageData = createImageData(1600, 1000);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.panels).toHaveLength(12); // 3 rows × 4 columns
    });

    it('should create panels for 6x2 layout', async () => {
      const imageData = createImageData(600, 1000);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.panels).toHaveLength(12); // 6 rows × 2 columns
    });

    it('should assign standard lead names', async () => {
      const imageData = createImageData(1600, 1000);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      const leadNames = result.panels.map(p => p.lead).filter(l => l !== null);
      expect(leadNames).toContain('I');
      expect(leadNames).toContain('II');
      expect(leadNames).toContain('III');
      expect(leadNames).toContain('aVR');
      expect(leadNames).toContain('aVL');
      expect(leadNames).toContain('aVF');
      expect(leadNames).toContain('V1');
      expect(leadNames).toContain('V6');
    });

    it('should have unique panel IDs', async () => {
      const imageData = createImageData(1600, 1000);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      const ids = result.panels.map(p => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have valid bounds for each panel', async () => {
      const imageData = createImageData(1600, 1000);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      for (const panel of result.panels) {
        expect(panel.bounds.x).toBeGreaterThanOrEqual(0);
        expect(panel.bounds.y).toBeGreaterThanOrEqual(0);
        expect(panel.bounds.width).toBeGreaterThan(0);
        expect(panel.bounds.height).toBeGreaterThan(0);
        expect(panel.bounds.x + panel.bounds.width).toBeLessThanOrEqual(1600);
        expect(panel.bounds.y + panel.bounds.height).toBeLessThanOrEqual(1000);
      }
    });

    it('should set baselineY within panel bounds', async () => {
      const imageData = createImageData(1600, 1000);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      for (const panel of result.panels) {
        expect(panel.baselineY).toBeGreaterThanOrEqual(panel.bounds.y);
        expect(panel.baselineY).toBeLessThanOrEqual(panel.bounds.y + panel.bounds.height);
      }
    });

    it('should include row and column indices', async () => {
      const imageData = createImageData(1600, 1000);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      for (const panel of result.panels) {
        expect(panel.row).toBeGreaterThanOrEqual(0);
        expect(panel.col).toBeGreaterThanOrEqual(0);
      }
    });

    it('should set leadSource for inferred leads', async () => {
      const imageData = createImageData(1600, 1000);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      const panelsWithLeads = result.panels.filter(p => p.lead !== null);
      for (const panel of panelsWithLeads) {
        expect(panel.leadSource).toBe('position_inferred');
      }
    });
  });

  describe('image quality assessment', () => {
    it('should assess high resolution image', async () => {
      const imageData = createImageData(2000, 1500); // > 2M pixels
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.imageQuality.resolution).toBe('high');
      expect(result.imageQuality.overall).toBeGreaterThan(0.7);
    });

    it('should assess medium resolution image', async () => {
      const imageData = createImageData(1200, 900); // ~1M pixels
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.imageQuality.resolution).toBe('medium');
    });

    it('should assess low resolution image', async () => {
      const imageData = createImageData(800, 700); // ~560K pixels
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.imageQuality.resolution).toBe('low');
    });

    it('should assess very low resolution image', async () => {
      const imageData = createImageData(400, 300); // 120K pixels
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.imageQuality.resolution).toBe('very_low');
      expect(result.imageQuality.overall).toBeLessThan(0.5);
    });

    it('should estimate effective DPI', async () => {
      const imageData = createImageData(1100, 850); // ~11" wide at 100dpi
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.imageQuality.effectiveDpi).toBeGreaterThan(0);
      expect(result.imageQuality.effectiveDpi).toBeCloseTo(100, -1);
    });

    it('should have empty issues array by default', async () => {
      const imageData = createImageData(1000, 800);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.imageQuality.issues).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle minimum size image', async () => {
      const imageData = createImageData(50, 50);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result).toBeDefined();
      expect(result.grid).toBeDefined();
      expect(result.layout).toBeDefined();
    });

    it('should handle very wide image', async () => {
      const imageData = createImageData(5000, 500);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.layout.format).toBe('12-lead');
    });

    it('should handle very tall image', async () => {
      const imageData = createImageData(500, 5000);
      const detector = new LocalGridDetector(imageData);

      const result = await detector.analyze();

      expect(result.layout.format).toBe('6x2');
    });

    it('should handle image with noise', async () => {
      const imageData = createImageData(1000, 800);
      drawGrid(imageData, 20, [100, 100, 100], [50, 50, 50]);

      // Add random noise
      for (let i = 0; i < 2000; i++) {
        const x = Math.floor(Math.random() * 1000);
        const y = Math.floor(Math.random() * 800);
        setPixel(imageData, x, y, Math.random() * 255, Math.random() * 255, Math.random() * 255);
      }

      const detector = new LocalGridDetector(imageData);
      const result = await detector.analyze();

      // Should still be able to analyze (may or may not detect grid)
      expect(result).toBeDefined();
    });
  });

  describe('color sampling', () => {
    it('should sample background color from corners', async () => {
      // Create image with colored corners - larger image for reliable detection
      const imageData = createImageData(1000, 800, [255, 200, 200, 255]); // Pink background
      drawGrid(imageData, 20, [255, 100, 100], [255, 50, 50]);

      const detector = new LocalGridDetector(imageData);
      const result = await detector.analyze();

      if (result.grid.detected && result.grid.backgroundColor) {
        // Background should be close to pink
        const bg = result.grid.backgroundColor.toLowerCase();
        expect(bg).toMatch(/^#ff/); // Should start with high red
      }
    });

    it('should sample grid line color', async () => {
      const imageData = createImageData(1000, 800);
      drawGrid(imageData, 20, [100, 100, 100], [50, 50, 50]);

      const detector = new LocalGridDetector(imageData);
      const result = await detector.analyze();

      if (result.grid.detected && result.grid.thinLineColor) {
        // Line color should be defined
        expect(result.grid.thinLineColor).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });
  });
});
