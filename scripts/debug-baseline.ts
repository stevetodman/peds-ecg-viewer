/**
 * Debug baseline detection issues
 */

import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { AnthropicProvider } from '../src/signal/loader/png-digitizer/ai/anthropic';
import { detectBaseline } from '../src/signal/loader/png-digitizer/cv/baseline-detector';

const TEST_IMAGE = '/Users/steven/gemuse/test_ecgs/roundtrip_test.png';
const API_KEY = process.env.ANTHROPIC_API_KEY;

async function debug() {
  if (!API_KEY) {
    console.log('Set ANTHROPIC_API_KEY');
    process.exit(1);
  }

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
  const provider = new AnthropicProvider(API_KEY, 'claude-sonnet-4-20250514');
  const aiResult = await provider.analyze(imageData);

  console.log('\n=== Baseline Detection Debug ===\n');

  // Expected baselines based on render code:
  // panelHeight = 900/3 = 300
  // baselineY for each row = rowIndex * 300 + 300/2 = 150, 450, 750
  const expectedBaselines = {
    row0: 150, // I, aVR, V1, V4
    row1: 450, // II, aVL, V2, V5
    row2: 750, // III, aVF, V3, V6
  };

  for (const panel of aiResult.analysis.panels) {
    const aiBaseline = panel.baselineY;

    // Run our baseline detector
    const detected = detectBaseline(imageData, panel.bounds, panel.baselineY);

    // Expected baseline
    const row = panel.row ?? 0;
    const expectedBaseline = row === 0 ? expectedBaselines.row0 : row === 1 ? expectedBaselines.row1 : expectedBaselines.row2;

    const aiError = Math.abs(aiBaseline - expectedBaseline);
    const detectedError = Math.abs(detected.baselineY - expectedBaseline);

    console.log(`${(panel.lead || '?').padEnd(4)}:`);
    console.log(`  Bounds: y=${panel.bounds.y.toFixed(0)}, h=${panel.bounds.height.toFixed(0)}`);
    console.log(`  Expected baseline: ${expectedBaseline}`);
    console.log(`  AI baseline: ${aiBaseline.toFixed(0)} (error: ${aiError.toFixed(0)}px)`);
    console.log(`  Detected baseline: ${detected.baselineY.toFixed(0)} (error: ${detectedError.toFixed(0)}px, method: ${detected.method})`);
    console.log(`  Better: ${detectedError < aiError ? 'Detected' : 'AI'}`);
    console.log();
  }
}

debug().catch(console.error);
