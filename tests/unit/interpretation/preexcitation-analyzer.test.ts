/**
 * Tests for pre-excitation (WPW) detection
 */

import { describe, it, expect } from 'vitest';
import { analyzePreexcitation } from '../../../src/interpretation/analyzers/preexcitation-analyzer';
import { ageToDays } from '../../../src/data/ageGroups';

describe('Pre-excitation (WPW) Analyzer', () => {
  describe('Classic WPW Pattern Detection', () => {
    it('should detect classic WPW with short PR, wide QRS, and delta wave', () => {
      const ageDays = ageToDays(10, 'years');
      const findings = analyzePreexcitation(
        {
          pr: 90,         // Short PR (<120ms)
          qrs: 130,       // Wide QRS (>110ms)
          deltaWaveDetected: true,
          deltaWaveDuration: 35,
        },
        ageDays
      );

      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe('VENTRICULAR_PREEXCITATION');
      expect(findings[0].severity).toBe('abnormal');
      expect(findings[0].statement).toContain('pre-excitation pattern');
      expect(findings[0].statement).toContain('delta wave reported');
      expect(findings[0].clinicalNote).toContain('does not diagnose');
    });

    it('should use age-adjusted thresholds for infants', () => {
      const ageDays = 180; // 6 months

      // For infants, short PR is <100ms and wide QRS is >100ms
      const findings = analyzePreexcitation(
        {
          pr: 85,         // Short for infant (<100ms)
          qrs: 110,       // Wide for infant (>100ms)
          deltaWaveDetected: true,
        },
        ageDays
      );

      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe('VENTRICULAR_PREEXCITATION');
    });

    it('should use stricter thresholds for older children', () => {
      const ageDays = ageToDays(15, 'years');

      // For adolescents, short PR is <120ms and wide QRS is >110ms
      const findings = analyzePreexcitation(
        {
          pr: 115,        // Short for older child (<120ms)
          qrs: 115,       // Wide (>110ms)
          deltaWaveDetected: true,
        },
        ageDays
      );

      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe('VENTRICULAR_PREEXCITATION');
    });
  });

  describe('Possible WPW (No Delta Wave Data)', () => {
    it('should detect possible WPW when delta wave not assessed', () => {
      const ageDays = ageToDays(8, 'years');
      const findings = analyzePreexcitation(
        {
          pr: 95,
          qrs: 120,
          // deltaWaveDetected not provided
        },
        ageDays
      );

      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe('POSSIBLE_PREEXCITATION');
      expect(findings[0].severity).toBe('borderline');
      expect(findings[0].statement).toContain('pre-excitation cannot be assessed');
      expect(findings[0].confidence).toBeLessThan(0.8);
    });
  });

  describe('Very Short PR (LGL-like Pattern)', () => {
    it('should flag very short PR without wide QRS', () => {
      const ageDays = ageToDays(5, 'years');
      const findings = analyzePreexcitation(
        {
          pr: 70,         // Very short
          qrs: 75,        // Normal QRS
          deltaWaveDetected: false,
        },
        ageDays
      );

      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe('PR_SHORT');
      expect(findings[0].statement).toContain('Very short PR');
      expect(findings[0].clinicalNote).toContain('does not establish');
    });

    it('should not flag mildly short PR without wide QRS', () => {
      const ageDays = ageToDays(5, 'years');
      const findings = analyzePreexcitation(
        {
          pr: 95,         // Mildly short but not very short
          qrs: 70,        // Normal QRS
          deltaWaveDetected: false,
        },
        ageDays
      );

      // Should not produce LGL finding for mildly short PR
      expect(findings).toHaveLength(0);
    });
  });

  describe('Atypical Pre-excitation (Mahaim-like)', () => {
    it('should detect delta wave with normal PR (Mahaim fiber)', () => {
      const ageDays = ageToDays(12, 'years');
      const findings = analyzePreexcitation(
        {
          pr: 150,        // Normal PR
          qrs: 130,       // Wide QRS
          deltaWaveDetected: true,
        },
        ageDays
      );

      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe('POSSIBLE_PREEXCITATION');
      expect(findings[0].statement).toContain('morphology review required');
      expect(findings[0].evidence?.pattern).toBe('discordant_preexcitation_features');
    });
  });

  describe('Normal Findings', () => {
    it('should return no findings for normal PR and QRS', () => {
      const ageDays = ageToDays(8, 'years');
      const findings = analyzePreexcitation(
        {
          pr: 140,
          qrs: 80,
          deltaWaveDetected: false,
        },
        ageDays
      );

      expect(findings).toHaveLength(0);
    });

    it('should return no findings when PR is short but QRS normal and no delta wave', () => {
      const ageDays = ageToDays(8, 'years');
      const findings = analyzePreexcitation(
        {
          pr: 100,        // Short
          qrs: 80,        // Normal
          deltaWaveDetected: false,
        },
        ageDays
      );

      // Mildly short PR without wide QRS or delta wave is not flagged
      expect(findings).toHaveLength(0);
    });
  });

  describe('Integration with interpretECG', () => {
    it('should include WPW findings in full interpretation', async () => {
      const { interpretECG } = await import('../../../src/interpretation');
      const ageDays = ageToDays(10, 'years');

      const result = interpretECG(
        {
          measurements: {
            hr: 100,
            rr: 600,
            pr: 90,       // Short
            qrs: 130,     // Wide
            qt: 350,
            qtc: 430,
            pAxis: 60,
            qrsAxis: 50,
            tAxis: 40,
          },
          preexcitation: {
            deltaWaveDetected: true,
            deltaWaveDuration: 30,
          },
        },
        ageDays
      );

      const wpwFinding = result.findings.find(f => f.code === 'VENTRICULAR_PREEXCITATION');
      expect(wpwFinding).toBeDefined();
      expect(wpwFinding?.severity).toBe('abnormal');
      expect(result.summary.conclusion).toBe('Abnormal ECG');
    });
  });
});
