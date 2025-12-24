/**
 * Tests for Brugada pattern detection
 */

import { describe, it, expect } from 'vitest';
import { analyzeBrugada, hasPossibleBrugada } from '../../../src/interpretation/analyzers/brugada-analyzer';
import { ageToDays } from '../../../src/data/ageGroups';

describe('Brugada Pattern Analyzer', () => {
  describe('Type 1 (Coved) Pattern Detection', () => {
    it('should detect Type 1 Brugada with coved ST and negative T', () => {
      const ageDays = ageToDays(12, 'years');
      const findings = analyzeBrugada(
        {
          stElevationV1: 2.5,     // >=2mm
          stElevationV2: 2.0,
          stMorphology: 'coved',
          tWaveV1: 'negative',
          tWaveV2: 'negative',
        },
        ageDays
      );

      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe('BRUGADA_PATTERN');
      expect(findings[0].severity).toBe('abnormal');
      expect(findings[0].statement).toContain('Type 1');
      expect(findings[0].statement).toContain('coved');
      expect(findings[0].clinicalNote).toContain('DIAGNOSTIC');
      expect(findings[0].clinicalNote).toContain('ICD evaluation');
    });

    it('should detect Type 1 with high confidence when all criteria met', () => {
      const ageDays = ageToDays(15, 'years');
      const findings = analyzeBrugada(
        {
          stElevationV1: 3.0,
          stMorphology: 'coved',
          tWaveV1: 'negative',
        },
        ageDays
      );

      expect(findings).toHaveLength(1);
      expect(findings[0].confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('should still detect Type 1 without negative T (lower confidence)', () => {
      const ageDays = ageToDays(10, 'years');
      const findings = analyzeBrugada(
        {
          stElevationV1: 2.5,
          stMorphology: 'coved',
          tWaveV1: 'positive', // Not classic but still coved morphology
        },
        ageDays
      );

      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe('BRUGADA_PATTERN');
      // Lower confidence without negative T
      expect(findings[0].confidence).toBe(0.7);
    });
  });

  describe('Type 2 (Saddleback) Pattern Detection', () => {
    it('should detect Type 2 Brugada with saddleback ST and positive T', () => {
      const ageDays = ageToDays(14, 'years');
      const findings = analyzeBrugada(
        {
          stElevationV1: 2.2,
          stElevationV2: 2.5,
          stMorphology: 'saddleback',
          tWaveV1: 'positive',
          tWaveV2: 'positive',
        },
        ageDays
      );

      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe('BRUGADA_PATTERN');
      expect(findings[0].severity).toBe('borderline');
      expect(findings[0].statement).toContain('Type 2');
      expect(findings[0].statement).toContain('saddleback');
      expect(findings[0].clinicalNote).toContain('NOT diagnostic');
      expect(findings[0].clinicalNote).toContain('provocative testing');
    });

    it('should detect Type 2 with biphasic T waves', () => {
      const ageDays = ageToDays(16, 'years');
      const findings = analyzeBrugada(
        {
          stElevationV1: 2.3,
          stMorphology: 'saddleback',
          tWaveV1: 'biphasic',
        },
        ageDays
      );

      expect(findings).toHaveLength(1);
      expect(findings[0].statement).toContain('Type 2');
    });
  });

  describe('ST Elevation with RBBB Pattern', () => {
    it('should flag ST elevation with RBBB as possible Brugada', () => {
      const ageDays = ageToDays(12, 'years');
      const findings = analyzeBrugada(
        {
          stElevationV1: 2.5,
          stElevationV2: 1.5,
          stMorphology: 'normal', // Not clearly coved or saddleback
          rbbbPattern: true,
        },
        ageDays
      );

      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe('ST_ELEVATION');
      expect(findings[0].statement).toContain('RBBB pattern');
      expect(findings[0].statement).toContain('consider Brugada');
    });
  });

  describe('No Pattern / Normal Findings', () => {
    it('should return no findings for normal ST segments', () => {
      const ageDays = ageToDays(10, 'years');
      const findings = analyzeBrugada(
        {
          stElevationV1: 0.5,    // Less than 2mm
          stElevationV2: 0.3,
          stMorphology: 'normal',
          tWaveV1: 'negative',
        },
        ageDays
      );

      expect(findings).toHaveLength(0);
    });

    it('should return no findings when no ST data provided', () => {
      const ageDays = ageToDays(10, 'years');
      const findings = analyzeBrugada({}, ageDays);

      expect(findings).toHaveLength(0);
    });

    it('should not detect Brugada with ST elevation but normal morphology', () => {
      const ageDays = ageToDays(10, 'years');
      const findings = analyzeBrugada(
        {
          stElevationV1: 2.5,
          stMorphology: 'normal',
          // No RBBB pattern
        },
        ageDays
      );

      // Normal morphology without RBBB should not trigger Brugada finding
      expect(findings).toHaveLength(0);
    });
  });

  describe('hasPossibleBrugada helper', () => {
    it('should return true for significant ST elevation with coved pattern', () => {
      const result = hasPossibleBrugada({
        stElevationV1: 2.5,
        stMorphology: 'coved',
      });

      expect(result).toBe(true);
    });

    it('should return true for significant ST elevation with saddleback pattern', () => {
      const result = hasPossibleBrugada({
        stElevationV1: 2.0,
        stMorphology: 'saddleback',
      });

      expect(result).toBe(true);
    });

    it('should return false for normal morphology', () => {
      const result = hasPossibleBrugada({
        stElevationV1: 2.5,
        stMorphology: 'normal',
      });

      expect(result).toBe(false);
    });

    it('should return false for insufficient ST elevation', () => {
      const result = hasPossibleBrugada({
        stElevationV1: 1.5,
        stMorphology: 'coved',
      });

      expect(result).toBe(false);
    });
  });

  describe('Integration with interpretECG', () => {
    it('should include Brugada findings in full interpretation', async () => {
      const { interpretECG } = await import('../../../src/interpretation');
      const ageDays = ageToDays(14, 'years');

      const result = interpretECG(
        {
          measurements: {
            hr: 70,
            rr: 857,
            pr: 160,
            qrs: 100,
            qt: 380,
            qtc: 410,
            pAxis: 60,
            qrsAxis: 50,
            tAxis: 40,
          },
          brugada: {
            stElevationV1: 2.5,
            stElevationV2: 2.0,
            stMorphology: 'coved',
            tWaveV1: 'negative',
          },
        },
        ageDays
      );

      const brugadaFinding = result.findings.find(f => f.code === 'BRUGADA_PATTERN');
      expect(brugadaFinding).toBeDefined();
      expect(brugadaFinding?.severity).toBe('abnormal');
      expect(result.summary.conclusion).toBe('Abnormal ECG');
    });
  });

  describe('Age-Independence', () => {
    it('should use same criteria for all ages', () => {
      const infantDays = 180;
      const childDays = ageToDays(8, 'years');
      const teenDays = ageToDays(16, 'years');

      const input = {
        stElevationV1: 2.5,
        stMorphology: 'coved' as const,
        tWaveV1: 'negative' as const,
      };

      const infantFindings = analyzeBrugada(input, infantDays);
      const childFindings = analyzeBrugada(input, childDays);
      const teenFindings = analyzeBrugada(input, teenDays);

      // All should detect Brugada with same criteria
      expect(infantFindings).toHaveLength(1);
      expect(childFindings).toHaveLength(1);
      expect(teenFindings).toHaveLength(1);

      // All should have same severity
      expect(infantFindings[0].severity).toBe(childFindings[0].severity);
      expect(childFindings[0].severity).toBe(teenFindings[0].severity);
    });
  });
});
