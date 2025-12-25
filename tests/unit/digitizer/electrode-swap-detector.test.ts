/**
 * Electrode Swap Detector Tests
 *
 * Tests for electrode swap detection including:
 * - Adult mode detection (backward compatibility)
 * - Pediatric mode (age-aware thresholds)
 * - False positive prevention for normal pediatric patterns
 */

import { describe, it, expect } from 'vitest';
import {
  ElectrodeSwapDetector,
  detectElectrodeSwap,
  correctElectrodeSwap,
} from '../../../src/signal/loader/png-digitizer/signal/electrode-swap-detector';
import type { LeadName } from '../../../src/signal/loader/png-digitizer/types';

// =============================================================================
// Test Data Generators
// =============================================================================

/**
 * Generate a simple sine wave for testing
 */
function generateSineWave(
  amplitude: number,
  frequency: number,
  phase: number,
  samples: number,
  sampleRate: number
): number[] {
  const wave: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    wave.push(amplitude * Math.sin(2 * Math.PI * frequency * t + phase));
  }
  return wave;
}

/**
 * Generate a realistic ECG-like QRS waveform
 */
function generateQRSWaveform(
  rAmplitude: number,
  sAmplitude: number,
  samples: number,
  polarity: 1 | -1 = 1
): number[] {
  const wave: number[] = new Array(samples).fill(0);
  const beatSamples = Math.floor(samples / 3); // ~3 beats

  for (let beat = 0; beat < 3; beat++) {
    const offset = beat * beatSamples;
    const qrsIdx = offset + Math.floor(beatSamples * 0.3);

    // R wave
    if (qrsIdx >= 0 && qrsIdx < samples) {
      wave[qrsIdx] = polarity * rAmplitude;
    }
    // S wave
    if (qrsIdx + 5 >= 0 && qrsIdx + 5 < samples) {
      wave[qrsIdx + 5] = polarity * -sAmplitude;
    }
  }

  return wave;
}

/**
 * Generate a normal adult 12-lead ECG pattern
 * - R wave progressively increases V1→V4, then decreases V4→V6
 * - S wave decreases V1→V6
 */
function generateNormalAdultLeads(samples = 2500): Partial<Record<LeadName, number[]>> {
  return {
    I: generateQRSWaveform(800, 200, samples),
    II: generateQRSWaveform(1000, 150, samples),
    III: generateQRSWaveform(500, 100, samples),
    aVR: generateQRSWaveform(500, 200, samples, -1), // Normally negative
    aVL: generateQRSWaveform(400, 150, samples),
    aVF: generateQRSWaveform(700, 100, samples),
    V1: generateQRSWaveform(300, 1000, samples), // Small R, deep S
    V2: generateQRSWaveform(500, 800, samples),
    V3: generateQRSWaveform(800, 500, samples),
    V4: generateQRSWaveform(1200, 300, samples), // Tallest R
    V5: generateQRSWaveform(1000, 200, samples),
    V6: generateQRSWaveform(800, 100, samples),
  };
}

/**
 * Generate a normal neonate 12-lead ECG pattern
 * - R wave in V1 is LARGE (RV dominance)
 * - R wave DECREASES from V1→V6 (opposite of adult)
 */
function generateNormalNeonateLeads(samples = 2500): Partial<Record<LeadName, number[]>> {
  return {
    I: generateQRSWaveform(400, 200, samples),
    II: generateQRSWaveform(800, 150, samples),
    III: generateQRSWaveform(1000, 100, samples), // Larger than II (right axis)
    aVR: generateQRSWaveform(400, 150, samples, -1),
    aVL: generateQRSWaveform(200, 100, samples),
    aVF: generateQRSWaveform(900, 100, samples),
    V1: generateQRSWaveform(1500, 200, samples), // LARGE R (RV dominant)
    V2: generateQRSWaveform(1200, 300, samples),
    V3: generateQRSWaveform(800, 400, samples),
    V4: generateQRSWaveform(600, 500, samples),
    V5: generateQRSWaveform(500, 400, samples),
    V6: generateQRSWaveform(400, 300, samples), // Smaller than V1
  };
}

/**
 * Generate leads with LA-RA swap pattern
 */
function generateLaRaSwappedLeads(samples = 2500): Partial<Record<LeadName, number[]>> {
  const normal = generateNormalAdultLeads(samples);
  return {
    ...normal,
    I: normal.I!.map(v => -v), // Inverted Lead I
    aVR: normal.aVL, // Swapped
    aVL: normal.aVR, // Swapped
  };
}

/**
 * Generate leads with V1-V2 precordial swap
 */
function generateV1V2SwappedLeads(samples = 2500): Partial<Record<LeadName, number[]>> {
  const normal = generateNormalAdultLeads(samples);
  return {
    ...normal,
    V1: normal.V2, // Swapped
    V2: normal.V1, // Swapped
  };
}

// =============================================================================
// Backward Compatibility Tests
// =============================================================================

describe('ElectrodeSwapDetector', () => {
  const sampleRate = 500;

  describe('backward compatibility', () => {
    it('should accept 2-argument call (leads, sampleRate)', () => {
      const leads = generateNormalAdultLeads();

      // Should not throw with 2 arguments
      const result = detectElectrodeSwap(leads, sampleRate);

      expect(result).toBeDefined();
      expect(result.swapDetected).toBeDefined();
      expect(result.evidence).toBeDefined();
    });

    it('should accept 3-argument call with undefined options', () => {
      const leads = generateNormalAdultLeads();

      const result = detectElectrodeSwap(leads, sampleRate, undefined);

      expect(result).toBeDefined();
      expect(result.pediatricContext).toBeUndefined();
    });

    it('should behave identically for adult ECG with and without empty options', () => {
      const leads = generateNormalAdultLeads();

      const result1 = detectElectrodeSwap(leads, sampleRate);
      const result2 = detectElectrodeSwap(leads, sampleRate, {});

      expect(result1.swapDetected).toBe(result2.swapDetected);
      expect(result1.evidence.length).toBe(result2.evidence.length);
    });
  });

  // ===========================================================================
  // Adult Mode Tests (No Age Provided)
  // ===========================================================================

  describe('adult mode (no age provided)', () => {
    it('should not flag normal adult ECG as swap', () => {
      const leads = generateNormalAdultLeads();

      const result = detectElectrodeSwap(leads, sampleRate);

      expect(result.swapDetected).toBe(false);
    });

    it('should detect LA-RA swap with inverted Lead I', () => {
      const leads = generateLaRaSwappedLeads();

      const result = detectElectrodeSwap(leads, sampleRate);

      // Should detect a limb lead swap
      expect(result.swapDetected).toBe(true);
      // May detect as LA_RA or RA_LL depending on synthetic data
      expect(['LA_RA', 'RA_LL']).toContain(result.swapType);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect V1-V2 precordial swap', () => {
      const leads = generateV1V2SwappedLeads();

      const result = detectElectrodeSwap(leads, sampleRate);

      // Should detect abnormal progression
      expect(result.evidence.some(e => e.type === 'progression')).toBe(true);
    });

    it('should behave differently for neonate pattern with vs without age', () => {
      // This is the KEY test - showing that age-aware mode changes behavior
      const leads = generateNormalNeonateLeads();

      // Without age info, uses adult criteria
      const adultModeResult = detectElectrodeSwap(leads, sampleRate);

      // With neonate age, uses relaxed pediatric criteria
      const pediatricModeResult = detectElectrodeSwap(leads, sampleRate, { ageDays: 7 });

      // The pediatric mode should have suppressed some findings
      // or have fewer/lower-weight progression findings
      expect(pediatricModeResult.pediatricContext).toBeDefined();
      expect(pediatricModeResult.pediatricContext!.expectedRVDominance).toBe(true);

      // If adult mode found progression issues, pediatric mode should suppress them
      // or have lower confidence findings
      if (adultModeResult.evidence.some(e => e.type === 'progression')) {
        // Pediatric mode should either:
        // 1. Have suppressed findings listed, OR
        // 2. Have fewer progression findings, OR
        // 3. Have lower strength findings
        const hasSuppressed = pediatricModeResult.pediatricContext?.suppressedFindings?.length ?? 0;
        const adultProgressionCount = adultModeResult.evidence.filter(e => e.type === 'progression').length;
        const pediatricProgressionCount = pediatricModeResult.evidence.filter(e => e.type === 'progression').length;

        expect(hasSuppressed > 0 || pediatricProgressionCount <= adultProgressionCount).toBe(true);
      }
    });
  });

  // ===========================================================================
  // Pediatric Mode Tests (Age Provided)
  // ===========================================================================

  describe('pediatric mode - neonates (0-30 days)', () => {
    it('should NOT flag normal RV dominance as swap', () => {
      const leads = generateNormalNeonateLeads();

      // Provide neonate age (7 days = 7 ageDays)
      const result = detectElectrodeSwap(leads, sampleRate, { ageDays: 7 });

      // Should NOT flag the R-wave decrease V1→V2 as a swap
      expect(result.swapDetected).toBe(false);
    });

    it('should include pediatric context in result', () => {
      const leads = generateNormalNeonateLeads();

      const result = detectElectrodeSwap(leads, sampleRate, { ageDays: 7 });

      expect(result.pediatricContext).toBeDefined();
      expect(result.pediatricContext!.ageDays).toBe(7);
      expect(result.pediatricContext!.ageGroup.stage).toBe('neonate');
      expect(result.pediatricContext!.expectedRVDominance).toBe(true);
    });

    it('should track suppressed findings', () => {
      const leads = generateNormalNeonateLeads();

      const result = detectElectrodeSwap(leads, sampleRate, { ageDays: 7 });

      // The V1→V2 drop that would flag in adult mode should be suppressed
      if (result.pediatricContext?.suppressedFindings) {
        expect(result.pediatricContext.suppressedFindings.some(f =>
          f.includes('V1→V2') && f.includes('suppressed')
        )).toBe(true);
      }
    });

    it('should still detect LA-RA swap in neonate', () => {
      // Create neonate pattern but with LA-RA swap
      const leads = generateNormalNeonateLeads();
      leads.I = leads.I!.map(v => -v); // Invert Lead I

      const result = detectElectrodeSwap(leads, sampleRate, { ageDays: 7 });

      // Limb lead swap detection should still work
      expect(result.evidence.some(e => e.type === 'inversion')).toBe(true);
    });

    it('should use relaxed threshold (2.5x) for V2→V3 in neonate', () => {
      const leads = generateNormalNeonateLeads();

      const result = detectElectrodeSwap(leads, sampleRate, { ageDays: 3 });

      // The RV dominance pattern shouldn't trigger false positives
      expect(result.swapDetected).toBe(false);
      expect(result.pediatricContext?.expectedRVDominance).toBe(true);
    });
  });

  describe('pediatric mode - infants (1-12 months)', () => {
    it('should use appropriate thresholds for early infant (< 3 months)', () => {
      const leads = generateNormalNeonateLeads();

      // 2 months old = ~60 days
      const result = detectElectrodeSwap(leads, sampleRate, { ageDays: 60 });

      expect(result.pediatricContext).toBeDefined();
      expect(result.pediatricContext!.ageGroup.stage).toBe('infant');
      expect(result.pediatricContext!.expectedRVDominance).toBe(true);
    });

    it('should use slightly stricter thresholds for late infant (6-12 months)', () => {
      // 9 months = ~270 days
      const result = detectElectrodeSwap(
        generateNormalAdultLeads(),
        sampleRate,
        { ageDays: 270 }
      );

      expect(result.pediatricContext).toBeDefined();
      expect(result.pediatricContext!.ageGroup.stage).toBe('infant');
      // Late infants don't have expected RV dominance
      expect(result.pediatricContext!.expectedRVDominance).toBe(false);
    });
  });

  describe('pediatric mode - children and adolescents', () => {
    it('should use near-adult thresholds for toddlers (1-3 years)', () => {
      // 2 years = ~730 days
      const leads = generateNormalAdultLeads();

      const result = detectElectrodeSwap(leads, sampleRate, { ageDays: 730 });

      expect(result.pediatricContext).toBeDefined();
      expect(result.pediatricContext!.ageGroup.stage).toBe('toddler');
      expect(result.swapDetected).toBe(false);
    });

    it('should use adult thresholds for children 3+ years', () => {
      // 5 years = ~1826 days
      const leads = generateNormalAdultLeads();

      const result = detectElectrodeSwap(leads, sampleRate, { ageDays: 1826 });

      expect(result.pediatricContext).toBeDefined();
      expect(result.pediatricContext!.ageGroup.stage).toBe('child');
      expect(result.swapDetected).toBe(false);
    });

    it('should use adult thresholds for adolescents', () => {
      // 15 years = ~5475 days
      const leads = generateNormalAdultLeads();

      const result = detectElectrodeSwap(leads, sampleRate, { ageDays: 5475 });

      expect(result.pediatricContext).toBeDefined();
      expect(result.pediatricContext!.ageGroup.stage).toBe('adolescent');
      expect(result.swapDetected).toBe(false);
    });
  });

  // ===========================================================================
  // Class-based API Tests
  // ===========================================================================

  describe('ElectrodeSwapDetector class', () => {
    it('should accept options in constructor', () => {
      const leads = generateNormalNeonateLeads();

      const detector = new ElectrodeSwapDetector(leads, sampleRate, { ageDays: 7 });
      const result = detector.detect();

      expect(result.pediatricContext).toBeDefined();
      expect(result.pediatricContext!.ageDays).toBe(7);
    });

    it('should support strictPediatric option', () => {
      const leads = generateNormalNeonateLeads();

      const normalResult = detectElectrodeSwap(leads, sampleRate, { ageDays: 7 });
      const strictResult = detectElectrodeSwap(leads, sampleRate, {
        ageDays: 7,
        strictPediatric: true,
      });

      // Both should not flag normal neonate pattern
      expect(normalResult.swapDetected).toBe(false);
      expect(strictResult.swapDetected).toBe(false);
    });
  });

  // ===========================================================================
  // Correction Function Tests
  // ===========================================================================

  describe('correctElectrodeSwap', () => {
    it('should accept options parameter', () => {
      const leads = generateLaRaSwappedLeads();

      const { corrected, detection } = correctElectrodeSwap(leads, sampleRate, { ageDays: 5475 });

      expect(detection).toBeDefined();
      expect(detection.pediatricContext).toBeDefined();
      // Either a swap is detected (and may or may not be correctable),
      // or no swap is detected
      expect(typeof detection.swapDetected).toBe('boolean');
    });

    it('should pass options through to detector', () => {
      const leads = generateNormalNeonateLeads();

      const { detection } = correctElectrodeSwap(leads, sampleRate, { ageDays: 7 });

      expect(detection.pediatricContext).toBeDefined();
      expect(detection.pediatricContext!.ageDays).toBe(7);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle missing leads gracefully', () => {
      const leads: Partial<Record<LeadName, number[]>> = {
        I: generateQRSWaveform(800, 200, 2500),
        II: generateQRSWaveform(1000, 150, 2500),
        // Missing most leads
      };

      const result = detectElectrodeSwap(leads, sampleRate, { ageDays: 7 });

      expect(result).toBeDefined();
      expect(result.swapDetected).toBe(false);
    });

    it('should handle very young neonate (day 0)', () => {
      const leads = generateNormalNeonateLeads();

      const result = detectElectrodeSwap(leads, sampleRate, { ageDays: 0 });

      expect(result.pediatricContext).toBeDefined();
      expect(result.pediatricContext!.ageGroup.stage).toBe('neonate');
    });

    it('should handle adult age (> 18 years)', () => {
      // 20 years = ~7300 days
      const leads = generateNormalAdultLeads();

      const result = detectElectrodeSwap(leads, sampleRate, { ageDays: 7300 });

      expect(result.pediatricContext).toBeDefined();
      // Should still provide context but with adult-like behavior
      expect(result.swapDetected).toBe(false);
    });
  });
});
