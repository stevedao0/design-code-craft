"""
Common GTGT (VAT) calculation helpers.

Shared GTGT calculation functions used by all Background calculation domains.
"""

from typing import Tuple


def compute_gtgt_amount(pre_gtgt_amount: int, gtgt_percent: float) -> Tuple[int, int]:
    """
    Compute GTGT amount and total.

    Args:
        pre_gtgt_amount: Amount before GTGT
        gtgt_percent: GTGT percentage (e.g., 8.0 for 8%)

    Returns:
        Tuple of (gtgt_value, total_amount)
    """
    pct = float(gtgt_percent) if gtgt_percent is not None else 10.0
    if pct < 0:
        pct = 0.0
    gtgt_value = int(round(int(pre_gtgt_amount) * pct / 100.0))
    total = int(pre_gtgt_amount) + int(gtgt_value)
    return gtgt_value, total


def clamp_gtgt_percent(gtgt_percent: float | None) -> float:
    """
    Clamp GTGT percent to valid range.

    Args:
        gtgt_percent: GTGT percentage or None

    Returns:
        Clamped GTGT percentage (0.0 if negative, default 10.0 if None)
    """
    if gtgt_percent is None:
        return 10.0
    return max(0.0, float(gtgt_percent))
