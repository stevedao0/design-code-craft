"""
KVC DOCX context builders.

This module builds DOCX context data for KVC contracts.
The context is returned by the calculation module and used by the renderer.
Renderer must NOT recalculate money.

Context keys:
- pricing_mode: "VCPMC_TARIFF"
- usage_display_mode: "auto" | "text" | "table"
- background_usage_locations_block: structured usage block
- kvc_vcpmc_pricing_block: structured pricing table
- background_pricing_block: structured pricing summary
- pricing_total_text: formatted total text
- amount_in_words: Vietnamese words for total amount

PHASE KVC-03: No DOCX generation, no DB write, no ND17.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from ..common.money import format_money_vn, money_to_vietnamese_words


# Type alias for display mode
UsageDisplayMode = Literal["auto", "text", "table"]


# Pricing block column headers for KVC VCPMC tariff contract table
KVC_VCPMC_PRICING_HEADERS = [
    "Địa điểm",
    "Diện tích",
    "Đơn vị tính",
    "Mức tiền bản quyền chưa thuế GTGT",
    "Thành tiền",
]

# Location table column headers
KVC_LOCATION_TABLE_HEADERS = [
    "Địa điểm",
    "Địa chỉ kinh doanh",
    "Diện tích sử dụng âm nhạc",
    "Hình thức sử dụng âm nhạc",
]


def get_effective_display_mode(
    display_mode: UsageDisplayMode,
    location_count: int,
) -> Literal["text", "table"]:
    """
    Determine effective display mode.

    Rules:
    - auto + 1 location => text
    - auto + 2+ locations => table
    - text => text
    - table => table
    """
    if display_mode == "auto":
        return "table" if location_count >= 2 else "text"
    return display_mode


def build_usage_locations_text(
    locations: List[Dict[str, Any]],
) -> str:
    """
    Build single-paragraph text for usage locations.

    For 1 location: single paragraph
    For multiple: numbered list

    Args:
        locations: List of location dicts with name, address, area, etc.

    Returns:
        Formatted text string
    """
    if not locations:
        return "(Chưa có địa điểm sử dụng âm nhạc)"

    lines: List[str] = []
    for i, loc in enumerate(locations, 1):
        name = loc.get("location_name") or loc.get("name") or loc.get("location_id", f"Địa điểm {i}")
        area = loc.get("area_m2", 0)
        lines.append(f"{i}. {name} — {area} m²")

    if len(locations) == 1:
        return lines[0]
    return "\n".join(lines)


def build_usage_locations_table(
    locations: List[Dict[str, Any]],
) -> List[List[str]]:
    """
    Build table rows for usage locations.

    Args:
        locations: List of location dicts

    Returns:
        List of row lists [Địa điểm, Địa chỉ, Diện tích, Hình thức]
    """
    rows: List[List[str]] = []
    for loc in locations:
        name = loc.get("location_name") or loc.get("name") or loc.get("location_id", "")
        address = loc.get("business_address") or loc.get("address", "")
        area = loc.get("area_m2", 0)
        usage_type = loc.get("music_usage_type") or loc.get("usage_type", "")
        usage_type_label = _get_usage_type_label(usage_type)

        rows.append([
            name,
            address,
            f"{area} m²",
            usage_type_label,
        ])
    return rows


def build_usage_locations_context(
    locations: List[Dict[str, Any]],
    display_mode: UsageDisplayMode = "auto",
) -> Dict[str, Any]:
    """
    Build complete usage locations context block.

    Args:
        locations: List of location dicts with:
            - location_id / id
            - location_name / name
            - area_m2 / area
            - business_address / address (optional)
            - music_usage_type / usage_type (optional)
        display_mode: "auto" | "text" | "table"

    Returns:
        Dict with:
            - mode: "text" | "table"
            - text: formatted text (for text mode)
            - rows: table rows (for table mode)
            - headers: table headers (for table mode)
    """
    effective_mode = get_effective_display_mode(display_mode, len(locations))

    if effective_mode == "text":
        return {
            "mode": "text",
            "text": build_usage_locations_text(locations),
            "rows": [],
            "headers": [],
        }
    else:
        return {
            "mode": "table",
            "text": "",
            "rows": build_usage_locations_table(locations),
            "headers": KVC_LOCATION_TABLE_HEADERS,
        }


def _get_usage_type_label(usage_type: str) -> str:
    """Get display label for music usage type."""
    labels = {
        "NHAC_NEN": "Nhạc nền",
        "LIVE_ACOUSTIC": "Live / Acoustic",
        "DJ": "DJ",
        "KARAOKE": "Karaoke",
        "MIXED": "Hỗn hợp",
    }
    return labels.get(usage_type, usage_type or "")


def _build_single_location_pricing_rows(
    location_result: Dict[str, Any],
) -> List[List[str]]:
    """
    Build pricing rows for a single location.

    Returns rows for the contract table:
    Row 1: Địa điểm | Diện tích | "Từ 1 - 50 m²" | "1.000.000 đồng" | [base_fee]
    Row 2: (if increment_blocks > 0) "" | "" | "Cứ 50 m² gia tăng" | "400.000 đồng / 50 m²" | [increment_amount]

    Args:
        location_result: Location calculation result

    Returns:
        List of row lists
    """
    rows: List[List[str]] = []

    location_name = location_result.get("location_name", "")
    area_m2 = location_result.get("area_m2", 0)
    base_fee = location_result.get("base_fee", 0)
    increment_blocks = location_result.get("increment_blocks", 0)
    increment_fee_per_block = location_result.get("increment_fee_per_block", 0)
    increment_amount = location_result.get("increment_amount", 0)
    location_subtotal = location_result.get("location_subtotal", 0)

    # Row 1: Base fee
    rows.append([
        location_name,
        f"{area_m2} m²",
        "Từ 1 - 50 m²",
        "1.000.000 đồng",
        format_money_vn(base_fee) + " đồng",
    ])

    # Row 2: Increment fee (if any)
    if increment_blocks > 0:
        rows.append([
            "",
            "",
            f"Cứ 50 m² gia tăng",
            f"{format_money_vn(increment_fee_per_block)} đồng / 50 m²",
            format_money_vn(increment_amount) + " đồng",
        ])

    return rows


def build_kvc_vcpmc_pricing_context(
    location_results: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Build KVC VCPMC pricing block for contract table.

    Args:
        location_results: List of location calculation results from vcpmc_tariff module

    Returns:
        Dict with:
            - mode: "table"
            - headers: column headers
            - rows: table rows (one location = 1-2 rows)
    """
    rows: List[List[str]] = []
    for loc_result in location_results:
        rows.extend(_build_single_location_pricing_rows(loc_result))

    return {
        "mode": "table",
        "headers": KVC_VCPMC_PRICING_HEADERS,
        "rows": rows,
    }


def build_kvc_vcpmc_docx_context_preview(
    calculation_result: Dict[str, Any],
    locations: Optional[List[Dict[str, Any]]] = None,
    display_mode: UsageDisplayMode = "auto",
) -> Dict[str, Any]:
    """
    Build complete KVC VCPMC DOCX context preview.

    This is the main entry point for generating DOCX context for the API response.

    Args:
        calculation_result: The full calculation result from calculate_kvc_vcpmc_tariff
        locations: Optional list of raw location inputs for usage block
        display_mode: Usage locations display mode

    Returns:
        Complete DOCX context preview with all required keys:
        {
            "pricing_mode": "VCPMC_TARIFF",
            "usage_display_mode": "auto|text|table",
            "background_usage_locations_block": { mode, text, rows, headers },
            "kvc_vcpmc_pricing_block": { mode, headers, rows },
            "background_pricing_block": { pricing_mode, rows, summary_rows },
            "pricing_total_text": "...",
            "amount_in_words": "..."
        }
    """
    # Extract data from calculation result
    location_results = calculation_result.get("location_results", [])
    subtotal_before_support = calculation_result.get("subtotal_before_support", 0)
    support_percent = calculation_result.get("support_percent", 0)
    support_amount = calculation_result.get("support_amount", 0)
    amount_after_support = calculation_result.get("amount_after_support", 0)
    gtgt_percent = calculation_result.get("gtgt_percent", 8.0)
    gtgt_amount = calculation_result.get("gtgt_amount", 0)
    total_amount = calculation_result.get("total_amount", 0)

    # Build usage locations block
    usage_locations_block = build_usage_locations_context(
        locations=locations or [],
        display_mode=display_mode,
    )

    # Build KVC VCPMC pricing block (for location-level detail)
    kvc_vcpmc_pricing_block = build_kvc_vcpmc_pricing_context(location_results)

    # Build background pricing block (summary rows)
    pricing_rows: List[List[str]] = []
    for loc_result in location_results:
        location_name = loc_result.get("location_name", "")
        area_m2 = loc_result.get("area_m2", 0)
        location_subtotal = loc_result.get("location_subtotal", 0)
        pricing_rows.append([
            location_name,
            f"{area_m2} m²",
            "Theo biểu giá VCPMC",
            format_money_vn(location_subtotal) + " đồng",
        ])

    # Summary rows
    summary_rows: List[List[str]] = []
    summary_rows.append([
        "Tổng thành tiền trước hỗ trợ",
        format_money_vn(subtotal_before_support) + " đồng",
    ])

    if support_amount > 0:
        summary_rows.append([
            f"Hỗ trợ ({support_percent}% và/hoặc cố định)",
            f"-{format_money_vn(support_amount)} đồng",
        ])

    summary_rows.append([
        "Tổng thành tiền chưa thuế GTGT",
        format_money_vn(amount_after_support) + " đồng",
    ])
    summary_rows.append([
        f"Thuế GTGT {gtgt_percent}%",
        format_money_vn(gtgt_amount) + " đồng",
    ])
    summary_rows.append([
        "Tổng giá trị thanh toán",
        format_money_vn(total_amount) + " đồng",
    ])
    summary_rows.append([
        "Bằng chữ",
        money_to_vietnamese_words(total_amount).capitalize() + ".",
    ])

    # Build pricing total text (legacy text format)
    pricing_total_lines = [
        f"Tổng thành tiền trước hỗ trợ: {format_money_vn(subtotal_before_support)} đồng",
    ]
    if support_amount > 0:
        pricing_total_lines.append(
            f"Hỗ trợ: -{format_money_vn(support_amount)} đồng"
        )
    pricing_total_lines.extend([
        f"Sau hỗ trợ: {format_money_vn(amount_after_support)} đồng",
        f"Thuế GTGT {gtgt_percent}%: +{format_money_vn(gtgt_amount)} đồng",
        f"Tổng cộng: {format_money_vn(total_amount)} đồng",
        f"(Bằng chữ: {money_to_vietnamese_words(total_amount).capitalize()}.)",
    ])
    pricing_total_text = "\n".join(pricing_total_lines)

    return {
        "pricing_mode": "VCPMC_TARIFF",
        "usage_display_mode": display_mode,
        "background_usage_locations_block": usage_locations_block,
        "kvc_vcpmc_pricing_block": kvc_vcpmc_pricing_block,
        "background_pricing_block": {
            "pricing_mode": "VCPMC_TARIFF",
            "rows": pricing_rows,
            "summary_rows": summary_rows,
        },
        "pricing_total_text": pricing_total_text,
        "amount_in_words": money_to_vietnamese_words(total_amount).capitalize() + ".",
    }


def build_kvc_vcpmc_docx_context(
    *,
    location_results: List[Dict[str, Any]],
    subtotal_before_support: int,
    support_percent: float,
    support_amount: int,
    amount_after_support: int,
    gtgt_percent: float,
    gtgt_amount: int,
    total_amount: int,
    locations: Optional[List[Dict[str, Any]]] = None,
    display_mode: UsageDisplayMode = "auto",
) -> Dict[str, Any]:
    """
    Build complete KVC VCPMC DOCX context from calculation parameters.

    This function takes the raw calculation results and builds the full
    DOCX context structure.

    Args:
        location_results: List of location calculation results
        subtotal_before_support: Sum of location subtotals
        support_percent: Support percentage
        support_amount: Total support amount
        amount_after_support: Amount after support
        gtgt_percent: GTGT percentage
        gtgt_amount: GTGT amount
        total_amount: Total amount after GTGT
        locations: Optional raw location inputs
        display_mode: Usage locations display mode

    Returns:
        Complete DOCX context structure
    """
    # Build calculation result dict for the preview builder
    calculation_result = {
        "location_results": location_results,
        "subtotal_before_support": subtotal_before_support,
        "support_percent": support_percent,
        "support_amount": support_amount,
        "amount_after_support": amount_after_support,
        "gtgt_percent": gtgt_percent,
        "gtgt_amount": gtgt_amount,
        "total_amount": total_amount,
    }

    return build_kvc_vcpmc_docx_context_preview(
        calculation_result=calculation_result,
        locations=locations,
        display_mode=display_mode,
    )
