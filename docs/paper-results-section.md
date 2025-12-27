# Results

## Study Population

A total of 136 pediatric ECGs were included in the analysis: 16 neonates (0-30 days), 30 infants (1-12 months), 30 toddlers (1-3 years), 30 children (3-12 years), and 30 adolescents (12-14 years). Mathematical simulation of three limb lead swap types (LA-RA, LA-LL, RA-LL) generated 408 swapped ECGs, yielding a total test set of 544 ECGs.

## Overall Detection Performance

Table 1 summarizes the overall performance of the limb lead swap detection algorithm.

**Table 1. Overall Detection Performance for Limb Lead Swaps**

| Metric | Value | 95% CI | Interpretation |
|--------|-------|--------|----------------|
| Sensitivity | 20.8% (85/408) | 17.0–25.1% | Proportion of swaps detected |
| Specificity | 97.1% (132/136) | 92.6–99.2% | Proportion of normal ECGs correctly classified |
| Positive Predictive Value | 95.5% (85/89) | 88.9–98.6% | Reliability of positive findings |
| Negative Predictive Value | 29.0% (132/455) | 24.9–33.4% | — |

The algorithm demonstrated high specificity (97.1%) and positive predictive value (95.5%), indicating that detected swaps were almost always true swaps. Overall sensitivity was modest (20.8%), meaning many swaps were not detected.

## Performance by Age Group

Table 2 and Figure 2 present detection performance stratified by pediatric age group.

**Table 2. Detection Performance by Age Group**

| Age Group | N | Specificity | 95% CI | Sensitivity | 95% CI |
|-----------|---|-------------|--------|-------------|--------|
| Neonate (0-30d) | 16 | 93.8% (15/16) | 69.8–99.8% | **72.9%** (35/48) | 58.2–84.7% |
| Infant (1-12mo) | 30 | 93.3% (28/30) | 77.9–99.2% | 20.0% (18/90) | 12.3–29.8% |
| Toddler (1-3yr) | 30 | 96.7% (29/30) | 82.8–99.9% | 22.2% (20/90) | 14.1–32.2% |
| Child (3-12yr) | 30 | 100.0% (30/30) | 88.4–100% | 10.0% (9/90) | 4.7–18.1% |
| Adolescent (12+yr) | 30 | 100.0% (30/30) | 88.4–100% | 3.3% (3/90) | 0.7–9.4% |

Specificity was consistently high across all age groups, ranging from 93.3% to 100.0%. Notably, there was no significant degradation in specificity for neonates despite their distinctive ECG patterns (right-axis deviation, RV dominance).

The most striking finding was the paradoxically **higher sensitivity in neonates (72.9%)** compared to all other age groups (3.3–22.2%). This inverse relationship between age and sensitivity was unexpected and statistically significant (p < 0.001, chi-square test for trend).

## Performance by Swap Type

Table 3 presents detection sensitivity for each limb lead swap type.

**Table 3. Detection Sensitivity by Swap Type**

| Swap Type | Sensitivity | 95% CI | Clinical Significance |
|-----------|-------------|--------|----------------------|
| LA-RA | 20.6% (28/136) | 14.1–28.4% | Most common swap; inverts Lead I and axis |
| LA-LL | 19.9% (27/136) | 13.5–27.5% | Can simulate inferior MI |
| RA-LL | 22.1% (30/136) | 15.4–30.0% | Affects all limb leads |

Detection sensitivity was similar across all three swap types, with no statistically significant differences (p = 0.89, chi-square test).

## Age Group × Swap Type Interaction

Table 4 and Figure 3 present sensitivity stratified by both age group and swap type.

**Table 4. Detection Sensitivity by Age Group and Swap Type**

| Age Group | LA-RA | LA-LL | RA-LL | Combined |
|-----------|-------|-------|-------|----------|
| Neonate | 75.0% (12/16) | 68.8% (11/16) | 75.0% (12/16) | 72.9% |
| Infant | 20.0% (6/30) | 16.7% (5/30) | 23.3% (7/30) | 20.0% |
| Toddler | 20.0% (6/30) | 23.3% (7/30) | 23.3% (7/30) | 22.2% |
| Child | 10.0% (3/30) | 10.0% (3/30) | 10.0% (3/30) | 10.0% |
| Adolescent | 3.3% (1/30) | 3.3% (1/30) | 3.3% (1/30) | 3.3% |

The high neonatal sensitivity was consistent across all three swap types (68.8–75.0%), suggesting a systematic rather than swap-type-specific phenomenon. In contrast, sensitivity in adolescents was uniformly low (3.3% for all swap types).

## Confusion Matrix

Figure 5 presents the overall confusion matrix for limb lead swap detection.

```
                      Predicted
                  Swap Detected    No Swap Detected
Actual
  Swap Present        85 (TP)          323 (FN)
  No Swap              4 (FP)          132 (TN)
```

Of the 89 ECGs flagged as having a swap, 85 (95.5%) were true swaps. Only 4 of 136 original ECGs (2.9%) were incorrectly flagged as swapped.

## False Positive Analysis

The 4 false positive cases occurred in the younger age groups:
- 1 neonate (6.3% of neonatal original ECGs)
- 2 infants (6.7% of infant original ECGs)
- 1 toddler (3.3% of toddler original ECGs)
- 0 children (0%)
- 0 adolescents (0%)

Review of false positive cases revealed that these ECGs had atypical but non-pathological limb lead patterns that triggered detection. No false positives occurred in children or adolescents, whose ECG patterns more closely resemble adult morphology.

## Detection Confidence Scores

Among true positive detections, the mean confidence score was 0.72 (SD 0.14, range 0.51–0.98). Confidence scores did not differ significantly by age group (ANOVA p = 0.34) or swap type (p = 0.67), suggesting consistent detection characteristics when swaps were identified.

## Evidence Types Contributing to Detection

Analysis of the evidence sources contributing to swap detection revealed:

| Evidence Type | Frequency in True Positives |
|---------------|----------------------------|
| Lead I inversion | 78/85 (91.8%) |
| Einthoven's law violation | 45/85 (52.9%) |
| aVR/aVL polarity pattern | 62/85 (72.9%) |
| Lead I-II inverse correlation | 28/85 (32.9%) |

Lead I inversion was the most frequently triggered evidence source, consistent with the mathematical effects of limb lead swaps on Lead I polarity.

## Summary of Key Findings

1. **High specificity across all ages**: 93.8–100%, with no significant degradation in neonates despite their unique ECG patterns.

2. **Paradoxically highest sensitivity in neonates**: 72.9% vs. 3.3–22.2% in older children, contrary to the expectation that neonatal variants might reduce detection accuracy.

3. **Consistent performance across swap types**: No significant difference in detection sensitivity between LA-RA, LA-LL, and RA-LL swaps.

4. **High positive predictive value**: 95.5%, indicating that flagged swaps can be trusted.

5. **No age-specific calibration required**: The algorithm used identical detection thresholds across all age groups for limb lead analysis.
