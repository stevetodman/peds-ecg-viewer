"""
ResNet-1D for ECG Classification
================================

Simple but effective architecture for 1D signals.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class ResidualBlock1D(nn.Module):
    """Basic residual block for 1D signals."""

    def __init__(
        self,
        in_channels: int,
        out_channels: int,
        kernel_size: int = 7,
        stride: int = 1,
        downsample: nn.Module = None,
    ):
        super().__init__()

        padding = kernel_size // 2

        self.conv1 = nn.Conv1d(
            in_channels, out_channels, kernel_size,
            stride=stride, padding=padding, bias=False
        )
        self.bn1 = nn.BatchNorm1d(out_channels)

        self.conv2 = nn.Conv1d(
            out_channels, out_channels, kernel_size,
            stride=1, padding=padding, bias=False
        )
        self.bn2 = nn.BatchNorm1d(out_channels)

        self.downsample = downsample
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        identity = x

        out = self.conv1(x)
        out = self.bn1(out)
        out = self.relu(out)

        out = self.conv2(out)
        out = self.bn2(out)

        if self.downsample is not None:
            identity = self.downsample(x)

        out += identity
        out = self.relu(out)

        return out


class ResNet1D(nn.Module):
    """
    ResNet-1D for ECG classification.

    Args:
        in_channels: Number of input channels (leads)
        num_classes: Number of output classes (1 for binary)
        base_channels: Base number of channels
        layers: Number of blocks in each stage
        kernel_size: Convolution kernel size
    """

    def __init__(
        self,
        in_channels: int = 12,
        num_classes: int = 1,
        base_channels: int = 64,
        layers: list = [2, 2, 2, 2],
        kernel_size: int = 7,
    ):
        super().__init__()

        self.in_channels = base_channels

        # Initial convolution
        self.conv1 = nn.Conv1d(
            in_channels, base_channels, kernel_size=15,
            stride=2, padding=7, bias=False
        )
        self.bn1 = nn.BatchNorm1d(base_channels)
        self.relu = nn.ReLU(inplace=True)
        self.maxpool = nn.MaxPool1d(kernel_size=3, stride=2, padding=1)

        # Residual stages
        self.layer1 = self._make_layer(base_channels, layers[0], kernel_size)
        self.layer2 = self._make_layer(base_channels * 2, layers[1], kernel_size, stride=2)
        self.layer3 = self._make_layer(base_channels * 4, layers[2], kernel_size, stride=2)
        self.layer4 = self._make_layer(base_channels * 8, layers[3], kernel_size, stride=2)

        # Global pooling and classifier
        self.avgpool = nn.AdaptiveAvgPool1d(1)
        self.dropout = nn.Dropout(0.5)
        self.fc = nn.Linear(base_channels * 8, num_classes)

        # Initialize weights
        self._init_weights()

    def _make_layer(
        self,
        out_channels: int,
        blocks: int,
        kernel_size: int,
        stride: int = 1,
    ) -> nn.Sequential:
        downsample = None
        if stride != 1 or self.in_channels != out_channels:
            downsample = nn.Sequential(
                nn.Conv1d(self.in_channels, out_channels, 1, stride=stride, bias=False),
                nn.BatchNorm1d(out_channels),
            )

        layers = [
            ResidualBlock1D(
                self.in_channels, out_channels, kernel_size,
                stride=stride, downsample=downsample
            )
        ]
        self.in_channels = out_channels

        for _ in range(1, blocks):
            layers.append(
                ResidualBlock1D(out_channels, out_channels, kernel_size)
            )

        return nn.Sequential(*layers)

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Conv1d):
                nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='relu')
            elif isinstance(m, nn.BatchNorm1d):
                nn.init.constant_(m.weight, 1)
                nn.init.constant_(m.bias, 0)
            elif isinstance(m, nn.Linear):
                nn.init.normal_(m.weight, 0, 0.01)
                nn.init.constant_(m.bias, 0)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, leads, samples)
        x = self.conv1(x)
        x = self.bn1(x)
        x = self.relu(x)
        x = self.maxpool(x)

        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)

        x = self.avgpool(x)
        x = torch.flatten(x, 1)
        x = self.dropout(x)
        x = self.fc(x)

        return x

    def get_embedding(self, x: torch.Tensor) -> torch.Tensor:
        """Get feature embedding before final classifier."""
        x = self.conv1(x)
        x = self.bn1(x)
        x = self.relu(x)
        x = self.maxpool(x)

        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)

        x = self.avgpool(x)
        x = torch.flatten(x, 1)

        return x


def resnet1d_small(in_channels: int = 12, num_classes: int = 1) -> ResNet1D:
    """Small ResNet-1D (faster training)."""
    return ResNet1D(
        in_channels=in_channels,
        num_classes=num_classes,
        base_channels=32,
        layers=[1, 1, 1, 1],
    )


def resnet1d_medium(in_channels: int = 12, num_classes: int = 1) -> ResNet1D:
    """Medium ResNet-1D (good balance)."""
    return ResNet1D(
        in_channels=in_channels,
        num_classes=num_classes,
        base_channels=64,
        layers=[2, 2, 2, 2],
    )


def resnet1d_large(in_channels: int = 12, num_classes: int = 1) -> ResNet1D:
    """Large ResNet-1D (more capacity)."""
    return ResNet1D(
        in_channels=in_channels,
        num_classes=num_classes,
        base_channels=64,
        layers=[3, 4, 6, 3],
    )


if __name__ == "__main__":
    # Test model
    model = resnet1d_medium(in_channels=12, num_classes=1)

    # Count parameters
    n_params = sum(p.numel() for p in model.parameters())
    print(f"Model parameters: {n_params:,}")

    # Test forward pass
    x = torch.randn(4, 12, 5000)  # batch=4, leads=12, samples=5000
    y = model(x)
    print(f"Input shape: {x.shape}")
    print(f"Output shape: {y.shape}")

    # Test embedding
    emb = model.get_embedding(x)
    print(f"Embedding shape: {emb.shape}")
