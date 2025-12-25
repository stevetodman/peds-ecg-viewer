# Pediatric ECG Classification Model Specification

## Project Goal

Build a pediatric ECG classification model that outperforms Boston's published results on pediatric-relevant tasks.

## Success Criteria

| Metric | Target | Rationale |
|--------|--------|-----------|
| **AUROC (any abnormality)** | > 0.93 | Boston achieved ~0.93 on mixed-age population |
| **AUROC (myocarditis)** | > 0.85 | Hard task Boston didn't attempt |
| **AUROC (CHD detection)** | > 0.88 | Pediatric-specific structural disease |
| **External validation** | Tested | Boston only validated internally |
| **Interpretability** | Grad-CAM clinically sensible | Clinical adoption requirement |

## Dataset

**ZZU-pECG** (already downloaded):
- 14,190 ECG records from 11,643 patients
- Ages: 0-14 years (pediatric)
- Format: WFDB (500Hz, 9 or 12 leads)
- Labels: ICD-10 disease codes + AHA ECG findings
- Quality metrics: pSQI, basSQI, bSQI per lead

### Label Distribution (to verify in audit)
| Category | Expected Records | Notes |
|----------|------------------|-------|
| Normal (A1/A2) | ~2,000-3,000 | Baseline class |
| Myocarditis | ~500-1,000 | Target task |
| Cardiomyopathy | ~300-500 | Target task |
| CHD (Q21-Q25) | ~3,000-5,000 | Target task |
| Kawasaki | ~200-400 | Target task |

### Known Issues
1. **9-lead vs 12-lead split**: ~13% are 9-lead (V1, V3, V5 only)
2. **Label noise**: Hospitalized patients have dynamic states (recovery ECGs labeled as disease)
3. **Multi-label**: Many ECGs have multiple ICD-10 codes

---

## Architecture

### Hybrid Approach

```
┌─────────────────────────────────────────────────────────────────┐
│                        Input: Raw ECG                           │
│                     (12 leads × 5000 samples)                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
┌───────────────────────────┐   ┌───────────────────────────────┐
│   GEMUSE Rule-Based       │   │   Neural Feature Extractor    │
│   Interpretation Engine   │   │   (Foundation Model)          │
├───────────────────────────┤   ├───────────────────────────────┤
│ • HR, PR, QRS, QTc        │   │ • HuBERT-ECG or ResNet-1D     │
│ • Axis calculations       │   │ • Self-supervised pretrained  │
│ • Hypertrophy scores      │   │ • 256-dim embedding           │
│ • WPW/Brugada detection   │   │                               │
│ • Age-adjusted normals    │   │                               │
└───────────────────────────┘   └───────────────────────────────┘
                │                               │
                └───────────────┬───────────────┘
                                ▼
                ┌───────────────────────────────┐
                │       Fusion Layer            │
                │   (Rule features + Neural)    │
                │   Concatenate → MLP → Output  │
                └───────────────────────────────┘
                                │
                                ▼
                ┌───────────────────────────────┐
                │   Multi-label Classification  │
                │   • Normal vs Abnormal        │
                │   • Myocarditis              │
                │   • Cardiomyopathy           │
                │   • CHD subtypes             │
                │   • Kawasaki                 │
                └───────────────────────────────┘
```

### Why Hybrid?
1. **Rule-based provides floor**: Already validated on clinical literature
2. **Neural captures subtleties**: Patterns humans miss
3. **Interpretable**: Can explain "rules fired X, neural saw Y"
4. **Data efficient**: Rules don't need training data

---

## Training Strategy

### Phase 1: Data Audit (Day 1)
- Load AttributesDictionary.csv
- Compute class distributions
- Identify 9-lead vs 12-lead split by age
- Histogram of signal quality scores
- Flag potential label noise patterns

### Phase 2: Rule-Based Baseline (Day 2)
- Pipe ZZU ECGs through GEMUSE interpretation engine
- Compute AUROC per task using rule-based outputs
- Identify where rules fail (false negatives/positives)

### Phase 3: Foundation Model Fine-tuning (Days 3-5)
- Option A: HuBERT-ECG (if weights available)
- Option B: ResNet-1D pretrained on PTB-XL
- Option C: Train from scratch with self-supervised MAE

### Phase 4: Hybrid Fusion (Days 6-7)
- Extract rule-based features for all ECGs
- Extract neural embeddings
- Train fusion classifier
- Compare to neural-only and rule-only baselines

### Phase 5: Label Noise Review (Days 8-10)
- Run cleanlab on predictions
- Manually review 100-200 high-disagreement cases
- Retrain with cleaned labels

### Phase 6: External Validation (Days 11-12)
- Test on PTB-XL pediatric subset
- Test on Leipzig pediatric cases (if available)
- Report generalization metrics

---

## Data Splits

**Patient-level stratified split** (no patient appears in multiple splits):

| Split | Patients | ECGs (approx) | Purpose |
|-------|----------|---------------|---------|
| Train | 60% | ~8,500 | Model training |
| Val | 20% | ~2,850 | Hyperparameter tuning |
| Test | 20% | ~2,840 | Final evaluation (held out) |

### Stratification
- Stratify by primary disease category
- Ensure each age group represented proportionally
- Ensure 9-lead/12-lead ratio preserved

---

## Model Variants to Train

| Model | Description | Purpose |
|-------|-------------|---------|
| **Baseline-Rules** | GEMUSE interpretation only | Floor metric |
| **ResNet-1D** | Standard 1D CNN from scratch | Simple neural baseline |
| **Foundation-FT** | Fine-tuned HuBERT-ECG/ECG-FM | Transfer learning |
| **Hybrid** | Rules + Foundation fusion | Target model |
| **Ensemble** | Average of 3 Hybrid seeds | Final submission |

---

## Augmentations

| Augmentation | Parameters | Rationale |
|--------------|------------|-----------|
| Time shift | ±500 samples | R-wave position invariance |
| Amplitude scaling | 0.8-1.2x | Gain variation |
| Noise injection | SNR 20-40dB | Robustness to noise |
| Lead dropout | Random 1-2 leads | Handle missing leads |
| Heart rate scaling | 0.8-1.2x RR | Rate invariance |
| Baseline wander | 0.5Hz sine, ±0.2mV | Common artifact |

---

## Evaluation Metrics

### Primary
- **AUROC** per disease category
- **AUPRC** (for imbalanced classes)
- **Sensitivity @ 95% specificity** (clinical threshold)

### Secondary
- **Calibration** (Brier score, reliability diagram)
- **Subgroup analysis** (by age group, 9-lead vs 12-lead)
- **Interpretability** (Grad-CAM sanity checks)

---

## Testing Strategy

### Unit Tests
- Data loader returns correct shapes
- Augmentations preserve signal integrity
- Rule-based features match expected ranges
- Model forward pass works on dummy input

### Integration Tests
- Full pipeline: load ECG → preprocess → model → prediction
- Reproducibility: same seed → same results
- Checkpoint loading works correctly

### Validation Tests
- No patient leakage across splits
- Class distribution matches expected ratios
- External validation data loads correctly

---

## File Structure

```
ml/
├── spec.md                 # This file
├── requirements.txt        # Python dependencies
├── config/
│   └── train_config.yaml   # Hyperparameters
├── data/
│   ├── audit.py           # Data audit script
│   ├── dataset.py         # PyTorch Dataset class
│   ├── augmentations.py   # ECG augmentations
│   └── splits.py          # Train/val/test splits
├── models/
│   ├── resnet1d.py        # ResNet-1D architecture
│   ├── foundation.py      # Foundation model wrapper
│   ├── fusion.py          # Hybrid fusion model
│   └── rules_features.py  # GEMUSE rule feature extractor
├── training/
│   ├── train.py           # Main training script
│   ├── evaluate.py        # Evaluation script
│   └── callbacks.py       # Training callbacks
├── analysis/
│   ├── label_noise.py     # Cleanlab analysis
│   ├── gradcam.py         # Interpretability
│   └── error_analysis.py  # FP/FN review
└── notebooks/
    └── exploration.ipynb  # Interactive analysis
```

---

## Dependencies

```
torch>=2.0
pytorch-lightning>=2.0
wfdb>=4.0
neurokit2>=0.2
scikit-learn>=1.3
cleanlab>=2.5
pandas>=2.0
numpy>=1.24
matplotlib>=3.7
seaborn>=0.12
tqdm>=4.65
hydra-core>=1.3
wandb>=0.15
```

---

## Hardware

**Target**: Apple M4 Max with MPS
- Training time estimate: 4-8 hours per model variant
- Batch size: 32-64 (memory dependent)
- Mixed precision: float16 where supported

---

## Milestones

| Milestone | Deliverable | Your Time |
|-----------|-------------|-----------|
| M1 | Environment setup, data loads | 1-2 hrs |
| M2 | Data audit complete, distributions plotted | 2-3 hrs |
| M3 | Rule-based baseline AUROC computed | 1 hr |
| M4 | First neural model trained | 2-3 hrs |
| M5 | Hybrid model trained | 2 hrs |
| M6 | Label noise review complete | 4-6 hrs |
| M7 | External validation complete | 2-3 hrs |
| M8 | Final model, beats Boston | 1 hr |

**Total estimated active time: 15-22 hours**

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Label noise degrades model | Cleanlab + manual review |
| 9-lead ECGs hurt performance | Lead masking augmentation |
| Foundation model weights unavailable | Fall back to ResNet-1D |
| Not enough data for deep learning | Aggressive augmentation + self-supervised |
| MPS compatibility issues | Fall back to CPU or cloud GPU |

---

## Next Step

Run `python ml/data/audit.py` to generate data audit report.
