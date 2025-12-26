/**
 * Test that AI returns 41 tracePoints (2.5% intervals) and criticalPoints
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { AnthropicProvider } from '../src/signal/loader/png-digitizer/ai/anthropic';

const TEST_IMAGE = process.argv[2] || '/Users/steven/gemuse/test_ecgs/normal_ecg.png';

async function test() {
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

  console.log(`Testing 41-point tracePoints + criticalPoints on ${png.width}x${png.height} image\n`);

  // Use Claude Opus 4.5 for best results (default)
  const provider = new AnthropicProvider(apiKey);

  console.log('Calling AI for analysis...\n');
  const startTime = Date.now();
  const result = await provider.analyze(imageData);
  const elapsed = Date.now() - startTime;

  console.log(`AI response received in ${elapsed}ms\n`);
  console.log(`Overall confidence: ${result.confidence.toFixed(2)}`);
  console.log(`Panels detected: ${result.analysis.panels.length}`);
  console.log(`Waveform color: ${result.analysis.grid.waveformColor}`);

  console.log('\n=== TracePoints per Panel ===\n');

  let totalPoints = 0;
  let panelsWithFullPoints = 0;
  let totalCriticalPoints = 0;
  let panelsWithCriticalPoints = 0;

  for (const panel of result.analysis.panels) {
    const pointCount = panel.tracePoints?.length ?? 0;
    const criticalCount = panel.criticalPoints?.length ?? 0;
    totalPoints += pointCount;
    totalCriticalPoints += criticalCount;

    if (pointCount >= 40) {
      panelsWithFullPoints++;
    }
    if (criticalCount > 0) {
      panelsWithCriticalPoints++;
    }

    const traceStatus = pointCount >= 40 ? '✓' : pointCount >= 20 ? '~' : '✗';
    const criticalStatus = criticalCount >= 4 ? '✓' : criticalCount > 0 ? '~' : '✗';
    console.log(`${panel.lead?.padEnd(4) ?? '????'}: ${pointCount} trace ${traceStatus}, ${criticalCount} critical ${criticalStatus}`);

    // Show critical points for lead I
    if (panel.lead === 'I' && panel.criticalPoints && panel.criticalPoints.length > 0) {
      console.log('  Critical points:');
      for (const cp of panel.criticalPoints) {
        console.log(`    ${cp.type}: ${cp.xPercent.toFixed(1)}% Y=${cp.yPixel}`);
      }
    }
  }

  console.log('\n=== Summary ===\n');
  console.log(`Total tracePoints: ${totalPoints}`);
  console.log(`Panels with 40+ trace points: ${panelsWithFullPoints}/${result.analysis.panels.length}`);
  console.log(`Average trace points per panel: ${(totalPoints / result.analysis.panels.length).toFixed(1)}`);
  console.log(`\nTotal criticalPoints: ${totalCriticalPoints}`);
  console.log(`Panels with critical points: ${panelsWithCriticalPoints}/${result.analysis.panels.length}`);
  console.log(`Average critical points per panel: ${(totalCriticalPoints / result.analysis.panels.length).toFixed(1)}`);

  // Einthoven validation using AI tracePoints
  console.log('\n=== Einthoven Validation (from AI tracePoints) ===\n');

  const leadI = result.analysis.panels.find(p => p.lead === 'I');
  const leadII = result.analysis.panels.find(p => p.lead === 'II');
  const leadIII = result.analysis.panels.find(p => p.lead === 'III');

  if (leadI?.tracePoints && leadII?.tracePoints && leadIII?.tracePoints) {
    // Check at a few xPercent values
    const checkPercents = [10, 25, 50, 75, 90];

    for (const pct of checkPercents) {
      const findYAtPercent = (points: typeof leadI.tracePoints, targetPct: number): number | null => {
        if (!points) return null;
        // Find exact match or interpolate
        const exact = points.find(p => Math.abs(p.xPercent - targetPct) < 0.1);
        if (exact) return exact.yPixel;

        // Interpolate
        let left = points[0];
        let right = points[points.length - 1];
        for (let i = 0; i < points.length - 1; i++) {
          if (points[i].xPercent <= targetPct && points[i + 1].xPercent >= targetPct) {
            left = points[i];
            right = points[i + 1];
            break;
          }
        }
        const t = (targetPct - left.xPercent) / (right.xPercent - left.xPercent);
        return left.yPixel + t * (right.yPixel - left.yPixel);
      };

      const yI = findYAtPercent(leadI.tracePoints, pct);
      const yII = findYAtPercent(leadII.tracePoints, pct);
      const yIII = findYAtPercent(leadIII.tracePoints, pct);

      if (yI !== null && yII !== null && yIII !== null) {
        // Convert Y pixels to relative voltage (baseline - Y)
        // Use each lead's own baseline
        const vI = leadI.baselineY - yI;
        const vII = leadII.baselineY - yII;
        const vIII = leadIII.baselineY - yIII;

        // Einthoven: II = I + III (in same coordinate system)
        const expected = vI + vIII;
        const error = Math.abs(vII - expected);
        const status = error < 5 ? '✓' : error < 15 ? '~' : '✗';

        console.log(`${pct}%: I=${vI.toFixed(1)}, II=${vII.toFixed(1)}, III=${vIII.toFixed(1)}, I+III=${expected.toFixed(1)}, err=${error.toFixed(1)}px ${status}`);
      }
    }
  } else {
    console.log('Missing tracePoints for one or more leads');
  }

  // Expected: 41 trace points + critical points for each panel
  const expectedTracePoints = 41;
  const traceSuccess = panelsWithFullPoints >= 10;
  const criticalSuccess = panelsWithCriticalPoints >= 10;

  console.log('\n=== Test Result ===\n');
  console.log(`Expected ${expectedTracePoints} trace points per panel`);
  console.log(`TracePoints: ${traceSuccess ? 'PASS' : 'FAIL'} - ${panelsWithFullPoints} panels have 40+ points`);
  console.log(`CriticalPoints: ${criticalSuccess ? 'PASS' : 'FAIL'} - ${panelsWithCriticalPoints} panels have critical points`);
  console.log(`\nOverall: ${traceSuccess && criticalSuccess ? 'PASS' : 'PARTIAL'}`);
}

test().catch(console.error);
