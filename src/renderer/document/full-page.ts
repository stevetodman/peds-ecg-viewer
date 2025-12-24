/**
 * Full Page ECG Document Renderer
 *
 * Renders a complete ECG document matching the Muse format,
 * including header, measurements overlay, grid, waveforms, and footer.
 *
 * @module renderer/document/full-page
 */

import { pixelsPerMm } from '../../config/muse-spec';
import { GridRenderer } from '../components/grid';
import { HeaderRenderer, type PatientDisplayData } from '../components/header';
import { MeasurementsBoxRenderer, type MeasurementsDisplayData } from '../components/measurements-box';
import { FooterRenderer } from '../components/footer';
import { CalibrationMarkerRenderer } from '../components/calibration-marker';
import type { ECGSignal, PaperSpeed, Gain, LeadName } from '../../types';

/**
 * Full page render options
 */
export interface FullPageRenderOptions {
  /** Canvas width in pixels */
  width: number;
  /** Canvas height in pixels */
  height: number;
  /** DPI for rendering */
  dpi?: number;
  /** Paper speed (mm/sec) */
  paperSpeed?: PaperSpeed;
  /** Limb lead gain (mm/mV) */
  limbGain?: Gain;
  /** Precordial lead gain (mm/mV) */
  precordialGain?: Gain;
  /** ECG format: 12-lead or 15-lead */
  leadFormat?: '12' | '15';
  /** Header height in pixels */
  headerHeight?: number;
  /** Info area height in pixels */
  infoAreaHeight?: number;
  /** Footer height in pixels */
  footerHeight?: number;
}

/**
 * Full page document data
 */
export interface FullPageDocumentData {
  patient: PatientDisplayData;
  measurements: MeasurementsDisplayData;
  interpretation: string[];
  signal?: ECGSignal;
}

/**
 * Standard 12-lead layout
 */
const LEAD_LAYOUT_12: LeadName[][] = [
  ['I', 'aVR', 'V1', 'V4'],
  ['II', 'aVL', 'V2', 'V5'],
  ['III', 'aVF', 'V3', 'V6'],
];

/**
 * 15-lead pediatric layout (adds V3R, V4R, V7)
 */
const LEAD_LAYOUT_15: LeadName[][] = [
  ['I', 'aVR', 'V1', 'V4', 'V3R' as LeadName],
  ['II', 'aVL', 'V2', 'V5', 'V4R' as LeadName],
  ['III', 'aVF', 'V3', 'V6', 'V7' as LeadName],
];

/**
 * Precordial lead set (standard V-leads)
 */
const PRECORDIAL_LEADS: LeadName[] = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

/**
 * Full Page ECG Document Renderer
 */
export class FullPageRenderer {
  private ctx: CanvasRenderingContext2D;
  private options: Required<FullPageRenderOptions>;
  private pxPerMm: number;
  private largeBoxPx: number;

  constructor(ctx: CanvasRenderingContext2D, options: FullPageRenderOptions) {
    this.ctx = ctx;
    this.pxPerMm = pixelsPerMm(options.dpi ?? 96);
    this.largeBoxPx = this.pxPerMm * 5;

    this.options = {
      width: options.width,
      height: options.height,
      dpi: options.dpi ?? 96,
      paperSpeed: options.paperSpeed ?? 25,
      limbGain: options.limbGain ?? 10,
      precordialGain: options.precordialGain ?? 10,
      leadFormat: options.leadFormat ?? '12',
      headerHeight: options.headerHeight ?? 65,
      infoAreaHeight: options.infoAreaHeight ?? 85,
      footerHeight: options.footerHeight ?? 18,
    };
  }

  /**
   * Align position to nearest grid line
   */
  private alignToGrid(pos: number, roundUp: boolean = true): number {
    return roundUp
      ? Math.ceil(pos / this.largeBoxPx) * this.largeBoxPx
      : Math.round(pos / this.largeBoxPx) * this.largeBoxPx;
  }

  /**
   * Render the complete document
   */
  render(data: FullPageDocumentData): void {
    const { ctx, options } = this;
    const { width, height } = options;

    // Clear canvas with white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Render header
    this.renderHeader(data.patient);

    // Render interpretation area
    this.renderInterpretation(data.interpretation);

    // Calculate and render ECG grid
    const ecgBounds = this.renderGrid();

    // Render waveforms if signal available
    if (data.signal) {
      this.renderWaveforms(data.signal, ecgBounds);
    }

    // Render measurements overlay on grid
    this.renderMeasurementsOverlay(data.measurements, ecgBounds);

    // Render footer
    this.renderFooter(data);
  }

  /**
   * Render the header section
   */
  private renderHeader(patient: PatientDisplayData): void {
    const { ctx, options } = this;
    const renderer = new HeaderRenderer(ctx, {
      width: options.width,
      height: options.headerHeight,
    });
    renderer.render(patient);
  }

  /**
   * Render the interpretation area
   */
  private renderInterpretation(findings: string[]): void {
    const { ctx, options } = this;
    const { headerHeight, infoAreaHeight } = options;
    const margin = 8;
    const infoTop = headerHeight + 2;

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.fillText('Pediatric ECG Analysis', margin, infoTop + 10);

    ctx.font = '10px Arial, sans-serif';
    let y = infoTop + 24;
    for (const finding of findings) {
      ctx.fillText(`- ${finding}`, margin + 8, y);
      y += 12;
    }

    ctx.font = 'italic 9px Arial, sans-serif';
    ctx.fillStyle = '#666666';
    ctx.fillText('No previous ECGs available for comparison', margin, infoTop + infoAreaHeight - 10);
  }

  /**
   * Render the ECG grid and return its bounds
   */
  private renderGrid(): { left: number; top: number; width: number; height: number } {
    const { ctx, options, largeBoxPx } = this;
    const { width, height, headerHeight, infoAreaHeight, footerHeight, dpi } = options;

    const ecgTop = headerHeight + infoAreaHeight + 2;
    const rawEcgHeight = height - ecgTop - footerHeight - 2;

    // Snap grid dimensions to exact multiples of large box (5mm)
    const ecgHeight = Math.floor(rawEcgHeight / largeBoxPx) * largeBoxPx;
    const ecgWidth = Math.floor(width / largeBoxPx) * largeBoxPx;
    const ecgLeft = Math.floor((width - ecgWidth) / 2);

    // Render grid
    ctx.save();
    ctx.translate(ecgLeft, ecgTop);
    const gridRenderer = new GridRenderer(ctx, { width: ecgWidth, height: ecgHeight, dpi });
    gridRenderer.render();
    ctx.restore();

    return { left: ecgLeft, top: ecgTop, width: ecgWidth, height: ecgHeight };
  }

  /**
   * Render all waveforms
   */
  private renderWaveforms(
    signal: ECGSignal,
    ecgBounds: { left: number; top: number; width: number; height: number }
  ): void {
    const { ctx, options, pxPerMm, largeBoxPx } = this;
    const { paperSpeed, limbGain, precordialGain, leadFormat } = options;

    const padding = 3;
    const rhythmStripRatio = 0.17;
    const rhythmStripHeight = ecgBounds.height * rhythmStripRatio;
    const leadsAreaHeight = ecgBounds.height - rhythmStripHeight - padding;

    const leadLayout = leadFormat === '15' ? LEAD_LAYOUT_15 : LEAD_LAYOUT_12;
    const numRows = 3;
    const numCols = leadFormat === '15' ? 5 : 4;

    const rawColWidth = (ecgBounds.width - padding * (numCols - 1)) / numCols;
    const colWidth = Math.floor(rawColWidth / largeBoxPx) * largeBoxPx;
    const rowHeight = (leadsAreaHeight - padding * (numRows - 1)) / numRows;

    const secondsPerColumn = leadFormat === '15' ? 2.0 : 2.5;
    const samplesPerColumn = Math.floor(signal.sampleRate * secondsPerColumn);

    const pxPerSecond = pxPerMm * paperSpeed;
    const pxPerSample = pxPerSecond / signal.sampleRate;

    // Calibration marker
    const rawFirstBaselineY = ecgBounds.top + rowHeight / 2;
    const firstRowBaselineY = ecgBounds.top + this.alignToGrid(rawFirstBaselineY - ecgBounds.top, false);

    const calibrationRenderer = new CalibrationMarkerRenderer(ctx, {
      x: ecgBounds.left + 3,
      baselineY: firstRowBaselineY,
      pxPerMm,
    });
    calibrationRenderer.render(limbGain, precordialGain);
    const standardMarkerWidth = calibrationRenderer.getWidth();

    // Render each lead
    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        const lead = leadLayout[row][col];
        if (!signal.leads[lead]) continue;

        const x = ecgBounds.left + col * (colWidth + padding);
        const y = ecgBounds.top + row * (rowHeight + padding);
        const rawBaselineY = y + rowHeight / 2;
        const baselineY = ecgBounds.top + this.alignToGrid(rawBaselineY - ecgBounds.top, false);

        const isPrecordial = PRECORDIAL_LEADS.includes(lead);
        const gain = isPrecordial ? precordialGain : limbGain;
        const pxPerUv = pxPerMm * (gain / 1000);

        // Leads in the same ROW are simultaneous (same time segment)
        const startSample = row * samplesPerColumn;
        const endSample = (row + 1) * samplesPerColumn;
        const samples = signal.leads[lead].slice(startSample, endSample);

        const labelSpace = (row === 0 && col === 0) ? standardMarkerWidth + 24 : 20;
        const waveformStartX = this.alignToGrid(x + labelSpace, true);
        const waveformWidth = colWidth - (waveformStartX - x);

        this.renderWaveformSegment(samples, waveformStartX, baselineY, pxPerSample, pxPerUv, waveformWidth);

        // Lead label at top-left
        ctx.font = 'bold 11px Arial, sans-serif';
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(lead, x + 3, y + 3);
      }
    }

    // Rhythm strip
    const rhythmY = ecgBounds.top + leadsAreaHeight + padding;
    const rawRhythmBaselineY = rhythmY + rhythmStripHeight / 2;
    const rhythmBaselineY = ecgBounds.top + this.alignToGrid(rawRhythmBaselineY - ecgBounds.top, false);

    const rhythmSamples = signal.leads['II'] || [];
    const rhythmPxPerUv = pxPerMm * (limbGain / 1000);

    const rhythmWaveformX = this.alignToGrid(ecgBounds.left + 20, true);
    this.renderWaveformSegment(
      rhythmSamples,
      rhythmWaveformX,
      rhythmBaselineY,
      pxPerSample,
      rhythmPxPerUv,
      ecgBounds.width - (rhythmWaveformX - ecgBounds.left)
    );

    // Rhythm strip label
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('II', ecgBounds.left + 3, rhythmY + 3);
  }

  /**
   * Render a single waveform segment
   */
  private renderWaveformSegment(
    samples: number[],
    startX: number,
    baselineY: number,
    pxPerSample: number,
    pxPerUv: number,
    maxWidth: number
  ): void {
    if (samples.length === 0) return;

    const ctx = this.ctx;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.25;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    let first = true;
    for (let i = 0; i < samples.length; i++) {
      const x = startX + i * pxPerSample;
      if (x > startX + maxWidth) break;

      const y = baselineY - samples[i] * pxPerUv;

      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }

  /**
   * Render measurements overlay on grid
   */
  private renderMeasurementsOverlay(
    measurements: MeasurementsDisplayData,
    ecgBounds: { left: number; top: number; width: number; height: number }
  ): void {
    const renderer = new MeasurementsBoxRenderer(this.ctx, {
      x: ecgBounds.left + ecgBounds.width - 168,
      y: ecgBounds.top + 8,
    });
    renderer.render(measurements);
  }

  /**
   * Render footer
   */
  private renderFooter(data: FullPageDocumentData): void {
    const { ctx, options } = this;
    const { width, height, footerHeight, paperSpeed, limbGain, precordialGain, leadFormat } = options;

    const footerY = height - footerHeight;
    const renderer = new FooterRenderer(ctx, {
      width,
      height: footerHeight,
      y: footerY,
    });

    renderer.render({
      paperSpeed,
      limbGain,
      precordialGain,
      sampleRate: 500,
      filterLow: 0.05,
      filterHigh: 150,
      notchFilter: 60,
      leadFormat,
      qtcFormula: 'Bazett',
      orderNumber: data.patient.orderNumber,
      isConfirmed: !!data.patient.confirmedBy,
    });
  }
}

/**
 * Convenience function to render a full page ECG document
 */
export function renderFullPage(
  ctx: CanvasRenderingContext2D,
  data: FullPageDocumentData,
  options: FullPageRenderOptions
): void {
  const renderer = new FullPageRenderer(ctx, options);
  renderer.render(data);
}
