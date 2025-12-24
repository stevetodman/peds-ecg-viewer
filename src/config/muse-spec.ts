/**
 * MUSE ECG Specification
 * Complete pixel-perfect specifications based on GE MUSE v9.0
 *
 * All measurements in physical units (mm, inches)
 * Converted to pixels at runtime based on target DPI
 *
 * @module config/muse-spec
 */

import type { MuseSpec, Color, LeadGridConfig, RhythmStripConfig, SeparatorConfig } from '../types/config';

/**
 * Create a Color object from RGB values
 */
function rgb(r: number, g: number, b: number): Color {
  const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  return {
    rgb: { r, g, b },
    hex,
    rgba: `rgba(${r}, ${g}, ${b}, 1)`,
  };
}

/**
 * GE MUSE ECG Visual Specification
 *
 * Based on forensic analysis of MUSE v9.0 outputs.
 * Colors and layout verified from actual MUSE screenshots.
 */
export const MUSE_SPEC: MuseSpec = {
  version: '1.0.0',
  source: 'Forensic analysis of MUSE v9.0 outputs - Dec 2025',

  /**
   * Grid Configuration
   * Standard ECG paper: 1mm small boxes, 5mm large boxes
   *
   * Colors verified from MUSE screenshot samples
   */
  grid: {
    smallBox: {
      widthMm: 1,
      heightMm: 1,
    },
    largeBox: {
      widthMm: 5,
      heightMm: 5,
    },
    colors: {
      // VERIFIED: Light pink paper background
      background: rgb(255, 244, 244), // #FFF4F4

      // VERIFIED: Thin gridline color - light pink
      thinLine: rgb(255, 192, 192), // #FFC0C0

      // VERIFIED: Thick gridline color - darker pink
      thickLine: rgb(224, 160, 160), // #E0A0A0
    },
    lineWidths: {
      thin: 0.5,      // 1mm grid lines
      thick: 1.0,     // 5mm grid lines
      referenceDpi: 300,
    },
  },

  /**
   * Waveform Configuration
   */
  waveform: {
    // VERIFIED: Waveform color - black
    color: rgb(0, 0, 0), // #000000

    lineWidth: 1.5,
    referenceDpi: 300,

    // Line styles
    lineCap: 'round',
    lineJoin: 'round',
    antiAlias: true,
  },

  /**
   * Typography Configuration
   */
  typography: {
    headerFont: 'Arial, Helvetica, sans-serif',
    dataFont: 'Consolas, "Courier New", monospace',
    labelFont: 'Arial, Helvetica, sans-serif',

    sizes: {
      mainHeader: 14,
      sectionHeader: 11,
      patientName: 12,
      demographics: 10,
      measurements: 9,
      leadLabels: 9,
      interpretation: 10,
      footer: 9,
    },

    // Text colors
    color: rgb(0, 0, 0), // Black
    abnormalColor: rgb(255, 0, 0), // Red
  },

  /**
   * Page Layout Configuration
   *
   * Standard US Letter size, landscape orientation
   */
  layout: {
    page: {
      widthIn: 11, // Letter landscape
      heightIn: 8.5,
      orientation: 'landscape',
    },

    // Margins in inches
    margins: {
      top: 0.4,
      right: 0.3,
      bottom: 0.3,
      left: 0.3,
    },

    // Section heights in mm
    sections: {
      header: 25,
      measurements: 12,
      interpretation: 20,
      footer: 8,
    },

    // MUSE lead grid layouts
    leadGrid: {
      '15-lead': {
        columns: 5,
        rows: 3,
        leads: [
          ['I', 'aVR', 'V1', 'V4', 'V3R'],
          ['II', 'aVL', 'V2', 'V5', 'V4R'],
          ['III', 'aVF', 'V3', 'V6', 'V7'],
        ],
        secondsPerColumn: 2.0,
        rowHeightMm: 22,
      } as LeadGridConfig,
      '12-lead': {
        columns: 4,
        rows: 3,
        leads: [
          ['I', 'aVR', 'V1', 'V4'],
          ['II', 'aVL', 'V2', 'V5'],
          ['III', 'aVF', 'V3', 'V6'],
        ],
        secondsPerColumn: 2.5,
        rowHeightMm: 25,
      } as LeadGridConfig,
    },

    // Rhythm strips below main grid
    rhythmStrips: {
      count: 3,
      leads: ['V1', 'II', 'V5'],
      durationSeconds: 10,
      heightMm: 18,
    } as RhythmStripConfig,

    // Vertical separator lines between lead columns
    separators: {
      show: true,
      color: '#000000',
      widthMm: 0.5,
    } as SeparatorConfig,

    // Legacy properties
    leadLayout: '3x4',
    rhythmStripLeads: ['II'],
    rhythmStripDuration: 10,
  },

  // Default display settings
  defaultPaperSpeed: 25, // mm/sec
  defaultGain: 10, // mm/mV
  targetDpi: 96, // Screen DPI (use 300 for print)
};

// ============================================
// CONVERSION UTILITIES
// ============================================

/**
 * Pixels per millimeter at given DPI
 */
export function pixelsPerMm(dpi: number): number {
  return dpi / 25.4;
}

/**
 * Pixels per second at given DPI and paper speed
 */
export function pixelsPerSecond(dpi: number, paperSpeed: number): number {
  return pixelsPerMm(dpi) * paperSpeed;
}

/**
 * Pixels per millivolt at given DPI and gain
 */
export function pixelsPerMv(dpi: number, gain: number): number {
  return pixelsPerMm(dpi) * gain;
}

/**
 * Pixels per microvolt
 */
export function pixelsPerUv(dpi: number, gain: number): number {
  return pixelsPerMv(dpi, gain) / 1000;
}

/**
 * Scale line width for target DPI
 */
export function scaleLineWidth(
  lineWidth: number,
  referenceDpi: number,
  targetDpi: number
): number {
  return Math.max(0.5, lineWidth * (targetDpi / referenceDpi));
}

/**
 * Scale font size for target DPI
 */
export function scaleFontSize(
  fontSize: number,
  referenceDpi: number = 96,
  targetDpi: number
): number {
  return fontSize * (targetDpi / referenceDpi);
}

/**
 * Get page dimensions in pixels
 */
export function getPageDimensions(
  spec: MuseSpec = MUSE_SPEC,
  dpi: number = spec.targetDpi
): { width: number; height: number } {
  return {
    width: Math.round(spec.layout.page.widthIn * dpi),
    height: Math.round(spec.layout.page.heightIn * dpi),
  };
}

/**
 * Get margins in pixels
 */
export function getMargins(
  spec: MuseSpec = MUSE_SPEC,
  dpi: number = spec.targetDpi
): { top: number; right: number; bottom: number; left: number } {
  return {
    top: Math.round(spec.layout.margins.top * dpi),
    right: Math.round(spec.layout.margins.right * dpi),
    bottom: Math.round(spec.layout.margins.bottom * dpi),
    left: Math.round(spec.layout.margins.left * dpi),
  };
}

/**
 * Get section heights in pixels
 */
export function getSectionHeights(
  spec: MuseSpec = MUSE_SPEC,
  dpi: number = spec.targetDpi
): { header: number; measurements: number; interpretation: number; footer: number } {
  const ppm = pixelsPerMm(dpi);
  return {
    header: Math.round(spec.layout.sections.header * ppm),
    measurements: Math.round(spec.layout.sections.measurements * ppm),
    interpretation: Math.round(spec.layout.sections.interpretation * ppm),
    footer: Math.round(spec.layout.sections.footer * ppm),
  };
}

/**
 * Small box size in pixels at given DPI
 */
export function getSmallBoxPx(dpi: number): number {
  return pixelsPerMm(dpi) * MUSE_SPEC.grid.smallBox.widthMm;
}

/**
 * Large box size in pixels at given DPI
 */
export function getLargeBoxPx(dpi: number): number {
  return pixelsPerMm(dpi) * MUSE_SPEC.grid.largeBox.widthMm;
}

/**
 * Get small box size using spec (legacy)
 */
export function getSmallBoxSize(spec: MuseSpec, dpi: number = spec.targetDpi): number {
  return pixelsPerMm(dpi) * spec.grid.smallBox.widthMm;
}

/**
 * Get large box size using spec (legacy)
 */
export function getLargeBoxSize(spec: MuseSpec, dpi: number = spec.targetDpi): number {
  return pixelsPerMm(dpi) * spec.grid.largeBox.widthMm;
}

// Export default spec
export default MUSE_SPEC;
