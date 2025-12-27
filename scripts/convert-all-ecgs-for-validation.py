#!/usr/bin/env python3
"""
Convert ALL 12-lead ECGs from ZZU pECG dataset to JSON for validation.

This converts all 12,334 12-lead ECGs (instead of just 136 samples) to enable
comprehensive validation of the electrode swap detection algorithm.
"""

import json
import wfdb
import pandas as pd
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed
import sys

DATA_DIR = Path(__file__).parent.parent / "data" / "zzu-pecg"
ECG_DIR = DATA_DIR / "Child_ecg"
OUTPUT_DIR = DATA_DIR / "validation_ecgs_full"
OUTPUT_DIR.mkdir(exist_ok=True)


def get_age_description(age_days: int) -> str:
    """Get human-readable age."""
    if age_days < 30:
        return f"{age_days} days"
    elif age_days < 365:
        months = age_days // 30
        return f"{months} mo"
    else:
        years = age_days / 365.25
        if years < 2:
            return f"{age_days // 30} mo"
        return f"{years:.1f} yr"


def get_age_group(days: int) -> str:
    """Get age group name."""
    if days <= 30:
        return "Neonate (0-30d)"
    if days <= 365:
        return "Infant (1-12mo)"
    if days <= 1095:
        return "Toddler (1-3yr)"
    if days <= 4380:
        return "Child (3-12yr)"
    return "Adolescent (12+yr)"


def convert_single_ecg(row_dict: dict) -> dict | None:
    """Convert a single ECG to JSON format."""
    try:
        filename = row_dict["Filename"]
        parts = filename.split("/")
        ecg_path = ECG_DIR / parts[0] / parts[1] / parts[2]

        if not ecg_path.with_suffix(".hea").exists():
            return None

        record = wfdb.rdrecord(str(ecg_path))

        # Build signal object with leads
        leads = {}
        for i, lead_name in enumerate(record.sig_name):
            samples = record.p_signal[:, i].tolist()
            leads[lead_name] = samples

        age_days = row_dict["Age_Days"]
        ecg_id = row_dict["ECG_ID"]

        signal = {
            "leads": leads,
            "sampleRate": record.fs,
            "duration": record.sig_len / record.fs,
            "numSamples": record.sig_len,
        }

        patient = {
            "age": get_age_description(age_days),
            "ageDays": age_days,
            "ageGroup": get_age_group(age_days),
        }

        data = {
            "signal": signal,
            "patient": patient,
            "source": {
                "format": "WFDB",
                "filename": filename,
                "dataset": "ZZU pECG",
                "ecg_id": ecg_id,
            },
        }

        output_path = OUTPUT_DIR / f"{ecg_id}.json"
        with open(output_path, "w") as f:
            json.dump(data, f)

        return {
            "file": f"{ecg_id}.json",
            "ecg_id": ecg_id,
            "age": get_age_description(age_days),
            "ageDays": age_days,
            "ageGroup": get_age_group(age_days),
        }

    except Exception as e:
        return None


def main():
    print("=" * 70)
    print("Converting ALL 12-lead ECGs for validation")
    print("=" * 70)
    print()

    # Load attributes
    print("Loading AttributesDictionary.csv...")
    df = pd.read_csv(DATA_DIR / "AttributesDictionary.csv")
    df["Age_Days"] = df["Age"].str.extract(r"(\d+)").astype(int)

    # Filter 12-lead only
    df_12 = df[df["Lead"] == 12].copy()
    print(f"Found {len(df_12)} 12-lead ECGs")
    print()

    # Show distribution
    df_12["AgeGroup"] = df_12["Age_Days"].apply(get_age_group)
    print("Distribution by age group:")
    for group, count in df_12.groupby("AgeGroup").size().items():
        print(f"  {group}: {count}")
    print()

    # Convert to list of dicts for parallel processing
    rows = df_12.to_dict("records")

    # Process ECGs
    print("Converting ECGs (this may take a few minutes)...")
    converted = []
    failed = 0

    # Use parallel processing for speed
    with ProcessPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(convert_single_ecg, row): row for row in rows}

        for i, future in enumerate(as_completed(futures)):
            result = future.result()
            if result:
                converted.append(result)
            else:
                failed += 1

            if (i + 1) % 1000 == 0:
                print(f"  Processed {i + 1}/{len(rows)} ({len(converted)} success, {failed} failed)")

    print()
    print(f"Conversion complete: {len(converted)} success, {failed} failed")

    # Write index file
    index_path = OUTPUT_DIR / "index.json"
    with open(index_path, "w") as f:
        json.dump(converted, f, indent=2)
    print(f"Index written to: {index_path}")

    # Print summary
    print()
    print("Final counts by age group:")
    from collections import Counter

    counts = Counter(r["ageGroup"] for r in converted)
    for group in [
        "Neonate (0-30d)",
        "Infant (1-12mo)",
        "Toddler (1-3yr)",
        "Child (3-12yr)",
        "Adolescent (12+yr)",
    ]:
        print(f"  {group}: {counts.get(group, 0)}")


if __name__ == "__main__":
    main()
