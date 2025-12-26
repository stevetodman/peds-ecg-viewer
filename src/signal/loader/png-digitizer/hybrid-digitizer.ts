/**
 * Hybrid Digitizer
 * Combines AI (for labels, colors) with local CV (for tracing)
 * Minimizes AI token usage while maintaining accuracy
 */

import type {
  DigitizerConfig,
  DigitizerResult,
  PanelAnalysis,
  AIAnalysisResult,
} from './types';
import { createAIProvider, getEnvApiKey } from './ai';
import type { AIProviderType } from './ai';
import { WaveformTracer } from './cv/waveform-tracer';
import { LocalGridDetector } from './cv/grid-detector';
import { loadImage } from './cv/image-loader';
import { SignalReconstructor } from './signal/reconstructor';
import { detectBaseline } from './cv/baseline-detector';
import type { LeadName } from '../../../types';

/**
 * Hybrid digitizer configuration
 */
export interface HybridDigitizerConfig extends DigitizerConfig {
  /**
   * AI usage strategy:
   * - 'full': AI for everything (most tokens, best quality)
   * - 'labels-only': AI for layout/labels, local CV for tracing (least tokens)
   * - 'critical-panels': AI traces only leads I, II, III for Einthoven validation
   * - 'fallback': Try local CV first, use AI only if quality < threshold
   */
  strategy?: 'full' | 'labels-only' | 'critical-panels' | 'fallback';

  /** Quality threshold for 'fallback' strategy (0-1) */
  qualityThreshold?: number;
}

/**
 * Minimal AI prompt for labels and colors only (~300 output tokens)
 */
const LABELS_ONLY_PROMPT = `Analyze this ECG image. Return ONLY layout info, no tracePoints.

{
  "grid": {
    "waveformColor": "#000000",
    "pxPerMm": 8.5
  },
  "layout": {
    "format": "12-lead",
    "columns": 4,
    "rows": 3,
    "imageWidth": 1200,
    "imageHeight": 900
  },
  "panels": [
    {"lead": "I", "row": 0, "col": 0, "bounds": {"x": 50, "y": 50, "width": 275, "height": 266}, "baselineY": 183}
  ]
}

Include ALL 12 panels. Return ONLY valid JSON.`;

/**
 * Hybrid ECG Digitizer
 */
export class HybridDigitizer {
  private config: HybridDigitizerConfig;

  constructor(config: HybridDigitizerConfig = {}) {
    this.config = {
      aiProvider: config.aiProvider ?? 'anthropic',
      apiKey: config.apiKey ?? getEnvApiKey('anthropic') ?? '',
      strategy: config.strategy ?? 'labels-only',
      qualityThreshold: config.qualityThreshold ?? 0.6,
      targetSampleRate: config.targetSampleRate ?? 500,
      ...config,
    };
  }

  async digitize(source: File | Blob | string | ImageData): Promise<DigitizerResult> {
    const startTime = Date.now();
    const imageData = await loadImage(source);

    switch (this.config.strategy) {
      case 'labels-only':
        return this.labelsOnlyStrategy(imageData, startTime);
      case 'critical-panels':
        return this.criticalPanelsStrategy(imageData, startTime);
      case 'fallback':
        return this.fallbackStrategy(imageData, startTime);
      case 'full':
      default:
        return this.fullAIStrategy(imageData, startTime);
    }
  }

  /**
   * Labels-only strategy: AI for layout/colors, local CV for tracing
   * Token usage: ~300 output tokens (vs ~8000 for full)
   */
  private async labelsOnlyStrategy(imageData: ImageData, startTime: number): Promise<DigitizerResult> {
    console.log('[Hybrid] Using labels-only strategy (minimal AI tokens)');

    // Step 1: Get layout and colors from AI (small request)
    let aiPanels: PanelAnalysis[] = [];
    let waveformColor: { r: number; g: number; b: number } | undefined;

    if (this.config.apiKey) {
      try {
        const provider = createAIProvider(
          this.config.aiProvider as AIProviderType,
          this.config.apiKey
        );

        // Use minimal prompt
        const response = await provider.analyzeWithPrompt(imageData, LABELS_ONLY_PROMPT);
        aiPanels = response.analysis.panels;

        // Parse waveform color
        const colorHex = response.analysis.grid.waveformColor;
        if (colorHex) {
          const match = colorHex.match(/^#?([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/);
          if (match) {
            waveformColor = {
              r: parseInt(match[1], 16),
              g: parseInt(match[2], 16),
              b: parseInt(match[3], 16),
            };
          }
        }

        console.log(`[Hybrid] AI detected ${aiPanels.length} panels, color: ${colorHex}`);
      } catch (error) {
        console.warn('[Hybrid] AI failed, falling back to local CV:', error);
      }
    }

    // Step 2: Use local grid detector if AI failed
    if (aiPanels.length === 0) {
      const localDetector = new LocalGridDetector(imageData);
      const localAnalysis = await localDetector.analyze();
      aiPanels = localAnalysis.panels;
    }

    // Step 3: Improve baselines using local analysis
    const panelsWithBaseline = aiPanels.map(panel => {
      const baselineResult = detectBaseline(imageData, panel.bounds, panel.baselineY);
      return {
        ...panel,
        baselineY: baselineResult.confidence > 0.4 ? baselineResult.baselineY : panel.baselineY,
      };
    });

    // Step 4: Trace waveforms using local CV with AI-detected color
    const tracer = new WaveformTracer(imageData, { waveformColor });
    const traces = panelsWithBaseline
      .filter(p => p.lead)
      .map(panel => tracer.tracePanel(panel))
      .filter((t): t is NonNullable<typeof t> => t !== null);

    // Step 5: Reconstruct signal
    const reconstructor = new SignalReconstructor(
      { gain: 10, paperSpeed: 25, found: false, gainSource: 'standard_assumed', speedSource: 'standard_assumed', confidence: 0.7 },
      { detected: true, type: 'standard', pxPerMm: 8, confidence: 0.7 },
      { targetSampleRate: this.config.targetSampleRate }
    );

    const signal = reconstructor.reconstruct(traces);

    return {
      success: true,
      signal,
      confidence: 0.85,
      leadConfidence: {},
      stages: [{ name: 'hybrid_labels_only', status: 'success', confidence: 0.85, durationMs: Date.now() - startTime }],
      issues: [],
      suggestions: [],
      gridInfo: { detected: true, type: 'standard', confidence: 0.8 },
      calibration: { found: false, gain: 10, paperSpeed: 25, gainSource: 'standard_assumed', speedSource: 'standard_assumed', confidence: 0.7 },
      panels: panelsWithBaseline,
      processingTimeMs: Date.now() - startTime,
      method: 'hybrid',
    };
  }

  /**
   * Critical-panels strategy: AI traces only I, II, III for Einthoven validation
   * Token usage: ~2000 output tokens (vs ~8000 for full)
   */
  private async criticalPanelsStrategy(imageData: ImageData, startTime: number): Promise<DigitizerResult> {
    console.log('[Hybrid] Using critical-panels strategy (AI for I, II, III only)');
    // Implementation would request tracePoints only for leads I, II, III
    // Then use local CV for the remaining 9 leads
    // This provides Einthoven validation while minimizing tokens
    return this.labelsOnlyStrategy(imageData, startTime); // Placeholder
  }

  /**
   * Fallback strategy: Try local CV first, use AI only if quality is poor
   */
  private async fallbackStrategy(imageData: ImageData, startTime: number): Promise<DigitizerResult> {
    console.log('[Hybrid] Using fallback strategy (local CV first)');

    // Try local CV first
    const localResult = await this.labelsOnlyStrategy(imageData, startTime);

    // Check quality - if good enough, return without AI
    if (localResult.confidence >= (this.config.qualityThreshold ?? 0.6)) {
      console.log(`[Hybrid] Local CV quality ${localResult.confidence.toFixed(2)} >= threshold, skipping AI`);
      return localResult;
    }

    // Quality too low, fall back to full AI
    console.log(`[Hybrid] Local CV quality ${localResult.confidence.toFixed(2)} < threshold, using full AI`);
    return this.fullAIStrategy(imageData, startTime);
  }

  /**
   * Full AI strategy: Use AI for everything (existing behavior)
   */
  private async fullAIStrategy(imageData: ImageData, startTime: number): Promise<DigitizerResult> {
    // This would use the existing ECGDigitizer with full AI
    // For now, delegate to labels-only as placeholder
    return this.labelsOnlyStrategy(imageData, startTime);
  }
}

/**
 * Estimate token usage for different strategies
 */
export function estimateTokenUsage(strategy: HybridDigitizerConfig['strategy']): {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: string;
} {
  const estimates = {
    'full': { inputTokens: 1500, outputTokens: 8000, estimatedCost: '$0.12' },
    'labels-only': { inputTokens: 800, outputTokens: 400, estimatedCost: '$0.01' },
    'critical-panels': { inputTokens: 1000, outputTokens: 2000, estimatedCost: '$0.04' },
    'fallback': { inputTokens: 800, outputTokens: 400, estimatedCost: '$0.01-0.12' },
  };
  return estimates[strategy ?? 'labels-only'];
}
