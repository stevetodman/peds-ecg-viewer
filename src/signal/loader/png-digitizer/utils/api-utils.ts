/**
 * API Utilities
 * Rate limiting, retry logic, cost tracking, caching, and batch processing
 *
 * @module signal/loader/png-digitizer/utils/api-utils
 */

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /** Maximum requests per minute */
  requestsPerMinute: number;

  /** Maximum tokens per minute (for AI APIs) */
  tokensPerMinute?: number;

  /** Burst allowance */
  burstSize?: number;
}

/**
 * Rate limiter for API calls
 */
export class RateLimiter {
  private config: Required<RateLimiterConfig>;
  private requestTimestamps: number[] = [];
  private tokenCount: number = 0;
  private lastTokenReset: number = Date.now();

  constructor(config: RateLimiterConfig) {
    this.config = {
      requestsPerMinute: config.requestsPerMinute,
      tokensPerMinute: config.tokensPerMinute ?? Infinity,
      burstSize: config.burstSize ?? Math.ceil(config.requestsPerMinute / 10),
    };
  }

  /**
   * Wait for rate limit clearance
   */
  async acquire(estimatedTokens: number = 0): Promise<void> {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window

    // Clean old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(t => t > windowStart);

    // Reset token count if minute passed
    if (now - this.lastTokenReset > 60000) {
      this.tokenCount = 0;
      this.lastTokenReset = now;
    }

    // Check if we need to wait
    if (this.requestTimestamps.length >= this.config.requestsPerMinute) {
      const oldestInWindow = this.requestTimestamps[0];
      const waitTime = oldestInWindow + 60000 - now + 100; // Add 100ms buffer
      if (waitTime > 0) {
        await this.sleep(waitTime);
        return this.acquire(estimatedTokens); // Retry
      }
    }

    // Check token limit
    if (this.tokenCount + estimatedTokens > this.config.tokensPerMinute) {
      const waitTime = this.lastTokenReset + 60000 - now + 100;
      if (waitTime > 0) {
        await this.sleep(waitTime);
        return this.acquire(estimatedTokens);
      }
    }

    // Record this request
    this.requestTimestamps.push(now);
    this.tokenCount += estimatedTokens;
  }

  /**
   * Record actual token usage after request
   */
  recordTokens(actualTokens: number, estimatedTokens: number = 0): void {
    // Adjust token count if estimate was off
    this.tokenCount += (actualTokens - estimatedTokens);
  }

  /**
   * Get current rate status
   */
  getStatus(): { requestsRemaining: number; tokensRemaining: number; resetIn: number } {
    const now = Date.now();
    const windowStart = now - 60000;
    const recentRequests = this.requestTimestamps.filter(t => t > windowStart).length;

    return {
      requestsRemaining: Math.max(0, this.config.requestsPerMinute - recentRequests),
      tokensRemaining: Math.max(0, this.config.tokensPerMinute - this.tokenCount),
      resetIn: Math.max(0, this.lastTokenReset + 60000 - now),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxAttempts: number;

  /** Initial delay in ms */
  initialDelay: number;

  /** Maximum delay in ms */
  maxDelay: number;

  /** Exponential backoff multiplier */
  backoffMultiplier: number;

  /** Retry on these status codes */
  retryableStatuses: number[];

  /** Retry on these error types */
  retryableErrors: string[];
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableStatuses: [429, 500, 502, 503, 504],
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'network'],
};

/**
 * Retry wrapper for async functions
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;
  let delay = cfg.initialDelay;

  for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if retryable
      const isRetryable = isRetryableError(error, cfg);

      if (!isRetryable || attempt === cfg.maxAttempts - 1) {
        throw error;
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * cfg.backoffMultiplier, cfg.maxDelay);
    }
  }

  throw lastError;
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: any, config: RetryConfig): boolean {
  // Check status code
  if (error.status && config.retryableStatuses.includes(error.status)) {
    return true;
  }

  // Check error code
  if (error.code && config.retryableErrors.some(e => error.code.includes(e))) {
    return true;
  }

  // Check error message
  if (error.message) {
    const msg = error.message.toLowerCase();
    if (config.retryableErrors.some(e => msg.includes(e.toLowerCase()))) {
      return true;
    }
  }

  return false;
}

/**
 * API cost tracking
 */
export interface APICostEntry {
  timestamp: Date;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  operation: string;
}

/**
 * API cost tracker
 */
export class APICostTracker {
  private entries: APICostEntry[] = [];
  private costPerToken: Record<string, { input: number; output: number }> = {
    // Anthropic pricing (per 1M tokens)
    'claude-3-opus': { input: 15 / 1000000, output: 75 / 1000000 },
    'claude-3-sonnet': { input: 3 / 1000000, output: 15 / 1000000 },
    'claude-sonnet-4': { input: 3 / 1000000, output: 15 / 1000000 },
    'claude-3-haiku': { input: 0.25 / 1000000, output: 1.25 / 1000000 },

    // OpenAI pricing
    'gpt-4o': { input: 5 / 1000000, output: 15 / 1000000 },
    'gpt-4-turbo': { input: 10 / 1000000, output: 30 / 1000000 },
    'gpt-4': { input: 30 / 1000000, output: 60 / 1000000 },

    // Google pricing
    'gemini-1.5-pro': { input: 3.5 / 1000000, output: 10.5 / 1000000 },
    'gemini-1.5-flash': { input: 0.35 / 1000000, output: 1.05 / 1000000 },

    // xAI pricing (estimated)
    'grok-2': { input: 5 / 1000000, output: 15 / 1000000 },
  };

  /**
   * Record API usage
   */
  record(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    operation: string = 'analyze'
  ): APICostEntry {
    // Find matching pricing
    const pricing = this.findPricing(model);
    const cost = inputTokens * pricing.input + outputTokens * pricing.output;

    const entry: APICostEntry = {
      timestamp: new Date(),
      provider,
      model,
      inputTokens,
      outputTokens,
      cost,
      operation,
    };

    this.entries.push(entry);
    return entry;
  }

  /**
   * Get total cost
   */
  getTotalCost(): number {
    return this.entries.reduce((sum, e) => sum + e.cost, 0);
  }

  /**
   * Get cost by provider
   */
  getCostByProvider(): Record<string, number> {
    const byProvider: Record<string, number> = {};
    for (const entry of this.entries) {
      byProvider[entry.provider] = (byProvider[entry.provider] || 0) + entry.cost;
    }
    return byProvider;
  }

  /**
   * Get cost for time period
   */
  getCostForPeriod(startDate: Date, endDate: Date = new Date()): number {
    return this.entries
      .filter(e => e.timestamp >= startDate && e.timestamp <= endDate)
      .reduce((sum, e) => sum + e.cost, 0);
  }

  /**
   * Get all entries
   */
  getEntries(): APICostEntry[] {
    return [...this.entries];
  }

  /**
   * Clear entries
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Set custom pricing for a model
   */
  setPricing(model: string, inputCostPer1M: number, outputCostPer1M: number): void {
    this.costPerToken[model] = {
      input: inputCostPer1M / 1000000,
      output: outputCostPer1M / 1000000,
    };
  }

  private findPricing(model: string): { input: number; output: number } {
    // Try exact match first
    if (this.costPerToken[model]) {
      return this.costPerToken[model];
    }

    // Try prefix match
    for (const key of Object.keys(this.costPerToken)) {
      if (model.includes(key) || key.includes(model)) {
        return this.costPerToken[key];
      }
    }

    // Default to claude-3-sonnet pricing
    return this.costPerToken['claude-3-sonnet'];
  }
}

/**
 * Result cache
 */
export class ResultCache<T> {
  private cache = new Map<string, { value: T; timestamp: number }>();
  private maxAge: number;
  private maxSize: number;

  constructor(maxAgeMs: number = 3600000, maxSize: number = 100) {
    this.maxAge = maxAgeMs;
    this.maxSize = maxSize;
  }

  /**
   * Get cached result
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check if expired
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set cached result
   */
  set(key: string, value: T): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = [...this.cache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) {
        this.cache.delete(oldest[0]);
      }
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  /**
   * Generate cache key from image data
   */
  static hashImageData(imageData: ImageData): string {
    const data = imageData.data;
    let hash = 0;

    // Sample every 1000th byte for speed
    for (let i = 0; i < data.length; i += 1000) {
      hash = ((hash << 5) - hash) + data[i];
      hash = hash & hash;
    }

    return `${imageData.width}x${imageData.height}_${hash.toString(16)}`;
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getStats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

/**
 * Batch processor for multiple images
 */
export interface BatchProcessorConfig<T> {
  /** Maximum concurrent operations */
  concurrency: number;

  /** Rate limiter to use */
  rateLimiter?: RateLimiter;

  /** Progress callback */
  onProgress?: (completed: number, total: number, result?: T) => void;

  /** Error callback */
  onError?: (index: number, error: Error) => void;

  /** Continue on error */
  continueOnError?: boolean;
}

/**
 * Batch process results
 */
export interface BatchResult<T> {
  results: (T | null)[];
  errors: Array<{ index: number; error: Error }>;
  successCount: number;
  errorCount: number;
  totalTimeMs: number;
}

/**
 * Process items in batches with concurrency control
 */
export async function batchProcess<I, O>(
  items: I[],
  processor: (item: I, index: number) => Promise<O>,
  config: BatchProcessorConfig<O>
): Promise<BatchResult<O>> {
  const startTime = Date.now();
  const results: (O | null)[] = new Array(items.length).fill(null);
  const errors: Array<{ index: number; error: Error }> = [];

  let completed = 0;
  let activeCount = 0;
  let currentIndex = 0;

  const processNext = async (): Promise<void> => {
    while (currentIndex < items.length) {
      if (activeCount >= config.concurrency) {
        await new Promise(resolve => setTimeout(resolve, 10));
        continue;
      }

      const index = currentIndex++;
      activeCount++;

      try {
        // Wait for rate limit
        if (config.rateLimiter) {
          await config.rateLimiter.acquire();
        }

        const result = await processor(items[index], index);
        results[index] = result;

        completed++;
        config.onProgress?.(completed, items.length, result);
      } catch (error: any) {
        errors.push({ index, error });
        config.onError?.(index, error);

        if (!config.continueOnError) {
          throw error;
        }
      } finally {
        activeCount--;
      }
    }
  };

  // Start concurrent processors
  const workers = Array(config.concurrency)
    .fill(null)
    .map(() => processNext());

  await Promise.all(workers);

  return {
    results,
    errors,
    successCount: results.filter(r => r !== null).length,
    errorCount: errors.length,
    totalTimeMs: Date.now() - startTime,
  };
}

// Singleton instances for convenience
export const defaultRateLimiter = new RateLimiter({ requestsPerMinute: 60 });
export const defaultCostTracker = new APICostTracker();
