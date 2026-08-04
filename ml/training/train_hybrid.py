"""
Hybrid Model Training Script
============================

Trains the hybrid rule+neural model on multi-label classification.

Usage:
    python -m ml.training.train_hybrid [--epochs 30] [--batch-size 32] [--lr 0.001]
"""

import argparse
import hashlib
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from tqdm import tqdm

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from ml.data.dataset_multilabel import (
    ZZUMultiLabelDataset,
    get_multilabel_dataloaders,
    CONDITION_NAMES,
)
from ml.data.augmentations_v2 import get_train_augmentor
from ml.data.preprocessing import PREPROCESSING_VERSION
from ml.models.hybrid_model import (
    HybridFusionModel,
    hybrid_model_small,
    hybrid_model_medium,
    WeightedBCELoss,
)
from ml.models.rule_features import RuleFeatureExtractor, extract_batch_features

try:
    from sklearn.metrics import roc_auc_score, average_precision_score
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger(__name__)

# Paths
DATA_DIR = PROJECT_ROOT / "data" / "zzu-pecg"
CHECKPOINT_DIR = PROJECT_ROOT / "ml" / "training" / "checkpoints"
CACHE_DIR = PROJECT_ROOT / "ml" / "training" / "cache"


def get_device() -> torch.device:
    """Get best available device."""
    if torch.cuda.is_available():
        return torch.device('cuda')
    elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        return torch.device('mps')
    return torch.device('cpu')


def compute_rule_features_cached(
    dataset: ZZUMultiLabelDataset,
    cache_path: Path,
    sampling_rate: int = 500,
) -> np.ndarray:
    """
    Compute rule features for all samples with caching.

    Since rule feature extraction is slow, we cache the results.
    """
    if cache_path.suffix != '.npz':
        raise ValueError("rule-feature cache path must use the .npz extension")
    if dataset.augmentor is not None:
        raise ValueError("rule features cannot be cached from an augmented dataset")

    identity_payload = [
        (str(row['Filename']), int(row['age_days']))
        for _, row in dataset.df.iterrows()
    ]
    dataset_fingerprint = hashlib.sha256(
        json.dumps(identity_payload, separators=(',', ':')).encode('utf-8')
    ).hexdigest()

    if cache_path.exists():
        logger.info(f"Loading cached rule features from {cache_path}")
        with np.load(cache_path, allow_pickle=False) as cached:
            cached_version = str(cached['preprocessing_version'].item())
            cached_fingerprint = str(cached['dataset_fingerprint'].item())
            cached_features = cached['features']
        if cached_version != PREPROCESSING_VERSION:
            raise RuntimeError("rule-feature cache uses incompatible preprocessing")
        if cached_fingerprint != dataset_fingerprint:
            raise RuntimeError("rule-feature cache does not match this dataset split")
        if cached_features.shape != (len(dataset), 30) or not np.isfinite(cached_features).all():
            raise RuntimeError("rule-feature cache is incomplete or invalid")
        return cached_features.astype(np.float32, copy=False)

    logger.info(f"Computing rule features for {len(dataset)} samples...")

    extractor = RuleFeatureExtractor(sampling_rate=sampling_rate)
    features = np.empty((len(dataset), 30), dtype=np.float32)

    for i in tqdm(range(len(dataset)), desc="Extracting rule features"):
        # Get sample without metadata
        signal, labels, lead_mask, age, meta = dataset[i]

        # Extract features
        age_days = meta['age_days']
        result = extractor.extract(signal.numpy(), age_days)

        if result.extraction_success:
            features[i] = result.to_vector()
        else:
            raise RuntimeError(
                f"rule feature extraction failed for dataset item {i} "
                f"({meta['filename']}): {result.error_message or 'unknown error'}"
            )

    if not np.isfinite(features).all():
        raise RuntimeError("rule feature extraction produced non-finite values")
    logger.info(f"Successfully extracted features for {len(dataset)}/{len(dataset)} samples")

    # Save cache
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        cache_path,
        features=features,
        preprocessing_version=np.array(PREPROCESSING_VERSION),
        dataset_fingerprint=np.array(dataset_fingerprint),
    )
    logger.info(f"Cached rule features to {cache_path}")

    return features


def compute_metrics(
    model: HybridFusionModel,
    dataloader: DataLoader,
    device: torch.device,
    criterion: nn.Module,
) -> Dict:
    """
    Compute evaluation metrics.

    Returns dict with loss and per-condition AUROC.
    """
    model.eval()

    all_labels = []
    all_probs = []
    total_loss = 0.0
    n_batches = 0

    with torch.no_grad():
        for batch in dataloader:
            signal, labels, lead_mask, age = batch
            batch_rule_features = torch.tensor(
                extract_batch_features(
                    signal.numpy(), age.squeeze(1).numpy() * 5110.0, sampling_rate=500
                ),
                dtype=torch.float32,
            )

            signal = signal.to(device)
            labels = labels.to(device)
            lead_mask = lead_mask.to(device)
            age = age.to(device)
            batch_rule_features = batch_rule_features.to(device)

            logits = model(signal, batch_rule_features, lead_mask, age)
            loss = criterion(logits, labels)

            probs = torch.sigmoid(logits)

            all_labels.append(labels.cpu().numpy())
            all_probs.append(probs.cpu().numpy())
            total_loss += loss.item()
            n_batches += 1

    all_labels = np.concatenate(all_labels, axis=0)
    all_probs = np.concatenate(all_probs, axis=0)

    metrics = {
        'loss': total_loss / n_batches,
    }

    # Per-condition AUROC
    if SKLEARN_AVAILABLE:
        for i, condition in enumerate(CONDITION_NAMES):
            y_true = all_labels[:, i]
            y_score = all_probs[:, i]

            # Only compute if we have positive samples
            if y_true.sum() > 0 and y_true.sum() < len(y_true):
                try:
                    auroc = roc_auc_score(y_true, y_score)
                    metrics[f'auroc_{condition}'] = auroc
                except ValueError:
                    metrics[f'auroc_{condition}'] = 0.5

        # Mean AUROC
        auroc_values = [v for k, v in metrics.items() if k.startswith('auroc_')]
        if auroc_values:
            metrics['auroc_mean'] = np.mean(auroc_values)

    return metrics


def train_epoch(
    model: HybridFusionModel,
    dataloader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
    max_grad_norm: float = 1.0,
) -> float:
    """Train for one epoch. Returns average loss."""
    model.train()

    total_loss = 0.0
    n_batches = 0

    for batch in tqdm(dataloader, desc="Training", leave=False):
        signal, labels, lead_mask, age = batch

        batch_rule_features = torch.tensor(
            extract_batch_features(
                signal.numpy(), age.squeeze(1).numpy() * 5110.0, sampling_rate=500
            ),
            dtype=torch.float32,
        )

        signal = signal.to(device)
        labels = labels.to(device)
        lead_mask = lead_mask.to(device)
        age = age.to(device)
        batch_rule_features = batch_rule_features.to(device)

        optimizer.zero_grad()

        logits = model(signal, batch_rule_features, lead_mask, age)
        loss = criterion(logits, labels)

        loss.backward()

        # Gradient clipping
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_grad_norm)

        optimizer.step()

        total_loss += loss.item()
        n_batches += 1

    return total_loss / n_batches


def train(
    epochs: int = 30,
    batch_size: int = 32,
    lr: float = 0.001,
    model_size: str = 'small',
    patience: int = 10,
    max_grad_norm: float = 1.0,
    resume: Optional[str] = None,
) -> Dict:
    """
    Main training function.
    """
    device = get_device()
    logger.info(f"Using device: {device}")

    # Create timestamp for this run
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

    # Setup logging to file
    log_path = CHECKPOINT_DIR / f"train_hybrid_{timestamp}.log"
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    file_handler = logging.FileHandler(log_path)
    file_handler.setFormatter(logging.Formatter('%(asctime)s | %(levelname)s | %(message)s'))
    logger.addHandler(file_handler)

    logger.info("Starting hybrid model training")
    logger.info(f"Args: {dict(epochs=epochs, batch_size=batch_size, lr=lr, model_size=model_size)}")

    # Load data
    logger.info("Loading data...")
    train_loader, val_loader, test_loader, pos_weights = get_multilabel_dataloaders(
        str(DATA_DIR),
        batch_size=batch_size,
        use_augmentation=True,
    )
    logger.info(f"Train batches: {len(train_loader)}, Val batches: {len(val_loader)}")

    # Create model
    logger.info(f"Creating {model_size} model...")
    if model_size == 'small':
        model = hybrid_model_small(num_conditions=4)
    else:
        model = hybrid_model_medium(num_conditions=4)

    model = model.to(device)

    n_params = sum(p.numel() for p in model.parameters())
    logger.info(f"Parameters: {n_params:,}")

    # Loss function with class weights
    criterion = WeightedBCELoss(pos_weights)
    logger.info(f"Positive weights: {pos_weights.tolist()}")

    # Optimizer
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)

    # Learning rate scheduler
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode='max', factor=0.5, patience=5
    )

    # Resume from checkpoint
    start_epoch = 0
    best_auroc = float('-inf')
    if resume:
        checkpoint = torch.load(resume, map_location=device, weights_only=True)
        if checkpoint.get('preprocessing_version') != PREPROCESSING_VERSION:
            raise RuntimeError("resume checkpoint uses incompatible preprocessing")
        if checkpoint.get('rule_features') != 'required':
            raise RuntimeError("resume checkpoint was not trained with real rule features")
        model.load_state_dict(checkpoint['model_state_dict'])
        optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
        start_epoch = checkpoint['epoch'] + 1
        logger.info(f"Resumed weights from epoch {start_epoch}; validation restarts for this run")

    # Training loop
    logger.info(f"Training for {epochs} epochs (patience={patience})...")

    epochs_without_improvement = 0
    best_path = CHECKPOINT_DIR / f"best_hybrid_{timestamp}.pt"

    for epoch in range(start_epoch, epochs):
        # Train
        train_loss = train_epoch(
            model, train_loader, criterion, optimizer, device, max_grad_norm
        )

        # Validate
        val_metrics = compute_metrics(model, val_loader, device, criterion)

        # Extract key metrics
        val_loss = val_metrics['loss']
        val_auroc = val_metrics.get('auroc_mean', 0.0)
        if not np.isfinite(val_loss) or not np.isfinite(val_auroc):
            raise RuntimeError("validation produced non-finite metrics")

        # Log progress
        logger.info(
            f"Epoch {epoch+1:3d}/{epochs} | "
            f"Train Loss: {train_loss:.4f} | "
            f"Val Loss: {val_loss:.4f} | "
            f"Val AUROC: {val_auroc:.4f}"
        )

        # Log per-condition AUROC
        for condition in CONDITION_NAMES:
            cond_auroc = val_metrics.get(f'auroc_{condition}', 0.0)
            logger.info(f"  {condition}: {cond_auroc:.4f}")

        # Update scheduler
        scheduler.step(val_auroc)

        # Check for improvement
        if val_auroc > best_auroc:
            best_auroc = val_auroc
            epochs_without_improvement = 0

            # Save best model
            torch.save({
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'best_auroc': best_auroc,
                'val_metrics': val_metrics,
                'preprocessing_version': PREPROCESSING_VERSION,
                'rule_features': 'required',
                'model_architecture': f'hybrid_{model_size}',
                'conditions': CONDITION_NAMES,
            }, best_path)
            logger.info(f"  -> New best model! AUROC: {best_auroc:.4f}")
        else:
            epochs_without_improvement += 1

        # Early stopping
        if epochs_without_improvement >= patience:
            logger.info(f"Early stopping after {epochs_without_improvement} epochs without improvement")
            break

    # Final evaluation on test set
    logger.info("Evaluating on test set...")

    # Load best model
    best_checkpoint = torch.load(best_path, map_location=device, weights_only=True)
    model.load_state_dict(best_checkpoint['model_state_dict'])

    test_metrics = compute_metrics(model, test_loader, device, criterion)

    logger.info("=" * 50)
    logger.info("FINAL TEST RESULTS")
    logger.info("=" * 50)
    logger.info(f"Test Loss: {test_metrics['loss']:.4f}")
    logger.info(f"Mean AUROC: {test_metrics.get('auroc_mean', 0.0):.4f}")
    for condition in CONDITION_NAMES:
        cond_auroc = test_metrics.get(f'auroc_{condition}', 0.0)
        logger.info(f"  {condition}: {cond_auroc:.4f}")

    # Save results
    results = {
        'timestamp': timestamp,
        'best_epoch': best_checkpoint['epoch'],
        'best_val_auroc': best_auroc,
        'test_metrics': test_metrics,
        'args': {
            'epochs': epochs,
            'batch_size': batch_size,
            'lr': lr,
            'model_size': model_size,
        }
    }

    results_path = CHECKPOINT_DIR / f"results_hybrid_{timestamp}.json"
    with open(results_path, 'w') as f:
        json.dump(results, f, indent=2, default=str)

    logger.info(f"Results saved to {results_path}")

    return results


def main():
    parser = argparse.ArgumentParser(description="Train hybrid ECG model")
    parser.add_argument('--epochs', type=int, default=30)
    parser.add_argument('--batch-size', type=int, default=32)
    parser.add_argument('--lr', type=float, default=0.001)
    parser.add_argument('--model', choices=['small', 'medium'], default='small')
    parser.add_argument('--patience', type=int, default=10)
    parser.add_argument('--resume', type=str, default=None)

    args = parser.parse_args()

    train(
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        model_size=args.model,
        patience=args.patience,
        resume=args.resume,
    )


if __name__ == "__main__":
    main()
