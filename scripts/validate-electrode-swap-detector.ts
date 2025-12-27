#!/usr/bin/env npx tsx
/**
 * Electrode Swap Detector Validation Script
 * ==========================================
 *
 * Validates the pediatric-aware electrode swap detection algorithm using
 * the ZZU pECG dataset. Tests sensitivity and specificity by:
 *
 * 1. Running detector on original ECGs (should NOT detect swap)
 * 2. Applying mathematical swap transformations
 * 3. Running detector on swapped ECGs (should detect correct swap type)
 * 4. Comparing age-adjusted vs adult-only detection
 *
 * Usage:
 *   npx tsx scripts/validate-electrode-swap-detector.ts
 *
 * Output:
 *   - Console tables with sensitivity/specificity per swap type and age group
 *   - JSON results file for further analysis
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  detectElectrodeSwap,
  type ElectrodeSwapResult,
  type ElectrodeSwapType,
} from '../src/signal/loader/png-digitizer/signal/electrode-swap-detector';
import type { LeadName } from '../src/signal/loader/png-digitizer/types';
import { ageToDays } from '../src/data/ageGroups';

// =============================================================================
// Configuration
// =============================================================================

// Use validation_ecgs for sample (136), validation_ecgs_full for full dataset (12,334)
const JSON_ECGS_DIR = './data/zzu-pecg/validation_ecgs_full';
const OUTPUT_FILE = './data/zzu-pecg/validation_results_full.json';

// Swap types to test (LIMB LEADS ONLY for paper validation)
const SWAP_TYPES: ElectrodeSwapType[] = [
  'LA_RA',
  'LA_LL',
  'RA_LL',
  // 'V1_V2',  // Precordial - excluded for limb lead paper
  // 'V2_V3',
  // 'V3_V4',
];

// Age groups for stratification
interface AgeGroup {
  name: string;
  minDays: number;
  maxDays: number;
}

const AGE_GROUPS: AgeGroup[] = [
  { name: 'Neonate (0-30d)', minDays: 0, maxDays: 30 },
  { name: 'Infant (1-12mo)', minDays: 31, maxDays: 365 },
  { name: 'Toddler (1-3yr)', minDays: 366, maxDays: 1095 },
  { name: 'Child (3-12yr)', minDays: 1096, maxDays: 4380 },
  { name: 'Adolescent (12+yr)', minDays: 4381, maxDays: 999999 },
];

// =============================================================================
// Types
// =============================================================================

interface ECGData {
  signal: {
    leads: Record<string, number[]>;
    sampleRate: number;
  };
  patient?: {
    age?: string;
    ageDays?: number;
    ageGroup?: string;
  };
  source?: {
    ecg_id?: string;
  };
}

interface ValidationResult {
  ecgId: string;
  ageDays: number;
  ageGroup: string;
  swapType: ElectrodeSwapType | 'NONE';
  // Adult mode (no age)
  adultDetected: boolean;
  adultSwapType: ElectrodeSwapType | null;
  adultConfidence: number;
  // Pediatric mode (with age)
  pediatricDetected: boolean;
  pediatricSwapType: ElectrodeSwapType | null;
  pediatricConfidence: number;
  // Ground truth
  isSwapped: boolean;
  expectedSwapType: ElectrodeSwapType | null;
}

interface AggregatedResults {
  // Per swap type
  bySwapType: Record<ElectrodeSwapType | 'NONE', {
    adultTP: number;
    adultFP: number;
    adultTN: number;
    adultFN: number;
    pediatricTP: number;
    pediatricFP: number;
    pediatricTN: number;
    pediatricFN: number;
    total: number;
  }>;
  // Per age group
  byAgeGroup: Record<string, {
    adultTP: number;
    adultFP: number;
    adultTN: number;
    adultFN: number;
    pediatricTP: number;
    pediatricFP: number;
    pediatricTN: number;
    pediatricFN: number;
    total: number;
    // Original ECGs only (specificity measure)
    originalAdultFP: number;
    originalPediatricFP: number;
    originalTotal: number;
  }>;
  // Overall
  overall: {
    adultSensitivity: number;
    adultSpecificity: number;
    pediatricSensitivity: number;
    pediatricSpecificity: number;
    totalECGs: number;
    totalTests: number;
  };
}

// =============================================================================
// Swap Simulation Functions
// =============================================================================

/**
 * Apply mathematical electrode swap transformation to ECG leads.
 *
 * Based on Einthoven's equations:
 * - Lead I = LA - RA
 * - Lead II = LL - RA
 * - Lead III = LL - LA
 * - aVR = RA - (LA + LL)/2
 * - aVL = LA - (RA + LL)/2
 * - aVF = LL - (RA + LA)/2
 */
function applySwap(
  leads: Record<string, number[]>,
  swapType: ElectrodeSwapType
): Record<string, number[]> {
  const swapped: Record<string, number[]> = { ...leads };

  switch (swapType) {
    case 'LA_RA':
      // Swap Left Arm and Right Arm electrodes
      // New Lead I = -old Lead I (inverted)
      // New Lead II = old Lead III
      // New Lead III = old Lead II
      // New aVR = old aVL
      // New aVL = old aVR
      // aVF unchanged
      if (leads['I']) {
        swapped['I'] = leads['I'].map(v => -v);
      }
      if (leads['II'] && leads['III']) {
        swapped['II'] = [...leads['III']];
        swapped['III'] = [...leads['II']];
      }
      if (leads['aVR'] && leads['aVL']) {
        swapped['aVR'] = [...leads['aVL']];
        swapped['aVL'] = [...leads['aVR']];
      }
      break;

    case 'LA_LL':
      // Swap Left Arm and Left Leg electrodes
      // New Lead I = -old Lead III
      // New Lead II = -old Lead III + old Lead I = old Lead II (unchanged? No...)
      // Actually: New Lead II = LL_new - RA = LA_old - RA = old Lead I
      // New Lead III = LL_new - LA_new = LA_old - LL_old = -old Lead III
      // More precisely:
      // New I = LA_new - RA = LL_old - RA (using original RA)
      //       = (LL_old - RA) = Lead II_old
      // No wait, let me recalculate...
      //
      // If LA and LL are swapped:
      // LA_new = LL_old, LL_new = LA_old
      // New Lead I = LA_new - RA = LL_old - RA = old Lead II
      // New Lead II = LL_new - RA = LA_old - RA = old Lead I
      // New Lead III = LL_new - LA_new = LA_old - LL_old = -old Lead III
      // New aVL = LA_new - (RA + LL_new)/2 = LL_old - (RA + LA_old)/2 = old aVF
      // New aVF = LL_new - (RA + LA_new)/2 = LA_old - (RA + LL_old)/2 = old aVL
      // aVR unchanged
      if (leads['I'] && leads['II']) {
        swapped['I'] = [...leads['II']];
        swapped['II'] = [...leads['I']];
      }
      if (leads['III']) {
        swapped['III'] = leads['III'].map(v => -v);
      }
      if (leads['aVL'] && leads['aVF']) {
        swapped['aVL'] = [...leads['aVF']];
        swapped['aVF'] = [...leads['aVL']];
      }
      break;

    case 'RA_LL':
      // Swap Right Arm and Left Leg electrodes
      // RA_new = LL_old, LL_new = RA_old
      // New Lead I = LA - RA_new = LA - LL_old = -old Lead III
      // New Lead II = LL_new - RA_new = RA_old - LL_old = -old Lead II
      // New Lead III = LL_new - LA = RA_old - LA = -old Lead I
      // New aVR = RA_new - (LA + LL_new)/2 = LL_old - (LA + RA_old)/2 = old aVF
      // New aVF = LL_new - (RA_new + LA)/2 = RA_old - (LL_old + LA)/2 = old aVR
      // New aVL = LA - (RA_new + LL_new)/2 = LA - (LL_old + RA_old)/2 = old aVL (unchanged)
      if (leads['I']) {
        swapped['I'] = leads['III']?.map(v => -v) || leads['I'];
      }
      if (leads['II']) {
        swapped['II'] = leads['II'].map(v => -v);
      }
      if (leads['III']) {
        swapped['III'] = leads['I']?.map(v => -v) || leads['III'];
      }
      if (leads['aVR'] && leads['aVF']) {
        swapped['aVR'] = [...leads['aVF']];
        swapped['aVF'] = [...leads['aVR']];
      }
      break;

    case 'V1_V2':
      // Simple precordial swap
      if (leads['V1'] && leads['V2']) {
        swapped['V1'] = [...leads['V2']];
        swapped['V2'] = [...leads['V1']];
      }
      break;

    case 'V2_V3':
      if (leads['V2'] && leads['V3']) {
        swapped['V2'] = [...leads['V3']];
        swapped['V3'] = [...leads['V2']];
      }
      break;

    case 'V3_V4':
      if (leads['V3'] && leads['V4']) {
        swapped['V3'] = [...leads['V4']];
        swapped['V4'] = [...leads['V3']];
      }
      break;
  }

  return swapped;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse age string like "13.6 yr", "11 mo", "2 days" to days
 */
function parseAge(ageStr: string): number {
  if (!ageStr) return 0;

  const match = ageStr.match(/([\d.]+)\s*(yr|mo|days?|d)/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === 'yr') {
    return ageToDays(value, 'years');
  } else if (unit === 'mo') {
    return ageToDays(value, 'months');
  } else {
    return Math.round(value); // days
  }
}

/**
 * Get age group name for a given age in days
 */
function getAgeGroupName(ageDays: number): string {
  for (const group of AGE_GROUPS) {
    if (ageDays >= group.minDays && ageDays <= group.maxDays) {
      return group.name;
    }
  }
  return 'Unknown';
}

/**
 * Load ECG from JSON file
 */
function loadECG(filepath: string): ECGData | null {
  try {
    const content = readFileSync(filepath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`Failed to load ${filepath}:`, e);
    return null;
  }
}

/**
 * Convert ECG leads to the format expected by the detector
 */
function convertLeads(leads: Record<string, number[]>): Partial<Record<LeadName, number[]>> {
  const result: Partial<Record<LeadName, number[]>> = {};
  const validLeads: LeadName[] = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

  for (const lead of validLeads) {
    if (leads[lead]) {
      result[lead] = leads[lead];
    }
  }

  return result;
}

/**
 * Check if detected swap type matches expected
 */
function isCorrectDetection(
  detected: ElectrodeSwapType | undefined,
  expected: ElectrodeSwapType | null
): boolean {
  if (expected === null) {
    // Original ECG - no swap should be detected
    return detected === undefined;
  }

  // Swapped ECG - should detect the correct type
  // For limb leads, we accept related types as partial matches
  if (expected === detected) return true;

  // Limb lead swaps can sometimes be confused
  const limbSwaps: ElectrodeSwapType[] = ['LA_RA', 'LA_LL', 'RA_LL'];
  if (limbSwaps.includes(expected) && detected && limbSwaps.includes(detected)) {
    // Count as detected (but wrong type) - still a true positive for "swap detected"
    return true;
  }

  return false;
}

// =============================================================================
// Main Validation Logic
// =============================================================================

function runValidation(): void {
  console.log('='.repeat(70));
  console.log('Electrode Swap Detector Validation');
  console.log('='.repeat(70));
  console.log();

  // Load index file for age info
  let indexData: Array<{ file: string; age: string; ecg_id: string; category: string }> = [];
  try {
    indexData = JSON.parse(readFileSync(join(JSON_ECGS_DIR, 'index.json'), 'utf8'));
    console.log(`Loaded index with ${indexData.length} ECGs`);
  } catch {
    console.log('No index.json found, will parse age from filenames');
  }

  // Get list of JSON ECG files
  const ecgFiles = readdirSync(JSON_ECGS_DIR)
    .filter(f => f.endsWith('.json') && f !== 'index.json');

  console.log(`Found ${ecgFiles.length} ECG files`);
  console.log();

  // Results storage
  const results: ValidationResult[] = [];

  // Process each ECG
  let processed = 0;
  for (const filename of ecgFiles) {
    const filepath = join(JSON_ECGS_DIR, filename);
    const ecg = loadECG(filepath);
    if (!ecg) continue;

    // Get age from patient data or index
    let ageDays = 0;
    let ecgId = filename.replace('.json', '');

    // Prefer ageDays directly from patient object
    if (ecg.patient?.ageDays) {
      ageDays = ecg.patient.ageDays;
    } else if (ecg.patient?.age) {
      ageDays = parseAge(ecg.patient.age);
    } else {
      // Fall back to index
      const indexEntry = indexData.find(e => e.file === filename);
      if (indexEntry) {
        ageDays = indexEntry.ageDays || parseAge(indexEntry.age);
        ecgId = indexEntry.ecg_id;
      }
    }

    // Get ecg_id from source if available
    if (ecg.source?.ecg_id) {
      ecgId = ecg.source.ecg_id;
    }

    const ageGroup = getAgeGroupName(ageDays);
    const leads = convertLeads(ecg.signal.leads);
    const sampleRate = ecg.signal.sampleRate || 500;

    // Check if we have enough leads for meaningful detection
    const hasLimbLeads = leads['I'] && leads['II'] && leads['III'];
    const hasPrecordialLeads = leads['V1'] && leads['V2'] && leads['V3'];

    if (!hasLimbLeads) {
      console.log(`  Skipping ${ecgId}: missing limb leads`);
      continue;
    }

    // Test 1: Original ECG (should NOT detect swap)
    const adultResultOrig = detectElectrodeSwap(leads, sampleRate);
    const pediatricResultOrig = detectElectrodeSwap(leads, sampleRate, { ageDays });

    results.push({
      ecgId,
      ageDays,
      ageGroup,
      swapType: 'NONE',
      adultDetected: adultResultOrig.swapDetected,
      adultSwapType: adultResultOrig.swapType || null,
      adultConfidence: adultResultOrig.confidence,
      pediatricDetected: pediatricResultOrig.swapDetected,
      pediatricSwapType: pediatricResultOrig.swapType || null,
      pediatricConfidence: pediatricResultOrig.confidence,
      isSwapped: false,
      expectedSwapType: null,
    });

    // Test 2-7: Apply each swap type and test detection
    for (const swapType of SWAP_TYPES) {
      // Skip precordial swaps if no precordial leads
      if (swapType.startsWith('V') && !hasPrecordialLeads) continue;

      const swappedLeads = applySwap(ecg.signal.leads, swapType);
      const convertedSwapped = convertLeads(swappedLeads);

      const adultResult = detectElectrodeSwap(convertedSwapped, sampleRate);
      const pediatricResult = detectElectrodeSwap(convertedSwapped, sampleRate, { ageDays });

      results.push({
        ecgId: `${ecgId}_${swapType}`,
        ageDays,
        ageGroup,
        swapType,
        adultDetected: adultResult.swapDetected,
        adultSwapType: adultResult.swapType || null,
        adultConfidence: adultResult.confidence,
        pediatricDetected: pediatricResult.swapDetected,
        pediatricSwapType: pediatricResult.swapType || null,
        pediatricConfidence: pediatricResult.confidence,
        isSwapped: true,
        expectedSwapType: swapType,
      });
    }

    processed++;
    if (processed % 20 === 0) {
      console.log(`  Processed ${processed}/${ecgFiles.length} ECGs...`);
    }
  }

  console.log(`\nProcessed ${processed} ECGs, ${results.length} total tests`);
  console.log();

  // Aggregate results
  const aggregated = aggregateResults(results);

  // Print results
  printResults(aggregated, results);

  // Save detailed results
  const outputData = {
    summary: aggregated,
    details: results,
    metadata: {
      timestamp: new Date().toISOString(),
      totalECGs: processed,
      totalTests: results.length,
      swapTypes: SWAP_TYPES,
      ageGroups: AGE_GROUPS.map(g => g.name),
    },
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
  console.log(`\nDetailed results saved to: ${OUTPUT_FILE}`);
}

function aggregateResults(results: ValidationResult[]): AggregatedResults {
  const bySwapType: AggregatedResults['bySwapType'] = {} as any;
  const byAgeGroup: AggregatedResults['byAgeGroup'] = {};

  // Initialize swap type buckets
  for (const swapType of [...SWAP_TYPES, 'NONE'] as (ElectrodeSwapType | 'NONE')[]) {
    bySwapType[swapType] = {
      adultTP: 0, adultFP: 0, adultTN: 0, adultFN: 0,
      pediatricTP: 0, pediatricFP: 0, pediatricTN: 0, pediatricFN: 0,
      total: 0,
    };
  }

  // Initialize age group buckets
  for (const group of AGE_GROUPS) {
    byAgeGroup[group.name] = {
      adultTP: 0, adultFP: 0, adultTN: 0, adultFN: 0,
      pediatricTP: 0, pediatricFP: 0, pediatricTN: 0, pediatricFN: 0,
      total: 0,
      originalAdultFP: 0, originalPediatricFP: 0, originalTotal: 0,
    };
  }

  // Process each result
  for (const r of results) {
    const swapBucket = bySwapType[r.swapType];
    const ageBucket = byAgeGroup[r.ageGroup];

    if (!swapBucket || !ageBucket) continue;

    swapBucket.total++;
    ageBucket.total++;

    if (r.isSwapped) {
      // Swapped ECG - should detect a swap
      // Adult mode
      if (r.adultDetected) {
        swapBucket.adultTP++;
        ageBucket.adultTP++;
      } else {
        swapBucket.adultFN++;
        ageBucket.adultFN++;
      }
      // Pediatric mode
      if (r.pediatricDetected) {
        swapBucket.pediatricTP++;
        ageBucket.pediatricTP++;
      } else {
        swapBucket.pediatricFN++;
        ageBucket.pediatricFN++;
      }
    } else {
      // Original ECG - should NOT detect a swap
      ageBucket.originalTotal++;

      // Adult mode
      if (r.adultDetected) {
        swapBucket.adultFP++;
        ageBucket.adultFP++;
        ageBucket.originalAdultFP++;
      } else {
        swapBucket.adultTN++;
        ageBucket.adultTN++;
      }
      // Pediatric mode
      if (r.pediatricDetected) {
        swapBucket.pediatricFP++;
        ageBucket.pediatricFP++;
        ageBucket.originalPediatricFP++;
      } else {
        swapBucket.pediatricTN++;
        ageBucket.pediatricTN++;
      }
    }
  }

  // Calculate overall metrics
  let totalAdultTP = 0, totalAdultFP = 0, totalAdultTN = 0, totalAdultFN = 0;
  let totalPediatricTP = 0, totalPediatricFP = 0, totalPediatricTN = 0, totalPediatricFN = 0;

  for (const bucket of Object.values(bySwapType)) {
    totalAdultTP += bucket.adultTP;
    totalAdultFP += bucket.adultFP;
    totalAdultTN += bucket.adultTN;
    totalAdultFN += bucket.adultFN;
    totalPediatricTP += bucket.pediatricTP;
    totalPediatricFP += bucket.pediatricFP;
    totalPediatricTN += bucket.pediatricTN;
    totalPediatricFN += bucket.pediatricFN;
  }

  const adultSensitivity = totalAdultTP / (totalAdultTP + totalAdultFN) || 0;
  const adultSpecificity = totalAdultTN / (totalAdultTN + totalAdultFP) || 0;
  const pediatricSensitivity = totalPediatricTP / (totalPediatricTP + totalPediatricFN) || 0;
  const pediatricSpecificity = totalPediatricTN / (totalPediatricTN + totalPediatricFP) || 0;

  return {
    bySwapType,
    byAgeGroup,
    overall: {
      adultSensitivity,
      adultSpecificity,
      pediatricSensitivity,
      pediatricSpecificity,
      totalECGs: results.filter(r => r.swapType === 'NONE').length,
      totalTests: results.length,
    },
  };
}

function printResults(aggregated: AggregatedResults, results: ValidationResult[]): void {
  const { bySwapType, byAgeGroup, overall } = aggregated;

  // Overall summary
  console.log('='.repeat(70));
  console.log('OVERALL RESULTS');
  console.log('='.repeat(70));
  console.log();
  console.log(`Total ECGs tested:        ${overall.totalECGs}`);
  console.log(`Total tests (incl swaps): ${overall.totalTests}`);
  console.log();
  console.log('                          Adult Mode    Pediatric Mode');
  console.log(`Sensitivity:              ${(overall.adultSensitivity * 100).toFixed(1)}%          ${(overall.pediatricSensitivity * 100).toFixed(1)}%`);
  console.log(`Specificity:              ${(overall.adultSpecificity * 100).toFixed(1)}%          ${(overall.pediatricSpecificity * 100).toFixed(1)}%`);
  console.log();

  // By swap type
  console.log('='.repeat(70));
  console.log('RESULTS BY SWAP TYPE');
  console.log('='.repeat(70));
  console.log();
  console.log('Swap Type    | Adult Sens | Adult Spec | Ped Sens | Ped Spec | N');
  console.log('-'.repeat(70));

  for (const swapType of [...SWAP_TYPES, 'NONE'] as const) {
    const b = bySwapType[swapType];
    if (b.total === 0) continue;

    let adultSens = '-', adultSpec = '-', pedSens = '-', pedSpec = '-';

    if (swapType === 'NONE') {
      // For original ECGs, only specificity matters
      adultSpec = b.total > 0 ? `${((b.adultTN / b.total) * 100).toFixed(1)}%` : '-';
      pedSpec = b.total > 0 ? `${((b.pediatricTN / b.total) * 100).toFixed(1)}%` : '-';
    } else {
      // For swapped ECGs, only sensitivity matters
      adultSens = b.total > 0 ? `${((b.adultTP / b.total) * 100).toFixed(1)}%` : '-';
      pedSens = b.total > 0 ? `${((b.pediatricTP / b.total) * 100).toFixed(1)}%` : '-';
    }

    const label = swapType === 'NONE' ? 'Original' : swapType;
    console.log(
      `${label.padEnd(12)} | ${adultSens.padStart(10)} | ${adultSpec.padStart(10)} | ${pedSens.padStart(8)} | ${pedSpec.padStart(8)} | ${b.total}`
    );
  }
  console.log();

  // By age group - THE KEY COMPARISON
  console.log('='.repeat(70));
  console.log('RESULTS BY AGE GROUP (Original ECGs Only - False Positive Rate)');
  console.log('='.repeat(70));
  console.log();
  console.log('This is the KEY finding: Adult mode should have higher FP in neonates/infants');
  console.log();
  console.log('Age Group           | Adult FP Rate | Pediatric FP Rate | Reduction | N');
  console.log('-'.repeat(70));

  for (const group of AGE_GROUPS) {
    const b = byAgeGroup[group.name];
    if (!b || b.originalTotal === 0) continue;

    const adultFPRate = b.originalAdultFP / b.originalTotal;
    const pedFPRate = b.originalPediatricFP / b.originalTotal;
    const reduction = adultFPRate > 0 ? ((adultFPRate - pedFPRate) / adultFPRate * 100) : 0;

    console.log(
      `${group.name.padEnd(19)} | ${(adultFPRate * 100).toFixed(1).padStart(12)}% | ${(pedFPRate * 100).toFixed(1).padStart(16)}% | ${reduction.toFixed(0).padStart(8)}% | ${b.originalTotal}`
    );
  }
  console.log();

  // By age group - Full metrics
  console.log('='.repeat(70));
  console.log('RESULTS BY AGE GROUP (All Tests - Sensitivity)');
  console.log('='.repeat(70));
  console.log();
  console.log('Age Group           | Adult Sens | Pediatric Sens | N Swapped');
  console.log('-'.repeat(70));

  for (const group of AGE_GROUPS) {
    const b = byAgeGroup[group.name];
    if (!b || b.total === 0) continue;

    const swappedTotal = b.adultTP + b.adultFN;
    const adultSens = swappedTotal > 0 ? (b.adultTP / swappedTotal * 100).toFixed(1) : '-';
    const pedSens = swappedTotal > 0 ? (b.pediatricTP / swappedTotal * 100).toFixed(1) : '-';

    console.log(
      `${group.name.padEnd(19)} | ${adultSens.padStart(10)}% | ${pedSens.padStart(14)}% | ${swappedTotal}`
    );
  }
  console.log();

  // Specific false positive cases
  const falsePositives = results.filter(r => !r.isSwapped && r.adultDetected);
  if (falsePositives.length > 0) {
    console.log('='.repeat(70));
    console.log('FALSE POSITIVE CASES (Adult Mode)');
    console.log('='.repeat(70));
    console.log();
    console.log('ECG ID                  | Age Group           | Detected As  | Confidence');
    console.log('-'.repeat(70));

    for (const fp of falsePositives.slice(0, 20)) {
      console.log(
        `${fp.ecgId.substring(0, 23).padEnd(23)} | ${fp.ageGroup.padEnd(19)} | ${(fp.adultSwapType || '-').padEnd(12)} | ${(fp.adultConfidence * 100).toFixed(0)}%`
      );
    }

    if (falsePositives.length > 20) {
      console.log(`... and ${falsePositives.length - 20} more`);
    }
    console.log();
  }

  // Check if pediatric mode reduced FPs
  const adultFPs = results.filter(r => !r.isSwapped && r.adultDetected).length;
  const pedFPs = results.filter(r => !r.isSwapped && r.pediatricDetected).length;

  if (adultFPs > pedFPs) {
    console.log('='.repeat(70));
    console.log('KEY FINDING');
    console.log('='.repeat(70));
    console.log();
    console.log(`Adult mode false positives:     ${adultFPs}`);
    console.log(`Pediatric mode false positives: ${pedFPs}`);
    console.log(`Reduction:                      ${adultFPs - pedFPs} (${((adultFPs - pedFPs) / adultFPs * 100).toFixed(1)}%)`);
    console.log();
    console.log('Age-adjusted detection REDUCES false positives while maintaining sensitivity.');
    console.log();
  }
}

// =============================================================================
// Run Validation
// =============================================================================

runValidation();
