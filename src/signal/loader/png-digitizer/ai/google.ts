/**
 * Google Gemini Provider
 * Google Gemini Vision API integration for ECG image analysis
 *
 * @module signal/loader/png-digitizer/ai/google
 */

import { BaseAIProvider } from './provider';
import type { GeminiResponse } from './api-types';

/**
 * Google Gemini AI Provider
 */
export class GoogleProvider extends BaseAIProvider {
  name = 'google';

  constructor(apiKey: string, model?: string) {
    super(apiKey, model);
    this.initModel('gemini-1.5-pro');
  }

  protected async callAPI(imageBase64: string, prompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: 'image/png',
                  data: imageBase64,
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as GeminiResponse;

    // Extract content from response
    const candidates = data.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new Error('Empty response from Google API');
    }

    const content = candidates[0]?.content;
    if (!content?.parts || !Array.isArray(content.parts) || content.parts.length === 0) {
      throw new Error('No content in Google API response');
    }

    const textPart = content.parts.find((p) => p.text);
    if (!textPart?.text) {
      throw new Error('No text content in Google API response');
    }

    return textPart.text;
  }
}
