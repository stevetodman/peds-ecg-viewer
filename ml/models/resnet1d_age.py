"""
Age-Aware ResNet-1D for Pediatric ECG Classification
=====================================================
Incorporates patient age as auxiliary input, critical for pediatric ECG interpretation.

Key insight: Normal ECG parameters vary dramatically by age in children:
- Heart rate: 90-180 bpm (neonates) → 60-100 bpm (adolescents)
- QRS axis: +60 to +190° (neonates) → -30 to +90° (adults)
- R-wave dominance: Right (neonates) → Left (children)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional, Tuple


class ResidualBlock1D(nn.Module):
    """Residual block for 1D signals."""

    def __init__(self, in_channels: int, out_channels: int, stride: int = 1, dropout: float = 0.1):
        super().__init__()
        self.conv1 = nn.Conv1d(in_channels, out_channels, kernel_size=7, stride=stride, padding=3, bias=False)
        self.bn1 = nn.BatchNorm1d(out_channels)
        self.conv2 = nn.Conv1d(out_channels, out_channels, kernel_size=7, stride=1, padding=3, bias=False)
        self.bn2 = nn.BatchNorm1d(out_channels)
        self.dropout = nn.Dropout(dropout)

        self.shortcut = nn.Sequential()
        if stride != 1 or in_channels != out_channels:
            self.shortcut = nn.Sequential(
                nn.Conv1d(in_channels, out_channels, kernel_size=1, stride=stride, bias=False),
                nn.BatchNorm1d(out_channels)
            )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.dropout(out)
        out = self.bn2(self.conv2(out))
        out += self.shortcut(x)
        out = F.relu(out)
        return out


class AgeEncoder(nn.Module):
    """
    Encode patient age into a learnable embedding.

    Uses both normalized continuous age and age group embedding for robustness.
    """

    def __init__(self, embedding_dim: int = 32):
        super().__init__()
        self.embedding_dim = embedding_dim

        # Age group embedding (12 pediatric age groups + 1 adult)
        self.age_group_embedding = nn.Embedding(13, embedding_dim // 2)

        # Continuous age projection
        self.age_continuous = nn.Sequential(
            nn.Linear(1, embedding_dim // 2),
            nn.ReLU(),
            nn.Linear(embedding_dim // 2, embedding_dim // 2)
        )

        # Fusion layer
        self.fusion = nn.Sequential(
            nn.Linear(embedding_dim, embedding_dim),
            nn.ReLU(),
            nn.Dropout(0.1)
        )

    def forward(self, age_days: torch.Tensor) -> torch.Tensor:
        """
        Args:
            age_days: Patient age in days, shape (batch_size,)

        Returns:
            Age embedding, shape (batch_size, embedding_dim)
        """
        # Normalize age (log scale works well for pediatric range)
        # Add 1 to avoid log(0), max age ~18 years = 6570 days
        age_normalized = torch.log1p(age_days.float()) / 9.0  # log(6570) ≈ 8.8
        age_normalized = age_normalized.unsqueeze(-1)

        # Get age group index
        age_group = self._get_age_group(age_days)

        # Embeddings
        continuous_emb = self.age_continuous(age_normalized)
        group_emb = self.age_group_embedding(age_group)

        # Concatenate and fuse
        combined = torch.cat([continuous_emb, group_emb], dim=-1)
        return self.fusion(combined)

    def _get_age_group(self, age_days: torch.Tensor) -> torch.Tensor:
        """Map age in days to age group index (0-12)."""
        age_group = torch.zeros_like(age_days, dtype=torch.long)

        # Pediatric age groups (matching GEMUSE)
        age_group = torch.where(age_days <= 7, torch.tensor(0, device=age_days.device), age_group)
        age_group = torch.where((age_days > 7) & (age_days <= 30), torch.tensor(1, device=age_days.device), age_group)
        age_group = torch.where((age_days > 30) & (age_days <= 90), torch.tensor(2, device=age_days.device), age_group)
        age_group = torch.where((age_days > 90) & (age_days <= 180), torch.tensor(3, device=age_days.device), age_group)
        age_group = torch.where((age_days > 180) & (age_days <= 365), torch.tensor(4, device=age_days.device), age_group)
        age_group = torch.where((age_days > 365) & (age_days <= 1095), torch.tensor(5, device=age_days.device), age_group)
        age_group = torch.where((age_days > 1095) & (age_days <= 1825), torch.tensor(6, device=age_days.device), age_group)
        age_group = torch.where((age_days > 1825) & (age_days <= 2920), torch.tensor(7, device=age_days.device), age_group)
        age_group = torch.where((age_days > 2920) & (age_days <= 4380), torch.tensor(8, device=age_days.device), age_group)
        age_group = torch.where((age_days > 4380) & (age_days <= 5840), torch.tensor(9, device=age_days.device), age_group)
        age_group = torch.where((age_days > 5840) & (age_days <= 6570), torch.tensor(10, device=age_days.device), age_group)
        age_group = torch.where(age_days > 6570, torch.tensor(11, device=age_days.device), age_group)

        return age_group


class AgeAwareResNet1D(nn.Module):
    """
    ResNet-1D with age as auxiliary input.

    Architecture:
        ECG Signal (12 leads × 5000 samples)
                ↓
        ResNet-1D Encoder
                ↓
        ECG Embedding (hidden_dim)
                ↓
        Concatenate with Age Embedding (age_embed_dim)
                ↓
        Classification Head
                ↓
        Output
    """

    # Model size configurations
    CONFIGS = {
        'small': {'channels': [64, 128, 256, 512], 'blocks': [1, 1, 1, 1]},
        'medium': {'channels': [64, 128, 256, 512], 'blocks': [2, 2, 2, 2]},
        'large': {'channels': [64, 128, 256, 512, 512], 'blocks': [2, 2, 2, 2, 2]},
    }

    def __init__(
        self,
        in_channels: int = 12,
        num_classes: int = 1,
        model_size: str = 'medium',
        dropout: float = 0.3,
        age_embed_dim: int = 32,
    ):
        super().__init__()

        config = self.CONFIGS[model_size]
        channels = config['channels']
        blocks = config['blocks']

        self.age_embed_dim = age_embed_dim
        self.model_size = model_size

        # Initial convolution
        self.conv1 = nn.Conv1d(in_channels, 64, kernel_size=15, stride=2, padding=7, bias=False)
        self.bn1 = nn.BatchNorm1d(64)
        self.pool1 = nn.MaxPool1d(kernel_size=3, stride=2, padding=1)

        # Residual layers
        self.layers = nn.ModuleList()
        in_ch = 64
        for i, (out_ch, num_blocks) in enumerate(zip(channels, blocks)):
            stride = 2 if i > 0 else 1
            layer = self._make_layer(in_ch, out_ch, num_blocks, stride, dropout)
            self.layers.append(layer)
            in_ch = out_ch

        # Global pooling
        self.global_pool = nn.AdaptiveAvgPool1d(1)

        # Age encoder
        self.age_encoder = AgeEncoder(embedding_dim=age_embed_dim)

        # Classification head (ECG features + age features)
        hidden_dim = channels[-1]
        combined_dim = hidden_dim + age_embed_dim

        self.classifier = nn.Sequential(
            nn.Linear(combined_dim, 256),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(256, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, num_classes)
        )

        self._init_weights()

    def _make_layer(self, in_channels: int, out_channels: int, num_blocks: int, stride: int, dropout: float) -> nn.Sequential:
        layers = [ResidualBlock1D(in_channels, out_channels, stride, dropout)]
        for _ in range(1, num_blocks):
            layers.append(ResidualBlock1D(out_channels, out_channels, 1, dropout))
        return nn.Sequential(*layers)

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Conv1d):
                nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='relu')
            elif isinstance(m, nn.BatchNorm1d):
                nn.init.constant_(m.weight, 1)
                nn.init.constant_(m.bias, 0)
            elif isinstance(m, nn.Linear):
                nn.init.xavier_normal_(m.weight)
                if m.bias is not None:
                    nn.init.constant_(m.bias, 0)

    def forward(self, x: torch.Tensor, age_days: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: ECG signal, shape (batch_size, 12, seq_len)
            age_days: Patient age in days, shape (batch_size,)

        Returns:
            Logits, shape (batch_size, num_classes)
        """
        # ECG encoder
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.pool1(out)

        for layer in self.layers:
            out = layer(out)

        out = self.global_pool(out)
        ecg_features = out.squeeze(-1)

        # Age encoder
        age_features = self.age_encoder(age_days)

        # Concatenate and classify
        combined = torch.cat([ecg_features, age_features], dim=-1)
        logits = self.classifier(combined)

        return logits

    def get_ecg_embedding(self, x: torch.Tensor) -> torch.Tensor:
        """Extract ECG embedding without age (for analysis)."""
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.pool1(out)

        for layer in self.layers:
            out = layer(out)

        out = self.global_pool(out)
        return out.squeeze(-1)


def create_age_aware_model(
    model_size: str = 'medium',
    num_classes: int = 1,
    dropout: float = 0.3,
) -> AgeAwareResNet1D:
    """Factory function to create age-aware model."""
    return AgeAwareResNet1D(
        in_channels=12,
        num_classes=num_classes,
        model_size=model_size,
        dropout=dropout,
    )


if __name__ == '__main__':
    # Test the model
    model = create_age_aware_model('medium')

    # Count parameters
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)

    print(f"Model: AgeAwareResNet1D (medium)")
    print(f"Total parameters: {total_params:,}")
    print(f"Trainable parameters: {trainable_params:,}")

    # Test forward pass
    batch_size = 4
    seq_len = 5000
    x = torch.randn(batch_size, 12, seq_len)
    age = torch.tensor([30, 365, 1825, 5000])  # Various ages in days

    output = model(x, age)
    print(f"Input shape: {x.shape}")
    print(f"Age shape: {age.shape}")
    print(f"Output shape: {output.shape}")
