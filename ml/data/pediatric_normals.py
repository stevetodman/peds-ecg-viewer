"""
Pediatric ECG Normal Values
===========================

Ported from GEMUSE TypeScript implementation.

Data compiled from:
- Davignon A, et al. Normal ECG standards for infants and children.
  Pediatr Cardiol. 1979/80;1:123-131
- Rijnbeek PR, et al. New normal limits for the pediatric electrocardiogram.
  Eur Heart J. 2001;22:702-711
- Schwartz PJ, et al. Guidelines for the interpretation of the neonatal
  electrocardiogram. Eur Heart J. 2002;23:1329-1344
"""

from dataclasses import dataclass
from typing import Dict, List, Literal, Optional


@dataclass
class NormalRange:
    """Statistical normal range with percentiles."""
    p2: float   # 2nd percentile (lower limit)
    p50: float  # 50th percentile (median)
    p98: float  # 98th percentile (upper limit)
    mean: Optional[float] = None
    sd: Optional[float] = None


@dataclass
class TWavePattern:
    """T-wave normal patterns for V1."""
    normal: List[str]    # Polarities considered normal
    abnormal: List[str]  # Polarities that suggest pathology
    notes: str = ""


@dataclass
class AgeNormals:
    """Complete normal values for an age group."""
    heart_rate: NormalRange
    pr_interval: NormalRange
    qrs_duration: NormalRange
    qtc_bazett: NormalRange
    qrs_axis: NormalRange
    r_wave_v1: NormalRange
    s_wave_v1: NormalRange
    r_wave_v6: NormalRange
    s_wave_v6: NormalRange
    rs_ratio_v1: NormalRange
    rs_ratio_v6: NormalRange
    t_wave_v1: TWavePattern
    notes: str = ""


# Age group boundaries (in days)
AGE_GROUP_BOUNDS = [
    ("neonate_0_24h", 0, 1),
    ("neonate_1_3d", 1, 3),
    ("neonate_3_7d", 3, 7),
    ("neonate_8_30d", 8, 30),
    ("infant_1_3mo", 31, 90),
    ("infant_3_6mo", 91, 180),
    ("infant_6_12mo", 181, 365),
    ("toddler_1_3yr", 366, 1095),
    ("child_3_5yr", 1096, 1825),
    ("child_5_8yr", 1826, 2920),
    ("child_8_12yr", 2921, 4380),
    ("adolescent_12_16yr", 4381, 5840),
    ("adolescent_16_18yr", 5841, 6570),
]


PEDIATRIC_NORMALS: Dict[str, AgeNormals] = {
    "neonate_0_24h": AgeNormals(
        heart_rate=NormalRange(90, 145, 180, 143, 25),
        pr_interval=NormalRange(70, 100, 140),
        qrs_duration=NormalRange(40, 60, 80),
        qtc_bazett=NormalRange(370, 420, 470),
        qrs_axis=NormalRange(60, 135, 195),
        r_wave_v1=NormalRange(5, 15, 27),
        s_wave_v1=NormalRange(0, 5, 15),
        r_wave_v6=NormalRange(0, 4, 12),
        s_wave_v6=NormalRange(0, 4, 10),
        rs_ratio_v1=NormalRange(0.5, 3.0, 19.0),
        rs_ratio_v6=NormalRange(0.1, 1.0, 4.0),
        t_wave_v1=TWavePattern(['upright', 'flat'], [],
                               'Upright T in V1 normal in first 24 hours'),
        notes='Transitional circulation. Extreme right axis normal.',
    ),
    "neonate_1_3d": AgeNormals(
        heart_rate=NormalRange(90, 140, 175, 138, 22),
        pr_interval=NormalRange(70, 100, 140),
        qrs_duration=NormalRange(40, 60, 80),
        qtc_bazett=NormalRange(370, 420, 470),
        qrs_axis=NormalRange(65, 125, 185),
        r_wave_v1=NormalRange(5, 13, 25),
        s_wave_v1=NormalRange(0, 5, 15),
        r_wave_v6=NormalRange(1, 5, 13),
        s_wave_v6=NormalRange(0, 3, 10),
        rs_ratio_v1=NormalRange(0.5, 2.5, 15.0),
        rs_ratio_v6=NormalRange(0.2, 1.5, 5.0),
        t_wave_v1=TWavePattern(['upright', 'inverted', 'flat'], [],
                               'Transitional period. T-wave may be upright or inverting.'),
    ),
    "neonate_3_7d": AgeNormals(
        heart_rate=NormalRange(90, 140, 175, 138, 22),
        pr_interval=NormalRange(70, 100, 140),
        qrs_duration=NormalRange(40, 60, 80),
        qtc_bazett=NormalRange(370, 420, 470),
        qrs_axis=NormalRange(65, 125, 185),
        r_wave_v1=NormalRange(5, 13, 25),
        s_wave_v1=NormalRange(0, 5, 15),
        r_wave_v6=NormalRange(1, 5, 13),
        s_wave_v6=NormalRange(0, 3, 10),
        rs_ratio_v1=NormalRange(0.5, 2.5, 15.0),
        rs_ratio_v6=NormalRange(0.2, 1.5, 5.0),
        t_wave_v1=TWavePattern(['inverted', 'flat'], ['upright'],
                               'T-wave should be inverted. Upright T suggests RVH.'),
    ),
    "neonate_8_30d": AgeNormals(
        heart_rate=NormalRange(100, 150, 190, 149, 24),
        pr_interval=NormalRange(70, 100, 140),
        qrs_duration=NormalRange(40, 60, 80),
        qtc_bazett=NormalRange(370, 410, 460),
        qrs_axis=NormalRange(45, 110, 170),
        r_wave_v1=NormalRange(3, 10, 22),
        s_wave_v1=NormalRange(0, 5, 15),
        r_wave_v6=NormalRange(3, 8, 17),
        s_wave_v6=NormalRange(0, 3, 10),
        rs_ratio_v1=NormalRange(0.3, 2.0, 10.0),
        rs_ratio_v6=NormalRange(0.5, 2.5, 8.0),
        t_wave_v1=TWavePattern(['inverted', 'flat'], ['upright'],
                               'Upright T in V1 abnormal, suggests RVH.'),
    ),
    "infant_1_3mo": AgeNormals(
        heart_rate=NormalRange(105, 150, 185, 148, 21),
        pr_interval=NormalRange(70, 100, 145),
        qrs_duration=NormalRange(40, 60, 80),
        qtc_bazett=NormalRange(370, 410, 460),
        qrs_axis=NormalRange(30, 80, 135),
        r_wave_v1=NormalRange(3, 9, 20),
        s_wave_v1=NormalRange(1, 6, 17),
        r_wave_v6=NormalRange(5, 12, 22),
        s_wave_v6=NormalRange(0, 3, 10),
        rs_ratio_v1=NormalRange(0.2, 1.5, 6.0),
        rs_ratio_v6=NormalRange(1.0, 4.0, 12.0),
        t_wave_v1=TWavePattern(['inverted', 'flat'], ['upright']),
    ),
    "infant_3_6mo": AgeNormals(
        heart_rate=NormalRange(105, 145, 180, 143, 20),
        pr_interval=NormalRange(70, 105, 150),
        qrs_duration=NormalRange(40, 60, 85),
        qtc_bazett=NormalRange(370, 410, 455),
        qrs_axis=NormalRange(20, 65, 115),
        r_wave_v1=NormalRange(3, 9, 20),
        s_wave_v1=NormalRange(1, 7, 18),
        r_wave_v6=NormalRange(6, 13, 23),
        s_wave_v6=NormalRange(0, 3, 10),
        rs_ratio_v1=NormalRange(0.2, 1.2, 5.0),
        rs_ratio_v6=NormalRange(1.5, 4.5, 15.0),
        t_wave_v1=TWavePattern(['inverted', 'flat'], ['upright']),
    ),
    "infant_6_12mo": AgeNormals(
        heart_rate=NormalRange(95, 135, 170, 132, 20),
        pr_interval=NormalRange(75, 110, 155),
        qrs_duration=NormalRange(45, 65, 85),
        qtc_bazett=NormalRange(370, 410, 450),
        qrs_axis=NormalRange(10, 55, 105),
        r_wave_v1=NormalRange(2, 8, 18),
        s_wave_v1=NormalRange(2, 8, 20),
        r_wave_v6=NormalRange(7, 14, 24),
        s_wave_v6=NormalRange(0, 3, 9),
        rs_ratio_v1=NormalRange(0.1, 1.0, 4.0),
        rs_ratio_v6=NormalRange(2.0, 5.0, 18.0),
        t_wave_v1=TWavePattern(['inverted', 'flat'], ['upright']),
    ),
    "toddler_1_3yr": AgeNormals(
        heart_rate=NormalRange(80, 120, 155, 119, 19),
        pr_interval=NormalRange(80, 115, 160),
        qrs_duration=NormalRange(45, 65, 85),
        qtc_bazett=NormalRange(370, 405, 445),
        qrs_axis=NormalRange(10, 55, 100),
        r_wave_v1=NormalRange(2, 7, 15),
        s_wave_v1=NormalRange(3, 10, 22),
        r_wave_v6=NormalRange(8, 15, 25),
        s_wave_v6=NormalRange(0, 2, 7),
        rs_ratio_v1=NormalRange(0.1, 0.7, 3.0),
        rs_ratio_v6=NormalRange(2.5, 7.0, 25.0),
        t_wave_v1=TWavePattern(['inverted', 'flat'], ['upright']),
    ),
    "child_3_5yr": AgeNormals(
        heart_rate=NormalRange(70, 105, 140, 105, 18),
        pr_interval=NormalRange(85, 120, 165),
        qrs_duration=NormalRange(50, 70, 90),
        qtc_bazett=NormalRange(370, 405, 445),
        qrs_axis=NormalRange(10, 55, 100),
        r_wave_v1=NormalRange(2, 6, 14),
        s_wave_v1=NormalRange(4, 12, 24),
        r_wave_v6=NormalRange(9, 17, 27),
        s_wave_v6=NormalRange(0, 2, 6),
        rs_ratio_v1=NormalRange(0.05, 0.5, 2.0),
        rs_ratio_v6=NormalRange(3.0, 9.0, 30.0),
        t_wave_v1=TWavePattern(['inverted', 'flat'], ['upright'],
                               'Juvenile T-wave pattern normal.'),
    ),
    "child_5_8yr": AgeNormals(
        heart_rate=NormalRange(60, 95, 125, 94, 16),
        pr_interval=NormalRange(90, 125, 170),
        qrs_duration=NormalRange(55, 75, 95),
        qtc_bazett=NormalRange(370, 400, 440),
        qrs_axis=NormalRange(5, 55, 100),
        r_wave_v1=NormalRange(1, 5, 12),
        s_wave_v1=NormalRange(5, 13, 25),
        r_wave_v6=NormalRange(10, 18, 28),
        s_wave_v6=NormalRange(0, 2, 5),
        rs_ratio_v1=NormalRange(0.03, 0.4, 1.5),
        rs_ratio_v6=NormalRange(3.5, 10.0, 35.0),
        t_wave_v1=TWavePattern(['inverted', 'flat'], ['upright'],
                               'Juvenile T-wave pattern persists.'),
    ),
    "child_8_12yr": AgeNormals(
        heart_rate=NormalRange(55, 85, 115, 84, 15),
        pr_interval=NormalRange(95, 130, 175),
        qrs_duration=NormalRange(55, 80, 100),
        qtc_bazett=NormalRange(370, 400, 440),
        qrs_axis=NormalRange(0, 55, 95),
        r_wave_v1=NormalRange(1, 4, 10),
        s_wave_v1=NormalRange(5, 13, 25),
        r_wave_v6=NormalRange(10, 19, 30),
        s_wave_v6=NormalRange(0, 2, 5),
        rs_ratio_v1=NormalRange(0.02, 0.3, 1.2),
        rs_ratio_v6=NormalRange(4.0, 12.0, 40.0),
        t_wave_v1=TWavePattern(['inverted', 'flat'], ['upright'],
                               'Juvenile T-wave pattern common.'),
    ),
    "adolescent_12_16yr": AgeNormals(
        heart_rate=NormalRange(50, 75, 105, 76, 14),
        pr_interval=NormalRange(100, 140, 185),
        qrs_duration=NormalRange(60, 85, 105),
        qtc_bazett=NormalRange(370, 400, 440),
        qrs_axis=NormalRange(-5, 55, 95),
        r_wave_v1=NormalRange(0, 3, 9),
        s_wave_v1=NormalRange(4, 12, 24),
        r_wave_v6=NormalRange(9, 18, 30),
        s_wave_v6=NormalRange(0, 2, 5),
        rs_ratio_v1=NormalRange(0.01, 0.25, 1.0),
        rs_ratio_v6=NormalRange(4.0, 12.0, 45.0),
        t_wave_v1=TWavePattern(['inverted', 'flat', 'upright'], [],
                               'T-wave may become upright. Transition period.'),
    ),
    "adolescent_16_18yr": AgeNormals(
        heart_rate=NormalRange(50, 70, 100, 72, 13),
        pr_interval=NormalRange(110, 150, 200),
        qrs_duration=NormalRange(65, 90, 110),
        qtc_bazett=NormalRange(370, 400, 440),
        qrs_axis=NormalRange(-15, 50, 90),
        r_wave_v1=NormalRange(0, 3, 8),
        s_wave_v1=NormalRange(3, 10, 22),
        r_wave_v6=NormalRange(8, 16, 28),
        s_wave_v6=NormalRange(0, 2, 5),
        rs_ratio_v1=NormalRange(0.01, 0.3, 1.0),
        rs_ratio_v6=NormalRange(4.0, 10.0, 35.0),
        t_wave_v1=TWavePattern(['inverted', 'flat', 'upright'], [],
                               'Adult pattern acceptable.'),
    ),
}


def get_age_group(age_days: int) -> str:
    """Map age in days to age group ID."""
    for group_id, min_days, max_days in AGE_GROUP_BOUNDS:
        if min_days <= age_days <= max_days:
            return group_id
    # Default to adolescent for ages beyond bounds
    return "adolescent_16_18yr"


def get_normals_for_age(age_days: int) -> AgeNormals:
    """Get normal values for a specific age in days."""
    group_id = get_age_group(age_days)
    return PEDIATRIC_NORMALS[group_id]


def classify_value(
    value: float,
    normal_range: NormalRange,
) -> Literal['low', 'borderline_low', 'normal', 'borderline_high', 'high']:
    """Classify a value against a normal range."""
    if value < normal_range.p2:
        return 'low'
    if value > normal_range.p98:
        return 'high'

    # Borderline zones: within 10% of limits
    range_width = normal_range.p98 - normal_range.p2
    borderline_width = range_width * 0.1

    if value < normal_range.p2 + borderline_width:
        return 'borderline_low'
    if value > normal_range.p98 - borderline_width:
        return 'borderline_high'

    return 'normal'


def estimate_percentile(value: float, normal_range: NormalRange) -> float:
    """Estimate percentile for a value (0-100)."""
    p2, p50, p98 = normal_range.p2, normal_range.p50, normal_range.p98

    if value <= p2:
        ratio = value / p2 if p2 != 0 else 0
        return max(0, ratio * 2)

    if value >= p98:
        excess = (value - p98) / (p98 - p50) if (p98 - p50) != 0 else 0
        return min(100, 98 + excess * 2)

    if value <= p50:
        ratio = (value - p2) / (p50 - p2) if (p50 - p2) != 0 else 0.5
        return 2 + ratio * 48

    ratio = (value - p50) / (p98 - p50) if (p98 - p50) != 0 else 0.5
    return 50 + ratio * 48
