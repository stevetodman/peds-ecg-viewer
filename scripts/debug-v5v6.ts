/**
 * Debug V5/V6 low correlation issue
 */

import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { AnthropicProvider } from '../src/signal/loader/png-digitizer/ai/anthropic';
import { WaveformTracer } from '../src/signal/loader/png-digitizer/cv/waveform-tracer';
import { detectBaseline } from '../src/signal/loader/png-digitizer/cv/baseline-detector';
import { SignalReconstructor } from '../src/signal/loader/png-digitizer/signal/reconstructor';

const TEST_IMAGE = '/Users/steven/gemuse/test_ecgs/roundtrip_test.png';
const SAMPLE_ECG = '/Users/steven/gemuse/json_ecgs/ASD_P00073_E02.json';

async function debug() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('Set ANTHROPIC_API_KEY');
    process.exit(1);
  }

  // Load original ECG
  const ecgData = JSON.parse(readFileSync(SAMPLE_ECG, 'utf-8'));
  const signalData = ecgData.signal.leads || ecgData.signal;

  // Load image
  const buffer = readFileSync(TEST_IMAGE);
  const png = PNG.sync.read(buffer);
  const imageData: ImageData = {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height,
    colorSpace: 'srgb' as PredefinedColorSpace,
  };

  console.log(`Image: ${png.width}x${png.height}`);
  const panelWidth = png.width / 4;  // 300
  const panelHeight = png.height / 3; // 300

  // Get AI analysis
  console.log('\nGetting AI analysis...');
  const provider = new AnthropicProvider(apiKey, 'claude-sonnet-4-20250514');
  const aiResult = await provider.analyze(imageData);

  // Focus on V5, V6 and compare with V4 (which has better correlation)
  console.log('\n=== Column 3 Analysis (V4, V5, V6) ===\n');

  for (const leadName of ['V4', 'V5', 'V6']) {
    const panel = aiResult.analysis.panels.find(p => p.lead === leadName);
    if (!panel) {
      console.log(`${leadName}: NOT DETECTED\n`);
      continue;
    }

    const expectedRow = leadName === 'V4' ? 0 : leadName === 'V5' ? 1 : 2;
    const expectedX = 3 * panelWidth;
    const expectedY = expectedRow * panelHeight;
    const expectedBaseline = expectedRow * panelHeight + panelHeight / 2;

    console.log(`${leadName} (expected row=${expectedRow}, col=3):`);
    console.log(`  AI Bounds: x=${panel.bounds.x.toFixed(0)}, y=${panel.bounds.y.toFixed(0)}, w=${panel.bounds.width.toFixed(0)}, h=${panel.bounds.height.toFixed(0)}`);
    console.log(`  Expected:  x=${expectedX.toFixed(0)}, y=${expectedY.toFixed(0)}`);
    console.log(`  X diff: ${(panel.bounds.x - expectedX).toFixed(0)}px, Y diff: ${(panel.bounds.y - expectedY).toFixed(0)}px`);

    // Apply bounds correction (as in validatePanelBounds)
    const correctedBounds = { ...panel.bounds };
    const yDeviation = Math.abs(correctedBounds.y - expectedY) / panelHeight;
    if (yDeviation > 0.25) {
      correctedBounds.y = expectedY + panelHeight * 0.05;
      correctedBounds.height = panelHeight * 0.9;
      console.log(`  Bounds CORRECTED: y=${correctedBounds.y.toFixed(0)}, h=${correctedBounds.height.toFixed(0)}`);
    }

    // Detect baseline
    const baselineResult = detectBaseline(imageData, correctedBounds, panel.baselineY);
    console.log(`  Expected baseline: ${expectedBaseline.toFixed(0)}`);
    console.log(`  AI baseline: ${panel.baselineY.toFixed(0)} (diff: ${(panel.baselineY - expectedBaseline).toFixed(0)})`);
    console.log(`  Detected baseline: ${baselineResult.baselineY.toFixed(0)} (diff: ${(baselineResult.baselineY - expectedBaseline).toFixed(0)}, method: ${baselineResult.method})`);

    // Trace with corrected bounds and baseline
    const correctedPanel = {
      ...panel,
      bounds: correctedBounds,
      baselineY: baselineResult.confidence > 0.4 ? baselineResult.baselineY : panel.baselineY,
    };

    const tracer = new WaveformTracer(imageData, { darknessThreshold: 80 });
    const trace = tracer.tracePanel(correctedPanel);

    if (trace) {
      console.log(`  Trace: ${trace.xPixels.length} points`);
      console.log(`  Trace X range: ${Math.min(...trace.xPixels).toFixed(0)} to ${Math.max(...trace.xPixels).toFixed(0)}`);
      console.log(`  Trace Y range: ${Math.min(...trace.yPixels).toFixed(0)} to ${Math.max(...trace.yPixels).toFixed(0)}`);
      console.log(`  Trace baseline used: ${trace.baselineY.toFixed(0)}`);

      // Convert Y to voltage using basic conversion
      const pxPerMm = 4.4; // approximate
      const gain = 10; // mm/mV
      const pxPerMv = pxPerMm * gain;

      const voltages = trace.yPixels.map(y => (trace.baselineY - y) / pxPerMv * 1000);
      const minV = Math.min(...voltages);
      const maxV = Math.max(...voltages);
      console.log(`  Digitized voltage range: ${minV.toFixed(0)} to ${maxV.toFixed(0)} µV`);

      // Original signal
      const original = signalData[leadName];
      if (original) {
        const origSlice = original.slice(0, 1250);
        const origMin = Math.min(...origSlice) * 1000; // Convert to µV
        const origMax = Math.max(...origSlice) * 1000;
        console.log(`  Original voltage range: ${origMin.toFixed(0)} to ${origMax.toFixed(0)} µV`);

        // Check polarity
        const digMean = voltages.reduce((a, b) => a + b, 0) / voltages.length;
        const origMean = origSlice.reduce((a: number, b: number) => a + b, 0) / origSlice.length * 1000;
        console.log(`  Digitized mean: ${digMean.toFixed(0)} µV, Original mean: ${origMean.toFixed(0)} µV`);

        // Simple correlation check
        // Resample to same length
        const resampledDig = resample(voltages, 1250);
        const corr = pearsonCorrelation(origSlice.map((x: number) => x * 1000), resampledDig);
        console.log(`  Direct correlation (no alignment): ${corr.toFixed(3)}`);
      }
    } else {
      console.log(`  Trace: FAILED`);
    }

    console.log();
  }
}

function resample(signal: number[], targetLength: number): number[] {
  const result: number[] = [];
  const ratio = (signal.length - 1) / (targetLength - 1);
  for (let i = 0; i < targetLength; i++) {
    const srcIdx = i * ratio;
    const srcIdxFloor = Math.floor(srcIdx);
    const srcIdxCeil = Math.min(srcIdxFloor + 1, signal.length - 1);
    const t = srcIdx - srcIdxFloor;
    result.push(signal[srcIdxFloor] * (1 - t) + signal[srcIdxCeil] * t);
  }
  return result;
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : num / denom;
}

debug().catch(console.error);
