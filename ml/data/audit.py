#!/usr/bin/env python3
"""
ZZU-pECG Data Audit
===================

Run this BEFORE any training to understand the dataset.

Outputs:
- Class distribution tables
- Age group breakdown
- 9-lead vs 12-lead analysis
- Signal quality histograms
- Potential label noise flags

Usage:
    python ml/data/audit.py
"""

import os
import re
import sys
from pathlib import Path
from collections import Counter, defaultdict
from typing import Dict, List, Tuple, Optional

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Configuration
DATA_DIR = PROJECT_ROOT / "data" / "zzu-pecg"
OUTPUT_DIR = PROJECT_ROOT / "ml" / "data" / "audit_results"

# Disease categories for classification tasks
DISEASE_CATEGORIES = {
    "myocarditis": ["I40.0", "I40.9", "I51.4"],
    "cardiomyopathy": ["I42.0", "I42.2", "I42.9", "Q24.8"],
    "kawasaki": ["M30.3"],
    "chd_vsd": ["Q21.0"],
    "chd_asd": ["Q21.1"],
    "chd_avsd": ["Q21.2"],
    "chd_tof": ["Q21.3"],
    "chd_pda": ["Q25.0"],
    "chd_other": ["Q22.1", "Q25.6", "I37.0"],
}

# Age groups matching GEMUSE
AGE_GROUPS = [
    ("Neonate (0-30d)", 0, 30),
    ("Infant 1-3mo", 31, 90),
    ("Infant 3-6mo", 91, 180),
    ("Infant 6-12mo", 181, 365),
    ("Toddler 1-3yr", 366, 1095),
    ("Child 3-5yr", 1096, 1825),
    ("Child 5-8yr", 1826, 2920),
    ("Child 8-12yr", 2921, 4380),
    ("Adolescent 12-16yr", 4381, 5840),
]


def load_attributes() -> pd.DataFrame:
    """Load and parse the attributes dictionary CSV."""
    csv_path = DATA_DIR / "AttributesDictionary.csv"
    if not csv_path.exists():
        raise FileNotFoundError(f"AttributesDictionary.csv not found at {csv_path}")

    df = pd.read_csv(csv_path)

    # Parse age from string like "572d" to integer days
    df['age_days'] = df['Age'].str.extract(r'(\d+)').astype(int)
    df['age_years'] = df['age_days'] / 365.25

    # Clean gender
    df['gender'] = df['Gender'].str.replace("'", "").str.strip()

    # Parse leads
    df['n_leads'] = df['Lead'].astype(int)

    # Assign age group
    df['age_group'] = df['age_days'].apply(get_age_group)

    return df


def get_age_group(age_days: int) -> str:
    """Map age in days to age group."""
    for name, min_d, max_d in AGE_GROUPS:
        if min_d <= age_days <= max_d:
            return name
    return "Adolescent 12-16yr"  # Default for older


def parse_icd_codes(codes_str: str) -> List[str]:
    """Extract ICD-10 codes from string like \"'I40.0';'Q21.0'\"."""
    if pd.isna(codes_str):
        return []
    return re.findall(r"'([^']+)'", str(codes_str))


def parse_aha_codes(codes_str: str) -> List[str]:
    """Extract AHA codes from string, removing modifiers."""
    if pd.isna(codes_str):
        return []
    codes = re.findall(r"'([^']+)'", str(codes_str))
    return [c.split('+')[0] for c in codes]  # Remove modifiers


def get_disease_category(icd_codes: List[str]) -> List[str]:
    """Map ICD codes to our disease categories."""
    categories = []
    for cat_name, cat_codes in DISEASE_CATEGORIES.items():
        if any(code in icd_codes for code in cat_codes):
            categories.append(cat_name)
    return categories if categories else ["other"]


def parse_quality_scores(sqis_str: str) -> Dict[str, float]:
    """Parse quality scores string like \"'I':0.288;'II':0.323;...\"."""
    if pd.isna(sqis_str):
        return {}
    scores = {}
    for item in str(sqis_str).split(';'):
        match = re.match(r"'([^']+)':([\d.]+|Null)", item)
        if match:
            lead, val = match.groups()
            if val != 'Null':
                scores[lead] = float(val)
    return scores


def compute_mean_quality(scores: Dict[str, float]) -> float:
    """Compute mean quality score across leads."""
    if not scores:
        return np.nan
    vals = [v for v in scores.values() if not np.isnan(v)]
    return np.mean(vals) if vals else np.nan


def audit_class_distribution(df: pd.DataFrame) -> pd.DataFrame:
    """Compute class distribution for classification tasks."""
    results = []

    # Parse ICD codes
    df['icd_codes'] = df['ICD-10 code'].apply(parse_icd_codes)
    df['categories'] = df['icd_codes'].apply(get_disease_category)

    # Count each category
    all_cats = Counter()
    for cats in df['categories']:
        all_cats.update(cats)

    for cat, count in sorted(all_cats.items(), key=lambda x: -x[1]):
        cat_df = df[df['categories'].apply(lambda x: cat in x)]
        results.append({
            'category': cat,
            'n_records': count,
            'n_patients': cat_df['Patient_ID'].nunique(),
            'pct_of_dataset': count / len(df) * 100,
            'mean_age_years': cat_df['age_years'].mean(),
            'pct_male': (cat_df['gender'] == 'Male').mean() * 100,
        })

    return pd.DataFrame(results)


def audit_normal_vs_abnormal(df: pd.DataFrame) -> Dict:
    """Count normal vs abnormal ECGs based on AHA codes."""
    df['aha_codes'] = df['AHA_code'].apply(parse_aha_codes)

    normal_mask = df['aha_codes'].apply(lambda x: 'A1' in x or 'A2' in x)

    return {
        'normal_count': normal_mask.sum(),
        'normal_pct': normal_mask.mean() * 100,
        'abnormal_count': (~normal_mask).sum(),
        'abnormal_pct': (~normal_mask).mean() * 100,
    }


def audit_age_distribution(df: pd.DataFrame) -> pd.DataFrame:
    """Compute records per age group."""
    results = []
    for group_name, _, _ in AGE_GROUPS:
        group_df = df[df['age_group'] == group_name]
        results.append({
            'age_group': group_name,
            'n_records': len(group_df),
            'n_patients': group_df['Patient_ID'].nunique(),
            'pct_of_dataset': len(group_df) / len(df) * 100,
            'pct_9_lead': (group_df['n_leads'] == 9).mean() * 100,
        })
    return pd.DataFrame(results)


def audit_lead_configuration(df: pd.DataFrame) -> Dict:
    """Analyze 9-lead vs 12-lead distribution."""
    lead_counts = df['n_leads'].value_counts().to_dict()

    # By age group
    by_age = df.groupby('age_group')['n_leads'].apply(
        lambda x: (x == 9).mean() * 100
    ).to_dict()

    return {
        'total_9_lead': lead_counts.get(9, 0),
        'total_12_lead': lead_counts.get(12, 0),
        'pct_9_lead': lead_counts.get(9, 0) / len(df) * 100,
        'pct_9_lead_by_age': by_age,
    }


def audit_signal_quality(df: pd.DataFrame) -> Dict:
    """Analyze signal quality distributions."""
    # Parse quality scores
    df['pSQI_scores'] = df['pSQI'].apply(parse_quality_scores)
    df['basSQI_scores'] = df['basSQI'].apply(parse_quality_scores)
    df['bSQI_scores'] = df['bSQI'].apply(parse_quality_scores)

    df['mean_pSQI'] = df['pSQI_scores'].apply(compute_mean_quality)
    df['mean_basSQI'] = df['basSQI_scores'].apply(compute_mean_quality)
    df['mean_bSQI'] = df['bSQI_scores'].apply(compute_mean_quality)

    return {
        'pSQI': {
            'mean': df['mean_pSQI'].mean(),
            'std': df['mean_pSQI'].std(),
            'min': df['mean_pSQI'].min(),
            'max': df['mean_pSQI'].max(),
            'pct_below_0.3': (df['mean_pSQI'] < 0.3).mean() * 100,
        },
        'basSQI': {
            'mean': df['mean_basSQI'].mean(),
            'std': df['mean_basSQI'].std(),
            'min': df['mean_basSQI'].min(),
            'max': df['mean_basSQI'].max(),
            'pct_below_0.9': (df['mean_basSQI'] < 0.9).mean() * 100,
        },
        'bSQI': {
            'mean': df['mean_bSQI'].mean(),
            'std': df['mean_bSQI'].std(),
            'min': df['mean_bSQI'].min(),
            'max': df['mean_bSQI'].max(),
            'pct_below_0.9': (df['mean_bSQI'] < 0.9).mean() * 100,
        },
    }


def audit_multi_label(df: pd.DataFrame) -> Dict:
    """Analyze multi-label patterns."""
    df['n_icd_codes'] = df['ICD-10 code'].apply(lambda x: len(parse_icd_codes(x)))
    df['n_aha_codes'] = df['AHA_code'].apply(lambda x: len(parse_aha_codes(x)))

    return {
        'icd_codes_per_record': {
            'mean': df['n_icd_codes'].mean(),
            'max': df['n_icd_codes'].max(),
            'pct_multi': (df['n_icd_codes'] > 1).mean() * 100,
        },
        'aha_codes_per_record': {
            'mean': df['n_aha_codes'].mean(),
            'max': df['n_aha_codes'].max(),
            'pct_multi': (df['n_aha_codes'] > 1).mean() * 100,
        },
    }


def audit_patient_records(df: pd.DataFrame) -> Dict:
    """Analyze records per patient."""
    records_per_patient = df.groupby('Patient_ID').size()

    return {
        'records_per_patient': {
            'mean': records_per_patient.mean(),
            'median': records_per_patient.median(),
            'max': records_per_patient.max(),
            'pct_single': (records_per_patient == 1).mean() * 100,
        },
        'patients_with_multiple': (records_per_patient > 1).sum(),
    }


def plot_distributions(df: pd.DataFrame, output_dir: Path):
    """Generate visualization plots."""
    output_dir.mkdir(parents=True, exist_ok=True)

    # 1. Age distribution
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    axes[0].hist(df['age_years'], bins=50, edgecolor='black', alpha=0.7)
    axes[0].set_xlabel('Age (years)')
    axes[0].set_ylabel('Count')
    axes[0].set_title('Age Distribution')
    axes[0].axvline(df['age_years'].median(), color='red', linestyle='--',
                    label=f'Median: {df["age_years"].median():.1f}y')
    axes[0].legend()

    age_counts = df['age_group'].value_counts().reindex([g[0] for g in AGE_GROUPS]).fillna(0)
    axes[1].bar(range(len(age_counts)), age_counts.values)
    axes[1].set_xticks(range(len(age_counts)))
    axes[1].set_xticklabels(age_counts.index, rotation=45, ha='right', fontsize=8)
    axes[1].set_ylabel('Count')
    axes[1].set_title('Records by Age Group')

    plt.tight_layout()
    plt.savefig(output_dir / 'age_distribution.png', dpi=150)
    plt.close()

    # 2. Class distribution
    df['icd_codes'] = df['ICD-10 code'].apply(parse_icd_codes)
    df['categories'] = df['icd_codes'].apply(get_disease_category)

    cat_counts = Counter()
    for cats in df['categories']:
        cat_counts.update(cats)

    fig, ax = plt.subplots(figsize=(10, 6))
    cats = sorted(cat_counts.items(), key=lambda x: -x[1])
    ax.barh([c[0] for c in cats], [c[1] for c in cats])
    ax.set_xlabel('Count')
    ax.set_title('Disease Category Distribution')
    ax.invert_yaxis()
    plt.tight_layout()
    plt.savefig(output_dir / 'class_distribution.png', dpi=150)
    plt.close()

    # 3. 9-lead vs 12-lead by age
    fig, ax = plt.subplots(figsize=(10, 5))

    age_lead = df.groupby('age_group').apply(
        lambda x: pd.Series({
            '9-lead': (x['n_leads'] == 9).sum(),
            '12-lead': (x['n_leads'] == 12).sum(),
        })
    ).reindex([g[0] for g in AGE_GROUPS])

    age_lead.plot(kind='bar', stacked=True, ax=ax)
    ax.set_xlabel('Age Group')
    ax.set_ylabel('Count')
    ax.set_title('Lead Configuration by Age Group')
    ax.legend(title='Leads')
    plt.xticks(rotation=45, ha='right')
    plt.tight_layout()
    plt.savefig(output_dir / 'leads_by_age.png', dpi=150)
    plt.close()

    # 4. Signal quality histograms
    df['mean_pSQI'] = df['pSQI'].apply(parse_quality_scores).apply(compute_mean_quality)
    df['mean_basSQI'] = df['basSQI'].apply(parse_quality_scores).apply(compute_mean_quality)
    df['mean_bSQI'] = df['bSQI'].apply(parse_quality_scores).apply(compute_mean_quality)

    fig, axes = plt.subplots(1, 3, figsize=(15, 4))

    for ax, col, title in zip(axes,
                               ['mean_pSQI', 'mean_basSQI', 'mean_bSQI'],
                               ['pSQI (Periodicity)', 'basSQI (Baseline)', 'bSQI (Beat)']):
        ax.hist(df[col].dropna(), bins=50, edgecolor='black', alpha=0.7)
        ax.set_xlabel('Score')
        ax.set_ylabel('Count')
        ax.set_title(title)
        ax.axvline(df[col].mean(), color='red', linestyle='--',
                   label=f'Mean: {df[col].mean():.3f}')
        ax.legend()

    plt.tight_layout()
    plt.savefig(output_dir / 'signal_quality.png', dpi=150)
    plt.close()

    print(f"Plots saved to {output_dir}")


def main():
    """Run complete data audit."""
    print("=" * 60)
    print("ZZU-pECG DATA AUDIT")
    print("=" * 60)

    # Load data
    print("\nLoading data...")
    df = load_attributes()
    print(f"Loaded {len(df):,} ECG records from {df['Patient_ID'].nunique():,} patients")

    # Basic stats
    print("\n" + "-" * 40)
    print("BASIC STATISTICS")
    print("-" * 40)
    print(f"Total records:       {len(df):,}")
    print(f"Unique patients:     {df['Patient_ID'].nunique():,}")
    print(f"Age range:           {df['age_years'].min():.2f} - {df['age_years'].max():.2f} years")
    print(f"Median age:          {df['age_years'].median():.2f} years")

    # Class distribution
    print("\n" + "-" * 40)
    print("DISEASE CATEGORY DISTRIBUTION")
    print("-" * 40)
    class_df = audit_class_distribution(df)
    print(class_df.to_string(index=False))

    # Normal vs abnormal
    print("\n" + "-" * 40)
    print("NORMAL VS ABNORMAL (AHA codes)")
    print("-" * 40)
    norm = audit_normal_vs_abnormal(df)
    print(f"Normal (A1/A2):   {norm['normal_count']:,} ({norm['normal_pct']:.1f}%)")
    print(f"Abnormal:         {norm['abnormal_count']:,} ({norm['abnormal_pct']:.1f}%)")

    # Age distribution
    print("\n" + "-" * 40)
    print("AGE GROUP DISTRIBUTION")
    print("-" * 40)
    age_df = audit_age_distribution(df)
    print(age_df.to_string(index=False))

    # Lead configuration
    print("\n" + "-" * 40)
    print("LEAD CONFIGURATION")
    print("-" * 40)
    leads = audit_lead_configuration(df)
    print(f"9-lead ECGs:      {leads['total_9_lead']:,} ({leads['pct_9_lead']:.1f}%)")
    print(f"12-lead ECGs:     {leads['total_12_lead']:,} ({100-leads['pct_9_lead']:.1f}%)")
    print("\n9-lead percentage by age group:")
    for age, pct in leads['pct_9_lead_by_age'].items():
        print(f"  {age:25s}: {pct:.1f}%")

    # Signal quality
    print("\n" + "-" * 40)
    print("SIGNAL QUALITY")
    print("-" * 40)
    quality = audit_signal_quality(df)
    for metric, stats in quality.items():
        print(f"\n{metric}:")
        print(f"  Mean: {stats['mean']:.3f} (std: {stats['std']:.3f})")
        print(f"  Range: {stats['min']:.3f} - {stats['max']:.3f}")
        threshold_key = [k for k in stats.keys() if 'pct_below' in k][0]
        print(f"  {threshold_key}: {stats[threshold_key]:.1f}%")

    # Multi-label analysis
    print("\n" + "-" * 40)
    print("MULTI-LABEL ANALYSIS")
    print("-" * 40)
    multi = audit_multi_label(df)
    print(f"ICD-10 codes per record:  {multi['icd_codes_per_record']['mean']:.2f} avg, "
          f"{multi['icd_codes_per_record']['max']} max, "
          f"{multi['icd_codes_per_record']['pct_multi']:.1f}% multi-label")
    print(f"AHA codes per record:     {multi['aha_codes_per_record']['mean']:.2f} avg, "
          f"{multi['aha_codes_per_record']['max']} max, "
          f"{multi['aha_codes_per_record']['pct_multi']:.1f}% multi-label")

    # Patient records
    print("\n" + "-" * 40)
    print("RECORDS PER PATIENT")
    print("-" * 40)
    patient = audit_patient_records(df)
    print(f"Mean records per patient:   {patient['records_per_patient']['mean']:.2f}")
    print(f"Median records per patient: {patient['records_per_patient']['median']:.0f}")
    print(f"Max records per patient:    {patient['records_per_patient']['max']}")
    print(f"Patients with single ECG:   {patient['records_per_patient']['pct_single']:.1f}%")
    print(f"Patients with multiple ECGs: {patient['patients_with_multiple']:,}")

    # Generate plots
    print("\n" + "-" * 40)
    print("GENERATING PLOTS")
    print("-" * 40)
    plot_distributions(df, OUTPUT_DIR)

    # Save summary CSV
    class_df.to_csv(OUTPUT_DIR / 'class_distribution.csv', index=False)
    age_df.to_csv(OUTPUT_DIR / 'age_distribution.csv', index=False)
    print(f"CSV summaries saved to {OUTPUT_DIR}")

    print("\n" + "=" * 60)
    print("AUDIT COMPLETE")
    print("=" * 60)

    # Recommendations
    print("\nRECOMMENDATIONS:")
    print("-" * 40)

    if leads['pct_9_lead'] > 10:
        print(f"[!] {leads['pct_9_lead']:.0f}% are 9-lead. Consider:")
        print("    - Lead masking augmentation during training")
        print("    - Separate evaluation on 9-lead subset")

    low_quality_pct = quality['pSQI']['pct_below_0.3']
    if low_quality_pct > 5:
        print(f"[!] {low_quality_pct:.0f}% have low pSQI (<0.3). Consider:")
        print("    - Quality-based sample weighting")
        print("    - Excluding lowest quality ECGs")

    if multi['icd_codes_per_record']['pct_multi'] > 30:
        print(f"[!] {multi['icd_codes_per_record']['pct_multi']:.0f}% are multi-label. Consider:")
        print("    - Multi-label classification head")
        print("    - Hierarchical classification")

    return df


if __name__ == "__main__":
    df = main()
