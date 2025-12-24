/**
 * AI Provider Comparison Tests
 *
 * Compares accuracy between Anthropic Claude, OpenAI models, and xAI Grok
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { AnthropicProvider } from '../../../src/signal/loader/png-digitizer/ai/anthropic';
import { OpenAIProvider } from '../../../src/signal/loader/png-digitizer/ai/openai';
import { XAIProvider } from '../../../src/signal/loader/png-digitizer/ai/ensemble';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const XAI_KEY = process.env.XAI_API_KEY;

const describeWithKeys = (ANTHROPIC_KEY && OPENAI_KEY) ? describe : describe.skip;

// GPT-5.2 Pro model ID
const GPT_5_2_PRO = 'gpt-5.2-pro';

/**
 * Create a synthetic ECG image for comparison
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

  // Draw pink grid (standard ECG colors)
  const pxPerMm = 10;
  for (let x = 30; x < width - 30; x += pxPerMm) {
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 192;
      data[idx + 2] = 192;
    }
  }
  for (let y = 30; y < height - 30; y += pxPerMm) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 192;
      data[idx + 2] = 192;
    }
  }

  // Thick grid lines
  for (let x = 30; x < width - 30; x += pxPerMm * 5) {
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 128;
      data[idx + 2] = 128;
    }
  }
  for (let y = 30; y < height - 30; y += pxPerMm * 5) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 128;
      data[idx + 2] = 128;
    }
  }

  // Draw ECG waveforms in 3x4 layout
  const panelHeight = (height - 100) / 3;
  const panelWidth = (width - 100) / 4;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const baselineY = 50 + row * panelHeight + panelHeight / 2;
      const startX = 50 + col * panelWidth;

      // Draw ECG-like pattern
      for (let x = startX; x < startX + panelWidth - 10; x++) {
        const t = (x - startX) / panelWidth;
        let y = 0;

        // P wave
        if (t > 0.1 && t < 0.15) {
          y = 20 * Math.sin((t - 0.1) / 0.05 * Math.PI);
        }
        // QRS
        else if (t > 0.2 && t < 0.3) {
          const qrsT = (t - 0.2) / 0.1;
          if (qrsT < 0.3) y = -10 * qrsT / 0.3;
          else if (qrsT < 0.5) y = -10 + 110 * (qrsT - 0.3) / 0.2;
          else if (qrsT < 0.7) y = 100 - 130 * (qrsT - 0.5) / 0.2;
          else y = -30 + 30 * (qrsT - 0.7) / 0.3;
        }
        // T wave
        else if (t > 0.5 && t < 0.7) {
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

describeWithKeys('AI Provider Comparison', () => {
  let testImage: ImageData;

  beforeAll(() => {
    testImage = createTestImage();
  });

  it('should compare Anthropic vs OpenAI analysis', async () => {
    console.log('\n=== AI Provider Comparison ===\n');

    // Test Anthropic
    console.log('Testing Anthropic Claude...');
    const anthropic = new AnthropicProvider(ANTHROPIC_KEY!, 'claude-sonnet-4-20250514');
    const anthropicStart = Date.now();
    const anthropicResult = await anthropic.analyze(testImage);
    const anthropicTime = Date.now() - anthropicStart;

    console.log(`  Confidence: ${(anthropicResult.confidence * 100).toFixed(1)}%`);
    console.log(`  Time: ${anthropicTime}ms`);
    console.log(`  Grid detected: ${anthropicResult.analysis.grid.detected}`);
    console.log(`  Panels found: ${anthropicResult.analysis.panels.length}`);

    // Test OpenAI
    console.log('\nTesting OpenAI GPT-4V...');
    const openai = new OpenAIProvider(OPENAI_KEY!, 'gpt-4o');
    const openaiStart = Date.now();
    const openaiResult = await openai.analyze(testImage);
    const openaiTime = Date.now() - openaiStart;

    console.log(`  Confidence: ${(openaiResult.confidence * 100).toFixed(1)}%`);
    console.log(`  Time: ${openaiTime}ms`);
    console.log(`  Grid detected: ${openaiResult.analysis.grid.detected}`);
    console.log(`  Panels found: ${openaiResult.analysis.panels.length}`);

    // Summary
    console.log('\n=== Summary ===');
    console.log(`Anthropic: ${(anthropicResult.confidence * 100).toFixed(1)}% confidence, ${anthropicTime}ms`);
    console.log(`OpenAI:    ${(openaiResult.confidence * 100).toFixed(1)}% confidence, ${openaiTime}ms`);

    const winner = anthropicResult.confidence > openaiResult.confidence ? 'Anthropic' : 'OpenAI';
    console.log(`\nHigher confidence: ${winner}`);

    // Both should find panels
    expect(anthropicResult.analysis.panels.length).toBeGreaterThan(0);
    expect(openaiResult.analysis.panels.length).toBeGreaterThan(0);
  }, 180000);

  it('should compare grid detection accuracy', async () => {
    console.log('\n=== Grid Detection Comparison ===\n');

    const anthropic = new AnthropicProvider(ANTHROPIC_KEY!, 'claude-sonnet-4-20250514');
    const openai = new OpenAIProvider(OPENAI_KEY!, 'gpt-4o');

    const [anthropicResult, openaiResult] = await Promise.all([
      anthropic.analyze(testImage),
      openai.analyze(testImage),
    ]);

    console.log('Anthropic Grid Analysis:');
    console.log(`  Detected: ${anthropicResult.analysis.grid.detected}`);
    console.log(`  Type: ${anthropicResult.analysis.grid.type}`);
    console.log(`  px/mm: ${anthropicResult.analysis.grid.pxPerMm}`);
    console.log(`  Confidence: ${(anthropicResult.analysis.grid.confidence * 100).toFixed(1)}%`);

    console.log('\nOpenAI Grid Analysis:');
    console.log(`  Detected: ${openaiResult.analysis.grid.detected}`);
    console.log(`  Type: ${openaiResult.analysis.grid.type}`);
    console.log(`  px/mm: ${openaiResult.analysis.grid.pxPerMm}`);
    console.log(`  Confidence: ${(openaiResult.analysis.grid.confidence * 100).toFixed(1)}%`);

    // Ground truth: pxPerMm = 10
    const groundTruth = 10;
    const anthropicError = anthropicResult.analysis.grid.pxPerMm
      ? Math.abs(anthropicResult.analysis.grid.pxPerMm - groundTruth) / groundTruth * 100
      : 100;
    const openaiError = openaiResult.analysis.grid.pxPerMm
      ? Math.abs(openaiResult.analysis.grid.pxPerMm - groundTruth) / groundTruth * 100
      : 100;

    console.log(`\nGrid Size Error (ground truth = ${groundTruth} px/mm):`);
    console.log(`  Anthropic: ${anthropicError.toFixed(1)}% error`);
    console.log(`  OpenAI: ${openaiError.toFixed(1)}% error`);

    expect(anthropicResult.analysis.grid.detected || openaiResult.analysis.grid.detected).toBe(true);
  }, 180000);

  it('should compare panel detection accuracy', async () => {
    console.log('\n=== Panel Detection Comparison ===\n');

    const anthropic = new AnthropicProvider(ANTHROPIC_KEY!, 'claude-sonnet-4-20250514');
    const openai = new OpenAIProvider(OPENAI_KEY!, 'gpt-4o');

    const [anthropicResult, openaiResult] = await Promise.all([
      anthropic.analyze(testImage),
      openai.analyze(testImage),
    ]);

    const expectedLeads = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

    const anthropicLeads = anthropicResult.analysis.panels
      .map(p => p.lead)
      .filter(l => l !== null);
    const openaiLeads = openaiResult.analysis.panels
      .map(p => p.lead)
      .filter(l => l !== null);

    const anthropicMatches = anthropicLeads.filter(l => expectedLeads.includes(l!)).length;
    const openaiMatches = openaiLeads.filter(l => expectedLeads.includes(l!)).length;

    console.log('Anthropic Panel Detection:');
    console.log(`  Panels found: ${anthropicResult.analysis.panels.length}`);
    console.log(`  Leads identified: ${anthropicLeads.length}`);
    console.log(`  Correct leads: ${anthropicMatches}/12`);
    console.log(`  Leads: ${anthropicLeads.join(', ')}`);

    console.log('\nOpenAI Panel Detection:');
    console.log(`  Panels found: ${openaiResult.analysis.panels.length}`);
    console.log(`  Leads identified: ${openaiLeads.length}`);
    console.log(`  Correct leads: ${openaiMatches}/12`);
    console.log(`  Leads: ${openaiLeads.join(', ')}`);

    console.log(`\nPanel Detection Accuracy:`);
    console.log(`  Anthropic: ${(anthropicMatches / 12 * 100).toFixed(1)}%`);
    console.log(`  OpenAI: ${(openaiMatches / 12 * 100).toFixed(1)}%`);

    expect(anthropicMatches + openaiMatches).toBeGreaterThan(0);
  }, 180000);
});

describeWithKeys('Claude vs GPT-5.2 Pro Comparison', () => {
  let testImage: ImageData;

  beforeAll(() => {
    testImage = createTestImage();
  });

  it('should compare Claude Sonnet vs GPT-5.2 Pro', async () => {
    console.log('\n=== Claude Sonnet 4 vs GPT-5.2 Pro ===\n');

    // Test Claude
    console.log('Testing Claude Sonnet 4...');
    const anthropic = new AnthropicProvider(ANTHROPIC_KEY!, 'claude-sonnet-4-20250514');
    const claudeStart = Date.now();
    const claudeResult = await anthropic.analyze(testImage);
    const claudeTime = Date.now() - claudeStart;

    console.log(`  Confidence: ${(claudeResult.confidence * 100).toFixed(1)}%`);
    console.log(`  Time: ${claudeTime}ms`);
    console.log(`  Panels: ${claudeResult.analysis.panels.length}`);
    console.log(`  Leads: ${claudeResult.analysis.panels.map(p => p.lead).filter(l => l).join(', ')}`);

    // Test GPT-5.2 Pro
    console.log('\nTesting GPT-5.2 Pro...');
    const openai = new OpenAIProvider(OPENAI_KEY!, GPT_5_2_PRO);

    let gptResult;
    let gptTime = 0;
    let gptError: string | null = null;

    try {
      const gptStart = Date.now();
      gptResult = await openai.analyze(testImage);
      gptTime = Date.now() - gptStart;

      console.log(`  Confidence: ${(gptResult.confidence * 100).toFixed(1)}%`);
      console.log(`  Time: ${gptTime}ms`);
      console.log(`  Panels: ${gptResult.analysis.panels.length}`);
      console.log(`  Leads: ${gptResult.analysis.panels.map(p => p.lead).filter(l => l).join(', ')}`);
    } catch (error) {
      gptError = (error as Error).message;
      console.log(`  Error: ${gptError}`);
      console.log('  (GPT-5.2 Pro may require API access - falling back to GPT-4o)');

      // Fallback to GPT-4o
      const fallback = new OpenAIProvider(OPENAI_KEY!, 'gpt-4o');
      const fallbackStart = Date.now();
      gptResult = await fallback.analyze(testImage);
      gptTime = Date.now() - fallbackStart;
      console.log('\n  GPT-4o Fallback:');
      console.log(`    Confidence: ${(gptResult.confidence * 100).toFixed(1)}%`);
      console.log(`    Time: ${gptTime}ms`);
    }

    // Summary
    console.log('\n=== Comparison Summary ===');
    const claudeLeads = claudeResult.analysis.panels.filter(p => p.lead).length;
    const gptLeads = gptResult ? gptResult.analysis.panels.filter(p => p.lead).length : 0;

    console.log(`Claude Sonnet 4: ${(claudeResult.confidence * 100).toFixed(1)}% confidence, ${claudeLeads}/12 leads, ${claudeTime}ms`);
    if (gptResult) {
      console.log(`OpenAI: ${(gptResult.confidence * 100).toFixed(1)}% confidence, ${gptLeads}/12 leads, ${gptTime}ms`);
    }

    const winner = gptResult && gptResult.confidence > claudeResult.confidence ? 'OpenAI' : 'Claude';
    console.log(`\nWinner: ${winner}`);

    expect(claudeResult.analysis.panels.length).toBeGreaterThan(0);
  }, 300000); // 5 minute timeout for GPT-5.2 Pro (can be slow)
});

const describeWithXAI = (ANTHROPIC_KEY && XAI_KEY) ? describe : describe.skip;

describeWithXAI('Claude vs Grok 4 Heavy Comparison', () => {
  let testImage: ImageData;

  beforeAll(() => {
    testImage = createTestImage();
  });

  it('should compare Claude Opus 4.5 vs Grok', async () => {
    console.log('\n=== Claude Opus 4.5 vs Grok ===\n');

    // Test Claude Opus 4.5
    console.log('Testing Claude Opus 4.5...');
    const anthropic = new AnthropicProvider(ANTHROPIC_KEY!, 'claude-opus-4-5-20251101');
    const claudeStart = Date.now();
    const claudeResult = await anthropic.analyze(testImage);
    const claudeTime = Date.now() - claudeStart;

    console.log(`  Confidence: ${(claudeResult.confidence * 100).toFixed(1)}%`);
    console.log(`  Time: ${claudeTime}ms`);
    console.log(`  Panels: ${claudeResult.analysis.panels.length}`);
    console.log(`  Leads: ${claudeResult.analysis.panels.map(p => p.lead).filter(l => l).join(', ')}`);

    // Test Grok - try different model names (grok-4-heavy may require special access)
    const grokModels = [
      'grok-4-heavy',      // Grok 4 Heavy (may require waitlist access)
      'grok-4',            // Grok 4
      'grok-2-vision',     // Grok 2 Vision (confirmed working)
      'grok-vision-beta',  // Grok Vision beta
      'grok-2',            // Grok 2
      'grok-beta',         // Grok beta
    ];
    let grokResult: any = null;
    let grokTime = 0;
    let grokModel = '';

    for (const model of grokModels) {
      console.log(`\nTrying ${model}...`);
      const grok = new XAIProvider(XAI_KEY!, model);

      try {
        const grokStart = Date.now();
        grokResult = await grok.analyze(testImage);
        grokTime = Date.now() - grokStart;
        grokModel = model;

        console.log(`  ✓ Success with ${model}`);
        console.log(`  Confidence: ${(grokResult.confidence * 100).toFixed(1)}%`);
        console.log(`  Time: ${grokTime}ms`);
        console.log(`  Panels: ${grokResult.analysis.panels.length}`);
        console.log(`  Leads: ${grokResult.analysis.panels.map((p: any) => p.lead).filter((l: any) => l).join(', ')}`);
        break;
      } catch (error) {
        console.log(`  ✗ Failed: ${(error as Error).message.substring(0, 80)}...`);
      }
    }

    // Summary
    console.log('\n=== Comparison Summary ===');
    const claudeLeads = claudeResult.analysis.panels.filter(p => p.lead).length;

    console.log(`Claude Opus 4.5: ${(claudeResult.confidence * 100).toFixed(1)}% confidence, ${claudeLeads}/12 leads, ${claudeTime}ms`);

    if (grokResult) {
      const grokLeads = grokResult.analysis.panels.filter((p: any) => p.lead).length;
      console.log(`Grok (${grokModel}): ${(grokResult.confidence * 100).toFixed(1)}% confidence, ${grokLeads}/12 leads, ${grokTime}ms`);

      const winner = grokResult.confidence > claudeResult.confidence ? 'Grok' : 'Claude';
      console.log(`\nWinner: ${winner}`);
    } else {
      console.log('Grok: All models failed');
    }

    expect(claudeResult.analysis.panels.length).toBeGreaterThan(0);
  }, 300000);
});

describe('AI Comparison Test Structure', () => {
  it('should check for API keys', () => {
    if (!ANTHROPIC_KEY || !OPENAI_KEY) {
      console.log('\n⚠️  Both API keys required for comparison tests');
      console.log('Set ANTHROPIC_API_KEY and OPENAI_API_KEY environment variables\n');
    }
    if (!XAI_KEY) {
      console.log('ℹ️  Set XAI_API_KEY for Grok comparison tests\n');
    }
    expect(true).toBe(true);
  });
});
