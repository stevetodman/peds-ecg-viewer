/**
 * ECG Footer Renderer
 *
 * Renders the footer section with technical parameters and status.
 *
 * @module renderer/components/footer
 */

import { MUSE_SPEC } from '../../config/muse-spec';
import type { Color } from '../../types/config';
import type { PaperSpeed, Gain } from '../../types/ecg';

/**
 * Footer renderer configuration
 */
export interface FooterRendererConfig {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Y position of footer top */
  y: number;
  /** Left bound of content area */
  contentLeft?: number;
  /** Right bound of content area */
  contentRight?: number;
  /** Text color override */
  textColor?: Color;
  /** Border color override */
  borderColor?: Color;
}

/**
 * Footer display data
 */
export interface FooterDisplayData {
  paperSpeed: PaperSpeed;
  limbGain: Gain;
  precordialGain: Gain;
  sampleRate: number;
  filterLow: number;
  filterHigh: number;
  notchFilter: number;
  leadFormat: '12' | '15';
  qtcFormula: string;
  orderNumber?: string;
  isConfirmed: boolean;
}

/**
 * ECG Footer Renderer
 */
export class FooterRenderer {
  private ctx: CanvasRenderingContext2D;
  private config: Required<FooterRendererConfig>;

  constructor(ctx: CanvasRenderingContext2D, config: FooterRendererConfig) {
    this.ctx = ctx;
    this.config = {
      width: config.width,
      height: config.height,
      y: config.y,
      contentLeft: config.contentLeft ?? 0,
      contentRight: config.contentRight ?? config.width,
      textColor: config.textColor ?? MUSE_SPEC.typography.color,
      borderColor: config.borderColor ?? { rgb: { r: 192, g: 192, b: 192 }, hex: '#C0C0C0', rgba: 'rgba(192,192,192,1)' },
    };
  }

  /**
   * Render the complete footer
   */
  render(data: FooterDisplayData): void {
    const { width, height, y, contentLeft, contentRight, textColor, borderColor } = this.config;
    const ctx = this.ctx;

    // Top border line
    ctx.strokeStyle = borderColor.hex;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    // Text rendering
    ctx.fillStyle = textColor.hex;
    ctx.font = '9px Arial, sans-serif';
    ctx.textBaseline = 'middle';
    const textY = y + height / 2;

    // Left section - Technical parameters (Muse format)
    ctx.textAlign = 'left';
    const gainText = data.limbGain === data.precordialGain
      ? `${data.limbGain} mm/mV`
      : `${data.limbGain}/${data.precordialGain} mm/mV`;

    // Sample rate in ms per sample
    const sampleMs = (1000 / data.sampleRate).toFixed(1);
    const techInfo = `${data.paperSpeed} mm/s  ${gainText}  4 x ${sampleMs}ms/${data.filterHigh} Hz  ~${data.notchFilter} Hz`;
    ctx.fillText(techInfo, contentLeft, textY);

    // Center section - Lead format and formula
    ctx.textAlign = 'center';
    const centerX = width / 2;
    const centerText = `${data.leadFormat}-Lead  QTc: ${data.qtcFormula}${data.orderNumber ? `  EID: ${data.orderNumber}` : ''}`;
    ctx.fillText(centerText, centerX, textY);

    // Right section - Confirmation status
    ctx.textAlign = 'right';
    ctx.fillText(data.isConfirmed ? 'CONFIRMED' : 'UNCONFIRMED', contentRight, textY);
  }
}

/**
 * Convenience function to render a footer
 */
export function renderFooter(
  ctx: CanvasRenderingContext2D,
  data: FooterDisplayData,
  width: number,
  height: number,
  y: number
): void {
  const renderer = new FooterRenderer(ctx, { width, height, y });
  renderer.render(data);
}
