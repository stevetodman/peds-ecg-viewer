/**
 * AI Response Cache
 * Cache AI analysis results to avoid redundant API calls
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { AIAnalysisResult } from '../types';

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Enable caching */
  enabled: boolean;

  /** Cache directory */
  cacheDir: string;

  /** Cache TTL in milliseconds (default: 7 days) */
  ttlMs: number;

  /** Maximum cache size in bytes (default: 100MB) */
  maxSizeBytes: number;
}

const DEFAULT_CONFIG: CacheConfig = {
  enabled: true,
  cacheDir: '.cache/ecg-digitizer',
  ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxSizeBytes: 100 * 1024 * 1024, // 100MB
};

/**
 * Cache entry metadata
 */
interface CacheEntry {
  hash: string;
  timestamp: number;
  promptHash: string;
  result: AIAnalysisResult;
}

/**
 * AI Response Cache
 */
export class AICache {
  private config: CacheConfig;
  private memoryCache: Map<string, CacheEntry> = new Map();

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.enabled) {
      this.ensureCacheDir();
    }
  }

  /**
   * Generate a hash for an image
   */
  hashImage(imageData: ImageData): string {
    // Hash a sample of pixels for speed (every 100th pixel)
    const sample: number[] = [];
    const step = Math.max(1, Math.floor(imageData.data.length / 1000));

    for (let i = 0; i < imageData.data.length; i += step) {
      sample.push(imageData.data[i]);
    }

    // Include dimensions in hash
    sample.push(imageData.width, imageData.height);

    const hash = createHash('sha256');
    hash.update(Buffer.from(sample));
    return hash.digest('hex').substring(0, 16);
  }

  /**
   * Generate a hash for a prompt
   */
  hashPrompt(prompt: string): string {
    const hash = createHash('sha256');
    hash.update(prompt);
    return hash.digest('hex').substring(0, 8);
  }

  /**
   * Get cache key
   */
  getCacheKey(imageHash: string, promptHash: string): string {
    return `${imageHash}_${promptHash}`;
  }

  /**
   * Get cached result if available and not expired
   */
  get(imageData: ImageData, prompt: string): AIAnalysisResult | null {
    if (!this.config.enabled) return null;

    const imageHash = this.hashImage(imageData);
    const promptHash = this.hashPrompt(prompt);
    const cacheKey = this.getCacheKey(imageHash, promptHash);

    // Check memory cache first
    const memEntry = this.memoryCache.get(cacheKey);
    if (memEntry && !this.isExpired(memEntry)) {
      console.log(`[Cache] Memory hit for ${cacheKey}`);
      return memEntry.result;
    }

    // Check disk cache
    const diskEntry = this.readFromDisk(cacheKey);
    if (diskEntry && !this.isExpired(diskEntry)) {
      console.log(`[Cache] Disk hit for ${cacheKey}`);
      // Promote to memory cache
      this.memoryCache.set(cacheKey, diskEntry);
      return diskEntry.result;
    }

    console.log(`[Cache] Miss for ${cacheKey}`);
    return null;
  }

  /**
   * Store result in cache
   */
  set(imageData: ImageData, prompt: string, result: AIAnalysisResult): void {
    if (!this.config.enabled) return;

    const imageHash = this.hashImage(imageData);
    const promptHash = this.hashPrompt(prompt);
    const cacheKey = this.getCacheKey(imageHash, promptHash);

    const entry: CacheEntry = {
      hash: imageHash,
      timestamp: Date.now(),
      promptHash,
      result,
    };

    // Store in memory
    this.memoryCache.set(cacheKey, entry);

    // Store on disk
    this.writeToDisk(cacheKey, entry);

    console.log(`[Cache] Stored ${cacheKey}`);
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.config.ttlMs;
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDir(): void {
    if (!existsSync(this.config.cacheDir)) {
      mkdirSync(this.config.cacheDir, { recursive: true });
    }
  }

  /**
   * Read entry from disk
   */
  private readFromDisk(cacheKey: string): CacheEntry | null {
    const filePath = join(this.config.cacheDir, `${cacheKey}.json`);

    try {
      if (existsSync(filePath)) {
        const data = readFileSync(filePath, 'utf-8');
        return JSON.parse(data) as CacheEntry;
      }
    } catch (error) {
      console.warn(`[Cache] Failed to read ${cacheKey}:`, error);
    }

    return null;
  }

  /**
   * Write entry to disk
   */
  private writeToDisk(cacheKey: string, entry: CacheEntry): void {
    const filePath = join(this.config.cacheDir, `${cacheKey}.json`);

    try {
      writeFileSync(filePath, JSON.stringify(entry, null, 2));
    } catch (error) {
      console.warn(`[Cache] Failed to write ${cacheKey}:`, error);
    }
  }

  /**
   * Clear expired entries
   */
  clearExpired(): number {
    let cleared = 0;

    // Clear memory cache
    for (const [key, entry] of this.memoryCache) {
      if (this.isExpired(entry)) {
        this.memoryCache.delete(key);
        cleared++;
      }
    }

    // Note: Disk cleanup would require listing directory
    // Skipped for simplicity

    return cleared;
  }

  /**
   * Clear all cache
   */
  clearAll(): void {
    this.memoryCache.clear();
    // Note: Would also clear disk cache
  }

  /**
   * Get cache stats
   */
  getStats(): { memoryEntries: number; enabled: boolean } {
    return {
      memoryEntries: this.memoryCache.size,
      enabled: this.config.enabled,
    };
  }
}

// Singleton instance
let defaultCache: AICache | null = null;

export function getDefaultCache(): AICache {
  if (!defaultCache) {
    defaultCache = new AICache();
  }
  return defaultCache;
}
