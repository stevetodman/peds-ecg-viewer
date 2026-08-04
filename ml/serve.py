"""Fail-closed API for the optional experimental pediatric ECG model."""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import numpy as np
import torch
from flask import Flask, jsonify, request
from flask_cors import CORS

from ml.data.dataset_multilabel import CONDITION_NAMES, NINE_LEAD_MISSING
from ml.data.preprocessing import PREPROCESSING_VERSION, PreprocessingError, preprocess_ecg
from ml.models.hybrid_model import hybrid_model_small
from ml.models.rule_features import RuleFeatureExtractor

LOGGER = logging.getLogger(__name__)
MAX_REQUEST_BYTES = 8 * 1024 * 1024
MAX_AGE_DAYS = 14 * 365
EXPECTED_CONDITIONS = list(CONDITION_NAMES)


@dataclass
class ModelRuntime:
    model: Optional[Any] = None
    device: torch.device = field(default_factory=lambda: torch.device("cpu"))
    extractor: Optional[Any] = None
    checkpoint_sha256: Optional[str] = None
    checkpoint_id: Optional[str] = None

    @property
    def ready(self) -> bool:
        return self.model is not None and self.extractor is not None


runtime = ModelRuntime()


def _error(code: str, message: str, status: int):
    return jsonify({"error": {"code": code, "message": message}}), status


def _origins() -> list[str]:
    return [
        value.strip()
        for value in os.environ.get("PED_ECG_ALLOWED_ORIGINS", "").split(",")
        if value.strip()
    ]


def create_app(
    *, model_runtime: Optional[ModelRuntime] = None, api_key: Optional[str] = None
) -> Flask:
    application = Flask(__name__)
    application.config["MAX_CONTENT_LENGTH"] = MAX_REQUEST_BYTES
    application.config["PED_ECG_API_KEY"] = (
        api_key if api_key is not None else os.environ.get("PED_ECG_API_KEY")
    )
    active = model_runtime if model_runtime is not None else runtime
    allowed = _origins()
    if allowed:
        CORS(
            application,
            resources={r"/predict": {"origins": allowed}},
            methods=["POST"],
            allow_headers=["Authorization", "Content-Type", "X-API-Key"],
        )

    @application.errorhandler(413)
    def too_large(_exception):
        return _error("request_too_large", "request body exceeds 8 MiB", 413)

    @application.get("/health")
    def health():
        return jsonify({
            "status": "ready" if active.ready else "not_ready",
            "model_loaded": active.ready,
            "intended_use": "research_validation_only",
        })

    @application.get("/ready")
    def ready():
        if not active.ready:
            return _error("model_unavailable", "no validated checkpoint is loaded", 503)
        if not application.config.get("PED_ECG_API_KEY"):
            return _error("api_not_configured", "PED_ECG_API_KEY is required", 503)
        return jsonify({"status": "ready", "intended_use": "research_validation_only"})

    @application.post("/predict")
    def predict():
        if not active.ready:
            return _error("model_unavailable", "no validated checkpoint is loaded", 503)
        configured_key = application.config.get("PED_ECG_API_KEY")
        if not configured_key:
            return _error("api_not_configured", "PED_ECG_API_KEY is required", 503)
        supplied_key = _request_api_key()
        if not supplied_key or not hmac.compare_digest(supplied_key, configured_key):
            return _error("unauthorized", "valid API credentials are required", 401)
        if not request.is_json:
            return _error("invalid_content_type", "Content-Type must be application/json", 415)
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return _error("invalid_json", "request body must be a JSON object", 400)

        try:
            signal, lead_mask, sample_rate, age_days = _validate_request(data)
            processed = preprocess_ecg(signal, sample_rate, input_unit="uv")
            extracted = active.extractor.extract(processed, age_days)
            if not extracted.extraction_success:
                raise PreprocessingError("rule feature extraction failed; no score was generated")
            rules = np.asarray(extracted.to_vector(), dtype=np.float32)
            if rules.shape != (30,) or not np.isfinite(rules).all():
                raise PreprocessingError("rule features are incomplete or non-finite")

            signal_tensor = torch.from_numpy(processed).unsqueeze(0).to(active.device)
            mask_tensor = torch.from_numpy(lead_mask).unsqueeze(0).to(active.device)
            age_tensor = torch.tensor(
                [[min(age_days / float(MAX_AGE_DAYS), 1.0)]],
                dtype=torch.float32,
                device=active.device,
            )
            rules_tensor = torch.from_numpy(rules).unsqueeze(0).to(active.device)
            with torch.no_grad():
                logits = active.model(signal_tensor, rules_tensor, mask_tensor, age_tensor)
                probabilities = torch.sigmoid(logits).detach().cpu().numpy()[0]
            if probabilities.shape != (len(EXPECTED_CONDITIONS),) or not np.isfinite(probabilities).all():
                raise RuntimeError("model produced an invalid output")
        except PreprocessingError as exc:
            return _error("invalid_ecg", str(exc), 422)
        except (KeyError, TypeError, ValueError) as exc:
            return _error("invalid_request", str(exc), 400)
        except Exception:
            LOGGER.exception("experimental model inference failed")
            return _error("inference_failed", "no score was generated", 500)

        warnings = [{
            "code": "NOT_CLINICALLY_VALIDATED",
            "level": "warning",
            "message": "Research scores only; do not use for diagnosis, triage, or patient care.",
        }]
        if age_days <= 28:
            warnings.append({
                "code": "NEONATAL_SUBGROUP_LIMITATION",
                "level": "warning",
                "message": "Neonatal performance is not adequately validated.",
            })
        if int(lead_mask.sum()) == 9:
            warnings.append({
                "code": "NINE_LEAD_INPUT",
                "level": "warning",
                "message": "Nine-lead subgroup performance requires external validation.",
            })
        return jsonify({
            "research_scores": [
                {"condition": condition, "research_score": float(score)}
                for condition, score in zip(EXPECTED_CONDITIONS, probabilities)
                if condition != "myocarditis"
            ],
            "warnings": warnings,
            "model_info": {
                "checkpoint_id": active.checkpoint_id,
                "checkpoint_sha256": active.checkpoint_sha256,
                "preprocessing_version": PREPROCESSING_VERSION,
                "intended_use": "research_validation_only",
            },
        })

    return application


def _request_api_key() -> Optional[str]:
    authorization = request.headers.get("Authorization", "")
    if authorization.startswith("Bearer "):
        return authorization[7:]
    return request.headers.get("X-API-Key")


def _validate_request(data: dict) -> tuple[np.ndarray, np.ndarray, int, int]:
    required = {"signal", "signal_unit", "sample_rate", "age_days"}
    missing = sorted(required.difference(data))
    if missing:
        raise ValueError(f"missing required field(s): {', '.join(missing)}")
    if data["signal_unit"] != "uv":
        raise ValueError("signal_unit must be 'uv'")
    sample_rate = data["sample_rate"]
    age_days = data["age_days"]
    if isinstance(sample_rate, bool) or not isinstance(sample_rate, int):
        raise ValueError("sample_rate must be an integer in Hz")
    if isinstance(age_days, bool) or not isinstance(age_days, int):
        raise ValueError("age_days must be an integer")
    if not 0 <= age_days <= MAX_AGE_DAYS:
        raise ValueError(f"age_days must be between 0 and {MAX_AGE_DAYS}")
    try:
        signal = np.asarray(data["signal"], dtype=np.float32)
    except (TypeError, ValueError) as exc:
        raise ValueError("signal must be a rectangular numeric array") from exc
    try:
        lead_mask = np.asarray(data.get("lead_mask", [1] * 12), dtype=np.float32)
    except (TypeError, ValueError) as exc:
        raise ValueError("lead_mask must contain twelve binary values") from exc
    if lead_mask.shape != (12,) or not np.isin(lead_mask, [0.0, 1.0]).all():
        raise ValueError("lead_mask must contain twelve binary values")
    count = int(lead_mask.sum())
    if count not in (9, 12):
        raise ValueError("only supported 12-lead and 9-lead layouts are accepted")
    if count == 9:
        missing_indices = {index for index, present in enumerate(lead_mask) if not present}
        if missing_indices != set(NINE_LEAD_MISSING):
            raise ValueError("9-lead input must be missing only V2, V4, and V6")
    if signal.ndim == 2 and signal.shape[0] == 12:
        absent = np.where(lead_mask == 0)[0]
        if absent.size and np.any(signal[absent] != 0):
            raise ValueError("leads marked absent must contain only zero samples")
        present = np.where(lead_mask == 1)[0]
        if any(np.ptp(signal[index]) == 0 for index in present):
            raise ValueError("present leads must not be flat lines")
    return signal, lead_mask, sample_rate, age_days


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_model() -> None:
    if os.environ.get("PED_ECG_ENABLE_EXPERIMENTAL_ML") != "1":
        raise RuntimeError("experimental ML is disabled")
    checkpoint_value = os.environ.get("PED_ECG_CHECKPOINT")
    expected_sha = os.environ.get("PED_ECG_CHECKPOINT_SHA256")
    if not checkpoint_value or not expected_sha:
        raise RuntimeError("PED_ECG_CHECKPOINT and PED_ECG_CHECKPOINT_SHA256 are required")
    path = Path(checkpoint_value).expanduser().resolve(strict=True)
    actual_sha = _sha256(path)
    if not hmac.compare_digest(actual_sha.lower(), expected_sha.lower()):
        raise RuntimeError("checkpoint SHA-256 does not match")
    device = torch.device(
        "cuda" if torch.cuda.is_available() else
        "mps" if hasattr(torch.backends, "mps") and torch.backends.mps.is_available() else
        "cpu"
    )
    checkpoint = torch.load(path, map_location=device, weights_only=True)
    if not isinstance(checkpoint, dict):
        raise RuntimeError("checkpoint must be a state-dictionary bundle")
    required_metadata = {
        "preprocessing_version": PREPROCESSING_VERSION,
        "rule_features": "required",
        "model_architecture": "hybrid_small",
        "conditions": EXPECTED_CONDITIONS,
    }
    for key, expected in required_metadata.items():
        if checkpoint.get(key) != expected:
            raise RuntimeError(f"checkpoint {key} is missing or incompatible")
    loaded = hybrid_model_small(num_conditions=len(EXPECTED_CONDITIONS))
    loaded.load_state_dict(checkpoint["model_state_dict"], strict=True)
    loaded = loaded.to(device)
    loaded.eval()
    runtime.model = loaded
    runtime.device = device
    runtime.extractor = RuleFeatureExtractor(sampling_rate=500)
    runtime.checkpoint_sha256 = actual_sha
    runtime.checkpoint_id = path.stem


app = create_app()


def create_configured_app() -> Flask:
    load_model()
    return create_app()


if __name__ == "__main__":
    if not os.environ.get("PED_ECG_API_KEY"):
        raise RuntimeError("PED_ECG_API_KEY is required")
    load_model()
    app.run(
        host=os.environ.get("PED_ECG_HOST", "127.0.0.1"),
        port=int(os.environ.get("PED_ECG_PORT", "5050")),
        debug=False,
    )
