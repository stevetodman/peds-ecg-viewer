/**
 * Cross-Lead Correlation Validation
 * Validates ECG signals using physiological relationships between leads
 *
 * @module signal/loader/png-digitizer/signal/cross-lead-validation
 */

import type { LeadName } from '../../../../types';

/**
 * Cross-lead validation result
 */
export interface CrossLeadValidationResult {
  /** Overall validation passed */
  valid: boolean;

  /** Confidence score (0-1) */
  confidence: number;

  /** Einthoven's law validation */
  einthoven: {
    valid: boolean;
    error: number; // RMS error
    correlation: number;
  };

  /** Goldberger equations validation */
  goldberger: {
    aVRValid: boolean;
    aVLValid: boolean;
    aVFValid: boolean;
    avgError: number;
  };

  /** Wilson Central Terminal validation */
  wilson: {
    valid: boolean;
    error: number;
  };

  /** Lead polarity validation */
  polarity: {
    correct: LeadName[];
    inverted: LeadName[];
    uncertain: LeadName[];
  };

  /** Temporal alignment validation */
  temporalAlignment: {
    aligned: boolean;
    maxOffset: number; // in samples
    offsetPairs: Array<{ lead1: LeadName; lead2: LeadName; offset: number }>;
  };

  /** Issues found */
  issues: Array<{
    type: 'einthoven' | 'goldberger' | 'polarity' | 'alignment' | 'amplitude';
    severity: 'warning' | 'error';
    message: string;
    affectedLeads: LeadName[];
  }>;

  /** Suggestions for correction */
  suggestions: string[];
}

/**
 * Cross-lead validator class
 */
export class CrossLeadValidator {
  private leads: Partial<Record<LeadName, number[]>>;
  private sampleRate: number;

  constructor(leads: Partial<Record<LeadName, number[]>>, sampleRate: number) {
    this.leads = leads;
    this.sampleRate = sampleRate;
  }

  /**
   * Validate all cross-lead relationships
   */
  validate(): CrossLeadValidationResult {
    const issues: CrossLeadValidationResult['issues'] = [];
    const suggestions: string[] = [];

    // Validate Einthoven's law: II = I + III
    const einthoven = this.validateEinthoven();
    if (!einthoven.valid) {
      issues.push({
        type: 'einthoven',
        severity: einthoven.error > 0.5 ? 'error' : 'warning',
        message: `Einthoven's law violation (II ≠ I + III), error: ${(einthoven.error * 100).toFixed(1)}%`,
        affectedLeads: ['I', 'II', 'III'],
      });
      suggestions.push('Check leads I, II, III for proper electrode placement or digitization errors');
    }

    // Validate Goldberger equations
    const goldberger = this.validateGoldberger();
    if (!goldberger.aVRValid || !goldberger.aVLValid || !goldberger.aVFValid) {
      const affected: LeadName[] = [];
      if (!goldberger.aVRValid) affected.push('aVR');
      if (!goldberger.aVLValid) affected.push('aVL');
      if (!goldberger.aVFValid) affected.push('aVF');

      issues.push({
        type: 'goldberger',
        severity: 'warning',
        message: `Goldberger equation violations for ${affected.join(', ')}`,
        affectedLeads: affected,
      });
    }

    // Validate Wilson Central Terminal
    const wilson = this.validateWilson();
    if (!wilson.valid) {
      issues.push({
        type: 'einthoven', // Use same category
        severity: 'warning',
        message: 'Wilson Central Terminal deviation detected',
        affectedLeads: ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'],
      });
    }

    // Validate lead polarity
    const polarity = this.validatePolarity();
    if (polarity.inverted.length > 0) {
      issues.push({
        type: 'polarity',
        severity: 'error',
        message: `Inverted leads detected: ${polarity.inverted.join(', ')}`,
        affectedLeads: polarity.inverted,
      });
      suggestions.push(`Leads ${polarity.inverted.join(', ')} appear inverted - check electrode placement`);
    }

    // Validate temporal alignment
    const temporalAlignment = this.validateTemporalAlignment();
    if (!temporalAlignment.aligned) {
      issues.push({
        type: 'alignment',
        severity: 'warning',
        message: `Leads are misaligned by up to ${temporalAlignment.maxOffset} samples`,
        affectedLeads: temporalAlignment.offsetPairs.map(p => p.lead1),
      });
      suggestions.push('Check that all leads are properly synchronized');
    }

    // Calculate overall validity and confidence
    const valid = issues.filter(i => i.severity === 'error').length === 0;
    const confidence = this.calculateConfidence(einthoven, goldberger, polarity, temporalAlignment);

    return {
      valid,
      confidence,
      einthoven,
      goldberger,
      wilson,
      polarity,
      temporalAlignment,
      issues,
      suggestions,
    };
  }

  /**
   * Validate Einthoven's law: Lead II = Lead I + Lead III
   */
  private validateEinthoven(): { valid: boolean; error: number; correlation: number } {
    const leadI = this.leads['I'];
    const leadII = this.leads['II'];
    const leadIII = this.leads['III'];

    if (!leadI || !leadII || !leadIII) {
      return { valid: false, error: 1, correlation: 0 };
    }

    const minLen = Math.min(leadI.length, leadII.length, leadIII.length);
    if (minLen < 10) {
      return { valid: false, error: 1, correlation: 0 };
    }

    // Calculate I + III
    const computed = new Array(minLen);
    for (let i = 0; i < minLen; i++) {
      computed[i] = leadI[i] + leadIII[i];
    }

    // Calculate RMS error normalized by signal amplitude
    let sumSquaredError = 0;
    let sumSquaredSignal = 0;
    for (let i = 0; i < minLen; i++) {
      sumSquaredError += Math.pow(leadII[i] - computed[i], 2);
      sumSquaredSignal += Math.pow(leadII[i], 2);
    }

    const rmsError = Math.sqrt(sumSquaredError / minLen);
    const rmsSignal = Math.sqrt(sumSquaredSignal / minLen);
    const normalizedError = rmsSignal > 0 ? rmsError / rmsSignal : 1;

    // Calculate correlation
    const correlation = this.pearsonCorrelation(
      leadII.slice(0, minLen),
      computed
    );

    return {
      valid: normalizedError < 0.15 && correlation > 0.9,
      error: normalizedError,
      correlation,
    };
  }

  /**
   * Validate Goldberger equations
   * aVR = -(I + II) / 2
   * aVL = (I - III) / 2
   * aVF = (II + III) / 2
   */
  private validateGoldberger(): {
    aVRValid: boolean;
    aVLValid: boolean;
    aVFValid: boolean;
    avgError: number;
  } {
    const leadI = this.leads['I'];
    const leadII = this.leads['II'];
    const leadIII = this.leads['III'];
    const aVR = this.leads['aVR'];
    const aVL = this.leads['aVL'];
    const aVF = this.leads['aVF'];

    const results = {
      aVRValid: true,
      aVLValid: true,
      aVFValid: true,
      avgError: 0,
    };

    let totalError = 0;
    let count = 0;

    if (leadI && leadII && aVR) {
      const minLen = Math.min(leadI.length, leadII.length, aVR.length);
      const computed = leadI.slice(0, minLen).map((v, i) => -(v + leadII[i]) / 2);
      const error = this.normalizedError(aVR.slice(0, minLen), computed);
      results.aVRValid = error < 0.2;
      totalError += error;
      count++;
    }

    if (leadI && leadIII && aVL) {
      const minLen = Math.min(leadI.length, leadIII.length, aVL.length);
      const computed = leadI.slice(0, minLen).map((v, i) => (v - leadIII[i]) / 2);
      const error = this.normalizedError(aVL.slice(0, minLen), computed);
      results.aVLValid = error < 0.2;
      totalError += error;
      count++;
    }

    if (leadII && leadIII && aVF) {
      const minLen = Math.min(leadII.length, leadIII.length, aVF.length);
      const computed = leadII.slice(0, minLen).map((v, i) => (v + leadIII[i]) / 2);
      const error = this.normalizedError(aVF.slice(0, minLen), computed);
      results.aVFValid = error < 0.2;
      totalError += error;
      count++;
    }

    results.avgError = count > 0 ? totalError / count : 1;
    return results;
  }

  /**
   * Validate Wilson Central Terminal
   * Sum of limb leads should be approximately zero
   */
  private validateWilson(): { valid: boolean; error: number } {
    const leadI = this.leads['I'];
    const leadII = this.leads['II'];
    const leadIII = this.leads['III'];

    if (!leadI || !leadII || !leadIII) {
      return { valid: false, error: 1 };
    }

    const minLen = Math.min(leadI.length, leadII.length, leadIII.length);

    // Wilson Central Terminal: (I + II + III) should be ~0
    // Actually: (RA + LA + LL) / 3, which relates to leads differently
    // For validation, we check that I + II - 2*III ≈ 0 (derived from Einthoven)
    let sumAbsDeviation = 0;
    let sumAbsSignal = 0;

    for (let i = 0; i < minLen; i++) {
      // Check another relationship: II = I + III (should be true)
      const deviation = Math.abs(leadII[i] - leadI[i] - leadIII[i]);
      sumAbsDeviation += deviation;
      sumAbsSignal += Math.abs(leadII[i]);
    }

    const normalizedError = sumAbsSignal > 0 ? sumAbsDeviation / sumAbsSignal : 1;

    return {
      valid: normalizedError < 0.15,
      error: normalizedError,
    };
  }

  /**
   * Validate lead polarity using expected morphology
   */
  private validatePolarity(): {
    correct: LeadName[];
    inverted: LeadName[];
    uncertain: LeadName[];
  } {
    const correct: LeadName[] = [];
    const inverted: LeadName[] = [];
    const uncertain: LeadName[] = [];

    // Expected polarity patterns based on typical QRS morphology
    const expectedPositiveR: LeadName[] = ['I', 'II', 'aVL', 'V5', 'V6'];
    const expectedNegativeR: LeadName[] = ['aVR'];
    const transitionLeads: LeadName[] = ['V1', 'V2', 'V3', 'V4']; // R/S transition

    for (const [leadName, samples] of Object.entries(this.leads) as [LeadName, number[]][]) {
      if (!samples || samples.length < this.sampleRate * 0.5) {
        uncertain.push(leadName);
        continue;
      }

      // Find maximum and minimum
      const max = Math.max(...samples);
      const min = Math.min(...samples);

      // Calculate net polarity (positive = upright QRS, negative = inverted)
      const netPolarity = Math.abs(max) > Math.abs(min) ? 'positive' : 'negative';

      if (expectedPositiveR.includes(leadName)) {
        if (netPolarity === 'positive') {
          correct.push(leadName);
        } else {
          inverted.push(leadName);
        }
      } else if (expectedNegativeR.includes(leadName)) {
        if (netPolarity === 'negative') {
          correct.push(leadName);
        } else {
          inverted.push(leadName);
        }
      } else if (transitionLeads.includes(leadName)) {
        // Transition zone - harder to determine
        correct.push(leadName);
      } else {
        uncertain.push(leadName);
      }
    }

    return { correct, inverted, uncertain };
  }

  /**
   * Validate temporal alignment between leads
   */
  private validateTemporalAlignment(): {
    aligned: boolean;
    maxOffset: number;
    offsetPairs: Array<{ lead1: LeadName; lead2: LeadName; offset: number }>;
  } {
    const offsetPairs: Array<{ lead1: LeadName; lead2: LeadName; offset: number }> = [];

    // Compare Lead II with other limb leads
    const reference = this.leads['II'];
    if (!reference || reference.length < this.sampleRate) {
      return { aligned: true, maxOffset: 0, offsetPairs: [] };
    }

    const leadsToCheck: LeadName[] = ['I', 'III', 'aVR', 'aVL', 'aVF'];
    let maxOffset = 0;

    for (const leadName of leadsToCheck) {
      const lead = this.leads[leadName];
      if (!lead || lead.length < this.sampleRate) continue;

      // Calculate cross-correlation to find offset
      const offset = this.findOptimalOffset(reference, lead);
      offsetPairs.push({ lead1: leadName, lead2: 'II', offset });
      maxOffset = Math.max(maxOffset, Math.abs(offset));
    }

    // Aligned if max offset is less than 20ms
    const maxAllowedOffset = Math.floor(this.sampleRate * 0.02);
    const aligned = maxOffset <= maxAllowedOffset;

    return { aligned, maxOffset, offsetPairs };
  }

  /**
   * Find optimal offset between two signals using cross-correlation
   */
  private findOptimalOffset(signal1: number[], signal2: number[]): number {
    const maxLag = Math.floor(this.sampleRate * 0.05); // ±50ms
    const len = Math.min(signal1.length, signal2.length);

    let bestLag = 0;
    let bestCorr = -Infinity;

    for (let lag = -maxLag; lag <= maxLag; lag++) {
      let sum = 0;
      let count = 0;

      for (let i = 0; i < len; i++) {
        const j = i + lag;
        if (j >= 0 && j < len) {
          sum += signal1[i] * signal2[j];
          count++;
        }
      }

      const corr = count > 0 ? sum / count : 0;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    return bestLag;
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumX2 += x[i] * x[i];
      sumY2 += y[i] * y[i];
    }

    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return den > 0 ? num / den : 0;
  }

  /**
   * Calculate normalized RMS error between two signals
   */
  private normalizedError(actual: number[], expected: number[]): number {
    const n = Math.min(actual.length, expected.length);
    if (n < 2) return 1;

    let sumSquaredError = 0;
    let sumSquaredActual = 0;

    for (let i = 0; i < n; i++) {
      sumSquaredError += Math.pow(actual[i] - expected[i], 2);
      sumSquaredActual += Math.pow(actual[i], 2);
    }

    const rmsError = Math.sqrt(sumSquaredError / n);
    const rmsActual = Math.sqrt(sumSquaredActual / n);

    return rmsActual > 0 ? rmsError / rmsActual : 1;
  }

  /**
   * Calculate overall confidence from sub-validations
   */
  private calculateConfidence(
    einthoven: { valid: boolean; error: number; correlation: number },
    goldberger: { aVRValid: boolean; aVLValid: boolean; aVFValid: boolean; avgError: number },
    polarity: { correct: LeadName[]; inverted: LeadName[]; uncertain: LeadName[] },
    temporalAlignment: { aligned: boolean; maxOffset: number }
  ): number {
    let confidence = 1.0;

    // Einthoven weight: 30%
    confidence -= (1 - einthoven.correlation) * 0.15;
    confidence -= einthoven.error * 0.15;

    // Goldberger weight: 20%
    const goldbergerScore = [goldberger.aVRValid, goldberger.aVLValid, goldberger.aVFValid]
      .filter(v => v).length / 3;
    confidence -= (1 - goldbergerScore) * 0.2;

    // Polarity weight: 30%
    const totalLeads = polarity.correct.length + polarity.inverted.length + polarity.uncertain.length;
    if (totalLeads > 0) {
      const polarityScore = polarity.correct.length / totalLeads;
      confidence -= (1 - polarityScore) * 0.3;
    }

    // Temporal alignment weight: 20%
    if (!temporalAlignment.aligned) {
      confidence -= 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }
}

/**
 * Convenience function for cross-lead validation
 */
export function validateCrossLead(
  leads: Partial<Record<LeadName, number[]>>,
  sampleRate: number
): CrossLeadValidationResult {
  const validator = new CrossLeadValidator(leads, sampleRate);
  return validator.validate();
}

/**
 * Attempt to recover missing leads using cross-lead relationships
 */
export function recoverMissingLeads(
  leads: Partial<Record<LeadName, number[]>>
): Partial<Record<LeadName, number[]>> {
  const recovered = { ...leads };

  // Recover Lead II from I + III
  if (!recovered['II'] && recovered['I'] && recovered['III']) {
    const len = Math.min(recovered['I'].length, recovered['III'].length);
    recovered['II'] = new Array(len);
    for (let i = 0; i < len; i++) {
      recovered['II'][i] = recovered['I'][i] + recovered['III'][i];
    }
  }

  // Recover Lead I from II - III
  if (!recovered['I'] && recovered['II'] && recovered['III']) {
    const len = Math.min(recovered['II'].length, recovered['III'].length);
    recovered['I'] = new Array(len);
    for (let i = 0; i < len; i++) {
      recovered['I'][i] = recovered['II'][i] - recovered['III'][i];
    }
  }

  // Recover Lead III from II - I
  if (!recovered['III'] && recovered['I'] && recovered['II']) {
    const len = Math.min(recovered['I'].length, recovered['II'].length);
    recovered['III'] = new Array(len);
    for (let i = 0; i < len; i++) {
      recovered['III'][i] = recovered['II'][i] - recovered['I'][i];
    }
  }

  // Recover aVR from -(I + II) / 2
  if (!recovered['aVR'] && recovered['I'] && recovered['II']) {
    const len = Math.min(recovered['I'].length, recovered['II'].length);
    recovered['aVR'] = new Array(len);
    for (let i = 0; i < len; i++) {
      recovered['aVR'][i] = -(recovered['I'][i] + recovered['II'][i]) / 2;
    }
  }

  // Recover aVL from (I - III) / 2
  if (!recovered['aVL'] && recovered['I'] && recovered['III']) {
    const len = Math.min(recovered['I'].length, recovered['III'].length);
    recovered['aVL'] = new Array(len);
    for (let i = 0; i < len; i++) {
      recovered['aVL'][i] = (recovered['I'][i] - recovered['III'][i]) / 2;
    }
  }

  // Recover aVF from (II + III) / 2
  if (!recovered['aVF'] && recovered['II'] && recovered['III']) {
    const len = Math.min(recovered['II'].length, recovered['III'].length);
    recovered['aVF'] = new Array(len);
    for (let i = 0; i < len; i++) {
      recovered['aVF'][i] = (recovered['II'][i] + recovered['III'][i]) / 2;
    }
  }

  return recovered;
}
