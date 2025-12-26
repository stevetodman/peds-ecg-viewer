/**
 * Debug Einthoven's law at the waveform level
 * Align by R-peak instead of time to check if voltage relationship holds
 */

import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { AnthropicProvider } from '../src/signal/loader/png-digitizer/ai/anthropic';
import { WaveformTracer } from '../src/signal/loader/png-digitizer/cv/waveform-tracer';
import { detectBaseline } from '../src/signal/loader/png-digitizer/cv/baseline-detector';

const TEST_IMAGE = '/Users/steven/gemuse/test_ecgs/normal_ecg.png';

async function debug() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('Set ANTHROPIC_API_KEY');
    process.exit(1);
  }

  const buffer = readFileSync(TEST_IMAGE);
  const png = PNG.sync.read(buffer);
  const imageData: ImageData = {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height,
    colorSpace: 'srgb' as PredefinedColorSpace,
  };

  console.log('=== Einthoven\'s Law Debug ===\n');
  console.log(`Image: ${png.width}x${png.height}\n`);

  const provider = new AnthropicProvider(apiKey, 'claude-sonnet-4-20250514');
  const result = await provider.analyze(imageData);
  const tracer = new WaveformTracer(imageData, { darknessThreshold: 80 });

  // Extract raw traces for I, II, III
  const traces: Record<string, {
    xPixels: number[],
    yPixels: number[],
    baselineY: number,
    panelBounds: { x: number, y: number, width: number, height: number }
  }> = {};

  for (const leadName of ['I', 'II', 'III']) {
    const panel = result.analysis.panels.find(p => p.lead === leadName && !p.isRhythmStrip);
    if (!panel) {
      console.log(`${leadName}: NOT FOUND`);
      continue;
    }

    const baselineResult = detectBaseline(imageData, panel.bounds, panel.baselineY);
    const improvedPanel = { ...panel, baselineY: baselineResult.baselineY };
    const trace = tracer.tracePanel(improvedPanel);

    if (!trace) {
      console.log(`${leadName}: TRACE FAILED`);
      continue;
    }

    traces[leadName] = {
      xPixels: trace.xPixels,
      yPixels: trace.yPixels,
      baselineY: trace.baselineY,
      panelBounds: panel.bounds
    };
  }

  if (!traces['I'] || !traces['II'] || !traces['III']) {
    console.log('Missing leads, cannot verify Einthoven\'s law');
    return;
  }

  const pxPerMv = 31; // From calibration (3.1 px/mm * 10mm/mV)

  // Convert to voltages
  const voltages: Record<string, number[]> = {};
  for (const lead of ['I', 'II', 'III']) {
    const t = traces[lead];
    voltages[lead] = t.yPixels.map(y => (t.baselineY - y) / pxPerMv * 1000); // μV
  }

  console.log('=== Raw Voltage Statistics ===\n');
  for (const lead of ['I', 'II', 'III']) {
    const v = voltages[lead];
    const min = Math.min(...v);
    const max = Math.max(...v);
    const range = max - min;
    console.log(`${lead}: min=${min.toFixed(0)}μV, max=${max.toFixed(0)}μV, range=${range.toFixed(0)}μV`);
  }

  // Find R-wave peak (maximum positive deflection) for each lead
  console.log('\n=== R-wave Peak Analysis ===\n');

  const findRPeaks = (voltages: number[], minDistance: number = 50): number[] => {
    const threshold = Math.max(...voltages) * 0.7;
    const peaks: number[] = [];

    for (let i = 1; i < voltages.length - 1; i++) {
      if (voltages[i] > threshold &&
          voltages[i] > voltages[i-1] &&
          voltages[i] > voltages[i+1]) {
        if (peaks.length === 0 || i - peaks[peaks.length - 1] > minDistance) {
          peaks.push(i);
        }
      }
    }
    return peaks;
  };

  const peaks: Record<string, number[]> = {};
  for (const lead of ['I', 'II', 'III']) {
    peaks[lead] = findRPeaks(voltages[lead]);
    console.log(`${lead}: ${peaks[lead].length} R-peaks at indices ${peaks[lead].join(', ')}`);
  }

  // Check Einthoven's law at each corresponding peak
  console.log('\n=== Einthoven at R-peaks ===\n');
  console.log('Theory: II = I + III\n');

  // Use Lead II peaks as reference
  for (let i = 0; i < peaks['II'].length; i++) {
    const iiPeakIdx = peaks['II'][i];

    // Find closest peak in I and III (within 20 samples)
    const findClosest = (targetIdx: number, leadPeaks: number[]): number | null => {
      let closest: number | null = null;
      let minDist = Infinity;
      for (const pk of leadPeaks) {
        const dist = Math.abs(pk - targetIdx);
        if (dist < minDist && dist < 20) {
          minDist = dist;
          closest = pk;
        }
      }
      return closest;
    };

    const iPeakIdx = findClosest(iiPeakIdx, peaks['I']);
    const iiiPeakIdx = findClosest(iiPeakIdx, peaks['III']);

    if (iPeakIdx !== null && iiiPeakIdx !== null) {
      const vI = voltages['I'][iPeakIdx];
      const vII = voltages['II'][iiPeakIdx];
      const vIII = voltages['III'][iiiPeakIdx];
      const expected = vI + vIII;
      const error = vII - expected;
      const errorPercent = Math.abs(error) / Math.abs(vII) * 100;

      console.log(`Peak ${i + 1}:`);
      console.log(`  I[${iPeakIdx}] = ${vI.toFixed(0)}μV`);
      console.log(`  II[${iiPeakIdx}] = ${vII.toFixed(0)}μV`);
      console.log(`  III[${iiiPeakIdx}] = ${vIII.toFixed(0)}μV`);
      console.log(`  I + III = ${expected.toFixed(0)}μV`);
      console.log(`  Error: ${error.toFixed(0)}μV (${errorPercent.toFixed(1)}%)`);
      console.log();
    }
  }

  // Alternative: Check at isoelectric points (baseline)
  console.log('=== Einthoven at Isoelectric (baseline) ===\n');

  // Find segments close to baseline (voltage near 0)
  const findBaseline = (voltages: number[]): number[] => {
    const threshold = Math.max(...voltages.map(Math.abs)) * 0.1; // Within 10% of max
    const baselineIndices: number[] = [];
    for (let i = 0; i < voltages.length; i++) {
      if (Math.abs(voltages[i]) < threshold) {
        baselineIndices.push(i);
      }
    }
    return baselineIndices;
  };

  const iBaseline = findBaseline(voltages['I']);
  const iiBaseline = findBaseline(voltages['II']);
  const iiiBaseline = findBaseline(voltages['III']);

  console.log(`Baseline segments: I=${iBaseline.length}, II=${iiBaseline.length}, III=${iiiBaseline.length}`);

  // Sample a few baseline points
  const checkN = Math.min(5, iBaseline.length, iiBaseline.length, iiiBaseline.length);
  let baselineErrors: number[] = [];
  for (let i = 0; i < checkN; i++) {
    const idx = Math.floor(i * iBaseline.length / checkN);
    const iIdx = iBaseline[idx];

    // Find closest baseline point in other leads
    const closestII = iiBaseline.reduce((a, b) => Math.abs(b - iIdx) < Math.abs(a - iIdx) ? b : a);
    const closestIII = iiiBaseline.reduce((a, b) => Math.abs(b - iIdx) < Math.abs(a - iIdx) ? b : a);

    const vI = voltages['I'][iIdx];
    const vII = voltages['II'][closestII];
    const vIII = voltages['III'][closestIII];
    const error = Math.abs(vII - (vI + vIII));
    baselineErrors.push(error);

    console.log(`Baseline ${i + 1}: I=${vI.toFixed(0)}, II=${vII.toFixed(0)}, III=${vIII.toFixed(0)}, error=${error.toFixed(0)}μV`);
  }
  console.log(`Average baseline error: ${(baselineErrors.reduce((a,b) => a+b, 0) / baselineErrors.length).toFixed(0)}μV`);

  // Visual check: Look at pixel positions
  console.log('\n=== Panel Position Verification ===\n');
  console.log('Each row should cover the same Y-range of the waveform:');
  for (const lead of ['I', 'II', 'III']) {
    const t = traces[lead];
    const panelHeight = t.panelBounds.height;
    const traceYMin = Math.min(...t.yPixels);
    const traceYMax = Math.max(...t.yPixels);
    const relYMin = traceYMin - t.panelBounds.y;
    const relYMax = traceYMax - t.panelBounds.y;
    console.log(`${lead}: panel Y=${t.panelBounds.y}, height=${panelHeight}, trace relative: ${relYMin.toFixed(0)}-${relYMax.toFixed(0)}`);
  }

  // Check baseline position within each panel
  console.log('\n=== Baseline Position (relative to panel) ===\n');
  for (const lead of ['I', 'II', 'III']) {
    const t = traces[lead];
    const relBaseline = t.baselineY - t.panelBounds.y;
    const percentFromTop = (relBaseline / t.panelBounds.height) * 100;
    console.log(`${lead}: baseline at ${relBaseline.toFixed(1)}px (${percentFromTop.toFixed(1)}% from panel top)`);
  }
}

debug().catch(console.error);
