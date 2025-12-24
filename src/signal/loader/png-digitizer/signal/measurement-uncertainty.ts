/**
 * Measurement Uncertainty Quantification
 *
 * Every ECG measurement should have an associated uncertainty/confidence interval.
 * This module provides:
 *
 * 1. Error propagation from digitization quality
 * 2. Fiducial point detection uncertainty
 * 3. Inter-beat variability
 * 4. Multiple QTc correction formulas
 * 5. Confidence intervals for all measurements
 *
 * Based on:
 * - AHA/ACC/HRS recommendations for ECG standardization
 * - CSE (Common Standards for Electrocardiography) tolerances
 * - GUM (Guide to Expression of Uncertainty in Measurement)
 *
 * @module signal/loader/png-digitizer/signal/measurement-uncertainty
 */

import type { BeatAnnotation } from './fiducial-detector';
import { pearsonCorrelation as pearsonCorr } from './utils';

// ============================================================================
// Types
// ============================================================================

/**
 * A measurement with uncertainty
 */
export interface MeasurementWithUncertainty {
  /** Measured value */
  value: number;
  /** Standard uncertainty (1 sigma) */
  uncertainty: number;
  /** 95% confidence interval lower bound */
  ci95Lower: number;
  /** 95% confidence interval upper bound */
  ci95Upper: number;
  /** Unit of measurement */
  unit: string;
  /** Measurement method */
  method: string;
  /** Quality grade (A, B, C, D, F) */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Number of beats used for measurement */
  beatCount: number;
}

/**
 * QTc calculation with multiple formulas
 */
export interface QTcMeasurement {
  /** QT interval (ms) */
  qt: MeasurementWithUncertainty;
  /** RR interval used for correction (ms) */
  rr: number;
  /** Heart rate (bpm) */
  heartRate: number;
  /** Bazett corrected QTc */
  bazett: MeasurementWithUncertainty;
  /** Fridericia corrected QTc */
  fridericia: MeasurementWithUncertainty;
  /** Framingham corrected QTc */
  framingham: MeasurementWithUncertainty;
  /** Hodges corrected QTc */
  hodges: MeasurementWithUncertainty;
  /** Recommended formula based on heart rate */
  recommended: {
    formula: 'bazett' | 'fridericia' | 'framingham' | 'hodges';
    value: MeasurementWithUncertainty;
    reason: string;
  };
}

/**
 * Complete interval measurements with uncertainty
 */
export interface IntervalMeasurements {
  /** PR interval */
  pr: MeasurementWithUncertainty | null;
  /** QRS duration */
  qrs: MeasurementWithUncertainty;
  /** QT interval */
  qt: MeasurementWithUncertainty | null;
  /** QTc with multiple formulas */
  qtc: QTcMeasurement | null;
  /** RR interval */
  rr: MeasurementWithUncertainty;
  /** Heart rate */
  heartRate: MeasurementWithUncertainty;
  /** JT interval (QT - QRS) */
  jt: MeasurementWithUncertainty | null;
  /** Tpeak-Tend interval */
  tPeakTEnd: MeasurementWithUncertainty | null;
}

/**
 * Error sources for uncertainty propagation
 */
export interface ErrorSources {
  /** Digitization error (from pixel resolution) */
  digitizationError: number;
  /** Fiducial detection error (from algorithm) */
  fiducialError: number;
  /** Beat-to-beat variability */
  interBeatVariability: number;
  /** Calibration uncertainty */
  calibrationError: number;
  /** Total combined uncertainty */
  combinedUncertainty: number;
}

/**
 * Averaged beat for measurements
 */
export interface AveragedBeat {
  /** Signal-averaged waveform (µV) */
  waveform: number[];
  /** Number of beats averaged */
  beatCount: number;
  /** Correlation of each beat to template */
  beatCorrelations: number[];
  /** Beats excluded from averaging */
  excludedBeats: number[];
  /** Average fiducial points */
  fiducials: {
    pOnset?: number;
    pPeak?: number;
    pOffset?: number;
    qrsOnset: number;
    rPeak: number;
    qrsOffset: number;
    tPeak?: number;
    tOffset?: number;
  };
  /** Quality score (0-1) */
  quality: number;
}

// ============================================================================
// QTc Formulas
// ============================================================================

/**
 * QTc correction formulas
 *
 * All formulas take QT in ms and RR in ms, return QTc in ms
 */
export const QTcFormulas = {
  /**
   * Bazett formula (1920)
   * QTc = QT / sqrt(RR/1000)
   *
   * Most commonly used but overcorrects at high HR, undercorrects at low HR
   */
  bazett: (qt: number, rr: number): number => {
    if (rr <= 0) return qt;
    return qt / Math.sqrt(rr / 1000);
  },

  /**
   * Fridericia formula (1920)
   * QTc = QT / (RR/1000)^(1/3)
   *
   * Better than Bazett at extreme heart rates
   * Recommended by FDA for drug studies
   */
  fridericia: (qt: number, rr: number): number => {
    if (rr <= 0) return qt;
    return qt / Math.pow(rr / 1000, 1 / 3);
  },

  /**
   * Framingham formula (1992)
   * QTc = QT + 0.154 * (1000 - RR)
   *
   * Linear correction, derived from Framingham Heart Study
   */
  framingham: (qt: number, rr: number): number => {
    return qt + 0.154 * (1000 - rr);
  },

  /**
   * Hodges formula (1983)
   * QTc = QT + 1.75 * (HR - 60)
   *
   * Linear correction based on heart rate
   */
  hodges: (qt: number, rr: number): number => {
    const hr = 60000 / rr;
    return qt + 1.75 * (hr - 60);
  },

  /**
   * Rautaharju formula (2014)
   * QTc = QT - 0.185 * (RR - 1000) + k
   * where k = 6ms for males, 0ms for females
   *
   * Sex-specific linear correction
   */
  rautaharju: (qt: number, rr: number, isMale: boolean = true): number => {
    const k = isMale ? 6 : 0;
    return qt - 0.185 * (rr - 1000) + k;
  },

  /**
   * Select best formula based on heart rate
   */
  selectBest: (hr: number): 'bazett' | 'fridericia' | 'framingham' | 'hodges' => {
    // Bazett works well at normal HR (60-100 bpm)
    // Fridericia is better at extremes
    if (hr >= 60 && hr <= 90) {
      return 'bazett';
    } else if (hr < 50 || hr > 100) {
      return 'fridericia';
    } else {
      return 'framingham';
    }
  },
};

// ============================================================================
// Uncertainty Calculator
// ============================================================================

export class MeasurementUncertaintyCalculator {
  private sampleRate: number;
  private pixelsPerMm: number;
  private paperSpeed: number; // mm/s

  constructor(
    sampleRate: number,
    pixelsPerMm: number = 10,
    paperSpeed: number = 25,
    _gain: number = 10
  ) {
    this.sampleRate = sampleRate;
    this.pixelsPerMm = pixelsPerMm;
    this.paperSpeed = paperSpeed;
  }

  /**
   * Calculate complete interval measurements with uncertainty
   */
  calculateIntervals(
    beatAnnotations: BeatAnnotation[],
    _leadData: number[]
  ): IntervalMeasurements {
    // Filter to good quality beats
    const goodBeats = beatAnnotations.filter(b => b.quality > 0.5);

    if (goodBeats.length === 0) {
      return this.emptyIntervals();
    }

    // Calculate each interval with uncertainty
    const pr = this.calculatePRInterval(goodBeats);
    const qrs = this.calculateQRSDuration(goodBeats);
    const rr = this.calculateRRInterval(goodBeats);
    const qt = this.calculateQTInterval(goodBeats);
    const heartRate = this.calculateHeartRate(goodBeats);
    const qtc = qt && rr ? this.calculateQTc(qt, rr, heartRate) : null;
    const jt = qt && qrs ? this.calculateJTInterval(qt, qrs) : null;
    const tPeakTEnd = this.calculateTpeakTend(goodBeats);

    return {
      pr,
      qrs,
      qt,
      qtc,
      rr,
      heartRate,
      jt,
      tPeakTEnd,
    };
  }

  /**
   * Create averaged beat for reliable measurements
   */
  createAveragedBeat(
    signal: number[],
    beatAnnotations: BeatAnnotation[],
    windowMs: number = 600
  ): AveragedBeat {
    const windowSamples = Math.round((windowMs / 1000) * this.sampleRate);
    const halfWindow = Math.floor(windowSamples / 2);

    // Filter good quality normal beats
    const normalBeats = beatAnnotations.filter(b =>
      b.quality > 0.6 &&
      b.qrsDuration < 120 &&
      b.rrInterval !== null &&
      b.rrInterval > 500 &&
      b.rrInterval < 1500
    );

    if (normalBeats.length < 3) {
      return this.emptyAveragedBeat(windowSamples);
    }

    // Extract aligned beat segments
    const segments: number[][] = [];
    const correlations: number[] = [];

    for (const beat of normalBeats) {
      const rPeak = beat.qrs.rPeak.index;
      const start = Math.max(0, rPeak - halfWindow);
      const end = Math.min(signal.length, rPeak + halfWindow);

      if (end - start < windowSamples * 0.8) continue;

      const segment = signal.slice(start, end);

      // Normalize amplitude
      const max = Math.max(...segment);
      const min = Math.min(...segment);
      if (max - min < 100) continue;

      const normalized = segment.map(v => (v - min) / (max - min));
      segments.push(normalized);
    }

    if (segments.length < 3) {
      return this.emptyAveragedBeat(windowSamples);
    }

    // Create initial template from first segment
    const template = [...segments[0]];
    const minLength = Math.min(...segments.map(s => s.length));

    // Calculate correlations and select beats
    const selectedIndices: number[] = [];
    const excludedIndices: number[] = [];

    for (let i = 0; i < segments.length; i++) {
      const corr = this.pearsonCorrelation(
        template.slice(0, minLength),
        segments[i].slice(0, minLength)
      );
      correlations.push(corr);

      if (corr > 0.9) {
        selectedIndices.push(i);
      } else {
        excludedIndices.push(i);
      }
    }

    if (selectedIndices.length < 3) {
      // Use all beats if not enough pass correlation threshold
      selectedIndices.push(...excludedIndices);
      excludedIndices.length = 0;
    }

    // Average selected segments
    const avgWaveform = new Array(minLength).fill(0);
    for (const idx of selectedIndices) {
      for (let i = 0; i < minLength; i++) {
        avgWaveform[i] += segments[idx][i];
      }
    }
    for (let i = 0; i < minLength; i++) {
      avgWaveform[i] /= selectedIndices.length;
    }

    // Detect fiducials on averaged beat
    const fiducials = this.detectFiducialsOnAveraged(avgWaveform, halfWindow);

    // Calculate quality
    const avgCorr = selectedIndices.reduce((sum, idx) => sum + correlations[idx], 0) / selectedIndices.length;
    const quality = Math.min(1, avgCorr * (selectedIndices.length / segments.length));

    return {
      waveform: avgWaveform,
      beatCount: selectedIndices.length,
      beatCorrelations: correlations,
      excludedBeats: excludedIndices,
      fiducials,
      quality,
    };
  }

  /**
   * Calculate PR interval with uncertainty
   */
  private calculatePRInterval(beats: BeatAnnotation[]): MeasurementWithUncertainty | null {
    const prValues = beats
      .filter(b => b.prInterval !== null && b.prInterval > 80 && b.prInterval < 400)
      .map(b => b.prInterval!);

    if (prValues.length < 3) return null;

    return this.createMeasurement(prValues, 'ms', 'PR interval from P onset to QRS onset');
  }

  /**
   * Calculate QRS duration with uncertainty
   */
  private calculateQRSDuration(beats: BeatAnnotation[]): MeasurementWithUncertainty {
    const qrsValues = beats
      .filter(b => b.qrsDuration > 40 && b.qrsDuration < 200)
      .map(b => b.qrsDuration);

    if (qrsValues.length === 0) {
      return {
        value: 0,
        uncertainty: 0,
        ci95Lower: 0,
        ci95Upper: 0,
        unit: 'ms',
        method: 'QRS duration',
        grade: 'F',
        beatCount: 0,
      };
    }

    return this.createMeasurement(qrsValues, 'ms', 'QRS duration from onset to J-point');
  }

  /**
   * Calculate QT interval with uncertainty
   */
  private calculateQTInterval(beats: BeatAnnotation[]): MeasurementWithUncertainty | null {
    const qtValues = beats
      .filter(b => b.qtInterval !== null && b.qtInterval > 200 && b.qtInterval < 700)
      .map(b => b.qtInterval!);

    if (qtValues.length < 3) return null;

    return this.createMeasurement(qtValues, 'ms', 'QT interval from QRS onset to T offset');
  }

  /**
   * Calculate RR interval with uncertainty
   */
  private calculateRRInterval(beats: BeatAnnotation[]): MeasurementWithUncertainty {
    const rrValues = beats
      .filter(b => b.rrInterval !== null && b.rrInterval > 300 && b.rrInterval < 2000)
      .map(b => b.rrInterval!);

    if (rrValues.length === 0) {
      return {
        value: 800, // Default 75 bpm
        uncertainty: 100,
        ci95Lower: 600,
        ci95Upper: 1000,
        unit: 'ms',
        method: 'RR interval',
        grade: 'F',
        beatCount: 0,
      };
    }

    return this.createMeasurement(rrValues, 'ms', 'RR interval between successive R peaks');
  }

  /**
   * Calculate heart rate with uncertainty
   */
  private calculateHeartRate(beats: BeatAnnotation[]): MeasurementWithUncertainty {
    const rrValues = beats
      .filter(b => b.rrInterval !== null && b.rrInterval > 300 && b.rrInterval < 2000)
      .map(b => b.rrInterval!);

    if (rrValues.length === 0) {
      return {
        value: 75,
        uncertainty: 10,
        ci95Lower: 55,
        ci95Upper: 95,
        unit: 'bpm',
        method: 'Heart rate from RR intervals',
        grade: 'F',
        beatCount: 0,
      };
    }

    const hrValues = rrValues.map(rr => 60000 / rr);
    return this.createMeasurement(hrValues, 'bpm', 'Heart rate from RR intervals');
  }

  /**
   * Calculate QTc with multiple formulas
   */
  private calculateQTc(
    qt: MeasurementWithUncertainty,
    rr: MeasurementWithUncertainty,
    hr: MeasurementWithUncertainty
  ): QTcMeasurement {
    const rrMs = rr.value;

    // Calculate each formula
    const bazettValue = QTcFormulas.bazett(qt.value, rrMs);
    const fridericiaValue = QTcFormulas.fridericia(qt.value, rrMs);
    const framinghamValue = QTcFormulas.framingham(qt.value, rrMs);
    const hodgesValue = QTcFormulas.hodges(qt.value, rrMs);

    // Propagate uncertainty through each formula
    const bazett = this.propagateQTcUncertainty(qt, rr, 'bazett', bazettValue);
    const fridericia = this.propagateQTcUncertainty(qt, rr, 'fridericia', fridericiaValue);
    const framingham = this.propagateQTcUncertainty(qt, rr, 'framingham', framinghamValue);
    const hodges = this.propagateQTcUncertainty(qt, rr, 'hodges', hodgesValue);

    // Select recommended formula
    const recommendedFormula = QTcFormulas.selectBest(hr.value);
    const recommendedMeasurement =
      recommendedFormula === 'bazett' ? bazett :
      recommendedFormula === 'fridericia' ? fridericia :
      recommendedFormula === 'framingham' ? framingham : hodges;

    let reason: string;
    if (hr.value < 50) {
      reason = 'Fridericia recommended for bradycardia (avoids Bazett overcorrection)';
    } else if (hr.value > 100) {
      reason = 'Fridericia recommended for tachycardia (avoids Bazett undercorrection)';
    } else {
      reason = 'Bazett acceptable at normal heart rate (60-100 bpm)';
    }

    return {
      qt,
      rr: rrMs,
      heartRate: hr.value,
      bazett,
      fridericia,
      framingham,
      hodges,
      recommended: {
        formula: recommendedFormula,
        value: recommendedMeasurement,
        reason,
      },
    };
  }

  /**
   * Propagate uncertainty through QTc formula
   */
  private propagateQTcUncertainty(
    qt: MeasurementWithUncertainty,
    rr: MeasurementWithUncertainty,
    formula: 'bazett' | 'fridericia' | 'framingham' | 'hodges',
    value: number
  ): MeasurementWithUncertainty {
    // Use numerical differentiation for error propagation
    const deltaQT = 1; // 1 ms perturbation
    const deltaRR = 1;

    const qtUp = QTcFormulas[formula](qt.value + deltaQT, rr.value);
    const qtDown = QTcFormulas[formula](qt.value - deltaQT, rr.value);
    const dQTcdQT = (qtUp - qtDown) / (2 * deltaQT);

    const rrUp = QTcFormulas[formula](qt.value, rr.value + deltaRR);
    const rrDown = QTcFormulas[formula](qt.value, rr.value - deltaRR);
    const dQTcdRR = (rrUp - rrDown) / (2 * deltaRR);

    // Combined uncertainty (assuming independence)
    const uncertainty = Math.sqrt(
      Math.pow(dQTcdQT * qt.uncertainty, 2) +
      Math.pow(dQTcdRR * rr.uncertainty, 2)
    );

    const formulaName =
      formula === 'bazett' ? 'Bazett' :
      formula === 'fridericia' ? 'Fridericia' :
      formula === 'framingham' ? 'Framingham' : 'Hodges';

    return {
      value,
      uncertainty,
      ci95Lower: value - 1.96 * uncertainty,
      ci95Upper: value + 1.96 * uncertainty,
      unit: 'ms',
      method: `QTc (${formulaName} formula)`,
      grade: this.gradeFromUncertainty(uncertainty, 20),
      beatCount: qt.beatCount,
    };
  }

  /**
   * Calculate JT interval
   */
  private calculateJTInterval(
    qt: MeasurementWithUncertainty,
    qrs: MeasurementWithUncertainty
  ): MeasurementWithUncertainty {
    const value = qt.value - qrs.value;
    const uncertainty = Math.sqrt(
      Math.pow(qt.uncertainty, 2) +
      Math.pow(qrs.uncertainty, 2)
    );

    return {
      value,
      uncertainty,
      ci95Lower: value - 1.96 * uncertainty,
      ci95Upper: value + 1.96 * uncertainty,
      unit: 'ms',
      method: 'JT interval (QT - QRS)',
      grade: this.gradeFromUncertainty(uncertainty, 15),
      beatCount: Math.min(qt.beatCount, qrs.beatCount),
    };
  }

  /**
   * Calculate Tpeak-Tend interval
   */
  private calculateTpeakTend(beats: BeatAnnotation[]): MeasurementWithUncertainty | null {
    const tptValues = beats
      .filter(b => b.tWave.present && b.tWave.tPeakTEnd !== undefined)
      .map(b => b.tWave.tPeakTEnd!);

    if (tptValues.length < 3) return null;

    return this.createMeasurement(tptValues, 'ms', 'Tpeak-Tend interval');
  }

  /**
   * Create measurement with uncertainty from array of values
   */
  private createMeasurement(
    values: number[],
    unit: string,
    method: string
  ): MeasurementWithUncertainty {
    const n = values.length;

    // Use median for robustness
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(n / 2)];

    // Use MAD (median absolute deviation) for robust spread estimate
    const deviations = values.map(v => Math.abs(v - median));
    const mad = [...deviations].sort((a, b) => a - b)[Math.floor(n / 2)];
    const robustSD = mad * 1.4826; // Scale factor for normal distribution

    // Standard error of the median
    const se = robustSD / Math.sqrt(n);

    // Add systematic uncertainty from digitization
    const digitizationUncertainty = this.getDigitizationUncertainty();
    const fiducialUncertainty = this.getFiducialUncertainty();

    // Combined uncertainty
    const combinedUncertainty = Math.sqrt(
      Math.pow(se, 2) +
      Math.pow(digitizationUncertainty, 2) +
      Math.pow(fiducialUncertainty, 2)
    );

    return {
      value: median,
      uncertainty: combinedUncertainty,
      ci95Lower: median - 1.96 * combinedUncertainty,
      ci95Upper: median + 1.96 * combinedUncertainty,
      unit,
      method,
      grade: this.gradeFromUncertainty(combinedUncertainty, this.getToleranceForUnit(unit)),
      beatCount: n,
    };
  }

  /**
   * Get digitization uncertainty based on pixel resolution
   */
  private getDigitizationUncertainty(): number {
    // 1 pixel uncertainty at paper speed
    const msPerPixel = 1000 / (this.paperSpeed * this.pixelsPerMm);
    return msPerPixel * 1.5; // 1.5 pixels uncertainty
  }

  /**
   * Get fiducial detection uncertainty
   */
  private getFiducialUncertainty(): number {
    // Typical fiducial detection algorithm uncertainty
    const samplesUncertainty = 3; // ±3 samples typical
    return (samplesUncertainty / this.sampleRate) * 1000;
  }

  /**
   * Get tolerance for grading based on unit
   */
  private getToleranceForUnit(unit: string): number {
    switch (unit) {
      case 'ms': return 10; // 10ms is good tolerance for intervals
      case 'bpm': return 3; // 3 bpm for heart rate
      case 'µV': return 50; // 50 µV for amplitude
      default: return 10;
    }
  }

  /**
   * Grade based on uncertainty relative to tolerance
   */
  private gradeFromUncertainty(uncertainty: number, tolerance: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    const ratio = uncertainty / tolerance;
    if (ratio < 0.5) return 'A';
    if (ratio < 1.0) return 'B';
    if (ratio < 1.5) return 'C';
    if (ratio < 2.0) return 'D';
    return 'F';
  }

  /**
   * Pearson correlation coefficient (delegated to utility)
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    return pearsonCorr(x, y);
  }

  /**
   * Detect fiducials on averaged beat
   */
  private detectFiducialsOnAveraged(
    waveform: number[],
    centerIdx: number
  ): AveragedBeat['fiducials'] {
    const n = waveform.length;

    // R peak should be near center
    let rPeak = centerIdx;
    let maxVal = waveform[centerIdx];
    for (let i = Math.max(0, centerIdx - 20); i < Math.min(n, centerIdx + 20); i++) {
      if (waveform[i] > maxVal) {
        maxVal = waveform[i];
        rPeak = i;
      }
    }

    // QRS onset: look backward for first inflection
    let qrsOnset = rPeak;
    for (let i = rPeak - 1; i > Math.max(0, rPeak - 50); i--) {
      const slope = Math.abs(waveform[i] - waveform[i - 1]);
      if (slope < maxVal * 0.02) {
        qrsOnset = i;
        break;
      }
    }

    // QRS offset (J-point): look forward for first flat
    let qrsOffset = rPeak;
    for (let i = rPeak + 1; i < Math.min(n - 1, rPeak + 50); i++) {
      const slope = Math.abs(waveform[i + 1] - waveform[i]);
      if (slope < maxVal * 0.02) {
        qrsOffset = i;
        break;
      }
    }

    // T peak: look in window after QRS
    let tPeak: number | undefined;
    const tSearchStart = qrsOffset + 10;
    const tSearchEnd = Math.min(n - 1, qrsOffset + 150);
    if (tSearchEnd > tSearchStart) {
      let tMax = waveform[tSearchStart];
      tPeak = tSearchStart;
      for (let i = tSearchStart; i < tSearchEnd; i++) {
        if (waveform[i] > tMax) {
          tMax = waveform[i];
          tPeak = i;
        }
      }
    }

    // T offset: baseline after T peak
    let tOffset: number | undefined;
    if (tPeak !== undefined) {
      const baseline = (waveform[qrsOffset] + waveform[Math.min(n - 1, qrsOffset + 200)]) / 2;
      for (let i = tPeak + 1; i < Math.min(n - 1, tPeak + 100); i++) {
        if (Math.abs(waveform[i] - baseline) < Math.abs(waveform[tPeak] - baseline) * 0.1) {
          tOffset = i;
          break;
        }
      }
    }

    // P wave: look before QRS
    let pPeak: number | undefined;
    let pOnset: number | undefined;
    let pOffset: number | undefined;
    const pSearchEnd = qrsOnset - 10;
    const pSearchStart = Math.max(0, qrsOnset - 100);
    if (pSearchEnd > pSearchStart) {
      let pMax = waveform[pSearchStart];
      pPeak = pSearchStart;
      for (let i = pSearchStart; i < pSearchEnd; i++) {
        if (waveform[i] > pMax) {
          pMax = waveform[i];
          pPeak = i;
        }
      }

      // Only accept if there's a visible P wave
      const baseline = waveform[pSearchStart];
      if (pMax - baseline > maxVal * 0.05) {
        pOnset = pSearchStart;
        pOffset = pSearchEnd;
      } else {
        pPeak = undefined;
      }
    }

    return {
      pOnset,
      pPeak,
      pOffset,
      qrsOnset,
      rPeak,
      qrsOffset,
      tPeak,
      tOffset,
    };
  }

  /**
   * Empty intervals result
   */
  private emptyIntervals(): IntervalMeasurements {
    const emptyMeasurement: MeasurementWithUncertainty = {
      value: 0,
      uncertainty: 0,
      ci95Lower: 0,
      ci95Upper: 0,
      unit: 'ms',
      method: '',
      grade: 'F',
      beatCount: 0,
    };

    return {
      pr: null,
      qrs: emptyMeasurement,
      qt: null,
      qtc: null,
      rr: emptyMeasurement,
      heartRate: { ...emptyMeasurement, unit: 'bpm' },
      jt: null,
      tPeakTEnd: null,
    };
  }

  /**
   * Empty averaged beat
   */
  private emptyAveragedBeat(length: number): AveragedBeat {
    return {
      waveform: new Array(length).fill(0),
      beatCount: 0,
      beatCorrelations: [],
      excludedBeats: [],
      fiducials: {
        qrsOnset: Math.floor(length * 0.4),
        rPeak: Math.floor(length / 2),
        qrsOffset: Math.floor(length * 0.55),
      },
      quality: 0,
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Calculate QTc with specified formula
 */
export function calculateQTc(
  qtMs: number,
  rrMs: number,
  formula: 'bazett' | 'fridericia' | 'framingham' | 'hodges' = 'bazett'
): number {
  return QTcFormulas[formula](qtMs, rrMs);
}

/**
 * Calculate QTc with all formulas
 */
export function calculateAllQTc(qtMs: number, rrMs: number): Record<string, number> {
  return {
    bazett: QTcFormulas.bazett(qtMs, rrMs),
    fridericia: QTcFormulas.fridericia(qtMs, rrMs),
    framingham: QTcFormulas.framingham(qtMs, rrMs),
    hodges: QTcFormulas.hodges(qtMs, rrMs),
  };
}

/**
 * Get recommended QTc formula based on heart rate
 */
export function getRecommendedQTcFormula(heartRate: number): 'bazett' | 'fridericia' | 'framingham' | 'hodges' {
  return QTcFormulas.selectBest(heartRate);
}

/**
 * Calculate intervals with uncertainty
 */
export function calculateIntervalsWithUncertainty(
  beatAnnotations: BeatAnnotation[],
  leadData: number[],
  sampleRate: number
): IntervalMeasurements {
  const calculator = new MeasurementUncertaintyCalculator(sampleRate);
  return calculator.calculateIntervals(beatAnnotations, leadData);
}

/**
 * Create averaged beat
 */
export function createAveragedBeat(
  signal: number[],
  beatAnnotations: BeatAnnotation[],
  sampleRate: number
): AveragedBeat {
  const calculator = new MeasurementUncertaintyCalculator(sampleRate);
  return calculator.createAveragedBeat(signal, beatAnnotations);
}
