/**
 * Multi-Page ECG Handler
 * Handle ECG documents with multiple pages/strips
 *
 * Supports:
 * - Multi-page PDF ECG reports
 * - Serial ECGs in one document
 * - Continuous rhythm strips across pages
 * - Multiple ECG recordings in one file
 *
 * @module signal/loader/png-digitizer/cv/multi-page-handler
 */

import type { LeadName, Bounds } from '../types';

/**
 * ECG segment from a page
 */
export interface ECGSegment {
  /** Segment ID */
  id: string;

  /** Page number (1-indexed) */
  pageNumber: number;

  /** Segment type */
  type: 'full_12lead' | 'rhythm_strip' | 'single_lead' | 'multi_lead' | 'partial';

  /** Bounds within the page */
  bounds: Bounds;

  /** Image data for this segment */
  imageData?: ImageData;

  /** Detected leads */
  leads: LeadName[];

  /** Time range (seconds from start) */
  timeRange: { start: number; end: number };

  /** Is this a continuation of previous segment */
  isContinuation: boolean;

  /** Previous segment ID if continuation */
  continuesFrom?: string;

  /** Recording timestamp if detected */
  timestamp?: Date;

  /** Confidence in segment detection */
  confidence: number;
}

/**
 * Page analysis result
 */
export interface PageAnalysis {
  /** Page number */
  pageNumber: number;

  /** Page dimensions */
  dimensions: { width: number; height: number };

  /** ECG segments found on this page */
  segments: ECGSegment[];

  /** Is this page an ECG page */
  isECGPage: boolean;

  /** Page type */
  pageType: 'primary_ecg' | 'rhythm_continuation' | 'serial_ecg' | 'mixed' | 'non_ecg';

  /** Text extracted from page */
  extractedText?: string;

  /** Metadata parsed from text */
  metadata?: {
    patientName?: string;
    patientId?: string;
    dateTime?: string;
    facility?: string;
  };

  /** Quality score */
  qualityScore: number;
}

/**
 * Multi-page document result
 */
export interface MultiPageResult {
  /** Total pages */
  totalPages: number;

  /** Total ECG segments */
  totalSegments: number;

  /** Page analyses */
  pages: PageAnalysis[];

  /** Segment groups (related segments) */
  segmentGroups: SegmentGroup[];

  /** Document type */
  documentType: 'single_ecg' | 'serial_ecgs' | 'continuous_recording' | 'mixed';

  /** Recommended processing order */
  processingOrder: string[];

  /** Issues detected */
  issues: string[];
}

/**
 * Group of related segments
 */
export interface SegmentGroup {
  /** Group ID */
  id: string;

  /** Group type */
  type: 'complete_12lead' | 'rhythm_sequence' | 'serial_recording';

  /** Segment IDs in this group */
  segmentIds: string[];

  /** Recording timestamp */
  timestamp?: Date;

  /** Total duration (seconds) */
  totalDuration: number;

  /** Leads covered by this group */
  coveredLeads: LeadName[];

  /** Is this a complete ECG */
  isComplete: boolean;
}

/**
 * Multi-page processing options
 */
export interface MultiPageOptions {
  /** Maximum pages to process */
  maxPages?: number;

  /** Detect and group serial ECGs */
  detectSerialECGs?: boolean;

  /** Detect rhythm strip continuations */
  detectContinuations?: boolean;

  /** Extract text from pages */
  extractText?: boolean;

  /** Minimum segment confidence */
  minConfidence?: number;
}

/**
 * Multi-Page ECG Handler
 */
export class MultiPageHandler {
  private options: Required<MultiPageOptions>;

  constructor(options: MultiPageOptions = {}) {
    this.options = {
      maxPages: options.maxPages ?? 20,
      detectSerialECGs: options.detectSerialECGs ?? true,
      detectContinuations: options.detectContinuations ?? true,
      extractText: options.extractText ?? true,
      minConfidence: options.minConfidence ?? 0.5,
    };
  }

  /**
   * Analyze multi-page document
   */
  analyzeDocument(pages: ImageData[]): MultiPageResult {
    const pageAnalyses: PageAnalysis[] = [];
    const allSegments: ECGSegment[] = [];
    const issues: string[] = [];

    // Analyze each page
    for (let i = 0; i < Math.min(pages.length, this.options.maxPages); i++) {
      const pageAnalysis = this.analyzePage(pages[i], i + 1);
      pageAnalyses.push(pageAnalysis);
      allSegments.push(...pageAnalysis.segments);
    }

    // Group related segments
    const segmentGroups = this.groupSegments(allSegments);

    // Determine document type
    const documentType = this.determineDocumentType(pageAnalyses, segmentGroups);

    // Determine processing order
    const processingOrder = this.determineProcessingOrder(segmentGroups);

    // Check for issues
    if (allSegments.length === 0) {
      issues.push('No ECG segments detected in document');
    }

    const completeGroups = segmentGroups.filter(g => g.isComplete);
    if (completeGroups.length === 0 && allSegments.length > 0) {
      issues.push('No complete 12-lead ECG found');
    }

    return {
      totalPages: pages.length,
      totalSegments: allSegments.length,
      pages: pageAnalyses,
      segmentGroups,
      documentType,
      processingOrder,
      issues,
    };
  }

  /**
   * Analyze single page
   */
  private analyzePage(imageData: ImageData, pageNumber: number): PageAnalysis {
    const segments: ECGSegment[] = [];
    const { width, height } = imageData;

    // Detect ECG regions on page
    const ecgRegions = this.detectECGRegions(imageData);

    // Create segments for each region
    for (let i = 0; i < ecgRegions.length; i++) {
      const region = ecgRegions[i];
      const segment = this.createSegment(imageData, region, pageNumber, i);
      if (segment.confidence >= this.options.minConfidence) {
        segments.push(segment);
      }
    }

    // Determine page type
    const pageType = this.determinePageType(segments);
    const isECGPage = segments.length > 0;

    // Calculate quality score
    const qualityScore = this.calculatePageQuality(imageData, segments);

    return {
      pageNumber,
      dimensions: { width, height },
      segments,
      isECGPage,
      pageType,
      qualityScore,
    };
  }

  /**
   * Detect ECG regions on page
   */
  private detectECGRegions(imageData: ImageData): Bounds[] {
    const { width, height, data: _data } = imageData;
    const regions: Bounds[] = [];

    // Scan for grid pattern regions
    const gridMap = this.createGridMap(imageData);

    // Find contiguous grid regions
    const visited = new Set<string>();
    const minRegionSize = width * height * 0.05; // At least 5% of page

    for (let y = 0; y < height; y += 10) {
      for (let x = 0; x < width; x += 10) {
        if (gridMap[y * width + x] && !visited.has(`${x},${y}`)) {
          const region = this.floodFillRegion(gridMap, width, height, x, y, visited);
          if (region.area >= minRegionSize) {
            regions.push({
              x: region.minX,
              y: region.minY,
              width: region.maxX - region.minX,
              height: region.maxY - region.minY,
            });
          }
        }
      }
    }

    // Merge overlapping regions
    return this.mergeOverlappingRegions(regions);
  }

  /**
   * Create grid presence map
   */
  private createGridMap(imageData: ImageData): boolean[] {
    const { width, height, data } = imageData;
    const map = new Array(width * height).fill(false);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Check for grid colors (pink, red, blue)
        const isPink = r > 200 && g > 150 && g < 220 && b > 150 && b < 220;
        const isRed = r > 150 && g < 100 && b < 100;
        const isBlue = b > 180 && r < 180;

        map[y * width + x] = isPink || isRed || isBlue;
      }
    }

    return map;
  }

  /**
   * Flood fill to find contiguous region
   */
  private floodFillRegion(
    map: boolean[],
    width: number,
    height: number,
    startX: number,
    startY: number,
    visited: Set<string>
  ): { minX: number; minY: number; maxX: number; maxY: number; area: number } {
    const result = {
      minX: startX,
      minY: startY,
      maxX: startX,
      maxY: startY,
      area: 0,
    };

    const stack = [[startX, startY]];

    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      const key = `${x},${y}`;

      if (visited.has(key)) continue;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      if (!map[y * width + x]) continue;

      visited.add(key);
      result.area++;
      result.minX = Math.min(result.minX, x);
      result.minY = Math.min(result.minY, y);
      result.maxX = Math.max(result.maxX, x);
      result.maxY = Math.max(result.maxY, y);

      // Add neighbors (using larger step for efficiency)
      const step = 5;
      stack.push([x + step, y], [x - step, y], [x, y + step], [x, y - step]);
    }

    return result;
  }

  /**
   * Merge overlapping regions
   */
  private mergeOverlappingRegions(regions: Bounds[]): Bounds[] {
    if (regions.length <= 1) return regions;

    const merged: Bounds[] = [];
    const used = new Set<number>();

    for (let i = 0; i < regions.length; i++) {
      if (used.has(i)) continue;

      let current = { ...regions[i] };
      used.add(i);

      let changed = true;
      while (changed) {
        changed = false;
        for (let j = 0; j < regions.length; j++) {
          if (used.has(j)) continue;

          if (this.regionsOverlap(current, regions[j])) {
            current = this.mergeRegions(current, regions[j]);
            used.add(j);
            changed = true;
          }
        }
      }

      merged.push(current);
    }

    return merged;
  }

  /**
   * Check if regions overlap
   */
  private regionsOverlap(a: Bounds, b: Bounds): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    );
  }

  /**
   * Merge two regions
   */
  private mergeRegions(a: Bounds, b: Bounds): Bounds {
    const minX = Math.min(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxX = Math.max(a.x + a.width, b.x + b.width);
    const maxY = Math.max(a.y + a.height, b.y + b.height);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Create segment from region
   */
  private createSegment(
    imageData: ImageData,
    bounds: Bounds,
    pageNumber: number,
    index: number
  ): ECGSegment {
    // Analyze region to determine segment type
    const aspectRatio = bounds.width / bounds.height;

    let type: ECGSegment['type'] = 'partial';
    let leads: LeadName[] = [];

    // Classify based on aspect ratio and size
    if (aspectRatio > 2.5) {
      type = 'rhythm_strip';
      leads = ['II']; // Assume Lead II for rhythm strips
    } else if (aspectRatio > 1.2 && aspectRatio < 2.5) {
      type = 'full_12lead';
      leads = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
    } else if (aspectRatio > 0.8) {
      type = 'multi_lead';
      leads = ['I', 'II', 'III']; // Partial leads
    } else {
      type = 'single_lead';
      leads = ['II'];
    }

    // Calculate time range (rough estimate based on typical ECG speeds)
    const pxPerMm = 10; // Estimate
    const mmPerSec = 25; // Standard speed
    const durationSec = bounds.width / (pxPerMm * mmPerSec);

    // Calculate confidence based on region quality
    const confidence = this.calculateRegionConfidence(imageData, bounds);

    return {
      id: `seg_p${pageNumber}_${index}`,
      pageNumber,
      type,
      bounds,
      leads,
      timeRange: { start: 0, end: durationSec },
      isContinuation: false,
      confidence,
    };
  }

  /**
   * Calculate region confidence
   */
  private calculateRegionConfidence(imageData: ImageData, bounds: Bounds): number {
    const { data, width } = imageData;
    let gridPixels = 0;
    let waveformPixels = 0;
    let totalPixels = 0;

    const step = 5;
    for (let y = bounds.y; y < bounds.y + bounds.height; y += step) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += step) {
        if (x < 0 || x >= width || y < 0) continue;

        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        totalPixels++;

        // Grid colors
        if ((r > 200 && g > 150 && b > 150) || (r > 150 && g < 100 && b < 100)) {
          gridPixels++;
        }

        // Waveform (dark lines)
        if (r < 80 && g < 80 && b < 80) {
          waveformPixels++;
        }
      }
    }

    const gridRatio = gridPixels / totalPixels;
    const waveformRatio = waveformPixels / totalPixels;

    // Good ECG has moderate grid and some waveform
    let confidence = 0;
    if (gridRatio > 0.02 && gridRatio < 0.25) confidence += 0.4;
    if (waveformRatio > 0.005 && waveformRatio < 0.15) confidence += 0.4;
    if (totalPixels > 1000) confidence += 0.2;

    return Math.min(1, confidence);
  }

  /**
   * Determine page type
   */
  private determinePageType(segments: ECGSegment[]): PageAnalysis['pageType'] {
    if (segments.length === 0) return 'non_ecg';

    const has12Lead = segments.some(s => s.type === 'full_12lead');
    const hasRhythm = segments.some(s => s.type === 'rhythm_strip');
    const hasContinuation = segments.some(s => s.isContinuation);

    if (has12Lead && !hasRhythm) return 'primary_ecg';
    if (hasContinuation) return 'rhythm_continuation';
    if (has12Lead && hasRhythm) return 'primary_ecg';
    if (segments.length > 1) return 'mixed';

    return 'primary_ecg';
  }

  /**
   * Calculate page quality
   */
  private calculatePageQuality(imageData: ImageData, segments: ECGSegment[]): number {
    if (segments.length === 0) return 0;

    const avgConfidence = segments.reduce((s, seg) => s + seg.confidence, 0) / segments.length;
    const coverageRatio = segments.reduce((s, seg) =>
      s + (seg.bounds.width * seg.bounds.height), 0) / (imageData.width * imageData.height);

    return (avgConfidence * 0.7 + Math.min(1, coverageRatio * 2) * 0.3);
  }

  /**
   * Group related segments
   */
  private groupSegments(segments: ECGSegment[]): SegmentGroup[] {
    const groups: SegmentGroup[] = [];

    // Group by page first
    const byPage = new Map<number, ECGSegment[]>();
    for (const segment of segments) {
      const existing = byPage.get(segment.pageNumber) || [];
      existing.push(segment);
      byPage.set(segment.pageNumber, existing);
    }

    // Create groups from page segments
    let groupIndex = 0;
    for (const [_pageNum, pageSegments] of byPage) {
      // Check for complete 12-lead
      const fullLead = pageSegments.find(s => s.type === 'full_12lead');
      if (fullLead) {
        groups.push({
          id: `grp_${groupIndex++}`,
          type: 'complete_12lead',
          segmentIds: [fullLead.id],
          totalDuration: fullLead.timeRange.end - fullLead.timeRange.start,
          coveredLeads: fullLead.leads,
          isComplete: true,
        });
      }

      // Group rhythm strips
      const rhythmStrips = pageSegments.filter(s => s.type === 'rhythm_strip');
      if (rhythmStrips.length > 0) {
        const totalDuration = rhythmStrips.reduce((s, seg) =>
          s + (seg.timeRange.end - seg.timeRange.start), 0);
        const allLeads = [...new Set(rhythmStrips.flatMap(s => s.leads))] as LeadName[];

        groups.push({
          id: `grp_${groupIndex++}`,
          type: 'rhythm_sequence',
          segmentIds: rhythmStrips.map(s => s.id),
          totalDuration,
          coveredLeads: allLeads,
          isComplete: false,
        });
      }
    }

    // Detect continuations across pages if enabled
    if (this.options.detectContinuations) {
      this.detectContinuations(segments, groups);
    }

    return groups;
  }

  /**
   * Detect rhythm strip continuations
   */
  private detectContinuations(segments: ECGSegment[], _groups: SegmentGroup[]): void {
    // Sort rhythm strips by page
    const rhythmStrips = segments
      .filter(s => s.type === 'rhythm_strip')
      .sort((a, b) => a.pageNumber - b.pageNumber);

    for (let i = 1; i < rhythmStrips.length; i++) {
      const prev = rhythmStrips[i - 1];
      const curr = rhythmStrips[i];

      // Check if on consecutive pages and same leads
      if (curr.pageNumber === prev.pageNumber + 1 &&
          curr.leads.some(l => prev.leads.includes(l))) {
        curr.isContinuation = true;
        curr.continuesFrom = prev.id;

        // Update time range
        curr.timeRange.start = prev.timeRange.end;
        curr.timeRange.end = curr.timeRange.start + (curr.timeRange.end - 0);
      }
    }
  }

  /**
   * Determine document type
   */
  private determineDocumentType(
    pages: PageAnalysis[],
    groups: SegmentGroup[]
  ): MultiPageResult['documentType'] {
    const complete12LeadCount = groups.filter(g => g.type === 'complete_12lead').length;
    const hasRhythmSeq = groups.some(g => g.type === 'rhythm_sequence');
    const hasContinuations = groups.some(g =>
      g.segmentIds.some(id => {
        // Find segment and check if it's a continuation
        for (const page of pages) {
          const seg = page.segments.find(s => s.id === id);
          if (seg?.isContinuation) return true;
        }
        return false;
      })
    );

    if (hasContinuations) return 'continuous_recording';
    if (complete12LeadCount > 1) return 'serial_ecgs';
    if (complete12LeadCount === 1 && !hasRhythmSeq) return 'single_ecg';
    return 'mixed';
  }

  /**
   * Determine optimal processing order
   */
  private determineProcessingOrder(groups: SegmentGroup[]): string[] {
    // Prioritize complete 12-leads, then rhythm sequences
    const sorted = [...groups].sort((a, b) => {
      if (a.type === 'complete_12lead' && b.type !== 'complete_12lead') return -1;
      if (b.type === 'complete_12lead' && a.type !== 'complete_12lead') return 1;
      return 0;
    });

    return sorted.map(g => g.id);
  }
}

/**
 * Convenience function to analyze multi-page document
 */
export function analyzeMultiPageDocument(
  pages: ImageData[],
  options?: MultiPageOptions
): MultiPageResult {
  const handler = new MultiPageHandler(options);
  return handler.analyzeDocument(pages);
}

/**
 * Extract best ECG from multi-page document
 */
export function extractBestECG(pages: ImageData[]): {
  segment: ECGSegment | null;
  pageIndex: number;
} {
  const result = analyzeMultiPageDocument(pages);

  // Find highest quality complete 12-lead
  let bestSegment: ECGSegment | null = null;
  let bestPageIndex = -1;
  let bestScore = 0;

  for (const page of result.pages) {
    for (const segment of page.segments) {
      if (segment.type === 'full_12lead' && segment.confidence > bestScore) {
        bestSegment = segment;
        bestPageIndex = page.pageNumber - 1;
        bestScore = segment.confidence;
      }
    }
  }

  return { segment: bestSegment, pageIndex: bestPageIndex };
}
