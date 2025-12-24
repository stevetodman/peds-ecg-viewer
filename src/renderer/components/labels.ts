/**
 * ECG Lead Labels Renderer
 *
 * Renders lead labels (I, II, III, aVR, aVL, aVF, V1-V6)
 * with DPI-aware font scaling for consistent appearance.
 *
 * @module renderer/components/labels
 */

import { MUSE_SPEC } from '../../config/muse-spec';
import type { LeadName } from '../../types';

/**
 * Label renderer configuration
 */
export interface LabelRendererConfig {
  /** Target DPI for rendering */
  dpi?: number;
  /** Font family */
  fontFamily?: string;
  /** Font size in pixels (at 96 DPI reference) */
  fontSize?: number;
  /** Font weight */
  fontWeight?: string;
  /** Text color */
  color?: string;
}

/**
 * Lead Label Renderer with DPI-aware scaling
 */
export class LabelRenderer {
  private ctx: CanvasRenderingContext2D;
  private config: Required<LabelRendererConfig>;
  private scaledFontSize: number;

  constructor(ctx: CanvasRenderingContext2D, config: LabelRendererConfig = {}) {
    this.ctx = ctx;
    const dpi = config.dpi ?? 96;
    this.config = {
      dpi,
      fontFamily: config.fontFamily ?? MUSE_SPEC.typography.labelFont,
      fontSize: config.fontSize ?? MUSE_SPEC.typography.sizes.leadLabels,
      fontWeight: config.fontWeight ?? 'bold',
      color: config.color ?? MUSE_SPEC.typography.color.hex,
    };
    // Scale font size for DPI (base size is for 96 DPI)
    this.scaledFontSize = this.config.fontSize * (dpi / 96);
  }

  /**
   * Render a lead label at baseline level (MUSE-style)
   *
   * @param lead - Lead name to render
   * @param x - X position
   * @param baselineY - Y position of the baseline (label is vertically centered)
   */
  renderLeadLabel(lead: LeadName | string, x: number, baselineY: number): void {
    const ctx = this.ctx;
    const { fontFamily, fontWeight, color } = this.config;

    ctx.font = `${fontWeight} ${this.scaledFontSize}px ${fontFamily}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle'; // Center on baseline

    ctx.fillText(lead, x, baselineY);
  }

  /**
   * Render a lead label at top-left of panel (alternative style)
   *
   * @param lead - Lead name to render
   * @param x - X position
   * @param y - Y position (top of panel)
   */
  renderLeadLabelTopLeft(lead: LeadName | string, x: number, y: number): void {
    const ctx = this.ctx;
    const { fontFamily, fontWeight, color } = this.config;

    ctx.font = `${fontWeight} ${this.scaledFontSize}px ${fontFamily}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.fillText(lead, x, y);
  }

  /**
   * Render a label with a box/background
   */
  renderLabelWithBackground(
    text: string,
    x: number,
    y: number,
    backgroundColor: string = '#ffffff',
    padding: number = 2
  ): void {
    const ctx = this.ctx;
    const { fontFamily, fontSize, fontWeight, color } = this.config;

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

    // Measure text
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize;

    // Draw background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(
      x - padding,
      y - padding,
      textWidth + padding * 2,
      textHeight + padding * 2
    );

    // Draw text
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
  }

  /**
   * Render speed and gain annotation (e.g., "25 mm/s  10 mm/mV")
   */
  renderSpeedGainLabel(
    x: number,
    y: number,
    paperSpeed: number = 25,
    gain: number = 10
  ): void {
    const text = `${paperSpeed} mm/s  ${gain} mm/mV`;
    const ctx = this.ctx;
    const { fontFamily, color } = this.config;
    const fontSize = this.scaledFontSize * 0.85;

    ctx.font = `normal ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
  }

  /**
   * Render header text (patient name, etc.)
   */
  renderHeaderText(
    text: string,
    x: number,
    y: number,
    style: 'patientName' | 'demographics' | 'measurements' = 'demographics'
  ): void {
    const ctx = this.ctx;
    const { color, dpi } = this.config;
    const { typography } = MUSE_SPEC;

    const baseFontSize = typography.sizes[style];
    const fontSize = baseFontSize * (dpi / 96);

    ctx.font = `${fontSize}px ${typography.dataFont}`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    ctx.fillText(text, x, y);
  }

  /**
   * Render interpretation text (multiple lines)
   */
  renderInterpretation(lines: string[], x: number, y: number): void {
    const ctx = this.ctx;
    const { color, dpi } = this.config;
    const { typography } = MUSE_SPEC;

    const baseFontSize = typography.sizes.interpretation;
    const fontSize = baseFontSize * (dpi / 96);
    const lineHeight = fontSize * 1.3;

    ctx.font = `${fontSize}px ${typography.dataFont}`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, y + i * lineHeight);
    }
  }
}

/**
 * Standard lead label positions for 3x4 layout
 */
export const LEAD_LAYOUT_3X4: LeadName[][] = [
  ['I', 'aVR', 'V1', 'V4'],
  ['II', 'aVL', 'V2', 'V5'],
  ['III', 'aVF', 'V3', 'V6'],
];

/**
 * Standard lead label positions for 6x2 layout
 */
export const LEAD_LAYOUT_6X2: LeadName[][] = [
  ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'],
  ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'],
];
