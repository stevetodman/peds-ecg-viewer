/**
 * Pacemaker Spike Detector
 * Detects pacemaker spikes in ECG signals
 *
 * Critical for clinical interpretation:
 * - Pacemaker spikes affect rhythm interpretation
 * - Need to distinguish paced vs intrinsic beats
 * - Important for device malfunction detection
 *
 * @module signal/loader/png-digitizer/signal/pacemaker-detector
 */

import type { LeadName } from '../types';

/**
 * Types of pacemaker activity
 */
export type PacemakerMode =
  | 'AAI'   // Atrial pacing, atrial sensing, inhibited
  | 'VVI'   // Ventricular pacing, ventricular sensing, inhibited
  | 'DDD'   // Dual chamber pacing and sensing
  | 'VOO'   // Ventricular asynchronous
  | 'AOO'   // Atrial asynchronous
  | 'UNKNOWN';

/**
 * Pacemaker spike detection
 */
export interface PacemakerSpike {
  /** Time in seconds from start */
  time: number;

  /** Sample index */
  sampleIndex: number;

  /** Spike amplitude (mV) */
  amplitude: number;

  /** Spike width (ms) */
  widthMs: number;

  /** Type: atrial or ventricular */
  type: 'atrial' | 'ventricular' | 'unknown';

  /** Confidence of detection (0-1) */
  confidence: number;

  /** Which lead had clearest spike */
  bestLead: LeadName;
}

/**
 * Pacemaker detection result
 */
export interface PacemakerDetectionResult {
  /** Whether pacemaker activity detected */
  pacemakerDetected: boolean;

  /** Detected pacing mode */
  mode: PacemakerMode;

  /** All detected spikes */
  spikes: PacemakerSpike[];

  /** Atrial spikes only */
  atrialSpikes: PacemakerSpike[];

  /** Ventricular spikes only */
  ventricularSpikes: PacemakerSpike[];

  /** Pacing rate (spikes per minute) */
  pacingRate: number;

  /** AV interval (if dual chamber) */
  avIntervalMs?: number;

  /** Capture detected (spike followed by appropriate complex) */
  captureDetected: boolean;

  /** Sensing issues detected */
  sensingIssues: SensingIssue[];

  /** Clinical notes */
  clinicalNotes: string[];

  /** Confidence of overall detection */
  confidence: number;
}

/**
 * Sensing issue detection
 */
export interface SensingIssue {
  type: 'undersensing' | 'oversensing' | 'failure_to_capture' | 'failure_to_pace';
  time: number;
  description: string;
}

/**
 * Pacemaker Detector class
 */
export class PacemakerDetector {
  private leads: Partial<Record<LeadName, number[]>>;
  private sampleRate: number;

  // Spike detection parameters
  private readonly MIN_SPIKE_AMPLITUDE = 200; // μV (0.2mV)
  private readonly MIN_SPIKE_SHARPNESS = 5; // Rate of change threshold

  constructor(leads: Partial<Record<LeadName, number[]>>, sampleRate: number) {
    this.leads = leads;
    this.sampleRate = sampleRate;
  }

  /**
   * Detect pacemaker activity
   */
  detect(): PacemakerDetectionResult {
    const spikes: PacemakerSpike[] = [];

    // Check each lead for spikes
    for (const [leadName, data] of Object.entries(this.leads)) {
      if (!data || data.length === 0) continue;

      const leadSpikes = this.detectSpikesInLead(data, leadName as LeadName);
      spikes.push(...leadSpikes);
    }

    // Merge spikes that occur at the same time across leads
    const mergedSpikes = this.mergeSpikesAcrossLeads(spikes);

    if (mergedSpikes.length === 0) {
      return {
        pacemakerDetected: false,
        mode: 'UNKNOWN',
        spikes: [],
        atrialSpikes: [],
        ventricularSpikes: [],
        pacingRate: 0,
        captureDetected: false,
        sensingIssues: [],
        clinicalNotes: [],
        confidence: 0.95, // Confident there's no pacemaker
      };
    }

    // Classify spikes as atrial or ventricular
    this.classifySpikes(mergedSpikes);

    const atrialSpikes = mergedSpikes.filter(s => s.type === 'atrial');
    const ventricularSpikes = mergedSpikes.filter(s => s.type === 'ventricular');

    // Determine pacing mode
    const mode = this.determinePacingMode(atrialSpikes, ventricularSpikes);

    // Calculate pacing rate
    const pacingRate = this.calculatePacingRate(mergedSpikes);

    // Calculate AV interval for dual chamber
    const avIntervalMs = this.calculateAVInterval(atrialSpikes, ventricularSpikes);

    // Check for capture
    const captureDetected = this.checkCapture(mergedSpikes);

    // Check for sensing issues
    const sensingIssues = this.detectSensingIssues(mergedSpikes);

    // Generate clinical notes
    const clinicalNotes = this.generateClinicalNotes(mode, pacingRate, avIntervalMs, captureDetected, sensingIssues);

    return {
      pacemakerDetected: true,
      mode,
      spikes: mergedSpikes,
      atrialSpikes,
      ventricularSpikes,
      pacingRate,
      avIntervalMs,
      captureDetected,
      sensingIssues,
      clinicalNotes,
      confidence: this.calculateConfidence(mergedSpikes),
    };
  }

  /**
   * Detect spikes in a single lead
   */
  private detectSpikesInLead(data: number[], leadName: LeadName): PacemakerSpike[] {
    const spikes: PacemakerSpike[] = [];

    // Calculate baseline noise level
    const noiseLevel = this.calculateNoiseLevel(data);

    // Look for sharp, narrow deflections
    for (let i = 2; i < data.length - 2; i++) {
      // Calculate first derivative (rate of change)
      const derivative = data[i] - data[i - 1];
      const nextDerivative = data[i + 1] - data[i];

      // Pacemaker spike has very rapid rise and fall
      const isSharpRise = Math.abs(derivative) > noiseLevel * this.MIN_SPIKE_SHARPNESS;
      const isSharpFall = Math.abs(nextDerivative) > noiseLevel * this.MIN_SPIKE_SHARPNESS;
      const isOppositeDirection = Math.sign(derivative) !== Math.sign(nextDerivative);

      if (isSharpRise && isSharpFall && isOppositeDirection) {
        // Check amplitude
        const amplitude = Math.abs(data[i] - (data[i - 2] + data[i + 2]) / 2);

        if (amplitude > this.MIN_SPIKE_AMPLITUDE) {
          // Calculate width
          const widthMs = 1000 / this.sampleRate; // Approximately 1 sample wide

          spikes.push({
            time: i / this.sampleRate,
            sampleIndex: i,
            amplitude: amplitude / 1000, // Convert to mV
            widthMs,
            type: 'unknown',
            confidence: this.calculateSpikeConfidence(amplitude, widthMs, noiseLevel),
            bestLead: leadName,
          });
        }
      }
    }

    // Remove duplicates within same spike
    return this.removeNearbyDuplicates(spikes, 5);
  }

  /**
   * Calculate noise level of signal
   */
  private calculateNoiseLevel(data: number[]): number {
    // Use median absolute deviation of first differences
    const diffs: number[] = [];
    for (let i = 1; i < data.length; i++) {
      diffs.push(Math.abs(data[i] - data[i - 1]));
    }
    diffs.sort((a, b) => a - b);
    return diffs[Math.floor(diffs.length / 2)] || 1;
  }

  /**
   * Remove duplicate spikes that are very close in time
   */
  private removeNearbyDuplicates(spikes: PacemakerSpike[], maxSamples: number): PacemakerSpike[] {
    if (spikes.length === 0) return [];

    const result: PacemakerSpike[] = [spikes[0]];

    for (let i = 1; i < spikes.length; i++) {
      const last = result[result.length - 1];
      if (spikes[i].sampleIndex - last.sampleIndex > maxSamples) {
        result.push(spikes[i]);
      } else if (spikes[i].confidence > last.confidence) {
        result[result.length - 1] = spikes[i];
      }
    }

    return result;
  }

  /**
   * Merge spikes from different leads that occur at the same time
   */
  private mergeSpikesAcrossLeads(spikes: PacemakerSpike[]): PacemakerSpike[] {
    if (spikes.length === 0) return [];

    // Sort by time
    spikes.sort((a, b) => a.time - b.time);

    const merged: PacemakerSpike[] = [];
    let currentGroup: PacemakerSpike[] = [spikes[0]];

    for (let i = 1; i < spikes.length; i++) {
      // If within 10ms of previous, same spike
      if (spikes[i].time - currentGroup[0].time < 0.010) {
        currentGroup.push(spikes[i]);
      } else {
        // Merge current group
        merged.push(this.mergeSpikeGroup(currentGroup));
        currentGroup = [spikes[i]];
      }
    }

    // Don't forget last group
    if (currentGroup.length > 0) {
      merged.push(this.mergeSpikeGroup(currentGroup));
    }

    return merged;
  }

  /**
   * Merge a group of spikes from different leads into one
   */
  private mergeSpikeGroup(group: PacemakerSpike[]): PacemakerSpike {
    // Use highest confidence spike as base
    group.sort((a, b) => b.confidence - a.confidence);
    const best = group[0];

    // Average the amplitudes
    const avgAmplitude = group.reduce((sum, s) => sum + s.amplitude, 0) / group.length;

    // Increase confidence if seen in multiple leads
    const confidenceBoost = Math.min(0.2, group.length * 0.05);

    return {
      ...best,
      amplitude: avgAmplitude,
      confidence: Math.min(1, best.confidence + confidenceBoost),
    };
  }

  /**
   * Classify spikes as atrial or ventricular based on timing
   */
  private classifySpikes(spikes: PacemakerSpike[]): void {
    if (spikes.length < 2) {
      spikes.forEach(s => { s.type = 'ventricular'; });
      return;
    }

    // Calculate intervals between spikes
    const intervals: number[] = [];
    for (let i = 1; i < spikes.length; i++) {
      intervals.push(spikes[i].time - spikes[i - 1].time);
    }

    // Look for pairs with short AV interval (100-300ms)
    for (let i = 0; i < spikes.length - 1; i++) {
      const interval = spikes[i + 1].time - spikes[i].time;

      // Typical AV delay is 120-250ms
      if (interval >= 0.100 && interval <= 0.300) {
        spikes[i].type = 'atrial';
        spikes[i + 1].type = 'ventricular';
        i++; // Skip next spike
      }
    }

    // Remaining spikes are likely ventricular (VVI pacing)
    for (const spike of spikes) {
      if (spike.type === 'unknown') {
        spike.type = 'ventricular';
      }
    }
  }

  /**
   * Determine pacing mode based on spike patterns
   */
  private determinePacingMode(
    atrialSpikes: PacemakerSpike[],
    ventricularSpikes: PacemakerSpike[]
  ): PacemakerMode {
    const hasAtrial = atrialSpikes.length > 0;
    const hasVentricular = ventricularSpikes.length > 0;

    if (hasAtrial && hasVentricular) {
      return 'DDD';
    } else if (hasAtrial && !hasVentricular) {
      return 'AAI';
    } else if (hasVentricular && !hasAtrial) {
      return 'VVI';
    }

    return 'UNKNOWN';
  }

  /**
   * Calculate pacing rate from spike intervals
   */
  private calculatePacingRate(spikes: PacemakerSpike[]): number {
    if (spikes.length < 2) return 0;

    // Calculate intervals between ventricular spikes
    const ventricularSpikes = spikes.filter(s => s.type === 'ventricular');

    if (ventricularSpikes.length < 2) {
      // Use all spikes if no ventricular classification
      const totalTime = spikes[spikes.length - 1].time - spikes[0].time;
      return totalTime > 0 ? (spikes.length - 1) / totalTime * 60 : 0;
    }

    const totalTime = ventricularSpikes[ventricularSpikes.length - 1].time - ventricularSpikes[0].time;
    return totalTime > 0 ? (ventricularSpikes.length - 1) / totalTime * 60 : 0;
  }

  /**
   * Calculate AV interval for dual chamber pacing
   */
  private calculateAVInterval(
    atrialSpikes: PacemakerSpike[],
    ventricularSpikes: PacemakerSpike[]
  ): number | undefined {
    if (atrialSpikes.length === 0 || ventricularSpikes.length === 0) {
      return undefined;
    }

    const intervals: number[] = [];

    for (const atrial of atrialSpikes) {
      // Find next ventricular spike
      const nextV = ventricularSpikes.find(v => v.time > atrial.time && v.time - atrial.time < 0.400);

      if (nextV) {
        intervals.push((nextV.time - atrial.time) * 1000); // Convert to ms
      }
    }

    if (intervals.length === 0) return undefined;

    // Return median AV interval
    intervals.sort((a, b) => a - b);
    return intervals[Math.floor(intervals.length / 2)];
  }

  /**
   * Check if pacemaker spikes show capture
   */
  private checkCapture(spikes: PacemakerSpike[]): boolean {
    // For each spike, look for a QRS complex following within 50ms
    // This is a simplified check - in reality would need QRS detection
    for (const spike of spikes.filter(s => s.type === 'ventricular')) {
      const leadData = this.leads[spike.bestLead];
      if (!leadData) continue;

      const startIdx = spike.sampleIndex;
      const endIdx = Math.min(startIdx + Math.ceil(0.150 * this.sampleRate), leadData.length);

      // Look for significant amplitude change after spike (indicating QRS)
      let maxAmplitude = 0;
      for (let i = startIdx; i < endIdx; i++) {
        maxAmplitude = Math.max(maxAmplitude, Math.abs(leadData[i] - leadData[startIdx]));
      }

      // If we see significant amplitude (> 0.5mV), assume capture
      if (maxAmplitude > 500) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect sensing issues
   */
  private detectSensingIssues(spikes: PacemakerSpike[]): SensingIssue[] {
    const issues: SensingIssue[] = [];

    // Check for undersensing (spikes too close together)
    for (let i = 1; i < spikes.length; i++) {
      const interval = spikes[i].time - spikes[i - 1].time;

      // If interval is very short (< 300ms), possible undersensing
      if (interval < 0.300) {
        issues.push({
          type: 'undersensing',
          time: spikes[i].time,
          description: `Short pacing interval (${(interval * 1000).toFixed(0)}ms) suggests possible undersensing`,
        });
      }
    }

    // Check for regular pacing pattern interrupted (failure to pace)
    if (spikes.length >= 4) {
      const intervals: number[] = [];
      for (let i = 1; i < spikes.length; i++) {
        intervals.push(spikes[i].time - spikes[i - 1].time);
      }

      const medianInterval = [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)];

      for (let i = 0; i < intervals.length; i++) {
        // If interval is > 1.5x median, possible failure to pace
        if (intervals[i] > medianInterval * 1.5 && intervals[i] > 1.5) {
          issues.push({
            type: 'failure_to_pace',
            time: spikes[i].time,
            description: `Long pause (${(intervals[i] * 1000).toFixed(0)}ms) may indicate failure to pace`,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Generate clinical notes
   */
  private generateClinicalNotes(
    mode: PacemakerMode,
    pacingRate: number,
    avIntervalMs: number | undefined,
    captureDetected: boolean,
    sensingIssues: SensingIssue[]
  ): string[] {
    const notes: string[] = [];

    notes.push(`Pacemaker rhythm detected - Mode: ${mode}`);
    notes.push(`Pacing rate: ${pacingRate.toFixed(0)} bpm`);

    if (avIntervalMs !== undefined) {
      notes.push(`AV interval: ${avIntervalMs.toFixed(0)} ms`);
    }

    if (captureDetected) {
      notes.push('Ventricular capture appears present');
    } else {
      notes.push('⚠️ Unable to confirm ventricular capture - review manually');
    }

    if (sensingIssues.length > 0) {
      const undersensing = sensingIssues.filter(i => i.type === 'undersensing');
      const failureToPace = sensingIssues.filter(i => i.type === 'failure_to_pace');

      if (undersensing.length > 0) {
        notes.push(`⚠️ ${undersensing.length} episodes of possible undersensing detected`);
      }
      if (failureToPace.length > 0) {
        notes.push(`⚠️ ${failureToPace.length} episodes of possible failure to pace detected`);
      }
    }

    return notes;
  }

  /**
   * Calculate spike detection confidence
   */
  private calculateSpikeConfidence(amplitude: number, widthMs: number, noiseLevel: number): number {
    let confidence = 0.5;

    // Higher amplitude = higher confidence
    if (amplitude > this.MIN_SPIKE_AMPLITUDE * 2) confidence += 0.15;
    if (amplitude > this.MIN_SPIKE_AMPLITUDE * 4) confidence += 0.1;

    // Very narrow spikes are more likely pacemaker
    if (widthMs < 1) confidence += 0.15;
    if (widthMs < 0.5) confidence += 0.1;

    // High signal-to-noise ratio
    const snr = amplitude / (noiseLevel + 1);
    if (snr > 10) confidence += 0.1;
    if (snr > 20) confidence += 0.1;

    return Math.min(1, confidence);
  }

  /**
   * Calculate overall detection confidence
   */
  private calculateConfidence(spikes: PacemakerSpike[]): number {
    if (spikes.length === 0) return 0;

    // Average spike confidence
    const avgConfidence = spikes.reduce((sum, s) => sum + s.confidence, 0) / spikes.length;

    // Boost if we see regular pattern
    const intervals: number[] = [];
    for (let i = 1; i < spikes.length; i++) {
      intervals.push(spikes[i].time - spikes[i - 1].time);
    }

    if (intervals.length > 2) {
      const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, i) => sum + Math.pow(i - mean, 2), 0) / intervals.length;
      const cv = Math.sqrt(variance) / mean; // Coefficient of variation

      // Low CV = regular pattern = higher confidence
      if (cv < 0.1) return Math.min(1, avgConfidence + 0.15);
      if (cv < 0.2) return Math.min(1, avgConfidence + 0.1);
    }

    return avgConfidence;
  }

  /**
   * Get pacemaker spike annotations for display
   */
  getSpikeAnnotations(): Array<{ time: number; type: string; label: string }> {
    const result = this.detect();

    return result.spikes.map(spike => ({
      time: spike.time,
      type: spike.type,
      label: spike.type === 'atrial' ? 'A' : 'V',
    }));
  }
}

/**
 * Convenience function for pacemaker detection
 */
export function detectPacemaker(
  leads: Partial<Record<LeadName, number[]>>,
  sampleRate: number
): PacemakerDetectionResult {
  const detector = new PacemakerDetector(leads, sampleRate);
  return detector.detect();
}
