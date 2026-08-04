import { describe, expect, it } from 'vitest';
import { getAgeGroup } from '../../../src/data/ageGroups';
import { classifyValue } from '../../../src/data/pediatricNormals';
import {
  calculateECGMeasurements,
  calculatePRInterval,
  calculateQRSDuration,
  calculateQTInterval,
  calculateQTc,
} from '../../../src/signal/analysis/ecg-measurements';
import { interpretECG } from '../../../src/interpretation';

describe('clinical safety contracts', () => {
  it('rejects unsupported pediatric ages rather than clamping them into a reference group', () => {
    expect(() => getAgeGroup(-0.01)).toThrow(RangeError);
    expect(() => getAgeGroup(6575)).toThrow(RangeError);
    expect(() => getAgeGroup(Number.NaN)).toThrow(RangeError);
  });

  it('widens and contracts p2/p98 by interval span, including zero and negative limits', () => {
    const zeroBound = { p2: 0, p50: 10, p98: 20 };
    expect(classifyValue(-0.5, zeroBound, 'lenient')).toBe('borderline_low');
    expect(classifyValue(-0.5, zeroBound, 'strict')).toBe('low');

    const signed = { p2: -30, p50: 0, p98: 30 };
    expect(classifyValue(-32, signed, 'lenient')).toBe('borderline_low');
    expect(classifyValue(-32, signed, 'strict')).toBe('low');
    expect(classifyValue(32, signed, 'lenient')).toBe('borderline_high');
    expect(classifyValue(32, signed, 'strict')).toBe('high');
  });

  it('does not fabricate PR, QRS, QT, QTc, P axis, or T axis from inadequate signal evidence', () => {
    expect(calculatePRInterval([], 500, [])).toBeNull();
    expect(calculateQRSDuration([Number.NaN], 500, [])).toBeNull();
    expect(calculateQTInterval([], 500, [], 80)).toBeNull();
    expect(calculateQTc(null, 800)).toBeNull();

    const measurements = calculateECGMeasurements(new Array(500).fill(0), new Array(500).fill(0), new Array(500).fill(0), 500);
    expect(measurements.pr).toBeNull();
    expect(measurements.qrs).toBeNull();
    expect(measurements.qt).toBeNull();
    expect(measurements.qtc).toBeNull();
    expect(measurements.pAxis).toBeNull();
    expect(measurements.tAxis).toBeNull();
    expect(measurements.provenance.pr.source).toBe('unavailable');
    expect(measurements.provenance.pAxis.source).toBe('unavailable');
    expect(measurements.provenance.tAxis.source).toBe('unavailable');
  });

  it('reports incomplete analysis and unknown rhythm rather than a normal or sinus interpretation', () => {
    const result = interpretECG({
      measurements: {
        hr: null, rr: null, pr: null, qrs: null, qt: null, qtc: null,
        pAxis: null, qrsAxis: null, tAxis: null,
      },
    }, 365);

    expect(result.summary.conclusion).toBe('Inconclusive');
    expect(result.findings.some(f => f.code === 'ANALYSIS_INCOMPLETE')).toBe(true);
    expect(result.rhythm.origin).toBe('unknown');
    expect(result.rhythm.regular).toBeNull();
    expect(result.rhythm.pWaveMorphology).toBe('unknown');
    expect(result.rhythm.avRelationship).toBe('unknown');
    expect(result.findings.some(f => String(f.code).startsWith('SINUS_'))).toBe(false);
    expect(result.measurementProvenance?.hr.source).toBe('unavailable');
    expect(result.measurementProvenance?.qrsAxis.source).toBe('unavailable');
  });
});
