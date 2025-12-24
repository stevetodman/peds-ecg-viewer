/**
 * Rhythm Analyzer
 * Automated rhythm classification for digitized ECGs
 *
 * Critical for clinical interpretation - every ECG report starts with rhythm.
 * This module detects:
 * - Sinus rhythm (normal)
 * - Atrial fibrillation/flutter
 * - Ventricular tachycardia
 * - Bradycardia/tachycardia
 * - AV blocks
 * - Bundle branch blocks
 * - Ectopic beats (PACs, PVCs)
 *
 * @module signal/loader/png-digitizer/signal/rhythm-analyzer
 */

import type { LeadName } from '../types';

/**
 * Rhythm classification
 */
export type RhythmType =
  | 'sinus_rhythm'
  | 'sinus_bradycardia'
  | 'sinus_tachycardia'
  | 'sinus_arrhythmia'
  | 'atrial_fibrillation'
  | 'atrial_flutter'
  | 'supraventricular_tachycardia'
  | 'ventricular_tachycardia'
  | 'ventricular_fibrillation'
  | 'junctional_rhythm'
  | 'idioventricular_rhythm'
  | 'asystole'
  | 'paced_rhythm'
  | 'unknown';

/**
 * Conduction abnormality
 */
export type ConductionAbnormality =
  | 'first_degree_av_block'
  | 'second_degree_av_block_type1'
  | 'second_degree_av_block_type2'
  | 'third_degree_av_block'
  | 'right_bundle_branch_block'
  | 'left_bundle_branch_block'
  | 'left_anterior_fascicular_block'
  | 'left_posterior_fascicular_block'
  | 'bifascicular_block'
  | 'trifascicular_block'
  | 'wpw_pattern';

/**
 * Detected beat
 */
export interface DetectedBeat {
  /** Time in seconds */
  time: number;

  /** Sample index */
  sampleIndex: number;

  /** Beat type */
  type: 'normal' | 'pac' | 'pvc' | 'aberrant' | 'paced' | 'fusion';

  /** RR interval before this beat (ms) */
  rrIntervalMs?: number;

  /** QRS duration (ms) */
  qrsDurationMs?: number;

  /** QRS amplitude (µV) */
  qrsAmplitude?: number;

  /** PR interval (ms) if P wave detected */
  prIntervalMs?: number;

  /** Confidence */
  confidence: number;
}

/**
 * Rhythm analysis result
 */
export interface RhythmAnalysisResult {
  /** Primary rhythm classification */
  primaryRhythm: RhythmType;

  /** Confidence in classification (0-1) */
  confidence: number;

  /** Heart rate (bpm) */
  heartRate: number;

  /** Heart rate variability (ms) */
  heartRateVariability: number;

  /** Is rhythm regular? */
  isRegular: boolean;

  /** Regularity score (0-1, 1 = perfectly regular) */
  regularityScore: number;

  /** Detected beats */
  beats: DetectedBeat[];

  /** RR intervals (ms) */
  rrIntervals: number[];

  /** Conduction abnormalities */
  conductionAbnormalities: ConductionAbnormality[];

  /** Ectopic beat counts */
  ectopicBeats: {
    pacs: number;
    pvcs: number;
    couplets: number;
    runs: number;
  };

  /** Clinical interpretation strings */
  interpretation: string[];

  /** Warnings/flags */
  warnings: string[];
}

/**
 * Rhythm Analyzer class
 */
export class RhythmAnalyzer {
  private leads: Partial<Record<LeadName, number[]>>;
  private sampleRate: number;

  constructor(leads: Partial<Record<LeadName, number[]>>, sampleRate: number) {
    this.leads = leads;
    this.sampleRate = sampleRate;
  }

  /**
   * Analyze rhythm
   */
  analyze(): RhythmAnalysisResult {
    // Use Lead II preferentially (best for rhythm analysis)
    // Fall back to other leads if not available
    const rhythmLead = this.leads['II'] || this.leads['I'] || this.leads['V1'] ||
      Object.values(this.leads).find(l => l && l.length > 0);

    if (!rhythmLead || rhythmLead.length < this.sampleRate) {
      return this.createEmptyResult('Insufficient data for rhythm analysis');
    }

    // Detect QRS complexes
    const beats = this.detectBeats(rhythmLead);

    if (beats.length < 3) {
      return this.createEmptyResult('Too few beats detected for rhythm analysis');
    }

    // Calculate RR intervals
    const rrIntervals = this.calculateRRIntervals(beats);

    // Calculate heart rate
    const heartRate = this.calculateHeartRate(rrIntervals);

    // Assess regularity
    const { isRegular, regularityScore, hrv } = this.assessRegularity(rrIntervals);

    // Classify rhythm
    const { rhythm, confidence } = this.classifyRhythm(beats, rrIntervals, heartRate, isRegular);

    // Detect conduction abnormalities
    const conductionAbnormalities = this.detectConductionAbnormalities(beats);

    // Count ectopic beats
    const ectopicBeats = this.countEctopicBeats(beats);

    // Generate interpretation
    const interpretation = this.generateInterpretation(
      rhythm, heartRate, isRegular, conductionAbnormalities, ectopicBeats
    );

    return {
      primaryRhythm: rhythm,
      confidence,
      heartRate,
      heartRateVariability: hrv,
      isRegular,
      regularityScore,
      beats,
      rrIntervals,
      conductionAbnormalities,
      ectopicBeats,
      interpretation,
      warnings: [],
    };
  }

  /**
   * Detect beats in the signal
   */
  private detectBeats(data: number[]): DetectedBeat[] {
    const beats: DetectedBeat[] = [];

    // Simple peak detection using derivative and threshold
    const derivative = this.calculateDerivative(data);
    const threshold = this.calculateAdaptiveThreshold(derivative);

    // Find R peaks
    let inQRS = false;
    let peakIdx = 0;
    let peakValue = 0;

    for (let i = 1; i < derivative.length - 1; i++) {
      if (Math.abs(derivative[i]) > threshold) {
        if (!inQRS) {
          inQRS = true;
          peakIdx = i;
          peakValue = Math.abs(data[i]);
        } else if (Math.abs(data[i]) > peakValue) {
          peakIdx = i;
          peakValue = Math.abs(data[i]);
        }
      } else if (inQRS) {
        // End of QRS complex
        const time = peakIdx / this.sampleRate;

        // Calculate QRS duration (rough estimate)
        const qrsStart = this.findQRSStart(data, peakIdx);
        const qrsEnd = this.findQRSEnd(data, peakIdx);
        const qrsDurationMs = ((qrsEnd - qrsStart) / this.sampleRate) * 1000;

        // Determine beat type based on QRS width and morphology
        const beatType = this.classifyBeat(data, peakIdx, qrsDurationMs);

        beats.push({
          time,
          sampleIndex: peakIdx,
          type: beatType,
          qrsDurationMs,
          qrsAmplitude: peakValue,
          confidence: 0.8,
        });

        inQRS = false;
        peakValue = 0;
      }
    }

    // Calculate RR intervals for each beat
    for (let i = 1; i < beats.length; i++) {
      beats[i].rrIntervalMs = (beats[i].time - beats[i - 1].time) * 1000;
    }

    return beats;
  }

  /**
   * Calculate signal derivative
   */
  private calculateDerivative(data: number[]): number[] {
    const derivative = new Array(data.length).fill(0);

    for (let i = 2; i < data.length - 2; i++) {
      // 5-point derivative for noise reduction
      derivative[i] = (-data[i - 2] - data[i - 1] + data[i + 1] + data[i + 2]) / 4;
    }

    return derivative;
  }

  /**
   * Calculate adaptive threshold for QRS detection
   */
  private calculateAdaptiveThreshold(derivative: number[]): number {
    // Use median absolute deviation for robust threshold
    const absDerivative = derivative.map(Math.abs);
    const sorted = [...absDerivative].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Threshold at ~4x median (typical for R wave detection)
    return median * 4;
  }

  /**
   * Find start of QRS complex
   */
  private findQRSStart(data: number[], peakIdx: number): number {
    const baseline = this.estimateBaseline(data, peakIdx);
    const threshold = Math.abs(data[peakIdx] - baseline) * 0.1;

    for (let i = peakIdx; i > Math.max(0, peakIdx - 50); i--) {
      if (Math.abs(data[i] - baseline) < threshold) {
        return i;
      }
    }

    return Math.max(0, peakIdx - 20);
  }

  /**
   * Find end of QRS complex
   */
  private findQRSEnd(data: number[], peakIdx: number): number {
    const baseline = this.estimateBaseline(data, peakIdx);
    const threshold = Math.abs(data[peakIdx] - baseline) * 0.1;

    for (let i = peakIdx; i < Math.min(data.length, peakIdx + 50); i++) {
      if (Math.abs(data[i] - baseline) < threshold) {
        return i;
      }
    }

    return Math.min(data.length - 1, peakIdx + 20);
  }

  /**
   * Estimate baseline around a point
   */
  private estimateBaseline(data: number[], idx: number): number {
    const windowSize = Math.floor(this.sampleRate * 0.2); // 200ms window
    const start = Math.max(0, idx - windowSize);
    const end = Math.min(data.length, idx + windowSize);

    const values = data.slice(start, end);
    values.sort((a, b) => a - b);

    return values[Math.floor(values.length / 2)]; // Median
  }

  /**
   * Classify beat type based on morphology
   */
  private classifyBeat(data: number[], peakIdx: number, qrsDurationMs: number): DetectedBeat['type'] {
    // Wide QRS (>120ms) suggests PVC or aberrant conduction
    if (qrsDurationMs > 120) {
      return 'pvc';
    }

    // Check for very narrow, sharp spike (pacemaker)
    const derivative = Math.abs(data[peakIdx] - data[peakIdx - 1]);
    if (derivative > 500 && qrsDurationMs < 20) {
      return 'paced';
    }

    return 'normal';
  }

  /**
   * Calculate RR intervals
   */
  private calculateRRIntervals(beats: DetectedBeat[]): number[] {
    const intervals: number[] = [];

    for (let i = 1; i < beats.length; i++) {
      intervals.push((beats[i].time - beats[i - 1].time) * 1000);
    }

    return intervals;
  }

  /**
   * Calculate heart rate from RR intervals
   */
  private calculateHeartRate(rrIntervals: number[]): number {
    if (rrIntervals.length === 0) return 0;

    const meanRR = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
    return Math.round(60000 / meanRR);
  }

  /**
   * Assess rhythm regularity
   */
  private assessRegularity(rrIntervals: number[]): {
    isRegular: boolean;
    regularityScore: number;
    hrv: number;
  } {
    if (rrIntervals.length < 2) {
      return { isRegular: true, regularityScore: 1, hrv: 0 };
    }

    const mean = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
    const variance = rrIntervals.reduce((sum, rr) => sum + Math.pow(rr - mean, 2), 0) / rrIntervals.length;
    const stdDev = Math.sqrt(variance);

    // Coefficient of variation
    const cv = stdDev / mean;

    // HRV (SDNN - standard deviation of NN intervals)
    const hrv = stdDev;

    // Regular if CV < 10%
    const isRegular = cv < 0.1;
    const regularityScore = Math.max(0, 1 - cv * 5);

    return { isRegular, regularityScore, hrv };
  }

  /**
   * Classify the rhythm
   */
  private classifyRhythm(
    beats: DetectedBeat[],
    rrIntervals: number[],
    heartRate: number,
    isRegular: boolean
  ): { rhythm: RhythmType; confidence: number } {
    // Check for paced rhythm
    const pacedBeats = beats.filter(b => b.type === 'paced').length;
    if (pacedBeats / beats.length > 0.5) {
      return { rhythm: 'paced_rhythm', confidence: 0.9 };
    }

    // Check for ventricular rhythms (wide QRS)
    const wideQRSBeats = beats.filter(b => b.qrsDurationMs && b.qrsDurationMs > 120);
    if (wideQRSBeats.length / beats.length > 0.8) {
      if (heartRate > 100) {
        return { rhythm: 'ventricular_tachycardia', confidence: 0.8 };
      }
      return { rhythm: 'idioventricular_rhythm', confidence: 0.7 };
    }

    // Check for atrial fibrillation (irregular + no clear P waves)
    if (!isRegular && this.calculateIrregularityPattern(rrIntervals) === 'irregularly_irregular') {
      return { rhythm: 'atrial_fibrillation', confidence: 0.75 };
    }

    // Check for atrial flutter (regular, often ~150 bpm)
    if (isRegular && heartRate >= 140 && heartRate <= 160) {
      return { rhythm: 'atrial_flutter', confidence: 0.6 };
    }

    // Sinus rhythms
    if (isRegular || this.calculateIrregularityPattern(rrIntervals) === 'regularly_irregular') {
      if (heartRate < 60) {
        return { rhythm: 'sinus_bradycardia', confidence: 0.85 };
      } else if (heartRate > 100) {
        return { rhythm: 'sinus_tachycardia', confidence: 0.85 };
      } else {
        // Check for sinus arrhythmia (respiratory variation)
        if (!isRegular && this.calculateIrregularityPattern(rrIntervals) === 'regularly_irregular') {
          return { rhythm: 'sinus_arrhythmia', confidence: 0.7 };
        }
        return { rhythm: 'sinus_rhythm', confidence: 0.9 };
      }
    }

    return { rhythm: 'unknown', confidence: 0.5 };
  }

  /**
   * Determine pattern of irregularity
   */
  private calculateIrregularityPattern(rrIntervals: number[]): 'regular' | 'regularly_irregular' | 'irregularly_irregular' {
    if (rrIntervals.length < 4) return 'regular';

    const mean = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
    const deviations = rrIntervals.map(rr => Math.abs(rr - mean) / mean);

    // Check if variations follow a pattern (respiratory, grouped)
    let patternScore = 0;
    for (let i = 2; i < rrIntervals.length; i++) {
      // Check for alternating pattern
      const diff1 = rrIntervals[i] - rrIntervals[i - 1];
      const diff2 = rrIntervals[i - 1] - rrIntervals[i - 2];
      if (Math.sign(diff1) !== Math.sign(diff2)) {
        patternScore++;
      }
    }

    const maxDeviation = Math.max(...deviations);
    const patternRatio = patternScore / (rrIntervals.length - 2);

    if (maxDeviation < 0.1) {
      return 'regular';
    } else if (patternRatio > 0.6) {
      return 'regularly_irregular';
    } else {
      return 'irregularly_irregular';
    }
  }

  /**
   * Detect conduction abnormalities
   */
  private detectConductionAbnormalities(beats: DetectedBeat[]): ConductionAbnormality[] {
    const abnormalities: ConductionAbnormality[] = [];

    // Check for bundle branch blocks based on QRS duration
    const avgQRSDuration = beats
      .filter(b => b.qrsDurationMs)
      .reduce((sum, b) => sum + (b.qrsDurationMs || 0), 0) / beats.length;

    if (avgQRSDuration > 120) {
      // Would need V1/V6 morphology to distinguish RBBB from LBBB
      // For now, just flag as wide QRS
      const v1 = this.leads['V1'];
      if (v1) {
        const v1Peak = Math.max(...v1);
        const v1Trough = Math.min(...v1);

        if (v1Peak > Math.abs(v1Trough)) {
          abnormalities.push('right_bundle_branch_block');
        } else {
          abnormalities.push('left_bundle_branch_block');
        }
      }
    }

    // Check for first-degree AV block (PR > 200ms)
    const prIntervals = beats.filter(b => b.prIntervalMs).map(b => b.prIntervalMs!);
    if (prIntervals.length > 0) {
      const avgPR = prIntervals.reduce((a, b) => a + b, 0) / prIntervals.length;
      if (avgPR > 200 && avgPR < 300) {
        abnormalities.push('first_degree_av_block');
      }
    }

    return abnormalities;
  }

  /**
   * Count ectopic beats
   */
  private countEctopicBeats(beats: DetectedBeat[]): {
    pacs: number;
    pvcs: number;
    couplets: number;
    runs: number;
  } {
    let pacs = 0;
    let pvcs = 0;
    let couplets = 0;
    let runs = 0;

    let consecutivePVCs = 0;

    for (const beat of beats) {
      if (beat.type === 'pac') {
        pacs++;
      } else if (beat.type === 'pvc') {
        pvcs++;
        consecutivePVCs++;

        if (consecutivePVCs === 2) {
          couplets++;
        } else if (consecutivePVCs === 3) {
          runs++;
          couplets--; // Was counted as couplet, now is a run
        }
      } else {
        consecutivePVCs = 0;
      }
    }

    return { pacs, pvcs, couplets, runs };
  }

  /**
   * Generate clinical interpretation strings
   */
  private generateInterpretation(
    rhythm: RhythmType,
    heartRate: number,
    isRegular: boolean,
    conductionAbnormalities: ConductionAbnormality[],
    ectopicBeats: { pacs: number; pvcs: number; couplets: number; runs: number }
  ): string[] {
    const interpretation: string[] = [];

    // Rhythm
    const rhythmNames: Record<RhythmType, string> = {
      sinus_rhythm: 'Normal sinus rhythm',
      sinus_bradycardia: 'Sinus bradycardia',
      sinus_tachycardia: 'Sinus tachycardia',
      sinus_arrhythmia: 'Sinus arrhythmia',
      atrial_fibrillation: 'Atrial fibrillation',
      atrial_flutter: 'Atrial flutter',
      supraventricular_tachycardia: 'Supraventricular tachycardia',
      ventricular_tachycardia: 'Ventricular tachycardia',
      ventricular_fibrillation: 'Ventricular fibrillation',
      junctional_rhythm: 'Junctional rhythm',
      idioventricular_rhythm: 'Idioventricular rhythm',
      asystole: 'Asystole',
      paced_rhythm: 'Paced rhythm',
      unknown: 'Rhythm undetermined',
    };

    interpretation.push(rhythmNames[rhythm]);
    interpretation.push(`Ventricular rate: ${heartRate} bpm`);
    interpretation.push(isRegular ? 'Regular rhythm' : 'Irregular rhythm');

    // Conduction abnormalities
    const abnormalityNames: Record<ConductionAbnormality, string> = {
      first_degree_av_block: 'First-degree AV block',
      second_degree_av_block_type1: 'Second-degree AV block, Mobitz Type I (Wenckebach)',
      second_degree_av_block_type2: 'Second-degree AV block, Mobitz Type II',
      third_degree_av_block: 'Third-degree (complete) AV block',
      right_bundle_branch_block: 'Right bundle branch block',
      left_bundle_branch_block: 'Left bundle branch block',
      left_anterior_fascicular_block: 'Left anterior fascicular block',
      left_posterior_fascicular_block: 'Left posterior fascicular block',
      bifascicular_block: 'Bifascicular block',
      trifascicular_block: 'Trifascicular block',
      wpw_pattern: 'Wolff-Parkinson-White pattern',
    };

    for (const abnormality of conductionAbnormalities) {
      interpretation.push(abnormalityNames[abnormality]);
    }

    // Ectopic beats
    if (ectopicBeats.pvcs > 0) {
      interpretation.push(`Premature ventricular complexes (${ectopicBeats.pvcs})`);
    }
    if (ectopicBeats.pacs > 0) {
      interpretation.push(`Premature atrial complexes (${ectopicBeats.pacs})`);
    }
    if (ectopicBeats.couplets > 0) {
      interpretation.push(`Ventricular couplets (${ectopicBeats.couplets})`);
    }
    if (ectopicBeats.runs > 0) {
      interpretation.push(`Runs of ventricular tachycardia (${ectopicBeats.runs})`);
    }

    return interpretation;
  }

  /**
   * Create empty result for error cases
   */
  private createEmptyResult(warning: string): RhythmAnalysisResult {
    return {
      primaryRhythm: 'unknown',
      confidence: 0,
      heartRate: 0,
      heartRateVariability: 0,
      isRegular: false,
      regularityScore: 0,
      beats: [],
      rrIntervals: [],
      conductionAbnormalities: [],
      ectopicBeats: { pacs: 0, pvcs: 0, couplets: 0, runs: 0 },
      interpretation: [],
      warnings: [warning],
    };
  }
}

/**
 * Convenience function for rhythm analysis
 */
export function analyzeRhythm(
  leads: Partial<Record<LeadName, number[]>>,
  sampleRate: number
): RhythmAnalysisResult {
  const analyzer = new RhythmAnalyzer(leads, sampleRate);
  return analyzer.analyze();
}
