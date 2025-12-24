/**
 * Synthetic ECG Signal Generator
 *
 * Generates realistic ECG waveforms for testing.
 *
 * @module signal/synthetic
 */

import type { ECGSignal, LeadName } from '../types';
import { STANDARD_LEADS } from '../types';

/**
 * Synthetic ECG options
 */
export interface SyntheticECGOptions {
  /** Duration in seconds */
  duration?: number;
  /** Sample rate in Hz */
  sampleRate?: number;
  /** Heart rate in bpm */
  heartRate?: number;
  /** Add noise */
  noise?: number;
  /** P wave amplitude (µV) */
  pAmplitude?: number;
  /** QRS amplitude (µV) */
  qrsAmplitude?: number;
  /** T wave amplitude (µV) */
  tAmplitude?: number;
}

/**
 * Generate a single ECG beat waveform
 * Uses a simplified mathematical model
 */
function generateBeat(
  sampleRate: number,
  heartRate: number,
  pAmp: number,
  qrsAmp: number,
  tAmp: number
): number[] {
  const beatDuration = 60 / heartRate; // seconds
  const numSamples = Math.round(sampleRate * beatDuration);
  const samples: number[] = new Array(numSamples).fill(0);

  // Time points (as fraction of beat)
  const pStart = 0.1;
  const pPeak = 0.15;
  const pEnd = 0.2;
  const qStart = 0.25;
  const rPeak = 0.3;
  const sEnd = 0.35;
  const tStart = 0.4;
  const tPeak = 0.55;
  const tEnd = 0.7;

  for (let i = 0; i < numSamples; i++) {
    const t = i / numSamples; // 0 to 1
    let value = 0;

    // P wave (Gaussian)
    if (t >= pStart && t <= pEnd) {
      const pCenter = pPeak;
      const pWidth = (pEnd - pStart) / 4;
      value += pAmp * Math.exp(-Math.pow((t - pCenter) / pWidth, 2));
    }

    // QRS complex
    if (t >= qStart && t <= sEnd) {
      const qrsCenter = rPeak;
      const qrsWidth = (sEnd - qStart) / 6;

      // Q wave (small negative)
      if (t < rPeak - qrsWidth) {
        const qCenter = qStart + (rPeak - qStart) / 3;
        value -= qrsAmp * 0.1 * Math.exp(-Math.pow((t - qCenter) / (qrsWidth / 2), 2));
      }

      // R wave (tall positive)
      value += qrsAmp * Math.exp(-Math.pow((t - qrsCenter) / qrsWidth, 2));

      // S wave (negative)
      if (t > rPeak) {
        const sCenter = rPeak + (sEnd - rPeak) / 2;
        value -= qrsAmp * 0.25 * Math.exp(-Math.pow((t - sCenter) / (qrsWidth / 2), 2));
      }
    }

    // T wave (Gaussian)
    if (t >= tStart && t <= tEnd) {
      const tCenter = tPeak;
      const tWidth = (tEnd - tStart) / 4;
      value += tAmp * Math.exp(-Math.pow((t - tCenter) / tWidth, 2));
    }

    samples[i] = value;
  }

  return samples;
}

/**
 * Apply lead-specific transformations
 * Different leads show different views of the heart's electrical activity
 */
function transformForLead(baseSamples: number[], lead: LeadName): number[] {
  const transforms: Record<LeadName, { scale: number; invert: boolean }> = {
    // Limb leads
    I: { scale: 1.0, invert: false },
    II: { scale: 1.2, invert: false },
    III: { scale: 0.8, invert: false },
    aVR: { scale: 0.7, invert: true },
    aVL: { scale: 0.6, invert: false },
    aVF: { scale: 1.0, invert: false },
    // Precordial leads
    V1: { scale: 0.8, invert: false },
    V2: { scale: 1.0, invert: false },
    V3: { scale: 1.1, invert: false },
    V4: { scale: 1.2, invert: false },
    V5: { scale: 1.1, invert: false },
    V6: { scale: 1.0, invert: false },
    // Pediatric leads
    V3R: { scale: 0.7, invert: true },
    V4R: { scale: 0.6, invert: true },
    V7: { scale: 0.9, invert: false },
  };

  const { scale, invert } = transforms[lead];
  return baseSamples.map(s => (invert ? -s : s) * scale);
}

/**
 * Add random noise to signal
 */
function addNoise(samples: number[], noiseLevel: number): number[] {
  return samples.map(s => s + (Math.random() - 0.5) * 2 * noiseLevel);
}

/**
 * Generate a synthetic 12-lead ECG signal
 */
export function generateSyntheticECG(options: SyntheticECGOptions = {}): ECGSignal {
  const {
    duration = 10,
    sampleRate = 500,
    heartRate = 75,
    noise = 10,
    pAmplitude = 150,
    qrsAmplitude = 1000,
    tAmplitude = 300,
  } = options;

  // Generate base beat
  const baseBeat = generateBeat(sampleRate, heartRate, pAmplitude, qrsAmplitude, tAmplitude);

  // Calculate total samples needed
  const totalSamples = Math.round(sampleRate * duration);

  // Generate full duration by repeating beats
  const baseSignal: number[] = [];
  while (baseSignal.length < totalSamples) {
    baseSignal.push(...baseBeat);
  }
  // Trim to exact length
  const trimmedBase = baseSignal.slice(0, totalSamples);

  // Generate each lead
  const leads: Record<LeadName, number[]> = {} as Record<LeadName, number[]>;

  for (const lead of STANDARD_LEADS) {
    let leadSignal = transformForLead(trimmedBase, lead);
    if (noise > 0) {
      leadSignal = addNoise(leadSignal, noise);
    }
    leads[lead] = leadSignal;
  }

  return {
    sampleRate,
    duration,
    leads,
  };
}

/**
 * Generate a flat line signal (for testing)
 */
export function generateFlatLine(
  duration: number = 10,
  sampleRate: number = 500
): ECGSignal {
  const totalSamples = Math.round(sampleRate * duration);
  const flatLine = new Array(totalSamples).fill(0);

  const leads: Record<LeadName, number[]> = {} as Record<LeadName, number[]>;
  for (const lead of STANDARD_LEADS) {
    leads[lead] = [...flatLine];
  }

  return {
    sampleRate,
    duration,
    leads,
  };
}

/**
 * Generate a sine wave signal (for testing grid alignment)
 */
export function generateSineWave(
  duration: number = 10,
  sampleRate: number = 500,
  frequency: number = 1,
  amplitude: number = 500
): ECGSignal {
  const totalSamples = Math.round(sampleRate * duration);
  const samples: number[] = [];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    samples.push(amplitude * Math.sin(2 * Math.PI * frequency * t));
  }

  const leads: Record<LeadName, number[]> = {} as Record<LeadName, number[]>;
  for (const lead of STANDARD_LEADS) {
    leads[lead] = [...samples];
  }

  return {
    sampleRate,
    duration,
    leads,
  };
}
