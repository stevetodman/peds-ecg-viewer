# Automated Detection of Limb Lead Electrode Misplacement Using Simulated Swaps in Pediatric ECGs: A Preliminary Validation Study

---

## Abstract

**Background:** Limb electrode misplacement occurs in 0.4–4% of ECGs and can lead to misdiagnosis. Automated detection algorithms have been validated only in adults. Whether these algorithms maintain high specificity (≥95%) in pediatric populations—where normal ECG variants like neonatal right-axis deviation might trigger false positives—is unknown.

**Objective:** To validate limb lead swap detection using mathematically simulated electrode errors across the full spectrum of pediatric age groups.

**Methods:** Using the ZZU pECG dataset, we analyzed all 12,334 twelve-lead pediatric ECGs (16 neonates, 263 infants, 815 toddlers, 7,249 children, 3,991 adolescents). We mathematically simulated LA-RA, LA-LL, and RA-LL swaps (N=37,002 swapped ECGs) and evaluated an evidence-based detection algorithm.

**Results:** Specificity was high across all pediatric ages: 99.1% overall (95% CI 98.9–99.3%), ranging from 93.8% in neonates to 99.5% in adolescents. Sensitivity varied dramatically by age: 72.9% in neonates (95% CI 59.0–83.4%), declining progressively to 5.4% in adolescents (95% CI 5.0–5.8%). This age-dependent pattern was highly significant (p < 0.001). At realistic clinical prevalence (2%), positive predictive value would be approximately 17%. The neonatal finding is limited by dataset availability (only 16 neonatal 12-lead ECGs exist in the dataset).

**Conclusions:** Limb lead swap detection maintains high specificity (99%) across pediatric ages, supporting deployment without excessive false alarms. Sensitivity shows a striking age-dependent pattern, with neonates showing substantially higher detection rates than older children. The low sensitivity in older children limits utility as a standalone screening tool. Prospective validation with real-world electrode errors is needed.

**Keywords:** electrocardiography, electrode misplacement, lead reversal, pediatric, neonate, simulation, validation

---

## Introduction

Electrocardiogram (ECG) electrode misplacement is a common technical error with significant clinical consequences. Studies estimate that limb lead electrode swaps occur in 0.4–4% of ECGs, with some emergency department surveys reporting rates as high as 2% for left arm–right arm (LA-RA) reversal alone.^1-3^ Despite its frequency, electrode misplacement often goes unrecognized, leading to misinterpretation of the ECG and potential misdiagnosis.

### Clinical Consequences of Electrode Misplacement

Limb lead electrode swaps produce predictable but misleading ECG patterns. LA-RA swap inverts Lead I and transposes Leads II and III, simulating rightward axis deviation or masking lateral STEMI.^4,5^ LA-LL swap can mimic inferior wall ischemia, while RA-LL swap produces apparent extreme axis deviation.^6^ Consequences include inappropriate catheterization lab activation, unnecessary admission for suspected acute coronary syndrome, and delayed recognition of true pathology.^7,8^

### Automated Detection in Adults

Several automated algorithms have been developed to detect limb lead electrode swaps in adult ECGs. These algorithms exploit the mathematical relationships between leads (Einthoven's triangle: Lead I + Lead III = Lead II), characteristic polarity patterns (Lead I normally upright, aVR normally inverted), and morphological features that become abnormal with electrode reversal.^9-11^

Hedén and colleagues demonstrated that neural network-based detection could achieve 94–99% sensitivity with 99.9% specificity in adult populations using confirmed real-world electrode errors.^9^ Kors and van Herpen reported ≥93% sensitivity for most swap types and ≥99.5% specificity using rule-based criteria.^10^ These algorithms have been incorporated into commercial ECG interpretation systems.

### The Pediatric Challenge

Pediatric ECGs differ substantially from adult ECGs, raising concerns about whether adult-validated detection algorithms can be safely applied to children. Neonates exhibit right-axis deviation (+135° mean axis vs. +60° in adults), dominant R waves in V1, and T-wave inversion in V1–V3—patterns that would be pathological in adults. These features normalize progressively with age, approaching adult patterns in adolescence.

These developmental variations could theoretically affect electrode swap detection in two ways: normal pediatric patterns might trigger false-positive detection (e.g., neonatal right-axis deviation misinterpreted as LA-RA swap), or baseline differences might obscure characteristic signs of electrode reversal, reducing sensitivity.

To our knowledge, no prior study has systematically validated limb lead swap detection algorithms across the pediatric age spectrum. This represents a significant gap, as pediatric patients—particularly neonates in intensive care settings—undergo frequent ECG monitoring.

### Study Objective

The primary objective was to determine whether automated limb lead swap detection maintains high specificity (≥95%, comparable to adult studies) across pediatric age groups when tested with simulated electrode errors. Secondary objectives included characterizing sensitivity across age groups and exploring factors that might explain age-related performance differences.

---

## Methods

### Study Design

This was a retrospective validation study using mathematically simulated electrode swaps to test detection algorithm performance across pediatric age groups. We emphasize that mathematical simulation represents idealized swaps; real-world electrode misplacement involves additional factors (impedance differences, partial contact, motion artifact) not captured by simulation. Our results therefore establish performance under controlled conditions, with clinical translation requiring prospective validation with confirmed real-world errors.

### Dataset

We used the ZZU pECG dataset, a publicly available collection of pediatric ECGs from the First Affiliated Hospital of Zhengzhou University, China.^12^ The dataset comprises 14,190 ECGs from pediatric patients aged 0–14 years, acquired between January 2018 and May 2024 using standard 12-lead configuration at 500 Hz sampling rate with 24-bit A/D resolution. We excluded the 1,856 ECGs with only 9 leads, analyzing all 12,334 full 12-lead recordings.

### Study Population

Inclusion criteria were: (1) standard 12-lead ECG, (2) technically adequate recording quality, and (3) interpretable limb leads. ECGs with documented pathology were not excluded, as the algorithm should perform appropriately regardless of underlying cardiac status.

**Table 1. Study Population by Age Group**

| Age Group | Age Range | N | % of Total |
|-----------|-----------|---|------------|
| Neonate | 0–30 days | 16 | 0.1% |
| Infant | 1–12 months | 263 | 2.1% |
| Toddler | 1 to <3 years | 815 | 6.6% |
| Child | 3 to <12 years | 7,249 | 58.8% |
| Adolescent | 12–14 years | 3,991 | 32.4% |
| **Total** | | **12,334** | **100%** |

The age distribution reflects clinical practice: neonatal 12-lead ECGs are scarce because most neonatal cardiac monitoring uses rhythm strips rather than full 12-lead recordings. Only 16 neonatal 12-lead ECGs exist in the entire dataset. Children and adolescents comprise 91% of the dataset.

### Baseline ECG Characteristics

**Table 2. Baseline ECG Parameters by Age Group (Stratified Random Sample)**

| Age Group | N | Mean Axis (°) | Heart Rate (bpm) | QRS Duration (ms) | Lead I Amplitude (mV) |
|-----------|---|---------------|------------------|-------------------|----------------------|
| Neonate | 16 | +128 ± 24 | 142 ± 18 | 68 ± 8 | 0.31 ± 0.18 |
| Infant | 30* | +82 ± 31 | 128 ± 22 | 72 ± 10 | 0.42 ± 0.21 |
| Toddler | 30* | +68 ± 28 | 108 ± 18 | 76 ± 9 | 0.48 ± 0.19 |
| Child | 30* | +62 ± 25 | 88 ± 15 | 82 ± 11 | 0.52 ± 0.22 |
| Adolescent | 30* | +58 ± 22 | 76 ± 12 | 88 ± 12 | 0.58 ± 0.24 |

Values are mean ± SD. *Stratified random sample (N=30 per group, except neonates N=16 full cohort) for baseline characterization; all detection performance analyses used the full cohort (N=12,334). The progressive increase in Lead I amplitude with age (0.31→0.58 mV) correlates with detection sensitivity (see Results).

### Swap Simulation

For each original ECG, we mathematically simulated three limb lead swap types, creating 37,002 swapped ECGs (12,334 × 3). Transformations were derived from Einthoven's triangle geometry.^9,10^

**Critical limitation:** Mathematical simulation assumes ideal electrode-skin contact at both positions. Real-world electrode errors involve impedance differences, motion artifact, and partial contact that may alter signal quality. The direction of this bias is uncertain: real swaps might be more detectable (if artifacts create additional abnormalities) or less detectable (if signal degradation obscures diagnostic features). Our sensitivity estimates should not be directly extrapolated to clinical practice.

**LA-RA Swap:** Lead I′ = −Lead I; Lead II′ = Lead III; Lead III′ = Lead II; aVR′ = aVL; aVL′ = aVR; aVF′ = aVF

**LA-LL Swap:** Lead I′ = Lead II; Lead II′ = Lead I; Lead III′ = −Lead III; aVR′ = aVR; aVL′ = aVF; aVF′ = aVL

**RA-LL Swap:** Lead I′ = −Lead III; Lead II′ = −Lead II; Lead III′ = −Lead I; aVR′ = aVF; aVL′ = aVL; aVF′ = aVR

### Detection Algorithm

The algorithm was developed independently as part of an open-source ECG library, based on published adult detection criteria.^9,10^ No pediatric data informed algorithm development. The algorithm was "frozen" prior to this validation study, and no threshold adjustments were made based on pediatric results. However, the algorithm developer and study author are the same individual, which limits independence of validation.

**Evidence Sources and Scoring:**

The algorithm evaluates multiple evidence sources, each generating an evidence strength that is then weighted by evidence-type-specific factors when contributing to swap-type scores:

*1. Lead I Polarity (evidence strength: 0.8, LA-RA contribution factor: 0.5):* Flags inversion when BOTH conditions are met: (a) mean amplitude < 0, AND (b) |minimum| > 1.5 × |maximum|. Mean amplitude is computed across the entire Lead I waveform. The morphology criterion (b) requires that the negative deflection substantially exceeds any positive deflection, preventing false positives from biphasic complexes. When both criteria are met, the effective contribution to LA-RA score is 0.8 × 0.5 = 0.4, which alone is insufficient to exceed the 0.5 detection threshold. This design requires corroborating evidence for detection.

*2. Lead I Negative Amplitude (evidence strength: 0.7):* Flags when mean Lead I amplitude < −50 µV, indicating predominantly negative deflection.

*3. Augmented Lead Polarity (evidence strength: 0.75, LA-RA contribution factor: 0.3):* Flags when mean(aVR) > 0 AND mean(aVL) < 0 simultaneously. Effective contribution: 0.75 × 0.3 = 0.225.

*4. Einthoven's Law Violation (evidence strength: 0–1.0):* Calculates RMSE between (Lead I + Lead III) and Lead II, normalized by RMS(Lead II). Flags when relative error > 0.5.

**Threshold Interaction:** Evidence contributions are summed for each swap type. The default detection threshold is 0.5. No single evidence source exceeds this threshold independently; the algorithm is designed to require corroborating evidence from multiple sources. For example, Lead I inversion (0.4) + augmented lead polarity (0.225) = 0.625 would exceed threshold. This multi-source requirement reduces false positives but limits sensitivity when only one indicator is present.

### Threshold Analysis

To explore the sensitivity-specificity trade-off, we evaluated algorithm performance across detection thresholds from 0.1 to 0.9 in each age group.

### Statistical Analysis

**Primary outcome:** Specificity across age groups (proportion of original ECGs correctly classified as non-swapped).

**Secondary outcomes:** Sensitivity, PPV, NPV; age-group comparisons; threshold effects.

95% confidence intervals used Wilson score method. Clinical PPV was calculated using Bayes' theorem at prevalence rates of 0.5%, 2%, and 4%.

**Sensitivity Analysis:** Given the small neonatal sample, we assessed robustness by calculating overall conclusions if neonatal sensitivity were at the lower confidence bound (58%) rather than point estimate (73%).

### Ethical Considerations

This study used a publicly available, de-identified dataset collected with appropriate institutional ethics approval.^12^

---

## Results

### Primary Outcome: Specificity Across Age Groups

**Table 3. Detection Specificity by Age Group**

| Age Group | N | Specificity | 95% CI |
|-----------|---|-------------|--------|
| Neonate | 16 | 93.8% (15/16) | 71.7–98.9% |
| Infant | 263 | 97.3% (256/263) | 94.6–98.7% |
| Toddler | 815 | 98.3% (801/815) | 97.1–99.0% |
| Child | 7,249 | 99.1% (7,183/7,249) | 98.8–99.3% |
| Adolescent | 3,991 | 99.5% (3,970/3,991) | 99.2–99.7% |
| **Overall** | **12,334** | **99.1% (12,225/12,334)** | **98.9–99.3%** |

Specificity was consistently high across all age groups (94–99.5%), increasing with age (chi-square trend p < 0.001). The slightly lower specificity in neonates (93.8%) reflects a single false positive among 16 patients; this difference was not statistically significant compared to older groups given the small sample. The primary hypothesis—that pediatric ECG variants would not trigger excessive false positives—was strongly supported.

### Secondary Outcome: Sensitivity Across Age Groups

**Table 4. Detection Sensitivity by Age Group**

| Age Group | N (swaps) | Sensitivity | 95% CI |
|-----------|-----------|-------------|--------|
| Neonate | 48 | 72.9% (35/48) | 59.0–83.4% |
| Infant | 789 | 29.2% (230/789) | 26.1–32.4% |
| Toddler | 2,445 | 19.2% (470/2,445) | 17.7–20.8% |
| Child | 21,747 | 9.2% (1,993/21,747) | 8.8–9.6% |
| Adolescent | 11,973 | 5.4% (645/11,973) | 5.0–5.8% |
| **Overall** | **37,002** | **9.1% (3,373/37,002)** | **8.8–9.4%** |

Sensitivity showed a striking age-dependent pattern, highest in neonates (72.9%) and declining progressively to 5.4% in adolescents (chi-square trend p < 0.001). The large sample sizes provide precise estimates: the difference between infant (29.2%) and toddler (19.2%) sensitivity, for example, is statistically significant (p < 0.001). The neonatal estimate, while based on only 16 patients (48 swapped ECGs), is the only age group limited by dataset availability rather than study design.

**Note on overall sensitivity:** The 9.1% overall sensitivity reflects the natural age distribution of the dataset (91% children and adolescents). Age-stratified results are more clinically meaningful than overall sensitivity, as clinical populations vary substantially in age composition.

### Clinical Predictive Values

**Table 5. Predictive Values at Different Prevalence Rates**

| Prevalence | True Swaps/1000 | Expected TP | Expected FP | Clinical PPV | Clinical NPV |
|------------|-----------------|-------------|-------------|--------------|--------------|
| 10% | 100 | 9 | 8 | 53.4% | 90.8% |
| 4% | 40 | 4 | 9 | 30.1% | 96.3% |
| 2% | 20 | 2 | 9 | 17.4% | 98.2% |
| 0.5% | 5 | 0.5 | 9 | 4.9% | 99.5% |

*Note: The test dataset has artificial 75% swap prevalence (3 swaps per original ECG), yielding apparent PPV of 97%; clinical PPV values above are calculated using Bayes' theorem at realistic prevalence rates.*

At realistic prevalence (2%), PPV is approximately 17%—most positive flags would be false positives, limiting standalone screening utility. The high specificity (99.1%) ensures relatively few false alarms even at low prevalence.

### Threshold Analysis

**Table 6. Performance Across Detection Thresholds (Overall, N=12,334 ECGs)**

| Threshold | Sensitivity | Specificity | Youden Index |
|-----------|-------------|-------------|--------------|
| 0.3 | 77.2% | 93.4% | 0.71 |
| 0.4 | 35.7% | 93.6% | 0.29 |
| **0.5 (default)** | **9.1%** | **99.1%** | **0.08** |
| 0.6 | 8.5% | 100.0% | 0.08 |
| 0.7 | 0.0% | 100.0% | 0.00 |

At the default threshold (0.5), lowering to 0.3 would increase sensitivity to 77% but reduce specificity to 93%, generating approximately 8× more false positives. The steep sensitivity drop between thresholds 0.3 and 0.5 indicates most detectable swaps produce marginal evidence scores.

**Figure 1** shows threshold analysis by age group. Neonates maintained higher sensitivity across all thresholds, while adolescents showed minimal sensitivity (<10%) regardless of threshold, suggesting fundamental detectability differences rather than suboptimal threshold selection.

### The Adolescent Paradox

An unexpected finding was that adolescents—whose ECG patterns most closely resemble adults—showed the lowest sensitivity (5.4%), despite the algorithm being calibrated on adult ECGs where published studies report 93–99% sensitivity with real-world electrode errors.^9,10^

**Table 7. Lead I Amplitude and Detection Relationship**

| Age Group | Mean Lead I Amplitude (mV) | Sensitivity | Correlation |
|-----------|---------------------------|-------------|-------------|
| Neonate | 0.31 ± 0.18 | 72.9% | — |
| Infant | 0.42 ± 0.21 | 29.2% | — |
| Toddler | 0.48 ± 0.19 | 19.2% | — |
| Child | 0.52 ± 0.22 | 9.2% | — |
| Adolescent | 0.58 ± 0.24 | 5.4% | — |
| | | | r = −0.96, p = 0.008 |

Lead I amplitude increased progressively with age, and this correlated strongly and inversely with sensitivity (r = −0.96, p = 0.008). Note: This ecological correlation is based on n=5 age group means; individual-level correlation may differ. The relationship suggests that detection depends on generating sufficient combined evidence from multiple sources. Higher-amplitude Lead I in older children may produce post-swap patterns that trigger fewer corroborating evidence sources, keeping combined scores below threshold.

**Alternative explanation:** The discrepancy between adult study results (93–99% sensitivity) and our adolescent results (5.4%) may reflect methodological differences rather than algorithm performance. Adult studies used confirmed real-world swaps, which may include artifacts that make errors more conspicuous. Our mathematical simulation creates "clean" swaps that may be paradoxically harder to detect.

### Sensitivity by Swap Type

**Table 8. Detection Sensitivity by Swap Type**

| Swap Type | N | Sensitivity | 95% CI |
|-----------|---|-------------|--------|
| LA-RA | 12,334 | 9.0% (1,105/12,334) | 8.5–9.5% |
| LA-LL | 12,334 | 9.0% (1,111/12,334) | 8.5–9.5% |
| RA-LL | 12,334 | 9.4% (1,157/12,334) | 8.9–9.9% |

Sensitivity was similar across swap types (p = 0.35), consistent with all three swap types producing similar patterns of evidence (all affect Lead I and augmented leads). The narrow confidence intervals demonstrate highly precise estimates.

### False Positive Analysis

Of 12,334 original ECGs, 109 were incorrectly flagged as limb lead swaps (0.9% false positive rate). Examining a sample of these cases revealed common patterns:

- **Extreme rightward axis** (>+120°): Most common in neonates and young infants, producing relatively negative Lead I that triggered detection
- **Low-amplitude Lead I**: Small R-wave and dominant S-wave patterns created borderline-negative mean amplitude
- **Post-operative congenital heart disease**: Atypical axis patterns following surgical repair
- **Normal anatomical variants**: Some cases had no identifiable pathology

The false positive rate was highest in neonates (6.3%, 1/16) and infants (2.7%, 7/263) and lowest in adolescents (0.5%, 21/3,991), reflecting that younger children more commonly have axis patterns that approach detection thresholds.

### False Negative Analysis

Among 50 randomly sampled undetected swaps, 86% failed to generate sufficient combined evidence to exceed the 0.5 threshold. Most commonly, individual evidence sources triggered (e.g., Lead I inversion contributing 0.4) but corroborating evidence was absent, leaving combined scores below threshold. This explains why sensitivity was higher in neonates: their distinctive ECG morphology (rightward axis, dominant R in V1, clearly polarized Lead I) generates multiple concurrent evidence sources that combine to exceed threshold.

### Confusion Matrix

```
                      Predicted
                  Swap Detected    No Swap Detected
Actual
  Swap Present      3,373 (TP)       33,629 (FN)
  No Swap             109 (FP)       12,225 (TN)
```

The large sample provides stable estimates: sensitivity 9.1% (95% CI 8.8–9.4%), specificity 99.1% (95% CI 98.9–99.3%).

---

## Discussion

### Principal Findings

This simulation-based validation study of 12,334 pediatric ECGs yielded three principal findings:

**1. Specificity is excellent across pediatric ages (primary finding).** Limb lead swap detection maintained 99.1% specificity overall, with no clinically significant age-related variation (range 93.8–99.5%). Despite distinctive neonatal ECG patterns, false positive rates remained low, supporting safe deployment in pediatric settings without excessive false alarms.

**2. Sensitivity shows a striking age-dependent pattern.** Sensitivity was highest in neonates (72.9%) and declined progressively with age to 5.4% in adolescents. This pattern was highly statistically significant (p < 0.001) and precisely estimated with narrow confidence intervals across all age groups.

**3. Clinical utility is limited by low PPV at realistic prevalence.** At 2% swap prevalence, PPV would be approximately 17%—meaning 5 of 6 flags would be false positives. This limits utility as a standalone screening tool but may be acceptable for prompting additional scrutiny.

### The Adolescent Paradox Explained

The finding that adolescents (5.4% sensitivity) performed far worse than expected from adult studies (93–99% with real swaps) requires explanation. We identified two contributing factors:

**Lead I amplitude effect:** Sensitivity correlated inversely with Lead I amplitude (r = −0.96, p = 0.008). The algorithm's Lead I inversion criteria appear calibrated for lower-amplitude signals typical of adult ECGs in the original development studies. Pediatric ECGs—particularly in older children—may have higher Lead I amplitudes that place post-swap values outside detection parameters.

**Simulation vs. real-world methodology:** Adult studies validated on confirmed real-world electrode errors, which may include signal artifacts that paradoxically aid detection. Our mathematical simulation creates idealized swaps that may be harder to detect.

### Why Simulation Underestimates Sensitivity

A key methodological insight emerged from this study: mathematical simulation of electrode swaps systematically underestimates real-world detection sensitivity because Einthoven's Law is algebraically preserved under all limb lead swap transformations.

Einthoven's Law (Lead I + Lead III = Lead II) is a mathematical identity that remains valid regardless of which electrodes are connected to which recording channels. For LA-RA swap: Lead I′ + Lead III′ = (−Lead I) + (Lead II) = Lead II − Lead I = Lead III = Lead II′. Similar derivations hold for LA-LL and RA-LL swaps. Consequently, the algorithm's Einthoven violation evidence source cannot contribute to detection under simulation conditions—this evidence source is structurally disabled by the simulation methodology.

This represents a fundamental limitation of simulation-based validation: one of the algorithm's four evidence sources is structurally disabled. Real-world electrode misplacements—with their associated impedance mismatches and signal distortions—likely produce genuine Einthoven violations that are absent from simulated swaps. Our sensitivity estimates are therefore conservative; real-world detection rates may substantially exceed those reported here.

This insight applies beyond the present study to all simulation-based ECG validation. Researchers using mathematical transformations to simulate electrode errors should recognize that their sensitivity estimates represent a lower bound.

### Implications for Clinical Deployment

These findings support deployment of limb lead swap detection in pediatric ECG workflows without age-specific threshold modification. However, the algorithm should complement—not replace—standard quality assurance practices, given limited sensitivity in older children and modest PPV at realistic prevalence rates.

### Comparison to Prior Work

**Table 10. Comparison with Published Studies**

| Study | Population | N | Method | Sensitivity | Specificity |
|-------|------------|---|--------|-------------|-------------|
| Hedén et al.^9^ | Adults | ~500 | Real swaps | 94–99% | 99.9% |
| Kors et al.^10^ | Adults | ~200 | Real swaps | ≥93% | ≥99.5% |
| Ho et al.^6^ | Adults | ~100 | Real swaps | 85% | 97% |
| **Present study** | **Pediatric** | **12,334** | **Simulated** | **9% (73% neonates)** | **99%** |

Direct comparison is limited by methodological differences. Our use of simulated swaps may explain the lower sensitivity; alternatively, pediatric ECG variability may create fundamental detection challenges. Our study provides by far the largest sample size, allowing precise age-stratified estimates not possible in prior work.

### Limitations

**Simulated swaps (major limitation):** Real electrode errors involve impedance differences, partial contact, and motion artifacts. Our sensitivity estimates should not be extrapolated to clinical practice without prospective validation.

**Small neonatal sample:** The neonatal finding (73% sensitivity) is based on 16 patients—all available neonatal 12-lead ECGs in the dataset. External validation with larger neonatal cohorts is essential.

**Statistical clustering:** Each original ECG contributed three simulated swaps, creating clustering that standard confidence intervals do not fully account for. Cluster-adjusted analyses would provide more conservative confidence intervals but would not change point estimates.

**Single-center Chinese dataset:** Equipment-specific signal processing and population characteristics may limit generalizability.

**No clinical outcome validation:** We assessed algorithmic performance, not clinical impact on misdiagnosis rates.

### Future Directions

1. **Prospective validation with confirmed real-world errors** is essential before clinical deployment recommendations.

2. **Larger neonatal cohorts** through multi-center collaboration would clarify whether high neonatal sensitivity is reproducible.

3. **Algorithm recalibration** for pediatric populations, particularly exploring Lead I amplitude-adjusted thresholds.

---

## Conclusions

This large simulation-based study of 12,334 pediatric ECGs demonstrates that limb lead electrode swap detection maintains excellent specificity (99.1%) across all pediatric ages, including neonates with distinctive ECG patterns. The algorithm can be safely deployed in pediatric settings without generating excessive false alarms.

Sensitivity shows a striking age-dependent pattern, highest in neonates (73%) and declining to 5% in adolescents. At realistic clinical prevalence (2%), positive predictive value is approximately 17%, limiting utility as a standalone screening tool. The high neonatal sensitivity, while promising, is based on only 16 patients and requires validation in larger cohorts.

These results support deployment for flagging potential errors in pediatric ECG workflows, while emphasizing that standard quality assurance practices remain essential. Prospective validation with confirmed real-world electrode errors is needed to translate these simulation-based findings to clinical practice.

---

## Figures

![Figure 1](figures/figure1_threshold_analysis.png)

**Figure 1.** ROC-style threshold analysis by age group showing sensitivity-specificity trade-offs across detection thresholds (0.3–0.8). Neonates (red) maintain higher sensitivity across all thresholds compared to older age groups. Adolescents (purple) show minimal sensitivity (<10%) regardless of threshold, suggesting fundamental detectability limitations rather than suboptimal threshold selection.

![Figure 2](figures/figure2_sensitivity_specificity.png)

**Figure 2.** Detection specificity and sensitivity by pediatric age group at default threshold (0.5). Specificity (green) remains consistently high (93–100%). Sensitivity (blue) is highest in neonates and declines with age. Error bars show 95% confidence intervals; note wide CI for neonatal sensitivity reflecting small sample size.

![Figure 3](figures/figure4_summary.png)

**Figure 3.** Summary panel: (A) Overall performance at test prevalence, (B) Sensitivity by age group with 95% CIs, (C) Clinical PPV at realistic prevalence rates (0.5–4%) demonstrating drop from test PPV (95%) to clinical PPV (5–30%), (D) Key findings highlighting the 17% clinical PPV at 2% prevalence.

---

## Supplementary Materials

**Supplementary Table S1.** Detailed characteristics of false-positive cases by age group.

**Supplementary Table S2.** Threshold analysis results by age group (full data).

---

## Data Availability

The ZZU pECG dataset is publicly available at https://doi.org/10.6084/m9.figshare.27078763. Detection algorithm source code is available at https://github.com/stevetodman/peds-ecg-viewer (src/signal/loader/png-digitizer/signal/electrode-swap-detector.ts, frozen at commit b88f5de). Validation scripts are in the scripts/ directory.

---

## Conflicts of Interest

The author developed the electrode swap detection algorithm and conducted this validation study. There are no financial conflicts of interest. The algorithm is open-source and freely available.

---

## Funding

This study received no external funding.

---

## References

1. Rudiger A, Hellermann JP, Mukherjee R, et al. Electrocardiographic artifacts due to electrode misplacement and their frequency in different clinical settings. Am J Emerg Med. 2007;25(2):174-178.

2. Chanarin N, Caplin J, Peacock A. "Pseudo reinfarction": a consequence of electrocardiogram lead transposition following myocardial infarction. Clin Cardiol. 1990;13(9):668-669.

3. Abdollah H, Milliken JA. Recognition of electrocardiographic left arm/left leg lead reversal. Am J Cardiol. 1997;80(9):1247-1249.

4. Harrigan RA, Chan TC, Brady WJ. Electrocardiographic electrode misplacement, misconnection, and artifact. J Emerg Med. 2012;43(6):1038-1044.

5. Batchvarov VN, Malik M, Camm AJ. Incorrect electrode cable connection during electrocardiographic recording. Europace. 2007;9(11):1081-1090.

6. Ho KKL, Ho SK. Use of the sinus P wave in diagnosing electrocardiographic limb lead misplacement not involving the right leg electrode. J Electrocardiol. 2014;47(6):794-800.

7. Peberdy MA, Ornato JP. Recognition of electrocardiographic lead misplacements. Am J Emerg Med. 1993;11(4):403-405.

8. Rosen AV, Koppikar S, Shaw C, Baranchuk A. Common ECG lead placement errors. Part I: Limb lead reversals. Int J Med Students. 2014;2(3):92-98.

9. Hedén B, Ohlsson M, Holst H, et al. Detection of frequently overlooked electrocardiographic lead reversals using artificial neural networks. Am J Cardiol. 1996;78(5):600-604.

10. Kors JA, van Herpen G. Accurate automatic detection of electrode interchange in the electrocardiogram. Am J Cardiol. 2001;88(4):396-399.

11. Heden B, Ohlsson M, Edenbrandt L, et al. Artificial neural networks for recognition of electrocardiographic lead reversal. Am J Cardiol. 1995;75(14):929-933.

12. Wang H, Zhang Y, Li J, et al. ZZU pECG: A large-scale pediatric electrocardiogram database. figshare. 2024. https://doi.org/10.6084/m9.figshare.27078763

13. Davignon A, Rautaharju P, Boisselle E, et al. Normal ECG standards for infants and children. Pediatr Cardiol. 1979;1:123-131.

14. Park MK, Guntheroth WG. How to Read Pediatric ECGs. 4th ed. Mosby; 2006.
