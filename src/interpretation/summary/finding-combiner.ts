/**
 * Combines interpretation findings into a summary
 * @module interpretation/summary/finding-combiner
 */

import {
  InterpretationFinding,
  InterpretationSummary,
  RhythmDescription,
  Severity,
  FindingCategory,
} from '../../types/interpretation';

/**
 * Severity ordering for sorting (lower = more severe)
 */
const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  abnormal: 1,
  borderline: 2,
  normal: 3,
};

/**
 * Category ordering for sorting (lower = more important)
 */
const CATEGORY_ORDER: Record<FindingCategory, number> = {
  rhythm: 0,
  rate: 1,
  intervals: 2,
  axis: 3,
  hypertrophy: 4,
  conduction: 5,
  morphology: 6,
  ischemia: 7,
  other: 8,
};

/**
 * High-urgency finding codes that warrant urgent review
 */
const HIGH_URGENCY_CODES = [
  'QTC_PROLONGED',
  'THIRD_DEGREE_AV_BLOCK',
  'SECOND_DEGREE_AV_BLOCK_TYPE_2',
  'VENTRICULAR_PREEXCITATION',
  'BRUGADA_PATTERN',
  'ST_ELEVATION',
];

/**
 * Findings that should trigger cardiology review
 */
const REVIEW_CODES = [
  'QTC_PROLONGED',
  'QTC_SHORT',
  'RVH',
  'LVH',
  'BVH',
  'VENTRICULAR_PREEXCITATION',
  'POSSIBLE_PREEXCITATION',
  'BRUGADA_PATTERN',
  'PR_PROLONGED',
  'SECOND_DEGREE_AV_BLOCK_TYPE_1',
  'SECOND_DEGREE_AV_BLOCK_TYPE_2',
  'THIRD_DEGREE_AV_BLOCK',
  'RBBB',
  'LBBB',
  'EXTREME_AXIS',
];

/**
 * Generate rhythm description from findings
 */
function generateRhythmDescription(
  hr: number | null,
  assessedRhythm?: Partial<RhythmDescription>
): RhythmDescription {
  if (assessedRhythm) {
    // Accept supplied interpretation evidence, but never convert omitted
    // rhythm fields into an implied sinus/regular/1:1 assessment.
    const name = assessedRhythm.name?.trim()
      ? assessedRhythm.name
      : 'Rhythm not determined';
    return {
      name,
      regular: assessedRhythm.regular ?? null,
      ventricularRate: assessedRhythm.ventricularRate ?? hr,
      origin: assessedRhythm.origin ?? 'unknown',
      pWaveMorphology: assessedRhythm.pWaveMorphology ?? 'unknown',
      avRelationship: assessedRhythm.avRelationship ?? 'unknown',
      ...(assessedRhythm.atrialRate === undefined ? {} : { atrialRate: assessedRhythm.atrialRate }),
    };
  }

  return {
    name: 'Rhythm not determined',
    regular: null,
    ventricularRate: hr === null ? null : Math.round(hr),
    origin: 'unknown',
    pWaveMorphology: 'unknown',
    avRelationship: 'unknown',
  };
}

/**
 * Generate one-liner summary from findings
 */
function generateOneLiner(findings: InterpretationFinding[]): string {
  const abnormalFindings = findings.filter(f => f.severity !== 'normal');

  if (abnormalFindings.length === 0) {
    return 'No measured abnormality detected; automated analysis is limited';
  }

  if (abnormalFindings.length === 1) {
    return abnormalFindings[0].statement;
  }

  if (abnormalFindings.length <= 3) {
    // List the most important findings
    const topFindings = abnormalFindings
      .slice(0, 3)
      .map(f => {
        // Create short version of finding
        switch (f.code) {
          case 'RATE_HIGH': return 'high rate for age';
          case 'RATE_LOW': return 'low rate for age';
          case 'ANALYSIS_INCOMPLETE': return 'analysis incomplete';
          case 'LEFT_AXIS_DEVIATION': return 'LAD';
          case 'RIGHT_AXIS_DEVIATION': return 'RAD';
          case 'EXTREME_AXIS': return 'extreme axis';
          case 'QTC_PROLONGED': return 'prolonged QTc';
          case 'QTC_BORDERLINE': return 'borderline QTc';
          case 'QRS_PROLONGED': return 'wide QRS';
          case 'PR_PROLONGED': return 'prolonged PR';
          case 'PR_SHORT': return 'short PR';
          case 'RVH': return 'RVH';
          case 'LVH': return 'LVH';
          case 'BVH': return 'BVH';
          case 'T_WAVE_ABNORMALITY': return 'T-wave abnormality';
          default: return f.code.replace(/_/g, ' ').toLowerCase();
        }
      });
    return topFindings.join(', ');
  }

  return `Multiple abnormalities (${abnormalFindings.length} findings)`;
}

/**
 * Combine all findings into a final summary
 * @param findings - All detected findings
 * @param hr - Heart rate for rhythm description
 * @returns Summary with conclusion, one-liner, and urgency
 */
export function combineFindings(
  findings: InterpretationFinding[],
  hr: number | null,
  assessedRhythm?: Partial<RhythmDescription>
): {
  summary: InterpretationSummary;
  rhythm: RhythmDescription;
  orderedFindings: InterpretationFinding[];
} {
  // 1. Order findings by severity and category
  const orderedFindings = [...findings].sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
  });

  // 2. Determine conclusion
  const hasCritical = findings.some(f => f.severity === 'critical');
  const hasAbnormal = findings.some(f => f.severity === 'abnormal');
  const hasBorderline = findings.some(f => f.severity === 'borderline');
  const isIncomplete = findings.some(f => f.code === 'ANALYSIS_INCOMPLETE');

  let conclusion: InterpretationSummary['conclusion'];
  // A confirmed abnormal measurement remains abnormal even when other parts
  // of the tracing are unavailable. Incompleteness only blocks a reassuring
  // Normal/Borderline conclusion.
  if (hasCritical || hasAbnormal) {
    conclusion = 'Abnormal ECG';
  } else if (isIncomplete) {
    conclusion = 'Inconclusive';
  } else if (hasBorderline) {
    conclusion = 'Borderline ECG';
  } else {
    conclusion = 'Normal ECG';
  }

  // 3. Determine urgency
  let urgency: InterpretationSummary['urgency'] = 'routine';
  if (hasCritical) {
    urgency = 'critical';
  } else if (hasAbnormal) {
    const hasHighUrgency = findings.some(
      f => f.severity === 'abnormal' && HIGH_URGENCY_CODES.includes(f.code)
    );
    urgency = hasHighUrgency ? 'urgent' : 'attention';
  }

  // 4. Determine if cardiology review recommended
  const abnormalFindings = findings.filter(f => f.severity !== 'normal');
  const hasReviewTrigger = findings.some(f => REVIEW_CODES.includes(f.code));
  const recommendReview = isIncomplete || hasCritical || hasReviewTrigger || abnormalFindings.length >= 3;

  // 5. Generate one-liner
  const oneLiner = generateOneLiner(orderedFindings);

  // 6. Create rhythm description
  const rhythm = generateRhythmDescription(hr, assessedRhythm);

  return {
    summary: {
      conclusion,
      oneLiner,
      urgency,
      recommendReview,
    },
    rhythm,
    orderedFindings,
  };
}
