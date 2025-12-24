/**
 * MUSE-format ECG Layout Calculator
 *
 * Calculates pixel-perfect layout matching GE MUSE output.
 * All measurements defined in physical units (mm/inches),
 * converted to pixels at render time based on target DPI.
 *
 * @module renderer/layout/muse-layout
 */

import type { LeadName } from '../../types';
import {
  MUSE_SPEC,
  pixelsPerMm,
  pixelsPerSecond,
  getPageDimensions,
  getMargins,
  getSectionHeights,
} from '../../config/muse-spec';

/**
 * A single lead panel in the ECG layout
 */
export interface MuseLeadPanel {
  /** Lead name (e.g., 'I', 'V1', 'aVR') */
  lead: LeadName | string;
  /** X position in pixels */
  x: number;
  /** Y position in pixels */
  y: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Baseline Y position (the 0mV line) in pixels */
  baselineY: number;
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Row index */
  row: number;
  /** Column index */
  col: number;
  /** Whether this is a rhythm strip */
  isRhythmStrip: boolean;
}

/**
 * A separator line in the ECG layout
 */
export interface MuseSeparatorLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Complete MUSE layout specification
 */
export interface MuseLayout {
  /** Canvas width in pixels */
  width: number;
  /** Canvas height in pixels */
  height: number;
  /** Rendering DPI */
  dpi: number;

  /** Grid area (where ECG traces are drawn) */
  gridArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /** Header area (patient info, measurements) */
  headerArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /** Interpretation area */
  interpretationArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /** Main lead panels (3×4 or 3×5 grid) */
  leadPanels: MuseLeadPanel[];

  /** Rhythm strip panels */
  rhythmPanels: MuseLeadPanel[];

  /** Separator lines */
  separators: MuseSeparatorLine[];

  /** Pixels per mm for this layout */
  pxPerMm: number;

  /** Pixels per second for this layout */
  pxPerSecond: number;
}

/**
 * Layout calculation options
 */
export interface MuseLayoutOptions {
  /** ECG format: '12-lead' or '15-lead' */
  format: '12-lead' | '15-lead';
  /** Target DPI (default: from MUSE_SPEC) */
  dpi?: number;
  /** Paper speed in mm/s (default: 25) */
  paperSpeed?: number;
  /** Gain in mm/mV (default: 10) */
  gain?: number;
}

/**
 * Calculate complete MUSE-format layout
 *
 * @param options Layout options
 * @returns Complete layout specification with all measurements in pixels
 */
export function calculateMuseLayout(options: MuseLayoutOptions): MuseLayout {
  const {
    format = '15-lead',
    dpi = MUSE_SPEC.targetDpi,
    paperSpeed = MUSE_SPEC.defaultPaperSpeed,
  } = options;

  const spec = MUSE_SPEC;
  const pxPerMm = pixelsPerMm(dpi);
  const pxPerSec = pixelsPerSecond(dpi, paperSpeed);

  // Page dimensions in pixels
  const { width, height } = getPageDimensions(spec, dpi);
  const margins = getMargins(spec, dpi);
  const sections = getSectionHeights(spec, dpi);

  // Content area (inside margins)
  const contentX = margins.left;
  const contentY = margins.top;
  const contentWidth = width - margins.left - margins.right;
  const contentHeight = height - margins.top - margins.bottom;

  // Header area at top
  const headerArea = {
    x: contentX,
    y: contentY,
    width: contentWidth,
    height: sections.header,
  };

  // Interpretation area below header
  const interpretationArea = {
    x: contentX,
    y: contentY + sections.header,
    width: contentWidth,
    height: sections.interpretation,
  };

  // Grid area for ECG traces
  const gridY = contentY + sections.header + sections.interpretation;
  const gridHeight = contentHeight - sections.header - sections.interpretation - sections.footer;
  const gridArea = {
    x: contentX,
    y: gridY,
    width: contentWidth,
    height: gridHeight,
  };

  // Get format-specific layout config
  const layoutConfig = spec.layout.leadGrid[format];
  const rhythmConfig = spec.layout.rhythmStrips;

  const { columns, rows, leads, secondsPerColumn, rowHeightMm } = layoutConfig;

  // Calculate pixel dimensions
  const rowHeightPx = rowHeightMm * pxPerMm;
  const rhythmHeightPx = rhythmConfig.heightMm * pxPerMm;
  const colWidthPx = gridArea.width / columns;

  // Main lead panels (3×4 or 3×5 grid)
  const leadPanels: MuseLeadPanel[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const lead = leads[row][col];
      const x = gridArea.x + col * colWidthPx;
      const y = gridArea.y + row * rowHeightPx;

      leadPanels.push({
        lead,
        x,
        y,
        width: colWidthPx,
        height: rowHeightPx,
        baselineY: y + rowHeightPx / 2, // Center baseline
        startTime: 0, // All columns synchronized - same time window
        endTime: secondsPerColumn,
        row,
        col,
        isRhythmStrip: false,
      });
    }
  }

  // Rhythm strip panels
  const rhythmPanels: MuseLeadPanel[] = [];
  const rhythmStartY = gridArea.y + rows * rowHeightPx;

  for (let i = 0; i < rhythmConfig.count; i++) {
    const lead = rhythmConfig.leads[i];
    const y = rhythmStartY + i * rhythmHeightPx;

    rhythmPanels.push({
      lead,
      x: gridArea.x,
      y,
      width: gridArea.width,
      height: rhythmHeightPx,
      baselineY: y + rhythmHeightPx / 2,
      startTime: 0,
      endTime: rhythmConfig.durationSeconds,
      row: rows + i,
      col: 0,
      isRhythmStrip: true,
    });
  }

  // Separator lines
  const separators: MuseSeparatorLine[] = [];

  // Vertical separators between columns (main grid only)
  for (let col = 1; col < columns; col++) {
    const x = gridArea.x + col * colWidthPx;
    separators.push({
      x1: x,
      y1: gridArea.y,
      x2: x,
      y2: gridArea.y + rows * rowHeightPx,
    });
  }

  // Horizontal separator above rhythm strips
  separators.push({
    x1: gridArea.x,
    y1: rhythmStartY,
    x2: gridArea.x + gridArea.width,
    y2: rhythmStartY,
  });

  return {
    width,
    height,
    dpi,
    gridArea,
    headerArea,
    interpretationArea,
    leadPanels,
    rhythmPanels,
    separators,
    pxPerMm,
    pxPerSecond: pxPerSec,
  };
}

/**
 * Calculate layout for screen display
 * Uses device pixel ratio for crisp rendering on high-DPI displays
 */
export function calculateScreenLayout(options: Omit<MuseLayoutOptions, 'dpi'>): MuseLayout {
  const dpi = 96 * (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  return calculateMuseLayout({ ...options, dpi });
}

/**
 * Calculate layout for PNG export
 * Uses 300 DPI for high-quality print output
 */
export function calculateExportLayout(options: Omit<MuseLayoutOptions, 'dpi'>): MuseLayout {
  return calculateMuseLayout({ ...options, dpi: 300 });
}
