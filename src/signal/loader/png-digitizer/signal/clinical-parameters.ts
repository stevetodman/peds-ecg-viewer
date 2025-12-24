/**
 * Clinical Parameter Extraction
 * Extract PR, QRS, QT intervals, heart rate, axis, and other measurements
 *
 * @module signal/loader/png-digitizer/signal/clinical-parameters
 */

import type { LeadName } from '../../../../types';

/**
 * ECG intervals and measurements
 */
export interface ECGIntervals {
  /** Heart rate in BPM */
  heartRate: number;

  /** RR interval in ms (average) */
  rrInterval: number;

  /** RR interval variability (SDNN in ms) */
  rrVariability: number;

  /** PR interval in ms */
  prInterval: number | null;

  /** QRS duration in ms */
  qrsDuration: number;

  /** QT interval in ms */
  qtInterval: number | null;

  /** Corrected QT (Bazett's formula) in ms */
  qtcBazett: number | null;

  /** Corrected QT (Fridericia's formula) in ms */
  qtcFridericia: number | null;

  /** P wave duration in ms */
  pWaveDuration: number | null;

  /** T wave duration in ms */
  tWaveDuration: number | null;
}

/**
 * ECG axis measurements
 */
export interface ECGAxis {
  /** QRS axis in degrees (-180 to +180) */
  qrsAxis: number;

  /** P wave axis in degrees */
  pAxis: number | null;

  /** T wave axis in degrees */
  tAxis: number | null;

  /** Axis deviation category */
  axisDeviation: 'normal' | 'left' | 'right' | 'extreme' | 'indeterminate';
}

/**
 * QRS morphology analysis
 */
export interface QRSMorphology {
  /** Lead analyzed */
  lead: LeadName;

  /** Q wave amplitude (mV, negative) */
  qAmplitude: number | null;

  /** Q wave duration (ms) */
  qDuration: number | null;

  /** R wave amplitude (mV) */
  rAmplitude: number;

  /** R' wave amplitude if present */
  rPrimeAmplitude: number | null;

  /** S wave amplitude (mV, negative) */
  sAmplitude: number | null;

  /** S' wave amplitude if present */
  sPrimeAmplitude: number | null;

  /** QRS pattern (qR, Rs, RS, rS, QS, etc.) */
  pattern: string;
}

/**
 * ST segment analysis
 */
export interface STAnalysis {
  /** Lead analyzed */
  lead: LeadName;

  /** ST elevation/depression at J point (mV) */
  stDeviation: number;

  /** ST slope (upsloping, horizontal, downsloping) */
  stSlope: 'upsloping' | 'horizontal' | 'downsloping';

  /** ST morphology */
  stMorphology: 'normal' | 'elevated' | 'depressed' | 'coved' | 'saddleback';

  /** Clinical significance */
  significance: 'normal' | 'nonspecific' | 'ischemic' | 'stemi_equivalent';
}

/**
 * Complete clinical parameter extraction result
 */
export interface ClinicalParameters {
  /** ECG intervals */
  intervals: ECGIntervals;

  /** Cardiac axis */
  axis: ECGAxis;

  /** QRS morphology per lead */
  qrsMorphology: Partial<Record<LeadName, QRSMorphology>>;

  /** ST analysis per lead */
  stAnalysis: Partial<Record<LeadName, STAnalysis>>;

  /** Rhythm classification */
  rhythm: {
    classification: string;
    regular: boolean;
    description: string;
  };

  /** Confidence in measurements (0-1) */
  confidence: number;

  /** Measurement warnings */
  warnings: string[];
}

/**
 * Clinical parameter extractor
 */
export class ClinicalParameterExtractor {
  private sampleRate: number;
  private leads: Partial<Record<LeadName, number[]>>;

  constructor(leads: Partial<Record<LeadName, number[]>>, sampleRate: number) {
    this.leads = leads;
    this.sampleRate = sampleRate;
  }

  /**
   * Extract all clinical parameters
   */
  extract(): ClinicalParameters {
    const warnings: string[] = [];

    // Use Lead II for primary measurements (most reliable)
    const primaryLead = this.selectPrimaryLead();
    if (!primaryLead) {
      return this.createEmptyResult('No suitable leads for analysis');
    }

    const samples = this.leads[primaryLead]!;

    // Detect fiducial points (P, Q, R, S, T)
    const fiducials = this.detectFiducialPoints(samples);

    // Calculate intervals
    const intervals = this.calculateIntervals(samples, fiducials);

    // Calculate axis from limb leads
    const axis = this.calculateAxis();

    // Analyze QRS morphology for each lead
    const qrsMorphology = this.analyzeQRSMorphology(fiducials);

    // Analyze ST segments
    const stAnalysis = this.analyzeSTSegments(fiducials);

    // Classify rhythm
    const rhythm = this.classifyRhythm(fiducials, intervals);

    // Calculate confidence
    const confidence = this.calculateConfidence(fiducials, intervals);

    return {
      intervals,
      axis,
      qrsMorphology,
      stAnalysis,
      rhythm,
      confidence,
      warnings,
    };
  }

  /**
   * Select primary lead for analysis
   */
  private selectPrimaryLead(): LeadName | null {
    const preference: LeadName[] = ['II', 'I', 'V5', 'V2', 'III'];
    for (const lead of preference) {
      if (this.leads[lead] && this.leads[lead].length > this.sampleRate) {
        return lead;
      }
    }
    return null;
  }

  /**
   * Fiducial point detection
   */
  private detectFiducialPoints(samples: number[]): {
    rPeaks: number[];
    qPoints: number[];
    sPoints: number[];
    pOnsets: number[];
    pPeaks: number[];
    pOffsets: number[];
    tPeaks: number[];
    tOffsets: number[];
  } {
    // Detect R peaks using Pan-Tompkins-like algorithm
    const rPeaks = this.detectRPeaks(samples);

    // For each R peak, find surrounding fiducial points
    const qPoints: number[] = [];
    const sPoints: number[] = [];
    const pOnsets: number[] = [];
    const pPeaks: number[] = [];
    const pOffsets: number[] = [];
    const tPeaks: number[] = [];
    const tOffsets: number[] = [];

    for (let i = 0; i < rPeaks.length; i++) {
      const rIdx = rPeaks[i];

      // Find Q point (minimum before R, within 100ms)
      const qSearchStart = Math.max(0, rIdx - Math.floor(this.sampleRate * 0.1));
      const qRegion = samples.slice(qSearchStart, rIdx);
      const qOffset = qRegion.indexOf(Math.min(...qRegion));
      qPoints.push(qSearchStart + qOffset);

      // Find S point (minimum after R, within 100ms)
      const sSearchEnd = Math.min(samples.length, rIdx + Math.floor(this.sampleRate * 0.1));
      const sRegion = samples.slice(rIdx, sSearchEnd);
      const sOffset = sRegion.indexOf(Math.min(...sRegion));
      sPoints.push(rIdx + sOffset);

      // Find P wave (150-300ms before Q)
      if (i > 0) {
        const pSearchStart = Math.max(0, qPoints[i] - Math.floor(this.sampleRate * 0.3));
        const pSearchEnd = qPoints[i] - Math.floor(this.sampleRate * 0.05);
        if (pSearchEnd > pSearchStart) {
          const pRegion = samples.slice(pSearchStart, pSearchEnd);
          const pMax = Math.max(...pRegion);
          const pPeakOffset = pRegion.indexOf(pMax);
          const pPeakIdx = pSearchStart + pPeakOffset;

          // Only accept if amplitude is reasonable
          const rAmp = samples[rIdx];
          if (pMax > rAmp * 0.05 && pMax < rAmp * 0.4) {
            pPeaks.push(pPeakIdx);
            pOnsets.push(Math.max(0, pPeakIdx - Math.floor(this.sampleRate * 0.05)));
            pOffsets.push(Math.min(qPoints[i], pPeakIdx + Math.floor(this.sampleRate * 0.05)));
          }
        }
      }

      // Find T wave (200-400ms after S)
      const tSearchStart = sPoints[i] + Math.floor(this.sampleRate * 0.1);
      const tSearchEnd = Math.min(
        samples.length,
        sPoints[i] + Math.floor(this.sampleRate * 0.4)
      );
      if (tSearchEnd > tSearchStart) {
        const tRegion = samples.slice(tSearchStart, tSearchEnd);
        const tMax = Math.max(...tRegion);
        const tMin = Math.min(...tRegion);

        // T wave could be positive or negative
        const tAmp = Math.abs(tMax) > Math.abs(tMin) ? tMax : tMin;
        const tPeakOffset = tRegion.indexOf(tAmp);
        const tPeakIdx = tSearchStart + tPeakOffset;

        tPeaks.push(tPeakIdx);
        tOffsets.push(Math.min(samples.length, tPeakIdx + Math.floor(this.sampleRate * 0.1)));
      }
    }

    return {
      rPeaks,
      qPoints,
      sPoints,
      pOnsets,
      pPeaks,
      pOffsets,
      tPeaks,
      tOffsets,
    };
  }

  /**
   * Detect R peaks using derivative and threshold
   */
  private detectRPeaks(samples: number[]): number[] {
    const peaks: number[] = [];

    // Calculate threshold from signal statistics
    const max = Math.max(...samples.map(Math.abs));
    const threshold = max * 0.4;

    // Minimum RR interval (200ms = 300 bpm)
    const minRR = Math.floor(this.sampleRate * 0.2);

    let lastPeak = -minRR;

    for (let i = 1; i < samples.length - 1; i++) {
      // Check if this is a local maximum above threshold
      if (
        samples[i] > threshold &&
        samples[i] >= samples[i - 1] &&
        samples[i] >= samples[i + 1] &&
        i - lastPeak >= minRR
      ) {
        peaks.push(i);
        lastPeak = i;
      }
    }

    return peaks;
  }

  /**
   * Calculate ECG intervals
   */
  private calculateIntervals(
    _samples: number[],
    fiducials: ReturnType<ClinicalParameterExtractor['detectFiducialPoints']>
  ): ECGIntervals {
    const { rPeaks, qPoints, sPoints, pOnsets, pOffsets, tPeaks, tOffsets } = fiducials;

    // RR intervals
    const rrIntervals: number[] = [];
    for (let i = 1; i < rPeaks.length; i++) {
      rrIntervals.push((rPeaks[i] - rPeaks[i - 1]) * 1000 / this.sampleRate);
    }

    const avgRR = rrIntervals.length > 0
      ? rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length
      : 0;

    const heartRate = avgRR > 0 ? 60000 / avgRR : 0;

    // RR variability (SDNN)
    const rrVariability = rrIntervals.length > 1
      ? Math.sqrt(
          rrIntervals.reduce((sum, rr) => sum + Math.pow(rr - avgRR, 2), 0) /
          (rrIntervals.length - 1)
        )
      : 0;

    // QRS duration
    const qrsDurations: number[] = [];
    for (let i = 0; i < Math.min(qPoints.length, sPoints.length); i++) {
      qrsDurations.push((sPoints[i] - qPoints[i]) * 1000 / this.sampleRate);
    }
    const qrsDuration = qrsDurations.length > 0
      ? qrsDurations.reduce((a, b) => a + b, 0) / qrsDurations.length
      : 0;

    // PR interval
    let prInterval: number | null = null;
    if (pOnsets.length > 0 && qPoints.length > 0) {
      const prIntervals: number[] = [];
      for (let i = 0; i < Math.min(pOnsets.length, qPoints.length); i++) {
        prIntervals.push((qPoints[i] - pOnsets[i]) * 1000 / this.sampleRate);
      }
      prInterval = prIntervals.reduce((a, b) => a + b, 0) / prIntervals.length;
    }

    // QT interval
    let qtInterval: number | null = null;
    let qtcBazett: number | null = null;
    let qtcFridericia: number | null = null;
    if (qPoints.length > 0 && tOffsets.length > 0) {
      const qtIntervals: number[] = [];
      for (let i = 0; i < Math.min(qPoints.length, tOffsets.length); i++) {
        qtIntervals.push((tOffsets[i] - qPoints[i]) * 1000 / this.sampleRate);
      }
      qtInterval = qtIntervals.reduce((a, b) => a + b, 0) / qtIntervals.length;

      // QTc calculations
      if (avgRR > 0) {
        const rrSec = avgRR / 1000;
        qtcBazett = qtInterval / Math.sqrt(rrSec);
        qtcFridericia = qtInterval / Math.cbrt(rrSec);
      }
    }

    // P wave duration
    let pWaveDuration: number | null = null;
    if (pOnsets.length > 0 && pOffsets.length > 0) {
      const pDurations: number[] = [];
      for (let i = 0; i < Math.min(pOnsets.length, pOffsets.length); i++) {
        pDurations.push((pOffsets[i] - pOnsets[i]) * 1000 / this.sampleRate);
      }
      pWaveDuration = pDurations.reduce((a, b) => a + b, 0) / pDurations.length;
    }

    // T wave duration (from estimated T onset to T offset)
    let tWaveDuration: number | null = null;
    if (tPeaks.length > 0 && tOffsets.length > 0) {
      const tDurations: number[] = [];
      for (let i = 0; i < Math.min(tPeaks.length, tOffsets.length); i++) {
        // T onset is approximately 100ms before T peak
        const tOnset = Math.max(0, tPeaks[i] - Math.floor(this.sampleRate * 0.1));
        tDurations.push((tOffsets[i] - tOnset) * 1000 / this.sampleRate);
      }
      if (tDurations.length > 0) {
        tWaveDuration = tDurations.reduce((a, b) => a + b, 0) / tDurations.length;
      }
    }

    return {
      heartRate,
      rrInterval: avgRR,
      rrVariability,
      prInterval,
      qrsDuration,
      qtInterval,
      qtcBazett,
      qtcFridericia,
      pWaveDuration,
      tWaveDuration,
    };
  }

  /**
   * Calculate cardiac axis
   */
  private calculateAxis(): ECGAxis {
    const leadI = this.leads['I'];
    const leadIII = this.leads['III'];

    let qrsAxis = 0;
    let pAxis: number | null = null;
    let tAxis: number | null = null;
    let axisDeviation: ECGAxis['axisDeviation'] = 'indeterminate';

    if (leadI && leadIII) {
      // Calculate net QRS area for leads I and III
      const qrsAreaI = this.calculateQRSArea(leadI);
      const qrsAreaIII = this.calculateQRSArea(leadIII);

      // Use hexaxial reference system
      // Lead I is at 0°, Lead III is at +120°
      const qrsAngle = Math.atan2(qrsAreaIII * 2 / Math.sqrt(3), qrsAreaI + qrsAreaIII / 2);
      qrsAxis = (qrsAngle * 180) / Math.PI;

      // Normalize to -180 to +180
      if (qrsAxis > 180) qrsAxis -= 360;
      if (qrsAxis < -180) qrsAxis += 360;

      // Classify axis deviation
      if (qrsAxis >= -30 && qrsAxis <= 90) {
        axisDeviation = 'normal';
      } else if (qrsAxis < -30 && qrsAxis >= -90) {
        axisDeviation = 'left';
      } else if (qrsAxis > 90 && qrsAxis <= 180) {
        axisDeviation = 'right';
      } else {
        axisDeviation = 'extreme';
      }

      // Calculate P wave axis
      const pAreaI = this.calculatePWaveArea(leadI);
      const pAreaIII = this.calculatePWaveArea(leadIII);
      if (pAreaI !== null && pAreaIII !== null) {
        const pAngle = Math.atan2(pAreaIII * 2 / Math.sqrt(3), pAreaI + pAreaIII / 2);
        pAxis = (pAngle * 180) / Math.PI;
        if (pAxis > 180) pAxis -= 360;
        if (pAxis < -180) pAxis += 360;
      }

      // Calculate T wave axis
      const tAreaI = this.calculateTWaveArea(leadI);
      const tAreaIII = this.calculateTWaveArea(leadIII);
      if (tAreaI !== null && tAreaIII !== null) {
        const tAngle = Math.atan2(tAreaIII * 2 / Math.sqrt(3), tAreaI + tAreaIII / 2);
        tAxis = (tAngle * 180) / Math.PI;
        if (tAxis > 180) tAxis -= 360;
        if (tAxis < -180) tAxis += 360;
      }
    }

    return {
      qrsAxis,
      pAxis,
      tAxis,
      axisDeviation,
    };
  }

  /**
   * Calculate QRS area (integral)
   */
  private calculateQRSArea(samples: number[]): number {
    // Find R peaks and calculate area around them
    const rPeaks = this.detectRPeaks(samples);
    if (rPeaks.length === 0) return 0;

    let totalArea = 0;
    for (const rIdx of rPeaks) {
      const start = Math.max(0, rIdx - Math.floor(this.sampleRate * 0.06));
      const end = Math.min(samples.length, rIdx + Math.floor(this.sampleRate * 0.06));

      let area = 0;
      for (let i = start; i < end; i++) {
        area += samples[i];
      }
      totalArea += area;
    }

    return totalArea / rPeaks.length;
  }

  /**
   * Calculate P wave area for axis calculation
   * P wave is found 150-300ms before R peak
   */
  private calculatePWaveArea(samples: number[]): number | null {
    const rPeaks = this.detectRPeaks(samples);
    if (rPeaks.length < 2) return null;

    let totalArea = 0;
    let validCount = 0;

    for (let i = 1; i < rPeaks.length; i++) {
      const rIdx = rPeaks[i];
      // P wave window: 150-300ms before R peak
      const pStart = Math.max(0, rIdx - Math.floor(this.sampleRate * 0.3));
      const pEnd = rIdx - Math.floor(this.sampleRate * 0.15);

      if (pEnd <= pStart) continue;

      // Calculate baseline from samples just before P wave
      const baselineStart = Math.max(0, pStart - Math.floor(this.sampleRate * 0.05));
      const baselineSamples = samples.slice(baselineStart, pStart);
      const baseline = baselineSamples.length > 0
        ? baselineSamples.reduce((a, b) => a + b, 0) / baselineSamples.length
        : 0;

      // Calculate P wave area relative to baseline
      let area = 0;
      for (let j = pStart; j < pEnd; j++) {
        area += samples[j] - baseline;
      }
      totalArea += area;
      validCount++;
    }

    return validCount > 0 ? totalArea / validCount : null;
  }

  /**
   * Calculate T wave area for axis calculation
   * T wave is found 200-400ms after S point
   */
  private calculateTWaveArea(samples: number[]): number | null {
    const rPeaks = this.detectRPeaks(samples);
    if (rPeaks.length === 0) return null;

    let totalArea = 0;
    let validCount = 0;

    for (const rIdx of rPeaks) {
      // Find S point (minimum after R within 100ms)
      const sSearchEnd = Math.min(samples.length, rIdx + Math.floor(this.sampleRate * 0.1));
      const sRegion = samples.slice(rIdx, sSearchEnd);
      const sOffset = sRegion.indexOf(Math.min(...sRegion));
      const sIdx = rIdx + sOffset;

      // T wave window: 100-350ms after S point
      const tStart = sIdx + Math.floor(this.sampleRate * 0.1);
      const tEnd = Math.min(samples.length, sIdx + Math.floor(this.sampleRate * 0.35));

      if (tEnd <= tStart || tStart >= samples.length) continue;

      // Calculate baseline from PR segment
      const baselineStart = Math.max(0, rIdx - Math.floor(this.sampleRate * 0.2));
      const baselineEnd = rIdx - Math.floor(this.sampleRate * 0.15);
      const baselineSamples = samples.slice(baselineStart, baselineEnd);
      const baseline = baselineSamples.length > 0
        ? baselineSamples.reduce((a, b) => a + b, 0) / baselineSamples.length
        : 0;

      // Calculate T wave area relative to baseline
      let area = 0;
      for (let j = tStart; j < tEnd; j++) {
        area += samples[j] - baseline;
      }
      totalArea += area;
      validCount++;
    }

    return validCount > 0 ? totalArea / validCount : null;
  }

  /**
   * Analyze QRS morphology for all leads
   */
  private analyzeQRSMorphology(
    _fiducials: ReturnType<ClinicalParameterExtractor['detectFiducialPoints']>
  ): Partial<Record<LeadName, QRSMorphology>> {
    const morphology: Partial<Record<LeadName, QRSMorphology>> = {};

    for (const [leadName, samples] of Object.entries(this.leads) as [LeadName, number[]][]) {
      if (!samples || samples.length < this.sampleRate) continue;

      const rPeaks = this.detectRPeaks(samples);
      if (rPeaks.length === 0) continue;

      // Analyze first complete QRS
      const rIdx = rPeaks[Math.floor(rPeaks.length / 2)];
      const windowStart = Math.max(0, rIdx - Math.floor(this.sampleRate * 0.1));
      const windowEnd = Math.min(samples.length, rIdx + Math.floor(this.sampleRate * 0.1));
      const qrsWindow = samples.slice(windowStart, windowEnd);

      // Find Q, R, S amplitudes
      const rAmp = samples[rIdx] / 1000; // Convert to mV
      const localMin = Math.min(...qrsWindow) / 1000;

      // Determine Q vs S based on position relative to R
      const minIdx = qrsWindow.indexOf(Math.min(...qrsWindow));
      const rLocalIdx = rIdx - windowStart;

      let qAmp: number | null = null;
      let sAmp: number | null = null;

      if (minIdx < rLocalIdx) {
        qAmp = localMin;
      } else {
        sAmp = localMin;
      }

      // Determine pattern
      let pattern = '';
      if (rAmp > 0) pattern += rAmp > 0.5 ? 'R' : 'r';
      if (sAmp !== null && sAmp < -0.1) pattern += Math.abs(sAmp) > 0.5 ? 'S' : 's';
      if (qAmp !== null && qAmp < -0.1) pattern = (Math.abs(qAmp) > 0.3 ? 'Q' : 'q') + pattern;
      if (!pattern) pattern = 'rs';

      morphology[leadName] = {
        lead: leadName,
        qAmplitude: qAmp,
        qDuration: null,
        rAmplitude: rAmp,
        rPrimeAmplitude: null,
        sAmplitude: sAmp,
        sPrimeAmplitude: null,
        pattern,
      };
    }

    return morphology;
  }

  /**
   * Analyze ST segments
   */
  private analyzeSTSegments(
    _fiducials: ReturnType<ClinicalParameterExtractor['detectFiducialPoints']>
  ): Partial<Record<LeadName, STAnalysis>> {
    const stAnalysis: Partial<Record<LeadName, STAnalysis>> = {};

    for (const [leadName, samples] of Object.entries(this.leads) as [LeadName, number[]][]) {
      if (!samples || samples.length < this.sampleRate) continue;

      const rPeaks = this.detectRPeaks(samples);
      if (rPeaks.length === 0) continue;

      // Measure ST deviation at J point + 60-80ms
      const stDeviations: number[] = [];
      const stSlopes: number[] = [];

      for (const rIdx of rPeaks) {
        // Find S point
        const sSearchEnd = Math.min(samples.length, rIdx + Math.floor(this.sampleRate * 0.08));
        const sRegion = samples.slice(rIdx, sSearchEnd);
        const sOffset = sRegion.indexOf(Math.min(...sRegion));
        const sIdx = rIdx + sOffset;

        // J point is at S point
        // Measure 60-80ms after J point
        const stMeasurePoint = sIdx + Math.floor(this.sampleRate * 0.06);
        const stMeasureEnd = sIdx + Math.floor(this.sampleRate * 0.08);

        if (stMeasureEnd < samples.length) {
          // Calculate baseline (PR segment or beginning of window)
          const baseline = this.calculateBaseline(samples, rIdx);

          // ST deviation
          const stValue = samples[stMeasurePoint];
          stDeviations.push((stValue - baseline) / 1000); // mV

          // ST slope
          const stStart = samples[sIdx + Math.floor(this.sampleRate * 0.02)];
          const stEnd = samples[stMeasureEnd];
          stSlopes.push(stEnd - stStart);
        }
      }

      if (stDeviations.length === 0) continue;

      const avgDeviation = stDeviations.reduce((a, b) => a + b, 0) / stDeviations.length;
      const avgSlope = stSlopes.reduce((a, b) => a + b, 0) / stSlopes.length;

      // Classify ST
      let stMorphology: STAnalysis['stMorphology'] = 'normal';
      let significance: STAnalysis['significance'] = 'normal';

      if (avgDeviation > 0.1) {
        stMorphology = 'elevated';
        significance = avgDeviation > 0.2 ? 'stemi_equivalent' : 'ischemic';
      } else if (avgDeviation < -0.1) {
        stMorphology = 'depressed';
        significance = avgDeviation < -0.2 ? 'ischemic' : 'nonspecific';
      }

      let stSlope: STAnalysis['stSlope'] = 'horizontal';
      if (avgSlope > 50) stSlope = 'upsloping';
      else if (avgSlope < -50) stSlope = 'downsloping';

      stAnalysis[leadName] = {
        lead: leadName,
        stDeviation: avgDeviation,
        stSlope,
        stMorphology,
        significance,
      };
    }

    return stAnalysis;
  }

  /**
   * Calculate baseline from PR segment
   */
  private calculateBaseline(samples: number[], rIdx: number): number {
    // Use samples 150-200ms before R peak (PR segment)
    const start = Math.max(0, rIdx - Math.floor(this.sampleRate * 0.2));
    const end = rIdx - Math.floor(this.sampleRate * 0.15);

    if (end <= start) return 0;

    const segment = samples.slice(start, end);
    return segment.reduce((a, b) => a + b, 0) / segment.length;
  }

  /**
   * Classify rhythm
   */
  private classifyRhythm(
    fiducials: ReturnType<ClinicalParameterExtractor['detectFiducialPoints']>,
    intervals: ECGIntervals
  ): { classification: string; regular: boolean; description: string } {
    const { rPeaks, pPeaks } = fiducials;
    const { heartRate, rrVariability } = intervals;

    // Check regularity
    const regular = rrVariability < 100; // Less than 100ms variation

    // Basic rhythm classification
    let classification = 'Unknown';
    let description = '';

    if (heartRate >= 60 && heartRate <= 100) {
      if (pPeaks.length > 0 && regular) {
        classification = 'Normal Sinus Rhythm';
        description = 'Regular rhythm with P waves, HR 60-100 bpm';
      } else if (regular) {
        classification = 'Regular Rhythm';
        description = 'Regular rhythm, P waves not clearly identified';
      }
    } else if (heartRate < 60) {
      if (regular) {
        classification = 'Sinus Bradycardia';
        description = `Regular rhythm, HR ${heartRate.toFixed(0)} bpm (slow)`;
      } else {
        classification = 'Bradycardia with Irregular Rhythm';
        description = 'Slow, irregular rhythm';
      }
    } else if (heartRate > 100) {
      if (regular) {
        classification = 'Sinus Tachycardia';
        description = `Regular rhythm, HR ${heartRate.toFixed(0)} bpm (fast)`;
      } else {
        classification = 'Tachycardia with Irregular Rhythm';
        description = 'Fast, irregular rhythm (consider AFib if very irregular)';
      }
    }

    // Check for atrial fibrillation (highly irregular with no clear P waves)
    if (!regular && rrVariability > 150 && pPeaks.length < rPeaks.length * 0.5) {
      classification = 'Possible Atrial Fibrillation';
      description = 'Irregularly irregular rhythm without clear P waves';
    }

    return { classification, regular, description };
  }

  /**
   * Calculate confidence in measurements
   */
  private calculateConfidence(
    fiducials: ReturnType<ClinicalParameterExtractor['detectFiducialPoints']>,
    intervals: ECGIntervals
  ): number {
    let confidence = 1.0;

    // Reduce confidence if few R peaks detected
    if (fiducials.rPeaks.length < 3) confidence *= 0.5;
    else if (fiducials.rPeaks.length < 5) confidence *= 0.7;

    // Reduce confidence if physiologically implausible values
    if (intervals.heartRate < 30 || intervals.heartRate > 250) confidence *= 0.3;
    if (intervals.qrsDuration < 60 || intervals.qrsDuration > 200) confidence *= 0.7;

    // Reduce confidence if P waves not detected
    if (fiducials.pPeaks.length === 0) confidence *= 0.8;

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Create empty result for failed analysis
   */
  private createEmptyResult(reason: string): ClinicalParameters {
    return {
      intervals: {
        heartRate: 0,
        rrInterval: 0,
        rrVariability: 0,
        prInterval: null,
        qrsDuration: 0,
        qtInterval: null,
        qtcBazett: null,
        qtcFridericia: null,
        pWaveDuration: null,
        tWaveDuration: null,
      },
      axis: {
        qrsAxis: 0,
        pAxis: null,
        tAxis: null,
        axisDeviation: 'indeterminate',
      },
      qrsMorphology: {},
      stAnalysis: {},
      rhythm: {
        classification: 'Unknown',
        regular: false,
        description: reason,
      },
      confidence: 0,
      warnings: [reason],
    };
  }
}

/**
 * Convenience function to extract clinical parameters
 */
export function extractClinicalParameters(
  leads: Partial<Record<LeadName, number[]>>,
  sampleRate: number
): ClinicalParameters {
  const extractor = new ClinicalParameterExtractor(leads, sampleRate);
  return extractor.extract();
}
