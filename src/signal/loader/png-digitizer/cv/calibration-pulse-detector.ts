/**
 * Calibration Pulse Detector
 * Detects the 1mV calibration square pulse to determine exact voltage scaling
 *
 * @module signal/loader/png-digitizer/cv/calibration-pulse-detector
 */

/**
 * Calibration pulse detection result
 */
export interface CalibrationPulseResult {
  /** Was a calibration pulse detected */
  found: boolean;

  /** Height of the pulse in pixels */
  heightPx: number;

  /** Width of the pulse in pixels */
  widthPx: number;

  /** Location of the pulse */
  location: { x: number; y: number };

  /** Calculated pixels per millivolt */
  pxPerMv: number;

  /** Detection confidence (0-1) */
  confidence: number;

  /** Method used for detection */
  method: 'square_pulse' | 'waveform_amplitude' | 'grid_based' | 'assumed';
}

/**
 * Calibration pulse detector
 * Scans the left margin of an ECG image to find the standard 1mV calibration pulse
 */
export class CalibrationPulseDetector {
  private width: number;
  private height: number;
  private data: Uint8ClampedArray;
  private darknessThreshold: number;

  constructor(imageData: ImageData, darknessThreshold = 100) {
    this.width = imageData.width;
    this.height = imageData.height;
    this.data = imageData.data;
    this.darknessThreshold = darknessThreshold;
  }

  /**
   * Detect calibration pulse in the image
   * Searches the left margin for a rectangular pulse
   */
  detect(): CalibrationPulseResult {
    // Standard calibration pulse characteristics:
    // - Located in left margin (first 10-15% of image width)
    // - Rectangular shape (square wave)
    // - Width typically 100-200ms at paper speed (varies with speed)
    // - Height represents 1mV (standard gain is 10mm/mV)

    // Search in the left margin
    const searchWidth = Math.floor(this.width * 0.15);
    const searchHeight = this.height;

    // Scan for potential square pulses
    const pulses = this.findSquarePulses(0, 0, searchWidth, searchHeight);

    if (pulses.length > 0) {
      // Pick the most likely calibration pulse
      // (typically the first/topmost one with correct aspect ratio)
      const best = this.selectBestPulse(pulses);

      if (best) {
        return {
          found: true,
          heightPx: best.height,
          widthPx: best.width,
          location: { x: best.x, y: best.y },
          pxPerMv: best.height, // 1mV pulse height = pxPerMv
          confidence: best.confidence,
          method: 'square_pulse',
        };
      }
    }

    // Fallback: estimate from waveform amplitude
    const waveformEstimate = this.estimateFromWaveforms();
    if (waveformEstimate) {
      return waveformEstimate;
    }

    // No calibration found
    return {
      found: false,
      heightPx: 0,
      widthPx: 0,
      location: { x: 0, y: 0 },
      pxPerMv: 0,
      confidence: 0,
      method: 'assumed',
    };
  }

  /**
   * Find rectangular pulse shapes in a region
   */
  private findSquarePulses(
    startX: number,
    startY: number,
    width: number,
    height: number
  ): Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  }> {
    const pulses: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      confidence: number;
    }> = [];

    // Scan each column looking for vertical edges
    const verticalEdges: Array<{ x: number; yStart: number; yEnd: number }> = [];

    for (let x = startX; x < startX + width; x++) {
      let inDarkRegion = false;
      let darkStart = 0;

      for (let y = startY; y < startY + height; y++) {
        const darkness = this.getPixelDarkness(x, y);

        if (!inDarkRegion && darkness > this.darknessThreshold) {
          inDarkRegion = true;
          darkStart = y;
        } else if (inDarkRegion && darkness <= this.darknessThreshold) {
          inDarkRegion = false;
          const darkHeight = y - darkStart;

          // Look for tall vertical segments (likely pulse edges)
          if (darkHeight > 20 && darkHeight < 200) {
            verticalEdges.push({ x, yStart: darkStart, yEnd: y });
          }
        }
      }
    }

    // Look for pairs of vertical edges that form rectangles
    for (let i = 0; i < verticalEdges.length; i++) {
      for (let j = i + 1; j < verticalEdges.length; j++) {
        const left = verticalEdges[i];
        const right = verticalEdges[j];

        // Check if they form a plausible rectangle
        const xGap = right.x - left.x;
        const heightMatch = Math.abs(left.yEnd - left.yStart - (right.yEnd - right.yStart)) < 10;
        const yOverlap = Math.max(0, Math.min(left.yEnd, right.yEnd) - Math.max(left.yStart, right.yStart));
        const avgHeight = (left.yEnd - left.yStart + right.yEnd - right.yStart) / 2;

        // Calibration pulse: width is typically 10-50% of height
        // Standard 100ms pulse at 25mm/s = 2.5mm, with 10mm/mV gain = aspect ratio ~0.25
        const aspectRatio = xGap / avgHeight;

        if (
          heightMatch &&
          yOverlap > avgHeight * 0.8 &&
          xGap > 5 &&
          xGap < avgHeight * 2 &&
          aspectRatio > 0.1 &&
          aspectRatio < 1.0
        ) {
          // Check if the top and bottom are connected (horizontal lines)
          const topConnected = this.hasHorizontalConnection(
            left.x,
            right.x,
            Math.min(left.yStart, right.yStart)
          );
          const bottomConnected = this.hasHorizontalConnection(
            left.x,
            right.x,
            Math.max(left.yEnd, right.yEnd)
          );

          // Score confidence based on rectangle quality
          let confidence = 0.5;
          if (topConnected) confidence += 0.2;
          if (bottomConnected) confidence += 0.2;
          if (heightMatch) confidence += 0.1;

          pulses.push({
            x: left.x,
            y: Math.min(left.yStart, right.yStart),
            width: xGap,
            height: avgHeight,
            confidence,
          });
        }
      }
    }

    return pulses;
  }

  /**
   * Check if there's a horizontal dark line connecting two x positions
   */
  private hasHorizontalConnection(x1: number, x2: number, y: number): boolean {
    let darkCount = 0;
    const totalPoints = x2 - x1;

    for (let x = x1; x <= x2; x++) {
      if (this.getPixelDarkness(x, y) > this.darknessThreshold * 0.5) {
        darkCount++;
      }
    }

    return darkCount > totalPoints * 0.6;
  }

  /**
   * Select the most likely calibration pulse from candidates
   */
  private selectBestPulse(
    pulses: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      confidence: number;
    }>
  ): typeof pulses[0] | null {
    if (pulses.length === 0) return null;

    // Sort by confidence and position (prefer left/top)
    const scored = pulses.map(p => ({
      ...p,
      score: p.confidence - (p.x / this.width) * 0.1 - (p.y / this.height) * 0.05,
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0];
  }

  /**
   * Estimate calibration from typical waveform amplitudes
   * Uses the fact that normal QRS amplitude is 0.5-2.5mV
   */
  private estimateFromWaveforms(): CalibrationPulseResult | null {
    // Sample the image to find waveform amplitude
    const sampleColumns = 20;
    const columnStep = Math.floor(this.width / sampleColumns);
    const amplitudes: number[] = [];

    for (let col = 0; col < sampleColumns; col++) {
      const x = col * columnStep + columnStep / 2;
      const waveformY = this.findWaveformExtent(x);

      if (waveformY.found) {
        amplitudes.push(waveformY.height);
      }
    }

    if (amplitudes.length < 5) return null;

    // Find the maximum amplitude (likely QRS complex)
    amplitudes.sort((a, b) => b - a);
    const maxAmplitude = amplitudes[Math.floor(amplitudes.length * 0.1)]; // 90th percentile

    // Assume typical QRS amplitude is 1-2mV
    // If max waveform height is X pixels, then pxPerMv ≈ X / 1.5
    const estimatedPxPerMv = maxAmplitude / 1.5;

    if (estimatedPxPerMv > 10 && estimatedPxPerMv < 200) {
      return {
        found: true,
        heightPx: estimatedPxPerMv,
        widthPx: 0,
        location: { x: 0, y: 0 },
        pxPerMv: estimatedPxPerMv,
        confidence: 0.4, // Lower confidence for estimated value
        method: 'waveform_amplitude',
      };
    }

    return null;
  }

  /**
   * Find the vertical extent of waveforms at a given x position
   */
  private findWaveformExtent(x: number): { found: boolean; minY: number; maxY: number; height: number } {
    let minY = this.height;
    let maxY = 0;
    let foundDark = false;

    for (let y = 0; y < this.height; y++) {
      if (this.getPixelDarkness(x, y) > this.darknessThreshold) {
        foundDark = true;
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }

    if (!foundDark) {
      return { found: false, minY: 0, maxY: 0, height: 0 };
    }

    return {
      found: true,
      minY,
      maxY,
      height: maxY - minY,
    };
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
 * Detect calibration pulse in an ECG image
 */
export function detectCalibrationPulse(
  imageData: ImageData,
  darknessThreshold = 100
): CalibrationPulseResult {
  const detector = new CalibrationPulseDetector(imageData, darknessThreshold);
  return detector.detect();
}
