/**
 * ECG Verification UI
 * Human verification interface for 100% accuracy
 * Supports both 12-lead and 15-lead ECGs
 *
 * @module signal/loader/png-digitizer/ui/verification-ui
 */

import type { ECGImageAnalysis, PanelAnalysis } from '../types';
import type { LeadName } from '../../../../types';
import type { GuaranteedResult } from '../guaranteed-digitizer';
import type { HumanCorrection } from '../human-verified-digitizer';

/**
 * Standard 12-lead names in display order
 */
const STANDARD_12_LEADS: LeadName[] = [
  'I', 'aVR', 'V1', 'V4',
  'II', 'aVL', 'V2', 'V5',
  'III', 'aVF', 'V3', 'V6',
];

/**
 * Pediatric 15-lead names in display order
 */
const PEDIATRIC_15_LEADS: LeadName[] = [
  'I', 'aVR', 'V1', 'V4', 'V3R',
  'II', 'aVL', 'V2', 'V5', 'V4R',
  'III', 'aVF', 'V3', 'V6', 'V7',
];

/**
 * Verification result from UI
 */
export interface VerificationUIResult {
  approved: boolean;
  corrections?: HumanCorrection;
  timeSpentMs: number;
}

/**
 * UI Configuration
 */
export interface VerificationUIConfig {
  /** Container element or selector */
  container: HTMLElement | string;

  /** Theme */
  theme?: 'light' | 'dark';

  /** Show confidence scores */
  showConfidence?: boolean;

  /** Allow lead label editing */
  allowLabelEdit?: boolean;

  /** Allow bounds adjustment */
  allowBoundsAdjust?: boolean;

  /** Keyboard shortcuts */
  enableKeyboardShortcuts?: boolean;
}

/**
 * Create and show the verification UI
 */
export function showVerificationUI(
  image: ImageData,
  result: GuaranteedResult,
  config: VerificationUIConfig
): Promise<VerificationUIResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const container = typeof config.container === 'string'
      ? document.querySelector(config.container) as HTMLElement
      : config.container;

    if (!container) {
      throw new Error('Container not found');
    }

    const analysis = result.aiAnalysis?.analysis;
    if (!analysis) {
      throw new Error('No analysis data available');
    }

    // Determine if 12-lead or 15-lead
    const detectedLeads = new Set(analysis.panels.map(p => p.lead).filter(Boolean));
    const is15Lead = PEDIATRIC_15_LEADS.slice(12).some(l => detectedLeads.has(l));
    const expectedLeads = is15Lead ? PEDIATRIC_15_LEADS : STANDARD_12_LEADS;
    const gridCols = is15Lead ? 5 : 4;

    // Create UI
    const ui = createVerificationHTML(image, analysis, result, expectedLeads, gridCols, config);
    container.innerHTML = '';
    container.appendChild(ui.element);

    // Draw overlays on canvas
    drawOverlays(ui.canvas, ui.ctx, image, analysis);

    // Setup event handlers
    setupEventHandlers(ui, analysis, expectedLeads, config, (approved, corrections) => {
      container.innerHTML = '';
      resolve({
        approved,
        corrections,
        timeSpentMs: Date.now() - startTime,
      });
    });
  });
}

/**
 * UI Elements
 */
interface UIElements {
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  leadButtons: Map<LeadName, HTMLElement>;
  approveBtn: HTMLElement;
  correctBtn: HTMLElement;
  panelEditors: Map<string, PanelEditor>;
}

interface PanelEditor {
  panel: PanelAnalysis;
  element: HTMLElement;
  leadSelect: HTMLSelectElement;
  boundsInputs: {
    x: HTMLInputElement;
    y: HTMLInputElement;
    width: HTMLInputElement;
    height: HTMLInputElement;
  };
  baselineInput: HTMLInputElement;
}

/**
 * Create the verification UI HTML
 */
function createVerificationHTML(
  image: ImageData,
  analysis: ECGImageAnalysis,
  result: GuaranteedResult,
  expectedLeads: LeadName[],
  gridCols: number,
  config: VerificationUIConfig
): UIElements {
  const wrapper = document.createElement('div');
  wrapper.className = 'ecg-verification-ui';
  wrapper.innerHTML = `
    <style>
      .ecg-verification-ui {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: ${config.theme === 'dark' ? '#1a1a2e' : '#ffffff'};
        color: ${config.theme === 'dark' ? '#ffffff' : '#333333'};
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        max-width: 1200px;
        margin: 0 auto;
      }
      .ecg-verification-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid ${config.theme === 'dark' ? '#333' : '#eee'};
      }
      .ecg-verification-title {
        font-size: 20px;
        font-weight: 600;
        margin: 0;
      }
      .ecg-verification-stats {
        display: flex;
        gap: 20px;
        font-size: 14px;
      }
      .ecg-stat {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .ecg-stat-value {
        font-weight: 600;
        color: ${config.theme === 'dark' ? '#4ade80' : '#16a34a'};
      }
      .ecg-stat-value.warning {
        color: ${config.theme === 'dark' ? '#fbbf24' : '#d97706'};
      }
      .ecg-stat-value.error {
        color: ${config.theme === 'dark' ? '#f87171' : '#dc2626'};
      }
      .ecg-canvas-container {
        position: relative;
        margin-bottom: 16px;
        border-radius: 8px;
        overflow: hidden;
        border: 2px solid ${config.theme === 'dark' ? '#333' : '#e5e7eb'};
      }
      .ecg-canvas {
        display: block;
        width: 100%;
        height: auto;
      }
      .ecg-lead-grid {
        display: grid;
        grid-template-columns: repeat(${gridCols}, 1fr);
        gap: 8px;
        margin-bottom: 20px;
      }
      .ecg-lead-btn {
        padding: 10px 12px;
        border: 2px solid ${config.theme === 'dark' ? '#444' : '#d1d5db'};
        border-radius: 8px;
        background: ${config.theme === 'dark' ? '#2a2a3e' : '#f9fafb'};
        cursor: pointer;
        text-align: center;
        transition: all 0.2s;
        font-size: 14px;
        font-weight: 500;
      }
      .ecg-lead-btn:hover {
        border-color: ${config.theme === 'dark' ? '#666' : '#9ca3af'};
      }
      .ecg-lead-btn.detected {
        border-color: ${config.theme === 'dark' ? '#22c55e' : '#16a34a'};
        background: ${config.theme === 'dark' ? '#14532d' : '#dcfce7'};
      }
      .ecg-lead-btn.missing {
        border-color: ${config.theme === 'dark' ? '#ef4444' : '#dc2626'};
        background: ${config.theme === 'dark' ? '#7f1d1d' : '#fee2e2'};
      }
      .ecg-lead-btn.selected {
        border-color: ${config.theme === 'dark' ? '#3b82f6' : '#2563eb'};
        box-shadow: 0 0 0 3px ${config.theme === 'dark' ? 'rgba(59,130,246,0.3)' : 'rgba(37,99,235,0.2)'};
      }
      .ecg-lead-confidence {
        font-size: 11px;
        color: ${config.theme === 'dark' ? '#9ca3af' : '#6b7280'};
        margin-top: 4px;
      }
      .ecg-actions {
        display: flex;
        gap: 12px;
        justify-content: center;
      }
      .ecg-btn {
        padding: 14px 32px;
        border: none;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .ecg-btn-approve {
        background: #16a34a;
        color: white;
      }
      .ecg-btn-approve:hover {
        background: #15803d;
      }
      .ecg-btn-correct {
        background: ${config.theme === 'dark' ? '#374151' : '#e5e7eb'};
        color: ${config.theme === 'dark' ? '#ffffff' : '#374151'};
      }
      .ecg-btn-correct:hover {
        background: ${config.theme === 'dark' ? '#4b5563' : '#d1d5db'};
      }
      .ecg-keyboard-hint {
        text-align: center;
        margin-top: 12px;
        font-size: 12px;
        color: ${config.theme === 'dark' ? '#6b7280' : '#9ca3af'};
      }
      .ecg-keyboard-hint kbd {
        background: ${config.theme === 'dark' ? '#374151' : '#f3f4f6'};
        padding: 2px 6px;
        border-radius: 4px;
        font-family: monospace;
        margin: 0 2px;
      }
      .ecg-correction-panel {
        margin-top: 16px;
        padding: 16px;
        background: ${config.theme === 'dark' ? '#2a2a3e' : '#f9fafb'};
        border-radius: 8px;
        display: none;
      }
      .ecg-correction-panel.visible {
        display: block;
      }
      .ecg-correction-title {
        font-weight: 600;
        margin-bottom: 12px;
      }
      .ecg-panel-editor {
        display: grid;
        grid-template-columns: 100px 1fr 1fr 1fr 1fr 80px;
        gap: 8px;
        align-items: center;
        padding: 8px;
        background: ${config.theme === 'dark' ? '#1a1a2e' : '#ffffff'};
        border-radius: 6px;
        margin-bottom: 8px;
      }
      .ecg-panel-editor select,
      .ecg-panel-editor input {
        padding: 6px 8px;
        border: 1px solid ${config.theme === 'dark' ? '#444' : '#d1d5db'};
        border-radius: 4px;
        background: ${config.theme === 'dark' ? '#2a2a3e' : '#ffffff'};
        color: inherit;
        font-size: 13px;
      }
      .ecg-format-badge {
        background: ${config.theme === 'dark' ? '#3b82f6' : '#dbeafe'};
        color: ${config.theme === 'dark' ? '#ffffff' : '#1d4ed8'};
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
      }
    </style>

    <div class="ecg-verification-header">
      <h2 class="ecg-verification-title">ECG Verification</h2>
      <div class="ecg-verification-stats">
        <span class="ecg-format-badge">${expectedLeads.length}-Lead ECG</span>
        <div class="ecg-stat">
          <span>Confidence:</span>
          <span class="ecg-stat-value ${result.confidence >= 0.95 ? '' : result.confidence >= 0.85 ? 'warning' : 'error'}">
            ${(result.confidence * 100).toFixed(1)}%
          </span>
        </div>
        <div class="ecg-stat">
          <span>Leads:</span>
          <span class="ecg-stat-value ${analysis.panels.filter(p => p.lead).length === expectedLeads.length ? '' : 'warning'}">
            ${analysis.panels.filter(p => p.lead).length}/${expectedLeads.length}
          </span>
        </div>
        <div class="ecg-stat">
          <span>Grid:</span>
          <span class="ecg-stat-value ${analysis.grid.detected ? '' : 'warning'}">
            ${analysis.grid.detected ? '✓' : '?'}
          </span>
        </div>
      </div>
    </div>

    <div class="ecg-canvas-container">
      <canvas class="ecg-canvas" id="ecg-verification-canvas"></canvas>
    </div>

    <div class="ecg-lead-grid" id="ecg-lead-grid"></div>

    <div class="ecg-actions">
      <button class="ecg-btn ecg-btn-approve" id="ecg-approve-btn">
        <span>✓</span> Approve
      </button>
      <button class="ecg-btn ecg-btn-correct" id="ecg-correct-btn">
        <span>✎</span> Make Corrections
      </button>
    </div>

    ${config.enableKeyboardShortcuts !== false ? `
    <div class="ecg-keyboard-hint">
      Press <kbd>Enter</kbd> to approve or <kbd>E</kbd> to edit
    </div>
    ` : ''}

    <div class="ecg-correction-panel" id="ecg-correction-panel">
      <div class="ecg-correction-title">Panel Corrections</div>
      <div id="ecg-panel-editors"></div>
      <div class="ecg-actions" style="margin-top: 16px;">
        <button class="ecg-btn ecg-btn-approve" id="ecg-save-corrections-btn">
          <span>✓</span> Save Corrections
        </button>
        <button class="ecg-btn ecg-btn-correct" id="ecg-cancel-corrections-btn">
          Cancel
        </button>
      </div>
    </div>
  `;

  // Get canvas
  const canvas = wrapper.querySelector('#ecg-verification-canvas') as HTMLCanvasElement;
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d')!;

  // Create lead buttons
  const leadGrid = wrapper.querySelector('#ecg-lead-grid') as HTMLElement;
  const leadButtons = new Map<LeadName, HTMLElement>();
  const detectedLeads = new Map(
    analysis.panels
      .filter(p => p.lead)
      .map(p => [p.lead!, p])
  );

  for (const lead of expectedLeads) {
    const panel = detectedLeads.get(lead);
    const btn = document.createElement('div');
    btn.className = `ecg-lead-btn ${panel ? 'detected' : 'missing'}`;
    btn.dataset.lead = lead;
    btn.innerHTML = `
      <div>${lead}</div>
      ${config.showConfidence !== false && panel ? `
        <div class="ecg-lead-confidence">${(panel.labelConfidence * 100).toFixed(0)}%</div>
      ` : ''}
    `;
    leadGrid.appendChild(btn);
    leadButtons.set(lead, btn);
  }

  // Create panel editors (hidden initially)
  const panelEditors = new Map<string, PanelEditor>();
  const editorsContainer = wrapper.querySelector('#ecg-panel-editors') as HTMLElement;

  for (const panel of analysis.panels) {
    if (!panel.lead) continue;

    const editorEl = document.createElement('div');
    editorEl.className = 'ecg-panel-editor';
    editorEl.innerHTML = `
      <select class="lead-select">
        ${expectedLeads.map(l => `<option value="${l}" ${l === panel.lead ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <input type="number" class="bounds-x" value="${Math.round(panel.bounds.x)}" placeholder="X">
      <input type="number" class="bounds-y" value="${Math.round(panel.bounds.y)}" placeholder="Y">
      <input type="number" class="bounds-w" value="${Math.round(panel.bounds.width)}" placeholder="Width">
      <input type="number" class="bounds-h" value="${Math.round(panel.bounds.height)}" placeholder="Height">
      <input type="number" class="baseline" value="${Math.round(panel.baselineY)}" placeholder="Baseline">
    `;
    editorsContainer.appendChild(editorEl);

    panelEditors.set(panel.id, {
      panel,
      element: editorEl,
      leadSelect: editorEl.querySelector('.lead-select') as HTMLSelectElement,
      boundsInputs: {
        x: editorEl.querySelector('.bounds-x') as HTMLInputElement,
        y: editorEl.querySelector('.bounds-y') as HTMLInputElement,
        width: editorEl.querySelector('.bounds-w') as HTMLInputElement,
        height: editorEl.querySelector('.bounds-h') as HTMLInputElement,
      },
      baselineInput: editorEl.querySelector('.baseline') as HTMLInputElement,
    });
  }

  return {
    element: wrapper,
    canvas,
    ctx,
    leadButtons,
    approveBtn: wrapper.querySelector('#ecg-approve-btn') as HTMLElement,
    correctBtn: wrapper.querySelector('#ecg-correct-btn') as HTMLElement,
    panelEditors,
  };
}

/**
 * Draw overlays on the canvas
 */
function drawOverlays(
  _canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  image: ImageData,
  analysis: ECGImageAnalysis
): void {
  // Draw original image
  ctx.putImageData(image, 0, 0);

  // Draw panel overlays
  for (const panel of analysis.panels) {
    if (!panel.lead) continue;

    const { bounds, baselineY, lead } = panel;

    // Draw bounds rectangle
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.8)'; // Green
    ctx.lineWidth = 2;
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

    // Draw baseline
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)'; // Blue
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(bounds.x, baselineY);
    ctx.lineTo(bounds.x + bounds.width, baselineY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw lead label
    ctx.fillStyle = 'rgba(34, 197, 94, 0.9)';
    ctx.fillRect(bounds.x, bounds.y - 24, 40, 22);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(lead, bounds.x + 6, bounds.y - 8);
  }

  // Draw grid info
  if (analysis.grid.detected && analysis.grid.pxPerMm) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 150, 50);
    ctx.fillStyle = 'white';
    ctx.font = '12px sans-serif';
    ctx.fillText(`Grid: ${analysis.grid.pxPerMm.toFixed(1)} px/mm`, 20, 30);
    ctx.fillText(`Calibration: ${analysis.calibration.gain} mm/mV`, 20, 48);
  }
}

/**
 * Setup event handlers
 */
function setupEventHandlers(
  ui: UIElements,
  analysis: ECGImageAnalysis,
  expectedLeads: LeadName[],
  config: VerificationUIConfig,
  onComplete: (approved: boolean, corrections?: HumanCorrection) => void
): void {
  const correctionPanel = ui.element.querySelector('#ecg-correction-panel') as HTMLElement;
  let selectedLead: LeadName | null = null;

  // Lead button clicks - highlight panel
  ui.leadButtons.forEach((btn, lead) => {
    btn.addEventListener('click', () => {
      // Toggle selection
      if (selectedLead === lead) {
        selectedLead = null;
        btn.classList.remove('selected');
      } else {
        // Deselect previous
        if (selectedLead) {
          ui.leadButtons.get(selectedLead)?.classList.remove('selected');
        }
        selectedLead = lead;
        btn.classList.add('selected');
      }

      // Redraw with highlight
      const panel = analysis.panels.find(p => p.lead === lead);
      if (panel) {
        // Could highlight specific panel here
      }
    });
  });

  // Approve button
  ui.approveBtn.addEventListener('click', () => {
    onComplete(true);
  });

  // Correct button
  ui.correctBtn.addEventListener('click', () => {
    correctionPanel.classList.add('visible');
    ui.approveBtn.style.display = 'none';
    ui.correctBtn.style.display = 'none';
  });

  // Save corrections button
  const saveBtn = ui.element.querySelector('#ecg-save-corrections-btn') as HTMLElement;
  saveBtn.addEventListener('click', () => {
    const corrections = collectCorrections(ui, expectedLeads);
    onComplete(true, corrections);
  });

  // Cancel corrections button
  const cancelBtn = ui.element.querySelector('#ecg-cancel-corrections-btn') as HTMLElement;
  cancelBtn.addEventListener('click', () => {
    correctionPanel.classList.remove('visible');
    ui.approveBtn.style.display = '';
    ui.correctBtn.style.display = '';
  });

  // Keyboard shortcuts
  if (config.enableKeyboardShortcuts !== false) {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !correctionPanel.classList.contains('visible')) {
        onComplete(true);
        document.removeEventListener('keydown', handleKeydown);
      } else if (e.key === 'e' || e.key === 'E') {
        correctionPanel.classList.add('visible');
        ui.approveBtn.style.display = 'none';
        ui.correctBtn.style.display = 'none';
      } else if (e.key === 'Escape') {
        correctionPanel.classList.remove('visible');
        ui.approveBtn.style.display = '';
        ui.correctBtn.style.display = '';
      }
    };
    document.addEventListener('keydown', handleKeydown);
  }
}

/**
 * Collect corrections from UI
 */
function collectCorrections(ui: UIElements, _expectedLeads: LeadName[]): HumanCorrection {
  const panels: HumanCorrection['panels'] = [];

  ui.panelEditors.forEach((editor) => {
    panels.push({
      lead: editor.leadSelect.value as LeadName,
      bounds: {
        x: parseInt(editor.boundsInputs.x.value) || 0,
        y: parseInt(editor.boundsInputs.y.value) || 0,
        width: parseInt(editor.boundsInputs.width.value) || 0,
        height: parseInt(editor.boundsInputs.height.value) || 0,
      },
      baselineY: parseInt(editor.baselineInput.value) || 0,
    });
  });

  return { panels };
}

/**
 * Quick verification - just approve/reject
 */
export async function showQuickVerification(
  image: ImageData,
  result: GuaranteedResult,
  container: HTMLElement | string
): Promise<boolean> {
  const uiResult = await showVerificationUI(image, result, {
    container,
    allowBoundsAdjust: false,
    allowLabelEdit: false,
  });
  return uiResult.approved;
}

/**
 * Full verification with correction capability
 */
export async function showFullVerification(
  image: ImageData,
  result: GuaranteedResult,
  container: HTMLElement | string
): Promise<VerificationUIResult> {
  return showVerificationUI(image, result, {
    container,
    allowBoundsAdjust: true,
    allowLabelEdit: true,
    showConfidence: true,
    enableKeyboardShortcuts: true,
  });
}
