/**
 * Multi-ECG Detector
 * Detect and split multiple ECGs on a single page
 *
 * @module signal/loader/png-digitizer/cv/multi-ecg-detector
 */

import type { Bounds } from '../types';

/**
 * Detected ECG region
 */
export interface ECGRegion {
  /** Region ID */
  id: string;

  /** Bounding box */
  bounds: Bounds;

  /** Confidence that this is an ECG */
  confidence: number;

  /** Estimated format (12-lead, single-strip, etc.) */
  estimatedFormat: string;

  /** Has visible grid */
  hasGrid: boolean;

  /** Has visible waveforms */
  hasWaveforms: boolean;
}

/**
 * Multi-ECG detection result
 */
export interface MultiECGResult {
  /** Number of ECGs detected */
  count: number;

  /** Detected regions */
  regions: ECGRegion[];

  /** Is this a multi-ECG page */
  isMultiECG: boolean;

  /** Extracted ImageData for each region */
  extractedImages?: ImageData[];

  /** Confidence in detection */
  confidence: number;
}

/**
 * Multi-ECG Detector class
 */
export class MultiECGDetector {
  private imageData: ImageData;
  private width: number;
  private height: number;

  constructor(imageData: ImageData) {
    this.imageData = imageData;
    this.width = imageData.width;
    this.height = imageData.height;
  }

  /**
   * Detect multiple ECGs on page
   */
  detect(): MultiECGResult {
    // Find horizontal separators (white/blank lines)
    const horizontalGaps = this.findHorizontalGaps();

    // Find vertical separators
    const verticalGaps = this.findVerticalGaps();

    // Find ECG-containing regions
    const regions = this.findECGRegions(horizontalGaps, verticalGaps);

    // Filter to valid ECG regions
    const validRegions = regions.filter(r => r.confidence > 0.5);

    return {
      count: validRegions.length,
      regions: validRegions,
      isMultiECG: validRegions.length > 1,
      confidence: validRegions.length > 0
        ? validRegions.reduce((sum, r) => sum + r.confidence, 0) / validRegions.length
        : 0,
    };
  }

  /**
   * Extract individual ECG images
   */
  extractRegions(regions: ECGRegion[]): ImageData[] {
    return regions.map(region => this.extractRegion(region.bounds));
  }

  /**
   * Find horizontal gaps (blank rows)
   */
  private findHorizontalGaps(): number[] {
    const gaps: number[] = [];
    const data = this.imageData.data;
    const threshold = 250; // Near-white threshold
    const minGapHeight = this.height * 0.02; // At least 2% of image height

    let gapStart = -1;

    for (let y = 0; y < this.height; y++) {
      let isBlankRow = true;
      let whiteCount = 0;

      for (let x = 0; x < this.width; x += 4) {
        const idx = (y * this.width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        if (r > threshold && g > threshold && b > threshold) {
          whiteCount++;
        }
      }

      isBlankRow = whiteCount > (this.width / 4) * 0.95;

      if (isBlankRow) {
        if (gapStart < 0) gapStart = y;
      } else {
        if (gapStart >= 0 && y - gapStart >= minGapHeight) {
          gaps.push(Math.floor((gapStart + y) / 2));
        }
        gapStart = -1;
      }
    }

    return gaps;
  }

  /**
   * Find vertical gaps (blank columns)
   */
  private findVerticalGaps(): number[] {
    const gaps: number[] = [];
    const data = this.imageData.data;
    const threshold = 250;
    const minGapWidth = this.width * 0.02;

    let gapStart = -1;

    for (let x = 0; x < this.width; x++) {
      let isBlankCol = true;
      let whiteCount = 0;

      for (let y = 0; y < this.height; y += 4) {
        const idx = (y * this.width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        if (r > threshold && g > threshold && b > threshold) {
          whiteCount++;
        }
      }

      isBlankCol = whiteCount > (this.height / 4) * 0.95;

      if (isBlankCol) {
        if (gapStart < 0) gapStart = x;
      } else {
        if (gapStart >= 0 && x - gapStart >= minGapWidth) {
          gaps.push(Math.floor((gapStart + x) / 2));
        }
        gapStart = -1;
      }
    }

    return gaps;
  }

  /**
   * Find ECG-containing regions based on gaps
   */
  private findECGRegions(horizontalGaps: number[], verticalGaps: number[]): ECGRegion[] {
    const regions: ECGRegion[] = [];

    // Add image boundaries to gaps
    const hLines = [0, ...horizontalGaps, this.height];
    const vLines = [0, ...verticalGaps, this.width];

    let regionId = 0;

    for (let i = 0; i < hLines.length - 1; i++) {
      for (let j = 0; j < vLines.length - 1; j++) {
        const bounds: Bounds = {
          x: vLines[j],
          y: hLines[i],
          width: vLines[j + 1] - vLines[j],
          height: hLines[i + 1] - hLines[i],
        };

        // Skip very small regions
        if (bounds.width < this.width * 0.1 || bounds.height < this.height * 0.1) {
          continue;
        }

        // Analyze region for ECG content
        const analysis = this.analyzeRegion(bounds);

        if (analysis.hasContent) {
          regions.push({
            id: `ecg_${regionId++}`,
            bounds,
            confidence: analysis.confidence,
            estimatedFormat: analysis.format,
            hasGrid: analysis.hasGrid,
            hasWaveforms: analysis.hasWaveforms,
          });
        }
      }
    }

    return regions;
  }

  /**
   * Analyze a region for ECG content
   */
  private analyzeRegion(bounds: Bounds): {
    hasContent: boolean;
    hasGrid: boolean;
    hasWaveforms: boolean;
    confidence: number;
    format: string;
  } {
    const data = this.imageData.data;
    let gridPixels = 0;
    let waveformPixels = 0;
    let whitePixels = 0;
    let totalPixels = 0;

    const step = 4;

    for (let y = bounds.y; y < bounds.y + bounds.height; y += step) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += step) {
        const idx = (y * this.width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        totalPixels++;

        // White background
        if (r > 240 && g > 240 && b > 240) {
          whitePixels++;
        }
        // Pink/red grid
        else if (r > 200 && g > 150 && g < 220 && b > 150 && b < 220) {
          gridPixels++;
        }
        // Blue grid
        else if (b > 180 && r < 180 && g > 150) {
          gridPixels++;
        }
        // Black waveform
        else if (r < 80 && g < 80 && b < 80) {
          waveformPixels++;
        }
      }
    }

    const whiteRatio = whitePixels / totalPixels;
    const gridRatio = gridPixels / totalPixels;
    const waveformRatio = waveformPixels / totalPixels;

    const hasContent = waveformRatio > 0.005;
    const hasGrid = gridRatio > 0.01;
    const hasWaveforms = waveformRatio > 0.005;

    // Calculate confidence
    let confidence = 0;
    if (whiteRatio > 0.3) confidence += 0.3;
    if (hasGrid) confidence += 0.4;
    if (hasWaveforms) confidence += 0.3;

    // Estimate format based on aspect ratio
    const aspectRatio = bounds.width / bounds.height;
    let format = 'unknown';
    if (aspectRatio > 2) {
      format = 'rhythm-strip';
    } else if (aspectRatio > 1.2) {
      format = '12-lead';
    } else {
      format = 'single-lead';
    }

    return {
      hasContent,
      hasGrid,
      hasWaveforms,
      confidence,
      format,
    };
  }

  /**
   * Extract a region as new ImageData
   */
  private extractRegion(bounds: Bounds): ImageData {
    const newData = new Uint8ClampedArray(bounds.width * bounds.height * 4);

    for (let y = 0; y < bounds.height; y++) {
      for (let x = 0; x < bounds.width; x++) {
        const srcIdx = ((bounds.y + y) * this.width + (bounds.x + x)) * 4;
        const dstIdx = (y * bounds.width + x) * 4;

        newData[dstIdx] = this.imageData.data[srcIdx];
        newData[dstIdx + 1] = this.imageData.data[srcIdx + 1];
        newData[dstIdx + 2] = this.imageData.data[srcIdx + 2];
        newData[dstIdx + 3] = this.imageData.data[srcIdx + 3];
      }
    }

    if (typeof ImageData !== 'undefined') {
      return new ImageData(newData, bounds.width, bounds.height);
    }
    return { data: newData, width: bounds.width, height: bounds.height, colorSpace: 'srgb' } as ImageData;
  }
}

/**
 * Convenience function for multi-ECG detection
 */
export function detectMultipleECGs(imageData: ImageData): MultiECGResult {
  const detector = new MultiECGDetector(imageData);
  return detector.detect();
}

/**
 * Split multi-ECG image into individual ECGs
 */
export function splitMultiECG(imageData: ImageData): ImageData[] {
  const detector = new MultiECGDetector(imageData);
  const result = detector.detect();

  if (result.isMultiECG) {
    return detector.extractRegions(result.regions);
  }

  return [imageData];
}
