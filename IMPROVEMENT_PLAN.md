# Improvement Plan: Code Quality & Clinical Features

## Overview
Four improvements to be implemented sequentially with commits after each:
1. Remove debug console.log statements
2. Add edge case tests
3. Implement WPW/Brugada detection in interpretation engine
4. Add structured logging with levels

---

## Task 1: Remove Debug Console.log Statements

### Files to Modify

| File | Lines | Type | Action |
|------|-------|------|--------|
| `src/signal/loader/png-digitizer/ai/provider.ts` | 138, 148, 153, 157, 162, 166, 184 | Debug logs | Remove |
| `src/signal/loader/png-digitizer/guaranteed-digitizer.ts` | 431 | Debug log | Remove |
| `src/signal/loader/png-digitizer/signal/reconstructor.ts` | 94, 221, 248, 258, 270, 276, 281, 296, 298, 302, 471, 484, 488-497 | Debug logs | Remove |
| `src/signal/loader/png-digitizer/refiner.ts` | 106, 118, 126 | Debug logs | Remove |
| `src/signal/loader/png-digitizer/human-verified-digitizer.ts` | 386-404 | Demo logs | Remove |
| `src/signal/loader/png-digitizer/digitizer.ts` | 97, 135 | Warn logs | Keep (actual warnings) |
| `src/signal/loader/png-digitizer/ai/ensemble.ts` | 205 | Warn log | Keep (actual warning) |
| `src/signal/loader/png-digitizer/ai/ocr-metadata.ts` | 294 | Error log | Keep (actual error) |
| `src/renderer/layout/twelve-lead.ts` | 181 | Warn log | Keep (actual warning) |

### Keep (Legitimate Warnings/Errors)
- `console.warn` for missing leads, AI failures, calibration issues
- `console.error` for OCR extraction failures

### Remove (Debug/Development)
- All `console.log` with `[AI Provider]`, `[Guaranteed]`, `[Reconstructor]`, `[Refiner]` prefixes
- Demo console.log in human-verified-digitizer

---

## Task 2: Add Edge Case Tests

### Test Categories

#### 2.1 Age Boundary Tests
```
tests/unit/interpretation/edge-cases.test.ts
```

| Test Case | Age (days) | Expected Behavior |
|-----------|------------|-------------------|
| Newborn day 0 | 0 | Use neonate_0_24h norms |
| Day 1 boundary | 1 | Switch to neonate_1_3d norms |
| Day 3 boundary | 3 | Switch to neonate_3_7d norms |
| Day 7 boundary | 7 | Switch to neonate_7_30d norms |
| Day 30 boundary | 30 | Switch to infant_1_3m norms |
| 3 months | 91 | Switch to infant_3_6m norms |
| 6 months | 182 | Switch to infant_6_12m norms |
| 1 year | 365 | Switch to child_1_3y norms |
| 3 years | 1095 | Switch to child_3_5y norms |
| 5 years | 1825 | Switch to child_5_8y norms |
| 8 years | 2922 | Switch to child_8_12y norms |
| 12 years | 4383 | Switch to adolescent_12_16y norms |
| 16 years | 5844 | Switch to adolescent_16_18y norms |

#### 2.2 Measurement Boundary Tests

| Test Case | Value | Expected Finding |
|-----------|-------|------------------|
| QTc exactly 450ms | 450 | QTC_NORMAL (not borderline) |
| QTc exactly 451ms | 451 | QTC_BORDERLINE |
| QTc exactly 470ms | 470 | QTC_BORDERLINE (not abnormal) |
| QTc exactly 471ms | 471 | QTC_PROLONGED (abnormal) |
| QTc exactly 500ms | 500 | QTC_PROLONGED (abnormal, not critical) |
| QTc exactly 501ms | 501 | QTC_PROLONGED (critical) |
| QTc exactly 340ms | 340 | QTC_NORMAL (not short) |
| QTc exactly 339ms | 339 | QTC_SHORT |
| HR at p98 exactly | p98 | RATE_NORMAL |
| HR at p98 + 1 | p98+1 | SINUS_TACHYCARDIA |
| HR at p2 exactly | p2 | RATE_NORMAL |
| HR at p2 - 1 | p2-1 | SINUS_BRADYCARDIA |
| Axis exactly -90 | -90 | LEFT_AXIS_DEVIATION (not extreme) |
| Axis exactly -91 | -91 | EXTREME_AXIS |
| Axis exactly +180 | 180 | Check normalization |
| Axis exactly -180 | -180 | EXTREME_AXIS |

#### 2.3 Invalid/Extreme Input Tests

| Test Case | Input | Expected Behavior |
|-----------|-------|-------------------|
| Negative HR | -50 | Graceful handling |
| Zero HR | 0 | Graceful handling |
| Extreme HR | 500 | Still produces finding |
| Negative QTc | -100 | Graceful handling |
| Extreme QTc | 1000 | Still produces finding |
| NaN inputs | NaN | Graceful handling |
| Undefined inputs | undefined | Graceful handling |

---

## Task 3: Implement WPW/Brugada Detection

### Current State
- WPW detector exists: `src/signal/loader/png-digitizer/signal/wpw-detector.ts`
- Brugada detector exists: `src/signal/loader/png-digitizer/signal/critical-findings.ts`
- Finding codes defined: `WPW`, `BRUGADA_PATTERN` in `src/types/interpretation.ts`
- Summary combiner references them in HIGH_URGENCY_CODES and REVIEW_CODES

### Implementation Plan

#### 3.1 Create New Analyzer
```
src/interpretation/analyzers/preexcitation-analyzer.ts
```

Functions:
- `analyzePreexcitation(prInterval, qrsDuration, deltaWavePresent, ageDays)` → `InterpretationFinding[]`
- Detect WPW: short PR (<120ms) + wide QRS (>110ms) + delta wave
- Detect short PR without delta (LGL pattern)

#### 3.2 Create Brugada Analyzer
```
src/interpretation/analyzers/brugada-analyzer.ts
```

Functions:
- `analyzeBrugada(stElevationV1V2, tWaveInversion, covedPattern)` → `InterpretationFinding[]`
- Type 1 (coved): ≥2mm ST elevation with negative T wave
- Type 2 (saddleback): ≥0.5mm ST elevation with positive/biphasic T wave

#### 3.3 Update InterpretationInput
```typescript
interface InterpretationInput {
  measurements: ECGMeasurements;
  voltages?: VoltageData;
  tWaveV1Polarity?: TWavePolarity;
  // New fields:
  deltaWavePresent?: boolean;
  stElevationV1?: number;
  stElevationV2?: number;
  brugadaPattern?: 'type1_coved' | 'type2_saddleback' | 'none';
}
```

#### 3.4 Update interpret-ecg.ts
- Import and call new analyzers
- Add findings to collection

#### 3.5 Add Tests
```
tests/unit/interpretation/preexcitation-analyzer.test.ts
tests/unit/interpretation/brugada-analyzer.test.ts
```

---

## Task 4: Add Structured Logging

### Design

#### 4.1 Create Logger Utility
```
src/utils/logger.ts
```

```typescript
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LoggerOptions {
  level: LogLevel;
  prefix?: string;
  enableTimestamp?: boolean;
  handler?: (level: LogLevel, message: string, context?: object) => void;
}

export class Logger {
  constructor(options: LoggerOptions);
  debug(message: string, context?: object): void;
  info(message: string, context?: object): void;
  warn(message: string, context?: object): void;
  error(message: string, context?: object): void;
}

// Default logger instance
export const logger: Logger;

// Configure global log level
export function setLogLevel(level: LogLevel): void;
```

#### 4.2 Log Level Behavior
- `DEBUG`: Detailed diagnostic info (disabled in production)
- `INFO`: General operational info
- `WARN`: Potential issues that don't stop execution
- `ERROR`: Errors that affect functionality

#### 4.3 Environment Configuration
```typescript
// Default: INFO in production, DEBUG in development
const DEFAULT_LEVEL = process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG';
```

#### 4.4 Replace Console Statements
Replace remaining `console.warn` and `console.error` with structured logger:
- `src/renderer/layout/twelve-lead.ts:181` → `logger.warn()`
- `src/signal/loader/png-digitizer/digitizer.ts:97,135` → `logger.warn()`
- `src/signal/loader/png-digitizer/ai/ensemble.ts:205` → `logger.warn()`
- `src/signal/loader/png-digitizer/ai/ocr-metadata.ts:294` → `logger.error()`

#### 4.5 Add Tests
```
tests/unit/utils/logger.test.ts
```

---

## Implementation Order

1. **Remove debug console.log** → Commit
2. **Add edge case tests** → Commit
3. **Implement WPW/Brugada** → Commit
4. **Add structured logging** → Commit

Each task will be implemented completely before moving to the next.
