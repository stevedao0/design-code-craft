"""KVC export service - build render context from contract record.

This module provides structured context for DOCX table insertion,
matching the OLD APP behavior for KVC (Khu vui choi) contracts.

All sentinel/placeholder strings come from registry. No magic strings.
"""
from __future__ import annotations

from typing import Any

from app.services.placeholder_registry import get_sentinel_for_key


def build_kvc_render_context_from_contract(row: Any) -> dict[str, Any]:
    """Build KVC render context from contract record row.

    {{khu_vuc_su_dung_nhac}} → auto-rendered table (sentinel set).
    {{tien_ban_quyen}} → PRESERVED (not set, kept as-is for manual fill).

    Args:
        row: ContractRecordRow instance

    Returns:
        Dict with KVC-specific context values.
    """
    ctx: dict[str, Any] = {}

    # Sentinel for khu_vuc_su_dung_nhac (auto-rendered table).
    # {{tien_ban_quyen}} is PRESERVED — not set.
    ctx["khu_vuc_su_dung_nhac"] = get_sentinel_for_key("khu_vuc_su_dung_nhac")

    # Phase 2: Pass music_usage_areas from row to context for renderer
    # This is the primary data source for new contracts
    music_areas = row.get_music_usage_areas() if hasattr(row, 'get_music_usage_areas') else []
    ctx["music_usage_areas"] = music_areas

    # Structured usage locations block for table insertion (legacy fallback)
    ctx["background_usage_locations_block"] = _build_kvc_usage_locations_block(row)

    # Legacy: keep pricing block building but it won't be auto-rendered
    # (kvc_renderer no longer renders pricing block)
    pricing_block = _build_kvc_pricing_block(row)
    ctx["background_pricing_block"] = pricing_block
    ctx["background_pricing_method"] = pricing_block.get("pricing_mode", "VCPMC_TARIFF")

    ctx["background_area_m2"] = _get_area_m2(row)
    ctx["amount_in_words"] = _get_amount_in_words(row)

    # Base salary for footer note
    ctx["muc_luong_co_so"] = "2,530,000"

    return ctx


def _build_kvc_usage_locations_block(row: Any) -> dict[str, Any]:
    """Build structured usage locations block for DOCX table insertion.

    Returns:
        Dict with mode="table" and rows as list of [music_area, area_text, usage_form]
    """
    rows: list[list[str]] = []

    # Try to get usage locations from row fields
    # For KVC, we typically have one main location
    location_name = str(row.ten_bang_hieu or row.don_vi_ten or "").strip()
    area_m2 = _get_area_m2(row)
    usage_form = "Nhạc nền"

    if location_name or area_m2:
        rows.append([location_name or "-", area_m2, usage_form])

    # If no data, provide fallback row
    if not rows:
        rows.append(["-", "0 m²", "Nhạc nền"])

    return {
        "mode": "table",
        "rows": rows,
    }


def _build_kvc_pricing_block(row: Any) -> dict[str, Any]:
    """Build structured pricing block for DOCX table insertion.

    Returns:
        Dict with pricing_mode, rows, and summary_rows
    """
    # Determine pricing method based on available fields
    pricing_mode = _detect_pricing_method(row)

    # Build pricing rows based on method
    if pricing_mode == "VCPMC_TARIFF":
        rows, summary_rows = _build_vcpmc_tariff_rows(row)
    else:
        rows, summary_rows = _build_nd17_pricing_rows(row)

    return {
        "pricing_mode": pricing_mode,
        "rows": rows,
        "summary_rows": summary_rows,
    }


def _detect_pricing_method(row: Any) -> str:
    """Detect pricing method from row fields.

    Returns:
        "VCPMC_TARIFF" or "ND17"
    """
    # Check if row has VCPMC tariff data (per-area pricing)
    # VCPMC_TARIFF typically has multiple area-based rows
    if hasattr(row, 'pricing_method') and row.pricing_method:
        method = str(row.pricing_method).upper()
        if method in ("VCPMC_TARIFF", "VCPMC"):
            return "VCPMC_TARIFF"
        if method == "ND17":
            return "ND17"

    # ND17 is the default for KVC contracts
    return "ND17"


def _build_vcpmc_tariff_rows(row: Any) -> tuple[list[list[str]], list[list[str]]]:
    """Build VCPMC tariff pricing rows.

    Returns:
        Tuple of (detail_rows, summary_rows)
    """
    rows: list[list[str]] = []

    # Try to get per-area data from row
    # VCPMC tariff has columns: [unit, area, formula, amount]
    area_m2 = _get_area_m2(row)

    # For now, create a single row with total area
    if area_m2 and area_m2 != "0 m²":
        # Extract numeric value
        numeric_area = area_m2.replace("m²", "").replace("m2", "").strip()
        try:
            area_num = float(numeric_area.replace(",", ""))
            # Calculate unit price (simplified)
            unit_price = 10000  # VND per m2 per year (placeholder)
            total = int(area_num * unit_price)
            rows.append([
                "Diện tích sử dụng",
                area_m2,
                f"{unit_price:,}/m²/năm",
                f"{total:,}"
            ])
        except (ValueError, TypeError):
            rows.append(["Diện tích sử dụng", area_m2, "-", "-"])

    # Summary rows
    subtotal = _get_numeric_value(row.so_tien_chua_gtgt_value) or 0
    gtgt = _get_numeric_value(row.thue_gtgt_value) or 0
    total = _get_numeric_value(row.so_tien_value) or (subtotal + gtgt)
    gtgt_pct = float(row.thue_percent or 8)

    summary_rows = [
        ["Thành tiền", f"{int(subtotal):,}"],
        [f"Thuế GTGT {gtgt_pct}%", f"{int(gtgt):,}"],
        ["Tổng cộng", f"{int(total):,}"],
    ]

    return rows, summary_rows


def _build_nd17_pricing_rows(row: Any) -> tuple[list[list[str]], list[list[str]]]:
    """Build ND17 pricing rows for KVC.

    ND17 uses area-based pricing with formula:
    Annual royalty = Area * Unit Price * Coefficient

    Returns:
        Tuple of (detail_rows, summary_rows)
    """
    area_m2 = _get_area_m2(row)
    muc_luong_co_so = 2_530_000

    # Extract numeric area
    numeric_area = area_m2.replace("m²", "").replace("m2", "").replace(",", "").strip()
    try:
        area_num = float(numeric_area)
    except (ValueError, TypeError):
        area_num = 0.0

    # ND17 coefficient for KVC (simplified - actual calculation depends on area brackets)
    if area_num <= 100:
        coefficient = 1.0
    elif area_num <= 500:
        coefficient = 1.5
    elif area_num <= 1000:
        coefficient = 2.0
    else:
        coefficient = 2.5

    # Calculate annual royalty
    # Formula: Area * Muc luong co so * He so / 12 months
    # Simplified: Area * Muc luong co so * Coefficient / 12
    annual_per_m2 = muc_luong_co_so * coefficient / 12
    annual_total = int(area_num * annual_per_m2)

    # Detail rows - ND17 style
    formula = f"{muc_luong_co_so:,} x {coefficient}"
    rows: list[list[str]] = [
        [area_m2, formula, f"{int(annual_total):,}"]
    ]

    # Summary rows
    subtotal = _get_numeric_value(row.so_tien_chua_gtgt_value) or annual_total
    gtgt = _get_numeric_value(row.thue_gtgt_value) or int(subtotal * 0.08)
    total = _get_numeric_value(row.so_tien_value) or (subtotal + gtgt)
    gtgt_pct = float(row.thue_percent or 8)

    summary_rows: list[list[str]] = [
        ["Cộng", f"{int(subtotal):,}"],
        [f"Thuế GTGT {gtgt_pct}%", f"{int(gtgt):,}"],
        ["Tổng cộng", f"{int(total):,}"],
    ]

    return rows, summary_rows


def _get_area_m2(row: Any) -> str:
    """Get area in m2 from row."""
    # Try various fields
    area = None

    # Check for direct area field
    if hasattr(row, 'dien_tich') and row.dien_tich:
        area = row.dien_tich
    elif hasattr(row, 'tong_dien_tich') and row.tong_dien_tich:
        area = row.tong_dien_tich
    elif hasattr(row, 'area_m2') and row.area_m2:
        area = row.area_m2

    # Format as m2
    if area:
        area_str = str(area).strip()
        if "m" not in area_str.lower():
            return f"{area_str} m²"
        return area_str

    return "0 m²"


def _get_amount_in_words(row: Any) -> str:
    """Get amount in Vietnamese words from row."""
    if hasattr(row, 'so_tien_bang_chu') and row.so_tien_bang_chu:
        return str(row.so_tien_bang_chu).strip()

    # Try to generate from numeric value
    total = _get_numeric_value(row.so_tien_value)
    if total:
        return _number_to_vietnamese_words(total)

    return ""


def _get_numeric_value(value: Any) -> float | None:
    """Safely convert a value to numeric."""
    if value is None:
        return None
    if isinstance((value), (int, float)):
        return float(value)
    try:
        return float(str(value).replace(",", ""))
    except (ValueError, TypeError):
        return None


def _number_to_vietnamese_words(num: float) -> str:
    """Convert a number to Vietnamese words."""
    # Simplified implementation
    if num <= 0:
        return "Không đồng"

    units = ["", "nghìn", "triệu", "tỷ"]
    result = []

    # Handle millions and above
    num_int = int(num)
    millions = num_int // 1_000_000
    thousands = (num_int % 1_000_000) // 1_000
    remainder = num_int % 1_000

    if millions > 0:
        result.append(f"{millions:,} triệu")
    if thousands > 0:
        result.append(f"{thousands:,} nghìn")
    if remainder > 0:
        result.append(f"{remainder:,}")

    return " ".join(result) + " đồng"


def _format_currency(value: Any) -> str:
    """Format a number as Vietnamese currency."""
    if value is None:
        return "0"
    try:
        num = int(float(str(value)))
        return f"{num:,} VNĐ"
    except (ValueError, TypeError):
        return str(value)
