/**
 * Rhythm Strip Detector
 * Automatically detects and segments rhythm strips in ECG images
 *
 * @module signal/loader/png-digitizer/cv/rhythm-strip-detector
 */

import type { PanelAnalysis, Bounds, LayoutAnalysis } from '../types';
import type { LeadName } from '../../../../types';

/**
 * Rhythm strip detection result
 */
export interface RhythmStripResult {
  /** Detected rhythm strips */
  strips: RhythmStrip[];

  /** Modified panels (with rhythm strips separated) */
  panels: PanelAnalysis[];

  /** Layout updated with rhythm info */
  layout: LayoutAnalysis;
}

/**
 * Individual rhythm strip
 */
export interface RhythmStrip {
  /** Strip identifier */
  id: string;

  /** Associated lead */
  lead: LeadName;

  /** Bounding box */
  bounds: Bounds;

  /** Baseline Y position */
  baselineY: number;

  /** Duration in seconds (estimated) */
  durationSec: number;

  /** Is this the primary (longest) rhythm strip */
  isPrimary: boolean;

  /** Confidence */
  confidence: number;
}

/**
 * Rhythm strip detector class
 */
export class RhythmStripDetector {
  private width: number;
  private height: number;
  private data: Uint8ClampedArray;

  constructor(imageData: ImageData) {
    this.width = imageData.width;
    this.height = imageData.height;
    this.data = imageData.data;
  }

  /**
   * Detect rhythm strips in image
   */
  detect(existingPanels: PanelAnalysis[], layout: LayoutAnalysis): RhythmStripResult {
    // Look for full-width or near-full-width panels at bottom of image
    const rhythmStrips: RhythmStrip[] = [];

    // Check bottom portion of image for rhythm strips
    const bottomY = this.height * 0.7;
    const bottomPanels = existingPanels.filter(p =>
      p.bounds.y + p.bounds.height / 2 > bottomY
    );

    // Detect continuous waveform regions in bottom area
    const continuousRegions = this.findContinuousWaveformRegions(bottomY);

    // Convert regions to rhythm strips
    for (let i = 0; i < continuousRegions.length; i++) {
      const region = continuousRegions[i];

      // Only consider wide regions as rhythm strips
      if (region.width > this.width * 0.6) {
        const baselineY = this.findBaseline(region);

        // Try to identify lead from position or existing panels
        const lead = this.identifyRhythmLead(region, bottomPanels, i);

        rhythmStrips.push({
          id: `rhythm_${i}`,
          lead,
          bounds: region,
          baselineY,
          durationSec: this.estimateDuration(region.width, layout),
          isPrimary: i === 0,
          confidence: region.width > this.width * 0.8 ? 0.9 : 0.7,
        });
      }
    }

    // Update layout with rhythm strip info
    const updatedLayout: LayoutAnalysis = {
      ...layout,
      hasRhythmStrips: rhythmStrips.length > 0,
      rhythmStripCount: rhythmStrips.length,
    };

    // Filter out rhythm strip panels from regular panels and add as separate entries
    const filteredPanels = existingPanels.filter(p => {
      const centerY = p.bounds.y + p.bounds.height / 2;
      return centerY <= bottomY || p.bounds.width < this.width * 0.5;
    });

    // Add rhythm strips as panels
    const rhythmPanels: PanelAnalysis[] = rhythmStrips.map((strip, idx) => ({
      id: strip.id,
      lead: strip.lead,
      leadSource: 'position_inferred' as const,
      bounds: strip.bounds,
      baselineY: strip.baselineY,
      row: layout.rows + idx,
      col: 0,
      isRhythmStrip: true,
      timeRange: { startSec: 0, endSec: strip.durationSec },
      labelConfidence: strip.confidence,
    }));

    return {
      strips: rhythmStrips,
      panels: [...filteredPanels, ...rhythmPanels],
      layout: updatedLayout,
    };
  }

  /**
   * Find continuous waveform regions in bottom portion
   */
  private findContinuousWaveformRegions(startY: number): Bounds[] {
    const regions: Bounds[] = [];
    const rowActivity = new Array(Math.floor(this.height - startY)).fill(0);

    // Count waveform activity per row
    for (let y = Math.floor(startY); y < this.height; y++) {
      let darkPixels = 0;
      for (let x = 0; x < this.width; x++) {
        const idx = (y * this.width + x) * 4;
        const brightness = (this.data[idx] + this.data[idx + 1] + this.data[idx + 2]) / 3;
        if (brightness < 100) darkPixels++;
      }
      rowActivity[y - Math.floor(startY)] = darkPixels / this.width;
    }

    // Find contiguous regions of activity
    let regionStart = -1;
    const activityThreshold = 0.01;

    for (let i = 0; i < rowActivity.length; i++) {
      if (rowActivity[i] > activityThreshold) {
        if (regionStart < 0) regionStart = i;
      } else {
        if (regionStart >= 0 && i - regionStart > 20) {
          // Find horizontal extent of this region
          const y = Math.floor(startY) + regionStart;
          const height = i - regionStart;
          const { minX, maxX } = this.findHorizontalExtent(y, height);

          regions.push({
            x: minX,
            y,
            width: maxX - minX,
            height,
          });
        }
        regionStart = -1;
      }
    }

    // Handle region that extends to bottom
    if (regionStart >= 0) {
      const y = Math.floor(startY) + regionStart;
      const height = rowActivity.length - regionStart;
      const { minX, maxX } = this.findHorizontalExtent(y, height);

      regions.push({
        x: minX,
        y,
        width: maxX - minX,
        height,
      });
    }

    return regions;
  }

  /**
   * Find horizontal extent of waveform region
   */
  private findHorizontalExtent(y: number, height: number): { minX: number; maxX: number } {
    let minX = this.width;
    let maxX = 0;

    for (let row = y; row < y + height; row++) {
      for (let x = 0; x < this.width; x++) {
        const idx = (row * this.width + x) * 4;
        const brightness = (this.data[idx] + this.data[idx + 1] + this.data[idx + 2]) / 3;
        if (brightness < 100) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
      }
    }

    return { minX: Math.max(0, minX - 5), maxX: Math.min(this.width, maxX + 5) };
  }

  /**
   * Find baseline Y in region
   */
  private findBaseline(bounds: Bounds): number {
    const rowActivity: number[] = [];

    for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
      let activity = 0;
      for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
        const idx = (y * this.width + x) * 4;
        const brightness = (this.data[idx] + this.data[idx + 1] + this.data[idx + 2]) / 3;
        if (brightness < 100) activity++;
      }
      rowActivity.push(activity);
    }

    // Find median activity row as baseline
    const sorted = [...rowActivity].sort((a, b) => a - b);
    const medianActivity = sorted[Math.floor(sorted.length / 2)];

    // Find closest row to median
    let bestRow = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < rowActivity.length; i++) {
      const diff = Math.abs(rowActivity[i] - medianActivity);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestRow = i;
      }
    }

    return bounds.y + bestRow;
  }

  /**
   * Identify lead for rhythm strip
   */
  private identifyRhythmLead(
    region: Bounds,
    bottomPanels: PanelAnalysis[],
    index: number
  ): LeadName {
    // Common rhythm strip leads
    const commonLeads: LeadName[] = ['II', 'V1', 'V5', 'I'];

    // Check if any existing panel overlaps
    for (const panel of bottomPanels) {
      if (this.boundsOverlap(region, panel.bounds) && panel.lead) {
        return panel.lead;
      }
    }

    // Default based on position
    return commonLeads[index] ?? 'II';
  }

  /**
   * Estimate duration based on width and paper speed
   */
  private estimateDuration(width: number, _layout: LayoutAnalysis): number {
    // Estimate based on typical paper speed (25mm/s) and image width
    // Assuming standard letter page width (~11 inches = 279mm)
    const assumedPageWidthMm = 279;
    const regionWidthMm = (width / this.width) * assumedPageWidthMm;
    const paperSpeed = 25; // mm/s

    return regionWidthMm / paperSpeed;
  }

  /**
   * Check if two bounds overlap
   */
  private boundsOverlap(a: Bounds, b: Bounds): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    );
  }
}

/**
 * Convenience function for rhythm strip detection
 */
export function detectRhythmStrips(
  imageData: ImageData,
  panels: PanelAnalysis[],
  layout: LayoutAnalysis
): RhythmStripResult {
  const detector = new RhythmStripDetector(imageData);
  return detector.detect(panels, layout);
}
