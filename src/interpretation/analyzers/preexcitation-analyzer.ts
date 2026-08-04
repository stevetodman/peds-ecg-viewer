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

import { InterpretationFinding } from '../../types/interpretation';

/**
 * Pre-excitation analysis input
 */
export interface PreexcitationInput {
  /** PR interval in ms */
  pr: number | null;

  /** QRS duration in ms */
  qrs: number | null;

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
 * - Pre-excitation pattern: Short PR + Wide QRS + confirmed delta wave
 * - Possible pre-excitation: Short PR + Wide QRS (delta wave not assessed)
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

  if (
    input.pr === null ||
    input.qrs === null ||
    !Number.isFinite(input.pr) ||
    !Number.isFinite(input.qrs)
  ) {
    return findings;
  }

  const shortPR = input.pr < thresholds.shortPR;
  const wideQRS = input.qrs > thresholds.wideQRS;
  const deltaWave = input.deltaWaveDetected ?? false;

  // Classic WPW: Short PR + Wide QRS + Delta wave
  if (shortPR && wideQRS && deltaWave) {
    findings.push({
      code: 'VENTRICULAR_PREEXCITATION',
      statement: `Ventricular pre-excitation pattern (short PR ${Math.round(input.pr)} ms, wide QRS ${Math.round(input.qrs)} ms, delta wave reported)`,
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
      confidence: 0.8,
      clinicalNote:
        'Confirm delta-wave morphology and lead placement on the source ECG; this automated pattern does not diagnose an accessory-pathway syndrome. ' +
        'Urgent expert management is required for an irregular wide-complex tachycardia; AV nodal blockade can be dangerous when pre-excited atrial fibrillation is present.',
    });
  }
  // Possible WPW: Short PR + Wide QRS (no delta wave data available)
  else if (shortPR && wideQRS && input.deltaWaveDetected === undefined) {
    findings.push({
      code: 'POSSIBLE_PREEXCITATION',
      statement: `Short PR with wide QRS; ventricular pre-excitation cannot be assessed without delta-wave morphology`,
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
      confidence: 0.4,
      clinicalNote:
        'This interval combination is nonspecific. Review the original 12-lead ECG for a delta wave, artifact, and alternative causes of QRS widening.',
    });
  }
  // Short PR alone is nonspecific; the obsolete Lown-Ganong-Levine label is
  // deliberately not assigned.
  else if (shortPR && !wideQRS && input.pr < 80) {
    // Only flag very short PR (likely <80ms represents true pre-excitation vs normal variant)
    findings.push({
      code: 'PR_SHORT',
      statement: `Very short PR interval (${Math.round(input.pr)} ms); morphology review required`,
      severity: 'borderline',
      category: 'intervals',
      evidence: {
        pr: Math.round(input.pr),
        qrs: Math.round(input.qrs),
        pattern: 'short_pr_nonspecific',
      },
      ageAdjusted: true,
      confidence: 0.75,
      clinicalNote: 'A short PR without a delta wave does not establish an accessory pathway.',
    });
  }
  // Wide QRS with normal PR - could be bundle branch block or other cause
  else if (wideQRS && !shortPR) {
    // This is handled by QRS analysis in interval-analyzer
    // We only add a note if delta wave is detected without short PR (Mahaim fiber)
    if (deltaWave) {
      findings.push({
        code: 'POSSIBLE_PREEXCITATION',
        statement: `Reported delta wave with wide QRS but without short PR; morphology review required`,
        severity: 'borderline',
        category: 'conduction',
        evidence: {
          pr: Math.round(input.pr),
          qrs: Math.round(input.qrs),
          pattern: 'discordant_preexcitation_features',
        },
        ageAdjusted: true,
        confidence: 0.6,
        clinicalNote: 'Discordant automated features are insufficient to identify a pathway; verify the original tracing.',
      });
    }
  }

  return findings;
}
