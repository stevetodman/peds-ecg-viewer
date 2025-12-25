# Pediatric ECG ML Model

Multi-label classification model for detecting cardiac conditions in pediatric ECGs.

## Performance

| Condition | AUROC | 95% CI |
|-----------|-------|--------|
| CHD | 0.848 | 0.827-0.867 |
| Kawasaki | 0.856 | 0.813-0.893 |
| Cardiomyopathy | 0.902 | 0.849-0.949 |

Trained on ZZU-pECG dataset (14,190 ECGs, ages 0-14 years).

## Quick Start

### Start the API server

```bash
python -m ml.serve
```

Server runs on `http://localhost:5050`.

### Make a prediction

```bash
curl -X POST http://localhost:5050/predict \
  -H "Content-Type: application/json" \
  -d '{
    "signal": [[...], [...], ...],
    "age_days": 1825,
    "sample_rate": 500
  }'
```

### Response

```json
{
  "predictions": [
    {"condition": "CHD", "probability": 0.72, "positive": true, "threshold": 0.48},
    {"condition": "Kawasaki", "probability": 0.15, "positive": true, "threshold": 0.13},
    {"condition": "Cardiomyopathy", "probability": 0.02, "positive": false, "threshold": 0.03}
  ],
  "warnings": [],
  "model_info": {"version": "1.0.0", "conditions": ["CHD", "Kawasaki", "Cardiomyopathy"]}
}
```

## API Reference

### GET /health

Check server status.

### POST /predict

Get predictions for an ECG.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| signal | array[12][N] | Yes | 12-lead ECG in microvolts |
| age_days | int | No | Patient age in days (default: 1825) |
| sample_rate | int | No | Sample rate in Hz (default: 500) |
| lead_mask | array[12] | No | Which leads are present (1=yes, 0=no) |

## Limitations

- **Neonates (<28 days):** Reduced accuracy (AUROC ~0.61). Warnings displayed.
- **9-lead ECGs:** Missing V2/V4/V6 reduces accuracy (AUROC 0.79 vs 0.87).
- **Myocarditis:** Deprecated due to insufficient training data.

## Running Tests

```bash
python -m pytest ml/tests/ -v
```

## Files

```
ml/
├── serve.py                  # Flask API server
├── evaluation/
│   └── bootstrap_ci.py       # Confidence interval calculation
├── models/
│   └── hybrid_model.py       # HybridFusionModel architecture
├── training/
│   └── checkpoints/          # Trained model weights
└── tests/                    # Pytest tests
```
