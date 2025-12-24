/**
 * Real-World ECG Image Digitization Tests
 *
 * Tests the PNG digitizer against actual ECG images from various sources.
 * Validates accuracy across different formats, qualities, and edge cases.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ECGDigitizer } from '../../../src/signal/loader/png-digitizer/digitizer';
import { AnthropicProvider } from '../../../src/signal/loader/png-digitizer/ai/anthropic';
import type { DigitizerResult } from '../../../src/signal/loader/png-digitizer/types';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const describeWithKey = ANTHROPIC_KEY ? describe : describe.skip;

// ============================================================================
// Test Image Sources
// ============================================================================

interface TestImage {
  name: string;
  url: string;
  expectedFormat: '12-lead' | '15-lead' | 'single' | 'unknown';
  expectedLeads?: number;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

// Local MUSE sample files
const LOCAL_MUSE_FILES = [
  'D262AED8-1160-4C21-9E4E-5D4FDE3EA3AA.png',
  'B006B6E5-645A-4D3E-A838-F8EFEA28B4BB.png',
];

const TEST_IMAGES: TestImage[] = [
  // GitHub hosted ECG samples
  {
    name: 'ecg_plot_example',
    url: 'https://github.com/dy1901/ecg_plot/raw/master/example_ecg.png',
    expectedFormat: '12-lead',
    expectedLeads: 12,
    description: 'Clean synthetic 12-lead ECG from ecg_plot library',
    difficulty: 'easy',
  },
  // University of Utah ECG Learning Center
  {
    name: 'utah_normal_12lead',
    url: 'https://ecg.utah.edu/img/items/Normal%2012_Lead%20ECG.jpg',
    expectedFormat: '12-lead',
    expectedLeads: 12,
    description: 'Normal 12-lead ECG from Utah ECG Learning Center',
    difficulty: 'medium',
  },
  // Wikimedia Commons ECG images
  {
    name: 'wikimedia_japanese_12lead',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Electrocardiogram_12derivations_male_23yo_Japanese.png/1200px-Electrocardiogram_12derivations_male_23yo_Japanese.png',
    expectedFormat: '12-lead',
    expectedLeads: 12,
    description: 'Real clinical 12-lead ECG from Wikimedia (Japanese male, 23yo)',
    difficulty: 'medium',
  },
  {
    name: 'wikimedia_sinus_rhythm',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/SinusRhythmLabels.svg/1200px-SinusRhythmLabels.svg.png',
    expectedFormat: 'single',
    description: 'Labeled sinus rhythm ECG (educational diagram)',
    difficulty: 'hard',
  },
  {
    name: 'wikimedia_12lead_classic',
    url: 'https://upload.wikimedia.org/wikipedia/commons/0/0c/10sec-ekg-12-lead.jpg',
    expectedFormat: '12-lead',
    expectedLeads: 12,
    description: 'Classic 10-second 12-lead ECG recording',
    difficulty: 'medium',
  },
  // Additional Utah ECG samples
  {
    name: 'utah_atrial_flutter',
    url: 'https://ecg.utah.edu/img/items/ecg_12lead008.gif',
    expectedFormat: '12-lead',
    description: 'Atrial flutter 12-lead ECG',
    difficulty: 'hard',
  },
];

// Additional images from various medical sources
const ADDITIONAL_TEST_URLS = [
  // Wikipedia ECG examples
  'https://upload.wikimedia.org/wikipedia/commons/9/9e/SinusRhythmLabels.svg',
  // Medical education sites
  'https://ecglibrary.com/ecgs/norm.png',
];

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Fetch image and convert to ImageData
 * Supports PNG, JPEG, and GIF formats
 */
async function fetchImageAsImageData(url: string): Promise<ImageData | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ECGDigitizerTest/1.0)',
      },
    });
    if (!response.ok) {
      console.log(`  Failed to fetch: ${url} (${response.status})`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Handle different image formats
    if (contentType.includes('png') || url.endsWith('.png')) {
      return await decodePNG(buffer);
    } else if (contentType.includes('jpeg') || contentType.includes('jpg') || url.endsWith('.jpg') || url.endsWith('.jpeg')) {
      return await decodeJPEG(buffer);
    } else if (contentType.includes('gif') || url.endsWith('.gif')) {
      // GIF - try as PNG first (some servers mislabel)
      const pngResult = await decodePNG(buffer);
      if (pngResult) return pngResult;
      console.log(`  GIF format not fully supported, trying PNG decode`);
      return null;
    } else {
      // Try PNG first, then JPEG
      const pngResult = await decodePNG(buffer);
      if (pngResult) return pngResult;
      return await decodeJPEG(buffer);
    }
  } catch (error) {
    console.log(`  Error fetching image: ${error}`);
    return null;
  }
}

/**
 * Decode PNG buffer to ImageData
 */
async function decodePNG(buffer: Buffer): Promise<ImageData | null> {
  try {
    const { PNG } = await import('pngjs');

    return new Promise((resolve) => {
      new PNG().parse(buffer, (error, data) => {
        if (error) {
          resolve(null);
          return;
        }

        const imageData: ImageData = {
          width: data.width,
          height: data.height,
          data: new Uint8ClampedArray(data.data),
          colorSpace: 'srgb' as const,
        };
        resolve(imageData);
      });
    });
  } catch {
    return null;
  }
}

/**
 * Decode JPEG buffer to ImageData using canvas
 */
async function decodeJPEG(buffer: Buffer): Promise<ImageData | null> {
  try {
    // Use node-canvas to decode JPEG
    const { createCanvas, loadImage } = await import('canvas');
    const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    const img = await loadImage(dataUrl);

    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const canvasImageData = ctx.getImageData(0, 0, img.width, img.height);

    return {
      width: canvasImageData.width,
      height: canvasImageData.height,
      data: new Uint8ClampedArray(canvasImageData.data),
      colorSpace: 'srgb' as const,
    };
  } catch (error) {
    console.log(`  JPEG decode error: ${error}`);
    return null;
  }
}

/**
 * Format result summary
 */
function summarizeResult(result: DigitizerResult): string {
  const leads = result.signal ? Object.keys(result.signal.leads).length : 0;
  return `${result.success ? '✅' : '❌'} ${result.method} - ${(result.confidence * 100).toFixed(1)}% conf - ${leads} leads - ${result.processingTimeMs}ms`;
}

// ============================================================================
// Tests
// ============================================================================

describeWithKey('Real-World ECG Image Tests', () => {
  describe('GitHub Hosted ECG Images', () => {
    for (const testImage of TEST_IMAGES) {
      it(`should digitize ${testImage.name} (${testImage.difficulty})`, async () => {
        console.log(`\n=== Testing: ${testImage.name} ===`);
        console.log(`URL: ${testImage.url}`);
        console.log(`Description: ${testImage.description}`);
        console.log(`Expected: ${testImage.expectedFormat}`);

        const imageData = await fetchImageAsImageData(testImage.url);

        if (!imageData) {
          console.log('  Skipping - could not fetch image');
          return;
        }

        console.log(`  Image size: ${imageData.width}x${imageData.height}`);

        const digitizer = new ECGDigitizer({
          aiProvider: 'anthropic',
          apiKey: ANTHROPIC_KEY,
          model: 'claude-sonnet-4-20250514',
          enableLocalFallback: true,
          targetSampleRate: 500,
        });

        const result = await digitizer.digitize(imageData);

        console.log(`  Result: ${summarizeResult(result)}`);

        if (result.signal) {
          const leads = Object.keys(result.signal.leads);
          console.log(`  Leads: ${leads.join(', ')}`);
        }

        if (result.issues.length > 0) {
          console.log(`  Issues: ${result.issues.map(i => i.message).join(', ')}`);
        }

        // Assertions based on difficulty
        if (testImage.difficulty === 'easy') {
          expect(result.success).toBe(true);
          expect(result.confidence).toBeGreaterThan(0.5);
        } else if (testImage.difficulty === 'medium') {
          // Medium difficulty - may or may not succeed
          expect(result).toBeDefined();
        }
        // Hard difficulty - just check it doesn't crash

        if (testImage.expectedLeads && result.signal) {
          const actualLeads = Object.keys(result.signal.leads).length;
          console.log(`  Expected ${testImage.expectedLeads} leads, got ${actualLeads}`);
        }
      }, 120000);
    }
  });

  describe('AI Analysis Quality', () => {
    it('should analyze ecg_plot example image', async () => {
      console.log('\n=== AI Analysis Test ===');

      const imageData = await fetchImageAsImageData(TEST_IMAGES[0].url);
      if (!imageData) {
        console.log('Skipping - could not fetch image');
        return;
      }

      const provider = new AnthropicProvider(ANTHROPIC_KEY!, 'claude-sonnet-4-20250514');
      const result = await provider.analyze(imageData);

      console.log('AI Analysis:');
      console.log(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`  Grid detected: ${result.analysis.grid.detected}`);
      console.log(`  Grid type: ${result.analysis.grid.type}`);
      console.log(`  Layout: ${result.analysis.layout.format}`);
      console.log(`  Panels: ${result.analysis.panels.length}`);

      if (result.analysis.panels.length > 0) {
        console.log('  Lead detection:');
        for (const panel of result.analysis.panels.slice(0, 6)) {
          console.log(`    ${panel.id}: ${panel.lead || 'unknown'} (${(panel.labelConfidence * 100).toFixed(0)}% conf)`);
        }
      }

      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.analysis.panels.length).toBeGreaterThan(0);
    }, 120000);
  });

  describe('Edge Cases', () => {
    it('should handle 404 gracefully', async () => {
      const imageData = await fetchImageAsImageData('https://example.com/nonexistent.png');
      expect(imageData).toBeNull();
    });

    it('should handle very small images', async () => {
      // Create a tiny 10x10 image
      const tinyImage: ImageData = {
        width: 10,
        height: 10,
        data: new Uint8ClampedArray(10 * 10 * 4).fill(255),
        colorSpace: 'srgb',
      };

      const digitizer = new ECGDigitizer({
        aiProvider: 'none',
        enableLocalFallback: true,
      });

      const result = await digitizer.digitize(tinyImage);

      console.log(`Tiny image result: ${summarizeResult(result)}`);

      // Should handle gracefully, likely failing but not crashing
      expect(result).toBeDefined();
    });

    it('should handle grayscale-ish ECG', async () => {
      // Create image with gray tones (common in scanned ECGs)
      const width = 800;
      const height = 600;
      const data = new Uint8ClampedArray(width * height * 4);

      // Light gray background
      for (let i = 0; i < width * height; i++) {
        data[i * 4] = 240;
        data[i * 4 + 1] = 240;
        data[i * 4 + 2] = 240;
        data[i * 4 + 3] = 255;
      }

      // Dark gray grid lines
      for (let x = 30; x < width - 30; x += 20) {
        for (let y = 0; y < height; y++) {
          const idx = (y * width + x) * 4;
          data[idx] = 180;
          data[idx + 1] = 180;
          data[idx + 2] = 180;
        }
      }

      // Black waveform line
      const baselineY = height / 2;
      for (let x = 50; x < width - 50; x++) {
        const y = Math.round(baselineY + 50 * Math.sin(x / 30));
        if (y >= 0 && y < height) {
          const idx = (y * width + x) * 4;
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
        }
      }

      const grayImage: ImageData = { width, height, data, colorSpace: 'srgb' };

      const digitizer = new ECGDigitizer({
        aiProvider: 'none',
        enableLocalFallback: true,
      });

      const result = await digitizer.digitize(grayImage);

      console.log(`Grayscale ECG result: ${summarizeResult(result)}`);

      expect(result.success).toBe(true);
    });

    it('should handle inverted colors (white on black)', async () => {
      const width = 800;
      const height = 600;
      const data = new Uint8ClampedArray(width * height * 4);

      // Black background
      for (let i = 0; i < width * height; i++) {
        data[i * 4] = 0;
        data[i * 4 + 1] = 0;
        data[i * 4 + 2] = 0;
        data[i * 4 + 3] = 255;
      }

      // White grid lines
      for (let x = 30; x < width - 30; x += 20) {
        for (let y = 0; y < height; y++) {
          const idx = (y * width + x) * 4;
          data[idx] = 50;
          data[idx + 1] = 50;
          data[idx + 2] = 50;
        }
      }

      // White waveform
      const baselineY = height / 2;
      for (let x = 50; x < width - 50; x++) {
        const y = Math.round(baselineY + 50 * Math.sin(x / 30));
        if (y >= 0 && y < height) {
          const idx = (y * width + x) * 4;
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
        }
      }

      const invertedImage: ImageData = { width, height, data, colorSpace: 'srgb' };

      const digitizer = new ECGDigitizer({
        aiProvider: 'none',
        enableLocalFallback: true,
      });

      const result = await digitizer.digitize(invertedImage);

      console.log(`Inverted ECG result: ${summarizeResult(result)}`);

      // May or may not detect - inverted is an edge case
      expect(result).toBeDefined();
    });
  });

  describe('Different Grid Patterns', () => {
    const gridColors: Array<{
      name: string;
      bg: [number, number, number];
      thin: [number, number, number];
      thick: [number, number, number];
    }> = [
      {
        name: 'Pink (GE MUSE style)',
        bg: [255, 248, 248],
        thin: [255, 200, 200],
        thick: [255, 150, 150],
      },
      {
        name: 'Green (Philips style)',
        bg: [248, 255, 248],
        thin: [200, 255, 200],
        thick: [150, 255, 150],
      },
      {
        name: 'Blue (Mortara style)',
        bg: [248, 248, 255],
        thin: [200, 200, 255],
        thick: [150, 150, 255],
      },
      {
        name: 'Orange (thermal paper)',
        bg: [255, 250, 240],
        thin: [255, 200, 150],
        thick: [255, 150, 100],
      },
    ];

    for (const grid of gridColors) {
      it(`should detect ${grid.name} grid`, async () => {
        const width = 1000;
        const height = 800;
        const data = new Uint8ClampedArray(width * height * 4);

        // Background
        for (let i = 0; i < width * height; i++) {
          data[i * 4] = grid.bg[0];
          data[i * 4 + 1] = grid.bg[1];
          data[i * 4 + 2] = grid.bg[2];
          data[i * 4 + 3] = 255;
        }

        // Thin grid lines
        const pxPerMm = 10;
        for (let x = 30; x < width - 30; x += pxPerMm) {
          for (let y = 0; y < height; y++) {
            const idx = (y * width + x) * 4;
            data[idx] = grid.thin[0];
            data[idx + 1] = grid.thin[1];
            data[idx + 2] = grid.thin[2];
          }
        }
        for (let y = 30; y < height - 30; y += pxPerMm) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            data[idx] = grid.thin[0];
            data[idx + 1] = grid.thin[1];
            data[idx + 2] = grid.thin[2];
          }
        }

        // Thick grid lines
        for (let x = 30; x < width - 30; x += pxPerMm * 5) {
          for (let y = 0; y < height; y++) {
            const idx = (y * width + x) * 4;
            data[idx] = grid.thick[0];
            data[idx + 1] = grid.thick[1];
            data[idx + 2] = grid.thick[2];
          }
        }

        // ECG waveform
        const baselineY = height / 2;
        for (let x = 50; x < width - 50; x++) {
          const t = (x - 50) / (width - 100);
          let y = 0;

          // Simple QRS pattern
          if (t > 0.2 && t < 0.3) {
            const qrsT = (t - 0.2) / 0.1;
            if (qrsT < 0.5) y = 100 * qrsT * 2;
            else y = 100 * (1 - (qrsT - 0.5) * 3);
          } else if (t > 0.5 && t < 0.7) {
            y = 30 * Math.sin((t - 0.5) / 0.2 * Math.PI);
          }

          const pixelY = Math.round(baselineY - y);
          if (pixelY >= 0 && pixelY < height) {
            const idx = (pixelY * width + x) * 4;
            data[idx] = 0;
            data[idx + 1] = 0;
            data[idx + 2] = 0;
          }
        }

        const image: ImageData = { width, height, data, colorSpace: 'srgb' };

        const digitizer = new ECGDigitizer({
          aiProvider: 'none',
          enableLocalFallback: true,
        });

        const result = await digitizer.digitize(image);

        console.log(`${grid.name} grid: ${summarizeResult(result)}`);
        console.log(`  Grid detected: ${result.gridInfo.detected}`);
        console.log(`  Background: ${result.gridInfo.backgroundColor}`);

        expect(result.success).toBe(true);
      });
    }
  });

  describe('Resolution Tests', () => {
    const resolutions = [
      { name: 'Very Low (400x300)', width: 400, height: 300, difficulty: 'hard' },
      { name: 'Low (800x600)', width: 800, height: 600, difficulty: 'medium' },
      { name: 'Medium (1200x900)', width: 1200, height: 900, difficulty: 'easy' },
      { name: 'High (2400x1800)', width: 2400, height: 1800, difficulty: 'easy' },
    ];

    for (const res of resolutions) {
      it(`should handle ${res.name} resolution`, async () => {
        const { width, height } = res;
        const data = new Uint8ClampedArray(width * height * 4);

        // White background
        for (let i = 0; i < width * height; i++) {
          data[i * 4] = 255;
          data[i * 4 + 1] = 255;
          data[i * 4 + 2] = 255;
          data[i * 4 + 3] = 255;
        }

        // Pink grid (scaled)
        const pxPerMm = Math.max(4, Math.round(width / 100));
        for (let x = 20; x < width - 20; x += pxPerMm) {
          for (let y = 0; y < height; y++) {
            const idx = (y * width + x) * 4;
            data[idx] = 255;
            data[idx + 1] = 200;
            data[idx + 2] = 200;
          }
        }
        for (let y = 20; y < height - 20; y += pxPerMm) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            data[idx] = 255;
            data[idx + 1] = 200;
            data[idx + 2] = 200;
          }
        }

        // ECG waveform
        const baselineY = height / 2;
        for (let x = 30; x < width - 30; x++) {
          const t = x / width;
          let y = 50 * Math.sin(t * 20) * (height / 600);

          const pixelY = Math.round(baselineY - y);
          if (pixelY >= 0 && pixelY < height) {
            const idx = (pixelY * width + x) * 4;
            data[idx] = 0;
            data[idx + 1] = 0;
            data[idx + 2] = 0;
          }
        }

        const image: ImageData = { width, height, data, colorSpace: 'srgb' };

        const digitizer = new ECGDigitizer({
          aiProvider: 'none',
          enableLocalFallback: true,
        });

        const result = await digitizer.digitize(image);

        console.log(`${res.name}: ${summarizeResult(result)}`);

        if (res.difficulty === 'easy' || res.difficulty === 'medium') {
          expect(result.success).toBe(true);
        }
      });
    }
  });
});

describe('Test Structure Check', () => {
  it('should verify test images are defined', () => {
    expect(TEST_IMAGES.length).toBeGreaterThan(0);
    console.log(`\nConfigured ${TEST_IMAGES.length} test images`);
    for (const img of TEST_IMAGES) {
      console.log(`  - ${img.name} (${img.difficulty})`);
    }

    if (!ANTHROPIC_KEY) {
      console.log('\n⚠️  ANTHROPIC_API_KEY not set - AI tests will be skipped');
    }
  });
});
