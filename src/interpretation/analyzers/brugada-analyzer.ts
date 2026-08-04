/**
 * Brugada pattern detection for ECG interpretation
 *
 * Brugada Pattern Detection:
 * - Type 1-like (coved): >=2mm J-point elevation with coved ST-segment and
 *   negative T-wave in the same one of V1-V2
 * - Type 2 (saddleback): >=2mm J-point elevation with saddleback ST-segment
 *   and positive/biphasic T-wave
 *
 * Clinical Importance:
 * - Requires source-ECG confirmation and specialist review when clinically
 *   indicated; this analyzer does not diagnose Brugada syndrome.
 *
 * Note: In pediatrics, Brugada is rare but can occur. Type 1 pattern
 * is the morphology most concerning for a type 1 ECG pattern; both outputs
 * remain automated pattern flags rather than diagnoses.
 *
 * @module interpretation/analyzers/brugada-analyzer
 */

import { InterpretationFinding } from '../../types/interpretation';

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
 * - Type 1: ST elevation >=2mm + coved morphology + negative T-wave in the
 *   same V1 or V2 lead
 * - Type 2: ST elevation >=2mm + saddleback morphology + positive/biphasic T-wave
 *
 * @param input - ST segment and T-wave data from V1-V2
 * @param ageDays - Patient age in days
 * @returns Brugada-related findings
 */
export function analyzeBrugada(
  input: BrugadaInput,
  ageDays: number
): InterpretationFinding[] {
  // Criteria are intentionally not age-adjusted; retain the argument to keep
  // a consistent analyzer interface.
  void ageDays;
  const findings: InterpretationFinding[] = [];

  // If no ST data available, can't detect Brugada
  if (
    input.stElevationV1 === undefined &&
    input.stElevationV2 === undefined &&
    input.stMorphology === undefined
  ) {
    return findings;
  }

  // Get maximum ST elevation in V1-V2 (primary leads for Brugada). V3 is not
  // used to satisfy a V1/V2 criterion.
  const stElevations = [
    input.stElevationV1 ?? 0,
    input.stElevationV2 ?? 0,
  ];
  const maxSTElevation = Math.max(...stElevations);

  // ST elevation threshold: 2mm (0.2mV, or 2 in mm units)
  const significantSTElevation = maxSTElevation >= 2;

  // T-wave negativity in V1-V2
  const qualifyingType1Lead =
    ((input.stElevationV1 ?? -Infinity) >= 2 && input.tWaveV1 === 'negative') ||
    ((input.stElevationV2 ?? -Infinity) >= 2 && input.tWaveV2 === 'negative');
  const positiveOrBiphasicT =
    input.tWaveV1 === 'positive' ||
    input.tWaveV1 === 'biphasic' ||
    input.tWaveV2 === 'positive' ||
    input.tWaveV2 === 'biphasic';

  // Determine Brugada type
  let brugadaType: BrugadaType = 'none';

  if (significantSTElevation) {
    if (input.stMorphology === 'coved' && qualifyingType1Lead) {
      brugadaType = 'type1_coved';
    } else if (input.stMorphology === 'saddleback' && positiveOrBiphasicT) {
      brugadaType = 'type2_saddleback';
    }
  }

  // Generate findings based on Brugada type
  if (brugadaType === 'type1_coved') {
    findings.push({
      code: 'BRUGADA_PATTERN',
      statement: `Coved ST/T morphology concerning for a type 1 Brugada ECG pattern (${maxSTElevation.toFixed(1)} mm in V1 or V2); expert confirmation required`,
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
      confidence: 0.75,
      clinicalNote:
        'An automated tracing assessment cannot diagnose Brugada syndrome. Confirm lead placement, calibration, and morphology on the original ECG and obtain prompt cardiology/electrophysiology review. Treat fever promptly while evaluation is pending.',
    });
  } else if (brugadaType === 'type2_saddleback') {
    findings.push({
      code: 'BRUGADA_PATTERN',
      statement: `Saddleback ST morphology in V1/V2 (${maxSTElevation.toFixed(1)} mm); possible Brugada pattern, not diagnostic`,
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
        'This morphology is nonspecific and is not diagnostic of Brugada syndrome. Confirm on the original ECG and refer for expert evaluation when clinically indicated; drug challenge belongs in a specialist-controlled setting.',
    });
  }

  // ST elevation with RBBB morphology is not sufficiently specific to call a
  // Brugada pattern. Preserve it as a nonspecific measurement only.
  if (
    brugadaType === 'none' &&
    significantSTElevation &&
    input.rbbbPattern &&
    (input.stElevationV1 ?? 0) >= 2
  ) {
    findings.push({
      code: 'ST_ELEVATION',
      statement: 'ST elevation in V1/V2 with RBBB morphology; source-ECG review required',
      severity: 'borderline',
      category: 'morphology',
      evidence: {
        stElevationV1: input.stElevationV1 ?? 'N/A',
        stElevationV2: input.stElevationV2 ?? 'N/A',
        rbbbPattern: 'reported',
      },
      confidence: 0.5,
      clinicalNote:
        'This combination is nonspecific and does not establish Brugada syndrome. Confirm lead placement, calibration, and morphology on the source ECG.',
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

  const type1 = input.stMorphology === 'coved' && (
    ((input.stElevationV1 ?? -Infinity) >= 2 && input.tWaveV1 === 'negative') ||
    ((input.stElevationV2 ?? -Infinity) >= 2 && input.tWaveV2 === 'negative')
  );
  const type2 = maxST >= 2 && input.stMorphology === 'saddleback' && (
    input.tWaveV1 === 'positive' || input.tWaveV1 === 'biphasic' ||
    input.tWaveV2 === 'positive' || input.tWaveV2 === 'biphasic'
  );
  return type1 || type2;
}
