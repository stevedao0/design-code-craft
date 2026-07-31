"""
KVC VCPMC Tariff calculation module.

Status: IMPLEMENTED (PHASE KVC-02b)

This module implements the VCPMC area tariff mode for Khu vui choi (KVC).
This is the SOURCE OF TRUTH for KVC money calculations.

User-confirmed formula:
- Base: 1-50m² = 1,000,000 VND
- For area > 50:
  raw_blocks = (area_m2 - 50) / 50
  - decimal < 0.5 => floor
  - decimal >= 0.5 => floor + 1
- Do NOT use ceil.
- Do NOT use banker's rounding.
- increment_amount = increment_blocks * 400,000
- location_subtotal = 1,000,000 + increment_amount
- Sum all locations
- Support applies before GTGT
- GTGT percent is user input (default 8%)

Rules:
- Backend calculation modules are source of truth for money
- Renderer must NOT recalculate
- Returns structured data including DOCX context
- No DB write in dry-run

Reference: F:\APPs\docs\plans\BACKGROUND_AREA_PRICING_TODO.md
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Literal

from ..common.money import format_money_vn, money_to_vietnamese_words
from .docx_context import build_kvc_vcpmc_docx_context


# =============================================================================
# CONSTANTS
# =============================================================================

KVC_BASE_FEE_VND = 1_000_000
KVC_INCREMENT_FEE_VND = 400_000
KVC_BASE_INCLUDED_AREA_M2 = 50
KVC_BLOCK_SIZE_M2 = 50


# =============================================================================
# ROUNDING HELPER
# =============================================================================

def round_increment_blocks_half_up(raw_blocks: float) -> int:
    """
    User-confirmed rounding rule for KVC VCPMC tariff increment blocks.

    IMPORTANT: Do NOT use Math.ceil or banker's rounding.

    Rules:
    - raw_blocks = (area_m2 - 50) / 50
    - decimal part < 0.5 => round down (floor)
    - decimal part >= 0.5 => round up (floor + 1)
    - exactly 0.5 => round up

    Examples:
    - 16.1 => 16 (decimal 0.1 < 0.5)
    - 16.49 => 16 (decimal 0.49 < 0.5)
    - 16.5 => 17 (decimal 0.5 >= 0.5)
    - 16.51 => 17 (decimal 0.51 >= 0.5)
    - 17.0 => 17 (exact integer)
    - 0.5 => 1 (boundary case)
    - 0.49 => 0 (below 0.5)
    """
    if raw_blocks <= 0:
        return 0
    floor_value = int(raw_blocks)
    decimal_part = raw_blocks - floor_value
    return floor_value + 1 if decimal_part >= 0.5 else floor_value


# =============================================================================
# SINGLE LOCATION CALCULATION
# =============================================================================

def calculate_location_tariff(
    area_m2: float,
    location_id: str,
    location_name: str = "",
) -> Dict[str, Any]:
    """
    Calculate VCPMC tariff for a single location.

    Formula:
    - Base: 1-50m² = 1,000,000 VND
    - For area > 50:
      raw_blocks = (area_m2 - 50) / 50
      increment_blocks = round_half_up(raw_blocks)
      increment_amount = increment_blocks * 400,000
    - location_subtotal = base + increment

    Args:
        area_m2: Area in square meters
        location_id: Location identifier
        location_name: Location display name

    Returns:
        Location calculation result
    """
    area = float(area_m2) if area_m2 else 0.0
    excess_area = max(0.0, area - KVC_BASE_INCLUDED_AREA_M2)
    raw_blocks = excess_area / KVC_BLOCK_SIZE_M2 if excess_area > 0 else 0.0
    increment_blocks = round_increment_blocks_half_up(raw_blocks)
    base_fee = KVC_BASE_FEE_VND
    increment_fee = increment_blocks * KVC_INCREMENT_FEE_VND
    location_subtotal = base_fee + increment_fee

    return {
        "location_id": location_id,
        "location_name": location_name or location_id,
        "area_m2": area,
        "base_included_area_m2": KVC_BASE_INCLUDED_AREA_M2,
        "excess_area_m2": excess_area,
        "raw_increment_blocks": raw_blocks,
        "increment_blocks": increment_blocks,
        "base_fee": base_fee,
        "increment_fee_per_block": KVC_INCREMENT_FEE_VND,
        "increment_amount": increment_fee,
        "location_subtotal": location_subtotal,
    }


# =============================================================================
# AGGREGATE CALCULATION
# =============================================================================

def calculate_kvc_vcpmc_tariff(
    *,
    locations: List[Dict[str, Any]],
    gtgt_percent: float = 8.0,
    support_percent: float = 0.0,
    support_amount: int = 0,
    support_note: str = "",
    usage_display_mode: Literal["auto", "text", "table"] = "auto",
) -> Dict[str, Any]:
    """
    Calculate KVC VCPMC tariff for all locations.

    This is the main entry point for dry-run calculation.

    Formula:
    1. Calculate each location separately
    2. Sum subtotals -> subtotal_before_support
    3. Apply support (before GTGT)
    4. Calculate GTGT on amount after support
    5. total = amount_after_support + GTGT

    CityGamesPlus verification:
    - 855m²: excess=805, raw=16.1, blocks=16, subtotal=7,400,000
    - 701m²: excess=651, raw=13.02, blocks=13, subtotal=6,200,000
    - 920m²: excess=870, raw=17.4, blocks=17, subtotal=7,800,000
    - subtotal_before_support = 21,400,000
    - GTGT 8% = 1,712,000
    - total = 23,112,000

    Args:
        locations: List of dicts with 'id', 'name', 'area_m2'
        gtgt_percent: GTGT percentage (default 8%)
        support_percent: Support percentage (optional)
        support_amount: Support amount in VND (optional)
        support_note: Note about support
        usage_display_mode: Display mode for usage locations (auto, text, table)

    Returns:
        Complete calculation result
    """
    warnings: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    # Validate inputs
    if gtgt_percent < 0:
        warnings.append({
            "field": "gtgt_percent",
            "message": "GTGT percent không thể âm, sử dụng 0.",
            "severity": "warning",
        })
        gtgt_percent = 0.0

    if support_percent < 0:
        warnings.append({
            "field": "support_percent",
            "message": "Tỷ lệ hỗ trợ không thể âm, sử dụng 0.",
            "severity": "warning",
        })
        support_percent = 0.0

    if support_amount < 0:
        warnings.append({
            "field": "support_amount",
            "message": "Số tiền hỗ trợ không thể âm, sử dụng 0.",
            "severity": "warning",
        })
        support_amount = 0

    # Check for invalid areas
    for loc in locations:
        area = loc.get("area_m2", 0) or 0
        if area < 0:
            # Negative values should be rejected by Pydantic, but add warning just in case
            warnings.append({
                "field": f"locations.{loc.get('id', 'unknown')}.area_m2",
                "message": f"Diện tích không thể âm, đã bỏ qua: {area}",
                "severity": "warning",
            })
        elif area == 0:
            # Zero area - warn but don't error, skip calculation
            warnings.append({
                "field": f"locations.{loc.get('id', 'unknown')}.area_m2",
                "message": f"Diện tích bằng 0, đã bỏ qua địa điểm này.",
                "severity": "warning",
            })

    # Calculate each location
    location_results: List[Dict[str, Any]] = []
    subtotal_before_support = 0

    for loc in locations:
        area = loc.get("area_m2", 0) or 0
        loc_id = loc.get("id", f"loc_{len(location_results)}")
        loc_name = loc.get("name", loc.get("location_name", loc_id))

        if area <= 0:
            # Skip but already logged error above
            continue

        result = calculate_location_tariff(area, loc_id, loc_name)
        location_results.append(result)
        subtotal_before_support += result["location_subtotal"]

    # Apply support (before GTGT)
    # Support can be either percentage or fixed amount
    support_from_percent = int(round(subtotal_before_support * support_percent / 100.0))
    total_support = support_amount + support_from_percent
    amount_after_support = max(0, subtotal_before_support - total_support)

    # Calculate GTGT
    gtgt_amount = int(round(amount_after_support * gtgt_percent / 100.0))
    total_amount = amount_after_support + gtgt_amount

    # Build detail rows for display
    detail_rows: List[Dict[str, Any]] = []
    for result in location_results:
        detail_rows.append({
            "location_id": result["location_id"],
            "location_name": result["location_name"],
            "area_m2": result["area_m2"],
            "base_fee": result["base_fee"],
            "increment_blocks": result["increment_blocks"],
            "increment_amount": result["increment_amount"],
            "location_subtotal": result["location_subtotal"],
        })

    # Build legacy DOCX context preview (text-based, backward compatible)
    docx_context_preview = _build_docx_context_preview(
        location_results=location_results,
        subtotal_before_support=subtotal_before_support,
        total_support=total_support,
        amount_after_support=amount_after_support,
        gtgt_percent=gtgt_percent,
        gtgt_amount=gtgt_amount,
        total_amount=total_amount,
    )

    # Build structured DOCX context preview (PHASE KVC-03)
    docx_context_preview_v2 = build_kvc_vcpmc_docx_context(
        location_results=location_results,
        subtotal_before_support=subtotal_before_support,
        support_percent=support_percent,
        support_amount=total_support,
        amount_after_support=amount_after_support,
        gtgt_percent=gtgt_percent,
        gtgt_amount=gtgt_amount,
        total_amount=total_amount,
        locations=locations,
        display_mode=usage_display_mode,
    )

    return {
        "ok": len(errors) == 0,
        "mode": "kvc_vcpmc_tariff_dry_run",
        "write_performed": False,
        "contract_created": False,
        "docx_generated": False,
        "xlsx_generated": False,
        "gcn_created": False,
        "nd17_calculated": False,
        "errors": errors,
        "warnings": warnings,
        "input_echo": {
            "location_count": len(locations),
            "gtgt_percent": gtgt_percent,
            "support_percent": support_percent,
            "support_amount": support_amount,
            "support_note": support_note,
            "usage_display_mode": usage_display_mode,
        },
        "calculation": {
            "location_results": location_results,
            "detail_rows": detail_rows,
            "subtotal_before_support": subtotal_before_support,
            "support_percent": support_percent,
            "support_amount": total_support,
            "amount_after_support": amount_after_support,
            "gtgt_percent": gtgt_percent,
            "gtgt_amount": gtgt_amount,
            "total_amount": total_amount,
            "total_amount_words": money_to_vietnamese_words(total_amount),
        },
        "docx_context_preview": docx_context_preview,
        "docx_context_preview_v2": docx_context_preview_v2,
    }


def _build_docx_context_preview(
    location_results: List[Dict[str, Any]],
    subtotal_before_support: int,
    total_support: int,
    amount_after_support: int,
    gtgt_percent: float,
    gtgt_amount: int,
    total_amount: int,
) -> Dict[str, str]:
    """Build DOCX context preview for renderer."""
    # Build locations table text
    location_lines: List[str] = []
    for i, loc in enumerate(location_results, 1):
        area = loc["area_m2"]
        blocks = loc["increment_blocks"]
        subtotal = loc["location_subtotal"]
        location_lines.append(
            f"{i}. {loc['location_name']}: {area}m² → {blocks} blocks = {format_money_vn(subtotal)}đ"
        )
    locations_table_text = "\n".join(location_lines) if location_lines else "(Chưa có địa điểm)"

    # Build pricing detail text
    pricing_lines: List[str] = []
    for loc in location_results:
        pricing_lines.append(
            f"{loc['location_name']}: {format_money_vn(loc['base_fee'])}đ + "
            f"{loc['increment_blocks']} blocks × {format_money_vn(loc['increment_fee_per_block'])}đ = "
            f"{format_money_vn(loc['location_subtotal'])}đ"
        )
    pricing_detail_text = "\n".join(pricing_lines)

    # Build pricing total text
    pricing_total_lines = [
        f"Tổng cộng trước hỗ trợ: {format_money_vn(subtotal_before_support)}đ",
    ]
    if total_support > 0:
        pricing_total_lines.append(
            f"Hỗ trợ: -{format_money_vn(total_support)}đ"
        )
    pricing_total_lines.extend([
        f"Sau hỗ trợ: {format_money_vn(amount_after_support)}đ",
        f"Thuế GTGT {gtgt_percent}%: +{format_money_vn(gtgt_amount)}đ",
        f"Tổng cộng: {format_money_vn(total_amount)}đ",
        f"(Bằng chữ: {money_to_vietnamese_words(total_amount).capitalize()}.)",
    ])
    pricing_total_text = "\n".join(pricing_total_lines)

    return {
        "locations_table_text": locations_table_text,
        "pricing_detail_text": pricing_detail_text,
        "pricing_total_text": pricing_total_text,
        "pricing_mode": "VCPMC_TARIFF",
    }
