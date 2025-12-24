/**
 * Configuration types
 * @module types/config
 */

import type { PaperSpeed, Gain } from './ecg';

/**
 * RGB color value
 */
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Color with multiple representations
 */
export interface Color {
  /** RGB values (0-255) */
  rgb: RGBColor;
  /** Hex string (e.g., "#FF0000") */
  hex: string;
  /** CSS rgba string */
  rgba?: string;
}

/**
 * Grid visual configuration
 */
export interface GridConfig {
  /** Small box dimensions (1mm at standard) */
  smallBox: {
    /** Width in mm */
    widthMm: number;
    /** Height in mm */
    heightMm: number;
  };

  /** Large box dimensions (5mm at standard) */
  largeBox: {
    /** Width in mm */
    widthMm: number;
    /** Height in mm */
    heightMm: number;
  };

  /** Grid colors */
  colors: {
    /** Background paper color */
    background: Color;
    /** Thin gridline color */
    thinLine: Color;
    /** Thick gridline color */
    thickLine: Color;
  };

  /** Line widths in pixels at reference DPI */
  lineWidths: {
    /** Thin line width */
    thin: number;
    /** Thick line width */
    thick: number;
    /** Reference DPI for line widths */
    referenceDpi: number;
  };
}

/**
 * Waveform visual configuration
 */
export interface WaveformConfig {
  /** Line color */
  color: Color;

  /** Line width in pixels at reference DPI */
  lineWidth: number;

  /** Reference DPI for line width */
  referenceDpi: number;

  /** Line cap style */
  lineCap: 'butt' | 'round' | 'square';

  /** Line join style */
  lineJoin: 'miter' | 'round' | 'bevel';

  /** Enable anti-aliasing */
  antiAlias: boolean;
}

/**
 * Typography configuration
 */
export interface TypographyConfig {
  /** Font family for headers */
  headerFont: string;

  /** Font family for data/measurements */
  dataFont: string;

  /** Font family for lead labels */
  labelFont: string;

  /** Font sizes in points */
  sizes: {
    /** Main header (facility name) */
    mainHeader: number;
    /** Section headers */
    sectionHeader: number;
    /** Patient name */
    patientName: number;
    /** Patient demographics */
    demographics: number;
    /** Measurement values */
    measurements: number;
    /** Lead labels */
    leadLabels: number;
    /** Interpretation text */
    interpretation: number;
    /** Footer text */
    footer: number;
  };

  /** Text color */
  color: Color;

  /** Color for abnormal/flagged values */
  abnormalColor: Color;
}

/**
 * Lead grid configuration for 12-lead or 15-lead format
 */
export interface LeadGridConfig {
  /** Number of columns */
  columns: number;
  /** Number of rows */
  rows: number;
  /** Lead arrangement by row */
  leads: string[][];
  /** Duration shown in each column (seconds) */
  secondsPerColumn: number;
  /** Row height in mm */
  rowHeightMm: number;
}

/**
 * Rhythm strip configuration
 */
export interface RhythmStripConfig {
  /** Number of rhythm strips */
  count: number;
  /** Leads to display */
  leads: string[];
  /** Duration in seconds */
  durationSeconds: number;
  /** Height in mm */
  heightMm: number;
}

/**
 * Separator line configuration
 */
export interface SeparatorConfig {
  /** Show separator lines */
  show: boolean;
  /** Line color */
  color: string;
  /** Line width in mm */
  widthMm: number;
}

/**
 * Page layout configuration
 */
export interface LayoutConfig {
  /** Page dimensions */
  page: {
    /** Width in inches */
    widthIn: number;
    /** Height in inches */
    heightIn: number;
    /** Orientation */
    orientation: 'portrait' | 'landscape';
  };

  /** Margins in inches */
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };

  /** Section heights in mm */
  sections: {
    /** Header section height */
    header: number;
    /** Measurements box height */
    measurements: number;
    /** Interpretation section height */
    interpretation: number;
    /** Footer height */
    footer: number;
  };

  /** MUSE-format lead grid layouts */
  leadGrid: {
    '12-lead': LeadGridConfig;
    '15-lead': LeadGridConfig;
  };

  /** Rhythm strip configuration */
  rhythmStrips: RhythmStripConfig;

  /** Separator line configuration */
  separators: SeparatorConfig;

  /** Lead layout type (legacy) */
  leadLayout: '3x4' | '6x2' | '12x1' | 'rhythm_only';

  /** Which lead(s) for rhythm strip (legacy) */
  rhythmStripLeads: string[];

  /** Rhythm strip duration in seconds (legacy) */
  rhythmStripDuration: number;
}

/**
 * Complete Muse specification
 */
export interface MuseSpec {
  /** Spec version */
  version: string;

  /** Source of measurements */
  source: string;

  /** Grid configuration */
  grid: GridConfig;

  /** Waveform configuration */
  waveform: WaveformConfig;

  /** Typography configuration */
  typography: TypographyConfig;

  /** Layout configuration */
  layout: LayoutConfig;

  /** Default paper speed */
  defaultPaperSpeed: PaperSpeed;

  /** Default gain */
  defaultGain: Gain;

  /** Target DPI for output */
  targetDpi: number;
}

/**
 * Render options (runtime overrides)
 */
export interface RenderOptions {
  /** Override paper speed */
  paperSpeed?: PaperSpeed;

  /** Override gain */
  gain?: Gain;

  /** Override DPI */
  dpi?: number;

  /** Show grid */
  showGrid?: boolean;

  /** Show calibration pulse */
  showCalibration?: boolean;

  /** Show measurements box */
  showMeasurements?: boolean;

  /** Show interpretation */
  showInterpretation?: boolean;

  /** Highlight abnormal values */
  highlightAbnormal?: boolean;

  /** Show age-adjusted normal ranges */
  showNormalRanges?: boolean;

  /** Output format */
  format?: 'png' | 'pdf' | 'svg';
}
