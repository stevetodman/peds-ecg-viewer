/**
 * Pre-excitation (WPW) detection for ECG interpretation
 *
 * Wolff-Parkinson-White (WPW) Pattern Detection:
 * - Short PR interval (<120ms in children, <100ms in infants)
 * - Wide QRS (>110ms for age)
 * - Delta wave (slurred QRS upstroke) - requires waveform analysis
 *
 * Clinical Importance:
 * - Risk of sudden cardiac death with atrial fibrillation
 * - Contraindication for AV nodal blocking drugs
 * - Requires electrophysiology evaluation
 *
 * @module interpretation/analyzers/preexcitation-analyzer
 */

import { InterpretationFinding, Severity } from '../../types/interpretation';
import { NormalRange } from '../../data/pediatricNormals';

/**
 * Pre-excitation analysis input
 */
export interface PreexcitationInput {
  /** PR interval in ms */
  pr: number;

  /** QRS duration in ms */
  qrs: number;

  /** Delta wave detected (from waveform analysis) */
  deltaWaveDetected?: boolean;

  /** Delta wave duration in ms (if detected) */
  deltaWaveDuration?: number;
}

/**
 * Age-adjusted thresholds for pre-excitation
 */
interface PreexcitationThresholds {
  /** Short PR threshold */
  shortPR: number;

  /** Wide QRS threshold */
  wideQRS: number;
}

/**
 * Get age-adjusted thresholds for pre-excitation detection
 */
function getThresholds(ageDays: number): PreexcitationThresholds {
  // PR interval thresholds vary by age
  // Infants (<1 year): <100ms is short
  // Children (1-8 years): <110ms is short
  // Older children/adolescents: <120ms is short

  // QRS thresholds also vary
  // Infants: >100ms is wide
  // Children <8yr: >100ms is wide
  // Older children: >110ms is wide

  if (ageDays < 365) {
    // Infant
    return { shortPR: 100, wideQRS: 100 };
  } else if (ageDays < 2922) {
    // 1-8 years
    return { shortPR: 110, wideQRS: 100 };
  } else {
    // >8 years
    return { shortPR: 120, wideQRS: 110 };
  }
}

/**
 * Analyze for pre-excitation (WPW pattern)
 *
 * Detection criteria:
 * - Classic WPW: Short PR + Wide QRS + Delta wave
 * - Possible WPW: Short PR + Wide QRS (no delta wave data)
 * - LGL pattern: Short PR only (enhanced AV conduction)
 *
 * @param input - PR interval, QRS duration, and optional delta wave info
 * @param ageDays - Patient age in days
 * @returns Pre-excitation-related findings
 */
export function analyzePreexcitation(
  input: PreexcitationInput,
  ageDays: number
): InterpretationFinding[] {
  const findings: InterpretationFinding[] = [];
  const thresholds = getThresholds(ageDays);

  const shortPR = input.pr < thresholds.shortPR;
  const wideQRS = input.qrs > thresholds.wideQRS;
  const deltaWave = input.deltaWaveDetected ?? false;

  // Classic WPW: Short PR + Wide QRS + Delta wave
  if (shortPR && wideQRS && deltaWave) {
    findings.push({
      code: 'WPW',
      statement: `WPW pattern (PR ${Math.round(input.pr)} ms, QRS ${Math.round(input.qrs)} ms, delta wave present)`,
      severity: 'abnormal',
      category: 'conduction',
      evidence: {
        pr: Math.round(input.pr),
        qrs: Math.round(input.qrs),
        deltaWave: 'detected',
        deltaWaveDuration: input.deltaWaveDuration ?? 'unknown',
        shortPRThreshold: thresholds.shortPR,
        wideQRSThreshold: thresholds.wideQRS,
      },
      ageAdjusted: true,
      pediatricSpecific: true,
      confidence: 0.9,
      clinicalNote:
        'AVOID AV nodal blocking agents (digoxin, verapamil, diltiazem, adenosine) if AF develops. ' +
        'Consider electrophysiology study for risk stratification. ' +
        'Pre-anesthesia evaluation recommended.',
    });
  }
  // Possible WPW: Short PR + Wide QRS (no delta wave data available)
  else if (shortPR && wideQRS && input.deltaWaveDetected === undefined) {
    findings.push({
      code: 'WPW',
      statement: `Possible WPW pattern (PR ${Math.round(input.pr)} ms, QRS ${Math.round(input.qrs)} ms)`,
      severity: 'borderline',
      category: 'conduction',
      evidence: {
        pr: Math.round(input.pr),
        qrs: Math.round(input.qrs),
        deltaWave: 'not assessed',
        shortPRThreshold: thresholds.shortPR,
        wideQRSThreshold: thresholds.wideQRS,
      },
      ageAdjusted: true,
      pediatricSpecific: true,
      confidence: 0.7,
      clinicalNote:
        'Short PR with wide QRS suggests possible pre-excitation. ' +
        'Examine QRS morphology for delta wave. ' +
        'Consider repeat ECG and cardiology referral if suspected.',
    });
  }
  // Short PR only without wide QRS - could be LGL or enhanced AV conduction
  else if (shortPR && !wideQRS && input.pr < 80) {
    // Only flag very short PR (likely <80ms represents true pre-excitation vs normal variant)
    findings.push({
      code: 'PR_SHORT',
      statement: `Very short PR interval (${Math.round(input.pr)} ms) - consider enhanced AV conduction`,
      severity: 'borderline',
      category: 'intervals',
      evidence: {
        pr: Math.round(input.pr),
        qrs: Math.round(input.qrs),
        pattern: 'LGL_or_enhanced_AVN',
      },
      ageAdjusted: true,
      confidence: 0.75,
      clinicalNote:
        'Very short PR without wide QRS may represent Lown-Ganong-Levine pattern ' +
        'or enhanced AV nodal conduction. Clinical correlation recommended.',
    });
  }
  // Wide QRS with normal PR - could be bundle branch block or other cause
  else if (wideQRS && !shortPR) {
    // This is handled by QRS analysis in interval-analyzer
    // We only add a note if delta wave is detected without short PR (Mahaim fiber)
    if (deltaWave) {
      findings.push({
        code: 'WPW',
        statement: `Atypical pre-excitation pattern (QRS ${Math.round(input.qrs)} ms, delta wave without short PR)`,
        severity: 'borderline',
        category: 'conduction',
        evidence: {
          pr: Math.round(input.pr),
          qrs: Math.round(input.qrs),
          pattern: 'possible_Mahaim_fiber',
        },
        ageAdjusted: true,
        confidence: 0.6,
        clinicalNote:
          'Wide QRS with delta wave but normal PR suggests possible Mahaim fiber ' +
          '(atriofascicular pathway). Electrophysiology evaluation may be indicated.',
      });
    }
  }

  return findings;
}
