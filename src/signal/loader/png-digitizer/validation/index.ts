/**
 * Validation Module
 * Ground truth validation and quality metrics
 *
 * @module signal/loader/png-digitizer/validation
 */

export {
  GroundTruthValidator,
  validateAgainstReference,
  calculateSimilarity,
} from './ground-truth';
export type {
  ReferenceAnnotation,
  ReferenceECG,
  LeadValidationResult,
  BeatDetectionResult,
  IntervalValidationResult,
  ValidationResult,
  BatchValidationResult,
  ValidationThresholds,
} from './ground-truth';
