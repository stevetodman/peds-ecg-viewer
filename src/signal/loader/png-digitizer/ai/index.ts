/**
 * AI Module
 * Vision AI integration for ECG image analysis
 *
 * @module signal/loader/png-digitizer/ai
 */

export { BaseAIProvider } from './provider';
export type { AIProvider } from './provider';
export { AnthropicProvider } from './anthropic';
export { OpenAIProvider } from './openai';
export { GoogleProvider } from './google';
export { XAIProvider, EnsembleProvider, createEnsembleProvider } from './ensemble';
export type { EnsembleConfig, XAIConfig } from './ensemble';
export { getAnalysisPrompt, getQuickAnalysisPrompt, getGridAnalysisPrompt } from './prompts';
export { parseAIResponse } from './response-parser';
export { validateAnalysis, hasMinimumData, getValidationIssues } from './validator';
export {
  OCRMetadataExtractor,
  extractMetadataFromText,
  mergeMetadata,
} from './ocr-metadata';
export type { ECGMetadata } from './ocr-metadata';

import type { AIProvider } from './provider';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { GoogleProvider } from './google';
import { XAIProvider } from './ensemble';

/**
 * AI provider type
 */
export type AIProviderType = 'anthropic' | 'openai' | 'google' | 'xai';

/**
 * Create an AI provider instance
 */
export function createAIProvider(
  type: AIProviderType,
  apiKey: string,
  model?: string
): AIProvider {
  switch (type) {
    case 'anthropic':
      return new AnthropicProvider(apiKey, model);
    case 'openai':
      return new OpenAIProvider(apiKey, model);
    case 'google':
      return new GoogleProvider(apiKey, model);
    case 'xai':
      return new XAIProvider(apiKey, model);
    default:
      throw new Error(`Unknown AI provider: ${type as string}`);
  }
}

/**
 * Get API key from environment
 */
export function getEnvApiKey(provider: AIProviderType): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    switch (provider) {
      case 'anthropic':
        return process.env.ANTHROPIC_API_KEY;
      case 'openai':
        return process.env.OPENAI_API_KEY;
      case 'google':
        return process.env.GOOGLE_API_KEY;
      case 'xai':
        return process.env.XAI_API_KEY;
    }
  }
  return undefined;
}

/**
 * Get default model for provider
 */
export function getDefaultModel(provider: AIProviderType): string {
  switch (provider) {
    case 'anthropic':
      return 'claude-sonnet-4-20250514';
    case 'openai':
      return 'gpt-4o';
    case 'google':
      return 'gemini-1.5-pro';
    case 'xai':
      return 'grok-4';
  }
}
