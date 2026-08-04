/**
 * Local, calibrated manual ECG calipers.
 *
 * Measurements describe geometry and the calibration used to calculate them.
 * They do not interpret an ECG or provide a diagnosis.
 *
 * @module calipers
 */

export interface CaliperPoint {
  x: number;
  y: number;
}

/** Physical calibration for the rendered ECG image. */
export interface CaliperCalibration {
  /** Rendered image pixels per millimetre. Must be finite and greater than zero. */
  pixelsPerMm: number;
  /** ECG paper speed in millimetres per second. Must be finite and greater than zero. */
  paperSpeedMmPerSecond: number;
  /** ECG gain in millimetres per millivolt. Must be finite and greater than zero. */
  gainMmPerMv: number;
}

export interface CaliperProvenance {
  tool: 'manual-calipers';
  calibration: CaliperCalibration;
  horizontalPixels: number;
  verticalPixels: number;
}

/**
 * A local geometric measurement. Amplitude is signed: movement upward on the
 * canvas is positive because canvas Y coordinates increase downward.
 */
export interface CaliperMeasurement {
  startPoint: CaliperPoint;
  endPoint: CaliperPoint;
  intervalMs: number;
  amplitudeMv: number;
  rateBpm: number | null;
  provenance: CaliperProvenance;

  /** @deprecated Use intervalMs. Retained for compatibility with existing callers. */
  deltaTime: number;
  /** @deprecated Use amplitudeMv. Retained in microvolts for compatibility. */
  deltaVoltage: number;
  /** @deprecated Use rateBpm. A zero value means rateBpm is null. */
  heartRate: number;
}

export const DEFAULT_CALIPER_CALIBRATION: Readonly<CaliperCalibration> = Object.freeze({
  pixelsPerMm: 96 / 25.4,
  paperSpeedMmPerSecond: 25,
  gainMmPerMv: 10,
});

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite number greater than zero`);
  }
}

function validateCalibration(calibration: CaliperCalibration): void {
  assertPositiveFinite(calibration.pixelsPerMm, 'pixelsPerMm');
  assertPositiveFinite(calibration.paperSpeedMmPerSecond, 'paperSpeedMmPerSecond');
  assertPositiveFinite(calibration.gainMmPerMv, 'gainMmPerMv');
}

/**
 * Calculate one manual caliper measurement with its complete local provenance.
 * This function intentionally performs no ECG interpretation or diagnosis.
 */
export function measureCaliper(
  startPoint: CaliperPoint,
  endPoint: CaliperPoint,
  calibration: CaliperCalibration,
): CaliperMeasurement {
  validateCalibration(calibration);

  const calibrationSnapshot = { ...calibration };
  const horizontalPixels = Math.abs(endPoint.x - startPoint.x);
  const verticalPixels = startPoint.y - endPoint.y;
  const horizontalMm = horizontalPixels / calibrationSnapshot.pixelsPerMm;
  const verticalMm = verticalPixels / calibrationSnapshot.pixelsPerMm;
  const intervalMs = (horizontalMm / calibrationSnapshot.paperSpeedMmPerSecond) * 1000;
  const amplitudeMv = verticalMm / calibrationSnapshot.gainMmPerMv;
  const rateBpm = intervalMs > 0 && Number.isFinite(intervalMs)
    ? 60000 / intervalMs
    : null;

  return {
    startPoint: { ...startPoint },
    endPoint: { ...endPoint },
    intervalMs,
    amplitudeMv,
    rateBpm,
    provenance: {
      tool: 'manual-calipers',
      calibration: calibrationSnapshot,
      horizontalPixels,
      verticalPixels,
    },
    // Compatibility aliases for the original manager API.
    deltaTime: intervalMs,
    deltaVoltage: amplitudeMv * 1000,
    heartRate: rateBpm === null ? 0 : Math.round(rateBpm),
  };
}

/**
 * MUSE-style visual manager backed by local calibrated measurements.
 */
export class CalipersManager {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ecgCanvas: HTMLCanvasElement;
  private isActive = false;
  private isPlacing = false;
  private currentCaliper: CaliperMeasurement | null = null;
  private calipers: CaliperMeasurement[] = [];
  private calibration: CaliperCalibration = { ...DEFAULT_CALIPER_CALIBRATION };

  private readonly CALIPER_COLOR = '#0000FF';
  private readonly CALIPER_LINE_WIDTH = 2;
  private readonly MARKER_SIZE = 8;
  private readonly TOOLTIP_BG = '#FFFFCC';
  private readonly TOOLTIP_BORDER = '#000000';

  constructor(ecgCanvas: HTMLCanvasElement) {
    this.ecgCanvas = ecgCanvas;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'calipers-canvas';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '10';

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get calipers canvas context');
    this.ctx = ctx;
    this.ecgCanvas.parentElement?.appendChild(this.canvas);
    this.resizeCanvas();
    this.bindEvents();
  }

  private resizeCanvas(): void {
    this.canvas.width = this.ecgCanvas.width;
    this.canvas.height = this.ecgCanvas.height;
    this.canvas.style.width = this.ecgCanvas.style.width;
    this.canvas.style.height = this.ecgCanvas.style.height;
  }

  private bindEvents(): void {
    const scrollContainer = this.ecgCanvas.parentElement?.parentElement;
    if (!scrollContainer) return;
    scrollContainer.addEventListener('mousedown', this.onMouseDown.bind(this));
    scrollContainer.addEventListener('mousemove', this.onMouseMove.bind(this));
    scrollContainer.addEventListener('dblclick', this.onDoubleClick.bind(this));
  }

  public activate(): void {
    this.isActive = true;
    this.canvas.style.pointerEvents = 'auto';
    this.canvas.style.cursor = 'crosshair';
    const scrollContainer = this.ecgCanvas.parentElement?.parentElement;
    if (scrollContainer) scrollContainer.style.cursor = 'crosshair';
  }

  public deactivate(): void {
    this.isActive = false;
    this.isPlacing = false;
    this.currentCaliper = null;
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.cursor = 'default';
    const scrollContainer = this.ecgCanvas.parentElement?.parentElement;
    if (scrollContainer) scrollContainer.style.cursor = 'default';
    this.render();
  }

  public clear(): void {
    this.calipers = [];
    this.currentCaliper = null;
    this.isPlacing = false;
    this.render();
  }

  /** Set the explicit physical calibration used for all future measurements. */
  public setCalibration(calibration: CaliperCalibration): void {
    validateCalibration(calibration);
    this.calibration = { ...calibration };
    this.recalculateMeasurements();
    this.render();
  }

  public getCalibration(): Readonly<CaliperCalibration> {
    return { ...this.calibration };
  }

  public getMeasurements(): readonly CaliperMeasurement[] {
    return this.calipers.map(caliper => ({
      ...caliper,
      startPoint: { ...caliper.startPoint },
      endPoint: { ...caliper.endPoint },
      provenance: {
        ...caliper.provenance,
        calibration: { ...caliper.provenance.calibration },
      },
    }));
  }

  /**
   * Legacy settings adapter. DPI is converted once to pixels-per-mm; callers
   * needing image-specific calibration should use setCalibration directly.
   */
  public setSettings(paperSpeed: number, gain: number, dpi: number): void {
    assertPositiveFinite(dpi, 'dpi');
    this.setCalibration({
      pixelsPerMm: dpi / 25.4,
      paperSpeedMmPerSecond: paperSpeed,
      gainMmPerMv: gain,
    });
  }

  public isActiveMode(): boolean {
    return this.isActive;
  }

  private getCanvasPoint(event: MouseEvent): CaliperPoint {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error('Cannot place calipers on a canvas with no visible size');
    }
    // The bounding rectangle already accounts for scroll position and zoom.
    return {
      x: (event.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (event.clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }

  private onMouseDown(event: MouseEvent): void {
    if (!this.isActive || event.button !== 0) return;
    // A double-click's first press starts a preview; its second must cancel it
    // before the dblclick handler removes an existing caliper.
    if (event.detail === 2) {
      this.currentCaliper = null;
      this.isPlacing = false;
      return;
    }

    const point = this.getCanvasPoint(event);
    if (!this.isPlacing) {
      this.currentCaliper = measureCaliper(point, point, this.calibration);
      this.isPlacing = true;
    } else {
      if (!this.currentCaliper) {
        this.isPlacing = false;
        return;
      }
      this.currentCaliper = measureCaliper(this.currentCaliper.startPoint, point, this.calibration);
      this.calipers.push(this.currentCaliper);
      this.currentCaliper = null;
      this.isPlacing = false;
    }
    this.render();
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.isActive || !this.isPlacing || !this.currentCaliper) return;
    this.currentCaliper = measureCaliper(
      this.currentCaliper.startPoint,
      this.getCanvasPoint(event),
      this.calibration,
    );
    this.render();
  }

  private onDoubleClick(event: MouseEvent): void {
    if (!this.isActive) return;
    const point = this.getCanvasPoint(event);
    const tolerance = 10;
    this.calipers = this.calipers.filter(caliper =>
      Math.abs(point.x - caliper.startPoint.x) > tolerance
      && Math.abs(point.x - caliper.endPoint.x) > tolerance,
    );
    this.render();
  }

  private recalculateMeasurements(): void {
    this.calipers = this.calipers.map(caliper =>
      measureCaliper(caliper.startPoint, caliper.endPoint, this.calibration),
    );
    if (this.currentCaliper) {
      this.currentCaliper = measureCaliper(
        this.currentCaliper.startPoint,
        this.currentCaliper.endPoint,
        this.calibration,
      );
    }
  }

  public render(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.calipers.forEach(caliper => this.drawCaliper(caliper));
    if (this.currentCaliper) this.drawCaliper(this.currentCaliper);
  }

  private drawCaliper(caliper: CaliperMeasurement): void {
    const { startPoint, endPoint } = caliper;
    this.ctx.save();
    this.ctx.strokeStyle = this.CALIPER_COLOR;
    this.ctx.fillStyle = this.CALIPER_COLOR;
    this.ctx.lineWidth = this.CALIPER_LINE_WIDTH;

    const topY = Math.min(startPoint.y, endPoint.y) - 50;
    const bottomY = Math.max(startPoint.y, endPoint.y) + 50;
    this.drawVerticalLine(startPoint.x, topY, bottomY);
    this.drawVerticalLine(endPoint.x, topY, bottomY);

    const midY = (startPoint.y + endPoint.y) / 2;
    this.ctx.beginPath();
    this.ctx.moveTo(startPoint.x, midY);
    this.ctx.lineTo(endPoint.x, midY);
    this.ctx.stroke();
    const direction = endPoint.x >= startPoint.x ? 1 : -1;
    this.drawArrowhead(startPoint.x, midY, direction);
    this.drawArrowhead(endPoint.x, midY, -direction);
    this.drawTooltip(caliper);
    this.ctx.restore();
  }

  private drawVerticalLine(x: number, topY: number, bottomY: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x, topY);
    this.ctx.lineTo(x, bottomY);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(x - this.MARKER_SIZE / 2, topY);
    this.ctx.lineTo(x + this.MARKER_SIZE / 2, topY);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(x - this.MARKER_SIZE / 2, bottomY);
    this.ctx.lineTo(x + this.MARKER_SIZE / 2, bottomY);
    this.ctx.stroke();
  }

  private drawArrowhead(x: number, y: number, direction: number): void {
    const size = 6;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x + direction * size, y - size / 2);
    this.ctx.lineTo(x + direction * size, y + size / 2);
    this.ctx.closePath();
    this.ctx.fill();
  }

  private drawTooltip(caliper: CaliperMeasurement): void {
    const { startPoint, endPoint, intervalMs, amplitudeMv, rateBpm } = caliper;
    const tooltipX = Math.max(startPoint.x, endPoint.x) + 10;
    const tooltipY = (startPoint.y + endPoint.y) / 2 - 30;
    const rateLabel = rateBpm === null ? 'rate unavailable' : `${Math.round(rateBpm)} bpm`;
    const lines = [
      `dt = ${Math.round(intervalMs)} ms (${rateLabel})`,
      `dV = ${Math.abs(amplitudeMv).toFixed(2)} mV`,
    ];

    this.ctx.font = '11px Arial';
    const lineHeight = 14;
    const padding = 6;
    const maxWidth = Math.max(...lines.map(line => this.ctx.measureText(line).width));
    const tooltipWidth = maxWidth + padding * 2;
    const tooltipHeight = lines.length * lineHeight + padding * 2;
    this.ctx.fillStyle = this.TOOLTIP_BG;
    this.ctx.strokeStyle = this.TOOLTIP_BORDER;
    this.ctx.lineWidth = 1;
    this.ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
    this.ctx.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
    this.ctx.fillStyle = '#000000';
    this.ctx.textBaseline = 'top';
    lines.forEach((line, index) => {
      this.ctx.fillText(line, tooltipX + padding, tooltipY + padding + index * lineHeight);
    });
  }

  public updateSize(): void {
    this.resizeCanvas();
    this.render();
  }

  public updateTransform(zoom: number): void {
    assertPositiveFinite(zoom, 'zoom');
    this.canvas.style.transform = `scale(${zoom})`;
    this.canvas.style.transformOrigin = 'top left';
  }
}
