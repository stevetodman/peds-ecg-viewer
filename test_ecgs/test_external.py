"""
Test model on external ECG (not from training data).
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import wfdb
import torch
import numpy as np
from ml.models.hybrid_model import hybrid_model_small


def load_and_predict(ecg_path: str, age_days: int = 365*30):
    """Load ECG and run prediction."""

    # Load ECG
    record = wfdb.rdrecord(ecg_path)
    signal = record.p_signal.T  # (leads, samples)

    print(f"ECG: {ecg_path}")
    print(f"Shape: {signal.shape} (leads x samples)")
    print(f"Sample rate: {record.fs} Hz")
    print(f"Duration: {signal.shape[1] / record.fs:.1f} seconds")
    print(f"Leads: {record.sig_name}")

    # Normalize (same as training)
    signal = signal.astype(np.float32)
    for i in range(12):
        lead = signal[i]
        signal[i] = (lead - lead.mean()) / (lead.std() + 1e-6)

    # Load model
    device = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
    model = hybrid_model_small(num_conditions=4)
    ckpt = torch.load('ml/training/checkpoints/best_hybrid_20251225_091556.pt',
                      map_location=device, weights_only=False)
    model.load_state_dict(ckpt['model_state_dict'])
    model = model.to(device)
    model.eval()

    # Prepare inputs
    signal_t = torch.tensor(signal).unsqueeze(0).to(device)
    lead_mask = torch.ones(1, 12, device=device)
    age_norm = min(age_days / 5110.0, 1.0)
    age_t = torch.tensor([[age_norm]], device=device)
    rule_features = torch.zeros(1, 30, device=device)

    # Inference
    with torch.no_grad():
        logits = model(signal_t, rule_features, lead_mask, age_t)
        probs = torch.sigmoid(logits).cpu().numpy()[0]

    # Results
    conditions = ['CHD', 'Myocarditis', 'Kawasaki', 'Cardiomyopathy']
    thresholds = [0.484, 0.5, 0.127, 0.035]

    print(f"\n{'='*50}")
    print(f"PREDICTIONS (age={age_days} days)")
    print(f"{'='*50}")

    for i, (cond, prob, thresh) in enumerate(zip(conditions, probs, thresholds)):
        if cond == 'Myocarditis':
            continue  # Deprecated
        status = "POSITIVE" if prob >= thresh else "negative"
        print(f"{cond:15} {prob*100:5.1f}%  (threshold: {thresh*100:.1f}%)  [{status}]")

    return probs


if __name__ == '__main__':
    print("="*50)
    print("Testing on PTB-XL adult ECG (external data)")
    print("Expected: LOW probabilities (adult, not pediatric)")
    print("="*50 + "\n")

    # Test with adult age (30 years)
    load_and_predict('test_ecgs/00001_hr', age_days=365*30)

    print("\n" + "="*50)
    print("Same ECG, but pretending patient is 5 years old")
    print("="*50 + "\n")

    # Same ECG but with pediatric age
    load_and_predict('test_ecgs/00001_hr', age_days=365*5)
