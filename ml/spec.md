# GEMUSE Pediatric ECG ML Specification v3

## Executive Summary

Build a **clinical-grade hybrid pediatric ECG analysis system** that:
- Detects specific conditions (CHD, myocarditis, Kawasaki, cardiomyopathy)
- Explains its reasoning (rules + neural attention)
- Knows when it's uncertain
- Works across age groups (neonates → adolescents)
- Handles real-world edge cases (9-lead, noisy signals)
- Is validated for clinical deployment

---

## Current State (as of 2024-12-24)

### What Exists

| Component | Status | Performance |
|-----------|--------|-------------|
| Data pipeline | ✅ Complete | 14,190 ECGs loaded |
| Data audit | ✅ Complete | Class distributions known |
| Rule-based baseline | ✅ Complete | 0.72 AUROC (tachycardia) |
| ResNet-1D (binary abnormal) | ✅ Complete | 0.82 AUROC |
| ResNet-1D (CHD detection) | ✅ Complete | 0.855 AUROC |
| Age-aware ResNet | ✅ Complete | 0.8205 AUROC |
| Multi-label classification | ❌ Not started | — |
| Hybrid fusion | ❌ Not started | — |
| Calibration | ❌ Not started | — |
| Uncertainty quantification | ❌ Not started | — |
| 9-lead handling | ❌ Not started | — |
| Signal quality gating | ❌ Not started | — |
| Age subgroup validation | ❌ Not started | — |
| External validation | ❌ Not started | — |
| Regulatory planning | ❌ Not started | — |

### Key Learnings

1. **Model capacity isn't the bottleneck**: 26.7M params vs 969K gave +0.0005
2. **Binary "abnormal" is noisy**: Specific conditions have cleaner labels
3. **Benchmark insight**: Multi-label on specific diseases achieves 94% F1
4. **Hybrid is the path**: Rules + ML > either alone
5. **13% of data is 9-lead**: 94% of neonates affected—critical gap

---

## Target Product

### Clinical User Experience

```
┌─────────────────────────────────────────────────────────────────┐
│  GEMUSE Pediatric ECG Analysis                    v2.1.0        │
├─────────────────────────────────────────────────────────────────┤
│  Patient: 3-year-old male                                       │
│  Signal Quality: GOOD (bSQI: 0.94)                              │
│  Lead Configuration: 12-lead ✓                                  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ RULE-BASED FINDINGS                                         ││
│  │ • Heart rate: 142 bpm (normal for age)                      ││
│  │ • PR interval: 124 ms (normal)                              ││
│  │ • QRS duration: 68 ms (normal)                              ││
│  │ • QTc: 448 ms (borderline prolonged) ⚠️                     ││
│  │ • Axis: +85° (normal)                                       ││
│  │ • RVH criteria: Not met                                     ││
│  │ • LVH criteria: Not met                                     ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ML DISEASE SCREENING                     Confidence: HIGH   ││
│  │                                                             ││
│  │ Kawasaki disease     ████████████████░░░░  67% ⚠️ ELEVATED  ││
│  │ Myocarditis          ███░░░░░░░░░░░░░░░░░  12%   Low        ││
│  │ CHD (any)            ██░░░░░░░░░░░░░░░░░░   8%   Low        ││
│  │ Cardiomyopathy       █░░░░░░░░░░░░░░░░░░░   4%   Low        ││
│  │                                                             ││
│  │ Model uncertainty: LOW (predictions reliable)               ││
│  │ Rule-ML agreement: HIGH (both flag Kawasaki features)       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ATTENTION MAP                                               ││
│  │ [Visual: ECG with highlighted regions]                      ││
│  │ Primary focus: T-wave morphology in V4-V6                   ││
│  │ Secondary: PR interval in II                                ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ CLINICAL DECISION SUPPORT                                   ││
│  │                                                             ││
│  │ ⚠️  RECOMMENDATION: Consider Kawasaki disease workup        ││
│  │     • Elevated Kawasaki probability (67%)                   ││
│  │     • Borderline QTc warrants monitoring                    ││
│  │                                                             ││
│  │ SUGGESTED ACTIONS:                                          ││
│  │ □ Check inflammatory markers (ESR, CRP)                     ││
│  │ □ Evaluate for clinical Kawasaki criteria                   ││
│  │ □ Consider echocardiogram if clinical suspicion             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ LIMITATIONS                                                 ││
│  │ • This tool does NOT detect: arrhythmias, long QT, WPW     ││
│  │ • Validated for ages 0-14 years only                        ││
│  │ • Always correlate with clinical presentation               ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Edge Case Displays

**Low Signal Quality:**
```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️  SIGNAL QUALITY WARNING                                     │
│                                                                 │
│  Signal Quality: POOR (bSQI: 0.42)                              │
│  Affected leads: III, aVF (baseline wander)                     │
│                                                                 │
│  ML predictions may be unreliable.                              │
│  Rule-based findings shown only.                                │
│  Consider repeat ECG with better electrode contact.             │
└─────────────────────────────────────────────────────────────────┘
```

**9-Lead ECG (Neonate):**
```
┌─────────────────────────────────────────────────────────────────┐
│  ℹ️  LIMITED LEAD CONFIGURATION                                 │
│                                                                 │
│  Lead Configuration: 9-lead (V1, V3, V5 only)                   │
│  Patient: 5-day-old neonate                                     │
│                                                                 │
│  ML predictions available with REDUCED confidence.              │
│  Some conditions may be harder to detect.                       │
│  Consider 12-lead ECG if clinical concern persists.             │
└─────────────────────────────────────────────────────────────────┘
```

**High Uncertainty:**
```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️  HIGH MODEL UNCERTAINTY                                     │
│                                                                 │
│  Model uncertainty: HIGH                                        │
│  Reason: Unusual ECG morphology not well-represented in         │
│          training data.                                         │
│                                                                 │
│  RECOMMENDATION: Human expert review required.                  │
│  ML predictions shown but should not guide clinical decisions.  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Success Criteria

### Technical Metrics

| Metric | Target | Minimum | Rationale |
|--------|--------|---------|-----------|
| CHD AUROC | > 0.88 | > 0.82 | Primary use case |
| Myocarditis AUROC | > 0.80 | > 0.75 | High stakes, hard task |
| Kawasaki AUROC | > 0.80 | > 0.75 | Early detection critical |
| Cardiomyopathy AUROC | > 0.75 | > 0.70 | Rare condition |
| Hybrid > Neural-only | +0.03 AUROC | +0.01 | Proves fusion value |
| Calibration error (ECE) | < 0.05 | < 0.10 | Probabilities meaningful |
| 9-lead performance | > 0.90 × 12-lead | > 0.85× | Neonate coverage |

### Clinical Metrics

| Metric | Target | Rationale |
|--------|--------|-----------|
| Sensitivity @ 95% specificity | > 60% | Clinical operating point |
| Myocarditis sensitivity | > 90% | Miss = potential death |
| Kawasaki sensitivity | > 85% | Miss = coronary damage |
| False positive rate | < 20% | Avoid alert fatigue |
| Out-of-distribution detection | > 80% | Know when uncertain |

### Subgroup Requirements

| Age Group | Minimum AUROC | Notes |
|-----------|---------------|-------|
| Neonates (0-28d) | > 0.75 | 9-lead dominant, highest risk |
| Infants (1-12m) | > 0.80 | Rapid HR, small voltages |
| Toddlers (1-3y) | > 0.82 | Transition period |
| Children (3-12y) | > 0.85 | Most stable group |
| Adolescents (12-14y) | > 0.85 | Approaching adult norms |

---

## Architecture

### Hybrid Fusion Model with Uncertainty

```
┌─────────────────────────────────────────────────────────────────┐
│                         INPUTS                                  │
├─────────────────────────────────────────────────────────────────┤
│  Raw ECG: 12 leads × 5000 samples (or 9-lead with mask)         │
│  Age: continuous (days) → embedded                              │
│  Signal Quality: bSQI per lead                                  │
│  Lead Config: 9-lead vs 12-lead flag                            │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Signal Quality  │  │  GEMUSE Rules   │  │ Neural Encoder  │
│ Gate            │  │                 │  │                 │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ If bSQI < 0.5:  │  │ Features:       │  │ ResNet-1D:      │
│ → Flag warning  │  │ • Intervals     │  │ • 4 stages      │
│ → Reduce conf   │  │ • Axis          │  │ • 64→128→256→512│
│                 │  │ • Morphology    │  │ • Kernel=7      │
│ Lead masking:   │  │ • Age z-scores  │  │                 │
│ If 9-lead:      │  │                 │  │ Lead masking:   │
│ → Mask V2,V4,V6 │  │ Output: 30-dim  │  │ → Zero V2,V4,V6 │
│ → Set flag      │  │                 │  │ → Config embed  │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                 ┌─────────────────────────┐
                 │     Fusion Layer        │
                 ├─────────────────────────┤
                 │ Concatenate:            │
                 │ • Rule features (30)    │
                 │ • Neural embed (512)    │
                 │ • Age embed (32)        │
                 │ • Quality score (1)     │
                 │ • Lead config (1)       │
                 │ = 576-dim               │
                 │                         │
                 │ MLP: 576→256→128        │
                 │ MC Dropout: 0.3         │
                 └─────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
     │ Disease     │  │ Uncertainty │  │ OOD         │
     │ Predictions │  │ Estimation  │  │ Detection   │
     ├─────────────┤  ├─────────────┤  ├─────────────┤
     │ Sigmoid:    │  │ MC Dropout: │  │ Mahalanobis │
     │ • CHD       │  │ N=10 passes │  │ distance on │
     │ • Myocard.  │  │ → Variance  │  │ embeddings  │
     │ • Kawasaki  │  │ → Entropy   │  │             │
     │ • Cardmyop. │  │             │  │ If OOD:     │
     │             │  │ High var →  │  │ → Flag      │
     │ Calibrated  │  │ uncertain   │  │ → Reduce    │
     │ via temp    │  │             │  │   confidence│
     │ scaling     │  │             │  │             │
     └─────────────┘  └─────────────┘  └─────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Uncertainty method | MC Dropout (N=10) | Simple, well-understood, minimal overhead |
| OOD detection | Mahalanobis distance | Works on embeddings, no retraining needed |
| Calibration | Temperature scaling | Post-hoc, doesn't affect accuracy |
| 9-lead handling | Zero-masking + flag | Train on both, model learns to adapt |
| Signal quality | Soft gating | Reduce confidence, don't refuse |
| Age embedding | Sinusoidal + linear | Captures periodicity in development |

---

## Implementation Phases

### Overview

| Phase | Focus | Effort | Risk |
|-------|-------|--------|------|
| 1 | Multi-Label Dataset | 3-4 hr | Low |
| 2 | 9-Lead & Quality Handling | 2-3 hr | Medium |
| 3 | Rule Feature Extractor | 2-3 hr | Low |
| 4 | Hybrid Fusion Model | 4-5 hr | Medium |
| 5 | Calibration & Uncertainty | 3-4 hr | Medium |
| 6 | Interpretability | 2-3 hr | Low |
| 7 | Subgroup & Failure Analysis | 3-4 hr | High |
| 8 | Label Noise Review | 3-4 hr | Medium |
| 9 | Threshold Selection | 2-3 hr | Medium |
| 10 | External Validation | 4-6 hr | High |
| 11 | Clinical Workflow Design | 2-3 hr | Low |
| 12 | Regulatory Planning | 2-3 hr | Medium |
| 13 | Product Integration | 4-5 hr | Medium |
| **Total** | | **36-50 hr** | |

---

### Phase 1: Multi-Label Dataset (3-4 hours)

**Goal**: Create clean multi-label training targets for 4 conditions

#### Tasks

| Task | Who | Time | Details |
|------|-----|------|---------|
| Map ICD-10 codes to conditions | Claude | 45 min | See mapping table below |
| Handle multi-label overlap | Claude | 30 min | Co-occurrence matrix |
| Update dataset.py | Claude | 45 min | Multi-hot encoding |
| Verify label distributions | Claude | 30 min | Per condition counts |
| Review edge cases | You | 1-2 hr | Multi-label conflicts |
| Approve final mapping | You | 15 min | Sign-off |

#### ICD-10 Mapping

| Condition | ICD-10 Codes | Expected Count |
|-----------|--------------|----------------|
| CHD (any) | Q20-Q26 (VSD, ASD, ToF, PDA, PS, etc.) | ~2,500 |
| Myocarditis | I40.x, I41.x, I51.4 | ~400 |
| Kawasaki | M30.3 | ~200 |
| Cardiomyopathy | I42.x (DCM, HCM, RCM) | ~300 |

#### Decisions Needed (You)

1. **Multi-label handling**: A child with VSD + myocarditis—label as both?
2. **"Normal" definition**: All-zeros, or explicit normal label?
3. **Borderline cases**: "Suspected" diagnoses—include or exclude?

#### Deliverables

- `ml/data/dataset_multilabel.py`
- `ml/data/label_mapping.json`
- `ml/data/label_distribution.png`

---

### Phase 2: 9-Lead & Signal Quality Handling (2-3 hours)

**Goal**: Handle edge cases that affect 13% of data (and 94% of neonates)

#### Tasks

| Task | Who | Time | Details |
|------|-----|------|---------|
| Identify 9-lead samples | Claude | 15 min | Count by age group |
| Implement lead masking | Claude | 45 min | Zero missing leads |
| Add lead config embedding | Claude | 30 min | 9 vs 12 flag |
| Implement signal quality score | Claude | 30 min | Average bSQI |
| Add quality-based confidence | Claude | 30 min | Soft penalty |
| Validate on held-out 9-lead | Claude | 30 min | Separate test set |

#### Lead Configuration Strategy

```python
def mask_leads(ecg, is_9_lead):
    """
    9-lead ECGs have: I, II, III, aVR, aVL, aVF, V1, V3, V5
    Missing: V2, V4, V6

    Strategy: Zero-mask missing leads during training AND inference.
    Model learns that zeros = missing, not flatline.
    """
    if is_9_lead:
        ecg[:, [7, 9, 11]] = 0  # V2, V4, V6 indices
    return ecg
```

#### Signal Quality Gating

| bSQI Range | Action | Confidence Modifier |
|------------|--------|---------------------|
| > 0.8 | Full confidence | 1.0 |
| 0.6 - 0.8 | Minor penalty | 0.9 |
| 0.4 - 0.6 | Moderate penalty + warning | 0.7 |
| < 0.4 | Major penalty + "unreliable" flag | 0.5 |

#### Deliverables

- `ml/data/lead_masking.py`
- `ml/data/signal_quality.py`
- Updated `dataset_multilabel.py`

---

### Phase 3: Rule Feature Extractor (2-3 hours)

**Goal**: Extract GEMUSE rule-based features for fusion

#### Tasks

| Task | Who | Time | Details |
|------|-----|------|---------|
| Identify GEMUSE features | Claude | 30 min | List from codebase |
| Write extraction pipeline | Claude | 1 hr | Batch processing |
| Compute age z-scores | Claude | 30 min | Per-feature normalization |
| Validate feature ranges | Claude | 30 min | Sanity checks |
| Review feature list | You | 30 min | Clinical relevance |

#### Feature List (~30 features)

**Intervals (6):**
- Heart rate (bpm)
- PR interval (ms)
- QRS duration (ms)
- QT interval (ms)
- QTc (Bazett, ms)
- RR interval (ms)

**Axis (3):**
- Frontal axis (degrees)
- Horizontal axis (degrees)
- T-wave axis (degrees)

**Amplitudes (12):**
- R amplitude per lead (I, II, V1-V6) → 8
- S amplitude (V1, V2) → 2
- T amplitude (V5, V6) → 2

**Morphology (6):**
- ST elevation (max across leads)
- ST depression (max across leads)
- T-wave inversion (count of leads)
- Q-wave presence (count of leads)
- Delta wave score
- Notched R-wave score

**Derived (3):**
- Sokolow-Lyon LVH index
- Cornell LVH index
- RVH score

**Age-adjusted z-scores:**
All of the above normalized by age-specific means/SDs from pediatric reference tables.

#### Deliverables

- `ml/models/rule_features.py`
- `ml/data/features_extracted.parquet`
- `ml/data/feature_validation.md`

---

### Phase 4: Hybrid Fusion Model (4-5 hours)

**Goal**: Train combined rule + neural model

#### Tasks

| Task | Who | Time | Details |
|------|-----|------|---------|
| Implement fusion architecture | Claude | 1.5 hr | See architecture diagram |
| Implement weighted BCE loss | Claude | 30 min | τ=100 cap |
| Implement MC Dropout | Claude | 30 min | Training + inference mode |
| Write training script | Claude | 1 hr | Logging, checkpoints |
| Run training | You | 45 min | ~30 epochs |
| Analyze results | Claude | 45 min | Learning curves, metrics |

#### Loss Function

```python
def weighted_bce_loss(pred, target, pos_weight, tau=100):
    """
    Weighted BCE with capped class weights.

    pos_weight[c] = min(N_neg[c] / N_pos[c], tau)

    Prevents rare classes from dominating.
    """
    weight = torch.where(target == 1, pos_weight, torch.ones_like(pos_weight))
    weight = torch.clamp(weight, max=tau)
    return F.binary_cross_entropy_with_logits(pred, target, weight=weight)
```

#### Training Configuration

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Batch size | 32 | Memory constraint |
| Learning rate | 1e-4 | Adam default |
| LR schedule | Cosine decay | Smooth convergence |
| Epochs | 50 | With early stopping |
| Early stopping patience | 10 | Prevent overfit |
| MC Dropout rate | 0.3 | Standard for uncertainty |
| MC Dropout passes (inference) | 10 | Balance speed/quality |

#### Deliverables

- `ml/models/hybrid_fusion.py`
- `ml/training/train_hybrid.py`
- `ml/training/checkpoints/hybrid_best.pt`

---

### Phase 5: Calibration & Uncertainty (3-4 hours)

**Goal**: Make probabilities meaningful and detect uncertainty

#### Tasks

| Task | Who | Time | Details |
|------|-----|------|---------|
| Implement temperature scaling | Claude | 45 min | On validation set |
| Compute calibration metrics | Claude | 30 min | ECE, MCE, reliability diagram |
| Implement Mahalanobis OOD | Claude | 1 hr | On embeddings |
| Define uncertainty thresholds | Claude | 30 min | Based on validation |
| Validate calibration | Claude | 30 min | Per-condition ECE |
| Review uncertainty behavior | You | 1 hr | Spot-check flagged samples |

#### Calibration Method: Temperature Scaling

```python
class TemperatureScaling:
    """
    Post-hoc calibration that doesn't affect accuracy.

    Learns a single temperature T to scale logits:
    calibrated_prob = sigmoid(logits / T)

    Trained on validation set to minimize NLL.
    """
    def __init__(self):
        self.temperature = nn.Parameter(torch.ones(1) * 1.5)

    def calibrate(self, logits):
        return logits / self.temperature
```

#### Uncertainty Quantification

| Method | What it measures | Threshold |
|--------|------------------|-----------|
| MC Dropout variance | Epistemic uncertainty | > 0.1 → "uncertain" |
| Prediction entropy | Overall uncertainty | > 0.5 → "uncertain" |
| Mahalanobis distance | Out-of-distribution | > 95th percentile → "OOD" |
| Rule-ML disagreement | Conflicting signals | Difference > 0.3 → "review" |

#### Expected Calibration Error (ECE) Target

| Condition | Target ECE | Meaning |
|-----------|------------|---------|
| CHD | < 0.05 | If model says 70%, true rate is 65-75% |
| Myocarditis | < 0.08 | Harder task, slightly higher tolerance |
| Kawasaki | < 0.08 | Rare, harder to calibrate |
| Cardiomyopathy | < 0.10 | Rarest, most tolerance |

#### Deliverables

- `ml/models/calibration.py`
- `ml/models/uncertainty.py`
- `ml/analysis/calibration_report.md`
- `ml/analysis/reliability_diagrams.png`

---

### Phase 6: Interpretability (2-3 hours)

**Goal**: Add Grad-CAM attention maps and feature importance

#### Tasks

| Task | Who | Time | Details |
|------|-----|------|---------|
| Implement 1D Grad-CAM | Claude | 1 hr | For ResNet encoder |
| Implement rule feature importance | Claude | 30 min | SHAP or permutation |
| Create visualization tool | Claude | 45 min | ECG + attention overlay |
| Generate sample outputs | Claude | 30 min | 20 examples per condition |
| Clinical review | You | 1-2 hr | Do attention maps make sense? |

#### Grad-CAM for 1D Signals

```python
def gradcam_1d(model, ecg, target_class, layer='encoder.layer4'):
    """
    Compute attention heatmap showing which parts of ECG
    the model focuses on for a given prediction.

    Returns: 12 × 5000 attention weights (one per lead per sample)
    """
    # Forward pass
    features = model.encoder(ecg)

    # Backward pass for target class
    model.zero_grad()
    output = model(ecg)
    output[0, target_class].backward()

    # Get gradients and activations
    gradients = model.encoder.layer4.grad
    activations = model.encoder.layer4.activation

    # Weight activations by gradients
    weights = gradients.mean(dim=-1, keepdim=True)
    cam = (weights * activations).sum(dim=1)
    cam = F.relu(cam)  # Only positive contributions

    # Upsample to original resolution
    cam = F.interpolate(cam, size=5000, mode='linear')

    return cam
```

#### Clinical Validation Questions

For each Grad-CAM output, you should ask:
1. Does the attention focus on clinically relevant regions?
2. For Kawasaki: Does it look at T-waves and coronary territory leads?
3. For CHD: Does it look at right precordial leads (RVH) or axis?
4. For myocarditis: Does it look at diffuse ST/T changes?

**If attention maps are nonsensical, this is a red flag for the model.**

#### Deliverables

- `ml/models/gradcam.py`
- `ml/analysis/attention_examples/` (images)
- `ml/analysis/feature_importance.md`

---

### Phase 7: Subgroup & Failure Analysis (3-4 hours)

**Goal**: Ensure model works across all patient subgroups

#### Tasks

| Task | Who | Time | Details |
|------|-----|------|---------|
| Stratify test set by age | Claude | 30 min | 5 age groups |
| Compute per-subgroup AUROC | Claude | 30 min | Identify gaps |
| Stratify by lead config | Claude | 30 min | 9 vs 12 lead |
| Analyze false negatives | Claude | 1 hr | What do we miss? |
| Analyze false positives | Claude | 1 hr | What triggers false alarms? |
| Review failure cases | You | 1-2 hr | Clinical patterns |

#### Age Subgroup Analysis

| Age Group | N (approx) | Target AUROC | Concern |
|-----------|------------|--------------|---------|
| Neonate (0-28d) | ~1,400 | > 0.75 | 94% are 9-lead |
| Infant (1-12m) | ~2,800 | > 0.80 | Fast HR, low voltage |
| Toddler (1-3y) | ~3,500 | > 0.82 | Variable |
| Child (3-12y) | ~4,900 | > 0.85 | Most stable |
| Adolescent (12-14y) | ~1,600 | > 0.85 | Approaching adult |

#### Failure Mode Categories

| Category | Description | Action if found |
|----------|-------------|-----------------|
| Age-related | Model fails for specific age group | Add age-stratified training |
| Lead-related | Model fails on 9-lead | Improve masking strategy |
| Quality-related | Model fails on noisy signals | Tighten quality gate |
| Condition co-occurrence | Fails when multiple conditions | Multi-task rebalancing |
| Rare morphology | Unusual ECG pattern | Flag as OOD |

#### Deliverables

- `ml/analysis/subgroup_performance.md`
- `ml/analysis/failure_analysis.md`
- `ml/analysis/false_negatives.csv` (with clinical review notes)

---

### Phase 8: Label Noise Review (3-4 hours)

**Goal**: Find and fix mislabeled samples

#### Tasks

| Task | Who | Time | Details |
|------|-----|------|---------|
| Run cleanlab | Claude | 30 min | Identify likely mislabels |
| Rank by label quality score | Claude | 30 min | Prioritize review |
| Create review interface | Claude | 30 min | Show ECG + prediction + label |
| Manual review (top 100) | You | 2-3 hr | Correct or exclude |
| Retrain with cleaned labels | You | 45 min | Measure improvement |

#### Cleanlab Methodology

```python
from cleanlab.classification import CleanLearning

# Get cross-validated predicted probabilities
cl = CleanLearning(model)
label_issues = cl.find_label_issues(X, y)

# Rank by label quality score
# Lower score = more likely mislabeled
issues_df = pd.DataFrame({
    'sample_id': sample_ids,
    'given_label': y,
    'predicted_label': y_pred,
    'label_quality': label_issues.label_quality,
}).sort_values('label_quality')

# Review top 100 most suspicious
```

#### Expected Outcomes

| Scenario | Action | Expected count |
|----------|--------|----------------|
| Mislabeled positive → actually negative | Remove label | ~20-30 |
| Mislabeled negative → actually positive | Add label | ~10-20 |
| Ambiguous (borderline case) | Exclude from training | ~20-30 |
| Correctly labeled (cleanlab wrong) | Keep | ~30-40 |

#### Deliverables

- `ml/analysis/label_noise_review.py`
- `ml/data/cleaned_labels.json` (corrections)
- `ml/data/excluded_samples.json` (ambiguous)
- Before/after AUROC comparison

---

### Phase 9: Threshold Selection (2-3 hours)

**Goal**: Define clinical operating points per condition

#### Tasks

| Task | Who | Time | Details |
|------|-----|------|---------|
| Compute ROC curves per condition | Claude | 30 min | Full range |
| Identify candidate thresholds | Claude | 30 min | Based on clinical priorities |
| Compute clinical metrics | Claude | 30 min | PPV, NPV, NNS |
| Present threshold options | Claude | 30 min | Trade-off analysis |
| Select final thresholds | You | 1 hr | Clinical judgment |
| Validate on held-out set | Claude | 30 min | Confirm performance |

#### Clinical Priority Matrix

| Condition | Priority | Reasoning | Threshold Strategy |
|-----------|----------|-----------|-------------------|
| Myocarditis | Sensitivity | Miss = death | High sensitivity (>90%), accept more FP |
| Kawasaki | Sensitivity | Miss = coronary damage | High sensitivity (>85%) |
| CHD | Balanced | Screening use case | Youden's J (maximize sens + spec) |
| Cardiomyopathy | Specificity | Rare, avoid false alarms | High specificity (>90%) |

#### Threshold Options to Present

For each condition, I'll compute:
- Sensitivity @ 90% specificity
- Sensitivity @ 95% specificity
- Youden's J optimal point
- Sensitivity @ 80% PPV
- Custom clinical threshold

#### Deliverables

- `ml/analysis/threshold_analysis.md`
- `ml/config/clinical_thresholds.json`
- ROC curve plots with marked operating points

---

### Phase 10: External Validation (4-6 hours)

**Goal**: Test generalization beyond training data

#### Tasks

| Task | Who | Time | Details |
|------|-----|------|---------|
| Identify external datasets | Claude | 1 hr | Search PhysioNet, literature |
| Assess dataset compatibility | Claude | 30 min | Labels, format, age range |
| Adapt data loader | Claude | 1 hr | Handle format differences |
| Run inference | You | 30 min | Compute |
| Analyze performance gap | Claude | 1 hr | Where does it fail? |
| Document limitations | Claude | 30 min | Honest assessment |
| Recommend next steps | Claude | 30 min | What's needed for clinical use |

#### Candidate External Datasets

| Dataset | N | Ages | Labels | Issue |
|---------|---|------|--------|-------|
| PTB-XL (pediatric subset) | ~500 | 0-18y | Limited | Small, mostly adult |
| PhysioNet Challenge 2020 | ~43k | Mixed | Arrhythmia focus | Not pediatric-specific |
| SPH (Singapore) | ~10k | Pediatric | CHD | May need access |
| Internal hold-out | ~1,400 | 0-14y | Same as training | Not truly external |

#### Validation Strategy

**Minimum viable**: Hold out 10% of ZZU-pECG as "pseudo-external" (different patients, same hospital).

**Ideal**: Obtain data from different hospital/country with different ECG machines.

#### Expected Performance Drop

| Scenario | Expected AUROC drop | Acceptable? |
|----------|---------------------|-------------|
| Same hospital, different patients | 0-0.02 | Yes |
| Different hospital, same country | 0.02-0.05 | Yes |
| Different country | 0.05-0.10 | Maybe |
| Different ECG machine | 0.03-0.08 | Needs calibration |

#### Deliverables

- `ml/analysis/external_validation.md`
- Performance comparison table
- Recommendations for deployment readiness

---

### Phase 11: Clinical Workflow Design (2-3 hours)

**Goal**: Define how GEMUSE fits into clinical practice

#### Tasks

| Task | Who | Time | Details |
|------|-----|------|---------|
| Map clinical workflows | Claude | 30 min | When is ECG done? Who reviews? |
| Define alert levels | Claude | 30 min | What triggers what action? |
| Design notification system | Claude | 30 min | How are results communicated? |
| Review with clinical input | You | 1 hr | Does this make sense? |
| Document workflow | Claude | 30 min | For product requirements |

#### Clinical Workflow Questions (You to answer)

1. **When does GEMUSE run?**
   - Real-time (during ECG acquisition)?
   - Batch (overnight processing)?
   - On-demand (clinician requests)?

2. **Who sees the output?**
   - Technician performing ECG?
   - Ordering physician?
   - Pediatric cardiologist?
   - All of the above?

3. **What's the expected action per alert level?**

| Alert Level | Example | Expected Action |
|-------------|---------|-----------------|
| CRITICAL | Myocarditis 85% | Immediate cardiology consult |
| ELEVATED | Kawasaki 60% | Same-day review, consider workup |
| MONITOR | CHD 30% | Note in chart, follow clinically |
| LOW | All < 15% | No action, routine care |

4. **Alert fatigue mitigation**
   - Maximum alerts per day before clinicians ignore?
   - Should repeat ECGs suppress re-alerting?

#### Deliverables

- `ml/docs/clinical_workflow.md`
- Alert level definitions
- Integration requirements for GEMUSE UI

---

### Phase 12: Regulatory Planning (2-3 hours)

**Goal**: Understand regulatory pathway for clinical deployment

#### Tasks

| Task | Who | Time | Details |
|------|-----|------|---------|
| Determine device classification | Claude | 30 min | FDA class II likely |
| Identify predicate devices | Claude | 30 min | 510(k) search |
| Outline submission requirements | Claude | 1 hr | What's needed |
| Assess timeline and cost | Claude | 30 min | Realistic estimate |
| Decision on regulatory path | You | 30 min | Proceed or not? |

#### FDA Regulatory Context

**Likely classification**: Class II medical device (software as medical device, SaMD)

**Potential predicates**:
- Eko AI (adult ECG analysis)
- AliveCor KardiaMobile (arrhythmia detection)
- GE Marquette (ECG interpretation)

**510(k) requirements**:
1. Device description
2. Intended use statement
3. Substantial equivalence argument
4. Performance testing (sensitivity/specificity)
5. Clinical validation data
6. Software documentation (IEC 62304)
7. Risk analysis (ISO 14971)

#### Estimated Regulatory Effort

| Component | Effort | Cost |
|-----------|--------|------|
| Documentation preparation | 2-4 months | $50-100k |
| Clinical validation study | 3-6 months | $100-300k |
| FDA submission + review | 3-6 months | $10-20k |
| **Total** | **8-16 months** | **$160-420k** |

**Alternative: "Research use only"**
- No FDA clearance needed
- Cannot be used for clinical decisions
- Appropriate for proof-of-concept

#### Deliverables

- `ml/docs/regulatory_pathway.md`
- Predicate device analysis
- Go/no-go recommendation

---

### Phase 13: Product Integration (4-5 hours)

**Goal**: Integrate ML into GEMUSE product

#### Tasks

| Task | Who | Time | Details |
|------|-----|------|---------|
| Define inference API | Claude | 30 min | Input/output spec |
| Implement model serving | Claude | 1 hr | Load, preprocess, predict |
| Add confidence calibration | Claude | 30 min | Apply temp scaling |
| Add uncertainty display | Claude | 30 min | MC dropout aggregation |
| Implement fallback mode | Claude | 30 min | When model unavailable |
| UI integration | You | 2 hr | Display in GEMUSE |
| End-to-end testing | You | 1 hr | Full pipeline |

#### Inference API Specification

```typescript
interface GEMUSEMLRequest {
  ecg: number[][];          // 12 × 5000 samples
  age_days: number;         // Patient age in days
  lead_config: '9-lead' | '12-lead';
}

interface GEMUSEMLResponse {
  // Disease predictions (calibrated probabilities)
  predictions: {
    chd: number;              // 0-1
    myocarditis: number;      // 0-1
    kawasaki: number;         // 0-1
    cardiomyopathy: number;   // 0-1
  };

  // Alert levels based on thresholds
  alerts: {
    chd: 'critical' | 'elevated' | 'monitor' | 'low';
    myocarditis: 'critical' | 'elevated' | 'monitor' | 'low';
    kawasaki: 'critical' | 'elevated' | 'monitor' | 'low';
    cardiomyopathy: 'critical' | 'elevated' | 'monitor' | 'low';
  };

  // Confidence and uncertainty
  confidence: {
    overall: 'high' | 'medium' | 'low';
    signal_quality: number;   // bSQI average
    model_uncertainty: number; // MC dropout variance
    is_ood: boolean;          // Out-of-distribution flag
  };

  // Interpretability
  attention: {
    leads: { [lead: string]: number };  // Which leads matter
    regions: { start: number; end: number; weight: number }[];
  };

  // Metadata
  model_version: string;
  inference_time_ms: number;

  // Warnings
  warnings: string[];  // e.g., "Low signal quality in lead III"
}
```

#### Fallback Behavior

| Scenario | Behavior |
|----------|----------|
| Model file missing | Show rules only, message: "ML unavailable" |
| Inference timeout (>5s) | Show rules only, log error |
| OOD detected | Show predictions with "low confidence" warning |
| Low signal quality | Show predictions with quality warning |

#### Deliverables

- `ml/serving/inference.py`
- `ml/serving/api.py`
- Integration tests
- Performance benchmarks (latency, throughput)

---

## Timeline Summary

| Phase | Effort | Your Time | My Time | Cumulative |
|-------|--------|-----------|---------|------------|
| 1. Multi-Label Dataset | 3-4 hr | 1.5 hr | 2 hr | 3-4 hr |
| 2. 9-Lead & Quality | 2-3 hr | 0.5 hr | 2 hr | 5-7 hr |
| 3. Rule Features | 2-3 hr | 0.5 hr | 2 hr | 7-10 hr |
| 4. Hybrid Model | 4-5 hr | 1 hr | 3.5 hr | 11-15 hr |
| 5. Calibration & Uncertainty | 3-4 hr | 1 hr | 2.5 hr | 14-19 hr |
| 6. Interpretability | 2-3 hr | 1 hr | 1.5 hr | 16-22 hr |
| 7. Subgroup Analysis | 3-4 hr | 1.5 hr | 2 hr | 19-26 hr |
| 8. Label Noise | 3-4 hr | 2.5 hr | 1 hr | 22-30 hr |
| 9. Threshold Selection | 2-3 hr | 1 hr | 1.5 hr | 24-33 hr |
| 10. External Validation | 4-6 hr | 1 hr | 4 hr | 28-39 hr |
| 11. Clinical Workflow | 2-3 hr | 1.5 hr | 1 hr | 30-42 hr |
| 12. Regulatory Planning | 2-3 hr | 0.5 hr | 2 hr | 32-45 hr |
| 13. Product Integration | 4-5 hr | 3 hr | 2 hr | 36-50 hr |
| **Total** | **36-50 hr** | **~17 hr** | **~27 hr** | |

**Your time**: Clinical review, decisions, compute, UI integration
**My time**: Code, analysis, documentation

---

## Decision Log

Track key decisions made during development.

| Date | Phase | Decision | Rationale | Owner |
|------|-------|----------|-----------|-------|
| 2024-12-25 | 1 | Multi-label: Label as both | Clinical reality—conditions co-occur | You |
| 2024-12-25 | 1 | Normal: Infer from all-zeros | Normal = absence of disease, not separate class | You |
| | 2 | 9-lead strategy | | You |
| | 5 | Uncertainty thresholds | | You |
| | 9 | Clinical thresholds | | You |
| | 11 | Alert levels | | You |
| | 12 | Regulatory path | | You |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation | Status |
|------|------------|--------|------------|--------|
| Hybrid doesn't beat neural | Medium | Low | Still interpretable, still ships | Open |
| Neonates underperform | High | High | 9-lead masking, age stratification | Open |
| Kawasaki too rare | High | Medium | Consider combining with "inflammatory" | Open |
| Calibration fails | Medium | High | Try isotonic regression backup | Open |
| External validation fails | Medium | High | Document limitations, restrict claims | Open |
| Grad-CAM nonsensical | Medium | Medium | Iterate on layer selection | Open |
| Regulatory too expensive | Medium | High | "Research use only" alternative | Open |

---

## Definition of Done

### MVP (Proof of Concept)
- [x] Binary abnormal model (0.82 AUROC)
- [x] CHD model (0.855 AUROC)
- [ ] Multi-label model for 4 conditions
- [ ] Hybrid fusion trained
- [ ] Basic calibration
- [ ] Grad-CAM working

### Clinical-Ready (Internal Use)
- [ ] All conditions > 0.80 AUROC
- [ ] Hybrid beats neural-only
- [ ] Calibration ECE < 0.08 all conditions
- [ ] Uncertainty quantification working
- [ ] 9-lead performance validated
- [ ] Subgroup analysis complete
- [ ] Threshold selection complete
- [ ] Clinical workflow documented

### Production-Ready (Deployment)
- [ ] External validation completed
- [ ] Label noise cleaned
- [ ] Failure modes documented
- [ ] Inference API integrated
- [ ] UI displaying predictions
- [ ] Fallback behavior tested
- [ ] Performance monitoring in place

### Regulatory-Ready (Clinical Claims)
- [ ] Multi-site validation
- [ ] Clinician comparison study
- [ ] FDA submission prepared
- [ ] IEC 62304 documentation
- [ ] ISO 14971 risk analysis

---

## File Structure

```
ml/
├── spec.md                              # This file
├── PROGRESS_JOURNAL.md                  # Updated per phase
│
├── config/
│   ├── clinical_thresholds.json         # Phase 9
│   └── model_config.yaml                # Architecture params
│
├── data/
│   ├── dataset.py                       # Original (keep)
│   ├── dataset_multilabel.py            # Phase 1
│   ├── label_mapping.json               # Phase 1
│   ├── lead_masking.py                  # Phase 2
│   ├── signal_quality.py                # Phase 2
│   └── cleaned_labels.json              # Phase 8
│
├── models/
│   ├── resnet1d.py                      # Original (keep)
│   ├── resnet1d_age.py                  # Original (keep)
│   ├── rule_features.py                 # Phase 3
│   ├── hybrid_fusion.py                 # Phase 4
│   ├── calibration.py                   # Phase 5
│   ├── uncertainty.py                   # Phase 5
│   └── gradcam.py                       # Phase 6
│
├── training/
│   ├── train.py                         # Original (keep)
│   ├── train_hybrid.py                  # Phase 4
│   └── checkpoints/
│       ├── hybrid_best.pt               # Phase 4
│       └── hybrid_calibrated.pt         # Phase 5
│
├── analysis/
│   ├── calibration_report.md            # Phase 5
│   ├── subgroup_performance.md          # Phase 7
│   ├── failure_analysis.md              # Phase 7
│   ├── label_noise_review.py            # Phase 8
│   ├── threshold_analysis.md            # Phase 9
│   └── external_validation.md           # Phase 10
│
├── serving/
│   ├── inference.py                     # Phase 13
│   └── api.py                           # Phase 13
│
└── docs/
    ├── clinical_workflow.md             # Phase 11
    ├── regulatory_pathway.md            # Phase 12
    └── limitations.md                   # Phase 10
```

---

## Next Step

**Phase 1: Multi-Label Dataset**

I'll start by mapping ICD-10 codes to the 4 target conditions. First decision needed from you:

1. **How to handle multi-label overlap?** (e.g., VSD + myocarditis)
   - Option A: Label as both (multi-hot vector)
   - Option B: Label as primary diagnosis only
   - Option C: Exclude multi-label samples

2. **What's the "normal" definition?**
   - Option A: Explicit "normal" class (A1/A2 codes)
   - Option B: Infer normal = no disease labels (all zeros)

Ready to start when you decide.
