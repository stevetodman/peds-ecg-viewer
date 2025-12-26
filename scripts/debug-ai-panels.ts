/**
 * Debug AI panel detection output
 */

import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { AnthropicProvider } from '../src/signal/loader/png-digitizer/ai/anthropic';

const TEST_IMAGE = '/Users/steven/gemuse/test_ecgs/normal_ecg.png';

async function debug() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('Set ANTHROPIC_API_KEY');
    process.exit(1);
  }

  const buffer = readFileSync(TEST_IMAGE);
  const png = PNG.sync.read(buffer);
  const imageData: ImageData = {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height,
    colorSpace: 'srgb' as PredefinedColorSpace,
  };

  console.log(`=== AI Panel Detection Debug ===\n`);
  console.log(`Image: ${png.width}x${png.height}\n`);
  console.log(`Expected 3 rows (Y: 0-151, 151-302, 302-453)\n`);

  const provider = new AnthropicProvider(apiKey, 'claude-sonnet-4-20250514');
  const result = await provider.analyze(imageData);

  console.log('=== All Detected Panels ===\n');

  // Sort by row then column
  const sorted = [...result.analysis.panels].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });

  for (const panel of sorted) {
    const endY = panel.bounds.y + panel.bounds.height;
    const withinImage = endY <= png.height ? '✓' : `✗ (extends to ${endY})`;

    console.log(`${panel.lead?.padEnd(4) || '????'} row=${panel.row} col=${panel.col}:`);
    console.log(`  Bounds: x=${panel.bounds.x}, y=${panel.bounds.y}, w=${panel.bounds.width}, h=${panel.bounds.height}`);
    console.log(`  End Y: ${endY} ${withinImage}`);
    console.log(`  Baseline Y: ${panel.baselineY}`);
    console.log(`  Rhythm strip: ${panel.isRhythmStrip}`);
    console.log();
  }

  // Analyze row groupings
  console.log('=== Row Analysis ===\n');
  const rows = new Map<number, typeof sorted>();
  for (const panel of sorted) {
    if (!rows.has(panel.row)) rows.set(panel.row, []);
    rows.get(panel.row)!.push(panel);
  }

  for (const [rowNum, panels] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    const yValues = panels.map(p => p.bounds.y);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const variation = maxY - minY;

    console.log(`Row ${rowNum}: ${panels.length} panels`);
    console.log(`  Y positions: ${yValues.join(', ')}`);
    console.log(`  Variation: ${variation}px ${variation > 10 ? '⚠️ INCONSISTENT' : '✓'}`);
    console.log(`  Leads: ${panels.map(p => p.lead).join(', ')}`);
    console.log();
  }

  // Check if the standard 12-lead layout is detected
  console.log('=== Standard Layout Check ===\n');
  const expectedLayout = [
    { lead: 'I', row: 0, col: 0 },
    { lead: 'II', row: 1, col: 0 },
    { lead: 'III', row: 2, col: 0 },
    { lead: 'aVR', row: 0, col: 1 },
    { lead: 'aVL', row: 1, col: 1 },
    { lead: 'aVF', row: 2, col: 1 },
    { lead: 'V1', row: 0, col: 2 },
    { lead: 'V2', row: 1, col: 2 },
    { lead: 'V3', row: 2, col: 2 },
    { lead: 'V4', row: 0, col: 3 },
    { lead: 'V5', row: 1, col: 3 },
    { lead: 'V6', row: 2, col: 3 },
  ];

  for (const expected of expectedLayout) {
    const found = result.analysis.panels.find(
      p => p.lead === expected.lead && !p.isRhythmStrip
    );

    if (!found) {
      console.log(`${expected.lead}: NOT FOUND ✗`);
    } else if (found.row !== expected.row || found.col !== expected.col) {
      console.log(`${expected.lead}: at row=${found.row}, col=${found.col} (expected ${expected.row},${expected.col}) ⚠️`);
    } else {
      console.log(`${expected.lead}: row=${found.row}, col=${found.col} ✓`);
    }
  }
}

debug().catch(console.error);
