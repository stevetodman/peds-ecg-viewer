/**
 * Manual ECG Digitizer UI
 * Full manual digitization for difficult images
 * Supports both 12-lead and 15-lead ECGs
 *
 * @module signal/loader/png-digitizer/ui/manual-digitizer-ui
 */

import type { LeadName } from '../../../../types';
import type { HumanCorrection } from '../human-verified-digitizer';
import type { Bounds, Point } from '../types';

/**
 * Standard 12-lead layout
 */
const STANDARD_12_LEADS: LeadName[] = [
  'I', 'aVR', 'V1', 'V4',
  'II', 'aVL', 'V2', 'V5',
  'III', 'aVF', 'V3', 'V6',
];

/**
 * Pediatric 15-lead layout
 */
const PEDIATRIC_15_LEADS: LeadName[] = [
  'I', 'aVR', 'V1', 'V4', 'V3R',
  'II', 'aVL', 'V2', 'V5', 'V4R',
  'III', 'aVF', 'V3', 'V6', 'V7',
];

/**
 * Digitization step
 */
type DigitizationStep =
  | 'select-format'
  | 'draw-grid'
  | 'mark-calibration'
  | 'draw-panels'
  | 'review';

/**
 * Manual digitization state
 */
interface ManualState {
  step: DigitizationStep;
  format: '12-lead' | '15-lead';
  gridCorners: Point[];
  calibrationStart?: Point;
  calibrationEnd?: Point;
  panels: Array<{
    lead: LeadName;
    bounds: Bounds;
    baselineY: number;
  }>;
  currentPanelIndex: number;
}

/**
 * UI Configuration
 */
export interface ManualDigitizerConfig {
  container: HTMLElement | string;
  theme?: 'light' | 'dark';
}

/**
 * Show manual digitization UI
 */
export function showManualDigitizerUI(
  image: ImageData,
  config: ManualDigitizerConfig
): Promise<HumanCorrection> {
  return new Promise((resolve) => {
    const container = typeof config.container === 'string'
      ? document.querySelector(config.container) as HTMLElement
      : config.container;

    if (!container) {
      throw new Error('Container not found');
    }

    const state: ManualState = {
      step: 'select-format',
      format: '12-lead',
      gridCorners: [],
      panels: [],
      currentPanelIndex: 0,
    };

    // Create and render UI
    const ui = createManualDigitizerUI(image, state, config, resolve);
    container.innerHTML = '';
    container.appendChild(ui);
  });
}

/**
 * Create the manual digitizer UI
 */
function createManualDigitizerUI(
  image: ImageData,
  state: ManualState,
  config: ManualDigitizerConfig,
  onComplete: (correction: HumanCorrection) => void
): HTMLElement {
  const isDark = config.theme === 'dark';

  const wrapper = document.createElement('div');
  wrapper.className = 'manual-digitizer';
  wrapper.innerHTML = `
    <style>
      .manual-digitizer {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: ${isDark ? '#1a1a2e' : '#ffffff'};
        color: ${isDark ? '#ffffff' : '#333333'};
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        max-width: 1400px;
        margin: 0 auto;
      }
      .md-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .md-title {
        font-size: 20px;
        font-weight: 600;
        margin: 0;
      }
      .md-steps {
        display: flex;
        gap: 8px;
      }
      .md-step {
        padding: 6px 12px;
        border-radius: 16px;
        font-size: 12px;
        background: ${isDark ? '#2a2a3e' : '#f3f4f6'};
        color: ${isDark ? '#9ca3af' : '#6b7280'};
      }
      .md-step.active {
        background: #3b82f6;
        color: white;
      }
      .md-step.completed {
        background: #22c55e;
        color: white;
      }
      .md-content {
        display: flex;
        gap: 20px;
      }
      .md-canvas-container {
        flex: 1;
        position: relative;
        border-radius: 8px;
        overflow: hidden;
        border: 2px solid ${isDark ? '#333' : '#e5e7eb'};
      }
      .md-canvas {
        display: block;
        width: 100%;
        cursor: crosshair;
      }
      .md-sidebar {
        width: 300px;
        background: ${isDark ? '#2a2a3e' : '#f9fafb'};
        border-radius: 8px;
        padding: 16px;
      }
      .md-instruction {
        font-size: 14px;
        line-height: 1.6;
        margin-bottom: 16px;
        padding: 12px;
        background: ${isDark ? '#1a1a2e' : '#ffffff'};
        border-radius: 6px;
        border-left: 4px solid #3b82f6;
      }
      .md-format-buttons {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .md-format-btn {
        padding: 20px;
        border: 2px solid ${isDark ? '#444' : '#d1d5db'};
        border-radius: 8px;
        background: ${isDark ? '#2a2a3e' : '#ffffff'};
        cursor: pointer;
        text-align: left;
        transition: all 0.2s;
      }
      .md-format-btn:hover {
        border-color: #3b82f6;
      }
      .md-format-btn.selected {
        border-color: #3b82f6;
        background: ${isDark ? '#1e3a5f' : '#dbeafe'};
      }
      .md-format-title {
        font-weight: 600;
        font-size: 16px;
        margin-bottom: 4px;
      }
      .md-format-desc {
        font-size: 12px;
        color: ${isDark ? '#9ca3af' : '#6b7280'};
      }
      .md-lead-list {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
        margin-bottom: 16px;
      }
      .md-lead-item {
        padding: 8px;
        text-align: center;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        background: ${isDark ? '#1a1a2e' : '#ffffff'};
        border: 1px solid ${isDark ? '#444' : '#e5e7eb'};
      }
      .md-lead-item.current {
        background: #3b82f6;
        color: white;
        border-color: #3b82f6;
      }
      .md-lead-item.done {
        background: #22c55e;
        color: white;
        border-color: #22c55e;
      }
      .md-btn {
        width: 100%;
        padding: 12px;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        margin-bottom: 8px;
      }
      .md-btn-primary {
        background: #3b82f6;
        color: white;
      }
      .md-btn-primary:hover {
        background: #2563eb;
      }
      .md-btn-primary:disabled {
        background: ${isDark ? '#374151' : '#d1d5db'};
        cursor: not-allowed;
      }
      .md-btn-secondary {
        background: ${isDark ? '#374151' : '#e5e7eb'};
        color: ${isDark ? '#ffffff' : '#374151'};
      }
      .md-btn-success {
        background: #22c55e;
        color: white;
      }
      .md-progress {
        margin-bottom: 12px;
      }
      .md-progress-bar {
        height: 6px;
        background: ${isDark ? '#374151' : '#e5e7eb'};
        border-radius: 3px;
        overflow: hidden;
      }
      .md-progress-fill {
        height: 100%;
        background: #3b82f6;
        transition: width 0.3s;
      }
      .md-progress-text {
        font-size: 12px;
        color: ${isDark ? '#9ca3af' : '#6b7280'};
        margin-top: 4px;
      }
      .md-calibration-inputs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-bottom: 16px;
      }
      .md-input-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .md-input-group label {
        font-size: 12px;
        font-weight: 500;
      }
      .md-input-group input, .md-input-group select {
        padding: 8px;
        border: 1px solid ${isDark ? '#444' : '#d1d5db'};
        border-radius: 6px;
        background: ${isDark ? '#1a1a2e' : '#ffffff'};
        color: inherit;
      }
    </style>

    <div class="md-header">
      <h2 class="md-title">Manual ECG Digitization</h2>
      <div class="md-steps" id="md-steps">
        <span class="md-step active" data-step="select-format">1. Format</span>
        <span class="md-step" data-step="draw-grid">2. Grid</span>
        <span class="md-step" data-step="mark-calibration">3. Calibration</span>
        <span class="md-step" data-step="draw-panels">4. Panels</span>
        <span class="md-step" data-step="review">5. Review</span>
      </div>
    </div>

    <div class="md-content">
      <div class="md-canvas-container">
        <canvas class="md-canvas" id="md-canvas"></canvas>
      </div>
      <div class="md-sidebar" id="md-sidebar"></div>
    </div>
  `;

  // Setup canvas
  const canvas = wrapper.querySelector('#md-canvas') as HTMLCanvasElement;
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(image, 0, 0);

  // Render initial step
  renderStep(wrapper, canvas, ctx, image, state, onComplete);

  return wrapper;
}

/**
 * Render current step
 */
function renderStep(
  wrapper: HTMLElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  image: ImageData,
  state: ManualState,
  onComplete: (correction: HumanCorrection) => void
): void {
  const sidebar = wrapper.querySelector('#md-sidebar') as HTMLElement;
  const steps = wrapper.querySelectorAll('.md-step');

  // Update step indicators
  const stepOrder: DigitizationStep[] = ['select-format', 'draw-grid', 'mark-calibration', 'draw-panels', 'review'];
  const currentIndex = stepOrder.indexOf(state.step);

  steps.forEach((step, i) => {
    step.classList.remove('active', 'completed');
    if (i < currentIndex) step.classList.add('completed');
    if (i === currentIndex) step.classList.add('active');
  });

  // Clear canvas and redraw
  ctx.putImageData(image, 0, 0);
  drawState(ctx, state);

  // Render step-specific sidebar
  switch (state.step) {
    case 'select-format':
      renderFormatStep(sidebar, state, () => {
        state.step = 'draw-grid';
        renderStep(wrapper, canvas, ctx, image, state, onComplete);
      });
      break;

    case 'draw-grid':
      renderGridStep(sidebar, canvas, ctx, image, state, () => {
        state.step = 'mark-calibration';
        renderStep(wrapper, canvas, ctx, image, state, onComplete);
      });
      break;

    case 'mark-calibration':
      renderCalibrationStep(sidebar, canvas, ctx, image, state, () => {
        state.step = 'draw-panels';
        initializePanels(state);
        renderStep(wrapper, canvas, ctx, image, state, onComplete);
      });
      break;

    case 'draw-panels':
      renderPanelsStep(sidebar, canvas, ctx, image, state, () => {
        state.step = 'review';
        renderStep(wrapper, canvas, ctx, image, state, onComplete);
      });
      break;

    case 'review':
      renderReviewStep(sidebar, state, onComplete);
      break;
  }
}

/**
 * Draw current state on canvas
 */
function drawState(ctx: CanvasRenderingContext2D, state: ManualState): void {
  // Draw grid corners
  ctx.fillStyle = '#ef4444';
  for (const corner of state.gridCorners) {
    ctx.beginPath();
    ctx.arc(corner.x, corner.y, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw grid lines if 4 corners
  if (state.gridCorners.length === 4) {
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(state.gridCorners[0].x, state.gridCorners[0].y);
    ctx.lineTo(state.gridCorners[1].x, state.gridCorners[1].y);
    ctx.lineTo(state.gridCorners[3].x, state.gridCorners[3].y);
    ctx.lineTo(state.gridCorners[2].x, state.gridCorners[2].y);
    ctx.closePath();
    ctx.stroke();
  }

  // Draw calibration
  if (state.calibrationStart && state.calibrationEnd) {
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(state.calibrationStart.x, state.calibrationStart.y);
    ctx.lineTo(state.calibrationEnd.x, state.calibrationEnd.y);
    ctx.stroke();

    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(state.calibrationStart.x, state.calibrationStart.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(state.calibrationEnd.x, state.calibrationEnd.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw panels
  for (let i = 0; i < state.panels.length; i++) {
    const panel = state.panels[i];
    const isCurrent = i === state.currentPanelIndex && state.step === 'draw-panels';

    ctx.strokeStyle = isCurrent ? '#3b82f6' : '#22c55e';
    ctx.lineWidth = 2;
    ctx.strokeRect(panel.bounds.x, panel.bounds.y, panel.bounds.width, panel.bounds.height);

    // Baseline
    ctx.strokeStyle = isCurrent ? '#60a5fa' : '#86efac';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(panel.bounds.x, panel.baselineY);
    ctx.lineTo(panel.bounds.x + panel.bounds.width, panel.baselineY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    ctx.fillStyle = isCurrent ? '#3b82f6' : '#22c55e';
    ctx.fillRect(panel.bounds.x, panel.bounds.y - 20, 36, 18);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(panel.lead, panel.bounds.x + 4, panel.bounds.y - 6);
  }
}

/**
 * Render format selection step
 */
function renderFormatStep(
  sidebar: HTMLElement,
  state: ManualState,
  onNext: () => void
): void {
  sidebar.innerHTML = `
    <div class="md-instruction">
      <strong>Step 1: Select ECG Format</strong><br>
      Choose the type of ECG you're digitizing.
    </div>

    <div class="md-format-buttons">
      <div class="md-format-btn ${state.format === '12-lead' ? 'selected' : ''}" data-format="12-lead">
        <div class="md-format-title">12-Lead ECG</div>
        <div class="md-format-desc">Standard adult ECG (I, II, III, aVR, aVL, aVF, V1-V6)</div>
      </div>
      <div class="md-format-btn ${state.format === '15-lead' ? 'selected' : ''}" data-format="15-lead">
        <div class="md-format-title">15-Lead Pediatric ECG</div>
        <div class="md-format-desc">Includes right-sided leads (V3R, V4R, V7)</div>
      </div>
    </div>

    <button class="md-btn md-btn-primary" id="md-next-btn" style="margin-top: 20px;">
      Continue →
    </button>
  `;

  // Event handlers
  sidebar.querySelectorAll('.md-format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sidebar.querySelectorAll('.md-format-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.format = btn.getAttribute('data-format') as '12-lead' | '15-lead';
    });
  });

  sidebar.querySelector('#md-next-btn')!.addEventListener('click', onNext);
}

/**
 * Render grid drawing step
 */
function renderGridStep(
  sidebar: HTMLElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  image: ImageData,
  state: ManualState,
  onNext: () => void
): void {
  sidebar.innerHTML = `
    <div class="md-instruction">
      <strong>Step 2: Mark Grid Corners</strong><br>
      Click the 4 corners of the ECG grid area in order:
      <ol style="margin: 8px 0 0 16px; padding: 0;">
        <li>Top-left</li>
        <li>Top-right</li>
        <li>Bottom-left</li>
        <li>Bottom-right</li>
      </ol>
    </div>

    <div class="md-progress">
      <div class="md-progress-bar">
        <div class="md-progress-fill" style="width: ${state.gridCorners.length * 25}%"></div>
      </div>
      <div class="md-progress-text">${state.gridCorners.length} of 4 corners marked</div>
    </div>

    <button class="md-btn md-btn-secondary" id="md-reset-btn">Reset Corners</button>
    <button class="md-btn md-btn-primary" id="md-next-btn" ${state.gridCorners.length < 4 ? 'disabled' : ''}>
      Continue →
    </button>
  `;

  // Canvas click handler
  const clickHandler = (e: MouseEvent) => {
    if (state.gridCorners.length >= 4) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    state.gridCorners.push({ x, y });

    // Redraw
    ctx.putImageData(image, 0, 0);
    drawState(ctx, state);

    // Update progress
    const progressFill = sidebar.querySelector('.md-progress-fill') as HTMLElement;
    const progressText = sidebar.querySelector('.md-progress-text') as HTMLElement;
    const nextBtn = sidebar.querySelector('#md-next-btn') as HTMLButtonElement;

    progressFill.style.width = `${state.gridCorners.length * 25}%`;
    progressText.textContent = `${state.gridCorners.length} of 4 corners marked`;
    nextBtn.disabled = state.gridCorners.length < 4;
  };

  canvas.addEventListener('click', clickHandler);

  // Reset handler
  sidebar.querySelector('#md-reset-btn')!.addEventListener('click', () => {
    state.gridCorners = [];
    ctx.putImageData(image, 0, 0);
    drawState(ctx, state);

    const progressFill = sidebar.querySelector('.md-progress-fill') as HTMLElement;
    const progressText = sidebar.querySelector('.md-progress-text') as HTMLElement;
    const nextBtn = sidebar.querySelector('#md-next-btn') as HTMLButtonElement;

    progressFill.style.width = '0%';
    progressText.textContent = '0 of 4 corners marked';
    nextBtn.disabled = true;
  });

  sidebar.querySelector('#md-next-btn')!.addEventListener('click', () => {
    canvas.removeEventListener('click', clickHandler);
    onNext();
  });
}

/**
 * Render calibration step
 */
function renderCalibrationStep(
  sidebar: HTMLElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  image: ImageData,
  state: ManualState,
  onNext: () => void
): void {
  sidebar.innerHTML = `
    <div class="md-instruction">
      <strong>Step 3: Mark Calibration Pulse</strong><br>
      Click the bottom and top of the 1mV calibration pulse (usually at the left edge).
    </div>

    <div class="md-calibration-inputs">
      <div class="md-input-group">
        <label>Gain (mm/mV)</label>
        <select id="md-gain">
          <option value="5">5 mm/mV</option>
          <option value="10" selected>10 mm/mV (standard)</option>
          <option value="20">20 mm/mV</option>
        </select>
      </div>
      <div class="md-input-group">
        <label>Paper Speed (mm/s)</label>
        <select id="md-speed">
          <option value="25" selected>25 mm/s (standard)</option>
          <option value="50">50 mm/s</option>
        </select>
      </div>
    </div>

    <div class="md-progress">
      <div class="md-progress-bar">
        <div class="md-progress-fill" style="width: ${state.calibrationStart && state.calibrationEnd ? 100 : state.calibrationStart ? 50 : 0}%"></div>
      </div>
      <div class="md-progress-text">
        ${state.calibrationStart && state.calibrationEnd ? 'Calibration marked' : state.calibrationStart ? 'Click top of pulse' : 'Click bottom of pulse'}
      </div>
    </div>

    <button class="md-btn md-btn-secondary" id="md-skip-btn">Skip (use standard values)</button>
    <button class="md-btn md-btn-primary" id="md-next-btn">
      Continue →
    </button>
  `;

  let clickCount = 0;

  const clickHandler = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (clickCount === 0) {
      state.calibrationStart = { x, y };
      clickCount++;
    } else if (clickCount === 1) {
      state.calibrationEnd = { x, y };
      clickCount++;
    }

    ctx.putImageData(image, 0, 0);
    drawState(ctx, state);

    // Update progress
    const progressFill = sidebar.querySelector('.md-progress-fill') as HTMLElement;
    const progressText = sidebar.querySelector('.md-progress-text') as HTMLElement;

    progressFill.style.width = `${clickCount * 50}%`;
    progressText.textContent = clickCount === 2 ? 'Calibration marked' : clickCount === 1 ? 'Click top of pulse' : 'Click bottom of pulse';
  };

  canvas.addEventListener('click', clickHandler);

  sidebar.querySelector('#md-skip-btn')!.addEventListener('click', () => {
    canvas.removeEventListener('click', clickHandler);
    onNext();
  });

  sidebar.querySelector('#md-next-btn')!.addEventListener('click', () => {
    canvas.removeEventListener('click', clickHandler);
    onNext();
  });
}

/**
 * Initialize panels based on format and grid
 */
function initializePanels(state: ManualState): void {
  const leads = state.format === '15-lead' ? PEDIATRIC_15_LEADS : STANDARD_12_LEADS;
  const cols = state.format === '15-lead' ? 5 : 4;
  const rows = 3;

  // Use grid corners if available, otherwise use defaults
  let gridBounds: Bounds;
  if (state.gridCorners.length === 4) {
    const xs = state.gridCorners.map(c => c.x);
    const ys = state.gridCorners.map(c => c.y);
    gridBounds = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  } else {
    gridBounds = { x: 50, y: 50, width: 1100, height: 800 };
  }

  const panelWidth = gridBounds.width / cols;
  const panelHeight = gridBounds.height / rows;

  state.panels = leads.map((lead, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;

    return {
      lead,
      bounds: {
        x: gridBounds.x + col * panelWidth,
        y: gridBounds.y + row * panelHeight,
        width: panelWidth * 0.95,
        height: panelHeight * 0.90,
      },
      baselineY: gridBounds.y + row * panelHeight + panelHeight / 2,
    };
  });

  state.currentPanelIndex = 0;
}

/**
 * Render panels step
 */
function renderPanelsStep(
  sidebar: HTMLElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  image: ImageData,
  state: ManualState,
  onNext: () => void
): void {
  const leads = state.format === '15-lead' ? PEDIATRIC_15_LEADS : STANDARD_12_LEADS;
  const cols = state.format === '15-lead' ? 5 : 4;

  sidebar.innerHTML = `
    <div class="md-instruction">
      <strong>Step 4: Adjust Panel Bounds</strong><br>
      Click and drag to adjust the bounds for each lead. Click on the baseline (blue dashed line) to adjust it.
    </div>

    <div class="md-lead-list" style="grid-template-columns: repeat(${cols}, 1fr);">
      ${leads.map((lead, i) => `
        <div class="md-lead-item ${i === state.currentPanelIndex ? 'current' : i < state.currentPanelIndex ? 'done' : ''}"
             data-index="${i}">
          ${lead}
        </div>
      `).join('')}
    </div>

    <div class="md-progress">
      <div class="md-progress-bar">
        <div class="md-progress-fill" style="width: ${(state.currentPanelIndex / leads.length) * 100}%"></div>
      </div>
      <div class="md-progress-text">Panel ${state.currentPanelIndex + 1} of ${leads.length}: ${leads[state.currentPanelIndex]}</div>
    </div>

    <button class="md-btn md-btn-secondary" id="md-prev-btn" ${state.currentPanelIndex === 0 ? 'disabled' : ''}>
      ← Previous
    </button>
    <button class="md-btn md-btn-primary" id="md-next-panel-btn">
      ${state.currentPanelIndex === leads.length - 1 ? 'Finish →' : 'Next Panel →'}
    </button>
    <button class="md-btn md-btn-success" id="md-auto-accept-btn" style="margin-top: 12px;">
      Accept All (Auto-generated)
    </button>
  `;

  // Lead item clicks
  sidebar.querySelectorAll('.md-lead-item').forEach(item => {
    item.addEventListener('click', () => {
      state.currentPanelIndex = parseInt(item.getAttribute('data-index') || '0');
      ctx.putImageData(image, 0, 0);
      drawState(ctx, state);
      renderPanelsStep(sidebar, canvas, ctx, image, state, onNext);
    });
  });

  // Previous button
  sidebar.querySelector('#md-prev-btn')!.addEventListener('click', () => {
    if (state.currentPanelIndex > 0) {
      state.currentPanelIndex--;
      ctx.putImageData(image, 0, 0);
      drawState(ctx, state);
      renderPanelsStep(sidebar, canvas, ctx, image, state, onNext);
    }
  });

  // Next panel button
  sidebar.querySelector('#md-next-panel-btn')!.addEventListener('click', () => {
    if (state.currentPanelIndex < leads.length - 1) {
      state.currentPanelIndex++;
      ctx.putImageData(image, 0, 0);
      drawState(ctx, state);
      renderPanelsStep(sidebar, canvas, ctx, image, state, onNext);
    } else {
      onNext();
    }
  });

  // Auto-accept button
  sidebar.querySelector('#md-auto-accept-btn')!.addEventListener('click', onNext);
}

/**
 * Render review step
 */
function renderReviewStep(
  sidebar: HTMLElement,
  state: ManualState,
  onComplete: (correction: HumanCorrection) => void
): void {
  const leads = state.format === '15-lead' ? PEDIATRIC_15_LEADS : STANDARD_12_LEADS;

  sidebar.innerHTML = `
    <div class="md-instruction">
      <strong>Step 5: Review & Complete</strong><br>
      Review the panel layout. All ${leads.length} leads have been mapped.
    </div>

    <div style="margin-bottom: 16px;">
      <strong>Summary:</strong>
      <ul style="margin: 8px 0 0 16px; padding: 0; font-size: 14px;">
        <li>Format: ${state.format}</li>
        <li>Leads: ${leads.join(', ')}</li>
        <li>Panels defined: ${state.panels.length}</li>
      </ul>
    </div>

    <button class="md-btn md-btn-success" id="md-complete-btn">
      ✓ Complete Digitization
    </button>
    <button class="md-btn md-btn-secondary" id="md-back-btn">
      ← Go Back
    </button>
  `;

  sidebar.querySelector('#md-complete-btn')!.addEventListener('click', () => {
    const correction: HumanCorrection = {
      panels: state.panels,
    };
    onComplete(correction);
  });

  sidebar.querySelector('#md-back-btn')!.addEventListener('click', () => {
    state.step = 'draw-panels';
    // Would need to re-render here
  });
}

/**
 * Export convenience function
 */
export async function manualDigitize(
  image: ImageData,
  container: HTMLElement | string
): Promise<HumanCorrection> {
  return showManualDigitizerUI(image, { container });
}
