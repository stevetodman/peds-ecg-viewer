"""
Age-Aware ResNet Training Script
================================
Train the age-aware ResNet model on ZZU-pECG.

Usage:
    python ml/training/train_age_aware.py --task abnormal --epochs 50 --model medium
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from tqdm import tqdm

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from ml.data.dataset import ZZUDataset
from ml.data.augmentations import get_train_augmentor
from ml.models.resnet1d_age import create_age_aware_model


def collate_fn(batch):
    """Custom collate to extract age from metadata."""
    signals = torch.stack([item[0] for item in batch])
    labels = torch.stack([item[1] for item in batch])
    ages = torch.tensor([item[2]['age_days'] for item in batch], dtype=torch.long)
    return signals, labels, ages


def get_dataloaders(data_dir: str, task: str, batch_size: int, use_augmentation: bool = True):
    """Get dataloaders with age extraction."""
    train_augmentor = get_train_augmentor() if use_augmentation else None

    train_ds = ZZUDataset(data_dir, split='train', task=task, augmentor=train_augmentor)
    val_ds = ZZUDataset(data_dir, split='val', task=task)
    test_ds = ZZUDataset(data_dir, split='test', task=task)

    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True,
        num_workers=0, pin_memory=False, collate_fn=collate_fn
    )
    val_loader = DataLoader(
        val_ds, batch_size=batch_size, shuffle=False,
        num_workers=0, pin_memory=False, collate_fn=collate_fn
    )
    test_loader = DataLoader(
        test_ds, batch_size=batch_size, shuffle=False,
        num_workers=0, pin_memory=False, collate_fn=collate_fn
    )

    return train_loader, val_loader, test_loader, train_ds.get_class_weights()


def compute_metrics(y_true, y_pred, y_prob):
    """Compute classification metrics."""
    from sklearn.metrics import (
        accuracy_score, roc_auc_score, average_precision_score,
        precision_score, recall_score, f1_score
    )

    metrics = {
        'accuracy': accuracy_score(y_true, y_pred),
        'precision': precision_score(y_true, y_pred, zero_division=0),
        'recall': recall_score(y_true, y_pred, zero_division=0),
        'f1': f1_score(y_true, y_pred, zero_division=0),
    }

    # AUC metrics (need both classes)
    if len(set(y_true)) > 1:
        metrics['auroc'] = roc_auc_score(y_true, y_prob)
        metrics['auprc'] = average_precision_score(y_true, y_prob)

        # Sensitivity at 90% specificity
        from sklearn.metrics import roc_curve
        fpr, tpr, thresholds = roc_curve(y_true, y_prob)
        idx = (fpr <= 0.10).sum() - 1  # 90% specificity = 10% FPR
        if idx >= 0:
            metrics['sens_at_90spec'] = tpr[idx]
    else:
        metrics['auroc'] = 0.5
        metrics['auprc'] = y_true.mean() if hasattr(y_true, 'mean') else 0.5

    return metrics


def train_epoch(model, loader, criterion, optimizer, device, epoch, scheduler=None):
    """Train for one epoch."""
    model.train()
    total_loss = 0
    all_preds = []
    all_labels = []
    all_probs = []

    pbar = tqdm(loader, desc=f"Epoch {epoch} [Train]")
    for batch_idx, (signals, labels, ages) in enumerate(pbar):
        signals = signals.to(device)
        labels = labels.to(device)
        ages = ages.to(device)

        optimizer.zero_grad()
        outputs = model(signals, ages)
        loss = criterion(outputs.squeeze(), labels)

        loss.backward()

        # Gradient clipping
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)

        optimizer.step()

        total_loss += loss.item()
        probs = torch.sigmoid(outputs.squeeze())
        preds = (probs > 0.5).float()

        all_probs.extend(probs.detach().cpu().numpy())
        all_preds.extend(preds.detach().cpu().numpy())
        all_labels.extend(labels.cpu().numpy())

        pbar.set_postfix({'loss': loss.item()})

    if scheduler:
        scheduler.step()

    avg_loss = total_loss / len(loader)
    metrics = compute_metrics(all_labels, all_preds, all_probs)
    metrics['loss'] = avg_loss

    return metrics


@torch.no_grad()
def evaluate(model, loader, criterion, device):
    """Evaluate on validation/test set."""
    model.eval()
    total_loss = 0
    all_preds = []
    all_labels = []
    all_probs = []

    for signals, labels, ages in loader:
        signals = signals.to(device)
        labels = labels.to(device)
        ages = ages.to(device)

        outputs = model(signals, ages)
        loss = criterion(outputs.squeeze(), labels)

        total_loss += loss.item()
        probs = torch.sigmoid(outputs.squeeze())
        preds = (probs > 0.5).float()

        all_probs.extend(probs.cpu().numpy())
        all_preds.extend(preds.cpu().numpy())
        all_labels.extend(labels.cpu().numpy())

    avg_loss = total_loss / len(loader)
    metrics = compute_metrics(all_labels, all_preds, all_probs)
    metrics['loss'] = avg_loss

    return metrics


def update_journal(journal_path: Path, phase: str, results: dict):
    """Update the progress journal with new results."""
    if not journal_path.exists():
        return

    with open(journal_path, 'r') as f:
        content = f.read()

    # Update timestamp
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M UTC")
    content = content.replace(
        "**Last Updated:**",
        f"**Last Updated:** {timestamp}\n\n> Previous:"
    )

    # Append results to Current Best Results section
    results_str = f"\n\n### {phase} ({timestamp})\n"
    for k, v in results.items():
        if isinstance(v, float):
            results_str += f"- {k}: {v:.4f}\n"
        else:
            results_str += f"- {k}: {v}\n"

    # Find and update the section
    if "## Current Best Results" in content:
        idx = content.find("## Current Best Results")
        end_idx = content.find("##", idx + 1)
        if end_idx == -1:
            end_idx = len(content)
        content = content[:end_idx] + results_str + "\n" + content[end_idx:]

    with open(journal_path, 'w') as f:
        f.write(content)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--task', type=str, default='abnormal', choices=['chd', 'abnormal'])
    parser.add_argument('--model', type=str, default='medium', choices=['small', 'medium', 'large'])
    parser.add_argument('--epochs', type=int, default=50)
    parser.add_argument('--batch_size', type=int, default=32)
    parser.add_argument('--lr', type=float, default=1e-3)
    parser.add_argument('--weight_decay', type=float, default=1e-4)
    parser.add_argument('--dropout', type=float, default=0.3)
    parser.add_argument('--patience', type=int, default=15)
    parser.add_argument('--data_dir', type=str, default='data/zzu-pecg')
    parser.add_argument('--save_dir', type=str, default='ml/training/checkpoints')
    parser.add_argument('--no_augment', action='store_true')
    args = parser.parse_args()

    # Setup
    device = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
    print(f"Using device: {device}")

    save_dir = Path(args.save_dir)
    save_dir.mkdir(parents=True, exist_ok=True)

    journal_path = Path("ml/PROGRESS_JOURNAL.md")

    # Data
    print("\nLoading data...")
    train_loader, val_loader, test_loader, class_weights = get_dataloaders(
        args.data_dir, args.task, args.batch_size,
        use_augmentation=not args.no_augment
    )

    # Model
    print(f"\nCreating age-aware model ({args.model})...")
    model = create_age_aware_model(
        model_size=args.model,
        num_classes=1,
        dropout=args.dropout
    )
    model = model.to(device)

    total_params = sum(p.numel() for p in model.parameters())
    print(f"Model parameters: {total_params:,}")

    # Loss and optimizer
    pos_weight = class_weights[1].to(device)
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)

    optimizer = optim.AdamW(
        model.parameters(),
        lr=args.lr,
        weight_decay=args.weight_decay
    )

    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    # Training loop
    best_auroc = 0
    patience_counter = 0
    history = {'train': [], 'val': []}

    print(f"\nStarting training for {args.epochs} epochs...")
    print(f"Task: {args.task}, Model: {args.model}, Patience: {args.patience}")
    print("-" * 60)

    for epoch in range(1, args.epochs + 1):
        train_metrics = train_epoch(model, train_loader, criterion, optimizer, device, epoch, scheduler)
        val_metrics = evaluate(model, val_loader, criterion, device)

        history['train'].append(train_metrics)
        history['val'].append(val_metrics)

        print(f"Epoch {epoch:3d} | "
              f"Train Loss: {train_metrics['loss']:.4f} | "
              f"Val Loss: {val_metrics['loss']:.4f} | "
              f"Val AUROC: {val_metrics['auroc']:.4f}")

        # Save best model
        if val_metrics['auroc'] > best_auroc:
            best_auroc = val_metrics['auroc']
            patience_counter = 0

            torch.save({
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'best_auroc': best_auroc,
                'args': vars(args),
            }, save_dir / f"best_age_aware_{args.task}.pt")

            print(f"  -> New best model! AUROC: {best_auroc:.4f}")
        else:
            patience_counter += 1

        # Save checkpoint every 10 epochs
        if epoch % 10 == 0:
            torch.save({
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'history': history,
            }, save_dir / f"epoch_{epoch}_age_aware_{args.task}.pt")

        # Early stopping
        if patience_counter >= args.patience:
            print(f"\nEarly stopping at epoch {epoch}")
            break

    # Load best model and evaluate on test set
    print("\n" + "=" * 60)
    print("FINAL EVALUATION ON TEST SET")
    print("=" * 60)

    checkpoint = torch.load(save_dir / f"best_age_aware_{args.task}.pt", weights_only=False)
    model.load_state_dict(checkpoint['model_state_dict'])

    test_metrics = evaluate(model, test_loader, criterion, device)

    print(f"\nTest Results:")
    print(f"  Loss:          {test_metrics['loss']:.4f}")
    print(f"  AUROC:         {test_metrics['auroc']:.4f}")
    print(f"  AUPRC:         {test_metrics['auprc']:.4f}")
    print(f"  Sens@90Spec:   {test_metrics.get('sens_at_90spec', 0):.4f}")
    print(f"  F1:            {test_metrics['f1']:.4f}")

    # Save results
    results = {
        'task': args.task,
        'model': f'age_aware_{args.model}',
        'best_epoch': checkpoint['epoch'],
        'val_auroc': best_auroc,
        **{f'test_{k}': v for k, v in test_metrics.items()}
    }

    with open(save_dir / f"results_age_aware_{args.task}.json", 'w') as f:
        json.dump(results, f, indent=2)

    # Update journal
    update_journal(journal_path, f"Age-Aware ResNet ({args.model}) - {args.task}", results)

    print(f"\nResults saved to {save_dir}/results_age_aware_{args.task}.json")

    # Compare to baseline
    baseline_path = save_dir / f"results_{args.task}.txt"
    if baseline_path.exists():
        with open(baseline_path, 'r') as f:
            baseline_content = f.read()
            if 'auroc:' in baseline_content:
                baseline_auroc = float(baseline_content.split('auroc:')[1].split('\n')[0].strip())
                improvement = test_metrics['auroc'] - baseline_auroc
                print(f"\nComparison to baseline:")
                print(f"  Baseline AUROC: {baseline_auroc:.4f}")
                print(f"  Age-aware AUROC: {test_metrics['auroc']:.4f}")
                print(f"  Improvement: {improvement:+.4f}")


if __name__ == '__main__':
    main()
