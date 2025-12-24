/**
 * Color Inversion Detector and Corrector
 * Detects and corrects inverted color ECGs (white-on-black displays)
 *
 * Some ECG monitors display with inverted colors (white waveform on black background).
 * This affects grid detection and waveform tracing algorithms that expect
 * dark waveforms on a light background.
 *
 * @module signal/loader/png-digitizer/cv/color-inverter
 */

/**
 * Color inversion detection result
 */
export interface ColorInversionResult {
  /** Whether image appears to be inverted */
  isInverted: boolean;

  /** Confidence of detection (0-1) */
  confidence: number;

  /** Background brightness (0-255) */
  backgroundBrightness: number;

  /** Waveform brightness (0-255) */
  waveformBrightness: number;

  /** Detection method used */
  method: 'histogram' | 'edge' | 'grid';

  /** Recommendation */
  recommendation: string;
}

/**
 * Color inversion correction result
 */
export interface ColorCorrectionResult {
  /** Corrected image data */
  imageData: ImageData;

  /** Whether correction was applied */
  corrected: boolean;

  /** Detection result */
  detection: ColorInversionResult;
}

/**
 * Color Inverter class
 */
export class ColorInverter {
  private imageData: ImageData;
  private width: number;
  private height: number;

  constructor(imageData: ImageData) {
    this.imageData = imageData;
    this.width = imageData.width;
    this.height = imageData.height;
  }

  /**
   * Detect if image has inverted colors
   */
  detect(): ColorInversionResult {
    // Method 1: Analyze histogram
    const histogramResult = this.analyzeHistogram();

    // Method 2: Analyze edge brightness
    const edgeResult = this.analyzeEdges();

    // Method 3: Look for grid pattern (ECG-specific)
    const gridResult = this.analyzeGridPattern();

    // Combine results
    const avgConfidence = (histogramResult.confidence + edgeResult.confidence + gridResult.confidence) / 3;

    // Use voting - if 2 of 3 methods agree, use that
    const votes = [histogramResult.isInverted, edgeResult.isInverted, gridResult.isInverted];
    const invertedVotes = votes.filter(v => v).length;
    const isInverted = invertedVotes >= 2;

    // Use the method with highest confidence for detailed results
    const methods = [histogramResult, edgeResult, gridResult];
    const bestMethod = methods.reduce((a, b) => a.confidence > b.confidence ? a : b);

    return {
      isInverted,
      confidence: isInverted ? avgConfidence : (1 - avgConfidence),
      backgroundBrightness: bestMethod.backgroundBrightness,
      waveformBrightness: bestMethod.waveformBrightness,
      method: bestMethod.method,
      recommendation: isInverted
        ? 'Image appears inverted (white-on-black). Inversion correction recommended.'
        : 'Image appears normal (dark-on-light). No correction needed.',
    };
  }

  /**
   * Analyze image histogram to detect inversion
   */
  private analyzeHistogram(): ColorInversionResult {
    const data = this.imageData.data;
    const histogram = new Array(256).fill(0);

    // Build brightness histogram
    for (let i = 0; i < data.length; i += 4) {
      const brightness = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
      histogram[brightness]++;
    }

    // Find dominant brightness levels
    const totalPixels = this.width * this.height;

    // Calculate percentage in dark and light regions
    let darkPixels = 0;
    let lightPixels = 0;

    for (let i = 0; i < 64; i++) darkPixels += histogram[i];
    for (let i = 192; i < 256; i++) lightPixels += histogram[i];

    const darkPercent = darkPixels / totalPixels;
    const lightPercent = lightPixels / totalPixels;

    // For normal ECG: mostly light (paper) with some dark (waveforms)
    // For inverted: mostly dark (background) with some light (waveforms)
    const isInverted = darkPercent > lightPercent * 1.5;

    // Calculate weighted average brightness
    let sumBrightness = 0;
    for (let i = 0; i < 256; i++) {
      sumBrightness += i * histogram[i];
    }
    const avgBrightness = sumBrightness / totalPixels;

    return {
      isInverted,
      confidence: Math.abs(darkPercent - lightPercent) * 2,
      backgroundBrightness: isInverted ? avgBrightness : 255 - avgBrightness,
      waveformBrightness: isInverted ? 255 - avgBrightness : avgBrightness,
      method: 'histogram',
      recommendation: '',
    };
  }

  /**
   * Analyze edges to detect waveform vs background
   */
  private analyzeEdges(): ColorInversionResult {
    const data = this.imageData.data;
    let edgePixelsBrightness = 0;
    let nonEdgePixelsBrightness = 0;
    let edgeCount = 0;
    let nonEdgeCount = 0;

    // Simple edge detection using horizontal gradient
    for (let y = 0; y < this.height; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        const idx = (y * this.width + x) * 4;
        const prevIdx = idx - 4;
        const nextIdx = idx + 4;

        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        const prevBrightness = (data[prevIdx] + data[prevIdx + 1] + data[prevIdx + 2]) / 3;
        const nextBrightness = (data[nextIdx] + data[nextIdx + 1] + data[nextIdx + 2]) / 3;

        const gradient = Math.abs(nextBrightness - prevBrightness);

        if (gradient > 50) {
          // Edge pixel
          edgePixelsBrightness += brightness;
          edgeCount++;
        } else {
          // Non-edge pixel
          nonEdgePixelsBrightness += brightness;
          nonEdgeCount++;
        }
      }
    }

    const avgEdgeBrightness = edgeCount > 0 ? edgePixelsBrightness / edgeCount : 128;
    const avgNonEdgeBrightness = nonEdgeCount > 0 ? nonEdgePixelsBrightness / nonEdgeCount : 128;

    // For normal ECG: edges (waveforms) are darker than background
    // For inverted: edges (waveforms) are brighter than background
    const isInverted = avgEdgeBrightness > avgNonEdgeBrightness;

    const brightnessRatio = Math.abs(avgEdgeBrightness - avgNonEdgeBrightness) / 255;

    return {
      isInverted,
      confidence: Math.min(1, brightnessRatio * 2),
      backgroundBrightness: avgNonEdgeBrightness,
      waveformBrightness: avgEdgeBrightness,
      method: 'edge',
      recommendation: '',
    };
  }

  /**
   * Analyze grid pattern (ECG-specific)
   */
  private analyzeGridPattern(): ColorInversionResult {
    // Sample the center region where grid should be visible
    const centerX = Math.floor(this.width / 2);
    const centerY = Math.floor(this.height / 2);
    const sampleSize = Math.min(200, Math.floor(Math.min(this.width, this.height) / 4));

    const data = this.imageData.data;

    // Look for regular grid pattern
    const columnBrightness: number[] = [];

    for (let x = centerX - sampleSize; x < centerX + sampleSize; x++) {
      if (x < 0 || x >= this.width) continue;

      let sum = 0;
      let count = 0;

      for (let y = centerY - sampleSize; y < centerY + sampleSize; y++) {
        if (y < 0 || y >= this.height) continue;

        const idx = (y * this.width + x) * 4;
        sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        count++;
      }

      if (count > 0) {
        columnBrightness.push(sum / count);
      }
    }

    if (columnBrightness.length < 10) {
      return {
        isInverted: false,
        confidence: 0,
        backgroundBrightness: 128,
        waveformBrightness: 128,
        method: 'grid',
        recommendation: '',
      };
    }

    // Find peaks and troughs in column brightness
    const peaks: number[] = [];
    const troughs: number[] = [];

    for (let i = 1; i < columnBrightness.length - 1; i++) {
      const prev = columnBrightness[i - 1];
      const curr = columnBrightness[i];
      const next = columnBrightness[i + 1];

      if (curr > prev && curr > next) {
        peaks.push(curr);
      } else if (curr < prev && curr < next) {
        troughs.push(curr);
      }
    }

    const avgPeak = peaks.length > 0 ? peaks.reduce((a, b) => a + b) / peaks.length : 128;
    const avgTrough = troughs.length > 0 ? troughs.reduce((a, b) => a + b) / troughs.length : 128;

    // For normal ECG: peaks (grid lines) are slightly darker than background
    // But background (troughs between grid lines) is very light
    // For inverted: peaks are light (grid lines), troughs are dark (background)
    const isInverted = avgTrough < 100; // Dark troughs suggest inverted

    return {
      isInverted,
      confidence: Math.abs(avgPeak - avgTrough) > 30 ? 0.7 : 0.3,
      backgroundBrightness: Math.min(avgPeak, avgTrough),
      waveformBrightness: Math.max(avgPeak, avgTrough),
      method: 'grid',
      recommendation: '',
    };
  }

  /**
   * Invert image colors
   */
  invert(): ImageData {
    const output = new ImageData(this.width, this.height);
    const srcData = this.imageData.data;
    const dstData = output.data;

    for (let i = 0; i < srcData.length; i += 4) {
      dstData[i] = 255 - srcData[i];         // R
      dstData[i + 1] = 255 - srcData[i + 1]; // G
      dstData[i + 2] = 255 - srcData[i + 2]; // B
      dstData[i + 3] = srcData[i + 3];       // A (preserve alpha)
    }

    return output;
  }

  /**
   * Auto-detect and correct color inversion if needed
   */
  autoCorrect(): ColorCorrectionResult {
    const detection = this.detect();

    if (detection.isInverted && detection.confidence > 0.6) {
      return {
        imageData: this.invert(),
        corrected: true,
        detection,
      };
    }

    return {
      imageData: this.imageData,
      corrected: false,
      detection,
    };
  }

  /**
   * Adjust contrast for better waveform visibility
   */
  enhanceContrast(factor: number = 1.5): ImageData {
    const output = new ImageData(this.width, this.height);
    const srcData = this.imageData.data;
    const dstData = output.data;

    // Calculate mean brightness
    let sum = 0;
    for (let i = 0; i < srcData.length; i += 4) {
      sum += (srcData[i] + srcData[i + 1] + srcData[i + 2]) / 3;
    }
    const mean = sum / (srcData.length / 4);

    // Apply contrast adjustment
    for (let i = 0; i < srcData.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const value = srcData[i + c];
        const adjusted = mean + (value - mean) * factor;
        dstData[i + c] = Math.max(0, Math.min(255, Math.round(adjusted)));
      }
      dstData[i + 3] = srcData[i + 3]; // Preserve alpha
    }

    return output;
  }
}

/**
 * Convenience function for color inversion detection
 */
export function detectColorInversion(imageData: ImageData): ColorInversionResult {
  const inverter = new ColorInverter(imageData);
  return inverter.detect();
}

/**
 * Convenience function for auto-correction
 */
export function autoCorrectColorInversion(imageData: ImageData): ColorCorrectionResult {
  const inverter = new ColorInverter(imageData);
  return inverter.autoCorrect();
}

/**
 * Convenience function for color inversion
 */
export function invertColors(imageData: ImageData): ImageData {
  const inverter = new ColorInverter(imageData);
  return inverter.invert();
}
