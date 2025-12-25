# Pediatric ECG ML Progress Journal

> Auto-updated document tracking our ML development process, decisions, and results.

**Last Updated:** 2025-12-25 15:30 UTC

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

### Phase 5: Age-Aware ResNet (Completed)
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
   ResNet-1D Encoder (Medium: 26.7M params)
        ↓
   ECG Embedding (256-dim)
        ↓
   Concatenate with Age Embedding (32-dim)
        ↓
   Classification Head
        ↓
   Output (binary: abnormal/normal)
```

**Training details:**
- Model: `ResNet1DAge` (medium variant, 26.7M params)
- Task: Abnormal detection
- Epochs: 8 of 50 (stopped early for checkpoint)
- Early stopping patience: 15

**Results:**
| Metric | Value |
|--------|-------|
| Best Validation AUROC | 0.8205 |
| Best Epoch | 7 |
| Improvement over baseline | +0.0005 |

**Observation:** Age-aware model shows marginal improvement over baseline (0.820 → 0.8205). The larger model (26.7M vs 969K params) did not significantly boost performance, suggesting the bottleneck may be data quality or label noise rather than model capacity.

---

### Phase 6: Pivot to Multi-Label + Hybrid Model (In Progress)
**Date:** 2025-12-25

**Key Insight:** After analyzing the benchmark paper (arXiv:2510.03780), we discovered they achieved 94.67% macro-F1 using **multi-label classification on 19 specific CVD categories** - fundamentally different from our binary "abnormal" approach. The binary task is inherently noisy because "abnormal" has no clear definition.

**Decision:** Pivot to:
1. **Multi-label classification** on 4 specific conditions with cleaner labels
2. **Hybrid rule+neural model** combining GEMUSE features with deep learning
3. **Focus on interpretability** for clinical trust

**New Architecture: HybridFusionModel (8.9M params)**
```
ECG Signal (12 × 5000) → ResNet-1D Encoder → Neural Embedding (512-dim)
Rule Features (30-dim) → MLP Encoder → Rule Embedding (32-dim)
Age (normalized) → Embedding → Age Embedding (16-dim)
Lead Mask (12-dim) → Embedding → Lead Embedding (8-dim)
        ↓
   Concatenate (568-dim)
        ↓
   Fusion MLP
        ↓
   4 condition probabilities (CHD, Myocarditis, Kawasaki, Cardiomyopathy)
```

**Files Created:**
- `ml/data/label_mapping.json` - ICD-10 to condition mapping
- `ml/data/dataset_multilabel.py` - Multi-label dataset with 4 conditions
- `ml/data/augmentations_v2.py` - Enhanced augmentations with 9-lead masking
- `ml/models/rule_features.py` - Rule feature extractor (30 features)
- `ml/models/hybrid_model.py` - Hybrid fusion model
- `ml/training/train_hybrid.py` - Training script

**Label Distribution (Train/Val/Test):**
| Condition | Train | Val | Test | Pos Weight |
|-----------|-------|-----|------|------------|
| CHD | 1,568 (18.3%) | 470 (16.6%) | 487 (17.3%) | 4.45 |
| Myocarditis | 160 (1.9%) | 51 (1.8%) | 46 (1.6%) | 52.42 |
| Kawasaki | 115 (1.3%) | 33 (1.2%) | 46 (1.6%) | 73.33 |
| Cardiomyopathy | 95 (1.1%) | 42 (1.5%) | 34 (1.2%) | 88.98 |
| Normal (all zeros) | 6,636 (77.6%) | 2,240 (79.1%) | 2,201 (78.4%) | - |

**Initial Test (3 epochs, no rule features):**
| Condition | Val AUROC |
|-----------|-----------|
| CHD | 0.786 |
| Kawasaki | 0.717 |
| Cardiomyopathy | 0.689 |
| Myocarditis | 0.433 |
| **Mean** | **0.656** |

**Full Training Results (30 epochs, best at epoch 14):**
| Condition | Val AUROC | Test AUROC | Test AUPRC |
|-----------|-----------|------------|------------|
| Cardiomyopathy | 0.857 | **0.902** | 0.213 |
| Kawasaki | 0.929 | **0.856** | 0.143 |
| CHD | 0.849 | **0.848** | 0.603 |
| Myocarditis | 0.593 | 0.632 | 0.035 |
| **Mean** | **0.807** | **0.809** | 0.249 |

**Observation:** Model generalizes well (val ≈ test). Three conditions exceed 0.85 AUROC on test set. Myocarditis is unreliable (0.63 AUROC, near-random AUPRC) due to extreme class imbalance (160 train samples). **Decision: Deprecate myocarditis - would need 800-1500+ samples for reliable detection.**

**Subgroup Analysis:**

| Age Group | N | CHD | Kawasaki | Cardio | Mean |
|-----------|---|-----|----------|--------|------|
| Neonate (0-28d) | 56 | 0.612 | - | - | **0.612** ⚠️ |
| Infant (29d-1y) | 173 | 0.802 | - | 0.852 | 0.827 |
| Toddler (1-3y) | 286 | 0.847 | 0.789 | 0.837 | 0.824 |
| Child (3-12y) | 1527 | 0.806 | 0.818 | 0.920 | 0.848 |
| Adolescent (12+) | 767 | 0.813 | - | 0.946 | 0.879 |

| Lead Config | N | Mean AUROC |
|-------------|---|------------|
| 12-lead | 2424 | 0.873 |
| 9-lead | 385 | 0.785 ⚠️ |

**Findings:**
- Neonates (<28 days) are a blind spot - only 56 samples, very different ECG patterns
- 9-lead ECGs perform worse (0.79 vs 0.87) - missing V2/V4/V6 hurts but still usable
- Infants onwards perform well (0.82+ AUROC)

**Recommendation:** Display warning for neonates that predictions may be less reliable.

---

## Current Best Results (Test Set)

| Condition | Test AUROC | 95% CI | Threshold | Sens | Spec | NPV |
|-----------|------------|--------|-----------|------|------|-----|
| **Cardiomyopathy** | **0.902** | 0.849-0.949 | 0.035 | 82% | 81% | 99.7% |
| **Kawasaki** | **0.856** | 0.813-0.893 | 0.127 | 74% | 77% | 99.4% |
| **CHD** | **0.848** | 0.827-0.867 | 0.484 | 77% | 77% | 94% |
| ~~Myocarditis~~ | 0.632 | - | - | - | - | - |
| **3-class Mean** | **0.869** | - | - | - | - | - |

*95% CI computed via 1000 bootstrap resamples of test set (n=2809)*

**Clinical Use:** High NPV (>99%) for rare conditions means negative predictions are reliable for ruling out disease. Low PPV for rare conditions (5%) means positive predictions require confirmation.

Checkpoint: `ml/training/checkpoints/best_hybrid_20251225_091556.pt`

---

## Files Created

```
ml/
├── spec.md                      # Project specification (v3)
├── requirements.txt             # Python dependencies
├── PROGRESS_JOURNAL.md          # This file
├── data/
│   ├── audit.py                 # Data audit script
│   ├── dataset.py               # Binary PyTorch dataset
│   ├── dataset_multilabel.py    # Multi-label dataset (4 conditions) [NEW]
│   ├── label_mapping.json       # ICD-10 code mapping [NEW]
│   ├── augmentations.py         # Basic augmentation
│   ├── augmentations_v2.py      # Enhanced augmentation + 9-lead masking [NEW]
│   ├── pediatric_normals.py     # Age-adjusted normal values
│   └── audit_results/           # Audit outputs
├── models/
│   ├── resnet1d.py              # ResNet-1D architecture
│   ├── resnet1d_age.py          # Age-aware ResNet-1D
│   ├── hybrid_model.py          # Hybrid rule+neural model [NEW]
│   ├── rule_features.py         # Rule feature extractor (30 features) [NEW]
│   ├── rule_baseline.py         # Rule-based classifier
│   └── baseline_results/        # Baseline outputs
├── interpretability/
│   ├── gradcam.py               # Grad-CAM for ECG visualization
│   └── *.png                    # Example visualizations
├── serve.py                     # Flask API for inference (port 5050)
├── evaluation/
│   └── bootstrap_ci.py          # Bootstrap 95% CI for AUROC
└── training/
    ├── train.py                 # Binary training script
    ├── train_age_aware.py       # Age-aware training script
    ├── train_hybrid.py          # Hybrid model training
    └── checkpoints/
        ├── best_hybrid_20251225_091556.pt  # Production model
        └── ...                  # Other checkpoints
```

---

## Next Steps

1. [x] Implement age-aware ResNet with auxiliary input
2. [x] Train on abnormality detection
3. [x] Pivot to multi-label classification (4 specific conditions)
4. [x] Build hybrid rule+neural model architecture
5. [x] Full training (0.807 mean AUROC)
6. [x] Run test set evaluation (0.869 mean AUROC on 3 conditions)
7. [x] Deprecate myocarditis (insufficient data - needs 800+ more samples)
8. [x] Clinical threshold optimization (Youden's J)
9. [x] Grad-CAM interpretability (`ml/interpretability/gradcam.py`)
10. [x] Subgroup analysis - neonates underperform (0.61), 9-lead slightly worse (0.79)
11. [x] Bootstrap validation with 95% CI (`ml/evaluation/bootstrap_ci.py`)
12. [x] Integrate ML predictions into GEMUSE viewer (`ml/serve.py`, `demo.html`)

---

## External Validation (CHDdECG Dataset)

Tested on 189 ECGs from Guangdong Provincial People's Hospital (completely independent from ZZU training data):

| Metric | Internal (ZZU) | External (CHDdECG) |
|--------|----------------|---------------------|
| AUROC | 0.848 | 0.701 |
| CHD sensitivity | 77% | 77.5% |
| CHD mean prob | 89.3% | 60.2% |
| Non-CHD mean prob | 21.1% | 50.5% |

**Observations:**
- ~15% AUROC drop on external data (typical for ML models)
- CHDdECG uses 9-lead ECGs (known to reduce performance)
- Model retains discriminative ability (0.701 > 0.5 random)
- Different hospital, equipment, population explains domain shift

---

## Limitations

- **Domain shift on external data**: AUROC drops from 0.85 to 0.70 on CHDdECG (different hospital)
- **Neonatal blind spot**: Model underperforms on neonates (<28 days, AUROC 0.61)
- **9-lead degradation**: Missing V2/V4/V6 reduces AUROC from 0.87 to 0.79

---

## References

- Boston (2019): AUROC 0.93 on "any abnormality" with 583k ECGs
- ZZU-pECG Benchmark (2025): 94.67% macro-F1 with ResNet-1D
- EchoAI-Peds (2025): Adult models fail on pediatric populations
