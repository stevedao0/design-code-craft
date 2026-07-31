"""
KVC ND17/2023 calculation module.

Status: IMPLEMENTED (PHASE KVC-05)

This module implements the ND17/2023 pricing mode for Khu vui choi (KVC).

Legal Basis: Nghị định 17/2023/NĐ-CP, Phụ lục II, Mục 8

Formula:
Số tiền bản quyền chi trả (tính theo năm) = Mức lương cơ sở × Hệ số điều chỉnh

KVC / Mục 8 Coefficient by Area:
- Đến 200 m²: coefficient = 0.7
- Từ trên 200 m² đến 500 m²: coefficient = 0.7 + (area - 200) × 0.003
- Trên 500 m²: coefficient = 0.7 + 300 × 0.003 + (area - 500) × 0.001

Cap: Số tiền bản quyền tối đa = 12 × Mức lương cơ sở

Urban Classification Adjustment:
- HN_HCM = 1.0 (100%)
- LOAI_I = 0.8 (80%)
- LOAI_II = 0.6 (60%)
- LOAI_III = 0.4 (40%)
- LOAI_IV = 0.2 (20%)
- LOAI_V = 0.1 (10%)

Calculation Order:
1. Calculate coefficient by area
2. raw_amount = coefficient × base_salary
3. cap_amount = 12 × base_salary
4. capped_amount = min(raw_amount, cap_amount)
5. urban_adjusted_amount = capped_amount × urban_rate
6. Sum all locations
7. Apply support/discount before GTGT
8. amount_before_gtgt = subtotal_after_urban - total_support_amount
9. gtgt_amount = round(amount_before_gtgt × gtgt_percent / 100)
10. total_amount = amount_before_gtgt + gtgt_amount

Rules:
- Calculation module is source of truth for money
- Renderer must NOT recalculate
- Returns structured data including DOCX context
- No DB write in dry-run

Reference: F:\APPs\docs\audits\KVC_ND17_FORMULA_AUDIT.md
Reference: F:\APPs\docs\plans\BACKGROUND_AREA_PRICING_TODO.md
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from ..common.money import format_money_vn, money_to_vietnamese_words
from .docx_context import build_usage_locations_context, get_effective_display_mode


# =============================================================================
# CONSTANTS
# =============================================================================

# Base salary from Nghị định 161/2026/NĐ-CP (effective 01/07/2026)
DEFAULT_BASE_SALARY_VND = 2_530_000

# ND17 mode identifier
ND17_MODE = "ND17"

# ND17 KVC coefficient constants (Phụ lục II Mục 8)
ND17_KVC_BASE_COEFFICIENT = 0.7
ND17_KVC_FIRST_THRESHOLD_M2 = 200
ND17_KVC_SECOND_THRESHOLD_M2 = 500
ND17_KVC_INCREMENT_200_500 = 0.003  # per m² for 200 < area <= 500
ND17_KVC_INCREMENT_OVER_500 = 0.001  # per m² for area > 500
ND17_KVC_MAX_MULTIPLIER = 12  # Cap: 12 × base_salary

# Urban classification rates (for items 1-10 of Phụ lục II)
URBAN_RATES = {
    "HN_HCM": 1.0,  # Hà Nội và TP.HCM: 100%
    "LOAI_I": 0.8,  # Đô thị loại I: 80%
    "LOAI_II": 0.6,  # Đô thị loại II: 60%
    "LOAI_III": 0.4,  # Đô thị loại III: 40%
    "LOAI_IV": 0.2,  # Đô thị loại IV: 20%
    "LOAI_V": 0.1,  # Đô thị loại V: 10%
}

# Legal basis text for DOCX
LEGAL_BASIS_TEXT = "Nghị định 17/2023/NĐ-CP, Phụ lục II, Mục 8"


# =============================================================================
# URBAN RATE LOOKUP
# =============================================================================

def get_urban_rate(urban_class: Optional[str]) -> float:
    """
    Get urban adjustment rate based on urban classification.

    Args:
        urban_class: Urban classification (HN_HCM, LOAI_I, LOAI_II, LOAI_III, LOAI_IV, LOAI_V)

    Returns:
        Urban rate (0.1 to 1.0), default 1.0 for HN/HCM
    """
    if urban_class is None:
        return 1.0  # Default: HN/HCM rate
    return URBAN_RATES.get(urban_class.upper(), 1.0)


# =============================================================================
# SINGLE LOCATION CALCULATION
# =============================================================================

def calculate_nd17_kvc_location(
    location: Dict[str, Any],
    base_salary: float,
    urban_class: Optional[str],
    urban_rate_override: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Calculate ND17 royalty for a single KVC location.

    Formula:
    - Đến 200 m²: coefficient = 0.7
    - Từ trên 200 m² đến 500 m²: coefficient = 0.7 + (area - 200) × 0.003
    - Trên 500 m²: coefficient = 0.7 + 300 × 0.003 + (area - 500) × 0.001

    Then apply cap: capped_amount = min(raw_amount, 12 × base_salary)
    Then apply urban rate: urban_adjusted = capped_amount × urban_rate

    Args:
        location: Location dict with 'id', 'name', 'area_m2'
        base_salary: Mức lương cơ sở
        urban_class: Urban classification
        urban_rate_override: Override urban rate (optional)

    Returns:
        Location calculation result
    """
    area_m2 = float(location.get("area_m2", 0) or 0)
    location_id = str(location.get("id", "unknown"))
    location_name = str(location.get("name") or location.get("location_name") or location_id)

    # Calculate coefficient based on area
    if area_m2 <= ND17_KVC_FIRST_THRESHOLD_M2:
        coefficient = ND17_KVC_BASE_COEFFICIENT
        coefficient_formula = f"{ND17_KVC_BASE_COEFFICIENT} (đến {ND17_KVC_FIRST_THRESHOLD_M2} m²)"
    elif area_m2 <= ND17_KVC_SECOND_THRESHOLD_M2:
        excess = area_m2 - ND17_KVC_FIRST_THRESHOLD_M2
        coefficient = ND17_KVC_BASE_COEFFICIENT + excess * ND17_KVC_INCREMENT_200_500
        coefficient_formula = (
            f"{ND17_KVC_BASE_COEFFICIENT} + {excess:.0f} × {ND17_KVC_INCREMENT_200_500} = {coefficient:.4f}"
        )
    else:
        # First 200m²: 0.7
        # 200-500m²: (500-200) × 0.003 = 0.9
        # Over 500m²: (area - 500) × 0.001
        excess_200_500 = ND17_KVC_SECOND_THRESHOLD_M2 - ND17_KVC_FIRST_THRESHOLD_M2
        base_for_200_500 = ND17_KVC_BASE_COEFFICIENT + excess_200_500 * ND17_KVC_INCREMENT_200_500
        excess_over_500 = area_m2 - ND17_KVC_SECOND_THRESHOLD_M2
        coefficient = base_for_200_500 + excess_over_500 * ND17_KVC_INCREMENT_OVER_500
        coefficient_formula = (
            f"{ND17_KVC_BASE_COEFFICIENT} + {excess_200_500} × {ND17_KVC_INCREMENT_200_500} + "
            f"{excess_over_500:.0f} × {ND17_KVC_INCREMENT_OVER_500} = {coefficient:.4f}"
        )

    # Calculate raw amount (before cap)
    raw_amount = coefficient * base_salary

    # Apply cap
    cap_amount = ND17_KVC_MAX_MULTIPLIER * base_salary
    cap_applied = raw_amount > cap_amount
    capped_amount = min(raw_amount, cap_amount)

    # Apply urban adjustment
    # Use override rate if provided, otherwise use urban_class lookup
    effective_urban_rate = urban_rate_override if urban_rate_override is not None else get_urban_rate(urban_class)
    urban_adjusted_amount = int(round(capped_amount * effective_urban_rate))

    return {
        "location_id": location_id,
        "location_name": location_name,
        "area_m2": area_m2,
        "coefficient": coefficient,
        "coefficient_formula": coefficient_formula,
        "base_salary": base_salary,
        "raw_amount": int(round(raw_amount)),
        "cap_amount": cap_amount,
        "cap_applied": cap_applied,
        "capped_amount": int(capped_amount),
        "urban_rate": effective_urban_rate,
        "urban_adjusted_amount": urban_adjusted_amount,
    }


# =============================================================================
# AGGREGATE CALCULATION
# =============================================================================

def calculate_nd17_kvc_tariff(
    *,
    locations: List[Dict[str, Any]],
    base_salary: float = DEFAULT_BASE_SALARY_VND,
    urban_class: Optional[str] = None,
    urban_rate: Optional[float] = None,
    gtgt_percent: float = 8.0,
    support_percent: float = 0.0,
    support_amount: int = 0,
    support_note: str = "",
    include_premise_services: bool = False,
    premise_services_note: str = "",
    usage_display_mode: Literal["auto", "text", "table"] = "auto",
) -> Dict[str, Any]:
    """
    Calculate ND17 royalty for KVC across all locations.

    This is the main entry point for dry-run calculation.

    Calculation Order:
    1. Calculate coefficient by area for each location
    2. raw_amount = coefficient × base_salary
    3. cap_amount = 12 × base_salary
    4. capped_amount = min(raw_amount, cap_amount)
    5. urban_adjusted_amount = capped_amount × urban_rate
    6. Sum all locations
    7. Apply support/discount before GTGT
    8. amount_before_gtgt = subtotal_after_urban - total_support_amount
    9. gtgt_amount = round(amount_before_gtgt × gtgt_percent / 100)
    10. total_amount = amount_before_gtgt + gtgt_amount

    Args:
        locations: List of location dicts with 'id', 'name', 'area_m2'
        base_salary: Mức lương cơ sở (default 2,340,000)
        urban_class: Urban classification (HN_HCM, LOAI_I, etc.)
        urban_rate: Override urban rate (optional)
        gtgt_percent: GTGT percentage (default 8%)
        support_percent: Support percentage (optional)
        support_amount: Support amount in VND (optional)
        support_note: Note about support
        include_premise_services: Whether to include premise services warning
        premise_services_note: Note about which items apply
        usage_display_mode: Display mode for usage locations (auto, text, table)

    Returns:
        Complete calculation result
    """
    warnings: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    # Validate inputs
    if base_salary <= 0:
        errors.append({
            "field": "base_salary",
            "message": "Mức lương cơ sở phải lớn hơn 0.",
        })
        return _build_error_result(errors, warnings, locations, gtgt_percent)

    if gtgt_percent < 0:
        warnings.append({
            "field": "gtgt_percent",
            "message": "GTGT percent không thể âm, sử dụng 0.",
            "severity": "warning",
        })
        gtgt_percent = 0.0

    if gtgt_percent > 100:
        warnings.append({
            "field": "gtgt_percent",
            "message": "GTGT percent không thể quá 100, đã giới hạn.",
            "severity": "warning",
        })
        gtgt_percent = 100.0

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
            errors.append({
                "field": f"locations.{loc.get('id', 'unknown')}.area_m2",
                "message": f"Diện tích không thể âm: {area}",
            })
        elif area == 0:
            warnings.append({
                "field": f"locations.{loc.get('id', 'unknown')}.area_m2",
                "message": f"Diện tích bằng 0, đã bỏ qua địa điểm này.",
                "severity": "warning",
            })

    if errors:
        return _build_error_result(errors, warnings, locations, gtgt_percent)

    # Add premise services warning
    if include_premise_services:
        warnings.append({
            "field": "premise_services",
            "message": (
                "Dịch vụ trong khuôn viên KVC như cafe, nhà hàng, karaoke, bar... "
                "cần chọn thêm module tính riêng tương ứng. "
                "Chỉ tính tiền cho Mục 8 (Khu vui chơi, giải trí) trong phase này."
            ),
            "severity": "info",
        })

    # Calculate effective urban rate
    if urban_rate is not None:
        effective_urban_rate = urban_rate
    else:
        effective_urban_rate = get_urban_rate(urban_class)

    # Calculate each location
    location_results: List[Dict[str, Any]] = []
    subtotal_after_urban = 0
    cap_was_applied = False

    for loc in locations:
        area = loc.get("area_m2", 0) or 0
        if area <= 0:
            continue

        result = calculate_nd17_kvc_location(loc, base_salary, urban_class, urban_rate)
        location_results.append(result)
        subtotal_after_urban += result["urban_adjusted_amount"]
        if result["cap_applied"]:
            cap_was_applied = True

    # Apply support (before GTGT)
    support_from_percent = int(round(subtotal_after_urban * support_percent / 100.0))
    total_support = support_amount + support_from_percent
    amount_after_support = max(0, subtotal_after_urban - total_support)

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
            "coefficient": result["coefficient"],
            "coefficient_formula": result["coefficient_formula"],
            "raw_amount": result["raw_amount"],
            "cap_applied": result["cap_applied"],
            "capped_amount": result["capped_amount"],
            "urban_rate": result["urban_rate"],
            "urban_adjusted_amount": result["urban_adjusted_amount"],
        })

    # Build DOCX context preview
    docx_context_preview_v2 = build_nd17_docx_context(
        location_results=location_results,
        base_salary=base_salary,
        urban_class=urban_class,
        urban_rate=effective_urban_rate,
        subtotal_after_urban=subtotal_after_urban,
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
        "mode": "kvc_nd17_dry_run",
        "write_performed": False,
        "contract_created": False,
        "docx_generated": False,
        "xlsx_generated": False,
        "gcn_created": False,
        "nd17_calculated": True,
        "vcpmc_tariff_calculated": False,
        "errors": errors,
        "warnings": warnings,
        "input_echo": {
            "location_count": len(locations),
            "base_salary": base_salary,
            "urban_class": urban_class,
            "urban_rate": effective_urban_rate,
            "gtgt_percent": gtgt_percent,
            "support_percent": support_percent,
            "support_amount": support_amount,
            "support_note": support_note,
            "include_premise_services": include_premise_services,
            "premise_services_note": premise_services_note,
            "usage_display_mode": usage_display_mode,
        },
        "calculation": {
            "location_results": location_results,
            "detail_rows": detail_rows,
            "cap_was_applied": cap_was_applied,
            "subtotal_after_urban": subtotal_after_urban,
            "support_percent": support_percent,
            "support_amount": total_support,
            "amount_after_support": amount_after_support,
            "gtgt_percent": gtgt_percent,
            "gtgt_amount": gtgt_amount,
            "total_amount": total_amount,
            "total_amount_words": money_to_vietnamese_words(total_amount),
        },
        "docx_context_preview_v2": docx_context_preview_v2,
    }


def _build_error_result(
    errors: List[Dict[str, Any]],
    warnings: List[Dict[str, Any]],
    locations: List[Dict[str, Any]],
    gtgt_percent: float,
) -> Dict[str, Any]:
    """Build error response when validation fails."""
    return {
        "ok": False,
        "mode": "kvc_nd17_dry_run",
        "write_performed": False,
        "contract_created": False,
        "docx_generated": False,
        "xlsx_generated": False,
        "gcn_created": False,
        "nd17_calculated": False,
        "vcpmc_tariff_calculated": False,
        "errors": errors,
        "warnings": warnings,
        "input_echo": {
            "location_count": len(locations),
            "gtgt_percent": gtgt_percent,
        },
        "calculation": None,
        "docx_context_preview_v2": None,
    }


# =============================================================================
# DOCX CONTEXT BUILDER
# =============================================================================

def build_nd17_docx_context(
    *,
    location_results: List[Dict[str, Any]],
    base_salary: float,
    urban_class: Optional[str],
    urban_rate: float,
    subtotal_after_urban: int,
    support_percent: float,
    support_amount: int,
    amount_after_support: int,
    gtgt_percent: float,
    gtgt_amount: int,
    total_amount: int,
    locations: List[Dict[str, Any]],
    display_mode: Literal["auto", "text", "table"] = "auto",
) -> Dict[str, Any]:
    """
    Build ND17 DOCX context preview.

    Returns structured context for DOCX renderer:
    - pricing_mode: "ND17"
    - legal_basis: "Nghị định 17/2023/NĐ-CP, Phụ lục II, Mục 8"
    - usage locations block
    - coefficient rows per location
    - urban adjustment row
    - cap row if applied
    - support row
    - GTGT row
    - total row
    """
    # Build usage locations block
    usage_locations_block = build_usage_locations_context(
        locations=locations,
        display_mode=display_mode,
    )

    # Build coefficient rows per location
    coefficient_rows: List[List[str]] = []
    for result in location_results:
        coefficient_rows.append([
            result["location_name"],
            f"{result['area_m2']} m²",
            f"{result['coefficient']:.4f}",
            format_money_vn(result["raw_amount"]) + " đồng",
            "Có" if result["cap_applied"] else "Không",
            format_money_vn(result["urban_adjusted_amount"]) + " đồng",
        ])

    # Build summary rows
    summary_rows: List[List[str]] = []

    # Subtotal after urban
    summary_rows.append([
        f"Tổng theo hệ số đô thị ({urban_class or 'HN/HCM'} - {int(urban_rate * 100)}%)",
        format_money_vn(subtotal_after_urban) + " đồng",
    ])

    # Support row
    if support_amount > 0:
        summary_rows.append([
            f"Hỗ trợ ({support_percent}% và/hoặc cố định)",
            f"-{format_money_vn(support_amount)} đồng",
        ])

    # Amount after support (before GTGT)
    summary_rows.append([
        "Tổng thành tiền chưa thuế GTGT",
        format_money_vn(amount_after_support) + " đồng",
    ])

    # GTGT row
    summary_rows.append([
        f"Thuế GTGT {gtgt_percent}%",
        format_money_vn(gtgt_amount) + " đồng",
    ])

    # Total row
    summary_rows.append([
        "Tổng giá trị thanh toán",
        format_money_vn(total_amount) + " đồng",
    ])

    # Amount in words
    summary_rows.append([
        "Bằng chữ",
        money_to_vietnamese_words(total_amount).capitalize() + ".",
    ])

    # Column headers for coefficient table
    coefficient_headers = [
        "Địa điểm",
        "Diện tích",
        "Hệ số",
        "Số tiền theo hệ số",
        "Cap áp dụng",
        "Sau hệ số đô thị",
    ]

    # Build pricing total text
    pricing_total_lines = [
        f"Căn cứ: {LEGAL_BASIS_TEXT}",
        f"Mức lương cơ sở: {format_money_vn(base_salary)} đồng",
        f"Hệ số đô thị: {urban_class or 'HN/HCM'} ({int(urban_rate * 100)}%)",
        "",
        f"Tổng theo hệ số: {format_money_vn(subtotal_after_urban)} đồng",
    ]

    if support_amount > 0:
        pricing_total_lines.append(
            f"Hỗ trợ: -{format_money_vn(support_amount)} đồng"
        )

    pricing_total_lines.extend([
        f"Tổng chưa GTGT: {format_money_vn(amount_after_support)} đồng",
        f"Thuế GTGT {gtgt_percent}%: +{format_money_vn(gtgt_amount)} đồng",
        f"Tổng cộng: {format_money_vn(total_amount)} đồng",
        f"(Bằng chữ: {money_to_vietnamese_words(total_amount).capitalize()}.)",
    ])
    pricing_total_text = "\n".join(pricing_total_lines)

    return {
        "pricing_mode": "ND17",
        "legal_basis": LEGAL_BASIS_TEXT,
        "usage_display_mode": display_mode,
        "background_usage_locations_block": usage_locations_block,
        "nd17_coefficient_block": {
            "mode": "table",
            "headers": coefficient_headers,
            "rows": coefficient_rows,
        },
        "background_pricing_block": {
            "pricing_mode": "ND17",
            "rows": coefficient_rows,
            "summary_rows": summary_rows,
        },
        "pricing_total_text": pricing_total_text,
        "amount_in_words": money_to_vietnamese_words(total_amount).capitalize() + ".",
    }
