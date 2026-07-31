from __future__ import annotations

import json
import re
import zipfile
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.contracts import ContractRecordRow
from app.renderers.karaoke_renderer import insert_khu_vuc_and_tien_ban_quyen_blocks
from app.renderers.text_renderer import extract_placeholders_from_template, render_docx_text
from app.services.contract_validation import assert_clone_db_target, assert_create_runtime_safe, clean_text, normalize_domain_code
from app.services.export_resolver import resolve_template_candidates
from app.services.placeholder_registry import (
    PLACEHOLDERS,
    all_template_placeholders,
    should_report_as_leftover,
)

# Shortcut for error messages
_KHU_VUC_PH = PLACEHOLDERS["khu_vuc_su_dung_nhac"].template_placeholder

# Reuse old-app-compatible calculation helpers already ported in NEW APP.
from app.calculations.karaoke.calculator import (
    build_pricing_detail_text,
    build_pricing_total_text,
    build_room_display_text,
    compute_karaoke_amounts,
    normalize_area_group,
    normalize_karaoke_type,
    normalize_room_sections,
)
from app.calculations.common.money import parse_float, parse_int, money_to_vietnamese_words

WORD_OUTPUT_ROOT = Path(r"F:\APPs\storage\docx")


def _compute_rooms_from_sections(sections: list[dict[str, Any]]) -> int:
    total = 0
    for section in sections:
        total += max(0, parse_int(section.get("room_count"), 0))
    return total


def _fallback_sections_from_total(*, karaoke_type: str, total_rooms: int, total_box: int) -> list[dict[str, Any]]:
    if karaoke_type == "BOX":
        count = max(0, int(total_box or 0))
        unit_label = "Khu vực kinh doanh box Karaoke"
    else:
        count = max(0, int(total_rooms or 0))
        unit_label = "Khu vực kinh doanh Karaoke"
    if count <= 0:
        return []
    return [
        {
            "key": "KHU_VUC_KINH_DOANH",
            "label": unit_label,
            "room_count": count,
            "room_names": [],
            "room_names_text": "",
        }
    ]


def _coerce_room_sections(raw_sections: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_sections, list):
        return []
    coerced: list[dict[str, Any]] = []
    for index, item in enumerate(raw_sections):
        if not isinstance(item, dict):
            continue
        section = dict(item)
        if not clean_text(section.get("label")):
            section["label"] = clean_text(
                section.get("floor")
                or section.get("floor_label")
                or section.get("ten_tang")
                or section.get("key")
            ) or f"Khu vực {index + 1}"
        if section.get("room_count") is None:
            section["room_count"] = section.get("roomCount") or section.get("quantity") or 0
        if not clean_text(section.get("room_names_text")):
            section["room_names_text"] = clean_text(section.get("roomNames") or section.get("room_names"))
        coerced.append(section)
    return coerced


def _to_date_safe(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text_val = clean_text(value)
    if not text_val:
        return None
    try:
        return date.fromisoformat(text_val[:10])
    except Exception:
        return None


def _resolve_karaoke_effective_dates(
    *,
    contract_date: date | None,
    contract_year: int | None,
    start_date: date | None,
    end_date: date | None,
) -> tuple[date | None, date | None]:
    start = start_date
    end = end_date
    base_year = int(contract_year or (contract_date.year if contract_date else date.today().year))

    if start is not None and abs(int(start.year) - base_year) >= 3:
        start = contract_date
    if start is None and contract_date is not None:
        start = contract_date

    if end is not None and start is not None and end < start:
        end = None
    if end is not None and start is not None and abs(int(end.year) - int(start.year)) >= 3:
        end = None
    if end is None and start is not None:
        try:
            end = start.replace(year=start.year + 1)
        except ValueError:
            end = start.replace(year=start.year + 1, month=2, day=28)

    return start, end


def _detect_effective_term_months(start_date: date | None, end_date: date | None) -> int:
    if start_date is None or end_date is None or end_date < start_date:
        return 12
    days = (end_date - start_date).days
    if 170 <= days <= 200:
        return 6
    if 335 <= days <= 395:
        return 12
    months = (end_date.year - start_date.year) * 12 + (end_date.month - start_date.month)
    if months <= 8:
        return 6
    return 12


def _format_money_words_for_contract(value: str | None) -> str:
    text_val = clean_text(value)
    if not text_val:
        return ""
    if text_val.lower().startswith("bằng chữ:"):
        text_val = clean_text(text_val.split(":", 1)[1] if ":" in text_val else text_val)
    text_val = text_val.rstrip(".;")
    if text_val:
        text_val = text_val[0].upper() + text_val[1:]
    return text_val


def _compose_karaoke_tien_ban_quyen_text(
    *,
    pricing_detail_text: str | None,
    pricing_total_text: str | None,
    so_tien_bang_chu: str | None,
) -> str:
    detail = str(pricing_detail_text or "").strip()
    total = str(pricing_total_text or "").strip()
    bang_chu = _format_money_words_for_contract(so_tien_bang_chu)
    parts: list[str] = []
    if detail:
        parts.append(detail)
    if total:
        parts.append(total)
    if bang_chu:
        parts.append(f"(Bằng chữ: {bang_chu}.)")
    return "\n\n".join(parts).strip()


def _read_docx_text(output_path: Path) -> str:
    try:
        with zipfile.ZipFile(output_path, "r") as zf:
            xml = zf.read("word/document.xml").decode("utf-8", errors="ignore")
        # Keep text scan cheap; tags stripped is enough for placeholder checks.
        return re.sub(r"<[^>]+>", "", xml)
    except Exception:
        return ""


@dataclass(slots=True)
class KaraokeDirectResult:
    ok: bool
    contract_id: int
    contract_no: str
    word_path: str
    file_size: int
    db_name: str
    render_context_keys: list[str]
    missing_placeholders: list[str]
    unresolved_placeholders: list[str]
    db_write_performed: bool
    docx_path_attached: bool
    official_export: bool
    gcn_created: bool
    warnings: list[str]


def _normalize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    linh_vuc_raw = clean_text(payload.get("linh_vuc") or payload.get("domain_code") or payload.get("field_code"))

    contract_no = clean_text(payload.get("contract_no"))
    if not contract_no:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="contract_no is required")

    contract_date = _to_date_safe(payload.get("ngay_lap_hop_dong")) or date.today()
    contract_year = parse_int(payload.get("contract_year"), contract_date.year)
    if contract_year <= 0:
        contract_year = contract_date.year

    loai_hinh = normalize_karaoke_type(payload.get("loai_hinh_karaoke"))
    sections_raw = payload.get("karaoke_room_sections")
    if sections_raw is None:
        sections_raw = payload.get("karaoke_room_details_json")
        if isinstance(sections_raw, str):
            try:
                sections_raw = json.loads(sections_raw)
            except Exception:
                sections_raw = []
    sections = normalize_room_sections(_coerce_room_sections(sections_raw))
    total_from_sections = _compute_rooms_from_sections(sections)
    tong_so_phong = max(0, parse_int(payload.get("tong_so_phong"), total_from_sections))
    tong_so_box = max(0, parse_int(payload.get("tong_so_box"), 0))
    if loai_hinh == "BOX":
        tong_so_phong = 0
    else:
        tong_so_box = 0
    if not sections:
        sections = _fallback_sections_from_total(
            karaoke_type=loai_hinh,
            total_rooms=tong_so_phong,
            total_box=tong_so_box,
        )

    start_raw = _to_date_safe(payload.get("ngay_bat_dau"))
    end_raw = _to_date_safe(payload.get("ngay_ket_thuc"))
    ngay_bat_dau, ngay_ket_thuc = _resolve_karaoke_effective_dates(
        contract_date=contract_date,
        contract_year=contract_year,
        start_date=start_raw,
        end_date=end_raw,
    )

    base_salary = max(0, parse_int(payload.get("muc_luong_co_so"), 2_530_000))
    ty_le_ho_tro = max(0.0, parse_float(payload.get("ty_le_ho_tro"), 0.0))
    ty_le_ho_tro_1 = max(0.0, parse_float(payload.get("ty_le_ho_tro_bac_1"), 0.0))
    ty_le_ho_tro_2 = max(0.0, parse_float(payload.get("ty_le_ho_tro_bac_2"), 0.0))
    ty_le_ho_tro_3 = max(0.0, parse_float(payload.get("ty_le_ho_tro_bac_3"), 0.0))
    ty_le_vat = max(0.0, parse_float(payload.get("ty_le_vat"), parse_float(payload.get("thue_percent"), 8.0)))
    nhom_dien_tich = normalize_area_group(payload.get("nhom_dien_tich_ap_dung"), karaoke_type=loai_hinh)
    nam_ap_dung_ho_tro = parse_int(payload.get("nam_ap_dung_ho_tro"), contract_year)
    if nam_ap_dung_ho_tro <= 0:
        nam_ap_dung_ho_tro = contract_year

    return {
        "contract_no": contract_no,
        "contract_year": contract_year,
        "ngay_lap_hop_dong": contract_date,
        "domain_group": "background",
        "linh_vuc": normalize_domain_code(linh_vuc_raw) or "KARAOKE",
        "linh_vuc_hien_thi": clean_text(payload.get("linh_vuc_hien_thi")) or (normalize_domain_code(linh_vuc_raw) or "Karaoke"),
        "field_code": clean_text(payload.get("field_code")) or "KARAOKE",
        "region_code": clean_text(payload.get("region_code")) or "HĐQTGAN-PN",
        "don_vi_ten": clean_text(payload.get("don_vi_ten")),
        "ten_bang_hieu": clean_text(payload.get("ten_bang_hieu") or payload.get("BANG_HIEU")),
        "don_vi_dia_chi": clean_text(payload.get("don_vi_dia_chi")),
        "don_vi_dien_thoai": clean_text(payload.get("don_vi_dien_thoai")),
        "don_vi_email": clean_text(payload.get("don_vi_email")),
        "don_vi_nguoi_dai_dien": clean_text(payload.get("don_vi_nguoi_dai_dien")),
        "don_vi_chuc_vu": clean_text(payload.get("don_vi_chuc_vu")),
        "don_vi_mst": clean_text(payload.get("don_vi_mst")),
        "so_cccd": clean_text(payload.get("so_cccd") or payload.get("so_CCCD")),
        "dia_chi_su_dung": clean_text(payload.get("dia_chi_su_dung") or payload.get("dia_chi_kinh_doanh")),
        "nguoi_thuc_hien_email": clean_text(payload.get("nguoi_thuc_hien_email")),
        "loai_hinh_karaoke": loai_hinh,
        "karaoke_sections": sections,
        "tong_so_phong": tong_so_phong,
        "tong_so_box": tong_so_box,
        "ngay_bat_dau": ngay_bat_dau,
        "ngay_ket_thuc": ngay_ket_thuc,
        "muc_luong_co_so": base_salary,
        "ty_le_ho_tro": ty_le_ho_tro,
        "ty_le_ho_tro_bac_1": ty_le_ho_tro_1,
        "ty_le_ho_tro_bac_2": ty_le_ho_tro_2,
        "ty_le_ho_tro_bac_3": ty_le_ho_tro_3,
        "ty_le_vat": ty_le_vat,
        "nhom_dien_tich_ap_dung": nhom_dien_tich,
        "nam_ap_dung_ho_tro": nam_ap_dung_ho_tro,
    }


def _insert_clone_contract_row(db: Session, data: dict[str, Any], calc: dict[str, Any]) -> ContractRecordRow:
    contract_year = int(data["contract_year"])
    contract_no = str(data["contract_no"])
    row = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.contract_year == contract_year)
        .filter(ContractRecordRow.contract_no == contract_no)
        .filter(ContractRecordRow.annex_no.is_(None))
        .first()
    )
    if row is None:
        row = ContractRecordRow(contract_no=contract_no, contract_year=contract_year, annex_no=None)
        db.add(row)

    values = {
        "ngay_lap_hop_dong": data["ngay_lap_hop_dong"],
        "domain_group": "background",
        "linh_vuc": data["linh_vuc"],
        "linh_vuc_hien_thi": data["linh_vuc_hien_thi"],
        "region_code": data["region_code"],
        "field_code": data["field_code"],
        "don_vi_ten": data["don_vi_ten"],
        "don_vi_dia_chi": data["don_vi_dia_chi"],
        "don_vi_dien_thoai": data["don_vi_dien_thoai"],
        "don_vi_nguoi_dai_dien": data["don_vi_nguoi_dai_dien"],
        "don_vi_chuc_vu": data["don_vi_chuc_vu"],
        "don_vi_mst": data["don_vi_mst"],
        "don_vi_email": data["don_vi_email"],
        "nguoi_thuc_hien_email": data["nguoi_thuc_hien_email"] or data["don_vi_email"] or None,
        "so_tien_chua_gtgt_value": int(calc.get("effective_so_tien_sau_ho_tro") or 0),
        "thue_percent": float(data["ty_le_vat"]),
        "thue_gtgt_value": int(calc.get("effective_thue_gtgt") or 0),
        "so_tien_value": int(calc.get("effective_term_total") or 0),
        "renewal_status": "NEW",
        "is_renewable": True,
        "loai_hinh_karaoke": data["loai_hinh_karaoke"],
        "ten_bang_hieu": data["ten_bang_hieu"],
        "dia_chi_su_dung": data["dia_chi_su_dung"],
        "karaoke_room_details_json": json.dumps(data["karaoke_sections"], ensure_ascii=False),
        "room_display_text": build_room_display_text(data["karaoke_sections"]),
        "tong_so_phong": int(calc.get("total_rooms") or 0),
        "tong_so_box": int(calc.get("total_box") or 0),
        "ngay_bat_dau": data["ngay_bat_dau"],
        "ngay_ket_thuc": data["ngay_ket_thuc"],
    }
    for column, value in values.items():
        setattr(row, column, value)

    db.flush()
    db.commit()
    db.refresh(row)
    return row


def _build_context(data: dict[str, Any], calc: dict[str, Any]) -> dict[str, Any]:
    room_display_text = build_room_display_text(data["karaoke_sections"])
    pricing_detail_text = build_pricing_detail_text(calc, base_salary=int(data["muc_luong_co_so"]))
    effective_term_months = _detect_effective_term_months(data["ngay_bat_dau"], data["ngay_ket_thuc"])
    pricing_total_text = build_pricing_total_text(
        calc,
        support_percent=float(data["ty_le_ho_tro"]),
        vat_percent=float(data["ty_le_vat"]),
        effective_term_months=effective_term_months,
        include_6_month_option=True,
    )
    so_tien_bang_chu = _format_money_words_for_contract(str(calc.get("so_tien_bang_chu") or ""))
    tien_ban_quyen = _compose_karaoke_tien_ban_quyen_text(
        pricing_detail_text=pricing_detail_text,
        pricing_total_text=pricing_total_text,
        so_tien_bang_chu=so_tien_bang_chu,
    )

    signed = data["ngay_lap_hop_dong"]
    start = data["ngay_bat_dau"]
    end = data["ngay_ket_thuc"]
    ctx: dict[str, Any] = {
        "so_hop_dong": data["contract_no"],
        "ngay_ky": f"{signed.day:02d}" if signed else "",
        "ngay_ky_hop_dong": f"{signed.day:02d}" if signed else "",
        "thang_ky_hop_dong": f"{signed.month:02d}" if signed else "",
        "nam_ky_hop_dong": f"{signed.year}" if signed else "",
        "nam": f"{signed.year}" if signed else "",
        "linh_vuc": "Karaoke",
        "TEN_DON_VI": data["don_vi_ten"],
        "ten_don_vi": data["don_vi_ten"],
        "BANG_HIEU": data["ten_bang_hieu"],
        "bang_hieu": data["ten_bang_hieu"],
        "nguoi_dai_dien": data["don_vi_nguoi_dai_dien"],
        "NGUOI_DAI_DIEN": data["don_vi_nguoi_dai_dien"],
        "chuc_vu": data["don_vi_chuc_vu"],
        "CHUC_VU": data["don_vi_chuc_vu"],
        "ma_so_thue": data["don_vi_mst"],
        "so_cccd": data["so_cccd"],
        "so_CCCD": data["so_cccd"] or "-",
        "dien_thoai": data["don_vi_dien_thoai"],
        "so_dien_thoai": data["don_vi_dien_thoai"],
        "email": data["don_vi_email"],
        "dia_chi": data["don_vi_dia_chi"] or data["dia_chi_su_dung"],
        "dia_chi_kinh_doanh": data["dia_chi_su_dung"],
        "dia_chi_su_dung": data["dia_chi_su_dung"],
        # khu_vuc: dùng chung cho tất cả lĩnh vực
        "khu_vuc": data["dia_chi_su_dung"],
        "khu_vuc_su_dung_nhac": room_display_text,
        "tien_ban_quyen": tien_ban_quyen,
        "ngay_hieu_luc_HD": f"{start.day:02d}/{start.month:02d}/{start.year}" if start else "",
        "ngay_het_hieu_luc_HD": f"{end.day:02d}/{end.month:02d}/{end.year}" if end else "",
        "nguoi_thuc_hien": data["nguoi_thuc_hien_email"] or data["don_vi_nguoi_dai_dien"],
        "nguoi_thuc_hien_email": data["nguoi_thuc_hien_email"] or data["don_vi_email"],
        "so_tien_bang_chu": so_tien_bang_chu,
        # Old-app-compatible Karaoke calculation text.
        "room_display_text": room_display_text,
        "pricing_detail_text": pricing_detail_text,
        "pricing_total_text": pricing_total_text,
        "karaoke_pricing_render_mode": "TABLE",
        "loai_hinh_karaoke": data["loai_hinh_karaoke"],
        "tong_so_phong": int(calc.get("total_rooms") or 0),
        "tong_so_box": int(calc.get("total_box") or 0),
        "contract_term_months": effective_term_months,
        "muc_luong_co_so": f"{int(data['muc_luong_co_so']):,}",
    }
    return ctx


def _safe_filename_part(value: Any) -> str:
    raw = clean_text(value)
    if not raw:
        return ""
    raw = re.sub(r"[^0-9A-Za-zÀ-ỹà-ỹ\s._-]+", "", raw, flags=re.UNICODE)
    raw = re.sub(r"\s+", "-", raw).strip("-._ ")
    return raw[:80].strip("-._ ")


def _build_word_output_path(*, data: dict[str, Any], contract_id: int) -> Path:
    year = int(data.get("contract_year") or date.today().year)
    out_dir = WORD_OUTPUT_ROOT / str(year)
    out_dir.mkdir(parents=True, exist_ok=True)
    so_hop_dong_4 = clean_text(data.get("contract_no")).split("/", 1)[0].strip()
    brand = _safe_filename_part(data.get("ten_bang_hieu") or data.get("don_vi_ten")) or f"contract-{contract_id}"
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    filename = "_".join(
        part
        for part in (
            str(year),
            _safe_filename_part(so_hop_dong_4),
            "Karaoke",
            brand,
            ts,
        )
        if part
    )
    output_path = out_dir / f"{filename[:180].rstrip('-._ ')}.docx"
    if output_path.exists():
        output_path = out_dir / f"{output_path.stem}_{contract_id}.docx"
    return output_path


def _attach_word_path_to_clone_row(db: Session, *, contract_id: int, word_path: Path) -> bool:
    has_docx_path = bool(
        db.execute(
            text(
                """
                select 1
                from information_schema.columns
                where table_name = 'contract_records'
                  and column_name = 'docx_path'
                limit 1
                """
            )
        ).scalar()
    )
    if not has_docx_path:
        return False
    db.execute(
        text("update contract_records set docx_path = :word_path where id = :contract_id"),
        {"word_path": str(word_path), "contract_id": int(contract_id)},
    )
    db.commit()
    return True


def _render_karaoke_word(
    *,
    template_path: Path,
    context: dict[str, Any],
    contract_id: int,
    data: dict[str, Any],
) -> tuple[Path, list[str], list[str], list[str]]:
    output_path = _build_word_output_path(data=data, contract_id=contract_id)

    placeholders = extract_placeholders_from_template(template_path=template_path)
    missing = [p for p in placeholders if p not in context]

    render_input = dict(context)
    # Use sentinel for khu_vuc_su_dung_nhac (auto-rendered).
    # {{tien_ban_quyen}} is PRESERVED — not set, stays as-is for manual fill.
    render_input["khu_vuc_su_dung_nhac"] = PLACEHOLDERS["khu_vuc_su_dung_nhac"].sentinel
    # Do NOT set tien_ban_quyen — it's preserved

    render_docx_text(template_path=template_path, output_path=output_path, context=render_input)
    block_result = insert_khu_vuc_and_tien_ban_quyen_blocks(docx_path=output_path, render_ctx=context)

    # {{tien_ban_quyen}} is PRESERVED — never error about it
    if not block_result.get("khu_vuc_inserted"):
        output_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Khu vuc block not rendered at {_KHU_VUC_PH}.",
        )

    doc_text = _read_docx_text(output_path)
    unresolved = []
    # Check all known template placeholders — skip PRESERVED ones
    for ph in all_template_placeholders():
        if ph in doc_text and should_report_as_leftover(ph):
            unresolved.append(ph)
    unresolved = sorted(set(unresolved))

    warnings = list(block_result.get("warnings") or [])
    return output_path, missing, unresolved, warnings


def _render_kvc_word(
    *,
    template_path: Path,
    context: dict[str, Any],
    contract_id: int,
    data: dict[str, Any],
) -> tuple[Path, list[str], list[str], list[str]]:
    """Render KVC domain DOCX using text fill (no block insertion)."""
    output_path = _build_word_output_path(data=data, contract_id=contract_id)

    placeholders = extract_placeholders_from_template(template_path=template_path)
    missing = [p for p in placeholders if p not in context]

    render_docx_text(template_path=template_path, output_path=output_path, context=context)

    warnings: list[str] = []

    doc_text = _read_docx_text(output_path)
    unresolved = []
    # Check all known template placeholders — skip PRESERVED ones
    for ph in all_template_placeholders():
        if ph in doc_text and should_report_as_leftover(ph):
            unresolved.append(ph)
    unresolved = sorted(set(unresolved))

    return output_path, missing, unresolved, warnings


def _build_kvc_context(
    data: dict[str, Any],
    *,
    usage_address: str,
    so_tien_chua_gtgt: int,
    gtgt_percent: float,
    gtgt_amount: int,
    total_amount: int,
    pricing_mode: str = "MANUAL_FEE",
) -> dict[str, Any]:
    """Build DOCX context for KVC domain (Khu vui choi).

    KVC uses manual fee input from the form. The pricing text is rendered
    directly into {{khu_vuc_su_dung_nhac}} and {{tien_ban_quyen}} placeholders.
    No karaoke room/pricing blocks are used.
    """
    signed = data.get("ngay_lap_hop_dong")
    start = data.get("ngay_bat_dau")
    end = data.get("ngay_ket_thuc")

    domain_code = normalize_domain_code(data.get("linh_vuc") or "")
    domain_label = domain_code
    if domain_code == "KHU_VUI_CHOI":
        domain_label = "Khu vui choi"
    elif domain_code == "KVC":
        domain_label = "Khu vui choi"
    else:
        domain_label = domain_code.title()

    # Build usage text
    usage_lines = usage_address.strip() if usage_address.strip() else "(Khong co dia diem su dung)"
    pricing_mode_label = "Thoa thuan" if pricing_mode == "MANUAL_FEE" else pricing_mode

    # Build pricing text
    amount_words = money_to_vietnamese_words(total_amount)
    pricing_lines = [
        f"{pricing_mode_label}:",
        f"  Thanh tien chua thue GTGT: {so_tien_chua_gtgt:,} VND",
        f"  Thue GTGT {gtgt_percent:.1f}%: {gtgt_amount:,} VND",
        f"  Tong cong: {total_amount:,} VND",
    ]
    if amount_words:
        pricing_lines.append(f"(Bang chu: {amount_words}.)")

    ctx: dict[str, Any] = {
        "so_hop_dong": data.get("contract_no") or "",
        "ngay_ky": f"{signed.day:02d}" if signed else "",
        "ngay_ky_hop_dong": f"{signed.day:02d}" if signed else "",
        "thang_ky_hop_dong": f"{signed.month:02d}" if signed else "",
        "nam_ky_hop_dong": f"{signed.year}" if signed else "",
        "nam": f"{signed.year}" if signed else "",
        "linh_vuc": domain_label,
        "TEN_DON_VI": data.get("don_vi_ten") or "",
        "ten_don_vi": data.get("don_vi_ten") or "",
        "BANG_HIEU": data.get("ten_bang_hieu") or "",
        "bang_hieu": data.get("ten_bang_hieu") or "",
        "nguoi_dai_dien": data.get("don_vi_nguoi_dai_dien") or "",
        "NGUOI_DAI_DIEN": data.get("don_vi_nguoi_dai_dien") or "",
        "chuc_vu": data.get("don_vi_chuc_vu") or "",
        "CHUC_VU": data.get("don_vi_chuc_vu") or "",
        "ma_so_thue": data.get("don_vi_mst") or "",
        "so_cccd": data.get("so_cccd") or "",
        "so_CCCD": data.get("so_cccd") or "-",
        "dien_thoai": data.get("don_vi_dien_thoai") or "",
        "so_dien_thoai": data.get("don_vi_dien_thoai") or "",
        "email": data.get("don_vi_email") or "",
        "dia_chi": data.get("don_vi_dia_chi") or data.get("dia_chi_su_dung") or "",
        "dia_chi_kinh_doanh": data.get("dia_chi_su_dung") or "",
        "dia_chi_su_dung": data.get("dia_chi_su_dung") or "",
        "khu_vuc_su_dung_nhac": usage_lines,
        "tien_ban_quyen": "\n".join(pricing_lines),
        "ngay_hieu_luc_HD": f"{start.day:02d}/{start.month:02d}/{start.year}" if start else "",
        "ngay_het_hieu_luc_HD": f"{end.day:02d}/{end.month:02d}/{end.year}" if end else "",
        "nguoi_thuc_hien": data.get("nguoi_thuc_hien_email") or data.get("don_vi_nguoi_dai_dien") or "",
        "nguoi_thuc_hien_email": data.get("nguoi_thuc_hien_email") or data.get("don_vi_email") or "",
        "so_tien_bang_chu": amount_words,
        # KVC-specific placeholders
        "pricing_mode": pricing_mode,
        "usage_address": usage_address,
    }
    return ctx


def make_karaoke_hd_word_old_app_direct(*, db: Session, payload: dict[str, Any]) -> KaraokeDirectResult:
    # Guard rails required by this phase.
    assert_clone_db_target(db)
    assert_create_runtime_safe(db)

    normalized = _normalize_payload(payload)
    domain_code = normalize_domain_code(normalized["linh_vuc"])

    term_months = _detect_effective_term_months(normalized["ngay_bat_dau"], normalized["ngay_ket_thuc"])
    calc = compute_karaoke_amounts(
        karaoke_type=normalized["loai_hinh_karaoke"],
        area_group=normalized["nhom_dien_tich_ap_dung"],
        total_rooms=normalized["tong_so_phong"],
        total_box=normalized["tong_so_box"],
        muc_luong_co_so=normalized["muc_luong_co_so"],
        ty_le_ho_tro=normalized["ty_le_ho_tro"],
        gtgt_percent=normalized["ty_le_vat"],
        ty_le_ho_tro_bac_1=normalized["ty_le_ho_tro_bac_1"],
        ty_le_ho_tro_bac_2=normalized["ty_le_ho_tro_bac_2"],
        ty_le_ho_tro_bac_3=normalized["ty_le_ho_tro_bac_3"],
        effective_term_months=term_months,
    )

    row = _insert_clone_contract_row(db=db, data=normalized, calc=calc)
    db_name = str(db.execute(text("select current_database()")).scalar_one())

    is_karaoke = domain_code == "KARAOKE"
    is_kvc = domain_code in {"KHU_VUI_CHOI", "KVC"}

    if is_karaoke:
        template_candidates = resolve_template_candidates(domain="KARAOKE")
        template_path = Path(template_candidates[0].path) if template_candidates else Path(
            r"F:\APPs\templates\Karaoke\export_template_contract_KA.docx"
        )
        if not template_path.exists():
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Template not found: {template_path}")
        context = _build_context(normalized, calc)
        word_path, missing_placeholders, unresolved_placeholders, render_warnings = _render_karaoke_word(
            template_path=template_path,
            context=context,
            contract_id=int(row.id),
            data=normalized,
        )
        render_context_keys = sorted(context.keys())
        block_placeholders_injected = ["khu_vuc_su_dung_nhac", "tien_ban_quyen"]
    elif is_kvc:
        template_candidates = resolve_template_candidates(domain="KVC")
        template_path = Path(template_candidates[0].path) if template_candidates else Path(
            r"F:\APPs\templates\KVC\export_template_contract_KVC.docx"
        )
        if not template_path.exists():
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Template not found: {template_path}")

        # Read manual fees from payload
        so_tien_chua_gtgt = parse_int(payload.get("so_tien_chua_gtgt_value") or payload.get("so_tien_chua_gtgt"), 0)
        gtgt_percent = parse_float(payload.get("thue_percent"), 8.0)
        gtgt_amount = parse_int(payload.get("thue_gtgt_value") or payload.get("thue_gtgt"), 0)
        total_amount = parse_int(payload.get("so_tien_value") or payload.get("so_tien"), 0)
        if gtgt_amount <= 0 and so_tien_chua_gtgt > 0 and gtgt_percent > 0:
            gtgt_amount = int(round(so_tien_chua_gtgt * gtgt_percent / 100.0))
        if total_amount <= 0 and so_tien_chua_gtgt > 0:
            total_amount = so_tien_chua_gtgt + gtgt_amount

        context = _build_kvc_context(
            data=normalized,
            usage_address=normalized.get("dia_chi_su_dung") or "",
            so_tien_chua_gtgt=so_tien_chua_gtgt,
            gtgt_percent=gtgt_percent,
            gtgt_amount=gtgt_amount,
            total_amount=total_amount,
            pricing_mode="MANUAL_FEE",
        )
        word_path, missing_placeholders, unresolved_placeholders, render_warnings = _render_kvc_word(
            template_path=template_path,
            context=context,
            contract_id=int(row.id),
            data=normalized,
        )
        render_context_keys = sorted(context.keys())
        block_placeholders_injected = []
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Domain '{domain_code}' not supported. Only KARAOKE and KVC are supported.",
        )

    docx_path_attached = _attach_word_path_to_clone_row(db, contract_id=int(row.id), word_path=word_path)

    warnings = list(render_warnings)
    if unresolved_placeholders:
        warnings.append("Unresolved placeholders remain in exported DOCX.")

    return KaraokeDirectResult(
        ok=True,
        contract_id=int(row.id),
        contract_no=str(row.contract_no or normalized["contract_no"]),
        word_path=str(word_path),
        file_size=int(word_path.stat().st_size if word_path.exists() else 0),
        db_name=db_name,
        render_context_keys=render_context_keys,
        missing_placeholders=missing_placeholders,
        unresolved_placeholders=unresolved_placeholders,
        db_write_performed=True,
        docx_path_attached=docx_path_attached,
        official_export=True,
        gcn_created=False,
        warnings=warnings,
    )


def make_karaoke_hd_preview_old_app_direct(*, db: Session, payload: dict[str, Any]) -> KaraokeDirectResult:
    return make_karaoke_hd_word_old_app_direct(db=db, payload=payload)
