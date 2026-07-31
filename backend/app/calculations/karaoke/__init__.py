"""
Karaoke calculation module.

This module handles Karaoke/Phòng thu âm pricing calculations.
Phòng thu âm uses the same calculation logic as Karaoke.

Rules:
- Calculation module is source of truth for money
- Renderer must NOT recalculate
- Returns structured data including DOCX context
"""

from .calculator import (
    KARAOKE_AREA_GROUP_COEFFICIENTS,
    ROOM_TIER_LABELS,
    normalize_karaoke_type,
    normalize_area_group,
    split_room_tiers,
    compute_karaoke_amounts,
    build_karaoke_calculation_context,
    calculate_karaoke_dry_run,
)

__all__ = [
    "KARAOKE_AREA_GROUP_COEFFICIENTS",
    "ROOM_TIER_LABELS",
    "normalize_karaoke_type",
    "normalize_area_group",
    "split_room_tiers",
    "compute_karaoke_amounts",
    "build_karaoke_calculation_context",
    "calculate_karaoke_dry_run",
]
