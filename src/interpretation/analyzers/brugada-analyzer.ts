/**
 * Brugada pattern detection for ECG interpretation
 *
 * Brugada Pattern Detection:
 * - Type 1 (coved): >=2mm J-point elevation with coved ST-segment and
 *   negative T-wave in >=1 of V1-V3
 * - Type 2 (saddleback): >=2mm J-point elevation with saddleback ST-segment
 *   and positive/biphasic T-wave
 *
 * Clinical Importance:
 * - Associated with sudden cardiac death
 * - May be unmasked by fever, medications, or sodium channel blockers
 * - Requires electrophysiology evaluation and possible ICD
 *
 * Note: In pediatrics, Brugada is rare but can occur. Type 1 pattern
 * is the only diagnostic pattern; Type 2 is suggestive but not diagnostic.
 *
 * @module interpretation/analyzers/brugada-analyzer
 */

import { InterpretationFinding, Severity } from '../../types/interpretation';

/**
 * Brugada pattern type
 */
export type BrugadaType = 'type1_coved' | 'type2_saddleback' | 'none';

/**
 * ST-segment morphology data for Brugada detection
 * These would typically come from waveform analysis
 */
export interface BrugadaInput {
  /** ST elevation in V1 (mm or mV * 10) */
  stElevationV1?: number;

  /** ST elevation in V2 (mm or mV * 10) */
  stElevationV2?: number;

  /** ST elevation in V3 (mm or mV * 10) */
  stElevationV3?: number;

  /** ST morphology in V1-V2 */
  stMorphology?: 'coved' | 'saddleback' | 'normal' | 'unknown';

  /** T-wave polarity in V1 */
  tWaveV1?: 'positive' | 'negative' | 'biphasic' | 'flat';

  /** T-wave polarity in V2 */
  tWaveV2?: 'positive' | 'negative' | 'biphasic' | 'flat';

  /** QRS pattern in V1-V2 (RBBB morphology often present) */
  rbbbPattern?: boolean;
}

/**
 * Analyze for Brugada pattern
 *
 * Detection requires:
 * - Type 1: ST elevation >=2mm + coved morphology + negative T-wave in V1-V3
 * - Type 2: ST elevation >=2mm + saddleback morphology + positive/biphasic T-wave
 *
 * @param input - ST segment and T-wave data from V1-V3
 * @param ageDays - Patient age in days
 * @returns Brugada-related findings
 */
export function analyzeBrugada(
  input: BrugadaInput,
  ageDays: number
): InterpretationFinding[] {
  const findings: InterpretationFinding[] = [];

  // If no ST data available, can't detect Brugada
  if (
    input.stElevationV1 === undefined &&
    input.stElevationV2 === undefined &&
    input.stMorphology === undefined
  ) {
    return findings;
  }

  // Get maximum ST elevation in V1-V2 (primary leads for Brugada)
  const stElevations = [
    input.stElevationV1 ?? 0,
    input.stElevationV2 ?? 0,
    input.stElevationV3 ?? 0,
  ];
  const maxSTElevation = Math.max(...stElevations);

  // ST elevation threshold: 2mm (0.2mV, or 2 in mm units)
  const significantSTElevation = maxSTElevation >= 2;

  // T-wave negativity in V1-V2
  const negativeT =
    input.tWaveV1 === 'negative' || input.tWaveV2 === 'negative';
  const positiveOrBiphasicT =
    input.tWaveV1 === 'positive' ||
    input.tWaveV1 === 'biphasic' ||
    input.tWaveV2 === 'positive' ||
    input.tWaveV2 === 'biphasic';

  // Determine Brugada type
  let brugadaType: BrugadaType = 'none';

  if (significantSTElevation) {
    if (input.stMorphology === 'coved' && negativeT) {
      brugadaType = 'type1_coved';
    } else if (input.stMorphology === 'saddleback' && positiveOrBiphasicT) {
      brugadaType = 'type2_saddleback';
    } else if (input.stMorphology === 'coved') {
      // Coved without negative T - still suggestive
      brugadaType = 'type1_coved';
    } else if (input.stMorphology === 'saddleback') {
      brugadaType = 'type2_saddleback';
    }
  }

  // Generate findings based on Brugada type
  if (brugadaType === 'type1_coved') {
    findings.push({
      code: 'BRUGADA_PATTERN',
      statement: `Brugada Type 1 (coved) pattern - ST elevation ${maxSTElevation.toFixed(1)} mm in V1-V2`,
      severity: 'abnormal',
      category: 'conduction',
      evidence: {
        stElevationV1: input.stElevationV1 ?? 'N/A',
        stElevationV2: input.stElevationV2 ?? 'N/A',
        morphology: 'coved',
        tWaveV1: input.tWaveV1 ?? 'unknown',
        tWaveV2: input.tWaveV2 ?? 'unknown',
        maxElevation: maxSTElevation,
      },
      ageAdjusted: false, // Same criteria for all ages
      pediatricSpecific: true, // Rare in pediatrics, important to identify
      confidence: negativeT ? 0.85 : 0.7,
      clinicalNote:
        'Type 1 Brugada pattern is DIAGNOSTIC. ' +
        'Risk of ventricular fibrillation and sudden cardiac death. ' +
        'URGENT cardiology/EP referral recommended. ' +
        'Avoid fever (treat aggressively), Na+ channel blockers, and certain medications. ' +
        'Consider ICD evaluation.',
    });
  } else if (brugadaType === 'type2_saddleback') {
    findings.push({
      code: 'BRUGADA_PATTERN',
      statement: `Brugada Type 2 (saddleback) pattern - ST elevation ${maxSTElevation.toFixed(1)} mm in V1-V2`,
      severity: 'borderline',
      category: 'conduction',
      evidence: {
        stElevationV1: input.stElevationV1 ?? 'N/A',
        stElevationV2: input.stElevationV2 ?? 'N/A',
        morphology: 'saddleback',
        tWaveV1: input.tWaveV1 ?? 'unknown',
        tWaveV2: input.tWaveV2 ?? 'unknown',
        maxElevation: maxSTElevation,
      },
      ageAdjusted: false,
      pediatricSpecific: true,
      confidence: 0.6,
      clinicalNote:
        'Type 2 Brugada pattern is NOT diagnostic by itself. ' +
        'Consider provocative testing (ajmaline/flecainide challenge) if clinical suspicion. ' +
        'May convert to Type 1 with fever or medications. ' +
        'Cardiology referral recommended for evaluation.',
    });
  }

  // Additional check: significant ST elevation in V1-V2 without clear morphology
  // but with RBBB pattern could suggest Brugada
  if (
    brugadaType === 'none' &&
    significantSTElevation &&
    input.rbbbPattern &&
    (input.stElevationV1 ?? 0) >= 2
  ) {
    findings.push({
      code: 'ST_ELEVATION',
      statement: `ST elevation in V1-V2 with RBBB pattern - consider Brugada syndrome`,
      severity: 'borderline',
      category: 'morphology',
      evidence: {
        stElevationV1: input.stElevationV1 ?? 'N/A',
        stElevationV2: input.stElevationV2 ?? 'N/A',
        rbbbPattern: true,
      },
      confidence: 0.5,
      clinicalNote:
        'ST elevation in V1-V2 with RBBB pattern may represent Brugada or early repolarization. ' +
        'Repeat ECG at higher/lower precordial positions if Brugada suspected.',
    });
  }

  return findings;
}

/**
 * Check if Brugada pattern is present based on simple thresholds
 * Useful when full morphology analysis is not available
 */
export function hasPossibleBrugada(input: BrugadaInput): boolean {
  const maxST = Math.max(
    input.stElevationV1 ?? 0,
    input.stElevationV2 ?? 0
  );

  return (
    maxST >= 2 &&
    (input.stMorphology === 'coved' || input.stMorphology === 'saddleback')
  );
}
