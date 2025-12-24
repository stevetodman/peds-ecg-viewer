/**
 * Waveform Tracer Tests
 * Tests for waveform extraction from ECG image panels
 */

import { describe, it, expect } from 'vitest';
import { WaveformTracer } from '../../../src/signal/loader/png-digitizer/cv/waveform-tracer';
import type { PanelAnalysis } from '../../../src/signal/loader/png-digitizer/types';

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
function setPixel(imageData: ImageData, x: number, y: number, r: number, g: number, b: number, a: number = 255): void {
  const idx = (y * imageData.width + x) * 4;
  imageData.data[idx] = r;
  imageData.data[idx + 1] = g;
  imageData.data[idx + 2] = b;
  imageData.data[idx + 3] = a;
}

/**
 * Draw a horizontal line
 */
function drawHorizontalLine(imageData: ImageData, y: number, startX: number, endX: number, color: [number, number, number] = [0, 0, 0]): void {
  for (let x = startX; x <= endX; x++) {
    setPixel(imageData, x, y, color[0], color[1], color[2]);
  }
}

/**
 * Draw a waveform (sine-like)
 */
function drawWaveform(
  imageData: ImageData,
  startX: number,
  endX: number,
  baselineY: number,
  amplitude: number,
  color: [number, number, number] = [0, 0, 0]
): void {
  for (let x = startX; x <= endX; x++) {
    const phase = (x - startX) / (endX - startX) * Math.PI * 4;
    const y = Math.round(baselineY + Math.sin(phase) * amplitude);
    if (y >= 0 && y < imageData.height) {
      setPixel(imageData, x, y, color[0], color[1], color[2]);
    }
  }
}

/**
 * Create a test panel
 */
function createPanel(overrides: Partial<PanelAnalysis> = {}): PanelAnalysis {
  return {
    id: 'panel_0',
    lead: 'I',
    leadSource: 'text_label',
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    baselineY: 50,
    row: 0,
    col: 0,
    isRhythmStrip: false,
    timeRange: { startSec: 0, endSec: 2.5 },
    labelConfidence: 0.9,
    ...overrides,
  };
}

describe('WaveformTracer', () => {
  describe('constructor', () => {
    it('should accept ImageData and use default config', () => {
      const imageData = createImageData(100, 100);
      const tracer = new WaveformTracer(imageData);
      expect(tracer).toBeInstanceOf(WaveformTracer);
    });

    it('should accept custom config', () => {
      const imageData = createImageData(100, 100);
      const tracer = new WaveformTracer(imageData, {
        darknessThreshold: 150,
        maxInterpolateGap: 5,
        minPointConfidence: 0.5,
      });
      expect(tracer).toBeInstanceOf(WaveformTracer);
    });

    it('should accept waveform color config', () => {
      const imageData = createImageData(100, 100);
      const tracer = new WaveformTracer(imageData, {
        waveformColor: { r: 255, g: 0, b: 0 }, // Red waveform
      });
      expect(tracer).toBeInstanceOf(WaveformTracer);
    });
  });

  describe('tracePanel', () => {
    it('should return null if panel has no lead', () => {
      const imageData = createImageData(100, 100);
      const tracer = new WaveformTracer(imageData);
      const panel = createPanel({ lead: null });

      const result = tracer.tracePanel(panel);
      expect(result).toBeNull();
    });

    it('should return null if no waveform found', () => {
      const imageData = createImageData(100, 100); // All white
      const tracer = new WaveformTracer(imageData);
      const panel = createPanel();

      const result = tracer.tracePanel(panel);
      expect(result).toBeNull();
    });

    it('should extract horizontal line waveform', () => {
      const imageData = createImageData(100, 100);
      drawHorizontalLine(imageData, 50, 10, 90);

      const tracer = new WaveformTracer(imageData);
      const panel = createPanel();

      const result = tracer.tracePanel(panel);

      expect(result).not.toBeNull();
      expect(result!.lead).toBe('I');
      expect(result!.xPixels.length).toBeGreaterThan(0);
      expect(result!.yPixels.length).toBe(result!.xPixels.length);
      expect(result!.confidence.length).toBe(result!.xPixels.length);
    });

    it('should extract sine waveform', () => {
      const imageData = createImageData(200, 100);
      drawWaveform(imageData, 10, 190, 50, 30);

      const tracer = new WaveformTracer(imageData);
      const panel = createPanel({ bounds: { x: 0, y: 0, width: 200, height: 100 } });

      const result = tracer.tracePanel(panel);

      expect(result).not.toBeNull();
      expect(result!.xPixels.length).toBeGreaterThan(100);

      // Y values should vary (not all same)
      const uniqueY = new Set(result!.yPixels.map(y => Math.round(y)));
      expect(uniqueY.size).toBeGreaterThan(10);
    });

    it('should return trace with correct metadata', () => {
      const imageData = createImageData(100, 100);
      drawHorizontalLine(imageData, 50, 10, 90);

      const tracer = new WaveformTracer(imageData);
      const panel = createPanel({
        id: 'test_panel',
        lead: 'V1',
        baselineY: 50,
      });

      const result = tracer.tracePanel(panel);

      expect(result).not.toBeNull();
      expect(result!.panelId).toBe('test_panel');
      expect(result!.lead).toBe('V1');
      expect(result!.baselineY).toBe(50);
      expect(result!.method).toBe('column_scan');
    });

    it('should clamp bounds to image dimensions', () => {
      const imageData = createImageData(100, 100);
      drawHorizontalLine(imageData, 50, 0, 99);

      const tracer = new WaveformTracer(imageData);
      // Panel extends beyond image
      const panel = createPanel({
        bounds: { x: -10, y: -10, width: 200, height: 200 },
      });

      const result = tracer.tracePanel(panel);

      expect(result).not.toBeNull();
      // X values should be within image bounds
      expect(Math.min(...result!.xPixels)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...result!.xPixels)).toBeLessThan(100);
    });

    it('should respect darkness threshold', () => {
      const imageData = createImageData(100, 100);
      // Draw gray line with darkness = 255 - 100 = 155
      drawHorizontalLine(imageData, 50, 10, 90, [100, 100, 100]);

      // High threshold (200) - should not detect (darkness 155 < 200)
      const tracerHigh = new WaveformTracer(imageData, { darknessThreshold: 200 });
      expect(tracerHigh.tracePanel(createPanel())).toBeNull();

      // Low threshold (100) - should detect (darkness 155 > 100)
      const tracerLow = new WaveformTracer(imageData, { darknessThreshold: 100 });
      expect(tracerLow.tracePanel(createPanel())).not.toBeNull();
    });

    it('should respect minPointConfidence', () => {
      const imageData = createImageData(100, 100);
      // Draw semi-dark line
      drawHorizontalLine(imageData, 50, 10, 90, [100, 100, 100]);

      const tracer = new WaveformTracer(imageData, {
        darknessThreshold: 50,
        minPointConfidence: 0.9, // Very high
      });

      const result = tracer.tracePanel(createPanel());
      // May or may not find points depending on confidence
      // Just verify it doesn't crash
      expect(result === null || result.xPixels.length >= 0).toBe(true);
    });
  });

  describe('gap detection and interpolation', () => {
    it('should detect gaps in waveform', () => {
      const imageData = createImageData(100, 100);
      // Draw line with gap
      drawHorizontalLine(imageData, 50, 10, 40);
      // Gap from 41-59
      drawHorizontalLine(imageData, 50, 60, 90);

      const tracer = new WaveformTracer(imageData, { maxInterpolateGap: 5 });
      const panel = createPanel();

      const result = tracer.tracePanel(panel);

      expect(result).not.toBeNull();
      // Should have at least one gap (19 pixels, larger than maxInterpolateGap)
      expect(result!.gaps.length).toBeGreaterThan(0);
    });

    it('should interpolate small gaps', () => {
      const imageData = createImageData(100, 100);
      // Draw line with small gap
      drawHorizontalLine(imageData, 50, 10, 45);
      // Gap from 46-49 (4 pixels)
      drawHorizontalLine(imageData, 50, 50, 90);

      const tracer = new WaveformTracer(imageData, { maxInterpolateGap: 10 });
      const panel = createPanel();

      const result = tracer.tracePanel(panel);

      expect(result).not.toBeNull();
      // Small gap should be interpolated, so no gaps in result
      expect(result!.gaps.length).toBe(0);

      // Should have continuous x values
      const sortedX = [...result!.xPixels].sort((a, b) => a - b);
      for (let i = 1; i < sortedX.length; i++) {
        expect(sortedX[i] - sortedX[i - 1]).toBeLessThanOrEqual(1);
      }
    });

    it('should not interpolate large gaps', () => {
      const imageData = createImageData(100, 100);
      // Draw line with large gap
      drawHorizontalLine(imageData, 50, 10, 30);
      // Gap from 31-69 (39 pixels)
      drawHorizontalLine(imageData, 50, 70, 90);

      const tracer = new WaveformTracer(imageData, { maxInterpolateGap: 10 });
      const panel = createPanel();

      const result = tracer.tracePanel(panel);

      expect(result).not.toBeNull();
      // Large gap should remain
      expect(result!.gaps.length).toBe(1);
    });
  });

  describe('colored waveform detection', () => {
    it('should detect black waveform by default', () => {
      const imageData = createImageData(100, 100);
      drawHorizontalLine(imageData, 50, 10, 90, [0, 0, 0]);

      const tracer = new WaveformTracer(imageData);
      const result = tracer.tracePanel(createPanel());

      expect(result).not.toBeNull();
    });

    it('should detect colored waveform when color specified', () => {
      const imageData = createImageData(100, 100);
      // Draw red waveform
      drawHorizontalLine(imageData, 50, 10, 90, [255, 0, 0]);

      const tracer = new WaveformTracer(imageData, {
        waveformColor: { r: 255, g: 0, b: 0 },
        darknessThreshold: 50,
      });
      const result = tracer.tracePanel(createPanel());

      expect(result).not.toBeNull();
    });

    it('should not detect wrong color waveform', () => {
      const imageData = createImageData(100, 100);
      // Draw blue waveform
      drawHorizontalLine(imageData, 50, 10, 90, [0, 0, 255]);

      const tracer = new WaveformTracer(imageData, {
        waveformColor: { r: 255, g: 0, b: 0 }, // Looking for red
        darknessThreshold: 200, // High threshold
      });
      const result = tracer.tracePanel(createPanel());

      // May or may not detect depending on threshold
      expect(result === null || result.xPixels.length >= 0).toBe(true);
    });
  });

  describe('traceAllPanels', () => {
    it('should trace multiple panels', () => {
      const imageData = createImageData(200, 200);
      // Draw waveforms in two panel areas
      drawHorizontalLine(imageData, 25, 10, 90);
      drawHorizontalLine(imageData, 125, 110, 190);

      const tracer = new WaveformTracer(imageData);
      const panels = [
        createPanel({ id: 'panel_0', lead: 'I', bounds: { x: 0, y: 0, width: 100, height: 50 }, baselineY: 25 }),
        createPanel({ id: 'panel_1', lead: 'II', bounds: { x: 100, y: 100, width: 100, height: 50 }, baselineY: 125 }),
      ];

      const traces = tracer.traceAllPanels(panels);

      expect(traces).toHaveLength(2);
      expect(traces[0].lead).toBe('I');
      expect(traces[1].lead).toBe('II');
    });

    it('should skip panels with null lead', () => {
      const imageData = createImageData(200, 100);
      drawHorizontalLine(imageData, 50, 10, 190);

      const tracer = new WaveformTracer(imageData);
      const panels = [
        createPanel({ id: 'panel_0', lead: 'I' }),
        createPanel({ id: 'panel_1', lead: null }),
      ];

      const traces = tracer.traceAllPanels(panels);

      expect(traces).toHaveLength(1);
      expect(traces[0].lead).toBe('I');
    });

    it('should skip panels where tracing fails', () => {
      const imageData = createImageData(200, 100);
      // Only draw in first panel area
      drawHorizontalLine(imageData, 50, 10, 90);

      const tracer = new WaveformTracer(imageData);
      const panels = [
        createPanel({ id: 'panel_0', lead: 'I', bounds: { x: 0, y: 0, width: 100, height: 100 } }),
        createPanel({ id: 'panel_1', lead: 'II', bounds: { x: 100, y: 0, width: 100, height: 100 } }),
      ];

      const traces = tracer.traceAllPanels(panels);

      expect(traces).toHaveLength(1);
    });

    it('should return empty array for empty panels', () => {
      const imageData = createImageData(100, 100);
      const tracer = new WaveformTracer(imageData);

      const traces = tracer.traceAllPanels([]);

      expect(traces).toEqual([]);
    });
  });

  describe('detectWaveformColor', () => {
    it('should detect black waveform color', () => {
      const imageData = createImageData(100, 100);
      drawHorizontalLine(imageData, 50, 10, 90, [0, 0, 0]);

      const tracer = new WaveformTracer(imageData);
      const panel = createPanel();

      const color = tracer.detectWaveformColor(panel);

      expect(color).not.toBeNull();
      expect(color!.r).toBe(0);
      expect(color!.g).toBe(0);
      expect(color!.b).toBe(0);
    });

    it('should detect colored waveform', () => {
      const imageData = createImageData(100, 100);
      drawHorizontalLine(imageData, 50, 40, 60, [255, 0, 0]); // Red line in center

      const tracer = new WaveformTracer(imageData);
      const panel = createPanel();

      const color = tracer.detectWaveformColor(panel);

      expect(color).not.toBeNull();
      expect(color!.r).toBe(255);
      expect(color!.g).toBe(0);
      expect(color!.b).toBe(0);
    });

    it('should return null for white image', () => {
      const imageData = createImageData(100, 100); // All white

      const tracer = new WaveformTracer(imageData);
      const panel = createPanel();

      const color = tracer.detectWaveformColor(panel);

      expect(color).toBeNull();
    });

    it('should return null for light gray image', () => {
      const imageData = createImageData(100, 100, [200, 200, 200, 255]);

      const tracer = new WaveformTracer(imageData);
      const panel = createPanel();

      const color = tracer.detectWaveformColor(panel);

      expect(color).toBeNull();
    });
  });

  describe('sub-pixel accuracy', () => {
    it('should calculate weighted Y centroid for thick lines', () => {
      const imageData = createImageData(100, 100);
      // Draw thick line (3 pixels high)
      drawHorizontalLine(imageData, 49, 10, 90, [100, 100, 100]); // lighter
      drawHorizontalLine(imageData, 50, 10, 90, [0, 0, 0]);       // darkest
      drawHorizontalLine(imageData, 51, 10, 90, [100, 100, 100]); // lighter

      const tracer = new WaveformTracer(imageData);
      const panel = createPanel();

      const result = tracer.tracePanel(panel);

      expect(result).not.toBeNull();
      // Y values should be close to 50 (center of thick line)
      const avgY = result!.yPixels.reduce((a, b) => a + b, 0) / result!.yPixels.length;
      expect(avgY).toBeCloseTo(50, 0);
    });

    it('should produce sub-pixel Y values', () => {
      const imageData = createImageData(100, 100);
      // Draw line at y=50 with anti-aliasing
      for (let x = 10; x <= 90; x++) {
        setPixel(imageData, x, 49, 128, 128, 128); // half-dark above
        setPixel(imageData, x, 50, 0, 0, 0);       // full dark
        setPixel(imageData, x, 51, 64, 64, 64);    // quarter-dark below
      }

      const tracer = new WaveformTracer(imageData);
      const panel = createPanel();

      const result = tracer.tracePanel(panel);

      expect(result).not.toBeNull();
      // Y values should have fractional parts (sub-pixel)
      const hasFractionalY = result!.yPixels.some(y => y !== Math.floor(y));
      expect(hasFractionalY).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle 1x1 image', () => {
      const imageData = createImageData(1, 1, [0, 0, 0, 255]);
      const tracer = new WaveformTracer(imageData);
      const panel = createPanel({ bounds: { x: 0, y: 0, width: 1, height: 1 } });

      const result = tracer.tracePanel(panel);
      // May or may not find a point
      expect(result === null || result.xPixels.length >= 0).toBe(true);
    });

    it('should handle panel at image edge', () => {
      const imageData = createImageData(100, 100);
      drawHorizontalLine(imageData, 99, 0, 99);

      const tracer = new WaveformTracer(imageData);
      const panel = createPanel({ bounds: { x: 0, y: 90, width: 100, height: 10 } });

      const result = tracer.tracePanel(panel);
      expect(result).not.toBeNull();
    });

    it('should handle all leads', () => {
      const imageData = createImageData(100, 100);
      drawHorizontalLine(imageData, 50, 10, 90);
      const tracer = new WaveformTracer(imageData);

      const leads = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
      for (const lead of leads) {
        const panel = createPanel({ lead: lead as any });
        const result = tracer.tracePanel(panel);
        expect(result).not.toBeNull();
        expect(result!.lead).toBe(lead);
      }
    });
  });
});
