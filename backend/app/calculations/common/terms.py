"""
Common contract term calculation helpers.

Shared functions for detecting effective contract term months.
Used by karaoke and other time-based calculations.
"""

from datetime import date, datetime
from typing import Optional, Union


def _to_date_safe(
    value: Optional[Union[date, datetime, str]]
) -> Optional[date]:
    """Convert value to date safely."""
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError:
            try:
                return datetime.strptime(value, "%d/%m/%Y").date()
            except ValueError:
                return None
    return None


def detect_effective_term_months(
    start_date: Optional[Union[date, datetime, str]],
    end_date: Optional[Union[date, datetime, str]]
) -> int:
    """
    Detect if contract is 6-month or 12-month effective term.

    Logic:
    - If end date is before start date or dates are missing, assume 12 months
    - If term is 170-200 days, assume 6 months
    - If term is 335-395 days, assume 12 months
    - If derived months <= 8, assume 6 months
    - Otherwise assume 12 months

    Args:
        start_date: Contract start date
        end_date: Contract end date

    Returns:
        6 for 6-month terms, 12 for 12-month terms
    """
    start = _to_date_safe(start_date)
    end = _to_date_safe(end_date)

    if start is None or end is None or end < start:
        return 12

    days = (end - start).days
    if 170 <= days <= 200:
        return 6
    if 335 <= days <= 395:
        return 12

    months = (end.year - start.year) * 12 + (end.month - start.month)
    if months <= 8:
        return 6
    return 12
