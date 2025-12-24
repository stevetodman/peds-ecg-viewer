/**
 * ECG Waveform Renderer
 *
 * Renders ECG waveform traces on the grid with DPI-aware scaling
 * and automatic DC offset removal for proper baseline alignment.
 *
 * @module renderer/components/waveform
 */

import { MUSE_SPEC } from '../../config/muse-spec';
import type { Color, PaperSpeed, Gain } from '../../types';
import type { GridMetrics } from './grid';

/**
 * Waveform renderer configuration (legacy - uses GridMetrics)
 */
export interface WaveformRendererConfig {
  /** Grid metrics from GridRenderer */
  metrics: GridMetrics;
  /** Sample rate of input signal (Hz) */
  sampleRate: number;
  /** Paper speed (mm/sec) - default 25 */
  paperSpeed?: PaperSpeed;
  /** Gain (mm/mV) - default 10 */
  gain?: Gain;
  /** Line color */
  color?: Color;
  /** Line width in pixels */
  lineWidth?: number;
}

/**
 * DPI-aware waveform renderer configuration
 */
export interface WaveformRendererOptions {
  /** Target DPI for rendering */
  dpi: number;
  /** Sample rate of input signal (Hz) */
  sampleRate: number;
  /** Paper speed (mm/sec) - default 25 */
  paperSpeed?: number;
  /** Gain (mm/mV) - default 10 */
  gain?: number;
}

/**
 * ECG Waveform Renderer
 */
export class WaveformRenderer {
  private ctx: CanvasRenderingContext2D;
  private config: Required<WaveformRendererConfig>;
  private pxPerSample: number;
  private pxPerUv: number;

  constructor(ctx: CanvasRenderingContext2D, config: WaveformRendererConfig) {
    this.ctx = ctx;

    this.config = {
      metrics: config.metrics,
      sampleRate: config.sampleRate,
      paperSpeed: config.paperSpeed ?? MUSE_SPEC.defaultPaperSpeed,
      gain: config.gain ?? MUSE_SPEC.defaultGain,
      color: config.color ?? MUSE_SPEC.waveform.color,
      lineWidth: config.lineWidth ?? 1.5,
    };

    // Calculate conversion factors
    // Pixels per second = pxPerMm * paperSpeed (mm/sec)
    const pxPerSecond = this.config.metrics.pxPerMm * this.config.paperSpeed;
    // Pixels per sample = pxPerSecond / sampleRate
    this.pxPerSample = pxPerSecond / this.config.sampleRate;

    // Pixels per microvolt
    // gain is mm/mV, so mm/µV = gain/1000
    // pxPerUv = pxPerMm * (gain/1000)
    this.pxPerUv = this.config.metrics.pxPerMm * (this.config.gain / 1000);
  }

  /**
   * Render a waveform segment with DC offset removal
   *
   * @param samples - Signal data in microvolts (µV)
   * @param startX - Starting X position in pixels
   * @param baselineY - Baseline Y position in pixels (0mV line)
   * @param maxWidth - Maximum width to render (optional)
   */
  render(
    samples: number[],
    startX: number,
    baselineY: number,
    maxWidth?: number
  ): void {
    if (samples.length === 0) return;

    const ctx = this.ctx;
    const { color, lineWidth } = this.config;

    // Remove DC offset - center signal around zero
    // This ensures all leads align to their baseline
    const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length;

    ctx.strokeStyle = color.hex;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();

    let firstPoint = true;

    for (let i = 0; i < samples.length; i++) {
      const x = startX + i * this.pxPerSample;

      // Stop if we exceed max width
      if (maxWidth !== undefined && x > startX + maxWidth) break;

      // Subtract mean to remove DC offset
      // Y is inverted: positive voltage goes UP on screen (negative Y direction)
      const y = baselineY - (samples[i] - mean) * this.pxPerUv;

      if (firstPoint) {
        ctx.moveTo(x, y);
        firstPoint = false;
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }

  /**
   * Render a calibration pulse (1mV, 200ms square wave)
   *
   * @param x - Starting X position
   * @param baselineY - Baseline Y position
   */
  renderCalibrationPulse(x: number, baselineY: number): void {
    const ctx = this.ctx;
    const { color, lineWidth, metrics, gain } = this.config;

    // 1mV = gain mm = gain * pxPerMm pixels
    const pulseHeight = metrics.pxPerMm * gain;
    // 200ms at paperSpeed mm/sec
    const pulseWidth = metrics.pxPerMm * this.config.paperSpeed * 0.2;

    ctx.strokeStyle = color.hex;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';

    ctx.beginPath();
    ctx.moveTo(x, baselineY);
    ctx.lineTo(x, baselineY - pulseHeight);
    ctx.lineTo(x + pulseWidth, baselineY - pulseHeight);
    ctx.lineTo(x + pulseWidth, baselineY);
    ctx.stroke();
  }

  /**
   * Get the width in pixels for a given duration
   */
  getDurationWidth(seconds: number): number {
    return this.config.metrics.pxPerMm * this.config.paperSpeed * seconds;
  }

  /**
   * Get the height in pixels for a given voltage
   */
  getVoltageHeight(millivolts: number): number {
    return this.config.metrics.pxPerMm * this.config.gain * millivolts;
  }

  /**
   * Get samples needed for a given duration
   */
  getSamplesForDuration(seconds: number): number {
    return Math.round(this.config.sampleRate * seconds);
  }
}

/**
 * Convenience function to render a single lead
 */
export function renderLead(
  ctx: CanvasRenderingContext2D,
  samples: number[],
  sampleRate: number,
  metrics: GridMetrics,
  startX: number,
  baselineY: number,
  maxWidth?: number
): void {
  const renderer = new WaveformRenderer(ctx, { metrics, sampleRate });
  renderer.render(samples, startX, baselineY, maxWidth);
}
