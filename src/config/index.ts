/**
 * Configuration exports
 * @module config
 */

// Muse specification
export { MUSE_SPEC, default as museSpec } from './muse-spec';
export {
  pixelsPerMm,
  pixelsPerSecond,
  pixelsPerMv,
  scaleLineWidth,
  getPageDimensions,
  getMargins,
  getSectionHeights,
  getSmallBoxSize,
  getLargeBoxSize,
} from './muse-spec';

// Defaults
export {
  DEFAULT_DISPLAY_CONFIG,
  DEFAULT_RENDER_OPTIONS,
  DPI_OPTIONS,
  PAPER_SPEED_OPTIONS,
  GAIN_OPTIONS,
  DURATIONS,
  CALIBRATION_PULSE,
} from './defaults';
