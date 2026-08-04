"""Tests for the fail-closed experimental research API."""

import numpy as np
import pytest
import torch

from ml.serve import ModelRuntime, create_app


class FakeModel:
    def __call__(self, signal, rules, mask, age):
        assert signal.shape == (1, 12, 5000)
        assert rules.shape == (1, 30)
        assert mask.shape == (1, 12)
        assert age.shape == (1, 1)
        return torch.tensor([[0.0, -1.0, 1.0, 2.0]], device=signal.device)


class FakeFeatures:
    extraction_success = True
    error_message = ""

    @staticmethod
    def to_vector():
        return np.full(30, 0.5, dtype=np.float32)


class FakeExtractor:
    def extract(self, signal, age_days):
        assert signal.shape == (12, 5000)
        assert 0 <= age_days <= 14 * 365
        return FakeFeatures()


@pytest.fixture
def client():
    active = ModelRuntime(
        model=FakeModel(),
        extractor=FakeExtractor(),
        checkpoint_sha256="a" * 64,
        checkpoint_id="test-checkpoint",
    )
    app = create_app(model_runtime=active, api_key="test-secret")
    app.config["TESTING"] = True
    return app.test_client()


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer test-secret"}


def payload(signal, age_days=5 * 365):
    return {
        "signal": signal.tolist(),
        "signal_unit": "uv",
        "sample_rate": 500,
        "age_days": age_days,
    }


def test_health_reports_research_status(client):
    assert client.get("/health").get_json() == {
        "status": "ready",
        "model_loaded": True,
        "intended_use": "research_validation_only",
    }


def test_unloaded_model_fails_closed():
    app = create_app(model_runtime=ModelRuntime(), api_key="test-secret")
    response = app.test_client().post("/predict", json={}, headers={"X-API-Key": "test-secret"})
    assert response.status_code == 503


def test_prediction_requires_authentication(client, sample_signal):
    assert client.post("/predict", json=payload(sample_signal)).status_code == 401


def test_valid_request_returns_scores_not_diagnoses(client, auth_headers, sample_signal):
    response = client.post("/predict", json=payload(sample_signal), headers=auth_headers)
    assert response.status_code == 200
    body = response.get_json()
    assert len(body["research_scores"]) == 3
    assert "predictions" not in body
    assert all("positive" not in score for score in body["research_scores"])
    assert body["warnings"][0]["code"] == "NOT_CLINICALLY_VALIDATED"


def test_age_is_required(client, auth_headers, sample_signal):
    body = payload(sample_signal)
    del body["age_days"]
    assert client.post("/predict", json=body, headers=auth_headers).status_code == 400


def test_short_recording_is_rejected(client, auth_headers):
    signal = np.random.default_rng(1).normal(size=(12, 2500)).astype(np.float32)
    assert client.post("/predict", json=payload(signal), headers=auth_headers).status_code == 422


def test_non_finite_signal_is_rejected(client, auth_headers, sample_signal):
    signal = sample_signal.copy()
    signal[0, 0] = np.nan
    assert client.post("/predict", json=payload(signal), headers=auth_headers).status_code == 422


def test_supported_nine_lead_layout_is_explicit(
    client, auth_headers, sample_signal, sample_9lead_mask
):
    signal = sample_signal.copy()
    signal[[7, 9, 11]] = 0
    body = payload(signal)
    body["lead_mask"] = sample_9lead_mask
    response = client.post("/predict", json=body, headers=auth_headers)
    assert response.status_code == 200
    codes = {warning["code"] for warning in response.get_json()["warnings"]}
    assert "NINE_LEAD_INPUT" in codes


def test_neonatal_limitation_is_prominent(client, auth_headers, sample_signal):
    response = client.post("/predict", json=payload(sample_signal, 14), headers=auth_headers)
    codes = {warning["code"] for warning in response.get_json()["warnings"]}
    assert "NEONATAL_SUBGROUP_LIMITATION" in codes
