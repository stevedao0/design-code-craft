"""Karaoke DOCX export preview service.

This service generates DOCX files with karaoke room blocks.
The simplified flow uses {{khu_vuc_su_dung_nhac}} and {{tien_ban_quyen}} text placeholders.
The tier table placeholder approach has been removed.
"""
from __future__ import annotations

import logging
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session


def _safe_int(value: Any, default: int = 0) -> int:
    """Safely convert a value to int with fallback default."""
    try:
        if value is None or value == "":
            return default
        return int(float(str(value).replace(",", "").strip()))
    except Exception:
        return default


from app.models.contracts import ContractRecordRow
from app.renderers.karaoke_renderer import (
    insert_khu_vuc_and_tien_ban_quyen_blocks,
)
from app.renderers.text_renderer import extract_placeholders_from_template, render_docx_text
from app.schemas.export_preview import ExportPreviewResponse
from app.schemas.karaoke_export import KaraokeExportPreviewResponse
from app.services.export_resolver import resolve_contract_export_plan
from app.services.karaoke_export_service import (
    build_karaoke_render_context_from_contract,
)
from app.services.placeholder_registry import get_sentinel_for_key
from app.services.certificate_context import _resolve_effective_dates

logger = logging.getLogger("uvicorn.error")

# Placeholders that indicate template 1 (has individual pricing table placeholders)
TEMPLATE_1_PRICING_PLACEHOLDERS = {
    "{{tier_1_label}}",
    "{{tier_1_amount}}",
    "{{royalty_amount_before_vat}}",
}


def _build_basic_context(row: ContractRecordRow) -> dict:
    """Build basic text context from contract record row."""
    from app.services.background_domain_display import get_background_domain_display_name

    ctx: dict = {}

    ctx["so_hop_dong"] = str(row.contract_no or "")
    # FIX: Use proper display name for all domains
    ctx["linh_vuc"] = get_background_domain_display_name(row.linh_vuc or row.linh_vuc_hien_thi or row.field_code)

    if row.ngay_lap_hop_dong:
        ngay_lap = row.ngay_lap_hop_dong
        ctx["ngay_ky_hop_dong"] = str(ngay_lap.day)
        ctx["thang_ky_hop_dong"] = str(ngay_lap.month)
        ctx["nam_ky_hop_dong"] = str(ngay_lap.year)
    else:
        ctx["ngay_ky_hop_dong"] = ""
        ctx["thang_ky_hop_dong"] = ""
        ctx["nam_ky_hop_dong"] = ""

    # Ngày hiệu lực / hết hiệu lực hợp đồng
    start, end, _ = _resolve_effective_dates(row)
    ctx["ngay_hieu_luc_HD"] = f"{start.day:02d}/{start.month:02d}/{start.year}" if start else ""
    ctx["ngay_het_hieu_luc_HD"] = f"{end.day:02d}/{end.month:02d}/{end.year}" if end else ""

    ctx["TEN_DON_VI"] = str(row.don_vi_ten or "")
    ctx["BANG_HIEU"] = str(row.ten_bang_hieu or "")
    ctx["TEN_BANG_HIEU"] = str(row.ten_bang_hieu or "")

    ctx["ma_so_thue"] = str(row.don_vi_mst or "")
    ctx["dia_chi"] = str(row.dia_chi_su_dung or "")
    ctx["dia_chi_kinh_doanh"] = str(row.dia_chi_su_dung or "")  # Địa chỉ kinh doanh
    ctx["so_dien_thoai"] = str(row.don_vi_dien_thoai or "")
    ctx["email"] = str(row.don_vi_email or "")

    ctx["nguoi_dai_dien"] = str(row.don_vi_nguoi_dai_dien or "")
    ctx["chuc_vu"] = str(row.don_vi_chuc_vu or "")
    ctx["nguoi_thuc_hien_email"] = str(row.nguoi_thuc_hien_email or "")

    # Karaoke specific fields
    karaoke_type = str(row.loai_hinh_karaoke or "PHONG").strip().upper()
    if karaoke_type != "BOX":
        karaoke_type = "PHONG"

    total_rooms = int(row.tong_so_phong or 0)
    total_boxes = int(row.tong_so_box or 0)

    # NOTE: Do NOT set khu_vuc_su_dung_nhac or tien_ban_quyen here.
    # khu_vuc_su_dung_nhac: sentinel set in render_karaoke_docx_preview via basic_ctx
    # tien_ban_quyen: PRESERVED placeholder — not set, not rendered, kept as-is

    logger.info(
        "[WORD_EXPORT] contract_no='%s' being used for DOCX render (should include /PR suffix)",
        str(row.contract_no or "")
    )
    return ctx


def _is_template_1(template_path: Path) -> bool:
    """Check if template uses individual pricing table placeholders (template 1).

    NOTE: This is kept for backward compatibility reference only.
    The simplified flow uses build_karaoke_render_context_from_contract for ALL templates.
    """
    placeholders = extract_placeholders_from_template(template_path=template_path)
    return any(p in placeholders for p in TEMPLATE_1_PRICING_PLACEHOLDERS)


def render_karaoke_docx_preview(
    db: Session,
    contract_id: int,
    *,
    output_dir: Path | None = None,
    pricing_snapshot: dict[str, Any] | None = None,
) -> ExportPreviewResponse:
    """Render Karaoke contract DOCX with khu vuc block to preview file.

    SIMPLIFIED FLOW: All Karaoke templates use the simple text approach with
    {{khu_vuc_su_dung_nhac}} and {{tien_ban_quyen}} placeholders.
    The tier table placeholder approach has been removed.

    {{khu_vuc_su_dung_nhac}} is auto-rendered into a 3-column table.
    """
    row = db.query(ContractRecordRow).filter(ContractRecordRow.id == int(contract_id)).first()
    if not row:
        raise ValueError(f"Contract {contract_id} not found")

    # Simplified flow guard: require confirmed 3 money totals before export
    saved_after_vat = _safe_int(row.royalty_amount_after_vat, 0)
    saved_before_vat = _safe_int(row.royalty_amount_before_vat, 0)
    if saved_after_vat <= 0 and saved_before_vat <= 0:
        raise ValueError(
            "Thiếu số tiền bản quyền đã chốt. "
            "Vui lòng tính tiền và bấm \"Chốt 3 số tiền\" trước khi tạo hợp đồng."
        )

    # Resolve template
    export_plan = resolve_contract_export_plan(row=row)
    if not export_plan.selected:
        raise ValueError(f"No template for contract {contract_id}")

    template_path = Path(export_plan.selected.path)
    if not template_path.exists():
        raise ValueError(f"Template not found: {template_path}")

    # Build context using the simple/legacy approach for ALL templates
    basic_ctx = _build_basic_context(row)
    render_ctx = build_karaoke_render_context_from_contract(row)
    music_usage_areas_data = row.get_music_usage_areas() if hasattr(row, "get_music_usage_areas") else []
    render_ctx["music_usage_areas"] = music_usage_areas_data

    # For ALL Karaoke templates: use sentinel for khu_vuc, no tien_ban_quyen (preserved)
    basic_ctx["khu_vuc_su_dung_nhac"] = get_sentinel_for_key("khu_vuc_su_dung_nhac")
    # Do NOT set basic_ctx["tien_ban_quyen"] — template uses preserved {{tien_ban_quyen}}

    # Generate output filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    if output_dir is None:
        output_dir = Path("F:\\APPs\\storage\\preview")
    output_dir.mkdir(parents=True, exist_ok=True)

    filename = f"PREVIEW_KARAOKE_{contract_id}_{timestamp}.docx"
    output_path = output_dir / filename

    # Render DOCX with basic text placeholders
    render_docx_text(
        template_path=template_path,
        output_path=output_path,
        context=basic_ctx,
    )

    warnings: list[str] = []
    khu_vuc_inserted = False

    # Insert khu vuc block (applies to ALL Karaoke templates in simplified flow)
    block_result = insert_khu_vuc_and_tien_ban_quyen_blocks(
        docx_path=output_path,
        render_ctx=render_ctx,
    )
    if block_result.get("warnings"):
        warnings.extend(block_result["warnings"])
    khu_vuc_inserted = block_result.get("khu_vuc_inserted", False)

    if not khu_vuc_inserted:
        warnings.append("Khu vuc block not inserted at {{khu_vuc_su_dung_nhac}}")

    return ExportPreviewResponse(
        ok=True,
        preview_path=str(output_path),
        file_size=output_path.stat().st_size if output_path.exists() else 0,
        domain="KARAOKE",
        domain_label="Karaoke",
        template_path=str(template_path),
        docx_path_attached=False,
        file_write_performed=True,
        db_write_performed=False,
        official_export=False,
        render_enabled=True,
        db_attach_enabled=False,
        placeholders_attempted=extract_placeholders_from_template(template_path=template_path),
        placeholders_in_context=len(basic_ctx),
        pricing_blocks_inserted=False,  # Simplified: no tier table placeholder fill
        karaoke_blocks_attempted=True,
        karaoke_room_block_inserted=khu_vuc_inserted,
        karaoke_pricing_block_inserted=False,  # Simplified: no tier table placeholder fill
        warnings=warnings,
        message=f"Karaoke preview generated: {filename}",
    )


def get_karaoke_export_preview(
    db: Session,
    contract_id: int,
) -> KaraokeExportPreviewResponse:
    """Get Karaoke export preview context without generating file.

    Args:
        db: Database session
        contract_id: Contract ID

    Returns:
        KaraokeExportPreviewResponse with calculation and render context
    """
    from app.services.karaoke_export_service import build_karaoke_export_preview_context

    row = db.query(ContractRecordRow).filter(ContractRecordRow.id == int(contract_id)).first()
    if not row:
        raise ValueError(f"Contract {contract_id} not found")

    return build_karaoke_export_preview_context(row=row, include_calculation=True)
