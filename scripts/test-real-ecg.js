/**
 * Test the PNG digitizer on a real ECG image
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage, createImageData } from 'canvas';

// Import the digitizer modules from source (TypeScript)
import {
  ECGDigitizer,
  detectEdgeCases,
  correctForEdgeCases,
  detectUniversalLayout,
  validateCalibrationWithQRS,
  validateSignal,
} from '../src/signal/loader/png-digitizer/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testRealECG(imagePath) {
  console.log('\n' + '='.repeat(70));
  console.log(`Testing: ${path.basename(imagePath)}`);
  console.log('='.repeat(70));

  // Load image
  const img = await loadImage(imagePath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);

  // Get base64 for AI analysis
  const base64 = canvas.toBuffer('image/png').toString('base64');

  console.log(`\nImage size: ${img.width} x ${img.height} pixels`);

  // Step 1: Edge case detection
  console.log('\n--- STEP 1: Edge Case Detection ---');
  const edgeCases = detectEdgeCases(imageData);
  console.log('Detected edge cases:', edgeCases.cases.length > 0 ? edgeCases.cases.join(', ') : 'None');
  console.log('Is inverted:', edgeCases.isInverted);
  console.log('Is grayscale:', edgeCases.isGrayscale);
  console.log('Grid color family:', edgeCases.gridColorFamily);
  console.log('Background brightness:', edgeCases.backgroundBrightness.toFixed(0));
  console.log('Noise level:', (edgeCases.noiseLevel * 100).toFixed(1) + '%');
  console.log('Has calibration pulse:', edgeCases.hasCalibrationPulse);

  // Step 2: Correct for edge cases if needed
  let correctedImage = imageData;
  if (edgeCases.cases.length > 0) {
    console.log('\n--- STEP 2: Edge Case Correction ---');
    const corrected = correctForEdgeCases(imageData, edgeCases);
    correctedImage = corrected.imageData;
    console.log('Applied corrections');
    corrected.suggestions.forEach(s => console.log('  -', s));
  }

  // Step 3: Universal layout detection
  console.log('\n--- STEP 3: Universal Layout Detection ---');
  const layoutResult = detectUniversalLayout(correctedImage);
  console.log('Layout format:', layoutResult.layout.format);
  console.log('Rows:', layoutResult.layout.rows);
  console.log('Columns:', layoutResult.layout.columns);
  console.log('Has rhythm strips:', layoutResult.layout.hasRhythmStrips);
  console.log('Panels detected:', layoutResult.panels.length);
  console.log('Layout confidence:', (layoutResult.layout.confidence * 100).toFixed(1) + '%');

  // Show detected panels
  if (layoutResult.panels.length > 0) {
    console.log('\nDetected panels:');
    layoutResult.panels.slice(0, 6).forEach(p => {
      console.log(`  ${p.id}: Lead=${p.lead || 'unknown'}, Row=${p.row}, Col=${p.col}, Bounds=${p.bounds.width}x${p.bounds.height}`);
    });
    if (layoutResult.panels.length > 6) {
      console.log(`  ... and ${layoutResult.panels.length - 6} more panels`);
    }
  }

  // Step 4: Full digitization with AI (if API key available)
  console.log('\n--- STEP 4: Full Digitization ---');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('ANTHROPIC_API_KEY not set - using local CV only');
  } else {
    console.log('Using Claude AI for analysis');
  }

  const digitizer = new ECGDigitizer({
    aiProvider: apiKey ? 'anthropic' : 'none',
    apiKey: apiKey,
    targetSampleRate: 500,
    onProgress: (p) => {
      process.stdout.write(`\r  ${p.stage}: ${p.progress}% - ${p.message}          `);
    }
  });

  try {
    // Pass base64 string to avoid Node.js canvas issues
    const result = await digitizer.digitize(`data:image/png;base64,${base64}`);
    console.log('\n');

    console.log('Success:', result.success);
    console.log('Confidence:', (result.confidence * 100).toFixed(1) + '%');
    console.log('Method:', result.method);

    if (result.signal) {
      console.log('\nSignal extracted:');
      console.log('  Sample rate:', result.signal.sampleRate, 'Hz');
      console.log('  Duration:', result.signal.duration.toFixed(2), 'seconds');
      console.log('  Leads:', Object.keys(result.signal.leads).join(', '));

      // Show lead sample counts
      const leadInfo = Object.entries(result.signal.leads)
        .map(([lead, samples]) => `${lead}:${samples.length}`)
        .join(', ');
      console.log('  Samples per lead:', leadInfo);

      // Step 5: Signal validation
      console.log('\n--- STEP 5: Signal Validation ---');
      const validation = validateSignal(result.signal);
      console.log('Overall score:', (validation.overallScore * 100).toFixed(1) + '%');

      if (validation.crossLead) {
        console.log('Einthoven valid:', validation.crossLead.einthovenValid);
        console.log('Einthoven correlation:', (validation.crossLead.einthovenCorrelation * 100).toFixed(1) + '%');
      }

      if (validation.issues && validation.issues.length > 0) {
        console.log('Issues:');
        validation.issues.slice(0, 5).forEach(i => console.log(`  - [${i.severity}] ${i.message}`));
      }

      // Step 6: QRS-based calibration validation
      console.log('\n--- STEP 6: QRS Calibration Validation ---');
      const qrsValidation = validateCalibrationWithQRS(
        result.signal,
        result.calibration,
        result.gridInfo,
        result.signal.sampleRate
      );
      console.log('Calibration valid:', qrsValidation.isValid);
      console.log('Heart rate:', qrsValidation.heartRateBpm.toFixed(0), 'bpm');
      console.log('QRS width:', qrsValidation.qrsWidthMs.toFixed(0), 'ms');
      console.log('QRS count detected:', qrsValidation.debugInfo.detectedQRSCount);

      if (qrsValidation.issues.length > 0) {
        console.log('QRS issues:');
        qrsValidation.issues.forEach(i => console.log(`  -`, i));
      }
    }

    // Show any issues from digitization
    if (result.issues.length > 0) {
      console.log('\nDigitization issues:');
      result.issues.slice(0, 5).forEach(i => console.log(`  - [${i.severity}] ${i.message}`));
    }

    // Show processing stages
    console.log('\nProcessing stages:');
    result.stages.forEach(s => {
      console.log(`  ${s.name}: ${s.status} (${(s.confidence * 100).toFixed(0)}%) - ${s.durationMs}ms`);
    });

    console.log('\nTotal processing time:', result.processingTimeMs, 'ms');

  } catch (error) {
    console.error('\nDigitization failed:', error.message);
    console.error(error.stack);
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

// Main
async function main() {
  const sampleDir = path.join(__dirname, '../reference/muse_samples');
  const images = fs.readdirSync(sampleDir)
    .filter(f => f.endsWith('.png'))
    .slice(0, 1); // Test first image only for speed

  if (images.length === 0) {
    console.log('No PNG images found in reference/muse_samples/');
    return;
  }

  console.log(`Found ${images.length} ECG image(s) to test\n`);

  for (const image of images) {
    await testRealECG(path.join(sampleDir, image));
  }
}

main().catch(console.error);
