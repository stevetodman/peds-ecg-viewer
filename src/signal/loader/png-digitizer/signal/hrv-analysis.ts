/**
 * Heart Rate Variability (HRV) Analysis
 *
 * Implements comprehensive HRV metrics including:
 *
 * Time Domain:
 * - SDNN: Standard deviation of NN intervals
 * - RMSSD: Root mean square of successive differences
 * - pNN50: Percentage of successive intervals differing by >50ms
 * - SDANN: Standard deviation of 5-min average NN intervals
 * - HRV triangular index
 *
 * Frequency Domain:
 * - VLF: Very low frequency power (0.003-0.04 Hz)
 * - LF: Low frequency power (0.04-0.15 Hz)
 * - HF: High frequency power (0.15-0.4 Hz)
 * - LF/HF ratio
 * - Total power
 *
 * Non-linear:
 * - SD1, SD2: Poincaré plot parameters
 * - Sample entropy
 * - Detrended fluctuation analysis (DFA)
 *
 * Reference: ESC/NASPE Task Force (1996) - Heart Rate Variability Standards
 *
 * @module signal/loader/png-digitizer/signal/hrv-analysis
 */

import {
  standardDeviation as stdDev,
  linearRegressionSlope as linRegSlope,
} from './utils';

// ============================================================================
// Types
// ============================================================================

/**
 * RR interval tachogram
 */
export interface RRTachogram {
  /** RR intervals in milliseconds */
  rrIntervals: number[];
  /** Timestamps of each R-peak (seconds from start) */
  rPeakTimes: number[];
  /** Annotation for each RR interval: 'N' = normal, 'E' = ectopic excluded */
  annotations: ('N' | 'E')[];
  /** Total duration in seconds */
  duration: number;
  /** Number of RR intervals */
  count: number;
  /** Number of intervals excluded due to ectopy */
  excludedCount: number;
}

/**
 * Time domain HRV metrics
 */
export interface TimeDomainHRV {
  /** Mean NN interval (ms) */
  meanNN: number;
  /** Standard deviation of NN intervals (ms) */
  SDNN: number;
  /** Root mean square of successive differences (ms) */
  RMSSD: number;
  /** Percentage of successive NN intervals differing by >50ms */
  pNN50: number;
  /** Percentage of successive NN intervals differing by >20ms */
  pNN20: number;
  /** Mean heart rate (bpm) */
  meanHR: number;
  /** Standard deviation of heart rate (bpm) */
  SDHR: number;
  /** Minimum heart rate (bpm) */
  minHR: number;
  /** Maximum heart rate (bpm) */
  maxHR: number;
  /** HRV triangular index */
  triangularIndex: number;
  /** TINN: Triangular interpolation of NN histogram (ms) */
  TINN: number;
  /** SDANN: SD of 5-min average NN (ms) - only for longer recordings */
  SDANN?: number;
  /** SDNN index: Mean of 5-min SDNN values */
  SDNNindex?: number;
}

/**
 * Frequency domain HRV metrics
 */
export interface FrequencyDomainHRV {
  /** Total power (ms²) */
  totalPower: number;
  /** Very low frequency power 0.003-0.04 Hz (ms²) */
  VLF: number;
  /** Low frequency power 0.04-0.15 Hz (ms²) */
  LF: number;
  /** High frequency power 0.15-0.4 Hz (ms²) */
  HF: number;
  /** LF in normalized units */
  LFnu: number;
  /** HF in normalized units */
  HFnu: number;
  /** LF/HF ratio */
  LFHFratio: number;
  /** Peak frequency in LF band (Hz) */
  LFpeak: number;
  /** Peak frequency in HF band (Hz) */
  HFpeak: number;
  /** Power spectral density array for plotting */
  psd?: { frequency: number; power: number }[];
}

/**
 * Non-linear HRV metrics
 */
export interface NonLinearHRV {
  /** Poincaré SD1 - short-term variability (ms) */
  SD1: number;
  /** Poincaré SD2 - long-term variability (ms) */
  SD2: number;
  /** SD1/SD2 ratio */
  SD1SD2ratio: number;
  /** Sample entropy */
  sampleEntropy: number;
  /** Approximate entropy */
  approximateEntropy: number;
  /** DFA alpha1 (short-term, 4-16 beats) */
  DFAalpha1?: number;
  /** DFA alpha2 (long-term, 16-64 beats) */
  DFAalpha2?: number;
}

/**
 * Complete HRV analysis result
 */
export interface HRVAnalysisResult {
  /** RR tachogram */
  tachogram: RRTachogram;
  /** Time domain metrics */
  timeDomain: TimeDomainHRV;
  /** Frequency domain metrics (null if insufficient data) */
  frequencyDomain: FrequencyDomainHRV | null;
  /** Non-linear metrics */
  nonLinear: NonLinearHRV;
  /** Data quality assessment */
  quality: HRVQuality;
  /** Analysis notes */
  notes: string[];
  /** Processing time (ms) */
  processingTimeMs: number;
}

/**
 * HRV data quality assessment
 */
export interface HRVQuality {
  /** Overall quality score (0-1) */
  overall: number;
  /** Percentage of intervals that are valid NN */
  validPercentage: number;
  /** Recording duration adequate for analysis */
  durationAdequate: boolean;
  /** Number of ectopic beats excluded */
  ectopicExcluded: number;
  /** Number of artifact segments */
  artifactSegments: number;
  /** Stationary signal (no major trend) */
  isStationary: boolean;
  /** Issues found */
  issues: string[];
}

// ============================================================================
// RR Tachogram Generator
// ============================================================================

export class RRTachogramGenerator {
  private sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /**
   * Generate RR tachogram from R-peak indices
   */
  generate(
    rPeakIndices: number[],
    beatClasses?: ('N' | 'S' | 'V' | 'F' | 'P' | 'Q')[]
  ): RRTachogram {
    if (rPeakIndices.length < 2) {
      return {
        rrIntervals: [],
        rPeakTimes: rPeakIndices.map(i => i / this.sampleRate),
        annotations: [],
        duration: 0,
        count: 0,
        excludedCount: 0,
      };
    }

    const rrIntervals: number[] = [];
    const annotations: ('N' | 'E')[] = [];
    let excludedCount = 0;

    for (let i = 1; i < rPeakIndices.length; i++) {
      const rrMs = ((rPeakIndices[i] - rPeakIndices[i - 1]) / this.sampleRate) * 1000;

      // Exclude if either beat is ectopic or paced
      let isEctopic = false;
      if (beatClasses) {
        const prevClass = beatClasses[i - 1];
        const currClass = beatClasses[i];
        isEctopic = prevClass !== 'N' || currClass !== 'N';
      }

      // Also exclude physiologically implausible intervals
      if (rrMs < 200 || rrMs > 3000) {
        isEctopic = true;
      }

      rrIntervals.push(rrMs);

      if (isEctopic) {
        annotations.push('E');
        excludedCount++;
      } else {
        annotations.push('N');
      }
    }

    const duration = rPeakIndices.length > 0
      ? (rPeakIndices[rPeakIndices.length - 1] - rPeakIndices[0]) / this.sampleRate
      : 0;

    return {
      rrIntervals,
      rPeakTimes: rPeakIndices.map(i => i / this.sampleRate),
      annotations,
      duration,
      count: rrIntervals.length,
      excludedCount,
    };
  }

  /**
   * Get only normal-to-normal (NN) intervals
   */
  getNNIntervals(tachogram: RRTachogram): number[] {
    return tachogram.rrIntervals.filter((_, i) => tachogram.annotations[i] === 'N');
  }

  /**
   * Interpolate missing intervals for spectral analysis
   */
  interpolateNNForSpectral(
    tachogram: RRTachogram,
    targetFs: number = 4  // 4 Hz is common for HRV spectral analysis
  ): number[] {
    const nnIntervals = this.getNNIntervals(tachogram);
    if (nnIntervals.length < 10) return [];

    // Create cumulative time series
    const times: number[] = [0];
    for (let i = 0; i < nnIntervals.length; i++) {
      times.push(times[i] + nnIntervals[i] / 1000);
    }

    // Interpolate to uniform sampling
    const totalTime = times[times.length - 1];
    const numSamples = Math.floor(totalTime * targetFs);
    const interpolated: number[] = [];

    for (let i = 0; i < numSamples; i++) {
      const t = i / targetFs;

      // Find surrounding points
      let j = 0;
      while (j < times.length - 1 && times[j + 1] < t) j++;

      if (j >= nnIntervals.length) {
        interpolated.push(nnIntervals[nnIntervals.length - 1]);
      } else {
        // Linear interpolation
        const t0 = times[j];
        const t1 = times[j + 1];
        const v0 = nnIntervals[j];
        const v1 = j + 1 < nnIntervals.length ? nnIntervals[j + 1] : v0;
        const alpha = (t - t0) / (t1 - t0);
        interpolated.push(v0 + alpha * (v1 - v0));
      }
    }

    return interpolated;
  }
}

// ============================================================================
// HRV Analyzer
// ============================================================================

export class HRVAnalyzer {
  private tachogramGenerator: RRTachogramGenerator;

  constructor(sampleRate: number) {
    this.tachogramGenerator = new RRTachogramGenerator(sampleRate);
  }

  /**
   * Perform complete HRV analysis
   */
  analyze(
    rPeakIndices: number[],
    beatClasses?: ('N' | 'S' | 'V' | 'F' | 'P' | 'Q')[]
  ): HRVAnalysisResult {
    const startTime = Date.now();
    const notes: string[] = [];

    // Generate tachogram
    const tachogram = this.tachogramGenerator.generate(rPeakIndices, beatClasses);
    const nnIntervals = this.tachogramGenerator.getNNIntervals(tachogram);

    // Assess quality
    const quality = this.assessQuality(tachogram, nnIntervals);

    // Time domain analysis
    const timeDomain = this.analyzeTimeDomain(nnIntervals, tachogram.duration);

    // Frequency domain analysis (requires at least 2 minutes of data)
    let frequencyDomain: FrequencyDomainHRV | null = null;
    if (tachogram.duration >= 120 && nnIntervals.length >= 100) {
      frequencyDomain = this.analyzeFrequencyDomain(tachogram);
    } else {
      notes.push('Frequency domain analysis requires at least 2 minutes of data');
    }

    // Non-linear analysis
    const nonLinear = this.analyzeNonLinear(nnIntervals);

    // Add interpretation notes
    this.addInterpretationNotes(timeDomain, frequencyDomain, nonLinear, notes);

    return {
      tachogram,
      timeDomain,
      frequencyDomain,
      nonLinear,
      quality,
      notes,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Time domain HRV analysis
   */
  private analyzeTimeDomain(nnIntervals: number[], duration: number): TimeDomainHRV {
    if (nnIntervals.length === 0) {
      return this.emptyTimeDomain();
    }

    const n = nnIntervals.length;

    // Mean NN
    const meanNN = nnIntervals.reduce((a, b) => a + b, 0) / n;

    // SDNN
    const variance = nnIntervals.reduce((sum, nn) => sum + Math.pow(nn - meanNN, 2), 0) / n;
    const SDNN = Math.sqrt(variance);

    // RMSSD
    let sumSqDiff = 0;
    let countDiff = 0;
    let countNN50 = 0;
    let countNN20 = 0;

    for (let i = 1; i < n; i++) {
      const diff = nnIntervals[i] - nnIntervals[i - 1];
      sumSqDiff += diff * diff;
      countDiff++;

      if (Math.abs(diff) > 50) countNN50++;
      if (Math.abs(diff) > 20) countNN20++;
    }

    const RMSSD = countDiff > 0 ? Math.sqrt(sumSqDiff / countDiff) : 0;
    const pNN50 = countDiff > 0 ? (countNN50 / countDiff) * 100 : 0;
    const pNN20 = countDiff > 0 ? (countNN20 / countDiff) * 100 : 0;

    // Heart rate statistics
    const hrValues = nnIntervals.map(nn => 60000 / nn);
    const meanHR = hrValues.reduce((a, b) => a + b, 0) / hrValues.length;
    const hrVariance = hrValues.reduce((sum, hr) => sum + Math.pow(hr - meanHR, 2), 0) / hrValues.length;
    const SDHR = Math.sqrt(hrVariance);
    const minHR = Math.min(...hrValues);
    const maxHR = Math.max(...hrValues);

    // HRV triangular index
    const { triangularIndex, TINN } = this.calculateTriangularMetrics(nnIntervals);

    // SDANN and SDNNindex (for recordings > 5 minutes)
    let SDANN: number | undefined;
    let SDNNindex: number | undefined;

    if (duration >= 300) { // 5 minutes
      const segmentMetrics = this.calculate5MinSegmentMetrics(nnIntervals, duration);
      SDANN = segmentMetrics.SDANN;
      SDNNindex = segmentMetrics.SDNNindex;
    }

    return {
      meanNN,
      SDNN,
      RMSSD,
      pNN50,
      pNN20,
      meanHR,
      SDHR,
      minHR,
      maxHR,
      triangularIndex,
      TINN,
      SDANN,
      SDNNindex,
    };
  }

  /**
   * Calculate triangular metrics
   */
  private calculateTriangularMetrics(nnIntervals: number[]): { triangularIndex: number; TINN: number } {
    if (nnIntervals.length < 10) {
      return { triangularIndex: 0, TINN: 0 };
    }

    // Create histogram with 7.8125ms bins (1/128 second)
    const binWidth = 7.8125;
    const minNN = Math.min(...nnIntervals);
    const maxNN = Math.max(...nnIntervals);
    const numBins = Math.ceil((maxNN - minNN) / binWidth) + 1;

    const histogram = new Array(numBins).fill(0);
    for (const nn of nnIntervals) {
      const bin = Math.floor((nn - minNN) / binWidth);
      histogram[bin]++;
    }

    // Find mode (peak)
    const maxCount = Math.max(...histogram);
    const modeIdx = histogram.indexOf(maxCount);

    // Triangular index = total / mode
    const triangularIndex = maxCount > 0 ? nnIntervals.length / maxCount : 0;

    // TINN: baseline width of distribution (triangular interpolation)
    // Find where histogram drops to near zero on both sides
    let leftIdx = modeIdx;
    let rightIdx = modeIdx;

    while (leftIdx > 0 && histogram[leftIdx] > maxCount * 0.01) leftIdx--;
    while (rightIdx < numBins - 1 && histogram[rightIdx] > maxCount * 0.01) rightIdx++;

    const TINN = (rightIdx - leftIdx) * binWidth;

    return { triangularIndex, TINN };
  }

  /**
   * Calculate 5-minute segment metrics
   */
  private calculate5MinSegmentMetrics(
    nnIntervals: number[],
    _duration: number
  ): { SDANN?: number; SDNNindex?: number } {
    const segmentDuration = 300000; // 5 minutes in ms
    const segments: number[][] = [];

    let currentSum = 0;
    let currentSegment: number[] = [];

    for (const nn of nnIntervals) {
      currentSum += nn;
      currentSegment.push(nn);

      if (currentSum >= segmentDuration) {
        segments.push(currentSegment);
        currentSegment = [];
        currentSum = 0;
      }
    }

    if (segments.length < 2) {
      return {};
    }

    // Calculate mean NN for each segment
    const segmentMeans = segments.map(seg =>
      seg.reduce((a, b) => a + b, 0) / seg.length
    );

    // SDANN: SD of segment means
    const grandMean = segmentMeans.reduce((a, b) => a + b, 0) / segmentMeans.length;
    const sdannVariance = segmentMeans.reduce((sum, m) => sum + Math.pow(m - grandMean, 2), 0) / segmentMeans.length;
    const SDANN = Math.sqrt(sdannVariance);

    // SDNNindex: mean of segment SDNNs
    const segmentSDNNs = segments.map(seg => {
      const mean = seg.reduce((a, b) => a + b, 0) / seg.length;
      const variance = seg.reduce((sum, nn) => sum + Math.pow(nn - mean, 2), 0) / seg.length;
      return Math.sqrt(variance);
    });

    const SDNNindex = segmentSDNNs.reduce((a, b) => a + b, 0) / segmentSDNNs.length;

    return { SDANN, SDNNindex };
  }

  /**
   * Frequency domain HRV analysis using Welch's method
   */
  private analyzeFrequencyDomain(tachogram: RRTachogram): FrequencyDomainHRV {
    // Interpolate NN intervals to uniform sampling
    const fs = 4; // 4 Hz
    const interpolated = this.tachogramGenerator.interpolateNNForSpectral(tachogram, fs);

    if (interpolated.length < 256) {
      return this.emptyFrequencyDomain();
    }

    // Detrend (remove mean)
    const mean = interpolated.reduce((a, b) => a + b, 0) / interpolated.length;
    const detrended = interpolated.map(v => v - mean);

    // Apply Hanning window
    const windowed = this.applyHanningWindow(detrended);

    // Compute FFT using Welch's method (simplified)
    const { frequencies, powers } = this.welchPSD(windowed, fs);

    // Calculate band powers
    const VLF = this.bandPower(frequencies, powers, 0.003, 0.04);
    const LF = this.bandPower(frequencies, powers, 0.04, 0.15);
    const HF = this.bandPower(frequencies, powers, 0.15, 0.4);
    const totalPower = VLF + LF + HF;

    // Normalized units
    const LFnu = totalPower > 0 ? (LF / (LF + HF)) * 100 : 0;
    const HFnu = totalPower > 0 ? (HF / (LF + HF)) * 100 : 0;
    const LFHFratio = HF > 0 ? LF / HF : 0;

    // Peak frequencies
    const LFpeak = this.findPeakFrequency(frequencies, powers, 0.04, 0.15);
    const HFpeak = this.findPeakFrequency(frequencies, powers, 0.15, 0.4);

    // Create PSD for plotting
    const psd = frequencies.map((f, i) => ({ frequency: f, power: powers[i] }));

    return {
      totalPower,
      VLF,
      LF,
      HF,
      LFnu,
      HFnu,
      LFHFratio,
      LFpeak,
      HFpeak,
      psd,
    };
  }

  /**
   * Apply Hanning window
   */
  private applyHanningWindow(signal: number[]): number[] {
    const n = signal.length;
    return signal.map((v, i) => {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
      return v * w;
    });
  }

  /**
   * Compute PSD using Welch's method (simplified)
   */
  private welchPSD(signal: number[], fs: number): { frequencies: number[]; powers: number[] } {
    // Use a single FFT for simplicity (full Welch would use overlapping segments)
    const n = signal.length;
    const fftSize = Math.pow(2, Math.ceil(Math.log2(n)));

    // Zero-pad
    const padded = new Array(fftSize).fill(0);
    for (let i = 0; i < n; i++) {
      padded[i] = signal[i];
    }

    // Compute FFT (simplified DFT for small sizes)
    const { real, imag } = this.fft(padded);

    // Compute power spectrum
    const powers: number[] = [];
    const frequencies: number[] = [];

    for (let i = 0; i <= fftSize / 2; i++) {
      const power = (real[i] * real[i] + imag[i] * imag[i]) / fftSize;
      powers.push(power);
      frequencies.push((i * fs) / fftSize);
    }

    return { frequencies, powers };
  }

  /**
   * Simple FFT implementation
   */
  private fft(signal: number[]): { real: number[]; imag: number[] } {
    const n = signal.length;
    const real = new Array(n).fill(0);
    const imag = new Array(n).fill(0);

    // DFT (simple O(n²) implementation - adequate for HRV segment sizes)
    for (let k = 0; k < n; k++) {
      for (let t = 0; t < n; t++) {
        const angle = (2 * Math.PI * k * t) / n;
        real[k] += signal[t] * Math.cos(angle);
        imag[k] -= signal[t] * Math.sin(angle);
      }
    }

    return { real, imag };
  }

  /**
   * Calculate power in frequency band
   */
  private bandPower(
    frequencies: number[],
    powers: number[],
    lowFreq: number,
    highFreq: number
  ): number {
    let power = 0;
    const df = frequencies.length > 1 ? frequencies[1] - frequencies[0] : 0;

    for (let i = 0; i < frequencies.length; i++) {
      if (frequencies[i] >= lowFreq && frequencies[i] < highFreq) {
        power += powers[i] * df;
      }
    }

    return power;
  }

  /**
   * Find peak frequency in band
   */
  private findPeakFrequency(
    frequencies: number[],
    powers: number[],
    lowFreq: number,
    highFreq: number
  ): number {
    let maxPower = 0;
    let peakFreq = (lowFreq + highFreq) / 2;

    for (let i = 0; i < frequencies.length; i++) {
      if (frequencies[i] >= lowFreq && frequencies[i] < highFreq) {
        if (powers[i] > maxPower) {
          maxPower = powers[i];
          peakFreq = frequencies[i];
        }
      }
    }

    return peakFreq;
  }

  /**
   * Non-linear HRV analysis
   */
  private analyzeNonLinear(nnIntervals: number[]): NonLinearHRV {
    if (nnIntervals.length < 10) {
      return this.emptyNonLinear();
    }

    // Poincaré plot analysis
    const { SD1, SD2 } = this.poincarePlot(nnIntervals);
    const SD1SD2ratio = SD2 > 0 ? SD1 / SD2 : 0;

    // Entropy measures
    const sampleEntropy = this.sampleEntropy(nnIntervals, 2, 0.2);
    const approximateEntropy = this.approximateEntropy(nnIntervals, 2, 0.2);

    // DFA (if sufficient data)
    let DFAalpha1: number | undefined;
    let DFAalpha2: number | undefined;

    if (nnIntervals.length >= 64) {
      DFAalpha1 = this.detrendedFluctuationAnalysis(nnIntervals, 4, 16);
      if (nnIntervals.length >= 256) {
        DFAalpha2 = this.detrendedFluctuationAnalysis(nnIntervals, 16, 64);
      }
    }

    return {
      SD1,
      SD2,
      SD1SD2ratio,
      sampleEntropy,
      approximateEntropy,
      DFAalpha1,
      DFAalpha2,
    };
  }

  /**
   * Poincaré plot analysis
   */
  private poincarePlot(nnIntervals: number[]): { SD1: number; SD2: number } {
    if (nnIntervals.length < 2) {
      return { SD1: 0, SD2: 0 };
    }

    // Create Poincaré points (RR_n, RR_n+1)
    const x: number[] = [];
    const y: number[] = [];

    for (let i = 0; i < nnIntervals.length - 1; i++) {
      x.push(nnIntervals[i]);
      y.push(nnIntervals[i + 1]);
    }

    // SD1: Standard deviation perpendicular to line of identity
    // SD1 = sqrt(0.5 * SD(RR_n+1 - RR_n)²)
    const diff = y.map((yi, i) => yi - x[i]);
    const meanDiff = diff.reduce((a, b) => a + b, 0) / diff.length;
    const varDiff = diff.reduce((sum, d) => sum + Math.pow(d - meanDiff, 2), 0) / diff.length;
    const SD1 = Math.sqrt(0.5 * varDiff);

    // SD2: Standard deviation along line of identity
    // SD2 = sqrt(2 * SDNN² - 0.5 * SD(RR_n+1 - RR_n)²)
    const meanNN = nnIntervals.reduce((a, b) => a + b, 0) / nnIntervals.length;
    const varNN = nnIntervals.reduce((sum, nn) => sum + Math.pow(nn - meanNN, 2), 0) / nnIntervals.length;
    const SD2 = Math.sqrt(Math.max(0, 2 * varNN - 0.5 * varDiff));

    return { SD1, SD2 };
  }

  /**
   * Sample entropy
   */
  private sampleEntropy(data: number[], m: number, r: number): number {
    const n = data.length;
    if (n < m + 1) return 0;

    // r is relative to SD
    const sd = this.standardDeviation(data);
    const tolerance = r * sd;

    // Count template matches
    let countM = 0;
    let countM1 = 0;

    for (let i = 0; i < n - m; i++) {
      for (let j = i + 1; j < n - m; j++) {
        // Check m-length template match
        let matchM = true;
        for (let k = 0; k < m; k++) {
          if (Math.abs(data[i + k] - data[j + k]) > tolerance) {
            matchM = false;
            break;
          }
        }

        if (matchM) {
          countM++;

          // Check m+1 length match
          if (i + m < n && j + m < n) {
            if (Math.abs(data[i + m] - data[j + m]) <= tolerance) {
              countM1++;
            }
          }
        }
      }
    }

    if (countM === 0 || countM1 === 0) return 0;

    return -Math.log(countM1 / countM);
  }

  /**
   * Approximate entropy
   */
  private approximateEntropy(data: number[], m: number, r: number): number {
    const n = data.length;
    if (n < m + 1) return 0;

    const sd = this.standardDeviation(data);
    const tolerance = r * sd;

    const phi = (dim: number) => {
      let sum = 0;

      for (let i = 0; i <= n - dim; i++) {
        let count = 0;

        for (let j = 0; j <= n - dim; j++) {
          let match = true;
          for (let k = 0; k < dim; k++) {
            if (Math.abs(data[i + k] - data[j + k]) > tolerance) {
              match = false;
              break;
            }
          }
          if (match) count++;
        }

        sum += Math.log(count / (n - dim + 1));
      }

      return sum / (n - dim + 1);
    };

    return phi(m) - phi(m + 1);
  }

  /**
   * Detrended Fluctuation Analysis
   */
  private detrendedFluctuationAnalysis(data: number[], minBox: number, maxBox: number): number {
    const n = data.length;
    if (n < maxBox) return 0;

    // Integrate the signal
    const mean = data.reduce((a, b) => a + b, 0) / n;
    const integrated = new Array(n);
    integrated[0] = data[0] - mean;
    for (let i = 1; i < n; i++) {
      integrated[i] = integrated[i - 1] + (data[i] - mean);
    }

    // Calculate fluctuation for different box sizes
    const boxSizes: number[] = [];
    const fluctuations: number[] = [];

    for (let boxSize = minBox; boxSize <= maxBox; boxSize = Math.floor(boxSize * 1.2)) {
      const numBoxes = Math.floor(n / boxSize);
      if (numBoxes < 2) continue;

      let totalFluctuation = 0;

      for (let i = 0; i < numBoxes; i++) {
        const start = i * boxSize;
        const end = start + boxSize;

        // Linear regression in box
        const segment = integrated.slice(start, end);
        const trend = this.linearFit(segment);

        // Calculate RMS of detrended segment
        let sumSq = 0;
        for (let j = 0; j < segment.length; j++) {
          const detrended = segment[j] - trend[j];
          sumSq += detrended * detrended;
        }
        totalFluctuation += sumSq;
      }

      const F = Math.sqrt(totalFluctuation / (numBoxes * boxSize));
      boxSizes.push(boxSize);
      fluctuations.push(F);
    }

    // Log-log linear fit to get alpha
    if (boxSizes.length < 2) return 0;

    const logBoxes = boxSizes.map(b => Math.log(b));
    const logFluct = fluctuations.map(f => Math.log(Math.max(0.001, f)));

    const alpha = this.linearRegressionSlope(logBoxes, logFluct);

    return alpha;
  }

  /**
   * Linear fit for DFA
   */
  private linearFit(data: number[]): number[] {
    const n = data.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const slope = this.linearRegressionSlope(x, data);
    const meanY = data.reduce((a, b) => a + b, 0) / n;
    const meanX = (n - 1) / 2;
    const intercept = meanY - slope * meanX;

    return x.map(xi => slope * xi + intercept);
  }

  /**
   * Linear regression slope (delegated to utility)
   */
  private linearRegressionSlope(x: number[], y: number[]): number {
    return linRegSlope(x, y);
  }

  /**
   * Standard deviation helper (delegated to utility)
   */
  private standardDeviation(data: number[]): number {
    return stdDev(data, true);
  }

  /**
   * Assess HRV data quality
   */
  private assessQuality(tachogram: RRTachogram, nnIntervals: number[]): HRVQuality {
    const issues: string[] = [];

    const validPercentage = tachogram.count > 0
      ? ((tachogram.count - tachogram.excludedCount) / tachogram.count) * 100
      : 0;

    const durationAdequate = tachogram.duration >= 300; // 5 minutes minimum

    if (!durationAdequate) {
      issues.push('Recording duration < 5 minutes');
    }

    if (validPercentage < 90) {
      issues.push(`High ectopic burden (${(100 - validPercentage).toFixed(1)}% excluded)`);
    }

    if (nnIntervals.length < 100) {
      issues.push('Fewer than 100 valid NN intervals');
    }

    // Check stationarity (simple trend check)
    const isStationary = this.checkStationarity(nnIntervals);
    if (!isStationary) {
      issues.push('Non-stationary signal detected');
    }

    const overall = Math.min(1, (
      (validPercentage / 100) * 0.4 +
      (durationAdequate ? 0.3 : 0) +
      (isStationary ? 0.2 : 0) +
      (issues.length === 0 ? 0.1 : 0)
    ));

    return {
      overall,
      validPercentage,
      durationAdequate,
      ectopicExcluded: tachogram.excludedCount,
      artifactSegments: 0, // Would need more sophisticated artifact detection
      isStationary,
      issues,
    };
  }

  /**
   * Check signal stationarity
   */
  private checkStationarity(nnIntervals: number[]): boolean {
    if (nnIntervals.length < 20) return true;

    // Compare first and second half means
    const half = Math.floor(nnIntervals.length / 2);
    const firstHalf = nnIntervals.slice(0, half);
    const secondHalf = nnIntervals.slice(half);

    const mean1 = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const mean2 = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    // Check if means differ by more than 10%
    const percentDiff = Math.abs(mean1 - mean2) / ((mean1 + mean2) / 2) * 100;

    return percentDiff < 10;
  }

  /**
   * Add interpretation notes
   */
  private addInterpretationNotes(
    timeDomain: TimeDomainHRV,
    frequencyDomain: FrequencyDomainHRV | null,
    nonLinear: NonLinearHRV,
    notes: string[]
  ): void {
    // RMSSD interpretation
    if (timeDomain.RMSSD < 20) {
      notes.push('Low RMSSD suggests reduced parasympathetic activity');
    } else if (timeDomain.RMSSD > 50) {
      notes.push('High RMSSD indicates good parasympathetic tone');
    }

    // SDNN interpretation
    if (timeDomain.SDNN < 50) {
      notes.push('Low SDNN may indicate reduced overall HRV');
    }

    // LF/HF ratio interpretation
    if (frequencyDomain) {
      if (frequencyDomain.LFHFratio > 2) {
        notes.push('Elevated LF/HF ratio suggests sympathetic predominance');
      } else if (frequencyDomain.LFHFratio < 0.5) {
        notes.push('Low LF/HF ratio suggests parasympathetic predominance');
      }
    }

    // Poincaré interpretation
    if (nonLinear.SD1 < 10) {
      notes.push('Low SD1 indicates reduced short-term variability');
    }
  }

  /**
   * Empty results for insufficient data
   */
  private emptyTimeDomain(): TimeDomainHRV {
    return {
      meanNN: 0,
      SDNN: 0,
      RMSSD: 0,
      pNN50: 0,
      pNN20: 0,
      meanHR: 0,
      SDHR: 0,
      minHR: 0,
      maxHR: 0,
      triangularIndex: 0,
      TINN: 0,
    };
  }

  private emptyFrequencyDomain(): FrequencyDomainHRV {
    return {
      totalPower: 0,
      VLF: 0,
      LF: 0,
      HF: 0,
      LFnu: 0,
      HFnu: 0,
      LFHFratio: 0,
      LFpeak: 0,
      HFpeak: 0,
    };
  }

  private emptyNonLinear(): NonLinearHRV {
    return {
      SD1: 0,
      SD2: 0,
      SD1SD2ratio: 0,
      sampleEntropy: 0,
      approximateEntropy: 0,
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Perform complete HRV analysis
 */
export function analyzeHRV(
  rPeakIndices: number[],
  sampleRate: number,
  beatClasses?: ('N' | 'S' | 'V' | 'F' | 'P' | 'Q')[]
): HRVAnalysisResult {
  const analyzer = new HRVAnalyzer(sampleRate);
  return analyzer.analyze(rPeakIndices, beatClasses);
}

/**
 * Generate RR tachogram only
 */
export function generateRRTachogram(
  rPeakIndices: number[],
  sampleRate: number,
  beatClasses?: ('N' | 'S' | 'V' | 'F' | 'P' | 'Q')[]
): RRTachogram {
  const generator = new RRTachogramGenerator(sampleRate);
  return generator.generate(rPeakIndices, beatClasses);
}

/**
 * Quick RMSSD calculation (marker of parasympathetic activity)
 */
export function calculateRMSSD(nnIntervals: number[]): number {
  if (nnIntervals.length < 2) return 0;

  let sumSqDiff = 0;
  for (let i = 1; i < nnIntervals.length; i++) {
    const diff = nnIntervals[i] - nnIntervals[i - 1];
    sumSqDiff += diff * diff;
  }

  return Math.sqrt(sumSqDiff / (nnIntervals.length - 1));
}
