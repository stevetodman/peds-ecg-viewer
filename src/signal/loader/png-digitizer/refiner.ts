/**
 * Multi-Pass Refinement System
 * Iteratively improves digitization results
 *
 * @module signal/loader/png-digitizer/refiner
 */

import type { ECGSignal } from '../../../types';
import type {
  DigitizerResult,
  PanelAnalysis,
  CalibrationAnalysis,
  GridAnalysis,
} from './types';
import { WaveformTracer } from './cv/waveform-tracer';
import { SignalReconstructor } from './signal/reconstructor';
import { validateSignal, ValidationResult } from './signal/validator';

/**
 * Refinement options
 */
export interface RefinementOptions {
  /** Maximum refinement passes */
  maxPasses?: number;

  /** Target quality score to stop refinement */
  targetQuality?: number;

  /** Enable aggressive parameter search */
  aggressiveSearch?: boolean;
}

/**
 * Refinement result
 */
export interface RefinementResult {
  /** Refined signal */
  signal: ECGSignal;

  /** Number of refinement passes performed */
  passesPerformed: number;

  /** Quality improvement per pass */
  qualityHistory: number[];

  /** Final validation result */
  validation: ValidationResult;

  /** Parameters used for best result */
  bestParameters: RefinementParameters;
}

/**
 * Parameters that can be refined
 */
interface RefinementParameters {
  pxPerMm: number;
  paperSpeed: number;
  gain: number;
  darknessThreshold: number;
  smoothingWindow: number;
}

/**
 * Multi-pass refiner class
 */
export class MultiPassRefiner {
  private imageData: ImageData;
  private panels: PanelAnalysis[];
  private baseCalibration: CalibrationAnalysis;
  private baseGrid: GridAnalysis;
  private options: Required<RefinementOptions>;

  constructor(
    imageData: ImageData,
    panels: PanelAnalysis[],
    calibration: CalibrationAnalysis,
    grid: GridAnalysis,
    options: RefinementOptions = {}
  ) {
    this.imageData = imageData;
    this.panels = panels;
    this.baseCalibration = calibration;
    this.baseGrid = grid;
    this.options = {
      maxPasses: options.maxPasses ?? 3,
      targetQuality: options.targetQuality ?? 0.9,
      aggressiveSearch: options.aggressiveSearch ?? false,
    };
  }

  /**
   * Perform multi-pass refinement
   */
  refine(): RefinementResult {
    const qualityHistory: number[] = [];
    let bestSignal: ECGSignal | null = null;
    let bestValidation: ValidationResult | null = null;
    let bestParameters: RefinementParameters = this.getInitialParameters();
    let bestScore = 0;

    // Generate parameter candidates
    const candidates = this.generateParameterCandidates(bestParameters);

    for (let pass = 0; pass < this.options.maxPasses; pass++) {
      console.log(`[Refiner] Pass ${pass + 1}/${this.options.maxPasses}`);

      // Try each candidate
      for (const params of candidates) {
        const { signal, validation } = this.tryParameters(params);

        if (validation.overallScore > bestScore) {
          bestScore = validation.overallScore;
          bestSignal = signal;
          bestValidation = validation;
          bestParameters = params;

          console.log(`[Refiner] New best: score=${bestScore.toFixed(3)}, params=${JSON.stringify(params)}`);
        }
      }

      qualityHistory.push(bestScore);

      // Check if we've reached target quality
      if (bestScore >= this.options.targetQuality) {
        console.log(`[Refiner] Target quality reached at pass ${pass + 1}`);
        break;
      }

      // Generate new candidates around best parameters for next pass
      if (pass < this.options.maxPasses - 1) {
        candidates.length = 0;
        candidates.push(...this.generateRefinedCandidates(bestParameters));
      }
    }

    return {
      signal: bestSignal!,
      passesPerformed: qualityHistory.length,
      qualityHistory,
      validation: bestValidation!,
      bestParameters,
    };
  }

  /**
   * Get initial parameters from base calibration
   */
  private getInitialParameters(): RefinementParameters {
    return {
      pxPerMm: this.baseGrid.pxPerMm ?? 5,
      paperSpeed: this.baseCalibration.paperSpeed,
      gain: this.baseCalibration.gain,
      darknessThreshold: 100,
      smoothingWindow: 3,
    };
  }

  /**
   * Generate parameter candidates for initial search
   */
  private generateParameterCandidates(base: RefinementParameters): RefinementParameters[] {
    const candidates: RefinementParameters[] = [base];

    // Paper speed variations
    for (const speed of [25, 50]) {
      if (speed !== base.paperSpeed) {
        candidates.push({ ...base, paperSpeed: speed });
      }
    }

    // Gain variations
    for (const gain of [5, 10, 20]) {
      if (gain !== base.gain) {
        candidates.push({ ...base, gain });
      }
    }

    // pxPerMm variations (±20%)
    const pxPerMmVariations = [
      base.pxPerMm * 0.8,
      base.pxPerMm * 0.9,
      base.pxPerMm * 1.1,
      base.pxPerMm * 1.2,
    ];
    for (const pxPerMm of pxPerMmVariations) {
      candidates.push({ ...base, pxPerMm });
    }

    if (this.options.aggressiveSearch) {
      // Try all combinations of paper speed and gain
      for (const speed of [25, 50]) {
        for (const gain of [5, 10, 20]) {
          candidates.push({ ...base, paperSpeed: speed, gain });
        }
      }
    }

    return candidates;
  }

  /**
   * Generate refined candidates around a good solution
   */
  private generateRefinedCandidates(base: RefinementParameters): RefinementParameters[] {
    const candidates: RefinementParameters[] = [base];

    // Finer pxPerMm variations (±5%)
    for (const delta of [-0.05, -0.02, 0.02, 0.05]) {
      candidates.push({ ...base, pxPerMm: base.pxPerMm * (1 + delta) });
    }

    // Darkness threshold variations
    for (const threshold of [80, 90, 100, 110, 120]) {
      candidates.push({ ...base, darknessThreshold: threshold });
    }

    // Smoothing variations
    for (const window of [0, 2, 3, 5]) {
      candidates.push({ ...base, smoothingWindow: window });
    }

    return candidates;
  }

  /**
   * Try a set of parameters and return quality score
   */
  private tryParameters(params: RefinementParameters): {
    signal: ECGSignal;
    validation: ValidationResult;
  } {
    // Create tracer with parameters
    const tracer = new WaveformTracer(this.imageData, {
      darknessThreshold: params.darknessThreshold,
      smoothingWindow: params.smoothingWindow,
    });

    // Trace all panels
    const traces = tracer.traceAllPanels(this.panels);

    // Create modified calibration and grid
    const calibration: CalibrationAnalysis = {
      ...this.baseCalibration,
      paperSpeed: params.paperSpeed,
      gain: params.gain,
    };

    const grid: GridAnalysis = {
      ...this.baseGrid,
      pxPerMm: params.pxPerMm,
    };

    // Reconstruct signal
    const reconstructor = new SignalReconstructor(calibration, grid);
    const signal = reconstructor.reconstruct(traces);

    // Validate
    const validation = validateSignal(signal);

    return { signal, validation };
  }
}

/**
 * Quick refinement for a digitizer result
 */
export function refineResult(
  imageData: ImageData,
  result: DigitizerResult,
  options?: RefinementOptions
): RefinementResult | null {
  if (!result.signal || !result.panels || result.panels.length === 0) {
    return null;
  }

  const refiner = new MultiPassRefiner(
    imageData,
    result.panels,
    result.calibration,
    result.gridInfo,
    options
  );

  return refiner.refine();
}
