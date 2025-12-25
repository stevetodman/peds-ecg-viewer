"""
ZZU-pECG PyTorch Dataset
========================

Simple dataset for CHD detection with augmentation support.
"""

import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Callable

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset

try:
    import wfdb
    WFDB_AVAILABLE = True
except ImportError:
    WFDB_AVAILABLE = False


# Standard 12-lead order
LEAD_ORDER = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']


def parse_icd_codes(codes_str: str) -> List[str]:
    """Extract ICD-10 codes from string."""
    if pd.isna(codes_str):
        return []
    return re.findall(r"'([^']+)'", str(codes_str))


def has_chd(icd_codes: List[str]) -> bool:
    """Check if any CHD ICD-10 codes present."""
    chd_prefixes = ['Q21', 'Q22', 'Q23', 'Q24', 'Q25']
    return any(
        any(code.startswith(prefix) for prefix in chd_prefixes)
        for code in icd_codes
    )


def has_any_abnormality(aha_codes_str: str) -> bool:
    """Check if ECG is abnormal (not A1 or A2)."""
    if pd.isna(aha_codes_str):
        return True  # Assume abnormal if unknown
    codes = re.findall(r"'([^']+)'", str(aha_codes_str))
    base_codes = [c.split('+')[0] for c in codes]
    return 'A1' not in base_codes and 'A2' not in base_codes


class ZZUDataset(Dataset):
    """
    PyTorch Dataset for ZZU-pECG.

    Args:
        data_dir: Path to zzu-pecg directory
        split: 'train', 'val', or 'test'
        task: 'chd' or 'abnormal'
        target_length: Resample signals to this length (samples)
        target_leads: Number of leads (12 for standard, pads 9-lead with zeros)
        augmentor: Optional augmentation function/callable
    """

    def __init__(
        self,
        data_dir: str,
        split: str = 'train',
        task: str = 'chd',
        target_length: int = 5000,  # 10 seconds at 500Hz
        target_leads: int = 12,
        random_state: int = 42,
        augmentor: Optional[Callable] = None,
    ):
        self.data_dir = Path(data_dir)
        self.ecg_dir = self.data_dir / "Child_ecg"
        self.split = split
        self.task = task
        self.target_length = target_length
        self.target_leads = target_leads
        self.augmentor = augmentor

        # Load metadata
        csv_path = self.data_dir / "AttributesDictionary.csv"
        df = pd.read_csv(csv_path)

        # Parse age and labels
        df['age_days'] = df['Age'].str.extract(r'(\d+)').astype(int)
        df['icd_codes'] = df['ICD-10 code'].apply(parse_icd_codes)
        df['has_chd'] = df['icd_codes'].apply(has_chd)
        df['is_abnormal'] = df['AHA_code'].apply(has_any_abnormality)

        # Patient-level split
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

        # Set label column based on task
        self.label_col = 'has_chd' if task == 'chd' else 'is_abnormal'

        print(f"ZZUDataset [{split}]: {len(self.df)} samples, "
              f"{self.df[self.label_col].sum()} positive ({self.df[self.label_col].mean()*100:.1f}%)")

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor, Dict]:
        row = self.df.iloc[idx]

        # Load ECG
        filepath = str(self.ecg_dir / row['Filename'])
        signal, fs, lead_names = self._load_ecg(filepath)

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

        # Apply augmentation (training only)
        if self.augmentor is not None:
            signal = self.augmentor(signal)

        # Get label
        label = float(row[self.label_col])

        # Metadata
        meta = {
            'filename': row['Filename'],
            'age_days': row['age_days'],
            'n_leads': row['Lead'],
        }

        return (
            torch.tensor(signal, dtype=torch.float32),
            torch.tensor(label, dtype=torch.float32),
            meta
        )

    def _load_ecg(self, filepath: str) -> Optional[Tuple[np.ndarray, int, List[str]]]:
        """Load ECG from WFDB format."""
        if not WFDB_AVAILABLE:
            return None
        try:
            record = wfdb.rdrecord(filepath)
            return record.p_signal.T, record.fs, record.sig_name
        except:
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

    def get_class_weights(self) -> torch.Tensor:
        """Get class weights for imbalanced data."""
        n_pos = self.df[self.label_col].sum()
        n_neg = len(self.df) - n_pos
        weight_pos = n_neg / n_pos if n_pos > 0 else 1.0
        return torch.tensor([1.0, weight_pos], dtype=torch.float32)


def get_dataloaders(
    data_dir: str,
    task: str = 'chd',
    batch_size: int = 32,
    num_workers: int = 0,  # MPS works better with 0
    use_augmentation: bool = True,
) -> Tuple:
    """Get train/val/test dataloaders."""
    from torch.utils.data import DataLoader
    from ml.data.augmentations import get_train_augmentor

    # Only use augmentation for training
    train_augmentor = get_train_augmentor() if use_augmentation else None

    train_ds = ZZUDataset(data_dir, split='train', task=task, augmentor=train_augmentor)
    val_ds = ZZUDataset(data_dir, split='val', task=task)
    test_ds = ZZUDataset(data_dir, split='test', task=task)

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

    return train_loader, val_loader, test_loader, train_ds.get_class_weights()


if __name__ == "__main__":
    # Test dataset
    data_dir = Path(__file__).parent.parent.parent / "data" / "zzu-pecg"

    train_ds = ZZUDataset(data_dir, split='train', task='chd')
    print(f"\nLoading sample...")
    signal, label, meta = train_ds[0]
    print(f"Signal shape: {signal.shape}")
    print(f"Label: {label}")
    print(f"Meta: {meta}")
