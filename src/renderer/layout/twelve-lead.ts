/**
 * 12-Lead ECG Layout Manager
 *
 * Manages the layout of a standard 12-lead ECG display.
 *
 * @module renderer/layout/twelve-lead
 */

import type { LeadName, ECGSignal, PaperSpeed, Gain } from '../../types';
import type { GridMetrics } from '../components/grid';
import { LEAD_LAYOUT_3X4 } from '../components/labels';

/**
 * Position and dimensions for a single lead panel
 */
export interface LeadPanel {
  /** Lead name */
  lead: LeadName;
  /** X position in pixels */
  x: number;
  /** Y position in pixels */
  y: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Baseline Y position (for 0mV) */
  baselineY: number;
  /** Start sample index in signal */
  startSample: number;
  /** End sample index in signal */
  endSample: number;
  /** Row index (0-based) */
  row: number;
  /** Column index (0-based) */
  col: number;
}

/**
 * Complete layout for 12-lead display
 */
export interface TwelveLeadLayout {
  /** Total width */
  width: number;
  /** Total height */
  height: number;
  /** Lead panels */
  leads: LeadPanel[];
  /** Rhythm strip panel */
  rhythmStrip: LeadPanel;
  /** Metrics used for layout */
  metrics: GridMetrics;
  /** Paper speed used */
  paperSpeed: PaperSpeed;
  /** Gain used */
  gain: Gain;
}

/**
 * Layout configuration options
 */
export interface LayoutOptions {
  /** Total width in pixels */
  width: number;
  /** Total height in pixels */
  height: number;
  /** Grid metrics */
  metrics: GridMetrics;
  /** Paper speed (mm/sec) */
  paperSpeed?: PaperSpeed;
  /** Gain (mm/mV) */
  gain?: Gain;
  /** Signal sample rate */
  sampleRate: number;
  /** Signal duration in seconds */
  duration: number;
  /** Margin from edges in pixels */
  margin?: number;
  /** Padding between leads in pixels */
  padding?: number;
  /** Height ratio for rhythm strip (0-1) */
  rhythmStripRatio?: number;
  /** Lead for rhythm strip */
  rhythmStripLead?: LeadName;
}

/**
 * Calculate 3x4 + rhythm strip layout
 */
export function calculate3x4Layout(options: LayoutOptions): TwelveLeadLayout {
  const {
    width,
    height,
    metrics,
    paperSpeed = 25,
    gain = 10,
    sampleRate,
    duration,
    margin = 10,
    padding = 5,
    rhythmStripRatio = 0.2,
    rhythmStripLead = 'II',
  } = options;

  // Calculate usable area
  const usableWidth = width - margin * 2;
  const usableHeight = height - margin * 2;

  // Rhythm strip takes bottom portion
  const rhythmStripHeight = usableHeight * rhythmStripRatio;
  const leadsAreaHeight = usableHeight - rhythmStripHeight - padding;

  // 3 rows, 4 columns
  const numRows = 3;
  const numCols = 4;

  const colWidth = (usableWidth - padding * (numCols - 1)) / numCols;
  const rowHeight = (leadsAreaHeight - padding * (numRows - 1)) / numRows;

  // Each column shows 2.5 seconds of data in standard 3x4 format
  const secondsPerColumn = 2.5;
  const samplesPerColumn = Math.floor(sampleRate * secondsPerColumn);

  const leads: LeadPanel[] = [];

  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const lead = LEAD_LAYOUT_3X4[row][col];
      const x = margin + col * (colWidth + padding);
      const y = margin + row * (rowHeight + padding);

      leads.push({
        lead,
        x,
        y,
        width: colWidth,
        height: rowHeight,
        baselineY: y + rowHeight / 2, // Center baseline
        startSample: col * samplesPerColumn,
        endSample: (col + 1) * samplesPerColumn,
        row,
        col,
      });
    }
  }

  // Rhythm strip at bottom (full width, full duration)
  const rhythmStrip: LeadPanel = {
    lead: rhythmStripLead,
    x: margin,
    y: margin + leadsAreaHeight + padding,
    width: usableWidth,
    height: rhythmStripHeight,
    baselineY: margin + leadsAreaHeight + padding + rhythmStripHeight / 2,
    startSample: 0,
    endSample: Math.floor(sampleRate * duration),
    row: 3,
    col: 0,
  };

  return {
    width,
    height,
    leads,
    rhythmStrip,
    metrics,
    paperSpeed,
    gain,
  };
}

/**
 * Extract samples for a lead panel from the full signal
 */
export function getSamplesForPanel(
  signal: ECGSignal,
  panel: LeadPanel
): number[] {
  const leadData = signal.leads[panel.lead];
  if (!leadData) {
    console.warn(`Lead ${panel.lead} not found in signal`);
    return [];
  }

  return leadData.slice(panel.startSample, panel.endSample);
}

/**
 * Calculate position for a lead label
 */
export function getLabelPosition(
  panel: LeadPanel,
  labelPadding: number = 5
): { x: number; y: number } {
  return {
    x: panel.x + labelPadding,
    y: panel.y + labelPadding,
  };
}
