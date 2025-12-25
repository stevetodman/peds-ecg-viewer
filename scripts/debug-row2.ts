/**
 * Debug why row 2 leads (III, V3, V6) have bad correlation
 */

import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { AnthropicProvider } from '../src/signal/loader/png-digitizer/ai/anthropic';
import { WaveformTracer } from '../src/signal/loader/png-digitizer/cv/waveform-tracer';
import { detectBaseline } from '../src/signal/loader/png-digitizer/cv/baseline-detector';

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

  // Get AI analysis
  console.log('\nGetting AI analysis...');
  const provider = new AnthropicProvider(apiKey, 'claude-sonnet-4-20250514');
  const aiResult = await provider.analyze(imageData);

  // Focus on row 2 leads
  console.log('\n=== Row 2 Analysis ===\n');

  const row2Leads = ['III', 'aVF', 'V3', 'V6'];
  const panelHeight = 300;
  const panelWidth = 300;

  for (const leadName of row2Leads) {
    const panel = aiResult.analysis.panels.find(p => p.lead === leadName);
    if (!panel) {
      console.log(`${leadName}: NOT DETECTED`);
      continue;
    }

    console.log(`\n${leadName}:`);
    console.log(`  AI Panel: row=${panel.row}, col=${panel.col}`);
    console.log(`  AI Bounds: x=${panel.bounds.x.toFixed(0)}, y=${panel.bounds.y.toFixed(0)}, w=${panel.bounds.width.toFixed(0)}, h=${panel.bounds.height.toFixed(0)}`);
    console.log(`  AI Baseline: ${panel.baselineY.toFixed(0)}`);

    // Expected based on render code
    const expectedRow = 2;
    const expectedCol = leadName === 'III' ? 0 : leadName === 'aVF' ? 1 : leadName === 'V3' ? 2 : 3;
    const expectedX = expectedCol * panelWidth + 20;
    const expectedY = expectedRow * panelHeight + 30;
    const expectedBaseline = expectedRow * panelHeight + panelHeight / 2;

    console.log(`  Expected: row=${expectedRow}, col=${expectedCol}`);
    console.log(`  Expected X: ${expectedX} (AI: ${panel.bounds.x.toFixed(0)}, diff: ${Math.abs(expectedX - panel.bounds.x).toFixed(0)})`);
    console.log(`  Expected Y: ${expectedY} (AI: ${panel.bounds.y.toFixed(0)}, diff: ${Math.abs(expectedY - panel.bounds.y).toFixed(0)})`);
    console.log(`  Expected baseline: ${expectedBaseline} (AI: ${panel.baselineY.toFixed(0)}, diff: ${Math.abs(expectedBaseline - panel.baselineY).toFixed(0)})`);

    // Run our baseline detector
    const baselineResult = detectBaseline(imageData, panel.bounds, panel.baselineY);
    console.log(`  Detected baseline: ${baselineResult.baselineY.toFixed(0)} (method: ${baselineResult.method}, conf: ${baselineResult.confidence.toFixed(2)})`);

    // Trace the waveform
    const tracer = new WaveformTracer(imageData, { darknessThreshold: 80 });

    // Create panel with improved baseline
    const improvedPanel = { ...panel, baselineY: baselineResult.baselineY };
    const trace = tracer.tracePanel(improvedPanel);

    if (trace) {
      console.log(`  Trace: ${trace.xPixels.length} points, baseline used: ${trace.baselineY.toFixed(0)}`);

      // Check Y value range
      const minY = Math.min(...trace.yPixels);
      const maxY = Math.max(...trace.yPixels);
      console.log(`  Y range: ${minY.toFixed(0)} to ${maxY.toFixed(0)} (span: ${(maxY - minY).toFixed(0)})`);

      // Check if trace is inverted relative to baseline
      const avgY = trace.yPixels.reduce((a, b) => a + b, 0) / trace.yPixels.length;
      console.log(`  Avg Y: ${avgY.toFixed(0)}, baseline: ${trace.baselineY.toFixed(0)}`);
      console.log(`  Signal appears ${avgY > trace.baselineY ? 'below' : 'above'} baseline`);
    } else {
      console.log(`  Trace: FAILED`);
    }

    // Check original signal
    const original = signalData[leadName];
    if (original) {
      const origMin = Math.min(...original.slice(0, 1250));
      const origMax = Math.max(...original.slice(0, 1250));
      const origMean = original.slice(0, 1250).reduce((a: number, b: number) => a + b, 0) / 1250;
      console.log(`  Original signal: min=${origMin.toFixed(0)}, max=${origMax.toFixed(0)}, mean=${origMean.toFixed(0)}`);
    }
  }
}

debug().catch(console.error);
