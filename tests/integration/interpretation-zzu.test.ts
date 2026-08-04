/**
 * Safety integration test for the complete ZZU fixture set.
 *
 * Fixture category labels are not an independent clinical reference standard.
 * These assertions deliberately test data-flow and safe-failure behavior, not
 * diagnostic sensitivity/specificity or sinus-rhythm classification.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { ageToDays, getAgeGroup } from '../../src/data/ageGroups';
import { calculateECGMeasurements } from '../../src/signal/analysis/ecg-measurements';
import { interpretECG, type ECGMeasurements, type InterpretationInput } from '../../src/interpretation';

const indexData: Array<{ file: string; age: string }> = JSON.parse(
  readFileSync('./json_ecgs/index.json', 'utf8')
);

function parseZZUAge(age: string): number {
  const match = age.match(/^(\d+(?:\.\d+)?)\s*(yr|mo|days?)$/i);
  if (!match) throw new RangeError(`Unsupported ZZU age: ${age}`);
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  return ageToDays(value, unit === 'yr' ? 'years' : unit === 'mo' ? 'months' : 'days');
}

function loadAndMeasure(filename: string) {
  const ecgData = JSON.parse(readFileSync(`./json_ecgs/${filename}`, 'utf8'));
  const { leads, sampleRate } = ecgData.signal;
  return calculateECGMeasurements(leads.II, leads.I, leads.AVF, sampleRate);
}

function asInput(measurements: ReturnType<typeof calculateECGMeasurements>): InterpretationInput {
  const clinicalMeasurements: ECGMeasurements = {
    hr: measurements.hr,
    rr: measurements.rr,
    pr: measurements.pr,
    qrs: measurements.qrs,
    qt: measurements.qt,
    qtc: measurements.qtc,
    pAxis: measurements.pAxis,
    qrsAxis: measurements.qrsAxis,
    tAxis: measurements.tAxis,
    provenance: measurements.provenance,
  };
  return { measurements: clinicalMeasurements };
}

describe('ZZU ECG interpretation safety integration', () => {
  it('contains the complete 120-record pediatric fixture set', () => {
    expect(indexData).toHaveLength(120);
    for (const entry of indexData) expect(getAgeGroup(parseZZUAge(entry.age))).toBeDefined();
  });

  it('processes every record without fabricating unavailable measurements or rhythm evidence', () => {
    for (const entry of indexData) {
      const measurements = loadAndMeasure(entry.file);
      const interpretation = interpretECG(asInput(measurements), parseZZUAge(entry.age));

      expect(interpretation.measurementProvenance).toEqual(measurements.provenance);
      expect(interpretation.rhythm.origin).toBe('unknown');
      expect(interpretation.rhythm.regular).toBeNull();
      expect(interpretation.rhythm.pWaveMorphology).toBe('unknown');
      expect(interpretation.rhythm.avRelationship).toBe('unknown');
      expect(interpretation.findings.some(f => f.code === 'ANALYSIS_INCOMPLETE')).toBe(true);
      expect(interpretation.summary.conclusion).not.toBe('Normal ECG');

      for (const [field, evidence] of Object.entries(measurements.provenance)) {
        if (evidence.source !== 'unavailable') continue;
        expect(measurements[field as keyof typeof measurements]).toBeNull();
      }
    }
  });
});
