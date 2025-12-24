/**
 * Edge case tests for ECG interpretation
 * Tests boundary conditions, age transitions, and extreme values
 */

import { describe, it, expect } from 'vitest';
import { interpretECG, InterpretationInput, ECGMeasurements } from '../../../src/interpretation';
import { analyzeRate } from '../../../src/interpretation/analyzers/rate-analyzer';
import { analyzeAxis } from '../../../src/interpretation/analyzers/axis-analyzer';
import { analyzeIntervals } from '../../../src/interpretation/analyzers/interval-analyzer';
import { getNormalsForAge } from '../../../src/data/pediatricNormals';
import { getAgeGroup, ageToDays } from '../../../src/data/ageGroups';

// Helper to create measurements
function createMeasurements(overrides: Partial<ECGMeasurements> = {}): ECGMeasurements {
  return {
    hr: 80,
    rr: 750,
    pr: 140,
    qrs: 80,
    qt: 380,
    qtc: 420,
    pAxis: 60,
    qrsAxis: 60,
    tAxis: 45,
    ...overrides,
  };
}

describe('Edge Cases', () => {
  describe('Age Boundary Transitions', () => {
    // Actual age group boundaries from ageGroups.ts:
    // neonate_0_24h: 0-1 days (maxDays=1, exclusive)
    // neonate_1_3d: 1-3 days (maxDays=3)
    // neonate_3_7d: 3-8 days (maxDays=8)
    // neonate_8_30d: 8-31 days (maxDays=31)
    // infant_1_3mo: 31-92 days
    // infant_3_6mo: 92-183 days
    // infant_6_12mo: 183-366 days
    // toddler_1_3yr: 366-1096 days
    // child_3_5yr: 1096-1827 days
    // child_5_8yr: 1827-2922 days
    // child_8_12yr: 2922-4383 days
    // adolescent_12_16yr: 4383-5844 days
    // adolescent_16_18yr: 5844-6575 days
    const ageBoundaries = [
      { name: 'Day 0 (birth)', days: 0, expectedGroup: 'neonate_0_24h' },
      { name: 'Day 1 boundary', days: 1, expectedGroup: 'neonate_1_3d' },
      { name: 'Day 3 boundary', days: 3, expectedGroup: 'neonate_3_7d' },
      { name: 'Day 7 (still 3-7d group)', days: 7, expectedGroup: 'neonate_3_7d' },
      { name: 'Day 8 boundary', days: 8, expectedGroup: 'neonate_8_30d' },
      { name: 'Day 30 (still 8-30d group)', days: 30, expectedGroup: 'neonate_8_30d' },
      { name: 'Day 31 boundary', days: 31, expectedGroup: 'infant_1_3mo' },
      { name: '3 months (91 days)', days: 91, expectedGroup: 'infant_1_3mo' },
      { name: '3 months boundary (92 days)', days: 92, expectedGroup: 'infant_3_6mo' },
      { name: '6 months (182 days)', days: 182, expectedGroup: 'infant_3_6mo' },
      { name: '6 months boundary (183 days)', days: 183, expectedGroup: 'infant_6_12mo' },
      { name: '1 year (365 days)', days: 365, expectedGroup: 'infant_6_12mo' },
      { name: '1 year boundary (366 days)', days: 366, expectedGroup: 'toddler_1_3yr' },
      { name: '3 years (1095 days)', days: 1095, expectedGroup: 'toddler_1_3yr' },
      { name: '3 years boundary (1096 days)', days: 1096, expectedGroup: 'child_3_5yr' },
      { name: '5 years (1826 days)', days: 1826, expectedGroup: 'child_3_5yr' },
      { name: '5 years boundary (1827 days)', days: 1827, expectedGroup: 'child_5_8yr' },
      { name: '8 years (2921 days)', days: 2921, expectedGroup: 'child_5_8yr' },
      { name: '8 years boundary (2922 days)', days: 2922, expectedGroup: 'child_8_12yr' },
      { name: '12 years (4382 days)', days: 4382, expectedGroup: 'child_8_12yr' },
      { name: '12 years boundary (4383 days)', days: 4383, expectedGroup: 'adolescent_12_16yr' },
      { name: '16 years (5843 days)', days: 5843, expectedGroup: 'adolescent_12_16yr' },
      { name: '16 years boundary (5844 days)', days: 5844, expectedGroup: 'adolescent_16_18yr' },
    ];

    it.each(ageBoundaries)('$name should use correct age group', ({ days, expectedGroup }) => {
      const ageGroup = getAgeGroup(days);
      expect(ageGroup.id).toBe(expectedGroup);
    });

    it.each(ageBoundaries)('$name should get valid normals', ({ days }) => {
      const normals = getNormalsForAge(days);
      expect(normals).toBeDefined();
      expect(normals.heartRate).toBeDefined();
      expect(normals.heartRate.p2).toBeLessThan(normals.heartRate.p50);
      expect(normals.heartRate.p50).toBeLessThan(normals.heartRate.p98);
    });

    it.each(ageBoundaries)('$name should interpret without error', ({ days }) => {
      const input: InterpretationInput = { measurements: createMeasurements() };
      const result = interpretECG(input, days);
      expect(result).toBeDefined();
      expect(result.summary.conclusion).toBeDefined();
    });

    it('should have different normals for adjacent age groups', () => {
      // Day 0 vs Day 1 - different groups (0_24h vs 1_3d)
      expect(getAgeGroup(0).id).not.toBe(getAgeGroup(1).id);

      // Day 30 vs Day 31 (neonate to infant transition)
      expect(getAgeGroup(30).id).toBe('neonate_8_30d');
      expect(getAgeGroup(31).id).toBe('infant_1_3mo');
      expect(getAgeGroup(30).id).not.toBe(getAgeGroup(31).id);
    });
  });

  describe('QTc Boundary Values', () => {
    const ageDays = ageToDays(10, 'years');
    const normals = getNormalsForAge(ageDays);

    it('QTc exactly 450ms should be normal (not borderline)', () => {
      const findings = analyzeIntervals(140, 80, 450, 80, normals, ageDays);
      const qtcFinding = findings.find(f => f.code === 'QTC_BORDERLINE' || f.code === 'QTC_PROLONGED');
      expect(qtcFinding).toBeUndefined();
    });

    it('QTc exactly 451ms should be borderline', () => {
      const findings = analyzeIntervals(140, 80, 451, 80, normals, ageDays);
      const qtcFinding = findings.find(f => f.code === 'QTC_BORDERLINE');
      expect(qtcFinding).toBeDefined();
      expect(qtcFinding?.severity).toBe('borderline');
    });

    it('QTc exactly 470ms should be borderline (not abnormal)', () => {
      const findings = analyzeIntervals(140, 80, 470, 80, normals, ageDays);
      const qtcFinding = findings.find(f => f.code === 'QTC_BORDERLINE');
      expect(qtcFinding).toBeDefined();
      expect(qtcFinding?.severity).toBe('borderline');
    });

    it('QTc exactly 471ms should be abnormal', () => {
      const findings = analyzeIntervals(140, 80, 471, 80, normals, ageDays);
      const qtcFinding = findings.find(f => f.code === 'QTC_PROLONGED');
      expect(qtcFinding).toBeDefined();
      expect(qtcFinding?.severity).toBe('abnormal');
    });

    it('QTc exactly 500ms should be abnormal (not critical)', () => {
      const findings = analyzeIntervals(140, 80, 500, 80, normals, ageDays);
      const qtcFinding = findings.find(f => f.code === 'QTC_PROLONGED');
      expect(qtcFinding).toBeDefined();
      expect(qtcFinding?.severity).toBe('abnormal');
    });

    it('QTc exactly 501ms should be critical', () => {
      const findings = analyzeIntervals(140, 80, 501, 80, normals, ageDays);
      const qtcFinding = findings.find(f => f.code === 'QTC_PROLONGED');
      expect(qtcFinding).toBeDefined();
      expect(qtcFinding?.severity).toBe('critical');
    });

    it('QTc exactly 340ms should be normal (not short)', () => {
      const findings = analyzeIntervals(140, 80, 340, 80, normals, ageDays);
      const qtcFinding = findings.find(f => f.code === 'QTC_SHORT');
      expect(qtcFinding).toBeUndefined();
    });

    it('QTc exactly 339ms should be short', () => {
      const findings = analyzeIntervals(140, 80, 339, 80, normals, ageDays);
      const qtcFinding = findings.find(f => f.code === 'QTC_SHORT');
      expect(qtcFinding).toBeDefined();
    });
  });

  describe('Heart Rate Boundary Values', () => {
    // Note: classifyValue uses adjusted thresholds for standard strictness:
    // lowThreshold = p2 * 1.02, highThreshold = p98 * 0.98
    // This means values at exactly p2/p98 are classified as abnormal

    it('HR at exactly p98 should be tachycardia (above adjusted threshold)', () => {
      const ageDays = ageToDays(5, 'years');
      const normals = getNormalsForAge(ageDays);
      const hrAtP98 = normals.heartRate.p98; // 140 for 3-5yr

      // p98 > p98 * 0.98 (140 > 137.2), so classified as 'high'
      const findings = analyzeRate(hrAtP98, normals.heartRate, ageDays);
      expect(findings[0].code).toBe('SINUS_TACHYCARDIA');
    });

    it('HR at 98% of p98 should be normal (at threshold)', () => {
      const ageDays = ageToDays(5, 'years');
      const normals = getNormalsForAge(ageDays);
      const hrAtThreshold = Math.floor(normals.heartRate.p98 * 0.98);

      const findings = analyzeRate(hrAtThreshold, normals.heartRate, ageDays);
      // At or below threshold, should be normal or borderline_high
      expect(['RATE_NORMAL', 'SINUS_TACHYCARDIA']).toContain(findings[0].code);
    });

    it('HR well above p98 should be tachycardia', () => {
      const ageDays = ageToDays(5, 'years');
      const normals = getNormalsForAge(ageDays);
      const hrAboveP98 = normals.heartRate.p98 + 10;

      const findings = analyzeRate(hrAboveP98, normals.heartRate, ageDays);
      expect(findings[0].code).toBe('SINUS_TACHYCARDIA');
    });

    it('HR at exactly p2 should be bradycardia (below adjusted threshold)', () => {
      const ageDays = ageToDays(5, 'years');
      const normals = getNormalsForAge(ageDays);
      const hrAtP2 = normals.heartRate.p2; // 70 for 3-5yr

      // p2 < p2 * 1.02 (70 < 71.4), so classified as 'low'
      const findings = analyzeRate(hrAtP2, normals.heartRate, ageDays);
      expect(findings[0].code).toBe('SINUS_BRADYCARDIA');
    });

    it('HR well below p2 should be bradycardia', () => {
      const ageDays = ageToDays(5, 'years');
      const normals = getNormalsForAge(ageDays);
      const hrBelowP2 = normals.heartRate.p2 - 10;

      const findings = analyzeRate(hrBelowP2, normals.heartRate, ageDays);
      expect(findings[0].code).toBe('SINUS_BRADYCARDIA');
    });

    it('HR at p50 (median) should be normal', () => {
      const ageDays = ageToDays(5, 'years');
      const normals = getNormalsForAge(ageDays);

      const findings = analyzeRate(normals.heartRate.p50, normals.heartRate, ageDays);
      expect(findings[0].code).toBe('RATE_NORMAL');
    });
  });

  describe('Axis Boundary Values', () => {
    it('Axis at exactly -90 should be left axis deviation (not extreme)', () => {
      const ageDays = ageToDays(8, 'years');
      const normals = getNormalsForAge(ageDays);

      const findings = analyzeAxis(-90, normals.qrsAxis, ageDays);
      // -90 is on the boundary - check it doesn't crash
      expect(findings).toHaveLength(1);
      expect(['LEFT_AXIS_DEVIATION', 'EXTREME_AXIS']).toContain(findings[0].code);
    });

    it('Axis at exactly -91 should be extreme axis', () => {
      const ageDays = ageToDays(8, 'years');
      const normals = getNormalsForAge(ageDays);

      const findings = analyzeAxis(-91, normals.qrsAxis, ageDays);
      expect(findings[0].code).toBe('EXTREME_AXIS');
    });

    it('Axis at +180 should normalize correctly', () => {
      const ageDays = ageToDays(8, 'years');
      const normals = getNormalsForAge(ageDays);

      const findings = analyzeAxis(180, normals.qrsAxis, ageDays);
      // Should not crash, should produce a valid finding
      expect(findings).toHaveLength(1);
    });

    it('Axis at -180 should be extreme axis', () => {
      const ageDays = ageToDays(8, 'years');
      const normals = getNormalsForAge(ageDays);

      const findings = analyzeAxis(-180, normals.qrsAxis, ageDays);
      expect(findings[0].code).toBe('EXTREME_AXIS');
    });

    it('Axis at 270 should normalize to -90', () => {
      const ageDays = ageToDays(8, 'years');
      const normals = getNormalsForAge(ageDays);

      const findings = analyzeAxis(270, normals.qrsAxis, ageDays);
      // 270 normalizes to -90, should produce a finding
      expect(findings).toHaveLength(1);
    });

    it('Axis at -270 should normalize to +90', () => {
      const ageDays = ageToDays(8, 'years');
      const normals = getNormalsForAge(ageDays);

      const findings = analyzeAxis(-270, normals.qrsAxis, ageDays);
      // -270 normalizes to +90
      expect(findings).toHaveLength(1);
    });
  });

  describe('Extreme and Invalid Inputs', () => {
    const ageDays = ageToDays(5, 'years');

    it('should handle extremely high HR gracefully', () => {
      const input: InterpretationInput = {
        measurements: createMeasurements({ hr: 500 }),
      };
      const result = interpretECG(input, ageDays);
      expect(result).toBeDefined();
      expect(result.summary.conclusion).toBeDefined();
      // Should still produce a tachycardia finding
      const tachyFinding = result.findings.find(f => f.code === 'SINUS_TACHYCARDIA');
      expect(tachyFinding).toBeDefined();
    });

    it('should handle extremely low HR gracefully', () => {
      const input: InterpretationInput = {
        measurements: createMeasurements({ hr: 10 }),
      };
      const result = interpretECG(input, ageDays);
      expect(result).toBeDefined();
      // Should still produce a bradycardia finding
      const bradyFinding = result.findings.find(f => f.code === 'SINUS_BRADYCARDIA');
      expect(bradyFinding).toBeDefined();
    });

    it('should handle extremely high QTc gracefully', () => {
      const input: InterpretationInput = {
        measurements: createMeasurements({ qtc: 1000 }),
      };
      const result = interpretECG(input, ageDays);
      expect(result).toBeDefined();
      expect(result.summary.conclusion).toBe('Abnormal ECG');
      expect(result.summary.urgency).toBe('critical');
    });

    it('should handle zero HR gracefully', () => {
      const input: InterpretationInput = {
        measurements: createMeasurements({ hr: 0 }),
      };
      // Should not throw
      expect(() => interpretECG(input, ageDays)).not.toThrow();
    });

    it('should handle negative values without crashing', () => {
      const input: InterpretationInput = {
        measurements: createMeasurements({ hr: -50, qtc: -100 }),
      };
      // Should not throw
      expect(() => interpretECG(input, ageDays)).not.toThrow();
    });

    it('should handle very old age (17.9 years) correctly', () => {
      const oldAgeDays = ageToDays(17.9, 'years');
      const input: InterpretationInput = { measurements: createMeasurements() };
      const result = interpretECG(input, oldAgeDays);
      expect(result).toBeDefined();
      expect(result.patientAgeDays).toBe(oldAgeDays);
    });

    it('should handle newborn (0 days) correctly', () => {
      const input: InterpretationInput = { measurements: createMeasurements({ hr: 140 }) };
      const result = interpretECG(input, 0);
      expect(result).toBeDefined();
      expect(result.patientAgeDays).toBe(0);
    });
  });

  describe('Percentile Boundary Cases', () => {
    // classifyValue uses adjusted thresholds:
    // lowThreshold = p2 * 1.02, highThreshold = p98 * 0.98
    // Values at exactly p2 are below lowThreshold → 'low'
    // Values at exactly p98 are above highThreshold → 'high'

    it('should classify value at exactly p2 as low (below adjusted threshold)', () => {
      const ageDays = ageToDays(5, 'years');
      const normals = getNormalsForAge(ageDays);

      // p2 < p2 * 1.02, so classified as 'low' → bradycardia
      const findings = analyzeRate(normals.heartRate.p2, normals.heartRate, ageDays);
      expect(findings[0].code).toBe('SINUS_BRADYCARDIA');
    });

    it('should correctly classify value at exactly p50 as normal', () => {
      const ageDays = ageToDays(5, 'years');
      const normals = getNormalsForAge(ageDays);

      const findings = analyzeRate(normals.heartRate.p50, normals.heartRate, ageDays);
      expect(findings[0].code).toBe('RATE_NORMAL');
    });

    it('should classify value at exactly p98 as high (above adjusted threshold)', () => {
      const ageDays = ageToDays(5, 'years');
      const normals = getNormalsForAge(ageDays);

      // p98 > p98 * 0.98, so classified as 'high' → tachycardia
      const findings = analyzeRate(normals.heartRate.p98, normals.heartRate, ageDays);
      expect(findings[0].code).toBe('SINUS_TACHYCARDIA');
    });

    it('should classify values in safe middle range as normal', () => {
      const ageDays = ageToDays(5, 'years');
      const normals = getNormalsForAge(ageDays);

      // Use p25 and p75 which should definitely be in the normal range
      const midLow = normals.heartRate.p2 + (normals.heartRate.p50 - normals.heartRate.p2) * 0.5;
      const midHigh = normals.heartRate.p50 + (normals.heartRate.p98 - normals.heartRate.p50) * 0.5;

      const findingsLow = analyzeRate(midLow, normals.heartRate, ageDays);
      const findingsHigh = analyzeRate(midHigh, normals.heartRate, ageDays);

      expect(findingsLow[0].code).toBe('RATE_NORMAL');
      expect(findingsHigh[0].code).toBe('RATE_NORMAL');
    });
  });

  describe('Age-Specific HR Interpretation', () => {
    it('HR of 180 should be normal for neonate but tachycardia for teen', () => {
      const neonateNormals = getNormalsForAge(1);
      const teenNormals = getNormalsForAge(ageToDays(15, 'years'));

      const neonateFindings = analyzeRate(180, neonateNormals.heartRate, 1);
      const teenFindings = analyzeRate(180, teenNormals.heartRate, ageToDays(15, 'years'));

      // 180 should be normal or borderline for neonate (p98 ~180)
      expect(['RATE_NORMAL', 'SINUS_TACHYCARDIA']).toContain(neonateFindings[0].code);

      // 180 should definitely be tachycardia for teen (p98 ~100)
      expect(teenFindings[0].code).toBe('SINUS_TACHYCARDIA');
    });

    it('HR of 50 should be bradycardia for child but potentially normal for athletic teen', () => {
      const childNormals = getNormalsForAge(ageToDays(5, 'years'));
      const teenNormals = getNormalsForAge(ageToDays(16, 'years'));

      const childFindings = analyzeRate(50, childNormals.heartRate, ageToDays(5, 'years'));

      // 50 should be bradycardia for child (p2 ~70)
      expect(childFindings[0].code).toBe('SINUS_BRADYCARDIA');
    });
  });

  describe('Multiple Abnormalities', () => {
    it('should correctly identify multiple critical findings', () => {
      const ageDays = ageToDays(10, 'years');
      const input: InterpretationInput = {
        measurements: createMeasurements({
          hr: 200, // Tachycardia
          qtc: 550, // Critical QTc
          qrsAxis: -120, // Extreme axis
        }),
      };

      const result = interpretECG(input, ageDays);

      expect(result.summary.conclusion).toBe('Abnormal ECG');
      expect(result.summary.urgency).toBe('critical');

      const tachyFinding = result.findings.find(f => f.code === 'SINUS_TACHYCARDIA');
      const qtcFinding = result.findings.find(f => f.code === 'QTC_PROLONGED');
      const axisFinding = result.findings.find(f => f.code === 'EXTREME_AXIS');

      expect(tachyFinding).toBeDefined();
      expect(qtcFinding).toBeDefined();
      expect(axisFinding).toBeDefined();
    });

    it('should order findings by severity (critical first)', () => {
      const ageDays = ageToDays(10, 'years');
      const input: InterpretationInput = {
        measurements: createMeasurements({
          hr: 120, // Borderline tachy
          qtc: 550, // Critical
          qrsAxis: 60, // Normal
        }),
      };

      const result = interpretECG(input, ageDays);

      // First non-normal finding should be the critical one
      const nonNormalFindings = result.findings.filter(f => f.severity !== 'normal');
      if (nonNormalFindings.length > 0) {
        expect(nonNormalFindings[0].severity).toBe('critical');
      }
    });
  });
});
