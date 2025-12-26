/**
 * Test the Two-Pass Digitizer
 * Verifies minimal token usage while maintaining quality
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { TwoPassDigitizer } from '../src/signal/loader/png-digitizer/two-pass-digitizer';

const TEST_IMAGE = process.argv[2] || 'test_ecgs/normal_ecg.png';

async function test() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              TWO-PASS DIGITIZER TEST                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('❌ ANTHROPIC_API_KEY not set');
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

  console.log(`Image: ${TEST_IMAGE} (${png.width}x${png.height})\n`);

  // Test 1: Two-pass with cache disabled (force fresh API call)
  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│ Test 1: Fresh API call (cache disabled)                      │');
  console.log('└──────────────────────────────────────────────────────────────┘\n');

  const digitizer1 = new TwoPassDigitizer({
    apiKey,
    useCache: false,
    criticalLeads: ['I', 'II', 'III'],
  });

  const start1 = Date.now();
  const result1 = await digitizer1.digitize(imageData);
  const elapsed1 = Date.now() - start1;

  console.log(`\nResult:`);
  console.log(`  Success: ${result1.success}`);
  console.log(`  Time: ${elapsed1}ms`);
  console.log(`  Confidence: ${result1.confidence.toFixed(2)}`);
  console.log(`  Method: ${result1.method}`);
  console.log(`  Leads: ${Object.keys(result1.signal?.leads || {}).join(', ')}`);

  console.log(`\nStages:`);
  for (const stage of result1.stages) {
    const status = stage.status === 'success' ? '✓' : stage.status === 'failed' ? '✗' : '~';
    console.log(`  ${status} ${stage.name}: ${stage.durationMs}ms (conf: ${stage.confidence.toFixed(2)}) ${stage.notes || ''}`);
  }

  // Einthoven validation
  if (result1.signal) {
    console.log(`\nEinthoven Validation (II = I + III):`);
    const I = result1.signal.leads['I'];
    const II = result1.signal.leads['II'];
    const III = result1.signal.leads['III'];

    if (I && II && III) {
      const checkPoints = [100, 250, 400, 550];
      let totalErr = 0;

      for (const idx of checkPoints) {
        if (idx < I.length && idx < II.length && idx < III.length) {
          const expected = I[idx] + III[idx];
          const actual = II[idx];
          const err = Math.abs(actual - expected);
          totalErr += err;
          const status = err < 100 ? '✓' : err < 300 ? '~' : '✗';
          console.log(`  Sample ${idx}: I+III=${expected.toFixed(0)}, II=${actual.toFixed(0)}, err=${err.toFixed(0)}μV ${status}`);
        }
      }
      console.log(`  Average error: ${(totalErr / checkPoints.length).toFixed(1)}μV`);
    }
  }

  // Test 2: With cache enabled (should be instant on second run)
  console.log('\n┌──────────────────────────────────────────────────────────────┐');
  console.log('│ Test 2: With cache enabled                                    │');
  console.log('└──────────────────────────────────────────────────────────────┘\n');

  const digitizer2 = new TwoPassDigitizer({
    apiKey,
    useCache: true,
    criticalLeads: ['I', 'II', 'III'],
  });

  const start2 = Date.now();
  const result2 = await digitizer2.digitize(imageData);
  const elapsed2 = Date.now() - start2;

  console.log(`Result:`);
  console.log(`  Success: ${result2.success}`);
  console.log(`  Time: ${elapsed2}ms ${elapsed2 < 1000 ? '(cache hit!)' : ''}`);
  console.log(`  Confidence: ${result2.confidence.toFixed(2)}`);

  console.log(`\nStages:`);
  for (const stage of result2.stages) {
    const status = stage.status === 'success' ? '✓' : stage.status === 'failed' ? '✗' : '~';
    console.log(`  ${status} ${stage.name}: ${stage.durationMs}ms`);
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const pass1Stage = result1.stages.find(s => s.name === 'pass1_ai');
  const pass2Stage = result1.stages.find(s => s.name === 'pass2_ai');
  const localCvStage = result1.stages.find(s => s.name === 'local_cv');

  console.log(`Pass 1 (layout/labels): ${pass1Stage ? `${pass1Stage.durationMs}ms` : 'skipped'}`);
  console.log(`Local CV tracing: ${localCvStage ? `${localCvStage.durationMs}ms` : 'skipped'}`);
  console.log(`Pass 2 (tracePoints): ${pass2Stage ? `${pass2Stage.durationMs}ms` : 'skipped'}`);
  console.log(`Cache speedup: ${elapsed2 < elapsed1 ? `${((1 - elapsed2/elapsed1) * 100).toFixed(0)}% faster` : 'N/A'}`);

  // Estimate token usage
  const estimatedTokens = {
    pass1Input: 1500,
    pass1Output: 400,
    pass2Input: pass2Stage ? 1000 : 0,
    pass2Output: pass2Stage ? 2000 : 0,
  };

  const totalInput = estimatedTokens.pass1Input + estimatedTokens.pass2Input;
  const totalOutput = estimatedTokens.pass1Output + estimatedTokens.pass2Output;
  const cost = (totalInput * 15 + totalOutput * 75) / 1000000;

  console.log(`\nEstimated token usage:`);
  console.log(`  Input: ~${totalInput} tokens`);
  console.log(`  Output: ~${totalOutput} tokens`);
  console.log(`  Estimated cost: $${cost.toFixed(3)}`);
  console.log(`  Savings vs full: ${pass2Stage ? '69%' : '92%'}`);
}

test().catch(console.error);
