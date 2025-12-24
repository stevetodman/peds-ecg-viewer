/**
 * Axis analyzer unit tests
 */

import { describe, it, expect } from 'vitest';
import { analyzeAxis } from '../../../src/interpretation/analyzers/axis-analyzer';
import { getNormalsForAge } from '../../../src/data/pediatricNormals';
import { ageToDays } from '../../../src/data/ageGroups';

describe('Axis Analyzer', () => {
  describe('Neonate (3 days old)', () => {
    const ageDays = 3;
    const normals = getNormalsForAge(ageDays);

    it('should accept rightward axis as normal for neonates', () => {
      // Neonates normally have rightward axis (60-180)
      const findings = analyzeAxis(120, normals.qrsAxis, ageDays);
      expect(findings[0].code).toBe('AXIS_NORMAL');
      expect(findings[0].ageAdjusted).toBe(true);
    });

    it('should detect left axis deviation in neonate', () => {
      // Left axis in neonate is abnormal
      const findings = analyzeAxis(-30, normals.qrsAxis, ageDays);
      expect(findings[0].code).toBe('LEFT_AXIS_DEVIATION');
    });
  });

  describe('Child (5 years old)', () => {
    const ageDays = ageToDays(5, 'years');
    const normals = getNormalsForAge(ageDays);

    it('should accept normal axis for age', () => {
      const findings = analyzeAxis(60, normals.qrsAxis, ageDays);
      expect(findings[0].code).toBe('AXIS_NORMAL');
    });

    it('should detect right axis deviation', () => {
      // 130 degrees is high for a 5-year-old (normal ~0-110)
      const findings = analyzeAxis(130, normals.qrsAxis, ageDays);
      expect(findings[0].code).toBe('RIGHT_AXIS_DEVIATION');
    });

    it('should detect left axis deviation', () => {
      // -40 degrees is left for a 5-year-old
      const findings = analyzeAxis(-40, normals.qrsAxis, ageDays);
      expect(findings[0].code).toBe('LEFT_AXIS_DEVIATION');
    });
  });

  describe('Extreme axis', () => {
    const ageDays = ageToDays(8, 'years');
    const normals = getNormalsForAge(ageDays);

    it('should detect northwest axis as extreme', () => {
      // Northwest axis (-90 to -180) is always abnormal
      const findings = analyzeAxis(-120, normals.qrsAxis, ageDays);
      expect(findings[0].code).toBe('EXTREME_AXIS');
      expect(findings[0].severity).toBe('abnormal');
    });

    it('should include clinical note for extreme axis', () => {
      const findings = analyzeAxis(-150, normals.qrsAxis, ageDays);
      expect(findings[0].clinicalNote).toBeDefined();
      expect(findings[0].clinicalNote).toContain('ventricular hypertrophy');
    });
  });

  describe('Adolescent (15 years)', () => {
    const ageDays = ageToDays(15, 'years');
    const normals = getNormalsForAge(ageDays);

    it('should use adult-like axis norms', () => {
      // Normal adult axis is roughly -30 to +90
      const findings = analyzeAxis(45, normals.qrsAxis, ageDays);
      expect(findings[0].code).toBe('AXIS_NORMAL');
    });
  });

  describe('Edge cases', () => {
    const ageDays = ageToDays(2, 'years');
    const normals = getNormalsForAge(ageDays);

    it('should handle axis at exactly upper limit', () => {
      const findings = analyzeAxis(normals.qrsAxis.p98, normals.qrsAxis, ageDays);
      expect(findings[0].code).toBe('AXIS_NORMAL');
    });

    it('should handle axis just above upper limit', () => {
      const findings = analyzeAxis(normals.qrsAxis.p98 + 1, normals.qrsAxis, ageDays);
      expect(findings[0].code).toBe('RIGHT_AXIS_DEVIATION');
    });

    it('should normalize axis values > 180', () => {
      // 270 degrees should normalize to -90
      const findings = analyzeAxis(270, normals.qrsAxis, ageDays);
      // Should be detected as extreme or left axis deviation
      expect(['LEFT_AXIS_DEVIATION', 'EXTREME_AXIS']).toContain(findings[0].code);
    });
  });
});
