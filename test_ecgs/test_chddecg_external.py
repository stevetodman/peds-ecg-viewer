"""
Test on EXTERNAL CHD ECGs from CHDdECG dataset.
These are from Guangdong Provincial People's Hospital - completely different from ZZU training data.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import torch
import numpy as np
from ml.models.hybrid_model import hybrid_model_small


def load_chddecg_sample(npy_path: str, sample_idx: int = 0):
    """Load a sample from CHDdECG numpy file.
    CHDdECG format: (N, 1, 5000, 9) - 9 leads, 5000 samples
    We need to convert to (12, 5000) - pad missing leads with zeros
    """
    data = np.load(npy_path)
    print(f"  File shape: {data.shape}")

    # Get one sample - handle different shapes
    if len(data.shape) == 4:  # (N, 1, 5000, 9)
        ecg_9lead = data[sample_idx, 0]  # (5000, 9)
    else:  # (N, 5000, 9)
        ecg_9lead = data[sample_idx]  # (5000, 9)

    ecg_9lead = ecg_9lead.T  # (9, 5000)

    # CHDdECG uses 9 leads: I, II, III, aVR, aVL, aVF, V1, V3, V5
    # We need 12 leads: I, II, III, aVR, aVL, aVF, V1, V2, V3, V4, V5, V6
    ecg_12lead = np.zeros((12, 5000), dtype=np.float32)

    # Map available leads
    lead_map = {
        0: 0,   # I -> I
        1: 1,   # II -> II
        2: 2,   # III -> III
        3: 3,   # aVR -> aVR
        4: 4,   # aVL -> aVL
        5: 5,   # aVF -> aVF
        6: 6,   # V1 -> V1
        7: 8,   # V3 -> V3
        8: 10,  # V5 -> V5
    }

    for src, dst in lead_map.items():
        ecg_12lead[dst] = ecg_9lead[src]

    # Create lead mask (missing V2, V4, V6)
    lead_mask = [1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0]

    return ecg_12lead, lead_mask


def main():
    print("="*70)
    print("EXTERNAL VALIDATION: CHDdECG Dataset")
    print("Source: Guangdong Provincial People's Hospital (NOT in training)")
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

    # Test CHD cases
    chd_files = [
        ("ventricular septal defect.npy", "VSD"),
        ("atrial septal defect.npy", "ASD"),
        ("tetralogy of fallot.npy", "ToF"),
        ("patent ductus arteriosus.npy", "PDA"),
    ]

    print("CHD POSITIVE CASES (from external hospital):")
    print("-" * 70)

    all_chd_probs = []
    for filename, label in chd_files:
        filepath = os.path.join(base_path, filename)
        if not os.path.exists(filepath):
            continue

        print(f"\n{label} ({filename}):")
        signal, lead_mask = load_chddecg_sample(filepath, sample_idx=0)

        # Normalize
        for i in range(12):
            if lead_mask[i]:
                signal[i] = (signal[i] - signal[i].mean()) / (signal[i].std() + 1e-6)

        # Inference
        signal_t = torch.tensor(signal).unsqueeze(0).to(device)
        lead_mask_t = torch.tensor(lead_mask, dtype=torch.float32).unsqueeze(0).to(device)
        age_t = torch.tensor([[0.35]], device=device)  # ~2 years old
        rule_features = torch.zeros(1, 30, device=device)

        with torch.no_grad():
            logits = model(signal_t, rule_features, lead_mask_t, age_t)
            probs = torch.sigmoid(logits).cpu().numpy()[0]

        chd_prob = probs[0]
        all_chd_probs.append(chd_prob)
        status = "POSITIVE" if chd_prob >= 0.484 else "negative"
        print(f"  CHD probability: {chd_prob*100:.1f}%  [{status}]")

    # Test non-CHD cases
    print("\n" + "-" * 70)
    print("NON-CHD CASES (from external hospital):")
    print("-" * 70)

    non_chd_path = os.path.join(base_path, "non-CHD")
    non_chd_probs = []

    if os.path.exists(non_chd_path):
        for f in os.listdir(non_chd_path):
            if f.endswith('.npy'):
                filepath = os.path.join(non_chd_path, f)
                print(f"\n{f}:")
                signal, lead_mask = load_chddecg_sample(filepath, sample_idx=0)

                for i in range(12):
                    if lead_mask[i]:
                        signal[i] = (signal[i] - signal[i].mean()) / (signal[i].std() + 1e-6)

                signal_t = torch.tensor(signal).unsqueeze(0).to(device)
                lead_mask_t = torch.tensor(lead_mask, dtype=torch.float32).unsqueeze(0).to(device)
                age_t = torch.tensor([[0.35]], device=device)
                rule_features = torch.zeros(1, 30, device=device)

                with torch.no_grad():
                    logits = model(signal_t, rule_features, lead_mask_t, age_t)
                    probs = torch.sigmoid(logits).cpu().numpy()[0]

                chd_prob = probs[0]
                non_chd_probs.append(chd_prob)
                status = "POSITIVE" if chd_prob >= 0.484 else "negative"
                print(f"  File shape: {np.load(filepath).shape}")
                print(f"  CHD probability: {chd_prob*100:.1f}%  [{status}]")

    # Summary
    print("\n" + "="*70)
    print("EXTERNAL VALIDATION SUMMARY")
    print("="*70)
    if all_chd_probs:
        print(f"CHD cases mean:     {np.mean(all_chd_probs)*100:.1f}%  (n={len(all_chd_probs)})")
    if non_chd_probs:
        print(f"Non-CHD cases mean: {np.mean(non_chd_probs)*100:.1f}%  (n={len(non_chd_probs)})")
    if all_chd_probs and non_chd_probs:
        print(f"Separation ratio:   {np.mean(all_chd_probs)/np.mean(non_chd_probs):.1f}x")


if __name__ == '__main__':
    main()
