/**
 * Patient and study types
 * @module types/patient
 */

/**
 * Biological sex (for ECG interpretation purposes)
 */
export type BiologicalSex = 'male' | 'female' | 'unknown';

/**
 * Patient name structure
 */
export interface PatientName {
  /** First/given name */
  first: string;

  /** Last/family name */
  last: string;

  /** Middle name(s) */
  middle?: string;

  /** Suffix (Jr., Sr., III, etc.) */
  suffix?: string;

  /** Prefix (Dr., Mr., Mrs., etc.) */
  prefix?: string;
}

/**
 * Patient information
 */
export interface Patient {
  /** Patient identifier (MRN) */
  id: string;

  /** Patient name */
  name: PatientName;

  /** Date of birth */
  dateOfBirth: Date;

  /** Biological sex (for ECG interpretation) */
  sex: BiologicalSex;

  /** Height in centimeters */
  heightCm?: number;

  /** Weight in kilograms */
  weightKg?: number;

  /** Body surface area in m^2 (calculated or provided) */
  bsaM2?: number;

  /** Race/ethnicity (may affect some criteria) */
  ethnicity?: string;
}

/**
 * Calculated age with components
 */
export interface Age {
  /** Complete years */
  years: number;

  /** Remaining months after years */
  months: number;

  /** Remaining days after months */
  days: number;

  /** Total age in days (for precise calculations) */
  totalDays: number;
}

/**
 * Calculate age from DOB to a reference date
 * @param dob - Date of birth
 * @param referenceDate - Reference date (default: now)
 * @returns Age components
 */
export function calculateAge(dob: Date, referenceDate: Date = new Date()): Age {
  const diffMs = referenceDate.getTime() - dob.getTime();
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Calculate years, months, days
  let years = referenceDate.getFullYear() - dob.getFullYear();
  let months = referenceDate.getMonth() - dob.getMonth();
  let days = referenceDate.getDate() - dob.getDate();

  // Adjust for negative days
  if (days < 0) {
    months--;
    // Get days in previous month
    const prevMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0);
    days += prevMonth.getDate();
  }

  // Adjust for negative months
  if (months < 0) {
    years--;
    months += 12;
  }

  return { years, months, days, totalDays };
}

/**
 * Format age for display
 * @param age - Age object
 * @returns Formatted age string appropriate for pediatrics
 */
export function formatAge(age: Age): string {
  if (age.totalDays < 1) {
    return '<1 day';
  }

  if (age.totalDays < 7) {
    return `${age.totalDays} day${age.totalDays !== 1 ? 's' : ''}`;
  }

  if (age.totalDays < 30) {
    const weeks = Math.floor(age.totalDays / 7);
    return `${weeks} week${weeks !== 1 ? 's' : ''}`;
  }

  if (age.years < 2) {
    const totalMonths = age.years * 12 + age.months;
    return `${totalMonths} month${totalMonths !== 1 ? 's' : ''}`;
  }

  if (age.years < 18) {
    if (age.months === 0) {
      return `${age.years} year${age.years !== 1 ? 's' : ''}`;
    }
    return `${age.years} yr ${age.months} mo`;
  }

  return `${age.years} years`;
}

/**
 * Calculate body surface area using Mosteller formula
 * BSA (m^2) = sqrt((height_cm * weight_kg) / 3600)
 * @param heightCm - Height in centimeters
 * @param weightKg - Weight in kilograms
 * @returns BSA in m^2
 */
export function calculateBSA(heightCm: number, weightKg: number): number {
  return Math.sqrt((heightCm * weightKg) / 3600);
}

/**
 * Device information
 */
export interface DeviceInfo {
  /** Manufacturer name */
  manufacturer: string;

  /** Device model */
  model: string;

  /** Serial number */
  serialNumber?: string;

  /** Software version */
  softwareVersion?: string;
}

/**
 * Study/acquisition information
 */
export interface ECGStudy {
  /** Unique study identifier */
  studyId: string;

  /** Patient information */
  patient: Patient;

  /** Acquisition date and time */
  acquisitionDateTime: Date;

  /** Ordering/requesting physician */
  orderingPhysician?: string;

  /** Technician/operator who performed study */
  technician?: string;

  /** Facility/location name */
  facility: string;

  /** Department */
  department?: string;

  /** Device information */
  device?: DeviceInfo;

  /** Clinical indication/reason for study */
  indication?: string;

  /** Medications (may affect interpretation) */
  medications?: string[];

  /** Clinical notes */
  notes?: string;

  /** ECG signal data */
  signal: import('./ecg').ECGSignal;
}

/**
 * Create a minimal study object for testing
 */
export function createMinimalStudy(
  signal: import('./ecg').ECGSignal,
  patientAge: Age,
  sex: BiologicalSex = 'unknown'
): ECGStudy {
  const now = new Date();
  const dob = new Date(now.getTime() - patientAge.totalDays * 24 * 60 * 60 * 1000);

  return {
    studyId: `STUDY-${Date.now()}`,
    patient: {
      id: 'UNKNOWN',
      name: { first: 'Unknown', last: 'Patient' },
      dateOfBirth: dob,
      sex,
    },
    acquisitionDateTime: now,
    facility: 'Unknown Facility',
    signal,
  };
}
