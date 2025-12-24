/**
 * Response Parser Tests
 * Tests for AI response parsing and normalization
 */

import { describe, it, expect } from 'vitest';
import { parseAIResponse } from '../../../src/signal/loader/png-digitizer/ai/response-parser';

describe('parseAIResponse', () => {
  describe('JSON extraction', () => {
    it('should parse plain JSON object', () => {
      const response = JSON.stringify({
        grid: { detected: true, type: 'standard', confidence: 0.9 },
        layout: { format: '12-lead', columns: 4, rows: 3 },
        calibration: { found: true, gain: 10, paperSpeed: 25 },
        panels: [],
        imageQuality: { overall: 0.8, resolution: 'high', effectiveDpi: 300 },
      });

      const result = parseAIResponse(response);

      expect(result.grid.detected).toBe(true);
      expect(result.grid.type).toBe('standard');
      expect(result.layout.format).toBe('12-lead');
    });

    it('should extract JSON from markdown code block', () => {
      const response = `Here is the analysis:

\`\`\`json
{
  "grid": { "detected": true, "type": "standard", "confidence": 0.9 },
  "layout": { "format": "12-lead", "columns": 4, "rows": 3 },
  "calibration": { "found": true, "gain": 10, "paperSpeed": 25 },
  "panels": [],
  "imageQuality": { "overall": 0.8, "resolution": "high", "effectiveDpi": 300 }
}
\`\`\`

That's the result.`;

      const result = parseAIResponse(response);

      expect(result.grid.detected).toBe(true);
      expect(result.layout.format).toBe('12-lead');
    });

    it('should extract JSON from code block without json label', () => {
      const response = `\`\`\`
{
  "grid": { "detected": false, "type": "none" },
  "layout": { "format": "unknown" },
  "calibration": { "found": false },
  "panels": [],
  "imageQuality": { "overall": 0.5 }
}
\`\`\``;

      const result = parseAIResponse(response);

      expect(result.grid.detected).toBe(false);
      expect(result.grid.type).toBe('none');
    });

    it('should extract JSON object from mixed text', () => {
      const response = `The image shows a 12-lead ECG. Here is the analysis: {"grid": {"detected": true}, "layout": {"format": "12-lead"}, "calibration": {}, "panels": [], "imageQuality": {}} end of analysis.`;

      const result = parseAIResponse(response);

      expect(result.grid.detected).toBe(true);
      expect(result.layout.format).toBe('12-lead');
    });

    it('should throw error for invalid JSON', () => {
      const response = 'This is not JSON at all';

      expect(() => parseAIResponse(response)).toThrow('Failed to parse AI response as JSON');
    });

    it('should throw error for malformed JSON', () => {
      const response = '{ "grid": { "detected": true, }';

      expect(() => parseAIResponse(response)).toThrow('Failed to parse AI response as JSON');
    });
  });

  describe('Grid parsing', () => {
    it('should parse complete grid analysis', () => {
      const response = JSON.stringify({
        grid: {
          detected: true,
          type: 'standard',
          backgroundColor: '#FFF4F4',
          thinLineColor: '#FFC0C0',
          thickLineColor: '#E0A0A0',
          estimatedDpi: 300,
          pxPerMm: 11.8,
          smallBoxPx: 11.8,
          largeBoxPx: 59,
          rotation: 0.5,
          confidence: 0.95,
        },
        layout: {},
        calibration: {},
        panels: [],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.grid.detected).toBe(true);
      expect(result.grid.type).toBe('standard');
      expect(result.grid.backgroundColor).toBe('#FFF4F4');
      expect(result.grid.pxPerMm).toBe(11.8);
      expect(result.grid.rotation).toBe(0.5);
      expect(result.grid.confidence).toBe(0.95);
    });

    it('should use defaults for missing grid fields', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {},
        panels: [],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.grid.detected).toBe(false);
      expect(result.grid.type).toBe('unknown');
      expect(result.grid.rotation).toBe(0);
      expect(result.grid.confidence).toBe(0.5); // default confidence
    });

    it('should handle null grid', () => {
      const response = JSON.stringify({
        grid: null,
        layout: {},
        calibration: {},
        panels: [],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.grid.detected).toBe(false);
      expect(result.grid.type).toBe('unknown');
    });

    it('should validate grid type values', () => {
      const validTypes = ['standard', 'fine', 'coarse', 'none', 'unknown'];

      for (const type of validTypes) {
        const response = JSON.stringify({
          grid: { type },
          layout: {},
          calibration: {},
          panels: [],
          imageQuality: {},
        });

        const result = parseAIResponse(response);
        expect(result.grid.type).toBe(type);
      }
    });

    it('should default invalid grid type to unknown', () => {
      const response = JSON.stringify({
        grid: { type: 'invalid_type' },
        layout: {},
        calibration: {},
        panels: [],
        imageQuality: {},
      });

      const result = parseAIResponse(response);
      expect(result.grid.type).toBe('unknown');
    });
  });

  describe('Layout parsing', () => {
    it('should parse complete layout analysis', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {
          format: '12-lead',
          columns: 4,
          rows: 3,
          hasRhythmStrips: true,
          rhythmStripCount: 3,
          estimatedDuration: 10,
          imageWidth: 3300,
          imageHeight: 2550,
          gridBounds: { x: 86, y: 300, width: 3128, height: 1800 },
          confidence: 0.92,
        },
        calibration: {},
        panels: [],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.layout.format).toBe('12-lead');
      expect(result.layout.columns).toBe(4);
      expect(result.layout.rows).toBe(3);
      expect(result.layout.hasRhythmStrips).toBe(true);
      expect(result.layout.rhythmStripCount).toBe(3);
      expect(result.layout.gridBounds).toEqual({ x: 86, y: 300, width: 3128, height: 1800 });
    });

    it('should use defaults for missing layout fields', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {},
        panels: [],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.layout.columns).toBe(4);
      expect(result.layout.rows).toBe(3);
      expect(result.layout.hasRhythmStrips).toBe(false);
      expect(result.layout.imageWidth).toBe(0);
      expect(result.layout.imageHeight).toBe(0);
    });

    it('should validate layout format values', () => {
      const validFormats = ['12-lead', '15-lead', '6x2', 'single-strip', 'rhythm-only', 'unknown'];

      for (const format of validFormats) {
        const response = JSON.stringify({
          grid: {},
          layout: { format },
          calibration: {},
          panels: [],
          imageQuality: {},
        });

        const result = parseAIResponse(response);
        expect(result.layout.format).toBe(format);
      }
    });
  });

  describe('Calibration parsing', () => {
    it('should parse complete calibration analysis', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {
          found: true,
          location: { x: 70, y: 400 },
          heightPx: 118,
          widthPx: 59,
          gain: 10,
          paperSpeed: 25,
          gainSource: 'calibration_pulse',
          speedSource: 'text_label',
          confidence: 0.88,
        },
        panels: [],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.calibration.found).toBe(true);
      expect(result.calibration.location).toEqual({ x: 70, y: 400 });
      expect(result.calibration.heightPx).toBe(118);
      expect(result.calibration.gain).toBe(10);
      expect(result.calibration.gainSource).toBe('calibration_pulse');
      expect(result.calibration.speedSource).toBe('text_label');
    });

    it('should use defaults for missing calibration', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {},
        panels: [],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.calibration.found).toBe(false);
      expect(result.calibration.gain).toBe(10);
      expect(result.calibration.paperSpeed).toBe(25);
      expect(result.calibration.gainSource).toBe('standard_assumed');
      expect(result.calibration.speedSource).toBe('standard_assumed');
    });
  });

  describe('Panel parsing', () => {
    it('should parse array of panels', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {},
        panels: [
          {
            id: 'panel_0_0',
            lead: 'I',
            leadSource: 'text_label',
            bounds: { x: 86, y: 300, width: 780, height: 295 },
            baselineY: 447,
            row: 0,
            col: 0,
            isRhythmStrip: false,
            timeRange: { startSec: 0, endSec: 2.5 },
            labelConfidence: 0.98,
          },
          {
            id: 'panel_0_1',
            lead: 'aVR',
            bounds: { x: 866, y: 300, width: 780, height: 295 },
            row: 0,
            col: 1,
          },
        ],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.panels).toHaveLength(2);
      expect(result.panels[0].lead).toBe('I');
      expect(result.panels[0].bounds).toEqual({ x: 86, y: 300, width: 780, height: 295 });
      expect(result.panels[0].baselineY).toBe(447);
      expect(result.panels[1].lead).toBe('aVR');
    });

    it('should generate panel IDs if missing', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {},
        panels: [
          { lead: 'I', bounds: { x: 0, y: 0, width: 100, height: 100 } },
          { lead: 'II', bounds: { x: 100, y: 0, width: 100, height: 100 } },
        ],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.panels[0].id).toBe('panel_0');
      expect(result.panels[1].id).toBe('panel_1');
    });

    it('should calculate baseline from bounds if missing', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {},
        panels: [
          { lead: 'I', bounds: { x: 0, y: 100, width: 200, height: 100 } },
        ],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      // baselineY should be center of bounds: 100 + 100/2 = 150
      expect(result.panels[0].baselineY).toBe(150);
    });

    it('should return empty array for non-array panels', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {},
        panels: 'not an array',
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.panels).toEqual([]);
    });

    it('should return empty array for null panels', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {},
        panels: null,
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.panels).toEqual([]);
    });
  });

  describe('Lead name normalization', () => {
    it('should normalize lowercase lead names', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {},
        panels: [
          { lead: 'i', bounds: { x: 0, y: 0, width: 100, height: 100 } },
          { lead: 'ii', bounds: { x: 0, y: 0, width: 100, height: 100 } },
          { lead: 'v1', bounds: { x: 0, y: 0, width: 100, height: 100 } },
        ],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.panels[0].lead).toBe('I');
      expect(result.panels[1].lead).toBe('II');
      expect(result.panels[2].lead).toBe('V1');
    });

    it('should normalize augmented lead names', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {},
        panels: [
          { lead: 'avr', bounds: { x: 0, y: 0, width: 100, height: 100 } },
          { lead: 'AVL', bounds: { x: 0, y: 0, width: 100, height: 100 } },
          { lead: 'Avf', bounds: { x: 0, y: 0, width: 100, height: 100 } },
        ],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.panels[0].lead).toBe('aVR');
      expect(result.panels[1].lead).toBe('aVL');
      expect(result.panels[2].lead).toBe('aVF');
    });

    it('should accept all valid lead names', () => {
      const validLeads = [
        'I', 'II', 'III', 'aVR', 'aVL', 'aVF',
        'V1', 'V2', 'V3', 'V4', 'V5', 'V6',
        'V3R', 'V4R', 'V7',
      ];

      const panels = validLeads.map((lead) => ({
        lead,
        bounds: { x: 0, y: 0, width: 100, height: 100 },
      }));

      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {},
        panels,
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      validLeads.forEach((lead, idx) => {
        expect(result.panels[idx].lead).toBe(lead);
      });
    });

    it('should return null for invalid lead names', () => {
      const response = JSON.stringify({
        grid: {},
        // Use non-standard layout (rows=4) to prevent fillMissingLeads from overwriting null leads
        layout: { rows: 4, columns: 3 },
        calibration: {},
        panels: [
          { lead: 'InvalidLead', bounds: { x: 0, y: 0, width: 100, height: 100 } },
          { lead: 'V99', bounds: { x: 0, y: 0, width: 100, height: 100 } },
          { lead: '', bounds: { x: 0, y: 0, width: 100, height: 100 } },
        ],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.panels[0].lead).toBeNull();
      expect(result.panels[1].lead).toBeNull();
      expect(result.panels[2].lead).toBeNull();
    });
  });

  describe('Image quality parsing', () => {
    it('should parse complete image quality', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {},
        panels: [],
        imageQuality: {
          overall: 0.85,
          resolution: 'high',
          effectiveDpi: 300,
          issues: [
            {
              type: 'annotations',
              severity: 'minor',
              description: 'QRS markers visible',
            },
            {
              type: 'jpeg_artifacts',
              severity: 'moderate',
              description: 'Compression artifacts detected',
              location: { x: 100, y: 200, width: 50, height: 50 },
            },
          ],
        },
      });

      const result = parseAIResponse(response);

      expect(result.imageQuality.overall).toBe(0.85);
      expect(result.imageQuality.resolution).toBe('high');
      expect(result.imageQuality.effectiveDpi).toBe(300);
      expect(result.imageQuality.issues).toHaveLength(2);
      expect(result.imageQuality.issues[0].type).toBe('annotations');
      expect(result.imageQuality.issues[1].location).toEqual({ x: 100, y: 200, width: 50, height: 50 });
    });

    it('should filter out issues with invalid types', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {},
        panels: [],
        imageQuality: {
          issues: [
            { type: 'valid_type_not', severity: 'minor', description: 'Invalid' },
            { type: 'noise', severity: 'minor', description: 'Valid' },
          ],
        },
      });

      const result = parseAIResponse(response);

      expect(result.imageQuality.issues).toHaveLength(1);
      expect(result.imageQuality.issues[0].type).toBe('noise');
    });

    it('should use defaults for missing image quality', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {},
        panels: [],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.imageQuality.overall).toBe(0.5);
      expect(result.imageQuality.resolution).toBe('medium');
      expect(result.imageQuality.effectiveDpi).toBe(96);
      expect(result.imageQuality.issues).toEqual([]);
    });
  });

  describe('Confidence clamping', () => {
    it('should clamp confidence values to 0-1 range', () => {
      const response = JSON.stringify({
        grid: { confidence: 1.5 },
        layout: { confidence: -0.5 },
        calibration: { confidence: 2.0 },
        panels: [
          { lead: 'I', bounds: { x: 0, y: 0, width: 100, height: 100 }, labelConfidence: 10 },
        ],
        imageQuality: { overall: -1 },
      });

      const result = parseAIResponse(response);

      expect(result.grid.confidence).toBe(1);
      expect(result.layout.confidence).toBe(0);
      expect(result.calibration.confidence).toBe(1);
      expect(result.panels[0].labelConfidence).toBe(1);
      expect(result.imageQuality.overall).toBe(0);
    });

    it('should default missing confidence to 0.5', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {},
        panels: [],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.grid.confidence).toBe(0.5);
      expect(result.layout.confidence).toBe(0.5);
      expect(result.calibration.confidence).toBe(0.5);
    });
  });

  describe('Notes parsing', () => {
    it('should parse string array notes', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {},
        panels: [],
        imageQuality: {},
        notes: ['Note 1', 'Note 2', 'Note 3'],
      });

      const result = parseAIResponse(response);

      expect(result.notes).toEqual(['Note 1', 'Note 2', 'Note 3']);
    });

    it('should filter out non-string notes', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {},
        panels: [],
        imageQuality: {},
        notes: ['Valid note', 123, null, 'Another valid note', { obj: true }],
      });

      const result = parseAIResponse(response);

      expect(result.notes).toEqual(['Valid note', 'Another valid note']);
    });

    it('should return empty array for missing notes', () => {
      const response = JSON.stringify({
        grid: {},
        layout: {},
        calibration: {},
        panels: [],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.notes).toEqual([]);
    });
  });

  describe('Number parsing', () => {
    it('should parse string numbers', () => {
      const response = JSON.stringify({
        grid: { pxPerMm: '11.8', estimatedDpi: '300' },
        layout: { columns: '4', rows: '3' },
        calibration: { gain: '10' },
        panels: [],
        imageQuality: { effectiveDpi: '150' },
      });

      const result = parseAIResponse(response);

      expect(result.grid.pxPerMm).toBe(11.8);
      expect(result.grid.estimatedDpi).toBe(300);
      expect(result.layout.columns).toBe(4);
      expect(result.calibration.gain).toBe(10);
      expect(result.imageQuality.effectiveDpi).toBe(150);
    });

    it('should handle NaN values', () => {
      const response = JSON.stringify({
        grid: { pxPerMm: 'not a number' },
        layout: { columns: NaN },
        calibration: {},
        panels: [],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.grid.pxPerMm).toBeUndefined();
      expect(result.layout.columns).toBe(4); // default
    });
  });

  describe('Bounds parsing', () => {
    it('should parse complete bounds', () => {
      const response = JSON.stringify({
        grid: {},
        layout: { gridBounds: { x: 10, y: 20, width: 100, height: 200 } },
        calibration: {},
        panels: [],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.layout.gridBounds).toEqual({ x: 10, y: 20, width: 100, height: 200 });
    });

    it('should return undefined for incomplete bounds', () => {
      const response = JSON.stringify({
        grid: {},
        layout: { gridBounds: { x: 10, y: 20 } }, // missing width/height
        calibration: {},
        panels: [],
        imageQuality: {},
      });

      const result = parseAIResponse(response);

      expect(result.layout.gridBounds).toBeUndefined();
    });
  });
});
