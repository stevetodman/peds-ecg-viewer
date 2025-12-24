/**
 * Beat-by-Beat Classification
 * Classifies each beat based on morphology, timing, and conduction patterns
 *
 * Classification labels (following AAMI EC57 standard):
 * - N: Normal beat (also includes bundle branch blocks)
 * - S: Supraventricular ectopic beat (PAC, atrial escape)
 * - V: Ventricular ectopic beat (PVC, ventricular escape)
 * - F: Fusion of ventricular and normal beat
 * - P: Paced beat
 * - Q: Unknown/unclassifiable (artifact, noise)
 *
 * Additional clinical annotations:
 * - LBBB: Left bundle branch block
 * - RBBB: Right bundle branch block
 * - Aberrant: Aberrantly conducted beat
 *
 * @module signal/loader/png-digitizer/signal/beat-classifier
 */

import type { LeadName } from '../../../../types';
import type { BeatAnnotation, FiducialDetectionResult } from './fiducial-detector';
import { pearsonCorrelation, median } from './utils';

// ============================================================================
// Types
// ============================================================================

/**
 * AAMI beat classification labels
 */
export type AAMIBeatClass = 'N' | 'S' | 'V' | 'F' | 'P' | 'Q';

/**
 * Detailed beat type
 */
export type DetailedBeatType =
  | 'normal'
  | 'pac'                    // Premature atrial contraction
  | 'pvc'                    // Premature ventricular contraction
  | 'atrial_escape'          // Atrial escape beat
  | 'ventricular_escape'     // Ventricular escape beat
  | 'fusion'                 // Fusion beat
  | 'paced_atrial'           // Atrial paced
  | 'paced_ventricular'      // Ventricular paced
  | 'paced_dual'             // Dual chamber paced
  | 'lbbb'                   // Left bundle branch block
  | 'rbbb'                   // Right bundle branch block
  | 'aberrant'               // Aberrantly conducted
  | 'interpolated_pvc'       // Interpolated PVC (no compensatory pause)
  | 'bigeminy_pvc'           // PVC in bigeminy pattern
  | 'trigeminy_pvc'          // PVC in trigeminy pattern
  | 'couplet'                // Part of PVC couplet
  | 'triplet'                // Part of PVC triplet
  | 'nsvt'                   // Part of NSVT run
  | 'artifact'               // Artifact/noise
  | 'unknown';

/**
 * Beat morphology features
 */
export interface BeatMorphology {
  /** QRS width in ms */
  qrsWidth: number;
  /** QRS amplitude in µV */
  qrsAmplitude: number;
  /** R wave polarity */
  rPolarity: 'positive' | 'negative' | 'biphasic';
  /** Has Q wave */
  hasQWave: boolean;
  /** Has S wave */
  hasSWave: boolean;
  /** Has notch in QRS */
  hasQRSNotch: boolean;
  /** P wave present */
  pWavePresent: boolean;
  /** P wave polarity (if present) */
  pWavePolarity?: 'positive' | 'negative' | 'biphasic';
  /** PR interval in ms (if P present) */
  prInterval?: number;
  /** T wave polarity */
  tWavePolarity?: 'positive' | 'negative' | 'biphasic' | 'flat';
  /** Correlation with template (0-1) */
  templateCorrelation: number;
}

/**
 * Timing features for beat classification
 */
export interface BeatTiming {
  /** RR interval before this beat (ms) */
  rrPre: number | null;
  /** RR interval after this beat (ms) */
  rrPost: number | null;
  /** Prematurity index (< 1 = premature, > 1 = late) */
  prematurityIndex: number | null;
  /** Compensatory pause present */
  compensatoryPause: boolean;
  /** Coupling interval to previous beat (ms) */
  couplingInterval: number | null;
}

/**
 * Complete beat classification
 */
export interface BeatClassification {
  /** Beat index */
  beatIndex: number;
  /** AAMI class */
  aamiClass: AAMIBeatClass;
  /** Detailed type */
  detailedType: DetailedBeatType;
  /** Confidence (0-1) */
  confidence: number;
  /** Morphology features */
  morphology: BeatMorphology;
  /** Timing features */
  timing: BeatTiming;
  /** Part of a pattern (e.g., bigeminy, couplet) */
  patternContext?: string;
  /** Classification reasoning */
  reasoning: string[];
  /** Sample index of R-peak */
  rPeakIndex: number;
  /** Time of R-peak (seconds) */
  rPeakTime: number;
}

/**
 * Beat pattern detection result
 */
export interface BeatPattern {
  type: 'bigeminy' | 'trigeminy' | 'quadrigeminy' | 'couplet' | 'triplet' | 'run' | 'interpolated';
  startBeat: number;
  endBeat: number;
  beatCount: number;
  confidence: number;
}

/**
 * Classification summary
 */
export interface ClassificationSummary {
  /** Total beats analyzed */
  totalBeats: number;
  /** Normal beat count */
  normalCount: number;
  /** PAC count */
  pacCount: number;
  /** PVC count */
  pvcCount: number;
  /** Paced beat count */
  pacedCount: number;
  /** Unknown/artifact count */
  unknownCount: number;
  /** PVC burden (%) */
  pvcBurden: number;
  /** PAC burden (%) */
  pacBurden: number;
  /** Detected patterns */
  patterns: BeatPattern[];
  /** Longest PVC run length */
  longestPVCRun: number;
  /** Couplet count */
  coupletCount: number;
  /** Triplet count */
  tripletCount: number;
  /** NSVT episode count (≥3 consecutive PVCs) */
  nsvtCount: number;
}

/**
 * Classification result for entire recording
 */
export interface BeatClassificationResult {
  /** Per-beat classifications */
  beats: BeatClassification[];
  /** Summary statistics */
  summary: ClassificationSummary;
  /** Template beat used for comparison */
  templateBeat: number[];
  /** Sample rate */
  sampleRate: number;
  /** Processing time in ms */
  processingTimeMs: number;
}

// ============================================================================
// Beat Classifier
// ============================================================================

export class BeatClassifier {
  private sampleRate: number;
  private templateBeat: number[] = [];
  private averageRR: number = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /**
   * Classify all beats in the recording
   */
  classify(
    fiducialResult: FiducialDetectionResult,
    leadData: Partial<Record<LeadName, number[]>>
  ): BeatClassificationResult {
    const startTime = Date.now();

    // Select best lead for classification (II or V5 preferred)
    const classificationLead = this.selectClassificationLead(leadData);
    if (!classificationLead || !leadData[classificationLead]) {
      return this.createEmptyResult(startTime);
    }

    const signal = leadData[classificationLead];
    const beatAnnotations = fiducialResult.leads[classificationLead] || [];

    if (beatAnnotations.length === 0) {
      return this.createEmptyResult(startTime);
    }

    // Calculate baseline RR statistics
    this.calculateRRStatistics(beatAnnotations);

    // Create template beat from normal beats
    this.createTemplateBeat(signal, beatAnnotations);

    // Classify each beat
    const beats: BeatClassification[] = [];
    for (let i = 0; i < beatAnnotations.length; i++) {
      const classification = this.classifyBeat(
        signal,
        beatAnnotations,
        i,
        fiducialResult.globalRPeaks
      );
      beats.push(classification);
    }

    // Detect patterns (bigeminy, couplets, etc.)
    const patterns = this.detectPatterns(beats);

    // Update beat classifications with pattern context
    this.updatePatternContext(beats, patterns);

    // Generate summary
    const summary = this.generateSummary(beats, patterns);

    return {
      beats,
      summary,
      templateBeat: this.templateBeat,
      sampleRate: this.sampleRate,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Select best lead for classification
   */
  private selectClassificationLead(
    leadData: Partial<Record<LeadName, number[]>>
  ): LeadName | null {
    const preferredLeads: LeadName[] = ['II', 'V5', 'V1', 'I', 'aVF'];

    for (const lead of preferredLeads) {
      if (leadData[lead] && leadData[lead].length > 0) {
        return lead;
      }
    }

    // Return first available
    for (const [lead, data] of Object.entries(leadData) as [LeadName, number[]][]) {
      if (data && data.length > 0) {
        return lead;
      }
    }

    return null;
  }

  /**
   * Calculate baseline RR interval statistics
   */
  private calculateRRStatistics(beats: BeatAnnotation[]): void {
    const rrIntervals: number[] = [];

    for (const beat of beats) {
      if (beat.rrInterval !== null && beat.rrInterval > 300 && beat.rrInterval < 2000) {
        rrIntervals.push(beat.rrInterval);
      }
    }

    if (rrIntervals.length === 0) {
      this.averageRR = 800; // Default 75 bpm
      return;
    }

    // Use median for robustness
    this.averageRR = median(rrIntervals);
  }

  /**
   * Create template beat from dominant (normal) beats
   */
  private createTemplateBeat(signal: number[], beats: BeatAnnotation[]): void {
    const templateWindow = Math.round(0.6 * this.sampleRate); // 600ms window
    const halfWindow = Math.floor(templateWindow / 2);

    // First pass: collect candidate normal beats
    const candidates: number[][] = [];

    for (const beat of beats) {
      // Skip if QRS is too wide (likely PVC)
      if (beat.qrsDuration > 120) continue;

      // Skip if RR is too irregular
      if (beat.rrInterval !== null) {
        if (beat.rrInterval < this.averageRR * 0.8 ||
            beat.rrInterval > this.averageRR * 1.2) {
          continue;
        }
      }

      // Extract beat segment
      const rPeak = beat.qrs.rPeak.index;
      const start = Math.max(0, rPeak - halfWindow);
      const end = Math.min(signal.length, rPeak + halfWindow);

      if (end - start < templateWindow * 0.8) continue;

      const segment = signal.slice(start, end);

      // Normalize amplitude
      const max = Math.max(...segment);
      const min = Math.min(...segment);
      const range = max - min;
      if (range < 100) continue; // Too flat

      const normalized = segment.map(v => (v - min) / range);
      candidates.push(normalized);
    }

    if (candidates.length === 0) {
      // Use first beat as fallback
      if (beats.length > 0) {
        const rPeak = beats[0].qrs.rPeak.index;
        const start = Math.max(0, rPeak - halfWindow);
        const end = Math.min(signal.length, rPeak + halfWindow);
        this.templateBeat = signal.slice(start, end);
      }
      return;
    }

    // Average the candidate beats
    const templateLength = Math.min(...candidates.map(c => c.length));
    this.templateBeat = new Array(templateLength).fill(0);

    for (const candidate of candidates) {
      for (let i = 0; i < templateLength; i++) {
        this.templateBeat[i] += candidate[i];
      }
    }

    for (let i = 0; i < templateLength; i++) {
      this.templateBeat[i] /= candidates.length;
    }
  }

  /**
   * Classify a single beat
   */
  private classifyBeat(
    signal: number[],
    beats: BeatAnnotation[],
    beatIndex: number,
    _globalRPeaks: number[]
  ): BeatClassification {
    const beat = beats[beatIndex];
    const reasoning: string[] = [];

    // Extract morphology features
    const morphology = this.extractMorphology(signal, beat);

    // Extract timing features
    const timing = this.extractTiming(beats, beatIndex);

    // Check for pacing spike
    const isPaced = this.detectPacingSpike(signal, beat.qrs.onset.index);
    if (isPaced) {
      reasoning.push('Pacing spike detected before QRS');
      return {
        beatIndex,
        aamiClass: 'P',
        detailedType: 'paced_ventricular',
        confidence: 0.9,
        morphology,
        timing,
        reasoning,
        rPeakIndex: beat.qrs.rPeak.index,
        rPeakTime: beat.qrs.rPeak.time,
      };
    }

    // Classification logic

    // 1. Check for ventricular ectopy (PVC)
    const pvcScore = this.calculatePVCScore(morphology, timing, reasoning);
    if (pvcScore > 0.7) {
      const detailedType = this.determinePVCType(morphology, timing);
      return {
        beatIndex,
        aamiClass: 'V',
        detailedType,
        confidence: pvcScore,
        morphology,
        timing,
        reasoning,
        rPeakIndex: beat.qrs.rPeak.index,
        rPeakTime: beat.qrs.rPeak.time,
      };
    }

    // 2. Check for supraventricular ectopy (PAC)
    const pacScore = this.calculatePACScore(morphology, timing, reasoning);
    if (pacScore > 0.6) {
      return {
        beatIndex,
        aamiClass: 'S',
        detailedType: 'pac',
        confidence: pacScore,
        morphology,
        timing,
        reasoning,
        rPeakIndex: beat.qrs.rPeak.index,
        rPeakTime: beat.qrs.rPeak.time,
      };
    }

    // 3. Check for fusion beat
    const fusionScore = this.calculateFusionScore(morphology, timing, reasoning);
    if (fusionScore > 0.6) {
      return {
        beatIndex,
        aamiClass: 'F',
        detailedType: 'fusion',
        confidence: fusionScore,
        morphology,
        timing,
        reasoning,
        rPeakIndex: beat.qrs.rPeak.index,
        rPeakTime: beat.qrs.rPeak.time,
      };
    }

    // 4. Check for artifact
    if (morphology.templateCorrelation < 0.3 || beat.quality < 0.3) {
      reasoning.push('Low template correlation or poor quality');
      return {
        beatIndex,
        aamiClass: 'Q',
        detailedType: 'artifact',
        confidence: 0.6,
        morphology,
        timing,
        reasoning,
        rPeakIndex: beat.qrs.rPeak.index,
        rPeakTime: beat.qrs.rPeak.time,
      };
    }

    // 5. Normal beat
    let detailedType: DetailedBeatType = 'normal';
    if (morphology.qrsWidth > 120 && morphology.hasQRSNotch) {
      if (this.isRBBBMorphology(signal, beat)) {
        detailedType = 'rbbb';
        reasoning.push('Wide QRS with RBBB morphology');
      } else if (this.isLBBBMorphology(signal, beat)) {
        detailedType = 'lbbb';
        reasoning.push('Wide QRS with LBBB morphology');
      }
    }

    reasoning.push('Normal sinus beat');
    return {
      beatIndex,
      aamiClass: 'N',
      detailedType,
      confidence: Math.max(0.6, morphology.templateCorrelation),
      morphology,
      timing,
      reasoning,
      rPeakIndex: beat.qrs.rPeak.index,
      rPeakTime: beat.qrs.rPeak.time,
    };
  }

  /**
   * Extract morphology features
   */
  private extractMorphology(signal: number[], beat: BeatAnnotation): BeatMorphology {
    const qrsWidth = beat.qrsDuration;
    const qrsAmplitude = beat.qrs.rAmplitude;

    // Determine R wave polarity
    const rPolarity: 'positive' | 'negative' | 'biphasic' =
      beat.qrs.rPeak.amplitude > 0 ? 'positive' :
      beat.qrs.rPeak.amplitude < 0 ? 'negative' : 'biphasic';

    const hasQWave = beat.qrs.qWave !== undefined;
    const hasSWave = beat.qrs.sWave !== undefined;

    // Check for notch in QRS
    const hasQRSNotch = this.detectQRSNotch(signal, beat);

    // P wave analysis
    const pWavePresent = beat.pWave.present;
    let pWavePolarity: 'positive' | 'negative' | 'biphasic' | undefined;
    if (pWavePresent && beat.pWave.peak) {
      const pAmp = beat.pWave.amplitude || 0;
      pWavePolarity = pAmp > 0 ? 'positive' : pAmp < 0 ? 'negative' : 'biphasic';
    }

    // T wave analysis
    let tWavePolarity: 'positive' | 'negative' | 'biphasic' | 'flat' = 'flat';
    if (beat.tWave.present && beat.tWave.amplitude !== undefined) {
      const tAmp = beat.tWave.amplitude;
      if (Math.abs(tAmp) < 50) tWavePolarity = 'flat';
      else if (tAmp > 0) tWavePolarity = 'positive';
      else tWavePolarity = 'negative';
    }

    // Calculate template correlation
    const templateCorrelation = this.calculateTemplateCorrelation(signal, beat);

    return {
      qrsWidth,
      qrsAmplitude,
      rPolarity,
      hasQWave,
      hasSWave,
      hasQRSNotch,
      pWavePresent,
      pWavePolarity,
      prInterval: beat.prInterval ?? undefined,
      tWavePolarity,
      templateCorrelation,
    };
  }

  /**
   * Extract timing features
   */
  private extractTiming(beats: BeatAnnotation[], beatIndex: number): BeatTiming {
    const beat = beats[beatIndex];

    const rrPre = beat.rrInterval;
    const rrPost = beat.rrIntervalNext;

    // Calculate prematurity index
    let prematurityIndex: number | null = null;
    if (rrPre !== null && this.averageRR > 0) {
      prematurityIndex = rrPre / this.averageRR;
    }

    // Check for compensatory pause
    let compensatoryPause = false;
    if (rrPre !== null && rrPost !== null) {
      const totalRR = rrPre + rrPost;
      // Compensatory pause: total RR approximately equals 2x average RR
      compensatoryPause = totalRR > this.averageRR * 1.8 && totalRR < this.averageRR * 2.2;
    }

    return {
      rrPre,
      rrPost,
      prematurityIndex,
      compensatoryPause,
      couplingInterval: rrPre,
    };
  }

  /**
   * Detect pacing spike
   */
  private detectPacingSpike(signal: number[], qrsOnset: number): boolean {
    const searchWindow = Math.round(0.02 * this.sampleRate); // 20ms before QRS
    const start = Math.max(0, qrsOnset - searchWindow);

    // Look for sharp spike (very high slope)
    for (let i = start + 1; i < qrsOnset; i++) {
      const slope = Math.abs(signal[i] - signal[i - 1]);
      // Pacing spike has very rapid rise/fall
      if (slope > 1000) { // Threshold for pacing artifact
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate PVC likelihood score
   */
  private calculatePVCScore(
    morphology: BeatMorphology,
    timing: BeatTiming,
    reasoning: string[]
  ): number {
    let score = 0;

    // Wide QRS (> 120ms) is hallmark of PVC
    if (morphology.qrsWidth > 140) {
      score += 0.35;
      reasoning.push(`Wide QRS (${morphology.qrsWidth.toFixed(0)}ms)`);
    } else if (morphology.qrsWidth > 120) {
      score += 0.2;
      reasoning.push(`Borderline wide QRS (${morphology.qrsWidth.toFixed(0)}ms)`);
    }

    // No preceding P wave
    if (!morphology.pWavePresent) {
      score += 0.2;
      reasoning.push('No preceding P wave');
    }

    // Premature timing
    if (timing.prematurityIndex !== null && timing.prematurityIndex < 0.85) {
      score += 0.15;
      reasoning.push(`Premature (${(timing.prematurityIndex * 100).toFixed(0)}% of average RR)`);
    }

    // Compensatory pause
    if (timing.compensatoryPause) {
      score += 0.15;
      reasoning.push('Followed by compensatory pause');
    }

    // Low template correlation (different morphology)
    if (morphology.templateCorrelation < 0.5) {
      score += 0.15;
      reasoning.push('Abnormal QRS morphology');
    }

    // T wave discordance (opposite polarity to QRS)
    if ((morphology.rPolarity === 'positive' && morphology.tWavePolarity === 'negative') ||
        (morphology.rPolarity === 'negative' && morphology.tWavePolarity === 'positive')) {
      score += 0.1;
      reasoning.push('T wave discordant with QRS');
    }

    return Math.min(1, score);
  }

  /**
   * Calculate PAC likelihood score
   */
  private calculatePACScore(
    morphology: BeatMorphology,
    timing: BeatTiming,
    reasoning: string[]
  ): number {
    let score = 0;

    // Normal or near-normal QRS width
    if (morphology.qrsWidth <= 120) {
      score += 0.2;
    }

    // Premature timing
    if (timing.prematurityIndex !== null && timing.prematurityIndex < 0.9) {
      score += 0.25;
      reasoning.push(`Premature timing (${(timing.prematurityIndex * 100).toFixed(0)}% of average RR)`);
    }

    // P wave present but potentially different morphology
    if (morphology.pWavePresent) {
      score += 0.15;
      // Check for abnormal P wave morphology
      if (morphology.pWavePolarity === 'negative' || morphology.pWavePolarity === 'biphasic') {
        score += 0.1;
        reasoning.push('Abnormal P wave morphology');
      }
    } else {
      // Hidden P wave (in T wave of previous beat)
      if (timing.prematurityIndex !== null && timing.prematurityIndex < 0.8) {
        score += 0.1;
        reasoning.push('P wave likely hidden in previous T wave');
      }
    }

    // Good template correlation (normal QRS morphology)
    if (morphology.templateCorrelation > 0.7) {
      score += 0.15;
      reasoning.push('Normal QRS morphology');
    }

    // Non-compensatory pause
    if (!timing.compensatoryPause && timing.rrPost !== null) {
      score += 0.1;
      reasoning.push('Non-compensatory pause');
    }

    return Math.min(1, score);
  }

  /**
   * Calculate fusion beat likelihood score
   */
  private calculateFusionScore(
    morphology: BeatMorphology,
    timing: BeatTiming,
    reasoning: string[]
  ): number {
    let score = 0;

    // Intermediate QRS width (between normal and PVC)
    if (morphology.qrsWidth > 100 && morphology.qrsWidth < 140) {
      score += 0.25;
      reasoning.push('Intermediate QRS width suggesting fusion');
    }

    // Intermediate template correlation
    if (morphology.templateCorrelation > 0.4 && morphology.templateCorrelation < 0.7) {
      score += 0.25;
      reasoning.push('Intermediate morphology (between normal and ectopic)');
    }

    // Timing near expected sinus beat
    if (timing.prematurityIndex !== null) {
      if (timing.prematurityIndex > 0.9 && timing.prematurityIndex < 1.1) {
        score += 0.2;
        reasoning.push('Timing close to expected sinus beat');
      }
    }

    return Math.min(1, score);
  }

  /**
   * Determine specific PVC type
   */
  private determinePVCType(
    _morphology: BeatMorphology,
    timing: BeatTiming
  ): DetailedBeatType {
    // Check for escape beat (late, not premature)
    if (timing.prematurityIndex !== null && timing.prematurityIndex > 1.5) {
      return 'ventricular_escape';
    }

    // Check for interpolated PVC (no pause)
    if (!timing.compensatoryPause && timing.rrPost !== null) {
      if (timing.rrPost < this.averageRR * 1.1) {
        return 'interpolated_pvc';
      }
    }

    return 'pvc';
  }

  /**
   * Detect QRS notch (sign of BBB or fragmentation)
   */
  private detectQRSNotch(signal: number[], beat: BeatAnnotation): boolean {
    const qrsStart = beat.qrs.onset.index;
    const qrsEnd = beat.qrs.jPoint.index;

    let directionChanges = 0;
    let prevDirection = 0;

    for (let i = qrsStart + 1; i < qrsEnd; i++) {
      const direction = Math.sign(signal[i] - signal[i - 1]);
      if (direction !== 0 && direction !== prevDirection) {
        directionChanges++;
        prevDirection = direction;
      }
    }

    // Normal QRS has 2-3 direction changes, notched has more
    return directionChanges > 4;
  }

  /**
   * Check for RBBB morphology
   */
  private isRBBBMorphology(signal: number[], beat: BeatAnnotation): boolean {
    // RBBB: rsR' pattern in V1, wide S in I and V6
    // For simplicity, check for secondary R wave
    const qrsEnd = beat.qrs.jPoint.index;
    const rPeak = beat.qrs.rPeak.index;

    let secondaryR = false;
    for (let i = rPeak + 5; i < qrsEnd - 2; i++) {
      if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
        if (signal[i] > signal[rPeak] * 0.3) {
          secondaryR = true;
          break;
        }
      }
    }

    return secondaryR;
  }

  /**
   * Check for LBBB morphology
   */
  private isLBBBMorphology(signal: number[], beat: BeatAnnotation): boolean {
    // LBBB: Broad, notched R in I and V6, QS or rS in V1
    // Check for notched R without preceding Q
    const hasQWave = beat.qrs.qWave !== undefined;
    const hasNotch = this.detectQRSNotch(signal, beat);

    return !hasQWave && hasNotch && beat.qrsDuration > 120;
  }

  /**
   * Calculate template correlation
   */
  private calculateTemplateCorrelation(signal: number[], beat: BeatAnnotation): number {
    if (this.templateBeat.length === 0) return 0.5;

    const halfWindow = Math.floor(this.templateBeat.length / 2);
    const rPeak = beat.qrs.rPeak.index;
    const start = Math.max(0, rPeak - halfWindow);
    const end = Math.min(signal.length, start + this.templateBeat.length);

    if (end - start < this.templateBeat.length * 0.8) return 0.3;

    // Extract and normalize beat
    const beatSegment = signal.slice(start, end);
    const max = Math.max(...beatSegment);
    const min = Math.min(...beatSegment);
    const range = max - min;

    if (range < 100) return 0.2;

    const normalized = beatSegment.map(v => (v - min) / range);

    // Calculate Pearson correlation using utility function
    const n = Math.min(normalized.length, this.templateBeat.length);
    const correlation = pearsonCorrelation(
      this.templateBeat.slice(0, n),
      normalized.slice(0, n)
    );

    // Normalize correlation from [-1, 1] to [0, 1]
    return Math.max(0, Math.min(1, (correlation + 1) / 2));
  }

  /**
   * Detect patterns (bigeminy, couplets, etc.)
   */
  private detectPatterns(beats: BeatClassification[]): BeatPattern[] {
    const patterns: BeatPattern[] = [];

    // Detect PVC runs (couplets, triplets, NSVT)
    let runStart = -1;
    let runLength = 0;

    for (let i = 0; i < beats.length; i++) {
      if (beats[i].aamiClass === 'V') {
        if (runStart === -1) {
          runStart = i;
          runLength = 1;
        } else {
          runLength++;
        }
      } else {
        if (runLength >= 2) {
          const patternType: BeatPattern['type'] =
            runLength === 2 ? 'couplet' :
            runLength === 3 ? 'triplet' : 'run';

          patterns.push({
            type: patternType,
            startBeat: runStart,
            endBeat: runStart + runLength - 1,
            beatCount: runLength,
            confidence: 0.85,
          });
        }
        runStart = -1;
        runLength = 0;
      }
    }

    // Handle run at end
    if (runLength >= 2) {
      patterns.push({
        type: runLength === 2 ? 'couplet' : runLength === 3 ? 'triplet' : 'run',
        startBeat: runStart,
        endBeat: runStart + runLength - 1,
        beatCount: runLength,
        confidence: 0.85,
      });
    }

    // Detect bigeminy (N-V-N-V pattern)
    for (let i = 0; i < beats.length - 3; i++) {
      if (beats[i].aamiClass === 'N' && beats[i + 1].aamiClass === 'V' &&
          beats[i + 2].aamiClass === 'N' && beats[i + 3].aamiClass === 'V') {
        // Check if pattern continues
        let patternEnd = i + 3;
        while (patternEnd + 2 < beats.length &&
               beats[patternEnd + 1].aamiClass === 'N' &&
               beats[patternEnd + 2].aamiClass === 'V') {
          patternEnd += 2;
        }

        if (patternEnd - i >= 5) { // At least 3 cycles
          patterns.push({
            type: 'bigeminy',
            startBeat: i,
            endBeat: patternEnd,
            beatCount: patternEnd - i + 1,
            confidence: 0.9,
          });
          i = patternEnd; // Skip processed beats
        }
      }
    }

    // Detect trigeminy (N-N-V pattern)
    for (let i = 0; i < beats.length - 5; i++) {
      if (beats[i].aamiClass === 'N' && beats[i + 1].aamiClass === 'N' &&
          beats[i + 2].aamiClass === 'V' &&
          beats[i + 3].aamiClass === 'N' && beats[i + 4].aamiClass === 'N' &&
          beats[i + 5].aamiClass === 'V') {
        let patternEnd = i + 5;
        while (patternEnd + 3 < beats.length &&
               beats[patternEnd + 1].aamiClass === 'N' &&
               beats[patternEnd + 2].aamiClass === 'N' &&
               beats[patternEnd + 3].aamiClass === 'V') {
          patternEnd += 3;
        }

        if (patternEnd - i >= 8) { // At least 3 cycles
          patterns.push({
            type: 'trigeminy',
            startBeat: i,
            endBeat: patternEnd,
            beatCount: patternEnd - i + 1,
            confidence: 0.9,
          });
          i = patternEnd;
        }
      }
    }

    return patterns;
  }

  /**
   * Update beats with pattern context
   */
  private updatePatternContext(beats: BeatClassification[], patterns: BeatPattern[]): void {
    for (const pattern of patterns) {
      for (let i = pattern.startBeat; i <= pattern.endBeat; i++) {
        beats[i].patternContext = pattern.type;
        if (pattern.type === 'couplet') {
          beats[i].detailedType = 'couplet';
        } else if (pattern.type === 'triplet') {
          beats[i].detailedType = 'triplet';
        } else if (pattern.type === 'run' && pattern.beatCount >= 3) {
          beats[i].detailedType = 'nsvt';
        } else if (pattern.type === 'bigeminy') {
          if (beats[i].aamiClass === 'V') {
            beats[i].detailedType = 'bigeminy_pvc';
          }
        } else if (pattern.type === 'trigeminy') {
          if (beats[i].aamiClass === 'V') {
            beats[i].detailedType = 'trigeminy_pvc';
          }
        }
      }
    }
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(
    beats: BeatClassification[],
    patterns: BeatPattern[]
  ): ClassificationSummary {
    let normalCount = 0;
    let pacCount = 0;
    let pvcCount = 0;
    let pacedCount = 0;
    let unknownCount = 0;

    for (const beat of beats) {
      switch (beat.aamiClass) {
        case 'N': normalCount++; break;
        case 'S': pacCount++; break;
        case 'V': pvcCount++; break;
        case 'P': pacedCount++; break;
        case 'Q': unknownCount++; break;
        case 'F': normalCount++; break; // Count fusion with normal for burden
      }
    }

    const totalBeats = beats.length;
    const pvcBurden = totalBeats > 0 ? (pvcCount / totalBeats) * 100 : 0;
    const pacBurden = totalBeats > 0 ? (pacCount / totalBeats) * 100 : 0;

    const coupletCount = patterns.filter(p => p.type === 'couplet').length;
    const tripletCount = patterns.filter(p => p.type === 'triplet').length;
    const nsvtCount = patterns.filter(p => p.type === 'run' && p.beatCount >= 3).length;

    const longestPVCRun = patterns
      .filter(p => p.type === 'run' || p.type === 'triplet')
      .reduce((max, p) => Math.max(max, p.beatCount), 0);

    return {
      totalBeats,
      normalCount,
      pacCount,
      pvcCount,
      pacedCount,
      unknownCount,
      pvcBurden,
      pacBurden,
      patterns,
      longestPVCRun: Math.max(longestPVCRun, tripletCount > 0 ? 3 : coupletCount > 0 ? 2 : 0),
      coupletCount,
      tripletCount,
      nsvtCount,
    };
  }

  /**
   * Create empty result
   */
  private createEmptyResult(startTime: number): BeatClassificationResult {
    return {
      beats: [],
      summary: {
        totalBeats: 0,
        normalCount: 0,
        pacCount: 0,
        pvcCount: 0,
        pacedCount: 0,
        unknownCount: 0,
        pvcBurden: 0,
        pacBurden: 0,
        patterns: [],
        longestPVCRun: 0,
        coupletCount: 0,
        tripletCount: 0,
        nsvtCount: 0,
      },
      templateBeat: [],
      sampleRate: this.sampleRate,
      processingTimeMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Classify all beats in the recording
 */
export function classifyBeats(
  fiducialResult: FiducialDetectionResult,
  leadData: Partial<Record<LeadName, number[]>>,
  sampleRate: number
): BeatClassificationResult {
  const classifier = new BeatClassifier(sampleRate);
  return classifier.classify(fiducialResult, leadData);
}

/**
 * Get PVC burden percentage
 */
export function getPVCBurden(classificationResult: BeatClassificationResult): number {
  return classificationResult.summary.pvcBurden;
}

/**
 * Check if recording has significant ectopy
 */
export function hasSignificantEctopy(
  classificationResult: BeatClassificationResult,
  pvcThreshold: number = 5,  // 5% PVC burden
  coupletThreshold: number = 1
): boolean {
  return classificationResult.summary.pvcBurden > pvcThreshold ||
         classificationResult.summary.coupletCount > coupletThreshold ||
         classificationResult.summary.nsvtCount > 0;
}
