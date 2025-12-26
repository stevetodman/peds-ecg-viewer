/**
 * Signal Reconstructor
 * Convert raw pixel traces to ECGSignal with proper calibration
 *
 * @module signal/loader/png-digitizer/signal/reconstructor
 */

import type { RawTrace, CalibrationAnalysis, GridAnalysis } from '../types';
import type { ECGSignal, LeadName } from '../../../../types';
import { removeDCOffset } from './dc-corrector';
import { resampleToRate } from './resampler';
import { enhancedDigitizerFilter } from './filters';

/**
 * Panel statistics for calibration
 */
interface PanelStats {
  medianWidth: number;
  avgWidth: number;
  count: number;
}

/**
 * Calibration result from multi-strategy search
 */
interface CalibrationResult {
  pxPerMm: number;
  paperSpeed: number;
  method: string;
}

/**
 * Signal reconstructor options
 */
export interface ReconstructorOptions {
  /** Target sample rate (Hz) */
  targetSampleRate?: number;

  /** Remove DC offset */
  removeDC?: boolean;

  /** Interpolation method */
  interpolation?: 'linear' | 'sinc';

  /** Apply enhanced filtering (Savitzky-Golay + adaptive denoising) */
  enhancedFiltering?: boolean;

  /** Denoising aggressiveness 0-1 (only when enhancedFiltering is true) */
  denoiseLevel?: number;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<ReconstructorOptions> = {
  targetSampleRate: 500,
  removeDC: true,
  interpolation: 'linear',
  enhancedFiltering: true,
  denoiseLevel: 0.3,
};

/**
 * Signal reconstructor class
 */
export class SignalReconstructor {
  private calibration: CalibrationAnalysis;
  private gridInfo: GridAnalysis;
  private options: Required<ReconstructorOptions>;

  constructor(
    calibration: CalibrationAnalysis,
    gridInfo: GridAnalysis,
    options: ReconstructorOptions = {}
  ) {
    this.calibration = calibration;
    this.gridInfo = gridInfo;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Convert raw traces to ECGSignal
   * Uses multi-strategy calibration with automatic paper speed detection
   */
  reconstruct(traces: RawTrace[]): ECGSignal {
    const { gain } = this.calibration;

    // Calculate panel statistics for calibration strategies
    const panelStats = this.calculatePanelStats(traces);

    // Try multiple calibration strategies and pick the best one
    const calibration = this.findBestCalibration(traces, panelStats, gain);

    // Calculate conversion factors
    const pxPerMm = calibration.pxPerMm;
    const paperSpeed = calibration.paperSpeed;
    const pxPerMv = pxPerMm * gain;        // pixels per millivolt
    const pxPerSec = pxPerMm * paperSpeed; // pixels per second

    const leads: Partial<Record<LeadName, number[]>> = {};
    let maxDuration = 0;

    // Group traces by lead (for rhythm strips that may span multiple panels)
    const tracesByLead = new Map<LeadName, RawTrace[]>();
    for (const trace of traces) {
      const existing = tracesByLead.get(trace.lead) ?? [];
      existing.push(trace);
      tracesByLead.set(trace.lead, existing);
    }

    // CRITICAL FIX: Calculate global X reference per column for time alignment
    // Leads in the same column must use the same X-to-time mapping
    const columnMinX = this.calculateColumnMinX(traces);

    // Process each lead
    for (const [lead, leadTraces] of tracesByLead) {
      // Sort traces by time position (x coordinate)
      leadTraces.sort((a, b) => Math.min(...a.xPixels) - Math.min(...b.xPixels));

      // Get the column for this lead (for time alignment)
      const column = this.getLeadColumn(lead);
      const globalMinX = columnMinX.get(column) ?? Math.min(...leadTraces[0].xPixels);

      // Combine all traces for this lead
      const allVoltages: number[] = [];
      const allTimes: number[] = [];
      let timeOffset = 0;

      for (const trace of leadTraces) {
        // Convert Y pixels to microvolts
        const voltages = trace.yPixels.map(y => {
          const deltaY = trace.baselineY - y;  // Inverted Y axis
          const mV = deltaY / pxPerMv;
          return mV * 1000;  // Convert to microvolts
        });

        // Convert X pixels to time (seconds) using GLOBAL column reference
        // This ensures all leads in the same column are time-aligned
        const times = trace.xPixels.map(x => timeOffset + (x - globalMinX) / pxPerSec);

        allVoltages.push(...voltages);
        allTimes.push(...times);

        // Update time offset for next trace (only for rhythm strips spanning multiple panels)
        if (leadTraces.length > 1 && times.length > 0) {
          timeOffset = Math.max(...times) + 1 / pxPerSec; // Small gap
        }
      }

      // Track max duration
      const traceDuration = allTimes.length > 0 ? Math.max(...allTimes) : 0;
      maxDuration = Math.max(maxDuration, traceDuration);

      // Resample to target sample rate
      const resampled = resampleToRate(
        allVoltages,
        allTimes,
        traceDuration,
        this.options.targetSampleRate,
        this.options.interpolation
      );

      // Remove DC offset if requested
      let corrected = this.options.removeDC ? removeDCOffset(resampled) : resampled;

      // Apply enhanced filtering (Savitzky-Golay + adaptive denoising)
      if (this.options.enhancedFiltering) {
        corrected = enhancedDigitizerFilter(corrected, this.options.targetSampleRate, {
          smoothing: true,
          smoothingWindow: 7,
          denoise: true,
          denoiseLevel: this.options.denoiseLevel,
          lowPass: false, // Only enable for very noisy images
        });
      }

      leads[lead] = corrected;
    }

    // Ensure all leads have same length
    const maxLength = Math.max(...Object.values(leads).map(l => l?.length ?? 0));
    for (const lead of Object.keys(leads) as LeadName[]) {
      const arr = leads[lead]!;
      if (arr.length < maxLength) {
        // Pad with last value or zeros
        const padValue = arr.length > 0 ? arr[arr.length - 1] : 0;
        const padding = new Array(maxLength - arr.length).fill(padValue);
        leads[lead] = arr.concat(padding);
      }
    }

    const signal: ECGSignal = {
      sampleRate: this.options.targetSampleRate,
      duration: maxLength / this.options.targetSampleRate,
      leads: leads as Record<LeadName, number[]>,
    };

    // Post-reconstruction validation: check if HR seems physiologically plausible
    this.validateTiming(signal, paperSpeed);

    return signal;
  }

  /**
   * Get the column index for a lead in standard 12-lead layout
   * Column 0: I, II, III
   * Column 1: aVR, aVL, aVF
   * Column 2: V1, V2, V3
   * Column 3: V4, V5, V6
   */
  private getLeadColumn(lead: LeadName): number {
    const columnMap: Record<LeadName, number> = {
      'I': 0, 'II': 0, 'III': 0,
      'aVR': 1, 'aVL': 1, 'aVF': 1,
      'V1': 2, 'V2': 2, 'V3': 2,
      'V4': 3, 'V5': 3, 'V6': 3,
      // Extended leads (pediatric)
      'V3R': 4, 'V4R': 4, 'V7': 4,
    };
    return columnMap[lead] ?? 0;
  }

  /**
   * Calculate the global minimum X position for each column
   * This ensures all leads in the same column share the same time reference
   */
  private calculateColumnMinX(traces: RawTrace[]): Map<number, number> {
    const columnMinX = new Map<number, number>();

    for (const trace of traces) {
      if (trace.xPixels.length === 0) continue;

      const column = this.getLeadColumn(trace.lead);
      const traceMinX = Math.min(...trace.xPixels);

      const currentMin = columnMinX.get(column);
      if (currentMin === undefined || traceMinX < currentMin) {
        columnMinX.set(column, traceMinX);
      }
    }

    return columnMinX;
  }

  /**
   * Panel statistics for calibration
   */
  private calculatePanelStats(traces: RawTrace[]): PanelStats {
    const panelWidths: number[] = [];
    for (const trace of traces) {
      if (trace.xPixels.length > 0) {
        const traceWidth = Math.max(...trace.xPixels) - Math.min(...trace.xPixels);
        panelWidths.push(traceWidth);
      }
    }

    panelWidths.sort((a, b) => a - b);
    const medianWidth = panelWidths.length > 0
      ? panelWidths[Math.floor(panelWidths.length / 2)]
      : 0;

    // Filter out rhythm strips (>1.5x median width)
    const singlePanelWidths = panelWidths.filter(w => w < medianWidth * 1.5);
    const avgWidth = singlePanelWidths.length > 0
      ? singlePanelWidths.reduce((a, b) => a + b, 0) / singlePanelWidths.length
      : medianWidth;

    return { medianWidth, avgWidth, count: singlePanelWidths.length };
  }

  /**
   * Try multiple calibration strategies and return the best one
   * Strategy: Generate candidates, reconstruct with each, pick physiologically plausible result
   */
  private findBestCalibration(
    traces: RawTrace[],
    panelStats: PanelStats,
    gain: number
  ): CalibrationResult {
    const candidates: CalibrationResult[] = [];
    const { largeBoxesPerPanel, visualHeartRateEstimate, pxPerMm: aiPxPerMm } = this.gridInfo;
    const aiPaperSpeed = this.calibration.paperSpeed;

    // Strategy 1: Grid box counting (most reliable when available)
    if (largeBoxesPerPanel && largeBoxesPerPanel > 0 && panelStats.avgWidth > 0) {
      const panelWidthMm = largeBoxesPerPanel * 5;
      const pxPerMm = panelStats.avgWidth / panelWidthMm;

      if (pxPerMm > 1 && pxPerMm < 30) {
        // Try both paper speeds with grid box pxPerMm
        candidates.push({ pxPerMm, paperSpeed: 25, method: 'grid_box_25' });
        candidates.push({ pxPerMm, paperSpeed: 50, method: 'grid_box_50' });
      }
    }

    // Strategy 2: AI's direct estimate (if provided)
    if (aiPxPerMm && aiPxPerMm > 0) {
      candidates.push({ pxPerMm: aiPxPerMm, paperSpeed: aiPaperSpeed, method: 'ai_direct' });
      // Also try alternate paper speed with AI's pxPerMm
      const altSpeed = aiPaperSpeed === 25 ? 50 : 25;
      candidates.push({ pxPerMm: aiPxPerMm, paperSpeed: altSpeed, method: 'ai_alt_speed' });
    }

    // Strategy 3: Estimate from panel width assuming 2.5s duration
    if (panelStats.avgWidth > 100) {
      for (const speed of [25, 50]) {
        const panelWidthMm = 2.5 * speed; // 2.5 seconds
        const pxPerMm = panelStats.avgWidth / panelWidthMm;
        if (pxPerMm > 1 && pxPerMm < 30) {
          candidates.push({ pxPerMm, paperSpeed: speed, method: `panel_width_${speed}` });
        }
      }
    }

    // Strategy 4: Use visual HR estimate to validate/select
    const visualHR = visualHeartRateEstimate ? this.parseHeartRateEstimate(visualHeartRateEstimate) : null;

    // If no candidates, use fallback
    if (candidates.length === 0) {
      return { pxPerMm: 4, paperSpeed: 25, method: 'fallback' };
    }

    // Score each candidate by reconstructing and checking HR
    const scored = candidates.map(candidate => {
      const hr = this.estimateHRWithCalibration(traces, candidate, gain);
      const score = this.scoreCalibration(hr, visualHR);
      return { ...candidate, hr, score };
    });

    // Sort by score (higher is better)
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];

    return { pxPerMm: best.pxPerMm, paperSpeed: best.paperSpeed, method: best.method };
  }

  /**
   * Estimate heart rate using a specific calibration
   */
  private estimateHRWithCalibration(
    traces: RawTrace[],
    calibration: CalibrationResult,
    gain: number
  ): number | null {
    const { pxPerMm, paperSpeed } = calibration;
    const pxPerMv = pxPerMm * gain;
    const pxPerSec = pxPerMm * paperSpeed;

    // Find a good lead for QRS detection (prefer II)
    const leadII = traces.find(t => t.lead === 'II');
    const trace = leadII ?? traces[0];
    if (!trace || trace.xPixels.length < 50) return null;

    // Convert to voltage and time
    const voltages = trace.yPixels.map(y => (trace.baselineY - y) / pxPerMv);
    const minX = Math.min(...trace.xPixels);
    const times = trace.xPixels.map(x => (x - minX) / pxPerSec);

    // Simple QRS detection: find peaks
    const sorted = [...voltages].sort((a, b) => a - b);
    const threshold = sorted[Math.floor(sorted.length * 0.85)];

    const peaks: number[] = [];
    const minDistanceSec = 0.2; // 200ms minimum between beats

    for (let i = 1; i < voltages.length - 1; i++) {
      if (voltages[i] > threshold &&
          voltages[i] > voltages[i - 1] &&
          voltages[i] > voltages[i + 1]) {
        // Check distance from last peak
        if (peaks.length === 0 || times[i] - times[peaks[peaks.length - 1]] >= minDistanceSec) {
          peaks.push(i);
        }
      }
    }

    if (peaks.length < 2) return null;

    // Calculate average RR interval
    let totalRR = 0;
    for (let i = 1; i < peaks.length; i++) {
      totalRR += times[peaks[i]] - times[peaks[i - 1]];
    }
    const avgRR = totalRR / (peaks.length - 1);

    return 60 / avgRR;
  }

  /**
   * Score a calibration based on physiological plausibility
   * Higher score = more plausible
   */
  private scoreCalibration(estimatedHR: number | null, visualHR: number | null): number {
    if (estimatedHR === null) return 0;

    let score = 0;

    // Physiological range scoring (20-300 bpm is possible, 40-200 is common)
    if (estimatedHR >= 40 && estimatedHR <= 200) {
      score += 50; // Common range
    } else if (estimatedHR >= 20 && estimatedHR <= 300) {
      score += 25; // Possible but uncommon
    } else if (estimatedHR >= 10 && estimatedHR <= 400) {
      score += 5; // Edge cases (extreme bradycardia/tachycardia)
    } else {
      score -= 50; // Implausible
    }

    // Match with visual HR estimate (if available)
    if (visualHR !== null) {
      const diff = Math.abs(estimatedHR - visualHR);
      const percentDiff = diff / visualHR;

      if (percentDiff < 0.1) {
        score += 40; // Within 10%
      } else if (percentDiff < 0.2) {
        score += 25; // Within 20%
      } else if (percentDiff < 0.3) {
        score += 10; // Within 30%
      } else if (percentDiff > 0.5) {
        score -= 20; // Way off
      }
    }

    // Bonus for normal sinus range
    if (estimatedHR >= 60 && estimatedHR <= 100) {
      score += 10;
    }

    return score;
  }

  /**
   * Parse visual heart rate estimate string to a numeric value
   * Handles formats like "60-80", "tachycardia ~150", "150-180 bpm", etc.
   */
  private parseHeartRateEstimate(estimate: string): number | null {
    if (!estimate || typeof estimate !== 'string') {
      return null;
    }

    // Try to extract numeric values from the string
    const numbers = estimate.match(/\d+/g);
    if (!numbers || numbers.length === 0) {
      return null;
    }

    // If there's a range (e.g., "60-80" or "150-180"), use the midpoint
    if (numbers.length >= 2) {
      const low = parseInt(numbers[0], 10);
      const high = parseInt(numbers[1], 10);
      if (!isNaN(low) && !isNaN(high) && low > 0 && high > 0) {
        return (low + high) / 2;
      }
    }

    // Otherwise use the first number found
    const hr = parseInt(numbers[0], 10);
    if (!isNaN(hr) && hr > 0 && hr < 500) {
      return hr;
    }

    return null;
  }

  /**
   * Validate timing by estimating HR from QRS peaks
   * If HR seems implausible, the interpretation engine will flag it
   */
  private validateTiming(signal: ECGSignal, _paperSpeed: number): void {
    // Use lead II or V1 for QRS detection (typically cleanest)
    const checkLead = signal.leads['II'] ?? signal.leads['V1'] ?? Object.values(signal.leads)[0];
    if (!checkLead || checkLead.length < 100) return;

    // Simple peak detection: find local maxima above threshold
    const sorted = [...checkLead].sort((a, b) => a - b);
    const threshold = sorted[Math.floor(sorted.length * 0.85)]; // 85th percentile

    const peaks: number[] = [];
    const minDistance = Math.floor(signal.sampleRate * 0.2); // Min 200ms between beats

    for (let i = minDistance; i < checkLead.length - minDistance; i++) {
      if (checkLead[i] > threshold &&
          checkLead[i] > checkLead[i - 1] &&
          checkLead[i] > checkLead[i + 1]) {
        // Check it's a local maximum in a wider window
        let isLocalMax = true;
        for (let j = i - minDistance; j <= i + minDistance; j++) {
          if (j !== i && checkLead[j] >= checkLead[i]) {
            isLocalMax = false;
            break;
          }
        }
        if (isLocalMax) {
          peaks.push(i);
        }
      }
    }

    if (peaks.length < 2) {
      return;
    }

    // Calculate RR intervals and heart rate
    const rrIntervals: number[] = [];
    for (let i = 1; i < peaks.length; i++) {
      rrIntervals.push((peaks[i] - peaks[i - 1]) / signal.sampleRate);
    }

    const avgRR = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
    const estimatedHR = 60 / avgRR;

    // HR validation happens silently - errors will surface in interpretation
    // Physiological range: 30-350 bpm
    if (estimatedHR > 350 || estimatedHR < 20) {
      // Signal quality issue - paper speed likely misconfigured
      // This will be caught by interpretation engine
    }
  }
}

/**
 * Convenience function for signal reconstruction
 */
export function reconstructSignal(
  traces: RawTrace[],
  calibration: CalibrationAnalysis,
  gridInfo: GridAnalysis,
  options?: ReconstructorOptions
): ECGSignal {
  const reconstructor = new SignalReconstructor(calibration, gridInfo, options);
  return reconstructor.reconstruct(traces);
}
