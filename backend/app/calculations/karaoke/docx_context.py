"""
Karaoke DOCX context builders.

This module builds DOCX context data for Karaoke contracts.
The context is returned by the calculation module and used by the renderer.
Renderer must NOT recalculate money.

Context keys:
- room_display_text: Tab-separated room display lines
- pricing_detail_text: Tab-separated pricing detail lines
- pricing_total_text: Tab-separated pricing total lines
- karaoke_pricing_render_mode: text or table
- tier_table_rows: Structured tier data for table rendering
"""

from typing import Any, Dict, List

from .calculator import (
    build_karaoke_calculation_context,
    build_room_display_text,
    build_pricing_detail_text,
    build_pricing_total_text,
    normalize_room_sections,
)
from ..common.money import format_money_vn, format_coeff_vn


def build_karaoke_docx_context(
    *,
    karaoke_type: str,
    area_group: str,
    tong_so_phong: int | None,
    tong_so_box: int | None,
    muc_luong_co_so: int | None,
    ty_le_ho_tro: float,
    ty_le_ho_tro_bac_1: float,
    ty_le_ho_tro_bac_2: float,
    ty_le_ho_tro_bac_3: float,
    gtgt_percent: float,
    start_date: str | None,
    end_date: str | None,
    room_sections: List[Dict[str, Any]] | None,
    pricing_render_mode: str = "text",
    include_6_month_option: bool = False,
) -> Dict[str, Any]:
    """
    Build complete Karaoke DOCX context.

    This function wraps the calculation context with additional
    DOCX-specific formatting for rendering.

    Args:
        Same as build_karaoke_calculation_context
        include_6_month_option: If True, show both 6-month and 12-month total lines

    Returns:
        Dict with:
        - room_display_text
        - pricing_detail_text
        - pricing_total_text
        - karaoke_pricing_render_mode
        - tier_table_rows
        - amount_text_lines
        - include_6_month_option
    """
    # Get calculation context
    context = build_karaoke_calculation_context(
        karaoke_type=karaoke_type,
        area_group=area_group,
        tong_so_phong=tong_so_phong,
        tong_so_box=tong_so_box,
        muc_luong_co_so=muc_luong_co_so,
        ty_le_ho_tro=ty_le_ho_tro,
        ty_le_ho_tro_bac_1=ty_le_ho_tro_bac_1,
        ty_le_ho_tro_bac_2=ty_le_ho_tro_bac_2,
        ty_le_ho_tro_bac_3=ty_le_ho_tro_bac_3,
        gtgt_percent=gtgt_percent,
        start_date=start_date,
        end_date=end_date,
        room_sections=room_sections,
        pricing_render_mode=pricing_render_mode,
    )

    # Build room display text
    sections = normalize_room_sections(room_sections or [])
    room_display_text = build_room_display_text(sections) if sections else ""

    # Build pricing texts
    pricing_detail_text = build_pricing_detail_text(context, base_salary=muc_luong_co_so or 2_530_000)
    pricing_total_text = build_pricing_total_text(
        context,
        support_percent=ty_le_ho_tro,
        vat_percent=gtgt_percent,
        effective_term_months=context.get("effective_term_months"),
        include_6_month_option=include_6_month_option,
    )

    # Build tier table rows for table mode
    tier_table_rows = _build_tier_table_rows(context)

    # Build amount text lines
    amount_text_lines = _build_amount_text_lines(context, gtgt_percent)

    return {
        "room_display_text": room_display_text,
        "pricing_detail_text": pricing_detail_text,
        "pricing_total_text": pricing_total_text,
        "karaoke_pricing_render_mode": pricing_render_mode,
        "tier_table_rows": tier_table_rows,
        "amount_text_lines": amount_text_lines,
        "include_6_month_option": include_6_month_option,
    }


def _build_tier_table_rows(context: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Build structured tier data for table rendering.

    Returns list of dicts with:
    - tier_name
    - room_count
    - coefficient
    - formula
    - net_amount_formatted
    """
    rows = []
    for tier in context.get("tiers", []):
        if tier.get("rooms", 0) > 0:
            rows.append({
                "tier_name": tier.get("name", ""),
                "room_count": tier.get("rooms", 0),
                "coefficient": tier.get("coefficient", 0),
                "coefficient_formatted": format_coeff_vn(tier.get("coefficient", 0)),
                "formula": f"{tier.get('rooms', 0)} phòng x {format_coeff_vn(tier.get('coefficient', 0))}",
                "net_amount_formatted": format_money_vn(tier.get("net_amount", 0)),
                "net_amount": tier.get("net_amount", 0),
            })
    return rows


def _build_amount_text_lines(
    context: Dict[str, Any],
    gtgt_percent: float,
) -> List[str]:
    """
    Build amount text lines for total display.

    Returns list of formatted amount strings.
    """
    lines = []

    # Add tier amounts
    for row in context.get("tiers", []):
        if row.get("rooms", 0) > 0:
            lines.append(
                f"{row.get('name', '')}: {format_money_vn(row.get('amount', 0))} đồng"
            )

    # Add subtotals
    lines.append(f"Cộng: {format_money_vn(context.get('amount_before_gtgt', 0))} đồng")
    lines.append(f"GTGT {format_coeff_vn(gtgt_percent)}%: {format_money_vn(context.get('gtgt_amount', 0))} đồng")
    lines.append(f"Tổng: {format_money_vn(context.get('total_amount', 0))} đồng")

    return lines
