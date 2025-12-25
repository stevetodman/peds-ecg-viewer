/**
 * Diagnose panel detection for problematic leads
 */

import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { ECGDigitizer } from '../src/signal/loader/png-digitizer/digitizer';

const RENDERED_IMAGE = '/Users/steven/gemuse/test_ecgs/roundtrip_test.png';

async function diagnose() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('Set ANTHROPIC_API_KEY');
    process.exit(1);
  }

  // Load rendered image
  const buffer = readFileSync(RENDERED_IMAGE);
  const png = PNG.sync.read(buffer);
  const imageData: ImageData = {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height,
    colorSpace: 'srgb' as PredefinedColorSpace,
  };

  console.log(`Image: ${png.width}x${png.height}`);

  // Digitize
  const digitizer = new ECGDigitizer({
    aiProvider: 'anthropic',
    apiKey,
    model: 'claude-sonnet-4-20250514',
    targetSampleRate: 500,
  });
  const result = await digitizer.digitize(imageData);

  if (!result.success) {
    console.log('Digitization failed');
    return;
  }

  console.log('\n=== Panel Detection Diagnostics ===\n');

  // Show expected layout (based on render code)
  const layout = [
    ['I', 'aVR', 'V1', 'V4'],
    ['II', 'aVL', 'V2', 'V5'],
    ['III', 'aVF', 'V3', 'V6'],
  ];

  const panelWidth = png.width / 4;
  const panelHeight = png.height / 3;

  console.log('Expected panel positions (from render code):');
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const lead = layout[row][col];
      const expectedX = col * panelWidth + 20;
      const expectedY = row * panelHeight + 30;
      console.log(`  ${lead.padEnd(4)}: x=${expectedX.toFixed(0)}, y=${expectedY.toFixed(0)}, w=${(panelWidth - 40).toFixed(0)}, h=${(panelHeight - 40).toFixed(0)}`);
    }
  }

  console.log('\nDetected panel positions (from AI):');
  for (const panel of result.panels || []) {
    const b = panel.bounds;
    console.log(`  ${(panel.lead || '?').padEnd(4)}: x=${b.x.toFixed(0)}, y=${b.y.toFixed(0)}, w=${b.width.toFixed(0)}, h=${b.height.toFixed(0)}, baseline=${panel.baselineY?.toFixed(0) || '?'}`);
  }

  // Compare Lead I specifically
  console.log('\n=== Lead I Analysis ===');
  const leadI = result.panels?.find(p => p.lead === 'I');
  if (leadI) {
    console.log(`  Detected bounds: x=${leadI.bounds.x}, y=${leadI.bounds.y}, w=${leadI.bounds.width}, h=${leadI.bounds.height}`);
    console.log(`  Expected bounds: x=${20}, y=${30}, w=${panelWidth - 40}, h=${panelHeight - 40}`);
    console.log(`  Detected baseline: ${leadI.baselineY}`);
    console.log(`  Expected baseline: ~${30 + panelHeight / 2}`);
  } else {
    console.log('  NOT DETECTED');
  }

  // Compare V4 specifically
  console.log('\n=== Lead V4 Analysis ===');
  const leadV4 = result.panels?.find(p => p.lead === 'V4');
  if (leadV4) {
    console.log(`  Detected bounds: x=${leadV4.bounds.x}, y=${leadV4.bounds.y}, w=${leadV4.bounds.width}, h=${leadV4.bounds.height}`);
    console.log(`  Expected bounds: x=${3 * panelWidth + 20}, y=${30}, w=${panelWidth - 40}, h=${panelHeight - 40}`);
    console.log(`  Detected baseline: ${leadV4.baselineY}`);
    console.log(`  Expected baseline: ~${30 + panelHeight / 2}`);
  } else {
    console.log('  NOT DETECTED');
  }

  // Check if signal exists for these leads
  console.log('\n=== Signal Data ===');
  const signal = result.signal;
  if (signal) {
    console.log(`  Lead I: ${signal.leads['I']?.length || 0} samples`);
    console.log(`  Lead V4: ${signal.leads['V4']?.length || 0} samples`);

    // Check for amplitude issues
    if (signal.leads['I']) {
      const leadISamples = signal.leads['I'];
      const min = Math.min(...leadISamples);
      const max = Math.max(...leadISamples);
      console.log(`  Lead I range: ${min.toFixed(0)} to ${max.toFixed(0)} µV`);
    }
    if (signal.leads['V4']) {
      const leadV4Samples = signal.leads['V4'];
      const min = Math.min(...leadV4Samples);
      const max = Math.max(...leadV4Samples);
      console.log(`  Lead V4 range: ${min.toFixed(0)} to ${max.toFixed(0)} µV`);
    }
  }
}

diagnose().catch(console.error);
