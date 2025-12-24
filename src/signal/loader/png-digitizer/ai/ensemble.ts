/**
 * Multi-AI Ensemble Provider
 * Combines multiple AI providers for improved accuracy
 *
 * @module signal/loader/png-digitizer/ai/ensemble
 */

import { BaseAIProvider, type AIProvider } from './provider';
import type { AIAnalysisResult } from '../types';
import type { XAIResponse } from './api-types';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';

/**
 * Configuration for xAI/Grok provider
 */
export interface XAIConfig {
  apiKey: string;
  model?: string;
}

/**
 * Ensemble mode configuration
 */
export interface EnsembleConfig {
  /** Primary provider (first to try) */
  primary?: 'anthropic' | 'openai' | 'xai';

  /** Fallback providers (tried if primary fails or low confidence) */
  fallbacks?: ('anthropic' | 'openai' | 'xai')[];

  /** Minimum confidence to accept without fallback */
  minConfidence?: number;

  /** Run providers in parallel for speed */
  parallel?: boolean;

  /** API keys for each provider */
  apiKeys: {
    anthropic?: string;
    openai?: string;
    xai?: string;
  };

  /** Models for each provider */
  models?: {
    anthropic?: string;
    openai?: string;
    xai?: string;
  };
}

/**
 * xAI/Grok Provider
 * Uses xAI API which is compatible with OpenAI's format
 * Extends BaseAIProvider to get automatic image compression
 */
export class XAIProvider extends BaseAIProvider {
  name = 'xai';

  constructor(apiKey: string, model?: string) {
    super(apiKey, model);
    this.initModel('grok-2-vision-1212');
  }

  protected async callAPI(imageBase64: string, prompt: string): Promise<string> {
    // Use proxy in browser to avoid CORS, direct API in Node.js
    const isBrowser = typeof window !== 'undefined';
    const apiUrl = isBrowser ? '/api/xai' : 'https://api.x.ai/v1/chat/completions';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Only add auth header when calling direct API (proxy handles auth)
    if (!isBrowser) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
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
      const error = await response.text();
      throw new Error(`xAI API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as XAIResponse;
    const choice = data.choices[0];
    if (!choice?.message?.content) {
      throw new Error('No content in xAI API response');
    }
    return choice.message.content;
  }
}

/**
 * Ensemble provider that combines multiple AI providers
 */
export class EnsembleProvider implements AIProvider {
  name = 'ensemble';
  private config: Required<EnsembleConfig>;
  private providers: Map<string, AIProvider>;

  constructor(config: EnsembleConfig) {
    this.config = {
      primary: config.primary ?? 'anthropic',
      fallbacks: config.fallbacks ?? ['openai'],
      minConfidence: config.minConfidence ?? 0.85,
      parallel: config.parallel ?? false,
      apiKeys: config.apiKeys,
      models: config.models ?? {},
    };

    this.providers = new Map();
    this.initializeProviders();
  }

  private initializeProviders(): void {
    const { apiKeys, models } = this.config;

    if (apiKeys.anthropic) {
      this.providers.set('anthropic', new AnthropicProvider(
        apiKeys.anthropic,
        models.anthropic ?? 'claude-sonnet-4-20250514'
      ));
    }

    if (apiKeys.openai) {
      this.providers.set('openai', new OpenAIProvider(
        apiKeys.openai,
        models.openai ?? 'gpt-4o'
      ));
    }

    if (apiKeys.xai) {
      this.providers.set('xai', new XAIProvider(
        apiKeys.xai,
        models.xai ?? 'grok-2-vision-1212'
      ));
    }
  }

  async analyze(image: ImageData): Promise<AIAnalysisResult> {
    const startTime = Date.now();

    if (this.config.parallel) {
      return this.analyzeParallel(image, startTime);
    } else {
      return this.analyzeSequential(image, startTime);
    }
  }

  /**
   * Run providers sequentially - stop when confidence is high enough
   */
  private async analyzeSequential(image: ImageData, startTime: number): Promise<AIAnalysisResult> {
    const order = [this.config.primary, ...this.config.fallbacks];
    let bestResult: AIAnalysisResult | null = null;

    for (const providerName of order) {
      const provider = this.providers.get(providerName);
      if (!provider) continue;

      try {
        const result = await provider.analyze(image);

        if (result.confidence >= this.config.minConfidence) {
          // Good enough, return immediately
          return {
            ...result,
            provider: `ensemble(${providerName})`,
            processingTimeMs: Date.now() - startTime,
          };
        }

        // Track best result so far
        if (!bestResult || result.confidence > bestResult.confidence) {
          bestResult = result;
        }
      } catch (error) {
        console.warn(`[Ensemble] ${providerName} failed:`, error);
        continue;
      }
    }

    if (!bestResult) {
      throw new Error('All providers failed');
    }

    return {
      ...bestResult,
      provider: `ensemble(${bestResult.provider})`,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Run providers in parallel - select best result
   */
  private async analyzeParallel(image: ImageData, startTime: number): Promise<AIAnalysisResult> {
    const order = [this.config.primary, ...this.config.fallbacks];
    const activeProviders = order
      .map(name => this.providers.get(name))
      .filter((p): p is AIProvider => p !== undefined);

    if (activeProviders.length === 0) {
      throw new Error('No providers configured');
    }

    // Run all providers in parallel
    const results = await Promise.allSettled(
      activeProviders.map(p => p.analyze(image))
    );

    // Find best successful result
    let bestResult: AIAnalysisResult | null = null;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (!bestResult || result.value.confidence > bestResult.confidence) {
          bestResult = result.value;
        }
      }
    }

    if (!bestResult) {
      // All failed - get first error
      const firstError = results.find(r => r.status === 'rejected');
      throw (firstError as PromiseRejectedResult).reason;
    }

    return {
      ...bestResult,
      provider: `ensemble-parallel(${bestResult.provider})`,
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Create an ensemble provider with environment-based configuration
 */
export function createEnsembleProvider(config?: Partial<EnsembleConfig>): EnsembleProvider {
  const apiKeys = {
    anthropic: config?.apiKeys?.anthropic ?? process.env.ANTHROPIC_API_KEY,
    openai: config?.apiKeys?.openai ?? process.env.OPENAI_API_KEY,
    xai: config?.apiKeys?.xai ?? process.env.XAI_API_KEY,
  };

  return new EnsembleProvider({
    ...config,
    apiKeys,
  });
}
