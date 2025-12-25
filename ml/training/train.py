"""
Training Script for ECG Classification
=======================================

Simple training loop with checkpointing and safety features.

Usage:
    python ml/training/train.py --task chd --epochs 30
"""

import argparse
import logging
import os
import signal
import sys
import time
from datetime import datetime
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from torch.optim.lr_scheduler import CosineAnnealingLR
import numpy as np
from tqdm import tqdm

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from ml.data.dataset import get_dataloaders
from ml.models.resnet1d import resnet1d_small, resnet1d_medium

try:
    from sklearn.metrics import roc_auc_score, average_precision_score
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False


# Global flag for graceful shutdown
SHUTDOWN_REQUESTED = False


def setup_logging(output_dir: Path, task: str) -> logging.Logger:
    """Setup logging to both file and console."""
    log_file = output_dir / f"train_{task}_{datetime.now():%Y%m%d_%H%M%S}.log"

    logger = logging.getLogger('train')
    logger.setLevel(logging.INFO)

    # File handler
    fh = logging.FileHandler(log_file)
    fh.setLevel(logging.INFO)
    fh.setFormatter(logging.Formatter('%(asctime)s | %(levelname)s | %(message)s'))

    # Console handler
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(logging.Formatter('%(message)s'))

    logger.addHandler(fh)
    logger.addHandler(ch)

    return logger


def signal_handler(signum, frame):
    """Handle Ctrl+C gracefully."""
    global SHUTDOWN_REQUESTED
    if SHUTDOWN_REQUESTED:
        print("\nForce quitting...")
        sys.exit(1)
    print("\n\nShutdown requested. Saving checkpoint and exiting after this epoch...")
    print("(Press Ctrl+C again to force quit)\n")
    SHUTDOWN_REQUESTED = True


def get_device():
    """Get best available device."""
    if torch.backends.mps.is_available():
        return torch.device("mps")
    elif torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def check_nan(tensor: torch.Tensor, name: str) -> bool:
    """Check for NaN/Inf in tensor. Returns True if problematic."""
    if torch.isnan(tensor).any():
        return True
    if torch.isinf(tensor).any():
        return True
    return False


def train_epoch(
    model: nn.Module,
    loader,
    criterion: nn.Module,
    optimizer: optim.Optimizer,
    device: torch.device,
    max_grad_norm: float = 1.0,
    epoch: int = 0,
    logger: logging.Logger = None,
) -> dict:
    """Train for one epoch with progress bar and safety checks."""
    model.train()
    total_loss = 0
    all_preds = []
    all_labels = []
    nan_detected = False

    pbar = tqdm(loader, desc=f"Epoch {epoch+1} [Train]", leave=False)

    for batch_idx, (signals, labels, _) in enumerate(pbar):
        signals = signals.to(device)
        labels = labels.to(device)

        optimizer.zero_grad()

        outputs = model(signals).squeeze(-1)
        loss = criterion(outputs, labels)

        # NaN detection
        if check_nan(loss, "loss"):
            if logger:
                logger.error(f"NaN detected in loss at batch {batch_idx}")
            nan_detected = True
            break

        loss.backward()

        # Gradient clipping
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_grad_norm)

        optimizer.step()

        total_loss += loss.item()

        # Collect predictions
        with torch.no_grad():
            probs = torch.sigmoid(outputs)
            all_preds.extend(probs.cpu().numpy())
            all_labels.extend(labels.cpu().numpy())

        # Update progress bar
        pbar.set_postfix({'loss': f'{loss.item():.4f}'})

    pbar.close()

    if nan_detected:
        return {'loss': float('nan'), 'nan_detected': True}

    # Compute metrics
    avg_loss = total_loss / len(loader)
    all_preds = np.array(all_preds)
    all_labels = np.array(all_labels)

    metrics = {'loss': avg_loss, 'nan_detected': False}

    if SKLEARN_AVAILABLE and len(np.unique(all_labels)) > 1:
        metrics['auroc'] = roc_auc_score(all_labels, all_preds)
        metrics['auprc'] = average_precision_score(all_labels, all_preds)

    return metrics


@torch.no_grad()
def evaluate(
    model: nn.Module,
    loader,
    criterion: nn.Module,
    device: torch.device,
    desc: str = "Val",
) -> dict:
    """Evaluate model with progress bar."""
    model.eval()
    total_loss = 0
    all_preds = []
    all_labels = []

    pbar = tqdm(loader, desc=f"        [{desc}]", leave=False)

    for signals, labels, _ in pbar:
        signals = signals.to(device)
        labels = labels.to(device)

        outputs = model(signals).squeeze(-1)
        loss = criterion(outputs, labels)

        total_loss += loss.item()

        probs = torch.sigmoid(outputs)
        all_preds.extend(probs.cpu().numpy())
        all_labels.extend(labels.cpu().numpy())

        pbar.set_postfix({'loss': f'{loss.item():.4f}'})

    pbar.close()

    avg_loss = total_loss / len(loader)
    all_preds = np.array(all_preds)
    all_labels = np.array(all_labels)

    metrics = {'loss': avg_loss}

    if SKLEARN_AVAILABLE and len(np.unique(all_labels)) > 1:
        metrics['auroc'] = roc_auc_score(all_labels, all_preds)
        metrics['auprc'] = average_precision_score(all_labels, all_preds)

        # Sensitivity at 90% specificity
        thresholds = np.linspace(0, 1, 100)
        for thresh in thresholds:
            preds_binary = (all_preds >= thresh).astype(int)
            tn = ((all_labels == 0) & (preds_binary == 0)).sum()
            fp = ((all_labels == 0) & (preds_binary == 1)).sum()
            spec = tn / (tn + fp) if (tn + fp) > 0 else 0
            if spec >= 0.90:
                tp = ((all_labels == 1) & (preds_binary == 1)).sum()
                fn = ((all_labels == 1) & (preds_binary == 0)).sum()
                sens = tp / (tp + fn) if (tp + fn) > 0 else 0
                metrics['sens@90spec'] = sens
                break

    return metrics


def save_checkpoint(
    model: nn.Module,
    optimizer: optim.Optimizer,
    scheduler,
    epoch: int,
    metrics: dict,
    path: Path,
    logger: logging.Logger = None,
):
    """Save training checkpoint."""
    torch.save({
        'epoch': epoch,
        'model_state_dict': model.state_dict(),
        'optimizer_state_dict': optimizer.state_dict(),
        'scheduler_state_dict': scheduler.state_dict() if scheduler else None,
        'metrics': metrics,
    }, path)
    if logger:
        logger.debug(f"Saved checkpoint to {path}")


def load_checkpoint(
    model: nn.Module,
    optimizer: optim.Optimizer,
    scheduler,
    path: Path,
    device: torch.device,
) -> int:
    """Load checkpoint, return epoch."""
    checkpoint = torch.load(path, map_location=device, weights_only=False)
    model.load_state_dict(checkpoint['model_state_dict'])
    optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
    if scheduler and checkpoint.get('scheduler_state_dict'):
        scheduler.load_state_dict(checkpoint['scheduler_state_dict'])
    return checkpoint['epoch']


def main():
    parser = argparse.ArgumentParser(description='Train ECG classifier')
    parser.add_argument('--task', type=str, default='chd', choices=['chd', 'abnormal'])
    parser.add_argument('--epochs', type=int, default=30)
    parser.add_argument('--batch_size', type=int, default=32)
    parser.add_argument('--lr', type=float, default=1e-3)
    parser.add_argument('--model', type=str, default='small', choices=['small', 'medium'])
    parser.add_argument('--resume', type=str, default=None, help='Checkpoint to resume from')
    parser.add_argument('--patience', type=int, default=10, help='Early stopping patience')
    parser.add_argument('--max_grad_norm', type=float, default=1.0, help='Gradient clipping')
    args = parser.parse_args()

    # Setup signal handler for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Setup
    device = get_device()

    data_dir = PROJECT_ROOT / "data" / "zzu-pecg"
    output_dir = PROJECT_ROOT / "ml" / "training" / "checkpoints"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Setup logging
    logger = setup_logging(output_dir, args.task)
    logger.info(f"Starting training run")
    logger.info(f"Device: {device}")
    logger.info(f"Args: {vars(args)}")

    # Data
    logger.info(f"Loading data for task: {args.task}")
    train_loader, val_loader, test_loader, class_weights = get_dataloaders(
        data_dir, task=args.task, batch_size=args.batch_size
    )
    class_weights = class_weights.to(device)
    logger.info(f"Train batches: {len(train_loader)}, Val batches: {len(val_loader)}, Test batches: {len(test_loader)}")

    # Model
    logger.info(f"Creating {args.model} model...")
    if args.model == 'small':
        model = resnet1d_small(in_channels=12, num_classes=1)
    else:
        model = resnet1d_medium(in_channels=12, num_classes=1)

    model = model.to(device)
    n_params = sum(p.numel() for p in model.parameters())
    logger.info(f"Parameters: {n_params:,}")

    # Loss with class weighting
    pos_weight = class_weights[1] / class_weights[0]
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)

    # Optimizer
    optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = CosineAnnealingLR(optimizer, T_max=args.epochs)

    # Resume if specified
    start_epoch = 0
    if args.resume:
        logger.info(f"Resuming from {args.resume}")
        start_epoch = load_checkpoint(model, optimizer, scheduler, Path(args.resume), device)
        start_epoch += 1  # Start from next epoch
        logger.info(f"Resumed from epoch {start_epoch}")

    # Training loop
    logger.info(f"Training for {args.epochs} epochs (patience={args.patience})...")
    print("-" * 70)

    best_auroc = 0
    best_epoch = 0
    epochs_without_improvement = 0

    for epoch in range(start_epoch, args.epochs):
        if SHUTDOWN_REQUESTED:
            logger.info("Shutdown requested, saving and exiting...")
            break

        epoch_start = time.time()

        # Train
        train_metrics = train_epoch(
            model, train_loader, criterion, optimizer, device,
            max_grad_norm=args.max_grad_norm, epoch=epoch, logger=logger
        )

        # Check for NaN
        if train_metrics.get('nan_detected', False):
            logger.error("NaN detected during training! Stopping.")
            logger.info("Try reducing learning rate or checking data.")
            break

        # Validate
        val_metrics = evaluate(model, val_loader, criterion, device)

        # Update scheduler
        scheduler.step()

        epoch_time = time.time() - epoch_start

        # Log progress
        log_msg = (f"Epoch {epoch+1:3d}/{args.epochs} | "
                   f"Train Loss: {train_metrics['loss']:.4f} | "
                   f"Val Loss: {val_metrics['loss']:.4f} | "
                   f"Val AUROC: {val_metrics.get('auroc', 0):.4f} | "
                   f"Time: {epoch_time:.1f}s")
        logger.info(log_msg)

        # Save latest checkpoint every epoch (for crash recovery)
        save_checkpoint(
            model, optimizer, scheduler, epoch, val_metrics,
            output_dir / f"latest_{args.task}.pt", logger
        )

        # Save best model
        val_auroc = val_metrics.get('auroc', 0)
        if val_auroc > best_auroc:
            best_auroc = val_auroc
            best_epoch = epoch + 1
            epochs_without_improvement = 0
            save_checkpoint(
                model, optimizer, scheduler, epoch, val_metrics,
                output_dir / f"best_{args.task}.pt", logger
            )
            logger.info(f"  -> New best model! AUROC: {best_auroc:.4f}")
        else:
            epochs_without_improvement += 1

        # Early stopping
        if epochs_without_improvement >= args.patience:
            logger.info(f"Early stopping triggered after {args.patience} epochs without improvement")
            break

        # Save periodic checkpoint
        if (epoch + 1) % 10 == 0:
            save_checkpoint(
                model, optimizer, scheduler, epoch, val_metrics,
                output_dir / f"epoch_{epoch+1}_{args.task}.pt", logger
            )

    print("-" * 70)
    logger.info(f"Training complete. Best AUROC: {best_auroc:.4f} at epoch {best_epoch}")

    # Final evaluation on test set
    if not SHUTDOWN_REQUESTED:
        logger.info("Evaluating on test set...")
        checkpoint = torch.load(output_dir / f"best_{args.task}.pt", map_location=device, weights_only=False)
        model.load_state_dict(checkpoint['model_state_dict'])

        test_metrics = evaluate(model, test_loader, criterion, device, desc="Test")

        print("\n" + "=" * 70)
        logger.info("FINAL TEST RESULTS")
        print("=" * 70)
        logger.info(f"Task:          {args.task}")
        logger.info(f"Test Loss:     {test_metrics['loss']:.4f}")
        logger.info(f"Test AUROC:    {test_metrics.get('auroc', 0):.4f}")
        logger.info(f"Test AUPRC:    {test_metrics.get('auprc', 0):.4f}")
        logger.info(f"Sens@90Spec:   {test_metrics.get('sens@90spec', 0):.4f}")
        print("=" * 70)

        # Save final results
        results_path = output_dir / f"results_{args.task}.txt"
        with open(results_path, 'w') as f:
            f.write(f"Task: {args.task}\n")
            f.write(f"Best Epoch: {best_epoch}\n")
            f.write(f"Val AUROC: {best_auroc:.4f}\n")
            for k, v in test_metrics.items():
                f.write(f"Test {k}: {v:.4f}\n")

        logger.info(f"Results saved to {results_path}")
        logger.info(f"Best model saved to {output_dir / f'best_{args.task}.pt'}")

        return test_metrics
    else:
        logger.info("Skipping test evaluation due to shutdown request")
        return None


if __name__ == "__main__":
    main()
