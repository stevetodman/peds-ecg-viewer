# Introduction

Electrocardiogram (ECG) electrode misplacement is a common technical error with significant clinical consequences. Studies estimate that limb lead electrode swaps occur in 0.4–4% of ECGs, with some emergency department surveys reporting rates as high as 2% for left arm–right arm (LA-RA) reversal alone [1-3]. Despite its frequency, electrode misplacement often goes unrecognized, leading to misinterpretation of the ECG and potential misdiagnosis.

## Clinical Consequences of Electrode Misplacement

Limb lead electrode swaps produce predictable but misleading ECG patterns. LA-RA swap, the most common error, inverts Lead I and transposes Leads II and III, resulting in an apparent rightward axis shift of approximately 180° [4]. This can simulate pathological right-axis deviation, mask lateral ST-elevation myocardial infarction (STEMI), or create the appearance of ectopic atrial rhythm due to P-wave inversion in Lead I [5]. LA-LL swap can mimic inferior wall ischemia, while RA-LL swap produces a bizarre pattern with apparent extreme axis deviation that may prompt unnecessary evaluation for conduction system disease [6].

The downstream consequences of unrecognized electrode swap include inappropriate activation of cardiac catheterization teams, unnecessary admission for suspected acute coronary syndrome, initiation of anticoagulation for presumed atrial arrhythmia, and delayed recognition of true pathology obscured by the technical artifact [7,8]. Conversely, recognizing an electrode swap prevents these errors and allows appropriate clinical decision-making once the ECG is repeated with correct lead placement.

## Automated Detection in Adults

Several automated algorithms have been developed to detect limb lead electrode swaps in adult ECGs. These algorithms exploit the mathematical relationships between leads (Einthoven's triangle: Lead I + Lead III = Lead II), characteristic polarity patterns (Lead I normally upright, aVR normally inverted), and morphological features that become abnormal with electrode reversal [9-11].

Hedén and colleagues demonstrated that neural network-based detection could achieve 70–95% sensitivity with 99% specificity in adult populations [9]. Kors and van Herpen reported 60–80% sensitivity and 98% specificity using rule-based criteria [10]. These algorithms have been incorporated into commercial ECG interpretation systems and are widely used in adult cardiology practice.

## The Pediatric Challenge

Pediatric ECGs differ substantially from adult ECGs, raising concerns about whether adult-validated detection algorithms can be safely applied to children. Normal pediatric ECG patterns include features that would be considered pathological in adults:

**Neonates (0–30 days):**
- Right-axis deviation (+135° mean axis vs. +60° in adults)
- Dominant R wave in V1 (R/S ratio >1)
- T-wave inversion in V1–V3 (normal variant)
- Higher heart rates (120–160 bpm)

**Infants and toddlers:**
- Transitional axis patterns
- Gradual shift from RV to LV dominance
- Evolving R-wave progression

**Children and adolescents:**
- Progressive approach toward adult patterns
- Persistent minor differences in voltage criteria

These developmental variations could theoretically affect electrode swap detection in two ways. First, normal pediatric patterns might trigger false-positive swap detection—for example, if right-axis deviation in a neonate were misinterpreted as evidence of LA-RA swap. Second, the baseline ECG differences might obscure the characteristic signs of electrode reversal, reducing sensitivity.

To our knowledge, no prior study has systematically validated limb lead swap detection algorithms across the pediatric age spectrum. This represents a significant gap, as pediatric patients—particularly neonates in intensive care settings—undergo frequent ECG monitoring and may be especially vulnerable to the consequences of misdiagnosis.

## Study Objective

The objective of this study was to validate the performance of an automated limb lead electrode swap detection algorithm across pediatric age groups from neonate to adolescent. We hypothesized that specificity would be maintained across age groups (i.e., normal pediatric variants would not trigger false-positive detection) but that sensitivity might vary with age due to developmental ECG differences.

We specifically sought to answer three questions:

1. Does limb lead swap detection maintain acceptable specificity in neonates and infants, whose ECG patterns differ most from adults?

2. Does sensitivity vary across pediatric age groups, and if so, in what direction?

3. Is age-specific threshold calibration required for pediatric limb lead swap detection?

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

12. Davignon A, Rautaharju P, Boisselle E, et al. Normal ECG standards for infants and children. Pediatr Cardiol. 1979;1:123-131.

13. Park MK, Guntheroth WG. How to Read Pediatric ECGs. 4th ed. Mosby; 2006.
