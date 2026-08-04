import { describe, expect, it } from 'vitest';
import {
  intakeECGScreenshot,
  requireValidatedIntake,
  type LocalDigitizationEvidence,
} from '../../../src/signal/loader/png-digitizer/intake';

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0, 0, 6, 0x40, 0, 0, 3, 0x84,
]);

const completeEvidence: LocalDigitizationEvidence = {
  image: { width: 1600, height: 900 },
  grid: { detected: true, confidence: 0.9 },
  calibration: { detected: true, confidence: 0.9 },
  trace: { detected: true, confidence: 0.9, pointCount: 1200 },
};

describe('local ECG screenshot intake', () => {
  it('accepts a local image only when all digitization evidence is present', async () => {
    const intake = await intakeECGScreenshot({
      name: 'ecg.png',
      type: 'image/png',
      content: pngBytes,
      lastModified: 123,
    }, completeEvidence);

    expect(intake.state).toBe('accepted');
    expect(intake.validatedForDigitization).toBe(true);
    expect(intake.reasons).toEqual([]);
    expect(intake.provenance).toMatchObject({
      name: 'ecg.png',
      declaredType: 'image/png',
      detectedType: 'image/png',
      sizeBytes: pngBytes.byteLength,
      lastModified: 123,
    });
    expect(intake.provenance.sha256).toSatisfy(value => value === undefined || /^[a-f0-9]{64}$/.test(value));
    expect(Object.isFrozen(intake)).toBe(true);
    expect(Object.isFrozen(intake.provenance)).toBe(true);
    expect(requireValidatedIntake(intake)).toBe(intake);
  });

  it('routes valid local content without calibration evidence to manual review', async () => {
    const intake = await intakeECGScreenshot({
      name: 'needs-review.png',
      type: 'image/png',
      content: pngBytes,
    }, {
      ...completeEvidence,
      calibration: { detected: false, confidence: 0 },
    });

    expect(intake.state).toBe('manual-review');
    expect(intake.validatedForDigitization).toBe(false);
    expect(intake.reasons).toEqual(['calibration_evidence_missing']);
    expect(() => requireValidatedIntake(intake)).toThrow('not validated');
  });

  it('rejects unsupported bytes without treating them as a reviewable image', async () => {
    const intake = await intakeECGScreenshot({
      name: 'not-an-ecg.txt',
      type: 'text/plain',
      content: new TextEncoder().encode('not an image'),
    }, completeEvidence);

    expect(intake.state).toBe('rejected');
    expect(intake.validatedForDigitization).toBe(false);
    expect(intake.reasons).toEqual(['unsupported_content']);
  });
});
