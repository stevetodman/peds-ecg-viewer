/**
 * Signal Quality Analyzer
 * Detect artifacts, noise, and quality issues in ECG signals
 *
 * Detects:
 * - Muscle artifact (EMG noise)
 * - Baseline wander
 * - Powerline interference (50/60Hz)
 * - Lead-off / poor contact
 * - Motion artifact
 * - Signal clipping/saturation
 * - Electrode pop
 *
 * @module signal/loader/png-digitizer/signal/signal-quality
 */

import type { LeadName } from '../types';

/**
 * Artifact type
 */
export type ArtifactType =
  | 'muscle_artifact'
  | 'baseline_wander'
  | 'powerline_interference'
  | 'lead_off'
  | 'motion_artifact'
  | 'saturation'
  | 'electrode_pop'
  | 'high_frequency_noise'
  | 'low_frequency_noise';

/**
 * Artifact severity
 */
export type ArtifactSeverity = 'none' | 'mild' | 'moderate' | 'severe';

/**
 * Detected artifact
 */
export interface DetectedArtifact {
  /** Artifact type */
  type: ArtifactType;

  /** Severity level */
  severity: ArtifactSeverity;

  /** Affected time range (seconds) */
  timeRange?: { start: number; end: number };

  /** Affected samples (indices) */
  sampleRange?: { start: number; end: number };

  /** Description */
  description: string;

  /** Suggested correction */
  suggestion: string;
}

/**
 * Per-lead quality assessment
 */
export interface LeadQualityAssessment {
  /** Lead name */
  lead: LeadName;

  /** Overall quality score (0-1) */
  qualityScore: number;

  /** Quality classification */
  quality: 'excellent' | 'good' | 'acceptable' | 'poor' | 'unusable';

  /** Signal-to-noise ratio (dB) */
  snr: number;

  /** Detected artifacts */
  artifacts: DetectedArtifact[];

  /** Baseline stability score (0-1) */
  baselineStability: number;

  /** Percentage of samples that are usable */
  usablePercentage: number;

  /** Is lead electrically connected */
  isConnected: boolean;
}

/**
 * Overall signal quality result
 */
export interface SignalQualityResult {
  /** Overall quality score (0-1) */
  overallQuality: number;

  /** Quality classification */
  classification: 'excellent' | 'good' | 'acceptable' | 'poor' | 'unusable';

  /** Per-lead assessments */
  leadAssessments: Partial<Record<LeadName, LeadQualityAssessment>>;

  /** Global artifacts (affecting multiple leads) */
  globalArtifacts: DetectedArtifact[];

  /** Leads with poor quality */
  poorQualityLeads: LeadName[];

  /** Leads that appear disconnected */
  disconnectedLeads: LeadName[];

  /** Recommendations */
  recommendations: string[];

  /** Is signal interpretable */
  isInterpretable: boolean;

  /** Overall SNR (dB) */
  averageSNR: number;
}

/**
 * Signal Quality Analyzer
 */
export class SignalQualityAnalyzer {
  private leads: Partial<Record<LeadName, number[]>>;
  private sampleRate: number;

  constructor(leads: Partial<Record<LeadName, number[]>>, sampleRate: number) {
    this.leads = leads;
    this.sampleRate = sampleRate;
  }

  /**
   * Analyze signal quality
   */
  analyze(): SignalQualityResult {
    const leadAssessments: Partial<Record<LeadName, LeadQualityAssessment>> = {};
    const globalArtifacts: DetectedArtifact[] = [];
    const poorQualityLeads: LeadName[] = [];
    const disconnectedLeads: LeadName[] = [];
    const recommendations: string[] = [];

    // Analyze each lead
    for (const [leadName, samples] of Object.entries(this.leads) as [LeadName, number[]][]) {
      if (!samples || samples.length === 0) continue;

      const assessment = this.assessLead(leadName, samples);
      leadAssessments[leadName] = assessment;

      if (assessment.quality === 'poor' || assessment.quality === 'unusable') {
        poorQualityLeads.push(leadName);
      }

      if (!assessment.isConnected) {
        disconnectedLeads.push(leadName);
      }
    }

    // Check for global artifacts (affecting multiple leads)
    this.detectGlobalArtifacts(leadAssessments, globalArtifacts);

    // Calculate overall metrics
    const assessments = Object.values(leadAssessments);
    const avgQuality = assessments.length > 0
      ? assessments.reduce((sum, a) => sum + a.qualityScore, 0) / assessments.length
      : 0;

    const avgSNR = assessments.length > 0
      ? assessments.reduce((sum, a) => sum + a.snr, 0) / assessments.length
      : 0;

    // Determine overall classification
    let classification: SignalQualityResult['classification'] = 'unusable';
    if (avgQuality >= 0.9) classification = 'excellent';
    else if (avgQuality >= 0.75) classification = 'good';
    else if (avgQuality >= 0.5) classification = 'acceptable';
    else if (avgQuality >= 0.25) classification = 'poor';

    // Generate recommendations
    if (disconnectedLeads.length > 0) {
      recommendations.push(`Check electrode connections for: ${disconnectedLeads.join(', ')}`);
    }

    if (globalArtifacts.some(a => a.type === 'powerline_interference')) {
      recommendations.push('Apply notch filter at 50/60Hz to reduce powerline interference');
    }

    if (globalArtifacts.some(a => a.type === 'baseline_wander')) {
      recommendations.push('Apply high-pass filter (0.5Hz) to reduce baseline wander');
    }

    if (globalArtifacts.some(a => a.type === 'muscle_artifact')) {
      recommendations.push('Patient should relax muscles. Consider low-pass filtering.');
    }

    // Determine if signal is interpretable
    const isInterpretable = avgQuality >= 0.4 && disconnectedLeads.length <= 2;

    return {
      overallQuality: avgQuality,
      classification,
      leadAssessments,
      globalArtifacts,
      poorQualityLeads,
      disconnectedLeads,
      recommendations,
      isInterpretable,
      averageSNR: avgSNR,
    };
  }

  /**
   * Assess single lead quality
   */
  private assessLead(leadName: LeadName, samples: number[]): LeadQualityAssessment {
    const artifacts: DetectedArtifact[] = [];

    // Check for lead-off (flat line or very low amplitude)
    const isConnected = this.checkLeadConnection(samples);
    if (!isConnected) {
      artifacts.push({
        type: 'lead_off',
        severity: 'severe',
        description: 'Lead appears disconnected or has no signal',
        suggestion: 'Check electrode connection and contact',
      });
    }

    // Check for saturation/clipping
    const saturation = this.detectSaturation(samples);
    if (saturation.detected) {
      artifacts.push(saturation.artifact);
    }

    // Check for baseline wander
    const baselineWander = this.detectBaselineWander(samples);
    if (baselineWander.detected) {
      artifacts.push(baselineWander.artifact);
    }

    // Check for powerline interference
    const powerline = this.detectPowerlineInterference(samples);
    if (powerline.detected) {
      artifacts.push(powerline.artifact);
    }

    // Check for muscle artifact
    const muscle = this.detectMuscleArtifact(samples);
    if (muscle.detected) {
      artifacts.push(muscle.artifact);
    }

    // Check for motion artifact
    const motion = this.detectMotionArtifact(samples);
    if (motion.detected) {
      artifacts.push(motion.artifact);
    }

    // Check for electrode pop
    const pop = this.detectElectrodePop(samples);
    if (pop.detected) {
      artifacts.push(pop.artifact);
    }

    // Calculate SNR
    const snr = this.calculateSNR(samples);

    // Calculate baseline stability
    const baselineStability = this.calculateBaselineStability(samples);

    // Calculate usable percentage
    const usablePercentage = this.calculateUsablePercentage(samples, artifacts);

    // Calculate overall quality score
    let qualityScore = 1.0;

    // Reduce for artifacts
    for (const artifact of artifacts) {
      switch (artifact.severity) {
        case 'severe': qualityScore -= 0.4; break;
        case 'moderate': qualityScore -= 0.2; break;
        case 'mild': qualityScore -= 0.1; break;
      }
    }

    // Reduce for low SNR
    if (snr < 10) qualityScore -= 0.3;
    else if (snr < 20) qualityScore -= 0.15;

    // Reduce for baseline instability
    qualityScore -= (1 - baselineStability) * 0.2;

    qualityScore = Math.max(0, Math.min(1, qualityScore));

    // Determine quality classification
    let quality: LeadQualityAssessment['quality'] = 'unusable';
    if (!isConnected) quality = 'unusable';
    else if (qualityScore >= 0.9) quality = 'excellent';
    else if (qualityScore >= 0.75) quality = 'good';
    else if (qualityScore >= 0.5) quality = 'acceptable';
    else if (qualityScore >= 0.25) quality = 'poor';

    return {
      lead: leadName,
      qualityScore,
      quality,
      snr,
      artifacts,
      baselineStability,
      usablePercentage,
      isConnected,
    };
  }

  /**
   * Check if lead is connected (not flat line)
   */
  private checkLeadConnection(samples: number[]): boolean {
    // Check for flat line (very low variance)
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / samples.length;
    const stdDev = Math.sqrt(variance);

    // If std dev is < 5µV, likely disconnected
    return stdDev > 5;
  }

  /**
   * Detect signal saturation/clipping
   */
  private detectSaturation(samples: number[]): { detected: boolean; artifact: DetectedArtifact } {
    const max = Math.max(...samples);
    const min = Math.min(...samples);

    // Count samples at extreme values
    let clippedHigh = 0;
    let clippedLow = 0;
    const threshold = 0.99;

    for (const s of samples) {
      if (s >= max * threshold) clippedHigh++;
      if (s <= min * threshold) clippedLow++;
    }

    const clippedPercent = (clippedHigh + clippedLow) / samples.length;

    let severity: ArtifactSeverity = 'none';
    if (clippedPercent > 0.1) severity = 'severe';
    else if (clippedPercent > 0.05) severity = 'moderate';
    else if (clippedPercent > 0.01) severity = 'mild';

    return {
      detected: severity !== 'none',
      artifact: {
        type: 'saturation',
        severity,
        description: `Signal clipping detected (${(clippedPercent * 100).toFixed(1)}% of samples)`,
        suggestion: 'Reduce gain or check for electrode issues',
      },
    };
  }

  /**
   * Detect baseline wander
   */
  private detectBaselineWander(samples: number[]): { detected: boolean; artifact: DetectedArtifact } {
    // Calculate moving average (1 second window)
    const windowSize = this.sampleRate;
    const baseline: number[] = [];

    for (let i = 0; i < samples.length - windowSize; i += Math.floor(windowSize / 4)) {
      const window = samples.slice(i, i + windowSize);
      baseline.push(window.reduce((a, b) => a + b, 0) / windowSize);
    }

    if (baseline.length < 2) {
      return { detected: false, artifact: {} as DetectedArtifact };
    }

    // Calculate baseline range
    const baselineRange = Math.max(...baseline) - Math.min(...baseline);

    // Compare to signal amplitude
    const signalRange = Math.max(...samples) - Math.min(...samples);
    const wanderRatio = baselineRange / signalRange;

    let severity: ArtifactSeverity = 'none';
    if (wanderRatio > 0.3) severity = 'severe';
    else if (wanderRatio > 0.15) severity = 'moderate';
    else if (wanderRatio > 0.05) severity = 'mild';

    return {
      detected: severity !== 'none',
      artifact: {
        type: 'baseline_wander',
        severity,
        description: `Baseline wander detected (${(wanderRatio * 100).toFixed(0)}% of signal range)`,
        suggestion: 'Apply high-pass filter (0.5Hz cutoff)',
      },
    };
  }

  /**
   * Detect powerline interference (50/60Hz)
   */
  private detectPowerlineInterference(samples: number[]): { detected: boolean; artifact: DetectedArtifact } {
    // Simple frequency analysis using autocorrelation
    // Check for periodicity at 50Hz (20ms) and 60Hz (16.67ms)

    const period50 = Math.round(this.sampleRate / 50);
    const period60 = Math.round(this.sampleRate / 60);

    const autocorr50 = this.calculateAutocorrelation(samples, period50);
    const autocorr60 = this.calculateAutocorrelation(samples, period60);

    const maxAutocorr = Math.max(autocorr50, autocorr60);

    let severity: ArtifactSeverity = 'none';
    if (maxAutocorr > 0.5) severity = 'severe';
    else if (maxAutocorr > 0.3) severity = 'moderate';
    else if (maxAutocorr > 0.15) severity = 'mild';

    const frequency = autocorr50 > autocorr60 ? 50 : 60;

    return {
      detected: severity !== 'none',
      artifact: {
        type: 'powerline_interference',
        severity,
        description: `${frequency}Hz powerline interference detected`,
        suggestion: `Apply notch filter at ${frequency}Hz`,
      },
    };
  }

  /**
   * Detect muscle artifact (high frequency noise)
   */
  private detectMuscleArtifact(samples: number[]): { detected: boolean; artifact: DetectedArtifact } {
    // Muscle artifact appears as high-frequency noise
    // Calculate high-frequency energy using differences

    const diffs = samples.slice(1).map((s, i) => Math.abs(s - samples[i]));
    const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;

    // Compare to signal amplitude
    const signalRange = Math.max(...samples) - Math.min(...samples);
    const noiseRatio = avgDiff / (signalRange + 1);

    let severity: ArtifactSeverity = 'none';
    if (noiseRatio > 0.15) severity = 'severe';
    else if (noiseRatio > 0.08) severity = 'moderate';
    else if (noiseRatio > 0.04) severity = 'mild';

    return {
      detected: severity !== 'none',
      artifact: {
        type: 'muscle_artifact',
        severity,
        description: 'High-frequency muscle artifact detected',
        suggestion: 'Patient should relax. Apply low-pass filter if needed.',
      },
    };
  }

  /**
   * Detect motion artifact
   */
  private detectMotionArtifact(samples: number[]): { detected: boolean; artifact: DetectedArtifact } {
    // Motion artifact: sudden large changes in baseline
    const windowSize = Math.floor(this.sampleRate * 0.5);
    const motionEvents: number[] = [];

    for (let i = windowSize; i < samples.length - windowSize; i += windowSize) {
      const before = samples.slice(i - windowSize, i);
      const after = samples.slice(i, i + windowSize);

      const meanBefore = before.reduce((a, b) => a + b, 0) / before.length;
      const meanAfter = after.reduce((a, b) => a + b, 0) / after.length;

      const signalStd = Math.sqrt(
        before.reduce((sum, s) => sum + Math.pow(s - meanBefore, 2), 0) / before.length
      );

      // Large sudden baseline shift
      if (Math.abs(meanAfter - meanBefore) > signalStd * 2) {
        motionEvents.push(i);
      }
    }

    const motionPercent = (motionEvents.length * windowSize) / samples.length;

    let severity: ArtifactSeverity = 'none';
    if (motionPercent > 0.2) severity = 'severe';
    else if (motionPercent > 0.1) severity = 'moderate';
    else if (motionPercent > 0.03) severity = 'mild';

    return {
      detected: severity !== 'none',
      artifact: {
        type: 'motion_artifact',
        severity,
        description: `Motion artifact detected (${motionEvents.length} events)`,
        suggestion: 'Ensure patient is still. Check electrode attachment.',
      },
    };
  }

  /**
   * Detect electrode pop (sudden spikes)
   */
  private detectElectrodePop(samples: number[]): { detected: boolean; artifact: DetectedArtifact } {
    // Electrode pop: very short, high-amplitude spikes
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const stdDev = Math.sqrt(
      samples.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / samples.length
    );

    const threshold = stdDev * 5;
    let popCount = 0;

    for (let i = 1; i < samples.length - 1; i++) {
      const val = samples[i];
      const prev = samples[i - 1];
      const next = samples[i + 1];

      // Spike that quickly returns to baseline
      if (
        Math.abs(val - mean) > threshold &&
        Math.abs(prev - mean) < threshold * 0.3 &&
        Math.abs(next - mean) < threshold * 0.3
      ) {
        popCount++;
      }
    }

    const popRate = popCount / (samples.length / this.sampleRate); // pops per second

    let severity: ArtifactSeverity = 'none';
    if (popRate > 2) severity = 'severe';
    else if (popRate > 0.5) severity = 'moderate';
    else if (popRate > 0.1) severity = 'mild';

    return {
      detected: severity !== 'none',
      artifact: {
        type: 'electrode_pop',
        severity,
        description: `Electrode pop artifacts detected (${popCount} events)`,
        suggestion: 'Check electrode gel and skin contact',
      },
    };
  }

  /**
   * Calculate signal-to-noise ratio
   */
  private calculateSNR(samples: number[]): number {
    // Estimate signal power using median filter (robust to noise)
    const windowSize = Math.floor(this.sampleRate * 0.1);
    const smoothed: number[] = [];

    for (let i = 0; i < samples.length; i++) {
      const start = Math.max(0, i - windowSize / 2);
      const end = Math.min(samples.length, i + windowSize / 2);
      const window = samples.slice(start, end);
      window.sort((a, b) => a - b);
      smoothed.push(window[Math.floor(window.length / 2)]);
    }

    // Signal power
    const signalPower = smoothed.reduce((sum, s) => sum + s * s, 0) / smoothed.length;

    // Noise power
    const noise = samples.map((s, i) => s - smoothed[i]);
    const noisePower = noise.reduce((sum, n) => sum + n * n, 0) / noise.length;

    if (noisePower === 0) return 60; // Perfect signal

    // SNR in dB
    return 10 * Math.log10(signalPower / noisePower);
  }

  /**
   * Calculate baseline stability
   */
  private calculateBaselineStability(samples: number[]): number {
    // Use moving window to track baseline
    const windowSize = this.sampleRate;
    const baselines: number[] = [];

    for (let i = 0; i < samples.length - windowSize; i += Math.floor(windowSize / 2)) {
      const window = samples.slice(i, i + windowSize);
      window.sort((a, b) => a - b);
      baselines.push(window[Math.floor(window.length / 2)]); // Median as baseline
    }

    if (baselines.length < 2) return 1;

    const mean = baselines.reduce((a, b) => a + b, 0) / baselines.length;
    const variance = baselines.reduce((sum, b) => sum + Math.pow(b - mean, 2), 0) / baselines.length;
    const stdDev = Math.sqrt(variance);

    // Normalize by signal amplitude
    const signalRange = Math.max(...samples) - Math.min(...samples);
    const stabilityRatio = stdDev / (signalRange + 1);

    // Convert to 0-1 score (lower variation = higher stability)
    return Math.max(0, 1 - stabilityRatio * 5);
  }

  /**
   * Calculate percentage of usable samples
   */
  private calculateUsablePercentage(_samples: number[], artifacts: DetectedArtifact[]): number {
    // Start with 100% usable
    let usablePercent = 100;

    // Reduce based on artifact severity
    for (const artifact of artifacts) {
      switch (artifact.severity) {
        case 'severe': usablePercent -= 30; break;
        case 'moderate': usablePercent -= 15; break;
        case 'mild': usablePercent -= 5; break;
      }
    }

    return Math.max(0, usablePercent);
  }

  /**
   * Calculate autocorrelation at specific lag
   */
  private calculateAutocorrelation(samples: number[], lag: number): number {
    if (lag >= samples.length) return 0;

    const n = samples.length - lag;
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (samples[i] - mean) * (samples[i + lag] - mean);
      denominator += Math.pow(samples[i] - mean, 2);
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Detect global artifacts affecting multiple leads
   */
  private detectGlobalArtifacts(
    leadAssessments: Partial<Record<LeadName, LeadQualityAssessment>>,
    globalArtifacts: DetectedArtifact[]
  ): void {
    const assessments = Object.values(leadAssessments);
    if (assessments.length < 2) return;

    // Count artifact occurrences across leads
    const artifactCounts: Partial<Record<ArtifactType, number>> = {};

    for (const assessment of assessments) {
      for (const artifact of assessment.artifacts) {
        artifactCounts[artifact.type] = (artifactCounts[artifact.type] || 0) + 1;
      }
    }

    // If artifact appears in >50% of leads, it's global
    for (const [type, count] of Object.entries(artifactCounts)) {
      if (count >= assessments.length * 0.5) {
        globalArtifacts.push({
          type: type as ArtifactType,
          severity: 'moderate',
          description: `${type.replace('_', ' ')} affecting multiple leads`,
          suggestion: 'System-wide issue - check equipment and environment',
        });
      }
    }
  }
}

/**
 * Convenience function to analyze signal quality
 */
export function analyzeSignalQuality(
  leads: Partial<Record<LeadName, number[]>>,
  sampleRate: number
): SignalQualityResult {
  const analyzer = new SignalQualityAnalyzer(leads, sampleRate);
  return analyzer.analyze();
}
