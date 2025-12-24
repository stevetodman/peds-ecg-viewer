/**
 * Serial ECG Comparison
 * Compare current ECG with prior ECGs to detect changes
 *
 * Critical for:
 * - Detecting new ischemic changes
 * - Tracking disease progression
 * - Identifying new arrhythmias
 * - Confirming chronic vs acute findings
 *
 * @module signal/loader/png-digitizer/signal/serial-comparison
 */

import type { LeadName } from '../types';

/**
 * Change significance level
 */
export type ChangeSignificance = 'no_change' | 'minor' | 'moderate' | 'significant' | 'critical';

/**
 * Change direction
 */
export type ChangeDirection = 'increased' | 'decreased' | 'new' | 'resolved' | 'unchanged';

/**
 * Individual parameter change
 */
export interface ParameterChange {
  /** Parameter name */
  parameter: string;

  /** Current value */
  currentValue: number | string;

  /** Prior value */
  priorValue: number | string;

  /** Change amount (for numeric) */
  change?: number;

  /** Change percentage (for numeric) */
  changePercent?: number;

  /** Direction of change */
  direction: ChangeDirection;

  /** Significance */
  significance: ChangeSignificance;

  /** Clinical interpretation */
  interpretation: string;
}

/**
 * Lead-specific changes
 */
export interface LeadChange {
  /** Lead name */
  lead: LeadName;

  /** Changes in this lead */
  changes: ParameterChange[];

  /** Overall significance for this lead */
  significance: ChangeSignificance;

  /** Summary of changes */
  summary: string;
}

/**
 * Interval changes
 */
export interface IntervalChanges {
  /** Heart rate change */
  heartRate?: ParameterChange;

  /** PR interval change */
  prInterval?: ParameterChange;

  /** QRS duration change */
  qrsDuration?: ParameterChange;

  /** QTc change */
  qtc?: ParameterChange;
}

/**
 * ST-T changes
 */
export interface STTChanges {
  /** New ST elevation (leads) */
  newSTElevation: LeadName[];

  /** Resolved ST elevation */
  resolvedSTElevation: LeadName[];

  /** New ST depression */
  newSTDepression: LeadName[];

  /** Resolved ST depression */
  resolvedSTDepression: LeadName[];

  /** New T wave inversion */
  newTInversion: LeadName[];

  /** Resolved T wave inversion */
  resolvedTInversion: LeadName[];

  /** Dynamic ST-T changes present */
  dynamicChanges: boolean;

  /** Ischemic significance */
  ischemicSignificance: ChangeSignificance;
}

/**
 * Rhythm changes
 */
export interface RhythmChanges {
  /** Current rhythm */
  currentRhythm: string;

  /** Prior rhythm */
  priorRhythm: string;

  /** Rhythm changed */
  rhythmChanged: boolean;

  /** New arrhythmia */
  newArrhythmia: boolean;

  /** Resolved arrhythmia */
  resolvedArrhythmia: boolean;

  /** Description */
  description: string;
}

/**
 * Serial comparison result
 */
export interface SerialComparisonResult {
  /** Overall change significance */
  overallSignificance: ChangeSignificance;

  /** Interval changes */
  intervalChanges: IntervalChanges;

  /** ST-T changes */
  sttChanges: STTChanges;

  /** Rhythm changes */
  rhythmChanges: RhythmChanges;

  /** Per-lead changes */
  leadChanges: Partial<Record<LeadName, LeadChange>>;

  /** Critical changes requiring immediate attention */
  criticalChanges: string[];

  /** All significant findings */
  significantFindings: string[];

  /** Comparison summary */
  summary: string[];

  /** Time between ECGs */
  timeDelta?: {
    days: number;
    hours: number;
  };

  /** Confidence in comparison */
  confidence: number;

  /** Comparison valid */
  isValid: boolean;

  /** Reason if invalid */
  invalidReason?: string;
}

/**
 * ECG data for comparison
 */
export interface ECGForComparison {
  /** Lead data */
  leads: Partial<Record<LeadName, number[]>>;

  /** Sample rate */
  sampleRate: number;

  /** Recording timestamp */
  timestamp?: Date;

  /** Pre-computed intervals (optional) */
  intervals?: {
    heartRate?: number;
    prInterval?: number;
    qrsDuration?: number;
    qtc?: number;
  };

  /** Pre-computed ST levels per lead (optional) */
  stLevels?: Partial<Record<LeadName, number>>;

  /** Rhythm classification (optional) */
  rhythm?: string;
}

/**
 * Serial ECG Comparator
 */
export class SerialECGComparator {
  private current: ECGForComparison;
  private prior: ECGForComparison;

  constructor(current: ECGForComparison, prior: ECGForComparison) {
    this.current = current;
    this.prior = prior;
  }

  /**
   * Compare ECGs
   */
  compare(): SerialComparisonResult {
    // Validate comparison is possible
    const validation = this.validateComparison();
    if (!validation.valid) {
      return this.createInvalidResult(validation.reason);
    }

    // Compare intervals
    const intervalChanges = this.compareIntervals();

    // Compare ST-T changes
    const sttChanges = this.compareSTT();

    // Compare rhythm
    const rhythmChanges = this.compareRhythm();

    // Compare each lead
    const leadChanges = this.compareLeads();

    // Collect critical changes
    const criticalChanges: string[] = [];
    const significantFindings: string[] = [];

    // Check for critical ST changes
    if (sttChanges.newSTElevation.length >= 2) {
      criticalChanges.push(
        `NEW ST ELEVATION in ${sttChanges.newSTElevation.join(', ')} - possible acute STEMI`
      );
    }

    if (sttChanges.dynamicChanges && sttChanges.ischemicSignificance === 'critical') {
      criticalChanges.push('Dynamic ST-T changes suggesting acute ischemia');
    }

    // Check for new arrhythmia
    if (rhythmChanges.newArrhythmia) {
      const urgency = this.getArrhythmiaUrgency(rhythmChanges.currentRhythm);
      if (urgency === 'critical') {
        criticalChanges.push(`NEW ${rhythmChanges.currentRhythm.toUpperCase()}`);
      } else {
        significantFindings.push(`New arrhythmia: ${rhythmChanges.currentRhythm}`);
      }
    }

    // Check for significant interval changes
    if (intervalChanges.qtc?.significance === 'critical') {
      criticalChanges.push(
        `Marked QTc prolongation: ${intervalChanges.qtc.currentValue}ms ` +
        `(was ${intervalChanges.qtc.priorValue}ms)`
      );
    }

    if (intervalChanges.qrsDuration?.significance === 'significant') {
      significantFindings.push(
        `QRS widening: ${intervalChanges.qrsDuration.currentValue}ms ` +
        `(was ${intervalChanges.qrsDuration.priorValue}ms)`
      );
    }

    // Collect significant ST-T findings
    if (sttChanges.newSTDepression.length > 0) {
      significantFindings.push(
        `New ST depression in ${sttChanges.newSTDepression.join(', ')}`
      );
    }

    if (sttChanges.newTInversion.length > 0) {
      significantFindings.push(
        `New T wave inversion in ${sttChanges.newTInversion.join(', ')}`
      );
    }

    // Determine overall significance
    let overallSignificance: ChangeSignificance = 'no_change';
    if (criticalChanges.length > 0) {
      overallSignificance = 'critical';
    } else if (significantFindings.length > 0) {
      overallSignificance = 'significant';
    } else if (sttChanges.dynamicChanges || rhythmChanges.rhythmChanged) {
      overallSignificance = 'moderate';
    } else if (Object.values(intervalChanges).some(c => c?.significance === 'minor')) {
      overallSignificance = 'minor';
    }

    // Generate summary
    const summary = this.generateSummary(
      intervalChanges,
      sttChanges,
      rhythmChanges,
      criticalChanges,
      significantFindings
    );

    // Calculate time delta
    let timeDelta: SerialComparisonResult['timeDelta'];
    if (this.current.timestamp && this.prior.timestamp) {
      const diffMs = this.current.timestamp.getTime() - this.prior.timestamp.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      timeDelta = {
        days: Math.floor(diffHours / 24),
        hours: Math.round(diffHours % 24),
      };
    }

    return {
      overallSignificance,
      intervalChanges,
      sttChanges,
      rhythmChanges,
      leadChanges,
      criticalChanges,
      significantFindings,
      summary,
      timeDelta,
      confidence: 0.8,
      isValid: true,
    };
  }

  /**
   * Validate comparison is possible
   */
  private validateComparison(): { valid: boolean; reason: string } {
    // Check both ECGs have data
    const currentLeadCount = Object.keys(this.current.leads).length;
    const priorLeadCount = Object.keys(this.prior.leads).length;

    if (currentLeadCount === 0) {
      return { valid: false, reason: 'Current ECG has no leads' };
    }

    if (priorLeadCount === 0) {
      return { valid: false, reason: 'Prior ECG has no leads' };
    }

    // Check for overlapping leads
    const currentLeads = new Set(Object.keys(this.current.leads));
    const priorLeads = new Set(Object.keys(this.prior.leads));
    const commonLeads = [...currentLeads].filter(l => priorLeads.has(l));

    if (commonLeads.length < 3) {
      return { valid: false, reason: 'Too few common leads for comparison' };
    }

    return { valid: true, reason: '' };
  }

  /**
   * Compare interval measurements
   */
  private compareIntervals(): IntervalChanges {
    const changes: IntervalChanges = {};

    // Get intervals (pre-computed or calculate)
    const currentIntervals = this.current.intervals || this.calculateIntervals(this.current);
    const priorIntervals = this.prior.intervals || this.calculateIntervals(this.prior);

    // Heart rate
    if (currentIntervals.heartRate !== undefined && priorIntervals.heartRate !== undefined) {
      changes.heartRate = this.compareNumericParameter(
        'Heart Rate',
        currentIntervals.heartRate,
        priorIntervals.heartRate,
        { minorThreshold: 10, significantThreshold: 20, unit: 'bpm' }
      );
    }

    // PR interval
    if (currentIntervals.prInterval !== undefined && priorIntervals.prInterval !== undefined) {
      changes.prInterval = this.compareNumericParameter(
        'PR Interval',
        currentIntervals.prInterval,
        priorIntervals.prInterval,
        { minorThreshold: 20, significantThreshold: 40, unit: 'ms' }
      );
    }

    // QRS duration
    if (currentIntervals.qrsDuration !== undefined && priorIntervals.qrsDuration !== undefined) {
      changes.qrsDuration = this.compareNumericParameter(
        'QRS Duration',
        currentIntervals.qrsDuration,
        priorIntervals.qrsDuration,
        { minorThreshold: 10, significantThreshold: 20, unit: 'ms' }
      );
    }

    // QTc
    if (currentIntervals.qtc !== undefined && priorIntervals.qtc !== undefined) {
      changes.qtc = this.compareNumericParameter(
        'QTc',
        currentIntervals.qtc,
        priorIntervals.qtc,
        { minorThreshold: 20, significantThreshold: 40, criticalThreshold: 60, unit: 'ms' }
      );
    }

    return changes;
  }

  /**
   * Compare ST-T changes
   */
  private compareSTT(): STTChanges {
    const newSTElevation: LeadName[] = [];
    const resolvedSTElevation: LeadName[] = [];
    const newSTDepression: LeadName[] = [];
    const resolvedSTDepression: LeadName[] = [];
    const newTInversion: LeadName[] = [];
    const resolvedTInversion: LeadName[] = [];

    // Get ST levels
    const currentST = this.current.stLevels || this.measureSTLevels(this.current);
    const priorST = this.prior.stLevels || this.measureSTLevels(this.prior);

    const stThreshold = 0.1; // 1mm = 0.1mV

    for (const lead of Object.keys(currentST) as LeadName[]) {
      const currentLevel = currentST[lead] || 0;
      const priorLevel = priorST[lead] || 0;

      // Check for new ST elevation
      if (currentLevel > stThreshold && priorLevel <= stThreshold) {
        newSTElevation.push(lead);
      }

      // Check for resolved ST elevation
      if (currentLevel <= stThreshold && priorLevel > stThreshold) {
        resolvedSTElevation.push(lead);
      }

      // Check for new ST depression
      if (currentLevel < -stThreshold && priorLevel >= -stThreshold) {
        newSTDepression.push(lead);
      }

      // Check for resolved ST depression
      if (currentLevel >= -stThreshold && priorLevel < -stThreshold) {
        resolvedSTDepression.push(lead);
      }
    }

    // Check T wave changes (would need T wave amplitude data)
    // For now, detect based on ST segment behavior

    const dynamicChanges =
      newSTElevation.length > 0 ||
      newSTDepression.length > 0 ||
      resolvedSTElevation.length > 0 ||
      resolvedSTDepression.length > 0;

    let ischemicSignificance: ChangeSignificance = 'no_change';
    if (newSTElevation.length >= 2) {
      ischemicSignificance = 'critical';
    } else if (newSTDepression.length >= 2 || newSTElevation.length >= 1) {
      ischemicSignificance = 'significant';
    } else if (dynamicChanges) {
      ischemicSignificance = 'moderate';
    }

    return {
      newSTElevation,
      resolvedSTElevation,
      newSTDepression,
      resolvedSTDepression,
      newTInversion,
      resolvedTInversion,
      dynamicChanges,
      ischemicSignificance,
    };
  }

  /**
   * Compare rhythm
   */
  private compareRhythm(): RhythmChanges {
    const currentRhythm = this.current.rhythm || this.detectRhythm(this.current);
    const priorRhythm = this.prior.rhythm || this.detectRhythm(this.prior);

    const rhythmChanged = currentRhythm !== priorRhythm;

    // Determine if new arrhythmia
    const normalRhythms = ['sinus rhythm', 'normal sinus rhythm', 'sinus bradycardia', 'sinus tachycardia'];
    const wasNormal = normalRhythms.some(r => priorRhythm.toLowerCase().includes(r));
    const isNormal = normalRhythms.some(r => currentRhythm.toLowerCase().includes(r));

    const newArrhythmia = wasNormal && !isNormal;
    const resolvedArrhythmia = !wasNormal && isNormal;

    let description = '';
    if (!rhythmChanged) {
      description = `Rhythm unchanged: ${currentRhythm}`;
    } else if (newArrhythmia) {
      description = `NEW ARRHYTHMIA: ${priorRhythm} → ${currentRhythm}`;
    } else if (resolvedArrhythmia) {
      description = `Arrhythmia resolved: ${priorRhythm} → ${currentRhythm}`;
    } else {
      description = `Rhythm change: ${priorRhythm} → ${currentRhythm}`;
    }

    return {
      currentRhythm,
      priorRhythm,
      rhythmChanged,
      newArrhythmia,
      resolvedArrhythmia,
      description,
    };
  }

  /**
   * Compare individual leads
   */
  private compareLeads(): Partial<Record<LeadName, LeadChange>> {
    const leadChanges: Partial<Record<LeadName, LeadChange>> = {};

    const allLeads = new Set([
      ...Object.keys(this.current.leads),
      ...Object.keys(this.prior.leads),
    ]) as Set<LeadName>;

    for (const lead of allLeads) {
      const currentData = this.current.leads[lead];
      const priorData = this.prior.leads[lead];

      if (!currentData || !priorData) continue;

      const changes: ParameterChange[] = [];

      // Compare R wave amplitude
      const currentR = this.measureRWaveAmplitude(currentData, this.current.sampleRate);
      const priorR = this.measureRWaveAmplitude(priorData, this.prior.sampleRate);

      if (currentR > 0 && priorR > 0) {
        const rChange = this.compareNumericParameter(
          'R wave amplitude',
          currentR,
          priorR,
          { minorThreshold: 0.2, significantThreshold: 0.5, unit: 'mV' }
        );
        if (rChange.significance !== 'no_change') {
          changes.push(rChange);
        }
      }

      // Determine lead significance
      let significance: ChangeSignificance = 'no_change';
      if (changes.some(c => c.significance === 'critical')) significance = 'critical';
      else if (changes.some(c => c.significance === 'significant')) significance = 'significant';
      else if (changes.some(c => c.significance === 'moderate')) significance = 'moderate';
      else if (changes.some(c => c.significance === 'minor')) significance = 'minor';

      if (changes.length > 0) {
        leadChanges[lead] = {
          lead,
          changes,
          significance,
          summary: changes.map(c => c.interpretation).join('; '),
        };
      }
    }

    return leadChanges;
  }

  /**
   * Compare numeric parameter
   */
  private compareNumericParameter(
    name: string,
    current: number,
    prior: number,
    thresholds: {
      minorThreshold: number;
      significantThreshold: number;
      criticalThreshold?: number;
      unit: string;
    }
  ): ParameterChange {
    const change = current - prior;
    const changePercent = prior !== 0 ? (change / prior) * 100 : 0;
    const absChange = Math.abs(change);

    let direction: ChangeDirection = 'unchanged';
    if (change > 0) direction = 'increased';
    else if (change < 0) direction = 'decreased';

    let significance: ChangeSignificance = 'no_change';
    if (thresholds.criticalThreshold && absChange >= thresholds.criticalThreshold) {
      significance = 'critical';
    } else if (absChange >= thresholds.significantThreshold) {
      significance = 'significant';
    } else if (absChange >= thresholds.minorThreshold) {
      significance = 'minor';
    }

    const interpretation =
      significance === 'no_change'
        ? `${name} unchanged at ${current}${thresholds.unit}`
        : `${name} ${direction} from ${prior} to ${current}${thresholds.unit} ` +
          `(${change > 0 ? '+' : ''}${change.toFixed(0)}${thresholds.unit})`;

    return {
      parameter: name,
      currentValue: current,
      priorValue: prior,
      change,
      changePercent,
      direction,
      significance,
      interpretation,
    };
  }

  /**
   * Calculate basic intervals
   */
  private calculateIntervals(ecg: ECGForComparison): {
    heartRate?: number;
    prInterval?: number;
    qrsDuration?: number;
    qtc?: number;
  } {
    const lead = ecg.leads['II'] || ecg.leads['I'] || Object.values(ecg.leads)[0];
    if (!lead || lead.length < ecg.sampleRate) return {};

    // Detect R peaks
    const rPeaks = this.detectRPeaks(lead, ecg.sampleRate);
    if (rPeaks.length < 2) return {};

    // Calculate heart rate
    const rrIntervals = rPeaks.slice(1).map((r, i) => (r - rPeaks[i]) * 1000 / ecg.sampleRate);
    const avgRR = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
    const heartRate = Math.round(60000 / avgRR);

    return { heartRate };
  }

  /**
   * Measure ST levels per lead
   */
  private measureSTLevels(ecg: ECGForComparison): Partial<Record<LeadName, number>> {
    const stLevels: Partial<Record<LeadName, number>> = {};

    for (const [lead, samples] of Object.entries(ecg.leads) as [LeadName, number[]][]) {
      if (!samples || samples.length < ecg.sampleRate) continue;

      const rPeaks = this.detectRPeaks(samples, ecg.sampleRate);
      if (rPeaks.length === 0) continue;

      // Measure ST deviation
      let totalST = 0;
      let count = 0;

      for (const rIdx of rPeaks) {
        const jPoint = rIdx + Math.floor(ecg.sampleRate * 0.08);
        const stPoint = jPoint + Math.floor(ecg.sampleRate * 0.04);

        if (stPoint >= samples.length) continue;

        // Baseline
        const prStart = Math.max(0, rIdx - Math.floor(ecg.sampleRate * 0.15));
        const prEnd = rIdx - Math.floor(ecg.sampleRate * 0.05);
        const prSegment = samples.slice(prStart, prEnd);
        const baseline = prSegment.reduce((a, b) => a + b, 0) / prSegment.length;

        totalST += (samples[stPoint] - baseline) / 1000; // mV
        count++;
      }

      if (count > 0) {
        stLevels[lead] = totalST / count;
      }
    }

    return stLevels;
  }

  /**
   * Detect rhythm (simplified)
   */
  private detectRhythm(ecg: ECGForComparison): string {
    const lead = ecg.leads['II'] || Object.values(ecg.leads)[0];
    if (!lead) return 'Unknown';

    const rPeaks = this.detectRPeaks(lead, ecg.sampleRate);
    if (rPeaks.length < 3) return 'Unknown';

    // Calculate heart rate
    const rrIntervals = rPeaks.slice(1).map((r, i) => (r - rPeaks[i]) * 1000 / ecg.sampleRate);
    const avgRR = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
    const heartRate = 60000 / avgRR;

    // Check regularity
    const rrVariance = rrIntervals.reduce((sum, rr) =>
      sum + Math.pow(rr - avgRR, 2), 0) / rrIntervals.length;
    const rrStdDev = Math.sqrt(rrVariance);
    const isRegular = rrStdDev < 100;

    if (heartRate < 60) {
      return isRegular ? 'Sinus bradycardia' : 'Irregular bradycardia';
    } else if (heartRate > 100) {
      return isRegular ? 'Sinus tachycardia' : 'Irregular tachycardia';
    } else {
      return isRegular ? 'Normal sinus rhythm' : 'Irregular rhythm';
    }
  }

  /**
   * Detect R peaks
   */
  private detectRPeaks(samples: number[], sampleRate: number): number[] {
    const peaks: number[] = [];
    const threshold = Math.max(...samples.map(Math.abs)) * 0.4;
    const minRR = Math.floor(sampleRate * 0.3);

    let lastPeak = -minRR;

    for (let i = 1; i < samples.length - 1; i++) {
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
   * Measure R wave amplitude
   */
  private measureRWaveAmplitude(samples: number[], sampleRate: number): number {
    const rPeaks = this.detectRPeaks(samples, sampleRate);
    if (rPeaks.length === 0) return 0;

    const amplitudes = rPeaks.map(idx => samples[idx] / 1000); // mV
    return amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length;
  }

  /**
   * Get arrhythmia urgency
   */
  private getArrhythmiaUrgency(rhythm: string): 'critical' | 'urgent' | 'moderate' {
    const lower = rhythm.toLowerCase();

    if (
      lower.includes('ventricular fibrillation') ||
      lower.includes('ventricular tachycardia') ||
      lower.includes('complete heart block') ||
      lower.includes('asystole')
    ) {
      return 'critical';
    }

    if (
      lower.includes('atrial fibrillation') ||
      lower.includes('atrial flutter') ||
      lower.includes('svt')
    ) {
      return 'urgent';
    }

    return 'moderate';
  }

  /**
   * Generate comparison summary
   */
  private generateSummary(
    intervals: IntervalChanges,
    stt: STTChanges,
    rhythm: RhythmChanges,
    critical: string[],
    significant: string[]
  ): string[] {
    const summary: string[] = [];

    if (critical.length > 0) {
      summary.push('CRITICAL CHANGES DETECTED:');
      summary.push(...critical.map(c => `  - ${c}`));
    }

    if (significant.length > 0) {
      summary.push('Significant findings:');
      summary.push(...significant.map(s => `  - ${s}`));
    }

    if (rhythm.rhythmChanged) {
      summary.push(rhythm.description);
    }

    if (stt.resolvedSTElevation.length > 0) {
      summary.push(`ST elevation resolved in ${stt.resolvedSTElevation.join(', ')}`);
    }

    if (Object.values(intervals).some(i => i?.significance !== 'no_change')) {
      const changedIntervals = Object.values(intervals)
        .filter(i => i && i.significance !== 'no_change')
        .map(i => i!.interpretation);
      summary.push(...changedIntervals);
    }

    if (summary.length === 0) {
      summary.push('No significant changes from prior ECG');
    }

    return summary;
  }

  /**
   * Create invalid result
   */
  private createInvalidResult(reason: string): SerialComparisonResult {
    return {
      overallSignificance: 'no_change',
      intervalChanges: {},
      sttChanges: {
        newSTElevation: [],
        resolvedSTElevation: [],
        newSTDepression: [],
        resolvedSTDepression: [],
        newTInversion: [],
        resolvedTInversion: [],
        dynamicChanges: false,
        ischemicSignificance: 'no_change',
      },
      rhythmChanges: {
        currentRhythm: 'Unknown',
        priorRhythm: 'Unknown',
        rhythmChanged: false,
        newArrhythmia: false,
        resolvedArrhythmia: false,
        description: '',
      },
      leadChanges: {},
      criticalChanges: [],
      significantFindings: [],
      summary: [`Comparison not possible: ${reason}`],
      confidence: 0,
      isValid: false,
      invalidReason: reason,
    };
  }
}

/**
 * Convenience function to compare ECGs
 */
export function compareECGs(
  current: ECGForComparison,
  prior: ECGForComparison
): SerialComparisonResult {
  const comparator = new SerialECGComparator(current, prior);
  return comparator.compare();
}
