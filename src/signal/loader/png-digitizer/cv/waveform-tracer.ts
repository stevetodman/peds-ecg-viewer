/**
 * Waveform Tracer
 * Precise waveform extraction from ECG image panels
 * Supports column scanning and contour-based tracing
 *
 * @module signal/loader/png-digitizer/cv/waveform-tracer
 */

import type { PanelAnalysis, RawTrace } from '../types';
import type { LeadName } from '../../../../types';

/**
 * Configuration for waveform tracing
 */
export interface WaveformTracerConfig {
  /** Darkness threshold for waveform detection (0-255) */
  darknessThreshold?: number;

  /** Maximum gap size to interpolate (pixels) */
  maxInterpolateGap?: number;

  /** Minimum confidence to accept a point */
  minPointConfidence?: number;

  /** Waveform color (if known) - helps with colored waveforms */
  waveformColor?: { r: number; g: number; b: number };

  /** Use contour tracing method */
  useContourTracing?: boolean;

  /** Enable artifact rejection */
  rejectArtifacts?: boolean;

  /** Smoothing window size (0 = disabled) */
  smoothingWindow?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<WaveformTracerConfig> = {
  darknessThreshold: 100,
  maxInterpolateGap: 10,
  minPointConfidence: 0.3,
  waveformColor: { r: 0, g: 0, b: 0 }, // Black
  useContourTracing: true,
  rejectArtifacts: true,
  smoothingWindow: 3,
};

/**
 * Waveform tracer for extracting ECG traces from image panels
 */
export class WaveformTracer {
  private width: number;
  private height: number;
  private data: Uint8ClampedArray;
  private config: Required<WaveformTracerConfig>;

  constructor(imageData: ImageData, config: WaveformTracerConfig = {}) {
    this.width = imageData.width;
    this.height = imageData.height;
    this.data = imageData.data;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Extract waveform trace from a panel
   * Uses column-by-column scanning with sub-pixel accuracy
   */
  tracePanel(panel: PanelAnalysis): RawTrace | null {
    const { bounds, lead, id } = panel;
    let { baselineY } = panel;

    if (!lead) {
      return null;
    }

    const xPixels: number[] = [];
    const yPixels: number[] = [];
    const confidence: number[] = [];
    const gaps: Array<{ startX: number; endX: number }> = [];

    let gapStart: number | null = null;

    // Clamp bounds to image dimensions
    const minX = Math.max(0, Math.floor(bounds.x));
    const maxX = Math.min(this.width, Math.ceil(bounds.x + bounds.width));
    const minY = Math.max(0, Math.floor(bounds.y));
    const maxY = Math.min(this.height, Math.ceil(bounds.y + bounds.height));

    // Only auto-detect baseline if none was provided (undefined or 0)
    // Trust the pre-computed baseline when available (from baseline-detector.ts)
    if (!baselineY || baselineY <= 0) {
      const detectedBaseline = this.detectBaselineY(minX, maxX, minY, maxY);
      if (detectedBaseline !== null) {
        baselineY = detectedBaseline;
      } else {
        // Fall back to panel center
        baselineY = (minY + maxY) / 2;
      }
    }

    // Scan each column in the panel
    for (let x = minX; x < maxX; x++) {
      const result = this.traceColumn(x, minY, maxY);

      if (result.found && result.confidence >= this.config.minPointConfidence) {
        // End any current gap
        if (gapStart !== null) {
          gaps.push({ startX: gapStart, endX: x - 1 });
          gapStart = null;
        }

        xPixels.push(x);
        yPixels.push(result.y);
        confidence.push(result.confidence);
      } else {
        // Start or continue gap
        if (gapStart === null) {
          gapStart = x;
        }
      }
    }

    // Close final gap if exists
    if (gapStart !== null && xPixels.length > 0) {
      gaps.push({ startX: gapStart, endX: maxX - 1 });
    }

    // If no points found, return null
    if (xPixels.length === 0) {
      return null;
    }

    // Interpolate small gaps
    this.interpolateGaps(xPixels, yPixels, confidence, gaps);

    return {
      panelId: id,
      lead: lead as LeadName,
      xPixels,
      yPixels,
      confidence,
      baselineY,
      gaps: gaps.filter(g => g.endX - g.startX > this.config.maxInterpolateGap),
      method: 'column_scan',
    };
  }

  /**
   * Auto-detect baseline Y by analyzing the panel
   * The baseline is typically where the waveform spends most time (isoelectric line)
   */
  private detectBaselineY(minX: number, maxX: number, minY: number, maxY: number): number | null {
    // Sample columns across the panel
    const sampleCount = Math.min(50, maxX - minX);
    const step = Math.max(1, Math.floor((maxX - minX) / sampleCount));

    const yPositions: number[] = [];

    for (let x = minX; x < maxX; x += step) {
      const result = this.traceColumn(x, minY, maxY);
      if (result.found) {
        yPositions.push(result.y);
      }
    }

    if (yPositions.length < 5) {
      return null; // Not enough data
    }

    // The baseline is the median Y position (most common height)
    // ECG spends most time at baseline between beats
    yPositions.sort((a, b) => a - b);

    // Use the median as the baseline
    const median = yPositions[Math.floor(yPositions.length / 2)];

    // Validate: baseline should be roughly in the middle third of the panel
    const panelCenter = (minY + maxY) / 2;
    const panelHeight = maxY - minY;
    const deviation = Math.abs(median - panelCenter) / panelHeight;

    // If detected baseline is way off center, it might be wrong
    // In that case, fall back to panel center
    if (deviation > 0.4) {
      return panelCenter;
    }

    return median;
  }

  /**
   * Find waveform Y position at a single X column
   * Uses intensity-weighted centroid for sub-pixel accuracy
   */
  private traceColumn(
    x: number,
    yMin: number,
    yMax: number
  ): { found: boolean; y: number; confidence: number } {
    let sumY = 0;
    let sumWeight = 0;
    let maxDarkness = 0;

    for (let y = yMin; y < yMax; y++) {
      const idx = (y * this.width + x) * 4;
      const r = this.data[idx];
      const g = this.data[idx + 1];
      const b = this.data[idx + 2];

      // Calculate darkness or color match
      const darkness = this.calculateDarkness(r, g, b);

      // Threshold for waveform detection (accounting for anti-aliasing)
      if (darkness > this.config.darknessThreshold) {
        const weight = darkness / 255;
        sumY += y * weight;
        sumWeight += weight;
        maxDarkness = Math.max(maxDarkness, darkness);
      }
    }

    if (sumWeight > 0.5) {
      return {
        found: true,
        y: sumY / sumWeight,
        confidence: Math.min(1, maxDarkness / 200),
      };
    }

    return { found: false, y: 0, confidence: 0 };
  }

  /**
   * Calculate darkness value, optionally considering waveform color
   */
  private calculateDarkness(r: number, g: number, b: number): number {
    // If waveform color is specified and not black, use color distance
    const wc = this.config.waveformColor;
    if (wc && (wc.r !== 0 || wc.g !== 0 || wc.b !== 0)) {
      // Color distance (inverse - closer = higher)
      const dr = Math.abs(r - wc.r);
      const dg = Math.abs(g - wc.g);
      const db = Math.abs(b - wc.b);
      const distance = Math.sqrt(dr * dr + dg * dg + db * db);
      // Max distance is ~441 (0,0,0 to 255,255,255)
      return Math.max(0, 255 - distance * 0.6);
    }

    // Default: calculate darkness (0 = white, 255 = black)
    return 255 - (r + g + b) / 3;
  }

  /**
   * Interpolate small gaps in the trace
   */
  private interpolateGaps(
    xPixels: number[],
    yPixels: number[],
    confidence: number[],
    gaps: Array<{ startX: number; endX: number }>
  ): void {
    // Process gaps from end to start to avoid index shifting issues
    for (let i = gaps.length - 1; i >= 0; i--) {
      const gap = gaps[i];
      const gapSize = gap.endX - gap.startX;

      if (gapSize > this.config.maxInterpolateGap) continue;

      // Find surrounding points
      const leftIdx = this.findLastIndexBefore(xPixels, gap.startX);
      const rightIdx = this.findFirstIndexAfter(xPixels, gap.endX);

      if (leftIdx < 0 || rightIdx < 0 || rightIdx >= xPixels.length) continue;

      const leftX = xPixels[leftIdx];
      const leftY = yPixels[leftIdx];
      const rightX = xPixels[rightIdx];
      const rightY = yPixels[rightIdx];

      // Skip if points are too far apart
      if (rightX - leftX > this.config.maxInterpolateGap * 2) continue;

      // Interpolate points
      const interpolatedX: number[] = [];
      const interpolatedY: number[] = [];
      const interpolatedConf: number[] = [];

      for (let x = gap.startX; x <= gap.endX; x++) {
        const t = (x - leftX) / (rightX - leftX);
        const y = leftY + t * (rightY - leftY);

        interpolatedX.push(x);
        interpolatedY.push(y);
        interpolatedConf.push(0.5); // Lower confidence for interpolated
      }

      // Insert interpolated points
      const insertIdx = leftIdx + 1;
      xPixels.splice(insertIdx, 0, ...interpolatedX);
      yPixels.splice(insertIdx, 0, ...interpolatedY);
      confidence.splice(insertIdx, 0, ...interpolatedConf);

      // Remove this gap from the list since it's been filled
      gaps.splice(i, 1);
    }
  }

  /**
   * Find index of last element < value
   */
  private findLastIndexBefore(arr: number[], value: number): number {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] < value) return i;
    }
    return -1;
  }

  /**
   * Find index of first element > value
   */
  private findFirstIndexAfter(arr: number[], value: number): number {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] > value) return i;
    }
    return -1;
  }

  /**
   * Trace all panels and return raw traces
   */
  traceAllPanels(panels: PanelAnalysis[]): RawTrace[] {
    const traces: RawTrace[] = [];

    for (const panel of panels) {
      if (panel.lead === null) continue;

      const trace = this.tracePanel(panel);
      if (trace) {
        traces.push(trace);
      }
    }

    return traces;
  }

  /**
   * Detect waveform color in a panel (for colored waveforms)
   */
  detectWaveformColor(panel: PanelAnalysis): { r: number; g: number; b: number } | null {
    const { bounds } = panel;

    // Sample center region of panel
    const centerX = Math.floor(bounds.x + bounds.width / 2);
    const minY = Math.floor(bounds.y);
    const maxY = Math.floor(bounds.y + bounds.height);

    // Find darkest pixel in center column
    let darkest = { r: 255, g: 255, b: 255, darkness: 0 };

    for (let y = minY; y < maxY; y++) {
      const idx = (y * this.width + centerX) * 4;
      const r = this.data[idx];
      const g = this.data[idx + 1];
      const b = this.data[idx + 2];

      const darkness = 255 - (r + g + b) / 3;
      if (darkness > darkest.darkness) {
        darkest = { r, g, b, darkness };
      }
    }

    // Only return if significantly dark
    if (darkest.darkness > 100) {
      return { r: darkest.r, g: darkest.g, b: darkest.b };
    }

    return null;
  }

  /**
   * Trace panel using contour-following method
   * More accurate for thick lines and anti-aliased waveforms
   */
  tracePanelContour(panel: PanelAnalysis): RawTrace | null {
    const { bounds, lead, id } = panel;
    let { baselineY } = panel;

    if (!lead) return null;

    // Clamp bounds
    const minX = Math.max(0, Math.floor(bounds.x));
    const maxX = Math.min(this.width, Math.ceil(bounds.x + bounds.width));
    const minY = Math.max(0, Math.floor(bounds.y));
    const maxY = Math.min(this.height, Math.ceil(bounds.y + bounds.height));

    // Find starting point (leftmost waveform pixel)
    const startPoint = this.findContourStart(minX, maxX, minY, maxY);
    if (!startPoint) {
      // Fall back to column scanning
      return this.tracePanel(panel);
    }

    // Auto-detect baseline
    const detectedBaseline = this.detectBaselineY(minX, maxX, minY, maxY);
    if (detectedBaseline !== null) {
      baselineY = detectedBaseline;
    }

    // Trace contour from start point
    const { xPixels, yPixels, confidence } = this.followContour(
      startPoint.x,
      startPoint.y,
      minX,
      maxX,
      minY,
      maxY
    );

    if (xPixels.length < 10) {
      return this.tracePanel(panel);
    }

    // Apply artifact rejection
    const filtered = this.config.rejectArtifacts
      ? this.rejectArtifacts(xPixels, yPixels, confidence)
      : { xPixels, yPixels, confidence };

    // Apply smoothing
    const smoothed = this.config.smoothingWindow > 0
      ? this.smoothTrace(filtered.xPixels, filtered.yPixels, filtered.confidence)
      : filtered;

    // Detect gaps
    const gaps = this.detectGaps(smoothed.xPixels, minX, maxX);

    return {
      panelId: id,
      lead: lead as LeadName,
      xPixels: smoothed.xPixels,
      yPixels: smoothed.yPixels,
      confidence: smoothed.confidence,
      baselineY,
      gaps,
      method: 'contour_trace',
    };
  }

  /**
   * Find starting point for contour tracing
   */
  private findContourStart(
    minX: number,
    maxX: number,
    minY: number,
    maxY: number
  ): { x: number; y: number } | null {
    // Scan from left edge to find first waveform pixel
    for (let x = minX; x < Math.min(minX + 50, maxX); x++) {
      for (let y = minY; y < maxY; y++) {
        const darkness = this.getPixelDarkness(x, y);
        if (darkness > this.config.darknessThreshold) {
          return { x, y };
        }
      }
    }
    return null;
  }

  /**
   * Follow contour from starting point
   */
  private followContour(
    startX: number,
    _startY: number,
    _minX: number,
    maxX: number,
    minY: number,
    maxY: number
  ): { xPixels: number[]; yPixels: number[]; confidence: number[] } {
    const xPixels: number[] = [];
    const yPixels: number[] = [];
    const confidence: number[] = [];

    // Track visited positions for each column
    const columnYs = new Map<number, number>();

    let x = startX;

    while (x < maxX) {
      // Find waveform center at this column using weighted average
      const result = this.traceColumn(x, minY, maxY);

      if (result.found) {
        // Check if we already have a value for this column
        if (!columnYs.has(x)) {
          xPixels.push(x);
          yPixels.push(result.y);
          confidence.push(result.confidence);
          columnYs.set(x, result.y);
        }

      }

      x++;
    }

    return { xPixels, yPixels, confidence };
  }

  /**
   * Get pixel darkness value
   */
  private getPixelDarkness(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;

    const idx = (Math.floor(y) * this.width + Math.floor(x)) * 4;
    const r = this.data[idx];
    const g = this.data[idx + 1];
    const b = this.data[idx + 2];

    return this.calculateDarkness(r, g, b);
  }

  /**
   * Reject artifacts (sudden spikes that don't match ECG morphology)
   */
  private rejectArtifacts(
    xPixels: number[],
    yPixels: number[],
    confidence: number[]
  ): { xPixels: number[]; yPixels: number[]; confidence: number[] } {
    if (xPixels.length < 5) return { xPixels, yPixels, confidence };

    const newX: number[] = [];
    const newY: number[] = [];
    const newConf: number[] = [];

    // Calculate local derivatives
    for (let i = 0; i < xPixels.length; i++) {
      // Check for physiologically impossible jumps
      let isArtifact = false;

      if (i > 0 && i < xPixels.length - 1) {
        const prevY = yPixels[i - 1];
        const currY = yPixels[i];
        const nextY = yPixels[i + 1];

        // Large spike that returns to baseline = artifact
        const jumpIn = Math.abs(currY - prevY);
        const jumpOut = Math.abs(nextY - currY);
        const isSingleSpike = jumpIn > 30 && jumpOut > 30 && Math.sign(currY - prevY) !== Math.sign(nextY - currY);

        if (isSingleSpike) {
          isArtifact = true;
        }
      }

      if (!isArtifact) {
        newX.push(xPixels[i]);
        newY.push(yPixels[i]);
        newConf.push(confidence[i]);
      }
    }

    return { xPixels: newX, yPixels: newY, confidence: newConf };
  }

  /**
   * Smooth trace using moving average
   */
  private smoothTrace(
    xPixels: number[],
    yPixels: number[],
    confidence: number[]
  ): { xPixels: number[]; yPixels: number[]; confidence: number[] } {
    const window = this.config.smoothingWindow;
    if (window <= 0 || xPixels.length < window * 2 + 1) {
      return { xPixels, yPixels, confidence };
    }

    const smoothedY: number[] = [];
    const smoothedConf: number[] = [];

    for (let i = 0; i < yPixels.length; i++) {
      let sumY = 0;
      let sumConf = 0;
      let count = 0;

      for (let j = Math.max(0, i - window); j <= Math.min(yPixels.length - 1, i + window); j++) {
        sumY += yPixels[j];
        sumConf += confidence[j];
        count++;
      }

      smoothedY.push(sumY / count);
      smoothedConf.push(sumConf / count);
    }

    return { xPixels, yPixels: smoothedY, confidence: smoothedConf };
  }

  /**
   * Detect gaps in the trace
   */
  private detectGaps(
    xPixels: number[],
    minX: number,
    maxX: number
  ): Array<{ startX: number; endX: number }> {
    const gaps: Array<{ startX: number; endX: number }> = [];

    if (xPixels.length === 0) {
      return [{ startX: minX, endX: maxX }];
    }

    // Check for gap at start
    if (xPixels[0] > minX + 5) {
      gaps.push({ startX: minX, endX: xPixels[0] - 1 });
    }

    // Check for gaps in middle
    for (let i = 1; i < xPixels.length; i++) {
      const gapSize = xPixels[i] - xPixels[i - 1];
      if (gapSize > this.config.maxInterpolateGap) {
        gaps.push({ startX: xPixels[i - 1] + 1, endX: xPixels[i] - 1 });
      }
    }

    // Check for gap at end
    if (xPixels[xPixels.length - 1] < maxX - 5) {
      gaps.push({ startX: xPixels[xPixels.length - 1] + 1, endX: maxX });
    }

    return gaps;
  }

  /**
   * Enhanced tracing with multi-method approach
   * Tries contour first, falls back to column scan
   */
  traceAllPanelsEnhanced(panels: PanelAnalysis[]): RawTrace[] {
    const traces: RawTrace[] = [];

    for (const panel of panels) {
      if (panel.lead === null) continue;

      // Detect waveform color first
      const color = this.detectWaveformColor(panel);
      if (color) {
        this.config.waveformColor = color;
      }

      // Try contour tracing first if enabled
      let trace: RawTrace | null = null;
      if (this.config.useContourTracing) {
        trace = this.tracePanelContour(panel);
      }

      // Fall back to column scan
      if (!trace) {
        trace = this.tracePanel(panel);
      }

      if (trace) {
        traces.push(trace);
      }
    }

    return traces;
  }
}
