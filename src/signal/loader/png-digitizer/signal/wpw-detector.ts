/**
 * WPW (Wolff-Parkinson-White) and Pre-excitation Detection
 *
 * Detects accessory pathway conduction patterns:
 * - Delta waves (slurred QRS upstroke)
 * - Short PR interval (< 120ms)
 * - Wide QRS (> 110ms) due to ventricular pre-excitation
 *
 * Clinical Importance:
 * - Risk of sudden cardiac death with AF
 * - Contraindication for certain antiarrhythmics (AV nodal blockers)
 * - Requires evaluation before anesthesia
 *
 * Algorithm based on:
 * - ACC/AHA/HRS guidelines for accessory pathway evaluation
 * - Morphology analysis for delta wave detection
 *
 * @module signal/loader/png-digitizer/signal/wpw-detector
 */

import type { LeadName } from '../../../../types';
import type { BeatAnnotation } from './fiducial-detector';

// ============================================================================
// Types
// ============================================================================

/**
 * Delta wave detection result for a single beat
 */
export interface DeltaWaveDetection {
  /** Delta wave present */
  detected: boolean;
  /** Delta wave duration (ms) - slurring duration */
  duration: number;
  /** Delta wave amplitude (µV) */
  amplitude: number;
  /** Delta wave polarity */
  polarity: 'positive' | 'negative' | 'isoelectric';
  /** Leads where delta wave is visible */
  presentInLeads: LeadName[];
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Accessory pathway localization
 */
export type AccessoryPathwayLocation =
  | 'left_lateral'
  | 'left_posteroseptal'
  | 'left_posterior'
  | 'posteroseptal'
  | 'right_posteroseptal'
  | 'right_lateral'
  | 'right_anterior'
  | 'right_anteroseptal'
  | 'anteroseptal'
  | 'unknown';

/**
 * Pre-excitation pattern classification
 */
export type PreexcitationType =
  | 'manifest_wpw'      // Classic WPW with delta wave
  | 'intermittent_wpw'  // Delta wave appears intermittently
  | 'concealed_bypass'  // Only retrograde conduction (no delta)
  | 'lgl_syndrome'      // Short PR without delta (Lown-Ganong-Levine)
  | 'enhanced_avn'      // Enhanced AV nodal conduction
  | 'mahaim_fiber'      // Atriofascicular pathway
  | 'none';

/**
 * Complete WPW/pre-excitation analysis result
 */
export interface WPWAnalysisResult {
  /** Pre-excitation detected */
  preexcitationDetected: boolean;
  /** Type of pre-excitation pattern */
  patternType: PreexcitationType;
  /** Delta wave analysis */
  deltaWave: DeltaWaveDetection;
  /** PR interval (ms) */
  prInterval: number | null;
  /** QRS duration (ms) */
  qrsDuration: number;
  /** Short PR present (< 120ms) */
  shortPR: boolean;
  /** Wide QRS present (> 110ms) */
  wideQRS: boolean;
  /** Estimated accessory pathway location */
  pathwayLocation: AccessoryPathwayLocation;
  /** Localization confidence (0-1) */
  localizationConfidence: number;
  /** Delta wave polarity pattern for localization */
  deltaWavePolarityPattern: Partial<Record<LeadName, 'positive' | 'negative' | 'isoelectric'>>;
  /** Clinical risk assessment */
  riskAssessment: WPWRiskAssessment;
  /** Recommendations */
  recommendations: string[];
  /** Confidence in overall diagnosis (0-1) */
  confidence: number;
  /** Number of beats analyzed */
  beatsAnalyzed: number;
}

/**
 * Risk assessment for WPW
 */
export interface WPWRiskAssessment {
  /** Risk level */
  level: 'high' | 'intermediate' | 'low' | 'undetermined';
  /** Factors contributing to risk */
  factors: string[];
  /** Shortest pre-excited RR if AF (estimated from pathway properties) */
  estimatedSPRR?: number;
}

// ============================================================================
// WPW Detector
// ============================================================================

export class WPWDetector {
  private sampleRate: number;

  // Thresholds
  private readonly SHORT_PR_THRESHOLD = 120; // ms
  private readonly WIDE_QRS_THRESHOLD = 110; // ms
  private readonly DELTA_WAVE_MIN_DURATION = 20; // ms
  private readonly DELTA_WAVE_MAX_DURATION = 60; // ms

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /**
   * Analyze ECG for WPW/pre-excitation
   */
  analyze(
    beatAnnotations: BeatAnnotation[],
    leadData: Partial<Record<LeadName, number[]>>
  ): WPWAnalysisResult {
    if (beatAnnotations.length === 0) {
      return this.createNegativeResult();
    }

    // Analyze multiple beats for consistency
    const beatResults: {
      deltaWave: DeltaWaveDetection;
      prInterval: number | null;
      qrsDuration: number;
    }[] = [];

    for (const beat of beatAnnotations) {
      if (beat.quality < 0.5) continue;

      const deltaWave = this.detectDeltaWave(beat, leadData);
      beatResults.push({
        deltaWave,
        prInterval: beat.prInterval,
        qrsDuration: beat.qrsDuration,
      });
    }

    if (beatResults.length === 0) {
      return this.createNegativeResult();
    }

    // Aggregate results
    const aggregatedDeltaWave = this.aggregateDeltaWaveResults(beatResults.map(b => b.deltaWave));

    const prIntervals = beatResults
      .map(b => b.prInterval)
      .filter((pr): pr is number => pr !== null && pr > 50 && pr < 300);
    const avgPR = prIntervals.length > 0
      ? prIntervals.reduce((a, b) => a + b, 0) / prIntervals.length
      : null;

    const qrsDurations = beatResults
      .map(b => b.qrsDuration)
      .filter(qrs => qrs > 40 && qrs < 200);
    const avgQRS = qrsDurations.length > 0
      ? qrsDurations.reduce((a, b) => a + b, 0) / qrsDurations.length
      : 100;

    const shortPR = avgPR !== null && avgPR < this.SHORT_PR_THRESHOLD;
    const wideQRS = avgQRS > this.WIDE_QRS_THRESHOLD;

    // Determine pattern type
    const patternType = this.determinePatternType(
      aggregatedDeltaWave.detected,
      shortPR,
      wideQRS
    );

    // Localize pathway if WPW detected
    let pathwayLocation: AccessoryPathwayLocation = 'unknown';
    let localizationConfidence = 0;
    let deltaWavePolarityPattern: Partial<Record<LeadName, 'positive' | 'negative' | 'isoelectric'>> = {};

    if (aggregatedDeltaWave.detected) {
      const localization = this.localizePathway(beatAnnotations, leadData);
      pathwayLocation = localization.location;
      localizationConfidence = localization.confidence;
      deltaWavePolarityPattern = localization.polarityPattern;
    }

    // Risk assessment
    const riskAssessment = this.assessRisk(patternType, aggregatedDeltaWave, avgPR);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      patternType,
      riskAssessment,
      pathwayLocation
    );

    // Overall confidence
    const confidence = this.calculateOverallConfidence(
      aggregatedDeltaWave,
      shortPR,
      wideQRS,
      beatResults.length
    );

    const preexcitationDetected = patternType !== 'none';

    return {
      preexcitationDetected,
      patternType,
      deltaWave: aggregatedDeltaWave,
      prInterval: avgPR,
      qrsDuration: avgQRS,
      shortPR,
      wideQRS,
      pathwayLocation,
      localizationConfidence,
      deltaWavePolarityPattern,
      riskAssessment,
      recommendations,
      confidence,
      beatsAnalyzed: beatResults.length,
    };
  }

  /**
   * Detect delta wave in a single beat
   */
  private detectDeltaWave(
    beat: BeatAnnotation,
    leadData: Partial<Record<LeadName, number[]>>
  ): DeltaWaveDetection {
    const presentInLeads: LeadName[] = [];
    let totalDuration = 0;
    let totalAmplitude = 0;
    let count = 0;
    let positiveCount = 0;
    let negativeCount = 0;

    const leadsToAnalyze: LeadName[] = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

    for (const leadName of leadsToAnalyze) {
      const signal = leadData[leadName];
      if (!signal) continue;

      const deltaResult = this.analyzeDeltaWaveInLead(signal, beat);

      if (deltaResult.detected) {
        presentInLeads.push(leadName);
        totalDuration += deltaResult.duration;
        totalAmplitude += Math.abs(deltaResult.amplitude);
        count++;

        if (deltaResult.polarity === 'positive') positiveCount++;
        else if (deltaResult.polarity === 'negative') negativeCount++;
      }
    }

    if (count < 3) {
      return {
        detected: false,
        duration: 0,
        amplitude: 0,
        polarity: 'isoelectric',
        presentInLeads: [],
        confidence: 0.2,
      };
    }

    const avgDuration = totalDuration / count;
    const avgAmplitude = totalAmplitude / count;

    // Predominant polarity
    let polarity: 'positive' | 'negative' | 'isoelectric' = 'isoelectric';
    if (positiveCount > negativeCount + 2) polarity = 'positive';
    else if (negativeCount > positiveCount + 2) polarity = 'negative';

    // Confidence based on consistency across leads
    const confidence = Math.min(1, (count / leadsToAnalyze.length) + 0.3);

    return {
      detected: true,
      duration: avgDuration,
      amplitude: avgAmplitude,
      polarity,
      presentInLeads,
      confidence,
    };
  }

  /**
   * Analyze delta wave in single lead
   */
  private analyzeDeltaWaveInLead(
    signal: number[],
    beat: BeatAnnotation
  ): { detected: boolean; duration: number; amplitude: number; polarity: 'positive' | 'negative' | 'isoelectric' } {
    const qrsOnset = beat.qrs.onset.index;
    const rPeak = beat.qrs.rPeak.index;

    if (rPeak <= qrsOnset) {
      return { detected: false, duration: 0, amplitude: 0, polarity: 'isoelectric' };
    }

    // Look for slurred upstroke (delta wave)
    // Delta wave: slow initial deflection < 40ms duration

    // Calculate derivative (slope) in initial QRS portion
    const searchEnd = Math.min(
      qrsOnset + Math.round(this.DELTA_WAVE_MAX_DURATION * this.sampleRate / 1000),
      rPeak
    );

    const slopes: number[] = [];
    for (let i = qrsOnset + 1; i < searchEnd; i++) {
      slopes.push(signal[i] - signal[i - 1]);
    }

    if (slopes.length < 5) {
      return { detected: false, duration: 0, amplitude: 0, polarity: 'isoelectric' };
    }

    // Delta wave characteristics:
    // 1. Initial slope is gradual (smaller than steep QRS portion)
    // 2. Followed by steeper QRS upstroke

    // Find where slope significantly increases (end of delta wave)
    const initialSlopes = slopes.slice(0, Math.min(10, slopes.length));
    const avgInitialSlope = initialSlopes.reduce((a, b) => a + Math.abs(b), 0) / initialSlopes.length;

    // Find transition point (where slope becomes steep)
    let deltaEndIdx = 0;
    let slopeRatio = 0;

    for (let i = 5; i < slopes.length - 2; i++) {
      const laterSlope = (Math.abs(slopes[i]) + Math.abs(slopes[i + 1]) + Math.abs(slopes[i + 2])) / 3;
      const ratio = laterSlope / (avgInitialSlope + 0.001);

      if (ratio > 2.5 && ratio > slopeRatio) {
        slopeRatio = ratio;
        deltaEndIdx = i;
      }
    }

    if (deltaEndIdx < 3 || slopeRatio < 2) {
      return { detected: false, duration: 0, amplitude: 0, polarity: 'isoelectric' };
    }

    // Calculate delta wave duration
    const deltaWaveDurationMs = (deltaEndIdx / this.sampleRate) * 1000;

    if (deltaWaveDurationMs < this.DELTA_WAVE_MIN_DURATION ||
        deltaWaveDurationMs > this.DELTA_WAVE_MAX_DURATION) {
      return { detected: false, duration: 0, amplitude: 0, polarity: 'isoelectric' };
    }

    // Calculate amplitude
    const deltaWaveEnd = qrsOnset + deltaEndIdx;
    const amplitude = signal[deltaWaveEnd] - signal[qrsOnset];

    // Determine polarity
    const polarity: 'positive' | 'negative' | 'isoelectric' =
      amplitude > 50 ? 'positive' :
      amplitude < -50 ? 'negative' : 'isoelectric';

    return {
      detected: true,
      duration: deltaWaveDurationMs,
      amplitude,
      polarity,
    };
  }

  /**
   * Aggregate delta wave results from multiple beats
   */
  private aggregateDeltaWaveResults(results: DeltaWaveDetection[]): DeltaWaveDetection {
    const detectedResults = results.filter(r => r.detected);

    if (detectedResults.length < results.length * 0.5) {
      // Less than 50% of beats show delta wave - might be intermittent
      return {
        detected: detectedResults.length > 0,
        duration: detectedResults.length > 0
          ? detectedResults.reduce((sum, r) => sum + r.duration, 0) / detectedResults.length
          : 0,
        amplitude: detectedResults.length > 0
          ? detectedResults.reduce((sum, r) => sum + r.amplitude, 0) / detectedResults.length
          : 0,
        polarity: this.getPredominantPolarity(detectedResults),
        presentInLeads: this.getMostCommonLeads(detectedResults),
        confidence: detectedResults.length / results.length * 0.8,
      };
    }

    return {
      detected: true,
      duration: detectedResults.reduce((sum, r) => sum + r.duration, 0) / detectedResults.length,
      amplitude: detectedResults.reduce((sum, r) => sum + r.amplitude, 0) / detectedResults.length,
      polarity: this.getPredominantPolarity(detectedResults),
      presentInLeads: this.getMostCommonLeads(detectedResults),
      confidence: Math.min(1, 0.5 + (detectedResults.length / results.length) * 0.5),
    };
  }

  /**
   * Get predominant delta wave polarity
   */
  private getPredominantPolarity(results: DeltaWaveDetection[]): 'positive' | 'negative' | 'isoelectric' {
    let pos = 0, neg = 0;
    for (const r of results) {
      if (r.polarity === 'positive') pos++;
      else if (r.polarity === 'negative') neg++;
    }
    if (pos > neg + 1) return 'positive';
    if (neg > pos + 1) return 'negative';
    return 'isoelectric';
  }

  /**
   * Get leads where delta wave is most commonly seen
   */
  private getMostCommonLeads(results: DeltaWaveDetection[]): LeadName[] {
    const leadCounts = new Map<LeadName, number>();

    for (const r of results) {
      for (const lead of r.presentInLeads) {
        leadCounts.set(lead, (leadCounts.get(lead) || 0) + 1);
      }
    }

    return Array.from(leadCounts.entries())
      .filter(([_, count]) => count >= results.length * 0.5)
      .map(([lead, _]) => lead);
  }

  /**
   * Determine pre-excitation pattern type
   */
  private determinePatternType(
    deltaWaveDetected: boolean,
    shortPR: boolean,
    wideQRS: boolean
  ): PreexcitationType {
    if (deltaWaveDetected && shortPR && wideQRS) {
      return 'manifest_wpw';
    }

    if (deltaWaveDetected && wideQRS && !shortPR) {
      // Could be Mahaim fiber (atriofascicular pathway)
      return 'mahaim_fiber';
    }

    if (shortPR && !deltaWaveDetected && !wideQRS) {
      // LGL syndrome or enhanced AV nodal conduction
      return 'lgl_syndrome';
    }

    if (deltaWaveDetected && !shortPR && !wideQRS) {
      // Intermittent pre-excitation
      return 'intermittent_wpw';
    }

    return 'none';
  }

  /**
   * Localize accessory pathway based on delta wave polarity pattern
   *
   * Algorithm based on Arruda localization algorithm
   */
  private localizePathway(
    beatAnnotations: BeatAnnotation[],
    leadData: Partial<Record<LeadName, number[]>>
  ): {
    location: AccessoryPathwayLocation;
    confidence: number;
    polarityPattern: Partial<Record<LeadName, 'positive' | 'negative' | 'isoelectric'>>;
  } {
    // Analyze delta wave polarity in each lead
    const polarityPattern: Partial<Record<LeadName, 'positive' | 'negative' | 'isoelectric'>> = {};
    const leads: LeadName[] = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

    for (const leadName of leads) {
      const signal = leadData[leadName];
      if (!signal) continue;

      let posCount = 0, negCount = 0;

      for (const beat of beatAnnotations.slice(0, 5)) {
        const delta = this.analyzeDeltaWaveInLead(signal, beat);
        if (delta.detected) {
          if (delta.polarity === 'positive') posCount++;
          else if (delta.polarity === 'negative') negCount++;
        }
      }

      if (posCount > negCount) polarityPattern[leadName] = 'positive';
      else if (negCount > posCount) polarityPattern[leadName] = 'negative';
      else polarityPattern[leadName] = 'isoelectric';
    }

    // Localization using modified Arruda algorithm
    const location = this.arrudaLocalization(polarityPattern);

    // Calculate confidence based on pattern clarity
    const patternClarity = Object.values(polarityPattern)
      .filter(p => p !== 'isoelectric').length / leads.length;
    const confidence = Math.min(0.9, patternClarity + 0.2);

    return { location, confidence, polarityPattern };
  }

  /**
   * Arruda algorithm for pathway localization
   */
  private arrudaLocalization(
    pattern: Partial<Record<LeadName, 'positive' | 'negative' | 'isoelectric'>>
  ): AccessoryPathwayLocation {
    const deltaI = pattern.I;
    const deltaII = pattern.II;
    const deltaV1 = pattern.V1;
    const deltaAVF = pattern.aVF;

    // Simplified localization algorithm
    // Full algorithm uses more leads and complex decision tree

    if (deltaV1 === 'positive') {
      // Left-sided pathway
      if (deltaI === 'negative' || deltaAVF === 'negative') {
        return 'left_lateral';
      }
      if (deltaII === 'positive' && deltaAVF === 'positive') {
        return 'left_posteroseptal';
      }
      return 'left_posterior';
    }

    if (deltaV1 === 'negative') {
      // Right-sided pathway
      if (deltaI === 'positive' && deltaAVF === 'positive') {
        return 'right_posteroseptal';
      }
      if (deltaI === 'positive' && deltaAVF === 'negative') {
        return 'right_anterior';
      }
      if (deltaAVF === 'positive') {
        return 'posteroseptal';
      }
      return 'right_lateral';
    }

    // V1 isoelectric - septal pathway
    if (deltaAVF === 'negative') {
      return 'anteroseptal';
    }

    return 'posteroseptal';
  }

  /**
   * Assess risk for WPW patients
   */
  private assessRisk(
    patternType: PreexcitationType,
    deltaWave: DeltaWaveDetection,
    prInterval: number | null
  ): WPWRiskAssessment {
    if (patternType === 'none') {
      return { level: 'undetermined', factors: [] };
    }

    const factors: string[] = [];

    // Short refractory period (inferred from PR and delta wave)
    if (prInterval !== null && prInterval < 100) {
      factors.push('Very short PR interval suggests short refractory period');
    }

    // Wide delta wave suggests robust accessory pathway
    if (deltaWave.duration > 40) {
      factors.push('Wide delta wave suggests significant pre-excitation');
    }

    // Determine risk level
    let level: 'high' | 'intermediate' | 'low' = 'intermediate';

    if (patternType === 'manifest_wpw') {
      if (factors.length >= 2 || (prInterval !== null && prInterval < 100)) {
        level = 'high';
        factors.push('Manifest WPW with concerning features');
      } else {
        level = 'intermediate';
      }
    } else if (patternType === 'intermittent_wpw') {
      level = 'low';
      factors.push('Intermittent pre-excitation may indicate longer refractory period');
    } else if (patternType === 'lgl_syndrome') {
      level = 'low';
      factors.push('LGL syndrome without ventricular pre-excitation');
    }

    // Estimate shortest pre-excited RR (if in AF)
    // This is a rough estimate - true assessment requires EP study
    let estimatedSPRR: number | undefined;
    if (patternType === 'manifest_wpw' && prInterval !== null) {
      // Rough estimate: SPRR ≈ PR interval * 2 + 50
      estimatedSPRR = prInterval * 2 + 50;
      if (estimatedSPRR < 250) {
        level = 'high';
        factors.push(`Estimated SPRR ${estimatedSPRR}ms suggests high risk if AF develops`);
      }
    }

    return { level, factors, estimatedSPRR };
  }

  /**
   * Generate clinical recommendations
   */
  private generateRecommendations(
    patternType: PreexcitationType,
    risk: WPWRiskAssessment,
    location: AccessoryPathwayLocation
  ): string[] {
    const recommendations: string[] = [];

    if (patternType === 'none') {
      return ['No pre-excitation detected - no specific recommendations'];
    }

    if (patternType === 'manifest_wpw') {
      recommendations.push('Manifest WPW pattern detected');
      recommendations.push('AVOID: AV nodal blocking agents (digoxin, verapamil, diltiazem, adenosine) in AF');
      recommendations.push('Consider electrophysiology study for risk stratification');

      if (risk.level === 'high') {
        recommendations.push('HIGH RISK: Consider catheter ablation evaluation');
      }

      if (location !== 'unknown') {
        recommendations.push(`Pathway likely located: ${location.replace(/_/g, ' ')}`);
      }
    }

    if (patternType === 'intermittent_wpw') {
      recommendations.push('Intermittent pre-excitation detected');
      recommendations.push('May indicate longer anterograde refractory period');
      recommendations.push('Consider exercise testing to assess pathway behavior');
    }

    if (patternType === 'lgl_syndrome') {
      recommendations.push('Short PR without delta wave (LGL pattern)');
      recommendations.push('May represent enhanced AV nodal conduction');
      recommendations.push('Clinical correlation recommended');
    }

    if (patternType === 'mahaim_fiber') {
      recommendations.push('Atriofascicular pathway (Mahaim fiber) suspected');
      recommendations.push('LBBB-like pre-excitation without short PR');
      recommendations.push('Electrophysiology study may be indicated');
    }

    return recommendations;
  }

  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(
    deltaWave: DeltaWaveDetection,
    shortPR: boolean,
    wideQRS: boolean,
    beatCount: number
  ): number {
    let confidence = 0.3;

    // Delta wave detection confidence
    if (deltaWave.detected) {
      confidence += deltaWave.confidence * 0.4;
    }

    // Classic triad (delta + short PR + wide QRS)
    if (deltaWave.detected && shortPR && wideQRS) {
      confidence += 0.2;
    }

    // Beat count factor
    if (beatCount >= 10) {
      confidence += 0.1;
    } else if (beatCount >= 5) {
      confidence += 0.05;
    }

    return Math.min(1, confidence);
  }

  /**
   * Create negative result
   */
  private createNegativeResult(): WPWAnalysisResult {
    return {
      preexcitationDetected: false,
      patternType: 'none',
      deltaWave: {
        detected: false,
        duration: 0,
        amplitude: 0,
        polarity: 'isoelectric',
        presentInLeads: [],
        confidence: 0.8,
      },
      prInterval: null,
      qrsDuration: 0,
      shortPR: false,
      wideQRS: false,
      pathwayLocation: 'unknown',
      localizationConfidence: 0,
      deltaWavePolarityPattern: {},
      riskAssessment: { level: 'undetermined', factors: [] },
      recommendations: ['No pre-excitation detected'],
      confidence: 0.8,
      beatsAnalyzed: 0,
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Detect WPW/pre-excitation pattern
 */
export function detectWPW(
  beatAnnotations: BeatAnnotation[],
  leadData: Partial<Record<LeadName, number[]>>,
  sampleRate: number
): WPWAnalysisResult {
  const detector = new WPWDetector(sampleRate);
  return detector.analyze(beatAnnotations, leadData);
}

/**
 * Quick check for pre-excitation
 */
export function hasPreexcitation(
  beatAnnotations: BeatAnnotation[],
  leadData: Partial<Record<LeadName, number[]>>,
  sampleRate: number
): boolean {
  const result = detectWPW(beatAnnotations, leadData, sampleRate);
  return result.preexcitationDetected;
}
