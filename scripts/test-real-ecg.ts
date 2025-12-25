/**
 * Test digitizer on a real ECG image
 */

import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { ECGDigitizer } from '../src/signal/loader/png-digitizer/digitizer';

const TEST_IMAGE = process.argv[2] || '/Users/steven/gemuse/test_ecgs/normal_ecg.png';

async function testReal() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('Set ANTHROPIC_API_KEY');
    process.exit(1);
  }

  console.log(`Testing: ${TEST_IMAGE}`);

  // Load image
  const buffer = readFileSync(TEST_IMAGE);
  const png = PNG.sync.read(buffer);
  const imageData: ImageData = {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height,
    colorSpace: 'srgb' as PredefinedColorSpace,
  };

  console.log(`Image size: ${png.width}x${png.height}`);

  // Digitize
  console.log('\nDigitizing...');
  const digitizer = new ECGDigitizer({
    aiProvider: 'anthropic',
    apiKey,
    model: 'claude-sonnet-4-20250514',
    targetSampleRate: 500,
  });

  const result = await digitizer.digitize(imageData);

  // Results
  console.log('\n=== Digitization Results ===');
  console.log(`Success: ${result.success}`);
  console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  console.log(`Method: ${result.method}`);
  console.log(`Processing time: ${result.processingTimeMs}ms`);

  console.log('\n=== Stages ===');
  for (const stage of result.stages) {
    console.log(`  ${stage.name}: ${stage.status} (conf: ${(stage.confidence * 100).toFixed(0)}%)`);
    if (stage.notes) console.log(`    Notes: ${stage.notes}`);
  }

  console.log('\n=== Grid Info ===');
  console.log(`  pxPerMm: ${result.gridInfo?.pxPerMm?.toFixed(2) ?? 'unknown'}`);
  console.log(`  Type: ${result.gridInfo?.type ?? 'unknown'}`);

  console.log('\n=== Calibration ===');
  console.log(`  Gain: ${result.calibration?.gain} mm/mV`);
  console.log(`  Paper speed: ${result.calibration?.paperSpeed} mm/s`);

  console.log('\n=== Panels Detected ===');
  for (const panel of result.panels || []) {
    console.log(`  ${(panel.lead || '?').padEnd(4)}: (${panel.bounds.x.toFixed(0)},${panel.bounds.y.toFixed(0)}) ${panel.bounds.width.toFixed(0)}x${panel.bounds.height.toFixed(0)}`);
  }

  console.log('\n=== Signal Data ===');
  if (result.signal) {
    console.log(`  Sample rate: ${result.signal.sampleRate} Hz`);
    console.log(`  Duration: ${result.signal.duration?.toFixed(2)} seconds`);
    console.log(`  Leads:`);
    for (const [lead, samples] of Object.entries(result.signal.leads)) {
      if (samples && samples.length > 0) {
        const min = Math.min(...samples);
        const max = Math.max(...samples);
        console.log(`    ${lead}: ${samples.length} samples, range: ${min.toFixed(0)} to ${max.toFixed(0)} µV`);
      }
    }
  } else {
    console.log('  No signal extracted');
  }

  console.log('\n=== Issues ===');
  for (const issue of result.issues || []) {
    console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
  }

  if (result.suggestions && result.suggestions.length > 0) {
    console.log('\n=== Suggestions ===');
    for (const suggestion of result.suggestions) {
      console.log(`  - ${suggestion}`);
    }
  }
}

testReal().catch(console.error);
