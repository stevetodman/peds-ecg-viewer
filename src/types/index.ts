/**
 * GEMUSE Type Definitions
 * Pixel-perfect Muse EKG clone for pediatrics
 *
 * @module types
 */

// ECG signal types
export type {
  StandardLead,
  PrecordialLead,
  PediatricLead,
  LeadName,
  LeadData,
  ECGSignal,
  ECGMetadata,
  FilterSettings,
  PaperSpeed,
  Gain,
  LeadFormat,
  ECGDisplayConfig,
  DisplayOptions,
  FiducialPoint,
  BeatAnnotation,
  SignalQuality,
  SignalIssue,
  PatientInfo,
  ECGMeasurementValues,
} from './ecg';

export {
  LIMB_LEADS,
  PRECORDIAL_LEADS,
  PEDIATRIC_LEADS,
  STANDARD_LEADS,
  ALL_LEADS,
  LEAD_GROUPS,
  SAMPLE_RATES,
  DEFAULT_DISPLAY_CONFIG,
} from './ecg';

// Patient types
export type {
  BiologicalSex,
  PatientName,
  Patient,
  Age,
  DeviceInfo,
  ECGStudy,
} from './patient';

export { calculateAge, formatAge, calculateBSA, createMinimalStudy } from './patient';

// Measurement types
export type {
  HeartRateMeasurement,
  IntervalMeasurement,
  QTcMeasurements,
  AxisMeasurement,
  AmplitudeMeasurements,
  ECGMeasurements,
  MeasurementInterpretation,
  MeasurementWithNormal,
} from './measurements';

export { calculateQTc, interpretMeasurement } from './measurements';

// Interpretation types
export type {
  Severity,
  FindingCategory,
  FindingCode,
  InterpretationFinding,
  RhythmDescription,
  InterpretationSummary,
  ECGInterpretation,
} from './interpretation';

export { createNormalInterpretation } from './interpretation';

// Configuration types
export type {
  RGBColor,
  Color,
  GridConfig,
  WaveformConfig,
  TypographyConfig,
  LayoutConfig,
  MuseSpec,
  RenderOptions,
} from './config';
