/**
 * Input validation utilities
 * @module utils/validation
 */

import type { ECGSignal, LeadName } from '../types';

/**
 * Validation error with details
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public value: unknown
  ) {
    super(`${field}: ${message}`);
    this.name = 'ValidationError';
  }
}

/**
 * Validate ECG signal data
 */
export function validateECGSignal(signal: unknown): signal is ECGSignal {
  if (!signal || typeof signal !== 'object') {
    throw new ValidationError('Signal must be an object', 'signal', signal);
  }

  const s = signal as Record<string, unknown>;

  // Validate sample rate
  if (typeof s.sampleRate !== 'number' || s.sampleRate <= 0) {
    throw new ValidationError('Sample rate must be a positive number', 'sampleRate', s.sampleRate);
  }

  if (s.sampleRate < 100 || s.sampleRate > 2000) {
    throw new ValidationError(
      'Sample rate should be between 100 and 2000 Hz',
      'sampleRate',
      s.sampleRate
    );
  }

  // Validate duration
  if (typeof s.duration !== 'number' || s.duration <= 0) {
    throw new ValidationError('Duration must be a positive number', 'duration', s.duration);
  }

  // Validate leads
  if (!s.leads || typeof s.leads !== 'object') {
    throw new ValidationError('Leads must be an object', 'leads', s.leads);
  }

  const leads = s.leads as Record<string, unknown>;
  const requiredLeads: LeadName[] = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

  for (const lead of requiredLeads) {
    if (!Array.isArray(leads[lead])) {
      throw new ValidationError(`Lead ${lead} must be an array`, `leads.${lead}`, leads[lead]);
    }

    const samples = leads[lead] as unknown[];
    if (!samples.every(s => typeof s === 'number' && !isNaN(s))) {
      throw new ValidationError(
        `Lead ${lead} must contain only valid numbers`,
        `leads.${lead}`,
        'contains invalid values'
      );
    }
  }

  // Validate all leads have same length
  const expectedLength = (leads[requiredLeads[0]] as number[]).length;
  for (const lead of requiredLeads) {
    const length = (leads[lead] as number[]).length;
    if (length !== expectedLength) {
      throw new ValidationError(
        `Lead ${lead} has ${length} samples but expected ${expectedLength}`,
        `leads.${lead}`,
        length
      );
    }
  }

  // Validate sample count matches duration
  const expectedSamples = Math.round((s.sampleRate) * (s.duration));
  const tolerance = 2; // Allow small rounding differences
  if (Math.abs(expectedLength - expectedSamples) > tolerance) {
    throw new ValidationError(
      `Sample count (${expectedLength}) doesn't match duration * sampleRate (${expectedSamples})`,
      'leads',
      { expected: expectedSamples, actual: expectedLength }
    );
  }

  return true;
}

/**
 * Validate age in days
 */
export function validateAge(ageDays: number): boolean {
  if (typeof ageDays !== 'number' || isNaN(ageDays)) {
    throw new ValidationError('Age must be a valid number', 'ageDays', ageDays);
  }

  if (ageDays < 0) {
    throw new ValidationError('Age cannot be negative', 'ageDays', ageDays);
  }

  if (ageDays > 36500) {
    // ~100 years
    throw new ValidationError('Age exceeds reasonable limit', 'ageDays', ageDays);
  }

  return true;
}

/**
 * Validate measurement value is reasonable
 */
export function validateMeasurement(
  value: number,
  name: string,
  min: number,
  max: number
): boolean {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new ValidationError(`${name} must be a valid number`, name, value);
  }

  if (value < min || value > max) {
    throw new ValidationError(
      `${name} (${value}) is outside expected range [${min}, ${max}]`,
      name,
      value
    );
  }

  return true;
}

/**
 * Common measurement validation ranges
 */
export const MEASUREMENT_RANGES = {
  heartRate: { min: 20, max: 400 },
  prInterval: { min: 20, max: 500 },
  qrsDuration: { min: 20, max: 300 },
  qtInterval: { min: 100, max: 800 },
  qtc: { min: 200, max: 700 },
  axis: { min: -180, max: 180 },
} as const;
