from __future__ import annotations

from datetime import date, datetime
import json
import re
from typing import Any

from sqlalchemy.orm import Session

from ..models.background import BackgroundContractScopeRow
from ..models.certificates import CertificateRecordRow
from ..models.contracts import ContractRecordRow
from ..schemas.certificates import CertificatePreviewContext


def _to_date(value: object | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except Exception:
        return None


def _to_iso(value: object | None) -> str | None:
    parsed = _to_date(value)
    if parsed is not None:
        return parsed.isoformat()
    return None


def _clean(value: object | None) -> str:
    return str(value or "").strip()


def _add_one_year_safe(value: date) -> date:
    try:
        return value.replace(year=value.year + 1)
    except ValueError:
        return value.replace(month=2, day=28, year=value.year + 1)


def _issue_parts(value: object | None) -> tuple[str | None, str | None, str | None]:
    parsed = _to_date(value)
    if parsed is None:
        return None, None, None
    return f"{parsed.day:02d}", f"{parsed.month:02d}", str(parsed.year)


def _split_names(text: str) -> list[str]:
    return [item.strip() for item in re.split(r"[,\n;]+", text or "") if item and item.strip()]


def _normalize_sections(raw: object) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    sections: list[dict[str, Any]] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        label = _clean(item.get("label") or item.get("position_label") or item.get("custom_label") or item.get("key"))
        names_raw = item.get("room_names")
        names = [_clean(name) for name in names_raw if _clean(name)] if isinstance(names_raw, list) else _split_names(_clean(item.get("room_names_text")))
        try:
            room_count = int(item.get("room_count") or item.get("quantity") or len(names) or 0)
        except Exception:
            room_count = len(names)
        sections.append(
            {
                "label": label or f"Khu vuc {index + 1}",
                "room_count": room_count,
                "room_names": names,
            }
        )
    return sections


def _sections_from_contract_json(contract: ContractRecordRow) -> list[dict[str, Any]]:
    raw = _clean(getattr(contract, "karaoke_room_details_json", None))
    if not raw:
        return []
    try:
        return _normalize_sections(json.loads(raw))
    except Exception:
        return []


def _sections_from_scope_rows(db: Session, contract_id: int) -> list[dict[str, Any]]:
    rows = (
        db.query(BackgroundContractScopeRow)
        .filter(BackgroundContractScopeRow.contract_id == int(contract_id))
        .order_by(BackgroundContractScopeRow.sort_order.asc(), BackgroundContractScopeRow.scope_id.asc())
        .all()
    )
    sections: list[dict[str, Any]] = []
    for row in rows:
        names_text = _clean(row.room_names_text)
        names = _split_names(names_text)
        sections.append(
            {
                "label": _clean(row.position_label) or "Khu vuc",
                "room_count": int(row.quantity or len(names) or 0),
                "room_names": names,
            }
        )
    return sections


def _scope_col_1_from_music_areas(music_areas: list[dict[str, Any]]) -> str:
    """Build scope column 1 from music_usage_areas (source of truth for all domains)."""
    if not music_areas:
        return ""
    lines: list[str] = []
    for area in music_areas:
        area_name = _clean(area.get("area_name")) or "Khu vực"
        scale = _clean(area.get("scale_description")) or ""
        if scale:
            lines.append(f"{area_name}: {scale}")
        else:
            lines.append(area_name)
    return "\n".join(lines).strip()


def _scope_col_2_from_music_areas(music_areas: list[dict[str, Any]]) -> str:
    """Build scope column 2 from music_usage_areas."""
    if not music_areas:
        return ""
    parts: list[str] = []
    for area in music_areas:
        scale = _clean(area.get("scale_description")) or ""
        if scale:
            parts.append(scale)
    return " / ".join(parts)


def _scope_col_3_from_music_areas(music_areas: list[dict[str, Any]]) -> str:
    """Build scope column 3 from music_usage_areas."""
    if not music_areas:
        return ""
    lines: list[str] = []
    for area in music_areas:
        usage_type = _clean(area.get("music_usage_type")) or ""
        if usage_type:
            lines.append(usage_type)
    return "\n".join(lines)


def _scope_col_1(sections: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for section in sections:
        room_count = int(section.get("room_count") or 0)
        if room_count <= 0:
            continue
        label = _clean(section.get("label")) or "Khu vuc"
        names = [name for name in section.get("room_names", []) if _clean(name)]
        if names:
            lines.append(f"{label}: {', '.join(names)}")
        else:
            lines.append(f"{label}: {room_count:02d} phong")
    return "\n".join(lines).strip()


def _scope_col_2(contract: ContractRecordRow, sections: list[dict[str, Any]]) -> str:
    karaoke_type = _clean(getattr(contract, "loai_hinh_karaoke", None)).upper() or "PHONG"
    if karaoke_type == "BOX":
        return f"{int(getattr(contract, 'tong_so_box', 0) or 0)} box"
    room_count = int(getattr(contract, "tong_so_phong", 0) or 0)
    if room_count <= 0:
        room_count = sum(int(section.get("room_count") or 0) for section in sections)
    return f"{room_count} phong"


def _scope_col_3(contract: ContractRecordRow) -> str:
    karaoke_type = _clean(getattr(contract, "loai_hinh_karaoke", None)).upper()
    if karaoke_type == "BOX":
        return "Karaoke\n(box)"
    return "Karaoke\n(phong)"


def _resolve_effective_dates(contract: ContractRecordRow) -> tuple[date | None, date | None, list[str]]:
    warnings: list[str] = []
    contract_date = _to_date(getattr(contract, "ngay_lap_hop_dong", None))
    start = _to_date(getattr(contract, "ngay_bat_dau", None))
    end = _to_date(getattr(contract, "ngay_ket_thuc", None))
    base_year = int(getattr(contract, "contract_year", 0) or (contract_date.year if contract_date else date.today().year))

    if start is not None and abs(int(start.year) - base_year) >= 3:
        warnings.append("contract start date looked far from contract_year; preview used signed date if available")
        start = contract_date
    if start is None and contract_date is not None:
        warnings.append("contract start date missing; preview used signed date")
        start = contract_date
    if end is not None and start is not None and end < start:
        warnings.append("contract end date was before start date; preview cleared end date")
        end = None
    if end is not None and start is not None and abs(int(end.year) - int(start.year)) >= 3:
        warnings.append("contract end date looked far from start date; preview recalculated end date")
        end = None
    if end is None and start is not None:
        warnings.append("contract end date missing; preview used one-year old-app fallback")
        end = _add_one_year_safe(start)
    return start, end, warnings


def locked_layout_metadata() -> dict[str, Any]:
    return {
        "paper": {"width_mm": 209.6, "height_mm": 296.6, "page_size": "A4 portrait", "margin_mm": 0},
        "font_family": "Times New Roman",
        "offset": {"default_x_mm": 0.0, "default_y_mm": 0.0, "step_mm": 0.1, "print_mode_forces_offset_to_zero": True},
        "qr": {"x": 15, "y": 245, "width": 20, "height": 20},
        "anchors": {
            "contract_no": {"x": 105, "y": 221, "width": 74, "height": 8},
            "certificate_no": {"x": 36, "y": 274, "width": 50, "height": 8},
        },
    }


def build_context_from_certificate_row(certificate: CertificateRecordRow) -> CertificatePreviewContext:
    issue_day, issue_month, issue_year = _issue_parts(certificate.certificate_issue_date)
    return CertificatePreviewContext(
        mode="existing_certificate",
        certificate_id=int(certificate.certificate_id),
        contract_id=int(certificate.contract_id),
        certificate_no=certificate.certificate_no,
        certificate_issue_date=_to_iso(certificate.certificate_issue_date),
        certificate_issue_day=issue_day,
        certificate_issue_month=issue_month,
        certificate_issue_year=issue_year,
        contract_no=_clean(certificate.contract_no),
        organization_name=_clean(certificate.organization_name),
        business_registration_no=_clean(certificate.business_registration_no),
        address=_clean(certificate.address),
        business_sign_name=_clean(certificate.business_sign_name),
        business_location=_clean(certificate.business_location),
        gcn_scope_col_1_text=_clean(certificate.gcn_scope_col_1_text),
        gcn_scope_col_2_text=_clean(certificate.gcn_scope_col_2_text),
        gcn_scope_col_3_text=_clean(certificate.gcn_scope_col_3_text),
        effective_from=_to_iso(certificate.effective_from),
        effective_to=_to_iso(certificate.effective_to),
        offset_x_mm=float(certificate.offset_x_mm or 0.0),
        offset_y_mm=float(certificate.offset_y_mm or 0.0),
        qr_image_data=certificate.qr_image_data or None,
        status=_clean(certificate.status) or "draft",
        warnings=[],
    )


def build_context_from_contract_row(contract: ContractRecordRow, *, db: Session) -> CertificatePreviewContext:
    warnings: list[str] = ["contract preview only; no certificate row or GCN number was created"]
    start, end, date_warnings = _resolve_effective_dates(contract)
    warnings.extend(date_warnings)

    # Priority: music_usage_areas (source of truth) > legacy sources
    music_areas = contract.get_music_usage_areas() if hasattr(contract, "get_music_usage_areas") else []
    sections: list[dict[str, Any]] = []
    if not music_areas:
        sections = _sections_from_contract_json(contract)
        if not sections:
            sections = _sections_from_scope_rows(db, int(contract.id))
        if not sections:
            warnings.append("no room/scope sections found; scope column 1 is empty")
        # Fallback: use legacy section format for scope columns
        scope_col_1_text = _scope_col_1(sections)
        scope_col_2_text = _scope_col_2(contract, sections)
        scope_col_3_text = _scope_col_3(contract)
    else:
        # Use music_usage_areas as primary source
        scope_col_1_text = _scope_col_1_from_music_areas(music_areas)
        scope_col_2_text = _scope_col_2_from_music_areas(music_areas)
        scope_col_3_text = _scope_col_3_from_music_areas(music_areas)

    domain_group = _clean(getattr(contract, "domain_group", None)).lower()
    if domain_group and domain_group != "background":
        warnings.append("non-background contract preview is locked for GCN workflow")

    return CertificatePreviewContext(
        mode="contract_preview",
        certificate_id=None,
        contract_id=int(contract.id),
        certificate_no=None,
        certificate_issue_date=None,
        certificate_issue_day=None,
        certificate_issue_month=None,
        certificate_issue_year=None,
        contract_no=_clean(contract.contract_no),
        organization_name=_clean(contract.don_vi_ten),
        business_registration_no=_clean(contract.don_vi_mst),
        address=_clean(contract.don_vi_dia_chi),
        business_sign_name=_clean(contract.ten_bang_hieu),
        business_location=_clean(contract.dia_chi_su_dung) or _clean(contract.don_vi_dia_chi),
        gcn_scope_col_1_text=scope_col_1_text,
        gcn_scope_col_2_text=scope_col_2_text,
        gcn_scope_col_3_text=scope_col_3_text,
        effective_from=start.isoformat() if start else None,
        effective_to=end.isoformat() if end else None,
        offset_x_mm=0.0,
        offset_y_mm=0.0,
        qr_image_data=None,
        status="draft",
        warnings=warnings,
    )
