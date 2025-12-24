# Phase 2: Automated Measurement Display & Classification

## Overview

Build on Phase 1's age context display by calculating ECG measurements from ZZU signals and classifying them against age-specific normal ranges with color-coded visual feedback.

## Current State (Phase 1 Complete)

- ZZU ECGs load with proper signal conversion (mV → µV)
- `currentPediatricContext` contains age group, normals, clinical notes
- `updateDiagnosisDisplay()` shows normal ranges (but not actual measurements)
- Measurements table exists but has hardcoded placeholder values

## Goals

1. **Calculate measurements** from ZZU signal data using GEMUSE's `calculateECGMeasurements()`
2. **Classify each measurement** using `classifyValue()` against age-specific normals
3. **Display with color coding**: green (normal), yellow (borderline), red (abnormal)
4. **Generate finding statements** based on classification results

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         openZZUECG() Flow                               │
│                                                                         │
│  1. Load JSON ──► 2. Convert Signal ──► 3. Get Pediatric Context       │
│                         │                        │                      │
│                         ▼                        ▼                      │
│              4. calculateECGMeasurements()   getNormalsForAge()        │
│                         │                        │                      │
│                         ▼                        ▼                      │
│              5. classifyMeasurements(measurements, normals)            │
│                         │                                               │
│                         ▼                                               │
│              6. generateFindings(classifications)                       │
│                         │                                               │
│                         ▼                                               │
│              7. updateMeasurementsDisplay(measurements, classifications)│
│                         │                                               │
│                         ▼                                               │
│              8. updateInterpretationDisplay(findings)                   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Structures

### MeasuredValues (from calculateECGMeasurements)
```typescript
{
  hr: number,      // Heart rate (bpm)
  rr: number,      // R-R interval (ms)
  pr: number,      // PR interval (ms)
  qrs: number,     // QRS duration (ms)
  qt: number,      // QT interval (ms)
  qtc: number,     // QTc Bazett (ms)
  pAxis: number,   // P axis (degrees)
  qrsAxis: number, // QRS axis (degrees)
  tAxis: number,   // T axis (degrees)
}
```

### ClassifiedMeasurement
```typescript
{
  parameter: string,           // "Heart Rate", "QTc", etc.
  value: number,               // Measured value
  unit: string,                // "bpm", "ms", "°"
  normalRange: { p2, p50, p98 },
  classification: 'low' | 'borderline_low' | 'normal' | 'borderline_high' | 'high',
  percentile: number,          // Estimated percentile (0-100)
}
```

### Finding
```typescript
{
  statement: string,           // "Sinus tachycardia for age"
  severity: 'normal' | 'borderline' | 'abnormal',
  category: 'rate' | 'rhythm' | 'intervals' | 'axis',
}
```

## Implementation Details

### Step 1: Add calculateECGMeasurements Import

```javascript
// In demo.html <script type="module">
import { calculateECGMeasurements } from './src/signal/analysis/ecg-measurements.ts';
```

### Step 2: Calculate Measurements in openZZUECG()

```javascript
// After setting currentSignal, before updateDiagnosisDisplay()
const leadII = currentSignal.leads['II'] || currentSignal.leads['II '] || [];
const leadI = currentSignal.leads['I'] || currentSignal.leads['I '] || [];
const leadAVF = currentSignal.leads['aVF'] || currentSignal.leads['AVF'] || [];

if (leadII.length > 0 && leadI.length > 0 && leadAVF.length > 0) {
  const calculated = calculateECGMeasurements(leadII, leadI, leadAVF, currentSignal.sampleRate);
  currentMeasurements = {
    hr: calculated.hr,
    rr: calculated.rr,
    pr: calculated.pr,
    qrs: calculated.qrs,
    qt: calculated.qt,
    qtc: calculated.qtc,
    pAxis: calculated.pAxis,
    qrsAxis: calculated.qrsAxis,
    tAxis: calculated.tAxis,
  };
}
```

### Step 3: Add classifyValue Import

```javascript
import { classifyValue, estimatePercentile } from './src/data/pediatricNormals.ts';
```

### Step 4: Classify All Measurements

```javascript
function classifyAllMeasurements(measurements, normals) {
  return {
    heartRate: {
      value: measurements.hr,
      unit: 'bpm',
      range: normals.heartRate,
      classification: classifyValue(measurements.hr, normals.heartRate),
      percentile: estimatePercentile(measurements.hr, normals.heartRate),
    },
    prInterval: {
      value: measurements.pr,
      unit: 'ms',
      range: normals.prInterval,
      classification: classifyValue(measurements.pr, normals.prInterval),
      percentile: estimatePercentile(measurements.pr, normals.prInterval),
    },
    qrsDuration: {
      value: measurements.qrs,
      unit: 'ms',
      range: normals.qrsDuration,
      classification: classifyValue(measurements.qrs, normals.qrsDuration),
      percentile: estimatePercentile(measurements.qrs, normals.qrsDuration),
    },
    qtcBazett: {
      value: measurements.qtc,
      unit: 'ms',
      range: normals.qtcBazett,
      classification: classifyValue(measurements.qtc, normals.qtcBazett),
      percentile: estimatePercentile(measurements.qtc, normals.qtcBazett),
    },
    qrsAxis: {
      value: measurements.qrsAxis,
      unit: '°',
      range: normals.qrsAxis,
      classification: classifyValue(measurements.qrsAxis, normals.qrsAxis),
      percentile: estimatePercentile(measurements.qrsAxis, normals.qrsAxis),
    },
  };
}
```

### Step 5: Generate Findings from Classifications

```javascript
function generateFindings(classifications, ageGroup) {
  const findings = [];

  // Heart Rate
  const hr = classifications.heartRate;
  if (hr.classification === 'high') {
    findings.push({
      statement: `Tachycardia for age (${hr.value} bpm, >p98)`,
      severity: 'abnormal',
      category: 'rate',
    });
  } else if (hr.classification === 'low') {
    findings.push({
      statement: `Bradycardia for age (${hr.value} bpm, <p2)`,
      severity: 'abnormal',
      category: 'rate',
    });
  } else if (hr.classification === 'borderline_high') {
    findings.push({
      statement: `Heart rate upper normal (${hr.value} bpm)`,
      severity: 'borderline',
      category: 'rate',
    });
  }

  // QTc - critical parameter
  const qtc = classifications.qtcBazett;
  if (qtc.value > 500) {
    findings.push({
      statement: `Markedly prolonged QTc (${qtc.value} ms) - CRITICAL`,
      severity: 'abnormal',
      category: 'intervals',
    });
  } else if (qtc.classification === 'high') {
    findings.push({
      statement: `Prolonged QTc for age (${qtc.value} ms)`,
      severity: 'abnormal',
      category: 'intervals',
    });
  } else if (qtc.classification === 'low' && qtc.value < 340) {
    findings.push({
      statement: `Short QTc (${qtc.value} ms)`,
      severity: 'abnormal',
      category: 'intervals',
    });
  }

  // QRS Axis
  const axis = classifications.qrsAxis;
  if (axis.classification === 'high' || axis.classification === 'low') {
    const deviation = axis.value < axis.range.p2 ? 'Left' : 'Right';
    findings.push({
      statement: `${deviation} axis deviation for age (${axis.value}°)`,
      severity: 'abnormal',
      category: 'axis',
    });
  }

  // PR Interval
  const pr = classifications.prInterval;
  if (pr.classification === 'high') {
    findings.push({
      statement: `Prolonged PR interval (${pr.value} ms) - possible 1st degree AV block`,
      severity: 'abnormal',
      category: 'intervals',
    });
  } else if (pr.classification === 'low' && pr.value < 80) {
    findings.push({
      statement: `Short PR interval (${pr.value} ms) - consider pre-excitation`,
      severity: 'abnormal',
      category: 'intervals',
    });
  }

  // QRS Duration
  const qrs = classifications.qrsDuration;
  if (qrs.classification === 'high') {
    findings.push({
      statement: `Prolonged QRS duration (${qrs.value} ms)`,
      severity: 'abnormal',
      category: 'intervals',
    });
  }

  // If no abnormal findings
  if (findings.length === 0) {
    findings.push({
      statement: 'All measurements within normal limits for age',
      severity: 'normal',
      category: 'rhythm',
    });
  }

  return findings;
}
```

### Step 6: Update Measurements Table with Color Coding

```javascript
function updateMeasurementsTable(measurements, classifications) {
  const tbody = document.getElementById('measurements-table-body');
  if (!tbody) return;

  const classToColor = {
    'low': 'meas-low',
    'borderline_low': 'meas-borderline',
    'normal': 'meas-normal',
    'borderline_high': 'meas-borderline',
    'high': 'meas-high',
  };

  const rows = [
    { param: 'Ventricular Rate', key: 'heartRate', display: 'hr' },
    { param: 'PR Interval', key: 'prInterval', display: 'pr' },
    { param: 'QRS Duration', key: 'qrsDuration', display: 'qrs' },
    { param: 'QT Interval', key: null, value: measurements.qt, unit: 'ms' },
    { param: 'QTc (Bazett)', key: 'qtcBazett', display: 'qtc' },
    { param: 'QRS Axis', key: 'qrsAxis', display: 'qrsAxis' },
    { param: 'RR Interval', key: null, value: measurements.rr, unit: 'ms' },
  ];

  tbody.innerHTML = rows.map(row => {
    const c = row.key ? classifications[row.key] : null;
    const value = c ? Math.round(c.value) : Math.round(row.value);
    const unit = c ? c.unit : row.unit;
    const range = c ? `${c.range.p2}-${c.range.p98}` : '---';
    const colorClass = c ? classToColor[c.classification] : '';

    return `<tr class="${colorClass}">
      <td>${row.param}</td>
      <td>${value}</td>
      <td>${unit}</td>
      <td>${range}</td>
    </tr>`;
  }).join('');
}
```

### Step 7: Add CSS for Color Coding

```css
/* Measurement classification colors */
.meas-normal {
  background-color: #E8F5E9 !important;  /* Light green */
}

.meas-borderline {
  background-color: #FFF8E1 !important;  /* Light yellow */
}

.meas-low,
.meas-high {
  background-color: #FFEBEE !important;  /* Light red */
  font-weight: bold;
}

/* Finding severity colors */
.finding-normal {
  color: #2E7D32;  /* Green */
}

.finding-borderline {
  color: #F57C00;  /* Orange */
}

.finding-abnormal {
  color: #C62828;  /* Red */
  font-weight: bold;
}
```

## Testing Strategy

### Unit Tests
1. `classifyAllMeasurements()` with known values
2. `generateFindings()` for each abnormality type
3. Edge cases: missing leads, extreme values

### Integration Tests
| ECG | Age | Expected Classification |
|-----|-----|------------------------|
| Normal infant | 6 mo | HR normal (120-140), all green |
| SVT | 3 yr | HR high (>200), red |
| Long QT | 10 yr | QTc high (>470), red |
| Bradycardia | 1 yr | HR low (<80), red |

### Visual Tests
1. Load ZZU ECG → measurements table updates with colors
2. Abnormal values → red background, bold text
3. Borderline values → yellow background
4. Normal values → green background (subtle)

## Files to Modify

1. **demo.html**
   - Add imports for `calculateECGMeasurements`, `classifyValue`, `estimatePercentile`
   - Add `classifyAllMeasurements()` function
   - Add `generateFindings()` function
   - Add `updateMeasurementsTable()` function
   - Modify `openZZUECG()` to calculate and classify
   - Modify `updateDiagnosisDisplay()` to show findings

2. **src/muse.css**
   - Add `.meas-normal`, `.meas-borderline`, `.meas-low`, `.meas-high` classes
   - Add `.finding-normal`, `.finding-borderline`, `.finding-abnormal` classes

## Acceptance Criteria

1. Loading any ZZU ECG displays calculated measurements (not placeholders)
2. Each measurement shows its age-specific normal range
3. Color coding reflects classification: green/yellow/red
4. Interpretation panel shows generated findings
5. Abnormal findings are prominent (bold, colored)
6. "Normal ECG for age" displays when all values normal
7. Medical disclaimer remains visible

## Risk Mitigation

1. **Missing leads**: Check for lead existence before calculating
2. **Signal artifacts**: Accept calculated values but show confidence indicator
3. **Extreme values**: Cap display at reasonable ranges, flag as artifacts
4. **Age edge cases**: Handle unknown age gracefully (use adolescent defaults)

## Future Enhancements (Out of Scope)

- Per-lead voltage analysis (RVH, LVH criteria)
- T-wave polarity detection
- Rhythm classification (sinus vs. non-sinus)
- Signal quality scoring
- Comparison with previous ECGs
