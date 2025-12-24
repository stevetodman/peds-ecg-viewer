/**
 * MUSE-identical Calipers Tool
 *
 * Two vertical blue lines with markers at top/bottom
 * Horizontal connecting line between the verticals
 * Measurement tooltip showing dt, heart rate, and voltage differences
 * Click to place first line, click again to place second line
 * Measurements update in real-time
 *
 * @module calipers
 */

export interface CaliperPoint {
  x: number;
  y: number;
}

export interface CaliperMeasurement {
  startPoint: CaliperPoint;
  endPoint: CaliperPoint;
  deltaTime: number;      // ms
  deltaVoltage: number;   // µV
  heartRate: number;      // bpm (calculated from deltaTime)
}

export class CalipersManager {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ecgCanvas: HTMLCanvasElement;
  private isActive: boolean = false;
  private isPlacing: boolean = false;
  private currentCaliper: CaliperMeasurement | null = null;
  private calipers: CaliperMeasurement[] = [];
  private paperSpeed: number = 25; // mm/s
  private gain: number = 10; // mm/mV
  private dpi: number = 96;
  private zoom: number = 1;

  // MUSE caliper colors
  private readonly CALIPER_COLOR = '#0000FF';  // Blue
  private readonly CALIPER_LINE_WIDTH = 2;
  private readonly MARKER_SIZE = 8;
  private readonly TOOLTIP_BG = '#FFFFCC';     // Light yellow
  private readonly TOOLTIP_BORDER = '#000000';

  constructor(ecgCanvas: HTMLCanvasElement) {
    this.ecgCanvas = ecgCanvas;

    // Create overlay canvas for calipers
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

    // Insert overlay after ECG canvas
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
    // Bind to the scroll container (ecg-canvas-container) for proper event handling
    const wrapper = this.ecgCanvas.parentElement;
    const scrollContainer = wrapper?.parentElement;
    if (!scrollContainer) return;

    scrollContainer.addEventListener('mousedown', this.onMouseDown.bind(this));
    scrollContainer.addEventListener('mousemove', this.onMouseMove.bind(this));
    scrollContainer.addEventListener('mouseup', this.onMouseUp.bind(this));
    scrollContainer.addEventListener('dblclick', this.onDoubleClick.bind(this));
  }

  public activate(): void {
    this.isActive = true;
    this.canvas.style.pointerEvents = 'auto';
    this.canvas.style.cursor = 'crosshair';
    // Set cursor on scroll container
    const scrollContainer = this.ecgCanvas.parentElement?.parentElement;
    if (scrollContainer) {
      scrollContainer.style.cursor = 'crosshair';
    }
  }

  public deactivate(): void {
    this.isActive = false;
    this.isPlacing = false;
    this.currentCaliper = null;
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.cursor = 'default';
    // Reset cursor on scroll container
    const scrollContainer = this.ecgCanvas.parentElement?.parentElement;
    if (scrollContainer) {
      scrollContainer.style.cursor = 'default';
    }
    this.render();
  }

  public clear(): void {
    this.calipers = [];
    this.currentCaliper = null;
    this.isPlacing = false;
    this.render();
  }

  public setSettings(paperSpeed: number, gain: number, dpi: number): void {
    this.paperSpeed = paperSpeed;
    this.gain = gain;
    this.dpi = dpi;
  }

  public isActiveMode(): boolean {
    return this.isActive;
  }

  private getCanvasPoint(e: MouseEvent): CaliperPoint {
    const rect = this.canvas.getBoundingClientRect();
    // The scroll container is ecg-canvas-container (grandparent of canvas)
    const scrollContainer = this.ecgCanvas.parentElement?.parentElement;
    const scrollLeft = scrollContainer?.scrollLeft || 0;
    const scrollTop = scrollContainer?.scrollTop || 0;
    // Adjust for zoom: screen coordinates must be divided by zoom to get canvas coordinates
    return {
      x: (e.clientX - rect.left + scrollLeft) / this.zoom,
      y: (e.clientY - rect.top + scrollTop) / this.zoom
    };
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.isActive) return;

    const point = this.getCanvasPoint(e);

    if (!this.isPlacing) {
      // Start new caliper - place first line
      this.currentCaliper = {
        startPoint: point,
        endPoint: point,
        deltaTime: 0,
        deltaVoltage: 0,
        heartRate: 0
      };
      this.isPlacing = true;
    } else {
      // Place second line and finalize
      if (this.currentCaliper) {
        this.currentCaliper.endPoint = point;
        this.calculateMeasurement(this.currentCaliper);
        this.calipers.push(this.currentCaliper);
        this.currentCaliper = null;
        this.isPlacing = false;
      }
    }

    this.render();
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isActive || !this.isPlacing || !this.currentCaliper) return;

    const point = this.getCanvasPoint(e);
    this.currentCaliper.endPoint = point;
    this.calculateMeasurement(this.currentCaliper);
    this.render();
  }

  private onMouseUp(_e: MouseEvent): void {
    // No action needed - click-based placement
  }

  private onDoubleClick(e: MouseEvent): void {
    if (!this.isActive) return;

    // Remove caliper if double-clicked on it
    const point = this.getCanvasPoint(e);
    const tolerance = 10;

    this.calipers = this.calipers.filter(caliper => {
      const nearStart = Math.abs(point.x - caliper.startPoint.x) > tolerance;
      const nearEnd = Math.abs(point.x - caliper.endPoint.x) > tolerance;
      return nearStart && nearEnd;
    });

    this.render();
  }

  private calculateMeasurement(caliper: CaliperMeasurement): void {
    const mmPerPx = 25.4 / this.dpi;

    // Calculate time difference (horizontal distance)
    const deltaX = Math.abs(caliper.endPoint.x - caliper.startPoint.x);
    const deltaMm = deltaX * mmPerPx;
    caliper.deltaTime = (deltaMm / this.paperSpeed) * 1000; // Convert to ms

    // Calculate voltage difference (vertical distance)
    const deltaY = caliper.startPoint.y - caliper.endPoint.y; // Inverted Y
    const deltaVoltageMm = deltaY * mmPerPx;
    caliper.deltaVoltage = (deltaVoltageMm / this.gain) * 1000; // Convert to µV

    // Calculate heart rate from time interval
    if (caliper.deltaTime > 0) {
      caliper.heartRate = Math.round(60000 / caliper.deltaTime);
    } else {
      caliper.heartRate = 0;
    }
  }

  public render(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw all saved calipers
    this.calipers.forEach(caliper => this.drawCaliper(caliper));

    // Draw current caliper being placed
    if (this.currentCaliper) {
      this.drawCaliper(this.currentCaliper, true);
    }
  }

  private drawCaliper(caliper: CaliperMeasurement, _isActive: boolean = false): void {
    const { startPoint, endPoint } = caliper;

    this.ctx.save();
    this.ctx.strokeStyle = this.CALIPER_COLOR;
    this.ctx.fillStyle = this.CALIPER_COLOR;
    this.ctx.lineWidth = this.CALIPER_LINE_WIDTH;

    // Determine vertical extent
    const topY = Math.min(startPoint.y, endPoint.y) - 50;
    const bottomY = Math.max(startPoint.y, endPoint.y) + 50;

    // Draw first vertical line with markers
    this.drawVerticalLine(startPoint.x, topY, bottomY);

    // Draw second vertical line with markers
    this.drawVerticalLine(endPoint.x, topY, bottomY);

    // Draw horizontal connecting line at the average Y position
    const midY = (startPoint.y + endPoint.y) / 2;
    this.ctx.beginPath();
    this.ctx.moveTo(startPoint.x, midY);
    this.ctx.lineTo(endPoint.x, midY);
    this.ctx.stroke();

    // Draw arrowheads on horizontal line
    this.drawArrowhead(startPoint.x, midY, endPoint.x > startPoint.x ? 1 : -1);
    this.drawArrowhead(endPoint.x, midY, endPoint.x > startPoint.x ? -1 : 1);

    // Draw measurement tooltip
    this.drawTooltip(caliper);

    this.ctx.restore();
  }

  private drawVerticalLine(x: number, topY: number, bottomY: number): void {
    // Main vertical line
    this.ctx.beginPath();
    this.ctx.moveTo(x, topY);
    this.ctx.lineTo(x, bottomY);
    this.ctx.stroke();

    // Top marker (small horizontal line)
    this.ctx.beginPath();
    this.ctx.moveTo(x - this.MARKER_SIZE / 2, topY);
    this.ctx.lineTo(x + this.MARKER_SIZE / 2, topY);
    this.ctx.stroke();

    // Bottom marker
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
    const { startPoint, endPoint, deltaTime, deltaVoltage, heartRate } = caliper;

    // Position tooltip near the caliper
    const tooltipX = Math.max(startPoint.x, endPoint.x) + 10;
    const tooltipY = (startPoint.y + endPoint.y) / 2 - 30;

    // Build tooltip text (MUSE format)
    const lines = [
      `dt = ${Math.round(deltaTime)} ms (${heartRate} bpm)`,
      `dV = ${Math.round(Math.abs(deltaVoltage))} µV`
    ];

    // Measure text for tooltip sizing
    this.ctx.font = '11px Arial';
    const lineHeight = 14;
    const padding = 6;
    const maxWidth = Math.max(...lines.map(l => this.ctx.measureText(l).width));
    const tooltipWidth = maxWidth + padding * 2;
    const tooltipHeight = lines.length * lineHeight + padding * 2;

    // Draw tooltip background
    this.ctx.fillStyle = this.TOOLTIP_BG;
    this.ctx.strokeStyle = this.TOOLTIP_BORDER;
    this.ctx.lineWidth = 1;
    this.ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
    this.ctx.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);

    // Draw tooltip text
    this.ctx.fillStyle = '#000000';
    this.ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      this.ctx.fillText(line, tooltipX + padding, tooltipY + padding + i * lineHeight);
    });
  }

  /**
   * Update canvas size when ECG canvas is resized
   */
  public updateSize(): void {
    this.resizeCanvas();
    this.render();
  }

  /**
   * Update canvas transform to match ECG canvas zoom
   */
  public updateTransform(zoom: number): void {
    this.zoom = zoom;
    this.canvas.style.transform = `scale(${zoom})`;
    this.canvas.style.transformOrigin = 'top left';
  }
}
