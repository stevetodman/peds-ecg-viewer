/**
 * ECG Measurements Box Renderer
 *
 * Renders the measurements overlay box on the ECG grid.
 *
 * @module renderer/components/measurements-box
 */

import { MUSE_SPEC } from '../../config/muse-spec';
import type { ECGMeasurements } from '../../types/measurements';
import type { Color } from '../../types/config';

/**
 * Measurements box configuration
 */
export interface MeasurementsBoxConfig {
  /** X position */
  x: number;
  /** Y position */
  y: number;
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** Background color (with alpha for overlay) */
  backgroundColor?: string;
  /** Border color */
  borderColor?: Color;
  /** Text color */
  textColor?: Color;
}

/**
 * Measurements display data
 */
export interface MeasurementsDisplayData {
  heartRate: number;
  prInterval: number;
  qrsDuration: number;
  qtInterval: number;
  qtcInterval: number;
  pAxis: number;
  qrsAxis: number;
  tAxis: number;
}

/**
 * ECG Measurements Box Renderer
 */
export class MeasurementsBoxRenderer {
  private ctx: CanvasRenderingContext2D;
  private config: Required<MeasurementsBoxConfig>;

  constructor(ctx: CanvasRenderingContext2D, config: MeasurementsBoxConfig) {
    this.ctx = ctx;
    this.config = {
      x: config.x,
      y: config.y,
      width: config.width ?? 160,
      height: config.height ?? 72,
      backgroundColor: config.backgroundColor ?? 'rgba(255, 255, 255, 0.92)',
      borderColor: config.borderColor ?? { rgb: { r: 160, g: 160, b: 160 }, hex: '#A0A0A0', rgba: 'rgba(160,160,160,1)' },
      textColor: config.textColor ?? MUSE_SPEC.typography.color,
    };
  }

  /**
   * Render the measurements box
   */
  render(measurements: MeasurementsDisplayData): void {
    const { x, y, width, height, backgroundColor, borderColor, textColor } = this.config;
    const ctx = this.ctx;

    // Semi-transparent background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(x, y, width, height);

    // Subtle border
    ctx.strokeStyle = borderColor.hex;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, width, height);

    // Measurements text
    ctx.fillStyle = textColor.hex;
    ctx.font = '10px Consolas, Monaco, monospace';
    ctx.textBaseline = 'top';

    const lineHeight = 13;
    const textY = y + 6;
    const labelX = x + 6;
    const valueX = x + width - 6;

    // Labels (left-aligned)
    ctx.textAlign = 'left';
    const labels = ['Vent. rate', 'PR interval', 'QRS duration', 'QT/QTc', 'P-R-T axes'];
    labels.forEach((label, i) => {
      ctx.fillText(label, labelX, textY + i * lineHeight);
    });

    // Values (right-aligned)
    ctx.textAlign = 'right';
    ctx.fillText(`${measurements.heartRate} bpm`, valueX, textY);
    ctx.fillText(`${measurements.prInterval} ms`, valueX, textY + lineHeight);
    ctx.fillText(`${measurements.qrsDuration} ms`, valueX, textY + lineHeight * 2);
    ctx.fillText(`${measurements.qtInterval}/${measurements.qtcInterval} ms`, valueX, textY + lineHeight * 3);
    ctx.fillText(`${measurements.pAxis}° ${measurements.qrsAxis}° ${measurements.tAxis}°`, valueX, textY + lineHeight * 4);
  }
}

/**
 * Convert ECGMeasurements to display format
 */
export function toMeasurementsDisplay(m: ECGMeasurements): MeasurementsDisplayData {
  return {
    heartRate: m.heartRate.value,
    prInterval: m.prInterval.value,
    qrsDuration: m.qrsDuration.value,
    qtInterval: Math.round(m.qtInterval.value),
    qtcInterval: Math.round(m.qtc.bazett),
    pAxis: m.pAxis?.value ?? 0,
    qrsAxis: m.qrsAxis.value,
    tAxis: m.tAxis?.value ?? 0,
  };
}

/**
 * Convenience function to render measurements box
 */
export function renderMeasurementsBox(
  ctx: CanvasRenderingContext2D,
  measurements: MeasurementsDisplayData,
  x: number,
  y: number,
  width?: number,
  height?: number
): void {
  const renderer = new MeasurementsBoxRenderer(ctx, { x, y, width, height });
  renderer.render(measurements);
}
