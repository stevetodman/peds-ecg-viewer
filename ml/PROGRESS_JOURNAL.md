# Pediatric ECG ML Progress Journal

> Auto-updated document tracking our ML development process, decisions, and results.

**Last Updated:** 2025-12-24 19:30 UTC

---

## Project Goal

Build a pediatric ECG classification model that achieves >0.88 AUROC on abnormality detection, potentially matching or exceeding Boston's published results (0.93 AUROC) through pediatric-specific optimizations.

---

## Timeline & Decisions

### Phase 1: Data Audit (Completed)
**Date:** 2025-12-24

**What we did:**
- Audited ZZU-pECG dataset (14,190 ECGs from 11,643 pediatric patients)
- Analyzed class distributions, age groups, lead configurations

**Key findings:**
| Finding | Value | Impact |
|---------|-------|--------|
| Target diseases (myocarditis, cardiomyopathy, Kawasaki) | ~3% of data | Need class weighting |
| CHD (VSD+ASD+others) | ~18% | Best training target |
| 9-lead ECGs | 13% overall, 94% in neonates | Lead masking needed |
| Multi-label cases | 65% | Multi-label classification head |
| Good signal quality (bSQI) | 96.5% | Minimal filtering needed |

**Decision:** Focus on CHD detection first (most samples), then abnormality detection.

---

### Phase 2: Rule-Based Baseline (Completed)
**Date:** 2025-12-24

**What we did:**
- Ported GEMUSE pediatric normal values to Python
- Extracted ECG measurements using neurokit2
- Applied age-adjusted rule-based classification

**Results:**
| Task | AUROC | Sensitivity | Specificity |
|------|-------|-------------|-------------|
| Tachycardia | 0.725 | 47.4% | 97.9% |
| Any Abnormality | 0.497 | 88.6% | 17.4% |
| Bradycardia | - | 24.2% | 98.4% |
| Hypertrophy | - | 15.6% | 98.3% |

**Decision:** Rules alone can't compete. Need neural networks. Tachycardia (0.725) is our floor to beat.

---

### Phase 3: Simple ResNet-1D (Completed)
**Date:** 2025-12-24

**What we did:**
- Built ResNet-1D architecture (969K params)
- Trained on CHD detection, then abnormality detection
- Added data augmentation (time shift, amplitude scaling, noise)

**Results:**
| Model | Task | Test AUROC | Test AUPRC |
|-------|------|------------|------------|
| ResNet-1D | CHD | 0.855 | 0.626 |
| ResNet-1D | Abnormal | 0.820 | 0.956 |
| ResNet-1D + Aug | CHD | 0.855 | 0.626 |

**Observation:** Augmentation gave marginal improvement. Model overfits (train loss 0.02, val loss 2.7).

**Gap to Boston:** 0.82 vs 0.93 = 0.11 AUROC gap

---

### Phase 4: Foundation Model Consideration (Pivoted)
**Date:** 2025-12-24

**What we considered:**
- HuBERT-ECG (pretrained on 9.1M adult ECGs)
- ECG-FM (pretrained on 1.5M adult ECGs)
- ECGFounder (pretrained on 10M adult ECGs)

**Why we pivoted:**
1. **Adult models fail on pediatric data** - EchoAI-Peds study (2025) showed adult models "performed poorly on pediatric datasets"
2. **No pediatric foundation model exists** - All available models trained on adult populations
3. **Published benchmark exists** - A 2025 paper achieved 94.67% macro-F1 on ZZU-pECG with ResNet-1D

**Decision:** Skip foundation models. Focus on pediatric-specific optimizations:
1. Add age as auxiliary input (critical for pediatric ECG interpretation)
2. Use larger ResNet architecture
3. Better regularization to reduce overfitting

---

### Phase 5: Age-Aware ResNet (In Progress)
**Date:** 2025-12-24

**Hypothesis:** Age is the most important auxiliary feature for pediatric ECG interpretation because:
- Normal heart rate varies 90-180 bpm (neonates) to 60-100 bpm (adolescents)
- Normal QRS axis varies +60 to +190° (neonates) to -30 to +90° (adults)
- R-wave dominance shifts from right (neonates) to left (children)
- T-wave inversion in V1-V3 is normal until age ~8

**Architecture:**
```
ECG Signal (12 leads × 5000 samples)
        ↓
   ResNet-1D Encoder
        ↓
   ECG Embedding (256-dim)
        ↓
   Concatenate with Age Embedding (32-dim)
        ↓
   Classification Head
        ↓
   Output (binary: abnormal/normal)
```

**Expected improvement:** +0.03 to +0.06 AUROC

---

## Current Best Results

| Metric | Value | Target |
|--------|-------|--------|
| Abnormality AUROC | 0.820 | 0.880+ |
| CHD AUROC | 0.855 | - |
| Gap to Boston | -0.11 | Close gap |

---

## Files Created

```
ml/
├── spec.md                      # Project specification
├── requirements.txt             # Python dependencies
├── PROGRESS_JOURNAL.md          # This file
├── data/
│   ├── audit.py                 # Data audit script
│   ├── dataset.py               # PyTorch dataset
│   ├── augmentations.py         # Data augmentation
│   ├── pediatric_normals.py     # Age-adjusted normal values
│   └── audit_results/           # Audit outputs
├── models/
│   ├── resnet1d.py              # ResNet-1D architecture
│   ├── rule_baseline.py         # Rule-based classifier
│   └── baseline_results/        # Baseline outputs
└── training/
    ├── train.py                 # Training script
    └── checkpoints/             # Model checkpoints
```

---

## Next Steps

1. [ ] Implement age-aware ResNet with auxiliary input
2. [ ] Train on abnormality detection
3. [ ] If AUROC < 0.88, try larger model
4. [ ] If AUROC >= 0.88, add interpretability (Grad-CAM)

---

## References

- Boston (2019): AUROC 0.93 on "any abnormality" with 583k ECGs
- ZZU-pECG Benchmark (2025): 94.67% macro-F1 with ResNet-1D
- EchoAI-Peds (2025): Adult models fail on pediatric populations
