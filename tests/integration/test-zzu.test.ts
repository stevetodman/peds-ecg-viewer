/** Fixture-level measurement contract checks for all ZZU records. */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { ageToDays, getAgeGroup } from '../../src/data/ageGroups';
import { calculateECGMeasurements } from '../../src/signal/analysis/ecg-measurements';

const indexData: Array<{ file: string; age: string }> = JSON.parse(
  readFileSync('./json_ecgs/index.json', 'utf8')
);

function parseZZUAge(age: string): number {
  const match = age.match(/^(\d+(?:\.\d+)?)\s*(yr|mo|days?)$/i);
  if (!match) throw new RangeError(`Unsupported ZZU age: ${age}`);
  return ageToDays(
    Number(match[1]),
    match[2].toLowerCase() === 'yr' ? 'years' : match[2].toLowerCase() === 'mo' ? 'months' : 'days'
  );
}

describe('ZZU measurement fixture contract', () => {
  it('has exactly 120 supported pediatric records', () => {
    expect(indexData).toHaveLength(120);
    for (const entry of indexData) expect(getAgeGroup(parseZZUAge(entry.age))).toBeDefined();
  });

  it('returns finite measured values or explicit null plus provenance for every record', () => {
    for (const entry of indexData) {
      const ecg = JSON.parse(readFileSync(`./json_ecgs/${entry.file}`, 'utf8'));
      const measurements = calculateECGMeasurements(
        ecg.signal.leads.II,
        ecg.signal.leads.I,
        ecg.signal.leads.AVF,
        ecg.signal.sampleRate
      );

      for (const field of ['hr', 'rr', 'pr', 'qrs', 'qt', 'qtc', 'pAxis', 'qrsAxis', 'tAxis'] as const) {
        const value = measurements[field];
        const provenance = measurements.provenance[field];
        expect(provenance).toBeDefined();
        if (value === null) {
          expect(provenance.source).toBe('unavailable');
        } else {
          expect(Number.isFinite(value)).toBe(true);
          expect(['detected', 'derived']).toContain(provenance.source);
        }
      }
    }
  });
});
