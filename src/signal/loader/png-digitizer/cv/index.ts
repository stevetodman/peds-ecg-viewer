/**
 * Computer Vision Module
 * Exports all CV-related functionality
 *
 * @module signal/loader/png-digitizer/cv
 */

export { loadImage, imageDataToBlob, imageDataToBase64, getImageDimensions } from './image-loader';
export type { ImageSource } from './image-loader';
export { WaveformTracer } from './waveform-tracer';
export type { WaveformTracerConfig } from './waveform-tracer';
export { LocalGridDetector } from './grid-detector';
export { ImagePreprocessor, preprocessImage } from './preprocessor';
export type { PreprocessorOptions, PreprocessResult } from './preprocessor';
export {
  EdgeCaseHandler,
  AdaptiveCalibrationDetector,
  detectEdgeCases,
  correctForEdgeCases,
} from './edge-case-handler';
export type { EdgeCaseDetection, EdgeCaseType } from './edge-case-handler';

export {
  UniversalLayoutDetector,
  detectUniversalLayout,
} from './universal-layout-detector';

export {
  LeadIdentifier,
  identifyLead,
  identifyLeadsInContext,
} from './lead-identifier';
export type { LeadIdentification } from './lead-identifier';

export {
  RhythmStripDetector,
  detectRhythmStrips,
} from './rhythm-strip-detector';
export type { RhythmStripResult, RhythmStrip } from './rhythm-strip-detector';

export {
  PerspectiveCorrector,
  correctPerspective,
  analyzePerspective,
} from './perspective-corrector';
export type {
  PerspectiveAnalysis,
  PerspectiveCorrectionResult,
} from './perspective-corrector';

export {
  PDFExtractor,
  extractECGFromPDF,
  isPDFExtractionSupported,
} from './pdf-extractor';
export type {
  PDFExtractionResult,
  PDFPage,
  PDFMetadata,
  PDFExtractionOptions,
} from './pdf-extractor';

export {
  RobustImageLoader,
  loadImageRobust,
} from './robust-loader';
export type {
  RobustLoadOptions,
  RobustLoadResult,
} from './robust-loader';

export {
  MultiECGDetector,
  detectMultipleECGs,
  splitMultiECG,
} from './multi-ecg-detector';
export type {
  ECGRegion,
  MultiECGResult,
} from './multi-ecg-detector';

export {
  GlareDetector,
  detectGlare,
} from './glare-detector';
export type {
  GlareDetectionResult,
  GlareRegion,
} from './glare-detector';

export {
  PHIDetector,
  detectPHI,
  redactPHI,
} from './phi-detector';
export type {
  PHIType,
  PHIRegion,
  PHIDetectionResult,
  PHIRedactionOptions,
} from './phi-detector';

export {
  OrientationHandler,
  correctExifOrientation,
  readExifOrientation,
} from './orientation-handler';
export type {
  ExifOrientation,
  OrientationResult,
} from './orientation-handler';

export {
  ColorInverter,
  detectColorInversion,
  autoCorrectColorInversion,
  invertColors,
} from './color-inverter';
export type {
  ColorInversionResult,
  ColorCorrectionResult,
} from './color-inverter';

export {
  VideoExtractor,
  extractVideoFrames,
  extractBestVideoFrame,
  isVideoFile,
} from './video-extractor';
export type {
  VideoExtractionOptions,
  ExtractedFrame,
  FrameIssue,
  VideoExtractionResult,
} from './video-extractor';

export {
  MultiPageHandler,
  analyzeMultiPageDocument,
  extractBestECG,
} from './multi-page-handler';
export type {
  PageAnalysis,
  ECGSegment,
  SegmentGroup,
  MultiPageResult,
  MultiPageOptions,
} from './multi-page-handler';
