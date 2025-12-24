/**
 * PNG Digitizer Configuration
 * Default settings and configuration utilities
 *
 * @module signal/loader/png-digitizer/config
 */

import type { DigitizerConfig } from './types';

/**
 * Default digitizer configuration
 */
export const DEFAULT_CONFIG: Required<Omit<DigitizerConfig, 'apiKey' | 'model' | 'onProgress' | 'interactive'>> = {
  aiProvider: 'anthropic',
  aiConfidenceThreshold: 0.7,
  enableLocalFallback: true,
  enableInteractive: true,
  targetSampleRate: 500,
};

/**
 * AI Provider default models
 */
export const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-1.5-pro',
} as const;

/**
 * Environment variable names for API keys
 */
export const API_KEY_ENV_VARS = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
} as const;

/**
 * Standard ECG calibration values
 */
export const STANDARD_CALIBRATION = {
  /** Standard gain: 10mm per millivolt */
  gain: 10,
  /** Standard paper speed: 25mm per second */
  paperSpeed: 25,
  /** Standard small grid box: 1mm */
  smallBoxMm: 1,
  /** Standard large grid box: 5mm */
  largeBoxMm: 5,
} as const;

/**
 * Quality thresholds
 */
export const QUALITY_THRESHOLDS = {
  /** Minimum confidence to consider analysis successful */
  minConfidence: 0.6,
  /** Minimum confidence for individual lead */
  minLeadConfidence: 0.5,
  /** Maximum acceptable gap in trace (pixels) */
  maxGapPx: 10,
  /** Minimum points required per lead */
  minPointsPerLead: 50,
} as const;

/**
 * Waveform detection settings
 */
export const WAVEFORM_DETECTION = {
  /** Darkness threshold for black waveforms (0-255) */
  darknessThreshold: 100,
  /** Minimum confidence for accepting a point */
  minPointConfidence: 0.3,
  /** Maximum gap to interpolate */
  maxInterpolateGap: 10,
} as const;

/**
 * Create a complete configuration from partial config
 */
export function createConfig(config: DigitizerConfig = {}): DigitizerConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
  };
}
