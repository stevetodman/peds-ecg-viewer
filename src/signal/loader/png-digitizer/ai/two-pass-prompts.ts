/**
 * Two-Pass AI Prompts
 * Split analysis into smaller requests to reduce token usage and avoid rate limits
 */

/**
 * Pass 1: Quick analysis - layout, labels, colors, calibration
 * This is fast and uses minimal output tokens (~500)
 */
export function getPass1Prompt(): string {
  return `Analyze this ECG image and return ONLY the layout and calibration info.

Return JSON:
{
  "grid": {
    "waveformColor": "#000000",
    "backgroundColor": "#FFFFFF",
    "pxPerMm": 8.5
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
    "gain": 10
  },
  "panels": [
    {
      "id": "panel_0_0",
      "lead": "I",
      "row": 0,
      "col": 0,
      "bounds": {"x": 50, "y": 50, "width": 275, "height": 266},
      "baselineY": 183
    }
  ]
}

IMPORTANT:
- Include ALL 12 panels with lead names and bounds
- Do NOT include tracePoints or criticalPoints (we'll get those in a second pass)
- Return ONLY valid JSON, no markdown`;
}

/**
 * Pass 2: Detailed tracing for specific panels
 * Only called for panels that need AI tracing
 */
export function getPass2Prompt(panelIds: string[], bounds: Array<{x: number, y: number, width: number, height: number}>): string {
  const panelList = panelIds.map((id, i) =>
    `Panel ${id}: bounds (${bounds[i].x}, ${bounds[i].y}, ${bounds[i].width}, ${bounds[i].height})`
  ).join('\n');

  return `For the following ECG panels, trace the waveform precisely.

Panels to trace:
${panelList}

For each panel, provide:
1. tracePoints: 41 points at 0%, 2.5%, 5%... 100% of panel width
2. criticalPoints: R peaks, S troughs, P waves, T waves

Return JSON:
{
  "panels": [
    {
      "id": "panel_0_0",
      "tracePoints": [
        {"xPercent": 0, "yPixel": 182},
        {"xPercent": 2.5, "yPixel": 182},
        ...
      ],
      "criticalPoints": [
        {"type": "R", "xPercent": 20, "yPixel": 145},
        {"type": "S", "xPercent": 23, "yPixel": 190},
        ...
      ]
    }
  ]
}

IMPORTANT:
- tracePoints must be on the WAVEFORM, not grid lines
- criticalPoints should mark R peaks (highest), S troughs (lowest), P and T waves
- Return ONLY valid JSON`;
}

/**
 * Minimal prompt for just critical points (smallest output)
 * Use when you only need R-peak locations for timing
 */
export function getCriticalPointsOnlyPrompt(): string {
  return `Identify the R-peak locations in each ECG panel.

For each of the 12 panels, find all R-peaks (the tall upward spikes in the QRS complex).

Return JSON:
{
  "panels": [
    {
      "lead": "I",
      "rPeaks": [
        {"xPercent": 20, "yPixel": 145},
        {"xPercent": 55, "yPixel": 147},
        {"xPercent": 90, "yPixel": 146}
      ]
    }
  ]
}

Return ONLY valid JSON with R-peak locations for all 12 leads.`;
}
