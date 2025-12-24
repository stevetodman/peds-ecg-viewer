/**
 * Sample 12-Lead ECG Data
 *
 * Realistic ECG waveforms based on normal adult morphology.
 * Uses clinically accurate timing intervals and amplitudes.
 *
 * Reference values:
 * - P wave: 80-120ms duration, 100-300µV amplitude
 * - PR interval: 120-200ms
 * - QRS complex: 80-100ms duration, 500-2500µV amplitude (lead-dependent)
 * - QT interval: 320-440ms
 * - T wave: 100-500µV amplitude (lead-dependent)
 * - Heart rate: 72 bpm (RR interval ~833ms)
 *
 * @module data/sample-ecg
 */

import type { ECGSignal, LeadName } from '../types';

/**
 * Sample rate in Hz
 */
const SAMPLE_RATE = 500;

/**
 * Duration in seconds
 */
const DURATION = 10;

/**
 * Heart rate in bpm (~72 bpm for realistic adult ECG)
 */
const HEART_RATE = 72;

/**
 * Waveform timing parameters (in seconds)
 */
const TIMING = {
  // P wave
  pOnset: 0.0,
  pPeak: 0.04,
  pEnd: 0.08,

  // PR segment
  prEnd: 0.16,

  // QRS complex
  qOnset: 0.16,
  qTrough: 0.18,
  rPeak: 0.20,
  sPeak: 0.23,
  sEnd: 0.26,

  // ST segment
  stEnd: 0.32,

  // T wave
  tOnset: 0.32,
  tPeak: 0.42,
  tEnd: 0.52,
};

/**
 * Lead configuration type
 */
interface LeadAmplitudeConfig {
  pAmp: number;
  qAmp: number;
  rAmp: number;
  sAmp: number;
  tAmp: number;
  stOffset: number;
  inverted: boolean;
}

/**
 * Lead-specific amplitude configurations (in µV)
 * Based on normal pediatric ECG patterns with proper R-wave progression
 */
const LEAD_CONFIG: Partial<Record<LeadName, LeadAmplitudeConfig>> = {
  // Limb leads
  I: { pAmp: 150, qAmp: 80, rAmp: 800, sAmp: 100, tAmp: 300, stOffset: 0, inverted: false },
  II: { pAmp: 200, qAmp: 100, rAmp: 1200, sAmp: 150, tAmp: 400, stOffset: 0, inverted: false },
  III: { pAmp: 100, qAmp: 80, rAmp: 600, sAmp: 200, tAmp: 200, stOffset: 0, inverted: false },
  aVR: { pAmp: 120, qAmp: 50, rAmp: 200, sAmp: 800, tAmp: 250, stOffset: 0, inverted: true },
  aVL: { pAmp: 80, qAmp: 60, rAmp: 500, sAmp: 100, tAmp: 200, stOffset: 0, inverted: false },
  aVF: { pAmp: 150, qAmp: 80, rAmp: 900, sAmp: 150, tAmp: 300, stOffset: 0, inverted: false },

  // Precordial leads - R-wave progression V1→V6
  V1: { pAmp: 100, qAmp: 0, rAmp: 300, sAmp: 1200, tAmp: 150, stOffset: 0, inverted: false },
  V2: { pAmp: 100, qAmp: 50, rAmp: 600, sAmp: 1400, tAmp: 400, stOffset: 0, inverted: false },
  V3: { pAmp: 100, qAmp: 80, rAmp: 1000, sAmp: 1000, tAmp: 500, stOffset: 0, inverted: false },
  V4: { pAmp: 100, qAmp: 100, rAmp: 1600, sAmp: 600, tAmp: 550, stOffset: 0, inverted: false },
  V5: { pAmp: 100, qAmp: 80, rAmp: 1400, sAmp: 300, tAmp: 450, stOffset: 0, inverted: false },
  V6: { pAmp: 100, qAmp: 60, rAmp: 1000, sAmp: 100, tAmp: 350, stOffset: 0, inverted: false },

  // Pediatric leads
  V3R: { pAmp: 100, qAmp: 0, rAmp: 400, sAmp: 1000, tAmp: 100, stOffset: 0, inverted: true },
  V4R: { pAmp: 100, qAmp: 0, rAmp: 300, sAmp: 800, tAmp: 80, stOffset: 0, inverted: true },
  V7: { pAmp: 100, qAmp: 50, rAmp: 800, sAmp: 150, tAmp: 300, stOffset: 0, inverted: false },
};

/**
 * Gaussian function for smooth waveforms
 */
function gaussian(x: number, center: number, width: number): number {
  return Math.exp(-Math.pow((x - center) / width, 2));
}

/**
 * Default lead config for any unmapped leads
 */
const DEFAULT_CONFIG: LeadAmplitudeConfig = {
  pAmp: 100, qAmp: 50, rAmp: 800, sAmp: 400, tAmp: 300, stOffset: 0, inverted: false,
};

/**
 * Generate a single beat for a specific lead
 */
function generateBeat(leadName: LeadName): number[] {
  const config = LEAD_CONFIG[leadName] || DEFAULT_CONFIG;
  const beatDuration = 60 / HEART_RATE; // seconds
  const numSamples = Math.round(SAMPLE_RATE * beatDuration);
  const samples: number[] = new Array(numSamples).fill(0);

  const sign = config.inverted ? -1 : 1;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE; // time in seconds
    let value = 0;

    // P wave (asymmetric gaussian)
    if (t >= TIMING.pOnset && t <= TIMING.pEnd) {
      const pWidth = 0.02;
      value += sign * config.pAmp * gaussian(t, TIMING.pPeak, pWidth);
    }

    // QRS complex
    if (t >= TIMING.qOnset && t <= TIMING.sEnd) {
      // Q wave (small negative deflection before R)
      if (config.qAmp > 0) {
        const qWidth = 0.01;
        value -= sign * config.qAmp * gaussian(t, TIMING.qTrough, qWidth);
      }

      // R wave (main positive deflection)
      const rWidth = 0.012;
      value += sign * config.rAmp * gaussian(t, TIMING.rPeak, rWidth);

      // S wave (negative deflection after R)
      if (config.sAmp > 0) {
        const sWidth = 0.015;
        value -= sign * config.sAmp * gaussian(t, TIMING.sPeak, sWidth);
      }
    }

    // ST segment offset (if any)
    if (t >= TIMING.sEnd && t <= TIMING.stEnd) {
      value += sign * config.stOffset;
    }

    // T wave
    if (t >= TIMING.tOnset && t <= TIMING.tEnd) {
      const tWidth = 0.05;
      value += sign * config.tAmp * gaussian(t, TIMING.tPeak, tWidth);
    }

    samples[i] = value;
  }

  return samples;
}

/**
 * Generate complete 15-lead ECG signal (12-lead + pediatric)
 */
function generateSampleECG(): ECGSignal {
  const totalSamples = SAMPLE_RATE * DURATION;
  const leads: Partial<Record<LeadName, number[]>> = {};

  // All 15 leads including pediatric
  const leadNames: LeadName[] = [
    'I', 'II', 'III', 'aVR', 'aVL', 'aVF',
    'V1', 'V2', 'V3', 'V4', 'V5', 'V6',
    'V3R', 'V4R', 'V7',
  ];

  for (const leadName of leadNames) {
    // Generate one beat
    const beat = generateBeat(leadName);

    // Repeat beats to fill duration
    const fullSignal: number[] = [];
    while (fullSignal.length < totalSamples) {
      // Add slight variation to each beat (realistic RR variability ~5%)
      const variation = 1 + (Math.random() - 0.5) * 0.02;
      const stretchedBeat = beat.map((v) => v * variation);
      fullSignal.push(...stretchedBeat);
    }

    // Trim to exact length and add subtle baseline noise
    leads[leadName] = fullSignal.slice(0, totalSamples).map((v) => {
      // Add small baseline noise (±10µV) for realism
      return v + (Math.random() - 0.5) * 20;
    });
  }

  return {
    sampleRate: SAMPLE_RATE,
    duration: DURATION,
    leads,
  };
}

/**
 * Pre-generated sample ECG for consistent display
 * (Uses a seeded random generator for reproducibility)
 */
export const sampleECG: ECGSignal = generateSampleECG();

/**
 * Generate a fresh sample ECG with new random variations
 */
export function createSampleECG(): ECGSignal {
  return generateSampleECG();
}

/**
 * Sample patient data to accompany the ECG
 */
export const samplePatient = {
  name: 'DEMO, PATIENT',
  mrn: '12345678',
  dob: '01/15/2010',
  age: '14 years',
  sex: 'Male',
  location: 'Pediatric Cardiology',
  referredBy: 'Dr. Smith',
  studyDate: new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }),
  studyTime: new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }),
};

/**
 * Sample measurements for the ECG
 */
export const sampleMeasurements = {
  heartRate: HEART_RATE,
  prInterval: 160,
  qrsDuration: 88,
  qtInterval: 380,
  qtcInterval: 420,
  pAxis: 60,
  qrsAxis: 45,
  tAxis: 40,
};
