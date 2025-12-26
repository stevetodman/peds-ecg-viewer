/**
 * Anthropic Claude Provider
 * Claude Vision API integration for ECG image analysis
 *
 * @module signal/loader/png-digitizer/ai/anthropic
 */

import { BaseAIProvider } from './provider';
import type { AnthropicResponse } from './api-types';

/**
 * Anthropic Claude AI Provider
 */
export class AnthropicProvider extends BaseAIProvider {
  name = 'anthropic';

  constructor(apiKey: string, model?: string) {
    super(apiKey, model);
    // Always use Opus 4.5 for best vision accuracy in ECG tracing
    this.initModel('claude-opus-4-5-20251101');
  }

  protected async callAPI(imageBase64: string, prompt: string): Promise<string> {
    // Use proxy in browser to avoid CORS, direct API in Node.js
    const isBrowser = typeof window !== 'undefined';
    const apiUrl = isBrowser ? '/api/anthropic' : 'https://api.anthropic.com/v1/messages';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Only add auth headers when calling direct API (proxy handles auth)
    if (!isBrowser) {
      headers['x-api-key'] = this.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.model,
        max_tokens: 16384,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as AnthropicResponse;

    // Extract text content from response
    const content = data.content;
    if (!Array.isArray(content) || content.length === 0) {
      throw new Error('Empty response from Anthropic API');
    }

    const textContent = content.find((c) => c.type === 'text');
    if (!textContent?.text) {
      throw new Error('No text content in Anthropic API response');
    }

    return textContent.text;
  }
}
