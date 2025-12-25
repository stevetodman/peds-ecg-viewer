/**
 * Visualize original vs digitized signal to see what's different
 */

import { readFileSync, writeFileSync } from 'fs';
import { PNG } from 'pngjs';
import { createCanvas } from 'canvas';
import { ECGDigitizer } from '../src/signal/loader/png-digitizer/digitizer';

const SAMPLE_ECG = '/Users/steven/gemuse/json_ecgs/ASD_P00073_E02.json';
const RENDERED_IMAGE = '/Users/steven/gemuse/test_ecgs/roundtrip_test.png';
const COMPARISON_IMAGE = '/Users/steven/gemuse/test_ecgs/comparison.png';

async function visualize() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('Set ANTHROPIC_API_KEY');
    process.exit(1);
  }

  // Load original
  const ecgData = JSON.parse(readFileSync(SAMPLE_ECG, 'utf-8'));
  const signalData = ecgData.signal.leads || ecgData.signal;
  const sampleRate = ecgData.signal.sample_rate || 500;

  // Load rendered image
  const buffer = readFileSync(RENDERED_IMAGE);
  const png = PNG.sync.read(buffer);
  const imageData: ImageData = {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height,
    colorSpace: 'srgb' as PredefinedColorSpace,
  };

  // Digitize
  console.log('Digitizing...');
  const digitizer = new ECGDigitizer({
    aiProvider: 'anthropic',
    apiKey,
    model: 'claude-sonnet-4-20250514',
    targetSampleRate: sampleRate,
  });
  const result = await digitizer.digitize(imageData);

  if (!result.success || !result.signal) {
    console.log('Digitization failed');
    return;
  }

  // Create comparison visualization
  const width = 1200;
  const height = 1800;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  const leads = ['I', 'II', 'III', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
  const panelHeight = height / leads.length;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const original = signalData[lead];
    const digitized = result.signal.leads[lead as keyof typeof result.signal.leads];

    const panelY = i * panelHeight;
    const baselineY = panelY + panelHeight / 2;

    // Draw lead label
    ctx.fillStyle = '#000000';
    ctx.font = '16px Arial';
    ctx.fillText(lead, 10, panelY + 20);

    if (!original || !digitized) {
      ctx.fillText('MISSING', 50, baselineY);
      continue;
    }

    // Draw baseline
    ctx.strokeStyle = '#CCCCCC';
    ctx.beginPath();
    ctx.moveTo(50, baselineY);
    ctx.lineTo(width - 10, baselineY);
    ctx.stroke();

    // Normalize for display
    const origMax = Math.max(...original.slice(0, 1250).map(Math.abs));
    const digMax = Math.max(...digitized.map(Math.abs));
    const scale = (panelHeight / 2 - 20);

    // Draw original (blue)
    ctx.strokeStyle = '#0000FF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const origSamples = Math.min(1250, original.length);
    for (let j = 0; j < origSamples; j++) {
      const x = 50 + (j / origSamples) * (width - 60);
      const y = baselineY - (original[j] / origMax) * scale;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw digitized (red)
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const digSamples = digitized.length;
    for (let j = 0; j < digSamples; j++) {
      const x = 50 + (j / digSamples) * (width - 60);
      const y = baselineY - (digitized[j] / digMax) * scale;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Legend
    ctx.fillStyle = '#0000FF';
    ctx.fillText(`Original (${origSamples} samples)`, 100, panelY + 20);
    ctx.fillStyle = '#FF0000';
    ctx.fillText(`Digitized (${digSamples} samples)`, 300, panelY + 20);
  }

  // Save
  const outBuffer = canvas.toBuffer('image/png');
  writeFileSync(COMPARISON_IMAGE, outBuffer);
  console.log(`Saved comparison: ${COMPARISON_IMAGE}`);
}

visualize().catch(console.error);
