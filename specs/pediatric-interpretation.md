# Pediatric ECG Interpretation - Phase 1 (Reduced Scope)

## Overview

Display age-appropriate context for ZZU pECG records using GEMUSE's pediatric normal values system. Phase 1 focuses on age mapping and displaying existing diagnoses with context - NOT automated measurement classification.

## Scope

**In Scope (Phase 1):**
- Parse ZZU age strings to days
- Map to GEMUSE age group
- Display age group label and clinical notes
- Show normal ranges for reference
- Display existing ZZU ICD-10/AHA diagnoses
- Add medical disclaimer

**Out of Scope (Future):**
- Automated measurement calculation from signal
- Automated classification (normal/abnormal)
- T-wave polarity detection
- Signal quality gating

## Requirements

### Functional Requirements

1. **Age Parsing**
   - Parse ZZU age strings: "3.5 yr", "6 mo", "15 days"
   - Convert to total days for GEMUSE compatibility

2. **Age Group Mapping**
   - Map age in days to GEMUSE age group (12 groups)
   - Retrieve age-specific normal ranges
   - Get clinical notes for age group

3. **UI Display**
   - Show age group label (e.g., "Toddler 1-3 years")
   - Show key normal ranges (HR, PR, QRS, QTc)
   - Display existing ZZU diagnoses (ICD-10, AHA codes)
   - Show clinical notes for age group

4. **Medical Disclaimer**
   - Display "For educational purposes only" prominently

### Non-Functional Requirements

- Interpretation generated client-side (no server required)
- < 100ms processing time per ECG
- Graceful handling of missing data

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      demo.html                               │
│  ┌─────────────────┐    ┌────────────────────────────────┐  │
│  │  ZZU ECG JSON   │───▶│  PediatricInterpreter          │  │
│  │  (signal +      │    │  ┌──────────────────────────┐  │  │
│  │   patient age)  │    │  │ 1. getAgeGroup(ageDays)  │  │  │
│  └─────────────────┘    │  │ 2. getNormalsForAge()    │  │  │
│                         │  │ 3. calculateMeasurements()│  │  │
│                         │  │ 4. classifyValues()       │  │  │
│                         │  │ 5. generateFindings()     │  │  │
│                         │  └──────────────────────────┘  │  │
│                         └─────────────┬──────────────────┘  │
│                                       ▼                      │
│                         ┌────────────────────────────────┐  │
│                         │  Interpretation Panel          │  │
│                         │  - Rhythm statement            │  │
│                         │  - Axis interpretation         │  │
│                         │  - Interval findings           │  │
│                         │  - Voltage criteria            │  │
│                         │  - Age-specific notes          │  │
│                         └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. User loads ZZU ECG → `openZZUECG()` called
2. Extract `patient.age` string (e.g., "3.5 yr", "6 mo")
3. Parse to days → `ageToDays()`
4. Get age group → `getAgeGroup(ageDays)`
5. Get normals → `getNormalsForAge(ageDays)`
6. Calculate measurements from signal → `calculateECGMeasurements()`
7. Classify each value → `classifyValue(value, normalRange)`
8. Generate findings array → `generateInterpretation()`
9. Update UI → interpretation panel

### Key Functions to Implement

```typescript
// In demo.html or new pediatric-interpreter.ts

interface InterpretationResult {
  ageGroup: AgeGroup;
  measurements: ECGMeasurements;
  findings: Finding[];
  summary: string;
  isNormal: boolean;
}

interface Finding {
  parameter: string;      // "Heart Rate", "QTc", "QRS Axis"
  value: number;
  unit: string;
  normalRange: NormalRange;
  classification: 'low' | 'borderline_low' | 'normal' | 'borderline_high' | 'high';
  interpretation: string; // "Sinus tachycardia for age"
  severity: 'normal' | 'minor' | 'significant' | 'critical';
}

function interpretPediatricECG(
  signal: ECGSignal,
  patientAgeDays: number
): InterpretationResult;
```

## Testing Strategy

### Unit Tests

1. **Age parsing**: "3.5 yr" → 1278 days, "6 mo" → 183 days
2. **Age group mapping**: 100 days → infant_1_3mo
3. **Classification**: HR 180 in neonate → normal, HR 180 in adolescent → high
4. **Finding generation**: QTc 480ms in child → "Prolonged QTc (critical)"

### Integration Tests

1. Load Normal ECG → interpretation shows "Normal ECG for age"
2. Load VSD ECG → interpretation reflects structural findings
3. Load SVT ECG → interpretation shows tachycardia finding

### Test Cases

| Age | HR | Expected Classification |
|-----|-----|------------------------|
| 1 day | 145 | normal |
| 1 day | 200 | high |
| 6 months | 150 | normal |
| 6 months | 180 | high |
| 10 years | 85 | normal |
| 10 years | 130 | high |

## Implementation Plan

### Milestone 1: Age Parsing & Mapping
- [ ] Parse ZZU age strings to days
- [ ] Integrate with GEMUSE `getAgeGroup()`
- [ ] Unit tests for age parsing

### Milestone 2: Measurement Calculation
- [ ] Wire up `calculateECGMeasurements()` for ZZU signals
- [ ] Verify measurements match expected ranges
- [ ] Unit tests for measurement calculation

### Milestone 3: Classification & Findings
- [ ] Implement `classifyValue()` integration
- [ ] Generate finding objects with interpretations
- [ ] Handle edge cases (missing leads, artifacts)

### Milestone 4: UI Integration
- [ ] Update interpretation panel in demo.html
- [ ] Color-code findings by severity
- [ ] Show normal ranges alongside values

### Milestone 5: Polish
- [ ] Add T-wave V1 analysis
- [ ] Add clinical notes from age group
- [ ] Final testing with all ZZU categories

## Files to Modify

1. `demo.html` - Add interpretation logic and UI updates
2. `src/data/pediatricNormals.ts` - Already exists, may need exports
3. `src/data/ageGroups.ts` - Already exists, may need exports

## Dependencies

- GEMUSE `getAgeGroup()`, `getNormalsForAge()`, `classifyValue()`
- GEMUSE `calculateECGMeasurements()`
- ZZU ECG JSON with patient age metadata

## Acceptance Criteria

1. Loading any ZZU ECG displays age-appropriate interpretation
2. Interpretation includes: rhythm, rate, intervals, axis findings
3. Abnormal values highlighted with color coding
4. Age group and normal ranges visible to user
5. All 24 sample ECGs produce valid interpretations
