/**
 * Universal Layout Detector
 * Automatically detects ECG layout from ANY image format
 *
 * @module signal/loader/png-digitizer/cv/universal-layout-detector
 */

import type { LayoutAnalysis, PanelAnalysis, Bounds, Point } from '../types';
import type { LeadName } from '../../../../types';

/**
 * Waveform region detected in image
 */
interface WaveformRegion {
  /** Bounding box */
  bounds: Bounds;

  /** Center point */
  center: Point;

  /** Estimated baseline Y */
  baselineY: number;

  /** Waveform density (pixels per unit width) */
  density: number;

  /** Detected waveform color */
  waveformColor: { r: number; g: number; b: number };

  /** Confidence in detection */
  confidence: number;
}

/**
 * Universal layout detector class
 */
export class UniversalLayoutDetector {
  private width: number;
  private height: number;
  private data: Uint8ClampedArray;

  constructor(imageData: ImageData) {
    this.width = imageData.width;
    this.height = imageData.height;
    this.data = imageData.data;
  }

  /**
   * Detect layout from image
   */
  detect(): {
    layout: LayoutAnalysis;
    panels: PanelAnalysis[];
    waveformRegions: WaveformRegion[];
  } {
    // Step 1: Find all waveform regions
    const regions = this.findWaveformRegions();

    if (regions.length === 0) {
      return this.createEmptyLayout();
    }

    // Step 2: Cluster regions into panels
    const panels = this.clusterIntoPanels(regions);

    // Step 3: Infer layout from panel arrangement
    const layout = this.inferLayout(panels);

    // Step 4: Assign lead names based on position
    const panelsWithLeads = this.assignLeadNames(panels, layout);

    return {
      layout,
      panels: panelsWithLeads,
      waveformRegions: regions,
    };
  }

  /**
   * Find all waveform regions in image using adaptive scanning
   */
  private findWaveformRegions(): WaveformRegion[] {
    const regions: WaveformRegion[] = [];

    // Detect waveform color(s)
    const waveformColors = this.detectWaveformColors();

    // Scan image in blocks to find waveform-containing regions
    const blockSize = Math.min(50, Math.floor(Math.min(this.width, this.height) / 20));
    const waveformBlocks: Array<{ x: number; y: number; density: number; color: typeof waveformColors[0] }> = [];

    for (let by = 0; by < this.height; by += blockSize) {
      for (let bx = 0; bx < this.width; bx += blockSize) {
        const blockInfo = this.analyzeBlock(bx, by, blockSize, waveformColors);
        if (blockInfo.density > 0.01) {
          waveformBlocks.push({
            x: bx,
            y: by,
            density: blockInfo.density,
            color: blockInfo.dominantColor,
          });
        }
      }
    }

    // Merge adjacent blocks into regions
    const merged = this.mergeAdjacentBlocks(waveformBlocks, blockSize);

    // Convert to WaveformRegion format
    for (const region of merged) {
      const baselineY = this.findBaselineInRegion(region.bounds);
      regions.push({
        bounds: region.bounds,
        center: {
          x: region.bounds.x + region.bounds.width / 2,
          y: region.bounds.y + region.bounds.height / 2,
        },
        baselineY,
        density: region.density,
        waveformColor: region.color,
        confidence: Math.min(1, region.density * 10),
      });
    }

    return regions;
  }

  /**
   * Detect waveform colors in image
   */
  private detectWaveformColors(): Array<{ r: number; g: number; b: number }> {
    const colorBuckets = new Map<string, { r: number; g: number; b: number; count: number }>();
    const sampleStep = Math.max(1, Math.floor((this.width * this.height) / 100000));

    for (let i = 0; i < this.data.length; i += 4 * sampleStep) {
      const r = this.data[i];
      const g = this.data[i + 1];
      const b = this.data[i + 2];
      const brightness = (r + g + b) / 3;

      // Look for dark pixels (potential waveforms)
      if (brightness < 100) {
        // Quantize color
        const qr = Math.floor(r / 32) * 32;
        const qg = Math.floor(g / 32) * 32;
        const qb = Math.floor(b / 32) * 32;
        const key = `${qr},${qg},${qb}`;

        const existing = colorBuckets.get(key);
        if (existing) {
          existing.count++;
          existing.r = (existing.r * (existing.count - 1) + r) / existing.count;
          existing.g = (existing.g * (existing.count - 1) + g) / existing.count;
          existing.b = (existing.b * (existing.count - 1) + b) / existing.count;
        } else {
          colorBuckets.set(key, { r, g, b, count: 1 });
        }
      }
    }

    // Sort by count and return top colors
    const sortedColors = Array.from(colorBuckets.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(c => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) }));

    // Default to black if no dark colors found
    if (sortedColors.length === 0) {
      sortedColors.push({ r: 0, g: 0, b: 0 });
    }

    return sortedColors;
  }

  /**
   * Analyze a block for waveform content
   */
  private analyzeBlock(
    bx: number,
    by: number,
    size: number,
    waveformColors: Array<{ r: number; g: number; b: number }>
  ): {
    density: number;
    dominantColor: { r: number; g: number; b: number };
  } {
    let waveformPixels = 0;
    let totalPixels = 0;
    const colorCounts = new Map<number, number>();

    const endX = Math.min(bx + size, this.width);
    const endY = Math.min(by + size, this.height);

    for (let y = by; y < endY; y++) {
      for (let x = bx; x < endX; x++) {
        const idx = (y * this.width + x) * 4;
        const r = this.data[idx];
        const g = this.data[idx + 1];
        const b = this.data[idx + 2];
        totalPixels++;

        // Check if pixel matches any waveform color
        for (let ci = 0; ci < waveformColors.length; ci++) {
          const wc = waveformColors[ci];
          const dist = Math.abs(r - wc.r) + Math.abs(g - wc.g) + Math.abs(b - wc.b);
          if (dist < 60) {
            waveformPixels++;
            colorCounts.set(ci, (colorCounts.get(ci) ?? 0) + 1);
            break;
          }
        }
      }
    }

    // Find dominant color
    let maxColorIdx = 0;
    let maxColorCount = 0;
    for (const [idx, count] of colorCounts) {
      if (count > maxColorCount) {
        maxColorCount = count;
        maxColorIdx = idx;
      }
    }

    return {
      density: waveformPixels / totalPixels,
      dominantColor: waveformColors[maxColorIdx] ?? { r: 0, g: 0, b: 0 },
    };
  }

  /**
   * Merge adjacent blocks into regions
   */
  private mergeAdjacentBlocks(
    blocks: Array<{ x: number; y: number; density: number; color: { r: number; g: number; b: number } }>,
    blockSize: number
  ): Array<{ bounds: Bounds; density: number; color: { r: number; g: number; b: number } }> {
    if (blocks.length === 0) return [];

    // Union-find for merging
    const parent = new Map<string, string>();
    const rank = new Map<string, number>();

    const getKey = (x: number, y: number) => `${x},${y}`;

    const find = (key: string): string => {
      if (!parent.has(key)) {
        parent.set(key, key);
        rank.set(key, 0);
      }
      if (parent.get(key) !== key) {
        parent.set(key, find(parent.get(key)!));
      }
      return parent.get(key)!;
    };

    const union = (a: string, b: string) => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) {
        const rankA = rank.get(rootA) ?? 0;
        const rankB = rank.get(rootB) ?? 0;
        if (rankA < rankB) {
          parent.set(rootA, rootB);
        } else if (rankA > rankB) {
          parent.set(rootB, rootA);
        } else {
          parent.set(rootB, rootA);
          rank.set(rootA, rankA + 1);
        }
      }
    };

    // Create block map
    const blockMap = new Map<string, typeof blocks[0]>();
    for (const block of blocks) {
      blockMap.set(getKey(block.x, block.y), block);
    }

    // Merge adjacent blocks
    for (const block of blocks) {
      const key = getKey(block.x, block.y);
      find(key); // Initialize

      // Check neighbors
      const neighbors = [
        { dx: blockSize, dy: 0 },
        { dx: 0, dy: blockSize },
        { dx: blockSize, dy: blockSize },
        { dx: -blockSize, dy: blockSize },
      ];

      for (const { dx, dy } of neighbors) {
        const neighborKey = getKey(block.x + dx, block.y + dy);
        if (blockMap.has(neighborKey)) {
          union(key, neighborKey);
        }
      }
    }

    // Group by root
    const groups = new Map<string, typeof blocks>();
    for (const block of blocks) {
      const key = getKey(block.x, block.y);
      const root = find(key);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root)!.push(block);
    }

    // Convert groups to regions
    const regions: Array<{ bounds: Bounds; density: number; color: { r: number; g: number; b: number } }> = [];

    for (const group of groups.values()) {
      if (group.length < 3) continue; // Skip tiny regions

      let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
      let totalDensity = 0;
      const colorSum = { r: 0, g: 0, b: 0 };

      for (const block of group) {
        minX = Math.min(minX, block.x);
        minY = Math.min(minY, block.y);
        maxX = Math.max(maxX, block.x + blockSize);
        maxY = Math.max(maxY, block.y + blockSize);
        totalDensity += block.density;
        colorSum.r += block.color.r;
        colorSum.g += block.color.g;
        colorSum.b += block.color.b;
      }

      regions.push({
        bounds: {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        },
        density: totalDensity / group.length,
        color: {
          r: Math.round(colorSum.r / group.length),
          g: Math.round(colorSum.g / group.length),
          b: Math.round(colorSum.b / group.length),
        },
      });
    }

    return regions;
  }

  /**
   * Find baseline Y in a region
   */
  private findBaselineInRegion(bounds: Bounds): number {
    // Scan each row and count dark pixels
    const rowCounts: number[] = [];

    for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
      let count = 0;
      for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
        const idx = (y * this.width + x) * 4;
        const brightness = (this.data[idx] + this.data[idx + 1] + this.data[idx + 2]) / 3;
        if (brightness < 100) count++;
      }
      rowCounts.push(count);
    }

    // Find the row with median count (baseline has consistent activity)
    const sorted = [...rowCounts].sort((a, b) => a - b);
    const medianCount = sorted[Math.floor(sorted.length / 2)];

    // Find the Y position closest to median
    let bestY = bounds.y + bounds.height / 2;
    let bestDiff = Infinity;
    for (let i = 0; i < rowCounts.length; i++) {
      const diff = Math.abs(rowCounts[i] - medianCount);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestY = bounds.y + i;
      }
    }

    return bestY;
  }

  /**
   * Cluster waveform regions into panels
   */
  private clusterIntoPanels(regions: WaveformRegion[]): PanelAnalysis[] {
    if (regions.length === 0) return [];

    // Sort regions by Y then X
    const sorted = [...regions].sort((a, b) => {
      const yDiff = a.center.y - b.center.y;
      if (Math.abs(yDiff) > 50) return yDiff;
      return a.center.x - b.center.x;
    });

    // Group into rows based on Y proximity
    const rows: WaveformRegion[][] = [];
    let currentRow: WaveformRegion[] = [];
    let lastY = sorted[0].center.y;

    for (const region of sorted) {
      if (Math.abs(region.center.y - lastY) > 80) {
        if (currentRow.length > 0) {
          rows.push(currentRow);
        }
        currentRow = [];
      }
      currentRow.push(region);
      lastY = region.center.y;
    }
    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    // Convert to panels
    const panels: PanelAnalysis[] = [];
    let panelId = 0;

    for (let row = 0; row < rows.length; row++) {
      // Sort row by X
      const rowRegions = rows[row].sort((a, b) => a.center.x - b.center.x);

      for (let col = 0; col < rowRegions.length; col++) {
        const region = rowRegions[col];
        panels.push({
          id: `panel_${panelId++}`,
          lead: null,
          leadSource: 'unknown',
          bounds: region.bounds,
          baselineY: region.baselineY,
          row,
          col,
          isRhythmStrip: false,
          timeRange: { startSec: 0, endSec: 2.5 },
          labelConfidence: 0,
        });
      }
    }

    return panels;
  }

  /**
   * Infer layout format from panel arrangement
   */
  private inferLayout(panels: PanelAnalysis[]): LayoutAnalysis {
    if (panels.length === 0) {
      return this.createDefaultLayout();
    }

    // Count rows and columns
    const rows = new Set(panels.map(p => p.row)).size;
    const maxCols = Math.max(...panels.map(p => p.col)) + 1;

    // Determine format
    let format: LayoutAnalysis['format'] = 'unknown';
    const totalPanels = panels.length;

    if (rows === 3 && maxCols === 4 && totalPanels >= 12) {
      format = '12-lead';
    } else if (rows === 6 && maxCols === 2 && totalPanels >= 12) {
      format = '6x2';
    } else if (rows === 3 && maxCols === 5 && totalPanels >= 15) {
      format = '15-lead';
    } else if (rows === 1) {
      format = 'single-strip';
    } else if (totalPanels <= 3 && rows >= 2) {
      format = 'rhythm-only';
    }

    // Check for rhythm strips (full-width panels at bottom)
    const hasRhythmStrips = panels.some(p => {
      const panelWidth = p.bounds.width;
      return panelWidth > this.width * 0.7 && p.row === Math.max(...panels.map(pp => pp.row));
    });

    return {
      format,
      columns: maxCols,
      rows,
      hasRhythmStrips,
      rhythmStripCount: hasRhythmStrips ? 1 : 0,
      imageWidth: this.width,
      imageHeight: this.height,
      confidence: format !== 'unknown' ? 0.8 : 0.4,
    };
  }

  /**
   * Assign lead names based on position and standard layouts
   */
  private assignLeadNames(panels: PanelAnalysis[], layout: LayoutAnalysis): PanelAnalysis[] {
    // Standard lead order for different formats
    const leadOrders: Record<string, LeadName[][]> = {
      '12-lead': [
        ['I', 'aVR', 'V1', 'V4'],
        ['II', 'aVL', 'V2', 'V5'],
        ['III', 'aVF', 'V3', 'V6'],
      ],
      '6x2': [
        ['I', 'V1'],
        ['II', 'V2'],
        ['III', 'V3'],
        ['aVR', 'V4'],
        ['aVL', 'V5'],
        ['aVF', 'V6'],
      ],
      '15-lead': [
        ['I', 'aVR', 'V1', 'V4', 'V7'],
        ['II', 'aVL', 'V2', 'V5', 'V3R'],
        ['III', 'aVF', 'V3', 'V6', 'V4R'],
      ],
    };

    const order = leadOrders[layout.format];
    if (!order) {
      return panels;
    }

    return panels.map(panel => {
      const leadRow = order[panel.row];
      const lead = leadRow?.[panel.col] ?? null;

      return {
        ...panel,
        lead,
        leadSource: lead ? 'position_inferred' : 'unknown',
        labelConfidence: lead ? 0.6 : 0,
      };
    });
  }

  /**
   * Create empty layout result
   */
  private createEmptyLayout(): {
    layout: LayoutAnalysis;
    panels: PanelAnalysis[];
    waveformRegions: WaveformRegion[];
  } {
    return {
      layout: this.createDefaultLayout(),
      panels: [],
      waveformRegions: [],
    };
  }

  /**
   * Create default layout
   */
  private createDefaultLayout(): LayoutAnalysis {
    return {
      format: 'unknown',
      columns: 0,
      rows: 0,
      hasRhythmStrips: false,
      imageWidth: this.width,
      imageHeight: this.height,
      confidence: 0,
    };
  }
}

/**
 * Convenience function for universal layout detection
 */
export function detectUniversalLayout(imageData: ImageData): {
  layout: LayoutAnalysis;
  panels: PanelAnalysis[];
} {
  const detector = new UniversalLayoutDetector(imageData);
  const result = detector.detect();
  return {
    layout: result.layout,
    panels: result.panels,
  };
}
