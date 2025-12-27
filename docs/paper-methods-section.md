# Methods

## Study Design

This was a retrospective validation study evaluating the performance of an automated limb lead electrode swap detection algorithm across pediatric age groups. We tested the algorithm on normal pediatric ECGs with mathematically simulated electrode swaps to establish sensitivity and specificity across the full pediatric age spectrum from neonate to adolescent.

## Dataset

### Source
We used the ZZU pECG dataset, a publicly available collection of pediatric ECGs from the First Affiliated Hospital of Zhengzhou University, China [1]. The dataset comprises 14,190 ECGs from pediatric patients aged 0-14 years, acquired between 2019-2023. ECGs were recorded using standard 12-lead configuration at 500 Hz sampling rate with 16-bit resolution.

### Sample Selection
We performed stratified sampling by age group to ensure adequate representation across the pediatric spectrum. Inclusion criteria were: (1) standard 12-lead ECG, (2) technically adequate recording quality, and (3) interpretable limb leads (I, II, III, aVR, aVL, aVF).

Age groups were defined according to standard pediatric developmental stages:

| Age Group | Age Range | Target N | Actual N |
|-----------|-----------|----------|----------|
| Neonate | 0-30 days | All available | 16 |
| Infant | 1-12 months | 30 | 30 |
| Toddler | 1-3 years | 30 | 30 |
| Child | 3-12 years | 30 | 30 |
| Adolescent | 12-14 years | 30 | 30 |
| **Total** | | | **136** |

For the neonate group, we included all available 12-lead neonatal ECGs (n=16) given their clinical importance and relative scarcity. For other age groups, we randomly sampled 30 ECGs per group using a fixed random seed for reproducibility.

## Swap Simulation

For each of the 136 original ECGs, we mathematically simulated three types of limb lead electrode swaps, creating 408 swapped ECGs (136 × 3 swap types). The swap transformations were derived from Einthoven's triangle geometry and verified against established literature [2,3].

### LA-RA Swap (Left Arm - Right Arm)
The most common electrode placement error in clinical practice. Mathematical transformation:
- Lead I′ = −Lead I
- Lead II′ = Lead III
- Lead III′ = Lead II
- aVR′ = aVL
- aVL′ = aVR
- aVF′ = aVF (unchanged)

### LA-LL Swap (Left Arm - Left Leg)
- Lead I′ = Lead II
- Lead II′ = Lead I
- Lead III′ = −Lead III
- aVR′ = aVR (unchanged)
- aVL′ = aVF
- aVF′ = aVL

### RA-LL Swap (Right Arm - Left Leg)
- Lead I′ = −Lead III
- Lead II′ = −Lead II
- Lead III′ = −Lead I
- aVR′ = aVF
- aVL′ = aVL (unchanged)
- aVF′ = aVR

The total test set comprised 544 ECGs: 136 original (no swap) and 408 with simulated swaps.

## Detection Algorithm

### Overview
The electrode swap detection algorithm analyzes limb lead morphology and inter-lead relationships to identify patterns inconsistent with normal electrode placement. The algorithm generates an evidence score from multiple independent checks, with swap detection triggered when the combined score exceeds 0.5.

### Evidence Sources

**1. Lead I Polarity Analysis**
Lead I normally shows upright P waves and predominantly positive QRS complexes in most individuals. The algorithm calculates:
- Mean amplitude of Lead I
- Maximum and minimum amplitudes
- Inversion status (defined as mean amplitude < 0 AND |minimum| > 1.5 × |maximum|)

Lead I inversion provides strong evidence (weight: 0.8) for LA-RA or LA-LL swap.

**2. Einthoven's Law Verification**
According to Einthoven's law, the algebraic sum of Leads I and III should equal Lead II:

$$\text{Lead I} + \text{Lead III} = \text{Lead II}$$

The algorithm calculates the relative root-mean-square error (RMSE) between the predicted (I + III) and actual Lead II values:

$$\text{Relative Error} = \frac{\text{RMSE}(I + III - II)}{\text{RMS}(II)}$$

A relative error >50% suggests lead misplacement (evidence strength proportional to error magnitude).

**3. Augmented Lead Polarity Patterns**
Normal ECGs show characteristic polarity patterns in the augmented limb leads:
- aVR is typically negative (pointing away from the heart)
- aVL is typically positive (pointing toward the lateral wall)

In LA-RA swap, aVR and aVL polarities are reversed. The algorithm flags this pattern when aVR mean amplitude > 0 AND aVL mean amplitude < 0 (evidence strength: 0.75).

**4. Lead I-II Correlation**
In RA-LL swap, Leads I and II become inversely related. The algorithm calculates Pearson correlation between Leads I and II; correlation < −0.7 provides evidence for RA-LL swap (evidence strength equal to |correlation|).

### Evidence Scoring
Individual evidence items are weighted and combined to generate swap-type-specific scores:

```
LA-RA score = (Lead I inversion × 0.5) + (aVR/aVL polarity × 0.3) + ...
LA-LL score = (Lead II/III pattern × 0.4) + (aVL/aVF pattern × 0.3) + ...
RA-LL score = (Lead I-II inverse correlation × 0.5) + (Lead III inversion × 0.3) + ...
```

The swap type with the highest score is reported if the score exceeds the detection threshold of 0.5.

### Pediatric Considerations
While the algorithm includes age-aware thresholds for precordial lead analysis (to account for normal right ventricular dominance in neonates), the limb lead detection logic uses identical thresholds across all ages. This study specifically evaluated whether limb lead detection requires age-specific calibration.

## Statistical Analysis

### Performance Metrics
We calculated standard diagnostic performance metrics:

- **Sensitivity** = True Positives / (True Positives + False Negatives)
  - Proportion of swapped ECGs correctly identified as swapped

- **Specificity** = True Negatives / (True Negatives + False Positives)
  - Proportion of original ECGs correctly identified as normal

- **Positive Predictive Value (PPV)** = True Positives / (True Positives + False Positives)
  - Proportion of detected swaps that were true swaps

- **Negative Predictive Value (NPV)** = True Negatives / (True Negatives + False Negatives)
  - Proportion of non-detected cases that were truly normal

### Confidence Intervals
95% confidence intervals were calculated using the Wilson score method for binomial proportions.

### Stratified Analysis
Performance metrics were calculated separately for:
1. Each age group (neonate, infant, toddler, child, adolescent)
2. Each swap type (LA-RA, LA-LL, RA-LL)
3. Age group × swap type combinations

### Ground Truth
The ground truth was known by design: original ECGs were labeled as "no swap" and mathematically transformed ECGs were labeled with their corresponding swap type. A detection was considered:
- **True Positive**: Swapped ECG with any limb lead swap detected
- **False Negative**: Swapped ECG with no swap detected
- **True Negative**: Original ECG with no swap detected
- **False Positive**: Original ECG with any swap detected

## Implementation

The detection algorithm was implemented in TypeScript as part of an open-source ECG analysis library. The validation script loaded ECG data in JSON format, applied mathematical swap transformations, ran the detection algorithm on each ECG (original and swapped versions), and recorded results including detection status, swap type identified, confidence score, and evidence details.

All analyses were performed using the same detection thresholds without any age-specific tuning for limb lead detection. The complete source code and validation scripts are available at [repository URL].

## Ethical Considerations

This study used a publicly available, de-identified dataset (ZZU pECG) that was collected with appropriate institutional ethics approval at the originating institution [1]. No additional ethics approval was required for this secondary analysis of de-identified data.

---

## References

1. ZZU pECG Dataset. Zhengzhou University Pediatric ECG Database. figshare. 2025. https://doi.org/10.6084/m9.figshare.27078763

2. Hedén B, Ohlsson M, Holst H, et al. Detection of frequently overlooked electrocardiographic lead reversals using artificial neural networks. Am J Cardiol. 1996;78(5):600-604.

3. Kors JA, van Herpen G. Accurate automatic detection of electrode interchange in the electrocardiogram. Am J Cardiol. 2001;88(4):396-399.
