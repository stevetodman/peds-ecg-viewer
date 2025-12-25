/**
 * Robust ECG Digitizer
 * Wrapper that runs digitization multiple times and picks the best result
 * using cross-lead validation (Einthoven's law) to score each attempt.
 *
 * @module signal/loader/png-digitizer/robust-digitizer
 */

import type { DigitizerConfig, DigitizerResult } from './types';
import { ECGDigitizer, ImageSource } from './digitizer';
import {
  validateCrossLeadRelationships,
  CrossLeadValidationResult,
} from './signal/cross-lead-validator';

/**
 * Configuration for robust digitizer
 */
export interface RobustDigitizerConfig extends DigitizerConfig {
  /** Number of attempts to make (default: 3) */
  maxAttempts?: number;
  /** Minimum Einthoven correlation to accept without retry (default: 0.8) */
  earlyAcceptThreshold?: number;
  /** Called after each attempt with the result and validation */
  onAttempt?: (attempt: number, result: DigitizerResult, validation: CrossLeadValidationResult | null) => void;
}

/**
 * Extended result with validation info
 */
export interface RobustDigitizerResult extends DigitizerResult {
  /** Number of attempts made */
  attemptsMade: number;
  /** Cross-lead validation result */
  crossLeadValidation?: CrossLeadValidationResult;
  /** Score breakdown for transparency */
  scoreBreakdown?: {
    einthovenCorrelation: number;
    augmentedLeadsScore: number;
    leadCount: number;
    totalScore: number;
  };
}

/**
 * Robust ECG Digitizer with retry and ensemble selection
 */
export class RobustECGDigitizer {
  private config: Required<Omit<RobustDigitizerConfig, 'interactive' | 'onProgress' | 'onAttempt'>> &
    Pick<RobustDigitizerConfig, 'interactive' | 'onProgress' | 'onAttempt'>;

  constructor(config: RobustDigitizerConfig = {}) {
    this.config = {
      maxAttempts: config.maxAttempts ?? 3,
      earlyAcceptThreshold: config.earlyAcceptThreshold ?? 0.8,
      onAttempt: config.onAttempt,
      // Pass through to underlying digitizer
      aiProvider: config.aiProvider ?? 'anthropic',
      apiKey: config.apiKey ?? '',
      model: config.model ?? '',
      aiConfidenceThreshold: config.aiConfidenceThreshold ?? 0.7,
      enableLocalFallback: config.enableLocalFallback ?? true,
      enableInteractive: config.enableInteractive ?? true,
      targetSampleRate: config.targetSampleRate ?? 500,
      onProgress: config.onProgress,
      interactive: config.interactive,
    };
  }

  /**
   * Digitize with retry logic
   */
  async digitize(source: ImageSource): Promise<RobustDigitizerResult> {
    const attempts: Array<{
      result: DigitizerResult;
      validation: CrossLeadValidationResult | null;
      score: number;
    }> = [];

    let bestAttempt: typeof attempts[0] | null = null;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      // Create fresh digitizer for each attempt (AI may give different results)
      const digitizer = new ECGDigitizer({
        aiProvider: this.config.aiProvider,
        apiKey: this.config.apiKey,
        model: this.config.model,
        aiConfidenceThreshold: this.config.aiConfidenceThreshold,
        enableLocalFallback: this.config.enableLocalFallback,
        enableInteractive: this.config.enableInteractive,
        targetSampleRate: this.config.targetSampleRate,
        onProgress: this.config.onProgress,
        interactive: this.config.interactive,
      });

      const result = await digitizer.digitize(source);

      // Validate using cross-lead relationships
      let validation: CrossLeadValidationResult | null = null;
      let score = 0;

      if (result.success && result.signal) {
        validation = validateCrossLeadRelationships(result.signal);
        score = this.calculateScore(result, validation);
      }

      const attemptData = { result, validation, score };
      attempts.push(attemptData);

      // Notify callback
      this.config.onAttempt?.(attempt, result, validation);

      // Track best attempt
      if (!bestAttempt || score > bestAttempt.score) {
        bestAttempt = attemptData;
      }

      // Early accept if score is high enough
      if (score >= this.calculateEarlyAcceptScore()) {
        break;
      }

      // If this attempt failed completely, continue to next
      if (!result.success) {
        continue;
      }
    }

    // Return best result
    if (!bestAttempt) {
      // All attempts failed - return the last one
      const lastAttempt = attempts[attempts.length - 1];
      return this.buildResult(lastAttempt.result, attempts.length, null, 0);
    }

    return this.buildResult(
      bestAttempt.result,
      attempts.length,
      bestAttempt.validation,
      bestAttempt.score
    );
  }

  /**
   * Calculate score for an attempt based on cross-lead validation
   */
  private calculateScore(result: DigitizerResult, validation: CrossLeadValidationResult): number {
    let score = 0;

    // Einthoven correlation is the primary signal quality indicator (0-1)
    // Weight it heavily: 0-50 points
    score += Math.max(0, validation.einthovenCorrelation) * 50;

    // Augmented leads consistency (lower is better)
    // Normalize: if sum < 0.2, full points; if > 1.0, zero points
    const augmentedScore = Math.max(0, 1 - validation.augmentedLeadsSum / 0.5);
    score += augmentedScore * 20;

    // Number of leads extracted (more is better)
    // 12 leads = 30 points, proportional for fewer
    const leadCount = Object.keys(result.signal?.leads || {}).length;
    score += (leadCount / 12) * 30;

    return score;
  }

  /**
   * Calculate threshold score for early acceptance
   */
  private calculateEarlyAcceptScore(): number {
    // einthoven > 0.8 contributes 40+ points
    // augmented < 0.2 contributes ~18+ points
    // 12 leads contributes 30 points
    // Total: ~88+ points for excellent result
    return this.config.earlyAcceptThreshold * 50 + 38;
  }

  /**
   * Build the final result
   */
  private buildResult(
    result: DigitizerResult,
    attemptsMade: number,
    validation: CrossLeadValidationResult | null,
    score: number
  ): RobustDigitizerResult {
    const robustResult: RobustDigitizerResult = {
      ...result,
      attemptsMade,
    };

    if (validation) {
      robustResult.crossLeadValidation = validation;
      robustResult.scoreBreakdown = {
        einthovenCorrelation: validation.einthovenCorrelation,
        augmentedLeadsScore: Math.max(0, 1 - validation.augmentedLeadsSum / 0.5),
        leadCount: Object.keys(result.signal?.leads || {}).length,
        totalScore: score,
      };

      // Add validation suggestions to result suggestions
      if (validation.suggestions.length > 0) {
        robustResult.suggestions = [
          ...(result.suggestions || []),
          ...validation.suggestions,
        ];
      }

      // If validation found issues, add them
      if (!validation.overallValid) {
        robustResult.issues = [
          ...(result.issues || []),
          {
            code: 'CROSS_LEAD_VALIDATION',
            severity: 'warning' as const,
            message: `Cross-lead validation: Einthoven correlation ${validation.einthovenCorrelation.toFixed(2)}`,
          },
        ];
      }
    }

    return robustResult;
  }
}

/**
 * Convenience function for robust digitization
 */
export async function robustDigitizePNG(
  source: ImageSource,
  config?: RobustDigitizerConfig
): Promise<RobustDigitizerResult> {
  const digitizer = new RobustECGDigitizer(config);
  return digitizer.digitize(source);
}
