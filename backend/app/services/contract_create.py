from __future__ import annotations

from datetime import date
import json
import logging

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.contracts import ContractRecordRow
from ..schemas.contracts import DryRunCreateContractResponse
from .contract_validation import (
    BACKGROUND_WORKSPACE_CODE,
    clean_text,
    parse_float_or_none,
    parse_int_or_none,
    parse_iso_date,
)
from .domain_registry import canonicalize_domain, is_known_canonical_domain

_logger = logging.getLogger(__name__)


def date_from_normalized(normalized: dict[str, object], key: str) -> date | None:
    return parse_iso_date(normalized.get(key))


def _resolve_canonical_or_422(
    *,
    raw: str | None,
    field_label: str,
) -> str:
    """Resolve a write-boundary LABEL (linh_vuc) to its canonical domain code.

    - Empty/None → reject as 422 (write boundary must receive a known label).
    - Known canonical code (e.g. "KARAOKE") or recognized alias
      (e.g. "Karaoke", "khu vui chơi") → return the canonical code.
    - Anything else → reject as 422 with a meaningful message instead of
      silently persisting the raw label into a business column.
    """
    cleaned = clean_text(raw)
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_label} là bắt buộc và phải thuộc danh sách lĩnh vực đã chuẩn hoá.",
        )
    canonical = canonicalize_domain(cleaned)
    if canonical is None or not is_known_canonical_domain(canonical):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{field_label} '{cleaned}' không thuộc danh mục lĩnh vực đã chuẩn hoá. "
                "Vui lòng chọn lĩnh vực từ danh sách (Karaoke, Phòng thu âm, Khu vui chơi)."
            ),
        )
    return canonical


# field_code is NOT a domain. It is a contract-suffix tag (PR / MR) used to
# distinguish contract scopes. It is also accepted as a canonical domain code
# when callers want to keep the column aligned with linh_vuc. Allowed values:
#   - canonical domain code (KARAOKE / KHU_VUI_CHOI / ...)
#   - the suffix tags "PR" and "MR" (Phổ thông / Mục đích khác)
_ALLOWED_FIELD_CODES: frozenset[str] = frozenset({"PR", "MR"})


def _resolve_field_code_or_422(
    *,
    raw: str | None,
    field_label: str = "Mã lĩnh vực (field_code)",
) -> str:
    """Resolve field_code at the write boundary.

    Empty → reject 422.
    Canonical domain code (KARAOKE / ...) → pass through.
    Suffix tag (PR / MR) → pass through.
    Anything else → reject 422.

    Unlike linh_vuc, field_code is not a domain identifier; it is a contract
    classification tag. We therefore do not canonicalize it via the domain
    registry, but we still reject unrecognized values to avoid dirty data.
    """
    cleaned = clean_text(raw)
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_label} là bắt buộc.",
        )
    upper = cleaned.upper()
    if upper in _ALLOWED_FIELD_CODES or is_known_canonical_domain(upper):
        return upper
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=(
            f"{field_label} '{cleaned}' không hợp lệ. "
            "Chỉ chấp nhận mã lĩnh vực chuẩn hoá (KARAOKE, KHU_VUI_CHOI, ...) "
            "hoặc hậu tố hợp đồng (PR, MR)."
        ),
    )


def build_contract_record_from_draft(
    *,
    normalized: dict[str, object],
) -> ContractRecordRow:
    from app.services.background_template_resolver import resolve_template_code

    # Get contract_template_code from normalized data, default to TEMPLATE_1
    template_code = resolve_template_code(normalized.get("contract_template_code"))

    # Canonicalize write-boundary inputs. Raw `linh_vuc` and `field_code`
    # values must NOT be persisted as-is — they go through the central
    # registry so every read path agrees on the same KPI group.
    canonical_linh_vuc = _resolve_canonical_or_422(
        raw=normalized.get("linh_vuc"),
        field_label="Lĩnh vực (linh_vuc)",
    )
    canonical_field_code = _resolve_field_code_or_422(
        raw=normalized.get("field_code"),
    )

    return ContractRecordRow(
        contract_no=clean_text(normalized.get("contract_no")),
        contract_year=int(normalized.get("contract_year") or 0),
        annex_no=None,
        ngay_lap_hop_dong=date_from_normalized(normalized, "ngay_lap_hop_dong"),
        domain_group=clean_text(normalized.get("domain_group")) or BACKGROUND_WORKSPACE_CODE,
        linh_vuc=canonical_linh_vuc,
        linh_vuc_hien_thi=clean_text(normalized.get("linh_vuc_hien_thi")) or canonical_linh_vuc,
        region_code=clean_text(normalized.get("region_code")),
        field_code=canonical_field_code,
        don_vi_ten=clean_text(normalized.get("don_vi_ten")),
        don_vi_dia_chi=clean_text(normalized.get("don_vi_dia_chi")),
        don_vi_dien_thoai=clean_text(normalized.get("don_vi_dien_thoai")),
        don_vi_nguoi_dai_dien=clean_text(normalized.get("don_vi_nguoi_dai_dien")),
        don_vi_chuc_vu=clean_text(normalized.get("don_vi_chuc_vu")),
        don_vi_mst=clean_text(normalized.get("don_vi_mst")),
        don_vi_email=clean_text(normalized.get("don_vi_email")),
        nguoi_thuc_hien_email=clean_text(normalized.get("nguoi_thuc_hien_email")),
        so_tien_chua_gtgt_value=parse_int_or_none(normalized.get("so_tien_chua_gtgt_value")),
        thue_percent=parse_float_or_none(normalized.get("thue_percent")),
        thue_gtgt_value=parse_int_or_none(normalized.get("thue_gtgt_value")),
        so_tien_value=parse_int_or_none(normalized.get("so_tien_value")),
        renewal_status=clean_text(normalized.get("renewal_status")) or "NEW",
        is_renewable=True,
        loai_hinh_karaoke=clean_text(normalized.get("loai_hinh_karaoke")) or None,
        contract_terms_note=clean_text(normalized.get("contract_terms_note")),
        reference_contract_id=parse_int_or_none(normalized.get("reference_contract_id")),
        reference_contract_no=clean_text(normalized.get("reference_contract_no")),
        ten_bang_hieu=clean_text(normalized.get("ten_bang_hieu")),
        dia_chi_su_dung=clean_text(normalized.get("dia_chi_su_dung")),
        karaoke_room_details_json=clean_text(normalized.get("karaoke_room_details_json")) or None,
        room_display_text=clean_text(normalized.get("room_display_text")) or None,
        tong_so_phong=parse_int_or_none(normalized.get("tong_so_phong")),
        tong_so_box=parse_int_or_none(normalized.get("tong_so_box")),
        ngay_bat_dau=date_from_normalized(normalized, "ngay_bat_dau"),
        ngay_ket_thuc=date_from_normalized(normalized, "ngay_ket_thuc"),
        # Export template selection
        contract_template_code=template_code,
    )


def created_preview_from_row(row: ContractRecordRow) -> dict[str, object]:
    return {
        "id": int(row.id) if row.id is not None else None,
        "contract_no": row.contract_no,
        "contract_year": row.contract_year,
        "customer_name": row.don_vi_ten,
        "table": "contract_records",
    }


def insert_contract_record_rollback_only(
    *,
    db: Session,
    dry_run: DryRunCreateContractResponse,
) -> dict[str, object]:
    if not dry_run.ok or not dry_run.can_create:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dry-run validation must pass before rollback-only insert")

    row = build_contract_record_from_draft(normalized=dry_run.normalized)
    db.add(row)
    db.flush()
    return created_preview_from_row(row)


def insert_contract_record_persist_test_only(
    *,
    db: Session,
    dry_run: DryRunCreateContractResponse,
) -> dict[str, object]:
    if not dry_run.ok or not dry_run.can_create:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dry-run validation must pass before test persistence")

    row = build_contract_record_from_draft(normalized=dry_run.normalized)
    db.add(row)
    db.flush()
    created = created_preview_from_row(row)
    db.commit()
    return created


def insert_contract_record_clone_only(
    *,
    db: Session,
    dry_run: DryRunCreateContractResponse,
) -> dict[str, object]:
    if not dry_run.ok or not dry_run.can_create:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dry-run validation must pass before clone-only persistence")

    row = build_contract_record_from_draft(normalized=dry_run.normalized)
    db.add(row)
    db.flush()
    created = created_preview_from_row(row)
    created["db_name"] = str(db.execute(text("select current_database()")).scalar_one())
    db.commit()
    return created


def insert_contract_record_simple(
    *,
    db: Session,
    candidate: dict[str, object],
) -> dict[str, object]:
    """Insert contract record without dry-run validation.
    Writes whatever is in the candidate payload directly to the DB.
    Used for quick form-to-DB workflow."""
    import time
    import logging
    _logger = logging.getLogger(__name__)

    # Ensure candidate is a dict
    candidate = dict(candidate or {})

    # Get contract_no - try multiple possible keys
    contract_no = (
        candidate.get("contract_no")
        or candidate.get("contractNo")
        or candidate.get("full_contract_no")
    )
    contract_no = str(contract_no or "").strip()

    # Resolve field_code early — before any use.
    # Priority: explicit field_code > parse from contract_no suffix > fallback "PR"
    raw_contract_no = contract_no
    field_code = (
        clean_text(candidate.get("field_code"))
        or clean_text(candidate.get("ma_quyen"))
        or clean_text(candidate.get("rights_code"))
        or ""
    )
    if not field_code and raw_contract_no:
        # Extract from suffix: e.g. "700/2026/HĐQTGAN-PN/PR" → "PR"
        suffix = raw_contract_no.split("/")[-1].strip().upper()
        if suffix in ("PR", "MR"):
            field_code = suffix
            _logger.info("[create-contract] extracted field_code='%s' from contract_no suffix", field_code)
    if not field_code:
        field_code = "PR"
        _logger.warning("[create-contract] field_code missing, defaulted to 'PR'. contract_no='%s'", raw_contract_no)

    # If still missing, try to build from parts
    if not contract_no:
        short_no = candidate.get("short_no") or candidate.get("so_hd") or candidate.get("so_hop_dong")
        year = candidate.get("contract_year") or candidate.get("year") or candidate.get("nam")
        region_code = candidate.get("region_code") or candidate.get("ma_vung")
        if short_no and year and region_code and field_code:
            contract_no = f"{short_no}/{year}/{region_code}/{field_code}"
            _logger.info("[create-contract] built contract_no from parts: %s", contract_no)

    # Auto-append /PR or /MR suffix if contract_no exists but is missing the suffix.
    # This prevents records like "0704/2026/HĐQTGAN-PN" when field_code=PR was defaulted.
    if contract_no and not contract_no.rstrip("/").endswith("/PR") and not contract_no.rstrip("/").endswith("/MR"):
        # Avoid double-append: only add if the last segment is not already PR/MR
        suffix = contract_no.rstrip("/").split("/")[-1].strip().upper()
        if suffix not in ("PR", "MR"):
            contract_no = f"{contract_no.rstrip('/')}/{field_code}"
            _logger.info("[create-contract] auto-appended /%s to contract_no: %s", field_code, contract_no)

    # Final guard: contract_no MUST be present
    if not contract_no:
        _logger.error("[create-contract] CONTRACT_NO_REQUIRED: contract_no is None, candidate keys: %s", list(candidate.keys()))
        raise ValueError("CONTRACT_NO_REQUIRED: missing contract_no before insert")

    # Ensure contract_no is set in candidate for any downstream use
    candidate["contract_no"] = contract_no

    contract_year = int(parse_int_or_none(candidate.get("contract_year")) or 0)

    # Legacy fallback: if music_usage_areas is empty but legacy karaoke fields exist,
    # convert legacy data to music_usage_areas to preserve old records.
    existing_music_areas = candidate.get("music_usage_areas")
    if (not existing_music_areas or len(existing_music_areas) == 0):
        tong_sp = parse_int_or_none(candidate.get("tong_so_phong"))
        tong_box = parse_int_or_none(candidate.get("tong_so_box"))
        lh_karaoke = str(candidate.get("loai_hinh_karaoke") or "").upper().strip()
        karaoke_details = candidate.get("karaoke_room_details_json")
        # Convert room sections JSON to music_usage_areas if available
        if karaoke_details:
            try:
                sections = json.loads(str(karaoke_details))
                if isinstance(sections, list) and len(sections) > 0:
                    areas = []
                    for sec in sections:
                        rc = parse_int_or_none(sec.get("room_count")) or 0
                        if rc > 0:
                            areas.append({
                                "area_name": str(sec.get("label", "Khu vực sử dụng âm nhạc")),
                                "scale_description": f"{rc} phòng" if lh_karaoke != "BOX" else f"{rc} box",
                                "music_usage_type": "Sử dụng nhạc qua đầu Karaoke",
                            })
                    if areas:
                        candidate["music_usage_areas"] = areas
                        _logger.info("[create-contract] migrated legacy karaoke_room_details_json to music_usage_areas: %d areas", len(areas))
            except (json.JSONDecodeError, TypeError, ValueError):
                pass
        # Fallback to simple count if no section data
        if (not candidate.get("music_usage_areas") or len(candidate.get("music_usage_areas")) == 0):
            if tong_sp and tong_sp > 0:
                candidate["music_usage_areas"] = [{
                    "area_name": "Khu vực sử dụng âm nhạc",
                    "scale_description": f"{tong_sp} phòng",
                    "music_usage_type": "Sử dụng nhạc qua đầu Karaoke",
                }]
                _logger.info("[create-contract] migrated legacy tong_so_phong=%s to music_usage_areas", tong_sp)
            elif tong_box and tong_box > 0:
                candidate["music_usage_areas"] = [{
                    "area_name": "Khu vực sử dụng âm nhạc",
                    "scale_description": f"{tong_box} box",
                    "music_usage_type": "Sử dụng nhạc qua đầu Karaoke",
                }]
                _logger.info("[create-contract] migrated legacy tong_so_box=%s to music_usage_areas", tong_box)

    _logger.info("[create-contract] candidate before insert contract_no=%s", contract_no)

    # Canonicalize write-boundary inputs so business columns never receive
    # raw labels bypassing the registry. Reject unresolved domains instead
    # of silently persisting them as 422 (contract_create contract).
    canon_lv = _resolve_canonical_or_422(
        raw=candidate.get("linh_vuc"),
        field_label="Lĩnh vực (linh_vuc)",
    )
    canon_fc = _resolve_field_code_or_422(
        raw=field_code or candidate.get("field_code"),
    )

    # Check for existing contract with same contract_no and annex_no IS NULL
    existing = db.query(ContractRecordRow).filter(
        ContractRecordRow.contract_year == contract_year,
        ContractRecordRow.contract_no == contract_no,
        ContractRecordRow.annex_no.is_(None),
    ).first()
    if existing:
        raise ValueError(
            f"Số hợp đồng {contract_no}/{contract_year} đã tồn tại (ID: {existing.id}). "
            "Vui lòng đổi số hợp đồng."
        )

    row = ContractRecordRow(
        contract_no=contract_no,
        contract_year=int(parse_int_or_none(candidate.get("contract_year")) or 0),
        annex_no=None,
        ngay_lap_hop_dong=parse_iso_date(candidate.get("ngay_lap_hop_dong")),
        domain_group=clean_text(candidate.get("domain_group")) or BACKGROUND_WORKSPACE_CODE,
        linh_vuc=canon_lv,
        linh_vuc_hien_thi=clean_text(candidate.get("linh_vuc_hien_thi")) or canon_lv,
        region_code=clean_text(candidate.get("region_code")),
        field_code=canon_fc,
        don_vi_ten=clean_text(candidate.get("don_vi_ten")),
        don_vi_dia_chi=clean_text(candidate.get("don_vi_dia_chi")),
        don_vi_dien_thoai=clean_text(candidate.get("don_vi_dien_thoai")),
        don_vi_nguoi_dai_dien=clean_text(candidate.get("don_vi_nguoi_dai_dien")),
        don_vi_chuc_vu=clean_text(candidate.get("don_vi_chuc_vu")),
        don_vi_mst=clean_text(candidate.get("don_vi_mst")),
        don_vi_email=clean_text(candidate.get("don_vi_email")),
        nguoi_thuc_hien_email=clean_text(candidate.get("nguoi_thuc_hien_email")),
        so_tien_chua_gtgt_value=parse_int_or_none(candidate.get("so_tien_chua_gtgt_value")),
        thue_percent=parse_float_or_none(candidate.get("thue_percent")),
        thue_gtgt_value=parse_int_or_none(candidate.get("thue_gtgt_value")),
        so_tien_value=parse_int_or_none(candidate.get("so_tien_value")),
        renewal_status=clean_text(candidate.get("renewal_status")) or "NEW",
        is_renewable=True,
        contract_terms_note=clean_text(candidate.get("contract_terms_note")),
        reference_contract_id=parse_int_or_none(candidate.get("reference_contract_id")),
        reference_contract_no=clean_text(candidate.get("reference_contract_no")),
        ten_bang_hieu=clean_text(candidate.get("ten_bang_hieu")),
        dia_chi_su_dung=clean_text(candidate.get("dia_chi_su_dung")),
        # Post-2025 merger address fields
        legal_address_line=clean_text(candidate.get("legal_address_line")),
        legal_ward=clean_text(candidate.get("legal_ward")),
        legal_province=clean_text(candidate.get("legal_province")),
        legal_full_address=clean_text(candidate.get("legal_full_address")),
        usage_same_as_legal=bool(candidate.get("usage_same_as_legal")) if candidate.get("usage_same_as_legal") is not None else None,
        usage_address_line=clean_text(candidate.get("usage_address_line")),
        usage_ward=clean_text(candidate.get("usage_ward")),
        usage_province=clean_text(candidate.get("usage_province")),
        usage_full_address=clean_text(candidate.get("usage_full_address")),
        ngay_bat_dau=parse_iso_date(candidate.get("ngay_bat_dau")),
        ngay_ket_thuc=parse_iso_date(candidate.get("ngay_ket_thuc")),
        # Phase 2: Music usage areas (JSON) — source of truth for all domains
        music_usage_areas=json.dumps(candidate.get("music_usage_areas") or [], ensure_ascii=False),
        # Phase 2: Simplified royalty fields
        royalty_amount_before_vat=parse_int_or_none(candidate.get("royalty_amount_before_vat")),
        vat_rate=parse_float_or_none(candidate.get("vat_rate")) or 8.0,
        vat_amount=parse_int_or_none(candidate.get("vat_amount")),
        royalty_amount_after_vat=parse_int_or_none(candidate.get("royalty_amount_after_vat")),
        royalty_amount_in_words=clean_text(candidate.get("royalty_amount_in_words")),
        # Export template selection (Phase BACKGROUND-TEMPLATE-REFACTOR)
        contract_template_code=clean_text(candidate.get("contract_template_code")) or "TEMPLATE_1",
    )
    # DEBUG: Log music_usage_areas received
    _logger.info(
        "[create-contract] music_usage_areas received: type=%s, value=%s",
        type(candidate.get("music_usage_areas")).__name__,
        str(candidate.get("music_usage_areas"))[:500] if candidate.get("music_usage_areas") else "None"
    )
    # DEBUG: Log money fields being written
    _logger.info(
        "[create-contract] MONEY_FIELDS WRITE: "
        "royalty_amount_before_vat=%s, vat_rate=%s, vat_amount=%s, royalty_amount_after_vat=%s, "
        "legacy: so_tien_chua_gtgt_value=%s, thue_percent=%s, thue_gtgt_value=%s, so_tien_value=%s",
        row.royalty_amount_before_vat, row.vat_rate, row.vat_amount, row.royalty_amount_after_vat,
        row.so_tien_chua_gtgt_value, row.thue_percent, row.thue_gtgt_value, row.so_tien_value
    )
    _logger.info(
        "[create-contract] CONTRACT_NO SAVE: contract_no='%s', contract_year=%s, field_code='%s'",
        contract_no, contract_year, field_code
    )
    db.add(row)
    db.flush()
    _logger.info("[create-contract] final row contract_no=%s", row.contract_no)
    result = {
        "id": int(row.id) if row.id is not None else None,
        "contract_no": row.contract_no,
        "contract_year": row.contract_year,
        "customer_name": row.don_vi_ten,
        "table": "contract_records",
        "db_name": str(db.execute(text("select current_database()")).scalar_one()),
    }
    db.commit()
    return result
