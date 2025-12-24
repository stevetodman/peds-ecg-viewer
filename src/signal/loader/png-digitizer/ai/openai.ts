/**
 * OpenAI Provider
 * OpenAI Vision API integration for ECG image analysis
 * Supports GPT-4o, GPT-4V, and GPT-5.2 Pro
 *
 * @module signal/loader/png-digitizer/ai/openai
 */

import { BaseAIProvider } from './provider';
import type { OpenAIChatResponse, OpenAIResponsesResponse } from './api-types';

/**
 * GPT-5.2 Pro models that use the Responses API
 */
const RESPONSES_API_MODELS = ['gpt-5.2-pro', 'gpt-5-pro', 'gpt-5.2'];

/**
 * OpenAI AI Provider
 * Supports GPT-4o, GPT-4V, and GPT-5.2 Pro
 */
export class OpenAIProvider extends BaseAIProvider {
  name = 'openai';

  constructor(apiKey: string, model?: string) {
    super(apiKey, model);
    this.initModel('gpt-4o');
  }

  protected async callAPI(imageBase64: string, prompt: string): Promise<string> {
    // Check if using GPT-5.2 Pro (requires Responses API)
    if (RESPONSES_API_MODELS.some(m => this.model.startsWith(m))) {
      return this.callResponsesAPI(imageBase64, prompt);
    }

    // Standard Chat Completions API for GPT-4 models
    return this.callChatCompletionsAPI(imageBase64, prompt);
  }

  /**
   * Call the standard Chat Completions API (GPT-4 models)
   */
  private async callChatCompletionsAPI(imageBase64: string, prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${imageBase64}`,
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
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as OpenAIChatResponse;

    const choices = data.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new Error('Empty response from OpenAI API');
    }

    const message = choices[0]?.message;
    if (!message?.content) {
      throw new Error('No content in OpenAI API response');
    }

    return message.content;
  }

  /**
   * Call the Responses API (GPT-5.2 Pro models)
   * GPT-5.2 Pro uses the Responses API for multi-turn interactions
   */
  private async callResponsesAPI(imageBase64: string, prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_image',
                image_url: `data:image/png;base64,${imageBase64}`,
              },
              {
                type: 'input_text',
                text: prompt,
              },
            ],
          },
        ],
        reasoning: {
          effort: 'high', // Use high reasoning for accurate ECG analysis
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Responses API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as OpenAIResponsesResponse;

    // Extract output from Responses API format
    const output = data.output;
    if (!Array.isArray(output) || output.length === 0) {
      throw new Error('Empty output from OpenAI Responses API');
    }

    // Find the text content in the output
    for (const item of output) {
      if (item.type === 'message' && item.content) {
        for (const contentItem of item.content) {
          if (contentItem.type === 'output_text' && 'text' in contentItem) {
            return contentItem.text;
          }
        }
      }
    }

    throw new Error('No text content in OpenAI Responses API output');
  }
}
