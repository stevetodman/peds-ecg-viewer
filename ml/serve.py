"""
ML Model Server
================
Flask API for serving pediatric ECG predictions.

Usage:
    python -m ml.serve

Endpoints:
    POST /predict - Get predictions for an ECG
    GET /health - Check server status
"""
import os
import torch
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

from ml.models.hybrid_model import hybrid_model_small
from ml.data.dataset_multilabel import CONDITION_NAMES

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from demo.html

# Global model instance
model = None
device = None
thresholds = None

# Age group warnings
def get_age_warning(age_days: int) -> dict:
    """Return warning if age group has reduced accuracy."""
    if age_days <= 28:
        return {
            'level': 'warning',
            'message': 'Neonatal predictions less reliable (limited training data)',
            'accuracy_note': 'AUROC ~0.61 vs ~0.85 for older children'
        }
    return None


def load_model():
    """Load the trained model."""
    global model, device, thresholds

    device = torch.device('cuda' if torch.cuda.is_available() else
                          'mps' if torch.backends.mps.is_available() else 'cpu')
    print(f"Using device: {device}")

    model = hybrid_model_small(num_conditions=4)

    checkpoint_path = 'ml/training/checkpoints/best_hybrid_20251225_091556.pt'
    if not os.path.exists(checkpoint_path):
        raise FileNotFoundError(f"Checkpoint not found: {checkpoint_path}")

    ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt['model_state_dict'])
    model = model.to(device)
    model.eval()

    thresholds = ckpt.get('thresholds', {
        'CHD': {'balanced': 0.5},
        'Kawasaki': {'balanced': 0.5},
        'Cardiomyopathy': {'balanced': 0.5},
    })

    print(f"Model loaded from epoch {ckpt['epoch']}")
    print(f"Thresholds: {thresholds}")
    return True


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'ok',
        'model_loaded': model is not None,
        'device': str(device) if device else None,
    })


@app.route('/predict', methods=['POST'])
def predict():
    """
    Predict conditions from ECG signal.

    Request body:
    {
        "signal": [[...], [...], ...],  // 12 leads x N samples (µV)
        "sample_rate": 500,              // Hz
        "age_days": 1000,                // Patient age in days
        "lead_mask": [1,1,1,1,1,1,1,1,1,1,1,1]  // Optional: which leads present
    }

    Response:
    {
        "predictions": [
            {"condition": "CHD", "probability": 0.85, "positive": true, "threshold": 0.48},
            ...
        ],
        "warnings": [...],
        "model_info": {...}
    }
    """
    if model is None:
        return jsonify({'error': 'Model not loaded'}), 500

    try:
        data = request.json

        # Parse input
        signal = np.array(data['signal'], dtype=np.float32)
        sample_rate = data.get('sample_rate', 500)
        age_days = data.get('age_days', 365 * 5)  # Default: 5 years
        lead_mask = data.get('lead_mask', [1] * 12)

        # Validate signal shape
        if signal.shape[0] != 12:
            return jsonify({'error': f'Expected 12 leads, got {signal.shape[0]}'}), 400

        # Resample to 5000 samples (10 sec at 500 Hz) if needed
        target_length = 5000
        if signal.shape[1] != target_length:
            # Simple linear interpolation
            x_old = np.linspace(0, 1, signal.shape[1])
            x_new = np.linspace(0, 1, target_length)
            signal_resampled = np.zeros((12, target_length), dtype=np.float32)
            for i in range(12):
                signal_resampled[i] = np.interp(x_new, x_old, signal[i])
            signal = signal_resampled

        # Normalize signal (same as training)
        signal = signal / 1000.0  # µV to mV
        for i in range(12):
            lead = signal[i]
            signal[i] = (lead - lead.mean()) / (lead.std() + 1e-6)

        # Prepare tensors
        signal_t = torch.tensor(signal, dtype=torch.float32).unsqueeze(0).to(device)
        lead_mask_t = torch.tensor(lead_mask, dtype=torch.float32).unsqueeze(0).to(device)
        age_normalized = min(age_days / 5110.0, 1.0)
        age_t = torch.tensor([[age_normalized]], dtype=torch.float32).to(device)
        rule_features = torch.zeros(1, 30, device=device)

        # Run inference
        with torch.no_grad():
            logits = model(signal_t, rule_features, lead_mask_t, age_t)
            probs = torch.sigmoid(logits).cpu().numpy()[0]

        # Build response
        predictions = []
        condition_map = {0: 'CHD', 1: 'Myocarditis', 2: 'Kawasaki', 3: 'Cardiomyopathy'}

        for idx, (prob, cond_name) in enumerate(zip(probs, CONDITION_NAMES)):
            display_name = condition_map.get(idx, cond_name)

            # Skip deprecated myocarditis
            if idx == 1:
                continue

            thresh_info = thresholds.get(display_name, {})
            threshold = float(thresh_info.get('balanced', 0.5))  # Convert to Python float

            predictions.append({
                'condition': display_name,
                'probability': float(prob),
                'positive': bool(prob >= threshold),
                'threshold': threshold,
            })

        # Check for warnings
        warnings = []
        age_warning = get_age_warning(age_days)
        if age_warning:
            warnings.append(age_warning)

        n_leads = sum(lead_mask)
        if n_leads < 12:
            warnings.append({
                'level': 'info',
                'message': f'{n_leads}-lead ECG detected',
                'accuracy_note': 'Slightly reduced accuracy (0.79 vs 0.87 AUROC)'
            })

        return jsonify({
            'predictions': predictions,
            'warnings': warnings,
            'model_info': {
                'version': '1.0.0',
                'checkpoint': 'best_hybrid_20251225_091556',
                'conditions': ['CHD', 'Kawasaki', 'Cardiomyopathy'],
                'deprecated': ['Myocarditis'],
            }
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("Loading model...")
    load_model()
    print("\nStarting server on http://localhost:5050")
    print("Endpoints:")
    print("  GET  /health  - Check server status")
    print("  POST /predict - Get ECG predictions")
    app.run(host='0.0.0.0', port=5050, debug=False)
