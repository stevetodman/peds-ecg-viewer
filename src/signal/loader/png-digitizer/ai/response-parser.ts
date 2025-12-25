/**
 * AI Response Parser
 * Parse and normalize AI responses into typed objects
 *
 * @module signal/loader/png-digitizer/ai/response-parser
 */

import type {
  ECGImageAnalysis,
  GridAnalysis,
  LayoutAnalysis,
  CalibrationAnalysis,
  PanelAnalysis,
  ImageQualityAssessment,
  ImageIssue,
  Bounds,
  Point,
} from '../types';
import type { LeadName } from '../../../../types';

/**
 * Valid lead names
 */
const VALID_LEADS: LeadName[] = [
  'I', 'II', 'III', 'aVR', 'aVL', 'aVF',
  'V1', 'V2', 'V3', 'V4', 'V5', 'V6',
  'V3R', 'V4R', 'V7',
];

/**
 * Standard 3x4 lead layout mapping (12-lead)
 * Row 0: I, aVR, V1, V4
 * Row 1: II, aVL, V2, V5
 * Row 2: III, aVF, V3, V6
 */
const STANDARD_3x4_LAYOUT: LeadName[][] = [
  ['I', 'aVR', 'V1', 'V4'],
  ['II', 'aVL', 'V2', 'V5'],
  ['III', 'aVF', 'V3', 'V6'],
];

/**
 * Pediatric 3x5 lead layout mapping (15-lead)
 * Row 0: I, aVR, V1, V4, V3R
 * Row 1: II, aVL, V2, V5, V4R
 * Row 2: III, aVF, V3, V6, V7
 */
const PEDIATRIC_3x5_LAYOUT: LeadName[][] = [
  ['I', 'aVR', 'V1', 'V4', 'V3R'],
  ['II', 'aVL', 'V2', 'V5', 'V4R'],
  ['III', 'aVF', 'V3', 'V6', 'V7'],
];

/**
 * Parse AI response text into ECGImageAnalysis
 */
export function parseAIResponse(responseText: string): ECGImageAnalysis {
  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = responseText.trim();

  // Remove markdown code blocks if present
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Try to find JSON object in the response
  const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    jsonStr = jsonObjectMatch[0];
  }

  // Parse JSON
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse AI response as JSON: ${e}`);
  }

  // Parse components
  const layout = parseLayoutAnalysis(parsed.layout);
  let panels = parsePanels(parsed.panels);

  // Post-process: Clamp panel bounds to image dimensions
  if (layout.imageWidth > 0 && layout.imageHeight > 0) {
    panels = clampPanelBounds(panels, layout.imageWidth, layout.imageHeight);
  }

  // Post-process: Fill in missing leads based on position for 12-lead and 15-lead layouts
  if (layout.rows === 3) {
    if (layout.columns === 4 || layout.format === '12-lead') {
      panels = fillMissingLeads(panels, '12-lead');
    } else if (layout.columns === 5 || layout.format === '15-lead') {
      panels = fillMissingLeads(panels, '15-lead');
    }
  }

  // Validate and transform
  return {
    grid: parseGridAnalysis(parsed.grid),
    layout,
    calibration: parseCalibrationAnalysis(parsed.calibration),
    panels,
    imageQuality: parseImageQuality(parsed.imageQuality),
    notes: parseNotes(parsed.notes),
  };
}

/**
 * Clamp panel bounds to fit within image dimensions
 * If AI returned bounds outside the image, redistribute panels evenly
 */
function clampPanelBounds(panels: PanelAnalysis[], imageWidth: number, imageHeight: number): PanelAnalysis[] {
  if (panels.length === 0) return panels;

  // Check if any panels are outside the image
  const outOfBounds = panels.some(p =>
    p.bounds.x < 0 ||
    p.bounds.y < 0 ||
    p.bounds.x + p.bounds.width > imageWidth + 10 ||
    p.bounds.y + p.bounds.height > imageHeight + 10
  );

  if (!outOfBounds) {
    // All bounds are within image, just ensure baselineY is valid
    return panels.map(p => {
      const clampedBaselineY = Math.max(p.bounds.y, Math.min(p.baselineY, p.bounds.y + p.bounds.height));
      return { ...p, baselineY: clampedBaselineY };
    });
  }

  // Panels are out of bounds - need to recalculate based on grid structure

  // Determine grid structure from panels
  const rows = new Set(panels.map(p => p.row));
  const cols = new Set(panels.map(p => p.col));
  const numRows = Math.max(...rows) + 1;
  const numCols = Math.max(...cols) + 1;

  // Calculate even distribution with margins
  const marginX = imageWidth * 0.03;
  const marginY = imageHeight * 0.05;
  const panelWidth = (imageWidth - marginX * 2) / numCols;
  const panelHeight = (imageHeight - marginY * 2) / numRows;

  return panels.map(p => {
    // Calculate new bounds based on row/col position
    const newX = marginX + p.col * panelWidth;
    const newY = marginY + p.row * panelHeight;
    const newBounds = {
      x: Math.round(newX),
      y: Math.round(newY),
      width: Math.round(panelWidth * 0.95), // Slight gap between panels
      height: Math.round(panelHeight * 0.90),
    };

    // Baseline at vertical center of panel
    const newBaselineY = Math.round(newY + panelHeight / 2);

    return {
      ...p,
      bounds: newBounds,
      baselineY: newBaselineY,
    };
  });
}

/**
 * Fill in missing leads based on standard position inference
 * This ensures all leads are identified even if AI misses some labels
 * Supports both 12-lead (3x4) and 15-lead pediatric (3x5) formats
 */
function fillMissingLeads(panels: PanelAnalysis[], format: '12-lead' | '15-lead'): PanelAnalysis[] {
  if (panels.length === 0) return panels;

  // Select the appropriate layout based on format
  const layoutMap = format === '15-lead' ? PEDIATRIC_3x5_LAYOUT : STANDARD_3x4_LAYOUT;

  // First, recalculate row/col from actual bounds to fix any AI errors
  const panelsWithCorrectedPositions = recalculateGridPositions(panels);

  // Get already identified leads
  const identifiedLeads = new Set(panelsWithCorrectedPositions.filter(p => p.lead !== null).map(p => p.lead));

  // Find standard leads that are missing
  const allStandardLeads = layoutMap.flat();
  const missingLeads = allStandardLeads.filter(l => !identifiedLeads.has(l));

  if (missingLeads.length === 0) {
    return panelsWithCorrectedPositions; // All leads already identified
  }

  // Create a map of (row, col) -> expected lead
  const positionToLead = new Map<string, LeadName>();
  const numCols = layoutMap[0].length;
  for (let row = 0; row < layoutMap.length; row++) {
    for (let col = 0; col < numCols; col++) {
      positionToLead.set(`${row},${col}`, layoutMap[row][col]);
    }
  }

  // Find panels without leads and assign based on position
  const updatedPanels = panelsWithCorrectedPositions.map(panel => {
    if (panel.lead !== null) {
      return panel; // Already has a lead
    }

    // Check if this position should have a missing lead
    const posKey = `${panel.row},${panel.col}`;
    const expectedLead = positionToLead.get(posKey);

    if (expectedLead && missingLeads.includes(expectedLead)) {
      // Assign the missing lead based on position
      return {
        ...panel,
        lead: expectedLead,
        leadSource: 'position_inferred' as const,
        labelConfidence: 0.7, // Lower confidence for inferred leads
      };
    }

    return panel;
  });

  // Check if we still have missing leads (panels exist but weren't assigned)
  const stillMissing = missingLeads.filter(l => !updatedPanels.some(p => p.lead === l));
  const expectedPanelCount = format === '15-lead' ? 15 : 12;

  if (stillMissing.length > 0 && updatedPanels.length >= expectedPanelCount) {
    // Try to assign remaining missing leads to unlabeled panels by position matching
    for (const panel of updatedPanels) {
      if (panel.lead === null && stillMissing.length > 0) {
        const posKey = `${panel.row},${panel.col}`;
        const expectedLead = positionToLead.get(posKey);

        if (expectedLead && stillMissing.includes(expectedLead)) {
          panel.lead = expectedLead;
          panel.leadSource = 'position_inferred';
          panel.labelConfidence = 0.6;
          stillMissing.splice(stillMissing.indexOf(expectedLead), 1);
        }
      }
    }
  }

  return updatedPanels;
}

/**
 * Recalculate row/col positions from actual pixel bounds
 * This fixes any incorrect row/col assignments from the AI
 */
function recalculateGridPositions(panels: PanelAnalysis[]): PanelAnalysis[] {
  if (panels.length < 4) return panels;

  // Filter out rhythm strips for threshold calculation (they're much wider)
  const regularPanels = panels.filter(p => !p.isRhythmStrip);
  // Also filter out panels that are > 2x the median width (likely rhythm strips not flagged)
  const widths = regularPanels.map(p => p.bounds.width).sort((a, b) => a - b);
  const medianWidth = widths[Math.floor(widths.length / 2)] || 100;
  const nonRhythmPanels = regularPanels.filter(p => p.bounds.width < medianWidth * 2);
  const panelsForThreshold = nonRhythmPanels.length > 0 ? nonRhythmPanels : regularPanels;

  // Get unique Y centers and X centers
  const yCenters = panels.map(p => p.bounds.y + p.bounds.height / 2);
  const xCenters = panels.map(p => p.bounds.x + p.bounds.width / 2);

  // Cluster Y centers into rows (using simple threshold-based clustering)
  const rowThreshold = Math.max(...panelsForThreshold.map(p => p.bounds.height)) * 0.5;
  const uniqueRows = clusterValues(yCenters, rowThreshold);

  // Cluster X centers into columns - use regular panel widths, not rhythm strips
  const colThreshold = Math.max(...panelsForThreshold.map(p => p.bounds.width)) * 0.5;
  const uniqueCols = clusterValues(xCenters, colThreshold);

  // Assign row/col to each panel based on which cluster it falls into
  return panels.map(panel => {
    const yCenter = panel.bounds.y + panel.bounds.height / 2;
    const xCenter = panel.bounds.x + panel.bounds.width / 2;

    // Find closest row
    let row = 0;
    let minRowDist = Infinity;
    uniqueRows.forEach((rowY, idx) => {
      const dist = Math.abs(yCenter - rowY);
      if (dist < minRowDist) {
        minRowDist = dist;
        row = idx;
      }
    });

    // Find closest column
    let col = 0;
    let minColDist = Infinity;
    uniqueCols.forEach((colX, idx) => {
      const dist = Math.abs(xCenter - colX);
      if (dist < minColDist) {
        minColDist = dist;
        col = idx;
      }
    });

    return {
      ...panel,
      row,
      col,
    };
  });
}

/**
 * Cluster values into groups based on proximity threshold
 * Returns sorted unique cluster centers
 */
function clusterValues(values: number[], threshold: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const clusters: number[] = [];

  for (const val of sorted) {
    // Check if value belongs to existing cluster
    const existingCluster = clusters.find(c => Math.abs(c - val) < threshold);
    if (!existingCluster) {
      clusters.push(val);
    }
  }

  // Return cluster centers sorted
  return clusters.sort((a, b) => a - b);
}

/**
 * Parse grid analysis
 */
function parseGridAnalysis(grid: unknown): GridAnalysis {
  const g = grid as Record<string, unknown> | undefined;

  return {
    detected: Boolean(g?.detected ?? false),
    type: parseGridType(g?.type),
    backgroundColor: parseString(g?.backgroundColor),
    thinLineColor: parseString(g?.thinLineColor),
    thickLineColor: parseString(g?.thickLineColor),
    waveformColor: parseString(g?.waveformColor),
    largeBoxesPerPanel: parseNumber(g?.largeBoxesPerPanel),
    qrsCountPerPanel: parseNumber(g?.qrsCountPerPanel),
    visualHeartRateEstimate: parseString(g?.visualHeartRateEstimate),
    estimatedDpi: parseNumber(g?.estimatedDpi),
    pxPerMm: parseNumber(g?.pxPerMm),
    smallBoxPx: parseNumber(g?.smallBoxPx),
    largeBoxPx: parseNumber(g?.largeBoxPx),
    rotation: parseNumber(g?.rotation) ?? 0,
    confidence: parseConfidence(g?.confidence),
  };
}

/**
 * Parse layout analysis
 */
function parseLayoutAnalysis(layout: unknown): LayoutAnalysis {
  const l = layout as Record<string, unknown> | undefined;

  return {
    format: parseLayoutFormat(l?.format),
    columns: parseNumber(l?.columns) ?? 4,
    rows: parseNumber(l?.rows) ?? 3,
    hasRhythmStrips: Boolean(l?.hasRhythmStrips ?? false),
    rhythmStripCount: parseNumber(l?.rhythmStripCount),
    estimatedDuration: parseNumber(l?.estimatedDuration),
    imageWidth: parseNumber(l?.imageWidth) ?? 0,
    imageHeight: parseNumber(l?.imageHeight) ?? 0,
    gridBounds: parseBounds(l?.gridBounds),
    confidence: parseConfidence(l?.confidence),
  };
}

/**
 * Parse calibration analysis
 */
function parseCalibrationAnalysis(calibration: unknown): CalibrationAnalysis {
  const c = calibration as Record<string, unknown> | undefined;

  return {
    found: Boolean(c?.found ?? false),
    location: parsePoint(c?.location),
    heightPx: parseNumber(c?.heightPx),
    widthPx: parseNumber(c?.widthPx),
    gain: parseNumber(c?.gain) ?? 10,
    paperSpeed: parseNumber(c?.paperSpeed) ?? 25,
    gainSource: parseGainSource(c?.gainSource),
    speedSource: parseSpeedSource(c?.speedSource),
    confidence: parseConfidence(c?.confidence),
  };
}

/**
 * Parse panels array
 */
function parsePanels(panels: unknown): PanelAnalysis[] {
  if (!Array.isArray(panels)) return [];

  return panels.map((p, idx) => parsePanel(p, idx));
}

/**
 * Parse single panel
 */
function parsePanel(panel: unknown, idx: number): PanelAnalysis {
  const p = panel as Record<string, unknown> | undefined;

  const lead = parseLead(p?.lead);
  const bounds = parseBounds(p?.bounds) ?? { x: 0, y: 0, width: 0, height: 0 };

  return {
    id: parseString(p?.id) ?? `panel_${idx}`,
    lead,
    leadSource: parseLeadSource(p?.leadSource),
    bounds,
    baselineY: parseNumber(p?.baselineY) ?? bounds.y + bounds.height / 2,
    row: parseNumber(p?.row) ?? 0,
    col: parseNumber(p?.col) ?? 0,
    isRhythmStrip: Boolean(p?.isRhythmStrip ?? false),
    timeRange: parseTimeRange(p?.timeRange),
    labelConfidence: parseConfidence(p?.labelConfidence),
  };
}

/**
 * Parse image quality assessment
 */
function parseImageQuality(quality: unknown): ImageQualityAssessment {
  const q = quality as Record<string, unknown> | undefined;

  return {
    overall: parseConfidence(q?.overall),
    resolution: parseResolution(q?.resolution),
    effectiveDpi: parseNumber(q?.effectiveDpi) ?? 96,
    issues: parseIssues(q?.issues),
  };
}

/**
 * Parse issues array
 */
function parseIssues(issues: unknown): ImageIssue[] {
  if (!Array.isArray(issues)) return [];

  const result: ImageIssue[] = [];

  for (const issue of issues) {
    const i = issue as Record<string, unknown>;
    const type = parseIssueType(i?.type);

    if (type !== undefined) {
      result.push({
        type,
        severity: parseSeverity(i?.severity),
        description: parseString(i?.description) ?? 'Unknown issue',
        location: parseBounds(i?.location),
      });
    }
  }

  return result;
}

/**
 * Parse notes array
 */
function parseNotes(notes: unknown): string[] {
  if (!Array.isArray(notes)) return [];
  return notes.filter((n): n is string => typeof n === 'string');
}

// ============================================================================
// Helper parsers
// ============================================================================

function parseString(val: unknown): string | undefined {
  return typeof val === 'string' ? val : undefined;
}

function parseNumber(val: unknown): number | undefined {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const num = parseFloat(val);
    if (!isNaN(num)) return num;
  }
  return undefined;
}

function parseConfidence(val: unknown): number {
  const num = parseNumber(val);
  if (num === undefined) return 0.5;
  return Math.max(0, Math.min(1, num));
}

function parseGridType(val: unknown): GridAnalysis['type'] {
  const validTypes = ['standard', 'fine', 'coarse', 'none', 'unknown'];
  return validTypes.includes(val as string) ? (val as GridAnalysis['type']) : 'unknown';
}

function parseLayoutFormat(val: unknown): LayoutAnalysis['format'] {
  const validFormats = ['12-lead', '15-lead', '6x2', 'single-strip', 'rhythm-only', 'unknown'];
  return validFormats.includes(val as string) ? (val as LayoutAnalysis['format']) : 'unknown';
}

function parseGainSource(val: unknown): CalibrationAnalysis['gainSource'] {
  const valid = ['calibration_pulse', 'text_label', 'standard_assumed', 'user_input'];
  return valid.includes(val as string) ? (val as CalibrationAnalysis['gainSource']) : 'standard_assumed';
}

function parseSpeedSource(val: unknown): CalibrationAnalysis['speedSource'] {
  const valid = ['text_label', 'standard_assumed', 'user_input'];
  return valid.includes(val as string) ? (val as CalibrationAnalysis['speedSource']) : 'standard_assumed';
}

function parseLeadSource(val: unknown): PanelAnalysis['leadSource'] {
  const valid = ['text_label', 'position_inferred', 'user_input', 'unknown'];
  return valid.includes(val as string) ? (val as PanelAnalysis['leadSource']) : 'unknown';
}

function parseResolution(val: unknown): ImageQualityAssessment['resolution'] {
  const valid = ['high', 'medium', 'low', 'very_low'];
  return valid.includes(val as string) ? (val as ImageQualityAssessment['resolution']) : 'medium';
}

function parseSeverity(val: unknown): ImageIssue['severity'] {
  const valid = ['minor', 'moderate', 'severe'];
  return valid.includes(val as string) ? (val as ImageIssue['severity']) : 'minor';
}

function parseIssueType(val: unknown): ImageIssue['type'] | undefined {
  const valid = [
    'low_resolution', 'jpeg_artifacts', 'rotation', 'perspective_distortion',
    'partial_crop', 'overlays', 'annotations', 'faded', 'noise', 'motion_blur',
  ];
  return valid.includes(val as string) ? (val as ImageIssue['type']) : undefined;
}

function parseLead(val: unknown): LeadName | null {
  if (typeof val !== 'string') return null;
  // Normalize lead name
  const normalized = val.toUpperCase().replace('AVR', 'aVR').replace('AVL', 'aVL').replace('AVF', 'aVF');
  return VALID_LEADS.includes(normalized as LeadName) ? (normalized as LeadName) : null;
}

function parseBounds(val: unknown): Bounds | undefined {
  const b = val as Record<string, unknown> | undefined;
  if (!b) return undefined;

  const x = parseNumber(b.x);
  const y = parseNumber(b.y);
  const width = parseNumber(b.width);
  const height = parseNumber(b.height);

  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined;
  }

  return { x, y, width, height };
}

function parsePoint(val: unknown): Point | undefined {
  const p = val as Record<string, unknown> | undefined;
  if (!p) return undefined;

  const x = parseNumber(p.x);
  const y = parseNumber(p.y);

  if (x === undefined || y === undefined) return undefined;

  return { x, y };
}

function parseTimeRange(val: unknown): { startSec: number; endSec: number } {
  const t = val as Record<string, unknown> | undefined;
  return {
    startSec: parseNumber(t?.startSec) ?? 0,
    endSec: parseNumber(t?.endSec) ?? 2.5,
  };
}
