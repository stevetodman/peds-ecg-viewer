/**
 * Graceful Degradation System
 * Provides best-effort results when full digitization fails
 *
 * @module signal/loader/png-digitizer/graceful-degradation
 */

import type { ECGSignal, LeadName } from '../../../types';
import type {
  DigitizerResult,
  DigitizerIssue,
  ProcessingStage,
  PanelAnalysis,
  GridAnalysis,
  CalibrationAnalysis,
} from './types';

/**
 * Degradation levels - higher means more degraded
 */
export type DegradationLevel = 'full' | 'partial' | 'minimal' | 'failed';

/**
 * Degradation analysis result
 */
export interface DegradationAnalysis {
  /** Current degradation level */
  level: DegradationLevel;

  /** What's working */
  workingComponents: string[];

  /** What's failing */
  failingComponents: string[];

  /** Can we provide any useful output */
  canProvideOutput: boolean;

  /** Confidence in partial result */
  partialConfidence: number;

  /** Recommendations */
  recommendations: string[];
}

/**
 * Partial result that can be returned when full digitization fails
 */
export interface PartialResult {
  /** Degradation level achieved */
  level: DegradationLevel;

  /** Any leads that were successfully extracted */
  leads: Partial<Record<LeadName, number[]>>;

  /** Per-lead confidence */
  leadConfidence: Partial<Record<LeadName, number>>;

  /** Grid info (may be estimated) */
  gridInfo: GridAnalysis;

  /** Calibration (may be assumed) */
  calibration: CalibrationAnalysis;

  /** Panels that were detected */
  panels: PanelAnalysis[];

  /** Issues that caused degradation */
  issues: DigitizerIssue[];

  /** Human-readable summary */
  summary: string;
}

/**
 * Graceful degradation handler
 */
export class GracefulDegradation {
  private stages: ProcessingStage[];
  private issues: DigitizerIssue[];

  constructor() {
    this.stages = [];
    this.issues = [];
  }

  /**
   * Record a processing stage
   */
  recordStage(stage: ProcessingStage): void {
    this.stages.push(stage);
  }

  /**
   * Record an issue
   */
  recordIssue(issue: DigitizerIssue): void {
    this.issues.push(issue);
  }

  /**
   * Analyze current state and determine degradation level
   */
  analyze(): DegradationAnalysis {
    const working: string[] = [];
    const failing: string[] = [];

    for (const stage of this.stages) {
      if (stage.status === 'success') {
        working.push(stage.name);
      } else if (stage.status === 'failed') {
        failing.push(stage.name);
      } else if (stage.status === 'partial') {
        working.push(`${stage.name} (partial)`);
      }
    }

    // Determine level
    let level: DegradationLevel = 'full';
    if (failing.length > 0) {
      if (failing.includes('loading') || failing.includes('waveform_extraction')) {
        level = 'failed';
      } else if (failing.length === 1) {
        level = 'partial';
      } else {
        level = 'minimal';
      }
    }

    // Calculate confidence
    const successfulStages = this.stages.filter(s => s.status === 'success').length;
    const partialConfidence = successfulStages / Math.max(1, this.stages.length);

    // Generate recommendations
    const recommendations = this.generateRecommendations(failing);

    return {
      level,
      workingComponents: working,
      failingComponents: failing,
      canProvideOutput: level !== 'failed',
      partialConfidence: level === 'failed' ? 0 : partialConfidence,
      recommendations,
    };
  }

  /**
   * Create best-effort partial result
   */
  createPartialResult(
    partialLeads: Partial<Record<LeadName, number[]>>,
    gridInfo: GridAnalysis | null,
    calibration: CalibrationAnalysis | null,
    panels: PanelAnalysis[]
  ): PartialResult {
    const analysis = this.analyze();

    // Use defaults if grid/calibration failed
    const finalGrid: GridAnalysis = gridInfo ?? {
      detected: false,
      type: 'unknown',
      pxPerMm: 5, // Reasonable default
      confidence: 0.2,
    };

    const finalCalibration: CalibrationAnalysis = calibration ?? {
      found: false,
      gain: 10,
      paperSpeed: 25,
      gainSource: 'standard_assumed',
      speedSource: 'standard_assumed',
      confidence: 0.2,
    };

    // Calculate per-lead confidence based on what extracted successfully
    const leadConfidence: Partial<Record<LeadName, number>> = {};
    for (const lead of Object.keys(partialLeads) as LeadName[]) {
      const samples = partialLeads[lead]?.length ?? 0;
      if (samples > 0) {
        // Confidence based on sample count and overall analysis confidence
        leadConfidence[lead] = Math.min(0.8, analysis.partialConfidence * (samples > 500 ? 1 : samples / 500));
      }
    }

    // Generate summary
    const leadCount = Object.keys(partialLeads).length;
    const summary = this.generateSummary(analysis.level, leadCount, this.issues);

    return {
      level: analysis.level,
      leads: partialLeads,
      leadConfidence,
      gridInfo: finalGrid,
      calibration: finalCalibration,
      panels,
      issues: this.issues,
      summary,
    };
  }

  /**
   * Convert partial result to DigitizerResult
   */
  toDigitizerResult(
    partial: PartialResult,
    processingTimeMs: number
  ): DigitizerResult {
    // Determine if we have enough for a "success"
    const leadCount = Object.keys(partial.leads).length;
    const isSuccess = partial.level !== 'failed' && leadCount >= 1;

    // Create signal if we have any leads
    let signal: ECGSignal | undefined;
    if (leadCount > 0) {
      const maxLength = Math.max(
        ...Object.values(partial.leads).map(l => l?.length ?? 0)
      );
      const sampleRate = 500; // Default

      // Pad all leads to same length
      const paddedLeads: Partial<Record<LeadName, number[]>> = {};
      for (const [lead, samples] of Object.entries(partial.leads)) {
        if (samples) {
          const padded = [...samples];
          while (padded.length < maxLength) {
            padded.push(0);
          }
          paddedLeads[lead as LeadName] = padded;
        }
      }

      signal = {
        sampleRate,
        duration: maxLength / sampleRate,
        leads: paddedLeads as Record<LeadName, number[]>,
      };
    }

    // Generate suggestions based on issues
    const suggestions = this.issues
      .filter(i => i.suggestion)
      .map(i => i.suggestion!)
      .slice(0, 5);

    if (suggestions.length === 0 && partial.level !== 'full') {
      suggestions.push('Try a higher resolution image for better results');
      suggestions.push('Ensure the ECG grid is clearly visible');
    }

    return {
      success: isSuccess,
      signal,
      partialLeads: leadCount < 12 ? partial.leads : undefined,
      confidence: partial.level === 'full' ? 0.9 : partial.level === 'partial' ? 0.6 : 0.3,
      leadConfidence: partial.leadConfidence,
      stages: this.stages,
      issues: this.issues,
      suggestions,
      gridInfo: partial.gridInfo,
      calibration: partial.calibration,
      panels: partial.panels,
      processingTimeMs,
      method: 'hybrid',
    };
  }

  /**
   * Generate recommendations based on failures
   */
  private generateRecommendations(failing: string[]): string[] {
    const recommendations: string[] = [];

    for (const component of failing) {
      switch (component) {
        case 'loading':
          recommendations.push('Check that the file is a valid image format (PNG, JPG, etc.)');
          break;
        case 'ai_analysis':
          recommendations.push('AI analysis failed - using local CV fallback');
          break;
        case 'grid_detection':
          recommendations.push('Grid not detected - calibration will use standard assumptions');
          recommendations.push('For better accuracy, ensure grid lines are visible');
          break;
        case 'waveform_extraction':
          recommendations.push('Waveform extraction failed - try a clearer image');
          break;
        case 'signal_reconstruction':
          recommendations.push('Signal reconstruction had issues - some leads may be incomplete');
          break;
        default:
          break;
      }
    }

    return recommendations;
  }

  /**
   * Generate human-readable summary
   */
  private generateSummary(
    level: DegradationLevel,
    leadCount: number,
    issues: DigitizerIssue[]
  ): string {
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;

    switch (level) {
      case 'full':
        return `Successfully extracted ${leadCount} leads with high confidence`;

      case 'partial':
        return `Extracted ${leadCount} leads with reduced confidence (${warningCount} warnings)`;

      case 'minimal':
        return `Partial extraction: ${leadCount} leads recovered (${errorCount} errors, ${warningCount} warnings)`;

      case 'failed':
        return `Extraction failed: ${errorCount} errors encountered`;

      default:
        return 'Unknown extraction status';
    }
  }
}

/**
 * Recovery strategies for common failures
 */
export class RecoveryStrategies {
  /**
   * Attempt to recover from grid detection failure
   */
  static recoverGridDetection(
    imageWidth: number,
    _imageHeight: number
  ): GridAnalysis {
    // Use heuristics based on common ECG formats
    // Standard letter page at 300 DPI: ~2550 x 3300 pixels
    // Standard grid: 1mm = ~11.8 pixels at 300 DPI

    let estimatedDpi = 300;

    // Estimate DPI from typical page sizes
    if (imageWidth > 3000) {
      estimatedDpi = Math.round(imageWidth / 11); // ~11 inches for letter landscape
    } else if (imageWidth > 2000) {
      estimatedDpi = Math.round(imageWidth / 11);
    } else if (imageWidth > 1000) {
      estimatedDpi = Math.round(imageWidth / 8.5);
    } else {
      estimatedDpi = 150; // Low-res fallback
    }

    const pxPerMm = estimatedDpi / 25.4;

    return {
      detected: false,
      type: 'unknown',
      pxPerMm,
      estimatedDpi,
      smallBoxPx: pxPerMm,
      largeBoxPx: pxPerMm * 5,
      confidence: 0.3,
    };
  }

  /**
   * Attempt to recover missing leads using interpolation
   */
  static recoverMissingLead(
    leads: Partial<Record<LeadName, number[]>>,
    missingLead: LeadName
  ): number[] | null {
    // Use Einthoven's law and Goldberger equations to recover missing leads

    const lead1 = leads['I'];
    const lead2 = leads['II'];
    const lead3 = leads['III'];

    switch (missingLead) {
      // Einthoven: II = I + III
      case 'I':
        if (lead2 && lead3) {
          return lead2.map((v, i) => v - (lead3[i] ?? 0));
        }
        break;

      case 'II':
        if (lead1 && lead3) {
          return lead1.map((v, i) => v + (lead3[i] ?? 0));
        }
        break;

      case 'III':
        if (lead2 && lead1) {
          return lead2.map((v, i) => v - (lead1[i] ?? 0));
        }
        break;

      // Goldberger: aVR = -(I + II)/2, aVL = I - II/2, aVF = II - I/2
      case 'aVR':
        if (lead1 && lead2) {
          return lead1.map((v, i) => -(v + (lead2[i] ?? 0)) / 2);
        }
        break;

      case 'aVL':
        if (lead1 && lead2) {
          return lead1.map((v, i) => v - (lead2[i] ?? 0) / 2);
        }
        break;

      case 'aVF':
        if (lead2 && lead1) {
          return lead2.map((v, i) => v - (lead1[i] ?? 0) / 2);
        }
        break;

      // Precordial leads cannot be recovered mathematically
      default:
        break;
    }

    return null;
  }

  /**
   * Fill gaps in a lead using interpolation
   */
  static fillGaps(samples: number[], maxGapSize: number = 50): number[] {
    const result = [...samples];
    let gapStart = -1;

    for (let i = 0; i < result.length; i++) {
      if (result[i] === 0 || isNaN(result[i])) {
        if (gapStart < 0) {
          gapStart = i;
        }
      } else {
        if (gapStart >= 0) {
          const gapEnd = i;
          const gapSize = gapEnd - gapStart;

          if (gapSize <= maxGapSize && gapStart > 0) {
            // Linear interpolation
            const startVal = result[gapStart - 1];
            const endVal = result[gapEnd];

            for (let j = gapStart; j < gapEnd; j++) {
              const t = (j - gapStart + 1) / (gapSize + 1);
              result[j] = startVal + t * (endVal - startVal);
            }
          }

          gapStart = -1;
        }
      }
    }

    return result;
  }
}

/**
 * Create graceful degradation handler
 */
export function createGracefulDegradation(): GracefulDegradation {
  return new GracefulDegradation();
}
