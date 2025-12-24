/**
 * ECG Grid Renderer
 *
 * Renders the pink ECG paper grid with 1mm small boxes and 5mm large boxes.
 * Colors verified from Muse v9.0 screenshots.
 *
 * @module renderer/components/grid
 */

import { MUSE_SPEC, pixelsPerMm } from '../../config/muse-spec';
import type { Color } from '../../types/config';

/**
 * Grid renderer configuration
 */
export interface GridRendererConfig {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** DPI for rendering */
  dpi: number;
  /** Override background color */
  backgroundColor?: Color;
  /** Override thin line color */
  thinLineColor?: Color;
  /** Override thick line color */
  thickLineColor?: Color;
  /** Thin line width in pixels */
  thinLineWidth?: number;
  /** Thick line width in pixels */
  thickLineWidth?: number;
}

/**
 * ECG Grid Renderer
 *
 * Renders pixel-perfect ECG paper grid matching Muse output.
 */
export class GridRenderer {
  private ctx: CanvasRenderingContext2D;
  private config: Required<GridRendererConfig>;
  private pxPerMm: number;
  private smallBoxPx: number;
  private largeBoxPx: number;

  constructor(ctx: CanvasRenderingContext2D, config: GridRendererConfig) {
    this.ctx = ctx;
    this.pxPerMm = pixelsPerMm(config.dpi);
    this.smallBoxPx = this.pxPerMm * MUSE_SPEC.grid.smallBox.widthMm;
    this.largeBoxPx = this.pxPerMm * MUSE_SPEC.grid.largeBox.widthMm;

    // Apply defaults
    this.config = {
      width: config.width,
      height: config.height,
      dpi: config.dpi,
      backgroundColor: config.backgroundColor ?? MUSE_SPEC.grid.colors.background,
      thinLineColor: config.thinLineColor ?? MUSE_SPEC.grid.colors.thinLine,
      thickLineColor: config.thickLineColor ?? MUSE_SPEC.grid.colors.thickLine,
      thinLineWidth: config.thinLineWidth ?? 1,
      thickLineWidth: config.thickLineWidth ?? 2,
    };
  }

  /**
   * Render the complete ECG grid
   */
  render(): void {
    this.renderBackground();
    this.renderThinLines();
    this.renderThickLines();
  }

  /**
   * Fill background with paper color
   */
  private renderBackground(): void {
    this.ctx.fillStyle = this.config.backgroundColor.hex;
    this.ctx.fillRect(0, 0, this.config.width, this.config.height);
  }

  /**
   * Render thin gridlines (1mm spacing)
   * Skip positions where thick lines will be drawn
   */
  private renderThinLines(): void {
    const { width, height } = this.config;

    this.ctx.strokeStyle = this.config.thinLineColor.hex;
    this.ctx.lineWidth = this.config.thinLineWidth;

    this.ctx.beginPath();

    // Vertical lines
    for (let x = 0; x <= width; x += this.smallBoxPx) {
      // Skip every 5th line (where thick lines go)
      const lineIndex = Math.round(x / this.smallBoxPx);
      if (lineIndex % 5 === 0) continue;

      const xPos = Math.round(x) + 0.5; // Align to pixel grid for crisp lines
      this.ctx.moveTo(xPos, 0);
      this.ctx.lineTo(xPos, height);
    }

    // Horizontal lines
    for (let y = 0; y <= height; y += this.smallBoxPx) {
      const lineIndex = Math.round(y / this.smallBoxPx);
      if (lineIndex % 5 === 0) continue;

      const yPos = Math.round(y) + 0.5;
      this.ctx.moveTo(0, yPos);
      this.ctx.lineTo(width, yPos);
    }

    this.ctx.stroke();
  }

  /**
   * Render thick gridlines (5mm spacing)
   */
  private renderThickLines(): void {
    const { width, height } = this.config;

    this.ctx.strokeStyle = this.config.thickLineColor.hex;
    this.ctx.lineWidth = this.config.thickLineWidth;

    this.ctx.beginPath();

    // Vertical lines
    for (let x = 0; x <= width; x += this.largeBoxPx) {
      const xPos = Math.round(x) + 0.5;
      this.ctx.moveTo(xPos, 0);
      this.ctx.lineTo(xPos, height);
    }

    // Horizontal lines
    for (let y = 0; y <= height; y += this.largeBoxPx) {
      const yPos = Math.round(y) + 0.5;
      this.ctx.moveTo(0, yPos);
      this.ctx.lineTo(width, yPos);
    }

    this.ctx.stroke();
  }

  /**
   * Get grid metrics for positioning waveforms
   */
  getMetrics(): GridMetrics {
    return {
      pxPerMm: this.pxPerMm,
      smallBoxPx: this.smallBoxPx,
      largeBoxPx: this.largeBoxPx,
      pxPerSecond: this.pxPerMm * MUSE_SPEC.defaultPaperSpeed,
      pxPerMv: this.pxPerMm * MUSE_SPEC.defaultGain,
    };
  }
}

/**
 * Grid metrics for positioning calculations
 */
export interface GridMetrics {
  /** Pixels per millimeter */
  pxPerMm: number;
  /** Small box size in pixels (1mm) */
  smallBoxPx: number;
  /** Large box size in pixels (5mm) */
  largeBoxPx: number;
  /** Pixels per second at default paper speed */
  pxPerSecond: number;
  /** Pixels per millivolt at default gain */
  pxPerMv: number;
}

/**
 * Convenience function to render a grid
 */
export function renderGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpi: number = 96
): GridMetrics {
  const renderer = new GridRenderer(ctx, { width, height, dpi });
  renderer.render();
  return renderer.getMetrics();
}
