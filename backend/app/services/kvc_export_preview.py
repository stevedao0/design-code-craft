"""KVC DOCX export preview service.

This service generates DOCX files with KVC usage and pricing blocks.
"""
from __future__ import annotations

import logging
import tempfile
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.contracts import ContractRecordRow
from app.renderers.text_renderer import extract_placeholders_from_template, render_docx_text
from app.schemas.export_preview import ExportPreviewResponse
from app.schemas.kvc_export import KvcExportPreviewResponse
from app.services.export_resolver import resolve_contract_export_plan
from app.services.certificate_context import _resolve_effective_dates
from app.services.kvc_export_service import build_kvc_render_context_from_contract
from app.services.placeholder_registry import (
    all_template_placeholders,
    should_report_as_leftover,
)

logger = logging.getLogger("uvicorn.error")


def _get_str(row: ContractRecordRow, attr: str) -> str:
    """Get string attribute from ContractRecordRow, safely."""
    return str(getattr(row, attr, None) or "").strip()


def _build_basic_context(row: ContractRecordRow) -> dict:
    """Build basic text context from contract record row."""
    from app.services.background_domain_display import get_background_domain_display_name

    ctx: dict = {}

    ctx["so_hop_dong"] = str(row.contract_no or "")
    # FIX: Use proper display name for all domains
    ctx["linh_vuc"] = get_background_domain_display_name(row.linh_vuc or row.linh_vuc_hien_thi or row.field_code)
    # khu_vuc: dùng chung cho tất cả lĩnh vực, ưu tiên usage_full_address > dia_chi_su_dung
    ctx["khu_vuc"] = str(row.usage_full_address or row.dia_chi_su_dung or "").strip()

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
    # Address fields — use new structured fields (post-2025 merger), fallback to legacy
    # Usage address (where music is used)
    usage_full = _get_str(row, "usage_full_address") or str(row.dia_chi_su_dung or "")
    # Legal address
    legal_full = _get_str(row, "legal_full_address") or str(row.don_vi_dia_chi or "")
    ctx["dia_chi"] = legal_full
    ctx["dia_chi_kinh_doanh"] = usage_full
    ctx["so_dien_thoai"] = str(row.don_vi_dien_thoai or "")
    ctx["email"] = str(row.don_vi_email or "")

    ctx["nguoi_dai_dien"] = str(row.don_vi_nguoi_dai_dien or "")
    ctx["chuc_vu"] = str(row.don_vi_chuc_vu or "")

    return ctx


def render_kvc_docx_preview(
    db: Session,
    contract_id: int,
    *,
    output_dir: str | None = None,
) -> KvcExportPreviewResponse:
    """Render KVC contract DOCX preview with usage and pricing blocks.

    Args:
        db: Database session
        contract_id: Contract record ID
        output_dir: Optional output directory override

    Returns:
        KvcExportPreviewResponse with preview_path if successful
    """
    row = db.query(ContractRecordRow).filter(ContractRecordRow.id == contract_id).first()
    if not row:
        return KvcExportPreviewResponse(
            ok=False,
            message=f"Không tìm thấy hợp đồng ID {contract_id}",
        )

    domain_code = str(row.linh_vuc or "").upper()
    if domain_code not in ("KHU_VUI_CHOI", "KVC", "KHU_VUI_CHOI_GIAI_TRI", "CITYGAMES"):
        return KvcExportPreviewResponse(
            ok=False,
            message=f"Không hỗ trợ xuất DOCX cho lĩnh vực: {domain_code}",
        )

    # Resolve template path using row
    plan = resolve_contract_export_plan(row=row)
    if not plan.selected or not plan.selected.path:
        return KvcExportPreviewResponse(
            ok=False,
            message=f"Không tìm thấy template cho lĩnh vực: {domain_code}",
        )

    template_path = Path(plan.selected.path)
    if not template_path.exists():
        return KvcExportPreviewResponse(
            ok=False,
            message=f"Template không tồn tại: {template_path}",
        )

    # Build context
    ctx = _build_basic_context(row)
    render_ctx = build_kvc_render_context_from_contract(row)

    # Merge render context into ctx for docxtpl rendering.
    # The render context uses sentinel anchors that docxtpl will fill literally.
    # After docxtpl render, insert_kvc_blocks will find these sentinels
    # and replace them with REAL Word tables (not plain text).
    ctx.update(render_ctx)

    # Determine output path
    if output_dir:
        output_path = Path(output_dir)
    else:
        from app.core.config import settings
        output_path = Path(settings.preview_storage_path or str(Path(__file__).parent.parent.parent / "storage" / "preview"))

    output_path.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    preview_filename = f"PREVIEW_KVC_{contract_id}_{timestamp}.docx"
    preview_path = output_path / preview_filename

    # Copy template to output
    import shutil
    shutil.copy2(template_path, preview_path)

    # First do text fill
    render_docx_text(
        template_path=template_path,
        output_path=preview_path,
        context=ctx,
    )

    # Then insert KVC blocks
    from app.renderers.kvc_renderer import insert_kvc_blocks

    block_result = insert_kvc_blocks(docx_path=preview_path, render_ctx=ctx)
    warnings = list(block_result.get("warnings") or [])

    # Read result and check for unresolved placeholders
    from app.renderers.text_renderer import _read_docx_text
    doc_text = _read_docx_text(preview_path)

    # Check all known template placeholders — skip PRESERVED ones
    unresolved = []
    for ph in all_template_placeholders():
        if ph in doc_text and should_report_as_leftover(ph):
            unresolved.append(ph)

    return KvcExportPreviewResponse(
        ok=True,
        message="Xuất DOCX thành công",
        preview_path=str(preview_path),
        domain_code=domain_code,
        block_placeholders_injected=[
            "khu_vuc_su_dung_nhac" if block_result.get("kvc_usage_block_inserted") else None,
            "tien_ban_quyen" if block_result.get("kvc_pricing_block_inserted") else None,
        ],
        unresolved_placeholders=unresolved,
        warnings=warnings,
    )
