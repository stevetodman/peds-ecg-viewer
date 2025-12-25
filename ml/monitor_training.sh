#!/bin/bash
# Quick check of training progress
echo "=== Training Status ==="
if [ -f ml/training/train_age_aware.log ]; then
    echo "Last lines:"
    tail -5 ml/training/train_age_aware.log | grep -E "Epoch|AUROC|best"
    echo ""
    echo "Best models saved:"
    ls -la ml/training/checkpoints/*age_aware* 2>/dev/null | tail -3
else
    echo "No training log found"
fi
