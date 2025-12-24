/**
 * Image Preprocessor
 * Auto-deskew, perspective correction, denoise, and contrast enhancement
 *
 * @module signal/loader/png-digitizer/cv/preprocessor
 */

/**
 * Preprocessing options
 */
export interface PreprocessorOptions {
  /** Enable auto-deskew */
  deskew?: boolean;

  /** Enable denoising */
  denoise?: boolean;

  /** Enable contrast enhancement */
  enhanceContrast?: boolean;

  /** Enable perspective correction */
  perspectiveCorrect?: boolean;

  /** Maximum rotation angle to correct (degrees) */
  maxDeskewAngle?: number;
}

/**
 * Preprocessing result
 */
export interface PreprocessResult {
  /** Processed image data */
  imageData: ImageData;

  /** Applied transformations */
  transformations: {
    deskewAngle?: number;
    contrastEnhanced?: boolean;
    denoised?: boolean;
    perspectiveCorrected?: boolean;
  };

  /** Quality metrics */
  quality: {
    /** Estimated noise level (0-1, lower is better) */
    noiseLevel: number;
    /** Contrast score (0-1, higher is better) */
    contrast: number;
    /** Sharpness score (0-1, higher is better) */
    sharpness: number;
  };
}

const DEFAULT_OPTIONS: Required<PreprocessorOptions> = {
  deskew: true,
  denoise: true,
  enhanceContrast: true,
  perspectiveCorrect: false, // Disabled by default - requires more processing
  maxDeskewAngle: 5,
};

/**
 * Image preprocessor class
 */
export class ImagePreprocessor {
  private options: Required<PreprocessorOptions>;

  constructor(options: PreprocessorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Process image through the preprocessing pipeline
   */
  process(imageData: ImageData): PreprocessResult {
    let current = this.cloneImageData(imageData);
    const transformations: PreprocessResult['transformations'] = {};

    // Step 1: Denoise (do this first to help other steps)
    if (this.options.denoise) {
      current = this.denoise(current);
      transformations.denoised = true;
    }

    // Step 2: Deskew
    if (this.options.deskew) {
      const { imageData: deskewed, angle } = this.deskew(current);
      if (Math.abs(angle) > 0.1) {
        current = deskewed;
        transformations.deskewAngle = angle;
      }
    }

    // Step 3: Enhance contrast
    if (this.options.enhanceContrast) {
      current = this.enhanceContrast(current);
      transformations.contrastEnhanced = true;
    }

    // Calculate quality metrics
    const quality = this.assessQuality(current);

    return {
      imageData: current,
      transformations,
      quality,
    };
  }

  /**
   * Clone ImageData
   */
  private cloneImageData(imageData: ImageData): ImageData {
    const data = new Uint8ClampedArray(imageData.data);
    return new ImageData(data, imageData.width, imageData.height);
  }

  /**
   * Denoise using a 3x3 median filter
   * Effective for salt-and-pepper noise common in scanned images
   */
  private denoise(imageData: ImageData): ImageData {
    const { width, height, data } = imageData;
    const output = new Uint8ClampedArray(data.length);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        // Collect 3x3 neighborhood values for each channel
        const rValues: number[] = [];
        const gValues: number[] = [];
        const bValues: number[] = [];

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            rValues.push(data[idx]);
            gValues.push(data[idx + 1]);
            bValues.push(data[idx + 2]);
          }
        }

        // Sort and take median
        rValues.sort((a, b) => a - b);
        gValues.sort((a, b) => a - b);
        bValues.sort((a, b) => a - b);

        const idx = (y * width + x) * 4;
        output[idx] = rValues[4];
        output[idx + 1] = gValues[4];
        output[idx + 2] = bValues[4];
        output[idx + 3] = data[idx + 3]; // Keep alpha
      }
    }

    // Copy edges unchanged
    for (let x = 0; x < width; x++) {
      for (const y of [0, height - 1]) {
        const idx = (y * width + x) * 4;
        output[idx] = data[idx];
        output[idx + 1] = data[idx + 1];
        output[idx + 2] = data[idx + 2];
        output[idx + 3] = data[idx + 3];
      }
    }
    for (let y = 0; y < height; y++) {
      for (const x of [0, width - 1]) {
        const idx = (y * width + x) * 4;
        output[idx] = data[idx];
        output[idx + 1] = data[idx + 1];
        output[idx + 2] = data[idx + 2];
        output[idx + 3] = data[idx + 3];
      }
    }

    return new ImageData(output, width, height);
  }

  /**
   * Detect and correct skew angle using Hough transform on grid lines
   */
  private deskew(imageData: ImageData): { imageData: ImageData; angle: number } {
    const angle = this.detectSkewAngle(imageData);

    // Only correct if angle is significant but not too large
    if (Math.abs(angle) < 0.1 || Math.abs(angle) > this.options.maxDeskewAngle) {
      return { imageData, angle: 0 };
    }

    const rotated = this.rotateImage(imageData, -angle);
    return { imageData: rotated, angle };
  }

  /**
   * Detect skew angle by analyzing horizontal line orientations
   * Uses simplified Hough-like approach
   */
  private detectSkewAngle(imageData: ImageData): number {
    const { width, height } = imageData;

    // Detect edges using Sobel
    const edges = this.detectEdges(imageData);

    // Accumulate angles from horizontal-ish edges
    const angleVotes: Map<number, number> = new Map();

    // Sample edge points
    const sampleStep = Math.max(2, Math.floor(width / 200));

    for (let y = Math.floor(height * 0.2); y < height * 0.8; y += sampleStep) {
      for (let x = 10; x < width - 10; x += sampleStep) {
        const idx = y * width + x;
        if (edges[idx] > 50) {
          // Strong edge
          // Look for connected edge points to estimate angle
          const angle = this.estimateLocalAngle(edges, width, height, x, y);
          if (angle !== null && Math.abs(angle) < 10) {
            const quantized = Math.round(angle * 10) / 10;
            angleVotes.set(quantized, (angleVotes.get(quantized) || 0) + 1);
          }
        }
      }
    }

    // Find most common angle
    let bestAngle = 0;
    let bestVotes = 0;
    for (const [angle, votes] of angleVotes) {
      if (votes > bestVotes) {
        bestVotes = votes;
        bestAngle = angle;
      }
    }

    return bestAngle;
  }

  /**
   * Detect edges using Sobel operator
   */
  private detectEdges(imageData: ImageData): Uint8Array {
    const { width, height, data } = imageData;
    const edges = new Uint8Array(width * height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        // Convert to grayscale
        const getGray = (px: number, py: number) => {
          const idx = (py * width + px) * 4;
          return (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        };

        // Sobel kernels
        const gx =
          -getGray(x - 1, y - 1) + getGray(x + 1, y - 1) +
          -2 * getGray(x - 1, y) + 2 * getGray(x + 1, y) +
          -getGray(x - 1, y + 1) + getGray(x + 1, y + 1);

        const gy =
          -getGray(x - 1, y - 1) - 2 * getGray(x, y - 1) - getGray(x + 1, y - 1) +
          getGray(x - 1, y + 1) + 2 * getGray(x, y + 1) + getGray(x + 1, y + 1);

        edges[y * width + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
      }
    }

    return edges;
  }

  /**
   * Estimate local angle at an edge point
   */
  private estimateLocalAngle(
    edges: Uint8Array,
    width: number,
    height: number,
    x: number,
    y: number
  ): number | null {
    // Look for edge continuation to the right
    const searchLen = 20;
    let sumDy = 0;
    let count = 0;

    for (let dx = 1; dx < searchLen && x + dx < width; dx++) {
      // Search vertically for edge
      for (let dy = -3; dy <= 3; dy++) {
        if (y + dy >= 0 && y + dy < height) {
          const idx = (y + dy) * width + (x + dx);
          if (edges[idx] > 50) {
            sumDy += dy;
            count++;
            break;
          }
        }
      }
    }

    if (count < searchLen / 2) return null;

    const avgDy = sumDy / count;
    const angle = Math.atan2(avgDy, count) * (180 / Math.PI);
    return angle;
  }

  /**
   * Rotate image by angle (degrees)
   */
  private rotateImage(imageData: ImageData, angleDegrees: number): ImageData {
    const { width, height, data } = imageData;
    const output = new Uint8ClampedArray(data.length);

    const angleRad = (angleDegrees * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const cx = width / 2;
    const cy = height / 2;

    // Fill with white
    output.fill(255);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Rotate around center
        const dx = x - cx;
        const dy = y - cy;
        const srcX = Math.round(cos * dx + sin * dy + cx);
        const srcY = Math.round(-sin * dx + cos * dy + cy);

        if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
          const srcIdx = (srcY * width + srcX) * 4;
          const dstIdx = (y * width + x) * 4;
          output[dstIdx] = data[srcIdx];
          output[dstIdx + 1] = data[srcIdx + 1];
          output[dstIdx + 2] = data[srcIdx + 2];
          output[dstIdx + 3] = data[srcIdx + 3];
        }
      }
    }

    return new ImageData(output, width, height);
  }

  /**
   * Enhance contrast using adaptive histogram equalization
   */
  private enhanceContrast(imageData: ImageData): ImageData {
    const { width, height, data } = imageData;
    const output = new Uint8ClampedArray(data.length);

    // Calculate histogram for each channel
    const histR = new Array(256).fill(0);
    const histG = new Array(256).fill(0);
    const histB = new Array(256).fill(0);

    for (let i = 0; i < data.length; i += 4) {
      histR[data[i]]++;
      histG[data[i + 1]]++;
      histB[data[i + 2]]++;
    }

    // Calculate cumulative distribution function
    const cdfR = this.calculateCDF(histR, width * height);
    const cdfG = this.calculateCDF(histG, width * height);
    const cdfB = this.calculateCDF(histB, width * height);

    // Apply mild contrast stretch (not full equalization)
    for (let i = 0; i < data.length; i += 4) {
      // Blend between original and equalized (30% equalization)
      const blend = 0.3;
      output[i] = Math.round(data[i] * (1 - blend) + cdfR[data[i]] * 255 * blend);
      output[i + 1] = Math.round(data[i + 1] * (1 - blend) + cdfG[data[i + 1]] * 255 * blend);
      output[i + 2] = Math.round(data[i + 2] * (1 - blend) + cdfB[data[i + 2]] * 255 * blend);
      output[i + 3] = data[i + 3];
    }

    return new ImageData(output, width, height);
  }

  /**
   * Calculate cumulative distribution function
   */
  private calculateCDF(histogram: number[], total: number): number[] {
    const cdf = new Array(256);
    let cumulative = 0;

    for (let i = 0; i < 256; i++) {
      cumulative += histogram[i];
      cdf[i] = cumulative / total;
    }

    return cdf;
  }

  /**
   * Assess image quality metrics
   */
  private assessQuality(imageData: ImageData): PreprocessResult['quality'] {
    const noiseLevel = this.estimateNoiseLevel(imageData);
    const contrast = this.estimateContrast(imageData);
    const sharpness = this.estimateSharpness(imageData);

    return { noiseLevel, contrast, sharpness };
  }

  /**
   * Estimate noise level using local variance method
   */
  private estimateNoiseLevel(imageData: ImageData): number {
    const { width, height, data } = imageData;
    const windowSize = 5;
    const variances: number[] = [];

    // Sample regions across the image
    const step = Math.max(1, Math.floor(Math.min(width, height) / 20));

    for (let y = windowSize; y < height - windowSize; y += step) {
      for (let x = windowSize; x < width - windowSize; x += step) {
        const values: number[] = [];

        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            values.push((data[idx] + data[idx + 1] + data[idx + 2]) / 3);
          }
        }

        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
        variances.push(variance);
      }
    }

    // Low variances indicate uniform regions (good)
    // High average variance indicates noise
    variances.sort((a, b) => a - b);
    const medianVariance = variances[Math.floor(variances.length * 0.25)]; // Lower quartile

    // Normalize to 0-1 (higher = more noise)
    return Math.min(1, medianVariance / 500);
  }

  /**
   * Estimate contrast using histogram spread
   */
  private estimateContrast(imageData: ImageData): number {
    const { data } = imageData;
    let min = 255, max = 0;

    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      min = Math.min(min, gray);
      max = Math.max(max, gray);
    }

    return (max - min) / 255;
  }

  /**
   * Estimate sharpness using Laplacian variance
   */
  private estimateSharpness(imageData: ImageData): number {
    const { width, height, data } = imageData;
    let sumLaplacian = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y += 2) {
      for (let x = 1; x < width - 1; x += 2) {
        const getGray = (px: number, py: number) => {
          const idx = (py * width + px) * 4;
          return (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        };

        // Laplacian kernel
        const laplacian = Math.abs(
          -4 * getGray(x, y) +
          getGray(x - 1, y) + getGray(x + 1, y) +
          getGray(x, y - 1) + getGray(x, y + 1)
        );

        sumLaplacian += laplacian;
        count++;
      }
    }

    // Normalize to 0-1 (higher = sharper)
    return Math.min(1, (sumLaplacian / count) / 50);
  }
}

/**
 * Convenience function for preprocessing
 */
export function preprocessImage(
  imageData: ImageData,
  options?: PreprocessorOptions
): PreprocessResult {
  const preprocessor = new ImagePreprocessor(options);
  return preprocessor.process(imageData);
}
