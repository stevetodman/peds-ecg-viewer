/**
 * Baseline Detector
 * Accurately detects the isoelectric baseline in ECG waveforms
 *
 * @module signal/loader/png-digitizer/cv/baseline-detector
 */

/**
 * Baseline detection result
 */
export interface BaselineResult {
  /** Detected baseline Y position in pixels */
  baselineY: number;

  /** Detection confidence (0-1) */
  confidence: number;

  /** Method used */
  method: 'histogram' | 'flat_segment' | 'center' | 'ai_provided';

  /** Debug info */
  debugInfo?: {
    histogramPeak: number;
    flatSegmentY: number;
    panelCenter: number;
  };
}

/**
 * Baseline detector for ECG panels
 * Uses multiple methods to find the true isoelectric line
 */
export class BaselineDetector {
  private width: number;
  private height: number;
  private data: Uint8ClampedArray;
  private darknessThreshold: number;
  private waveformColor?: { r: number; g: number; b: number };
  private useStrictColorMatching: boolean;

  constructor(
    imageData: ImageData,
    darknessThreshold = 100,
    waveformColor?: { r: number; g: number; b: number },
    useStrictColorMatching = false
  ) {
    this.width = imageData.width;
    this.height = imageData.height;
    this.data = imageData.data;
    this.darknessThreshold = darknessThreshold;
    this.waveformColor = waveformColor;
    this.useStrictColorMatching = useStrictColorMatching;
  }

  /**
   * Detect baseline in a panel region
   */
  detectBaseline(
    bounds: { x: number; y: number; width: number; height: number },
    aiBaselineY?: number
  ): BaselineResult {
    const minX = Math.max(0, Math.floor(bounds.x));
    const maxX = Math.min(this.width, Math.ceil(bounds.x + bounds.width));
    const minY = Math.max(0, Math.floor(bounds.y));
    const maxY = Math.min(this.height, Math.ceil(bounds.y + bounds.height));

    // Extract waveform Y positions for this panel
    const yPositions = this.extractWaveformYPositions(minX, maxX, minY, maxY);

    if (yPositions.length < 10) {
      // Not enough data, use panel center
      const centerY = (minY + maxY) / 2;
      return {
        baselineY: aiBaselineY ?? centerY,
        confidence: 0.3,
        method: aiBaselineY ? 'ai_provided' : 'center',
        debugInfo: {
          histogramPeak: centerY,
          flatSegmentY: centerY,
          panelCenter: centerY,
        },
      };
    }

    // Method 1: Histogram analysis - find most common Y position
    const histogramResult = this.analyzeHistogram(yPositions, minY, maxY);

    // Method 2: Flat segment analysis - find Y position of horizontal segments
    const flatSegmentResult = this.analyzeFlatSegments(minX, maxX, minY, maxY);

    // Method 3: Panel center
    const panelCenter = (minY + maxY) / 2;

    // Combine results with weighting
    let baselineY: number;
    let confidence: number;
    let method: BaselineResult['method'];

    // Prefer flat segment analysis if it found good results
    if (flatSegmentResult.confidence > 0.6) {
      baselineY = flatSegmentResult.baselineY;
      confidence = flatSegmentResult.confidence;
      method = 'flat_segment';
    } else if (histogramResult.confidence > 0.5) {
      baselineY = histogramResult.baselineY;
      confidence = histogramResult.confidence;
      method = 'histogram';
    } else {
      // Use AI baseline if provided and within reasonable range
      if (
        aiBaselineY !== undefined &&
        aiBaselineY >= minY + bounds.height * 0.2 &&
        aiBaselineY <= maxY - bounds.height * 0.2
      ) {
        baselineY = aiBaselineY;
        confidence = 0.5;
        method = 'ai_provided';
      } else {
        baselineY = panelCenter;
        confidence = 0.3;
        method = 'center';
      }
    }

    return {
      baselineY,
      confidence,
      method,
      debugInfo: {
        histogramPeak: histogramResult.baselineY,
        flatSegmentY: flatSegmentResult.baselineY,
        panelCenter,
      },
    };
  }

  /**
   * Extract Y positions of waveform pixels in a region
   */
  private extractWaveformYPositions(
    minX: number,
    maxX: number,
    minY: number,
    maxY: number
  ): number[] {
    const yPositions: number[] = [];
    const sampleStep = Math.max(1, Math.floor((maxX - minX) / 200));

    for (let x = minX; x < maxX; x += sampleStep) {
      for (let y = minY; y < maxY; y++) {
        if (this.getPixelDarkness(x, y) > this.darknessThreshold) {
          yPositions.push(y);
          break; // Only take first dark pixel per column for efficiency
        }
      }
    }

    return yPositions;
  }

  /**
   * Analyze histogram of Y positions to find the most common level
   * The baseline is where the waveform spends most time
   */
  private analyzeHistogram(
    yPositions: number[],
    minY: number,
    maxY: number
  ): { baselineY: number; confidence: number } {
    const binSize = 3; // pixels per bin
    const numBins = Math.ceil((maxY - minY) / binSize);
    const histogram = new Array(numBins).fill(0);

    for (const y of yPositions) {
      const bin = Math.floor((y - minY) / binSize);
      if (bin >= 0 && bin < numBins) {
        histogram[bin]++;
      }
    }

    // Find peak bin
    let maxCount = 0;
    let peakBin = Math.floor(numBins / 2);

    for (let i = 0; i < numBins; i++) {
      if (histogram[i] > maxCount) {
        maxCount = histogram[i];
        peakBin = i;
      }
    }

    // Calculate baseline Y from peak bin
    const baselineY = minY + (peakBin + 0.5) * binSize;

    // Calculate confidence based on how dominant the peak is
    const totalPoints = yPositions.length;
    const peakNeighborhood =
      (histogram[peakBin - 1] || 0) + histogram[peakBin] + (histogram[peakBin + 1] || 0);
    const confidence = Math.min(1, peakNeighborhood / (totalPoints * 0.5));

    return { baselineY, confidence };
  }

  /**
   * Analyze flat segments to find the isoelectric line
   * The baseline is where the waveform is horizontal (derivative ≈ 0)
   */
  private analyzeFlatSegments(
    minX: number,
    maxX: number,
    minY: number,
    maxY: number
  ): { baselineY: number; confidence: number } {
    // Extract Y positions with column info
    const columnData: Array<{ x: number; y: number }> = [];

    for (let x = minX; x < maxX; x++) {
      const y = this.findWaveformY(x, minY, maxY);
      if (y !== null) {
        columnData.push({ x, y });
      }
    }

    if (columnData.length < 20) {
      return { baselineY: (minY + maxY) / 2, confidence: 0 };
    }

    // Calculate derivatives and find flat segments
    const flatSegmentYs: number[] = [];
    const windowSize = 5;

    for (let i = windowSize; i < columnData.length - windowSize; i++) {
      // Calculate local derivative (slope)
      const leftY = columnData[i - windowSize].y;
      const rightY = columnData[i + windowSize].y;
      const derivative = Math.abs(rightY - leftY) / (windowSize * 2);

      // If derivative is small, this is likely a flat segment (baseline)
      if (derivative < 0.5) {
        flatSegmentYs.push(columnData[i].y);
      }
    }

    if (flatSegmentYs.length === 0) {
      return { baselineY: (minY + maxY) / 2, confidence: 0 };
    }

    // Use median of flat segment Y positions
    flatSegmentYs.sort((a, b) => a - b);
    const medianY = flatSegmentYs[Math.floor(flatSegmentYs.length / 2)];

    // Confidence based on how many flat segments we found
    const confidence = Math.min(1, flatSegmentYs.length / (columnData.length * 0.3));

    return { baselineY: medianY, confidence };
  }

  /**
   * Find the Y position of the waveform at a given X
   * Uses segment-based detection to handle multiple dark features
   * Returns the centroid of the segment closest to panel center
   */
  private findWaveformY(x: number, minY: number, maxY: number): number | null {
    const panelCenterY = (minY + maxY) / 2;

    // Find all dark segments at this column
    const segments: Array<{ startY: number; endY: number; sumDark: number }> = [];
    let currentSegment: typeof segments[0] | null = null;

    for (let y = minY; y < maxY; y++) {
      const darkness = this.getPixelDarkness(x, y);
      if (darkness > this.darknessThreshold) {
        if (!currentSegment) {
          currentSegment = { startY: y, endY: y, sumDark: darkness };
        } else {
          currentSegment.endY = y;
          currentSegment.sumDark += darkness;
        }
      } else {
        if (currentSegment) {
          segments.push(currentSegment);
          currentSegment = null;
        }
      }
    }
    if (currentSegment) {
      segments.push(currentSegment);
    }

    if (segments.length === 0) {
      return null;
    }

    // Filter out very thick segments (>12px = likely artifacts)
    const validSegments = segments.filter(s => (s.endY - s.startY + 1) <= 12);
    if (validSegments.length === 0) {
      return null;
    }

    // Pick segment closest to panel center
    let bestSegment = validSegments[0];
    let minDist = Math.abs((bestSegment.startY + bestSegment.endY) / 2 - panelCenterY);

    for (const seg of validSegments) {
      const centerY = (seg.startY + seg.endY) / 2;
      const dist = Math.abs(centerY - panelCenterY);
      if (dist < minDist) {
        minDist = dist;
        bestSegment = seg;
      }
    }

    // Return centroid of best segment
    let sumY = 0;
    let sumWeight = 0;
    for (let y = bestSegment.startY; y <= bestSegment.endY; y++) {
      const darkness = this.getPixelDarkness(x, y);
      if (darkness > this.darknessThreshold) {
        const weight = darkness / 255;
        sumY += y * weight;
        sumWeight += weight;
      }
    }

    if (sumWeight > 0.5) {
      return sumY / sumWeight;
    }

    return (bestSegment.startY + bestSegment.endY) / 2;
  }

  /**
   * Get pixel darkness value (0=white, 255=black)
   */
  private getPixelDarkness(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;

    const idx = (Math.floor(y) * this.width + Math.floor(x)) * 4;
    const r = this.data[idx];
    const g = this.data[idx + 1];
    const b = this.data[idx + 2];

    return 255 - (r + g + b) / 3;
  }
}

/**
 * Detect baseline in a panel
 */
export function detectBaseline(
  imageData: ImageData,
  bounds: { x: number; y: number; width: number; height: number },
  aiBaselineY?: number,
  darknessThreshold = 100
): BaselineResult {
  const detector = new BaselineDetector(imageData, darknessThreshold);
  return detector.detectBaseline(bounds, aiBaselineY);
}
