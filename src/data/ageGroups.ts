/**
 * Pediatric age group definitions
 *
 * Age groups are divided based on:
 * 1. Physiological stages of cardiac development
 * 2. Availability of reference data in literature
 * 3. Clinical relevance for ECG interpretation
 *
 * @module data/ageGroups
 */

/**
 * Age group definition
 */
export interface AgeGroup {
  /** Unique identifier */
  id: string;

  /** Full display label */
  label: string;

  /** Short label for space-constrained displays */
  shortLabel: string;

  /** Minimum age in days (inclusive) */
  minDays: number;

  /** Maximum age in days (exclusive) */
  maxDays: number;

  /** Developmental stage */
  stage: 'neonate' | 'infant' | 'toddler' | 'child' | 'adolescent';

  /** Clinical notes for this age group */
  clinicalNotes?: string;
}

/**
 * Clinically meaningful age divisions for pediatric ECG interpretation
 *
 * Based on:
 * - Davignon A, et al. Normal ECG standards for infants and children.
 *   Pediatr Cardiol. 1979/80;1:123-131
 * - Rijnbeek PR, et al. New normal limits for the pediatric electrocardiogram.
 *   Eur Heart J. 2001;22:702-711
 */
export const AGE_GROUPS: readonly AgeGroup[] = [
  {
    id: 'neonate_0_24h',
    label: '0-24 hours',
    shortLabel: '<1d',
    minDays: 0,
    maxDays: 1,
    stage: 'neonate',
    clinicalNotes: 'Transitional circulation. T-wave upright in V1 normal.',
  },
  {
    id: 'neonate_1_7d',
    label: '1-7 days',
    shortLabel: '1-7d',
    minDays: 1,
    maxDays: 8,
    stage: 'neonate',
    clinicalNotes: 'T-wave in V1 should invert by day 3-7. Upright T in V1 after day 3 suggests RVH.',
  },
  {
    id: 'neonate_8_30d',
    label: '8-30 days',
    shortLabel: '8-30d',
    minDays: 8,
    maxDays: 31,
    stage: 'neonate',
    clinicalNotes: 'RV dominance still present but decreasing. T-wave should be inverted in V1.',
  },
  {
    id: 'infant_1_3mo',
    label: '1-3 months',
    shortLabel: '1-3mo',
    minDays: 31,
    maxDays: 92,
    stage: 'infant',
    clinicalNotes: 'Transition from RV to LV dominance beginning. Axis moving leftward.',
  },
  {
    id: 'infant_3_6mo',
    label: '3-6 months',
    shortLabel: '3-6mo',
    minDays: 92,
    maxDays: 183,
    stage: 'infant',
    clinicalNotes: 'LV dominance establishing. QRS axis approaching normal adult range.',
  },
  {
    id: 'infant_6_12mo',
    label: '6-12 months',
    shortLabel: '6-12mo',
    minDays: 183,
    maxDays: 366,
    stage: 'infant',
    clinicalNotes: 'LV dominance established. Adult-like LV/RV voltage ratio.',
  },
  {
    id: 'toddler_1_3yr',
    label: '1-3 years',
    shortLabel: '1-3y',
    minDays: 366,
    maxDays: 1096, // 3 years = 365.25 * 3
    stage: 'toddler',
    clinicalNotes: 'Heart rate decreasing. Intervals lengthening with growth.',
  },
  {
    id: 'child_3_5yr',
    label: '3-5 years',
    shortLabel: '3-5y',
    minDays: 1096,
    maxDays: 1827, // 5 years
    stage: 'child',
    clinicalNotes: 'ECG pattern approaching adult. Higher voltages due to thin chest wall.',
  },
  {
    id: 'child_5_8yr',
    label: '5-8 years',
    shortLabel: '5-8y',
    minDays: 1827,
    maxDays: 2922, // 8 years
    stage: 'child',
    clinicalNotes: 'Juvenile T-wave pattern (inverted T in V1-V3) normal.',
  },
  {
    id: 'child_8_12yr',
    label: '8-12 years',
    shortLabel: '8-12y',
    minDays: 2922,
    maxDays: 4383, // 12 years
    stage: 'child',
    clinicalNotes: 'Prepubertal. Voltages may be high. Juvenile T pattern persists.',
  },
  {
    id: 'adolescent_12_16yr',
    label: '12-16 years',
    shortLabel: '12-16y',
    minDays: 4383,
    maxDays: 5844, // 16 years
    stage: 'adolescent',
    clinicalNotes: 'Pubertal changes. T-wave may become upright in V1-V3. Athletic heart patterns.',
  },
  {
    id: 'adolescent_16_18yr',
    label: '16-18 years',
    shortLabel: '16-18y',
    minDays: 5844,
    maxDays: 6575, // 18 years
    stage: 'adolescent',
    clinicalNotes: 'Near-adult patterns. Adult criteria may be applicable.',
  },
] as const;

/**
 * Map of age group IDs for quick lookup
 */
export const AGE_GROUP_MAP: ReadonlyMap<string, AgeGroup> = new Map(
  AGE_GROUPS.map(group => [group.id, group])
);

/**
 * Find the appropriate age group for a given age in days
 * @param ageDays - Age in days
 * @returns The matching age group
 */
export function getAgeGroup(ageDays: number): AgeGroup {
  // Handle negative ages (shouldn't happen, but be safe)
  if (ageDays < 0) {
    return AGE_GROUPS[0];
  }

  // Find matching group
  const group = AGE_GROUPS.find(g => ageDays >= g.minDays && ageDays < g.maxDays);

  // If beyond 18 years, return the last group
  if (!group) {
    return AGE_GROUPS[AGE_GROUPS.length - 1];
  }

  return group;
}

/**
 * Get age group by ID
 * @param id - Age group ID
 * @returns The age group or undefined
 */
export function getAgeGroupById(id: string): AgeGroup | undefined {
  return AGE_GROUP_MAP.get(id);
}

/**
 * Check if age is in a specific stage
 * @param ageDays - Age in days
 * @param stage - Developmental stage to check
 * @returns True if age is in the specified stage
 */
export function isInStage(
  ageDays: number,
  stage: AgeGroup['stage']
): boolean {
  const group = getAgeGroup(ageDays);
  return group.stage === stage;
}

/**
 * Check if patient is a neonate (0-30 days)
 */
export function isNeonate(ageDays: number): boolean {
  return isInStage(ageDays, 'neonate');
}

/**
 * Check if patient is an infant (1-12 months)
 */
export function isInfant(ageDays: number): boolean {
  return isInStage(ageDays, 'infant');
}

/**
 * Check if patient is pediatric (<18 years)
 */
export function isPediatric(ageDays: number): boolean {
  return ageDays < 6575; // 18 years in days
}

/**
 * Get all age groups in a developmental stage
 */
export function getGroupsByStage(stage: AgeGroup['stage']): AgeGroup[] {
  return AGE_GROUPS.filter(g => g.stage === stage);
}

/**
 * Convert age in various units to days
 */
export function ageToDays(
  value: number,
  unit: 'days' | 'weeks' | 'months' | 'years'
): number {
  switch (unit) {
    case 'days':
      return value;
    case 'weeks':
      return value * 7;
    case 'months':
      return Math.round(value * 30.44); // Average days per month
    case 'years':
      return Math.round(value * 365.25); // Account for leap years
  }
}
