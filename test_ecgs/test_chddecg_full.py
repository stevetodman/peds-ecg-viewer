"""
Full external validation on CHDdECG - test ALL samples.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import torch
import numpy as np
from sklearn.metrics import roc_auc_score
from ml.models.hybrid_model import hybrid_model_small


def load_all_samples(npy_path: str):
    """Load all samples from CHDdECG numpy file."""
    data = np.load(npy_path)

    samples = []
    n = data.shape[0]

    for i in range(n):
        if len(data.shape) == 4:
            ecg_9lead = data[i, 0].T  # (9, 5000)
        else:
            ecg_9lead = data[i].T

        # Pad to 12 leads
        ecg_12lead = np.zeros((12, 5000), dtype=np.float32)
        lead_map = {0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 8, 8: 10}
        for src, dst in lead_map.items():
            ecg_12lead[dst] = ecg_9lead[src]

        # Normalize
        for j in range(12):
            if j in [0,1,2,3,4,5,6,8,10]:
                ecg_12lead[j] = (ecg_12lead[j] - ecg_12lead[j].mean()) / (ecg_12lead[j].std() + 1e-6)

        samples.append(ecg_12lead)

    return np.array(samples)


def main():
    print("="*70)
    print("FULL EXTERNAL VALIDATION: CHDdECG Dataset")
    print("Testing ALL samples from Guangdong Provincial People's Hospital")
    print("="*70 + "\n")

    # Load model
    device = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
    model = hybrid_model_small(num_conditions=4)
    ckpt = torch.load('ml/training/checkpoints/best_hybrid_20251225_091556.pt',
                      map_location=device, weights_only=False)
    model.load_state_dict(ckpt['model_state_dict'])
    model = model.to(device)
    model.eval()

    base_path = "test_ecgs/CHDdECG/Test data/Ref-A"
    lead_mask = [1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0]

    # Collect all CHD samples
    chd_files = [
        "ventricular septal defect.npy",
        "atrial septal defect.npy",
        "tetralogy of fallot.npy",
        "patent ductus arteriosus.npy",
        "coarctation of the aorta.npy",
        "pulmonary atresia.npy",
        "Single ventricle.npy",
    ]

    all_chd_probs = []
    all_non_chd_probs = []

    print("Processing CHD cases...")
    for filename in chd_files:
        filepath = os.path.join(base_path, filename)
        if not os.path.exists(filepath):
            continue

        samples = load_all_samples(filepath)
        print(f"  {filename}: {len(samples)} samples")

        for ecg in samples:
            signal_t = torch.tensor(ecg).unsqueeze(0).to(device)
            lead_mask_t = torch.tensor(lead_mask, dtype=torch.float32).unsqueeze(0).to(device)
            age_t = torch.tensor([[0.35]], device=device)
            rule_features = torch.zeros(1, 30, device=device)

            with torch.no_grad():
                logits = model(signal_t, rule_features, lead_mask_t, age_t)
                prob = torch.sigmoid(logits)[0, 0].item()
                all_chd_probs.append(prob)

    # Non-CHD samples
    print("\nProcessing non-CHD cases...")
    non_chd_path = os.path.join(base_path, "non-CHD")
    if os.path.exists(non_chd_path):
        for f in os.listdir(non_chd_path):
            if f.endswith('.npy'):
                filepath = os.path.join(non_chd_path, f)
                samples = load_all_samples(filepath)
                print(f"  {f}: {len(samples)} samples")

                for ecg in samples:
                    signal_t = torch.tensor(ecg).unsqueeze(0).to(device)
                    lead_mask_t = torch.tensor(lead_mask, dtype=torch.float32).unsqueeze(0).to(device)
                    age_t = torch.tensor([[0.35]], device=device)
                    rule_features = torch.zeros(1, 30, device=device)

                    with torch.no_grad():
                        logits = model(signal_t, rule_features, lead_mask_t, age_t)
                        prob = torch.sigmoid(logits)[0, 0].item()
                        all_non_chd_probs.append(prob)

    # Compute AUROC
    print("\n" + "="*70)
    print("RESULTS")
    print("="*70)

    all_probs = all_chd_probs + all_non_chd_probs
    all_labels = [1] * len(all_chd_probs) + [0] * len(all_non_chd_probs)

    if len(set(all_labels)) == 2:
        auroc = roc_auc_score(all_labels, all_probs)
        print(f"\nExternal AUROC: {auroc:.3f}")

    print(f"\nCHD samples:     n={len(all_chd_probs)}, mean={np.mean(all_chd_probs)*100:.1f}%, median={np.median(all_chd_probs)*100:.1f}%")
    print(f"Non-CHD samples: n={len(all_non_chd_probs)}, mean={np.mean(all_non_chd_probs)*100:.1f}%, median={np.median(all_non_chd_probs)*100:.1f}%")

    # Detection rate at threshold
    thresh = 0.484
    chd_detected = sum(1 for p in all_chd_probs if p >= thresh)
    non_chd_detected = sum(1 for p in all_non_chd_probs if p >= thresh)
    print(f"\nAt threshold {thresh}:")
    print(f"  CHD sensitivity:  {chd_detected}/{len(all_chd_probs)} = {100*chd_detected/len(all_chd_probs):.1f}%")
    print(f"  Non-CHD FP rate:  {non_chd_detected}/{len(all_non_chd_probs)} = {100*non_chd_detected/len(all_non_chd_probs):.1f}%")


if __name__ == '__main__':
    main()
