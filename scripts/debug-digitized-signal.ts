/**
 * Debug the actual digitized signals from the full pipeline
 */

import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { ECGDigitizer } from '../src/signal/loader/png-digitizer/digitizer';

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

  // Run full digitizer
  const digitizer = new ECGDigitizer({
    apiKey,
    aiProvider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    enableLocalFallback: true,
  });

  console.log('Running digitizer...\n');
  const result = await digitizer.digitize(imageData);

  if (!result.success || !result.signal) {
    console.log('Digitization failed:', result.issues?.[0]?.message);
    return;
  }

  console.log('=== Digitizer Result ===\n');
  console.log(`Leads: ${Object.keys(result.signal.leads).join(', ')}`);
  console.log(`Sample rate: ${result.signal.sampleRate} Hz`);
  console.log(`Duration: ${result.signal.duration.toFixed(2)}s`);
  console.log(`Method: ${result.method}`);
  console.log();

  // Show stages
  console.log('=== Stages ===\n');
  for (const stage of result.stages) {
    console.log(`  ${stage.name}: ${stage.status} (conf: ${stage.confidence.toFixed(2)})${stage.notes ? ' - ' + stage.notes : ''}`);
  }
  console.log();

  // Analyze limb leads
  const leadI = result.signal.leads['I'];
  const leadII = result.signal.leads['II'];
  const leadIII = result.signal.leads['III'];

  if (!leadI || !leadII || !leadIII) {
    console.log('Missing limb leads');
    return;
  }

  console.log('=== Limb Lead Statistics ===\n');

  for (const [name, lead] of [['I', leadI], ['II', leadII], ['III', leadIII]] as const) {
    const min = Math.min(...lead);
    const max = Math.max(...lead);
    const mean = lead.reduce((a, b) => a + b, 0) / lead.length;
    const range = max - min;

    console.log(`${name}:`);
    console.log(`  Samples: ${lead.length}`);
    console.log(`  Range: ${min.toFixed(0)} to ${max.toFixed(0)} μV (${range.toFixed(0)} μV)`);
    console.log(`  Mean: ${mean.toFixed(0)} μV`);
    console.log();
  }

  // Check Einthoven's law sample by sample
  console.log('=== Einthoven\'s Law Check ===\n');
  console.log('Theory: II = I + III\n');

  const minLen = Math.min(leadI.length, leadII.length, leadIII.length);

  // Sample a few points
  const samplePoints = [0, 100, 200, 300, 400, 500];
  console.log('Sample point checks:');
  for (const i of samplePoints) {
    if (i < minLen) {
      const vI = leadI[i];
      const vII = leadII[i];
      const vIII = leadIII[i];
      const expected = vI + vIII;
      const error = vII - expected;

      console.log(`  t=${(i / result.signal.sampleRate * 1000).toFixed(0)}ms: I=${vI.toFixed(0)}, III=${vIII.toFixed(0)}, I+III=${expected.toFixed(0)}, II=${vII.toFixed(0)}, err=${error.toFixed(0)}μV`);
    }
  }

  // Calculate overall correlation
  const expectedII = leadI.slice(0, minLen).map((v, i) => v + leadIII[i]);

  let sumXY = 0, sumX2 = 0, sumY2 = 0;
  const meanActualII = leadII.slice(0, minLen).reduce((a, b) => a + b, 0) / minLen;
  const meanExpectedII = expectedII.reduce((a, b) => a + b, 0) / minLen;

  for (let i = 0; i < minLen; i++) {
    const dx = leadII[i] - meanActualII;
    const dy = expectedII[i] - meanExpectedII;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const correlation = sumXY / Math.sqrt(sumX2 * sumY2);
  console.log(`\nPearson correlation (II vs I+III): ${correlation.toFixed(3)}`);

  // Check if DC offset is the issue
  console.log('\n=== DC Offset Analysis ===\n');

  // Find median values (approximate baseline)
  const sortedI = [...leadI].sort((a, b) => a - b);
  const sortedII = [...leadII].sort((a, b) => a - b);
  const sortedIII = [...leadIII].sort((a, b) => a - b);

  const medianI = sortedI[Math.floor(sortedI.length / 2)];
  const medianII = sortedII[Math.floor(sortedII.length / 2)];
  const medianIII = sortedIII[Math.floor(sortedIII.length / 2)];

  console.log(`Median values (approximate baseline):`);
  console.log(`  I: ${medianI.toFixed(0)} μV`);
  console.log(`  II: ${medianII.toFixed(0)} μV`);
  console.log(`  III: ${medianIII.toFixed(0)} μV`);
  console.log(`  I + III: ${(medianI + medianIII).toFixed(0)} μV`);
  console.log(`  Difference from II: ${(medianII - medianI - medianIII).toFixed(0)} μV`);

  // Try correlation after removing DC offset
  const dcI = leadI.map(v => v - medianI);
  const dcII = leadII.map(v => v - medianII);
  const dcIII = leadIII.map(v => v - medianIII);

  const expectedDCII = dcI.slice(0, minLen).map((v, i) => v + dcIII[i]);

  let sumXY2 = 0, sumX22 = 0, sumY22 = 0;
  const meanDCActualII = dcII.slice(0, minLen).reduce((a, b) => a + b, 0) / minLen;
  const meanDCExpectedII = expectedDCII.reduce((a, b) => a + b, 0) / minLen;

  for (let i = 0; i < minLen; i++) {
    const dx = dcII[i] - meanDCActualII;
    const dy = expectedDCII[i] - meanDCExpectedII;
    sumXY2 += dx * dy;
    sumX22 += dx * dx;
    sumY22 += dy * dy;
  }

  const dcCorrelation = sumXY2 / Math.sqrt(sumX22 * sumY22);
  console.log(`\nCorrelation after DC removal: ${dcCorrelation.toFixed(3)}`);
}

debug().catch(console.error);
