/**
 * Rate analyzer unit tests
 */

import { describe, it, expect } from 'vitest';
import { analyzeRate } from '../../../src/interpretation/analyzers/rate-analyzer';
import { getNormalsForAge } from '../../../src/data/pediatricNormals';
import { ageToDays } from '../../../src/data/ageGroups';

describe('Rate Analyzer', () => {
  describe('Neonate (1 week old)', () => {
    const ageDays = 7;
    const normals = getNormalsForAge(ageDays);

    it('should detect tachycardia when HR > p98', () => {
      // Need >20% above p98 for 'abnormal' severity
      // Neonate p98 ~180, so 220 = ~22% above = abnormal
      const findings = analyzeRate(220, normals.heartRate, ageDays);
      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe('SINUS_TACHYCARDIA');
      expect(findings[0].severity).toBe('abnormal');
      expect(findings[0].ageAdjusted).toBe(true);
    });

    it('should detect borderline tachycardia', () => {
      // Just above upper limit (<20% = borderline)
      const hr = normals.heartRate.p98 + 10;
      const findings = analyzeRate(hr, normals.heartRate, ageDays);
      expect(findings[0].code).toBe('SINUS_TACHYCARDIA');
      expect(findings[0].severity).toBe('borderline');
    });

    it('should classify normal HR appropriately', () => {
      const findings = analyzeRate(140, normals.heartRate, ageDays);
      expect(findings[0].code).toBe('RATE_NORMAL');
      expect(findings[0].severity).toBe('normal');
    });

    it('should detect bradycardia when HR < p2', () => {
      const findings = analyzeRate(70, normals.heartRate, ageDays);
      expect(findings[0].code).toBe('SINUS_BRADYCARDIA');
    });
  });

  describe('Infant (6 months)', () => {
    const ageDays = ageToDays(6, 'months');
    const normals = getNormalsForAge(ageDays);

    it('should use age-appropriate thresholds', () => {
      // Normal for neonate but potentially high for infant
      const findings = analyzeRate(150, normals.heartRate, ageDays);
      // 150 should be normal for 6-month infant
      expect(findings[0].severity).toBe('normal');
    });
  });

  describe('Child (8 years)', () => {
    const ageDays = ageToDays(8, 'years');
    const normals = getNormalsForAge(ageDays);

    it('should detect tachycardia at lower HR than neonates', () => {
      // 120 bpm - should be tachycardia for 8-year-old
      const findings = analyzeRate(120, normals.heartRate, ageDays);
      expect(findings[0].code).toBe('SINUS_TACHYCARDIA');
    });

    it('should detect bradycardia appropriately', () => {
      const findings = analyzeRate(50, normals.heartRate, ageDays);
      expect(findings[0].code).toBe('SINUS_BRADYCARDIA');
    });
  });

  describe('Adolescent (14 years)', () => {
    const ageDays = ageToDays(14, 'years');
    const normals = getNormalsForAge(ageDays);

    it('should use adult-like thresholds', () => {
      // HR of 105 is tachycardia for adolescent
      const findings = analyzeRate(105, normals.heartRate, ageDays);
      expect(findings[0].code).toBe('SINUS_TACHYCARDIA');
    });

    it('should accept normal adult HR range', () => {
      const findings = analyzeRate(70, normals.heartRate, ageDays);
      expect(findings[0].code).toBe('RATE_NORMAL');
    });
  });
});
