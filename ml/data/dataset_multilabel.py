"""
ZZU-pECG Multi-Label Dataset
============================

Multi-label classification dataset for 4 pediatric cardiac conditions:
- CHD (Congenital Heart Disease)
- Myocarditis
- Kawasaki Disease
- Cardiomyopathy

Labels are multi-hot vectors: a sample can have multiple conditions.
Normal is inferred when all labels are 0.
"""

import json
import re
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset, DataLoader

try:
    import wfdb
    WFDB_AVAILABLE = True
except ImportError:
    WFDB_AVAILABLE = False

from ml.data.augmentations_v2 import create_lead_mask


# Standard 12-lead order
LEAD_ORDER = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']

# 9-lead ECGs are missing V2, V4, V6 (indices 7, 9, 11)
NINE_LEAD_MISSING = [7, 9, 11]

# Condition names in order (matches label vector indices)
CONDITION_NAMES = ['chd', 'myocarditis', 'kawasaki', 'cardiomyopathy']


def load_label_mapping(mapping_path: Optional[Path] = None) -> Dict:
    """Load ICD-10 to condition mapping from JSON."""
    if mapping_path is None:
        mapping_path = Path(__file__).parent / "label_mapping.json"

    with open(mapping_path, 'r') as f:
        return json.load(f)


def parse_icd_codes(codes_str: str) -> List[str]:
    """Extract ICD-10 codes from string like \"['Q21.0', 'I40.9']\"."""
    if pd.isna(codes_str):
        return []
    return re.findall(r"'([^']+)'", str(codes_str))


def icd_to_multilabel(icd_codes: List[str], mapping: Dict) -> np.ndarray:
    """
    Convert ICD-10 codes to multi-hot label vector.

    Args:
        icd_codes: List of ICD-10 codes for this sample
        mapping: Label mapping dict from label_mapping.json

    Returns:
        Multi-hot vector of shape (4,) for [chd, myocarditis, kawasaki, cardiomyopathy]
    """
    labels = np.zeros(len(CONDITION_NAMES), dtype=np.float32)

    conditions = mapping['conditions']

    for i, condition in enumerate(CONDITION_NAMES):
        config = conditions[condition]

        # Check prefix matches
        prefixes = config.get('icd10_prefixes', [])
        for code in icd_codes:
            if any(code.startswith(prefix) for prefix in prefixes):
                labels[i] = 1.0
                break

        # Check exact matches (if not already positive)
        if labels[i] == 0:
            exact_codes = config.get('icd10_exact', [])
            if any(code in exact_codes for code in icd_codes):
                labels[i] = 1.0

    return labels


class ZZUMultiLabelDataset(Dataset):
    """
    PyTorch Dataset for ZZU-pECG with multi-label classification.

    Args:
        data_dir: Path to zzu-pecg directory
        split: 'train', 'val', or 'test'
        target_length: Resample signals to this length (samples)
        target_leads: Number of leads (12 for standard, pads 9-lead with zeros)
        augmentor: Optional augmentation function/callable
        return_metadata: If True, return metadata dict (for analysis)
    """

    def __init__(
        self,
        data_dir: str,
        split: str = 'train',
        target_length: int = 5000,  # 10 seconds at 500Hz
        target_leads: int = 12,
        random_state: int = 42,
        augmentor: Optional[Callable] = None,
        return_metadata: bool = True,
    ):
        self.data_dir = Path(data_dir)
        self.ecg_dir = self.data_dir / "Child_ecg"
        self.split = split
        self.target_length = target_length
        self.target_leads = target_leads
        self.augmentor = augmentor
        self.return_metadata = return_metadata

        # Load label mapping
        self.label_mapping = load_label_mapping()

        # Load metadata
        csv_path = self.data_dir / "AttributesDictionary.csv"
        df = pd.read_csv(csv_path)

        # Parse age
        df['age_days'] = df['Age'].str.extract(r'(\d+)').astype(int)

        # Parse ICD codes and create multi-label
        df['icd_codes'] = df['ICD-10 code'].apply(parse_icd_codes)

        # Create multi-label columns
        labels_array = np.array([
            icd_to_multilabel(codes, self.label_mapping)
            for codes in df['icd_codes']
        ])

        for i, condition in enumerate(CONDITION_NAMES):
            df[f'label_{condition}'] = labels_array[:, i]

        # Compute derived columns
        df['is_normal'] = (labels_array.sum(axis=1) == 0).astype(float)
        df['n_conditions'] = labels_array.sum(axis=1)

        # Patient-level split (same as original to maintain consistency)
        patients = df['Patient_ID'].unique()
        np.random.seed(random_state)
        np.random.shuffle(patients)

        n_train = int(0.6 * len(patients))
        n_val = int(0.2 * len(patients))

        if split == 'train':
            split_patients = set(patients[:n_train])
        elif split == 'val':
            split_patients = set(patients[n_train:n_train + n_val])
        else:  # test
            split_patients = set(patients[n_train + n_val:])

        self.df = df[df['Patient_ID'].isin(split_patients)].reset_index(drop=True)

        # Compute class statistics
        self._compute_statistics()

    def _compute_statistics(self):
        """Compute and print class distribution statistics."""
        stats = {
            'total': len(self.df),
            'normal': int(self.df['is_normal'].sum()),
        }

        for condition in CONDITION_NAMES:
            stats[condition] = int(self.df[f'label_{condition}'].sum())

        # Co-occurrence stats
        multi_label_mask = self.df['n_conditions'] > 1
        stats['multi_label'] = int(multi_label_mask.sum())

        print(f"\nZZUMultiLabelDataset [{self.split}]: {stats['total']} samples")
        print(f"  Normal (all zeros): {stats['normal']} ({stats['normal']/stats['total']*100:.1f}%)")
        for condition in CONDITION_NAMES:
            pct = stats[condition] / stats['total'] * 100
            print(f"  {condition}: {stats[condition]} ({pct:.1f}%)")
        print(f"  Multi-label (>1 condition): {stats['multi_label']} ({stats['multi_label']/stats['total']*100:.1f}%)")

        self.stats = stats

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int):
        row = self.df.iloc[idx]

        # Load ECG
        filepath = str(self.ecg_dir / row['Filename'])
        signal, fs, lead_names = self._load_ecg(filepath)

        n_original_leads = int(row['Lead'])

        if signal is None:
            # Return zeros if load fails
            signal = np.zeros((self.target_leads, self.target_length), dtype=np.float32)
        else:
            # Reorder leads to standard order and pad missing
            signal = self._standardize_leads(signal, lead_names)
            # Resample to target length
            signal = self._resample(signal, fs)

        # Normalize
        signal = self._normalize(signal)

        # Create lead mask BEFORE augmentation (reflects true data)
        lead_mask = create_lead_mask(n_original_leads)

        # Apply augmentation (training only)
        # Note: augmentation may zero additional leads (9-lead masking)
        if self.augmentor is not None:
            signal = self.augmentor(signal)
            # Check if augmentation masked any leads (all zeros)
            for lead_idx in NINE_LEAD_MISSING:
                if np.abs(signal[lead_idx]).sum() < 1e-6:
                    lead_mask[lead_idx] = 0.0

        # Get multi-hot label vector
        labels = np.array([
            row[f'label_{condition}']
            for condition in CONDITION_NAMES
        ], dtype=np.float32)

        # Normalize age to [0, 1] range (0-14 years = 0-5110 days)
        age_days = int(row['age_days'])
        age_normalized = min(age_days / 5110.0, 1.0)

        signal_tensor = torch.tensor(signal, dtype=torch.float32)
        labels_tensor = torch.tensor(labels, dtype=torch.float32)
        lead_mask_tensor = torch.tensor(lead_mask, dtype=torch.float32)
        age_tensor = torch.tensor([age_normalized], dtype=torch.float32)

        if self.return_metadata:
            meta = {
                'filename': row['Filename'],
                'age_days': age_days,
                'age_normalized': age_normalized,
                'n_leads': n_original_leads,
                'is_normal': bool(row['is_normal']),
                'n_conditions': int(row['n_conditions']),
                'icd_codes': row['icd_codes'],
            }
            return signal_tensor, labels_tensor, lead_mask_tensor, age_tensor, meta
        else:
            return signal_tensor, labels_tensor, lead_mask_tensor, age_tensor

    def _load_ecg(self, filepath: str) -> Optional[Tuple[np.ndarray, int, List[str]]]:
        """Load ECG from WFDB format."""
        if not WFDB_AVAILABLE:
            return None
        try:
            record = wfdb.rdrecord(filepath)
            return record.p_signal.T, record.fs, record.sig_name
        except Exception:
            return None

    def _standardize_leads(
        self,
        signal: np.ndarray,
        lead_names: List[str]
    ) -> np.ndarray:
        """Reorder to standard 12-lead order, pad missing with zeros."""
        n_samples = signal.shape[1]
        standardized = np.zeros((self.target_leads, n_samples), dtype=np.float32)

        for i, lead in enumerate(LEAD_ORDER[:self.target_leads]):
            if lead in lead_names:
                src_idx = lead_names.index(lead)
                standardized[i] = signal[src_idx]

        return standardized

    def _resample(self, signal: np.ndarray, fs: int) -> np.ndarray:
        """Resample signal to target length."""
        n_leads, n_samples = signal.shape

        if n_samples == self.target_length:
            return signal

        # Simple linear interpolation
        x_old = np.linspace(0, 1, n_samples)
        x_new = np.linspace(0, 1, self.target_length)

        resampled = np.zeros((n_leads, self.target_length), dtype=np.float32)
        for i in range(n_leads):
            resampled[i] = np.interp(x_new, x_old, signal[i])

        return resampled

    def _normalize(self, signal: np.ndarray) -> np.ndarray:
        """Z-score normalize each lead."""
        for i in range(signal.shape[0]):
            lead = signal[i]
            std = lead.std()
            if std > 1e-6:
                signal[i] = (lead - lead.mean()) / std
            else:
                signal[i] = lead - lead.mean()
        return signal

    def get_pos_weights(self) -> torch.Tensor:
        """
        Get positive class weights for weighted BCE loss.

        Weight = (N - n_pos) / n_pos, capped at tau=100
        """
        tau = 100.0  # Cap from benchmark paper
        weights = []

        for condition in CONDITION_NAMES:
            n_pos = self.df[f'label_{condition}'].sum()
            n_neg = len(self.df) - n_pos
            weight = min(n_neg / n_pos, tau) if n_pos > 0 else tau
            weights.append(weight)

        return torch.tensor(weights, dtype=torch.float32)

    def get_label_counts(self) -> Dict[str, int]:
        """Get count of positive samples per condition."""
        return {
            condition: int(self.df[f'label_{condition}'].sum())
            for condition in CONDITION_NAMES
        }

    def get_cooccurrence_matrix(self) -> np.ndarray:
        """Get condition co-occurrence matrix."""
        n_conditions = len(CONDITION_NAMES)
        cooccur = np.zeros((n_conditions, n_conditions), dtype=int)

        for _, row in self.df.iterrows():
            labels = [row[f'label_{c}'] for c in CONDITION_NAMES]
            for i in range(n_conditions):
                for j in range(n_conditions):
                    if labels[i] == 1 and labels[j] == 1:
                        cooccur[i, j] += 1

        return cooccur


def get_multilabel_dataloaders(
    data_dir: str,
    batch_size: int = 32,
    num_workers: int = 0,
    use_augmentation: bool = True,
) -> Tuple[DataLoader, DataLoader, DataLoader, torch.Tensor]:
    """
    Get train/val/test dataloaders for multi-label classification.

    Returns:
        train_loader, val_loader, test_loader, pos_weights
    """
    from ml.data.augmentations_v2 import get_train_augmentor

    # Only use augmentation for training
    train_augmentor = get_train_augmentor() if use_augmentation else None

    train_ds = ZZUMultiLabelDataset(
        data_dir, split='train', augmentor=train_augmentor, return_metadata=False
    )
    val_ds = ZZUMultiLabelDataset(data_dir, split='val', return_metadata=False)
    test_ds = ZZUMultiLabelDataset(data_dir, split='test', return_metadata=False)

    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True,
        num_workers=num_workers, pin_memory=True
    )
    val_loader = DataLoader(
        val_ds, batch_size=batch_size, shuffle=False,
        num_workers=num_workers, pin_memory=True
    )
    test_loader = DataLoader(
        test_ds, batch_size=batch_size, shuffle=False,
        num_workers=num_workers, pin_memory=True
    )

    return train_loader, val_loader, test_loader, train_ds.get_pos_weights()


if __name__ == "__main__":
    # Test dataset
    data_dir = Path(__file__).parent.parent.parent / "data" / "zzu-pecg"

    print("=" * 60)
    print("Testing ZZUMultiLabelDataset")
    print("=" * 60)

    # Load all splits
    train_ds = ZZUMultiLabelDataset(data_dir, split='train')
    val_ds = ZZUMultiLabelDataset(data_dir, split='val')
    test_ds = ZZUMultiLabelDataset(data_dir, split='test')

    # Test single sample
    print("\n" + "=" * 60)
    print("Sample inspection")
    print("=" * 60)

    signal, labels, lead_mask, age, meta = train_ds[0]
    print(f"\nSignal shape: {signal.shape}")
    print(f"Labels shape: {labels.shape}")
    print(f"Labels: {labels.numpy()} ({[c for c, l in zip(CONDITION_NAMES, labels) if l == 1]})")
    print(f"Lead mask: {lead_mask.numpy()}")
    print(f"Age normalized: {age.item():.3f} ({meta['age_days']} days)")
    print(f"Metadata: {meta}")

    # Test 9-lead sample
    print("\n" + "=" * 60)
    print("9-lead sample inspection")
    print("=" * 60)

    for i in range(len(train_ds)):
        _, _, lead_mask, _, meta = train_ds[i]
        if meta['n_leads'] == 9:
            signal, labels, lead_mask, age, meta = train_ds[i]
            print(f"Filename: {meta['filename']}")
            print(f"Lead mask: {lead_mask.numpy()}")
            print(f"V2 (idx 7) all zeros: {signal[7].abs().sum().item() < 1e-6}")
            print(f"V4 (idx 9) all zeros: {signal[9].abs().sum().item() < 1e-6}")
            print(f"V6 (idx 11) all zeros: {signal[11].abs().sum().item() < 1e-6}")
            break

    # Show positive class weights
    print("\n" + "=" * 60)
    print("Positive class weights (for weighted BCE)")
    print("=" * 60)

    weights = train_ds.get_pos_weights()
    for condition, weight in zip(CONDITION_NAMES, weights):
        print(f"  {condition}: {weight:.2f}")

    # Show co-occurrence matrix
    print("\n" + "=" * 60)
    print("Condition co-occurrence matrix (train)")
    print("=" * 60)

    cooccur = train_ds.get_cooccurrence_matrix()
    print(f"\n{'':15} " + " ".join(f"{c:>10}" for c in CONDITION_NAMES))
    for i, row_name in enumerate(CONDITION_NAMES):
        row_str = " ".join(f"{cooccur[i,j]:>10}" for j in range(len(CONDITION_NAMES)))
        print(f"{row_name:15} {row_str}")

    # Test dataloader
    print("\n" + "=" * 60)
    print("Dataloader test")
    print("=" * 60)

    train_loader, val_loader, test_loader, pos_weights = get_multilabel_dataloaders(
        data_dir, batch_size=4, use_augmentation=True
    )
    batch = next(iter(train_loader))
    signal, labels, lead_mask, age = batch
    print(f"Batch signal shape: {signal.shape}")
    print(f"Batch labels shape: {labels.shape}")
    print(f"Batch lead_mask shape: {lead_mask.shape}")
    print(f"Batch age shape: {age.shape}")
    print(f"Pos weights: {pos_weights}")
