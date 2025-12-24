/**
 * Glare and Reflection Detector
 * Detect screen glare, reflections, and other optical artifacts in photos
 *
 * @module signal/loader/png-digitizer/cv/glare-detector
 */

import type { Bounds } from '../types';

/**
 * Glare detection result
 */
export interface GlareDetectionResult {
  /** Glare detected */
  hasGlare: boolean;

  /** Severity (0-1) */
  severity: number;

  /** Affected regions */
  regions: GlareRegion[];

  /** Percentage of image affected */
  affectedPercentage: number;

  /** Suggestions for improvement */
  suggestions: string[];

  /** Can the image still be processed */
  processable: boolean;
}

/**
 * Individual glare region
 */
export interface GlareRegion {
  /** Bounding box */
  bounds: Bounds;

  /** Type of artifact */
  type: 'glare' | 'reflection' | 'hotspot' | 'shadow' | 'vignette';

  /** Intensity (0-1) */
  intensity: number;

  /** Does this overlap with ECG content */
  overlapsContent: boolean;
}

/**
 * Glare Detector class
 */
export class GlareDetector {
  private imageData: ImageData;
  private width: number;
  private height: number;

  constructor(imageData: ImageData) {
    this.imageData = imageData;
    this.width = imageData.width;
    this.height = imageData.height;
  }

  /**
   * Detect glare and reflections
   */
  detect(): GlareDetectionResult {
    const regions: GlareRegion[] = [];
    const suggestions: string[] = [];

    // Detect overexposed hotspots (glare)
    const hotspots = this.detectHotspots();
    regions.push(...hotspots);

    // Detect reflections (gradient patterns)
    const reflections = this.detectReflections();
    regions.push(...reflections);

    // Detect shadows (underexposed regions)
    const shadows = this.detectShadows();
    regions.push(...shadows);

    // Detect vignetting
    const vignette = this.detectVignette();
    if (vignette) {
      regions.push(vignette);
    }

    // Calculate overall metrics
    const affectedPixels = this.calculateAffectedPixels(regions);
    const affectedPercentage = affectedPixels / (this.width * this.height);
    const severity = this.calculateSeverity(regions);

    // Generate suggestions
    if (hotspots.length > 0) {
      suggestions.push('Move to reduce direct light reflection on screen');
      suggestions.push('Tilt the device/paper to eliminate glare spots');
    }
    if (reflections.length > 0) {
      suggestions.push('Avoid overhead lighting that creates gradient reflections');
    }
    if (shadows.length > 0) {
      suggestions.push('Ensure even lighting across the entire ECG');
    }
    if (vignette) {
      suggestions.push('Move further from the subject to reduce lens vignetting');
    }

    // Determine if still processable
    const overlappingRegions = regions.filter(r => r.overlapsContent);
    const processable = overlappingRegions.length === 0 ||
      (severity < 0.5 && affectedPercentage < 0.3);

    return {
      hasGlare: regions.length > 0,
      severity,
      regions,
      affectedPercentage,
      suggestions,
      processable,
    };
  }

  /**
   * Detect overexposed hotspots
   */
  private detectHotspots(): GlareRegion[] {
    const regions: GlareRegion[] = [];
    const data = this.imageData.data;
    const visited = new Set<number>();

    const hotspotThreshold = 252; // Very bright pixels
    const minSize = (this.width * this.height) * 0.001; // At least 0.1% of image

    for (let y = 0; y < this.height; y += 5) {
      for (let x = 0; x < this.width; x += 5) {
        const idx = y * this.width + x;
        if (visited.has(idx)) continue;

        const pixelIdx = idx * 4;
        const r = data[pixelIdx];
        const g = data[pixelIdx + 1];
        const b = data[pixelIdx + 2];

        // Check for very bright pixel
        if (r > hotspotThreshold && g > hotspotThreshold && b > hotspotThreshold) {
          // Flood fill to find extent
          const bounds = this.floodFillBounds(x, y, hotspotThreshold, visited);
          const size = bounds.width * bounds.height;

          if (size > minSize) {
            const intensity = this.calculateRegionIntensity(bounds);
            regions.push({
              bounds,
              type: 'hotspot',
              intensity,
              overlapsContent: this.checkContentOverlap(bounds),
            });
          }
        }
      }
    }

    return regions;
  }

  /**
   * Detect gradient reflections
   */
  private detectReflections(): GlareRegion[] {
    const regions: GlareRegion[] = [];
    const data = this.imageData.data;

    // Divide image into grid and analyze gradients
    const gridSize = 8;
    const cellWidth = Math.floor(this.width / gridSize);
    const cellHeight = Math.floor(this.height / gridSize);

    const brightnesses: number[][] = [];

    for (let gy = 0; gy < gridSize; gy++) {
      brightnesses[gy] = [];
      for (let gx = 0; gx < gridSize; gx++) {
        let totalBrightness = 0;
        let count = 0;

        for (let y = gy * cellHeight; y < (gy + 1) * cellHeight; y += 4) {
          for (let x = gx * cellWidth; x < (gx + 1) * cellWidth; x += 4) {
            const idx = (y * this.width + x) * 4;
            const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            totalBrightness += brightness;
            count++;
          }
        }

        brightnesses[gy][gx] = totalBrightness / count;
      }
    }

    // Look for gradient patterns (one side brighter than other)
    const leftAvg = this.averageColumn(brightnesses, 0);
    const rightAvg = this.averageColumn(brightnesses, gridSize - 1);
    const topAvg = this.averageRow(brightnesses, 0);
    const bottomAvg = this.averageRow(brightnesses, gridSize - 1);

    const gradientThreshold = 40;

    if (Math.abs(leftAvg - rightAvg) > gradientThreshold) {
      const brighter = leftAvg > rightAvg ? 'left' : 'right';
      regions.push({
        bounds: {
          x: brighter === 'left' ? 0 : this.width / 2,
          y: 0,
          width: this.width / 2,
          height: this.height,
        },
        type: 'reflection',
        intensity: Math.abs(leftAvg - rightAvg) / 255,
        overlapsContent: true, // Gradients typically affect content
      });
    }

    if (Math.abs(topAvg - bottomAvg) > gradientThreshold) {
      const brighter = topAvg > bottomAvg ? 'top' : 'bottom';
      regions.push({
        bounds: {
          x: 0,
          y: brighter === 'top' ? 0 : this.height / 2,
          width: this.width,
          height: this.height / 2,
        },
        type: 'reflection',
        intensity: Math.abs(topAvg - bottomAvg) / 255,
        overlapsContent: true,
      });
    }

    return regions;
  }

  /**
   * Detect shadows (underexposed regions)
   */
  private detectShadows(): GlareRegion[] {
    const regions: GlareRegion[] = [];
    const data = this.imageData.data;
    const visited = new Set<number>();

    const shadowThreshold = 50; // Very dark pixels
    const minSize = (this.width * this.height) * 0.005; // At least 0.5% of image

    for (let y = 0; y < this.height; y += 10) {
      for (let x = 0; x < this.width; x += 10) {
        const idx = y * this.width + x;
        if (visited.has(idx)) continue;

        const pixelIdx = idx * 4;
        const r = data[pixelIdx];
        const g = data[pixelIdx + 1];
        const b = data[pixelIdx + 2];
        const brightness = (r + g + b) / 3;

        // Check for very dark pixel (but not waveform black)
        if (brightness < shadowThreshold) {
          const bounds = this.floodFillBounds(x, y, shadowThreshold, visited, true);
          const size = bounds.width * bounds.height;

          if (size > minSize) {
            regions.push({
              bounds,
              type: 'shadow',
              intensity: 1 - (brightness / shadowThreshold),
              overlapsContent: this.checkContentOverlap(bounds),
            });
          }
        }
      }
    }

    return regions;
  }

  /**
   * Detect lens vignetting
   */
  private detectVignette(): GlareRegion | null {
    const data = this.imageData.data;

    // Compare center brightness to corner brightness
    const centerX = Math.floor(this.width / 2);
    const centerY = Math.floor(this.height / 2);
    const radius = Math.floor(Math.min(this.width, this.height) / 4);

    let centerBrightness = 0;
    let centerCount = 0;
    let cornerBrightness = 0;
    let cornerCount = 0;

    for (let y = 0; y < this.height; y += 10) {
      for (let x = 0; x < this.width; x += 10) {
        const idx = (y * this.width + x) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

        const dx = x - centerX;
        const dy = y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < radius) {
          centerBrightness += brightness;
          centerCount++;
        } else if (dist > Math.min(this.width, this.height) / 2.5) {
          cornerBrightness += brightness;
          cornerCount++;
        }
      }
    }

    centerBrightness /= centerCount;
    cornerBrightness /= cornerCount;

    // Vignetting: corners are darker than center
    const vignetteDiff = centerBrightness - cornerBrightness;
    const vignetteThreshold = 30;

    if (vignetteDiff > vignetteThreshold) {
      return {
        bounds: { x: 0, y: 0, width: this.width, height: this.height },
        type: 'vignette',
        intensity: vignetteDiff / 100,
        overlapsContent: true,
      };
    }

    return null;
  }

  /**
   * Flood fill to find region bounds
   */
  private floodFillBounds(
    startX: number,
    startY: number,
    threshold: number,
    visited: Set<number>,
    isDark: boolean = false
  ): Bounds {
    const data = this.imageData.data;
    const stack: [number, number][] = [[startX, startY]];

    let minX = startX, maxX = startX;
    let minY = startY, maxY = startY;

    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      const idx = y * this.width + x;

      if (visited.has(idx)) continue;
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;

      const pixelIdx = idx * 4;
      const r = data[pixelIdx];
      const g = data[pixelIdx + 1];
      const b = data[pixelIdx + 2];
      const brightness = (r + g + b) / 3;

      const matches = isDark
        ? brightness < threshold
        : (r > threshold && g > threshold && b > threshold);

      if (!matches) continue;

      visited.add(idx);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      // Add neighbors (sparse to avoid stack overflow)
      stack.push([x + 5, y], [x - 5, y], [x, y + 5], [x, y - 5]);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  }

  /**
   * Calculate region intensity
   */
  private calculateRegionIntensity(bounds: Bounds): number {
    const data = this.imageData.data;
    let total = 0;
    let count = 0;

    for (let y = bounds.y; y < bounds.y + bounds.height; y += 4) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 4) {
        const idx = (y * this.width + x) * 4;
        total += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        count++;
      }
    }

    return (total / count) / 255;
  }

  /**
   * Check if region overlaps with ECG content
   */
  private checkContentOverlap(bounds: Bounds): boolean {
    const data = this.imageData.data;
    let darkPixels = 0;
    let totalPixels = 0;

    for (let y = bounds.y; y < bounds.y + bounds.height; y += 4) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 4) {
        const idx = (y * this.width + x) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

        if (brightness < 100) darkPixels++;
        totalPixels++;
      }
    }

    // If >1% dark pixels, likely has waveform content
    return (darkPixels / totalPixels) > 0.01;
  }

  /**
   * Calculate affected pixels from regions
   */
  private calculateAffectedPixels(regions: GlareRegion[]): number {
    // Simple sum (doesn't account for overlap)
    return regions.reduce((sum, r) => sum + r.bounds.width * r.bounds.height, 0);
  }

  /**
   * Calculate overall severity
   */
  private calculateSeverity(regions: GlareRegion[]): number {
    if (regions.length === 0) return 0;

    const maxIntensity = Math.max(...regions.map(r => r.intensity));
    const overlappingCount = regions.filter(r => r.overlapsContent).length;

    return Math.min(1, maxIntensity * 0.5 + (overlappingCount / regions.length) * 0.5);
  }

  /**
   * Average brightness of a column in grid
   */
  private averageColumn(grid: number[][], col: number): number {
    let sum = 0;
    for (let row = 0; row < grid.length; row++) {
      sum += grid[row][col];
    }
    return sum / grid.length;
  }

  /**
   * Average brightness of a row in grid
   */
  private averageRow(grid: number[][], row: number): number {
    let sum = 0;
    for (let col = 0; col < grid[row].length; col++) {
      sum += grid[row][col];
    }
    return sum / grid[row].length;
  }
}

/**
 * Convenience function for glare detection
 */
export function detectGlare(imageData: ImageData): GlareDetectionResult {
  const detector = new GlareDetector(imageData);
  return detector.detect();
}
