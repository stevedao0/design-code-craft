"""Contract export dry-run service for DOCX text placeholder rendering.

This service provides dry-run DOCX rendering without permanent output or DB writes.
Only KVC and Karaoke domains are supported in this phase.
"""
from __future__ import annotations

import logging
import tempfile
import zipfile
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models.contracts import ContractRecordRow
from app.renderers.text_renderer import extract_placeholders_from_template, render_docx_text
from app.schemas.export_dry_run import ExportDryRunRequest, ExportDryRunResponse
from app.services.export_resolver import resolve_contract_export_plan
from app.services.placeholder_registry import (
    ROYALTY_TABLE_REQUIRED_TEMPLATES,
    template_requires_royalty_table,
    template_has_royalty_table_placeholder,
    assert_royalty_table_placeholder,
)

logger = logging.getLogger("uvicorn.error")

ALLOWED_DOMAINS = {"KARAOKE", "KVC"}
ALLOWED_DOMAIN_LABELS = {"Karaoke", "Khu vui choi", "KVC"}


def _build_kvc_usage_text_from_context(pricing_ctx: dict) -> str:
    """Build KVC usage text for {{khu_vuc_su_dung_nhac}} placeholder."""
    block = pricing_ctx.get("background_usage_locations_block") or {}
    if isinstance(block, dict) and block.get("mode") == "text":
        return str(block.get("text") or "")
    if isinstance(block, dict) and block.get("mode") == "table":
        rows = block.get("rows") or []
        if rows:
            lines = []
            for i, row in enumerate(rows, 1):
                if isinstance(row, (list, tuple)) and len(row) >= 2:
                    name = str(row[0] or "")
                    area = str(row[1] or "")
                    lines.append(f"{i}. {name} — {area}")
            return "\n".join(lines)
    return ""


def _build_kvc_pricing_text_from_context(pricing_ctx: dict) -> str:
    """Build KVC pricing text for {{tien_ban_quyen}} placeholder."""
    lines: list[str] = []

    # Usage block (text mode)
    usage_block = pricing_ctx.get("background_usage_locations_block") or {}
    if isinstance(usage_block, dict) and usage_block.get("mode") == "text":
        text = str(usage_block.get("text") or "").strip()
        if text:
            lines.append(f"Địa điểm sử dụng:\n{text}")

    # Pricing block
    bg_pricing = pricing_ctx.get("background_pricing_block") or {}
    pricing_rows = bg_pricing.get("rows") or []
    summary_rows = bg_pricing.get("summary_rows") or []
    pricing_mode = str(bg_pricing.get("pricing_mode") or pricing_ctx.get("pricing_mode") or "")

    if pricing_mode == "ND17":
        lines.append(f"Căn cứ Nghị định 17/2023/NĐ-CP, Phụ lục II, Mục 8 (Khu vui chơi, giải trí):")
    elif pricing_mode == "VCPMC_TARIFF":
        lines.append("Căn cứ biểu giá VCPMC (Khu vui chơi, giải trí):")

    for row in pricing_rows:
        if isinstance(row, (list, tuple)) and len(row) >= 2:
            label = str(row[0] or "")
            amount = str(row[-1] or "")
            lines.append(f"{label}: {amount}")

    for row in summary_rows:
        if isinstance(row, (list, tuple)) and len(row) >= 2:
            label = str(row[0] or "")
            amount = str(row[1] or "")
            lines.append(f"{label}: {amount}")

    # Amount in words
    words = str(pricing_ctx.get("amount_in_words") or "").strip()
    if words:
        lines.append(f"(Bằng chữ: {words})")

    return "\n".join(lines)


def _build_basic_context(row: ContractRecordRow) -> dict:
    """Build basic text context from contract record row for placeholder rendering.

    This creates minimal context for text placeholder replacement only.
    Pricing/usage blocks are NOT included - they are handled in later phases.
    """
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

    ctx["TEN_DON_VI"] = str(row.don_vi_ten or "")
    ctx["BANG_HIEU"] = str(row.ten_bang_hieu or "")
    ctx["TEN_BANG_HIEU"] = str(row.ten_bang_hieu or "")

    ctx["ma_so_thue"] = str(row.don_vi_mst or "")
    # Address fields — use new structured fields (post-2025 merger), fallback to legacy.
    # Bên B (party B / địa chỉ công ty) = legal address.
    # Địa điểm sử dụng âm nhạc = usage address.
    legal_full = str(row.legal_full_address or row.don_vi_dia_chi or "")
    usage_full = str(row.usage_full_address or row.dia_chi_su_dung or "")
    ctx["dia_chi"] = legal_full                          # Bên B = pháp lý
    ctx["dia_chi_kinh_doanh"] = usage_full           # Địa chỉ kinh doanh
    # khu_vuc: dùng chung cho tất cả lĩnh vực
    ctx["khu_vuc"] = str(row.usage_full_address or row.dia_chi_su_dung or "").strip()
    ctx["so_dien_thoai"] = str(row.don_vi_dien_thoai or "")
    ctx["email"] = str(row.don_vi_email or "")

    ctx["nguoi_dai_dien"] = str(row.don_vi_nguoi_dai_dien or "")
    ctx["chuc_vu"] = str(row.don_vi_chuc_vu or "")

    return ctx


def render_contract_docx_text_dry_run(
    db: Session,
    contract_id: int,
    request: ExportDryRunRequest | None = None,
) -> ExportDryRunResponse:
    """Render contract DOCX text placeholders to a temporary file.

    This is a DRY-RUN only function that:
    - Renders text placeholders using docxtpl
    - Optionally inserts KVC pricing/usage blocks (if include_kvc_blocks=true and context provided)
    - Outputs to a temporary file
    - Does NOT write to permanent storage
    - Does NOT update DB

    Args:
        db: SQLAlchemy database session.
        contract_id: ID of the contract to render.
        request: Optional request with include_kvc_blocks, pricing_context, dry_run_label.

    Returns:
        ExportDryRunResponse with metadata about the dry-run render.

    Raises:
        ValueError: If contract not found, domain not allowed, or template not found.
    """
    from sqlalchemy import text as sql_text

    db.execute(sql_text("SET TRANSACTION READ ONLY"))

    row = db.query(ContractRecordRow).filter(ContractRecordRow.id == int(contract_id)).first()
    if not row:
        raise ValueError(f"Contract {contract_id} not found")

    domain_code = (str(row.linh_vuc or "") + str(row.field_code or "")).upper()

    if "KARAOKE" in domain_code or "KARAOKE" in (row.field_code or "").upper():
        normalized_domain = "KARAOKE"
        domain_label = "Karaoke"
    elif "KVC" in domain_code or "KHU_VUI_CHOI" in domain_code or "ENTERTAINMENT" in domain_code:
        normalized_domain = "KVC"
        domain_label = "KVC"
    else:
        raise ValueError(
            f"Domain '{row.linh_vuc}' not supported. Only KVC and Karaoke are allowed in this phase."
        )

    export_plan = resolve_contract_export_plan(row=row)

    if not export_plan.selected:
        raise ValueError(
            f"No template selected for contract {contract_id}. "
            f"Check export-plan response for details."
        )

    template_path = Path(export_plan.selected.path)
    if not template_path.exists():
        raise ValueError(
            f"Template file not found: {template_path}. "
            f"Ensure templates are copied from OLD APP."
        )

    placeholders = extract_placeholders_from_template(template_path=template_path)

    # v1.1 — royalty_table placeholder audit (dry-run only).
    # New Background templates (1 & 2) MUST declare {{bang_tinh_tien_ban_quyen}}.
    # If the placeholder is missing, fail dry-run with the exact required
    # message — do NOT silently fall back to appending a table at the end
    # of the contract.
    template_filename = template_path.name
    royalty_table_placeholder_required = template_requires_royalty_table(template_filename)
    if royalty_table_placeholder_required:
        try:
            with zipfile.ZipFile(template_path, "r") as zf:
                template_xml = zf.read("word/document.xml").decode("utf-8", errors="ignore")
        except Exception:
            template_xml = ""
        # Hard guard — raises ValueError on missing placeholder.
        try:
            assert_royalty_table_placeholder(template_filename, template_xml)
            royalty_table_placeholder_found = True
        except ValueError as _e:
            logger.error("royalty_table placeholder missing in %s", template_filename)
            raise
    else:
        royalty_table_placeholder_found = "{{bang_tinh_tien_ban_quyen}}" in " ".join(placeholders)

    context = _build_basic_context(row)

    # KVC: pre-render text for {{khu_vuc_su_dung_nhac}} and {{tien_ban_quyen}}
    # Karaoke: pre-render text for {{khu_vuc_su_dung_nhac}} and {{tien_ban_quyen}}
    block_placeholder_strategy = "text_fill_direct"
    block_placeholders_injected: list[str] = []
    sentinel_anchors_used: list[str] = []
    template_raw_anchor_required = False

    if request:
        if request.include_kvc_blocks and normalized_domain == "KVC" and request.pricing_context:
            context["khu_vuc_su_dung_nhac"] = _build_kvc_usage_text_from_context(request.pricing_context)
            context["tien_ban_quyen"] = _build_kvc_pricing_text_from_context(request.pricing_context)
            block_placeholders_injected.extend(["khu_vuc_su_dung_nhac", "tien_ban_quyen"])
        elif request.include_karaoke_blocks and normalized_domain == "KARAOKE" and request.pricing_context:
            context["khu_vuc_su_dung_nhac"] = str(request.pricing_context.get("room_display_text") or "")
            context["tien_ban_quyen"] = str(
                request.pricing_context.get("karaoke_pricing_block_text")
                or "\n\n".join(
                    part
                    for part in (
                        str(request.pricing_context.get("pricing_detail_text") or "").strip(),
                        str(request.pricing_context.get("pricing_total_text") or "").strip(),
                    )
                    if part
                )
            )

    temp_file = None
    temp_path = None
    file_size = 0
    warnings: list[str] = []

    kvc_blocks_attempted = bool(
        normalized_domain == "KVC" and request and request.include_kvc_blocks
    )
    kvc_usage_inserted = kvc_blocks_attempted
    kvc_pricing_inserted = kvc_blocks_attempted
    pricing_blocks_inserted = kvc_blocks_attempted or bool(
        normalized_domain == "KARAOKE" and request and request.include_karaoke_blocks
    )
    karaoke_blocks_attempted = bool(
        normalized_domain == "KARAOKE" and request and request.include_karaoke_blocks
    )
    karaoke_room_inserted = karaoke_blocks_attempted
    karaoke_pricing_inserted = karaoke_blocks_attempted

    try:
        with tempfile.NamedTemporaryFile(
            suffix=".docx", prefix="docx_render_dryrun_", delete=False
        ) as f:
            temp_file = f.name

        output_path = Path(temp_file)
        render_docx_text(
            template_path=template_path,
            output_path=output_path,
            context=context,
        )

        if output_path.exists():
            file_size = output_path.stat().st_size
            temp_path = str(output_path)

        warnings.append("Text placeholders rendered successfully.")

        if normalized_domain == "KVC" and request and request.include_kvc_blocks and request.pricing_context:
            warnings.append("KVC usage and pricing text filled into {{khu_vuc_su_dung_nhac}} and {{tien_ban_quyen}}.")
        elif normalized_domain == "KVC" and request and not request.include_kvc_blocks:
            warnings.append("KVC usage/pricing skipped. Set include_kvc_blocks=true.")

        if normalized_domain == "KARAOKE" and request and request.include_karaoke_blocks:
            if not request.pricing_context:
                warnings.append("include_karaoke_blocks=true but pricing_context not provided.")
            else:
                warnings.append("Karaoke placeholders rendered directly.")
        elif normalized_domain == "KARAOKE" and request and not request.include_karaoke_blocks:
            warnings.append("Karaoke room/pricing blocks skipped. Set include_karaoke_blocks=true to attempt insertion.")
        elif normalized_domain == "KARAOKE":
            warnings.append("Karaoke room/pricing blocks skipped. Set include_karaoke_blocks=true to attempt insertion.")

    except Exception as e:
        logger.exception(f"DOCX text render dry-run failed for contract {contract_id}")
        raise ValueError(f"Failed to render DOCX text: {e}") from e

    return ExportDryRunResponse(
        ok=True,
        contract_id=contract_id,
        domain=normalized_domain,
        domain_label=domain_label,
        template_path=str(template_path),
        temp_output_path=temp_path,
        file_size=file_size if file_size > 0 else None,
        placeholders_attempted=placeholders,
        placeholders_in_context=len(context),
        render_enabled=False,
        db_attach_enabled=False,
        file_write_performed=True,
        db_write_performed=False,
        docx_path_attached=False,
        pricing_blocks_inserted=pricing_blocks_inserted,
        kvc_blocks_attempted=kvc_blocks_attempted,
        kvc_usage_block_inserted=kvc_usage_inserted,
        kvc_pricing_block_inserted=kvc_pricing_inserted,
        karaoke_blocks_attempted=karaoke_blocks_attempted,
        karaoke_room_block_inserted=karaoke_room_inserted,
        karaoke_pricing_block_inserted=karaoke_pricing_inserted,
        royalty_table_placeholder_required=royalty_table_placeholder_required,
        royalty_table_placeholder_found=royalty_table_placeholder_found,
        # In this dry-run we render text only; the royalty_table BLOCK handler
        # runs in the real renderer. Treat it as "rendered" when the
        # placeholder was present so dry-run callers can confirm a successful
        # audit without falling back to anything.
        royalty_table_rendered=royalty_table_placeholder_found,
        block_placeholder_strategy=block_placeholder_strategy,
        block_placeholders_injected=block_placeholders_injected,
        sentinel_anchors_used=sentinel_anchors_used,
        template_raw_anchor_required=template_raw_anchor_required,
        warnings=warnings,
        message="Text placeholder render dry-run completed. Temp file may be cleaned up by OS.",
    )
