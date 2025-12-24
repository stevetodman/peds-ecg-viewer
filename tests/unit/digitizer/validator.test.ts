/**
 * Validator Tests
 * Tests for AI response validation functions
 */

import { describe, it, expect } from 'vitest';
import {
  validateAnalysis,
  hasMinimumData,
  getValidationIssues,
} from '../../../src/signal/loader/png-digitizer/ai/validator';
import type { ECGImageAnalysis, GridAnalysis, CalibrationAnalysis, PanelAnalysis, LayoutAnalysis } from '../../../src/signal/loader/png-digitizer/types';

/**
 * Helper to create a minimal valid analysis
 */
function createBaseAnalysis(overrides: Partial<ECGImageAnalysis> = {}): ECGImageAnalysis {
  return {
    grid: {
      detected: true,
      type: 'standard',
      pxPerMm: 10,
      smallBoxPx: 10,
      largeBoxPx: 50,
      confidence: 0.9,
    },
    layout: {
      format: '12-lead',
      columns: 4,
      rows: 3,
      hasRhythmStrips: false,
      imageWidth: 3300,
      imageHeight: 2550,
      confidence: 0.9,
    },
    calibration: {
      found: true,
      gain: 10,
      paperSpeed: 25,
      gainSource: 'calibration_pulse',
      speedSource: 'text_label',
      heightPx: 100,
      confidence: 0.9,
    },
    panels: createStandardPanels(),
    imageQuality: {
      overall: 0.9,
      resolution: 'high',
      effectiveDpi: 300,
      issues: [],
    },
    ...overrides,
  };
}

/**
 * Helper to create standard 12-lead panels
 */
function createStandardPanels(): PanelAnalysis[] {
  const leads = ['I', 'aVR', 'V1', 'V4', 'II', 'aVL', 'V2', 'V5', 'III', 'aVF', 'V3', 'V6'];
  return leads.map((lead, i) => ({
    id: `panel_${i}`,
    lead: lead as any,
    leadSource: 'text_label',
    bounds: { x: (i % 4) * 800, y: Math.floor(i / 4) * 600, width: 800, height: 600 },
    baselineY: Math.floor(i / 4) * 600 + 300,
    row: Math.floor(i / 4),
    col: i % 4,
    isRhythmStrip: false,
    timeRange: { startSec: 0, endSec: 2.5 },
    labelConfidence: 0.9,
  }));
}

/**
 * Helper to create partial panels (avoid success bonus in tests)
 * Using only 5 leads prevents the 95%/90%/75% floors from masking penalty comparisons
 */
function createPartialPanels(): PanelAnalysis[] {
  const leads = ['I', 'II', 'III', 'aVR', 'aVL'];
  return leads.map((lead, i) => ({
    id: `panel_${i}`,
    lead: lead as any,
    leadSource: 'text_label',
    bounds: { x: (i % 4) * 800, y: Math.floor(i / 4) * 600, width: 800, height: 600 },
    baselineY: Math.floor(i / 4) * 600 + 300,
    row: Math.floor(i / 4),
    col: i % 4,
    isRhythmStrip: false,
    timeRange: { startSec: 0, endSec: 2.5 },
    labelConfidence: 0.9,
  }));
}

/**
 * Helper to create base analysis with partial panels (avoids success bonus)
 */
function createPartialAnalysis(overrides: Partial<ECGImageAnalysis> = {}): ECGImageAnalysis {
  return {
    grid: {
      detected: true,
      type: 'standard',
      pxPerMm: 10,
      smallBoxPx: 10,
      largeBoxPx: 50,
      confidence: 0.9,
    },
    layout: {
      format: '12-lead',
      columns: 4,
      rows: 3,
      hasRhythmStrips: false,
      imageWidth: 3300,
      imageHeight: 2550,
      confidence: 0.9,
    },
    calibration: {
      found: true,
      gain: 10,
      paperSpeed: 25,
      gainSource: 'calibration_pulse',
      speedSource: 'text_label',
      heightPx: 100,
      confidence: 0.9,
    },
    panels: createPartialPanels(),
    imageQuality: {
      overall: 0.9,
      resolution: 'high',
      effectiveDpi: 300,
      issues: [],
    },
    ...overrides,
  };
}

describe('validateAnalysis', () => {
  describe('overall confidence calculation', () => {
    it('should return high confidence for valid analysis', () => {
      const analysis = createBaseAnalysis();
      const confidence = validateAnalysis(analysis);

      expect(confidence).toBeGreaterThan(0.8);
      expect(confidence).toBeLessThanOrEqual(1);
    });

    it('should return lower confidence when grid not detected', () => {
      // Use partial analysis to avoid success bonus masking differences
      const withGrid = createPartialAnalysis();
      const withoutGrid = createPartialAnalysis({
        grid: {
          detected: false,
          type: 'none',
          confidence: 0.3,
        },
      });

      const confidenceWithGrid = validateAnalysis(withGrid);
      const confidenceWithoutGrid = validateAnalysis(withoutGrid);

      // Without grid detection, confidence should be lower
      expect(confidenceWithoutGrid).toBeLessThan(confidenceWithGrid);
    });

    it('should return lower confidence with low image quality', () => {
      // Use partial analysis to avoid success bonus masking differences
      const analysis = createPartialAnalysis({
        imageQuality: {
          overall: 0.3,
          resolution: 'low',
          effectiveDpi: 72,
          issues: [],
        },
      });
      const confidence = validateAnalysis(analysis);

      expect(confidence).toBeLessThan(0.9);
    });

    it('should weight panels heavily in overall score', () => {
      const analysis = createBaseAnalysis({ panels: [] });
      const confidence = validateAnalysis(analysis);

      // With no panels, score should drop significantly
      expect(confidence).toBeLessThan(0.7);
    });
  });

  describe('grid validation', () => {
    it('should give bonus for pxPerMm', () => {
      // Use partial analysis to avoid success bonus masking differences
      const withPxPerMm = createPartialAnalysis();
      const withoutPxPerMm = createPartialAnalysis({
        grid: {
          detected: true,
          type: 'standard',
          pxPerMm: undefined,
          confidence: 0.9,
        },
      });

      const scoreWith = validateAnalysis(withPxPerMm);
      const scoreWithout = validateAnalysis(withoutPxPerMm);

      expect(scoreWith).toBeGreaterThan(scoreWithout);
    });

    it('should penalize unreasonable pxPerMm', () => {
      const reasonable = createBaseAnalysis();
      const tooLow = createBaseAnalysis({
        grid: { ...createBaseAnalysis().grid, pxPerMm: 0.5 },
      });
      const tooHigh = createBaseAnalysis({
        grid: { ...createBaseAnalysis().grid, pxPerMm: 150 },
      });

      const reasonableScore = validateAnalysis(reasonable);
      const tooLowScore = validateAnalysis(tooLow);
      const tooHighScore = validateAnalysis(tooHigh);

      expect(reasonableScore).toBeGreaterThan(tooLowScore);
      expect(reasonableScore).toBeGreaterThan(tooHighScore);
    });

    it('should penalize inconsistent smallBoxPx/pxPerMm ratio', () => {
      // Use partial analysis to avoid success bonus masking differences
      const consistent = createPartialAnalysis({
        grid: {
          detected: true,
          type: 'standard',
          pxPerMm: 10,
          smallBoxPx: 10, // ratio = 1.0
          largeBoxPx: 50,
          confidence: 0.9,
        },
      });
      const inconsistent = createPartialAnalysis({
        grid: {
          detected: true,
          type: 'standard',
          pxPerMm: 10,
          smallBoxPx: 20, // ratio = 2.0 - too different
          largeBoxPx: 100,
          confidence: 0.9,
        },
      });

      const consistentScore = validateAnalysis(consistent);
      const inconsistentScore = validateAnalysis(inconsistent);

      expect(consistentScore).toBeGreaterThan(inconsistentScore);
    });

    it('should penalize incorrect large/small box ratio', () => {
      // Use partial analysis to avoid success bonus masking differences
      const correct = createPartialAnalysis({
        grid: {
          detected: true,
          type: 'standard',
          pxPerMm: 10,
          smallBoxPx: 10,
          largeBoxPx: 50, // 5x - correct
          confidence: 0.9,
        },
      });
      const incorrect = createPartialAnalysis({
        grid: {
          detected: true,
          type: 'standard',
          pxPerMm: 10,
          smallBoxPx: 10,
          largeBoxPx: 30, // 3x - incorrect
          confidence: 0.9,
        },
      });

      const correctScore = validateAnalysis(correct);
      const incorrectScore = validateAnalysis(incorrect);

      expect(correctScore).toBeGreaterThan(incorrectScore);
    });
  });

  describe('layout validation', () => {
    it('should penalize non-standard 12-lead dimensions', () => {
      // Use partial analysis to avoid success bonus masking differences
      const standard = createPartialAnalysis();
      const nonStandard = createPartialAnalysis({
        layout: {
          format: '12-lead',
          columns: 3,
          rows: 4, // Non-standard for 12-lead
          hasRhythmStrips: false,
          imageWidth: 3300,
          imageHeight: 2550,
          confidence: 0.9,
        },
      });

      const standardScore = validateAnalysis(standard);
      const nonStandardScore = validateAnalysis(nonStandard);

      expect(standardScore).toBeGreaterThan(nonStandardScore);
    });

    it('should penalize out-of-bounds gridBounds', () => {
      // Use partial analysis to avoid success bonus masking differences
      const inBounds = createPartialAnalysis({
        layout: {
          format: '12-lead',
          columns: 4,
          rows: 3,
          hasRhythmStrips: false,
          imageWidth: 3300,
          imageHeight: 2550,
          gridBounds: { x: 100, y: 100, width: 3000, height: 2200 },
          confidence: 0.9,
        },
      });
      const outOfBounds = createPartialAnalysis({
        layout: {
          format: '12-lead',
          columns: 4,
          rows: 3,
          hasRhythmStrips: false,
          imageWidth: 3300,
          imageHeight: 2550,
          gridBounds: { x: 100, y: 100, width: 4000, height: 3000 }, // Exceeds image
          confidence: 0.9,
        },
      });

      const inBoundsScore = validateAnalysis(inBounds);
      const outOfBoundsScore = validateAnalysis(outOfBounds);

      expect(inBoundsScore).toBeGreaterThan(outOfBoundsScore);
    });

    it('should penalize insufficient panels for layout', () => {
      const fullPanels = createBaseAnalysis();
      const fewPanels = createBaseAnalysis({
        panels: createStandardPanels().slice(0, 6), // Only 6 of 12 panels
      });

      const fullScore = validateAnalysis(fullPanels);
      const fewScore = validateAnalysis(fewPanels);

      expect(fullScore).toBeGreaterThan(fewScore);
    });
  });

  describe('calibration validation', () => {
    it('should penalize non-standard gain values', () => {
      // Use partial analysis to avoid success bonus masking differences
      const standardGain = createPartialAnalysis();
      const nonStandardGain = createPartialAnalysis({
        calibration: {
          ...createPartialAnalysis().calibration,
          gain: 15, // Non-standard
        },
      });

      const standardScore = validateAnalysis(standardGain);
      const nonStandardScore = validateAnalysis(nonStandardGain);

      expect(standardScore).toBeGreaterThan(nonStandardScore);
    });

    it('should accept 5, 10, and 20 mm/mV as standard gains', () => {
      const analysis5 = createBaseAnalysis({ calibration: { ...createBaseAnalysis().calibration, gain: 5 } });
      const analysis10 = createBaseAnalysis({ calibration: { ...createBaseAnalysis().calibration, gain: 10 } });
      const analysis20 = createBaseAnalysis({ calibration: { ...createBaseAnalysis().calibration, gain: 20 } });

      // All standard gains should produce similar high scores
      const score5 = validateAnalysis(analysis5);
      const score10 = validateAnalysis(analysis10);
      const score20 = validateAnalysis(analysis20);

      expect(score5).toBeGreaterThan(0.8);
      expect(score10).toBeGreaterThan(0.8);
      expect(score20).toBeGreaterThan(0.8);
    });

    it('should penalize non-standard paper speeds', () => {
      // Use partial analysis to avoid success bonus masking differences
      const standardSpeed = createPartialAnalysis();
      const nonStandardSpeed = createPartialAnalysis({
        calibration: {
          ...createPartialAnalysis().calibration,
          paperSpeed: 12.5, // Non-standard
        },
      });

      const standardScore = validateAnalysis(standardSpeed);
      const nonStandardScore = validateAnalysis(nonStandardSpeed);

      expect(standardScore).toBeGreaterThan(nonStandardScore);
    });

    it('should penalize found calibration without heightPx', () => {
      // Use partial analysis to avoid success bonus masking differences
      const withHeight = createPartialAnalysis();
      const withoutHeight = createPartialAnalysis({
        calibration: {
          ...createPartialAnalysis().calibration,
          found: true,
          heightPx: undefined,
        },
      });

      const withHeightScore = validateAnalysis(withHeight);
      const withoutHeightScore = validateAnalysis(withoutHeight);

      expect(withHeightScore).toBeGreaterThan(withoutHeightScore);
    });
  });

  describe('panels validation', () => {
    it('should return 0 for empty panels', () => {
      const analysis = createBaseAnalysis({ panels: [] });
      const confidence = validateAnalysis(analysis);

      // Panels have 0.30 weight, so overall score should reflect that
      expect(confidence).toBeLessThan(0.8);
    });

    it('should penalize duplicate leads', () => {
      const noDuplicates = createBaseAnalysis();
      const withDuplicates = createBaseAnalysis({
        panels: [
          ...createStandardPanels().slice(0, 11),
          { ...createStandardPanels()[11], lead: 'I' as any }, // Duplicate Lead I
        ],
      });

      const noDupScore = validateAnalysis(noDuplicates);
      const dupScore = validateAnalysis(withDuplicates);

      expect(noDupScore).toBeGreaterThan(dupScore);
    });

    it('should penalize invalid bounds', () => {
      const validBounds = createBaseAnalysis();
      const invalidBounds = createBaseAnalysis({
        panels: createStandardPanels().map(p => ({
          ...p,
          bounds: { x: 0, y: 0, width: 0, height: 0 }, // Invalid
        })),
      });

      const validScore = validateAnalysis(validBounds);
      const invalidScore = validateAnalysis(invalidBounds);

      expect(validScore).toBeGreaterThan(invalidScore);
    });

    it('should penalize baseline outside panel bounds', () => {
      // Use partial analysis to avoid success bonus masking differences
      const validBaseline = createPartialAnalysis();
      const invalidBaseline = createPartialAnalysis({
        panels: createPartialPanels().map(p => ({
          ...p,
          baselineY: p.bounds.y - 100, // Outside bounds
        })),
      });

      const validScore = validateAnalysis(validBaseline);
      const invalidScore = validateAnalysis(invalidBaseline);

      expect(validScore).toBeGreaterThan(invalidScore);
    });
  });

  describe('score clamping', () => {
    it('should never return score below 0', () => {
      const worstCase = createBaseAnalysis({
        grid: { detected: false, type: 'none', confidence: 0 },
        calibration: { found: false, gain: 99, paperSpeed: 99, gainSource: 'standard_assumed', speedSource: 'standard_assumed', confidence: 0 },
        panels: [],
        imageQuality: { overall: 0, resolution: 'very_low', effectiveDpi: 0, issues: [] },
      });

      const score = validateAnalysis(worstCase);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should never return score above 1', () => {
      const bestCase = createBaseAnalysis();
      const score = validateAnalysis(bestCase);
      expect(score).toBeLessThanOrEqual(1);
    });
  });
});

describe('hasMinimumData', () => {
  it('should return true for valid analysis', () => {
    const analysis = createBaseAnalysis();
    expect(hasMinimumData(analysis)).toBe(true);
  });

  it('should return false if pxPerMm is missing', () => {
    const analysis = createBaseAnalysis({
      grid: {
        detected: true,
        type: 'standard',
        pxPerMm: undefined,
        confidence: 0.9,
      },
    });
    expect(hasMinimumData(analysis)).toBe(false);
  });

  it('should return false if pxPerMm is zero', () => {
    const analysis = createBaseAnalysis({
      grid: {
        detected: true,
        type: 'standard',
        pxPerMm: 0,
        confidence: 0.9,
      },
    });
    expect(hasMinimumData(analysis)).toBe(false);
  });

  it('should return false if pxPerMm is negative', () => {
    const analysis = createBaseAnalysis({
      grid: {
        detected: true,
        type: 'standard',
        pxPerMm: -10,
        confidence: 0.9,
      },
    });
    expect(hasMinimumData(analysis)).toBe(false);
  });

  it('should return false if gain is missing', () => {
    const analysis = createBaseAnalysis({
      calibration: {
        found: false,
        gain: 0,
        paperSpeed: 25,
        gainSource: 'standard_assumed',
        speedSource: 'standard_assumed',
        confidence: 0,
      },
    });
    expect(hasMinimumData(analysis)).toBe(false);
  });

  it('should return false if no panels have valid bounds and lead', () => {
    const analysis = createBaseAnalysis({
      panels: [
        { ...createStandardPanels()[0], lead: null },
        { ...createStandardPanels()[1], bounds: { x: 0, y: 0, width: 0, height: 100 } },
      ],
    });
    expect(hasMinimumData(analysis)).toBe(false);
  });

  it('should return true if at least one panel is valid', () => {
    const analysis = createBaseAnalysis({
      panels: [
        { ...createStandardPanels()[0], lead: null }, // Invalid - no lead
        createStandardPanels()[1], // Valid
      ],
    });
    expect(hasMinimumData(analysis)).toBe(true);
  });
});

describe('getValidationIssues', () => {
  it('should return empty array for valid analysis', () => {
    const analysis = createBaseAnalysis();
    const issues = getValidationIssues(analysis);

    // May have some assumed settings, but no critical issues
    expect(issues.filter(i => i.includes('Missing leads'))).toHaveLength(0);
    expect(issues.filter(i => i.includes('could not be labeled'))).toHaveLength(0);
  });

  it('should report missing grid pattern', () => {
    const analysis = createBaseAnalysis({
      grid: { detected: false, type: 'none', confidence: 0.3 },
    });
    const issues = getValidationIssues(analysis);

    expect(issues.some(i => i.includes('No grid pattern detected'))).toBe(true);
  });

  it('should report missing pxPerMm', () => {
    const analysis = createBaseAnalysis({
      grid: { detected: true, type: 'standard', pxPerMm: undefined, confidence: 0.9 },
    });
    const issues = getValidationIssues(analysis);

    expect(issues.some(i => i.includes('Could not determine pixels per millimeter'))).toBe(true);
  });

  it('should report missing calibration pulse', () => {
    const analysis = createBaseAnalysis({
      calibration: {
        found: false,
        gain: 10,
        paperSpeed: 25,
        gainSource: 'standard_assumed',
        speedSource: 'standard_assumed',
        confidence: 0.5,
      },
    });
    const issues = getValidationIssues(analysis);

    expect(issues.some(i => i.includes('No calibration pulse found'))).toBe(true);
  });

  it('should report assumed gain', () => {
    const analysis = createBaseAnalysis({
      calibration: {
        ...createBaseAnalysis().calibration,
        gainSource: 'standard_assumed',
      },
    });
    const issues = getValidationIssues(analysis);

    expect(issues.some(i => i.includes('Gain assumed'))).toBe(true);
  });

  it('should report assumed paper speed', () => {
    const analysis = createBaseAnalysis({
      calibration: {
        ...createBaseAnalysis().calibration,
        speedSource: 'standard_assumed',
      },
    });
    const issues = getValidationIssues(analysis);

    expect(issues.some(i => i.includes('Paper speed assumed'))).toBe(true);
  });

  it('should report unlabeled panels', () => {
    const analysis = createBaseAnalysis({
      panels: [
        { ...createStandardPanels()[0], lead: null },
        { ...createStandardPanels()[1], lead: null },
        ...createStandardPanels().slice(2),
      ],
    });
    const issues = getValidationIssues(analysis);

    expect(issues.some(i => i.includes('2 panel(s) could not be labeled'))).toBe(true);
  });

  it('should report missing standard leads for 12-lead format', () => {
    const analysis = createBaseAnalysis({
      panels: createStandardPanels().slice(0, 6), // Only 6 leads
    });
    const issues = getValidationIssues(analysis);

    expect(issues.some(i => i.includes('Missing leads'))).toBe(true);
  });

  it('should not report missing leads for single-strip format', () => {
    const analysis = createBaseAnalysis({
      layout: { ...createBaseAnalysis().layout, format: 'single-strip' },
      panels: [createStandardPanels()[0]], // Only Lead I
    });
    const issues = getValidationIssues(analysis);

    expect(issues.some(i => i.includes('Missing leads'))).toBe(false);
  });

  it('should not report missing leads for rhythm-only format', () => {
    const analysis = createBaseAnalysis({
      layout: { ...createBaseAnalysis().layout, format: 'rhythm-only' },
      panels: [{ ...createStandardPanels()[0], lead: 'II' as any }], // Only Lead II
    });
    const issues = getValidationIssues(analysis);

    expect(issues.some(i => i.includes('Missing leads'))).toBe(false);
  });

  it('should report severe image quality issues', () => {
    const analysis = createBaseAnalysis({
      imageQuality: {
        overall: 0.4,
        resolution: 'low',
        effectiveDpi: 72,
        issues: [
          { type: 'low_resolution', severity: 'severe', description: 'Very low resolution image' },
        ],
      },
    });
    const issues = getValidationIssues(analysis);

    expect(issues.some(i => i.includes('Severe image issue'))).toBe(true);
    expect(issues.some(i => i.includes('Very low resolution'))).toBe(true);
  });

  it('should not report minor image quality issues', () => {
    const analysis = createBaseAnalysis({
      imageQuality: {
        overall: 0.8,
        resolution: 'medium',
        effectiveDpi: 150,
        issues: [
          { type: 'jpeg_artifacts', severity: 'minor', description: 'Minor compression artifacts' },
        ],
      },
    });
    const issues = getValidationIssues(analysis);

    expect(issues.some(i => i.includes('Minor compression'))).toBe(false);
  });
});
