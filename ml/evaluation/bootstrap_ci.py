"""
Bootstrap Confidence Intervals for AUROC
=========================================
Computes 95% CI for each condition using 1000 bootstrap resamples.
"""
import os
import sys
import numpy as np
import torch
from sklearn.metrics import roc_auc_score
from tqdm import tqdm

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ml.models.hybrid_model import hybrid_model_small
from ml.data.dataset_multilabel import ZZUMultiLabelDataset, CONDITION_NAMES


def bootstrap_auroc(y_true: np.ndarray, y_pred: np.ndarray, n_bootstrap: int = 1000, seed: int = 42) -> dict:
    """
    Compute bootstrap 95% CI for AUROC.

    Returns dict with 'auroc', 'ci_low', 'ci_high'.
    """
    np.random.seed(seed)
    n_samples = len(y_true)

    # Check if we have both classes
    if len(np.unique(y_true)) < 2:
        return {'auroc': float('nan'), 'ci_low': float('nan'), 'ci_high': float('nan'), 'n_pos': int(y_true.sum())}

    # Original AUROC
    auroc = roc_auc_score(y_true, y_pred)

    # Bootstrap
    bootstrap_aurocs = []
    for _ in range(n_bootstrap):
        indices = np.random.choice(n_samples, size=n_samples, replace=True)
        y_true_boot = y_true[indices]
        y_pred_boot = y_pred[indices]

        # Skip if only one class in bootstrap sample
        if len(np.unique(y_true_boot)) < 2:
            continue

        bootstrap_aurocs.append(roc_auc_score(y_true_boot, y_pred_boot))

    bootstrap_aurocs = np.array(bootstrap_aurocs)
    ci_low = np.percentile(bootstrap_aurocs, 2.5)
    ci_high = np.percentile(bootstrap_aurocs, 97.5)

    return {
        'auroc': auroc,
        'ci_low': ci_low,
        'ci_high': ci_high,
        'n_pos': int(y_true.sum()),
        'n_total': n_samples,
        'n_valid_bootstrap': len(bootstrap_aurocs)
    }


def main():
    print("=" * 60)
    print("Bootstrap Confidence Intervals for Pediatric ECG Model")
    print("=" * 60)

    # Device
    device = torch.device('cuda' if torch.cuda.is_available() else
                          'mps' if torch.backends.mps.is_available() else 'cpu')
    print(f"\nDevice: {device}")

    # Load model
    checkpoint_path = 'ml/training/checkpoints/best_hybrid_20251225_091556.pt'
    print(f"Loading model from: {checkpoint_path}")

    model = hybrid_model_small(num_conditions=4)
    ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt['model_state_dict'])
    model = model.to(device)
    model.eval()
    print(f"Model loaded (epoch {ckpt['epoch']})")

    # Load test dataset
    print("\nLoading test dataset...")
    test_dataset = ZZUMultiLabelDataset(
        data_dir='data/zzu-pecg',
        split='test'
    )
    print(f"Test samples: {len(test_dataset)}")

    # Get predictions
    print("\nRunning inference on test set...")
    all_labels = []
    all_probs = []

    with torch.no_grad():
        for i in tqdm(range(len(test_dataset)), desc="Inference"):
            signal, labels, lead_mask, age, _ = test_dataset[i]

            # Prepare inputs
            signal = signal.unsqueeze(0).to(device)
            lead_mask = lead_mask.unsqueeze(0).to(device)
            age = age.unsqueeze(0).to(device)
            rule_features = torch.zeros(1, 30, device=device)

            # Forward pass
            logits = model(signal, rule_features, lead_mask, age)
            probs = torch.sigmoid(logits).cpu().numpy()[0]

            all_labels.append(labels.numpy())
            all_probs.append(probs)

    all_labels = np.array(all_labels)
    all_probs = np.array(all_probs)

    # Bootstrap CI for each condition
    print("\n" + "=" * 60)
    print("Bootstrap 95% Confidence Intervals (n=1000 resamples)")
    print("=" * 60)

    condition_names = ['CHD', 'Myocarditis', 'Kawasaki', 'Cardiomyopathy']
    results = {}

    for i, name in enumerate(condition_names):
        if name == 'Myocarditis':
            print(f"\n{name}: DEPRECATED (insufficient training data)")
            continue

        y_true = all_labels[:, i]
        y_pred = all_probs[:, i]

        result = bootstrap_auroc(y_true, y_pred, n_bootstrap=1000)
        results[name] = result

        print(f"\n{name}:")
        print(f"  AUROC: {result['auroc']:.3f} (95% CI: {result['ci_low']:.3f}-{result['ci_high']:.3f})")
        print(f"  Positive samples: {result['n_pos']}/{result['n_total']} ({100*result['n_pos']/result['n_total']:.1f}%)")
        print(f"  Valid bootstrap samples: {result['n_valid_bootstrap']}/1000")

    # Summary table
    print("\n" + "=" * 60)
    print("Summary Table (for documentation)")
    print("=" * 60)
    print("\n| Condition | AUROC | 95% CI | N (pos/total) |")
    print("|-----------|-------|--------|---------------|")
    for name in ['CHD', 'Kawasaki', 'Cardiomyopathy']:
        r = results[name]
        print(f"| {name} | {r['auroc']:.3f} | {r['ci_low']:.3f}-{r['ci_high']:.3f} | {r['n_pos']}/{r['n_total']} |")

    # Mean AUROC (excluding myocarditis)
    mean_auroc = np.mean([results[n]['auroc'] for n in ['CHD', 'Kawasaki', 'Cardiomyopathy']])
    print(f"| **Mean (3 conditions)** | **{mean_auroc:.3f}** | - | - |")

    print("\n" + "=" * 60)
    print("Done!")


if __name__ == '__main__':
    main()
