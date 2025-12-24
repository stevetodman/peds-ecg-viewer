/**
 * Morphology-Based Lead Identifier
 * Identifies ECG leads using waveform characteristics when text labels are not available
 *
 * @module signal/loader/png-digitizer/cv/lead-identifier
 */

import type { LeadName } from '../../../../types';

/**
 * Waveform morphology features
 */
interface MorphologyFeatures {
  /** Mean amplitude */
  meanAmplitude: number;

  /** Standard deviation of amplitude */
  stdAmplitude: number;

  /** Maximum positive deflection */
  maxPositive: number;

  /** Maximum negative deflection (absolute) */
  maxNegative: number;

  /** Dominant polarity: positive, negative, or biphasic */
  polarity: 'positive' | 'negative' | 'biphasic';

  /** R-wave height (if present) */
  rWaveHeight: number;

  /** S-wave depth (if present) */
  sWaveDepth: number;

  /** QRS width in samples */
  qrsWidth: number;

  /** P-wave present */
  hasPWave: boolean;

  /** T-wave polarity matches QRS */
  tWaveFollowsQRS: boolean;

  /** Noise level */
  noiseLevel: number;
}

/**
 * Lead identification result
 */
export interface LeadIdentification {
  /** Identified lead name */
  lead: LeadName | null;

  /** Confidence in identification */
  confidence: number;

  /** Alternative possibilities */
  alternatives: Array<{ lead: LeadName; confidence: number }>;

  /** Features used for identification */
  features: MorphologyFeatures;
}

/**
 * Typical morphology patterns for each lead
 */
const LEAD_PATTERNS: Record<LeadName, Partial<MorphologyFeatures>> = {
  // Limb leads
  'I': { polarity: 'positive' },
  'II': { polarity: 'positive', maxPositive: 1.2 },
  'III': { polarity: 'biphasic' },
  'aVR': { polarity: 'negative', maxNegative: 1.0 },
  'aVL': { polarity: 'biphasic' },
  'aVF': { polarity: 'positive' },

  // Precordial leads - characteristic R-wave progression
  'V1': { polarity: 'negative', rWaveHeight: 0.2, sWaveDepth: 1.0 },
  'V2': { polarity: 'negative', rWaveHeight: 0.4, sWaveDepth: 0.8 },
  'V3': { polarity: 'biphasic', rWaveHeight: 0.6, sWaveDepth: 0.6 },
  'V4': { polarity: 'positive', rWaveHeight: 0.8, sWaveDepth: 0.3 },
  'V5': { polarity: 'positive', rWaveHeight: 1.0, sWaveDepth: 0.2 },
  'V6': { polarity: 'positive', rWaveHeight: 0.8, sWaveDepth: 0.1 },

  // Extended leads
  'V3R': { polarity: 'negative' },
  'V4R': { polarity: 'negative' },
  'V7': { polarity: 'positive' },
};

/**
 * Morphology-based lead identifier
 */
export class LeadIdentifier {
  /**
   * Extract morphology features from a waveform
   */
  extractFeatures(samples: number[], sampleRate: number = 500): MorphologyFeatures {
    if (samples.length === 0) {
      return this.emptyFeatures();
    }

    // Basic statistics
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const std = Math.sqrt(
      samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length
    );

    // Find extremes
    const maxPositive = Math.max(...samples);
    const maxNegative = Math.abs(Math.min(...samples));

    // Determine polarity
    let polarity: 'positive' | 'negative' | 'biphasic';
    if (maxPositive > maxNegative * 1.5) {
      polarity = 'positive';
    } else if (maxNegative > maxPositive * 1.5) {
      polarity = 'negative';
    } else {
      polarity = 'biphasic';
    }

    // Find QRS complexes
    const qrsInfo = this.detectQRS(samples, sampleRate);

    // Check for P-wave
    const hasPWave = this.detectPWave(samples, qrsInfo.positions, sampleRate);

    // Check T-wave polarity
    const tWaveFollowsQRS = this.checkTWavePolarity(samples, qrsInfo.positions, sampleRate);

    // Estimate noise level
    const noiseLevel = this.estimateNoise(samples);

    return {
      meanAmplitude: mean,
      stdAmplitude: std,
      maxPositive,
      maxNegative,
      polarity,
      rWaveHeight: qrsInfo.rHeight,
      sWaveDepth: qrsInfo.sDepth,
      qrsWidth: qrsInfo.width,
      hasPWave,
      tWaveFollowsQRS,
      noiseLevel,
    };
  }

  /**
   * Identify lead from waveform samples
   */
  identify(samples: number[], sampleRate: number = 500): LeadIdentification {
    const features = this.extractFeatures(samples, sampleRate);
    const scores: Array<{ lead: LeadName; score: number }> = [];

    for (const [lead, pattern] of Object.entries(LEAD_PATTERNS)) {
      const score = this.matchPattern(features, pattern);
      scores.push({ lead: lead as LeadName, score });
    }

    // Sort by score
    scores.sort((a, b) => b.score - a.score);

    // Get top result and alternatives
    const top = scores[0];
    const alternatives = scores.slice(1, 4).map(s => ({
      lead: s.lead,
      confidence: s.score,
    }));

    return {
      lead: top.score > 0.3 ? top.lead : null,
      confidence: top.score,
      alternatives,
      features,
    };
  }

  /**
   * Identify leads in context (using relationships between leads)
   */
  identifyInContext(
    waveforms: Array<{ samples: number[]; row: number; col: number }>,
    sampleRate: number = 500
  ): Map<string, LeadIdentification> {
    const results = new Map<string, LeadIdentification>();

    // First pass: identify each lead independently
    const features: Array<{ key: string; feat: MorphologyFeatures; row: number; col: number }> = [];
    for (const wf of waveforms) {
      const key = `${wf.row}_${wf.col}`;
      const feat = this.extractFeatures(wf.samples, sampleRate);
      features.push({ key, feat, row: wf.row, col: wf.col });
    }

    // Check for precordial R-wave progression
    const precordialCandidates = this.detectPrecordialProgression(features);

    // Check for limb lead relationships (Einthoven)
    const limbCandidates = this.detectLimbRelationships(waveforms);

    // Assign leads based on all evidence
    for (const { key, feat, row, col } of features) {
      const identification = this.identify([], sampleRate);
      identification.features = feat;

      // Check precordial assignment
      const precordialLead = precordialCandidates.get(key);
      if (precordialLead) {
        identification.lead = precordialLead;
        identification.confidence = 0.7;
      }

      // Check limb assignment
      const limbLead = limbCandidates.get(key);
      const limbConf = limbCandidates.get(key + '_conf');
      if (limbLead && typeof limbLead === 'string' && (!precordialLead || (typeof limbConf === 'number' && limbConf > 0.7))) {
        identification.lead = limbLead as LeadName;
        identification.confidence = 0.6;
      }

      // Fall back to position-based inference
      if (!identification.lead && row >= 0 && col >= 0) {
        const positionLead = this.inferFromPosition(row, col);
        if (positionLead) {
          identification.lead = positionLead;
          identification.confidence = 0.4;
        }
      }

      results.set(key, identification);
    }

    return results;
  }

  /**
   * Match features against a pattern
   */
  private matchPattern(features: MorphologyFeatures, pattern: Partial<MorphologyFeatures>): number {
    let score = 0.5; // Base score
    let factors = 0;

    if (pattern.polarity !== undefined) {
      factors++;
      if (features.polarity === pattern.polarity) {
        score += 0.2;
      } else {
        score -= 0.2;
      }
    }

    if (pattern.rWaveHeight !== undefined && features.rWaveHeight > 0) {
      factors++;
      const normalizedR = features.rWaveHeight / features.maxPositive;
      const diff = Math.abs(normalizedR - pattern.rWaveHeight);
      score += 0.15 * (1 - diff);
    }

    if (pattern.sWaveDepth !== undefined && features.sWaveDepth > 0) {
      factors++;
      const normalizedS = features.sWaveDepth / features.maxNegative;
      const diff = Math.abs(normalizedS - pattern.sWaveDepth);
      score += 0.15 * (1 - diff);
    }

    // Normalize by number of factors
    return factors > 0 ? Math.max(0, Math.min(1, score)) : 0.3;
  }

  /**
   * Detect QRS complexes
   */
  private detectQRS(
    samples: number[],
    sampleRate: number
  ): { positions: number[]; rHeight: number; sDepth: number; width: number } {
    // Simple peak detection
    const positions: number[] = [];
    const threshold = Math.max(...samples.map(Math.abs)) * 0.6;
    const minDistance = Math.floor(sampleRate * 0.4); // 400ms min between beats

    let lastPeak = -minDistance;
    let maxR = 0;
    let maxS = 0;

    for (let i = 1; i < samples.length - 1; i++) {
      // Local maximum
      if (
        Math.abs(samples[i]) > threshold &&
        Math.abs(samples[i]) > Math.abs(samples[i - 1]) &&
        Math.abs(samples[i]) > Math.abs(samples[i + 1]) &&
        i - lastPeak > minDistance
      ) {
        positions.push(i);
        lastPeak = i;

        if (samples[i] > 0) {
          maxR = Math.max(maxR, samples[i]);
        } else {
          maxS = Math.max(maxS, Math.abs(samples[i]));
        }
      }
    }

    // Estimate QRS width from first detected complex
    let width = Math.floor(sampleRate * 0.1); // Default 100ms
    if (positions.length > 0) {
      const pos = positions[0];
      const threshold10 = threshold * 0.1;
      let start = pos, end = pos;
      while (start > 0 && Math.abs(samples[start]) > threshold10) start--;
      while (end < samples.length - 1 && Math.abs(samples[end]) > threshold10) end++;
      width = end - start;
    }

    return {
      positions,
      rHeight: maxR,
      sDepth: maxS,
      width,
    };
  }

  /**
   * Detect P-wave presence
   */
  private detectPWave(
    samples: number[],
    qrsPositions: number[],
    sampleRate: number
  ): boolean {
    if (qrsPositions.length === 0) return false;

    // Look for deflection 120-200ms before each QRS
    const pWaveStart = Math.floor(sampleRate * 0.12);
    const pWaveEnd = Math.floor(sampleRate * 0.2);
    let pWaveCount = 0;

    for (const qrsPos of qrsPositions) {
      if (qrsPos < pWaveEnd) continue;

      const pRegion = samples.slice(qrsPos - pWaveEnd, qrsPos - pWaveStart);
      const maxDeflection = Math.max(...pRegion.map(Math.abs));
      const threshold = Math.max(...samples.map(Math.abs)) * 0.15;

      if (maxDeflection > threshold) {
        pWaveCount++;
      }
    }

    return pWaveCount > qrsPositions.length * 0.5;
  }

  /**
   * Check T-wave polarity
   */
  private checkTWavePolarity(
    samples: number[],
    qrsPositions: number[],
    sampleRate: number
  ): boolean {
    if (qrsPositions.length === 0) return false;

    // Look 200-400ms after QRS for T-wave
    const tWaveStart = Math.floor(sampleRate * 0.2);
    const tWaveEnd = Math.floor(sampleRate * 0.4);
    let concordantCount = 0;

    for (const qrsPos of qrsPositions) {
      if (qrsPos + tWaveEnd >= samples.length) continue;

      const qrsPolarity = samples[qrsPos] > 0 ? 'positive' : 'negative';
      const tRegion = samples.slice(qrsPos + tWaveStart, qrsPos + tWaveEnd);
      const tMax = Math.max(...tRegion);
      const tMin = Math.min(...tRegion);
      const tPolarity = Math.abs(tMax) > Math.abs(tMin) ? 'positive' : 'negative';

      if (qrsPolarity === tPolarity) {
        concordantCount++;
      }
    }

    return concordantCount > qrsPositions.length * 0.6;
  }

  /**
   * Estimate noise level
   */
  private estimateNoise(samples: number[]): number {
    // Use high-frequency component as noise estimate
    const highFreq: number[] = [];
    for (let i = 1; i < samples.length - 1; i++) {
      const local = (samples[i - 1] + samples[i] + samples[i + 1]) / 3;
      highFreq.push(Math.abs(samples[i] - local));
    }

    const meanNoise = highFreq.reduce((a, b) => a + b, 0) / highFreq.length;
    const signalRange = Math.max(...samples) - Math.min(...samples);

    return signalRange > 0 ? meanNoise / signalRange : 0;
  }

  /**
   * Detect precordial R-wave progression
   */
  private detectPrecordialProgression(
    features: Array<{ key: string; feat: MorphologyFeatures; row: number; col: number }>
  ): Map<string, LeadName> {
    const result = new Map<string, LeadName>();

    // Group by row
    const rows = new Map<number, typeof features>();
    for (const f of features) {
      if (!rows.has(f.row)) rows.set(f.row, []);
      rows.get(f.row)!.push(f);
    }

    // Look for progression pattern in each row
    for (const [_rowNum, rowFeatures] of rows) {
      // Sort by column
      const sorted = rowFeatures.sort((a, b) => a.col - b.col);

      // Check for R-wave progression (increasing R, decreasing S)
      let isProgression = true;
      let prevRatio = -1;

      for (const f of sorted) {
        const ratio = f.feat.rWaveHeight / Math.max(0.01, f.feat.sWaveDepth);
        if (prevRatio >= 0 && ratio < prevRatio * 0.8) {
          isProgression = false;
          break;
        }
        prevRatio = ratio;
      }

      if (isProgression && sorted.length >= 4) {
        // Assign V1-V6
        const precordialLeads: LeadName[] = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
        for (let i = 0; i < sorted.length && i < 6; i++) {
          result.set(sorted[i].key, precordialLeads[i]);
        }
      }
    }

    return result;
  }

  /**
   * Detect limb lead relationships
   */
  private detectLimbRelationships(
    waveforms: Array<{ samples: number[]; row: number; col: number }>
  ): Map<string, LeadName | number> {
    const result = new Map<string, LeadName | number>();

    // Need at least 3 waveforms to check Einthoven
    if (waveforms.length < 3) return result;

    // Check all combinations of 3 waveforms
    for (let i = 0; i < waveforms.length; i++) {
      for (let j = i + 1; j < waveforms.length; j++) {
        for (let k = j + 1; k < waveforms.length; k++) {
          const wf1 = waveforms[i];
          const wf2 = waveforms[j];
          const wf3 = waveforms[k];

          // Check if wf2 ≈ wf1 + wf3 (Einthoven: II = I + III)
          if (this.checkEinthoven(wf1.samples, wf2.samples, wf3.samples)) {
            result.set(`${wf1.row}_${wf1.col}`, 'I');
            result.set(`${wf2.row}_${wf2.col}`, 'II');
            result.set(`${wf3.row}_${wf3.col}`, 'III');
            result.set(`${wf1.row}_${wf1.col}_conf`, 0.7);
            result.set(`${wf2.row}_${wf2.col}_conf`, 0.7);
            result.set(`${wf3.row}_${wf3.col}_conf`, 0.7);
          }
        }
      }
    }

    return result;
  }

  /**
   * Check Einthoven's law: II = I + III
   */
  private checkEinthoven(lead1: number[], lead2: number[], lead3: number[]): boolean {
    const minLen = Math.min(lead1.length, lead2.length, lead3.length);
    if (minLen < 100) return false;

    let sumError = 0;
    let sumSignal = 0;

    for (let i = 0; i < minLen; i++) {
      const expected = lead1[i] + lead3[i];
      const actual = lead2[i];
      sumError += Math.abs(expected - actual);
      sumSignal += Math.abs(lead2[i]);
    }

    const errorRatio = sumSignal > 0 ? sumError / sumSignal : 1;
    return errorRatio < 0.3; // Allow 30% error
  }

  /**
   * Infer lead from position in standard layout
   */
  private inferFromPosition(row: number, col: number): LeadName | null {
    const standardLayout: LeadName[][] = [
      ['I', 'aVR', 'V1', 'V4'],
      ['II', 'aVL', 'V2', 'V5'],
      ['III', 'aVF', 'V3', 'V6'],
    ];

    return standardLayout[row]?.[col] ?? null;
  }

  /**
   * Create empty features object
   */
  private emptyFeatures(): MorphologyFeatures {
    return {
      meanAmplitude: 0,
      stdAmplitude: 0,
      maxPositive: 0,
      maxNegative: 0,
      polarity: 'biphasic',
      rWaveHeight: 0,
      sWaveDepth: 0,
      qrsWidth: 0,
      hasPWave: false,
      tWaveFollowsQRS: false,
      noiseLevel: 1,
    };
  }
}

/**
 * Convenience function for lead identification
 */
export function identifyLead(
  samples: number[],
  sampleRate: number = 500
): LeadIdentification {
  const identifier = new LeadIdentifier();
  return identifier.identify(samples, sampleRate);
}

/**
 * Identify leads using contextual information
 */
export function identifyLeadsInContext(
  waveforms: Array<{ samples: number[]; row: number; col: number }>,
  sampleRate: number = 500
): Map<string, LeadIdentification> {
  const identifier = new LeadIdentifier();
  return identifier.identifyInContext(waveforms, sampleRate);
}
