/**
 * Local Grid Detector
 * Pure algorithmic ECG grid detection without AI
 *
 * @module signal/loader/png-digitizer/cv/grid-detector
 */

import type {
  ECGImageAnalysis,
  GridAnalysis,
  LayoutAnalysis,
  CalibrationAnalysis,
  PanelAnalysis,
  ImageQualityAssessment,
} from '../types';
import type { LeadName } from '../../../../types';

/**
 * Color sample
 */
interface ColorSample {
  r: number;
  g: number;
  b: number;
  count: number;
}

/**
 * Local grid detector using pure computer vision algorithms
 */
export class LocalGridDetector {
  private width: number;
  private height: number;
  private data: Uint8ClampedArray;

  constructor(imageData: ImageData) {
    this.width = imageData.width;
    this.height = imageData.height;
    this.data = imageData.data;
  }

  /**
   * Analyze image and return ECG analysis
   */
  async analyze(): Promise<ECGImageAnalysis> {
    const grid = this.detectGrid();
    const layout = this.detectLayout(grid);
    const calibration = this.detectCalibration(grid);
    const panels = this.detectPanels(layout, grid);
    const imageQuality = this.assessImageQuality();

    return {
      grid,
      layout,
      calibration,
      panels,
      imageQuality,
      notes: ['Analyzed using local CV algorithms'],
    };
  }

  /**
   * Detect grid pattern in image
   */
  private detectGrid(): GridAnalysis {
    // Sample background color (corners are usually background)
    const bgColor = this.sampleBackgroundColor();

    // Detect if image has a grid
    const gridInfo = this.findGridLines(bgColor);

    if (!gridInfo.detected) {
      return {
        detected: false,
        type: 'none',
        confidence: 0.3,
      };
    }

    // Estimate pixels per mm based on grid spacing
    const smallBoxPx = gridInfo.smallBoxSize;
    const largeBoxPx = gridInfo.largeBoxSize || smallBoxPx * 5;
    const pxPerMm = smallBoxPx; // 1mm = 1 small box

    return {
      detected: true,
      type: 'standard',
      backgroundColor: this.rgbToHex(bgColor),
      thinLineColor: gridInfo.thinLineColor ? this.rgbToHex(gridInfo.thinLineColor) : undefined,
      thickLineColor: gridInfo.thickLineColor ? this.rgbToHex(gridInfo.thickLineColor) : undefined,
      estimatedDpi: Math.round(pxPerMm * 25.4),
      pxPerMm,
      smallBoxPx,
      largeBoxPx,
      rotation: 0,
      confidence: gridInfo.confidence,
    };
  }

  /**
   * Sample background color from image corners
   */
  private sampleBackgroundColor(): ColorSample {
    const samples: ColorSample[] = [];
    const sampleSize = 20;

    // Sample from corners
    const corners = [
      { x: 0, y: 0 },
      { x: this.width - sampleSize, y: 0 },
      { x: 0, y: this.height - sampleSize },
      { x: this.width - sampleSize, y: this.height - sampleSize },
    ];

    for (const corner of corners) {
      const sample = this.sampleRegion(corner.x, corner.y, sampleSize, sampleSize);
      samples.push(sample);
    }

    // Return most common color
    return samples.reduce((a, b) => (a.count > b.count ? a : b));
  }

  /**
   * Sample average color in a region
   */
  private sampleRegion(x: number, y: number, w: number, h: number): ColorSample {
    let rSum = 0, gSum = 0, bSum = 0;
    let count = 0;

    // Clamp bounds
    const startX = Math.max(0, x);
    const startY = Math.max(0, y);
    const endX = Math.min(this.width, x + w);
    const endY = Math.min(this.height, y + h);

    for (let py = startY; py < endY; py++) {
      for (let px = startX; px < endX; px++) {
        const idx = (py * this.width + px) * 4;

        rSum += this.data[idx] ?? 0;
        gSum += this.data[idx + 1] ?? 0;
        bSum += this.data[idx + 2] ?? 0;
        count++;
      }
    }

    // Ensure we have valid samples
    if (count === 0) {
      return { r: 255, g: 255, b: 255, count: 0 }; // Default to white
    }

    return {
      r: Math.round(rSum / count),
      g: Math.round(gSum / count),
      b: Math.round(bSum / count),
      count,
    };
  }

  /**
   * Find grid lines in image using multi-line scanning
   */
  private findGridLines(bgColor: ColorSample): {
    detected: boolean;
    smallBoxSize: number;
    largeBoxSize?: number;
    thinLineColor?: ColorSample;
    thickLineColor?: ColorSample;
    confidence: number;
  } {
    // Scan multiple horizontal lines for robustness
    const scanLines = [
      Math.floor(this.height * 0.25),
      Math.floor(this.height * 0.5),
      Math.floor(this.height * 0.75),
    ];

    const allIntervals: number[] = [];
    let detectedThinColor: ColorSample | undefined;

    for (const scanY of scanLines) {
      const transitions: number[] = [];
      let prevIsGrid = false;

      for (let x = 0; x < this.width; x++) {
        const idx = (scanY * this.width + x) * 4;
        const r = this.data[idx];
        const g = this.data[idx + 1];
        const b = this.data[idx + 2];

        // Check if this is a grid line (pink/red for ECG, or non-background)
        const isGrid = this.isGridLine(r, g, b, bgColor);

        if (isGrid && !prevIsGrid) {
          transitions.push(x);
          if (!detectedThinColor && transitions.length > 2) {
            detectedThinColor = { r, g, b, count: 1 };
          }
        }
        prevIsGrid = isGrid;
      }

      // Calculate intervals
      for (let i = 1; i < transitions.length; i++) {
        allIntervals.push(transitions[i] - transitions[i - 1]);
      }
    }

    if (allIntervals.length < 15) {
      return { detected: false, smallBoxSize: 0, confidence: 0 };
    }

    // Find most common interval using histogram
    const intervalCounts = new Map<number, number>();
    for (const interval of allIntervals) {
      // Round to nearest pixel for tolerance
      const rounded = Math.round(interval);
      if (rounded >= 3 && rounded <= 100) {
        intervalCounts.set(rounded, (intervalCounts.get(rounded) || 0) + 1);
      }
    }

    // Find peak in histogram
    let mostCommonInterval = 0;
    let maxCount = 0;
    for (const [interval, count] of intervalCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonInterval = interval;
      }
    }

    if (mostCommonInterval < 3) {
      return { detected: false, smallBoxSize: 0, confidence: 0 };
    }

    // Look for large box size (should be ~5x small box)
    let largeBoxSize = mostCommonInterval * 5;
    const expectedLarge = mostCommonInterval * 5;
    for (let tolerance = 0; tolerance <= 3; tolerance++) {
      const candidates = [expectedLarge - tolerance, expectedLarge + tolerance];
      for (const candidate of candidates) {
        if (intervalCounts.has(candidate) && (intervalCounts.get(candidate) ?? 0) > 3) {
          largeBoxSize = candidate;
          break;
        }
      }
    }

    // Calculate confidence based on consistency
    const consistentCount = allIntervals.filter(i =>
      Math.abs(i - mostCommonInterval) <= 2 ||
      Math.abs(i - largeBoxSize) <= 3
    ).length;
    const confidence = Math.min(0.9, consistentCount / allIntervals.length);

    return {
      detected: true,
      smallBoxSize: mostCommonInterval,
      largeBoxSize,
      thinLineColor: detectedThinColor,
      confidence,
    };
  }

  /**
   * Check if pixel is a grid line
   * Supports multiple grid colors: pink, blue, green, orange, gray
   */
  private isGridLine(r: number, g: number, b: number, bg: ColorSample): boolean {
    // Calculate difference from background
    const rDiff = Math.abs(r - bg.r);
    const gDiff = Math.abs(g - bg.g);
    const bDiff = Math.abs(b - bg.b);
    const totalDiff = rDiff + gDiff + bDiff;
    const brightness = (r + g + b) / 3;
    const bgBrightness = (bg.r + bg.g + bg.b) / 3;

    // Skip very dark pixels (likely waveforms, not grid)
    if (brightness < 60) {
      return false;
    }

    // Skip pixels too similar to background
    if (totalDiff < 20) {
      return false;
    }

    // Pink/Red ECG grid (GE MUSE style)
    // Red channel dominant, differs from white background
    if (r > 150 && r > g * 1.05 && r > b * 1.05) {
      if (gDiff > 15 || bDiff > 15 || totalDiff > 25) {
        return true;
      }
    }

    // Blue ECG grid (Philips style)
    // Blue channel dominant
    if (b > 150 && b > r * 1.1 && b > g * 1.05) {
      if (rDiff > 15 || totalDiff > 25) {
        return true;
      }
    }

    // Green ECG grid (some monitors)
    // Green channel dominant
    if (g > 150 && g > r * 1.1 && g > b * 1.1) {
      if (rDiff > 15 || bDiff > 15 || totalDiff > 25) {
        return true;
      }
    }

    // Orange/Yellow ECG grid
    // Red and green high, blue low
    if (r > 150 && g > 120 && r > b * 1.3 && g > b * 1.2) {
      if (bDiff > 20 || totalDiff > 30) {
        return true;
      }
    }

    // Gray grid detection
    const brightnessDiff = Math.abs(brightness - bgBrightness);
    const maxChannel = Math.max(r, g, b);
    const minChannel = Math.min(r, g, b);
    const saturation = maxChannel > 0 ? (maxChannel - minChannel) / maxChannel : 0;

    // Low saturation = grayscale grid
    if (saturation < 0.15 && brightnessDiff > 15) {
      // For light backgrounds, detect darker grid lines
      if (bgBrightness > 200 && brightness > 80 && brightness < bgBrightness - 10) {
        return true;
      }
      // For dark backgrounds, detect lighter grid lines
      if (bgBrightness < 100 && brightness > bgBrightness + 20) {
        return true;
      }
      // Mid-gray grids
      if (brightness > 100 && brightness < 220) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect layout (rows, columns)
   */
  private detectLayout(_grid: GridAnalysis): LayoutAnalysis {
    // Simple heuristic based on image aspect ratio
    const aspectRatio = this.width / this.height;

    let format: LayoutAnalysis['format'] = 'unknown';
    let columns = 4;
    let rows = 3;

    if (aspectRatio > 1.3) {
      // Landscape - likely 3x4 or 3x5
      format = '12-lead';
      columns = 4;
      rows = 3;
    } else if (aspectRatio < 0.8) {
      // Portrait - likely 6x2
      format = '6x2';
      columns = 2;
      rows = 6;
    } else {
      format = '12-lead';
    }

    return {
      format,
      columns,
      rows,
      hasRhythmStrips: false,
      imageWidth: this.width,
      imageHeight: this.height,
      confidence: 0.5,
    };
  }

  /**
   * Detect calibration
   */
  private detectCalibration(_grid: GridAnalysis): CalibrationAnalysis {
    // Look for calibration pulse (square wave) on left side
    // This is a simplified detection - AI does this much better

    return {
      found: false,
      gain: 10, // Assume standard
      paperSpeed: 25, // Assume standard
      gainSource: 'standard_assumed',
      speedSource: 'standard_assumed',
      confidence: 0.3,
    };
  }

  /**
   * Detect panels based on layout
   */
  private detectPanels(layout: LayoutAnalysis, _grid: GridAnalysis): PanelAnalysis[] {
    const panels: PanelAnalysis[] = [];

    // Calculate panel size
    const marginX = this.width * 0.05;
    const marginY = this.height * 0.1;
    const gridWidth = this.width - 2 * marginX;
    const gridHeight = this.height - 2 * marginY;

    const panelWidth = gridWidth / layout.columns;
    const panelHeight = gridHeight / layout.rows;

    // Standard 12-lead order
    const leadOrder: LeadName[][] = [
      ['I', 'aVR', 'V1', 'V4'],
      ['II', 'aVL', 'V2', 'V5'],
      ['III', 'aVF', 'V3', 'V6'],
    ];

    for (let row = 0; row < layout.rows; row++) {
      for (let col = 0; col < layout.columns; col++) {
        const x = marginX + col * panelWidth;
        const y = marginY + row * panelHeight;

        // Get lead name from standard layout
        const lead = leadOrder[row]?.[col] ?? null;

        panels.push({
          id: `panel_${row}_${col}`,
          lead,
          leadSource: lead ? 'position_inferred' : 'unknown',
          bounds: {
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(panelWidth),
            height: Math.round(panelHeight),
          },
          baselineY: Math.round(y + panelHeight / 2),
          row,
          col,
          isRhythmStrip: false,
          timeRange: { startSec: 0, endSec: 2.5 },
          labelConfidence: lead ? 0.5 : 0,
        });
      }
    }

    return panels;
  }

  /**
   * Assess image quality
   */
  private assessImageQuality(): ImageQualityAssessment {
    const resolution = this.assessResolution();

    return {
      overall: resolution === 'high' ? 0.8 : resolution === 'medium' ? 0.6 : 0.4,
      resolution,
      effectiveDpi: this.estimateDpi(),
      issues: [],
    };
  }

  /**
   * Assess resolution quality
   */
  private assessResolution(): 'high' | 'medium' | 'low' | 'very_low' {
    const pixels = this.width * this.height;

    if (pixels > 2000000) return 'high';
    if (pixels > 1000000) return 'medium';
    if (pixels > 500000) return 'low';
    return 'very_low';
  }

  /**
   * Estimate effective DPI
   */
  private estimateDpi(): number {
    // Assume standard letter page (11x8.5 inches)
    const assumedWidthInches = 11;
    return Math.round(this.width / assumedWidthInches);
  }

  /**
   * Convert RGB to hex
   */
  private rgbToHex(color: ColorSample): string {
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
  }
}
