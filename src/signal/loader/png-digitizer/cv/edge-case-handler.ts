/**
 * Edge Case Handler
 * Handles problematic ECG images that fail standard processing
 *
 * @module signal/loader/png-digitizer/cv/edge-case-handler
 */

import type { CalibrationAnalysis } from '../types';

/**
 * Edge case detection result
 */
export interface EdgeCaseDetection {
  /** Detected edge cases */
  cases: EdgeCaseType[];

  /** Is image inverted (white-on-black) */
  isInverted: boolean;

  /** Is image grayscale */
  isGrayscale: boolean;

  /** Is image partial/cropped */
  isPartial: boolean;

  /** Detected grid color family */
  gridColorFamily: 'pink' | 'blue' | 'green' | 'orange' | 'gray' | 'none' | 'unknown';

  /** Dominant background brightness (0-255) */
  backgroundBrightness: number;

  /** Estimated noise level (0-1) */
  noiseLevel: number;

  /** Has visible calibration pulse */
  hasCalibrationPulse: boolean;

  /** Confidence in detection */
  confidence: number;
}

export type EdgeCaseType =
  | 'inverted_colors'
  | 'no_grid'
  | 'non_standard_grid_color'
  | 'partial_image'
  | 'very_low_resolution'
  | 'high_noise'
  | 'perspective_distortion'
  | 'heavy_rotation'
  | 'overlapping_leads'
  | 'pacemaker_spikes'
  | 'motion_artifacts'
  | 'annotations_overlay'
  | 'non_standard_calibration'
  | 'missing_leads';

/**
 * Edge case handler class
 */
export class EdgeCaseHandler {
  private width: number;
  private height: number;
  private data: Uint8ClampedArray;

  constructor(imageData: ImageData) {
    this.width = imageData.width;
    this.height = imageData.height;
    this.data = imageData.data;
  }

  /**
   * Detect all edge cases in the image
   */
  detect(): EdgeCaseDetection {
    const cases: EdgeCaseType[] = [];

    // Check for inverted image
    const backgroundBrightness = this.detectBackgroundBrightness();
    const isInverted = backgroundBrightness < 100;
    if (isInverted) {
      cases.push('inverted_colors');
    }

    // Check for grayscale
    const isGrayscale = this.detectGrayscale();

    // Check for partial image
    const isPartial = this.detectPartialImage();
    if (isPartial) {
      cases.push('partial_image');
    }

    // Check for grid color
    const gridColorFamily = this.detectGridColorFamily();
    if (gridColorFamily === 'none') {
      cases.push('no_grid');
    } else if (!['pink', 'gray'].includes(gridColorFamily)) {
      cases.push('non_standard_grid_color');
    }

    // Check resolution
    const pixels = this.width * this.height;
    if (pixels < 500000) {
      cases.push('very_low_resolution');
    }

    // Check noise level
    const noiseLevel = this.estimateNoiseLevel();
    if (noiseLevel > 0.3) {
      cases.push('high_noise');
    }

    // Check for calibration pulse
    const hasCalibrationPulse = this.detectCalibrationPulse();
    if (!hasCalibrationPulse) {
      cases.push('non_standard_calibration');
    }

    // Check for annotations
    if (this.detectAnnotations()) {
      cases.push('annotations_overlay');
    }

    // Check for pacemaker spikes
    if (this.detectPacemakerSpikes()) {
      cases.push('pacemaker_spikes');
    }

    return {
      cases,
      isInverted,
      isGrayscale,
      isPartial,
      gridColorFamily,
      backgroundBrightness,
      noiseLevel,
      hasCalibrationPulse,
      confidence: cases.length === 0 ? 0.95 : 0.8 - cases.length * 0.1,
    };
  }

  /**
   * Correct for detected edge cases and return corrected image
   */
  correct(detection: EdgeCaseDetection): ImageData {
    // Create a copy of the data with explicit ArrayBuffer type
    const buffer = new ArrayBuffer(this.data.length);
    const data = new Uint8ClampedArray(buffer);
    data.set(this.data);

    // Invert if needed
    if (detection.isInverted) {
      this.invertImageInPlace(data);
    }

    // Apply denoising if high noise
    if (detection.noiseLevel > 0.3) {
      this.denoiseImageInPlace(data);
    }

    // Handle Node.js environment where ImageData may not be globally available
    if (typeof ImageData !== 'undefined') {
      return new ImageData(data, this.width, this.height);
    } else {
      // Create a compatible object for Node.js
      return {
        data,
        width: this.width,
        height: this.height,
        colorSpace: 'srgb',
      } as ImageData;
    }
  }

  /**
   * Get corrective suggestions for detected edge cases
   */
  getSuggestions(detection: EdgeCaseDetection): string[] {
    const suggestions: string[] = [];

    for (const edgeCase of detection.cases) {
      switch (edgeCase) {
        case 'inverted_colors':
          suggestions.push('Image colors will be inverted for processing');
          break;
        case 'no_grid':
          suggestions.push('No grid detected - calibration will use standard values (10mm/mV, 25mm/s)');
          break;
        case 'non_standard_grid_color':
          suggestions.push(`Non-standard grid color (${detection.gridColorFamily}) detected - using adaptive detection`);
          break;
        case 'partial_image':
          suggestions.push('Image appears cropped - some leads may be missing');
          break;
        case 'very_low_resolution':
          suggestions.push('Low resolution image - accuracy may be reduced');
          break;
        case 'high_noise':
          suggestions.push('High noise level detected - applying denoising');
          break;
        case 'non_standard_calibration':
          suggestions.push('No calibration pulse found - using standard 10mm/mV gain');
          break;
        case 'annotations_overlay':
          suggestions.push('Annotations detected - waveform extraction may be affected');
          break;
        case 'pacemaker_spikes':
          suggestions.push('Pacemaker spikes detected - will attempt to preserve spike timing');
          break;
        default:
          break;
      }
    }

    return suggestions;
  }

  /**
   * Detect dominant background brightness
   */
  private detectBackgroundBrightness(): number {
    // Sample corners and edges
    const samples: number[] = [];
    const sampleSize = 30;

    // Corner samples
    const regions = [
      { x: 0, y: 0 },
      { x: this.width - sampleSize, y: 0 },
      { x: 0, y: this.height - sampleSize },
      { x: this.width - sampleSize, y: this.height - sampleSize },
      // Edge midpoints
      { x: this.width / 2 - sampleSize / 2, y: 0 },
      { x: this.width / 2 - sampleSize / 2, y: this.height - sampleSize },
    ];

    for (const region of regions) {
      for (let dy = 0; dy < sampleSize; dy++) {
        for (let dx = 0; dx < sampleSize; dx++) {
          const x = Math.min(this.width - 1, Math.max(0, Math.floor(region.x + dx)));
          const y = Math.min(this.height - 1, Math.max(0, Math.floor(region.y + dy)));
          const idx = (y * this.width + x) * 4;
          const brightness = (this.data[idx] + this.data[idx + 1] + this.data[idx + 2]) / 3;
          samples.push(brightness);
        }
      }
    }

    // Return median brightness
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)];
  }

  /**
   * Detect if image is grayscale
   */
  private detectGrayscale(): boolean {
    let colorSamples = 0;
    const sampleStep = Math.max(1, Math.floor((this.width * this.height) / 10000));

    for (let i = 0; i < this.data.length; i += 4 * sampleStep) {
      const r = this.data[i];
      const g = this.data[i + 1];
      const b = this.data[i + 2];

      // Check if RGB values differ significantly
      const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
      if (maxDiff > 10) {
        colorSamples++;
      }
    }

    // If less than 5% of pixels have color variation, it's grayscale
    const totalSamples = Math.floor(this.data.length / (4 * sampleStep));
    return colorSamples / totalSamples < 0.05;
  }

  /**
   * Detect if image is partial/cropped
   */
  private detectPartialImage(): boolean {
    // Check if there's waveform content near edges
    // A properly framed ECG should have margins
    const edgeWidth = Math.min(20, this.width * 0.02);
    const edgeHeight = Math.min(20, this.height * 0.02);

    let darkPixelsOnEdge = 0;
    let totalEdgePixels = 0;

    // Check left and right edges
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < edgeWidth; x++) {
        const idx = (y * this.width + x) * 4;
        const brightness = (this.data[idx] + this.data[idx + 1] + this.data[idx + 2]) / 3;
        if (brightness < 100) darkPixelsOnEdge++;
        totalEdgePixels++;
      }
      for (let x = this.width - edgeWidth; x < this.width; x++) {
        const idx = (y * this.width + x) * 4;
        const brightness = (this.data[idx] + this.data[idx + 1] + this.data[idx + 2]) / 3;
        if (brightness < 100) darkPixelsOnEdge++;
        totalEdgePixels++;
      }
    }

    // Check top and bottom edges
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < edgeHeight; y++) {
        const idx = (y * this.width + x) * 4;
        const brightness = (this.data[idx] + this.data[idx + 1] + this.data[idx + 2]) / 3;
        if (brightness < 100) darkPixelsOnEdge++;
        totalEdgePixels++;
      }
      for (let y = this.height - edgeHeight; y < this.height; y++) {
        const idx = (y * this.width + x) * 4;
        const brightness = (this.data[idx] + this.data[idx + 1] + this.data[idx + 2]) / 3;
        if (brightness < 100) darkPixelsOnEdge++;
        totalEdgePixels++;
      }
    }

    // If more than 5% of edge pixels are dark, image might be cropped
    return darkPixelsOnEdge / totalEdgePixels > 0.05;
  }

  /**
   * Detect grid color family
   */
  private detectGridColorFamily(): 'pink' | 'blue' | 'green' | 'orange' | 'gray' | 'none' | 'unknown' {
    // Sample non-background, non-waveform pixels
    const colorVotes: Record<string, number> = {
      pink: 0,
      blue: 0,
      green: 0,
      orange: 0,
      gray: 0,
    };

    const sampleStep = Math.max(1, Math.floor((this.width * this.height) / 50000));
    let gridPixels = 0;

    for (let i = 0; i < this.data.length; i += 4 * sampleStep) {
      const r = this.data[i];
      const g = this.data[i + 1];
      const b = this.data[i + 2];
      const brightness = (r + g + b) / 3;

      // Skip very bright (background) and very dark (waveform) pixels
      if (brightness < 80 || brightness > 240) continue;

      gridPixels++;

      // Classify by color
      const maxChannel = Math.max(r, g, b);
      const colorStrength = maxChannel - Math.min(r, g, b);

      if (colorStrength < 15) {
        colorVotes.gray++;
      } else if (r === maxChannel && r > g * 1.1) {
        if (g > b * 1.2) {
          colorVotes.orange++;
        } else {
          colorVotes.pink++;
        }
      } else if (b === maxChannel && b > r * 1.1) {
        colorVotes.blue++;
      } else if (g === maxChannel && g > r * 1.1) {
        colorVotes.green++;
      } else {
        colorVotes.gray++;
      }
    }

    if (gridPixels < 1000) {
      return 'none';
    }

    // Find dominant color
    let maxVotes = 0;
    let dominantColor: 'pink' | 'blue' | 'green' | 'orange' | 'gray' = 'gray';
    for (const [color, votes] of Object.entries(colorVotes)) {
      if (votes > maxVotes) {
        maxVotes = votes;
        dominantColor = color as typeof dominantColor;
      }
    }

    // Need significant majority
    if (maxVotes / gridPixels < 0.3) {
      return 'unknown';
    }

    return dominantColor;
  }

  /**
   * Estimate noise level using local variance
   */
  private estimateNoiseLevel(): number {
    const windowSize = 5;
    const variances: number[] = [];
    const step = Math.max(1, Math.floor(Math.min(this.width, this.height) / 30));

    for (let y = windowSize; y < this.height - windowSize; y += step) {
      for (let x = windowSize; x < this.width - windowSize; x += step) {
        const values: number[] = [];

        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const idx = ((y + dy) * this.width + (x + dx)) * 4;
            const brightness = (this.data[idx] + this.data[idx + 1] + this.data[idx + 2]) / 3;
            values.push(brightness);
          }
        }

        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
        variances.push(variance);
      }
    }

    // Use lower quartile of variances (uniform regions)
    variances.sort((a, b) => a - b);
    const lowerQuartileVariance = variances[Math.floor(variances.length * 0.25)];

    // Normalize to 0-1
    return Math.min(1, lowerQuartileVariance / 500);
  }

  /**
   * Detect calibration pulse
   */
  private detectCalibrationPulse(): boolean {
    // Look for square wave pattern on left side of image
    const searchWidth = Math.min(200, this.width * 0.15);
    const midY = this.height / 2;
    const searchHeight = this.height * 0.3;

    // Look for vertical edges (characteristic of square calibration pulse)
    let verticalEdges = 0;

    for (let x = 10; x < searchWidth; x++) {
      for (let y = midY - searchHeight / 2; y < midY + searchHeight / 2; y++) {
        const idx = (Math.floor(y) * this.width + x) * 4;
        const idxLeft = (Math.floor(y) * this.width + x - 1) * 4;

        const brightness = (this.data[idx] + this.data[idx + 1] + this.data[idx + 2]) / 3;
        const brightnessLeft = (this.data[idxLeft] + this.data[idxLeft + 1] + this.data[idxLeft + 2]) / 3;

        if (Math.abs(brightness - brightnessLeft) > 100) {
          verticalEdges++;
        }
      }
    }

    // Calibration pulse should have distinct vertical edges
    return verticalEdges > searchHeight * 2;
  }

  /**
   * Detect annotations/overlays
   */
  private detectAnnotations(): boolean {
    // Look for colored markers or text that's not black or grid color
    let annotationPixels = 0;
    const sampleStep = Math.max(1, Math.floor((this.width * this.height) / 50000));
    let totalSamples = 0;

    for (let i = 0; i < this.data.length; i += 4 * sampleStep) {
      const r = this.data[i];
      const g = this.data[i + 1];
      const b = this.data[i + 2];
      totalSamples++;

      // Bright saturated colors (markers, highlights)
      const maxChannel = Math.max(r, g, b);
      const minChannel = Math.min(r, g, b);
      const saturation = maxChannel > 0 ? (maxChannel - minChannel) / maxChannel : 0;

      // High saturation + bright = likely annotation
      if (saturation > 0.5 && maxChannel > 150) {
        // Exclude pink/red grid
        if (!(r > g * 1.3 && r > b * 1.3 && r > 200)) {
          annotationPixels++;
        }
      }
    }

    return annotationPixels / totalSamples > 0.01;
  }

  /**
   * Detect pacemaker spikes
   */
  private detectPacemakerSpikes(): boolean {
    // Pacemaker spikes are very narrow vertical lines
    // Scan for extremely thin, tall dark marks

    let spikeCount = 0;
    const scanY = Math.floor(this.height / 2);
    const spikeWidth = 3; // Pacemaker spikes are typically 1-3 pixels wide

    for (let x = 10; x < this.width - 10; x++) {
      // Check for very dark narrow spike
      let darkAbove = 0;
      let darkBelow = 0;

      const idx = (scanY * this.width + x) * 4;
      const brightness = (this.data[idx] + this.data[idx + 1] + this.data[idx + 2]) / 3;

      if (brightness < 50) {
        // Very dark center - check for spike pattern
        for (let dy = 1; dy < 20; dy++) {
          const idxAbove = ((scanY - dy) * this.width + x) * 4;
          const idxBelow = ((scanY + dy) * this.width + x) * 4;

          const brightAbove = (this.data[idxAbove] + this.data[idxAbove + 1] + this.data[idxAbove + 2]) / 3;
          const brightBelow = (this.data[idxBelow] + this.data[idxBelow + 1] + this.data[idxBelow + 2]) / 3;

          if (brightAbove < 100) darkAbove++;
          if (brightBelow < 100) darkBelow++;
        }

        // Check if neighbors are light (narrow spike)
        const idxLeft = (scanY * this.width + x - spikeWidth) * 4;
        const idxRight = (scanY * this.width + x + spikeWidth) * 4;
        const brightLeft = (this.data[idxLeft] + this.data[idxLeft + 1] + this.data[idxLeft + 2]) / 3;
        const brightRight = (this.data[idxRight] + this.data[idxRight + 1] + this.data[idxRight + 2]) / 3;

        if ((darkAbove > 10 || darkBelow > 10) && brightLeft > 150 && brightRight > 150) {
          spikeCount++;
          x += 10; // Skip ahead to avoid double counting
        }
      }
    }

    // Paced rhythm typically has 1-2 spikes per second
    // With 10 second strip, expect 10-20 spikes if paced
    return spikeCount >= 5;
  }

  /**
   * Invert image colors in-place
   */
  private invertImageInPlace(data: Uint8ClampedArray): void {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];         // R
      data[i + 1] = 255 - data[i + 1]; // G
      data[i + 2] = 255 - data[i + 2]; // B
      // Keep alpha unchanged
    }
  }

  /**
   * Simple box blur denoising in-place
   */
  private denoiseImageInPlace(data: Uint8ClampedArray): void {
    // Create a temp copy for reading while writing
    const temp = new Uint8ClampedArray(data.length);
    temp.set(data);

    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        const idx = (y * this.width + x) * 4;

        // 3x3 box blur
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const neighborIdx = ((y + dy) * this.width + (x + dx)) * 4;
              sum += temp[neighborIdx + c];
            }
          }
          data[idx + c] = Math.round(sum / 9);
        }
        // Keep alpha unchanged
      }
    }
  }
}

/**
 * Adaptive calibration detector for non-standard settings
 */
export class AdaptiveCalibrationDetector {
  private width: number;
  private height: number;
  private data: Uint8ClampedArray;

  constructor(imageData: ImageData) {
    this.width = imageData.width;
    this.height = imageData.height;
    this.data = imageData.data;
  }

  /**
   * Detect calibration settings using multiple strategies
   */
  detect(): CalibrationAnalysis {
    // Strategy 1: Look for calibration pulse
    const pulseResult = this.detectCalibrationPulse();
    if (pulseResult.found && pulseResult.confidence > 0.7) {
      return pulseResult;
    }

    // Strategy 2: Look for text labels (10mm/mV, 25mm/s, etc.)
    // This would require OCR - skip for now

    // Strategy 3: Infer from grid spacing and typical QRS width
    const inferredResult = this.inferFromWaveforms();
    if (inferredResult.confidence > 0.5) {
      return inferredResult;
    }

    // Default: Standard calibration
    return {
      found: false,
      gain: 10,
      paperSpeed: 25,
      gainSource: 'standard_assumed',
      speedSource: 'standard_assumed',
      confidence: 0.3,
    };
  }

  /**
   * Detect calibration pulse
   */
  private detectCalibrationPulse(): CalibrationAnalysis {
    const searchWidth = Math.min(300, this.width * 0.2);
    const rows = [0.2, 0.35, 0.5, 0.65, 0.8].map(f => Math.floor(this.height * f));

    for (const rowY of rows) {
      const pulse = this.findPulseInRegion(0, rowY - 50, searchWidth, 100);
      if (pulse) {
        return {
          found: true,
          location: pulse.location,
          heightPx: pulse.height,
          widthPx: pulse.width,
          gain: 10, // Standard - height represents 1mV
          paperSpeed: 25,
          gainSource: 'calibration_pulse',
          speedSource: 'standard_assumed',
          confidence: 0.8,
        };
      }
    }

    return {
      found: false,
      gain: 10,
      paperSpeed: 25,
      gainSource: 'standard_assumed',
      speedSource: 'standard_assumed',
      confidence: 0.3,
    };
  }

  /**
   * Find square pulse in region
   */
  private findPulseInRegion(
    x: number,
    y: number,
    w: number,
    h: number
  ): { location: { x: number; y: number }; height: number; width: number } | null {
    // Look for characteristic square wave pattern
    // Rising edge -> flat top -> falling edge

    const startY = Math.max(0, y);
    const endY = Math.min(this.height, y + h);
    const startX = Math.max(0, x);
    const endX = Math.min(this.width, x + w);

    for (let scanX = startX; scanX < endX - 20; scanX++) {
      // Look for dark vertical line (rising edge)
      let risingEdgeY = -1;
      let fallingEdgeY = -1;

      for (let scanY = startY; scanY < endY; scanY++) {
        const idx = (scanY * this.width + scanX) * 4;
        const brightness = (this.data[idx] + this.data[idx + 1] + this.data[idx + 2]) / 3;

        if (brightness < 100 && risingEdgeY < 0) {
          risingEdgeY = scanY;
        }
        if (brightness < 100 && risingEdgeY >= 0) {
          fallingEdgeY = scanY;
        }
      }

      if (risingEdgeY >= 0 && fallingEdgeY > risingEdgeY) {
        const height = fallingEdgeY - risingEdgeY;
        if (height > 20 && height < 200) {
          // Check for flat top (horizontal line)
          let flatTopLength = 0;
          for (let dx = 1; dx < 100 && scanX + dx < endX; dx++) {
            const idx = (risingEdgeY * this.width + scanX + dx) * 4;
            const brightness = (this.data[idx] + this.data[idx + 1] + this.data[idx + 2]) / 3;
            if (brightness < 100) {
              flatTopLength++;
            } else {
              break;
            }
          }

          if (flatTopLength > 10) {
            return {
              location: { x: scanX, y: risingEdgeY },
              height,
              width: flatTopLength,
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Infer calibration from waveform characteristics
   */
  private inferFromWaveforms(): CalibrationAnalysis {
    // Analyze QRS widths and heights to infer calibration
    // Typical QRS: 80-120ms wide, 0.5-2.5mV tall

    // This is a placeholder - would need waveform detection first
    return {
      found: false,
      gain: 10,
      paperSpeed: 25,
      gainSource: 'standard_assumed',
      speedSource: 'standard_assumed',
      confidence: 0.4,
    };
  }
}

/**
 * Convenience function for edge case handling
 */
export function detectEdgeCases(imageData: ImageData): EdgeCaseDetection {
  const handler = new EdgeCaseHandler(imageData);
  return handler.detect();
}

/**
 * Correct image for detected edge cases
 */
export function correctForEdgeCases(
  imageData: ImageData,
  detection?: EdgeCaseDetection
): { imageData: ImageData; detection: EdgeCaseDetection; suggestions: string[] } {
  const handler = new EdgeCaseHandler(imageData);
  const detectionResult = detection ?? handler.detect();
  const correctedImage = handler.correct(detectionResult);
  const suggestions = handler.getSuggestions(detectionResult);

  return {
    imageData: correctedImage,
    detection: detectionResult,
    suggestions,
  };
}
