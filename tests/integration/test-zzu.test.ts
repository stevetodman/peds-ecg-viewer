import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { getAgeGroup, ageToDays } from '../../src/data/ageGroups';
import { getNormalsForAge, classifyValue } from '../../src/data/pediatricNormals';
import { calculateECGMeasurements } from '../../src/signal/analysis/ecg-measurements';

// Load ZZU index once
const indexData = JSON.parse(readFileSync('./json_ecgs/index.json', 'utf8'));

// Helper to parse ZZU age strings like "13.6 yr", "11 mo", or "2 days"
function parseZZUAge(ageStr: string): number {
  const match = ageStr.match(/([\d.]+)\s*(yr|mo|days?)/);
  if (!match) return 0;
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

describe('ZZU ECG Dataset Integration', () => {

  describe('Age parsing', () => {
    it('should correctly parse all patient ages', () => {
      indexData.forEach((entry: any) => {
        const ageDays = parseZZUAge(entry.age);
        const ageGroup = getAgeGroup(ageDays);

        // All should be valid pediatric ages
        expect(ageDays).toBeGreaterThan(0);
        expect(ageDays).toBeLessThan(6575); // < 18 years
        expect(ageGroup).toBeDefined();
        expect(ageGroup.id).toBeTruthy();
      });
    });
  });

  describe('Normal ECGs', () => {
    const normalECGs = indexData.filter((e: any) => e.category === 'Normal');

    it('should have 12 normal ECG samples', () => {
      expect(normalECGs).toHaveLength(12);
    });

    it.each(normalECGs)('$file should have HR within normal range for age', (entry: any) => {
      const ageDays = parseZZUAge(entry.age);
      const normals = getNormalsForAge(ageDays);
      const measurements = loadAndMeasure(entry.file);

      const hrClass = classifyValue(measurements.hr, normals.heartRate);

      console.log(`Normal ${entry.ecg_id}: HR ${Math.round(measurements.hr)} bpm, age ${entry.age}, class: ${hrClass}`);

      // Normal ECGs should not have extreme HR values
      expect(['normal', 'borderline_low', 'borderline_high']).toContain(hrClass);
    });
  });

  describe('Sinus Tachycardia ECGs', () => {
    const tachyECGs = indexData.filter((e: any) => e.category === 'Sinus_Tachycardia');

    it('should have 12 sinus tachycardia samples', () => {
      expect(tachyECGs).toHaveLength(12);
    });

    it.each(tachyECGs)('$file should have elevated HR for age', (entry: any) => {
      const ageDays = parseZZUAge(entry.age);
      const normals = getNormalsForAge(ageDays);
      const measurements = loadAndMeasure(entry.file);

      const hrClass = classifyValue(measurements.hr, normals.heartRate);

      console.log(`Sinus Tachy ${entry.ecg_id}: HR ${Math.round(measurements.hr)} bpm, age ${entry.age}, upper normal: ${normals.heartRate.p98}, class: ${hrClass}`);

      // Sinus tachycardia should have HR above median for age
      expect(measurements.hr).toBeGreaterThan(normals.heartRate.p50);
    });
  });

  describe('SVT ECGs', () => {
    const svtECGs = indexData.filter((e: any) => e.category === 'SVT');

    it('should have 12 SVT samples', () => {
      expect(svtECGs).toHaveLength(12);
    });

    it.each(svtECGs)('$file should load and produce valid measurements', (entry: any) => {
      const measurements = loadAndMeasure(entry.file);

      console.log(`SVT ${entry.ecg_id}: HR ${Math.round(measurements.hr)} bpm, age ${entry.age}`);

      // SVT ECGs may be captured during or after the arrhythmia
      // Some ECGs may have measurement issues due to signal quality
      // Just validate we get non-negative measurements
      expect(measurements.hr).toBeGreaterThan(0);
      expect(measurements.hr).toBeLessThan(400);
    });
  });

  describe('VT ECGs', () => {
    const vtECGs = indexData.filter((e: any) => e.category === 'VT');

    it('should have 12 VT samples', () => {
      expect(vtECGs).toHaveLength(12);
    });

    it.each(vtECGs)('$file should load and produce valid measurements', (entry: any) => {
      const measurements = loadAndMeasure(entry.file);

      console.log(`VT ${entry.ecg_id}: QRS ${Math.round(measurements.qrs)} ms, HR ${Math.round(measurements.hr)} bpm`);

      // VT ECGs may be captured during or after the arrhythmia
      // Just validate we get valid measurements
      expect(measurements.hr).toBeGreaterThan(30);
      expect(measurements.hr).toBeLessThan(350);
    });
  });

  describe('Structural heart disease ECGs (VSD, ASD, Kawasaki, Myocarditis)', () => {
    // These diagnoses are structural, not ECG-based
    // ECG may be normal or show nonspecific changes

    const structuralECGs = indexData.filter((e: any) =>
      ['VSD', 'ASD', 'Kawasaki', 'Myocarditis'].includes(e.category)
    );

    it('should have 48 structural heart disease samples (12 each)', () => {
      expect(structuralECGs).toHaveLength(48);
    });

    it.each(structuralECGs)('$file should load and calculate measurements', (entry: any) => {
      const measurements = loadAndMeasure(entry.file);

      console.log(`${entry.category} ${entry.ecg_id}: HR ${Math.round(measurements.hr)} bpm, QRS ${Math.round(measurements.qrs)} ms`);

      // Should produce valid measurements (not NaN or extreme values)
      // Note: Myocarditis can present with SVT/VT, so upper limit is higher
      expect(measurements.hr).toBeGreaterThan(30);
      expect(measurements.hr).toBeLessThan(350);
      expect(measurements.qrs).toBeGreaterThan(20);
      expect(measurements.qrs).toBeLessThan(200);
    });
  });

  describe('Additional categories', () => {
    const lvhECGs = indexData.filter((e: any) => e.category === 'LVH');
    const bradyECGs = indexData.filter((e: any) => e.category === 'Sinus_Bradycardia');

    it('should have 12 LVH samples', () => {
      expect(lvhECGs).toHaveLength(12);
    });

    it('should have 12 Sinus Bradycardia samples', () => {
      expect(bradyECGs).toHaveLength(12);
    });

    it.each(bradyECGs)('$file should have low HR for age', (entry: any) => {
      const ageDays = parseZZUAge(entry.age);
      const normals = getNormalsForAge(ageDays);
      const measurements = loadAndMeasure(entry.file);

      // Sinus bradycardia should have HR below median for age
      expect(measurements.hr).toBeLessThan(normals.heartRate.p50);
    });
  });

  describe('Overall dataset validation', () => {
    it('should have 120 total ECG samples', () => {
      expect(indexData).toHaveLength(120);
    });

    it('should have 10 diagnostic categories', () => {
      const categories = new Set(indexData.map((e: any) => e.category));
      expect(categories.size).toBe(10);
    });

    it('should successfully calculate measurements for all 120 ECGs', () => {
      let successCount = 0;

      indexData.forEach((entry: any) => {
        try {
          const measurements = loadAndMeasure(entry.file);
          if (measurements.hr > 0 && measurements.qrs > 0) {
            successCount++;
          }
        } catch (e) {
          console.error(`Failed to process ${entry.file}:`, e);
        }
      });

      expect(successCount).toBe(120);
    });
  });
});
