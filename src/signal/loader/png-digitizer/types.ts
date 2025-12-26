/**
 * PNG Digitizer Types
 * Complete type definitions for ECG image digitization
 *
 * @module signal/loader/png-digitizer/types
 */

import type { ECGSignal, LeadName } from '../../../types';

// Re-export LeadName for use by other modules in this package
export type { LeadName } from '../../../types';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration options for the ECG digitizer
 */
export interface DigitizerConfig {
  /** AI provider to use */
  aiProvider?: 'anthropic' | 'openai' | 'google' | 'none';

  /** API key (or use environment variable) */
  apiKey?: string;

  /** Model to use */
  model?: string;

  /** Confidence threshold for AI results (0-1) */
  aiConfidenceThreshold?: number;

  /** Enable local CV fallback */
  enableLocalFallback?: boolean;

  /** Enable user-assisted mode */
  enableInteractive?: boolean;

  /** Target sample rate for output */
  targetSampleRate?: 250 | 500 | 1000;

  /** Progress callback */
  onProgress?: (progress: DigitizerProgress) => void;

  /** Interactive callbacks (for user-assisted mode) */
  interactive?: InteractiveCallbacks;
}

/**
 * Interactive callbacks for user-assisted mode
 */
export interface InteractiveCallbacks {
  /** Called when user needs to select grid corners */
  onSelectGridCorners?: () => Promise<GridCorners>;

  /** Called when user needs to mark calibration */
  onSelectCalibration?: () => Promise<CalibrationInput>;

  /** Called when user needs to confirm/edit labels */
  onConfirmLabels?: (detected: PanelAnalysis[]) => Promise<LabelConfirmation>;

  /** Called to show status messages */
  onStatus?: (message: string) => void;
}

// ============================================================================
// AI Analysis Types
// ============================================================================

/**
 * Result from AI image analysis
 */
export interface AIAnalysisResult {
  /** Overall confidence (0-1) */
  confidence: number;

  /** Raw AI response text */
  rawResponse: string;

  /** Parsed analysis */
  analysis: ECGImageAnalysis;

  /** Provider used */
  provider: string;

  /** Model used */
  model: string;

  /** Processing time in ms */
  processingTimeMs: number;
}

/**
 * Complete ECG image analysis from AI
 */
export interface ECGImageAnalysis {
  /** Grid analysis */
  grid: GridAnalysis;

  /** Layout detection */
  layout: LayoutAnalysis;

  /** Calibration info */
  calibration: CalibrationAnalysis;

  /** Detected panels with labels */
  panels: PanelAnalysis[];

  /** Image quality assessment */
  imageQuality: ImageQualityAssessment;

  /** Additional observations */
  notes?: string[];
}

/**
 * Grid pattern analysis
 */
export interface GridAnalysis {
  /** Detected or estimated */
  detected: boolean;

  /** Grid type */
  type: 'standard' | 'fine' | 'coarse' | 'none' | 'unknown';

  /** Background color (hex) */
  backgroundColor?: string;

  /** Thin grid line color */
  thinLineColor?: string;

  /** Thick grid line color */
  thickLineColor?: string;

  /** Waveform/trace color (hex) */
  waveformColor?: string;

  /** Number of large (5mm) boxes counted across one panel */
  largeBoxesPerPanel?: number;

  /** Number of QRS complexes counted in one panel */
  qrsCountPerPanel?: number;

  /** Visual estimate of heart rate (e.g., "60-80", "tachycardia ~150") */
  visualHeartRateEstimate?: string;

  /** Estimated DPI */
  estimatedDpi?: number;

  /** Pixels per millimeter */
  pxPerMm?: number;

  /** Small box size in pixels */
  smallBoxPx?: number;

  /** Large box size in pixels */
  largeBoxPx?: number;

  /** Rotation angle (degrees) */
  rotation?: number;

  /** Confidence (0-1) */
  confidence: number;
}

/**
 * ECG layout analysis
 */
export interface LayoutAnalysis {
  /** Detected format */
  format: '12-lead' | '15-lead' | '6x2' | 'single-strip' | 'rhythm-only' | 'unknown';

  /** Number of columns in main grid */
  columns: number;

  /** Number of rows in main grid */
  rows: number;

  /** Has rhythm strips */
  hasRhythmStrips: boolean;

  /** Number of rhythm strips */
  rhythmStripCount?: number;

  /** Total duration visible (seconds) */
  estimatedDuration?: number;

  /** Image dimensions */
  imageWidth: number;
  imageHeight: number;

  /** Grid area bounds */
  gridBounds?: Bounds;

  /** Confidence (0-1) */
  confidence: number;
}

/**
 * Calibration analysis
 */
export interface CalibrationAnalysis {
  /** Calibration pulse found */
  found: boolean;

  /** Pulse location (if found) */
  location?: Point;

  /** Pulse height in pixels */
  heightPx?: number;

  /** Pulse width in pixels */
  widthPx?: number;

  /** Detected gain (mm/mV) */
  gain: number;

  /** Detected paper speed (mm/s) */
  paperSpeed: number;

  /** How gain was determined */
  gainSource: 'calibration_pulse' | 'text_label' | 'standard_assumed' | 'user_input';

  /** How speed was determined */
  speedSource: 'text_label' | 'standard_assumed' | 'user_input';

  /** Confidence (0-1) */
  confidence: number;
}

/**
 * Panel (lead) analysis
 */
export interface PanelAnalysis {
  /** Panel identifier */
  id: string;

  /** Detected lead name */
  lead: LeadName | null;

  /** How lead was identified */
  leadSource: 'text_label' | 'position_inferred' | 'user_input' | 'unknown';

  /** Bounding box in pixels */
  bounds: Bounds;

  /** Baseline Y position (0mV line) */
  baselineY: number;

  /** Row index (0-based) */
  row: number;

  /** Column index (0-based) */
  col: number;

  /** Is this a rhythm strip */
  isRhythmStrip: boolean;

  /** Time range this panel shows */
  timeRange: { startSec: number; endSec: number };

  /** Label confidence (0-1) */
  labelConfidence: number;

  /** AI-provided trace points along the waveform (11 points at 0%, 10%, 20%... 100%) */
  tracePoints?: Array<{ xPercent: number; yPixel: number }>;

  /** Minimum Y pixel the waveform reaches (e.g., R wave peak) */
  waveformYMin?: number;

  /** Maximum Y pixel the waveform reaches (e.g., S wave trough) */
  waveformYMax?: number;
}

/**
 * Image quality assessment
 */
export interface ImageQualityAssessment {
  /** Overall quality score (0-1) */
  overall: number;

  /** Resolution quality */
  resolution: 'high' | 'medium' | 'low' | 'very_low';

  /** Estimated effective DPI */
  effectiveDpi: number;

  /** Issues detected */
  issues: ImageIssue[];
}

/**
 * Detected image issue
 */
export interface ImageIssue {
  type:
    | 'low_resolution'
    | 'jpeg_artifacts'
    | 'rotation'
    | 'perspective_distortion'
    | 'partial_crop'
    | 'overlays'
    | 'annotations'
    | 'faded'
    | 'noise'
    | 'motion_blur';
  severity: 'minor' | 'moderate' | 'severe';
  description: string;
  location?: Bounds;
}

// ============================================================================
// Waveform Extraction Types
// ============================================================================

/**
 * Raw waveform trace extracted from image
 */
export interface RawTrace {
  /** Panel this trace belongs to */
  panelId: string;

  /** Lead name */
  lead: LeadName;

  /** X coordinates (pixels) */
  xPixels: number[];

  /** Y coordinates (pixels) */
  yPixels: number[];

  /** Per-point confidence */
  confidence: number[];

  /** Baseline Y used */
  baselineY: number;

  /** Gaps in trace (ranges of missing data) */
  gaps: Array<{ startX: number; endX: number }>;

  /** Extraction method used */
  method: 'column_scan' | 'contour_trace' | 'ai_guided';
}

// ============================================================================
// Final Result Types
// ============================================================================

/**
 * Complete digitization result
 */
export interface DigitizerResult {
  /** Success status */
  success: boolean;

  /** Extracted ECG signal (if successful) */
  signal?: ECGSignal;

  /** Partial leads (if full extraction failed) */
  partialLeads?: Partial<Record<LeadName, number[]>>;

  /** Overall confidence (0-1) */
  confidence: number;

  /** Per-lead confidence */
  leadConfidence: Partial<Record<LeadName, number>>;

  /** Processing stages completed */
  stages: ProcessingStage[];

  /** Issues encountered */
  issues: DigitizerIssue[];

  /** Suggestions for improvement */
  suggestions: string[];

  /** AI analysis (if used) */
  aiAnalysis?: AIAnalysisResult;

  /** Grid info (detected or provided) */
  gridInfo: GridAnalysis;

  /** Calibration info */
  calibration: CalibrationAnalysis;

  /** Panel layout */
  panels: PanelAnalysis[];

  /** Total processing time (ms) */
  processingTimeMs: number;

  /** Method used for digitization */
  method: 'ai_guided' | 'local_cv' | 'user_assisted' | 'hybrid';
}

/**
 * Processing stage status
 */
export interface ProcessingStage {
  name: string;
  status: 'success' | 'partial' | 'failed' | 'skipped';
  confidence: number;
  durationMs: number;
  notes?: string;
}

/**
 * Digitization issue
 */
export interface DigitizerIssue {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  affectedLeads?: LeadName[];
  suggestion?: string;
}

/**
 * Progress update during digitization
 */
export interface DigitizerProgress {
  stage:
    | 'loading'
    | 'ai_analysis'
    | 'grid_detection'
    | 'layout_analysis'
    | 'label_recognition'
    | 'calibration'
    | 'waveform_extraction'
    | 'signal_reconstruction'
    | 'quality_assessment'
    | 'user_input';
  progress: number;
  message: string;
  canCancel?: boolean;
}

// ============================================================================
// Geometry Types
// ============================================================================

/**
 * 2D point
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Bounding box
 */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Grid corner points for user input
 */
export interface GridCorners {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
  boxSizeMm?: number;
}

/**
 * Calibration input from user
 */
export interface CalibrationInput {
  /** Start point of calibration pulse (baseline) */
  start: Point;
  /** Top point of calibration pulse (1mV) */
  top: Point;
  /** Known voltage in mV (default: 1) */
  voltageMv?: number;
}

/**
 * Label confirmation from user
 */
export interface LabelConfirmation {
  /** Map of panel ID to confirmed lead name */
  labels: Map<string, LeadName>;
}

// ============================================================================
// Quality Assessment Types
// ============================================================================

/**
 * Quality assessment result
 */
export interface QualityAssessment {
  /** Overall quality score (0-1) */
  overall: number;

  /** Per-lead quality scores */
  perLead: Partial<Record<LeadName, number>>;

  /** Detected issues */
  issues: DigitizerIssue[];

  /** Suggestions for improvement */
  suggestions: string[];
}
