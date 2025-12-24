/**
 * Pause Detection Module
 *
 * Detects significant pauses in ECG rhythm including:
 * - Sinus pauses (sinus arrest)
 * - Sinoatrial (SA) exit block
 * - High-grade AV block pauses
 * - Post-ectopic pauses (compensatory vs non-compensatory)
 * - Asystole detection
 *
 * Clinical significance:
 * - Pauses >3 seconds are generally considered clinically significant
 * - Pauses >2 seconds during wakefulness warrant investigation
 * - Pauses during sleep (up to 2-3 seconds) may be normal
 *
 * @module signal/pause-detector
 */

import { estimateBaselineRR } from './utils';

// =============================================================================
// Types
// =============================================================================

/**
 * Types of pauses that can be detected
 */
export type PauseType =
  | 'sinus_pause'        // Sinus arrest - no P waves during pause
  | 'sa_block'           // SA exit block - P wave interval multiple of baseline
  | 'av_block'           // High-grade AV block - P waves without QRS
  | 'post_pvc'           // Post-PVC compensatory pause
  | 'post_pac'           // Post-PAC non-compensatory pause
  | 'post_escape'        // Pause after escape beat
  | 'undetermined'       // Cannot determine mechanism
  | 'artifact';          // Likely artifact or signal loss

/**
 * Clinical significance level
 */
export type PauseSignificance =
  | 'normal'             // Within normal limits (e.g., nocturnal)
  | 'mild'               // Mildly prolonged (1.5-2x baseline)
  | 'moderate'           // Moderately prolonged (2-3x baseline)
  | 'severe'             // Severely prolonged (>3x baseline)
  | 'critical';          // Critical (>3 seconds or symptomatic concern)

/**
 * Individual pause detection
 */
export interface PauseDetection {
  /** Index of the RR interval where pause starts (beat before pause) */
  startBeatIndex: number;

  /** Index of the beat after the pause */
  endBeatIndex: number;

  /** Start time in seconds */
  startTime: number;

  /** End time in seconds */
  endTime: number;

  /** Duration of the pause in milliseconds */
  durationMs: number;

  /** Ratio to baseline RR interval */
  ratioToBaseline: number;

  /** Type of pause */
  type: PauseType;

  /** Clinical significance */
  significance: PauseSignificance;

  /** Confidence in detection (0-1) */
  confidence: number;

  /** Associated P waves during pause (for SA/AV block differentiation) */
  pWavesDuringPause?: number;

  /** Expected number of cycles (for SA block) */
  expectedCycles?: number;

  /** Notes about the pause */
  notes: string[];
}

/**
 * Statistics about compensatory behavior
 */
export interface CompensatoryAnalysis {
  /** Total RR interval spanning the ectopic (before + during ectopic + after) */
  totalIntervalMs: number;

  /** Expected interval (2x baseline PP) for full compensation */
  expectedFullCompensationMs: number;

  /** Ratio of actual to expected (1.0 = full compensation) */
  compensatoryRatio: number;

  /** Is this a full compensatory pause */
  isFullCompensatory: boolean;

  /** Is this a non-compensatory (less than full) pause */
  isNonCompensatory: boolean;
}

/**
 * Summary of pause analysis
 */
export interface PauseAnalysisSummary {
  /** All detected pauses */
  pauses: PauseDetection[];

  /** Number of pauses detected */
  totalPauses: number;

  /** Number of clinically significant pauses (>2 seconds) */
  significantPauses: number;

  /** Maximum pause duration in milliseconds */
  maxPauseDurationMs: number;

  /** Maximum pause ratio to baseline */
  maxPauseRatio: number;

  /** Baseline RR interval used for calculations (median) */
  baselineRRMs: number;

  /** Pause burden (% of recording time in pauses) */
  pauseBurdenPercent: number;

  /** Count by type */
  countByType: Record<PauseType, number>;

  /** Count by significance */
  countBySignificance: Record<PauseSignificance, number>;

  /** Clinical interpretation */
  interpretation: string[];

  /** Recommendations */
  recommendations: string[];
}

/**
 * Configuration for pause detection
 */
export interface PauseDetectionConfig {
  /** Minimum pause duration to report (ms), default: 1500 */
  minPauseDurationMs?: number;

  /** Ratio threshold to baseline RR for pause detection, default: 1.5 */
  ratioThreshold?: number;

  /** Duration threshold for "clinically significant" (ms), default: 2000 */
  significantThresholdMs?: number;

  /** Duration threshold for "critical" pause (ms), default: 3000 */
  criticalThresholdMs?: number;

  /** Baseline RR interval (ms) - auto-calculated if not provided */
  baselineRRMs?: number;

  /** Include post-ectopic pauses, default: true */
  includePostEctopicPauses?: boolean;

  /** Beat classifications (for ectopy identification) */
  beatClasses?: string[];

  /** P wave indices (for SA/AV block differentiation) */
  pWaveIndices?: number[];
}

// =============================================================================
// Pause Detector Class
// =============================================================================

/**
 * Detects and classifies pauses in ECG rhythm
 */
export class PauseDetector {
  private config: Required<PauseDetectionConfig>;

  constructor(config: PauseDetectionConfig = {}) {
    this.config = {
      minPauseDurationMs: config.minPauseDurationMs ?? 1500,
      ratioThreshold: config.ratioThreshold ?? 1.5,
      significantThresholdMs: config.significantThresholdMs ?? 2000,
      criticalThresholdMs: config.criticalThresholdMs ?? 3000,
      baselineRRMs: config.baselineRRMs ?? 0,
      includePostEctopicPauses: config.includePostEctopicPauses ?? true,
      beatClasses: config.beatClasses ?? [],
      pWaveIndices: config.pWaveIndices ?? [],
    };
  }

  /**
   * Analyze RR intervals for pauses
   *
   * @param rPeakIndices Sample indices of R peaks
   * @param sampleRate Sample rate in Hz
   * @returns Pause analysis summary
   */
  analyze(rPeakIndices: number[], sampleRate: number): PauseAnalysisSummary {
    // Calculate RR intervals
    const rrIntervalsMs: number[] = [];
    for (let i = 1; i < rPeakIndices.length; i++) {
      const rrMs = ((rPeakIndices[i] - rPeakIndices[i - 1]) / sampleRate) * 1000;
      rrIntervalsMs.push(rrMs);
    }

    if (rrIntervalsMs.length < 3) {
      return this.createEmptySummary();
    }

    // Calculate baseline RR (median of non-outlier intervals)
    const baselineRRMs = this.config.baselineRRMs || this.calculateBaselineRR(rrIntervalsMs);

    // Detect pauses
    const pauses: PauseDetection[] = [];

    for (let i = 0; i < rrIntervalsMs.length; i++) {
      const rrMs = rrIntervalsMs[i];
      const ratio = rrMs / baselineRRMs;

      // Check if this is a pause
      if (
        rrMs >= this.config.minPauseDurationMs &&
        ratio >= this.config.ratioThreshold
      ) {
        // Determine pause type
        const pauseType = this.classifyPause(
          i,
          rrIntervalsMs,
          baselineRRMs
        );

        // Skip post-ectopic pauses if configured
        if (!this.config.includePostEctopicPauses && this.isPostEctopicPause(pauseType)) {
          continue;
        }

        // Calculate timing
        const startBeatIndex = i;
        const endBeatIndex = i + 1;
        const startTime = rPeakIndices[i] / sampleRate;
        const endTime = rPeakIndices[i + 1] / sampleRate;

        // Determine significance
        const significance = this.assessSignificance(rrMs, ratio);

        // Build pause detection
        const pause: PauseDetection = {
          startBeatIndex,
          endBeatIndex,
          startTime,
          endTime,
          durationMs: rrMs,
          ratioToBaseline: ratio,
          type: pauseType,
          significance,
          confidence: this.calculateConfidence(rrMs, ratio, pauseType),
          notes: this.generateNotes(rrMs, ratio, pauseType, significance),
        };

        // Add P wave analysis if available
        if (this.config.pWaveIndices.length > 0) {
          pause.pWavesDuringPause = this.countPWavesDuringPause(
            rPeakIndices[i],
            rPeakIndices[i + 1]
          );

          if (pauseType === 'sa_block') {
            pause.expectedCycles = Math.round(ratio);
          }
        }

        // Add compensatory analysis for post-ectopic pauses
        if (this.isPostEctopicPause(pauseType) && i > 0 && i < rrIntervalsMs.length - 1) {
          const compAnalysis = this.analyzeCompensation(
            rrIntervalsMs[i - 1],
            rrIntervalsMs[i],
            baselineRRMs
          );
          pause.notes.push(
            compAnalysis.isFullCompensatory
              ? 'Full compensatory pause'
              : 'Non-compensatory pause'
          );
        }

        pauses.push(pause);
      }
    }

    // Generate summary
    return this.generateSummary(pauses, baselineRRMs, rrIntervalsMs, sampleRate);
  }

  /**
   * Calculate baseline RR interval using robust median (delegated to utility)
   */
  private calculateBaselineRR(rrIntervalsMs: number[]): number {
    return estimateBaselineRR(rrIntervalsMs);
  }

  /**
   * Classify the type of pause
   */
  private classifyPause(
    intervalIndex: number,
    rrIntervalsMs: number[],
    baselineRRMs: number
  ): PauseType {
    const pauseDuration = rrIntervalsMs[intervalIndex];
    const ratio = pauseDuration / baselineRRMs;

    // Check for artifact (very long pause with sudden return to normal)
    if (ratio > 5 && this.looksLikeArtifact(intervalIndex, rrIntervalsMs, baselineRRMs)) {
      return 'artifact';
    }

    // Check beat classification for ectopy
    if (this.config.beatClasses.length > 0 && intervalIndex > 0) {
      const precedingBeatClass = this.config.beatClasses[intervalIndex];

      if (precedingBeatClass === 'V') {
        // Preceded by PVC
        const compAnalysis = this.analyzeCompensation(
          intervalIndex > 0 ? rrIntervalsMs[intervalIndex - 1] : baselineRRMs,
          pauseDuration,
          baselineRRMs
        );

        return compAnalysis.isFullCompensatory ? 'post_pvc' : 'post_pvc';
      }

      if (precedingBeatClass === 'S') {
        // Preceded by PAC
        return 'post_pac';
      }

      if (precedingBeatClass === 'F' || precedingBeatClass === 'J') {
        // Preceded by escape beat
        return 'post_escape';
      }
    }

    // Check for SA block pattern (integer multiple of baseline)
    const nearestMultiple = Math.round(ratio);
    const multipleDeviation = Math.abs(ratio - nearestMultiple) / nearestMultiple;

    if (nearestMultiple >= 2 && multipleDeviation < 0.1) {
      // Could be SA block - pause is close to integer multiple of baseline
      // Need P wave information to confirm
      if (this.config.pWaveIndices.length > 0) {
        // If we have P wave data, use it
        return 'sa_block';
      }
      // Without P wave data, still likely SA block
      return 'sa_block';
    }

    // Check P wave patterns if available
    if (this.config.pWaveIndices.length > 0) {
      // This would require more sophisticated analysis of P waves during pause
      // For now, classify based on ratio
    }

    // Default to sinus pause if we can't determine mechanism
    if (ratio >= 2) {
      return 'sinus_pause';
    }

    return 'undetermined';
  }

  /**
   * Check if pause looks like artifact
   */
  private looksLikeArtifact(
    intervalIndex: number,
    rrIntervalsMs: number[],
    baselineRRMs: number
  ): boolean {
    // Check if intervals before and after are normal
    const before = intervalIndex > 0 ? rrIntervalsMs[intervalIndex - 1] : baselineRRMs;
    const after =
      intervalIndex < rrIntervalsMs.length - 1
        ? rrIntervalsMs[intervalIndex + 1]
        : baselineRRMs;

    const beforeNormal = Math.abs(before - baselineRRMs) / baselineRRMs < 0.2;
    const afterNormal = Math.abs(after - baselineRRMs) / baselineRRMs < 0.2;

    // If both surrounding intervals are perfectly normal, suspicious for artifact
    return beforeNormal && afterNormal;
  }

  /**
   * Check if pause type is post-ectopic
   */
  private isPostEctopicPause(type: PauseType): boolean {
    return type === 'post_pvc' || type === 'post_pac' || type === 'post_escape';
  }

  /**
   * Analyze compensatory nature of pause
   */
  private analyzeCompensation(
    preEctopicRRMs: number,
    pauseRRMs: number,
    baselineRRMs: number
  ): CompensatoryAnalysis {
    // For full compensation: pre-ectopic + pause = 2 × baseline
    const totalInterval = preEctopicRRMs + pauseRRMs;
    const expectedFull = 2 * baselineRRMs;
    const ratio = totalInterval / expectedFull;

    return {
      totalIntervalMs: totalInterval,
      expectedFullCompensationMs: expectedFull,
      compensatoryRatio: ratio,
      isFullCompensatory: ratio >= 0.95 && ratio <= 1.05,
      isNonCompensatory: ratio < 0.95,
    };
  }

  /**
   * Count P waves during a pause interval
   */
  private countPWavesDuringPause(startSample: number, endSample: number): number {
    let count = 0;
    for (const pIdx of this.config.pWaveIndices) {
      if (pIdx > startSample && pIdx < endSample) {
        count++;
      }
    }
    return count;
  }

  /**
   * Assess clinical significance of pause
   */
  private assessSignificance(durationMs: number, ratio: number): PauseSignificance {
    if (durationMs >= this.config.criticalThresholdMs) {
      return 'critical';
    }

    if (durationMs >= this.config.significantThresholdMs) {
      return 'severe';
    }

    if (ratio >= 2.0) {
      return 'moderate';
    }

    if (ratio >= 1.5) {
      return 'mild';
    }

    return 'normal';
  }

  /**
   * Calculate confidence in pause detection
   */
  private calculateConfidence(
    durationMs: number,
    ratio: number,
    type: PauseType
  ): number {
    let confidence = 0.8;

    // Longer pauses are more certain
    if (durationMs >= 2000) confidence += 0.1;
    if (durationMs >= 3000) confidence += 0.1;

    // Higher ratios are more certain
    if (ratio >= 2.0) confidence += 0.05;
    if (ratio >= 3.0) confidence += 0.05;

    // Type-specific adjustments
    if (type === 'artifact') confidence -= 0.3;
    if (type === 'undetermined') confidence -= 0.2;

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Generate notes about the pause
   */
  private generateNotes(
    durationMs: number,
    ratio: number,
    type: PauseType,
    significance: PauseSignificance
  ): string[] {
    const notes: string[] = [];

    // Duration note
    notes.push(`Duration: ${durationMs.toFixed(0)}ms (${ratio.toFixed(1)}× baseline)`);

    // Type-specific notes
    switch (type) {
      case 'sinus_pause':
        notes.push('Sinus pause - likely sinus node dysfunction');
        break;
      case 'sa_block':
        notes.push(`SA exit block - ${Math.round(ratio)}:1 pattern`);
        break;
      case 'av_block':
        notes.push('High-grade AV block - P waves present without QRS');
        break;
      case 'post_pvc':
        notes.push('Post-PVC compensatory pause');
        break;
      case 'post_pac':
        notes.push('Post-PAC pause (usually non-compensatory)');
        break;
      case 'post_escape':
        notes.push('Pause following escape beat');
        break;
      case 'artifact':
        notes.push('Possible artifact - review signal quality');
        break;
    }

    // Significance notes
    if (significance === 'critical') {
      notes.push('⚠️ CRITICAL: Pause >3 seconds');
    } else if (significance === 'severe') {
      notes.push('Clinically significant pause');
    }

    return notes;
  }

  /**
   * Generate summary of pause analysis
   */
  private generateSummary(
    pauses: PauseDetection[],
    baselineRRMs: number,
    allRRIntervalsMs: number[],
    _sampleRate: number
  ): PauseAnalysisSummary {
    // Count by type
    const countByType: Record<PauseType, number> = {
      sinus_pause: 0,
      sa_block: 0,
      av_block: 0,
      post_pvc: 0,
      post_pac: 0,
      post_escape: 0,
      undetermined: 0,
      artifact: 0,
    };

    const countBySignificance: Record<PauseSignificance, number> = {
      normal: 0,
      mild: 0,
      moderate: 0,
      severe: 0,
      critical: 0,
    };

    let maxDuration = 0;
    let maxRatio = 0;
    let totalPauseDuration = 0;

    for (const pause of pauses) {
      countByType[pause.type]++;
      countBySignificance[pause.significance]++;

      if (pause.durationMs > maxDuration) {
        maxDuration = pause.durationMs;
        maxRatio = pause.ratioToBaseline;
      }

      totalPauseDuration += pause.durationMs;
    }

    // Calculate recording duration
    const totalRecordingMs = allRRIntervalsMs.reduce((sum, rr) => sum + rr, 0);
    const pauseBurden = totalRecordingMs > 0
      ? (totalPauseDuration / totalRecordingMs) * 100
      : 0;

    // Count significant pauses
    const significantPauses =
      countBySignificance.severe +
      countBySignificance.critical;

    // Generate interpretation
    const interpretation = this.generateInterpretation(
      pauses,
      maxDuration,
      countByType,
      significantPauses
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      pauses,
      maxDuration,
      significantPauses
    );

    return {
      pauses,
      totalPauses: pauses.length,
      significantPauses,
      maxPauseDurationMs: maxDuration,
      maxPauseRatio: maxRatio,
      baselineRRMs,
      pauseBurdenPercent: pauseBurden,
      countByType,
      countBySignificance,
      interpretation,
      recommendations,
    };
  }

  /**
   * Generate clinical interpretation
   */
  private generateInterpretation(
    pauses: PauseDetection[],
    maxDurationMs: number,
    countByType: Record<PauseType, number>,
    significantCount: number
  ): string[] {
    const interpretations: string[] = [];

    if (pauses.length === 0) {
      interpretations.push('No significant pauses detected');
      return interpretations;
    }

    // Overall summary
    interpretations.push(
      `${pauses.length} pause(s) detected, ${significantCount} clinically significant`
    );

    // Max pause
    if (maxDurationMs >= 3000) {
      interpretations.push(
        `Maximum pause: ${(maxDurationMs / 1000).toFixed(1)} seconds (critical)`
      );
    } else if (maxDurationMs >= 2000) {
      interpretations.push(
        `Maximum pause: ${(maxDurationMs / 1000).toFixed(1)} seconds (significant)`
      );
    }

    // Type-specific interpretations
    if (countByType.sinus_pause > 0) {
      interpretations.push(
        `${countByType.sinus_pause} sinus pause(s) - consider sinus node dysfunction`
      );
    }

    if (countByType.sa_block > 0) {
      interpretations.push(
        `${countByType.sa_block} SA block episode(s) - suggests sinoatrial conduction disease`
      );
    }

    if (countByType.av_block > 0) {
      interpretations.push(
        `${countByType.av_block} high-grade AV block pause(s) - significant conduction disease`
      );
    }

    const postEctopic = countByType.post_pvc + countByType.post_pac;
    if (postEctopic > 0) {
      interpretations.push(
        `${postEctopic} post-ectopic pause(s) - physiological response`
      );
    }

    return interpretations;
  }

  /**
   * Generate clinical recommendations
   */
  private generateRecommendations(
    pauses: PauseDetection[],
    maxDurationMs: number,
    significantCount: number
  ): string[] {
    const recommendations: string[] = [];

    if (pauses.length === 0) {
      return recommendations;
    }

    // Critical pauses
    if (maxDurationMs >= 3000) {
      recommendations.push('⚠️ URGENT: Pauses >3 seconds warrant immediate evaluation');
      recommendations.push('Consider cardiology consultation');
      recommendations.push('Evaluate for pacemaker indication');
    } else if (significantCount > 0) {
      recommendations.push('Clinically significant pauses detected');
      recommendations.push('Recommend extended rhythm monitoring (Holter)');
      recommendations.push('Correlate with symptoms');
    }

    // Pattern-specific recommendations
    const sinusPauses = pauses.filter((p) => p.type === 'sinus_pause').length;
    const saBlocks = pauses.filter((p) => p.type === 'sa_block').length;

    if (sinusPauses > 0 || saBlocks > 0) {
      recommendations.push('Evaluate for sick sinus syndrome');
      recommendations.push('Review medications that affect SA node (beta-blockers, calcium channel blockers)');
    }

    const avBlocks = pauses.filter((p) => p.type === 'av_block').length;
    if (avBlocks > 0) {
      recommendations.push('Evaluate for AV conduction disease');
      recommendations.push('Consider EP study if symptomatic');
    }

    return recommendations;
  }

  /**
   * Create empty summary
   */
  private createEmptySummary(): PauseAnalysisSummary {
    return {
      pauses: [],
      totalPauses: 0,
      significantPauses: 0,
      maxPauseDurationMs: 0,
      maxPauseRatio: 0,
      baselineRRMs: 0,
      pauseBurdenPercent: 0,
      countByType: {
        sinus_pause: 0,
        sa_block: 0,
        av_block: 0,
        post_pvc: 0,
        post_pac: 0,
        post_escape: 0,
        undetermined: 0,
        artifact: 0,
      },
      countBySignificance: {
        normal: 0,
        mild: 0,
        moderate: 0,
        severe: 0,
        critical: 0,
      },
      interpretation: ['Insufficient data for pause analysis'],
      recommendations: [],
    };
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Detect pauses in ECG signal
 *
 * @param rPeakIndices Sample indices of R peaks
 * @param sampleRate Sample rate in Hz
 * @param config Optional configuration
 * @returns Pause analysis summary
 */
export function detectPauses(
  rPeakIndices: number[],
  sampleRate: number,
  config?: PauseDetectionConfig
): PauseAnalysisSummary {
  const detector = new PauseDetector(config);
  return detector.analyze(rPeakIndices, sampleRate);
}

/**
 * Check if any critical pauses exist
 */
export function hasCriticalPauses(summary: PauseAnalysisSummary): boolean {
  return summary.countBySignificance.critical > 0;
}

/**
 * Check if any significant pauses exist (>2 seconds)
 */
export function hasSignificantPauses(summary: PauseAnalysisSummary): boolean {
  return summary.significantPauses > 0;
}

/**
 * Get longest pause
 */
export function getLongestPause(summary: PauseAnalysisSummary): PauseDetection | null {
  if (summary.pauses.length === 0) return null;

  return summary.pauses.reduce((longest, current) =>
    current.durationMs > longest.durationMs ? current : longest
  );
}

/**
 * Get pauses of specific type
 */
export function getPausesByType(
  summary: PauseAnalysisSummary,
  type: PauseType
): PauseDetection[] {
  return summary.pauses.filter((p) => p.type === type);
}

/**
 * Calculate pause statistics over time periods
 */
export function analyzePauseDistribution(
  pauses: PauseDetection[],
  periodSeconds: number = 3600 // Default: hourly
): Map<number, number> {
  const distribution = new Map<number, number>();

  for (const pause of pauses) {
    const period = Math.floor(pause.startTime / periodSeconds);
    distribution.set(period, (distribution.get(period) || 0) + 1);
  }

  return distribution;
}

/**
 * Determine if pauses suggest pacemaker indication
 */
export function evaluatePacemakerIndication(
  summary: PauseAnalysisSummary
): {
  indicated: boolean;
  class: 'I' | 'IIa' | 'IIb' | 'III' | 'unknown';
  reasoning: string[];
} {
  const reasoning: string[] = [];
  let indicationClass: 'I' | 'IIa' | 'IIb' | 'III' | 'unknown' = 'unknown';

  // Class I (Strong indication)
  if (summary.maxPauseDurationMs >= 3000) {
    reasoning.push('Pauses ≥3 seconds documented');
    indicationClass = 'I';
  }

  // Class IIa (Reasonable indication)
  if (
    indicationClass === 'unknown' &&
    summary.countByType.sinus_pause + summary.countByType.sa_block >= 3
  ) {
    reasoning.push('Multiple sinus pauses/SA block episodes');
    indicationClass = 'IIa';
  }

  // Class IIb (May be considered)
  if (
    indicationClass === 'unknown' &&
    summary.significantPauses > 0
  ) {
    reasoning.push('Significant pauses present but not meeting Class I/IIa criteria');
    indicationClass = 'IIb';
  }

  // Class III (Not indicated)
  if (indicationClass === 'unknown') {
    reasoning.push('No significant pauses meeting pacemaker criteria');
    indicationClass = 'III';
  }

  // Note: This is a simplified assessment. Real clinical decisions require:
  // - Symptom correlation
  // - Holter monitoring
  // - Medication review
  // - EP study if indicated
  reasoning.push('Note: Clinical correlation required - this is automated analysis only');

  return {
    indicated: indicationClass === 'I' || indicationClass === 'IIa',
    class: indicationClass,
    reasoning,
  };
}
