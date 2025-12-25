"""
Hybrid Rule+Neural Model for Pediatric ECG Classification
=========================================================

Combines:
1. ResNet-1D neural embeddings (512-dim)
2. Rule-based features from GEMUSE (30-dim)
3. Age embedding (16-dim)
4. Lead configuration embedding (8-dim)

Into multi-label predictions for 4 conditions:
- CHD, Myocarditis, Kawasaki, Cardiomyopathy
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional, Tuple

from ml.models.resnet1d import ResNet1D, resnet1d_small, resnet1d_medium


class AgeEmbedding(nn.Module):
    """
    Embeds normalized age (0-1) into a higher-dimensional space.

    Age is critical for pediatric ECG interpretation:
    - Neonates: HR 100-190, rightward axis, RV dominance
    - Infants: HR 95-170, transitioning axis
    - Children: HR 60-140, adult-like patterns
    - Adolescents: HR 50-105, adult patterns
    """

    def __init__(self, embed_dim: int = 16):
        super().__init__()
        self.embed = nn.Sequential(
            nn.Linear(1, 32),
            nn.ReLU(inplace=True),
            nn.Linear(32, embed_dim),
        )

    def forward(self, age: torch.Tensor) -> torch.Tensor:
        """
        Args:
            age: Normalized age tensor of shape (batch, 1)
        Returns:
            Age embedding of shape (batch, embed_dim)
        """
        return self.embed(age)


class LeadConfigEmbedding(nn.Module):
    """
    Embeds lead configuration (which leads are present).

    Important because:
    - 9-lead ECGs (missing V2, V4, V6) are common in neonates
    - Model needs to know which inputs are real vs. zero-padded
    """

    def __init__(self, n_leads: int = 12, embed_dim: int = 8):
        super().__init__()
        self.embed = nn.Sequential(
            nn.Linear(n_leads, 24),
            nn.ReLU(inplace=True),
            nn.Linear(24, embed_dim),
        )

    def forward(self, lead_mask: torch.Tensor) -> torch.Tensor:
        """
        Args:
            lead_mask: Binary mask of shape (batch, n_leads)
        Returns:
            Lead config embedding of shape (batch, embed_dim)
        """
        return self.embed(lead_mask)


class RuleFeatureEncoder(nn.Module):
    """
    Encodes rule-based features into a compact representation.

    Input features (30-dim):
    - 12 raw measurements (normalized)
    - 12 z-scores against age norms
    - 6 derived binary features
    """

    def __init__(self, input_dim: int = 30, hidden_dim: int = 64, output_dim: int = 32):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.ReLU(inplace=True),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, output_dim),
            nn.LayerNorm(output_dim),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: Rule features of shape (batch, 30)
        Returns:
            Encoded features of shape (batch, output_dim)
        """
        return self.encoder(x)


class HybridFusionModel(nn.Module):
    """
    Hybrid model combining neural and rule-based features.

    Architecture:
        ECG Signal (12 x 5000) -> ResNet-1D -> Neural Embedding (512)
        Rule Features (30) -> Encoder -> Rule Embedding (32)
        Age (1) -> Embedding -> Age Embedding (16)
        Lead Mask (12) -> Embedding -> Lead Embedding (8)

        Concatenate: 512 + 32 + 16 + 8 = 568-dim

        Fusion MLP -> 4 condition probabilities
    """

    def __init__(
        self,
        num_conditions: int = 4,
        resnet_size: str = 'medium',
        neural_embed_dim: int = 512,
        rule_embed_dim: int = 32,
        age_embed_dim: int = 16,
        lead_embed_dim: int = 8,
        fusion_hidden_dim: int = 256,
        dropout: float = 0.3,
        enable_mc_dropout: bool = True,
    ):
        """
        Args:
            num_conditions: Number of output conditions (4)
            resnet_size: 'small' or 'medium' ResNet backbone
            neural_embed_dim: Dimension of neural embedding
            rule_embed_dim: Dimension of rule feature encoding
            age_embed_dim: Dimension of age embedding
            lead_embed_dim: Dimension of lead config embedding
            fusion_hidden_dim: Hidden dimension in fusion MLP
            dropout: Dropout rate
            enable_mc_dropout: Whether to enable MC Dropout for uncertainty
        """
        super().__init__()

        self.num_conditions = num_conditions
        self.enable_mc_dropout = enable_mc_dropout

        # Neural encoder (ResNet-1D backbone)
        if resnet_size == 'small':
            base_model = resnet1d_small(in_channels=12, num_classes=num_conditions)
            neural_embed_dim = 256  # Small model has 32*8 = 256 features
        else:
            base_model = resnet1d_medium(in_channels=12, num_classes=num_conditions)
            neural_embed_dim = 512  # Medium model has 64*8 = 512 features

        # Use ResNet as encoder (remove final fc layer)
        self.neural_encoder = base_model
        self.neural_embed_dim = neural_embed_dim

        # Auxiliary encoders
        self.rule_encoder = RuleFeatureEncoder(
            input_dim=30, hidden_dim=64, output_dim=rule_embed_dim
        )
        self.age_encoder = AgeEmbedding(embed_dim=age_embed_dim)
        self.lead_encoder = LeadConfigEmbedding(n_leads=12, embed_dim=lead_embed_dim)

        # Total fused dimension
        fused_dim = neural_embed_dim + rule_embed_dim + age_embed_dim + lead_embed_dim

        # Fusion MLP
        self.fusion = nn.Sequential(
            nn.Linear(fused_dim, fusion_hidden_dim),
            nn.LayerNorm(fusion_hidden_dim),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(fusion_hidden_dim, fusion_hidden_dim // 2),
            nn.LayerNorm(fusion_hidden_dim // 2),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(fusion_hidden_dim // 2, num_conditions),
        )

        # Store dimensions for logging
        self.fused_dim = fused_dim
        self.rule_embed_dim = rule_embed_dim
        self.age_embed_dim = age_embed_dim
        self.lead_embed_dim = lead_embed_dim

    def forward(
        self,
        signal: torch.Tensor,
        rule_features: torch.Tensor,
        lead_mask: torch.Tensor,
        age: torch.Tensor,
    ) -> torch.Tensor:
        """
        Forward pass.

        Args:
            signal: ECG signal (batch, 12, 5000)
            rule_features: Rule-based features (batch, 30)
            lead_mask: Binary lead mask (batch, 12)
            age: Normalized age (batch, 1)

        Returns:
            Logits for each condition (batch, num_conditions)
        """
        # Neural embedding from ResNet
        neural_emb = self.neural_encoder.get_embedding(signal)  # (batch, neural_embed_dim)

        # Rule-based embedding
        rule_emb = self.rule_encoder(rule_features)  # (batch, rule_embed_dim)

        # Age embedding
        age_emb = self.age_encoder(age)  # (batch, age_embed_dim)

        # Lead config embedding
        lead_emb = self.lead_encoder(lead_mask)  # (batch, lead_embed_dim)

        # Concatenate all embeddings
        fused = torch.cat([neural_emb, rule_emb, age_emb, lead_emb], dim=1)

        # Classification
        logits = self.fusion(fused)

        return logits

    def forward_with_uncertainty(
        self,
        signal: torch.Tensor,
        rule_features: torch.Tensor,
        lead_mask: torch.Tensor,
        age: torch.Tensor,
        n_samples: int = 10,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Forward pass with MC Dropout for uncertainty estimation.

        Args:
            signal: ECG signal (batch, 12, 5000)
            rule_features: Rule-based features (batch, 30)
            lead_mask: Binary lead mask (batch, 12)
            age: Normalized age (batch, 1)
            n_samples: Number of MC samples

        Returns:
            Tuple of (mean_probs, std_probs) each of shape (batch, num_conditions)
        """
        if not self.enable_mc_dropout:
            probs = torch.sigmoid(self.forward(signal, rule_features, lead_mask, age))
            return probs, torch.zeros_like(probs)

        # Enable dropout during inference
        self.train()  # Sets dropout layers to training mode

        samples = []
        for _ in range(n_samples):
            logits = self.forward(signal, rule_features, lead_mask, age)
            probs = torch.sigmoid(logits)
            samples.append(probs)

        samples = torch.stack(samples, dim=0)  # (n_samples, batch, num_conditions)

        mean_probs = samples.mean(dim=0)
        std_probs = samples.std(dim=0)

        return mean_probs, std_probs

    def get_embeddings(
        self,
        signal: torch.Tensor,
        rule_features: torch.Tensor,
        lead_mask: torch.Tensor,
        age: torch.Tensor,
    ) -> dict:
        """
        Get all intermediate embeddings for analysis.

        Returns dict with:
        - neural_emb: (batch, neural_embed_dim)
        - rule_emb: (batch, rule_embed_dim)
        - age_emb: (batch, age_embed_dim)
        - lead_emb: (batch, lead_embed_dim)
        - fused_emb: (batch, fused_dim)
        """
        neural_emb = self.neural_encoder.get_embedding(signal)
        rule_emb = self.rule_encoder(rule_features)
        age_emb = self.age_encoder(age)
        lead_emb = self.lead_encoder(lead_mask)

        fused = torch.cat([neural_emb, rule_emb, age_emb, lead_emb], dim=1)

        return {
            'neural_emb': neural_emb,
            'rule_emb': rule_emb,
            'age_emb': age_emb,
            'lead_emb': lead_emb,
            'fused_emb': fused,
        }


class WeightedBCELoss(nn.Module):
    """
    Weighted Binary Cross-Entropy Loss for multi-label classification.

    Uses per-class positive weights to handle class imbalance.
    """

    def __init__(self, pos_weights: torch.Tensor, tau: float = 100.0):
        """
        Args:
            pos_weights: Positive class weights for each condition
            tau: Maximum weight cap (from benchmark paper)
        """
        super().__init__()
        self.pos_weights = torch.clamp(pos_weights, max=tau)

    def forward(
        self,
        logits: torch.Tensor,
        targets: torch.Tensor,
    ) -> torch.Tensor:
        """
        Args:
            logits: Raw model outputs (batch, num_conditions)
            targets: Binary targets (batch, num_conditions)

        Returns:
            Scalar loss
        """
        # Move pos_weights to same device as logits
        pos_weights = self.pos_weights.to(logits.device)

        # Binary cross-entropy with logits
        loss = F.binary_cross_entropy_with_logits(
            logits, targets, pos_weight=pos_weights, reduction='mean'
        )

        return loss


def hybrid_model_small(num_conditions: int = 4, dropout: float = 0.3) -> HybridFusionModel:
    """Small hybrid model for faster training."""
    return HybridFusionModel(
        num_conditions=num_conditions,
        resnet_size='small',
        rule_embed_dim=32,
        age_embed_dim=16,
        lead_embed_dim=8,
        fusion_hidden_dim=128,
        dropout=dropout,
    )


def hybrid_model_medium(num_conditions: int = 4, dropout: float = 0.3) -> HybridFusionModel:
    """Medium hybrid model (recommended)."""
    return HybridFusionModel(
        num_conditions=num_conditions,
        resnet_size='medium',
        rule_embed_dim=32,
        age_embed_dim=16,
        lead_embed_dim=8,
        fusion_hidden_dim=256,
        dropout=dropout,
    )


if __name__ == "__main__":
    print("Testing HybridFusionModel")
    print("=" * 50)

    # Create model
    model = hybrid_model_medium(num_conditions=4)

    # Count parameters
    n_params = sum(p.numel() for p in model.parameters())
    print(f"Total parameters: {n_params:,}")
    print(f"Fused dimension: {model.fused_dim}")
    print(f"  - Neural: {model.neural_embed_dim}")
    print(f"  - Rule: {model.rule_embed_dim}")
    print(f"  - Age: {model.age_embed_dim}")
    print(f"  - Lead: {model.lead_embed_dim}")

    # Test forward pass
    batch_size = 4
    signal = torch.randn(batch_size, 12, 5000)
    rule_features = torch.randn(batch_size, 30)
    lead_mask = torch.ones(batch_size, 12)
    lead_mask[:, [7, 9, 11]] = 0  # Simulate 9-lead
    age = torch.rand(batch_size, 1)

    print(f"\nInput shapes:")
    print(f"  Signal: {signal.shape}")
    print(f"  Rule features: {rule_features.shape}")
    print(f"  Lead mask: {lead_mask.shape}")
    print(f"  Age: {age.shape}")

    # Forward pass
    logits = model(signal, rule_features, lead_mask, age)
    probs = torch.sigmoid(logits)

    print(f"\nOutput:")
    print(f"  Logits shape: {logits.shape}")
    print(f"  Probabilities: {probs[0].detach().numpy()}")

    # Test MC Dropout uncertainty
    print(f"\nMC Dropout uncertainty (n=10):")
    mean_probs, std_probs = model.forward_with_uncertainty(
        signal, rule_features, lead_mask, age, n_samples=10
    )
    print(f"  Mean probs: {mean_probs[0].detach().numpy()}")
    print(f"  Std probs:  {std_probs[0].detach().numpy()}")

    # Test embeddings
    print(f"\nIntermediate embeddings:")
    embeddings = model.get_embeddings(signal, rule_features, lead_mask, age)
    for name, emb in embeddings.items():
        print(f"  {name}: {emb.shape}")

    # Test loss
    print(f"\nWeighted BCE Loss:")
    pos_weights = torch.tensor([4.45, 52.42, 73.33, 88.98])
    criterion = WeightedBCELoss(pos_weights)
    targets = torch.zeros(batch_size, 4)
    targets[0, 0] = 1  # CHD positive
    targets[1, 2] = 1  # Kawasaki positive

    loss = criterion(logits, targets)
    print(f"  Loss: {loss.item():.4f}")
