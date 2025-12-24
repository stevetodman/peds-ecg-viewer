/**
 * Core ECG data types
 * @module types/ecg
 */

/**
 * Standard limb leads
 */
export type StandardLead = 'I' | 'II' | 'III' | 'aVR' | 'aVL' | 'aVF';

/**
 * Precordial (chest) leads
 */
export type PrecordialLead = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6';

/**
 * Pediatric-specific leads
 */
export type PediatricLead = 'V3R' | 'V4R' | 'V7';

/**
 * All supported lead names (12-lead + pediatric)
 */
export type LeadName = StandardLead | PrecordialLead | PediatricLead;

/**
 * Standard limb leads array
 */
export const LIMB_LEADS: readonly StandardLead[] = [
  'I', 'II', 'III', 'aVR', 'aVL', 'aVF',
] as const;

/**
 * Precordial leads array
 */
export const PRECORDIAL_LEADS: readonly PrecordialLead[] = [
  'V1', 'V2', 'V3', 'V4', 'V5', 'V6',
] as const;

/**
 * Pediatric leads array
 */
export const PEDIATRIC_LEADS: readonly PediatricLead[] = [
  'V3R', 'V4R', 'V7',
] as const;

/**
 * All 12 standard leads
 */
export const STANDARD_LEADS: readonly LeadName[] = [
  ...LIMB_LEADS,
  ...PRECORDIAL_LEADS,
] as const;

/**
 * All 15 leads (standard + pediatric)
 */
export const ALL_LEADS: readonly LeadName[] = [
  ...STANDARD_LEADS,
  ...PEDIATRIC_LEADS,
] as const;

/**
 * Lead groupings for display and analysis
 */
export const LEAD_GROUPS = {
  /** Limb leads */
  limb: [...LIMB_LEADS] as LeadName[],
  /** Precordial (chest) leads */
  precordial: [...PRECORDIAL_LEADS] as LeadName[],
  /** Bipolar limb leads */
  bipolar: ['I', 'II', 'III'] as LeadName[],
  /** Augmented limb leads */
  augmented: ['aVR', 'aVL', 'aVF'] as LeadName[],
  /** Pediatric leads */
  pediatric: [...PEDIATRIC_LEADS] as LeadName[],
  /** All standard 12 leads */
  standard: [...STANDARD_LEADS] as LeadName[],
  /** All 15 leads (including pediatric) */
  all: [...ALL_LEADS] as LeadName[],
} as const;

/**
 * Type for lead data - maps lead names to sample arrays
 * Values are in microvolts (µV)
 */
export type LeadData = Partial<Record<LeadName, number[]>>;

/**
 * Raw ECG signal data
 */
export interface ECGSignal {
  /** Sample rate in Hz (typically 250, 500, or 1000) */
  sampleRate: number;

  /** Duration in seconds */
  duration: number;

  /** Lead data in microvolts (µV) - supports 12 or 15 leads */
  leads: LeadData;

  /** Signal quality indicators per lead (0-1, 1 = best) */
  quality?: Partial<Record<LeadName, number>>;

  /** Acquisition timestamp */
  acquisitionTime?: Date;

  /** Optional metadata */
  metadata?: ECGMetadata;
}

/**
 * ECG Metadata
 */
export interface ECGMetadata {
  acquisitionDate?: string;
  acquisitionTime?: string;
  deviceId?: string;
  deviceModel?: string;
  filterSettings?: FilterSettings;
}

/**
 * Filter settings applied to ECG signal
 */
export interface FilterSettings {
  highPass: number;  // Hz
  lowPass: number;   // Hz
  notch: number;     // Hz (typically 50 or 60)
}

/**
 * Common ECG sample rates
 */
export const SAMPLE_RATES = {
  LOW: 250,
  STANDARD: 500,
  HIGH: 1000,
} as const;

/**
 * Paper speed options (mm/sec)
 */
export type PaperSpeed = 25 | 50;

/**
 * Gain/sensitivity options (mm/mV)
 */
export type Gain = 5 | 10 | 20;

/**
 * Display configuration
 */
export interface ECGDisplayConfig {
  /** Paper speed in mm/sec */
  paperSpeed: PaperSpeed;

  /** Gain in mm/mV */
  gain: Gain;

  /** Target DPI for rendering */
  dpi: number;

  /** Show grid */
  showGrid: boolean;

  /** Show calibration pulse */
  showCalibration: boolean;

  /** Show lead labels */
  showLeadLabels: boolean;
}

/**
 * Default display configuration
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
 * Fiducial point types for beat delineation
 */
export type FiducialPoint =
  | 'P_onset'
  | 'P_peak'
  | 'P_offset'
  | 'Q_onset'
  | 'R_peak'
  | 'S_offset'
  | 'T_onset'
  | 'T_peak'
  | 'T_offset';

/**
 * Single beat annotation
 */
export interface BeatAnnotation {
  /** R-peak sample index */
  rPeak: number;

  /** Optional fiducial points (sample indices) */
  fiducials?: Partial<Record<FiducialPoint, number>>;

  /** Beat classification */
  classification?: 'normal' | 'pvc' | 'pac' | 'paced' | 'artifact' | 'unknown';

  /** Confidence (0-1) */
  confidence?: number;
}

/**
 * Signal quality assessment
 */
export interface SignalQuality {
  /** Overall quality score (0-1) */
  overall: number;

  /** Per-lead quality */
  perLead: Partial<Record<LeadName, number>>;

  /** Detected issues */
  issues: SignalIssue[];
}

/**
 * Signal quality issues
 */
export interface SignalIssue {
  /** Issue type */
  type:
    | 'baseline_wander'
    | 'noise'
    | 'powerline_interference'
    | 'electrode_artifact'
    | 'motion_artifact'
    | 'saturation';

  /** Affected leads */
  leads: LeadName[];

  /** Severity (0-1) */
  severity: number;

  /** Sample range affected */
  range?: { start: number; end: number };
}

// ============================================
// PATIENT & MEASUREMENT TYPES
// ============================================

/**
 * Patient information for ECG display
 */
export interface PatientInfo {
  id: string;
  firstName: string;
  lastName: string;
  dob: string;
  age: string;
  sex: 'M' | 'F' | 'Unknown';
  race?: string;
  height?: string;
  weight?: string;
  location: string;
  room?: string;
  referringPhysician?: string;
  tech: string;
  orderId: string;
  testDateTime: string;
  interpretation: string[];
  confirmed: boolean;
  measurements: ECGMeasurementValues;
}

/**
 * Simple ECG measurement values for display
 * (For detailed measurements, use ECGMeasurements from './measurements')
 */
export interface ECGMeasurementValues {
  /** Ventricular rate in BPM */
  ventricularRate: number;
  /** Atrial rate in BPM */
  atrialRate?: number;
  /** PR interval in ms */
  prInterval: number;
  /** QRS duration in ms */
  qrsDuration: number;
  /** QT interval in ms */
  qtInterval: number;
  /** QTc (Bazett corrected) in ms */
  qtcInterval: number;
  /** P wave axis in degrees */
  pAxis: number;
  /** QRS axis in degrees */
  qrsAxis: number;
  /** T wave axis in degrees */
  tAxis: number;
  /** RR interval in ms */
  rrInterval?: number;
}

/**
 * Lead format type
 */
export type LeadFormat = '12-lead' | '15-lead';

/**
 * Display options for ECG rendering
 */
export interface DisplayOptions {
  format: LeadFormat;
  paperSpeed: PaperSpeed;
  gain: Gain;
  showGrid: boolean;
  showLabels: boolean;
  showHeader: boolean;
  showFooter: boolean;
  showCalibration: boolean;
  showSeparators: boolean;
  showRhythmStrips: boolean;
}
