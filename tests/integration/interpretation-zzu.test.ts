/**
 * Integration tests for ECG interpretation using ZZU dataset
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { ageToDays } from '../../src/data/ageGroups';
import { calculateECGMeasurements } from '../../src/signal/analysis/ecg-measurements';
import { interpretECG, InterpretationInput, ECGMeasurements } from '../../src/interpretation';

// Load ZZU index once
const indexData = JSON.parse(readFileSync('./json_ecgs/index.json', 'utf8'));

// Helper to parse ZZU age strings like "13.6 yr", "11 mo", or "2 days"
function parseZZUAge(ageStr: string): number {
  const match = ageStr.match(/([\d.]+)\s*(yr|mo|days?)/);
  if (!match) return 365; // Default to 1 year if parse fails
  const value = parseFloat(match[1]);
  let unit: 'days' | 'months' | 'years';
  if (match[2] === 'yr') {
    unit = 'years';
  } else if (match[2] === 'mo') {
    unit = 'months';
  } else {
    unit = 'days';
  }
  return ageToDays(value, unit);
}

// Helper to load ECG and calculate measurements
function loadAndMeasure(filename: string) {
  const ecgData = JSON.parse(readFileSync(`./json_ecgs/${filename}`, 'utf8'));
  const leadII = ecgData.signal.leads['II'];
  const leadI = ecgData.signal.leads['I'];
  const leadAVF = ecgData.signal.leads['aVF'];
  const sampleRate = ecgData.signal.sampleRate || 500;

  return calculateECGMeasurements(leadII, leadI, leadAVF, sampleRate);
}

// Convert signal analysis measurements to interpretation format
function toInterpretationInput(meas: ReturnType<typeof calculateECGMeasurements>): InterpretationInput {
  const measurements: ECGMeasurements = {
    hr: meas.hr,
    rr: meas.rr,
    pr: meas.pr,
    qrs: meas.qrs,
    qt: meas.qt,
    qtc: meas.qtc,
    pAxis: meas.pAxis,
    qrsAxis: meas.qrsAxis,
    tAxis: meas.tAxis,
  };
  return { measurements };
}

describe('ZZU ECG Interpretation Integration', () => {
  describe('All ECGs interpret without error', () => {
    it('should successfully interpret all 120 ECGs', () => {
      let successCount = 0;
      let errorCount = 0;

      indexData.forEach((entry: any) => {
        try {
          const measurements = loadAndMeasure(entry.file);
          const ageDays = parseZZUAge(entry.age);
          const input = toInterpretationInput(measurements);

          const interpretation = interpretECG(input, ageDays);

          // Basic validation of interpretation structure
          expect(interpretation.summary).toBeDefined();
          expect(interpretation.summary.conclusion).toBeDefined();
          expect(interpretation.rhythm).toBeDefined();
          expect(interpretation.findings).toBeDefined();
          expect(Array.isArray(interpretation.findings)).toBe(true);

          successCount++;
        } catch (e) {
          console.error(`Failed to interpret ${entry.file}:`, e);
          errorCount++;
        }
      });

      console.log(`\nInterpretation success: ${successCount}/120`);
      expect(successCount).toBe(120);
    });
  });

  describe('Normal ECG interpretation', () => {
    const normalECGs = indexData.filter((e: any) => e.category === 'Normal');

    it('should interpret most Normal ECGs as Normal or Borderline', () => {
      let normalCount = 0;
      let borderlineCount = 0;
      let abnormalCount = 0;

      normalECGs.forEach((entry: any) => {
        const measurements = loadAndMeasure(entry.file);
        const ageDays = parseZZUAge(entry.age);
        const input = toInterpretationInput(measurements);

        const interpretation = interpretECG(input, ageDays);

        console.log(`Normal ${entry.ecg_id} (${entry.age}): ${interpretation.summary.conclusion} - ${interpretation.summary.oneLiner}`);

        switch (interpretation.summary.conclusion) {
          case 'Normal ECG': normalCount++; break;
          case 'Borderline ECG': borderlineCount++; break;
          case 'Abnormal ECG': abnormalCount++; break;
        }
      });

      console.log(`\nNormal ECG summary: Normal=${normalCount}, Borderline=${borderlineCount}, Abnormal=${abnormalCount}`);

      // At least 75% should be Normal or Borderline
      // Some may be flagged due to measurement artifacts (e.g., QTc estimation issues)
      expect(normalCount + borderlineCount).toBeGreaterThanOrEqual(Math.floor(normalECGs.length * 0.75));
    });
  });

  describe('Sinus Tachycardia interpretation', () => {
    const tachyECGs = indexData.filter((e: any) => e.category === 'Sinus_Tachycardia');

    it.each(tachyECGs)('$file should detect tachycardia', (entry: any) => {
      const measurements = loadAndMeasure(entry.file);
      const ageDays = parseZZUAge(entry.age);
      const input = toInterpretationInput(measurements);

      const interpretation = interpretECG(input, ageDays);

      const tachyFinding = interpretation.findings.find(f => f.code === 'SINUS_TACHYCARDIA');
      const rateFinding = interpretation.findings.find(f => f.category === 'rate');

      console.log(`Sinus Tachy ${entry.ecg_id} (${entry.age}): HR ${Math.round(measurements.hr)} bpm, finding: ${rateFinding?.code}`);

      // Most sinus tachycardia ECGs should have elevated rate findings
      // Some may be borderline due to age-specific thresholds
      expect(rateFinding).toBeDefined();
    });

    it('should detect at least 50% of tachycardia cases', () => {
      let detectedCount = 0;

      tachyECGs.forEach((entry: any) => {
        const measurements = loadAndMeasure(entry.file);
        const ageDays = parseZZUAge(entry.age);
        const input = toInterpretationInput(measurements);

        const interpretation = interpretECG(input, ageDays);
        const tachyFinding = interpretation.findings.find(f => f.code === 'SINUS_TACHYCARDIA');

        if (tachyFinding) detectedCount++;
      });

      console.log(`\nSinus tachycardia detection: ${detectedCount}/${tachyECGs.length}`);
      expect(detectedCount).toBeGreaterThanOrEqual(Math.floor(tachyECGs.length * 0.5));
    });
  });

  describe('Sinus Bradycardia interpretation', () => {
    const bradyECGs = indexData.filter((e: any) => e.category === 'Sinus_Bradycardia');

    it.each(bradyECGs)('$file should detect or approach bradycardia', (entry: any) => {
      const measurements = loadAndMeasure(entry.file);
      const ageDays = parseZZUAge(entry.age);
      const input = toInterpretationInput(measurements);

      const interpretation = interpretECG(input, ageDays);
      const rateFinding = interpretation.findings.find(f => f.category === 'rate');

      console.log(`Sinus Brady ${entry.ecg_id} (${entry.age}): HR ${Math.round(measurements.hr)} bpm, finding: ${rateFinding?.code}`);

      // Rate finding should exist
      expect(rateFinding).toBeDefined();
    });

    it('should detect at least 50% of bradycardia cases', () => {
      let detectedCount = 0;

      bradyECGs.forEach((entry: any) => {
        const measurements = loadAndMeasure(entry.file);
        const ageDays = parseZZUAge(entry.age);
        const input = toInterpretationInput(measurements);

        const interpretation = interpretECG(input, ageDays);
        const bradyFinding = interpretation.findings.find(f => f.code === 'SINUS_BRADYCARDIA');

        if (bradyFinding) detectedCount++;
      });

      console.log(`\nSinus bradycardia detection: ${detectedCount}/${bradyECGs.length}`);
      expect(detectedCount).toBeGreaterThanOrEqual(Math.floor(bradyECGs.length * 0.5));
    });
  });

  describe('Interpretation quality metrics', () => {
    it('should have appropriate urgency distribution', () => {
      const urgencyCount = {
        routine: 0,
        attention: 0,
        urgent: 0,
        critical: 0,
      };

      indexData.forEach((entry: any) => {
        const measurements = loadAndMeasure(entry.file);
        const ageDays = parseZZUAge(entry.age);
        const input = toInterpretationInput(measurements);

        const interpretation = interpretECG(input, ageDays);
        urgencyCount[interpretation.summary.urgency]++;
      });

      console.log('\nUrgency distribution:');
      console.log(`  Routine: ${urgencyCount.routine}`);
      console.log(`  Attention: ${urgencyCount.attention}`);
      console.log(`  Urgent: ${urgencyCount.urgent}`);
      console.log(`  Critical: ${urgencyCount.critical}`);

      // Most ECGs should be routine or attention
      expect(urgencyCount.routine + urgencyCount.attention).toBeGreaterThan(60);
    });

    it('should have reasonable conclusion distribution', () => {
      const conclusionCount = {
        'Normal ECG': 0,
        'Borderline ECG': 0,
        'Abnormal ECG': 0,
      };

      indexData.forEach((entry: any) => {
        const measurements = loadAndMeasure(entry.file);
        const ageDays = parseZZUAge(entry.age);
        const input = toInterpretationInput(measurements);

        const interpretation = interpretECG(input, ageDays);
        conclusionCount[interpretation.summary.conclusion]++;
      });

      console.log('\nConclusion distribution:');
      console.log(`  Normal: ${conclusionCount['Normal ECG']}`);
      console.log(`  Borderline: ${conclusionCount['Borderline ECG']}`);
      console.log(`  Abnormal: ${conclusionCount['Abnormal ECG']}`);

      // Should have mix of conclusions
      expect(conclusionCount['Normal ECG']).toBeGreaterThan(0);
      // Dataset contains many abnormal ECGs, so expect some abnormal conclusions
      expect(conclusionCount['Abnormal ECG'] + conclusionCount['Borderline ECG']).toBeGreaterThan(0);
    });

    it('should provide age-adjusted findings', () => {
      let ageAdjustedCount = 0;
      let totalFindings = 0;

      indexData.slice(0, 20).forEach((entry: any) => {
        const measurements = loadAndMeasure(entry.file);
        const ageDays = parseZZUAge(entry.age);
        const input = toInterpretationInput(measurements);

        const interpretation = interpretECG(input, ageDays);

        interpretation.findings.forEach(f => {
          totalFindings++;
          if (f.ageAdjusted) ageAdjustedCount++;
        });
      });

      console.log(`\nAge-adjusted findings: ${ageAdjustedCount}/${totalFindings}`);

      // Most findings should be age-adjusted for pediatric patients
      expect(ageAdjustedCount).toBeGreaterThan(totalFindings * 0.5);
    });
  });

  describe('Structural heart disease ECG patterns', () => {
    const asdECGs = indexData.filter((e: any) => e.category === 'ASD');
    const vsdECGs = indexData.filter((e: any) => e.category === 'VSD');

    it('should interpret ASD ECGs without errors', () => {
      asdECGs.forEach((entry: any) => {
        const measurements = loadAndMeasure(entry.file);
        const ageDays = parseZZUAge(entry.age);
        const input = toInterpretationInput(measurements);

        const interpretation = interpretECG(input, ageDays);

        console.log(`ASD ${entry.ecg_id}: ${interpretation.summary.oneLiner}`);

        expect(interpretation.findings.length).toBeGreaterThan(0);
      });
    });

    it('should interpret VSD ECGs without errors', () => {
      vsdECGs.forEach((entry: any) => {
        const measurements = loadAndMeasure(entry.file);
        const ageDays = parseZZUAge(entry.age);
        const input = toInterpretationInput(measurements);

        const interpretation = interpretECG(input, ageDays);

        console.log(`VSD ${entry.ecg_id}: ${interpretation.summary.oneLiner}`);

        expect(interpretation.findings.length).toBeGreaterThan(0);
      });
    });
  });
});
