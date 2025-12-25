"""
Tests for ML model loading and inference.
"""
import pytest
import torch
import numpy as np


class TestModelLoading:
    """Test model checkpoint loading."""

    def test_checkpoint_exists(self, checkpoint_path):
        """Checkpoint file should exist."""
        import os
        assert os.path.exists(checkpoint_path), f"Checkpoint not found: {checkpoint_path}"

    def test_model_loads(self, model):
        """Model should load without errors."""
        assert model is not None

    def test_model_in_eval_mode(self, model):
        """Model should be in evaluation mode."""
        assert not model.training


class TestModelInference:
    """Test model forward pass."""

    def test_output_shape(self, model, device, sample_signal):
        """Output should have shape (batch, 4) for 4 conditions."""
        signal = torch.tensor(sample_signal).unsqueeze(0).to(device)
        lead_mask = torch.ones(1, 12, device=device)
        age = torch.tensor([[0.5]], device=device)  # Normalized age
        rule_features = torch.zeros(1, 30, device=device)

        with torch.no_grad():
            output = model(signal, rule_features, lead_mask, age)

        assert output.shape == (1, 4), f"Expected (1, 4), got {output.shape}"

    def test_output_range_logits(self, model, device, sample_signal):
        """Raw output should be logits (unbounded)."""
        signal = torch.tensor(sample_signal).unsqueeze(0).to(device)
        lead_mask = torch.ones(1, 12, device=device)
        age = torch.tensor([[0.5]], device=device)
        rule_features = torch.zeros(1, 30, device=device)

        with torch.no_grad():
            logits = model(signal, rule_features, lead_mask, age)

        # Logits can be any value, but should be finite
        assert torch.isfinite(logits).all(), "Logits contain NaN or Inf"

    def test_probabilities_in_range(self, model, device, sample_signal):
        """Sigmoid of output should be in [0, 1]."""
        signal = torch.tensor(sample_signal).unsqueeze(0).to(device)
        lead_mask = torch.ones(1, 12, device=device)
        age = torch.tensor([[0.5]], device=device)
        rule_features = torch.zeros(1, 30, device=device)

        with torch.no_grad():
            logits = model(signal, rule_features, lead_mask, age)
            probs = torch.sigmoid(logits)

        assert (probs >= 0).all() and (probs <= 1).all(), "Probabilities out of range"

    def test_batch_inference(self, model, device, sample_signal):
        """Model should handle batch inference."""
        batch_size = 4
        signal = torch.tensor(sample_signal).unsqueeze(0).repeat(batch_size, 1, 1).to(device)
        lead_mask = torch.ones(batch_size, 12, device=device)
        age = torch.tensor([[0.5]] * batch_size, device=device)
        rule_features = torch.zeros(batch_size, 30, device=device)

        with torch.no_grad():
            output = model(signal, rule_features, lead_mask, age)

        assert output.shape == (batch_size, 4), f"Expected ({batch_size}, 4), got {output.shape}"

    def test_9lead_inference(self, model, device, sample_signal, sample_9lead_mask):
        """Model should handle 9-lead input."""
        signal = torch.tensor(sample_signal).unsqueeze(0).to(device)
        lead_mask = torch.tensor(sample_9lead_mask, dtype=torch.float32).unsqueeze(0).to(device)
        age = torch.tensor([[0.5]], device=device)
        rule_features = torch.zeros(1, 30, device=device)

        with torch.no_grad():
            output = model(signal, rule_features, lead_mask, age)
            probs = torch.sigmoid(output)

        assert output.shape == (1, 4)
        assert (probs >= 0).all() and (probs <= 1).all()


class TestModelDeterminism:
    """Test model produces consistent outputs."""

    def test_same_input_same_output(self, model, device, sample_signal):
        """Same input should produce same output."""
        signal = torch.tensor(sample_signal).unsqueeze(0).to(device)
        lead_mask = torch.ones(1, 12, device=device)
        age = torch.tensor([[0.5]], device=device)
        rule_features = torch.zeros(1, 30, device=device)

        with torch.no_grad():
            output1 = model(signal, rule_features, lead_mask, age)
            output2 = model(signal, rule_features, lead_mask, age)

        assert torch.allclose(output1, output2), "Model outputs differ for same input"
