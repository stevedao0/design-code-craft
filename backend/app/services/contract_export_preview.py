"""Contract export preview service for generating preview DOCX files.

This service provides preview DOCX rendering for manual human inspection.
Only KVC and Karaoke domains are supported in this phase.
Preview files are written to F:\APPs\storage\preview\ for inspection.

Supports two template modes:
- Template 1 (export_template_contract_1.docx): Uses individual pricing table placeholders
- Template 2 (export_template_contract_2.docx): Uses preserved {{tien_ban_quyen}} placeholder

CRITICAL: This does NOT:
- Write to DB
- Attach docx_path
- Create official/permanent exports
- Create GCN
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.calculations.common.money import DEFAULT_BASE_SALARY_VND
from app.calculations.karaoke.calculator import (
    build_karaoke_calculation_context as build_karaoke_calculation_context_v2,
)
from app.models.contracts import ContractRecordRow
from app.calculations.karaoke.legacy_contract_text import (
    compute_contract_preview_karaoke_amounts as compute_karaoke_amounts,
    build_legacy_pricing_detail_text_from_canonical as build_pricing_detail_text,
    build_legacy_pricing_total_text_from_canonical as build_pricing_total_text,
)
from app.renderers.text_renderer import extract_placeholders_from_template, render_docx_text
from app.renderers.karaoke_renderer import (
    get_sentinel_for_key,
)
from app.schemas.export_preview import ExportPreviewRequest, ExportPreviewResponse
from app.services.export_resolver import resolve_contract_export_plan

logger = logging.getLogger("uvicorn.error")

ALLOWED_DOMAINS = {"KARAOKE", "KVC"}
PREVIEW_OUTPUT_DIR = Path(r"F:\APPs\storage\preview")


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None or value == "":
            return default
        return int(float(str(value).replace(",", "").strip()))
    except Exception:
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(str(value).replace(",", ".").strip())
    except Exception:
        return default


def _date_iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    text = str(value).strip()
    return text or None


def _load_contract_extra_fields(db: Session, contract_id: int, columns: list[str]) -> dict[str, Any]:
    """Load optional DB columns without forcing ORM model changes."""
    from sqlalchemy import text as sql_text

    available = {
        row[0]
        for row in db.execute(
            sql_text(
                """
                select column_name
                from information_schema.columns
                where table_name = 'contract_records'
                """
            )
        ).all()
    }
    selected = [col for col in columns if col in available]
    if not selected:
        return {}
    select_clause = ", ".join(selected)
    row = db.execute(
        sql_text(f"select {select_clause} from contract_records where id = :contract_id"),
        {"contract_id": int(contract_id)},
    ).mappings().first()
    return dict(row or {})


def _fallback_room_sections(*, total_count: int, karaoke_type: str) -> list[dict[str, Any]]:
    """Create a minimal room section when legacy rows have only totals."""
    total = max(0, int(total_count or 0))
    if total <= 0:
        return []
    prefix = "B" if karaoke_type == "BOX" else "P"
    return [
        {
            "key": "LAU_1",
            "label": "Lau 1",
            "room_count": total,
            "room_names": [f"{prefix}{idx}" for idx in range(1, total + 1)],
            "room_names_text": ", ".join(f"{prefix}{idx}" for idx in range(1, total + 1)),
        }
    ]


def _build_karaoke_preview_context_from_row(
    *,
    db: Session,
    row: ContractRecordRow,
) -> dict[str, Any]:
    """Build Karaoke block context from the contract row for preview-only export.

    This restores the old-app style behavior for real contract preview calls that
    do not send a client pricing_context. It is read-only and only feeds DOCX
    block insertion after docxtpl text rendering.
    """
    extra = _load_contract_extra_fields(
        db,
        int(row.id),
        [
            "karaoke_room_details_json",
            "room_display_text",
            "muc_luong_co_so",
            "nhom_dien_tich_ap_dung",
            "so_tien_bang_chu",
        ],
    )

    karaoke_type = str(row.loai_hinh_karaoke or "PHONG").strip().upper() or "PHONG"
    if karaoke_type not in {"PHONG", "BOX"}:
        karaoke_type = "BOX" if "BOX" in karaoke_type else "PHONG"

    total_rooms = _safe_int(row.tong_so_phong, 0)
    total_box = _safe_int(row.tong_so_box, 0)
    active_count = total_box if karaoke_type == "BOX" else total_rooms

    room_sections: list[dict[str, Any]] = []
    raw_room_json = extra.get("karaoke_room_details_json") or row.karaoke_room_details_json
    if raw_room_json:
        try:
            parsed = json.loads(str(raw_room_json))
            if isinstance(parsed, list):
                room_sections = [item for item in parsed if isinstance(item, dict)]
        except Exception:
            logger.warning("Karaoke preview: could not parse karaoke_room_details_json for contract %s", row.id)
    if not room_sections:
        room_sections = _fallback_room_sections(total_count=active_count, karaoke_type=karaoke_type)

    area_group = str(extra.get("nhom_dien_tich_ap_dung") or "").strip().upper()
    if not area_group:
        # Legacy Karaoke rows often do not store the area group. The 12:23
        # reference preview used the old-app ND17 >30m2 coefficients.
        area_group = "BOX" if karaoke_type == "BOX" else "TREN_30"

    muc_luong_co_so = _safe_int(extra.get("muc_luong_co_so"), DEFAULT_BASE_SALARY_VND)
    gtgt_percent = 8.0

    context = build_karaoke_calculation_context_v2(
        karaoke_type=karaoke_type,
        area_group=area_group,
        tong_so_phong=total_rooms,
        tong_so_box=total_box,
        muc_luong_co_so=muc_luong_co_so,
        ty_le_ho_tro=0.0,
        ty_le_ho_tro_bac_1=0.0,
        ty_le_ho_tro_bac_2=0.0,
        ty_le_ho_tro_bac_3=0.0,
        gtgt_percent=gtgt_percent,
        start_date=_date_iso(row.ngay_bat_dau),
        end_date=_date_iso(row.ngay_ket_thuc),
        room_sections=room_sections,
        pricing_render_mode="TABLE",
        effective_term_months_override=12,
    )

    docx_context = dict(context.get("docx_context_preview") or {})
    docx_context.update(
        {
            "loai_hinh_karaoke": karaoke_type,
            "tong_so_phong": total_rooms,
            "tong_so_box": total_box,
            "contract_term_months": 12,
            "dia_chi_kinh_doanh": str(row.dia_chi_su_dung or "").strip(),
            "business_address": str(row.dia_chi_su_dung or "").strip(),
            "muc_luong_co_so": f"{muc_luong_co_so:,}",
            "so_tien_bang_chu": str(extra.get("so_tien_bang_chu") or "").strip(),
            "karaoke_pricing_render_mode": "TABLE",
            "karaoke_pricing_footer_note": (
                f"Mức lương cơ sở {muc_luong_co_so:,}đ có thời hạn bắt đầu từ ngày 1/7/2026 "
                "áp dụng khoản 2 Điều 3 Nghị định 161/2026/NĐ-CP ngày 15/5/2026"
            ),
        }
    )
    return docx_context


def _build_basic_context(row: ContractRecordRow | None = None, synthetic_data: dict | None = None) -> dict:
    """Build basic text context for placeholder rendering.

    Args:
        row: Contract record row (optional for synthetic preview)
        synthetic_data: Synthetic data dict for preview (optional)

    Returns:
        Context dictionary for docxtpl rendering.
    """
    ctx: dict = {}

    def _title_case(s):
        if not s:
            return s
        if s.isupper() or s.islower():
            return s.title()
        return s

    if row:
        from app.services.background_domain_display import get_background_domain_display_name

        ctx["so_hop_dong"] = str(row.contract_no or "")
        # FIX: Use proper display name for all domains via centralized helper
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
    elif synthetic_data:
        ctx.update(synthetic_data)

    return ctx


def render_contract_docx_preview(
    db: Session,
    contract_id: int | None = None,
    request: ExportPreviewRequest | None = None,
) -> ExportPreviewResponse:
    """Render contract DOCX to a preview file in storage\preview.

    This generates a preview file for manual human inspection.
    The file is written to F:\APPs\storage\preview\ and is NOT an official export.

    Args:
        db: SQLAlchemy database session.
        contract_id: ID of the contract to render (optional for synthetic).
        request: Optional request with include_blocks, pricing_context.

    Returns:
        ExportPreviewResponse with metadata about the preview.

    Raises:
        ValueError: If contract not found, domain not allowed, or template not found.
    """
    from sqlalchemy import text as sql_text

    db.execute(sql_text("SET TRANSACTION READ ONLY"))

    row: ContractRecordRow | None = None
    domain_code = ""
    normalized_domain = ""
    domain_label = ""
    is_synthetic = request.synthetic_preview if request else False

    if contract_id and not is_synthetic:
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
                f"Domain '{row.linh_vuc}' not supported. Only KVC and Karaoke are allowed."
            )

        export_plan = resolve_contract_export_plan(row=row)
        if not export_plan.selected:
            raise ValueError(f"No template selected for contract {contract_id}.")
        template_path = Path(export_plan.selected.path)
    else:
        # Synthetic preview - determine domain from request
        if request and request.pricing_context:
            domain = request.pricing_context.get("domain", "KVC")
            if domain.upper() == "KARAOKE":
                normalized_domain = "KARAOKE"
                domain_label = "Karaoke"
            else:
                normalized_domain = "KVC"
                domain_label = "KVC"
        else:
            normalized_domain = "KVC"
            domain_label = "KVC"

        # Use correct template for synthetic preview based on domain
        if normalized_domain == "KARAOKE":
            template_path = Path(r"F:\APPs\templates\Karaoke\export_template_contract_KA.docx")
        else:
            template_path = Path(r"F:\APPs\templates\KVC\export_template_contract_KVC.docx")

        if not template_path.exists():
            raise ValueError(f"Template file not found: {template_path}")

        is_synthetic = True

    if not template_path.exists():
        raise ValueError(f"Template file not found: {template_path}")

    placeholders = extract_placeholders_from_template(template_path=template_path)
    context = _build_basic_context(row=row)

    # Build synthetic context if needed
    if is_synthetic:
        synthetic_data = _build_synthetic_kvc_context() if normalized_domain == "KVC" else _build_synthetic_karaoke_context()
        logger.warning(f"Preview: synthetic_data keys={list(synthetic_data.keys())}")
        context.update(synthetic_data)

    # Block injection: KVC and Karaoke both use text fill into {{khu_vuc_su_dung_nhac}} / {{tien_ban_quyen}}
    block_placeholder_strategy = "text_fill_direct"
    block_placeholders_injected: list[str] = []
    sentinel_anchors_used: list[str] = []
    template_raw_anchor_required = False

    include_blocks = request.include_blocks if request else True

    karaoke_block_context: dict[str, Any] | None = None

    if include_blocks and normalized_domain == "KARAOKE":
        # NOTE: The tier table placeholder approach has been removed.
        # We use the simple {{khu_vuc_su_dung_nhac}} and {{tien_ban_quyen}} text approach.
        if request and request.pricing_context:
            karaoke_block_context = request.pricing_context
        elif row is not None:
            # Use simple text approach for ALL Karaoke templates (including former "template 1").
            # This uses {{khu_vuc_su_dung_nhac}} and {{tien_ban_quyen}} text fill.
            # The tier table placeholder approach has been removed.
            karaoke_block_context = _build_karaoke_preview_context_from_row(db=db, row=row)

    if include_blocks and normalized_domain == "KVC" and request and request.pricing_context:
        pricing_ctx = request.pricing_context
        context["khu_vuc_su_dung_nhac"] = _build_kvc_usage_text_from_context(pricing_ctx)
        context["tien_ban_quyen"] = _build_kvc_pricing_text_from_context(pricing_ctx)
        block_placeholders_injected.extend(["khu_vuc_su_dung_nhac", "tien_ban_quyen"])
    if include_blocks and normalized_domain == "KARAOKE" and karaoke_block_context:
        # Simple text approach: fill {{khu_vuc_su_dung_nhac}} and {{tien_ban_quyen}}
        # This replaces the old "template 1" tier table placeholder approach.
        context["khu_vuc_su_dung_nhac"] = str(karaoke_block_context.get("room_display_text") or "")
        context["tien_ban_quyen"] = str(
            karaoke_block_context.get("karaoke_pricing_block_text")
            or "\n\n".join(
                part
                for part in (
                    str(karaoke_block_context.get("pricing_detail_text") or "").strip(),
                    str(karaoke_block_context.get("pricing_total_text") or "").strip(),
                )
                if part
            )
        )

    # Generate preview filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dry_run_label = str(request.dry_run_label or "") if request else ""
    if is_synthetic:
        filename = f"PREVIEW_{normalized_domain}_SYNTHETIC_{timestamp}.docx"
    elif normalized_domain == "KARAOKE" and "fix02" in dry_run_label.lower():
        filename = f"PREVIEW_KARAOKE_FIX02_{timestamp}.docx"
    elif normalized_domain == "KARAOKE":
        filename = f"PREVIEW_KARAOKE_{contract_id}_{timestamp}.docx"
    else:
        filename = f"PREVIEW_KVC_{contract_id}_{timestamp}.docx"

    output_path = PREVIEW_OUTPUT_DIR / filename
    warnings: list[str] = []

    kvc_blocks_attempted = bool(
        normalized_domain == "KVC" and include_blocks and request and request.pricing_context
    )
    kvc_usage_inserted = kvc_blocks_attempted
    kvc_pricing_inserted = kvc_blocks_attempted
    # Note: pricing_blocks_inserted was removed (dead variable - replaced by pricing_placeholders_filled)
    karaoke_blocks_attempted = bool(
        normalized_domain == "KARAOKE" and include_blocks and karaoke_block_context
    )

    khu_vuc_inserted = False
    pricing_placeholders_filled = False  # Kept for response schema compatibility

    try:
        # Ensure preview directory exists
        PREVIEW_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        render_docx_text(
            template_path=template_path,
            output_path=output_path,
            context=context,
        )

        warnings.append("Text placeholders rendered successfully.")

        if normalized_domain == "KVC" and kvc_blocks_attempted:
            warnings.append("KVC usage and pricing text filled into {{khu_vuc_su_dung_nhac}} and {{tien_ban_quyen}}.")
        elif normalized_domain == "KVC" and include_blocks and not (request and request.pricing_context):
            warnings.append("KVC usage/pricing skipped: no pricing_context provided.")

        elif normalized_domain == "KARAOKE":
            if karaoke_block_context:
                warnings.append("Karaoke placeholders rendered directly (simple text approach).")

        if is_synthetic:
            warnings.append("PREVIEW: This is a synthetic/sample preview. Not from real contract.")

        warnings.append(f"Preview file: {output_path}")
        warnings.append("Please open and inspect layout manually.")

    except Exception as e:
        logger.exception(f"DOCX preview render failed")
        raise ValueError(f"Failed to render DOCX preview: {e}") from e

    file_size = output_path.stat().st_size if output_path.exists() else 0

    return ExportPreviewResponse(
        ok=True,
        preview_path=str(output_path),
        file_size=file_size,
        domain=normalized_domain,
        domain_label=domain_label,
        template_path=str(template_path),
        placeholders_attempted=placeholders,
        placeholders_in_context=len(context),
        file_write_performed=True,
        db_write_performed=False,
        docx_path_attached=False,
        official_export=False,
        pricing_blocks_inserted=pricing_placeholders_filled,
        kvc_blocks_attempted=kvc_blocks_attempted,
        kvc_usage_block_inserted=kvc_usage_inserted,
        kvc_pricing_block_inserted=kvc_pricing_inserted,
        karaoke_blocks_attempted=karaoke_blocks_attempted,
        karaoke_room_block_inserted=khu_vuc_inserted,
        karaoke_pricing_block_inserted=pricing_placeholders_filled,
        block_placeholder_strategy=block_placeholder_strategy,
        block_placeholders_injected=block_placeholders_injected,
        sentinel_anchors_used=sentinel_anchors_used,
        template_raw_anchor_required=template_raw_anchor_required,
        synthetic_preview=is_synthetic,
        warnings=warnings,
        message=f"Preview generated at {output_path}. Please open and inspect layout.",
    )


def _build_synthetic_kvc_context() -> dict:
    """Build synthetic KVC context for preview."""
    ctx = {
        "so_hop_dong": "KVC-SAMPLE-001",
        "linh_vuc": "Khu vui choi (KVC)",
        "ngay_ky_hop_dong": "10",
        "thang_ky_hop_dong": "5",
        "nam_ky_hop_dong": "2026",
        "TEN_DON_VI": "CityGames Vietnam",
        "BANG_HIEU": "CityGames",
        "TEN_BANG_HIEU": "CityGames",
        "ma_so_thue": "0123456789",
        "dia_chi": "123 Nguyen Trai, Ward 4, District 1, HCMC",
        "so_dien_thoai": "028-1234-5678",
        "email": "contact@citygames.vn",
        "nguoi_dai_dien": "John Smith",
        "chuc_vu": "General Director",
    }
    # Pre-render KVC usage + pricing text into placeholders
    synthetic_pricing = get_synthetic_kvc_pricing_context()
    ctx["khu_vuc_su_dung_nhac"] = _build_kvc_usage_text_from_context(synthetic_pricing)
    ctx["tien_ban_quyen"] = _build_kvc_pricing_text_from_context(synthetic_pricing)
    return ctx


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

    usage_block = pricing_ctx.get("background_usage_locations_block") or {}
    if isinstance(usage_block, dict) and usage_block.get("mode") == "text":
        text = str(usage_block.get("text") or "").strip()
        if text:
            lines.append(f"Địa điểm sử dụng:\n{text}")
            lines.append("")

    bg_pricing = pricing_ctx.get("background_pricing_block") or {}
    pricing_rows = bg_pricing.get("rows") or []
    summary_rows = bg_pricing.get("summary_rows") or []
    pricing_mode = str(bg_pricing.get("pricing_mode") or pricing_ctx.get("pricing_mode") or "")

    if pricing_mode == "ND17":
        lines.append("Căn cứ Nghị định 17/2023/NĐ-CP, Phụ lục II, Mục 8 (Khu vui chơi, giải trí):")
    elif pricing_mode == "VCPMC_TARIFF":
        lines.append("Căn cứ biểu giá VCPMC (Khu vui chơi, giải trí):")
    else:
        lines.append("Căn cứ biểu giá VCPMC:")

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

    words = str(pricing_ctx.get("amount_in_words") or "").strip()
    if words:
        lines.append(f"(Bằng chữ: {words})")

    return "\n".join(lines)


def _build_synthetic_karaoke_context() -> dict:
    """Build synthetic Karaoke context for preview using real calculation.

    This mimics the app cũ logic:
    1. Call compute_karaoke_amounts with synthetic params
    2. Build room_display_text, pricing_detail_text, pricing_total_text
    3. Return context dict with all needed keys
    """
    # Synthetic params for Karaoke preview (matching ND17 with 26 rooms)
    muc_luong_co_so = 2_530_000
    tong_so_phong = 26
    tong_so_box = 0
    loai_hinh_karaoke = "PHONG"
    nhom_dien_tich = "DEN_20"  # TREN_20_DEN_30 for 26 rooms

    # Compute using ported karaoke_calc module
    calc = compute_karaoke_amounts(
        karaoke_type=loai_hinh_karaoke,
        area_group=nhom_dien_tich,
        total_rooms=tong_so_phong,
        total_box=tong_so_box,
        base_salary=muc_luong_co_so,
        support_percent=0.0,
        vat_percent=8.0,
        row_support_bac_1=0.0,
        row_support_bac_2=0.0,
        row_support_bac_3=0.0,
        effective_term_months=12,
    )

    # Build pricing texts using ported functions
    pricing_detail_text = build_pricing_detail_text(calc, base_salary=muc_luong_co_so)
    pricing_total_text = build_pricing_total_text(
        calc,
        support_percent=0.0,
        vat_percent=8.0,
        support_year=None,
        effective_term_months=12,
    )

    # Build room display (empty for synthetic)
    room_display_text = ""

    return {
        "so_hop_dong": "KARAOKE-SAMPLE-001",
        "linh_vuc": "Karaoke",
        "ngay_ky_hop_dong": "10",
        "thang_ky_hop_dong": "5",
        "nam_ky_hop_dong": "2026",
        "TEN_DON_VI": "Singing Stars Karaoke",
        "BANG_HIEU": "Singing Stars",
        "TEN_BANG_HIEU": "Singing Stars",
        "ma_so_thue": "9876543210",
        "dia_chi": "456 Le Loi, Ward 3, District 3, HCMC",
        "so_dien_thoai": "028-9876-5432",
        "email": "info@singingstars.vn",
        "nguoi_dai_dien": "Jane Doe",
        "chuc_vu": "Owner",
        # Karaoke pricing fields
        "loai_hinh_karaoke": loai_hinh_karaoke,
        "tong_so_phong": tong_so_phong,
        "tong_so_box": tong_so_box,
        "muc_luong_co_so": f"{muc_luong_co_so:,}".replace(",", "."),
        "contract_term_months": 12,
        "room_display_text": room_display_text,
        "pricing_detail_text": pricing_detail_text,
        "pricing_total_text": pricing_total_text,
        "so_tien_bang_chu": calc.get("so_tien_bang_chu", ""),
        "karaoke_pricing_render_mode": "TABLE",
        "karaoke_pricing_footer_note": (
            f"Mức lương cơ sở {muc_luong_co_so}đ có thời hạn bắt đầu từ ngày 1/7/2026 "
            f"áp dụng khoản 2 Điều 3 Nghị định 161/2026/NĐ-CP ngày 15/5/2026"
        ),
    }


def get_synthetic_kvc_pricing_context() -> dict:
    """Get synthetic KVC pricing context for CityGames sample.

    Based on user-provided numbers:
    - 855m2 => 7,400,000
    - 701m2 => 6,200,000
    - 920m2 => 7,800,000
    - subtotal = 21,400,000
    - GTGT 8% = 1,712,000
    - total = 23,112,000
    """
    return {
        "pricing_mode": "VCPMC_TARIFF",
        "usage_display_mode": "table",
        "pricing_total_text": "23,112,000 VND",
        "amount_in_words": "Twenty-three million one hundred twelve thousand VND",
        # background_pricing_block is a dict with rows and summary_rows as expected by kvc_renderer
        "background_pricing_block": {
            "pricing_mode": "VCPMC_TARIFF",
            "rows": [
                ("Area A", "855m²", "8,655/m²", "7,400,000"),
                ("Area B", "701m²", "8,843/m²", "6,200,000"),
                ("Area C", "920m²", "8,478/m²", "7,800,000"),
            ],
            "summary_rows": [
                ("Thành tiền", "21,400,000"),
                ("GTGT 8%", "1,712,000"),
                ("Tổng cộng", "23,112,000"),
            ],
        },
        "subtotal_before_gtgt": "21,400,000",
        "gtgt_amount": "1,712,000",
        "gtgt_percent": "8",
        "total_amount": "23,112,000",
    }


def get_synthetic_karaoke_nd17_pricing_context() -> dict:
    """Get synthetic Karaoke ND17 pricing context using real calculation.

    Uses the same logic as app cũ:
    - 4 phòng đầu: coefficient 1.6
    - 6 phòng sau: coefficient 1.28
    - 16 phòng sau: coefficient 1.12
    """
    muc_luong_co_so = 2_530_000
    tong_so_phong = 26
    tong_so_box = 0
    loai_hinh_karaoke = "PHONG"
    nhom_dien_tich = "DEN_20"

    calc = compute_karaoke_amounts(
        karaoke_type=loai_hinh_karaoke,
        area_group=nhom_dien_tich,
        total_rooms=tong_so_phong,
        total_box=tong_so_box,
        base_salary=muc_luong_co_so,
        support_percent=0.0,
        vat_percent=8.0,
        row_support_bac_1=0.0,
        row_support_bac_2=0.0,
        row_support_bac_3=0.0,
        effective_term_months=12,
    )

    pricing_detail_text = build_pricing_detail_text(calc, base_salary=muc_luong_co_so)
    pricing_total_text = build_pricing_total_text(
        calc,
        support_percent=0.0,
        vat_percent=8.0,
        support_year=None,
        effective_term_months=12,
    )

    return {
        "pricing_mode": "ND17",
        "loai_hinh_karaoke": loai_hinh_karaoke,
        "tong_so_phong": tong_so_phong,
        "tong_so_box": tong_so_box,
        "contract_term_months": 12,
        "muc_luong_co_so": f"{muc_luong_co_so:,}".replace(",", "."),
        "so_tien_bang_chu": calc.get("so_tien_bang_chu", ""),
        "pricing_detail_text": pricing_detail_text,
        "pricing_total_text": pricing_total_text,
        "karaoke_pricing_render_mode": "TABLE",
        "karaoke_pricing_footer_note": (
            f"Mức lương cơ sở {muc_luong_co_so}đ có thời hạn bắt đầu từ ngày 1/7/2026 "
            f"áp dụng khoản 2 Điều 3 Nghị định 161/2026/NĐ-CP ngày 15/5/2026"
        ),
    }
