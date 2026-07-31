"""
Karaoke calculation logic.

This module contains the core Karaoke/Phòng thu âm calculation logic.
Ported from OLD APP background_calculation.py.

Rules:
- Calculation module is source of truth for money
- Renderer must NOT recalculate
- Returns structured data including DOCX context
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from ..common.money import (
    DEFAULT_BASE_SALARY_VND,
    format_money_vn,
    format_coeff_vn,
    money_to_vietnamese_words,
    parse_int,
    parse_float,
)
from ..common.gtgt import compute_gtgt_amount
from ..common.terms import detect_effective_term_months


# Karaoke area group coefficients (port from old app)
KARAOKE_AREA_GROUP_COEFFICIENTS: Dict[str, tuple[float, float, float]] = {
    "DEN_20": (1.5, 1.2, 1.05),
    "TREN_20_DEN_30": (1.6, 1.28, 1.12),
    "TREN_30": (1.7, 1.36, 1.19),
    "BOX": (0.85, 0.0, 0.0),
}

# Room tier labels
ROOM_TIER_LABELS = {
    "bac_1": "Từ 1 đến 4 phòng",
    "bac_2": "Từ phòng thứ 5 đến 10",
    "bac_3": "Từ phòng thứ 11 trở đi",
}


def normalize_karaoke_type(value: Optional[str]) -> str:
    """Normalize karaoke type to PHONG or BOX."""
    v = str(value or "").strip().upper()
    if v in {"BOX", "KARAOKE_BOX", "KARAOKE BOX"}:
        return "BOX"
    return "PHONG"


def normalize_area_group(value: Optional[str], *, karaoke_type: str) -> str:
    """Normalize area group based on karaoke type."""
    raw = str(value or "").strip().upper()
    if karaoke_type == "BOX":
        return "BOX"
    # Accept both legacy keys (TREN_*) and modern keys (FROM_/GT_*).
    if raw in {"DEN_20", "TREN_20_DEN_30", "TREN_30"}:
        return raw
    if raw == "FROM_20_TO_30":
        return "TREN_20_DEN_30"
    if raw == "GT_30":
        return "TREN_30"
    return "DEN_20"


def split_room_tiers(total_rooms: int) -> tuple[int, int, int]:
    """
    Split rooms into tiers (port from old app).

    Tier 1: rooms 1-4
    Tier 2: rooms 5-10
    Tier 3: rooms 11+
    """
    total = max(0, int(total_rooms or 0))
    bac_1 = min(total, 4)
    bac_2 = min(max(total - 4, 0), 6)
    bac_3 = max(total - 10, 0)
    return bac_1, bac_2, bac_3


def compute_karaoke_amounts(
    *,
    karaoke_type: str,
    area_group: str,
    total_rooms: int,
    total_box: int,
    muc_luong_co_so: int,
    ty_le_ho_tro: float,
    gtgt_percent: float,
    ty_le_ho_tro_bac_1: float = 0.0,
    ty_le_ho_tro_bac_2: float = 0.0,
    ty_le_ho_tro_bac_3: float = 0.0,
    effective_term_months: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Compute karaoke amounts.

    Audit-correct semantics (Nghị định 134/2026/NĐ-CP):

        raw_subtotal        = sum(tier amounts before any support)
        amount_after_support= raw_subtotal * support_percent / 100
        vat_amount          = amount_after_support * vat_percent / 100
        total_amount        = amount_after_support + vat_amount

    The support_percent is interpreted as the tax collection rate:
        100 = collect full royalty, 80 = collect 80%, 50 = collect 50%, ...
        0   = collect 0%.

    Room mode: splits rooms into tiers 1-4, 5-10, 11+.
    Box mode: uses total boxes only with the BOX coefficient.

    6-month / 12-month:
        effective_* values are halved for 6-month contracts.
    """
    kind = normalize_karaoke_type(karaoke_type)
    group = normalize_area_group(area_group, karaoke_type=kind)
    base = max(0, int(muc_luong_co_so or 0))
    support = max(0.0, min(100.0, float(ty_le_ho_tro or 0.0)))
    vat = max(0.0, float(gtgt_percent or 0.0))
    # Per-tier support inputs are accepted for API compatibility with the
    # legacy callers but are NOT applied as discounts in the audit-correct
    # model. They are exposed in the return dict for downstream consumers
    # that still display them in the UI ("(hỗ trợ X%)" annotation).
    row_support_1 = max(0.0, min(100.0, float(ty_le_ho_tro_bac_1 or 0.0)))
    row_support_2 = max(0.0, min(100.0, float(ty_le_ho_tro_bac_2 or 0.0)))
    row_support_3 = max(0.0, min(100.0, float(ty_le_ho_tro_bac_3 or 0.0)))

    bac_1 = 0
    bac_2 = 0
    bac_3 = 0
    he_so_1 = 0.0
    he_so_2 = 0.0
    he_so_3 = 0.0
    tien_bac_1 = 0
    tien_bac_2 = 0
    tien_bac_3 = 0
    total_rooms_final = max(0, int(total_rooms or 0))
    total_box_final = max(0, int(total_box or 0))
    detail_rows: List[Dict[str, Any]] = []

    if kind == "BOX":
        he_so_1 = KARAOKE_AREA_GROUP_COEFFICIENTS["BOX"][0]
        tien_bac_1 = int(round(total_box_final * base * he_so_1))
        if total_box_final > 0:
            detail_rows.append({
                "label": "Karaoke box",
                "room_count": total_box_final,
                "formula": f"{total_box_final} box x {format_money_vn(base)} đồng x {format_coeff_vn(he_so_1)}",
                "support_rate": row_support_1,
                "support_amount": 0,
                "net_amount": tien_bac_1,
            })
    else:
        he_so_1, he_so_2, he_so_3 = KARAOKE_AREA_GROUP_COEFFICIENTS.get(
            group, KARAOKE_AREA_GROUP_COEFFICIENTS["DEN_20"]
        )
        bac_1, bac_2, bac_3 = split_room_tiers(total_rooms_final)
        tien_bac_1 = int(round(bac_1 * base * he_so_1))
        tien_bac_2 = int(round(bac_2 * base * he_so_2))
        tien_bac_3 = int(round(bac_3 * base * he_so_3))

        if bac_1 > 0:
            detail_rows.append({
                "label": ROOM_TIER_LABELS["bac_1"],
                "room_count": bac_1,
                "formula": f"{bac_1} phòng x {format_money_vn(base)} đồng x {format_coeff_vn(he_so_1)}",
                "support_rate": row_support_1,
                "support_amount": 0,
                "net_amount": tien_bac_1,
            })
        if bac_2 > 0:
            detail_rows.append({
                "label": ROOM_TIER_LABELS["bac_2"],
                "room_count": bac_2,
                "formula": f"{bac_2} phòng x {format_money_vn(base)} đồng x {format_coeff_vn(he_so_2)}",
                "support_rate": row_support_2,
                "support_amount": 0,
                "net_amount": tien_bac_2,
            })
        if bac_3 > 0:
            detail_rows.append({
                "label": ROOM_TIER_LABELS["bac_3"],
                "room_count": bac_3,
                "formula": f"{bac_3} phòng x {format_money_vn(base)} đồng x {format_coeff_vn(he_so_3)}",
                "support_rate": row_support_3,
                "support_amount": 0,
                "net_amount": tien_bac_3,
            })

    raw_subtotal = tien_bac_1 + tien_bac_2 + tien_bac_3
    # Audit-correct: support% is the tax collection rate, NOT a discount.
    so_tien_sau_ho_tro = int(round(raw_subtotal * support / 100.0))
    thue_gtgt = int(round(so_tien_sau_ho_tro * vat / 100.0)) if vat > 0 else 0
    tong_gia_tri_hop_dong = so_tien_sau_ho_tro + thue_gtgt
    # In audit-correct semantics so_tien_ho_tro is the relief (the amount NOT
    # collected). It equals raw_subtotal - so_tien_sau_ho_tro. This keeps the
    # same field name for downstream consumers, but the meaning is now
    # "discount/relief amount" instead of "amount paid before discount".
    so_tien_ho_tro = max(0, raw_subtotal - so_tien_sau_ho_tro)
    tong_gia_tri_hop_dong_6_thang = int(round(tong_gia_tri_hop_dong / 2.0))
    effective_term = 6 if int(effective_term_months or 12) == 6 else 12
    effective_so_tien_sau_ho_tro = (
        int(round(so_tien_sau_ho_tro / 2.0)) if effective_term == 6 else so_tien_sau_ho_tro
    )
    effective_total = tong_gia_tri_hop_dong_6_thang if effective_term == 6 else tong_gia_tri_hop_dong
    effective_thue_gtgt = max(0, effective_total - effective_so_tien_sau_ho_tro)

    has_row_support = any(float(r.get("support_rate") or 0.0) > 0 for r in detail_rows)
    has_year_support = support > 0 and support < 100
    has_any_support = has_row_support or has_year_support

    return {
        "karaoke_type": kind,
        "area_group": group,
        "total_rooms": total_rooms_final,
        "total_box": total_box_final,
        "bac_1": bac_1,
        "bac_2": bac_2,
        "bac_3": bac_3,
        "he_so_1": he_so_1,
        "he_so_2": he_so_2,
        "he_so_3": he_so_3,
        "tien_bac_1": tien_bac_1,
        "tien_bac_2": tien_bac_2,
        "tien_bac_3": tien_bac_3,
        "ty_le_ho_tro_bac_1": row_support_1,
        "ty_le_ho_tro_bac_2": row_support_2,
        "ty_le_ho_tro_bac_3": row_support_3,
        "row_support_amount_1": 0,
        "row_support_amount_2": 0,
        "row_support_amount_3": 0,
        "tong_ho_tro_theo_bac": 0,
        "tong_sau_ho_tro_theo_bac": raw_subtotal,
        "tong_truoc_ho_tro": raw_subtotal,
        "so_tien_ho_tro": so_tien_ho_tro,
        "so_tien_sau_ho_tro": so_tien_sau_ho_tro,
        "thue_gtgt": thue_gtgt,
        "tong_gia_tri_hop_dong": tong_gia_tri_hop_dong,
        "tong_gia_tri_hop_dong_6_thang": tong_gia_tri_hop_dong_6_thang,
        "effective_term_months": effective_term,
        "effective_so_tien_sau_ho_tro": effective_so_tien_sau_ho_tro,
        "effective_thue_gtgt": effective_thue_gtgt,
        "effective_term_total": effective_total,
        "has_row_support": has_row_support,
        "has_year_support": has_year_support,
        "has_any_support": has_any_support,
        "detail_rows": detail_rows,
        "so_tien_bang_chu": money_to_vietnamese_words(effective_total),
    }


def normalize_room_sections(raw_sections: Any) -> List[Dict[str, Any]]:
    """Normalize room sections for room display text."""
    if not isinstance(raw_sections, list):
        return []

    sections: List[Dict[str, Any]] = []
    for it in raw_sections:
        if not isinstance(it, dict):
            continue
        room_count = max(0, parse_int(it.get("room_count"), 0))
        room_names_text = str(it.get("room_names_text") or it.get("room_names") or "").strip()
        room_names = _normalize_room_names(room_names_text)

        key = str(it.get("key") or it.get("label") or f"section_{len(sections) + 1}").strip()
        label = str(it.get("label") or key).strip()

        sections.append({
            "key": key,
            "label": label,
            "room_count": room_count,
            "room_names": room_names,
            "room_names_text": room_names_text or ", ".join(room_names),
        })
    return sections


def _normalize_room_names(value: Any) -> List[str]:
    """Normalize room names from various input formats."""
    if value is None:
        return []
    if isinstance(value, list):
        raw = ", ".join([str(it or "").strip() for it in value if str(it or "").strip()])
    else:
        raw = str(value or "").strip()
    if not raw:
        return []
    parts = [re.sub(r"\s+", " ", x).strip() for x in re.split(r"[,\n;]+", raw)]
    return [x for x in parts if x]


def build_room_display_text(sections: List[Dict[str, Any]]) -> str:
    """Build room display text from sections (port from old app)."""
    lines: List[str] = []
    for section in sections:
        room_count = max(0, parse_int(section.get("room_count"), 0))
        if room_count <= 0:
            continue
        label = str(section.get("label") or "").strip() or "Khu vực"
        # Fix "Lau" -> "Lầu" (Vietnamese diacritics)
        label = re.sub(r"\bLau\b", "Lầu", label)
        lines.append(f"{label}\t{room_count:02d} phòng")
        room_names = _normalize_room_names(section.get("room_names") or section.get("room_names_text"))
        if room_names:
            lines.append(f"Tên phòng\t{', '.join(room_names)}")
    return "\n".join(lines)


def build_pricing_detail_text(calc: Dict[str, Any], *, base_salary: int) -> str:
    """Build pricing detail text from calculation result (port from old app)."""
    detail_rows = calc.get("detail_rows", [])
    has_row_support = bool(calc.get("has_row_support"))

    lines: List[str] = []
    for row in detail_rows:
        room_count = max(0, parse_int(row.get("room_count"), 0))
        if room_count <= 0:
            continue
        support_rate = max(0.0, parse_float(row.get("support_rate"), 0.0))
        support_suffix = f" (hỗ trợ {format_coeff_vn(support_rate)}%)" if has_row_support and support_rate > 0 else ""
        left = f"{str(row.get('label') or '').strip()}: {str(row.get('formula') or '').strip()}{support_suffix}"
        amount = format_money_vn(parse_int(row.get("net_amount"), 0))
        lines.append(f"{left}\t{amount} đồng")
    return "\n".join(lines)


from .support import urban_support_label


# Internal alias used by build_pricing_total_text below. Kept as a private
# symbol for backward compatibility within this module's call sites.
_support_label = urban_support_label


def build_pricing_total_text(
    calc: Dict[str, Any],
    *,
    support_percent: float,
    vat_percent: float,
    effective_term_months: Optional[int] = None,
    include_6_month_option: bool = False,
) -> str:
    """Build pricing total text from calculation result (port from old app).
    
    Args:
        calc: Calculation result dictionary
        support_percent: Support percentage
        vat_percent: VAT percentage
        effective_term_months: Override term months (6 or 12)
        include_6_month_option: If True, show BOTH 6-month and 12-month lines.
                               If False, show ONLY 12-month line.
    """
    # Keys from build_karaoke_calculation_context output
    so_tien_ho_tro = calc.get("annual_support_amount", calc.get("so_tien_ho_tro", 0))
    so_tien_sau_ho_tro = calc.get("amount_before_gtgt", calc.get("so_tien_sau_ho_tro", 0))
    thue_gtgt = calc.get("gtgt_amount", calc.get("thue_gtgt", 0))
    tong_gia_tri_hop_dong = calc.get("total_amount", calc.get("tong_gia_tri_hop_dong", 0))
    tong_gia_tri_hop_dong_6_thang = calc.get("total_amount_6_months", calc.get("tong_gia_tri_hop_dong_6_thang", 0))

    # If 6-month amount not available, calculate it
    if not tong_gia_tri_hop_dong_6_thang:
        tong_gia_tri_hop_dong_6_thang = tong_gia_tri_hop_dong // 2

    tien_ho_tro_fmt = format_money_vn(parse_int(so_tien_ho_tro, 0))
    sau_ho_tro_fmt = format_money_vn(parse_int(so_tien_sau_ho_tro, 0))
    thue_fmt = format_money_vn(parse_int(thue_gtgt, 0))
    tong_12_fmt = format_money_vn(parse_int(tong_gia_tri_hop_dong, 0))
    tong_6_fmt = format_money_vn(parse_int(tong_gia_tri_hop_dong_6_thang, 0))
    has_year_support = bool(calc.get("has_year_support", calc.get("hasYearSupport", False))) and support_percent > 0
    effective_term = 6 if int(effective_term_months or calc.get("effective_term_months") or 12) == 6 else 12

    # Determine effective total for "bằng chữ"
    effective_total = tong_gia_tri_hop_dong_6_thang if effective_term == 6 else tong_gia_tri_hop_dong

    lines: List[str] = []
    if has_year_support:
        lines.append(f"{_support_label(support_percent)}\t{tien_ho_tro_fmt} đồng (-)")

    lines.extend([
        f"Cộng\t{sau_ho_tro_fmt} đồng",
        f"Tiền Thuế GTGT {format_coeff_vn(vat_percent)}%\t{thue_fmt} đồng",
    ])

    # Add total lines based on include_6_month_option
    if include_6_month_option:
        # Show BOTH 6-month and 12-month lines
        if effective_term == 6:
            lines.append(f"Tổng giá trị hợp đồng cho 6 tháng sử dụng\t{tong_6_fmt} đồng")
            lines.append(f"Tổng giá trị hợp đồng cho 12 tháng sử dụng\t{tong_12_fmt} đồng")
        else:
            lines.append(f"Tổng giá trị hợp đồng cho 12 tháng sử dụng\t{tong_12_fmt} đồng")
            lines.append(f"Tổng giá trị hợp đồng cho 6 tháng sử dụng\t{tong_6_fmt} đồng")
    else:
        # Show ONLY 12-month line (default)
        lines.append(f"Tổng giá trị hợp đồng cho 12 tháng sử dụng\t{tong_12_fmt} đồng")

    lines.append(f"(Bằng chữ: {_upper_first(money_to_vietnamese_words(effective_total))}.)")
    return "\n".join(lines)


def _upper_first(value: str) -> str:
    """Capitalize first letter."""
    text = str(value or "").strip()
    if not text:
        return ""
    return f"{text[0].upper()}{text[1:]}"


def build_karaoke_calculation_context(
    *,
    karaoke_type: str,
    area_group: str,
    tong_so_phong: Optional[int],
    tong_so_box: Optional[int],
    muc_luong_co_so: Optional[int],
    ty_le_ho_tro: float,
    ty_le_ho_tro_bac_1: float,
    ty_le_ho_tro_bac_2: float,
    ty_le_ho_tro_bac_3: float,
    gtgt_percent: float,
    start_date: Optional[str],
    end_date: Optional[str],
    room_sections: Optional[List[Dict[str, Any]]],
    pricing_render_mode: str = "text",
    effective_term_months_override: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Build complete karaoke calculation context.

    This is the main entry point for the dry-run calculation.
    """
    warnings: List[Dict[str, str]] = []
    errors: List[Dict[str, str]] = []

    # Apply default base salary if not provided or invalid
    if muc_luong_co_so is None or muc_luong_co_so <= 0:
        muc_luong_co_so = DEFAULT_BASE_SALARY_VND
        warnings.append({
            "field": "muc_luong_co_so",
            "message": f"Mức lương cơ sở mặc định: {DEFAULT_BASE_SALARY_VND:,} VND (Nghị định 161/2026/NĐ-CP, Điều 3 khoản 2, effective 01/07/2026).",
            "severity": "info",
        })

    if gtgt_percent < 0:
        warnings.append({
            "field": "gtgt_percent",
            "message": "GTGT percent âm được giới hạn về 0.",
            "severity": "warning",
        })

    # Compute effective term - use override if provided
    if effective_term_months_override in (6, 12):
        effective_term = effective_term_months_override
    else:
        effective_term = detect_effective_term_months(start_date, end_date)

    # Compute amounts
    calc = compute_karaoke_amounts(
        karaoke_type=karaoke_type,
        area_group=area_group,
        total_rooms=tong_so_phong or 0,
        total_box=tong_so_box or 0,
        muc_luong_co_so=muc_luong_co_so,
        ty_le_ho_tro=ty_le_ho_tro,
        gtgt_percent=gtgt_percent,
        ty_le_ho_tro_bac_1=ty_le_ho_tro_bac_1,
        ty_le_ho_tro_bac_2=ty_le_ho_tro_bac_2,
        ty_le_ho_tro_bac_3=ty_le_ho_tro_bac_3,
        effective_term_months=effective_term,
    )

    # Build room display text from sections if provided
    sections = normalize_room_sections(room_sections or [])
    room_display_text = build_room_display_text(sections) if sections else ""

    # Build pricing text
    pricing_detail_text = build_pricing_detail_text(calc, base_salary=muc_luong_co_so)
    pricing_total_text = build_pricing_total_text(
        calc,
        support_percent=ty_le_ho_tro,
        vat_percent=gtgt_percent,
        effective_term_months=effective_term,
    )

    # Compute net amounts for tiers
    tien_bac_1 = calc.get("tien_bac_1", 0)
    tien_bac_2 = calc.get("tien_bac_2", 0)
    tien_bac_3 = calc.get("tien_bac_3", 0)
    row_support_amount_1 = calc.get("row_support_amount_1", 0)
    row_support_amount_2 = calc.get("row_support_amount_2", 0)
    row_support_amount_3 = calc.get("row_support_amount_3", 0)
    tong_truoc_ho_tro = calc.get("tong_truoc_ho_tro", 0)

    # net_N = tien_N - row_support_amount_N
    net_1 = max(0, tien_bac_1 - row_support_amount_1)
    net_2 = max(0, tien_bac_2 - row_support_amount_2)
    net_3 = max(0, tien_bac_3 - row_support_amount_3)

    return {
        "term_months": effective_term,
        "tiers": [
            {
                "name": "Bậc 1 (1-4 phòng)",
                "rooms": calc.get("bac_1", 0),
                "coefficient": calc.get("he_so_1", 0),
                "amount": tien_bac_1,
                "support_rate": calc.get("ty_le_ho_tro_bac_1", 0),
                "support_amount": row_support_amount_1,
                "net_amount": net_1,
            },
            {
                "name": "Bậc 2 (5-10 phòng)",
                "rooms": calc.get("bac_2", 0),
                "coefficient": calc.get("he_so_2", 0),
                "amount": tien_bac_2,
                "support_rate": calc.get("ty_le_ho_tro_bac_2", 0),
                "support_amount": row_support_amount_2,
                "net_amount": net_2,
            },
            {
                "name": "Bậc 3 (11+ phòng)",
                "rooms": calc.get("bac_3", 0),
                "coefficient": calc.get("he_so_3", 0),
                "amount": tien_bac_3,
                "support_rate": calc.get("ty_le_ho_tro_bac_3", 0),
                "support_amount": row_support_amount_3,
                "net_amount": net_3,
            },
        ],
        "subtotal_before_support": tong_truoc_ho_tro,
        "support_by_tier": calc.get("tong_ho_tro_theo_bac", 0),
        "annual_support_amount": calc.get("so_tien_ho_tro", 0),
        "amount_before_gtgt": calc.get("so_tien_sau_ho_tro", 0),
        "total_amount_6_months": calc.get("tong_gia_tri_hop_dong_6_thang", 0),
        "gtgt_percent": gtgt_percent,
        "gtgt_amount": calc.get("thue_gtgt", 0),
        "total_amount": calc.get("tong_gia_tri_hop_dong", 0),
        "effective_amount_before_gtgt": calc.get("effective_so_tien_sau_ho_tro", 0),
        "effective_total_amount": calc.get("effective_term_total", 0),
        "detail_rows": calc.get("detail_rows", []),
        "errors": errors,
        "warnings": warnings,
        "docx_context_preview": {
            "room_display_text": room_display_text,
            "pricing_detail_text": pricing_detail_text,
            "pricing_total_text": pricing_total_text,
            "karaoke_pricing_render_mode": pricing_render_mode,
        },
    }


def calculate_karaoke_dry_run(
    *,
    karaoke_type: str,
    area_group: str,
    tong_so_phong: Optional[int],
    tong_so_box: Optional[int],
    muc_luong_co_so: Optional[int],
    ty_le_ho_tro: float = 0.0,
    ty_le_ho_tro_bac_1: float = 0.0,
    ty_le_ho_tro_bac_2: float = 0.0,
    ty_le_ho_tro_bac_3: float = 0.0,
    gtgt_percent: float = 8.0,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    pricing_render_mode: str = "text",
    room_sections: Optional[List[Dict[str, Any]]] = None,
    effective_term_months_override: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Main entry point for Karaoke/Phòng thu âm dry-run calculation.

    This function is called by the API endpoint and returns the complete
    calculation result including DOCX context for rendering.

    Args:
        karaoke_type: PHONG or BOX
        area_group: DEN_20, TREN_20_DEN_30, TREN_30, or BOX
        tong_so_phong: Total number of rooms
        tong_so_box: Total number of boxes
        muc_luong_co_so: Base salary (VND), defaults to 2,340,000
        ty_le_ho_tro: Annual support percentage
        ty_le_ho_tro_bac_1: Tier 1 support percentage
        ty_le_ho_tro_bac_2: Tier 2 support percentage
        ty_le_ho_tro_bac_3: Tier 3 support percentage
        gtgt_percent: GTGT percentage (default 8%)
        start_date: Contract start date (YYYY-MM-DD)
        end_date: Contract end date (YYYY-MM-DD)
        pricing_render_mode: text or table
        room_sections: Optional room section details
        effective_term_months_override: Override term months (6 or 12), None = auto-detect

    Returns:
        Complete calculation result with DOCX context
    """
    # Build calculation context
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
        effective_term_months_override=effective_term_months_override,
    )

    return {
        "ok": True,
        "mode": "background_karaoke_calculation_dry_run",
        "write_performed": False,
        "contract_created": False,
        "docx_generated": False,
        "xlsx_generated": False,
        "gcn_created": False,
        "contract_no_generated": False,
        "errors": context.get("errors", []),
        "warnings": context.get("warnings", []),
        "input_echo": {
            "contract_no": None,
            "karaoke_type": karaoke_type,
            "area_group": area_group,
            "tong_so_phong": tong_so_phong,
            "tong_so_box": tong_so_box,
            "muc_luong_co_so": muc_luong_co_so,
            "ty_le_ho_tro": ty_le_ho_tro,
            "ty_le_ho_tro_bac_1": ty_le_ho_tro_bac_1,
            "ty_le_ho_tro_bac_2": ty_le_ho_tro_bac_2,
            "ty_le_ho_tro_bac_3": ty_le_ho_tro_bac_3,
            "gtgt_percent": gtgt_percent,
            "start_date": start_date,
            "end_date": end_date,
            "pricing_render_mode": pricing_render_mode,
        },
        "calculation": {
            "term_months": context.get("term_months", 12),
            "tiers": context.get("tiers", []),
            "subtotal_before_support": context.get("subtotal_before_support", 0),
            "support_by_tier": context.get("support_by_tier", 0),
            "annual_support_amount": context.get("annual_support_amount", 0),
            "amount_before_gtgt": context.get("amount_before_gtgt", 0),
            "gtgt_percent": context.get("gtgt_percent", 8),
            "gtgt_amount": context.get("gtgt_amount", 0),
            "total_amount": context.get("total_amount", 0),
            "effective_amount_before_gtgt": context.get("effective_amount_before_gtgt", 0),
            "effective_total_amount": context.get("effective_total_amount", 0),
            "detail_rows": context.get("detail_rows", []),
            "docx_context_preview": context.get("docx_context_preview", {}),
        },
    }
