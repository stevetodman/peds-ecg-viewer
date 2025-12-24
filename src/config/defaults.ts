/**
 * Default configuration values
 * @module config/defaults
 */

import type { ECGDisplayConfig, RenderOptions } from '../types';

/**
 * Default ECG display configuration
 */
export const DEFAULT_DISPLAY_CONFIG: ECGDisplayConfig = {
  paperSpeed: 25,
  gain: 10,
  dpi: 300,
  showGrid: true,
  showCalibration: true,
  showLeadLabels: true,
};

/**
 * Default render options
 */
export const DEFAULT_RENDER_OPTIONS: Required<RenderOptions> = {
  paperSpeed: 25,
  gain: 10,
  dpi: 300,
  showGrid: true,
  showCalibration: true,
  showMeasurements: true,
  showInterpretation: true,
  highlightAbnormal: true,
  showNormalRanges: true,
  format: 'png',
};

/**
 * Screen DPI options
 */
export const DPI_OPTIONS = {
  SCREEN_1X: 96,
  SCREEN_2X: 192,
  PRINT_STANDARD: 300,
  PRINT_HIGH: 600,
} as const;

/**
 * Paper speed options (mm/sec)
 */
export const PAPER_SPEED_OPTIONS = {
  STANDARD: 25,
  FAST: 50,
} as const;

/**
 * Gain options (mm/mV)
 */
export const GAIN_OPTIONS = {
  HALF: 5,
  STANDARD: 10,
  DOUBLE: 20,
} as const;

/**
 * Standard durations in seconds
 */
export const DURATIONS = {
  STANDARD_STRIP: 10,
  LEAD_SEGMENT_3X4: 2.5,
  CALIBRATION_PULSE: 0.2, // 200ms
} as const;

/**
 * Calibration pulse dimensions
 */
export const CALIBRATION_PULSE = {
  /** Duration in seconds */
  duration: 0.2,
  /** Amplitude in mV */
  amplitude: 1.0,
} as const;
