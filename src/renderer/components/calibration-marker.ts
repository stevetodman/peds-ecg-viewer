/**
 * ECG Calibration/Standardization Marker Renderer
 *
 * Renders the calibration pulse (1mV square wave) at the start of the ECG.
 * Supports stairstep pattern for mixed gain settings.
 *
 * @module renderer/components/calibration-marker
 */

import { MUSE_SPEC } from '../../config/muse-spec';
import type { Color } from '../../types/config';
import type { Gain } from '../../types/ecg';

/**
 * Calibration marker configuration
 */
export interface CalibrationMarkerConfig {
  /** X position */
  x: number;
  /** Baseline Y position (0mV line) */
  baselineY: number;
  /** Pixels per millimeter */
  pxPerMm: number;
  /** Line color */
  color?: Color;
  /** Line width */
  lineWidth?: number;
}

/**
 * ECG Calibration Marker Renderer
 */
export class CalibrationMarkerRenderer {
  private ctx: CanvasRenderingContext2D;
  private config: Required<CalibrationMarkerConfig>;

  constructor(ctx: CanvasRenderingContext2D, config: CalibrationMarkerConfig) {
    this.ctx = ctx;
    this.config = {
      x: config.x,
      baselineY: config.baselineY,
      pxPerMm: config.pxPerMm,
      color: config.color ?? MUSE_SPEC.waveform.color,
      lineWidth: config.lineWidth ?? 1,
    };
  }

  /**
   * Render a standard calibration marker (single gain)
   * 1mV = gain mm height, 200ms width
   */
  renderStandard(gain: Gain): void {
    const { x, baselineY, pxPerMm, color, lineWidth } = this.config;
    const ctx = this.ctx;

    const height = pxPerMm * gain;
    const width = pxPerMm * 5; // 200ms at 25mm/s = 5mm

    ctx.strokeStyle = color.hex;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';

    ctx.beginPath();
    ctx.moveTo(x, baselineY);
    ctx.lineTo(x, baselineY - height);
    ctx.lineTo(x + width, baselineY - height);
    ctx.lineTo(x + width, baselineY);
    ctx.stroke();
  }

  /**
   * Render a stairstep calibration marker (mixed gains)
   * Shows both limb and precordial gain levels
   */
  renderStairstep(limbGain: Gain, precordialGain: Gain): void {
    const { x, baselineY, pxPerMm, color, lineWidth } = this.config;
    const ctx = this.ctx;

    const limbHeight = pxPerMm * limbGain;
    const precordialHeight = pxPerMm * precordialGain;
    const halfWidth = pxPerMm * 2.5; // Each step is 100ms = 2.5mm

    ctx.strokeStyle = color.hex;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';

    ctx.beginPath();
    // Start at baseline
    ctx.moveTo(x, baselineY);
    // Rise to limb height
    ctx.lineTo(x, baselineY - limbHeight);
    // Horizontal at limb height
    ctx.lineTo(x + halfWidth, baselineY - limbHeight);
    // Rise/fall to precordial height
    ctx.lineTo(x + halfWidth, baselineY - precordialHeight);
    // Horizontal at precordial height
    ctx.lineTo(x + halfWidth * 2, baselineY - precordialHeight);
    // Return to baseline
    ctx.lineTo(x + halfWidth * 2, baselineY);
    ctx.stroke();
  }

  /**
   * Render the appropriate marker based on gain settings
   */
  render(limbGain: Gain, precordialGain: Gain): void {
    if (limbGain === precordialGain) {
      this.renderStandard(limbGain);
    } else {
      this.renderStairstep(limbGain, precordialGain);
    }
  }

  /**
   * Get the width of the calibration marker in pixels
   */
  getWidth(): number {
    return this.config.pxPerMm * 5; // Always 5mm wide
  }
}

/**
 * Convenience function to render a calibration marker
 */
export function renderCalibrationMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  baselineY: number,
  pxPerMm: number,
  limbGain: Gain,
  precordialGain: Gain
): number {
  const renderer = new CalibrationMarkerRenderer(ctx, { x, baselineY, pxPerMm });
  renderer.render(limbGain, precordialGain);
  return renderer.getWidth();
}
