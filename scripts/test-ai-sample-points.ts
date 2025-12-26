/**
 * Test if AI returns tracePoints with updated comprehensive prompt
 * Uses Opus 4.5 for best vision accuracy
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { AnthropicProvider } from '../src/signal/loader/png-digitizer/ai/anthropic';

const TEST_IMAGES = [
  '/Users/steven/gemuse/test_ecgs/normal_ecg.png',
  '/Users/steven/gemuse/test_ecgs/CHDdECG/Figures/ECG example.png',
];

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('Set ANTHROPIC_API_KEY in .env');
    process.exit(1);
  }

  for (const testImage of TEST_IMAGES) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${testImage.split('/').pop()}`);
    console.log('='.repeat(60));

    const buffer = readFileSync(testImage);
    const png = PNG.sync.read(buffer);
    const imageData: ImageData = {
      data: new Uint8ClampedArray(png.data),
      width: png.width,
      height: png.height,
      colorSpace: 'srgb' as PredefinedColorSpace,
    };

    console.log(`Image: ${png.width}x${png.height}`);
    console.log('Calling Opus 4.5...\n');

    const provider = new AnthropicProvider(apiKey);
    const result = await provider.analyze(imageData);

    console.log('Grid Analysis:');
    console.log(`  waveformColor: ${result.analysis.grid.waveformColor}`);
    console.log(`  gridLineColor: ${result.analysis.grid.gridLineColor || result.analysis.grid.thinLineColor}`);
    console.log(`  pxPerMm: ${result.analysis.grid.pxPerMm}`);

    console.log('\nCalibration:');
    console.log(`  paperSpeed: ${result.analysis.calibration.paperSpeed} mm/s`);
    console.log(`  gain: ${result.analysis.calibration.gain} mm/mV`);

    console.log(`\nPanels (${result.analysis.panels.length} detected):\n`);

    let panelsWithTracePoints = 0;
    for (const panel of result.analysis.panels) {
      console.log(`${panel.lead} (row ${panel.row}, col ${panel.col}):`);
      console.log(`  bounds: ${panel.bounds.x},${panel.bounds.y} ${panel.bounds.width}x${panel.bounds.height}`);
      console.log(`  baselineY: ${panel.baselineY}`);
      console.log(`  waveformYMin: ${panel.waveformYMin ?? 'N/A'}, waveformYMax: ${panel.waveformYMax ?? 'N/A'}`);

      if (panel.tracePoints && panel.tracePoints.length > 0) {
        panelsWithTracePoints++;
        console.log(`  tracePoints: ${panel.tracePoints.length} points`);
        // Show first 3 and last 3 points
        const tp = panel.tracePoints;
        const preview = tp.length <= 6
          ? tp.map(p => `${p.xPercent}%:${p.yPixel}`).join(', ')
          : `${tp.slice(0,3).map(p => `${p.xPercent}%:${p.yPixel}`).join(', ')} ... ${tp.slice(-3).map(p => `${p.xPercent}%:${p.yPixel}`).join(', ')}`;
        console.log(`    [${preview}]`);
      } else {
        console.log(`  tracePoints: NOT PROVIDED`);
      }
    }

    console.log(`\nSummary: ${panelsWithTracePoints}/${result.analysis.panels.length} panels have tracePoints`);

    // Einthoven verification if we have I, II, III with tracePoints
    const leadI = result.analysis.panels.find(p => p.lead === 'I');
    const leadII = result.analysis.panels.find(p => p.lead === 'II');
    const leadIII = result.analysis.panels.find(p => p.lead === 'III');

    if (leadI?.tracePoints && leadII?.tracePoints && leadIII?.tracePoints) {
      console.log('\nEinthoven Verification (II = I + III):');
      // Check at 25%, 50%, 75% points
      for (const pct of [25, 50, 75]) {
        const ptI = leadI.tracePoints.find(p => p.xPercent === pct);
        const ptII = leadII.tracePoints.find(p => p.xPercent === pct);
        const ptIII = leadIII.tracePoints.find(p => p.xPercent === pct);

        if (ptI && ptII && ptIII) {
          // Convert to voltage (baseline - yPixel, inverted because Y increases downward)
          const vI = leadI.baselineY - ptI.yPixel;
          const vII = leadII.baselineY - ptII.yPixel;
          const vIII = leadIII.baselineY - ptIII.yPixel;
          const expected = vI + vIII;
          const error = Math.abs(vII - expected);
          console.log(`  ${pct}%: I=${vI.toFixed(0)}px, II=${vII.toFixed(0)}px, III=${vIII.toFixed(0)}px, I+III=${expected.toFixed(0)}px, error=${error.toFixed(1)}px`);
        }
      }
    }
  }
}

main().catch(console.error);
