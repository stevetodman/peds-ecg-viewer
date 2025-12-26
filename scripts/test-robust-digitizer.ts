/**
 * Test the robust digitizer with retry and cross-lead validation
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { RobustECGDigitizer } from '../src/signal/loader/png-digitizer/robust-digitizer';

const TEST_IMAGE = process.argv[2] || '/Users/steven/gemuse/test_ecgs/roundtrip_test.png';
const SAMPLE_ECG = '/Users/steven/gemuse/json_ecgs/ASD_P00073_E02.json';

async function test() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('Set ANTHROPIC_API_KEY');
    process.exit(1);
  }

  // Load original ECG for comparison
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

  console.log(`Testing robust digitizer on ${png.width}x${png.height} image\n`);

  // Create robust digitizer
  const digitizer = new RobustECGDigitizer({
    apiKey,
    maxAttempts: 3,
    earlyAcceptThreshold: 0.85,
    onAttempt: (attempt, result, validation) => {
      console.log(`Attempt ${attempt}:`);
      if (!result.success) {
        console.log(`  Failed: ${result.issues?.[0]?.message || 'Unknown error'}`);
        return;
      }

      const leadCount = Object.keys(result.signal?.leads || {}).length;
      console.log(`  Leads extracted: ${leadCount}`);

      if (validation) {
        console.log(`  Einthoven correlation: ${validation.einthovenCorrelation.toFixed(3)}`);
        console.log(`  Augmented leads sum: ${validation.augmentedLeadsSum.toFixed(3)}`);
        console.log(`  Overall valid: ${validation.overallValid}`);
        if (validation.suggestions.length > 0) {
          console.log(`  Suggestions: ${validation.suggestions.join(', ')}`);
        }
      }
      console.log();
    },
  });

  console.log('Running robust digitization (up to 3 attempts)...\n');
  const startTime = Date.now();
  const result = await digitizer.digitize(imageData);
  const elapsed = Date.now() - startTime;

  console.log('=== Final Result ===\n');
  console.log(`Success: ${result.success}`);
  console.log(`Attempts made: ${result.attemptsMade}`);
  console.log(`Total time: ${elapsed}ms (${(elapsed / result.attemptsMade).toFixed(0)}ms per attempt)`);

  if (result.success && result.signal) {
    const leads = Object.keys(result.signal.leads);
    console.log(`Leads: ${leads.join(', ')}`);
    console.log(`Sample count: ${result.signal.leads[leads[0] as keyof typeof result.signal.leads]?.length || 0}`);

    if (result.scoreBreakdown) {
      console.log(`\nScore breakdown:`);
      console.log(`  Einthoven correlation: ${result.scoreBreakdown.einthovenCorrelation.toFixed(3)}`);
      console.log(`  Augmented leads score: ${result.scoreBreakdown.augmentedLeadsScore.toFixed(3)}`);
      console.log(`  Lead count: ${result.scoreBreakdown.leadCount}`);
      console.log(`  Total score: ${result.scoreBreakdown.totalScore.toFixed(1)}/100`);
    }

    if (result.crossLeadValidation) {
      console.log(`\nCross-lead validation:`);
      console.log(`  Overall valid: ${result.crossLeadValidation.overallValid}`);
      console.log(`  Overall confidence: ${result.crossLeadValidation.overallConfidence.toFixed(3)}`);
    }

    // Compare with original signal
    console.log('\n=== Correlation with Original ===\n');
    for (const leadName of ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']) {
      // Handle case differences: original might be 'AVR' but we want 'aVR'
      const original = signalData[leadName] || signalData[leadName.toUpperCase()];
      const digitized = result.signal.leads[leadName as keyof typeof result.signal.leads];

      if (original && digitized) {
        const origSlice = original.slice(0, 1250);
        // Resample digitized to match original length
        const digResampled = resample(Array.from(digitized), origSlice.length);
        const corr = pearsonCorrelation(origSlice, digResampled);
        const status = corr > 0.7 ? '✓' : corr > 0.4 ? '~' : '✗';
        console.log(`  ${leadName.padEnd(4)}: r=${corr.toFixed(3)} ${status}`);
      } else {
        console.log(`  ${leadName.padEnd(4)}: missing`);
      }
    }
  }

  if (result.issues && result.issues.length > 0) {
    console.log(`\nIssues: ${result.issues.map(i => i.message).join('; ')}`);
  }
}

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

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0, denomX = 0, denomY = 0;
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

test().catch(console.error);
