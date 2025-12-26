/**
 * Debug panel geometry from both AI and rule-based detection
 */

import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { AnthropicProvider } from '../src/signal/loader/png-digitizer/ai/anthropic';
import { LocalGridDetector } from '../src/signal/loader/png-digitizer/cv/grid-detector';

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

  console.log(`Image: ${png.width}x${png.height}\n`);

  // Get AI panels
  console.log('=== AI Panel Detection ===\n');
  const provider = new AnthropicProvider(apiKey, 'claude-sonnet-4-20250514');
  const aiResult = await provider.analyze(imageData);

  for (const panel of aiResult.analysis.panels.sort((a, b) => a.row * 10 + a.col - (b.row * 10 + b.col))) {
    console.log(`${panel.lead?.padEnd(4) || '????'} row=${panel.row} col=${panel.col}: x=${panel.bounds.x}, y=${panel.bounds.y}, w=${panel.bounds.width}, h=${panel.bounds.height}, baseline=${panel.baselineY}`);
  }

  // Get rule-based panels
  console.log('\n=== Rule-Based Panel Detection ===\n');
  const localDetector = new LocalGridDetector(imageData);
  const localResult = await localDetector.analyze();

  for (const panel of localResult.panels.sort((a, b) => a.row * 10 + a.col - (b.row * 10 + b.col))) {
    console.log(`${panel.lead?.padEnd(4) || '????'} row=${panel.row} col=${panel.col}: x=${panel.bounds.x}, y=${panel.bounds.y}, w=${panel.bounds.width}, h=${panel.bounds.height}, baseline=${panel.baselineY}`);
  }

  // Compare
  console.log('\n=== Comparison ===\n');
  console.log('Checking if rule-based panels cover the full image:\n');

  const totalWidth = localResult.panels.reduce((max, p) => Math.max(max, p.bounds.x + p.bounds.width), 0);
  const totalHeight = localResult.panels.reduce((max, p) => Math.max(max, p.bounds.y + p.bounds.height), 0);

  console.log(`Image size: ${png.width}x${png.height}`);
  console.log(`Panels cover: ${totalWidth}x${totalHeight}`);
  console.log(`Gap right: ${png.width - totalWidth}px`);
  console.log(`Gap bottom: ${png.height - totalHeight}px`);

  // Check column widths
  console.log('\n=== Column Analysis ===\n');
  for (let col = 0; col < 4; col++) {
    const colPanels = localResult.panels.filter(p => p.col === col);
    if (colPanels.length > 0) {
      const avgX = colPanels.reduce((sum, p) => sum + p.bounds.x, 0) / colPanels.length;
      const avgWidth = colPanels.reduce((sum, p) => sum + p.bounds.width, 0) / colPanels.length;
      const leads = colPanels.map(p => p.lead).join(', ');
      console.log(`Column ${col}: x=${avgX.toFixed(0)}, width=${avgWidth.toFixed(0)}, leads=[${leads}]`);
    } else {
      console.log(`Column ${col}: NO PANELS DETECTED`);
    }
  }
}

debug().catch(console.error);
