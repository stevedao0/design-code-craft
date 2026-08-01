"""Background DOCX export preview service for all non-Karaoke Background domains.

This service generates DOCX files for Background contracts using the unified
background_contract_renderer.

Supported domains:
- CAFE (Cà phê)
- NHA_HANG (Nhà hàng)
- CHAM_SOC_SUC_KHOE (Chăm sóc sức khỏe)
- KHU_VUI_CHOI (Khu vui chơi) - uses Background templates
- PHONG_THU_AM (Phòng thu âm)
- SCTT (Sao chép)
- And other Background domains

Key behaviors:
1. Uses the unified background_contract_renderer for all domains
2. Validates output DOCX after rendering
3. Reports clear errors if validation fails
4. Never returns corrupted files to users
5. Uses sentinel to preserve {{khu_vuc_su_dung_nhac}} for table insertion
"""
from __future__ import annotations

import logging
import shutil
import tempfile
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.business_domains import resolve_domain_code, get_domain_config
from app.models.contracts import ContractRecordRow
from app.renderers.background_contract_renderer import render_background_contract
from app.renderers.text_renderer import extract_placeholders_from_template
from app.schemas.export_preview import ExportPreviewResponse
from app.services.export_resolver import resolve_contract_export_plan
from app.services.placeholder_registry import get_sentinel_for_key

logger = logging.getLogger("uvicorn.error")

# Background domains that use Background templates
BACKGROUND_DOMAINS = {
    "CAFE", "NHA_HANG", "CHAM_SOC_SUC_KHOE", "KHU_VUI_CHOI",
    "PHONG_THU_AM", "KHACH_SAN", "BAR", "VAN_PHONG", "CUA_HANG",
    "RAP_CHIEU", "PHONG_TRA", "SCTT", "BD",
}


def _build_basic_context(row: ContractRecordRow, executor_user=None) -> dict:
    """Build basic text context from contract record row.

    Args:
        row: ContractRecordRow instance.
        executor_user: Optional UserRow for filling executor fields.
    """
    from app.services.background_domain_display import get_background_domain_display_name
    from app.services.certificate_context import _resolve_effective_dates

    ctx: dict = {}

    ctx["so_hop_dong"] = str(row.contract_no or "")
    # FIX: Use proper display name instead of raw code
    ctx["linh_vuc"] = get_background_domain_display_name(row.linh_vuc)

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
    ctx["dia_chi_kinh_doanh"] = str(row.dia_chi_su_dung or "")
    ctx["so_dien_thoai"] = str(row.don_vi_dien_thoai or "")
    ctx["email"] = str(row.don_vi_email or "")

    ctx["nguoi_dai_dien"] = str(row.don_vi_nguoi_dai_dien or "")
    ctx["chuc_vu"] = str(row.don_vi_chuc_vu or "")

    # khu_vuc for address display
    ctx["khu_vuc"] = str(row.usage_full_address or row.dia_chi_su_dung or "").strip()

    # Người thực hiện - auto-fill from current logged-in user
    if executor_user:
        ctx["nguoi_thuc_hien"] = str(executor_user.display_name or executor_user.username or "")
    else:
        ctx["nguoi_thuc_hien"] = ""

    # CRITICAL: Use sentinel for khu_vuc_su_dung_nhac (auto-rendered table).
    # This prevents docxtpl from removing the placeholder, allowing the renderer
    # to find the anchor and insert the music usage areas table.
    ctx["khu_vuc_su_dung_nhac"] = get_sentinel_for_key("khu_vuc_su_dung_nhac")
    # {{tien_ban_quyen}} is PRESERVED — no sentinel, leave as-is for manual fill.

    return ctx


def _build_render_context(row: ContractRecordRow) -> dict:
    """Build render context for block insertion from contract row.

    This function extracts all relevant data for the music usage areas table:
    1. music_usage_areas: Structured list from new contracts (Phase 2)
    2. BANG_HIEU: Brand name for fallback
    3. background_area_m2: Area in m2 for fallback
    4. tong_dien_tich: Alternative area field for fallback
    5. business_name: Another alias for brand name
    """
    render_ctx: dict = {}

    # Priority 1: music_usage_areas (Phase 2 - new contracts)
    music_usage_areas_data = row.get_music_usage_areas()
    render_ctx["music_usage_areas"] = music_usage_areas_data

    # Priority 2: Fallback data from contract fields
    # These are used by _build_music_usage_rows as fallback when music_usage_areas is empty
    render_ctx["BANG_HIEU"] = str(row.ten_bang_hieu or row.don_vi_ten or "")
    render_ctx["ten_bang_hieu"] = str(row.ten_bang_hieu or "")
    render_ctx["business_name"] = str(row.ten_bang_hieu or row.don_vi_ten or "")

    # Address fields for fallback
    render_ctx["dia_chi_su_dung"] = str(row.dia_chi_su_dung or "")
    render_ctx["usage_full_address"] = str(row.usage_full_address or "")

    # Area fields (may be empty for old contracts)
    # Note: If these are empty, the fallback will use address as the location
    render_ctx["background_area_m2"] = ""
    render_ctx["tong_dien_tich"] = ""

    logger.info(
        f"[BACKGROUND_EXPORT] contract_id={row.id}, "
        f"linh_vuc={row.linh_vuc}, "
        f"music_areas_count={len(music_usage_areas_data)}, "
        f"bang_hieu='{row.ten_bang_hieu or row.don_vi_ten}'"
    )

    return render_ctx


def render_background_docx_preview(
    db: Session,
    contract_id: int,
    *,
    output_dir: Path | None = None,
    template_code_override: str | None = None,
    executor_user=None,  # UserRow: current logged-in user for executor fields
) -> ExportPreviewResponse:
    """Render Background contract DOCX with music usage table.

    This function uses the contract_template_code from the contract row to determine
    which template to use. All Background domains share the same 2 templates.

    Args:
        db: Database session.
        contract_id: ID of the contract to render.
        output_dir: Optional output directory for preview files.
        template_code_override: Optional override for template_code (e.g., from query param).
        executor_user: Current logged-in user for filling executor fields in DOCX.

    Returns:
        ExportPreviewResponse with render status and metadata.

    Raises:
        ValueError: If contract not found or template not found.
    """
    from app.services.background_template_resolver import (
        get_template_path,
        get_template_filename,
        resolve_template_code,
        get_template_display_name,
    )

    row = db.query(ContractRecordRow).filter(ContractRecordRow.id == int(contract_id)).first()
    if not row:
        raise ValueError(f"Contract {contract_id} not found")

    # Resolve template_code: override > row.contract_template_code > default (TEMPLATE_1)
    template_code = template_code_override or row.contract_template_code
    template_code = resolve_template_code(template_code)

    # Get template path (raises FileNotFoundError if not exists)
    try:
        template_path = get_template_path(template_code)
    except FileNotFoundError as e:
        return ExportPreviewResponse(
            ok=False,
            preview_path="",
            file_size=0,
            domain="BACKGROUND",
            domain_label="Background",
            template_path=str(e),
            warnings=[f"Template not found: {e}"],
            message=f"Export failed: template not found",
        )

    # Resolve domain for display purposes only (not for template selection)
    domain_code, domain_config = resolve_domain_code(
        domain=row.linh_vuc,
        field_code=row.field_code,
        domain_group=row.domain_group,
        display=row.linh_vuc_hien_thi,
    )

    # Build contexts
    basic_ctx = _build_basic_context(row, executor_user=executor_user)
    render_ctx = _build_render_context(row)

    from app.renderers.background_contract_renderer import _resolve_money_values
    money_values = _resolve_money_values(row)
    render_ctx["money"] = money_values

    # Generate output filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    if output_dir is None:
        output_dir = Path("F:\\APPs\\storage\\preview")
    output_dir.mkdir(parents=True, exist_ok=True)

    safe_domain = domain_code.replace("_", "").lower()
    filename = f"PREVIEW_BACKGROUND_{safe_domain}_{contract_id}_{timestamp}.docx"
    output_path = output_dir / filename

    # Render DOCX using unified renderer
    result = render_background_contract(
        template_path=template_path,
        output_path=output_path,
        context=basic_ctx,
        render_ctx=render_ctx,
        money=money_values,
    )

    # Build response
    placeholders = extract_placeholders_from_template(template_path=template_path)

    if not result["ok"]:
        # Validation failed - DO NOT return corrupted file
        error_msg = "; ".join(result.get("warnings", []))
        logger.error(
            f"[BACKGROUND_EXPORT] Validation failed for contract {contract_id}: {error_msg}"
        )
        return ExportPreviewResponse(
            ok=False,
            preview_path=str(output_path),
            file_size=output_path.stat().st_size if output_path.exists() else 0,
            domain=domain_code,
            domain_label=domain_config.display_name if domain_config else domain_code,
            template_path=str(template_path),
            docx_path_attached=False,
            file_write_performed=True,
            db_write_performed=False,
            official_export=False,
            render_enabled=True,
            db_attach_enabled=False,
            placeholders_attempted=placeholders,
            placeholders_in_context=len(basic_ctx),
            pricing_blocks_inserted=False,
            warnings=[
                f"VALIDATION FAILED: {error_msg}",
                "File Word export bị lỗi cấu trúc, vui lòng kiểm tra renderer.",
                f"Debug copy: {result.get('docx_debug_copy', 'N/A')}" if result.get('docx_debug_copy') else "",
            ],
            message="Export failed: DOCX validation error. File not returned to user.",
        )

    # Success
    return ExportPreviewResponse(
        ok=True,
        preview_path=str(output_path),
        file_size=output_path.stat().st_size if output_path.exists() else 0,
        domain=domain_code,
        domain_label=domain_config.display_name if domain_config else domain_code,
        template_path=str(template_path),
        docx_path_attached=False,
        file_write_performed=True,
        db_write_performed=False,
        official_export=False,
        render_enabled=True,
        db_attach_enabled=False,
        placeholders_attempted=placeholders,
        placeholders_in_context=len(basic_ctx),
        pricing_blocks_inserted=result.get("music_table_inserted", False),
        warnings=result.get("warnings", []),
        message=f"Background preview generated: {filename}",
    )


def render_background_synthetic_preview(
    *,
    domain: str,
    output_dir: Path | None = None,
) -> ExportPreviewResponse:
    """Render a synthetic Background contract DOCX for testing.

    Args:
        domain: Domain code (e.g., "CAFE", "NHA_HANG").
        output_dir: Optional output directory.

    Returns:
        ExportPreviewResponse with synthetic data.
    """
    from app.services.placeholder_registry import get_template_for_domain

    # Resolve domain config
    domain_code, domain_config = resolve_domain_code(domain=domain)
    if not domain_config or not domain_config.template_filename:
        raise ValueError(f"No template configured for domain: {domain}")

    # Get template path
    template_root = Path("F:\\APPs\\templates")
    template_path = template_root / "Background" / domain_config.template_filename
    if not template_path.exists():
        raise ValueError(f"Template file not found: {template_path}")

    # Build synthetic context
    synthetic_ctx = {
        "so_hop_dong": f"{domain_code}-SAMPLE-001",
        "linh_vuc": domain_config.display_name,
        "ngay_ky_hop_dong": "15",
        "thang_ky_hop_dong": "5",
        "nam_ky_hop_dong": "2026",
        "TEN_DON_VI": f"Test {domain_config.display_name} Business",
        "BANG_HIEU": "TestBrand",
        "TEN_BANG_HIEU": "TestBrand",
        "ma_so_thue": "0123456789",
        "dia_chi": "123 Test Street, Ward 1, District 1, HCMC",
        "dia_chi_kinh_doanh": "123 Test Street, Ward 1, District 1, HCMC",
        "so_dien_thoai": "028-1234-5678",
        "email": "test@example.com",
        "nguoi_dai_dien": "Test Manager",
        "chuc_vu": "Director",
        "khu_vuc": "123 Test Street, Ward 1, District 1, HCMC",
        # Synthetic music usage areas for testing
        "music_usage_areas": [
            {
                "area_name": "Khu vực A",
                "scale_description": "123 chỗ",
                "music_usage_type": "Phát nhạc nền",
            },
            {
                "area_name": "Khu vực B",
                "scale_description": "456 m²",
                "music_usage_type": "Sử dụng nhạc qua đầu Karaoke",
            },
        ],
    }

    # Generate output filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    if output_dir is None:
        output_dir = Path("F:\\APPs\\storage\\preview")
    output_dir.mkdir(parents=True, exist_ok=True)

    safe_domain = domain_code.replace("_", "").lower()
    filename = f"PREVIEW_BACKGROUND_{safe_domain}_SYNTHETIC_{timestamp}.docx"
    output_path = output_dir / filename

    # Render
    result = render_background_contract(
        template_path=template_path,
        output_path=output_path,
        context=synthetic_ctx,
        render_ctx=synthetic_ctx,
    )

    if not result["ok"]:
        error_msg = "; ".join(result.get("warnings", []))
        return ExportPreviewResponse(
            ok=False,
            preview_path=str(output_path),
            file_size=output_path.stat().st_size if output_path.exists() else 0,
            domain=domain_code,
            domain_label=domain_config.display_name,
            template_path=str(template_path),
            warnings=[
                f"VALIDATION FAILED: {error_msg}",
                "File Word export bị lỗi cấu trúc, vui lòng kiểm tra renderer.",
            ],
            message="Synthetic preview failed: DOCX validation error.",
        )

    return ExportPreviewResponse(
        ok=True,
        preview_path=str(output_path),
        file_size=output_path.stat().st_size if output_path.exists() else 0,
        domain=domain_code,
        domain_label=domain_config.display_name,
        template_path=str(template_path),
        placeholders_attempted=extract_placeholders_from_template(template_path=template_path),
        placeholders_in_context=len(synthetic_ctx),
        pricing_blocks_inserted=result.get("music_table_inserted", False),
        warnings=result.get("warnings", []) + ["SYNTHETIC PREVIEW - not from real contract"],
        message=f"Synthetic preview generated: {filename}",
    )
