/**
 * Interval analyzer unit tests
 */

import { describe, it, expect } from 'vitest';
import { analyzeIntervals } from '../../../src/interpretation/analyzers/interval-analyzer';
import { getNormalsForAge } from '../../../src/data/pediatricNormals';
import { ageToDays } from '../../../src/data/ageGroups';

describe('Interval Analyzer', () => {
  describe('PR Interval', () => {
    const ageDays = ageToDays(5, 'years');
    const normals = getNormalsForAge(ageDays);

    it('should detect first degree AV block (prolonged PR)', () => {
      // PR > p98 for age
      const findings = analyzeIntervals(220, 80, 420, 90, normals, ageDays);
      const prFinding = findings.find(f => f.code === 'FIRST_DEGREE_AV_BLOCK');
      expect(prFinding).toBeDefined();
      expect(prFinding?.severity).toBe('abnormal');
    });

    it('should detect short PR interval', () => {
      // PR < 80ms is short (consider WPW)
      const findings = analyzeIntervals(70, 80, 420, 90, normals, ageDays);
      const prFinding = findings.find(f => f.code === 'PR_SHORT');
      expect(prFinding).toBeDefined();
    });

    it('should return no PR finding for normal PR', () => {
      // Normal values return no findings (only abnormalities are flagged)
      const findings = analyzeIntervals(140, 80, 420, 90, normals, ageDays);
      const prFinding = findings.find(f => f.code === 'FIRST_DEGREE_AV_BLOCK' || f.code === 'PR_SHORT');
      expect(prFinding).toBeUndefined();
    });
  });

  describe('QRS Duration', () => {
    const ageDays = ageToDays(8, 'years');
    const normals = getNormalsForAge(ageDays);

    it('should detect prolonged QRS', () => {
      // QRS > 120ms is prolonged for children
      const findings = analyzeIntervals(140, 140, 420, 80, normals, ageDays);
      const qrsFinding = findings.find(f => f.code === 'QRS_PROLONGED');
      expect(qrsFinding).toBeDefined();
    });

    it('should return no QRS finding for normal QRS', () => {
      // Normal values return no findings
      const findings = analyzeIntervals(140, 80, 420, 80, normals, ageDays);
      const qrsFinding = findings.find(f => f.code === 'QRS_PROLONGED');
      expect(qrsFinding).toBeUndefined();
    });
  });

  describe('QTc Analysis - Critical Finding', () => {
    const ageDays = ageToDays(10, 'years');
    const normals = getNormalsForAge(ageDays);

    it('should detect critical QTc > 500ms', () => {
      const findings = analyzeIntervals(140, 80, 520, 80, normals, ageDays);
      const qtcFinding = findings.find(f => f.code === 'QTC_PROLONGED');
      expect(qtcFinding).toBeDefined();
      expect(qtcFinding?.severity).toBe('critical');
      expect(qtcFinding?.clinicalNote).toContain('Long QT');
    });

    it('should detect abnormal QTc > 470ms', () => {
      const findings = analyzeIntervals(140, 80, 480, 80, normals, ageDays);
      const qtcFinding = findings.find(f => f.code === 'QTC_PROLONGED');
      expect(qtcFinding).toBeDefined();
      expect(qtcFinding?.severity).toBe('abnormal');
    });

    it('should detect borderline QTc > 450ms', () => {
      const findings = analyzeIntervals(140, 80, 460, 80, normals, ageDays);
      // Borderline QTc uses code QTC_BORDERLINE
      const qtcFinding = findings.find(f => f.code === 'QTC_BORDERLINE');
      expect(qtcFinding).toBeDefined();
      expect(qtcFinding?.severity).toBe('borderline');
    });

    it('should return no QTc finding for normal QTc', () => {
      // Normal QTc returns no finding
      const findings = analyzeIntervals(140, 80, 420, 80, normals, ageDays);
      const qtcFinding = findings.find(f =>
        f.code === 'QTC_PROLONGED' || f.code === 'QTC_BORDERLINE' || f.code === 'QTC_SHORT'
      );
      expect(qtcFinding).toBeUndefined();
    });

    it('should detect short QTc', () => {
      // QTc < 340ms
      const findings = analyzeIntervals(140, 80, 320, 80, normals, ageDays);
      const qtcFinding = findings.find(f => f.code === 'QTC_SHORT');
      expect(qtcFinding).toBeDefined();
    });
  });

  describe('Neonate intervals', () => {
    const ageDays = 7;
    const normals = getNormalsForAge(ageDays);

    it('should return no QRS finding for normal neonate QRS', () => {
      // Neonates have shorter QRS durations - 60ms is normal
      const findings = analyzeIntervals(100, 60, 400, 150, normals, ageDays);
      const qrsFinding = findings.find(f => f.code === 'QRS_PROLONGED');
      expect(qrsFinding).toBeUndefined();
    });

    it('should detect prolonged QRS in neonate at lower threshold', () => {
      // Even 100ms may be prolonged for neonate
      const findings = analyzeIntervals(100, 110, 400, 150, normals, ageDays);
      const qrsFinding = findings.find(f => f.code === 'QRS_PROLONGED');
      expect(qrsFinding).toBeDefined();
    });
  });

  describe('Combined findings', () => {
    const ageDays = ageToDays(6, 'years');
    const normals = getNormalsForAge(ageDays);

    it('should return multiple findings when multiple abnormalities', () => {
      // Prolonged PR + Prolonged QTc
      const findings = analyzeIntervals(250, 80, 510, 90, normals, ageDays);
      // Should have at least 2 findings (PR and QTc)
      expect(findings.length).toBeGreaterThanOrEqual(2);

      const prFinding = findings.find(f => f.code === 'FIRST_DEGREE_AV_BLOCK');
      const qtcFinding = findings.find(f => f.code === 'QTC_PROLONGED');
      expect(prFinding).toBeDefined();
      expect(qtcFinding).toBeDefined();
    });

    it('should include ageAdjusted flag for PR findings', () => {
      // Test with abnormal PR to get a finding with ageAdjusted flag
      const findings = analyzeIntervals(250, 80, 420, 90, normals, ageDays);
      const ageAdjustedFindings = findings.filter(f => f.ageAdjusted);
      expect(ageAdjustedFindings.length).toBeGreaterThan(0);
    });
  });
});
