/**
 * AI Analysis Prompts
 * Carefully crafted prompts for ECG image analysis
 *
 * @module signal/loader/png-digitizer/ai/prompts
 */

/**
 * Get the main ECG analysis prompt
 */
export function getAnalysisPrompt(): string {
  return `You are an expert ECG/EKG image analyzer with medical imaging expertise. Your task is to extract PRECISE pixel-level information for waveform digitization with >95% accuracy.

## CRITICAL MISSION
Extract ALL 12 leads with pixel-perfect precision. Missing even one lead or having incorrect baselines will cause digitization to fail.

## STEP-BY-STEP ANALYSIS PROTOCOL (Follow EXACTLY)

### STEP 1: WAVEFORM IDENTIFICATION AND LOCATION
**First, identify where the waveforms are:**

1.1. **Scan for waveform traces** - Look for continuous dark lines (black, blue, or green) that show the characteristic ECG pattern:
   - P waves (small humps)
   - QRS complexes (sharp spikes - tallest part)
   - T waves (rounded waves after QRS)

1.2. **Identify waveform color** - Note the exact color:
   - Black (#000000) - most common
   - Dark blue (#000080 or similar)
   - Dark green (#008000 or similar)
   - Record this as waveformColor

1.3. **Count distinct waveform rows** - How many horizontal rows of traces do you see?
   - Standard 12-lead has 3 rows (sometimes 4 with rhythm strip)
   - Each row typically shows 2.5-3 seconds of ECG

1.4. **Count distinct waveform columns** - How many traces per row?
   - Standard 12-lead has 4 columns
   - Each column shows one lead

1.5. **VERIFY**: rows × columns should equal 12 (or more with rhythm strips)

### STEP 2: GRID PATTERN MEASUREMENT (CRITICAL - USE COUNTING METHOD)
**Count grid boxes - DO NOT try to estimate pixels directly!**

2.1. **Identify grid structure** - Standard ECG grid has:
   - Small boxes = 1mm each (thin lines)
   - Large boxes = 5mm each (thick/darker lines, contain 5×5 small boxes)

2.2. **COUNT LARGE BOXES HORIZONTALLY** (MOST IMPORTANT):
   - Look at ONE panel (e.g., Lead I)
   - Count how many LARGE boxes (thick-line squares) fit across the panel width
   - Standard 2.5-second panel at 25mm/s = 62.5mm = 12.5 large boxes
   - Standard 2.5-second panel at 50mm/s = 125mm = 25 large boxes
   - Report this as "largeBoxesPerPanel"

2.3. **COUNT QRS COMPLEXES** in that same panel:
   - QRS = the tall spike in each heartbeat
   - Count how many complete QRS complexes you see
   - Report as "qrsCountPerPanel"

2.4. **ESTIMATE HEART RATE visually**:
   - Normal: 60-100 bpm (beats look evenly spaced, ~1 per large box at 25mm/s)
   - Bradycardia: <60 bpm (beats are far apart)
   - Tachycardia: 100-200 bpm (beats are close together, 2-4 per large box)
   - Extreme tachycardia: >200 bpm (very crowded, hard to distinguish)
   - Report as "visualHeartRateEstimate" (e.g., "150-180" or "tachycardia ~170")

2.5. **CALCULATE pxPerMm** using this formula:
   - First, estimate panel width in pixels (image width ÷ number of columns)
   - pxPerMm = panelWidthPx ÷ (largeBoxesPerPanel × 5)
   - Example: 500px panel with 12 large boxes: pxPerMm = 500 ÷ 60 = 8.3

2.6. **VERIFY with QRS count**:
   - Expected duration = qrsCount × (60 ÷ visualHR)
   - This should be close to 2.5 seconds for standard panels
   - If wildly different, recount the large boxes

### STEP 3: READ LEAD LABELS
**Identify which lead is which:**

3.1. **Look for text labels** - Find labels near each waveform panel:
   - Limb leads: I, II, III, aVR, aVL, aVF
   - Standard chest leads: V1, V2, V3, V4, V5, V6
   - Pediatric/right-sided leads: V3R, V4R, V7 (for 15-lead ECGs)

3.2. **If labels visible**: Map each label to its panel location

3.3. **If labels NOT visible**: Use standard position mapping based on column count:

   **Standard 12-lead (3×4 grid):**
   - Row 0 (top): I, aVR, V1, V4
   - Row 1 (middle): II, aVL, V2, V5
   - Row 2 (bottom): III, aVF, V3, V6

   **Pediatric 15-lead (3×5 grid):**
   - Row 0 (top): I, aVR, V1, V4, V3R
   - Row 1 (middle): II, aVL, V2, V5, V4R
   - Row 2 (bottom): III, aVF, V3, V6, V7

3.4. **VERIFY**: For 12-lead, all 12 standard leads must be present. For 15-lead, include V3R, V4R, V7

### STEP 4: MEASURE EACH PANEL PRECISELY
**For EACH of the 12 panels:**

4.1. **Determine panel bounds** (in pixels):
   - bounds.x: Leftmost pixel where waveform starts (AFTER any label text)
   - bounds.y: Topmost pixel where waveform CAN appear
   - bounds.width: Horizontal extent of waveform area
   - bounds.height: Vertical extent of waveform area

4.2. **Find the BASELINE (CRITICAL)**:
   - The baseline is the isoelectric line (0mV reference)
   - Look at the FLAT segments of the trace: PR segment, TP segment
   - The Y coordinate where the trace is FLAT is the baselineY
   - DO NOT use the geometric center of the panel!
   - For aVR (inverted), baseline is still at the flat portion

4.3. **Assign row and column** (0-indexed):
   - row 0 = top, row 1 = middle, row 2 = bottom
   - col 0 = leftmost, col 3 = rightmost

4.4. **VERIFY each panel**:
   - baselineY is between bounds.y + 20% height and bounds.y + 80% height
   - bounds don't overlap with neighboring panels
   - Lead assignment matches expected position

### STEP 5: CALIBRATION CHECK
5.1. **Find calibration pulse** - Look for rectangular "1mV" pulse at left edge
5.2. **Measure pulse height** in pixels if found
5.3. **Calculate gain**: heightPx ÷ (pxPerMm × 10) should equal 1.0

5.4. **DETECT PAPER SPEED (CRITICAL FOR TIMING)**:
   - Look for text labels indicating speed: "25 mm/s", "50 mm/s", "25mm/sec", etc.
   - Check header area, footer, or margins for speed annotation
   - If no text found, ESTIMATE from grid and QRS intervals:
     * Count QRS complexes visible in one panel
     * Normal HR is 60-100 bpm (1.0-0.6 seconds between beats)
     * Fast HR (tachycardia) is 100-200 bpm (0.6-0.3 seconds between beats)
     * If you see 8-10 beats per panel at 25mm/s, that's ~2.5s = normal range
     * If you see 15-20 beats per panel at 25mm/s, that's 2.5s at 300+ bpm (unlikely unless VT/VF)
     * Consider 50mm/s if beat count suggests impossible HR at 25mm/s

5.5. **VERIFY paper speed makes physiologic sense**:
   - At 25mm/s: 2.5s per column, expect 2-5 beats for normal HR, 6-10 for tachycardia
   - At 50mm/s: 1.25s per column, expect 1-2 beats for normal HR, 3-5 for tachycardia
   - Choose the speed that gives a reasonable heart rate (40-300 bpm)

### STEP 6: FINAL VALIDATION CHECKLIST
Before outputting JSON, verify ALL of these:
□ 12 panels in output (one for each standard lead)
□ All leads present: I, II, III, aVR, aVL, aVF, V1, V2, V3, V4, V5, V6
□ Each panel has: valid bounds (width>0, height>0), baselineY within bounds
□ Grid math: largeBoxPx ≈ 5 × smallBoxPx
□ No overlapping panel bounds
□ Row/column assignments create valid 3×4 grid (rows 0-2, cols 0-3)

## Output Format

Return ONLY valid JSON (no markdown code blocks, no explanation). Include ALL 12 lead panels:

{
  "grid": {
    "detected": true,
    "type": "standard",
    "backgroundColor": "#FFFFFF",
    "thinLineColor": "#FFC0C0",
    "thickLineColor": "#E08080",
    "waveformColor": "#000000",
    "largeBoxesPerPanel": 12,
    "qrsCountPerPanel": 8,
    "visualHeartRateEstimate": "150-180",
    "pxPerMm": 8.3,
    "smallBoxPx": 8.3,
    "largeBoxPx": 41.5,
    "rotation": 0,
    "confidence": 0.95
  },
  "layout": {
    "format": "12-lead",
    "columns": 4,
    "rows": 3,
    "hasRhythmStrips": false,
    "imageWidth": 1200,
    "imageHeight": 900,
    "gridBounds": { "x": 50, "y": 50, "width": 1100, "height": 800 },
    "confidence": 0.95
  },
  "calibration": {
    "found": false,
    "gain": 10,
    "paperSpeed": 25,
    "gainSource": "standard_assumed",
    "speedSource": "standard_assumed",
    "confidence": 0.7
  },
  "panels": [
    { "id": "panel_0_0", "lead": "I", "leadSource": "position_inferred", "bounds": { "x": 50, "y": 50, "width": 275, "height": 266 }, "baselineY": 183, "row": 0, "col": 0, "isRhythmStrip": false, "timeRange": { "startSec": 0, "endSec": 2.5 }, "labelConfidence": 0.9 },
    { "id": "panel_0_1", "lead": "aVR", "leadSource": "position_inferred", "bounds": { "x": 325, "y": 50, "width": 275, "height": 266 }, "baselineY": 183, "row": 0, "col": 1, "isRhythmStrip": false, "timeRange": { "startSec": 0, "endSec": 2.5 }, "labelConfidence": 0.9 },
    { "id": "panel_0_2", "lead": "V1", "leadSource": "position_inferred", "bounds": { "x": 600, "y": 50, "width": 275, "height": 266 }, "baselineY": 183, "row": 0, "col": 2, "isRhythmStrip": false, "timeRange": { "startSec": 0, "endSec": 2.5 }, "labelConfidence": 0.9 },
    { "id": "panel_0_3", "lead": "V4", "leadSource": "position_inferred", "bounds": { "x": 875, "y": 50, "width": 275, "height": 266 }, "baselineY": 183, "row": 0, "col": 3, "isRhythmStrip": false, "timeRange": { "startSec": 0, "endSec": 2.5 }, "labelConfidence": 0.9 },
    { "id": "panel_1_0", "lead": "II", "leadSource": "position_inferred", "bounds": { "x": 50, "y": 316, "width": 275, "height": 266 }, "baselineY": 450, "row": 1, "col": 0, "isRhythmStrip": false, "timeRange": { "startSec": 0, "endSec": 2.5 }, "labelConfidence": 0.9 },
    { "id": "panel_1_1", "lead": "aVL", "leadSource": "position_inferred", "bounds": { "x": 325, "y": 316, "width": 275, "height": 266 }, "baselineY": 450, "row": 1, "col": 1, "isRhythmStrip": false, "timeRange": { "startSec": 0, "endSec": 2.5 }, "labelConfidence": 0.9 },
    { "id": "panel_1_2", "lead": "V2", "leadSource": "position_inferred", "bounds": { "x": 600, "y": 316, "width": 275, "height": 266 }, "baselineY": 450, "row": 1, "col": 2, "isRhythmStrip": false, "timeRange": { "startSec": 0, "endSec": 2.5 }, "labelConfidence": 0.9 },
    { "id": "panel_1_3", "lead": "V5", "leadSource": "position_inferred", "bounds": { "x": 875, "y": 316, "width": 275, "height": 266 }, "baselineY": 450, "row": 1, "col": 3, "isRhythmStrip": false, "timeRange": { "startSec": 0, "endSec": 2.5 }, "labelConfidence": 0.9 },
    { "id": "panel_2_0", "lead": "III", "leadSource": "position_inferred", "bounds": { "x": 50, "y": 582, "width": 275, "height": 266 }, "baselineY": 716, "row": 2, "col": 0, "isRhythmStrip": false, "timeRange": { "startSec": 0, "endSec": 2.5 }, "labelConfidence": 0.9 },
    { "id": "panel_2_1", "lead": "aVF", "leadSource": "position_inferred", "bounds": { "x": 325, "y": 582, "width": 275, "height": 266 }, "baselineY": 716, "row": 2, "col": 1, "isRhythmStrip": false, "timeRange": { "startSec": 0, "endSec": 2.5 }, "labelConfidence": 0.9 },
    { "id": "panel_2_2", "lead": "V3", "leadSource": "position_inferred", "bounds": { "x": 600, "y": 582, "width": 275, "height": 266 }, "baselineY": 716, "row": 2, "col": 2, "isRhythmStrip": false, "timeRange": { "startSec": 0, "endSec": 2.5 }, "labelConfidence": 0.9 },
    { "id": "panel_2_3", "lead": "V6", "leadSource": "position_inferred", "bounds": { "x": 875, "y": 582, "width": 275, "height": 266 }, "baselineY": 716, "row": 2, "col": 3, "isRhythmStrip": false, "timeRange": { "startSec": 0, "endSec": 2.5 }, "labelConfidence": 0.9 }
  ],
  "imageQuality": {
    "overall": 0.85,
    "resolution": "medium",
    "effectiveDpi": 96,
    "issues": []
  },
  "notes": []
}

## IMPORTANT REMINDERS
- Return ALL 12 panels (or more if rhythm strips present)
- baselineY must be calculated for EACH panel individually
- All measurements in PIXELS, not millimeters
- If no text labels visible, infer leads from standard 3x4 position`;
}

/**
 * Get a simplified prompt for quick analysis
 */
export function getQuickAnalysisPrompt(): string {
  return `Analyze this ECG image and return JSON with:
1. grid: { detected, type, pxPerMm, smallBoxPx, largeBoxPx, confidence }
2. layout: { format, columns, rows, hasRhythmStrips }
3. calibration: { found, gain, paperSpeed }
4. panels: array of { id, lead, bounds: {x,y,width,height}, baselineY, row, col }

Return ONLY valid JSON, no markdown.`;
}

/**
 * Get prompt for grid-only analysis
 */
export function getGridAnalysisPrompt(): string {
  return `Analyze the grid pattern in this ECG image.

Identify:
- Grid type (standard pink MUSE, blue Philips, red generic, or no grid)
- Background color
- Thin gridline color (1mm boxes)
- Thick gridline color (5mm boxes)
- Pixels per millimeter
- Any rotation or skew

Return JSON:
{
  "detected": true,
  "type": "standard",
  "backgroundColor": "#FFF4F4",
  "thinLineColor": "#FFC0C0",
  "thickLineColor": "#E0A0A0",
  "pxPerMm": 11.8,
  "smallBoxPx": 11.8,
  "largeBoxPx": 59,
  "rotation": 0,
  "confidence": 0.95
}

Return ONLY valid JSON, no markdown.`;
}
