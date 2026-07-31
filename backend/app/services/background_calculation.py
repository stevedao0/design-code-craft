"""
Background/Karaoke calculation service - ported from OLD APP.

STRICTLY READ-ONLY:
- No DB write.
- No contract creation.
- No DOCX/XLSX generation.
- No GCN creation.
- Pure calculation only.

This file is a thin compatibility wrapper that re-exports from the modular
calculation engine under `calculations/`. All logic has been moved to:
- calculations/common/ - Shared helpers (money, GTGT, terms)
- calculations/karaoke/ - Karaoke/Phòng thu âm calculation

For new code, import directly from the modular modules:
    from app.calculations.common.money import format_money_vn
    from app.calculations.karaoke import calculate_karaoke_dry_run
"""

from __future__ import annotations

from typing import Any

# Re-export everything from the modular structure for backward compatibility
from app.calculations.common.money import (
    DEFAULT_BASE_SALARY_VND,
    VIETNAMESE_DIGITS,
    VIETNAMESE_SCALES,
    money_to_vietnamese_words,
    format_money_vn,
    format_coeff_vn,
    parse_int,
    parse_float,
)

from app.calculations.common.gtgt import (
    compute_gtgt_amount,
)

from app.calculations.common.terms import (
    detect_effective_term_months,
    _to_date_safe,
)

from app.calculations.karaoke import (
    KARAOKE_AREA_GROUP_COEFFICIENTS,
    ROOM_TIER_LABELS,
    normalize_karaoke_type,
    normalize_area_group,
    split_room_tiers,
    compute_karaoke_amounts,
    build_karaoke_calculation_context,
    calculate_karaoke_dry_run,
)

# Karaoke room section functions (moved from here)
from app.calculations.karaoke.calculator import (
    normalize_room_sections,
    build_room_display_text,
    build_pricing_detail_text,
    build_pricing_total_text,
)


# Legacy aliases for backward compatibility
def build_karaoke_calculation_context_legacy(**kwargs: Any) -> dict[str, Any]:
    """Legacy wrapper for build_karaoke_calculation_context."""
    return build_karaoke_calculation_context(**kwargs)


def compute_karaoke_amounts_legacy(**kwargs: Any) -> dict[str, Any]:
    """Legacy wrapper for compute_karaoke_amounts."""
    return compute_karaoke_amounts(**kwargs)
