/**
 * Two-Pass ECG Digitizer
 * Minimizes API token usage by splitting analysis into two passes:
 * - Pass 1: Layout, labels, colors (~400 output tokens)
 * - Pass 2: TracePoints only when needed (~2000 output tokens per batch)
 *
 * Total: ~400-2400 tokens vs ~8000 for full analysis
 */

import type {
  DigitizerConfig,
  DigitizerResult,
  PanelAnalysis,
  ProcessingStage,
  RawTrace,
  GridAnalysis,
  CalibrationAnalysis,
} from './types';
import { createAIProvider, getEnvApiKey } from './ai';
import type { AIProviderType } from './ai';
import { WaveformTracer } from './cv/waveform-tracer';
import { loadImage } from './cv/image-loader';
import { SignalReconstructor } from './signal/reconstructor';
import { detectBaseline } from './cv/baseline-detector';
import { AICache, getDefaultCache } from './ai/cache';
import type { LeadName } from '../../../types';

/**
 * Pass 1 prompt: Layout and labels only (~400 output tokens)
 */
const PASS1_PROMPT = `Analyze this ECG image. Return layout, panel labels, and waveform color.

{
  "grid": {
    "waveformColor": "#000000",
    "pxPerMm": 8.5,
    "confidence": 0.9
  },
  "layout": {
    "format": "12-lead",
    "columns": 4,
    "rows": 3,
    "imageWidth": 1200,
    "imageHeight": 900,
    "confidence": 0.9
  },
  "calibration": {
    "paperSpeed": 25,
    "gain": 10,
    "confidence": 0.8
  },
  "panels": [
    {"id": "p0", "lead": "I", "row": 0, "col": 0, "bounds": {"x": 50, "y": 50, "width": 275, "height": 200}, "baselineY": 150}
  ]
}

IMPORTANT:
- Include ALL 12 panels with bounds and baselineY
- Identify waveformColor precisely (black=#000000, blue=#0000FF, etc.)
- Do NOT include tracePoints or criticalPoints
- Return ONLY valid JSON`;

/**
 * Pass 2 prompt: TracePoints for specific panels
 */
function getPass2Prompt(panels: PanelAnalysis[]): string {
  const panelList = panels.map(p =>
    `- ${p.lead}: bounds(${p.bounds.x}, ${p.bounds.y}, ${p.bounds.width}×${p.bounds.height}), baseline=${p.baselineY}`
  ).join('\n');

  return `Trace the waveform for these ECG panels:

${panelList}

For EACH panel, provide:
1. tracePoints: 41 points at 0%, 2.5%, 5%... 100%
2. criticalPoints: R peaks, S troughs, P/T waves

{
  "panels": [
    {
      "lead": "I",
      "tracePoints": [{"xPercent": 0, "yPixel": 150}, {"xPercent": 2.5, "yPixel": 150}, ...],
      "criticalPoints": [{"type": "R", "xPercent": 20, "yPixel": 120}, ...]
    }
  ]
}

CRITICAL: tracePoints must follow the WAVEFORM trace, not grid lines.
Return ONLY valid JSON.`;
}

/**
 * Two-Pass Digitizer Configuration
 */
export interface TwoPassConfig extends DigitizerConfig {
  /** Use cache for AI responses */
  useCache?: boolean;

  /** Skip Pass 2 if local CV quality is good enough */
  skipPass2Threshold?: number;

  /** Only request Pass 2 for these critical leads (for Einthoven) */
  criticalLeads?: LeadName[];
}

/**
 * Two-Pass ECG Digitizer
 */
export class TwoPassDigitizer {
  private config: TwoPassConfig;
  private cache: AICache;

  constructor(config: TwoPassConfig = {}) {
    this.config = {
      aiProvider: config.aiProvider ?? 'anthropic',
      apiKey: config.apiKey ?? getEnvApiKey('anthropic') ?? '',
      targetSampleRate: config.targetSampleRate ?? 500,
      useCache: config.useCache ?? true,
      skipPass2Threshold: config.skipPass2Threshold ?? 0.7,
      criticalLeads: config.criticalLeads ?? ['I', 'II', 'III'],
      ...config,
    };

    this.cache = getDefaultCache();
  }

  /**
   * Digitize an ECG image using two-pass approach
   */
  async digitize(source: File | Blob | string | ImageData): Promise<DigitizerResult> {
    const startTime = Date.now();
    const stages: ProcessingStage[] = [];
    const imageData = await loadImage(source);

    console.log(`[TwoPass] Starting digitization (${imageData.width}x${imageData.height})`);

    // =========================================================================
    // PASS 1: Get layout, labels, colors (minimal tokens)
    // =========================================================================
    let panels: PanelAnalysis[] = [];
    let waveformColor: { r: number; g: number; b: number } | undefined;
    let gridInfo: GridAnalysis = { detected: false, type: 'unknown', confidence: 0 };
    let calibration: CalibrationAnalysis = {
      found: false, gain: 10, paperSpeed: 25,
      gainSource: 'standard_assumed', speedSource: 'standard_assumed', confidence: 0.5
    };

    if (this.config.apiKey) {
      const pass1Start = Date.now();

      // Check cache first
      const cached = this.config.useCache
        ? this.cache.get(imageData, PASS1_PROMPT)
        : null;

      if (cached) {
        console.log('[TwoPass] Pass 1: Cache hit');
        panels = cached.analysis.panels;
        gridInfo = cached.analysis.grid;
        calibration = cached.analysis.calibration;
        waveformColor = this.parseColor(gridInfo.waveformColor);

        stages.push({
          name: 'pass1_cached',
          status: 'success',
          confidence: cached.confidence,
          durationMs: 0,
        });
      } else {
        console.log('[TwoPass] Pass 1: Calling AI for layout...');

        try {
          const provider = createAIProvider(
            this.config.aiProvider as AIProviderType,
            this.config.apiKey
          );

          const result = await provider.analyzeWithPrompt(imageData, PASS1_PROMPT);

          panels = result.analysis.panels;
          gridInfo = result.analysis.grid;
          calibration = result.analysis.calibration;
          waveformColor = this.parseColor(gridInfo.waveformColor);

          // Cache the result
          if (this.config.useCache) {
            this.cache.set(imageData, PASS1_PROMPT, result);
          }

          stages.push({
            name: 'pass1_ai',
            status: 'success',
            confidence: result.confidence,
            durationMs: Date.now() - pass1Start,
            notes: `${panels.length} panels, color: ${gridInfo.waveformColor}`,
          });

          console.log(`[TwoPass] Pass 1: ${panels.length} panels, color=${gridInfo.waveformColor}`);
        } catch (error) {
          console.error('[TwoPass] Pass 1 failed:', error);
          stages.push({
            name: 'pass1_ai',
            status: 'failed',
            confidence: 0,
            durationMs: Date.now() - pass1Start,
            notes: String(error),
          });
        }
      }
    }

    if (panels.length === 0) {
      return this.createFailure(stages, startTime, 'Pass 1 failed: No panels detected');
    }

    // =========================================================================
    // IMPROVE BASELINES using local analysis
    // =========================================================================
    panels = panels.map(panel => {
      const result = detectBaseline(imageData, panel.bounds, panel.baselineY);
      return {
        ...panel,
        baselineY: result.confidence > 0.4 ? result.baselineY : panel.baselineY,
      };
    });

    // =========================================================================
    // LOCAL CV TRACING (using AI-detected waveform color)
    // =========================================================================
    console.log('[TwoPass] Tracing with local CV...');
    const localStart = Date.now();

    const tracer = new WaveformTracer(imageData, { waveformColor });
    const traces: RawTrace[] = [];
    const lowQualityPanels: PanelAnalysis[] = [];

    for (const panel of panels) {
      if (!panel.lead) continue;

      const trace = tracer.tracePanel(panel);
      if (trace && trace.xPixels.length > 10) {
        const avgConf = trace.confidence.reduce((a, b) => a + b, 0) / trace.confidence.length;
        traces.push(trace);

        // Track low-quality traces for potential Pass 2
        if (avgConf < (this.config.skipPass2Threshold ?? 0.7)) {
          lowQualityPanels.push(panel);
        }
      }
    }

    stages.push({
      name: 'local_cv',
      status: traces.length > 0 ? 'success' : 'failed',
      confidence: traces.length / panels.length,
      durationMs: Date.now() - localStart,
      notes: `${traces.length} traces, ${lowQualityPanels.length} low quality`,
    });

    console.log(`[TwoPass] Local CV: ${traces.length} traces, ${lowQualityPanels.length} need refinement`);

    // =========================================================================
    // PASS 2 (OPTIONAL): Get tracePoints for critical/low-quality panels
    // =========================================================================
    const needsPass2 = lowQualityPanels.length > 0 ||
      !this.hasAllCriticalLeads(traces, this.config.criticalLeads ?? []);

    if (needsPass2 && this.config.apiKey) {
      // Only request Pass 2 for critical leads + low quality panels
      const panelsForPass2 = this.getPanelsForPass2(
        panels,
        lowQualityPanels,
        this.config.criticalLeads ?? []
      );

      if (panelsForPass2.length > 0) {
        console.log(`[TwoPass] Pass 2: Requesting tracePoints for ${panelsForPass2.length} panels...`);
        const pass2Start = Date.now();

        try {
          const provider = createAIProvider(
            this.config.aiProvider as AIProviderType,
            this.config.apiKey
          );

          const pass2Prompt = getPass2Prompt(panelsForPass2);
          const result = await provider.analyzeWithPrompt(imageData, pass2Prompt);

          // Merge Pass 2 tracePoints into panels
          for (const aiPanel of result.analysis.panels) {
            const targetPanel = panels.find(p => p.lead === aiPanel.lead);
            if (targetPanel && aiPanel.tracePoints) {
              targetPanel.tracePoints = aiPanel.tracePoints;
              targetPanel.criticalPoints = aiPanel.criticalPoints;
            }
          }

          // Regenerate traces for panels that got tracePoints
          for (const panel of panelsForPass2) {
            if (panel.tracePoints && panel.tracePoints.length > 0) {
              const aiTrace = this.createTraceFromAIPoints(panel);
              if (aiTrace) {
                // Replace existing trace
                const idx = traces.findIndex(t => t.lead === panel.lead);
                if (idx >= 0) {
                  traces[idx] = aiTrace;
                } else {
                  traces.push(aiTrace);
                }
              }
            }
          }

          stages.push({
            name: 'pass2_ai',
            status: 'success',
            confidence: result.confidence,
            durationMs: Date.now() - pass2Start,
            notes: `Refined ${panelsForPass2.length} panels`,
          });

          console.log(`[TwoPass] Pass 2: Refined ${panelsForPass2.length} panels`);
        } catch (error) {
          console.warn('[TwoPass] Pass 2 failed:', error);
          stages.push({
            name: 'pass2_ai',
            status: 'failed',
            confidence: 0,
            durationMs: Date.now() - pass2Start,
            notes: String(error),
          });
        }
      }
    }

    // =========================================================================
    // RECONSTRUCT SIGNAL
    // =========================================================================
    if (traces.length === 0) {
      return this.createFailure(stages, startTime, 'No waveforms extracted');
    }

    const reconstructor = new SignalReconstructor(
      calibration,
      gridInfo,
      { targetSampleRate: this.config.targetSampleRate }
    );

    const signal = reconstructor.reconstruct(traces);

    // Calculate overall confidence
    const avgTraceConf = traces.reduce((sum, t) =>
      sum + t.confidence.reduce((a, b) => a + b, 0) / t.confidence.length, 0
    ) / traces.length;

    return {
      success: true,
      signal,
      confidence: avgTraceConf,
      leadConfidence: Object.fromEntries(
        traces.map(t => [t.lead, t.confidence.reduce((a, b) => a + b, 0) / t.confidence.length])
      ),
      stages,
      issues: [],
      suggestions: [],
      gridInfo,
      calibration,
      panels,
      processingTimeMs: Date.now() - startTime,
      method: 'hybrid',
    };
  }

  /**
   * Parse hex color string to RGB
   */
  private parseColor(hex?: string): { r: number; g: number; b: number } | undefined {
    if (!hex) return undefined;
    const match = hex.match(/^#?([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/);
    if (!match) return undefined;
    return {
      r: parseInt(match[1], 16),
      g: parseInt(match[2], 16),
      b: parseInt(match[3], 16),
    };
  }

  /**
   * Check if traces include all critical leads
   */
  private hasAllCriticalLeads(traces: RawTrace[], criticalLeads: LeadName[]): boolean {
    const traceLeads = new Set(traces.map(t => t.lead));
    return criticalLeads.every(lead => traceLeads.has(lead));
  }

  /**
   * Get panels that need Pass 2 refinement
   */
  private getPanelsForPass2(
    allPanels: PanelAnalysis[],
    lowQualityPanels: PanelAnalysis[],
    criticalLeads: LeadName[]
  ): PanelAnalysis[] {
    const result: PanelAnalysis[] = [];
    const addedLeads = new Set<LeadName>();

    // Add all critical leads
    for (const lead of criticalLeads) {
      const panel = allPanels.find(p => p.lead === lead);
      if (panel && !addedLeads.has(lead)) {
        result.push(panel);
        addedLeads.add(lead);
      }
    }

    // Add low quality panels (up to 3 more)
    for (const panel of lowQualityPanels) {
      if (panel.lead && !addedLeads.has(panel.lead) && result.length < 6) {
        result.push(panel);
        addedLeads.add(panel.lead);
      }
    }

    return result;
  }

  /**
   * Create trace from AI tracePoints
   */
  private createTraceFromAIPoints(panel: PanelAnalysis): RawTrace | null {
    if (!panel.tracePoints || panel.tracePoints.length < 2 || !panel.lead) {
      return null;
    }

    const bounds = panel.bounds;
    const allPoints = [...panel.tracePoints].sort((a, b) => a.xPercent - b.xPercent);

    const xPixels: number[] = [];
    const yPixels: number[] = [];
    const confidence: number[] = [];

    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      const xPercent = ((x - bounds.x) / bounds.width) * 100;

      let left = allPoints[0];
      let right = allPoints[allPoints.length - 1];

      for (let i = 0; i < allPoints.length - 1; i++) {
        if (allPoints[i].xPercent <= xPercent && allPoints[i + 1].xPercent >= xPercent) {
          left = allPoints[i];
          right = allPoints[i + 1];
          break;
        }
      }

      const t = left.xPercent === right.xPercent ? 0 :
        (xPercent - left.xPercent) / (right.xPercent - left.xPercent);
      const yPixel = left.yPixel + t * (right.yPixel - left.yPixel);

      xPixels.push(x);
      yPixels.push(yPixel);
      confidence.push(0.95);
    }

    return {
      panelId: panel.id,
      lead: panel.lead,
      xPixels,
      yPixels,
      confidence,
      baselineY: panel.baselineY,
      gaps: [],
      method: 'ai_guided',
    };
  }

  /**
   * Create failure result
   */
  private createFailure(stages: ProcessingStage[], startTime: number, error: string): DigitizerResult {
    return {
      success: false,
      confidence: 0,
      leadConfidence: {},
      stages,
      issues: [{ code: 'FATAL', severity: 'error', message: error }],
      suggestions: ['Check API key', 'Ensure image is clear'],
      gridInfo: { detected: false, type: 'unknown', confidence: 0 },
      calibration: {
        found: false, gain: 10, paperSpeed: 25,
        gainSource: 'standard_assumed', speedSource: 'standard_assumed', confidence: 0
      },
      panels: [],
      processingTimeMs: Date.now() - startTime,
      method: 'hybrid',
    };
  }
}

/**
 * Convenience function
 */
export async function digitizeWithTwoPass(
  source: File | Blob | string | ImageData,
  config?: TwoPassConfig
): Promise<DigitizerResult> {
  const digitizer = new TwoPassDigitizer(config);
  return digitizer.digitize(source);
}
