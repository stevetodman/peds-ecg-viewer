/**
 * MUSE-format ECG Renderer
 *
 * Main renderer that produces pixel-perfect ECG output matching
 * GE MUSE format. Uses physical units (mm) converted to pixels
 * at render time for DPI-independent rendering.
 *
 * @module renderer/ecg-renderer
 */

import { GridRenderer } from './components/grid';
import { WaveformRenderer } from './components/waveform';
import { LabelRenderer } from './components/labels';
import {
  calculateMuseLayout,
  type MuseLayout,
  type MuseLeadPanel,
} from './layout/muse-layout';
import type { ECGSignal, PaperSpeed, Gain, LeadName } from '../types';
import { MUSE_SPEC } from '../config/muse-spec';

/**
 * ECG Renderer options
 */
export interface ECGRendererOptions {
  /** ECG format: '12-lead' or '15-lead' */
  format?: '12-lead' | '15-lead';
  /** Target DPI for rendering */
  dpi?: number;
  /** Paper speed (mm/sec) - default 25 */
  paperSpeed?: PaperSpeed;
  /** Gain (mm/mV) - default 10 */
  gain?: Gain;
  /** Show grid */
  showGrid?: boolean;
  /** Show lead labels */
  showLabels?: boolean;
  /** Show calibration pulse */
  showCalibration?: boolean;
  /** Show separator lines between columns */
  showSeparators?: boolean;
}

/**
 * Main ECG Renderer class
 *
 * Renders complete MUSE-format ECG with grid, waveforms, and labels.
 */
export class ECGRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private options: Required<ECGRendererOptions>;
  private layout: MuseLayout;

  constructor(canvas: HTMLCanvasElement, options: ECGRendererOptions = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D rendering context');
    }
    this.ctx = ctx;

    // Apply defaults
    this.options = {
      format: options.format ?? '15-lead',
      dpi: options.dpi ?? MUSE_SPEC.targetDpi,
      paperSpeed: options.paperSpeed ?? MUSE_SPEC.defaultPaperSpeed,
      gain: options.gain ?? MUSE_SPEC.defaultGain,
      showGrid: options.showGrid ?? true,
      showLabels: options.showLabels ?? true,
      showCalibration: options.showCalibration ?? true,
      showSeparators: options.showSeparators ?? true,
    };

    // Calculate layout
    this.layout = calculateMuseLayout({
      format: this.options.format,
      dpi: this.options.dpi,
      paperSpeed: this.options.paperSpeed,
      gain: this.options.gain,
    });

    // Set canvas size from layout
    canvas.width = this.layout.width;
    canvas.height = this.layout.height;
  }

  /**
   * Render a complete ECG
   *
   * @param signal - ECG signal data
   * @returns The layout used for rendering
   */
  render(signal: ECGSignal): MuseLayout {
    const { ctx, layout, options } = this;

    // Clear canvas
    ctx.clearRect(0, 0, layout.width, layout.height);

    // Render grid in the grid area
    if (options.showGrid) {
      this.renderGridArea();
    }

    // Render separator lines
    if (options.showSeparators) {
      this.renderSeparators();
    }

    // Create waveform renderer
    const waveformRenderer = new WaveformRenderer(ctx, {
      metrics: {
        pxPerMm: layout.pxPerMm,
        smallBoxPx: layout.pxPerMm,
        largeBoxPx: layout.pxPerMm * 5,
        pxPerSecond: layout.pxPerSecond,
        pxPerMv: layout.pxPerMm * options.gain,
      },
      sampleRate: signal.sampleRate,
      paperSpeed: options.paperSpeed,
      gain: options.gain,
    });

    // Create label renderer with DPI-aware scaling
    const labelRenderer = new LabelRenderer(ctx, { dpi: options.dpi });

    // Render main lead panels
    for (const panel of layout.leadPanels) {
      this.renderPanel(panel, signal, waveformRenderer, labelRenderer);
    }

    // Render rhythm strip panels
    for (const panel of layout.rhythmPanels) {
      this.renderPanel(panel, signal, waveformRenderer, labelRenderer);
    }

    // Render calibration pulse
    if (options.showCalibration) {
      this.renderCalibrationPulses(waveformRenderer);
    }

    return layout;
  }

  /**
   * Render a single lead panel
   */
  private renderPanel(
    panel: MuseLeadPanel,
    signal: ECGSignal,
    waveformRenderer: WaveformRenderer,
    labelRenderer: LabelRenderer
  ): void {
    const { options } = this;
    const leadData = signal.leads[panel.lead as LeadName];

    if (!leadData) {
      // Lead not available in signal data
      return;
    }

    // Calculate sample range for this panel's time window
    const startSample = Math.round(panel.startTime * signal.sampleRate);
    const endSample = Math.round(panel.endTime * signal.sampleRate);
    const samples = leadData.slice(startSample, endSample);

    // Render waveform
    waveformRenderer.render(samples, panel.x, panel.baselineY, panel.width);

    // Render lead label
    if (options.showLabels) {
      // Position label at left edge, centered on baseline (MUSE style)
      const labelX = panel.x + 3;
      labelRenderer.renderLeadLabel(panel.lead, labelX, panel.baselineY);
    }
  }

  /**
   * Render ECG grid in the grid area
   */
  private renderGridArea(): void {
    const { ctx, layout } = this;
    const { gridArea } = layout;

    // Save context state
    ctx.save();

    // Clip to grid area
    ctx.beginPath();
    ctx.rect(gridArea.x, gridArea.y, gridArea.width, gridArea.height);
    ctx.clip();

    // Create grid renderer for grid area only
    const gridRenderer = new GridRenderer(ctx, {
      width: gridArea.width,
      height: gridArea.height,
      dpi: layout.dpi,
    });

    // Translate to grid area origin
    ctx.translate(gridArea.x, gridArea.y);
    gridRenderer.render();

    // Restore context state
    ctx.restore();
  }

  /**
   * Render separator lines between columns
   */
  private renderSeparators(): void {
    const { ctx, layout } = this;

    ctx.strokeStyle = MUSE_SPEC.layout.separators.color;
    ctx.lineWidth = layout.pxPerMm * MUSE_SPEC.layout.separators.widthMm;

    for (const sep of layout.separators) {
      ctx.beginPath();
      ctx.moveTo(sep.x1, sep.y1);
      ctx.lineTo(sep.x2, sep.y2);
      ctx.stroke();
    }
  }

  /**
   * Render calibration pulses before each row of leads
   */
  private renderCalibrationPulses(waveformRenderer: WaveformRenderer): void {
    const { layout } = this;

    // Render calibration pulse at start of each row
    for (let row = 0; row < 3; row++) {
      const panel = layout.leadPanels.find(p => p.row === row && p.col === 0);
      if (panel) {
        const calX = panel.x - 15; // Position to left of first column
        waveformRenderer.renderCalibrationPulse(calX, panel.baselineY);
      }
    }

    // Calibration for rhythm strips
    for (const rhythmPanel of layout.rhythmPanels) {
      const calX = rhythmPanel.x - 15;
      waveformRenderer.renderCalibrationPulse(calX, rhythmPanel.baselineY);
    }
  }

  /**
   * Render just the grid (for testing)
   */
  renderGrid(): MuseLayout {
    const { ctx, layout } = this;
    ctx.clearRect(0, 0, layout.width, layout.height);

    // Create grid renderer for full canvas
    const gridRenderer = new GridRenderer(ctx, {
      width: layout.width,
      height: layout.height,
      dpi: layout.dpi,
    });
    gridRenderer.render();

    return layout;
  }

  /**
   * Get the canvas element
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Get the rendering context
   */
  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  /**
   * Get the layout specification
   */
  getLayout(): MuseLayout {
    return this.layout;
  }

  /**
   * Export to PNG data URL
   */
  toDataURL(type: string = 'image/png', quality?: number): string {
    return this.canvas.toDataURL(type, quality);
  }

  /**
   * Export to Blob
   */
  toBlob(callback: BlobCallback, type?: string, quality?: number): void {
    this.canvas.toBlob(callback, type, quality);
  }

  /**
   * Update options and recalculate layout
   */
  updateOptions(options: Partial<ECGRendererOptions>): void {
    this.options = { ...this.options, ...options };

    // Recalculate layout if format or DPI changed
    if (options.format || options.dpi || options.paperSpeed || options.gain) {
      this.layout = calculateMuseLayout({
        format: this.options.format,
        dpi: this.options.dpi,
        paperSpeed: this.options.paperSpeed,
        gain: this.options.gain,
      });

      // Update canvas size
      this.canvas.width = this.layout.width;
      this.canvas.height = this.layout.height;
    }
  }
}

/**
 * Create an ECG renderer optimized for screen display
 * Uses device pixel ratio for crisp rendering on high-DPI displays
 */
export function createScreenRenderer(
  canvas: HTMLCanvasElement,
  options: Omit<ECGRendererOptions, 'dpi'> = {}
): ECGRenderer {
  const dpi = 96 * (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  return new ECGRenderer(canvas, { ...options, dpi });
}

/**
 * Create an ECG renderer optimized for PNG export
 * Uses 300 DPI for high-quality print output
 */
export function createExportRenderer(
  canvas: HTMLCanvasElement,
  options: Omit<ECGRendererOptions, 'dpi'> = {}
): ECGRenderer {
  return new ECGRenderer(canvas, { ...options, dpi: 300 });
}

/**
 * Create an ECG renderer with a new canvas element
 */
export function createECGRenderer(options: ECGRendererOptions = {}): ECGRenderer {
  const canvas = document.createElement('canvas');
  return new ECGRenderer(canvas, options);
}
