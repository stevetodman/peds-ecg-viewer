/**
 * Deterministic local screenshot tracing for the browser demo.
 *
 * This module intentionally contains no provider, network, OCR, or diagnosis
 * integration. It creates an inspectable single-strip candidate only when the
 * local image supplies enough geometric evidence to make that safe.
 */

import { CalibrationPulseDetector } from './cv/calibration-pulse-detector';
import { LocalGridDetector } from './cv/grid-detector';
import { WaveformTracer } from './cv/waveform-tracer';
import { SignalReconstructor } from './signal/reconstructor';
import type { CalibrationAnalysis, GridAnalysis, RawTrace } from './types';

export type LocalAutoTraceStatus = 'accepted' | 'manual-review' | 'rejected';

export interface LocalAutoTraceEvidence {
  image: { width: number; height: number; adequate: boolean };
  grid: Pick<GridAnalysis, 'detected' | 'confidence' | 'pxPerMm' | 'smallBoxPx'>;
  calibration: {
    pulseFound: boolean;
    confidence: number;
    method: 'square_pulse' | 'grid_only';
    pxPerMv?: number;
  };
  trace: {
    coverage: number;
    meanPointConfidence: number;
    gapRatio: number;
    pointCount: number;
    quality: number;
  };
}

export interface LocalAutoTraceCandidate {
  status: LocalAutoTraceStatus;
  reasons: string[];
  evidence: LocalAutoTraceEvidence;
  trace?: RawTrace;
  /** Reconstructed locally at 500 Hz when a candidate is available. */
  samplesUv?: number[];
}

const MIN_WIDTH = 600;
const MIN_HEIGHT = 300;
const MIN_GRID_CONFIDENCE = 0.55;
const MIN_TRACE_COVERAGE = 0.7;
const MIN_TRACE_QUALITY = 0.64;

function emptyEvidence(imageData: ImageData): LocalAutoTraceEvidence {
  return {
    image: {
      width: imageData.width,
      height: imageData.height,
      adequate: imageData.width >= MIN_WIDTH && imageData.height >= MIN_HEIGHT,
    },
    grid: { detected: false, confidence: 0 },
    calibration: { pulseFound: false, confidence: 0, method: 'grid_only' },
    trace: { coverage: 0, meanPointConfidence: 0, gapRatio: 1, pointCount: 0, quality: 0 },
  };
}

function rejected(imageData: ImageData, reasons: string[], evidence = emptyEvidence(imageData)): LocalAutoTraceCandidate {
  return { status: 'rejected', reasons, evidence };
}

function candidateCalibration(grid: GridAnalysis, imageData: ImageData): { calibration: CalibrationAnalysis; evidence: LocalAutoTraceEvidence['calibration'] } {
  const pulse = new CalibrationPulseDetector(imageData).detect();
  if (pulse.found && pulse.confidence >= 0.7) {
    return {
      calibration: {
        found: true,
        location: pulse.location,
        heightPx: pulse.heightPx,
        widthPx: pulse.widthPx,
        gain: 10,
        paperSpeed: 25,
        gainSource: 'calibration_pulse',
        speedSource: 'standard_assumed',
        confidence: pulse.confidence,
      },
      evidence: {
        pulseFound: true,
        confidence: pulse.confidence,
        method: 'square_pulse',
        pxPerMv: pulse.pxPerMv,
      },
    };
  }

  return {
    calibration: {
      found: false,
      gain: 10,
      paperSpeed: 25,
      gainSource: 'standard_assumed',
      speedSource: 'standard_assumed',
      confidence: Math.min(0.45, grid.confidence),
    },
    evidence: { pulseFound: false, confidence: Math.min(0.45, grid.confidence), method: 'grid_only' },
  };
}

function traceQuality(trace: RawTrace, width: number, imageQuality: number): LocalAutoTraceEvidence['trace'] {
  const xRange = trace.xPixels.length ? Math.max(...trace.xPixels) - Math.min(...trace.xPixels) + 1 : 0;
  const coverage = Math.min(1, xRange / width);
  const gapPixels = trace.gaps.reduce((sum, gap) => sum + Math.max(0, gap.endX - gap.startX), 0);
  const gapRatio = Math.min(1, gapPixels / Math.max(1, width));
  const meanPointConfidence = trace.confidence.length
    ? trace.confidence.reduce((sum, value) => sum + value, 0) / trace.confidence.length
    : 0;
  const quality = Math.max(0, Math.min(1,
    coverage * 0.5 + meanPointConfidence * 0.35 + (1 - gapRatio) * 0.1 + imageQuality * 0.05,
  ));
  return { coverage, meanPointConfidence, gapRatio, pointCount: trace.xPixels.length, quality };
}

/**
 * Trace a local ECG screenshot with deterministic, in-process computer vision.
 * A missing grid, unreadable calibration, or discontinuous trace never becomes
 * an accepted candidate; callers should retain their manual-caliper workflow.
 */
export async function autoTraceLocalScreenshot(imageData: ImageData): Promise<LocalAutoTraceCandidate> {
  const evidence = emptyEvidence(imageData);
  if (!evidence.image.adequate) {
    return rejected(imageData, [`Image is ${imageData.width} × ${imageData.height} px; at least ${MIN_WIDTH} × ${MIN_HEIGHT} px is required for local tracing.`], evidence);
  }

  const analysis = await new LocalGridDetector(imageData).analyze();
  evidence.grid = {
    detected: analysis.grid.detected,
    confidence: analysis.grid.confidence,
    pxPerMm: analysis.grid.pxPerMm,
    smallBoxPx: analysis.grid.smallBoxPx,
  };
  if (!analysis.grid.detected || analysis.grid.confidence < MIN_GRID_CONFIDENCE || !analysis.grid.pxPerMm) {
    return rejected(imageData, ['A consistent ECG grid could not be verified locally. Use the manual calipers and enter the image scale.'], evidence);
  }

  const { calibration, evidence: calibrationEvidence } = candidateCalibration(analysis.grid, imageData);
  evidence.calibration = calibrationEvidence;
  const marginX = Math.round(imageData.width * 0.05);
  const marginY = Math.round(imageData.height * 0.1);
  const panel = {
    id: 'local-screenshot-strip',
    lead: 'II' as const,
    leadSource: 'user_input' as const,
    bounds: { x: marginX, y: marginY, width: imageData.width - marginX * 2, height: imageData.height - marginY * 2 },
    baselineY: Math.round(imageData.height / 2),
    row: 0,
    col: 0,
    isRhythmStrip: true,
    timeRange: { startSec: 0, endSec: 0 },
    labelConfidence: 0,
  };
  const trace = new WaveformTracer(imageData, {
    darknessThreshold: 115,
    minPointConfidence: 0.35,
    maxInterpolateGap: 8,
    rejectArtifacts: true,
  }).tracePanel(panel);
  if (!trace) {
    return rejected(imageData, ['No continuous dark waveform could be separated from the screenshot. Use the manual calipers.'], evidence);
  }

  evidence.trace = traceQuality(trace, panel.bounds.width, analysis.imageQuality.overall);
  if (evidence.trace.coverage < MIN_TRACE_COVERAGE || evidence.trace.quality < MIN_TRACE_QUALITY) {
    return rejected(imageData, ['The local trace is too incomplete or uncertain for a candidate waveform. Use the manual calipers.'], evidence);
  }

  let samplesUv: number[] | undefined;
  try {
    samplesUv = new SignalReconstructor(calibration, analysis.grid, { targetSampleRate: 500, enhancedFiltering: false })
      .reconstruct([trace]).leads.II;
  } catch {
    return rejected(imageData, ['The traced pixels could not be reconstructed into a local waveform. Use the manual calipers.'], evidence);
  }

  const reasons: string[] = [];
  const status: LocalAutoTraceStatus = calibration.found && evidence.trace.quality >= 0.84
    ? 'accepted'
    : 'manual-review';
  if (!calibration.found) reasons.push('No calibration pulse was verified; 25 mm/s and 10 mm/mV are displayed as assumptions for review only.');
  if (status === 'manual-review') reasons.push('Inspect and adjust the cyan candidate trace before relying on its geometric values.');
  return { status, reasons, evidence, trace, samplesUv };
}
