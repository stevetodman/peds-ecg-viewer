/**
 * AI Response Validator
 * Validates AI analysis results and calculates confidence scores
 *
 * @module signal/loader/png-digitizer/ai/validator
 */

import type { ECGImageAnalysis, GridAnalysis, CalibrationAnalysis, PanelAnalysis } from '../types';
import type { LeadName } from '../../../../types';

/**
 * Validation weights for different components
 * Panels weight is highest because lead detection is most critical for digitization
 */
const WEIGHTS = {
  grid: 0.20,
  layout: 0.10,
  calibration: 0.15,
  panels: 0.45,      // Increased: Lead detection is most critical
  imageQuality: 0.10,
};

/**
 * Validate analysis and calculate overall confidence
 * @returns Overall confidence score (0-1)
 */
export function validateAnalysis(analysis: ECGImageAnalysis): number {
  const scores = {
    grid: validateGrid(analysis.grid),
    layout: validateLayout(analysis),
    calibration: validateCalibration(analysis.calibration),
    panels: validatePanels(analysis.panels),
    imageQuality: analysis.imageQuality.overall,
  };

  // Weighted average
  let totalWeight = 0;
  let totalScore = 0;

  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const score = scores[key as keyof typeof scores];
    totalWeight += weight;
    totalScore += score * weight;
  }

  let confidence = totalScore / totalWeight;

  // SUCCESS BONUS: If all 12 standard leads were found with good panel scores, boost confidence
  const leadPanels = analysis.panels.filter(p => !p.isRhythmStrip && p.lead);
  const detectedLeads = new Set(leadPanels.map(p => p.lead));
  const standardLeadsFound = STANDARD_12_LEADS.filter(l => detectedLeads.has(l as LeadName)).length;


  if (standardLeadsFound === 12) {
    // All 12 leads found - this is a major success indicator
    // The whole point of digitization is lead extraction, so reward it heavily
    confidence = Math.max(0.95, Math.min(1, confidence * 1.20)); // Floor at 95% for complete detection
  } else if (standardLeadsFound >= 10) {
    // Near-complete detection
    confidence = Math.max(0.90, Math.min(1, confidence * 1.10)); // Floor at 90%
  } else if (standardLeadsFound >= 6) {
    // Partial detection
    confidence = Math.max(0.80, Math.min(1, confidence * 1.05)); // Floor at 80%
  }

  return confidence;
}

/**
 * Validate grid analysis
 */
function validateGrid(grid: GridAnalysis): number {
  if (!grid.detected) {
    // No grid detected is valid for some ECGs
    return 0.5;
  }

  let score = grid.confidence;

  // Bonus for having essential measurements
  if (grid.pxPerMm && grid.pxPerMm > 0) {
    score = Math.min(1, score + 0.1);
  }

  // Sanity check: pxPerMm should be reasonable (2-50 for typical screens/prints)
  if (grid.pxPerMm && (grid.pxPerMm < 1 || grid.pxPerMm > 100)) {
    score *= 0.5;
  }

  // Sanity check: smallBoxPx should be close to pxPerMm
  if (grid.smallBoxPx && grid.pxPerMm) {
    const ratio = grid.smallBoxPx / grid.pxPerMm;
    if (ratio < 0.8 || ratio > 1.2) {
      score *= 0.8;
    }
  }

  // Sanity check: largeBoxPx should be ~5x smallBoxPx
  if (grid.largeBoxPx && grid.smallBoxPx) {
    const ratio = grid.largeBoxPx / grid.smallBoxPx;
    if (ratio < 4 || ratio > 6) {
      score *= 0.8;
    }
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Validate layout analysis
 */
function validateLayout(analysis: ECGImageAnalysis): number {
  const { layout } = analysis;
  let score = layout.confidence;

  // Must have reasonable dimensions
  if (layout.imageWidth <= 0 || layout.imageHeight <= 0) {
    score *= 0.5;
  }

  // Grid bounds should be within image
  if (layout.gridBounds) {
    const { x, y, width, height } = layout.gridBounds;
    if (x < 0 || y < 0 || x + width > layout.imageWidth || y + height > layout.imageHeight) {
      score *= 0.8;
    }
  }

  // Standard layouts should have standard dimensions
  if (layout.format === '12-lead') {
    if (layout.columns !== 4 || layout.rows !== 3) {
      // Non-standard 12-lead layout - reduce confidence slightly
      score *= 0.9;
    }
  } else if (layout.format === '15-lead') {
    if (layout.columns !== 5 || layout.rows !== 3) {
      score *= 0.9;
    }
  }

  // Should have panels matching the layout
  const expectedPanels = layout.columns * layout.rows;
  const actualPanels = analysis.panels.filter(p => !p.isRhythmStrip).length;
  if (actualPanels < expectedPanels * 0.8) {
    score *= 0.7;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Validate calibration analysis
 */
function validateCalibration(calibration: CalibrationAnalysis): number {
  let score = calibration.confidence;

  // Standard gain should be 10 mm/mV (or 5, 20)
  if (![5, 10, 20].includes(calibration.gain)) {
    score *= 0.8; // Less penalty
  }

  // Standard paper speed should be 25 or 50 mm/s
  if (![25, 50].includes(calibration.paperSpeed)) {
    score *= 0.8; // Less penalty
  }

  // If calibration pulse found, should have height - good!
  if (calibration.found && calibration.heightPx && calibration.heightPx > 0) {
    score = Math.min(1, score * 1.1); // Bonus for having calibration
  }

  // Using standard assumed values is fine - don't penalize too much
  // Most ECGs use standard 10mm/mV and 25mm/s
  if (!calibration.found && calibration.gainSource === 'standard_assumed') {
    score = Math.max(score, 0.75); // Floor at 0.75 for standard assumptions
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Standard 12-lead names
 */
const STANDARD_12_LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

/**
 * Validate panels analysis
 */
function validatePanels(panels: PanelAnalysis[]): number {
  if (panels.length === 0) {
    return 0;
  }

  // Average panel confidence
  const avgConfidence = panels.reduce((sum, p) => sum + p.labelConfidence, 0) / panels.length;

  // Check for duplicate leads (excluding rhythm strips)
  const leadPanels = panels.filter(p => !p.isRhythmStrip && p.lead);
  const leadSet = new Set(leadPanels.map(p => p.lead));
  const uniqueRatio = leadSet.size / Math.max(1, leadPanels.length);

  // Check for valid bounds
  const validBoundsRatio = panels.filter(p => {
    const { bounds } = p;
    return bounds.width > 0 && bounds.height > 0;
  }).length / panels.length;

  // Check for reasonable baseline positions (must be within panel bounds)
  const validBaselineRatio = panels.filter(p => {
    const topMargin = p.bounds.y + p.bounds.height * 0.1;
    const bottomMargin = p.bounds.y + p.bounds.height * 0.9;
    return p.baselineY >= topMargin && p.baselineY <= bottomMargin;
  }).length / panels.length;

  // Check for complete 12-lead detection - MUCH HIGHER BONUS FOR COMPLETENESS
  const detectedLeads = new Set(leadPanels.map(p => p.lead));
  const standardLeadsFound = STANDARD_12_LEADS.filter(l => detectedLeads.has(l as never)).length;

  // Completeness is THE MOST IMPORTANT factor - scale from 0 to 0.3
  let completenessBonus = 0;
  if (standardLeadsFound === 12) {
    completenessBonus = 0.30;  // Big bonus for complete detection
  } else if (standardLeadsFound >= 10) {
    completenessBonus = 0.20;  // High bonus for near-complete
  } else if (standardLeadsFound >= 6) {
    completenessBonus = 0.10;  // Partial bonus
  } else {
    completenessBonus = (standardLeadsFound / 12) * 0.05;
  }

  // Check for consistent panel sizes (panels should be roughly same size)
  let sizeConsistencyBonus = 0;
  if (leadPanels.length > 0) {
    const panelSizes = leadPanels.map(p => p.bounds.width * p.bounds.height);
    const avgSize = panelSizes.reduce((a, b) => a + b, 0) / panelSizes.length;
    const sizeVariance = panelSizes.reduce((sum, size) => sum + Math.pow(size - avgSize, 2), 0) / panelSizes.length;
    const sizeStdDev = Math.sqrt(sizeVariance);
    sizeConsistencyBonus = sizeStdDev < avgSize * 0.3 ? 0.05 : 0; // Bonus for consistent panel sizes
  }

  // Weighted combination - emphasize completeness
  const baseScore = (
    avgConfidence * 0.25 +
    uniqueRatio * 0.10 +
    validBoundsRatio * 0.15 +
    validBaselineRatio * 0.10 +
    completenessBonus +
    sizeConsistencyBonus
  );

  // Floor at 0.85 if all 12 leads found with valid bounds
  if (standardLeadsFound === 12 && validBoundsRatio > 0.9) {
    return Math.max(0.85, Math.min(1, baseScore));
  }

  return Math.min(1, baseScore);
}

/**
 * Check if analysis has minimum required data for waveform extraction
 */
export function hasMinimumData(analysis: ECGImageAnalysis): boolean {
  // Must have grid info with pxPerMm
  if (!analysis.grid.pxPerMm || analysis.grid.pxPerMm <= 0) {
    return false;
  }

  // Must have calibration with gain
  if (!analysis.calibration.gain || analysis.calibration.gain <= 0) {
    return false;
  }

  // Must have at least one panel with valid bounds and lead
  const validPanels = analysis.panels.filter(p =>
    p.lead !== null &&
    p.bounds.width > 0 &&
    p.bounds.height > 0
  );

  return validPanels.length > 0;
}

/**
 * Get list of validation issues
 */
export function getValidationIssues(analysis: ECGImageAnalysis): string[] {
  const issues: string[] = [];

  // Grid issues
  if (!analysis.grid.detected) {
    issues.push('No grid pattern detected - calibration may be inaccurate');
  } else if (!analysis.grid.pxPerMm) {
    issues.push('Could not determine pixels per millimeter');
  }

  // Calibration issues
  if (!analysis.calibration.found) {
    issues.push('No calibration pulse found - using standard gain');
  }
  if (analysis.calibration.gainSource === 'standard_assumed') {
    issues.push('Gain assumed to be standard 10mm/mV');
  }
  if (analysis.calibration.speedSource === 'standard_assumed') {
    issues.push('Paper speed assumed to be standard 25mm/s');
  }

  // Panel issues
  const panelsWithoutLabels = analysis.panels.filter(p => !p.lead);
  if (panelsWithoutLabels.length > 0) {
    issues.push(`${panelsWithoutLabels.length} panel(s) could not be labeled`);
  }

  // Check for standard leads
  const detectedLeads = new Set(analysis.panels.filter(p => p.lead).map(p => p.lead));
  const standardLeads = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
  const missingLeads = standardLeads.filter(l => !detectedLeads.has(l as never));
  if (missingLeads.length > 0 && analysis.layout.format !== 'single-strip' && analysis.layout.format !== 'rhythm-only') {
    issues.push(`Missing leads: ${missingLeads.join(', ')}`);
  }

  // Image quality issues
  for (const issue of analysis.imageQuality.issues) {
    if (issue.severity === 'severe') {
      issues.push(`Severe image issue: ${issue.description}`);
    }
  }

  return issues;
}
