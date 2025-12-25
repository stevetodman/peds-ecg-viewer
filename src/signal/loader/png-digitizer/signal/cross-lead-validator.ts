/**
 * Cross-Lead Validator
 * Uses Einthoven's law and other relationships to validate digitized signals
 *
 * Einthoven's Law: Lead II = Lead I + Lead III
 * Also: aVR + aVL + aVF ≈ 0
 *
 * @module signal/loader/png-digitizer/signal/cross-lead-validator
 */

import type { ECGSignal, LeadName } from '../../../../types';

/**
 * Validation result for a single lead
 */
export interface LeadValidationResult {
  lead: LeadName;
  isValid: boolean;
  confidence: number;
  correlationWithExpected: number;
  issues: string[];
}

/**
 * Overall validation result
 */
export interface CrossLeadValidationResult {
  overallValid: boolean;
  overallConfidence: number;
  leadResults: LeadValidationResult[];
  einthovenCorrelation: number;
  augmentedLeadsSum: number;
  suggestions: string[];
}

/**
 * Validate ECG signal using cross-lead relationships
 */
export function validateCrossLeadRelationships(signal: ECGSignal): CrossLeadValidationResult {
  const leadResults: LeadValidationResult[] = [];
  const suggestions: string[] = [];

  // Get leads
  const leadI = signal.leads['I'];
  const leadII = signal.leads['II'];
  const leadIII = signal.leads['III'];
  const aVR = signal.leads['aVR'];
  const aVL = signal.leads['aVL'];
  const aVF = signal.leads['aVF'];

  // 1. Check Einthoven's Law: Lead II = Lead I + Lead III
  let einthovenCorrelation = 0;
  if (leadI && leadII && leadIII) {
    const minLen = Math.min(leadI.length, leadII.length, leadIII.length);

    // Calculate expected Lead II from I + III
    const expectedII = new Array(minLen);
    for (let i = 0; i < minLen; i++) {
      expectedII[i] = leadI[i] + leadIII[i];
    }

    // Calculate correlation between actual II and expected II
    einthovenCorrelation = pearsonCorrelation(
      leadII.slice(0, minLen),
      expectedII
    );

    // Add lead results
    if (einthovenCorrelation < 0.7) {
      // One or more limb leads may be wrong
      // Check which lead is most likely wrong by testing each combination
      const corrI_II_III = einthovenCorrelation; // II = I + III
      const corrII_I_III = pearsonCorrelation(
        leadI.slice(0, minLen),
        leadII.slice(0, minLen).map((v, i) => v - leadIII[i])
      ); // I = II - III
      const corrIII_II_I = pearsonCorrelation(
        leadIII.slice(0, minLen),
        leadII.slice(0, minLen).map((v, i) => v - leadI[i])
      ); // III = II - I

      // Find which correlation is lowest - that lead is likely wrong
      const correlations = [
        { lead: 'II' as LeadName, corr: corrI_II_III },
        { lead: 'I' as LeadName, corr: corrII_I_III },
        { lead: 'III' as LeadName, corr: corrIII_II_I },
      ];

      const sorted = correlations.sort((a, b) => a.corr - b.corr);
      const likelyWrong = sorted[0];

      if (likelyWrong.corr < 0.5) {
        suggestions.push(`Lead ${likelyWrong.lead} may be incorrectly digitized (Einthoven correlation: ${likelyWrong.corr.toFixed(2)})`);
      }
    }

    // Add results for limb leads
    leadResults.push({
      lead: 'I',
      isValid: einthovenCorrelation > 0.7,
      confidence: einthovenCorrelation,
      correlationWithExpected: einthovenCorrelation,
      issues: einthovenCorrelation < 0.7 ? ['Einthoven law correlation low'] : [],
    });
    leadResults.push({
      lead: 'II',
      isValid: einthovenCorrelation > 0.7,
      confidence: einthovenCorrelation,
      correlationWithExpected: einthovenCorrelation,
      issues: einthovenCorrelation < 0.7 ? ['Einthoven law correlation low'] : [],
    });
    leadResults.push({
      lead: 'III',
      isValid: einthovenCorrelation > 0.7,
      confidence: einthovenCorrelation,
      correlationWithExpected: einthovenCorrelation,
      issues: einthovenCorrelation < 0.7 ? ['Einthoven law correlation low'] : [],
    });
  }

  // 2. Check augmented leads sum: aVR + aVL + aVF ≈ 0
  let augmentedLeadsSum = 0;
  if (aVR && aVL && aVF) {
    const minLen = Math.min(aVR.length, aVL.length, aVF.length);
    let sum = 0;
    let sumSquared = 0;

    for (let i = 0; i < minLen; i++) {
      const s = aVR[i] + aVL[i] + aVF[i];
      sum += Math.abs(s);

      // Compare to individual lead magnitudes
      const mag = Math.abs(aVR[i]) + Math.abs(aVL[i]) + Math.abs(aVF[i]);
      if (mag > 0) {
        sumSquared += (s / mag) ** 2;
      }
    }

    augmentedLeadsSum = sum / minLen;
    const normalizedSum = Math.sqrt(sumSquared / minLen);

    if (normalizedSum > 0.3) {
      suggestions.push(`Augmented leads sum is high (${normalizedSum.toFixed(2)}) - one or more may be wrong`);
    }
  }

  // 3. Check precordial leads progression
  // V1-V6 should show R-wave progression (R-wave amplitude increases V1→V4, then may decrease)
  const precordialLeads = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as LeadName[];
  const rWaveAmplitudes: number[] = [];

  for (const leadName of precordialLeads) {
    const lead = signal.leads[leadName];
    if (lead && lead.length > 0) {
      // Find max positive deflection (R-wave)
      const rWave = Math.max(...lead);
      rWaveAmplitudes.push(rWave);

      leadResults.push({
        lead: leadName,
        isValid: true,
        confidence: 0.8, // Base confidence for precordial
        correlationWithExpected: 0,
        issues: [],
      });
    }
  }

  // Check for normal R-wave progression
  if (rWaveAmplitudes.length >= 4) {
    // R-wave should generally increase from V1 to V4
    let progressionOk = true;
    for (let i = 0; i < 3; i++) {
      if (rWaveAmplitudes[i] > rWaveAmplitudes[i + 1] * 1.5) {
        progressionOk = false;
        break;
      }
    }

    if (!progressionOk) {
      suggestions.push('R-wave progression may be abnormal - check V1-V4 leads');
    }
  }

  // Calculate overall validity
  const overallValid = einthovenCorrelation > 0.7 && suggestions.length === 0;
  const overallConfidence = Math.max(0, einthovenCorrelation);

  return {
    overallValid,
    overallConfidence,
    leadResults,
    einthovenCorrelation,
    augmentedLeadsSum,
    suggestions,
  };
}

/**
 * Attempt to correct a lead using cross-lead relationships
 */
export function correctLeadFromRelationships(
  signal: ECGSignal,
  leadToCorrect: LeadName
): number[] | null {
  const leadI = signal.leads['I'];
  const leadII = signal.leads['II'];
  const leadIII = signal.leads['III'];

  if (!leadI || !leadII || !leadIII) {
    return null;
  }

  const minLen = Math.min(leadI.length, leadII.length, leadIII.length);

  switch (leadToCorrect) {
    case 'I':
      // I = II - III
      return leadII.slice(0, minLen).map((v, i) => v - leadIII[i]);

    case 'II':
      // II = I + III
      return leadI.slice(0, minLen).map((v, i) => v + leadIII[i]);

    case 'III':
      // III = II - I
      return leadII.slice(0, minLen).map((v, i) => v - leadI[i]);

    case 'aVR':
      // aVR = -(I + II) / 2
      return leadI.slice(0, minLen).map((v, i) => -(v + leadII[i]) / 2);

    case 'aVL':
      // aVL = (I - III) / 2
      return leadI.slice(0, minLen).map((v, i) => (v - leadIII[i]) / 2);

    case 'aVF':
      // aVF = (II + III) / 2
      return leadII.slice(0, minLen).map((v, i) => (v + leadIII[i]) / 2);

    default:
      // Can't derive precordial leads from other leads
      return null;
  }
}

/**
 * Calculate Pearson correlation coefficient
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n === 0) return 0;

  const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : num / denom;
}
