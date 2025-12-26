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

At 21 positions across the panel (every 5% from 0% to 100%), report where the WAVEFORM is:
- 0% = left edge of panel
- 5%, 10%, 15%... = intermediate positions
- 100% = right edge of panel

For each position:
1. Calculate the X pixel: x = bounds.x + (percentage/100) * bounds.width
2. Look at that X coordinate
3. Find where the WAVEFORM trace is (NOT grid lines)
4. Report the Y pixel coordinate

This gives us 21 ground-truth points per panel that we can interpolate between.

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
        {"xPercent": 5, "yPixel": 181},
        {"xPercent": 10, "yPixel": 180},
        {"xPercent": 15, "yPixel": 175},
        {"xPercent": 20, "yPixel": 145},
        {"xPercent": 25, "yPixel": 183},
        {"xPercent": 30, "yPixel": 185},
        {"xPercent": 35, "yPixel": 183},
        {"xPercent": 40, "yPixel": 182},
        {"xPercent": 45, "yPixel": 181},
        {"xPercent": 50, "yPixel": 175},
        {"xPercent": 55, "yPixel": 183},
        {"xPercent": 60, "yPixel": 184},
        {"xPercent": 65, "yPixel": 183},
        {"xPercent": 70, "yPixel": 182},
        {"xPercent": 75, "yPixel": 181},
        {"xPercent": 80, "yPixel": 183},
        {"xPercent": 85, "yPixel": 182},
        {"xPercent": 90, "yPixel": 181},
        {"xPercent": 95, "yPixel": 182},
        {"xPercent": 100, "yPixel": 183}
      ]
    }
  ]
}

## CRITICAL REQUIREMENTS

1. **ALL 12 PANELS** must have complete tracePoints (21 points each)
2. **tracePoints must be on the WAVEFORM**, not on grid lines
3. **baselineY must be the isoelectric line**, not the panel center
4. **Precision matters** - wrong Y values will cause digitization to fail
5. **Verify Einthoven's Law** - II = I + III at corresponding time points

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
