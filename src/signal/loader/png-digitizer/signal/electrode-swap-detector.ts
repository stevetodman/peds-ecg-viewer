/**
 * Electrode Swap Detector
 * Detects common ECG lead placement errors that affect diagnosis
 *
 * Critical for clinical safety - electrode swaps are common (estimated 0.4-4% of ECGs)
 * and can lead to misdiagnosis.
 *
 * Common swaps detected:
 * - LA-RA (Left Arm - Right Arm): Most common, inverts Lead I
 * - LA-LL (Left Arm - Left Leg): Affects leads I, II, III
 * - RA-LL (Right Arm - Left Leg): Affects all limb leads
 * - Precordial lead swaps: V1-V2, V2-V3, etc.
 *
 * @module signal/loader/png-digitizer/signal/electrode-swap-detector
 */

import type { LeadName } from '../types';

/**
 * Types of electrode swaps
 */
export type ElectrodeSwapType =
  | 'LA_RA'      // Left Arm - Right Arm swap
  | 'LA_LL'      // Left Arm - Left Leg swap
  | 'RA_LL'      // Right Arm - Left Leg swap
  | 'LA_RA_LL'   // Three-way rotation
  | 'V1_V2'      // Precordial V1-V2 swap
  | 'V2_V3'      // Precordial V2-V3 swap
  | 'V3_V4'      // Precordial V3-V4 swap
  | 'V4_V5'      // Precordial V4-V5 swap
  | 'V5_V6'      // Precordial V5-V6 swap
  | 'V1_V3'      // Non-adjacent precordial swap
  | 'DEXTROCARDIA' // True dextrocardia (not a swap)
  | 'RIGHT_SIDED'; // Right-sided ECG (intentional)

/**
 * Electrode swap detection result
 */
export interface ElectrodeSwapResult {
  /** Whether a swap was detected */
  swapDetected: boolean;

  /** Type of swap (if detected) */
  swapType?: ElectrodeSwapType;

  /** Confidence of detection (0-1) */
  confidence: number;

  /** Evidence supporting the detection */
  evidence: SwapEvidence[];

  /** Affected leads */
  affectedLeads: LeadName[];

  /** Clinical implications */
  clinicalImplications: string[];

  /** Suggested correction */
  suggestedCorrection?: string;

  /** Could this be true pathology? */
  possiblePathology?: string;
}

/**
 * Evidence for swap detection
 */
export interface SwapEvidence {
  /** Type of evidence */
  type: 'inversion' | 'progression' | 'amplitude' | 'axis' | 'correlation';

  /** Description */
  description: string;

  /** Strength (0-1) */
  strength: number;

  /** Leads involved */
  leads: LeadName[];
}

/**
 * Electrode Swap Detector class
 */
export class ElectrodeSwapDetector {
  private leads: Partial<Record<LeadName, number[]>>;
  // Sample rate available for timing-based analysis
  readonly sampleRate: number;

  constructor(leads: Partial<Record<LeadName, number[]>>, sampleRate: number) {
    this.leads = leads;
    this.sampleRate = sampleRate;
  }

  /**
   * Detect electrode swaps in the ECG
   */
  detect(): ElectrodeSwapResult {
    const evidence: SwapEvidence[] = [];

    // Check for LA-RA swap (most common)
    const laRaEvidence = this.checkLaRaSwap();
    if (laRaEvidence) evidence.push(...laRaEvidence);

    // Check for limb lead swaps using Einthoven's law
    const einthovenEvidence = this.checkEinthovenViolation();
    if (einthovenEvidence) evidence.push(einthovenEvidence);

    // Check precordial progression
    const progressionEvidence = this.checkPrecordialProgression();
    if (progressionEvidence) evidence.push(...progressionEvidence);

    // Check for specific swap patterns
    const laLlEvidence = this.checkLaLlSwap();
    if (laLlEvidence) evidence.push(...laLlEvidence);

    const raLlEvidence = this.checkRaLlSwap();
    if (raLlEvidence) evidence.push(...raLlEvidence);

    // Determine most likely swap
    const { swapType, confidence, affectedLeads } = this.determineSwapType(evidence);

    // Check for dextrocardia vs swap
    const dextrocardiaCheck = this.checkDextrocardia();
    if (dextrocardiaCheck && swapType === 'LA_RA') {
      return {
        swapDetected: false,
        swapType: 'DEXTROCARDIA',
        confidence: dextrocardiaCheck.strength,
        evidence: [...evidence, dextrocardiaCheck],
        affectedLeads: [],
        clinicalImplications: ['True dextrocardia suspected - not an electrode swap'],
        possiblePathology: 'Dextrocardia (mirror-image heart position)',
      };
    }

    if (!swapType) {
      return {
        swapDetected: false,
        confidence: 1 - Math.max(...evidence.map(e => e.strength), 0),
        evidence,
        affectedLeads: [],
        clinicalImplications: [],
      };
    }

    return {
      swapDetected: true,
      swapType,
      confidence,
      evidence,
      affectedLeads,
      clinicalImplications: this.getClinicalImplications(swapType),
      suggestedCorrection: this.getSuggestedCorrection(swapType),
    };
  }

  /**
   * Check for LA-RA (left arm - right arm) swap
   * Signs:
   * - Lead I is inverted (negative P wave, inverted QRS)
   * - Lead II and III appear swapped
   * - aVR and aVL appear swapped
   */
  private checkLaRaSwap(): SwapEvidence[] | null {
    const evidence: SwapEvidence[] = [];
    const leadI = this.leads['I'];
    const aVR = this.leads['aVR'];
    const aVL = this.leads['aVL'];

    if (!leadI) return null;

    // Check if Lead I appears inverted (negative P wave, mostly negative QRS)
    const leadIStats = this.getLeadStatistics(leadI);

    if (leadIStats.isInverted) {
      evidence.push({
        type: 'inversion',
        description: 'Lead I appears inverted (negative P wave pattern)',
        strength: 0.8,
        leads: ['I'],
      });
    }

    // In LA-RA swap, Lead I becomes -Lead I
    // Check for negative mean amplitude in Lead I
    if (leadIStats.meanAmplitude < -50) {
      evidence.push({
        type: 'amplitude',
        description: 'Lead I has predominantly negative amplitude',
        strength: 0.7,
        leads: ['I'],
      });
    }

    // Check aVR/aVL swap pattern
    if (aVR && aVL) {
      const aVRStats = this.getLeadStatistics(aVR);
      const aVLStats = this.getLeadStatistics(aVL);

      // Normally aVR is negative, aVL is positive
      // In LA-RA swap, they're swapped
      if (aVRStats.meanAmplitude > 0 && aVLStats.meanAmplitude < 0) {
        evidence.push({
          type: 'amplitude',
          description: 'aVR and aVL polarities suggest swap (aVR positive, aVL negative)',
          strength: 0.75,
          leads: ['aVR', 'aVL'],
        });
      }
    }

    return evidence.length > 0 ? evidence : null;
  }

  /**
   * Check for violation of Einthoven's law: I + III = II
   */
  private checkEinthovenViolation(): SwapEvidence | null {
    const leadI = this.leads['I'];
    const leadII = this.leads['II'];
    const leadIII = this.leads['III'];

    if (!leadI || !leadII || !leadIII) return null;

    const minLen = Math.min(leadI.length, leadII.length, leadIII.length);

    // Calculate correlation between (I + III) and II
    let sumSquaredError = 0;
    let sumSquaredII = 0;

    for (let i = 0; i < minLen; i++) {
      const predicted = leadI[i] + leadIII[i];
      const actual = leadII[i];
      const error = predicted - actual;
      sumSquaredError += error * error;
      sumSquaredII += actual * actual;
    }

    const rmse = Math.sqrt(sumSquaredError / minLen);
    const rmsII = Math.sqrt(sumSquaredII / minLen);
    const relativeError = rmse / (rmsII + 0.001);

    // If relative error is high, there may be a lead swap
    if (relativeError > 0.5) {
      return {
        type: 'correlation',
        description: `Einthoven's law violation: I + III ≠ II (relative error: ${(relativeError * 100).toFixed(1)}%)`,
        strength: Math.min(1, relativeError),
        leads: ['I', 'II', 'III'],
      };
    }

    return null;
  }

  /**
   * Check precordial lead progression
   * Normal: R wave increases V1 → V4/V5, then decreases
   * S wave decreases V1 → V6
   */
  private checkPrecordialProgression(): SwapEvidence[] | null {
    const precordialLeads: LeadName[] = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
    const evidence: SwapEvidence[] = [];

    const rAmplitudes: number[] = [];
    const sAmplitudes: number[] = [];

    for (const lead of precordialLeads) {
      const data = this.leads[lead];
      if (!data) continue;

      const stats = this.getLeadStatistics(data);
      rAmplitudes.push(stats.maxAmplitude);
      sAmplitudes.push(Math.abs(stats.minAmplitude));
    }

    if (rAmplitudes.length < 6) return null;

    // Check for broken R-wave progression
    for (let i = 0; i < 5; i++) {
      const current = rAmplitudes[i];
      const next = rAmplitudes[i + 1];

      // R wave should generally increase from V1-V4
      if (i < 3 && current > next * 1.5) {
        evidence.push({
          type: 'progression',
          description: `Unexpected R-wave drop from ${precordialLeads[i]} to ${precordialLeads[i + 1]}`,
          strength: 0.6,
          leads: [precordialLeads[i], precordialLeads[i + 1]],
        });
      }
    }

    // Check for adjacent lead swap patterns
    for (let i = 0; i < 5; i++) {
      const correlation = this.calculateCorrelation(
        this.leads[precordialLeads[i]],
        this.leads[precordialLeads[i + 1]]
      );

      // Adjacent precordial leads should be highly correlated
      // Very low correlation suggests a swap
      if (correlation !== null && correlation < 0.5) {
        evidence.push({
          type: 'correlation',
          description: `Low correlation between adjacent leads ${precordialLeads[i]} and ${precordialLeads[i + 1]} (${(correlation * 100).toFixed(0)}%)`,
          strength: 0.65,
          leads: [precordialLeads[i], precordialLeads[i + 1]],
        });
      }
    }

    return evidence.length > 0 ? evidence : null;
  }

  /**
   * Check for LA-LL (left arm - left leg) swap
   * Signs:
   * - Leads II and III are swapped
   * - Lead I is normal
   * - aVL and aVF are swapped
   */
  private checkLaLlSwap(): SwapEvidence[] | null {
    const evidence: SwapEvidence[] = [];
    const leadI = this.leads['I'];
    const leadIII = this.leads['III'];
    const aVL = this.leads['aVL'];
    const aVF = this.leads['aVF'];

    if (!leadI || !leadIII) return null;

    // In LA-LL swap:
    // - New Lead II = old Lead III
    // - New Lead III = old Lead II
    // - Lead I becomes inverted

    const leadIStats = this.getLeadStatistics(leadI);
    const leadIIIStats = this.getLeadStatistics(leadIII);

    // Check for inverted Lead I with unusual III characteristics
    if (leadIStats.isInverted && Math.abs(leadIIIStats.maxAmplitude) > 500) {
      evidence.push({
        type: 'amplitude',
        description: 'Lead I inverted with abnormal Lead III amplitude pattern',
        strength: 0.6,
        leads: ['I', 'III'],
      });
    }

    // Check aVL/aVF swap
    if (aVL && aVF) {
      const aVLStats = this.getLeadStatistics(aVL);
      const aVFStats = this.getLeadStatistics(aVF);

      // Normally in most patients, aVL and aVF have characteristic differences
      // A swap would reverse their typical pattern
      if (aVLStats.meanAmplitude > aVFStats.meanAmplitude * 2) {
        evidence.push({
          type: 'amplitude',
          description: 'aVL amplitude unusually larger than aVF',
          strength: 0.5,
          leads: ['aVL', 'aVF'],
        });
      }
    }

    return evidence.length > 0 ? evidence : null;
  }

  /**
   * Check for RA-LL (right arm - left leg) swap
   */
  private checkRaLlSwap(): SwapEvidence[] | null {
    const evidence: SwapEvidence[] = [];
    const leadI = this.leads['I'];
    const leadII = this.leads['II'];
    const leadIII = this.leads['III'];

    if (!leadI || !leadII || !leadIII) return null;

    // In RA-LL swap:
    // - New Lead I = -old Lead II
    // - New Lead II = -old Lead I
    // - New Lead III = -old Lead III

    // Check if Lead II looks like inverted Lead I
    const correlation = this.calculateCorrelation(leadI, leadII);
    if (correlation !== null && correlation < -0.7) {
      evidence.push({
        type: 'correlation',
        description: 'Lead I and Lead II appear to be inversely correlated',
        strength: Math.abs(correlation),
        leads: ['I', 'II'],
      });
    }

    // Lead III should be inverted
    const leadIIIStats = this.getLeadStatistics(leadIII);
    if (leadIIIStats.isInverted) {
      evidence.push({
        type: 'inversion',
        description: 'Lead III appears inverted',
        strength: 0.6,
        leads: ['III'],
      });
    }

    return evidence.length > 0 ? evidence : null;
  }

  /**
   * Check for dextrocardia pattern
   * True dextrocardia shows:
   * - Inverted P wave in Lead I
   * - Decreasing R wave amplitude V1 → V6
   * - All precordial leads affected similarly
   */
  private checkDextrocardia(): SwapEvidence | null {
    const leadI = this.leads['I'];

    if (!leadI) return null;

    const leadIStats = this.getLeadStatistics(leadI);

    // Check for inverted Lead I
    if (!leadIStats.isInverted) return null;

    // Check precordial progression
    const precordialLeads: LeadName[] = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
    const rAmplitudes: number[] = [];

    for (const lead of precordialLeads) {
      const data = this.leads[lead];
      if (!data) return null;
      const stats = this.getLeadStatistics(data);
      rAmplitudes.push(stats.maxAmplitude);
    }

    // In dextrocardia, R wave decreases from V1 to V6 (opposite of normal)
    let decreasingProgression = true;
    for (let i = 0; i < 5; i++) {
      if (rAmplitudes[i] < rAmplitudes[i + 1] * 0.8) {
        decreasingProgression = false;
        break;
      }
    }

    if (decreasingProgression) {
      return {
        type: 'progression',
        description: 'Decreasing R-wave progression V1→V6 with inverted Lead I suggests dextrocardia',
        strength: 0.85,
        leads: ['I', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'],
      };
    }

    return null;
  }

  /**
   * Get statistics for a lead
   */
  private getLeadStatistics(data: number[]): {
    meanAmplitude: number;
    maxAmplitude: number;
    minAmplitude: number;
    isInverted: boolean;
  } {
    if (data.length === 0) {
      return { meanAmplitude: 0, maxAmplitude: 0, minAmplitude: 0, isInverted: false };
    }

    let sum = 0;
    let max = -Infinity;
    let min = Infinity;

    for (const value of data) {
      sum += value;
      max = Math.max(max, value);
      min = Math.min(min, value);
    }

    const mean = sum / data.length;

    // Consider inverted if mean is negative and min is larger magnitude than max
    const isInverted = mean < 0 && Math.abs(min) > Math.abs(max) * 1.5;

    return {
      meanAmplitude: mean,
      maxAmplitude: max,
      minAmplitude: min,
      isInverted,
    };
  }

  /**
   * Calculate Pearson correlation between two leads
   */
  private calculateCorrelation(lead1?: number[], lead2?: number[]): number | null {
    if (!lead1 || !lead2) return null;

    const n = Math.min(lead1.length, lead2.length);
    if (n < 10) return null;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += lead1[i];
      sumY += lead2[i];
      sumXY += lead1[i] * lead2[i];
      sumX2 += lead1[i] * lead1[i];
      sumY2 += lead2[i] * lead2[i];
    }

    const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (denom === 0) return null;

    return (n * sumXY - sumX * sumY) / denom;
  }

  /**
   * Determine the most likely swap type from evidence
   */
  private determineSwapType(evidence: SwapEvidence[]): {
    swapType: ElectrodeSwapType | null;
    confidence: number;
    affectedLeads: LeadName[];
  } {
    if (evidence.length === 0) {
      return { swapType: null, confidence: 0, affectedLeads: [] };
    }

    // Score each swap type
    const scores: Record<ElectrodeSwapType, number> = {
      LA_RA: 0,
      LA_LL: 0,
      RA_LL: 0,
      LA_RA_LL: 0,
      V1_V2: 0,
      V2_V3: 0,
      V3_V4: 0,
      V4_V5: 0,
      V5_V6: 0,
      V1_V3: 0,
      DEXTROCARDIA: 0,
      RIGHT_SIDED: 0,
    };

    for (const e of evidence) {
      const leads = new Set(e.leads);

      // LA-RA swap evidence
      if (leads.has('I') && e.type === 'inversion') {
        scores.LA_RA += e.strength * 0.5;
      }
      if (leads.has('aVR') && leads.has('aVL')) {
        scores.LA_RA += e.strength * 0.3;
      }

      // LA-LL swap evidence
      if (leads.has('II') && leads.has('III')) {
        scores.LA_LL += e.strength * 0.4;
      }
      if (leads.has('aVL') && leads.has('aVF')) {
        scores.LA_LL += e.strength * 0.3;
      }

      // RA-LL swap evidence
      if (e.type === 'correlation' && leads.has('I') && leads.has('II')) {
        scores.RA_LL += e.strength * 0.5;
      }

      // Precordial swap evidence
      if (leads.has('V1') && leads.has('V2')) scores.V1_V2 += e.strength * 0.5;
      if (leads.has('V2') && leads.has('V3')) scores.V2_V3 += e.strength * 0.5;
      if (leads.has('V3') && leads.has('V4')) scores.V3_V4 += e.strength * 0.5;
      if (leads.has('V4') && leads.has('V5')) scores.V4_V5 += e.strength * 0.5;
      if (leads.has('V5') && leads.has('V6')) scores.V5_V6 += e.strength * 0.5;
    }

    // Find highest scoring swap
    let maxScore = 0;
    let bestSwap: ElectrodeSwapType | null = null;

    for (const [swap, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        bestSwap = swap as ElectrodeSwapType;
      }
    }

    // Only report if confidence is above threshold
    if (maxScore < 0.5) {
      return { swapType: null, confidence: 0, affectedLeads: [] };
    }

    const affectedLeads = this.getAffectedLeads(bestSwap);

    return {
      swapType: bestSwap,
      confidence: Math.min(1, maxScore),
      affectedLeads,
    };
  }

  /**
   * Get leads affected by a swap type
   */
  private getAffectedLeads(swapType: ElectrodeSwapType | null): LeadName[] {
    switch (swapType) {
      case 'LA_RA':
        return ['I', 'II', 'III', 'aVR', 'aVL'];
      case 'LA_LL':
        return ['I', 'II', 'III', 'aVL', 'aVF'];
      case 'RA_LL':
        return ['I', 'II', 'III', 'aVR', 'aVF'];
      case 'LA_RA_LL':
        return ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'];
      case 'V1_V2':
        return ['V1', 'V2'];
      case 'V2_V3':
        return ['V2', 'V3'];
      case 'V3_V4':
        return ['V3', 'V4'];
      case 'V4_V5':
        return ['V4', 'V5'];
      case 'V5_V6':
        return ['V5', 'V6'];
      case 'V1_V3':
        return ['V1', 'V3'];
      default:
        return [];
    }
  }

  /**
   * Get clinical implications of a swap
   */
  private getClinicalImplications(swapType: ElectrodeSwapType): string[] {
    const implications: string[] = [];

    switch (swapType) {
      case 'LA_RA':
        implications.push('⚠️ LA-RA swap detected - Lead I will appear inverted');
        implications.push('QRS axis calculation will be incorrect (+/-180°)');
        implications.push('May simulate lateral MI or lead to missed STEMI');
        implications.push('P-wave axis will be abnormal');
        break;
      case 'LA_LL':
        implications.push('⚠️ LA-LL swap detected - Leads II and III interchanged');
        implications.push('Lead I will appear inverted');
        implications.push('May simulate inferior MI');
        break;
      case 'RA_LL':
        implications.push('⚠️ RA-LL swap detected - All limb leads affected');
        implications.push('Very abnormal axis (-90°)');
        implications.push('May simulate various pathologies');
        break;
      case 'V1_V2':
      case 'V2_V3':
      case 'V3_V4':
      case 'V4_V5':
      case 'V5_V6':
        implications.push(`⚠️ Precordial lead swap detected (${swapType.replace('_', '-')})`);
        implications.push('R-wave progression will be abnormal');
        implications.push('May simulate anterior MI or ventricular hypertrophy');
        break;
    }

    implications.push('Repeat ECG with correct lead placement recommended');

    return implications;
  }

  /**
   * Get suggested correction for a swap
   */
  private getSuggestedCorrection(swapType: ElectrodeSwapType): string {
    switch (swapType) {
      case 'LA_RA':
        return 'Swap Left Arm and Right Arm electrodes, then repeat ECG';
      case 'LA_LL':
        return 'Swap Left Arm and Left Leg electrodes, then repeat ECG';
      case 'RA_LL':
        return 'Swap Right Arm and Left Leg electrodes, then repeat ECG';
      case 'V1_V2':
        return 'Swap V1 and V2 electrodes, then repeat ECG';
      case 'V2_V3':
        return 'Swap V2 and V3 electrodes, then repeat ECG';
      case 'V3_V4':
        return 'Swap V3 and V4 electrodes, then repeat ECG';
      case 'V4_V5':
        return 'Swap V4 and V5 electrodes, then repeat ECG';
      case 'V5_V6':
        return 'Swap V5 and V6 electrodes, then repeat ECG';
      default:
        return 'Review electrode placement and repeat ECG';
    }
  }

  /**
   * Attempt to correct a detected swap (mathematically)
   * Note: This is for analysis only - physical correction is always preferred
   */
  correctSwap(): Partial<Record<LeadName, number[]>> | null {
    const detection = this.detect();

    if (!detection.swapDetected || !detection.swapType) {
      return null;
    }

    const corrected: Partial<Record<LeadName, number[]>> = { ...this.leads };

    switch (detection.swapType) {
      case 'LA_RA':
        // Invert Lead I, swap II/III, swap aVR/aVL
        if (corrected['I']) {
          corrected['I'] = corrected['I'].map(v => -v);
        }
        [corrected['II'], corrected['III']] = [corrected['III'], corrected['II']];
        [corrected['aVR'], corrected['aVL']] = [corrected['aVL'], corrected['aVR']];
        break;

      case 'LA_LL':
        // Invert Lead I, swap II/III, swap aVL/aVF
        if (corrected['I']) {
          corrected['I'] = corrected['I'].map(v => -v);
        }
        [corrected['II'], corrected['III']] = [corrected['III'], corrected['II']];
        [corrected['aVL'], corrected['aVF']] = [corrected['aVF'], corrected['aVL']];
        break;

      case 'V1_V2':
        [corrected['V1'], corrected['V2']] = [corrected['V2'], corrected['V1']];
        break;
      case 'V2_V3':
        [corrected['V2'], corrected['V3']] = [corrected['V3'], corrected['V2']];
        break;
      case 'V3_V4':
        [corrected['V3'], corrected['V4']] = [corrected['V4'], corrected['V3']];
        break;
      case 'V4_V5':
        [corrected['V4'], corrected['V5']] = [corrected['V5'], corrected['V4']];
        break;
      case 'V5_V6':
        [corrected['V5'], corrected['V6']] = [corrected['V6'], corrected['V5']];
        break;

      default:
        return null;
    }

    return corrected;
  }
}

/**
 * Convenience function for electrode swap detection
 */
export function detectElectrodeSwap(
  leads: Partial<Record<LeadName, number[]>>,
  sampleRate: number
): ElectrodeSwapResult {
  const detector = new ElectrodeSwapDetector(leads, sampleRate);
  return detector.detect();
}

/**
 * Convenience function to attempt swap correction
 */
export function correctElectrodeSwap(
  leads: Partial<Record<LeadName, number[]>>,
  sampleRate: number
): { corrected: Partial<Record<LeadName, number[]>> | null; detection: ElectrodeSwapResult } {
  const detector = new ElectrodeSwapDetector(leads, sampleRate);
  const detection = detector.detect();
  const corrected = detector.correctSwap();
  return { corrected, detection };
}
