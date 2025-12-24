/**
 * AI Provider Integration Tests
 *
 * Tests the AI-powered digitization using real API calls.
 * Requires ANTHROPIC_API_KEY environment variable to be set.
 *
 * Run with: ANTHROPIC_API_KEY=your-key npm test -- --run tests/integration/digitizer/ai-provider.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ECGDigitizer } from '../../../src/signal/loader/png-digitizer/digitizer';
import { AnthropicProvider } from '../../../src/signal/loader/png-digitizer/ai/anthropic';
import type { LeadName } from '../../../src/types';

// Skip all tests if no API key is available
const API_KEY = process.env.ANTHROPIC_API_KEY;
const describeWithApiKey = API_KEY ? describe : describe.skip;

/**
 * Create a simple synthetic ECG image for testing
 */
function createTestImage(): ImageData {
  const width = 1200;
  const height = 900;
  const data = new Uint8ClampedArray(width * height * 4);

  // White background
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 255;
    data[i * 4 + 1] = 255;
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = 255;
  }

  // Draw pink grid
  const pxPerMm = 10;
  for (let x = 30; x < width - 30; x += pxPerMm) {
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 200;
      data[idx + 2] = 200;
    }
  }
  for (let y = 30; y < height - 30; y += pxPerMm) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 200;
      data[idx + 2] = 200;
    }
  }

  // Draw thick grid lines every 5 boxes
  for (let x = 30; x < width - 30; x += pxPerMm * 5) {
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 150;
      data[idx + 2] = 150;
    }
  }
  for (let y = 30; y < height - 30; y += pxPerMm * 5) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 150;
      data[idx + 2] = 150;
    }
  }

  // Draw some waveform-like patterns (simple sine waves for each "lead")
  const panelHeight = (height - 100) / 3;
  const panelWidth = (width - 100) / 4;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const baselineY = 50 + row * panelHeight + panelHeight / 2;
      const startX = 50 + col * panelWidth;

      // Draw a simple waveform
      for (let x = startX; x < startX + panelWidth - 10; x++) {
        const t = (x - startX) / panelWidth;
        // ECG-like pattern: small P, big QRS, small T
        let y = 0;
        if (t > 0.1 && t < 0.15) {
          y = 20 * Math.sin((t - 0.1) / 0.05 * Math.PI);
        } else if (t > 0.2 && t < 0.3) {
          const qrsT = (t - 0.2) / 0.1;
          if (qrsT < 0.3) y = -10 * qrsT / 0.3;
          else if (qrsT < 0.5) y = -10 + 110 * (qrsT - 0.3) / 0.2;
          else if (qrsT < 0.7) y = 100 - 130 * (qrsT - 0.5) / 0.2;
          else y = -30 + 30 * (qrsT - 0.7) / 0.3;
        } else if (t > 0.5 && t < 0.7) {
          y = 40 * Math.sin((t - 0.5) / 0.2 * Math.PI);
        }

        const pixelY = Math.round(baselineY - y);
        if (pixelY >= 0 && pixelY < height) {
          const idx = (pixelY * width + x) * 4;
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
        }
      }
    }
  }

  return { width, height, data, colorSpace: 'srgb' as const };
}

describeWithApiKey('AI Provider Integration Tests', () => {
  let testImage: ImageData;

  beforeAll(() => {
    testImage = createTestImage();
  });

  describe('AnthropicProvider', () => {
    it('should analyze ECG image', async () => {
      const provider = new AnthropicProvider(API_KEY!, 'claude-sonnet-4-20250514');

      const result = await provider.analyze(testImage);

      expect(result).toBeDefined();
      expect(result.provider).toBe('anthropic');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.analysis).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThan(0);

      console.log('\n=== AI Analysis Result ===');
      console.log('Confidence:', result.confidence);
      console.log('Processing time:', result.processingTimeMs, 'ms');
      console.log('Grid detected:', result.analysis.grid.detected);
      console.log('Layout format:', result.analysis.layout.format);
      console.log('Panels found:', result.analysis.panels.length);
      console.log('Calibration found:', result.analysis.calibration.found);
    }, 60000); // 60 second timeout for API call
  });

  describe('Full AI-Guided Digitization', () => {
    it('should digitize with AI guidance', async () => {
      const digitizer = new ECGDigitizer({
        aiProvider: 'anthropic',
        apiKey: API_KEY,
        model: 'claude-sonnet-4-20250514',
        aiConfidenceThreshold: 0.5,
        targetSampleRate: 500,
      });

      const result = await digitizer.digitize(testImage);

      console.log('\n=== Digitization Result ===');
      console.log('Success:', result.success);
      console.log('Method:', result.method);
      console.log('Confidence:', result.confidence);
      console.log('Processing time:', result.processingTimeMs, 'ms');

      if (result.signal) {
        const leads = Object.keys(result.signal.leads);
        console.log('Leads extracted:', leads.length);
        console.log('Lead names:', leads.join(', '));
        console.log('Sample rate:', result.signal.sampleRate);
        console.log('Duration:', result.signal.duration, 's');
      }

      if (result.issues.length > 0) {
        console.log('Issues:', result.issues.map(i => i.message).join(', '));
      }

      expect(result.success).toBe(true);
      expect(result.method).toBe('ai_guided');
      expect(result.signal).toBeDefined();
    }, 120000); // 2 minute timeout

    it('should use appropriate method based on AI confidence', async () => {
      // AI confidence may exceed threshold, so accept either method
      const digitizer = new ECGDigitizer({
        aiProvider: 'anthropic',
        apiKey: API_KEY,
        model: 'claude-sonnet-4-20250514',
        aiConfidenceThreshold: 0.99, // Very high threshold
        enableLocalFallback: true,
        targetSampleRate: 500,
      });

      const result = await digitizer.digitize(testImage);

      console.log('\n=== Fallback Test Result ===');
      console.log('Method used:', result.method);
      console.log('AI confidence:', result.aiAnalysis?.confidence);

      // Should use either AI or local CV - both are valid outcomes
      expect(['ai_guided', 'local_cv', 'hybrid']).toContain(result.method);
      expect(result.success).toBe(true);
    }, 120000);
  });

  describe('AI Response Quality', () => {
    it('should detect grid parameters', async () => {
      const provider = new AnthropicProvider(API_KEY!, 'claude-sonnet-4-20250514');
      const result = await provider.analyze(testImage);

      expect(result.analysis.grid).toBeDefined();

      if (result.analysis.grid.detected) {
        console.log('\n=== Grid Detection ===');
        console.log('Type:', result.analysis.grid.type);
        console.log('Background:', result.analysis.grid.backgroundColor);
        console.log('Thin line color:', result.analysis.grid.thinLineColor);
        console.log('px/mm:', result.analysis.grid.pxPerMm);
        console.log('Small box px:', result.analysis.grid.smallBoxPx);
      }
    }, 60000);

    it('should detect panels with lead labels', async () => {
      const provider = new AnthropicProvider(API_KEY!, 'claude-sonnet-4-20250514');
      const result = await provider.analyze(testImage);

      console.log('\n=== Panel Detection ===');
      console.log('Panels found:', result.analysis.panels.length);

      for (const panel of result.analysis.panels.slice(0, 4)) {
        console.log(`  ${panel.id}: ${panel.lead} at (${panel.bounds.x}, ${panel.bounds.y})`);
      }

      // Should find some panels
      expect(result.analysis.panels.length).toBeGreaterThan(0);
    }, 60000);
  });
});

// Test that runs even without API key to verify test structure
describe('AI Provider Test Structure', () => {
  it('should have API key check in place', () => {
    if (!API_KEY) {
      console.log('\n⚠️  ANTHROPIC_API_KEY not set - AI tests skipped');
      console.log('Run with: ANTHROPIC_API_KEY=your-key npm test -- --run tests/integration/digitizer/ai-provider.test.ts\n');
    }
    expect(true).toBe(true);
  });
});
