/**
 * Validate digitizer with round-trip test
 * 1. Load a known ECG signal
 * 2. Render it to an image
 * 3. Digitize the image
 * 4. Compare digitized signal to original
 */

import { readFileSync, writeFileSync } from 'fs';
import { PNG } from 'pngjs';
import { createCanvas } from 'canvas';
import { ECGDigitizer } from '../src/signal/loader/png-digitizer/digitizer';

// Load a sample ECG from your JSON dataset
const SAMPLE_ECG = '/Users/steven/gemuse/json_ecgs/ASD_P00073_E02.json';
const RENDERED_IMAGE = '/Users/steven/gemuse/test_ecgs/roundtrip_test.png';

interface SampleECG {
  signal: {
    leads: Record<string, number[]>;
    sample_rate?: number;
  };
  patient?: { age?: string };
  test?: { sample_rate?: number };
}

async function validateDigitizer() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('Set ANTHROPIC_API_KEY');
    process.exit(1);
  }

  console.log('=== Digitizer Round-Trip Validation ===\n');

  // 1. Load original ECG
  console.log('1. Loading original ECG...');
  const ecgData: SampleECG = JSON.parse(readFileSync(SAMPLE_ECG, 'utf-8'));
  const sampleRate = ecgData.signal.sample_rate || ecgData.test?.sample_rate || 500;

  // Get signal data (handle both formats)
  const signalData = ecgData.signal.leads || ecgData.signal;

  // Normalize lead names (handle both AVR and aVR formats)
  const standardLeads = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
  const leads = Object.keys(signalData).filter(k =>
    standardLeads.includes(k) || standardLeads.includes(k.toUpperCase().replace('AVR', 'aVR').replace('AVL', 'aVL').replace('AVF', 'aVF'))
  );

  console.log(`   Sample rate: ${sampleRate} Hz`);
  console.log(`   Leads: ${leads.join(', ')}`);
  console.log(`   Samples per lead: ${signalData[leads[0]]?.length || 0}`);

  // 2. Render to image (simple 3x4 layout)
  console.log('\n2. Rendering ECG to image...');
  const imageData = renderECGToImage(signalData, sampleRate, leads);

  // Save as PNG
  const png = new PNG({ width: imageData.width, height: imageData.height });
  png.data = Buffer.from(imageData.data);
  writeFileSync(RENDERED_IMAGE, PNG.sync.write(png));
  console.log(`   Saved: ${RENDERED_IMAGE}`);
  console.log(`   Size: ${imageData.width}x${imageData.height}`);

  // 3. Digitize the rendered image
  console.log('\n3. Digitizing rendered image...');
  const digitizer = new ECGDigitizer({
    aiProvider: 'anthropic',
    apiKey,
    model: 'claude-sonnet-4-20250514',
    targetSampleRate: sampleRate,
  });

  const result = await digitizer.digitize(imageData);

  console.log(`   Success: ${result.success}`);
  console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  console.log(`   Leads extracted: ${result.signal ? Object.keys(result.signal.leads).length : 0}`);

  if (!result.success || !result.signal) {
    console.log('\n   VALIDATION FAILED: Could not digitize');
    return;
  }

  // 4. Compare signals
  console.log('\n4. Comparing original vs digitized signals...');
  console.log('=' .repeat(60));

  let totalCorrelation = 0;
  let leadCount = 0;

  // For rendered ECG, we only show 2.5 seconds = 1250 samples at 500Hz
  const samplesRendered = Math.floor(sampleRate * 2.5);

  for (const lead of leads) {
    const original = signalData[lead];
    // Handle case differences: original might be 'AVR' but digitized will be 'aVR'
    const normalizedLead = lead.toUpperCase().replace('AVR', 'aVR').replace('AVL', 'aVL').replace('AVF', 'aVF');
    const digitized = result.signal.leads[normalizedLead as keyof typeof result.signal.leads];

    if (!original || !digitized) {
      console.log(`   ${lead}: MISSING`);
      continue;
    }

    // Only compare the portion that was actually rendered (2.5s)
    const origPortion = original.slice(0, samplesRendered);

    // Normalize both signals
    const origNorm = normalize(origPortion);
    const digNorm = normalize(digitized);

    // For correlation, we need to align and potentially resample
    // Use cross-correlation to find optimal alignment
    const { correlation, offset, alignedOrig, alignedDig } = alignAndCorrelate(origNorm, digNorm);

    // Calculate RMSE after alignment
    const rmse = calculateRMSE(alignedOrig, alignedDig);

    const status = correlation > 0.8 ? '✓' : correlation > 0.5 ? '~' : '✗';
    console.log(`   ${normalizedLead.padEnd(4)}: r=${correlation.toFixed(3)} RMSE=${rmse.toFixed(3)} offset=${offset} ${status}`);
    console.log(`         orig: ${origPortion.length} samples, dig: ${digitized.length} samples`);

    if (!isNaN(correlation)) {
      totalCorrelation += correlation;
      leadCount++;
    }
  }

  const avgCorrelation = leadCount > 0 ? totalCorrelation / leadCount : 0;
  console.log('=' .repeat(60));
  console.log(`\n   Average correlation: ${avgCorrelation.toFixed(3)}`);

  if (avgCorrelation > 0.8) {
    console.log('   VALIDATION PASSED: Digitizer produces accurate signals');
  } else if (avgCorrelation > 0.5) {
    console.log('   VALIDATION PARTIAL: Digitizer produces roughly correct signals');
  } else {
    console.log('   VALIDATION FAILED: Digitizer output does not match original');
  }

  // Additional diagnostics
  console.log('\n5. Digitizer diagnostics:');
  console.log(`   Grid pxPerMm: ${result.gridInfo?.pxPerMm?.toFixed(2) ?? 'unknown'}`);
  console.log(`   Calibration gain: ${result.calibration?.gain} mm/mV`);
  console.log(`   Calibration speed: ${result.calibration?.paperSpeed} mm/s`);
  console.log(`   Stages:`);
  for (const stage of result.stages) {
    console.log(`     - ${stage.name}: ${stage.status} (conf: ${(stage.confidence * 100).toFixed(0)}%)`);
    if (stage.notes) console.log(`       ${stage.notes}`);
  }
}

/**
 * Render ECG signal to a simple 3x4 grid image
 */
function renderECGToImage(
  signal: Record<string, number[]>,
  sampleRate: number,
  leads: string[]
): ImageData {
  const width = 1200;
  const height = 900;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Draw pink grid
  ctx.strokeStyle = '#FFCCCC';
  ctx.lineWidth = 0.5;
  const gridSize = 4; // 1mm at ~100 DPI
  for (let x = 0; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Thicker lines every 5mm
  ctx.strokeStyle = '#FF9999';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += gridSize * 5) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += gridSize * 5) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Standard 12-lead layout
  const layout = [
    ['I', 'aVR', 'V1', 'V4'],
    ['II', 'aVL', 'V2', 'V5'],
    ['III', 'aVF', 'V3', 'V6'],
  ];

  const panelWidth = width / 4;
  const panelHeight = height / 3;
  const mmPerMv = 10; // Standard 10mm/mV
  const mmPerSec = 25; // Standard 25mm/s
  const pxPerMm = gridSize;

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;
  ctx.font = '14px Arial';
  ctx.fillStyle = '#000000';

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const leadName = layout[row][col];
      // Handle both 'aVR' and 'AVR' naming conventions
      const leadData = signal[leadName] || signal[leadName.toUpperCase()];

      if (!leadData) continue;

      const panelX = col * panelWidth + 20;
      const panelY = row * panelHeight + 30;
      const baselineY = panelY + panelHeight / 2;

      // Draw lead label
      ctx.fillText(leadName, panelX, panelY - 10);

      // Draw waveform
      ctx.beginPath();

      // Calculate how many samples to show (2.5 seconds)
      const duration = 2.5;
      const samplesToShow = Math.min(leadData.length, Math.floor(sampleRate * duration));

      // Width available for waveform
      const waveformWidth = panelWidth - 40;

      // Detect if values are in volts (small) or microvolts (large)
      const maxVal = Math.max(...leadData.slice(0, samplesToShow).map(Math.abs));
      const scaleFactor = maxVal < 10 ? 1 : 0.001; // If max < 10, assume mV; otherwise uV -> mV

      for (let i = 0; i < samplesToShow; i++) {
        const x = panelX + (i / samplesToShow) * waveformWidth;
        // Convert to pixels (10mm/mV)
        const mV = leadData[i] * scaleFactor;
        const y = baselineY - mV * mmPerMv * pxPerMm;

        // Clamp Y to panel bounds
        const clampedY = Math.max(panelY, Math.min(panelY + panelHeight - 10, y));

        if (i === 0) {
          ctx.moveTo(x, clampedY);
        } else {
          ctx.lineTo(x, clampedY);
        }
      }
      ctx.stroke();
    }
  }

  // Get ImageData
  const imgData = ctx.getImageData(0, 0, width, height);
  return {
    data: new Uint8ClampedArray(imgData.data),
    width,
    height,
    colorSpace: 'srgb' as PredefinedColorSpace,
  };
}

/**
 * Normalize signal to zero mean, unit variance
 */
function normalize(signal: number[]): number[] {
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
  const variance = signal.reduce((sum, x) => sum + (x - mean) ** 2, 0) / signal.length;
  const std = Math.sqrt(variance) || 1;
  return signal.map(x => (x - mean) / std);
}

/**
 * Resample signal to target length using linear interpolation
 */
function resample(signal: number[], targetLength: number): number[] {
  if (signal.length === targetLength) return signal;

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

/**
 * Align two signals and compute correlation
 * Resamples the shorter signal and tries different offsets
 */
function alignAndCorrelate(orig: number[], dig: number[]): {
  correlation: number;
  offset: number;
  alignedOrig: number[];
  alignedDig: number[];
} {
  // Resample both to the same length (use the longer one)
  const targetLen = Math.max(orig.length, dig.length);
  const origResampled = resample(orig, targetLen);
  const digResampled = resample(dig, targetLen);

  // Try different offsets to find best alignment
  // This accounts for potential timing shifts
  const maxOffset = Math.floor(targetLen * 0.1); // Up to 10% shift
  let bestCorr = -2;
  let bestOffset = 0;

  for (let offset = -maxOffset; offset <= maxOffset; offset += 5) {
    const start = Math.max(0, offset);
    const end = Math.min(targetLen, targetLen + offset);
    const len = end - start;

    if (len < 100) continue;

    const o = origResampled.slice(start, end);
    const d = digResampled.slice(Math.max(0, -offset), Math.max(0, -offset) + len);

    if (o.length !== d.length) continue;

    const corr = pearsonCorrelation(o, d);
    if (corr > bestCorr) {
      bestCorr = corr;
      bestOffset = offset;
    }
  }

  // Return aligned signals at best offset
  const start = Math.max(0, bestOffset);
  const end = Math.min(targetLen, targetLen + bestOffset);
  const alignedOrig = origResampled.slice(start, end);
  const alignedDig = digResampled.slice(Math.max(0, -bestOffset), Math.max(0, -bestOffset) + (end - start));

  return {
    correlation: bestCorr,
    offset: bestOffset,
    alignedOrig,
    alignedDig,
  };
}

/**
 * Calculate Pearson correlation coefficient
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0) return 0;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denomX = 0;
  let denomY = 0;

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

/**
 * Calculate Root Mean Square Error
 */
function calculateRMSE(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0) return 0;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (x[i] - y[i]) ** 2;
  }
  return Math.sqrt(sum / n);
}

validateDigitizer().catch(console.error);
