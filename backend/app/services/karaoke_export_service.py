"""Build Karaoke DOCX render context from contract data.

This service extracts karaoke calculation data from a contract record and
builds the render context needed for DOCX block insertion.

Render context keys used by karaoke_renderer.py:
- room_display_text: Tab-separated room display lines
- pricing_detail_text: Tab-separated pricing detail lines
- pricing_total_text: Tab-separated pricing total lines
- karaoke_pricing_render_mode: "text" or "table"
- tong_so_phong: Total number of rooms
- tong_so_box: Total number of boxes
- loai_hinh_karaoke: "PHONG" or "BOX"
- contract_term_months: 6 or 12
- muc_luong_co_so: Base salary (VND)
- so_tien_bang_chu: Amount in words
- karaoke_pricing_footer_note: Footer note text

Template 1 context keys (pricing table placeholders):
- total_rooms_text: Text describing total rooms (e.g., "15 phòng")
- tier_1_label, tier_2_label, tier_3_label: Tier labels
- tier_1_coefficient, tier_2_coefficient, tier_3_coefficient: Tier coefficients
- tier_1_amount, tier_2_amount, tier_3_amount: Tier amounts (after urban support)
- urban_support_label, urban_support_basis, urban_support_rate: Urban support info
- royalty_amount_before_vat, vat_rate, vat_amount, royalty_amount_after_vat: Royalty amounts
- royalty_amount_in_words: Amount in Vietnamese words
- karaoke_pricing_footer_note: Footer note
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.calculations.karaoke import KARAOKE_AREA_GROUP_COEFFICIENTS
from app.calculations.karaoke.calculator import normalize_room_sections
from app.calculations.karaoke.docx_context import build_karaoke_docx_context
from app.calculations.karaoke.support import (
    compute_karaoke_amounts_with_urban_support,
    urban_support_label,
)
from app.models.contracts import ContractRecordRow

logger = logging.getLogger("uvicorn.error")

# Default base salary per Nghị định 161/2026/NĐ-CP, effective from 01/07/2026
DEFAULT_BASE_SALARY = 2_530_000
DEFAULT_VAT_PERCENT = 8.0


def _parse_json_field(value: str | None) -> Any:
    """Parse JSON field from contract, return empty list on failure."""
    if not value:
        return []
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return parsed
        return [parsed] if parsed else []
    except (json.JSONDecodeError, TypeError):
        return []


def _safe_int(value: Any, default: int = 0) -> int:
    """Safely convert value to int."""
    if value is None:
        return default
    if isinstance(value, int):
        return value
    try:
        return int(float(str(value)))
    except (ValueError, TypeError):
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    """Safely convert value to float."""
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).replace(",", "."))
    except (ValueError, TypeError):
        return default


def _get_str(row: ContractRecordRow, attr: str) -> str:
    """Get string attribute from ContractRecordRow, safely."""
    return str(getattr(row, attr, None) or "").strip()


def _compute_contract_term_months(row: ContractRecordRow) -> int:
    """Compute contract term in months from start/end dates."""
    if row.ngay_bat_dau and row.ngay_ket_thuc:
        try:
            from datetime import date
            start = row.ngay_bat_dau
            end = row.ngay_ket_thuc
            if isinstance(start, date) and isinstance(end, date):
                days = (end - start).days
                if days >= 330:
                    return 12
                if days >= 150:
                    return 6
        except (TypeError, AttributeError):
            pass
    return 12


def _build_khu_vuc_su_dung_nhac_text(karaoke_type: str, total_rooms: int, total_boxes: int) -> str:
    """Build khu_vuc_su_dung_nhac text for preview.

    This displays the total number of rooms/boxes as a summary,
    formatted as "X phòng" or "X box".

    Args:
        karaoke_type: "PHONG" or "BOX"
        total_rooms: Total number of rooms
        total_boxes: Total number of boxes

    Returns:
        Formatted text like "8 phòng" or "5 box"
    """
    if karaoke_type == "BOX":
        return f"{total_boxes} box"
    return f"{total_rooms} phòng"


def build_karaoke_render_context_from_contract(
    row: ContractRecordRow,
    *,
    effective_term_months_override: int | None = None,
    include_6_month_option: bool = False,
) -> dict[str, Any]:
    """
    Build complete Karaoke DOCX render context from contract record.

    This function:
    1. Extracts karaoke fields from contract
    2. Computes pricing using the karaoke calculator
    3. Builds text display for room and pricing blocks

    Args:
        row: ContractRecordRow instance
        effective_term_months_override: Override term months (6 or 12), None = auto-detect
        include_6_month_option: If True, show both 6-month and 12-month total lines

    Returns:
        Dict with render context keys for karaoke_renderer.py
    """
    # Extract karaoke type
    karaoke_type_raw = str(row.loai_hinh_karaoke or "PHONG").strip().upper()
    karaoke_type = "BOX" if karaoke_type_raw == "BOX" else "PHONG"

    # Extract counts
    total_rooms = _safe_int(row.tong_so_phong, 0)
    total_boxes = _safe_int(row.tong_so_box, 0)

    # Area group (not in contract, derive from room count)
    area_group = "DEN_20"  # Default
    if karaoke_type == "PHONG":
        if total_rooms > 30:
            area_group = "TREN_30"
        elif total_rooms > 20:
            area_group = "TREN_20_DEN_30"
        else:
            area_group = "DEN_20"
    else:
        area_group = "BOX"

    # Extract pricing values — use saved totals from DB if available, else recalculate
    saved_before_vat = _safe_int(row.royalty_amount_before_vat, 0)
    saved_vat_amount = _safe_int(row.vat_amount, 0)
    saved_after_vat = _safe_int(row.royalty_amount_after_vat, 0)
    saved_vat_rate = float(row.vat_rate) if row.vat_rate is not None else DEFAULT_VAT_PERCENT
    saved_amount_in_words = str(row.royalty_amount_in_words or "").strip()
    muc_luong_co_so = DEFAULT_BASE_SALARY
    gtgt_percent = saved_vat_rate if saved_before_vat > 0 else DEFAULT_VAT_PERCENT

    # Support percentages - could be added to contract model later
    ty_le_ho_tro = 0.0
    ty_le_ho_tro_bac_1 = 0.0
    ty_le_ho_tro_bac_2 = 0.0
    ty_le_ho_tro_bac_3 = 0.0

    # Contract dates for term calculation
    start_date_str = None
    end_date_str = None
    if row.ngay_bat_dau:
        start_date_str = str(row.ngay_bat_dau)
    if row.ngay_ket_thuc:
        end_date_str = str(row.ngay_ket_thuc)

    # Extract room sections from JSON
    room_sections_json = _parse_json_field(row.karaoke_room_details_json)
    room_sections = normalize_room_sections(room_sections_json)

    # Compute term months - use override if provided
    term_months = effective_term_months_override if effective_term_months_override else _compute_contract_term_months(row)

    # Build DOCX context using the calculation module
    docx_ctx = build_karaoke_docx_context(
        karaoke_type=karaoke_type,
        area_group=area_group,
        tong_so_phong=total_rooms,
        tong_so_box=total_boxes,
        muc_luong_co_so=muc_luong_co_so,
        ty_le_ho_tro=ty_le_ho_tro,
        ty_le_ho_tro_bac_1=ty_le_ho_tro_bac_1,
        ty_le_ho_tro_bac_2=ty_le_ho_tro_bac_2,
        ty_le_ho_tro_bac_3=ty_le_ho_tro_bac_3,
        gtgt_percent=gtgt_percent,
        start_date=start_date_str,
        end_date=end_date_str,
        room_sections=room_sections,
        pricing_render_mode="table",
        include_6_month_option=include_6_month_option,
    )

    # Override pricing text with saved totals from DB if available (simplified flow)
    # This ensures {{tien_ban_quyen}} shows the confirmed totals, not recalculated values
    if saved_before_vat > 0 or saved_after_vat > 0:
        _override_pricing_text_with_saved_totals(docx_ctx, saved_before_vat, saved_vat_amount, saved_after_vat, saved_vat_rate, saved_amount_in_words)

    # Address fields — use new structured fields (post-2025 merger), fallback to legacy
    usage_full = _get_str(row, "usage_full_address") or _get_str(row, "dia_chi_su_dung")
    legal_full = _get_str(row, "legal_full_address") or _get_str(row, "don_vi_dia_chi")

    # Extract music_usage_areas from DB (source of truth for all domains)
    # Priority: music_usage_areas column > legacy karaoke_room_details_json fallback
    raw_music_areas = row.get_music_usage_areas() if hasattr(row, "get_music_usage_areas") else []
    music_areas_for_render: list[dict] = []
    if raw_music_areas and len(raw_music_areas) > 0:
        music_areas_for_render = raw_music_areas
    elif room_sections:
        # Legacy fallback: convert room sections to music_usage_areas format
        music_areas_for_render = [
            {
                "area_name": str(sec.get("label", "Khu vực sử dụng âm nhạc")),
                "scale_description": f"{max(0, _safe_int(sec.get('room_count'), 0))} phòng",
                "music_usage_type": "Sử dụng nhạc qua đầu Karaoke",
            }
            for sec in room_sections
            if max(0, _safe_int(sec.get("room_count"), 0)) > 0
        ]

    # Add additional context keys expected by renderer
    render_ctx = {
        # Room block
        "room_display_text": docx_ctx.get("room_display_text", ""),
        "karaoke_room_block_text": docx_ctx.get("room_display_text", ""),
        # Phase 2: Music usage areas — source of truth for khu_vuc_su_dung_nhac
        "music_usage_areas": music_areas_for_render,
        # Pricing blocks
        "pricing_detail_text": docx_ctx.get("pricing_detail_text", ""),
        "pricing_total_text": docx_ctx.get("pricing_total_text", ""),
        # Renderer mode
        "karaoke_pricing_render_mode": "TABLE",
        # Contract info
        "tong_so_phong": total_rooms,
        "tong_so_box": total_boxes,
        "loai_hinh_karaoke": karaoke_type,
        "contract_term_months": term_months,
        # Usage address (where music is used)
        "dia_chi_kinh_doanh": usage_full,
        "business_address": usage_full,
        # khu_vuc: dùng chung cho tất cả lĩnh vực
        "khu_vuc": usage_full,
        # Legal address
        "dia_chi": legal_full,
        "don_vi_dia_chi": legal_full,
        # Executor/Assignee info
        "nguoi_thuc_hien_email": _get_str(row, "nguoi_thuc_hien_email"),
        # Khu vuc su dung nhac (total rooms display for preview)
        "khu_vuc_su_dung_nhac": _build_khu_vuc_su_dung_nhac_text(karaoke_type, total_rooms, total_boxes),
        # Pricing values
        "muc_luong_co_so": str(muc_luong_co_so),
        # Amount in words
        "so_tien_bang_chu": docx_ctx.get("pricing_total_text", "").split("\n")[-1] if docx_ctx.get("pricing_total_text") else "",
        # Footer note
        "karaoke_pricing_footer_note": (
            f"Mức lương cơ sở {muc_luong_co_so:,}đ có thời hạn bắt đầu từ ngày 1/7/2026 "
            f"áp dụng khoản 2 Điều 3 Nghị định 161/2026/NĐ-CP ngày 15/5/2026"
        ),
    }

    # Add calculation detail for debugging
    render_ctx["_calculation"] = docx_ctx

    logger.debug(
        f"Karaoke render context built for contract {row.id}: "
        f"type={karaoke_type}, rooms={total_rooms}, boxes={total_boxes}"
    )

    return render_ctx


def build_karaoke_export_preview_context(
    row: ContractRecordRow,
    *,
    include_calculation: bool = True,
    effective_term_months_override: int | None = None,
    include_6_month_option: bool = False,
) -> dict[str, Any]:
    """
    Build complete context for karaoke export preview.

    This is the main entry point for the export preview endpoint.

    Args:
        row: ContractRecordRow instance
        include_calculation: Include full calculation result (default True)
        effective_term_months_override: Override term months (6 or 12)

    Returns:
        Dict with render context and calculation result
    """
    from app.calculations.karaoke.calculator import calculate_karaoke_dry_run

    # Extract basic params
    karaoke_type = str(row.loai_hinh_karaoke or "PHONG").strip().upper()
    if karaoke_type != "BOX":
        karaoke_type = "PHONG"

    total_rooms = _safe_int(row.tong_so_phong, 0)
    total_boxes = _safe_int(row.tong_so_box, 0)

    # Compute term - use override if provided
    term_months = effective_term_months_override if effective_term_months_override else _compute_contract_term_months(row)

    # Extract room sections
    room_sections_json = _parse_json_field(row.karaoke_room_details_json)
    room_sections = normalize_room_sections(room_sections_json)

    # Build render context for DOCX
    render_ctx = build_karaoke_render_context_from_contract(
        row,
        effective_term_months_override=term_months,
        include_6_month_option=include_6_month_option,
    )

    # Build calculation result
    calc_result = None
    if include_calculation:
        calc_result = calculate_karaoke_dry_run(
            karaoke_type=karaoke_type,
            area_group=render_ctx.get("_calculation", {}).get("area_group", "DEN_20"),
            tong_so_phong=total_rooms,
            tong_so_box=total_boxes,
            muc_luong_co_so=DEFAULT_BASE_SALARY,
            ty_le_ho_tro=0.0,
            ty_le_ho_tro_bac_1=0.0,
            ty_le_ho_tro_bac_2=0.0,
            ty_le_ho_tro_bac_3=0.0,
            gtgt_percent=DEFAULT_VAT_PERCENT,
            start_date=str(row.ngay_bat_dau) if row.ngay_bat_dau else None,
            end_date=str(row.ngay_ket_thuc) if row.ngay_ket_thuc else None,
            pricing_render_mode="table",
            room_sections=room_sections,
            effective_term_months_override=effective_term_months_override,
        )

    # Add "linh_vuc" display (title case for Word export)
    linh_vuc_display = _get_str(row, "linh_vuc_hien_thi") or "Karaoke"
    # Normalize to title case: "karaoke" -> "Karaoke", "KHU VUI CHOI" -> "Khu Vui Choi"
    import unicodedata
    def _title_case(s):
        if not s:
            return s
        # Only title-case if currently all uppercase or all lowercase
        if s.isupper() or s.islower():
            return s.title()
        return s
    linh_vuc_display = _title_case(linh_vuc_display)

    return {
        "ok": True,
        "contract_id": row.id,
        "contract_no": row.contract_no,
        "domain": "KARAOKE",
        "domain_label": linh_vuc_display,
        "karaoke_type": karaoke_type,
        "total_rooms": total_rooms,
        "total_boxes": total_boxes,
        "term_months": term_months,
        "term_months_override": effective_term_months_override,
        "nguoi_thuc_hien_email": str(row.nguoi_thuc_hien_email or "").strip(),
        "khu_vuc_su_dung_nhac": _build_khu_vuc_su_dung_nhac_text(karaoke_type, total_rooms, total_boxes),
        "render_context": render_ctx,
        "calculation": calc_result,
    }


def build_karaoke_template1_context_from_contract(
    row: ContractRecordRow,
    *,
    urban_support_percent: float = 100.0,
    effective_term_months_override: int | None = None,
    pricing_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Build DOCX render context for export_template_contract_1.docx.

    This function builds the complete context needed for template 1, including:
    - Khu vực kinh doanh (music usage areas)
    - Bảng tiền với individual placeholders (tier labels, coefficients, amounts)
    - Urban support information per NĐ 134/2026

    Priority order for pricing data:
    1. pricing_snapshot (from frontend applied pricing) - takes precedence
    2. DB row values (recalculated)

    Args:
        row: ContractRecordRow instance
        urban_support_percent: Urban support percentage (0-100), default 100%
        effective_term_months_override: Override term months (6 or 12), None = auto-detect
        pricing_snapshot: Full pricing snapshot from frontend (from "Áp dụng" button)

    Returns:
        Dict with all render context keys for template 1
    """
    # Check if pricing_snapshot from frontend is available
    # This takes precedence over DB values
    use_snapshot = pricing_snapshot is not None and len(pricing_snapshot) > 0
    
    # Extract karaoke type
    karaoke_type_raw = str(row.loai_hinh_karaoke or "PHONG").strip().upper()
    karaoke_type = "BOX" if karaoke_type_raw == "BOX" else "PHONG"

    # Extract counts from snapshot or DB
    if use_snapshot:
        # Calculate total_rooms from snapshot rows if not explicitly provided
        snapshot_rows = pricing_snapshot.get("rows", [])
        explicit_rooms = pricing_snapshot.get("total_rooms")
        if explicit_rooms is not None and int(explicit_rooms) > 0:
            total_rooms = int(explicit_rooms)
        else:
            # Calculate from rows
            total_rooms = sum(int(r.get("quantity", 0) or 0) for r in snapshot_rows)
        
        explicit_boxes = pricing_snapshot.get("total_boxes")
        if explicit_boxes is not None and int(explicit_boxes) > 0:
            total_boxes = int(explicit_boxes)
        else:
            total_boxes = 0
    else:
        total_rooms = _safe_int(row.tong_so_phong, 0)
        total_boxes = _safe_int(row.tong_so_box, 0)
        snapshot_rows = []

    # Compute term months
    if use_snapshot:
        term_months = int(pricing_snapshot.get("duration_months", 12) or 12)
    else:
        term_months = effective_term_months_override if effective_term_months_override else _compute_contract_term_months(row)

    # Area group (derive from room count)
    area_group = "DEN_20"
    if karaoke_type == "PHONG":
        if total_rooms > 30:
            area_group = "TREN_30"
        elif total_rooms > 20:
            area_group = "TREN_20_DEN_30"
        else:
            area_group = "DEN_20"
    else:
        area_group = "BOX"

    # Pricing values
    muc_luong_co_so = DEFAULT_BASE_SALARY
    gtgt_percent = DEFAULT_VAT_PERCENT

    # Get coefficients for area group
    coefficients = KARAOKE_AREA_GROUP_COEFFICIENTS.get(area_group, (0.0, 0.0, 0.0))
    coeff_1, coeff_2, coeff_3 = coefficients

    # Calculate amounts - use snapshot if available, otherwise recalculate
    if use_snapshot:
        # Use values from frontend pricing snapshot directly
        tier_amounts = []
        tier_1_amount = 0
        tier_2_amount = 0
        tier_3_amount = 0
        
        for i, row_data in enumerate(snapshot_rows):
            amount = int(row_data.get("amount", 0) or 0)
            tier_amounts.append({
                "amount": amount,
                "label": row_data.get("label", ""),
                "quantity": row_data.get("quantity", 0),
            })
            if i == 0:
                tier_1_amount = amount
            elif i == 1:
                tier_2_amount = amount
            elif i == 2:
                tier_3_amount = amount
        
        # Get totals from snapshot
        royalty_before_vat = int(pricing_snapshot.get("subtotal", 0) or 0)
        vat_amount = int(pricing_snapshot.get("vat_amount", 0) or 0)
        total_after_vat = int(pricing_snapshot.get("total", 0) or 0)
        amount_in_words = str(pricing_snapshot.get("amount_in_words", "") or "")
        
        # Get urban support from snapshot or calculate
        support_rate = pricing_snapshot.get("support_rate_percent")
        if support_rate is not None:
            urban_support_percent = float(support_rate)
        
        # Get VAT rate from snapshot
        vat_rate_from_snapshot = pricing_snapshot.get("vat_rate")
        if vat_rate_from_snapshot is not None:
            gtgt_percent = float(vat_rate_from_snapshot) * 100
        
        # Get base salary from snapshot
        base_salary_from_snapshot = pricing_snapshot.get("base_salary")
        if base_salary_from_snapshot is not None:
            muc_luong_co_so = int(base_salary_from_snapshot)
        
        # Get tier coefficients from snapshot rows
        if len(snapshot_rows) > 0 and snapshot_rows[0].get("coefficient"):
            coeff_1 = float(snapshot_rows[0].get("coefficient", 0))
        if len(snapshot_rows) > 1 and snapshot_rows[1].get("coefficient"):
            coeff_2 = float(snapshot_rows[1].get("coefficient", 0))
        if len(snapshot_rows) > 2 and snapshot_rows[2].get("coefficient"):
            coeff_3 = float(snapshot_rows[2].get("coefficient", 0))
        
        # Get tier labels from snapshot rows
        tier_labels = [r.get("label", "") for r in snapshot_rows]
        while len(tier_labels) < 3:
            tier_labels.append("")
        
        calc_result = {
            "urban_support_label": urban_support_label(urban_support_percent),
            "urban_support_basis": "NĐ 134/2026/NĐ-CP",
            "amount_after_support": royalty_before_vat,
            "vat_amount": vat_amount,
            "amount_after_vat": total_after_vat,
            "amount_in_words": amount_in_words,
            "tiers": tier_amounts,
        }
    else:
        # Recalculate from DB values
        calc_result = compute_karaoke_amounts_with_urban_support(
            karaoke_type=karaoke_type,
            area_group=area_group,
            total_rooms=total_rooms,
            total_box=total_boxes,
            base_salary=muc_luong_co_so,
            urban_support_percent=urban_support_percent,
            vat_percent=gtgt_percent,
            effective_term_months=term_months,
        )

        # Build tier amounts for template
        tier_amounts = calc_result.get("tiers", [])
        tier_1_amount = tier_amounts[0]["amount"] if len(tier_amounts) > 0 else 0
        tier_2_amount = tier_amounts[1]["amount"] if len(tier_amounts) > 1 else 0
        tier_3_amount = tier_amounts[2]["amount"] if len(tier_amounts) > 2 else 0

    # Build tier labels based on karaoke type and snapshot
    if use_snapshot and len(tier_labels) >= 3:
        tier_1_label = tier_labels[0]
        tier_2_label = tier_labels[1]
        tier_3_label = tier_labels[2]
    elif karaoke_type == "BOX":
        tier_1_label = "Karaoke Box"
        tier_2_label = ""
        tier_3_label = ""
    else:
        tier_1_label = "Từ 1 đến 4 phòng"
        tier_2_label = "Từ phòng thứ 5 đến 10"
        tier_3_label = "Từ phòng thứ 11 trở đi"

    # Extract music_usage_areas
    raw_music_areas = row.get_music_usage_areas() if hasattr(row, "get_music_usage_areas") else []
    music_areas_for_render: list[dict] = []
    if raw_music_areas and len(raw_music_areas) > 0:
        music_areas_for_render = raw_music_areas
    else:
        # Legacy fallback: build from room sections
        room_sections_json = _parse_json_field(row.karaoke_room_details_json)
        room_sections = normalize_room_sections(room_sections_json)
        if room_sections:
            music_areas_for_render = [
                {
                    "area_name": str(sec.get("label", "Khu vực sử dụng âm nhạc")),
                    "scale_description": f"{max(0, _safe_int(sec.get('room_count'), 0))} phòng",
                    "music_usage_type": "Sử dụng nhạc qua đầu Karaoke",
                }
                for sec in room_sections
                if max(0, _safe_int(sec.get("room_count"), 0)) > 0
            ]

    # Address fields
    usage_full = _get_str(row, "usage_full_address") or _get_str(row, "dia_chi_su_dung")
    legal_full = _get_str(row, "legal_full_address") or _get_str(row, "don_vi_dia_chi")

    # Build total rooms text
    if karaoke_type == "BOX":
        total_rooms_text = f"{total_boxes} box"
    else:
        total_rooms_text = f"{total_rooms} phòng"

    # Build context for template 1
    render_ctx = {
        # Khu vực kinh doanh
        "khu_vuc_su_dung_nhac": _build_khu_vuc_su_dung_nhac_text(karaoke_type, total_rooms, total_boxes),
        "total_rooms_text": total_rooms_text,
        "music_usage_areas": music_areas_for_render,
        "tong_so_phong": total_rooms,
        "tong_so_box": total_boxes,
        "loai_hinh_karaoke": karaoke_type,
        "contract_term_months": term_months,

        # Address
        "dia_chi_kinh_doanh": usage_full,
        "business_address": usage_full,
        "khu_vuc": usage_full,
        "dia_chi": legal_full,
        "don_vi_dia_chi": legal_full,
        "nguoi_thuc_hien_email": _get_str(row, "nguoi_thuc_hien_email"),

        # Pricing table placeholders
        "total_rooms_text": total_rooms_text,
        "tier_1_label": tier_1_label,
        "tier_2_label": tier_2_label,
        "tier_3_label": tier_3_label,
        "muc_luong_co_so": str(muc_luong_co_so),
        "tier_1_coefficient": coeff_1,
        "tier_2_coefficient": coeff_2,
        "tier_3_coefficient": coeff_3,
        "tier_unit": "phòng/năm",
        "tier_1_amount": tier_1_amount,
        "tier_2_amount": tier_2_amount,
        "tier_3_amount": tier_3_amount,

        # Urban support
        "urban_support_label": calc_result.get("urban_support_label", ""),
        "urban_support_basis": calc_result.get("urban_support_basis", "NĐ 134/2026/NĐ-CP"),
        "urban_support_rate": f"{urban_support_percent:.0f}%",

        # Royalty amounts
        "royalty_amount_before_vat": calc_result.get("amount_after_support", 0),
        "vat_rate": f"{gtgt_percent:.0f}",
        "vat_amount": calc_result.get("vat_amount", 0),
        "duration_months": term_months,
        "royalty_amount_after_vat": calc_result.get("amount_after_vat", 0),
        "royalty_amount_in_words": calc_result.get("amount_in_words", ""),

        # Footer note
        "karaoke_pricing_footer_note": (
            f"Mức lương cơ sở {muc_luong_co_so:,} đồng/tháng theo Nghị định 161/2026/NĐ-CP, "
            f"Điều 3 khoản 2, có hiệu lực từ ngày 01/7/2026."
        ),

        # Additional keys for legacy compatibility
        "muc_luong_co_so_display": f"{muc_luong_co_so:,}".replace(",", "."),
        "room_display_text": "",
    }

    logger.debug(
        f"Karaoke template1 context built for contract {row.id}: "
        f"type={karaoke_type}, rooms={total_rooms}, urban_support={urban_support_percent}%"
    )

    return render_ctx


# =============================================================================
# SIMPLIFIED FLOW: Save totals → DOCX
# =============================================================================

def _format_money_vnd(value: int) -> str:
    """Format money as Vietnamese currency string."""
    return f"{value:,}".replace(",", ".")


def _override_pricing_text_with_saved_totals(
    docx_ctx: dict[str, Any],
    before_vat: int,
    vat_amount: int,
    after_vat: int,
    vat_rate: float,
    amount_in_words: str,
) -> None:
    """Override pricing text in docx_ctx with saved totals from DB.

    This ensures that when a contract is exported to DOCX, the pricing text
    uses the confirmed/entered totals instead of recalculated values.

    Args:
        docx_ctx: The docx context dict (modified in place)
        before_vat: Royalty amount before VAT
        vat_amount: VAT amount
        after_vat: Total after VAT
        vat_rate: VAT rate percentage
        amount_in_words: Amount in Vietnamese words
    """
    vat_pct_str = f"{vat_rate:.0f}"

    # Build the pricing total text line that goes into {{tien_ban_quyen}}
    lines = [
        f"Cộng tiền bản quyền trước thuế\t{_format_money_vnd(before_vat)} đồng",
        f"Thuế GTGT {vat_pct_str}%\t{_format_money_vnd(vat_amount)} đồng",
        f"Tổng giá trị hợp đồng\t{_format_money_vnd(after_vat)} đồng",
    ]
    docx_ctx["pricing_total_text"] = "\n".join(lines)

    # Amount in words override
    if amount_in_words:
        docx_ctx["so_tien_bang_chu"] = f"({amount_in_words})"

    # Also update the calculated values so they're consistent
    docx_ctx["amount_before_vat"] = before_vat
    docx_ctx["vat_amount"] = vat_amount
    docx_ctx["amount_after_vat"] = after_vat
    docx_ctx["vat_rate"] = vat_pct_str


# NOTE: total_rooms_text auto-sum from music_usage_areas was REMOVED.
# User enters total rooms manually in the karaoke calculator; the field is saved
# to row.tong_so_phong (or row.tong_so_box for BOX). Filename uses that DB field.

