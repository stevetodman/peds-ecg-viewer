/**
 * ECG Digitizer
 * Main orchestrator for PNG-to-ECG signal conversion
 *
 * @module signal/loader/png-digitizer/digitizer
 */

import type {
  DigitizerConfig,
  DigitizerResult,
  DigitizerProgress,
  AIAnalysisResult,
  ECGImageAnalysis,
  ProcessingStage,
  GridAnalysis,
  CalibrationAnalysis,
  PanelAnalysis,
  RawTrace,
} from './types';
import { createAIProvider, getEnvApiKey, getDefaultModel } from './ai';
import type { AIProviderType } from './ai';
import { WaveformTracer } from './cv/waveform-tracer';
import { LocalGridDetector } from './cv/grid-detector';
import { loadImage } from './cv/image-loader';
import { SignalReconstructor } from './signal/reconstructor';
import { QualityScorer } from './signal/quality-scorer';
import { detectCalibrationPulse } from './cv/calibration-pulse-detector';
import { detectBaseline } from './cv/baseline-detector';
import type { LeadName } from '../../../types';

/**
 * Image source type
 */
export type ImageSource = File | Blob | string | ImageData | HTMLCanvasElement;

/**
 * ECG Digitizer class
 * Orchestrates the conversion of ECG images to digital signals
 */
export class ECGDigitizer {
  private config: Required<Omit<DigitizerConfig, 'interactive'>> & Pick<DigitizerConfig, 'interactive'>;

  constructor(config: DigitizerConfig = {}) {
    const aiProvider = config.aiProvider ?? 'anthropic';

    this.config = {
      aiProvider,
      apiKey: config.apiKey ?? getEnvApiKey(aiProvider as AIProviderType) ?? '',
      model: config.model ?? getDefaultModel(aiProvider as AIProviderType),
      aiConfidenceThreshold: config.aiConfidenceThreshold ?? 0.7,
      enableLocalFallback: config.enableLocalFallback ?? true,
      enableInteractive: config.enableInteractive ?? true,
      targetSampleRate: config.targetSampleRate ?? 500,
      onProgress: config.onProgress ?? (() => {}),
      interactive: config.interactive,
    };
  }

  /**
   * Digitize an ECG image
   */
  async digitize(source: ImageSource): Promise<DigitizerResult> {
    const startTime = Date.now();
    const stages: ProcessingStage[] = [];

    try {
      // Stage 1: Load image
      this.progress('loading', 0, 'Loading image...');
      const stageStart = Date.now();

      const imageData = await loadImage(source);

      stages.push({
        name: 'loading',
        status: 'success',
        confidence: 1,
        durationMs: Date.now() - stageStart,
      });

      // Stage 2: AI Analysis (if configured)
      let aiResult: AIAnalysisResult | undefined;

      if (this.config.aiProvider !== 'none' && this.config.apiKey) {
        this.progress('ai_analysis', 10, 'Analyzing with AI...');
        const aiStart = Date.now();

        try {
          const provider = createAIProvider(
            this.config.aiProvider as AIProviderType,
            this.config.apiKey,
            this.config.model
          );
          aiResult = await provider.analyze(imageData);

          stages.push({
            name: 'ai_analysis',
            status: aiResult.confidence >= this.config.aiConfidenceThreshold ? 'success' : 'partial',
            confidence: aiResult.confidence,
            durationMs: Date.now() - aiStart,
          });
        } catch (aiError) {
          console.warn('AI analysis failed:', aiError);
          stages.push({
            name: 'ai_analysis',
            status: 'failed',
            confidence: 0,
            durationMs: Date.now() - aiStart,
            notes: String(aiError),
          });
        }
      }

      // Determine analysis to use
      let analysis: ECGImageAnalysis | undefined = aiResult?.analysis;
      let method: DigitizerResult['method'] = 'ai_guided';

      // Stage 3: Local CV fallback if AI failed or low confidence
      if (!analysis || (aiResult && aiResult.confidence < this.config.aiConfidenceThreshold)) {
        if (this.config.enableLocalFallback) {
          this.progress('grid_detection', 30, 'Detecting grid locally...');
          const localStart = Date.now();

          try {
            const localDetector = new LocalGridDetector(imageData);
            const localAnalysis = await localDetector.analyze();

            // Use local analysis if better than AI
            if (!analysis || localAnalysis.grid.confidence > analysis.grid.confidence) {
              analysis = localAnalysis;
              method = 'local_cv';
            }

            stages.push({
              name: 'local_cv',
              status: localAnalysis.grid.confidence > 0.5 ? 'success' : 'partial',
              confidence: localAnalysis.grid.confidence,
              durationMs: Date.now() - localStart,
            });
          } catch (localError) {
            console.warn('Local CV failed:', localError);
            stages.push({
              name: 'local_cv',
              status: 'failed',
              confidence: 0,
              durationMs: Date.now() - localStart,
              notes: String(localError),
            });
          }
        }
      }

      // Validate we have enough info to proceed
      if (!analysis || analysis.panels.length === 0) {
        return this.createFailureResult(
          stages,
          startTime,
          'Unable to detect ECG layout. Try using a clearer image or user-assisted mode.'
        );
      }

      // Validate grid info
      if (!analysis.grid.pxPerMm || analysis.grid.pxPerMm <= 0) {
        // Try to estimate from image size
        analysis.grid.pxPerMm = this.estimatePxPerMm(imageData.width);
        analysis.grid.smallBoxPx = analysis.grid.pxPerMm;
        analysis.grid.largeBoxPx = analysis.grid.pxPerMm * 5;
      }

      // Stage 3.5: Calibration pulse detection
      this.progress('calibration', 50, 'Detecting calibration...');
      const calibrationPulse = detectCalibrationPulse(imageData);

      if (calibrationPulse.found && calibrationPulse.confidence > 0.5) {
        // Use detected calibration pulse to improve accuracy
        const pxPerMv = calibrationPulse.pxPerMv;
        const pxPerMm = pxPerMv / (analysis.calibration.gain || 10);

        // Update grid and calibration with detected values
        analysis.grid.pxPerMm = pxPerMm;
        analysis.grid.smallBoxPx = pxPerMm;
        analysis.grid.largeBoxPx = pxPerMm * 5;
        analysis.calibration.confidence = Math.max(analysis.calibration.confidence, calibrationPulse.confidence);

        stages.push({
          name: 'calibration_detection',
          status: 'success',
          confidence: calibrationPulse.confidence,
          durationMs: 0,
          notes: `Calibration pulse detected: ${pxPerMv.toFixed(1)} px/mV`,
        });
      }

      // Stage 4: Waveform extraction with robust retry logic
      this.progress('waveform_extraction', 60, 'Extracting waveforms...');
      const waveformStart = Date.now();

      // Validate and fix panel bounds before tracing
      const validatedPanels = this.validatePanelBounds(analysis.panels, imageData.width, imageData.height);

      // Improve baseline detection for each panel using isoelectric analysis
      const panelsWithImprovedBaseline = this.improveBaselineDetection(imageData, validatedPanels);

      // Parse waveform color from AI analysis if available
      const waveformColor = this.parseWaveformColor(analysis.grid.waveformColor);

      // Extract with retry logic for failed panels
      const rawTraces = this.robustTraceExtraction(imageData, panelsWithImprovedBaseline, waveformColor);

      // Deduplicate leads (keep best confidence if AI detected same lead multiple times)
      const traces = this.deduplicateTraces(rawTraces);

      stages.push({
        name: 'waveform_extraction',
        status: traces.length > 0 ? 'success' : 'failed',
        confidence: validatedPanels.length > 0 ? traces.length / validatedPanels.length : 0,
        durationMs: Date.now() - waveformStart,
      });

      if (traces.length === 0) {
        return this.createFailureResult(
          stages,
          startTime,
          'No waveforms could be extracted. The image may be too low quality or waveforms may not be visible.'
        );
      }

      // Stage 5: Signal reconstruction
      this.progress('signal_reconstruction', 80, 'Reconstructing signal...');
      const reconstructStart = Date.now();

      const reconstructor = new SignalReconstructor(
        analysis.calibration,
        analysis.grid,
        { targetSampleRate: this.config.targetSampleRate }
      );
      const signal = reconstructor.reconstruct(traces);

      stages.push({
        name: 'signal_reconstruction',
        status: 'success',
        confidence: 0.9,
        durationMs: Date.now() - reconstructStart,
      });

      // Stage 6: Quality assessment
      this.progress('quality_assessment', 95, 'Assessing quality...');
      const scorer = new QualityScorer();
      const quality = scorer.assess(signal, traces, analysis);

      this.progress('quality_assessment', 100, 'Complete');

      return {
        success: true,
        signal,
        confidence: quality.overall,
        leadConfidence: quality.perLead,
        stages,
        issues: quality.issues,
        suggestions: quality.suggestions,
        aiAnalysis: aiResult,
        gridInfo: analysis.grid,
        calibration: analysis.calibration,
        panels: analysis.panels,
        processingTimeMs: Date.now() - startTime,
        method,
      };
    } catch (error) {
      return this.createFailureResult(stages, startTime, String(error));
    }
  }

  /**
   * Report progress
   */
  private progress(
    stage: DigitizerProgress['stage'],
    progress: number,
    message: string
  ): void {
    this.config.onProgress({ stage, progress, message });
  }

  /**
   * Estimate pixels per mm based on image width
   * Assumes standard letter page landscape (11 inches wide)
   */
  private estimatePxPerMm(imageWidth: number): number {
    const assumedWidthInches = 11;
    const dpi = imageWidth / assumedWidthInches;
    return dpi / 25.4;
  }

  /**
   * Parse waveform color from hex string
   */
  private parseWaveformColor(hexColor?: string): { r: number; g: number; b: number } | undefined {
    if (!hexColor) return undefined;

    // Handle #RRGGBB format
    const match = hexColor.match(/^#?([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/);
    if (match) {
      return {
        r: parseInt(match[1], 16),
        g: parseInt(match[2], 16),
        b: parseInt(match[3], 16),
      };
    }

    return undefined;
  }

  /**
   * Validate and fix panel bounds to ensure they're within image dimensions
   */
  private validatePanelBounds(panels: PanelAnalysis[], imageWidth: number, imageHeight: number): PanelAnalysis[] {
    return panels.map(panel => {
      const bounds = { ...panel.bounds };

      // Clamp to image dimensions
      bounds.x = Math.max(0, Math.min(bounds.x, imageWidth - 10));
      bounds.y = Math.max(0, Math.min(bounds.y, imageHeight - 10));
      bounds.width = Math.min(bounds.width, imageWidth - bounds.x);
      bounds.height = Math.min(bounds.height, imageHeight - bounds.y);

      // Ensure minimum size
      bounds.width = Math.max(bounds.width, 20);
      bounds.height = Math.max(bounds.height, 20);

      return { ...panel, bounds };
    });
  }

  /**
   * Improve baseline detection for each panel using isoelectric segment analysis
   */
  private improveBaselineDetection(imageData: ImageData, panels: PanelAnalysis[]): PanelAnalysis[] {
    return panels.map(panel => {
      const baselineResult = detectBaseline(imageData, panel.bounds, panel.baselineY);

      // Only update if the new baseline has higher confidence
      if (baselineResult.confidence > 0.4) {
        return {
          ...panel,
          baselineY: baselineResult.baselineY,
        };
      }

      return panel;
    });
  }

  /**
   * Robust trace extraction with retry logic for failed panels
   */
  private robustTraceExtraction(
    imageData: ImageData,
    panels: PanelAnalysis[],
    waveformColor?: { r: number; g: number; b: number }
  ): RawTrace[] {
    const traces: RawTrace[] = [];

    // Try multiple darkness thresholds
    const thresholds = [80, 60, 100, 40, 120];

    for (const panel of panels) {
      if (!panel.lead) continue;

      let bestTrace: RawTrace | null = null;
      let bestConfidence = 0;

      // Try with default settings first
      for (const threshold of thresholds) {
        const tracer = new WaveformTracer(imageData, {
          waveformColor,
          darknessThreshold: threshold,
        });

        const trace = tracer.tracePanel(panel);

        if (trace && trace.xPixels.length > 10) {
          const avgConf = trace.confidence.reduce((a, b) => a + b, 0) / trace.confidence.length;

          // Check if this is better than previous attempts
          if (avgConf > bestConfidence) {
            bestConfidence = avgConf;
            bestTrace = trace;
          }

          // Good enough, stop trying
          if (avgConf > 0.7) break;
        }
      }

      // If still failed, try with expanded bounds
      if (!bestTrace || bestConfidence < 0.5) {
        const expandedPanel = this.expandPanelBounds(panel, imageData.width, imageData.height, 10);
        const tracer = new WaveformTracer(imageData, {
          waveformColor,
          darknessThreshold: 80,
        });

        const trace = tracer.tracePanel(expandedPanel);
        if (trace && trace.xPixels.length > 10) {
          const avgConf = trace.confidence.reduce((a, b) => a + b, 0) / trace.confidence.length;
          if (avgConf > bestConfidence) {
            bestTrace = trace;
          }
        }
      }

      if (bestTrace) {
        traces.push(bestTrace);
      }
    }

    return traces;
  }

  /**
   * Expand panel bounds by a margin (for retry attempts)
   */
  private expandPanelBounds(
    panel: PanelAnalysis,
    imageWidth: number,
    imageHeight: number,
    margin: number
  ): PanelAnalysis {
    return {
      ...panel,
      bounds: {
        x: Math.max(0, panel.bounds.x - margin),
        y: Math.max(0, panel.bounds.y - margin),
        width: Math.min(panel.bounds.width + margin * 2, imageWidth - panel.bounds.x + margin),
        height: Math.min(panel.bounds.height + margin * 2, imageHeight - panel.bounds.y + margin),
      },
    };
  }

  /**
   * Deduplicate traces - keep only the best trace for each lead
   */
  private deduplicateTraces(traces: RawTrace[]): RawTrace[] {
    const leadMap = new Map<LeadName, RawTrace>();

    for (const trace of traces) {
      const existing = leadMap.get(trace.lead);

      if (!existing) {
        leadMap.set(trace.lead, trace);
      } else {
        // Keep the one with more points and higher confidence
        const existingConf = existing.confidence.reduce((a, b) => a + b, 0) / existing.confidence.length;
        const newConf = trace.confidence.reduce((a, b) => a + b, 0) / trace.confidence.length;

        const existingScore = existing.xPixels.length * existingConf;
        const newScore = trace.xPixels.length * newConf;

        if (newScore > existingScore) {
          leadMap.set(trace.lead, trace);
        }
      }
    }

    return Array.from(leadMap.values());
  }

  /**
   * Create failure result
   */
  private createFailureResult(
    stages: ProcessingStage[],
    startTime: number,
    error: string
  ): DigitizerResult {
    const defaultGrid: GridAnalysis = {
      detected: false,
      type: 'unknown',
      confidence: 0,
    };

    const defaultCalibration: CalibrationAnalysis = {
      found: false,
      gain: 10,
      paperSpeed: 25,
      gainSource: 'standard_assumed',
      speedSource: 'standard_assumed',
      confidence: 0,
    };

    return {
      success: false,
      confidence: 0,
      leadConfidence: {},
      stages,
      issues: [{ code: 'FATAL', severity: 'error', message: error }],
      suggestions: [
        'Try user-assisted mode for better accuracy',
        'Ensure the image is clear and complete',
        'Use a higher resolution image if available',
      ],
      gridInfo: defaultGrid,
      calibration: defaultCalibration,
      panels: [],
      processingTimeMs: Date.now() - startTime,
      method: 'ai_guided',
    };
  }
}

/**
 * Convenience function for digitizing PNG images
 */
export async function digitizePNG(
  source: ImageSource,
  config?: DigitizerConfig
): Promise<DigitizerResult> {
  const digitizer = new ECGDigitizer(config);
  return digitizer.digitize(source);
}

/**
 * Convenience function for loading and digitizing a PNG file
 */
export async function loadPNGFile(file: File, config?: DigitizerConfig): Promise<DigitizerResult> {
  return digitizePNG(file, config);
}
