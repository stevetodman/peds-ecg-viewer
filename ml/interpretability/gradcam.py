"""
Grad-CAM for 1D ECG Signals
============================
Provides interpretability for the hybrid ECG model.

Usage:
    from ml.interpretability.gradcam import ECGGradCAM

    gradcam = ECGGradCAM(model)
    cam, probs = gradcam.explain(signal, age, lead_mask, condition='CHD')
"""
import torch
import torch.nn.functional as F
import numpy as np
from typing import Optional, Tuple, Union


class ECGGradCAM:
    """Grad-CAM for 1D ECG classification models."""

    CONDITION_MAP = {
        'chd': 0,
        'CHD': 0,
        'myocarditis': 1,
        'kawasaki': 2,
        'Kawasaki': 2,
        'cardiomyopathy': 3,
        'Cardiomyopathy': 3,
    }

    CONDITION_NAMES = ['CHD', 'Myocarditis', 'Kawasaki', 'Cardiomyopathy']

    def __init__(self, model, target_layer=None):
        """
        Initialize Grad-CAM.

        Args:
            model: HybridFusionModel instance
            target_layer: Conv layer to use for CAM (default: last conv in ResNet)
        """
        self.model = model
        self.device = next(model.parameters()).device

        # Default to last conv layer
        if target_layer is None:
            target_layer = model.neural_encoder.layer4[-1].conv2

        self.target_layer = target_layer
        self.gradients = None
        self.activations = None

        # Register hooks
        self._register_hooks()

    def _register_hooks(self):
        """Register forward and backward hooks."""
        self.target_layer.register_forward_hook(self._save_activation)
        self.target_layer.register_full_backward_hook(self._save_gradient)

    def _save_activation(self, module, input, output):
        self.activations = output.detach()

    def _save_gradient(self, module, grad_input, grad_output):
        self.gradients = grad_output[0].detach()

    def explain(
        self,
        signal: Union[torch.Tensor, np.ndarray],
        age: Union[torch.Tensor, np.ndarray, float],
        lead_mask: Optional[Union[torch.Tensor, np.ndarray]] = None,
        condition: Union[str, int] = 'CHD',
        rule_features: Optional[torch.Tensor] = None,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Generate Grad-CAM explanation for a prediction.

        Args:
            signal: ECG signal (12, 5000) or (batch, 12, 5000)
            age: Normalized age (0-1) or age in days
            lead_mask: Binary mask for present leads (12,)
            condition: Condition name or index
            rule_features: Optional rule features (30,)

        Returns:
            cam: Grad-CAM heatmap (5000,) upsampled to signal length
            probs: Predicted probabilities for all conditions (4,)
        """
        self.model.eval()

        # Handle condition
        if isinstance(condition, str):
            condition_idx = self.CONDITION_MAP.get(condition)
            if condition_idx is None:
                raise ValueError(f"Unknown condition: {condition}")
        else:
            condition_idx = condition

        # Prepare signal
        if isinstance(signal, np.ndarray):
            signal = torch.tensor(signal, dtype=torch.float32)
        if signal.dim() == 2:
            signal = signal.unsqueeze(0)
        signal = signal.to(self.device)

        # Prepare age
        if isinstance(age, (int, float)):
            # Assume days if > 1, normalize
            if age > 1:
                age = min(age / 5110.0, 1.0)
            age = torch.tensor([[age]], dtype=torch.float32)
        elif isinstance(age, np.ndarray):
            age = torch.tensor(age, dtype=torch.float32)
        if age.dim() == 1:
            age = age.unsqueeze(0)
        age = age.to(self.device)

        # Prepare lead mask
        if lead_mask is None:
            lead_mask = torch.ones(12, dtype=torch.float32)
        elif isinstance(lead_mask, np.ndarray):
            lead_mask = torch.tensor(lead_mask, dtype=torch.float32)
        if lead_mask.dim() == 1:
            lead_mask = lead_mask.unsqueeze(0)
        lead_mask = lead_mask.to(self.device)

        # Prepare rule features
        if rule_features is None:
            rule_features = torch.zeros(1, 30, device=self.device)
        elif isinstance(rule_features, np.ndarray):
            rule_features = torch.tensor(rule_features, dtype=torch.float32)
        if rule_features.dim() == 1:
            rule_features = rule_features.unsqueeze(0)
        rule_features = rule_features.to(self.device)

        # Forward pass
        self.model.zero_grad()
        output = self.model(signal, rule_features, lead_mask, age)
        probs = torch.sigmoid(output).detach().cpu().numpy()[0]

        # Backward pass for target class
        one_hot = torch.zeros_like(output)
        one_hot[0, condition_idx] = 1
        output.backward(gradient=one_hot)

        # Compute CAM
        weights = self.gradients.mean(dim=2, keepdim=True)
        cam = (weights * self.activations).sum(dim=1)
        cam = F.relu(cam)
        cam = cam - cam.min()
        if cam.max() > 0:
            cam = cam / cam.max()
        cam = cam.cpu().numpy()[0]

        # Upsample to signal length
        signal_len = signal.shape[2]
        cam_upsampled = np.interp(
            np.linspace(0, 1, signal_len),
            np.linspace(0, 1, len(cam)),
            cam
        )

        return cam_upsampled, probs

    def explain_all_conditions(
        self,
        signal: Union[torch.Tensor, np.ndarray],
        age: Union[torch.Tensor, np.ndarray, float],
        lead_mask: Optional[Union[torch.Tensor, np.ndarray]] = None,
    ) -> Tuple[dict, np.ndarray]:
        """
        Generate Grad-CAM for all production conditions.

        Returns:
            cams: Dict of condition name -> CAM heatmap
            probs: Predicted probabilities (4,)
        """
        cams = {}
        probs = None

        for condition in ['CHD', 'Kawasaki', 'Cardiomyopathy']:
            cam, probs = self.explain(signal, age, lead_mask, condition)
            cams[condition] = cam

        return cams, probs


def visualize_gradcam(
    signal: np.ndarray,
    cam: np.ndarray,
    lead_mask: Optional[np.ndarray] = None,
    condition_name: str = '',
    prob: float = 0.0,
    save_path: Optional[str] = None,
    show: bool = True,
):
    """
    Visualize Grad-CAM overlay on ECG signal.

    Args:
        signal: ECG signal (12, 5000)
        cam: Grad-CAM heatmap (5000,)
        lead_mask: Binary mask for present leads
        condition_name: Name of condition for title
        prob: Predicted probability
        save_path: Path to save figure
        show: Whether to display figure
    """
    import matplotlib.pyplot as plt

    lead_names = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF',
                  'V1', 'V2', 'V3', 'V4', 'V5', 'V6']

    if lead_mask is None:
        lead_mask = np.ones(12)

    fig, axes = plt.subplots(4, 3, figsize=(15, 12))
    fig.suptitle(f'{condition_name} | Probability: {prob:.3f}', fontsize=14)

    time = np.linspace(0, 10, signal.shape[1])

    for lead_idx, ax in enumerate(axes.flat):
        lead_signal = signal[lead_idx]

        if lead_mask[lead_idx] < 0.5:
            ax.set_facecolor('#f0f0f0')
            ax.text(5, 0, 'Missing', ha='center', va='center',
                   fontsize=12, color='gray')
        else:
            ax.plot(time, lead_signal, 'k-', linewidth=0.5, alpha=0.8)

            # Overlay CAM
            for t in range(len(time) - 1):
                alpha = cam[t] * 0.7
                ax.axvspan(time[t], time[t+1], alpha=alpha,
                          color='red', linewidth=0)

        ax.set_title(lead_names[lead_idx], fontsize=10)
        ax.set_xlim(0, 10)
        if lead_idx >= 9:
            ax.set_xlabel('Time (s)')
        if lead_idx % 3 == 0:
            ax.set_ylabel('mV')

    plt.tight_layout()

    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches='tight')

    if show:
        plt.show()
    else:
        plt.close()

    return fig


# Convenience function for quick analysis
def explain_ecg(
    model,
    signal: np.ndarray,
    age_days: int,
    lead_mask: Optional[np.ndarray] = None,
    save_dir: Optional[str] = None,
):
    """
    Quick function to explain model predictions for an ECG.

    Args:
        model: Loaded HybridFusionModel
        signal: ECG signal (12, 5000)
        age_days: Patient age in days
        lead_mask: Binary mask for present leads
        save_dir: Directory to save visualizations

    Returns:
        Dict with predictions and CAMs for each condition
    """
    gradcam = ECGGradCAM(model)
    cams, probs = gradcam.explain_all_conditions(signal, age_days, lead_mask)

    results = {
        'probabilities': {
            'CHD': probs[0],
            'Myocarditis': probs[1],
            'Kawasaki': probs[2],
            'Cardiomyopathy': probs[3],
        },
        'cams': cams,
    }

    if save_dir:
        import os
        os.makedirs(save_dir, exist_ok=True)

        for condition, cam in cams.items():
            prob = probs[gradcam.CONDITION_MAP[condition]]
            save_path = os.path.join(save_dir, f'gradcam_{condition.lower()}.png')
            visualize_gradcam(
                signal, cam, lead_mask, condition, prob,
                save_path=save_path, show=False
            )

    return results


if __name__ == '__main__':
    # Test the module
    import torch
    from ml.models.hybrid_model import hybrid_model_small
    from ml.data.dataset_multilabel import ZZUMultiLabelDataset

    device = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')

    # Load model
    model = hybrid_model_small(num_conditions=4)
    ckpt = torch.load(
        'ml/training/checkpoints/best_hybrid_20251225_091556.pt',
        map_location=device, weights_only=False
    )
    model.load_state_dict(ckpt['model_state_dict'])
    model = model.to(device)
    model.eval()

    # Load a test sample
    test_ds = ZZUMultiLabelDataset('data/zzu-pecg', split='test', return_metadata=True)
    signal, labels, lead_mask, age, meta = test_ds[0]

    print(f"Testing on: {meta['filename']}")
    print(f"Age: {meta['age_days']} days")
    print(f"Labels: {labels.numpy()}")

    # Generate explanation
    gradcam = ECGGradCAM(model)
    cams, probs = gradcam.explain_all_conditions(
        signal.numpy(), meta['age_days'], lead_mask.numpy()
    )

    print(f"\nPredictions:")
    for i, name in enumerate(['CHD', 'Myocarditis', 'Kawasaki', 'Cardiomyopathy']):
        print(f"  {name}: {probs[i]:.3f}")

    print(f"\nCAM shapes:")
    for name, cam in cams.items():
        print(f"  {name}: {cam.shape}, max={cam.max():.3f}")
