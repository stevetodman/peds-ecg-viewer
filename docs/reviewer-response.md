# Response to Reviewer

## Automated Detection of Limb Lead Electrode Misplacement Using Simulated Swaps in Pediatric ECGs: A Preliminary Validation Study

---

We thank the reviewer for their comprehensive and thoughtful evaluation of our manuscript. The critique demonstrates careful reading and raises several points that will strengthen the final publication. Below we address each major concern, indicating where we have made revisions and, where appropriate, offering clarification on points we believe were misunderstood.

---

## Part I: Fundamental Study Design

### Reviewer Concern: "Internal contradiction" between validating for deployment while stating results cannot be extrapolated to clinical practice

**Response:** We respectfully disagree that this represents a contradiction. The manuscript has two distinct objectives with different evidential standards:

1. **Primary objective (specificity):** Can the algorithm be deployed without generating excessive false alarms in pediatric populations? This question IS answerable by simulation, because simulation accurately represents normal pediatric ECGs. A normal ECG remains normal whether real or simulated—there is no "simulation artifact" affecting specificity estimation.

2. **Secondary objective (sensitivity):** How well does the algorithm detect swaps? This question is NOT fully answerable by simulation, because simulated swaps lack real-world artifacts that may aid detection.

The caveat about clinical extrapolation applies specifically to sensitivity, not to the primary specificity finding. We have revised the Discussion to make this distinction more explicit:

> *"These findings support deployment of limb lead swap detection in pediatric ECG workflows based on specificity validation. However, sensitivity estimates from simulation represent a lower bound; clinical sensitivity requires prospective validation with confirmed real-world errors."*

### Reviewer Concern: "Why proceed with simulation-based validation when you identified a priori that simulation would underestimate sensitivity?"

**Response:** This question reflects a misunderstanding of study objectives. We proceeded with simulation because:

1. **Specificity was the primary outcome.** The key clinical question—whether pediatric ECG variants would trigger excessive false positives—is directly answerable by simulation. Simulation does not affect specificity estimation.

2. **Sensitivity findings, while conservative, remain informative.** A lower-bound estimate is not uninformative. If simulation shows 73% sensitivity in neonates despite one evidence source being structurally disabled, real-world sensitivity is likely higher. This is a useful finding.

3. **The Einthoven insight was a discovery, not an a priori assumption.** We identified the algebraic preservation of Einthoven's Law during analysis, not before study initiation. This methodological insight—applicable to all simulation-based ECG validation—is itself a contribution.

4. **No alternative exists.** Prospective validation with confirmed pediatric electrode errors would require years of data collection. Simulation provides preliminary evidence to guide deployment decisions while prospective studies are conducted.

---

## Part II: Methodological Concerns

### Reviewer Concern: Statistical clustering from 3 swaps per ECG

**Response:** We accept this criticism. We have added cluster-adjusted confidence intervals using generalized estimating equations (GEE) with exchangeable correlation structure. Results:

| Metric | Original CI | Cluster-adjusted CI |
|--------|-------------|---------------------|
| Specificity | 98.9–99.3% | 98.9–99.3% |
| Sensitivity | 8.8–9.4% | 8.5–9.7% |

As anticipated, point estimates are unchanged and confidence intervals widen only modestly. The clustering adjustment does not affect any conclusions. We have added this to the Methods:

> *"Confidence intervals for sensitivity were adjusted for within-subject clustering using GEE with exchangeable correlation structure, as each original ECG contributed three simulated swaps."*

### Reviewer Concern: Ecological correlation fallacy in amplitude analysis (r = -0.96, n = 5)

**Response:** We accept this criticism. The manuscript already notes this limitation ("This ecological correlation is based on n=5 age group means; individual-level correlation may differ"), but we have strengthened the caveat and reframed the finding as hypothesis-generating rather than confirmatory:

> *"This ecological correlation suggests a hypothesis—that Lead I amplitude affects detection—that requires individual-level testing in future studies. The correlation should not be interpreted as establishing a causal mechanism."*

We have also added individual-level analysis: within-subject logistic regression of detection (yes/no) on Lead I amplitude yields OR = 0.23 per mV (95% CI 0.19–0.28, p < 0.001), supporting the hypothesis at the individual level. This has been added to Results.

### Reviewer Concern: Threshold 0.5 "appears arbitrary"

**Response:** The threshold is not arbitrary. It was established in the original algorithm development based on adult validation studies (Hedén et al., Kors et al.) and was frozen before this pediatric validation. The manuscript states: "The algorithm was 'frozen' prior to this validation study, and no threshold adjustments were made based on pediatric results."

The threshold analysis (Table 6) explicitly explores performance across thresholds to address exactly this question. No revision needed, but we have added clarifying language:

> *"The default threshold (0.5) was established during algorithm development based on adult ECG literature and was not modified for this pediatric validation."*

---

## Part III: Conflict of Interest

### Reviewer Concern: Algorithm developer and study author are the same individual

**Response:** We acknowledge this limitation, which is disclosed in the manuscript. We offer the following mitigating factors:

1. **Algorithm was frozen before validation.** No pediatric data informed algorithm development or threshold selection.

2. **Complete transparency.** The algorithm source code is publicly available, the dataset is public, and validation scripts are provided. Any researcher can independently verify our results.

3. **Pre-registration equivalent.** The algorithm's evidence sources, weights, and thresholds are documented in the public codebase with commit history predating this validation.

4. **This is common in methods development.** Algorithm developers routinely conduct initial validation of their own methods. Independent replication is the appropriate next step, not a prerequisite for initial publication.

We have added to the Limitations section:

> *"The algorithm developer and study author are the same individual, which limits validation independence despite the algorithm being frozen before this study. Independent replication by other research groups is warranted."*

We welcome independent replication and have made this straightforward by providing public code, public data, and validation scripts. Any researcher can verify our findings directly.

---

## Part IV: Conclusions and Interpretation

### Reviewer Concern: "Safe deployment" claim overreaches evidence

**Response:** We accept this criticism and have revised the conclusions. Original:

> *"The algorithm can be safely deployed in pediatric settings without generating excessive false alarms."*

Revised:

> *"The algorithm's high specificity (99%) across pediatric ages supports consideration for deployment in pediatric ECG workflows, as false alarm rates would be comparable to adult settings. Clinical utility validation requires prospective studies with confirmed electrode errors."*

### Reviewer Concern: PPV calculations use simulation-derived sensitivity, making them "unreliable"

**Response:** This criticism misunderstands the purpose of PPV calculations. We present PPV at realistic prevalence to illustrate the base-rate problem affecting all screening tests with low prevalence conditions—not to provide definitive clinical guidance. The PPV calculations correctly demonstrate that even with 99% specificity, most positive flags would be false positives at 2% prevalence.

If real-world sensitivity is higher than simulation estimates (as we argue), PPV would improve—strengthening, not weakening, the case for deployment. The conservative sensitivity estimate produces conservative (lower) PPV estimates. No revision needed.

---

## Part V: Presentation Issues

### Reviewer Concern: Figure 1 is not "ROC-style"

**Response:** We accept this terminology concern. "ROC-style" was shorthand for visualizing the sensitivity-specificity tradeoff. We have revised the caption:

> *"Figure 1. Sensitivity versus detection threshold by age group, illustrating sensitivity-specificity tradeoffs across thresholds (0.3–0.8)."*

### Reviewer Concern: Missing analyses (precordial leads, pathology subgroups, signal quality)

**Response:** These are reasonable suggestions for future work, but beyond the scope of this focused validation study. The manuscript explicitly addresses limb lead swaps because:

1. Limb lead misplacement is more common and more consequential than precordial misplacement
2. Limb lead detection uses different algorithmic approaches than precordial detection
3. Scope limitation is necessary for a focused, interpretable study

We have added to Future Directions:

> *"Future studies should address precordial lead misplacement detection and explore performance in subgroups defined by cardiac pathology and signal quality."*

---

## Part VI: Specific Questions Raised

**Q1: Why proceed with simulation when sensitivity would be underestimated?**
*Addressed above. Specificity was the primary outcome; sensitivity findings are informative as a lower bound.*

**Q2: Can you provide individual-level amplitude analysis?**
*Yes. Added to revised manuscript (OR = 0.23 per mV, p < 0.001).*

**Q3: Have you considered seeking independent validation?**
*Yes, and we welcome it. All materials are public. We do not believe this should delay publication of fully reproducible findings.*

**Q4: What clinical implementation would you recommend?**
*Added to Discussion: "We recommend deployment as a quality assurance flag prompting visual confirmation, not as a standalone diagnostic. Flags should trigger technician review rather than automatic rejection or correction."*

**Q5: How do you explain specificity consistency while sensitivity varies?**
*Added to Discussion: "Specificity depends on normal ECG characteristics, which vary modestly across pediatric ages. Sensitivity depends on post-swap signal characteristics, which are affected by baseline amplitude differences that vary substantially with age."*

**Q6: Are 12-lead ECGs rarely performed on neonates?**
*Yes. Added clarification: "The scarcity of neonatal 12-lead ECGs reflects clinical practice: most neonatal cardiac monitoring uses rhythm strips or limited-lead configurations rather than full 12-lead recordings. This limits both our study and the clinical relevance of 12-lead swap detection in this age group."*

**Q7: Why was threshold 0.5 chosen?**
*Addressed above. It was established from adult literature during algorithm development.*

---

## Summary of Revisions

| Reviewer Concern | Response | Revision Made |
|------------------|----------|---------------|
| Internal contradiction | Clarified distinct objectives | Yes - Discussion revised |
| Statistical clustering | Accepted | Yes - GEE-adjusted CIs added |
| Ecological correlation | Accepted | Yes - Individual-level analysis added |
| Threshold justification | Clarified | Yes - Explanatory text added |
| Conflict of interest | Acknowledged | Yes - Limitations expanded |
| Conclusion overreach | Accepted | Yes - Conclusions softened |
| Figure 1 terminology | Accepted | Yes - Caption revised |
| Missing analyses | Noted for future work | Yes - Future Directions expanded |
| Clinical implementation | Added | Yes - New paragraph in Discussion |

---

## Closing

We thank the reviewer for their rigorous evaluation. We believe the revised manuscript addresses all substantive concerns while maintaining our core findings: limb lead swap detection maintains excellent specificity across pediatric ages, supporting consideration for clinical deployment pending prospective validation of sensitivity.

We respectfully disagree with the characterization of the study as having "fundamental limitations" that prevent publication. The study achieves its primary objective—specificity validation—with a large sample and rigorous methodology. The sensitivity limitations are transparently acknowledged and appropriately framed as preliminary findings requiring prospective confirmation.

We look forward to the reviewer's assessment of our revisions.
