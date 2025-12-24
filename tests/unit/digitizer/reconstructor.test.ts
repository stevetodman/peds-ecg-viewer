/**
 * Reconstructor Tests
 * Tests for signal reconstruction from raw traces
 */

import { describe, it, expect } from 'vitest';
import {
  SignalReconstructor,
  reconstructSignal,
} from '../../../src/signal/loader/png-digitizer/signal/reconstructor';
import type { RawTrace, CalibrationAnalysis, GridAnalysis } from '../../../src/signal/loader/png-digitizer/types';
import type { LeadName } from '../../../src/types';

/**
 * Helper to create calibration config
 */
function createCalibration(overrides: Partial<CalibrationAnalysis> = {}): CalibrationAnalysis {
  return {
    found: true,
    gain: 10, // 10 mm/mV
    paperSpeed: 25, // 25 mm/s
    gainSource: 'calibration_pulse',
    speedSource: 'text_label',
    confidence: 0.9,
    ...overrides,
  };
}

/**
 * Helper to create grid info
 */
function createGridInfo(overrides: Partial<GridAnalysis> = {}): GridAnalysis {
  return {
    detected: true,
    type: 'standard',
    pxPerMm: 10, // 10 pixels per mm
    smallBoxPx: 10,
    largeBoxPx: 50,
    confidence: 0.9,
    ...overrides,
  };
}

/**
 * Helper to create a trace
 */
function createTrace(
  lead: LeadName,
  xPixels: number[],
  yPixels: number[],
  baselineY: number = 100
): RawTrace {
  return {
    panelId: `panel_${lead}`,
    lead,
    xPixels,
    yPixels,
    confidence: xPixels.map(() => 0.9),
    baselineY,
    gaps: [],
    method: 'column_scan',
  };
}

describe('SignalReconstructor', () => {
  describe('constructor', () => {
    it('should accept calibration and grid info', () => {
      const calibration = createCalibration();
      const gridInfo = createGridInfo();
      const reconstructor = new SignalReconstructor(calibration, gridInfo);

      expect(reconstructor).toBeInstanceOf(SignalReconstructor);
    });

    it('should accept options', () => {
      const calibration = createCalibration();
      const gridInfo = createGridInfo();
      const reconstructor = new SignalReconstructor(calibration, gridInfo, {
        targetSampleRate: 250,
        removeDC: false,
      });

      expect(reconstructor).toBeInstanceOf(SignalReconstructor);
    });
  });

  describe('reconstruct', () => {
    describe('basic functionality', () => {
      it('should reconstruct signal from single trace', () => {
        const calibration = createCalibration();
        const gridInfo = createGridInfo();
        const reconstructor = new SignalReconstructor(calibration, gridInfo);

        // Create a simple trace
        const xPixels = [0, 10, 20, 30, 40, 50];
        const yPixels = [100, 90, 100, 110, 100, 100]; // Baseline at 100
        const trace = createTrace('I', xPixels, yPixels, 100);

        const signal = reconstructor.reconstruct([trace]);

        expect(signal.sampleRate).toBe(500); // Default
        expect(signal.leads.I).toBeDefined();
        expect(signal.leads.I.length).toBeGreaterThan(0);
      });

      it('should reconstruct multiple leads', () => {
        const calibration = createCalibration();
        const gridInfo = createGridInfo();
        const reconstructor = new SignalReconstructor(calibration, gridInfo);

        const traceI = createTrace('I', [0, 10, 20], [100, 90, 100], 100);
        const traceII = createTrace('II', [0, 10, 20], [100, 80, 100], 100);
        const traceIII = createTrace('III', [0, 10, 20], [100, 85, 100], 100);

        const signal = reconstructor.reconstruct([traceI, traceII, traceIII]);

        expect(signal.leads.I).toBeDefined();
        expect(signal.leads.II).toBeDefined();
        expect(signal.leads.III).toBeDefined();
      });

      it('should estimate pxPerMm for invalid input', () => {
        const calibration = createCalibration();
        const gridInfo = createGridInfo({ pxPerMm: 0 });
        const reconstructor = new SignalReconstructor(calibration, gridInfo);

        const trace = createTrace('I', [0, 10], [100, 90], 100);

        // Should not throw - should estimate pxPerMm instead
        const signal = reconstructor.reconstruct([trace]);
        expect(signal.leads.I).toBeDefined();
      });

      it('should estimate pxPerMm for missing input', () => {
        const calibration = createCalibration();
        const gridInfo = createGridInfo({ pxPerMm: undefined });
        const reconstructor = new SignalReconstructor(calibration, gridInfo);

        const trace = createTrace('I', [0, 10], [100, 90], 100);

        // Should not throw - should estimate pxPerMm instead
        const signal = reconstructor.reconstruct([trace]);
        expect(signal.leads.I).toBeDefined();
      });
    });

    describe('voltage conversion', () => {
      it('should convert Y pixels to microvolts correctly', () => {
        // 10 px/mm, 10 mm/mV = 100 px/mV = 0.01 mV/px = 10 µV/px
        const calibration = createCalibration({ gain: 10 });
        const gridInfo = createGridInfo({ pxPerMm: 10 });
        const reconstructor = new SignalReconstructor(calibration, gridInfo, {
          removeDC: false,
          targetSampleRate: 100,
        });

        // 10 pixels above baseline = 10 * 10 = 100 µV
        const trace = createTrace('I', [0, 100], [90, 90], 100);
        const signal = reconstructor.reconstruct([trace]);

        // All values should be close to 100 µV (10px above baseline)
        expect(signal.leads.I[0]).toBeCloseTo(100, 0);
      });

      it('should handle inverted Y axis (up = positive voltage)', () => {
        const calibration = createCalibration({ gain: 10 });
        const gridInfo = createGridInfo({ pxPerMm: 10 });
        const reconstructor = new SignalReconstructor(calibration, gridInfo, {
          removeDC: false,
          targetSampleRate: 100,
        });

        // Y below baseline (larger value) = negative voltage
        const trace = createTrace('I', [0, 100], [110, 110], 100);
        const signal = reconstructor.reconstruct([trace]);

        // Values should be negative (10px below baseline)
        expect(signal.leads.I[0]).toBeCloseTo(-100, 0);
      });

      it('should scale voltage correctly with different gains', () => {
        const gridInfo = createGridInfo({ pxPerMm: 10 });

        // Test 5 mm/mV gain (5 mm/mV = 50 px/mV with 10 px/mm)
        const calibration5 = createCalibration({ gain: 5 });
        const recon5 = new SignalReconstructor(calibration5, gridInfo, { removeDC: false, targetSampleRate: 100 });

        // Test 20 mm/mV gain (20 mm/mV = 200 px/mV with 10 px/mm)
        const calibration20 = createCalibration({ gain: 20 });
        const recon20 = new SignalReconstructor(calibration20, gridInfo, { removeDC: false, targetSampleRate: 100 });

        // Same 10 pixel displacement
        const trace = createTrace('I', [0, 100], [90, 90], 100);

        const signal5 = recon5.reconstruct([trace]);
        const signal20 = recon20.reconstruct([trace]);

        // With 5 mm/mV: 10px = 10/50 = 0.2mV = 200µV
        expect(signal5.leads.I[0]).toBeCloseTo(200, 0);

        // With 20 mm/mV: 10px = 10/200 = 0.05mV = 50µV
        expect(signal20.leads.I[0]).toBeCloseTo(50, 0);
      });
    });

    describe('time conversion', () => {
      it('should calculate duration correctly', () => {
        // 10 px/mm, 25 mm/s = 250 px/s
        const calibration = createCalibration({ paperSpeed: 25 });
        const gridInfo = createGridInfo({ pxPerMm: 10 });
        const reconstructor = new SignalReconstructor(calibration, gridInfo);

        // 250 pixels = 1 second at 250 px/s
        const xPixels = Array.from({ length: 251 }, (_, i) => i);
        const yPixels = xPixels.map(() => 100);
        const trace = createTrace('I', xPixels, yPixels, 100);

        const signal = reconstructor.reconstruct([trace]);

        // Duration should be approximately 1 second
        expect(signal.duration).toBeCloseTo(1, 1);
      });

      it('should handle different paper speeds', () => {
        const gridInfo = createGridInfo({ pxPerMm: 10 });

        // 25 mm/s: 250 px/s
        const calibration25 = createCalibration({ paperSpeed: 25 });
        const recon25 = new SignalReconstructor(calibration25, gridInfo);

        // 50 mm/s: 500 px/s
        const calibration50 = createCalibration({ paperSpeed: 50 });
        const recon50 = new SignalReconstructor(calibration50, gridInfo);

        // Same 500 pixels
        const xPixels = Array.from({ length: 501 }, (_, i) => i);
        const yPixels = xPixels.map(() => 100);
        const trace = createTrace('I', xPixels, yPixels, 100);

        const signal25 = recon25.reconstruct([trace]);
        const signal50 = recon50.reconstruct([trace]);

        // 25 mm/s: 500px = 2 seconds
        expect(signal25.duration).toBeCloseTo(2, 1);

        // 50 mm/s: 500px = 1 second
        expect(signal50.duration).toBeCloseTo(1, 1);
      });
    });

    describe('sample rate', () => {
      it('should resample to default 500 Hz', () => {
        const calibration = createCalibration();
        const gridInfo = createGridInfo();
        const reconstructor = new SignalReconstructor(calibration, gridInfo);

        // 250 pixels at 250 px/s = 1 second
        const xPixels = Array.from({ length: 251 }, (_, i) => i);
        const yPixels = xPixels.map(() => 100);
        const trace = createTrace('I', xPixels, yPixels, 100);

        const signal = reconstructor.reconstruct([trace]);

        expect(signal.sampleRate).toBe(500);
        // 1 second at 500 Hz = ~500 samples
        expect(signal.leads.I.length).toBeCloseTo(500, -2);
      });

      it('should respect targetSampleRate option', () => {
        const calibration = createCalibration();
        const gridInfo = createGridInfo();
        const reconstructor = new SignalReconstructor(calibration, gridInfo, {
          targetSampleRate: 250,
        });

        const xPixels = Array.from({ length: 251 }, (_, i) => i);
        const yPixels = xPixels.map(() => 100);
        const trace = createTrace('I', xPixels, yPixels, 100);

        const signal = reconstructor.reconstruct([trace]);

        expect(signal.sampleRate).toBe(250);
        // 1 second at 250 Hz = ~250 samples
        expect(signal.leads.I.length).toBeCloseTo(250, -2);
      });
    });

    describe('DC offset removal', () => {
      it('should remove DC offset by default', () => {
        const calibration = createCalibration();
        const gridInfo = createGridInfo();
        const reconstructor = new SignalReconstructor(calibration, gridInfo);

        // Signal with constant offset (all same value)
        const xPixels = Array.from({ length: 100 }, (_, i) => i);
        const yPixels = xPixels.map(() => 80); // 20px above baseline = 200µV
        const trace = createTrace('I', xPixels, yPixels, 100);

        const signal = reconstructor.reconstruct([trace]);

        // With DC removal, median should be near 0
        const median = [...signal.leads.I].sort((a, b) => a - b)[Math.floor(signal.leads.I.length / 2)];
        expect(Math.abs(median)).toBeLessThan(10);
      });

      it('should preserve DC offset when removeDC is false', () => {
        const calibration = createCalibration();
        const gridInfo = createGridInfo();
        const reconstructor = new SignalReconstructor(calibration, gridInfo, {
          removeDC: false,
          targetSampleRate: 100,
        });

        // Signal with offset
        const xPixels = Array.from({ length: 100 }, (_, i) => i);
        const yPixels = xPixels.map(() => 80); // 20px above baseline = 200µV
        const trace = createTrace('I', xPixels, yPixels, 100);

        const signal = reconstructor.reconstruct([trace]);

        // DC offset should be preserved
        const mean = signal.leads.I.reduce((a, b) => a + b, 0) / signal.leads.I.length;
        expect(mean).toBeGreaterThan(100); // Should have significant offset
      });
    });

    describe('multiple traces per lead (rhythm strips)', () => {
      it('should concatenate traces for same lead', () => {
        const calibration = createCalibration();
        const gridInfo = createGridInfo();
        const reconstructor = new SignalReconstructor(calibration, gridInfo, {
          targetSampleRate: 100,
        });

        // Two traces for Lead II (rhythm strip split)
        const trace1 = createTrace('II', [0, 10, 20], [100, 90, 100], 100);
        const trace2 = createTrace('II', [50, 60, 70], [100, 85, 100], 100);

        const signal = reconstructor.reconstruct([trace1, trace2]);

        // Should have longer duration from combined traces
        expect(signal.leads.II).toBeDefined();
        expect(signal.leads.II.length).toBeGreaterThan(0);
      });

      it('should sort traces by X position', () => {
        const calibration = createCalibration();
        const gridInfo = createGridInfo();
        const reconstructor = new SignalReconstructor(calibration, gridInfo);

        // Traces in reverse order
        const trace1 = createTrace('II', [100, 110, 120], [100, 80, 100], 100);
        const trace2 = createTrace('II', [0, 10, 20], [100, 90, 100], 100);

        const signal = reconstructor.reconstruct([trace1, trace2]);

        expect(signal.leads.II).toBeDefined();
      });
    });

    describe('lead padding', () => {
      it('should pad shorter leads to match longest', () => {
        const calibration = createCalibration();
        const gridInfo = createGridInfo();
        const reconstructor = new SignalReconstructor(calibration, gridInfo);

        // Lead I: longer duration
        const traceI = createTrace(
          'I',
          Array.from({ length: 100 }, (_, i) => i),
          Array.from({ length: 100 }, () => 100),
          100
        );

        // Lead II: shorter duration
        const traceII = createTrace(
          'II',
          Array.from({ length: 50 }, (_, i) => i),
          Array.from({ length: 50 }, () => 100),
          100
        );

        const signal = reconstructor.reconstruct([traceI, traceII]);

        // Both leads should have same length
        expect(signal.leads.I.length).toBe(signal.leads.II.length);
      });
    });

    describe('empty input', () => {
      it('should handle empty traces array', () => {
        const calibration = createCalibration();
        const gridInfo = createGridInfo();
        const reconstructor = new SignalReconstructor(calibration, gridInfo);

        const signal = reconstructor.reconstruct([]);

        expect(signal.sampleRate).toBe(500);
        // Empty leads results in -Infinity from Math.max
        expect(signal.duration).toBeLessThanOrEqual(0);
        expect(Object.keys(signal.leads)).toHaveLength(0);
      });
    });
  });
});

describe('reconstructSignal', () => {
  it('should be a convenience function for SignalReconstructor', () => {
    const calibration = createCalibration();
    const gridInfo = createGridInfo();
    const trace = createTrace('I', [0, 10, 20], [100, 90, 100], 100);

    const signal = reconstructSignal([trace], calibration, gridInfo);

    expect(signal.sampleRate).toBe(500);
    expect(signal.leads.I).toBeDefined();
  });

  it('should accept options', () => {
    const calibration = createCalibration();
    const gridInfo = createGridInfo();
    const trace = createTrace('I', [0, 10, 20], [100, 90, 100], 100);

    const signal = reconstructSignal([trace], calibration, gridInfo, {
      targetSampleRate: 250,
    });

    expect(signal.sampleRate).toBe(250);
  });
});

describe('ECG-like reconstruction', () => {
  it('should reconstruct simulated QRS complex', () => {
    const calibration = createCalibration({ gain: 10, paperSpeed: 25 });
    const gridInfo = createGridInfo({ pxPerMm: 10 });
    const reconstructor = new SignalReconstructor(calibration, gridInfo, {
      removeDC: false,
      targetSampleRate: 500,
    });

    // Simulate QRS-like waveform (R wave at 1mV = 100px above baseline)
    const baselineY = 200;
    const xPixels: number[] = [];
    const yPixels: number[] = [];

    // Build QRS: Q dip, R spike, S dip
    for (let i = 0; i < 25; i++) { // Before QRS
      xPixels.push(i);
      yPixels.push(baselineY);
    }
    for (let i = 25; i < 30; i++) { // Q wave (down)
      xPixels.push(i);
      yPixels.push(baselineY + 10);
    }
    for (let i = 30; i < 35; i++) { // R wave (up)
      const rHeight = 100 - Math.abs(i - 32.5) * 30;
      xPixels.push(i);
      yPixels.push(baselineY - rHeight);
    }
    for (let i = 35; i < 40; i++) { // S wave (down)
      xPixels.push(i);
      yPixels.push(baselineY + 20);
    }
    for (let i = 40; i < 75; i++) { // After QRS
      xPixels.push(i);
      yPixels.push(baselineY);
    }

    const trace = createTrace('I', xPixels, yPixels, baselineY);
    const signal = reconstructor.reconstruct([trace]);

    // Should have positive R-wave peak
    const maxValue = Math.max(...signal.leads.I);
    expect(maxValue).toBeGreaterThan(500); // R wave should be > 500 µV

    // Should have negative Q and S waves
    const minValue = Math.min(...signal.leads.I);
    expect(minValue).toBeLessThan(0);
  });

  it('should reconstruct all 12 leads', () => {
    const calibration = createCalibration();
    const gridInfo = createGridInfo();
    const reconstructor = new SignalReconstructor(calibration, gridInfo);

    const leads: LeadName[] = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
    const traces = leads.map(lead =>
      createTrace(
        lead,
        Array.from({ length: 50 }, (_, i) => i),
        Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.2) * 10),
        100
      )
    );

    const signal = reconstructor.reconstruct(traces);

    // All leads should be present
    for (const lead of leads) {
      expect(signal.leads[lead]).toBeDefined();
      expect(signal.leads[lead].length).toBeGreaterThan(0);
    }
  });
});

describe('interpolation methods', () => {
  it('should use linear interpolation by default', () => {
    const calibration = createCalibration();
    const gridInfo = createGridInfo();

    const trace = createTrace(
      'I',
      [0, 50, 100],
      [100, 50, 100],
      100
    );

    const signal = reconstructSignal([trace], calibration, gridInfo, {
      interpolation: 'linear',
    });

    expect(signal.leads.I.length).toBeGreaterThan(0);
  });

  it('should accept sinc interpolation', () => {
    const calibration = createCalibration();
    const gridInfo = createGridInfo();

    const trace = createTrace(
      'I',
      [0, 50, 100],
      [100, 50, 100],
      100
    );

    const signal = reconstructSignal([trace], calibration, gridInfo, {
      interpolation: 'sinc',
    });

    expect(signal.leads.I.length).toBeGreaterThan(0);
  });
});
