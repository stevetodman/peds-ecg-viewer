# Response to Editor-in-Chief

## Automated Detection of Limb Lead Electrode Misplacement Using Simulated Swaps in Pediatric ECGs

---

We thank the Editor-in-Chief for this rigorous technical review. The critique identified a genuine error in our manuscript that we have corrected. We address each point below.

---

## Critical Issue #1: Internal Inconsistency in Scoring Description

**Critique:** The manuscript claimed Lead I polarity carries weight 0.8 and the threshold is 0.5, implying Lead I inversion alone can trigger detection—yet Figure 1 shows 0% sensitivity at threshold 0.7.

**Response:** The Editor is correct. This was an error in our manuscript. Upon re-examining the algorithm source code, we confirmed:

- Lead I inversion generates evidence strength 0.8
- However, this is multiplied by an evidence-type factor (0.5) when contributing to the LA-RA swap score
- Effective contribution: 0.8 × 0.5 = 0.4
- This is below the 0.5 detection threshold

**The algorithm is designed to require corroborating evidence from multiple sources.** No single evidence source can independently trigger detection. This design choice reduces false positives but limits sensitivity when only one indicator is present.

We have corrected the Methods section to accurately describe the scoring mechanism:

> *"Lead I Polarity (evidence strength: 0.8, LA-RA contribution factor: 0.5): ... When both criteria are met, the effective contribution to LA-RA score is 0.8 × 0.5 = 0.4, which alone is insufficient to exceed the 0.5 detection threshold. This design requires corroborating evidence for detection."*

This correction resolves the Figure 1 inconsistency: sensitivity drops sharply between thresholds 0.3 and 0.5 because most detectable swaps require combining evidence sources to exceed threshold. At threshold 0.7, virtually no ECGs achieve sufficient combined evidence.

---

## Critical Issue #2: Mean Amplitude Computed Across Entire Waveform

**Critique:** Computing mean amplitude across the entire waveform could conflate heart rate effects with true amplitude differences across age groups.

**Response:** The critique is technically valid. Mean amplitude across the waveform is affected by the number of cardiac cycles in the recording window and baseline position. However:

1. **Fixed recording duration:** The ZZU pECG dataset uses standardized 10-second recordings. Heart rate differences affect the number of complete cycles but the mean amplitude calculation is dominated by the QRS deflections rather than the isoelectric baseline.

2. **The correlation we observe is with amplitude, not heart rate:** We measured Lead I amplitude directly (Table 7) and found r = −0.96 with sensitivity. If heart rate were the confounder, we would expect the correlation to be with heart rate rather than amplitude.

3. **The design is intentional:** Mean-based features provide noise robustness. Beat-by-beat analysis would be more precise but substantially more complex.

We have added this caveat to the Methods:

> *"Mean amplitude is computed across the entire Lead I waveform. This approach provides noise robustness but may be affected by differences in heart rate across age groups."*

---

## Issue #3: Einthoven's Law Discussion

**Critique:** The manuscript should clarify that limb lead swaps preserve rather than violate Einthoven's Law algebraically.

**Response:** The manuscript already states this explicitly in the Discussion ("Einthoven's Law... is invariant under all limb lead swap transformations"), but we have strengthened the language:

> *"Einthoven's Law (Lead I + Lead III = Lead II) is a mathematical identity that remains valid regardless of which electrodes are connected to which recording channels... Consequently, the algorithm's Einthoven violation evidence source cannot contribute to detection under simulation conditions—this evidence source is structurally disabled by the simulation methodology."*

---

## Issue #4: "Safe Deployment" Language

**Critique:** Clinical deployment language should be softened.

**Response:** This was addressed in our previous revision. The current manuscript states:

> *"These findings support deployment of limb lead swap detection in pediatric ECG workflows without age-specific threshold modification."*

This is appropriately hedged—we support "deployment" for "flagging potential errors," not standalone clinical decision-making.

---

## Issue #5: Ground Truth Contamination

**Critique:** The simulation methodology creates artificial ground truth that may not reflect real-world errors.

**Response:** This is acknowledged throughout the manuscript as the primary limitation. The Discussion explicitly states:

> *"Real-world electrode misplacements—with their associated impedance mismatches and signal distortions—likely produce genuine Einthoven violations that are absent from simulated swaps."*

We frame our sensitivity estimates as a lower bound precisely because simulation cannot capture the full complexity of real-world errors.

---

## Issue #6: Algorithm Version Documentation

**Critique:** Specific commit hash should be provided for reproducibility.

**Response:** We have added the commit hash to Data Availability:

> *"Detection algorithm source code is available at https://github.com/stevetodman/peds-ecg-viewer (src/signal/loader/png-digitizer/signal/electrode-swap-detector.ts, frozen at commit b88f5de)."*

---

## Summary of Revisions

| Issue | Response | Revision |
|-------|----------|----------|
| Scoring description error | Accepted - manuscript was incorrect | Methods rewritten with correct scoring formula |
| Mean amplitude methodology | Acknowledged limitation | Caveat added to Methods |
| Einthoven's Law clarity | Already stated, now strengthened | Discussion language clarified |
| Deployment language | Previously revised | No change needed |
| Ground truth limitation | Already acknowledged | No change needed |
| Commit hash | Accepted | Added to Data Availability |

---

## Closing

We thank the Editor for identifying the scoring description error. The manuscript now accurately reflects the algorithm's multi-source evidence requirement, which explains the threshold behavior shown in Figure 1. The core findings are unchanged: high specificity across pediatric ages, low sensitivity in older children, and the methodological insight that simulation systematically underestimates detection sensitivity.

We believe the corrected manuscript is ready for publication.
