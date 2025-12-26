/**
 * Full round-trip digitization test
 * 1. Load original ECG signal
 * 2. Render to PNG
 * 3. Digitize back to signal
 * 4. Compare original vs digitized
 */

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { createCanvas } from 'canvas';
import { PNG } from 'pngjs';
import { ECGDigitizer } from '../src/signal/loader/png-digitizer/digitizer';
import { ECGRenderer } from '../src/renderer/ecg-renderer';
import type { ECGSignal, LeadName } from '../src/types';

// Use a sample ECG or load from JSON
async function loadSampleECG(): Promise<ECGSignal> {
  // Try to load from json_ecgs directory
  try {
    const files = ['ASD_P00073_E02.json', 'normal_sinus.json'];
    for (const file of files) {
      try {
        const data = JSON.parse(readFileSync(`json_ecgs/${file}`, 'utf-8'));
        const leads = data.signal?.leads || data.signal || data.leads;
        if (leads && Object.keys(leads).length >= 12) {
          console.log(`Loaded ECG from json_ecgs/${file}`);
          return {
            sampleRate: data.sampleRate || 500,
            duration: (leads.I?.length || 2500) / (data.sampleRate || 500),
            leads,
          };
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Fall through to synthetic
  }

  // Generate synthetic ECG if no file available
  console.log('Generating synthetic ECG signal...');
  return generateSyntheticECG();
}

function generateSyntheticECG(): ECGSignal {
  const sampleRate = 500;
  const duration = 2.5; // 2.5 seconds
  const numSamples = Math.floor(sampleRate * duration);

  const leads: Record<string, number[]> = {};
  const leadNames: LeadName[] = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

  // Generate Lead II as base (normal sinus rhythm, ~75 bpm)
  const leadII: number[] = [];
  const beatInterval = sampleRate * 0.8; // 75 bpm = 800ms per beat

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const beatPhase = (i % beatInterval) / beatInterval;

    let value = 0;

    // P wave (0.08-0.12 of beat)
    if (beatPhase > 0.08 && beatPhase < 0.15) {
      const pPhase = (beatPhase - 0.08) / 0.07;
      value = 100 * Math.sin(pPhase * Math.PI);
    }
    // QRS complex (0.20-0.28 of beat)
    else if (beatPhase > 0.20 && beatPhase < 0.28) {
      const qrsPhase = (beatPhase - 0.20) / 0.08;
      if (qrsPhase < 0.2) {
        value = -50 * (qrsPhase / 0.2); // Q wave
      } else if (qrsPhase < 0.5) {
        value = -50 + 1200 * ((qrsPhase - 0.2) / 0.3); // R wave up
      } else if (qrsPhase < 0.7) {
        value = 1000 - 1200 * ((qrsPhase - 0.5) / 0.2); // R wave down
      } else {
        value = -200 + 200 * ((qrsPhase - 0.7) / 0.3); // S wave
      }
    }
    // T wave (0.40-0.55 of beat)
    else if (beatPhase > 0.40 && beatPhase < 0.55) {
      const tPhase = (beatPhase - 0.40) / 0.15;
      value = 200 * Math.sin(tPhase * Math.PI);
    }

    leadII.push(value);
  }

  leads['II'] = leadII;

  // Derive other leads from Lead II using approximate relationships
  leads['I'] = leadII.map(v => v * 0.6);
  leads['III'] = leadII.map((v, i) => leads['II'][i] - leads['I'][i]);
  leads['aVR'] = leadII.map((v, i) => -(leads['I'][i] + leads['II'][i]) / 2);
  leads['aVL'] = leadII.map((v, i) => leads['I'][i] - leads['II'][i] / 2);
  leads['aVF'] = leadII.map((v, i) => leads['II'][i] - leads['I'][i] / 2);

  // Precordial leads (simplified)
  leads['V1'] = leadII.map(v => v * -0.3);
  leads['V2'] = leadII.map(v => v * 0.1);
  leads['V3'] = leadII.map(v => v * 0.4);
  leads['V4'] = leadII.map(v => v * 0.7);
  leads['V5'] = leadII.map(v => v * 0.8);
  leads['V6'] = leadII.map(v => v * 0.7);

  return {
    sampleRate,
    duration,
    leads: leads as Record<LeadName, number[]>,
  };
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 10) return 0;

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

async function test() {
  console.log('=== Full Round-Trip Digitization Test ===\n');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('Warning: ANTHROPIC_API_KEY not set, will use local CV only\n');
  }

  // Step 1: Load or generate original ECG
  console.log('Step 1: Loading original ECG signal...');
  const originalECG = await loadSampleECG();
  console.log(`  Sample rate: ${originalECG.sampleRate} Hz`);
  console.log(`  Duration: ${originalECG.duration.toFixed(2)} s`);
  console.log(`  Leads: ${Object.keys(originalECG.leads).join(', ')}`);
  console.log(`  Samples per lead: ${originalECG.leads['I']?.length || 'N/A'}\n`);

  // Step 2: Render to PNG
  console.log('Step 2: Rendering to PNG...');
  const canvas = createCanvas(1200, 900);
  const renderer = new ECGRenderer(canvas as unknown as HTMLCanvasElement, {
    dpi: 96,
    paperSpeed: 25,
    gain: 10,
  });

  renderer.render(originalECG);

  // Save rendered PNG
  const pngBuffer = canvas.toBuffer('image/png');
  writeFileSync('test_ecgs/roundtrip_comparison.png', pngBuffer);
  console.log('  Saved to test_ecgs/roundtrip_comparison.png');
  console.log(`  Image size: ${canvas.width}x${canvas.height}\n`);

  // Step 3: Digitize the PNG
  console.log('Step 3: Digitizing PNG back to signal...');
  const png = PNG.sync.read(pngBuffer);
  const imageData: ImageData = {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height,
    colorSpace: 'srgb' as PredefinedColorSpace,
  };

  const digitizer = new ECGDigitizer({
    apiKey,
    targetSampleRate: 500,
  });

  const startTime = Date.now();
  const result = await digitizer.digitize(imageData);
  const elapsed = Date.now() - startTime;

  console.log(`  Digitization time: ${elapsed}ms`);
  console.log(`  Success: ${result.success}`);
  console.log(`  Method: ${result.method}`);
  console.log(`  Confidence: ${result.confidence.toFixed(2)}`);

  if (!result.success || !result.signal) {
    console.log('\n❌ Digitization failed!');
    console.log(`Issues: ${result.issues.map(i => i.message).join('; ')}`);
    return;
  }

  const digitizedECG = result.signal;
  console.log(`  Digitized leads: ${Object.keys(digitizedECG.leads).join(', ')}`);
  console.log(`  Samples per lead: ${digitizedECG.leads['I']?.length || 'N/A'}\n`);

  // Step 4: Compare original vs digitized
  console.log('Step 4: Comparing original vs digitized signals...\n');

  // Normalize lead names (handle AVR vs aVR)
  const normalizeLeadName = (name: string): string => {
    return name.replace('AVR', 'aVR').replace('AVL', 'aVL').replace('AVF', 'aVF');
  };

  const getOriginalLead = (name: LeadName): number[] | undefined => {
    // Try exact match first
    if (originalECG.leads[name]) return originalECG.leads[name];
    // Try uppercase version
    const upper = name.toUpperCase() as LeadName;
    if (originalECG.leads[upper]) return originalECG.leads[upper];
    return undefined;
  };

  const leadNames: LeadName[] = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
  const correlations: Record<string, number> = {};

  console.log('Lead-by-lead correlation (with cross-correlation alignment):');
  let totalCorr = 0;
  let leadCount = 0;

  for (const lead of leadNames) {
    const original = getOriginalLead(lead);
    const digitized = digitizedECG.leads[lead];

    if (!original || !digitized) {
      console.log(`  ${lead.padEnd(4)}: MISSING`);
      continue;
    }

    // Use first 2.5s of original (what's rendered)
    const targetLen = Math.min(1250, digitized.length);
    const origSlice = original.slice(0, targetLen);
    const digArray = Array.from(digitized);

    // Find best alignment using cross-correlation
    let bestCorr = -1;
    let bestOffset = 0;

    // Try different offsets (up to 10% shift)
    const maxOffset = Math.floor(targetLen * 0.1);
    for (let offset = -maxOffset; offset <= maxOffset; offset += 5) {
      const origShifted = offset >= 0
        ? origSlice.slice(offset)
        : origSlice.slice(0, origSlice.length + offset);
      const digShifted = offset >= 0
        ? digArray.slice(0, digArray.length - offset)
        : digArray.slice(-offset);

      const minLen = Math.min(origShifted.length, digShifted.length);
      if (minLen < 100) continue;

      const corr = pearsonCorrelation(
        origShifted.slice(0, minLen),
        resample(digShifted, minLen)
      );

      if (corr > bestCorr) {
        bestCorr = corr;
        bestOffset = offset;
      }
    }

    correlations[lead] = bestCorr;
    totalCorr += bestCorr;
    leadCount++;

    const status = bestCorr > 0.8 ? '✓✓' : bestCorr > 0.6 ? '✓' : bestCorr > 0.3 ? '~' : '✗';
    console.log(`  ${lead.padEnd(4)}: r=${bestCorr.toFixed(3)} ${status} (offset=${bestOffset})`);
  }

  const avgCorr = leadCount > 0 ? totalCorr / leadCount : 0;

  // Einthoven's Law check on digitized signal
  console.log('\nEinthoven\'s Law validation on digitized signal:');
  const digI = digitizedECG.leads['I'];
  const digII = digitizedECG.leads['II'];
  const digIII = digitizedECG.leads['III'];

  if (digI && digII && digIII) {
    const checkPoints = [100, 250, 400, 550, 700];
    let totalErr = 0;
    let checkCount = 0;

    for (const idx of checkPoints) {
      if (idx < digI.length && idx < digII.length && idx < digIII.length) {
        const expected = digI[idx] + digIII[idx];
        const actual = digII[idx];
        const err = Math.abs(actual - expected);
        totalErr += err;
        checkCount++;

        const status = err < 50 ? '✓' : err < 150 ? '~' : '✗';
        console.log(`  Sample ${idx}: I+III=${expected.toFixed(0)}, II=${actual.toFixed(0)}, err=${err.toFixed(0)}μV ${status}`);
      }
    }

    const avgErr = checkCount > 0 ? totalErr / checkCount : 0;
    console.log(`  Average error: ${avgErr.toFixed(1)}μV`);
  }

  // Summary
  console.log('\n=== Summary ===\n');
  console.log(`Average correlation: ${avgCorr.toFixed(3)}`);

  const excellentLeads = Object.values(correlations).filter(c => c > 0.8).length;
  const goodLeads = Object.values(correlations).filter(c => c > 0.6).length;
  const poorLeads = Object.values(correlations).filter(c => c < 0.3).length;

  console.log(`Excellent (r>0.8): ${excellentLeads}/${leadCount} leads`);
  console.log(`Good (r>0.6): ${goodLeads}/${leadCount} leads`);
  console.log(`Poor (r<0.3): ${poorLeads}/${leadCount} leads`);

  // Overall assessment
  let grade: string;
  if (avgCorr > 0.8) {
    grade = 'EXCELLENT';
  } else if (avgCorr > 0.6) {
    grade = 'GOOD';
  } else if (avgCorr > 0.4) {
    grade = 'FAIR';
  } else {
    grade = 'NEEDS IMPROVEMENT';
  }

  console.log(`\nOverall Grade: ${grade}`);

  // Show any issues
  if (result.issues.length > 0) {
    console.log('\nIssues detected:');
    for (const issue of result.issues) {
      console.log(`  [${issue.severity}] ${issue.message}`);
    }
  }
}

test().catch(console.error);
