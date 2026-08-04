/**
 * ECG interpretation types
 * @module types/interpretation
 */

/**
 * Severity levels for findings
 */
export type Severity = 'normal' | 'borderline' | 'abnormal' | 'critical';

/**
 * Finding categories
 */
export type FindingCategory =
  | 'rhythm'
  | 'rate'
  | 'axis'
  | 'intervals'
  | 'morphology'
  | 'hypertrophy'
  | 'ischemia'
  | 'conduction'
  | 'other';

/**
 * Common finding codes for pediatric ECG
 */
export type FindingCode =
  // Rhythm
  | 'NORMAL_SINUS_RHYTHM'
  | 'SINUS_ARRHYTHMIA'
  | 'SINUS_TACHYCARDIA'
  | 'SINUS_BRADYCARDIA'
  | 'ATRIAL_FLUTTER'
  | 'ATRIAL_FIBRILLATION'
  | 'SVT'
  | 'JUNCTIONAL_RHYTHM'
  | 'VENTRICULAR_RHYTHM'
  | 'ECTOPIC_ATRIAL_RHYTHM'
  // Rate
  | 'RATE_NORMAL'
  | 'RATE_HIGH'
  | 'RATE_LOW'
  | 'ANALYSIS_INCOMPLETE'
  | 'POSSIBLE_PREEXCITATION'
  | 'VENTRICULAR_PREEXCITATION'
  // Axis
  | 'AXIS_NORMAL'
  | 'LEFT_AXIS_DEVIATION'
  | 'RIGHT_AXIS_DEVIATION'
  | 'EXTREME_AXIS'
  | 'AXIS_NORMAL_FOR_AGE'
  // Intervals
  | 'PR_NORMAL'
  | 'PR_SHORT'
  | 'PR_PROLONGED'
  | 'FIRST_DEGREE_AV_BLOCK'
  | 'QRS_NORMAL'
  | 'QRS_PROLONGED'
  | 'QTC_NORMAL'
  | 'QTC_BORDERLINE'
  | 'QTC_PROLONGED'
  | 'QTC_SHORT'
  // Hypertrophy
  | 'RVH'
  | 'LVH'
  | 'BVH'
  | 'RAE'
  | 'LAE'
  | 'BAE'
  // Conduction
  | 'RBBB'
  | 'INCOMPLETE_RBBB'
  | 'LBBB'
  | 'LAFB'
  | 'LPFB'
  | 'BIFASCICULAR_BLOCK'
  | 'WPW'
  | 'SECOND_DEGREE_AV_BLOCK_TYPE_1'
  | 'SECOND_DEGREE_AV_BLOCK_TYPE_2'
  | 'THIRD_DEGREE_AV_BLOCK'
  // Repolarization
  | 'ST_ELEVATION'
  | 'ST_DEPRESSION'
  | 'T_WAVE_INVERSION'
  | 'T_WAVE_ABNORMALITY'
  | 'EARLY_REPOLARIZATION'
  | 'JUVENILE_T_PATTERN'
  // Other
  | 'LOW_VOLTAGE'
  | 'HIGH_VOLTAGE'
  | 'POOR_R_WAVE_PROGRESSION'
  | 'ARTIFACT'
  | 'PACED_RHYTHM'
  | 'BRUGADA_PATTERN';

/**
 * Individual interpretation finding
 */
export interface InterpretationFinding {
  /** Finding code */
  code: string;

  /** Human-readable statement */
  statement: string;

  /** Severity level */
  severity: Severity;

  /** Category */
  category: FindingCategory;

  /** Supporting evidence/measurements */
  evidence?: Record<string, number | string>;

  /** Is this finding age-adjusted? */
  ageAdjusted?: boolean;

  /** Would interpretation differ for adult? */
  pediatricSpecific?: boolean;

  /** Confidence score (0-1) */
  confidence?: number;

  /** Related findings (codes) */
  relatedFindings?: string[];

  /** Suggested clinical action */
  clinicalNote?: string;
}

/**
 * Rhythm description
 */
export interface RhythmDescription {
  /** Primary rhythm name */
  name: string;

  /** Is the rhythm regular? */
  regular: boolean | null;

  /** Ventricular rate */
  ventricularRate: number | null;

  /** Atrial rate (if different) */
  atrialRate?: number;

  /** AV relationship */
  avRelationship?: '1:1' | 'variable' | 'dissociated' | 'blocked' | 'unknown';

  /** P-wave morphology */
  pWaveMorphology?: 'normal' | 'abnormal' | 'absent' | 'retrograde' | 'unknown';

  /** Rhythm origin */
  origin: 'sinus' | 'atrial' | 'junctional' | 'ventricular' | 'paced' | 'unknown';
}

/**
 * Overall interpretation summary
 */
export interface InterpretationSummary {
  /** Main conclusion */
  conclusion: 'Normal ECG' | 'Abnormal ECG' | 'Borderline ECG' | 'Inconclusive';

  /** One-line summary */
  oneLiner: string;

  /** Comparison with prior ECG */
  comparison?: {
    status: 'no_prior' | 'unchanged' | 'improved' | 'worsened' | 'new_findings';
    notes?: string;
  };

  /** Urgency level */
  urgency: 'routine' | 'attention' | 'urgent' | 'critical';

  /** Recommend cardiology review */
  recommendReview: boolean;
}

/**
 * Complete ECG interpretation
 */
export interface ECGInterpretation {
  /** Primary rhythm assessment */
  rhythm: RhythmDescription;

  /** All findings (ordered by severity/importance) */
  findings: InterpretationFinding[];

  /** Summary */
  summary: InterpretationSummary;

  /** Interpretation method */
  method: 'automated' | 'manual' | 'hybrid';

  /** Overall confidence (0-1) */
  confidence: number;

  /** Interpretation timestamp */
  interpretedAt: Date;

  /** Interpreter (software version or physician) */
  interpretedBy: string;

  /** Patient age at time of ECG */
  patientAgeDays: number;

  /** Was pediatric interpretation used */
  pediatricInterpretation: boolean;

  /** Raw statement for display (Muse-style) */
  rawStatements?: string[];

  /** Per-measurement origin and availability, when produced by signal analysis. */
  measurementProvenance: Readonly<Record<
    string,
    { source: 'detected' | 'derived' | 'reported' | 'unavailable'; method: string; reason?: string; beatsUsed?: number }
  >>;
}

/**
 * Create a normal ECG interpretation
 */
export function createNormalInterpretation(
  heartRate: number,
  ageDays: number
): ECGInterpretation {
  const unavailable = (method: string, reason: string) => ({
    source: 'unavailable' as const,
    method,
    reason,
  });
  return {
    rhythm: {
      name: 'Rhythm not assessed',
      regular: null,
      ventricularRate: heartRate,
      origin: 'unknown',
      pWaveMorphology: 'unknown',
      avRelationship: 'unknown',
    },
    findings: [
      {
        code: 'ANALYSIS_INCOMPLETE',
        statement: 'Rhythm and morphology were not assessed',
        severity: 'borderline',
        category: 'other',
        confidence: 1,
      },
      {
        code: 'RATE_NORMAL',
        statement: 'Normal heart rate for age',
        severity: 'normal',
        category: 'rate',
        ageAdjusted: true,
      },
    ],
    summary: {
      conclusion: 'Inconclusive',
      oneLiner: 'Rate within the supplied reference range; complete ECG interpretation unavailable',
      urgency: 'routine',
      recommendReview: true,
    },
    method: 'automated',
    confidence: 0,
    interpretedAt: new Date(),
    interpretedBy: 'GEMUSE v0.1.0',
    patientAgeDays: ageDays,
    pediatricInterpretation: ageDays < 6575, // <18 years
    measurementProvenance: {
      hr: Number.isFinite(heartRate)
        ? { source: 'reported' as const, method: 'caller-supplied', reason: 'Source provenance was not supplied' }
        : unavailable('caller-supplied', 'No usable heart rate supplied'),
      rr: unavailable('legacy-normal-helper', 'No RR interval supplied'),
      pr: unavailable('legacy-normal-helper', 'No PR interval supplied'),
      qrs: unavailable('legacy-normal-helper', 'No QRS duration supplied'),
      qt: unavailable('legacy-normal-helper', 'No QT interval supplied'),
      qtc: unavailable('legacy-normal-helper', 'No QTc supplied'),
      pAxis: unavailable('legacy-normal-helper', 'No P axis supplied'),
      qrsAxis: unavailable('legacy-normal-helper', 'No QRS axis supplied'),
      tAxis: unavailable('legacy-normal-helper', 'No T axis supplied'),
    },
  };
}
