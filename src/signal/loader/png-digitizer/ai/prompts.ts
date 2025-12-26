/**
 * AI Analysis Prompts
 * Carefully crafted prompts for ECG image analysis
 *
 * @module signal/loader/png-digitizer/ai/prompts
 */

/**
 * Get the main ECG analysis prompt
 * This prompt is designed to extract everything needed for accurate digitization
 * in a SINGLE call, minimizing what local algorithms need to figure out.
 */
export function getAnalysisPrompt(): string {
  return `You are an expert ECG digitization system. Your task is to analyze this ECG image and provide PRECISE pixel-level measurements that will be used to reconstruct the ECG signal digitally.

## WHY THIS MATTERS
Local computer vision algorithms CANNOT reliably distinguish between:
- The ECG WAVEFORM (the actual signal trace showing P waves, QRS complexes, T waves)
- The GRID LINES (the background measurement grid)

Both appear as dark pixels. Only YOU can visually identify which is which. Your measurements are the GROUND TRUTH that makes digitization possible.

## WHAT YOU MUST IDENTIFY

### 1. THE WAVEFORM
The waveform is the continuous ECG trace line. It shows:
- P waves (small rounded bumps before QRS)
- QRS complexes (the tall sharp spikes - most prominent feature)
- T waves (rounded waves after QRS)
- Isoelectric segments (flat portions between waves)

The waveform may be BLACK, BLUE, GREEN, or another color depending on the ECG system.

### 2. THE GRID
The grid is the background measurement pattern:
- Small boxes (1mm, thin lines)
- Large boxes (5mm, thicker lines)
- Usually PINK, RED, GRAY, or light colored

### 3. THE BASELINE (ISOELECTRIC LINE)
The baseline is where the waveform is FLAT - the 0mV reference. Look at:
- The PR segment (between P wave and QRS)
- The TP segment (between T wave and next P wave)
The Y-coordinate where these flat portions sit is the baselineY.

## STEP-BY-STEP ANALYSIS

### STEP 1: IDENTIFY COLORS
Look at the image and identify:
- **waveformColor**: The exact color of the ECG trace (e.g., "#000000" for black, "#0000FF" for blue)
- **gridLineColor**: The color of the grid lines (e.g., "#C0C0C0" for gray, "#FFC0C0" for pink)
- **backgroundColor**: The background color (usually white or light pink)

### STEP 2: IDENTIFY LAYOUT
Count the panels:
- How many ROWS of ECG traces? (typically 3)
- How many COLUMNS? (typically 4)
- Total should be 12 for standard 12-lead ECG

### STEP 3: IDENTIFY EACH PANEL
For each of the 12 panels, determine:
- **Lead name**: I, II, III, aVR, aVL, aVF, V1, V2, V3, V4, V5, V6
- **Bounds**: The rectangle containing the waveform (x, y, width, height in pixels)

### STEP 4: MEASURE BASELINE FOR EACH PANEL (CRITICAL)
For each panel, find the baselineY:
1. Look at the FLAT portions of the waveform (PR segment, TP segment)
2. These flat portions represent 0mV
3. Report the Y pixel coordinate of this flat line
4. DO NOT use the panel center - use the ACTUAL flat portions of the trace

### STEP 5: TRACE THE WAVEFORM (MOST CRITICAL)
For each panel, you must VISUALLY TRACE the waveform and report Y coordinates.

At 41 positions across the panel (every 2.5% from 0% to 100%), report where the WAVEFORM is:
- 0% = left edge of panel
- 2.5%, 5%, 7.5%, 10%, 12.5%... = intermediate positions
- 100% = right edge of panel

For each position:
1. Calculate the X pixel: x = bounds.x + (percentage/100) * bounds.width
2. Look at that X coordinate
3. Find where the WAVEFORM trace is (NOT grid lines)
4. Report the Y pixel coordinate

This gives us 41 ground-truth points per panel - dense enough to capture sharp QRS peaks accurately.

### STEP 5.5: IDENTIFY CRITICAL POINTS (ESSENTIAL FOR ACCURACY)
For each panel, identify the EXACT pixel locations of the key ECG features. These are the most important points for accurate digitization:

For each QRS complex visible in the panel, report:
- **R peak**: The highest point (smallest Y) of the R wave - this is the sharp upward spike
- **S trough**: The lowest point (largest Y) of the S wave - the downward dip after R
- **Q onset**: Where the QRS complex begins (start of Q wave or R wave if no Q)

For P and T waves (if clearly visible):
- **P peak**: The peak of the P wave (small rounded bump before QRS)
- **T peak**: The peak of the T wave (rounded wave after QRS)

Report as criticalPoints array with:
- **type**: "R", "S", "Q", "P", or "T"
- **xPercent**: X position as percentage of panel width (0-100)
- **yPixel**: Exact Y pixel coordinate

Example: If there are 2 QRS complexes in a panel, you should have 2 R peaks, 2 S troughs, etc.

### STEP 6: MEASURE WAVEFORM BOUNDS
For each panel, also report:
- **waveformYMin**: The smallest Y value (highest point on screen, e.g., R wave peak)
- **waveformYMax**: The largest Y value (lowest point on screen, e.g., S wave trough)

### STEP 7: CALIBRATION
Determine:
- **pxPerMm**: Pixels per millimeter (measure from grid)
- **paperSpeed**: 25 or 50 mm/s (check for label or estimate from QRS count)
- **gain**: Usually 10 mm/mV (check for calibration pulse)

### STEP 8: VALIDATION - EINTHOVEN'S LAW
Before outputting, mentally verify:
- Lead II should equal Lead I + Lead III (at the same time points)
- If your traces don't satisfy this, recheck your tracing

Standard lead arrangement:
- Row 0: I, aVR, V1, V4
- Row 1: II, aVL, V2, V5
- Row 2: III, aVF, V3, V6

## OUTPUT FORMAT

Return ONLY valid JSON (no markdown, no explanation):

{
  "grid": {
    "detected": true,
    "type": "standard",
    "backgroundColor": "#FFFFFF",
    "gridLineColor": "#C0C0C0",
    "waveformColor": "#000000",
    "pxPerMm": 8.5,
    "smallBoxPx": 8.5,
    "largeBoxPx": 42.5,
    "confidence": 0.95
  },
  "layout": {
    "format": "12-lead",
    "columns": 4,
    "rows": 3,
    "imageWidth": 1200,
    "imageHeight": 900
  },
  "calibration": {
    "paperSpeed": 25,
    "gain": 10,
    "confidence": 0.9
  },
  "panels": [
    {
      "id": "panel_0_0",
      "lead": "I",
      "row": 0,
      "col": 0,
      "bounds": {"x": 50, "y": 50, "width": 275, "height": 266},
      "baselineY": 183,
      "waveformYMin": 140,
      "waveformYMax": 210,
      "tracePoints": [
        {"xPercent": 0, "yPixel": 182},
        {"xPercent": 2.5, "yPixel": 182},
        {"xPercent": 5, "yPixel": 181},
        {"xPercent": 7.5, "yPixel": 181},
        {"xPercent": 10, "yPixel": 180},
        {"xPercent": 12.5, "yPixel": 178},
        {"xPercent": 15, "yPixel": 175},
        {"xPercent": 17.5, "yPixel": 160},
        {"xPercent": 20, "yPixel": 145},
        {"xPercent": 22.5, "yPixel": 165},
        {"xPercent": 25, "yPixel": 183},
        {"xPercent": 27.5, "yPixel": 184},
        {"xPercent": 30, "yPixel": 185},
        {"xPercent": 32.5, "yPixel": 184},
        {"xPercent": 35, "yPixel": 183},
        {"xPercent": 37.5, "yPixel": 182},
        {"xPercent": 40, "yPixel": 182},
        {"xPercent": 42.5, "yPixel": 181},
        {"xPercent": 45, "yPixel": 181},
        {"xPercent": 47.5, "yPixel": 178},
        {"xPercent": 50, "yPixel": 175},
        {"xPercent": 52.5, "yPixel": 180},
        {"xPercent": 55, "yPixel": 183},
        {"xPercent": 57.5, "yPixel": 184},
        {"xPercent": 60, "yPixel": 184},
        {"xPercent": 62.5, "yPixel": 183},
        {"xPercent": 65, "yPixel": 183},
        {"xPercent": 67.5, "yPixel": 182},
        {"xPercent": 70, "yPixel": 182},
        {"xPercent": 72.5, "yPixel": 181},
        {"xPercent": 75, "yPixel": 181},
        {"xPercent": 77.5, "yPixel": 182},
        {"xPercent": 80, "yPixel": 183},
        {"xPercent": 82.5, "yPixel": 182},
        {"xPercent": 85, "yPixel": 182},
        {"xPercent": 87.5, "yPixel": 181},
        {"xPercent": 90, "yPixel": 181},
        {"xPercent": 92.5, "yPixel": 182},
        {"xPercent": 95, "yPixel": 182},
        {"xPercent": 97.5, "yPixel": 183},
        {"xPercent": 100, "yPixel": 183}
      ],
      "criticalPoints": [
        {"type": "P", "xPercent": 8, "yPixel": 178},
        {"type": "Q", "xPercent": 17, "yPixel": 184},
        {"type": "R", "xPercent": 20, "yPixel": 145},
        {"type": "S", "xPercent": 23, "yPixel": 190},
        {"type": "T", "xPercent": 35, "yPixel": 175},
        {"type": "P", "xPercent": 58, "yPixel": 178},
        {"type": "Q", "xPercent": 67, "yPixel": 184},
        {"type": "R", "xPercent": 70, "yPixel": 146},
        {"type": "S", "xPercent": 73, "yPixel": 189},
        {"type": "T", "xPercent": 85, "yPixel": 176}
      ]
    }
  ]
}

## CRITICAL REQUIREMENTS

1. **ALL 12 PANELS** must have complete tracePoints (41 points each, every 2.5%)
2. **ALL 12 PANELS** must have criticalPoints identifying R peaks, S troughs, and visible P/T waves
3. **tracePoints must be on the WAVEFORM**, not on grid lines
4. **baselineY must be the isoelectric line**, not the panel center
5. **Precision matters** - wrong Y values will cause digitization to fail
6. **Verify Einthoven's Law** - II = I + III at corresponding time points
7. **R peaks are the most important** - they must be precisely located for accurate digitization

## COMMON MISTAKES TO AVOID

- DO NOT put tracePoints on grid lines - they must be on the waveform trace
- DO NOT use panel center as baselineY - find the actual flat portions
- DO NOT skip panels - all 12 leads must have complete data
- DO NOT guess - visually trace each point carefully`;
}

/**
 * Get a simplified prompt for quick analysis (not recommended for production)
 */
export function getQuickAnalysisPrompt(): string {
  return `Analyze this ECG image and return JSON with:
1. grid: { detected, type, pxPerMm, waveformColor, gridLineColor }
2. layout: { format, columns, rows }
3. calibration: { paperSpeed, gain }
4. panels: array of { lead, bounds: {x,y,width,height}, baselineY, tracePoints: [{xPercent, yPixel}...] }

Return ONLY valid JSON, no markdown.`;
}

/**
 * Get prompt for grid-only analysis
 */
export function getGridAnalysisPrompt(): string {
  return `Analyze the grid pattern in this ECG image.

Identify:
- Grid type (standard pink, blue, gray, or no grid)
- Background color
- Grid line color
- Waveform color
- Pixels per millimeter

Return JSON:
{
  "detected": true,
  "type": "standard",
  "backgroundColor": "#FFF4F4",
  "gridLineColor": "#C0C0C0",
  "waveformColor": "#000000",
  "pxPerMm": 11.8,
  "smallBoxPx": 11.8,
  "largeBoxPx": 59,
  "confidence": 0.95
}

Return ONLY valid JSON, no markdown.`;
}
