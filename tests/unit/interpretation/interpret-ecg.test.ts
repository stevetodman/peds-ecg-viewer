/**
 * Main interpretECG function tests
 */

import { describe, it, expect } from 'vitest';
import { interpretECG, InterpretationInput, ECGMeasurements } from '../../../src/interpretation';
import { ageToDays } from '../../../src/data/ageGroups';

// Helper to create minimal measurements (flat structure)
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

describe('interpretECG', () => {
  describe('Normal ECG interpretation', () => {
    it('should return normal interpretation for normal measurements', () => {
      const input: InterpretationInput = {
        measurements: createMeasurements(),
      };
      const ageDays = ageToDays(8, 'years');

      const result = interpretECG(input, ageDays);

      expect(result.summary.conclusion).toBe('Normal ECG');
      expect(result.summary.urgency).toBe('routine');
      expect(result.summary.recommendReview).toBe(false);
    });

    it('should include rhythm description', () => {
      const input: InterpretationInput = {
        measurements: createMeasurements(),
      };
      const ageDays = ageToDays(10, 'years');

      const result = interpretECG(input, ageDays);

      expect(result.rhythm).toBeDefined();
      // Rhythm object contains name, ventricularRate, regular
      expect(result.rhythm.name).toBeDefined();
      expect(result.rhythm.ventricularRate).toBe(80);
    });

    it('should include normal findings in output', () => {
      const input: InterpretationInput = {
        measurements: createMeasurements(),
      };
      const ageDays = ageToDays(5, 'years');

      const result = interpretECG(input, ageDays);

      const normalFindings = result.findings.filter(f => f.severity === 'normal');
      expect(normalFindings.length).toBeGreaterThan(0);
    });
  });

  describe('Abnormal ECG interpretation', () => {
    it('should detect tachycardia', () => {
      const input: InterpretationInput = {
        measurements: createMeasurements({
          hr: 180,
        }),
      };
      const ageDays = ageToDays(8, 'years');

      const result = interpretECG(input, ageDays);

      expect(result.summary.conclusion).not.toBe('Normal ECG');
      const tachyFinding = result.findings.find(f => f.code === 'SINUS_TACHYCARDIA');
      expect(tachyFinding).toBeDefined();
    });

    it('should detect prolonged QTc as critical', () => {
      const input: InterpretationInput = {
        measurements: createMeasurements({
          qtc: 520,
        }),
      };
      const ageDays = ageToDays(12, 'years');

      const result = interpretECG(input, ageDays);

      expect(result.summary.conclusion).toBe('Abnormal ECG');
      expect(result.summary.urgency).toBe('critical');
      expect(result.summary.recommendReview).toBe(true);

      const qtcFinding = result.findings.find(f => f.code === 'QTC_PROLONGED');
      expect(qtcFinding?.severity).toBe('critical');
    });

    it('should detect left axis deviation', () => {
      const input: InterpretationInput = {
        measurements: createMeasurements({
          qrsAxis: -50,
        }),
      };
      const ageDays = ageToDays(6, 'years');

      const result = interpretECG(input, ageDays);

      const axisFinding = result.findings.find(f => f.code === 'LEFT_AXIS_DEVIATION');
      expect(axisFinding).toBeDefined();
    });
  });

  describe('Borderline ECG interpretation', () => {
    it('should return borderline for minor abnormalities', () => {
      const input: InterpretationInput = {
        measurements: createMeasurements({
          qtc: 455,
        }),
      };
      const ageDays = ageToDays(10, 'years');

      const result = interpretECG(input, ageDays);

      expect(result.summary.conclusion).toBe('Borderline ECG');
      // Note: borderline QTc uses code QTC_BORDERLINE, not QTC_PROLONGED
      const qtcFinding = result.findings.find(f => f.code === 'QTC_BORDERLINE');
      expect(qtcFinding?.severity).toBe('borderline');
    });
  });

  describe('Age-adjusted interpretation', () => {
    it('should interpret neonate HR differently than adolescent', () => {
      const neonateInput: InterpretationInput = {
        measurements: createMeasurements({
          hr: 140,
        }),
      };
      const adolescentInput: InterpretationInput = {
        measurements: createMeasurements({
          hr: 140,
        }),
      };

      const neonateResult = interpretECG(neonateInput, 7);
      const adolescentResult = interpretECG(adolescentInput, ageToDays(15, 'years'));

      // 140 bpm normal for neonate, tachycardia for adolescent
      const neonateRateFinding = neonateResult.findings.find(f => f.category === 'rate');
      const adolescentRateFinding = adolescentResult.findings.find(f => f.category === 'rate');

      expect(neonateRateFinding?.code).toBe('RATE_NORMAL');
      expect(adolescentRateFinding?.code).toBe('SINUS_TACHYCARDIA');
    });

    it('should apply ageAdjusted flag to findings', () => {
      const input: InterpretationInput = {
        measurements: createMeasurements(),
      };
      const ageDays = ageToDays(3, 'years');

      const result = interpretECG(input, ageDays);

      // Rate and axis findings have ageAdjusted flag
      const ageAdjustedFindings = result.findings.filter(f => f.ageAdjusted === true);
      expect(ageAdjustedFindings.length).toBeGreaterThan(0);
    });
  });

  describe('Voltage data for hypertrophy', () => {
    it('should analyze hypertrophy when voltage data provided', () => {
      const input: InterpretationInput = {
        measurements: createMeasurements({
          qrsAxis: 150, // Rightward axis
        }),
        voltages: {
          rWaveV1: 35, // Very high R wave in V1
          sWaveV6: 25,
        },
      };
      const ageDays = ageToDays(5, 'years');

      const result = interpretECG(input, ageDays);

      const hypertrophyFinding = result.findings.find(
        f => f.code === 'RVH' || f.code === 'RVH_VOLTAGE' || f.code === 'RVH_POSSIBLE'
      );
      expect(hypertrophyFinding).toBeDefined();
    });
  });

  describe('T-wave analysis', () => {
    it('should detect abnormal T wave in V1 for older child', () => {
      const input: InterpretationInput = {
        measurements: createMeasurements({
          qrsAxis: 60,
          tAxis: 45,
        }),
        tWaveV1Polarity: 'upright',
      };
      const ageDays = ageToDays(5, 'years'); // Upright T in V1 abnormal after first week

      const result = interpretECG(input, ageDays);

      const tWaveFinding = result.findings.find(f => f.code === 'T_WAVE_ABNORMALITY');
      expect(tWaveFinding).toBeDefined();
    });
  });

  describe('Output structure', () => {
    it('should include all required fields', () => {
      const input: InterpretationInput = {
        measurements: createMeasurements(),
      };
      const ageDays = ageToDays(7, 'years');

      const result = interpretECG(input, ageDays);

      expect(result).toHaveProperty('findings');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('rhythm');
      expect(result).toHaveProperty('interpretedAt');
      expect(result).toHaveProperty('patientAgeDays');

      expect(result.summary).toHaveProperty('conclusion');
      expect(result.summary).toHaveProperty('oneLiner');
      expect(result.summary).toHaveProperty('urgency');
      expect(result.summary).toHaveProperty('recommendReview');
    });

    it('should order findings by severity', () => {
      const input: InterpretationInput = {
        measurements: createMeasurements({
          hr: 180,
          qtc: 520,
        }),
      };
      const ageDays = ageToDays(10, 'years');

      const result = interpretECG(input, ageDays);

      // Critical should come before abnormal, which should come before normal
      const severityOrder = { critical: 0, abnormal: 1, borderline: 2, normal: 3 };
      for (let i = 1; i < result.findings.length; i++) {
        const prevSeverity = severityOrder[result.findings[i - 1].severity];
        const currSeverity = severityOrder[result.findings[i].severity];
        expect(currSeverity).toBeGreaterThanOrEqual(prevSeverity);
      }
    });

    it('should include confidence scores', () => {
      const input: InterpretationInput = {
        measurements: createMeasurements(),
      };
      const ageDays = ageToDays(5, 'years');

      const result = interpretECG(input, ageDays);

      result.findings.forEach(finding => {
        expect(finding.confidence).toBeGreaterThan(0);
        expect(finding.confidence).toBeLessThanOrEqual(1);
      });
    });
  });
});
