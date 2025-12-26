/**
 * Deep debug - investigate time alignment across leads
 */

import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { AnthropicProvider } from '../src/signal/loader/png-digitizer/ai/anthropic';
import { WaveformTracer } from '../src/signal/loader/png-digitizer/cv/waveform-tracer';
import { detectBaseline } from '../src/signal/loader/png-digitizer/cv/baseline-detector';

const TEST_IMAGE = '/Users/steven/gemuse/test_ecgs/normal_ecg.png';

async function deepDebug() {
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

  console.log('=== DEEP DEBUG: Time Alignment Investigation ===\n');
  console.log(`Image: ${png.width}x${png.height}\n`);

  const provider = new AnthropicProvider(apiKey, 'claude-sonnet-4-20250514');
  const result = await provider.analyze(imageData);

  const tracer = new WaveformTracer(imageData, { darknessThreshold: 80 });

  // Focus on Column 0: I, II, III (should satisfy Einthoven's law)
  console.log('=== Column 0 Analysis (I, II, III) ===\n');
  console.log('These leads should satisfy Einthoven\'s law: II = I + III\n');

  const column0Leads = ['I', 'II', 'III'];
  const traces: Record<string, { xPixels: number[], yPixels: number[], baselineY: number }> = {};

  for (const leadName of column0Leads) {
    const panel = result.analysis.panels.find(p => p.lead === leadName && !p.isRhythmStrip);
    if (!panel) {
      console.log(`${leadName}: NOT FOUND`);
      continue;
    }

    // Improve baseline
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
    };

    const minX = Math.min(...trace.xPixels);
    const maxX = Math.max(...trace.xPixels);
    const minY = Math.min(...trace.yPixels);
    const maxY = Math.max(...trace.yPixels);

    console.log(`${leadName}:`);
    console.log(`  Panel bounds: x=${panel.bounds.x}, y=${panel.bounds.y}`);
    console.log(`  Trace X range: ${minX.toFixed(0)} to ${maxX.toFixed(0)} (span: ${(maxX - minX).toFixed(0)}px)`);
    console.log(`  Trace Y range: ${minY.toFixed(0)} to ${maxY.toFixed(0)}`);
    console.log(`  Baseline Y: ${trace.baselineY.toFixed(1)}`);
    console.log(`  Points: ${trace.xPixels.length}`);
    console.log();
  }

  // KEY INSIGHT: Check if X ranges are aligned
  console.log('=== X Position Alignment Check ===\n');

  const allMinX: number[] = [];
  const allMaxX: number[] = [];
  for (const lead of column0Leads) {
    if (traces[lead]) {
      const minX = Math.min(...traces[lead].xPixels);
      const maxX = Math.max(...traces[lead].xPixels);
      allMinX.push(minX);
      allMaxX.push(maxX);
      console.log(`${lead}: starts at X=${minX.toFixed(0)}, ends at X=${maxX.toFixed(0)}`);
    }
  }

  const globalMinX = Math.min(...allMinX);
  const globalMaxX = Math.max(...allMaxX);
  console.log(`\nGlobal X range: ${globalMinX.toFixed(0)} to ${globalMaxX.toFixed(0)}`);
  console.log(`Variation in start X: ${(Math.max(...allMinX) - Math.min(...allMinX)).toFixed(0)}px`);

  // THE BUG: Current reconstructor uses per-trace minX, not global minX
  console.log('\n=== THE PROBLEM: Per-trace vs Global X reference ===\n');

  const pxPerMm = 3.1; // From calibration
  const paperSpeed = 25; // mm/s
  const pxPerSec = pxPerMm * paperSpeed;
  const pxPerMv = pxPerMm * 10; // 10mm/mV gain

  console.log(`Calibration: ${pxPerMm.toFixed(2)} px/mm, ${paperSpeed} mm/s`);
  console.log(`Conversion: ${pxPerSec.toFixed(1)} px/sec, ${pxPerMv.toFixed(1)} px/mV\n`);

  // Simulate current behavior (per-trace minX)
  console.log('Current behavior (per-trace X reference):');
  const currentSamples: Record<string, { time: number, voltage: number }[]> = {};

  for (const lead of column0Leads) {
    if (!traces[lead]) continue;
    const trace = traces[lead];
    const traceMinX = Math.min(...trace.xPixels);  // Per-trace reference

    currentSamples[lead] = trace.xPixels.map((x, i) => ({
      time: (x - traceMinX) / pxPerSec,  // Time from trace start
      voltage: (trace.baselineY - trace.yPixels[i]) / pxPerMv * 1000, // μV
    }));

    console.log(`  ${lead} sample[0]: t=${currentSamples[lead][0].time.toFixed(3)}s, v=${currentSamples[lead][0].voltage.toFixed(0)}μV`);
  }

  // Simulate correct behavior (global minX)
  console.log('\nCorrect behavior (global X reference):');
  const correctSamples: Record<string, { time: number, voltage: number }[]> = {};

  for (const lead of column0Leads) {
    if (!traces[lead]) continue;
    const trace = traces[lead];

    correctSamples[lead] = trace.xPixels.map((x, i) => ({
      time: (x - globalMinX) / pxPerSec,  // Time from GLOBAL start
      voltage: (trace.baselineY - trace.yPixels[i]) / pxPerMv * 1000, // μV
    }));

    console.log(`  ${lead} sample[0]: t=${correctSamples[lead][0].time.toFixed(3)}s, v=${correctSamples[lead][0].voltage.toFixed(0)}μV`);
  }

  // Check Einthoven's law with both methods
  console.log('\n=== Einthoven\'s Law Check (II = I + III) ===\n');

  if (traces['I'] && traces['II'] && traces['III']) {
    // Find common time points (approximate)
    const findValueAtTime = (samples: { time: number, voltage: number }[], targetTime: number): number | null => {
      // Find closest sample
      let closest = samples[0];
      let minDiff = Math.abs(samples[0].time - targetTime);
      for (const s of samples) {
        const diff = Math.abs(s.time - targetTime);
        if (diff < minDiff) {
          minDiff = diff;
          closest = s;
        }
      }
      if (minDiff > 0.02) return null; // Within 20ms
      return closest.voltage;
    };

    console.log('With CURRENT method (per-trace X):');
    let currentErrors: number[] = [];
    for (let t = 0; t < 2.0; t += 0.1) {
      const vI = findValueAtTime(currentSamples['I'], t);
      const vII = findValueAtTime(currentSamples['II'], t);
      const vIII = findValueAtTime(currentSamples['III'], t);

      if (vI !== null && vII !== null && vIII !== null) {
        const expected = vI + vIII;
        const error = Math.abs(vII - expected);
        currentErrors.push(error);
        if (t < 0.5) {
          console.log(`  t=${t.toFixed(1)}s: I=${vI.toFixed(0)}, III=${vIII.toFixed(0)}, I+III=${expected.toFixed(0)}, II=${vII.toFixed(0)}, error=${error.toFixed(0)}μV`);
        }
      }
    }
    const avgCurrentError = currentErrors.reduce((a, b) => a + b, 0) / currentErrors.length;
    console.log(`  Average error: ${avgCurrentError.toFixed(0)}μV\n`);

    console.log('With CORRECT method (global X):');
    let correctErrors: number[] = [];
    for (let t = 0; t < 2.0; t += 0.1) {
      const vI = findValueAtTime(correctSamples['I'], t);
      const vII = findValueAtTime(correctSamples['II'], t);
      const vIII = findValueAtTime(correctSamples['III'], t);

      if (vI !== null && vII !== null && vIII !== null) {
        const expected = vI + vIII;
        const error = Math.abs(vII - expected);
        correctErrors.push(error);
        if (t < 0.5) {
          console.log(`  t=${t.toFixed(1)}s: I=${vI.toFixed(0)}, III=${vIII.toFixed(0)}, I+III=${expected.toFixed(0)}, II=${vII.toFixed(0)}, error=${error.toFixed(0)}μV`);
        }
      }
    }
    const avgCorrectError = correctErrors.reduce((a, b) => a + b, 0) / correctErrors.length;
    console.log(`  Average error: ${avgCorrectError.toFixed(0)}μV\n`);

    console.log('=== CONCLUSION ===');
    console.log(`Current method average error: ${avgCurrentError.toFixed(0)}μV`);
    console.log(`Correct method average error: ${avgCorrectError.toFixed(0)}μV`);
    console.log(`Improvement: ${((avgCurrentError - avgCorrectError) / avgCurrentError * 100).toFixed(1)}%`);
  }
}

deepDebug().catch(console.error);
