import { describe, expect, it } from 'vitest';
import { autoTraceLocalScreenshot } from '../../../src/signal/loader/png-digitizer/local-auto-tracer';

function image(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = 255;
    data[index * 4 + 1] = 248;
    data[index * 4 + 2] = 248;
    data[index * 4 + 3] = 255;
  }
  return { width, height, data, colorSpace: 'srgb' };
}

function pixel(target: ImageData, x: number, y: number, rgb: [number, number, number]): void {
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return;
  const offset = (y * target.width + x) * 4;
  target.data[offset] = rgb[0];
  target.data[offset + 1] = rgb[1];
  target.data[offset + 2] = rgb[2];
}

function localTraceFixture(): ImageData {
  const target = image(1200, 600);
  for (let x = 24; x < target.width - 24; x += 12) {
    for (let y = 0; y < target.height; y += 1) pixel(target, x, y, [255, 176, 176]);
  }
  for (let y = 24; y < target.height - 24; y += 12) {
    for (let x = 0; x < target.width; x += 1) pixel(target, x, y, [255, 176, 176]);
  }
  // A one-millivolt calibration rectangle in the left margin.
  for (let y = 260; y <= 380; y += 1) {
    pixel(target, 25, y, [0, 0, 0]);
    pixel(target, 50, y, [0, 0, 0]);
  }
  for (let x = 25; x <= 50; x += 1) {
    pixel(target, x, 260, [0, 0, 0]);
    pixel(target, x, 380, [0, 0, 0]);
  }
  // Deliberately simple black trace; grid remains below the local trace threshold.
  for (let x = 70; x < 1130; x += 1) {
    const y = Math.round(300 + Math.sin((x - 70) / 19) * 35);
    pixel(target, x, y, [0, 0, 0]);
  }
  return target;
}

describe('autoTraceLocalScreenshot', () => {
  it('creates a deterministic local candidate with grid, calibration, and trace evidence', async () => {
    const result = await autoTraceLocalScreenshot(localTraceFixture());

    expect(result.status).not.toBe('rejected');
    expect(result.evidence.grid.detected).toBe(true);
    expect(result.evidence.grid.pxPerMm).toBeGreaterThan(0);
    expect(result.evidence.calibration.pulseFound).toBe(true);
    expect(result.evidence.trace.coverage).toBeGreaterThan(0.7);
    expect(result.trace?.xPixels.length).toBeGreaterThan(700);
    expect(result.samplesUv?.length).toBeGreaterThan(100);
  });

  it('refuses a malformed or low-quality image with a manual-caliper reason', async () => {
    const result = await autoTraceLocalScreenshot(image(80, 60));

    expect(result.status).toBe('rejected');
    expect(result.trace).toBeUndefined();
    expect(result.reasons.join(' ')).toMatch(/at least|manual calipers/i);
  });
});
