/**
 * Debug raw traces from digitizer
 */

import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { AnthropicProvider } from '../src/signal/loader/png-digitizer/ai/anthropic';
import { LocalGridDetector, mergeAILabelsWithRuleGeometry } from '../src/signal/loader/png-digitizer/cv/grid-detector';
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

  console.log(`Image: ${png.width}x${png.height}\n`);

  // Get hybrid panels
  const provider = new AnthropicProvider(apiKey, 'claude-sonnet-4-20250514');
  const aiResult = await provider.analyze(imageData);
  const localDetector = new LocalGridDetector(imageData);
  const ruleResult = await localDetector.analyze();
  const hybridPanels = mergeAILabelsWithRuleGeometry(ruleResult.panels, aiResult.analysis.panels);

  console.log('=== Hybrid Panels for Column 0 ===\n');

  // Focus on column 0 leads (I, II, III)
  const col0Panels = hybridPanels.filter(p => ['I', 'II', 'III'].includes(p.lead || ''));

  const tracer = new WaveformTracer(imageData, { darknessThreshold: 80 });

  for (const panel of col0Panels) {
    if (!panel.lead) continue;

    console.log(`\n${panel.lead}:`);
    console.log(`  Panel bounds: x=${panel.bounds.x}, y=${panel.bounds.y}, w=${panel.bounds.width}, h=${panel.bounds.height}`);
    console.log(`  Panel baseline: ${panel.baselineY}`);

    // Improve baseline
    const baselineResult = detectBaseline(imageData, panel.bounds, panel.baselineY);
    console.log(`  Improved baseline: ${baselineResult.baselineY.toFixed(1)} (method: ${baselineResult.method}, conf: ${baselineResult.confidence.toFixed(2)})`);

    const improvedPanel = { ...panel, baselineY: baselineResult.baselineY };
    const trace = tracer.tracePanel(improvedPanel);

    if (!trace) {
      console.log(`  TRACE FAILED`);
      continue;
    }

    const minX = Math.min(...trace.xPixels);
    const maxX = Math.max(...trace.xPixels);
    const minY = Math.min(...trace.yPixels);
    const maxY = Math.max(...trace.yPixels);

    console.log(`  Trace X range: ${minX} to ${maxX} (${trace.xPixels.length} points)`);
    console.log(`  Trace Y range: ${minY} to ${maxY}`);
    console.log(`  Baseline Y used: ${trace.baselineY.toFixed(1)}`);

    // Show first 10 points
    console.log(`  First 10 points (X, Y, voltage):`);
    for (let i = 0; i < Math.min(10, trace.xPixels.length); i++) {
      const x = trace.xPixels[i];
      const y = trace.yPixels[i];
      const voltage = (trace.baselineY - y) / 31 * 1000; // Approximate μV
      console.log(`    ${i}: X=${x}, Y=${y.toFixed(1)}, V=${voltage.toFixed(0)}μV`);
    }
  }

  // Check X alignment across leads
  console.log('\n\n=== X Alignment Check ===\n');

  const traces = new Map<string, { xPixels: number[], yPixels: number[], baselineY: number }>();

  for (const panel of col0Panels) {
    if (!panel.lead) continue;
    const baselineResult = detectBaseline(imageData, panel.bounds, panel.baselineY);
    const improvedPanel = { ...panel, baselineY: baselineResult.baselineY };
    const trace = tracer.tracePanel(improvedPanel);
    if (trace) {
      traces.set(panel.lead, { xPixels: trace.xPixels, yPixels: trace.yPixels, baselineY: trace.baselineY });
    }
  }

  if (traces.size === 3) {
    const traceI = traces.get('I')!;
    const traceII = traces.get('II')!;
    const traceIII = traces.get('III')!;

    // Find global min X for column
    const globalMinX = Math.min(
      Math.min(...traceI.xPixels),
      Math.min(...traceII.xPixels),
      Math.min(...traceIII.xPixels)
    );

    console.log(`Global min X for column: ${globalMinX}`);
    console.log(`I starts at: ${Math.min(...traceI.xPixels)} (offset: ${Math.min(...traceI.xPixels) - globalMinX})`);
    console.log(`II starts at: ${Math.min(...traceII.xPixels)} (offset: ${Math.min(...traceII.xPixels) - globalMinX})`);
    console.log(`III starts at: ${Math.min(...traceIII.xPixels)} (offset: ${Math.min(...traceIII.xPixels) - globalMinX})`);

    // Check values at specific X positions
    console.log('\n=== Values at Same X Positions ===\n');

    const sampleXPositions = [50, 75, 100, 125, 150];
    for (const targetX of sampleXPositions) {
      const findValueAtX = (trace: typeof traceI, x: number): number | null => {
        for (let i = 0; i < trace.xPixels.length; i++) {
          if (Math.abs(trace.xPixels[i] - x) < 2) {
            return (trace.baselineY - trace.yPixels[i]) / 31 * 1000;
          }
        }
        return null;
      };

      const vI = findValueAtX(traceI, targetX);
      const vII = findValueAtX(traceII, targetX);
      const vIII = findValueAtX(traceIII, targetX);

      if (vI !== null && vII !== null && vIII !== null) {
        const expected = vI + vIII;
        const error = Math.abs(vII - expected);
        console.log(`X=${targetX}: I=${vI.toFixed(0)}, II=${vII.toFixed(0)}, III=${vIII.toFixed(0)}, I+III=${expected.toFixed(0)}, err=${error.toFixed(0)}μV`);
      }
    }
  }
}

debug().catch(console.error);
