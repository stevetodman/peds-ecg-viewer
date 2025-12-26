# Development Notes

## Current Focus: PNG Digitizer with AI-Guided Tracing

### Status: In Progress (December 25, 2024)

The PNG digitizer now uses **Claude Opus 4.5** for AI-guided waveform tracing. The AI provides ground truth pixel-level measurements that local computer vision cannot reliably extract.

### What's Working

1. **AI TracePoints** - Opus 4.5 returns 21 sample points per panel (every 5% from 0-100%)
   - Test shows Einthoven verification errors of 1-4px for normal ECGs
   - AI correctly identifies waveform color (black, blue) vs grid lines

2. **Comprehensive Prompt** - The AI prompt explains:
   - WHY local CV fails (can't distinguish waveform from grid)
   - What to look for (P waves, QRS, T waves, baseline)
   - Einthoven's Law validation (II = I + III)

3. **Integration** - Digitizer prioritizes AI tracePoints over local CV:
   - `createTraceFromAIPoints()` interpolates between sparse AI points
   - Falls back to local CV only when no tracePoints available

### Test Results

```bash
npx tsx scripts/test-ai-sample-points.ts
```

**normal_ecg.png** (816x453, black waveform):
- 13 panels detected, all with 21 tracePoints
- Einthoven errors: 4px (25%), 1px (50%), 1px (75%)

**CHD ECG example.png** (864x864, blue waveform):
- 9 panels detected (single-column layout)
- waveformColor: #1F77B4 (blue) correctly identified
- Some panels missing (V2, V4, V6)

### Key Files Changed

| File | Purpose |
|------|---------|
| `src/signal/loader/png-digitizer/ai/anthropic.ts` | Uses Opus 4.5, max_tokens=16384 |
| `src/signal/loader/png-digitizer/ai/prompts.ts` | Comprehensive tracePoints prompt |
| `src/signal/loader/png-digitizer/ai/response-parser.ts` | Parses tracePoints, JSON repair |
| `src/signal/loader/png-digitizer/digitizer.ts` | Prioritizes AI tracePoints |
| `src/signal/loader/png-digitizer/cv/grid-detector.ts` | Preserves tracePoints in merge |
| `src/signal/loader/png-digitizer/types.ts` | Added tracePoints to PanelAnalysis |

### Next Steps

1. **CHD ECG Layout** - The CHD ECG has a non-standard single-column layout (9 rows × 1 col). Need to handle this format better or ensure AI detects all 12 leads.

2. **Full Pipeline Test** - Run complete digitization pipeline with AI tracePoints to verify signal reconstruction quality.

3. **More ECG Types** - Test on additional ECG formats:
   - Different paper speeds (25mm/s, 50mm/s)
   - Different gains (5mm/mV, 10mm/mV, 20mm/mV)
   - Scanned vs. digital ECGs
   - Low resolution images

4. **Interpolation Quality** - Current linear interpolation between AI points may miss sharp peaks (R waves). Consider:
   - Cubic spline interpolation
   - More sample points (41 at 2.5% intervals?)
   - AI providing critical point locations (R peak, S trough)

### Architecture

```
User Image → AI Analysis (Opus 4.5) → tracePoints per panel
                                          ↓
                                    createTraceFromAIPoints()
                                          ↓
                                    RawTrace (interpolated)
                                          ↓
                                    SignalReconstructor
                                          ↓
                                    ECGSignal (digital)
```

### Environment Setup

```bash
# API key in .env
ANTHROPIC_API_KEY=sk-ant-api03-...

# Run tests
npx tsx scripts/test-ai-sample-points.ts
```

### Commits

- `95c550d` - Use Opus 4.5 AI with comprehensive tracePoints prompt
- `51a4f2c` - Fix label assignment and add segment-based waveform tracing
- `4691933` - Fix time alignment in signal reconstructor
- `6b5dacc` - Fix panel merge to use spatial proximity
- `c7eb20b` - Add hybrid panel detection

---

*Last updated: December 25, 2024*
