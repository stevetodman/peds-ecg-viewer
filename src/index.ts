/**
 * GEMUSE - Pixel-Perfect Muse EKG Clone for Pediatrics
 *
 * A comprehensive library for rendering ECG/EKG outputs that match
 * the GE Muse format with pediatric-specific interpretation.
 *
 * @packageDocumentation
 */

// Version
export const VERSION = '0.1.0';

// ============================================================================
// Type Exports
// ============================================================================

export type {
  // ECG signal types
  LeadName,
  LeadData,
  ECGSignal,
  PaperSpeed,
  Gain,
  ECGDisplayConfig,
  FiducialPoint,
  BeatAnnotation,
  SignalQuality,
  SignalIssue,
  // Patient types
  BiologicalSex,
  PatientName,
  Patient,
  Age,
  DeviceInfo,
  ECGStudy,
  // Measurement types
  HeartRateMeasurement,
  IntervalMeasurement,
  QTcMeasurements,
  AxisMeasurement,
  AmplitudeMeasurements,
  ECGMeasurements,
  MeasurementInterpretation,
  MeasurementWithNormal,
  // Interpretation types
  Severity,
  FindingCategory,
  FindingCode,
  InterpretationFinding,
  RhythmDescription,
  InterpretationSummary,
  ECGInterpretation,
  // Configuration types
  RGBColor,
  Color,
  GridConfig,
  WaveformConfig,
  TypographyConfig,
  LayoutConfig,
  MuseSpec,
  RenderOptions,
} from './types';

// ============================================================================
// Constants and Enums
// ============================================================================

export { STANDARD_LEADS, LEAD_GROUPS, SAMPLE_RATES, DEFAULT_DISPLAY_CONFIG } from './types';

// ============================================================================
// Configuration
// ============================================================================

export { MUSE_SPEC } from './config/muse-spec';
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
} from './config/muse-spec';

export {
  DEFAULT_RENDER_OPTIONS,
  DPI_OPTIONS,
  PAPER_SPEED_OPTIONS,
  GAIN_OPTIONS,
  DURATIONS,
  CALIBRATION_PULSE,
} from './config/defaults';

// ============================================================================
// Data Layer
// ============================================================================

// Age groups
export type { AgeGroup } from './data/ageGroups';
export {
  AGE_GROUPS,
  getAgeGroup,
  getAgeGroupById,
  isNeonate,
  isInfant,
  isPediatric,
  ageToDays,
} from './data/ageGroups';

// Pediatric normals
export type { NormalRange, TWavePolarity, TWavePattern, AgeNormals } from './data/pediatricNormals';
export {
  PEDIATRIC_NORMALS,
  getNormalsForAge,
  getNormals,
  classifyValue,
  estimatePercentile,
  isTWaveV1Normal,
  getClinicalNotes,
} from './data/pediatricNormals';

// ============================================================================
// Utilities
// ============================================================================

// Patient utilities
export { calculateAge, formatAge, calculateBSA, createMinimalStudy } from './types/patient';

// Measurement utilities
export { calculateQTc, interpretMeasurement } from './types/measurements';

// Interpretation utilities
export { createNormalInterpretation } from './types/interpretation';

// Math utilities
export {
  clamp,
  lerp,
  round,
  mean,
  median,
  standardDeviation,
  normalizeAngle,
} from './utils/math';

// Validation utilities
export { ValidationError, validateECGSignal, validateAge } from './utils/validation';

// ============================================================================
// Signal Processing
// ============================================================================

export {
  generateSyntheticECG,
  generateFlatLine,
  generateSineWave,
  type SyntheticECGOptions,
} from './signal';

// ============================================================================
// Renderer (Browser only)
// ============================================================================

// Note: Renderer exports are available via direct import from './renderer'
// They require browser environment (Canvas API)
// Example: import { ECGRenderer } from 'gemuse/renderer';
