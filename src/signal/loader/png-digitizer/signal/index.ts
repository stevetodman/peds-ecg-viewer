/**
 * Signal Processing Module
 * Signal reconstruction and processing for digitized ECG
 *
 * @module signal/loader/png-digitizer/signal
 */

export { SignalReconstructor, reconstructSignal } from './reconstructor';
export type { ReconstructorOptions } from './reconstructor';

export {
  removeDCOffset,
  removeDCOffsetMean,
  removeBaselineWander,
  splineBaselineCorrection,
  polynomialBaselineCorrection,
} from './dc-corrector';

export {
  resampleToRate,
  downsample,
  upsample,
  changeSampleRate,
} from './resampler';

export { QualityScorer } from './quality-scorer';

export { SignalValidator, validateSignal } from './validator';
export type {
  ValidationResult,
  LeadValidation,
  CrossLeadValidation,
  MorphologyValidation,
  ValidationIssue,
  SuggestedCorrection,
} from './validator';

export { QRSCalibrationValidator, validateCalibrationWithQRS } from './qrs-calibration';
export type { QRSValidationResult } from './qrs-calibration';

export {
  ECGSignalFilter,
  filterECGSignal,
  analyzeSignalQuality,
} from './filters';
export type {
  FilterConfig,
  FilterResult,
  SignalQualityIssue,
} from './filters';

export {
  ClinicalParameterExtractor,
  extractClinicalParameters,
} from './clinical-parameters';
export type {
  ECGIntervals,
  ECGAxis,
  QRSMorphology,
  STAnalysis,
  ClinicalParameters,
} from './clinical-parameters';

export {
  CrossLeadValidator,
  validateCrossLead,
  recoverMissingLeads,
} from './cross-lead-validation';
export type {
  CrossLeadValidationResult,
} from './cross-lead-validation';

export {
  getAgeGroup,
  getNormals,
  interpretPediatric,
} from './pediatric-parameters';
export type {
  PediatricAgeGroup,
  NormalRange,
  PediatricNormals,
  PediatricFinding,
  PediatricInterpretation,
} from './pediatric-parameters';

export {
  ElectrodeSwapDetector,
  detectElectrodeSwap,
  correctElectrodeSwap,
} from './electrode-swap-detector';
export type {
  ElectrodeSwapType,
  ElectrodeSwapResult,
  SwapEvidence,
} from './electrode-swap-detector';

export {
  PacemakerDetector,
  detectPacemaker,
} from './pacemaker-detector';
export type {
  PacemakerMode,
  PacemakerSpike,
  PacemakerDetectionResult,
  SensingIssue,
} from './pacemaker-detector';

export {
  RhythmAnalyzer,
  analyzeRhythm,
} from './rhythm-analyzer';
export type {
  RhythmType,
  RhythmAnalysisResult,
  ConductionAbnormality,
  DetectedBeat,
} from './rhythm-analyzer';

export {
  CriticalFindingsDetector,
  detectCriticalFindings,
} from './critical-findings';
export type {
  UrgencyLevel,
  STEMITerritory,
  STEMIResult,
  HyperkalemiaResult,
  LongQTResult,
  BrugadaResult,
  HeartBlockResult,
  WellensResult,
  DeWinterResult,
  CriticalFinding,
  CriticalFindingsResult,
} from './critical-findings';

export {
  SignalQualityAnalyzer,
  analyzeSignalQuality as analyzeDetailedSignalQuality,
} from './signal-quality';
export type {
  ArtifactType,
  ArtifactSeverity,
  DetectedArtifact,
  LeadQualityAssessment,
  SignalQualityResult,
} from './signal-quality';

export {
  SerialECGComparator,
  compareECGs,
} from './serial-comparison';
export type {
  ChangeSignificance,
  ChangeDirection,
  ParameterChange,
  LeadChange,
  IntervalChanges,
  STTChanges,
  RhythmChanges,
  SerialComparisonResult,
  ECGForComparison,
} from './serial-comparison';

export {
  DrugElectrolyteDetector,
  analyzeForDrugElectrolyte,
  hasElectrolyteEmergency,
  hasDrugToxicity,
} from './drug-electrolyte';
export type {
  ElectrolyteType,
  PotassiumLevel,
  CalciumLevel,
  MagnesiumLevel,
  DrugClass,
  ElectrolytePattern,
  ElectrolyteFeature,
  ElectrolyteFeatureType,
  DrugEffectPattern,
  DrugFeature,
  DrugFeatureType,
  DrugElectrolyteResult,
  CombinedEffect,
  DetectorOptions as DrugElectrolyteOptions,
} from './drug-electrolyte';

// Fiducial Point Detection (Pan-Tompkins + Wavelet)
export {
  PanTompkinsDetector,
  WaveletDelineator,
  FiducialDetector,
  detectFiducialPoints,
  detectRPeaks,
} from './fiducial-detector';
export type {
  FiducialPoint,
  BeatAnnotation,
  PWaveAnnotation,
  QRSAnnotation,
  TWaveAnnotation,
  FiducialDetectionResult,
} from './fiducial-detector';

// Beat-by-Beat Classification (AAMI EC57)
export {
  BeatClassifier,
  classifyBeats,
  getPVCBurden,
  hasSignificantEctopy,
} from './beat-classifier';
export type {
  AAMIBeatClass,
  BeatClassification,
  BeatPattern,
  ClassificationSummary,
} from './beat-classifier';

// HRV Analysis (Time/Frequency/Non-linear)
export {
  RRTachogramGenerator,
  HRVAnalyzer,
  analyzeHRV,
  generateRRTachogram,
  calculateRMSSD,
} from './hrv-analysis';
export type {
  RRTachogram,
  TimeDomainHRV,
  FrequencyDomainHRV,
  NonLinearHRV,
  HRVAnalysisResult,
} from './hrv-analysis';

// Measurement Uncertainty & QTc Formulas
export {
  MeasurementUncertaintyCalculator,
  calculateQTc,
  calculateAllQTc,
  QTcFormulas,
  createAveragedBeat,
} from './measurement-uncertainty';
export type {
  MeasurementWithUncertainty,
  QTcMeasurement,
  IntervalMeasurements,
  AveragedBeat,
} from './measurement-uncertainty';

// WPW / Pre-excitation Detection
export {
  WPWDetector,
  detectWPW,
  hasPreexcitation,
} from './wpw-detector';
export type {
  DeltaWaveDetection,
  AccessoryPathwayLocation,
  PreexcitationType,
  WPWAnalysisResult,
  WPWRiskAssessment,
} from './wpw-detector';

// EDF/EDF+ Export
export {
  EDFExporter,
  exportToEDF,
  exportToEDFPlus,
  createBeatAnnotations,
  createIntervalAnnotations,
  parseEDFHeader,
} from './edf-export';
export type {
  EDFHeader,
  EDFSignalHeader,
  EDFAnnotation,
  EDFExportOptions,
  EDFExportResult,
} from './edf-export';

// Pause Detection
export {
  PauseDetector,
  detectPauses,
  hasCriticalPauses,
  hasSignificantPauses,
  getLongestPause,
  getPausesByType,
  analyzePauseDistribution,
  evaluatePacemakerIndication,
} from './pause-detector';
export type {
  PauseType,
  PauseSignificance,
  PauseDetection,
  CompensatoryAnalysis,
  PauseAnalysisSummary,
  PauseDetectionConfig,
} from './pause-detector';
