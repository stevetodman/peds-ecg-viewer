"""
Test model on known CHD cases from the test set.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import torch
import numpy as np
from ml.models.hybrid_model import hybrid_model_small
from ml.data.dataset_multilabel import ZZUMultiLabelDataset


def main():
    print("="*60)
    print("Testing on KNOWN CHD cases from test set")
    print("(Model never saw these during training)")
    print("="*60 + "\n")

    # Load test dataset
    test_dataset = ZZUMultiLabelDataset(data_dir='data/zzu-pecg', split='test')

    # Find CHD positive cases
    chd_cases = []
    normal_cases = []

    for i in range(len(test_dataset)):
        signal, labels, lead_mask, age, metadata = test_dataset[i]
        if labels[0] > 0.5:  # CHD positive
            chd_cases.append((i, metadata))
        elif labels.sum() == 0:  # Normal
            normal_cases.append((i, metadata))

        if len(chd_cases) >= 5 and len(normal_cases) >= 5:
            break

    print(f"Found {len(chd_cases)} CHD cases, {len(normal_cases)} normal cases\n")

    # Load model
    device = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
    model = hybrid_model_small(num_conditions=4)
    ckpt = torch.load('ml/training/checkpoints/best_hybrid_20251225_091556.pt',
                      map_location=device, weights_only=False)
    model.load_state_dict(ckpt['model_state_dict'])
    model = model.to(device)
    model.eval()

    # Test CHD cases
    print("="*60)
    print("CHD POSITIVE CASES (should predict HIGH probability)")
    print("="*60)

    chd_probs = []
    for idx, metadata in chd_cases[:5]:
        signal, labels, lead_mask, age, _ = test_dataset[idx]

        signal_t = signal.unsqueeze(0).to(device)
        lead_mask_t = lead_mask.unsqueeze(0).to(device)
        age_t = age.unsqueeze(0).to(device)
        rule_features = torch.zeros(1, 30, device=device)

        with torch.no_grad():
            logits = model(signal_t, rule_features, lead_mask_t, age_t)
            probs = torch.sigmoid(logits).cpu().numpy()[0]

        chd_prob = probs[0]
        chd_probs.append(chd_prob)
        status = "POSITIVE" if chd_prob >= 0.484 else "negative"

        print(f"  {metadata['filename']:20} age={metadata['age_days']:4}d  CHD={chd_prob*100:5.1f}%  [{status}]")

    # Test normal cases
    print("\n" + "="*60)
    print("NORMAL CASES (should predict LOW probability)")
    print("="*60)

    normal_probs = []
    for idx, metadata in normal_cases[:5]:
        signal, labels, lead_mask, age, _ = test_dataset[idx]

        signal_t = signal.unsqueeze(0).to(device)
        lead_mask_t = lead_mask.unsqueeze(0).to(device)
        age_t = age.unsqueeze(0).to(device)
        rule_features = torch.zeros(1, 30, device=device)

        with torch.no_grad():
            logits = model(signal_t, rule_features, lead_mask_t, age_t)
            probs = torch.sigmoid(logits).cpu().numpy()[0]

        chd_prob = probs[0]
        normal_probs.append(chd_prob)
        status = "POSITIVE" if chd_prob >= 0.484 else "negative"

        print(f"  {metadata['filename']:20} age={metadata['age_days']:4}d  CHD={chd_prob*100:5.1f}%  [{status}]")

    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print(f"CHD cases mean probability:    {np.mean(chd_probs)*100:.1f}%")
    print(f"Normal cases mean probability: {np.mean(normal_probs)*100:.1f}%")
    print(f"Separation ratio:              {np.mean(chd_probs)/np.mean(normal_probs):.1f}x")


if __name__ == '__main__':
    main()
