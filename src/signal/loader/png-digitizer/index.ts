/**
 * PNG Digitizer Module
 * Convert ECG images to digital signals
 *
 * @module signal/loader/png-digitizer
 */

// Main API
export { ECGDigitizer, digitizePNG, loadPNGFile } from './digitizer';
export type { ImageSource } from './digitizer';

// Guaranteed Digitizer (multi-tier AI fallback)
export {
  GuaranteedDigitizer,
  digitizeGuaranteed,
  digitizePNGGuaranteed,
} from './guaranteed-digitizer';
export type {
  GuaranteedDigitizerConfig,
  GuaranteedResult,
} from './guaranteed-digitizer';

// Human-Verified Digitizer (100% accuracy guaranteed)
export {
  HumanVerifiedDigitizer,
  createHumanVerifiedDigitizer,
  digitizeWithConsoleVerification,
} from './human-verified-digitizer';
export type {
  HumanVerifiedConfig,
  HumanVerifiedResult,
  HumanVerificationCallbacks,
  HumanCorrection,
  VerificationStatus,
  VerificationThresholds,
} from './human-verified-digitizer';

// Types
export type {
  DigitizerConfig,
  DigitizerResult,
  DigitizerProgress,
  DigitizerIssue,
  AIAnalysisResult,
  ECGImageAnalysis,
  GridAnalysis,
  LayoutAnalysis,
  CalibrationAnalysis,
  PanelAnalysis,
  ImageQualityAssessment,
  ImageIssue,
  RawTrace,
  ProcessingStage,
  QualityAssessment,
  InteractiveCallbacks,
  GridCorners,
  CalibrationInput,
  LabelConfirmation,
  Point,
  Bounds,
} from './types';

// AI Providers (for direct use)
export { AnthropicProvider } from './ai/anthropic';
export { OpenAIProvider } from './ai/openai';
export { GoogleProvider } from './ai/google';
export { XAIProvider, EnsembleProvider, createEnsembleProvider } from './ai/ensemble';
export { createAIProvider, getEnvApiKey, getDefaultModel } from './ai';
export type { AIProvider, AIProviderType } from './ai';
export type { EnsembleConfig } from './ai/ensemble';

// Configuration
export {
  DEFAULT_CONFIG,
  DEFAULT_MODELS,
  API_KEY_ENV_VARS,
  STANDARD_CALIBRATION,
  QUALITY_THRESHOLDS,
  WAVEFORM_DETECTION,
  createConfig,
} from './config';

// CV utilities (for advanced use)
export { loadImage, imageDataToBlob, imageDataToBase64, getImageDimensions } from './cv/image-loader';
export { WaveformTracer } from './cv/waveform-tracer';
export { LocalGridDetector } from './cv/grid-detector';
export { UniversalLayoutDetector, detectUniversalLayout } from './cv/universal-layout-detector';
export { LeadIdentifier, identifyLead, identifyLeadsInContext } from './cv/lead-identifier';
export type { LeadIdentification } from './cv/lead-identifier';
export { RhythmStripDetector, detectRhythmStrips } from './cv/rhythm-strip-detector';
export type { RhythmStripResult, RhythmStrip } from './cv/rhythm-strip-detector';

// Signal processing (for advanced use)
export { SignalReconstructor, reconstructSignal } from './signal/reconstructor';
export { QualityScorer } from './signal/quality-scorer';
export {
  removeDCOffset,
  removeBaselineWander,
  splineBaselineCorrection,
} from './signal/dc-corrector';
export { resampleToRate, changeSampleRate } from './signal/resampler';
export { SignalValidator, validateSignal } from './signal/validator';
export type {
  ValidationResult,
  LeadValidation,
  CrossLeadValidation,
  MorphologyValidation,
  ValidationIssue,
  SuggestedCorrection,
} from './signal/validator';
export { QRSCalibrationValidator, validateCalibrationWithQRS } from './signal/qrs-calibration';
export type { QRSValidationResult } from './signal/qrs-calibration';

// Multi-pass refinement
export { MultiPassRefiner, refineResult } from './refiner';
export type { RefinementOptions, RefinementResult } from './refiner';

// Preprocessing
export { ImagePreprocessor, preprocessImage } from './cv/preprocessor';
export type { PreprocessorOptions, PreprocessResult } from './cv/preprocessor';

// Edge case handling
export {
  EdgeCaseHandler,
  AdaptiveCalibrationDetector,
  detectEdgeCases,
  correctForEdgeCases,
} from './cv/edge-case-handler';
export type { EdgeCaseDetection, EdgeCaseType } from './cv/edge-case-handler';

// Graceful degradation
export {
  GracefulDegradation,
  RecoveryStrategies,
  createGracefulDegradation,
} from './graceful-degradation';
export type {
  DegradationLevel,
  DegradationAnalysis,
  PartialResult,
} from './graceful-degradation';

// UI Components (for human verification)
export {
  showVerificationUI,
  showQuickVerification,
  showFullVerification,
} from './ui/verification-ui';
export type {
  VerificationUIResult,
  VerificationUIConfig,
} from './ui/verification-ui';

export {
  showManualDigitizerUI,
  manualDigitize,
} from './ui/manual-digitizer-ui';
export type {
  ManualDigitizerConfig,
} from './ui/manual-digitizer-ui';

// PHI Detection and Redaction
export { PHIDetector, detectPHI, redactPHI } from './cv/phi-detector';
export type { PHIType, PHIRegion, PHIDetectionResult, PHIRedactionOptions } from './cv/phi-detector';

// Electrode Swap Detection
export { ElectrodeSwapDetector, detectElectrodeSwap, correctElectrodeSwap } from './signal/electrode-swap-detector';
export type { ElectrodeSwapType, ElectrodeSwapResult, SwapEvidence } from './signal/electrode-swap-detector';

// Pacemaker Detection
export { PacemakerDetector, detectPacemaker } from './signal/pacemaker-detector';
export type { PacemakerMode, PacemakerSpike, PacemakerDetectionResult, SensingIssue } from './signal/pacemaker-detector';

// Image Orientation Handling
export { OrientationHandler, correctExifOrientation, readExifOrientation } from './cv/orientation-handler';
export type { ExifOrientation, OrientationResult } from './cv/orientation-handler';

// Color Inversion Detection/Correction
export { ColorInverter, detectColorInversion, autoCorrectColorInversion, invertColors } from './cv/color-inverter';
export type { ColorInversionResult, ColorCorrectionResult } from './cv/color-inverter';

// Video Frame Extraction
export { VideoExtractor, extractVideoFrames, extractBestVideoFrame, isVideoFile } from './cv/video-extractor';
export type { VideoExtractionOptions, ExtractedFrame, FrameIssue, VideoExtractionResult } from './cv/video-extractor';

// Export Formats
export { CSVExporter, exportToCSV } from './export/csv';
export type { CSVExportOptions } from './export/csv';
export { JSONExporter, exportToJSON } from './export/json';
export type { JSONExportOptions } from './export/json';
export { HL7aECGExporter, exportToHL7aECG } from './export/hl7-aecg';
export type { HL7aECGExportOptions } from './export/hl7-aecg';
export { MITBIHExporter, exportToMITBIH } from './export/mit-bih';
export type { MITBIHExportOptions } from './export/mit-bih';

// Pediatric Parameters
export { getAgeGroup, getNormals, interpretPediatric } from './signal/pediatric-parameters';
export type { PediatricAgeGroup, NormalRange, PediatricNormals, PediatricFinding, PediatricInterpretation } from './signal/pediatric-parameters';

// Rhythm Analysis
export { RhythmAnalyzer, analyzeRhythm } from './signal/rhythm-analyzer';
export type { RhythmType, RhythmAnalysisResult, ConductionAbnormality, DetectedBeat } from './signal/rhythm-analyzer';

// API Utilities
export { RateLimiter, withRetry, APICostTracker, ResultCache, batchProcess } from './utils/api-utils';
export type { RateLimiterConfig, RetryConfig, APICostEntry, BatchProcessorConfig, BatchResult } from './utils/api-utils';
