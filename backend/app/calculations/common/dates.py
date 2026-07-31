"""Date helpers for calculations.

Pure functions; no DB, no I/O. Used by domain calculators and shared by
the legacy `app.karaoke_calc` facade during the Phase 2 migration.
"""

from __future__ import annotations

from datetime import date
from typing import Optional


def add_one_year_safe(d: Optional[date]) -> Optional[date]:
    """Return ``d + 1 year`` or ``None`` if the input is None.

    This is the canonical safe wrapper for contract term end-date math.
    The legacy `app.karaoke_calc.add_one_year_safe` is being kept as a
    thin re-export of this function during the Phase 2 migration.
    """
    if d is None:
        return None
    try:
        return d.replace(year=d.year + 1)
    except ValueError:
        # Feb 29 on a non-leap target year → clamp to Feb 28.
        return d.replace(month=2, day=28, year=d.year + 1)


__all__ = ["add_one_year_safe"]