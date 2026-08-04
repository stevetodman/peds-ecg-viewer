# Experimental pediatric ECG model

This directory is research code. It is **not clinically validated, not a
medical device, and disabled by default**. Do not use output for diagnosis,
screening, triage, treatment, or other patient-care decisions.

## Evidence status

Reported development results are internal, single-center ZZU-pECG evaluation.
They do not establish clinical utility or generalization.

| Condition | Reported internal AUROC | External status |
|---|---:|---|
| CHD | 0.848 | Not adequately validated |
| Kawasaki disease | 0.856 | Not adequately validated |
| Cardiomyopathy | 0.902 | Not adequately validated |
| Myocarditis | Deprecated | Insufficient training data |

Neonatal and nine-lead subgroups have additional limitations. Clinical
readiness requires locked preprocessing and thresholds, independent multicenter
validation, calibration, subgroup confidence intervals, failure analysis,
workflow/usability validation, privacy/security review, and applicable quality
and regulatory processes.

## Safety behavior

- Failed reads and feature extraction stop; they never become zero examples.
- Preprocessing preserves duration and physical amplitude. Short inputs fail.
- Checkpoints declare exact preprocessing, condition order, architecture, and
  real rule-feature use.
- Serving requires an enable flag, checkpoint SHA-256, and API key. CORS is
  denied unless explicit origins are configured.
- The API returns research scores, not diagnoses or binary decisions.

These changes invalidate legacy checkpoints trained with duration warping,
per-lead z-scoring, or zero rule features. Retraining is required.

## Approved research environment only

```bash
export PED_ECG_ENABLE_EXPERIMENTAL_ML=1
export PED_ECG_CHECKPOINT=/absolute/path/to/versioned-checkpoint.pt
export PED_ECG_CHECKPOINT_SHA256=<64-character-sha256>
export PED_ECG_API_KEY=<high-entropy-secret>
gunicorn --bind 127.0.0.1:5050 'ml.serve:create_configured_app()'
```

Optional `PED_ECG_ALLOWED_ORIGINS` is a comma-separated explicit allowlist.
Never use a wildcard. `GET /health` reports status; `GET /ready` verifies model
and authentication configuration.

`POST /predict` requires bearer or `X-API-Key` authentication and:

| Field | Required | Contract |
|---|---|---|
| `signal` | Yes | Rectangular 12×N numeric array |
| `signal_unit` | Yes | Exactly `"uv"` |
| `sample_rate` | Yes | Integer, 100–2000 Hz |
| `age_days` | Yes | Integer, 0–5110 |
| `lead_mask` | No | Twelve binary values; supported 12/9-lead layout |

The service accepts ten to thirty seconds, resamples by real time to 500 Hz,
and deterministically center-crops.

## Tests

```bash
python -m pytest ml/tests -v
```

Unit tests construct deterministic architecture weights. A real checkpoint is
verified separately as a release artifact; an LFS pointer is not evidence.
