from __future__ import annotations

import datetime
import json
import logging
import os
from datetime import date, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Query as SAQuery
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.config import settings
from ..core.security import (
    decode_access_token,
    get_bearer_token,
    get_user_permissions,
    has_contract_detail_read,
    has_contract_list,
    security_scheme,
)
from ..models.contracts import ContractRecordRow
from ..models.certificates import CertificateRecordRow
from ..models.user import UserRow
from ..schemas.contracts import (
    ContractDetailResponse,
    ContractListItem,
    ContractsListResponse,
    CreateAndExportDocxResponse,
    CreateContractWriteGuardResponse,
    CheckContractNoResponse,
    DryRunCreateContractRequest,
    DryRunCreateContractResponse,
    DryRunDbMappingItem,
    DryRunDuplicateChecks,
    DryRunDuplicateMatch,
    DryRunIssue,
    DryRunPermission,
    MusicUsageArea,
    SimpleCreateContractRequest,
    SimpleCreateContractResponse,
    KaraokeMakeHdPreviewRequest,
    KaraokeMakeHdPreviewResponse,
    UpdateContractRequest,
    UpdateContractResponse,
    DeleteContractCloneOnlyResponse,
    TemplateSearchItem,
    TemplateSearchResponse,
    PrefillSourceResponse,
)
from ..schemas.certificates import (
    CertificateContextDryRunResponse,
    CertificateCreateDryRunResponse,
    CreateCertificateDraftRequest,
    CreateCertificateDraftResponse,
)
from ..schemas.export import ContractExportPlanResponse
from ..schemas.export_dry_run import ExportDryRunResponse
from ..schemas.export_preview import ExportPreviewRequest, ExportPreviewResponse
from ..schemas.karaoke_export import KaraokeExportPreviewRequest, KaraokeExportPreviewResponse
from ..services.contract_create import (
    insert_contract_record_clone_only,
    insert_contract_record_persist_test_only,
    insert_contract_record_rollback_only,
    insert_contract_record_simple,
)
from ..services.contract_idempotency import (
    append_clone_create_audit as _append_clone_create_audit,
    append_clone_create_audit_after_commit as _append_clone_create_audit_after_commit,
    find_clone_only_created_row,
    payload_idempotency_key as _payload_idempotency_key,
    preflight_clone_create_audit as _preflight_clone_create_audit,
)
from ..services.contract_permissions import (
    apply_contract_visibility as service_apply_contract_visibility,
    get_create_allowed_domain_codes_for_user as service_get_create_allowed_domain_codes_for_user,
    is_admin_delete_any_user,
    is_full_access_user as service_is_full_access_user,
    is_safe_prefix_delete,
)
from ..services.contract_validation import (
    assert_create_runtime_safe as _assert_create_runtime_safe,
    is_production_like_env as _is_production_like_env,
    is_real_address_value as _is_real_address_value,
    payload_confirms_clone_only_create as _payload_confirms_clone_only_create,
    payload_requests_persist_test as _payload_requests_persist_test,
)
from ..services.export_resolver import resolve_contract_export_plan
from ..services.contract_export_preview import render_contract_docx_preview
from ..services.certificate_context import (
    build_context_from_contract_row,
    locked_layout_metadata,
)
from ..services.certificate_create_dry_run import build_certificate_create_dry_run
from ..services.certificate_create import create_certificate_draft


router = APIRouter(prefix="/api/contracts", tags=["contracts"])

ALLOWED_PAGE_SIZES = {30, 60, 90, 120}
BACKGROUND_WORKSPACE_CODE = "background"
PHONG_THU_AM_CANONICAL = "PHONG_THU_AM"
PHONG_THU_AM_ALIASES = {"PHONG_THU_AM", "PHONG_GHI_AM", "PTA"}
CREATE_ALLOWED_DOMAIN_CODES = {"KARAOKE", "KHU_VUI_CHOI", PHONG_THU_AM_CANONICAL}
LOCKED_DOMAIN_GROUPS = {"media_sctt", "media", "sctt"}
TEST_CONTRACT_PREFIX = "TEST-NEWAPP-"
CLONE_CONTRACT_PREFIX = "CLONE-NEWAPP-"
CLONE_D5_CONTRACT_PREFIX = "CLONE-NEWAPP-D5-"
CLONE_UI01_CONTRACT_PREFIX = "CLONE-NEWAPP-UI01-"


def _to_iso(value: object | None) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return str(value.isoformat())
    return str(value)


def _clean_text(value: object | None) -> str:
    return str(value or "").strip()


def _parse_iso_date(raw: object | None) -> date | None:
    value = _clean_text(raw)
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except Exception:
        return None


def _parse_int_or_none(raw: object | None) -> int | None:
    if raw is None:
        return None
    if isinstance(raw, bool):
        return int(raw)
    value = _clean_text(raw)
    if not value:
        return None
    try:
        return int(float(value.replace(",", "")))
    except Exception:
        return None


def _parse_float_or_none(raw: object | None) -> float | None:
    if raw is None:
        return None
    value = _clean_text(raw)
    if not value:
        return None
    try:
        return float(value.replace(",", ""))
    except Exception:
        return None


def _add_issue(target: list[DryRunIssue], field: str, message: str, severity: str = "error") -> None:
    target.append(DryRunIssue(field=field, message=message, severity=severity))


def _safe_preview(value: object | None) -> str | int | float | bool | None:
    if value is None:
        return None
    if isinstance(value, (int, float, bool)):
        return value
    text = str(value)
    return text if len(text) <= 120 else f"{text[:117]}..."


def _normalize_page_size(value: int) -> int:
    return value if value in ALLOWED_PAGE_SIZES else 30


def _normalize_domain_code(value: str | None) -> str:
    raw = str(value or "").strip().upper().replace("-", "_").replace(" ", "_")
    if not raw:
        return ""
    if raw in {"CAFE"}:
        return "COFFEE"
    if raw in {"KARAOKE_SHOW", "KARAOKE/SHOW"}:
        return "KARAOKE"
    if raw in {"KVC", "KHU_VUI_CHOI", "KHU_VUI_CHOI_GIAI_TRI", "CITYGAMES"}:
        return "KHU_VUI_CHOI"
    if raw in PHONG_THU_AM_ALIASES:
        return PHONG_THU_AM_CANONICAL
    return raw


def _normalize_assigned_domain_codes(raw_codes: set[str]) -> set[str]:
    normalized: set[str] = set()
    for code in raw_codes:
        c = _normalize_domain_code(code)
        if c:
            normalized.add(c)
    return normalized


def _is_full_access_user(user: UserRow, permissions: list[str]) -> bool:
    return service_is_full_access_user(user, permissions)


def _apply_contract_visibility(
    *,
    query: SAQuery,
    user: UserRow,
    permissions: list[str],
    db: Session,
) -> SAQuery:
    return service_apply_contract_visibility(query=query, user=user, permissions=permissions, db=db)


def _is_full_access_user(user: UserRow, permissions: list[str]) -> bool:
    return service_is_full_access_user(user, permissions)


def _get_allowed_domain_codes_for_user(*, db: Session, user: UserRow) -> set[str]:
    from ..services.contract_permissions import get_allowed_domain_codes_for_user
    return get_allowed_domain_codes_for_user(db=db, user=user)


def _parse_contract_year(contract_no: str) -> int | None:
    parts = [p.strip() for p in str(contract_no or "").split("/") if p.strip()]
    if len(parts) < 2:
        return None
    try:
        return int(parts[1])
    except Exception:
        return None


def _derived_status(row: ContractRecordRow, today: date) -> str:
    renewal = str(row.renewal_status or "").strip().upper()
    if renewal in {"NEW", "PENDING_RENEWAL", "RENEWED"}:
        return renewal.lower()

    if row.ngay_ket_thuc is None:
        return "unknown"
    if row.ngay_ket_thuc < today:
        return "expired"
    if row.ngay_ket_thuc <= today + timedelta(days=60):
        return "expiring"
    return "active"


def _get_current_user(
    *,
    credentials: HTTPAuthorizationCredentials | None,
    db: Session,
) -> UserRow:
    token = get_bearer_token(credentials)
    username = decode_access_token(token)
    user = db.query(UserRow).filter(func.lower(UserRow.username) == username).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def _get_create_allowed_domain_codes_for_user(*, db: Session, user: UserRow) -> set[str]:
    return service_get_create_allowed_domain_codes_for_user(db=db, user=user)


def _canonical_create_domain(raw_code: object | None, display: object | None = None) -> str:
    code = _normalize_domain_code(_clean_text(raw_code))
    if code:
        return code
    return _normalize_domain_code(_clean_text(display))


def _has_permission(permissions: list[str], resource: str, action: str) -> bool:
    """Check if permissions list contains the required permission.

    Permission format: "resource.action" e.g., "contracts.update", "contracts.write"
    Also allows wildcard: "resource.*" grants all actions on that resource.
    """
    target = f"{resource}.{action}"
    wildcard = f"{resource}.*"
    return target in permissions or wildcard in permissions


def _extract_create_candidate(payload: DryRunCreateContractRequest) -> dict[str, object]:
    client = payload.client_preflight if isinstance(payload.client_preflight, dict) else {}
    draft = payload.draft if isinstance(payload.draft, dict) else {}
    if client:
        return dict(client)

    contract = draft.get("contract") if isinstance(draft.get("contract"), dict) else {}
    domain = draft.get("domain") if isinstance(draft.get("domain"), dict) else {}
    customer = draft.get("customer") if isinstance(draft.get("customer"), dict) else {}
    location = draft.get("location") if isinstance(draft.get("location"), dict) else {}
    dates = draft.get("dates") if isinstance(draft.get("dates"), dict) else {}
    financial = draft.get("financial") if isinstance(draft.get("financial"), dict) else {}
    karaoke = draft.get("karaokeBackground") if isinstance(draft.get("karaokeBackground"), dict) else {}
    assignee = draft.get("assignee") if isinstance(draft.get("assignee"), dict) else {}

    number_part = _clean_text(contract.get("numberPart"))
    year_text = _clean_text(contract.get("year"))
    region_code = _clean_text(contract.get("regionCode"))
    field_code = _clean_text(contract.get("fieldCode"))
    contract_no = "/".join([part for part in [number_part, year_text, region_code, field_code] if part])

    return {
        "contract_no": contract_no,
        "contract_year": _parse_int_or_none(year_text),
        "ngay_lap_hop_dong": contract.get("signedDate"),
        "domain_group": domain.get("group"),
        "linh_vuc": domain.get("code"),
        "linh_vuc_hien_thi": domain.get("displayName"),
        "region_code": region_code,
        "field_code": field_code,
        "don_vi_ten": customer.get("legalName"),
        "ten_bang_hieu": customer.get("brandName"),
        "don_vi_dia_chi": customer.get("legalAddress"),
        "don_vi_dien_thoai": customer.get("phone"),
        "don_vi_email": customer.get("email"),
        "don_vi_nguoi_dai_dien": customer.get("representative"),
        "don_vi_chuc_vu": customer.get("position"),
        "don_vi_mst": customer.get("taxCode"),
        "dia_chi_su_dung": location.get("usageAddress"),
        "nguoi_thuc_hien_email": assignee.get("email"),
        "loai_hinh_karaoke": domain.get("karaokeUsageType"),
        "tong_so_phong": karaoke.get("rooms"),
        "tong_so_box": karaoke.get("boxes"),
        "ngay_bat_dau": dates.get("startDate"),
        "ngay_ket_thuc": dates.get("endDate"),
        "so_tien_chua_gtgt_value": financial.get("amountBeforeGtgt"),
        "thue_percent": financial.get("gtgtPercent"),
        "thue_gtgt_value": financial.get("gtgtAmount"),
        "so_tien_value": financial.get("totalAmount"),
        "renewal_status": financial.get("renewalStatus"),
    }


def _build_db_mapping(normalized: dict[str, object], errors: list[DryRunIssue]) -> list[DryRunDbMappingItem]:
    required_columns = {
        "contract_no",
        "contract_year",
        "ngay_lap_hop_dong",
        "domain_group",
        "linh_vuc",
        "field_code",
        "don_vi_ten",
        "ngay_bat_dau",
        "ngay_ket_thuc",
    }
    columns = [
        "contract_no",
        "contract_year",
        "ngay_lap_hop_dong",
        "domain_group",
        "linh_vuc",
        "linh_vuc_hien_thi",
        "region_code",
        "field_code",
        "don_vi_ten",
        "ten_bang_hieu",
        "don_vi_dia_chi",
        "dia_chi_su_dung",
        "loai_hinh_karaoke",
        "tong_so_phong",
        "tong_so_box",
        "ngay_bat_dau",
        "ngay_ket_thuc",
        "so_tien_chua_gtgt_value",
        "thue_percent",
        "thue_gtgt_value",
        "so_tien_value",
        "renewal_status",
        "nguoi_thuc_hien_email",
    ]
    error_fields = {issue.field for issue in errors}
    items: list[DryRunDbMappingItem] = []
    for column in columns:
        value = normalized.get(column)
        field_key = f"contract_records.{column}"
        if value in (None, "") and column in required_columns:
            status_text = "required"
        elif value in (None, ""):
            status_text = "missing"
        elif field_key in error_fields:
            status_text = "warning"
        else:
            status_text = "ok"
        items.append(
            DryRunDbMappingItem(
                table="contract_records",
                column=column,
                value_preview=_safe_preview(value),
                status=status_text,
            )
        )
    return items


# =============================================================================
# CONTRACT TEMPLATE SEARCH API (Phase TEMPLATE-CREATE-01)
# =============================================================================

@router.get("/template-search", response_model=TemplateSearchResponse)
def search_contracts_for_template(
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
) -> TemplateSearchResponse:
    """
    Search contracts to use as template for creating new contract.

    Searches across:
    - Số hợp đồng (contract_no)
    - Tên đơn vị (don_vi_ten)
    - Tên pháp nhân (same as don_vi_ten)
    - Mã số thuế (don_vi_mst)
    - Địa chỉ (legal_full_address, usage_full_address)

    Does NOT include word "clone" anywhere in the response or logic.
    """
    query = db.query(ContractRecordRow)

    if q:
        search_term = f"%{q}%"
        query = query.filter(
            or_(
                ContractRecordRow.contract_no.ilike(search_term),
                ContractRecordRow.don_vi_ten.ilike(search_term),
                ContractRecordRow.ten_bang_hieu.ilike(search_term),
                ContractRecordRow.don_vi_mst.ilike(search_term),
                ContractRecordRow.legal_full_address.ilike(search_term),
                ContractRecordRow.usage_full_address.ilike(search_term),
            )
        )

    # Only show active/valid contracts
    query = query.filter(
        ContractRecordRow.contract_no.isnot(None),
        ContractRecordRow.contract_no != "",
    )

    # Order by most recent first
    query = query.order_by(ContractRecordRow.id.desc())

    # Count total
    total = query.count()

    # Paginate
    offset = (page - 1) * page_size
    items = query.offset(offset).limit(page_size).all()

    # Map to response
    result_items = []
    for row in items:
        start_date = None
        end_date = None
        if row.ngay_bat_dau:
            start_date = row.ngay_bat_dau.isoformat()
        if row.ngay_ket_thuc:
            end_date = row.ngay_ket_thuc.isoformat()

        result_items.append(TemplateSearchItem(
            id=row.id,
            contract_no=row.contract_no or "",
            customer_name=row.don_vi_ten,
            legal_name=row.don_vi_ten,
            tax_code=row.don_vi_mst,
            legal_full_address=row.legal_full_address,
            usage_full_address=row.usage_full_address,
            domain=row.linh_vuc,
            linh_vuc=row.linh_vuc,
            domain_group=row.domain_group,
            field_code=row.field_code,
            start_date=start_date,
            end_date=end_date,
            renewal_status=row.renewal_status,
        ))

    return TemplateSearchResponse(
        items=result_items,
        total=total,
        query=q,
    )


@router.get("/{contract_id}/prefill-source", response_model=PrefillSourceResponse)
def get_contract_prefill_source(
    contract_id: int,
    db: Session = Depends(get_db),
) -> PrefillSourceResponse:
    """
    Get sanitized contract data to populate a new contract form.

    This returns only the fields suitable for pre-filling a NEW contract form:
    - Customer info (name, address, contact)
    - Domain info
    - Music usage areas
    - Royalty info

    This does NOT return:
    - Original contract id
    - Original contract number
    - Certificate numbers
    - File export paths
    - Status fields
    - Audit/history

    The source contract is NOT modified.

    BACKWARD COMPATIBILITY:
    - Falls back to legacy address fields if structured fields are null
    - Generates music_usage_areas from room_sections if missing
    """
    try:
        # ================================================================
        # STAGE 1: Load contract row
        # ================================================================
        row = db.query(ContractRecordRow).filter(
            ContractRecordRow.id == contract_id
        ).first()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Contract with id {contract_id} not found"
            )

        # ================================================================
        # STAGE 2: Parse room_sections (karaoke_room_details_json)
        # ================================================================
        room_sections = []
        try:
            if row.karaoke_room_details_json:
                room_sections = json.loads(row.karaoke_room_details_json)
                # Validate it's a list
                if not isinstance(room_sections, list):
                    logger.warning(
                        f"[prefill-source] contract_id={contract_id} stage=parse_room_sections: "
                        f"expected list, got {type(room_sections).__name__}, fallback []"
                    )
                    room_sections = []
        except json.JSONDecodeError as e:
            logger.warning(
                f"[prefill-source] contract_id={contract_id} stage=parse_room_sections: "
                f"JSONDecodeError={e}, fallback []"
            )
            room_sections = []
        except Exception as e:
            logger.exception(
                f"[prefill-source] contract_id={contract_id} stage=parse_room_sections: "
                f"error={type(e).__name__}:{e}, fallback []"
            )
            room_sections = []

        # ================================================================
        # STAGE 3: Parse music_usage_areas
        # ================================================================
        music_usage_areas = []
        try:
            if row.music_usage_areas:
                if isinstance(row.music_usage_areas, str):
                    music_usage_areas = json.loads(row.music_usage_areas)
                    if not isinstance(music_usage_areas, list):
                        logger.warning(
                            f"[prefill-source] contract_id={contract_id} stage=parse_music_usage_areas: "
                            f"expected list, got {type(music_usage_areas).__name__}, fallback []"
                        )
                        music_usage_areas = []
                elif isinstance(row.music_usage_areas, list):
                    music_usage_areas = row.music_usage_areas
                else:
                    music_usage_areas = []
        except json.JSONDecodeError as e:
            logger.warning(
                f"[prefill-source] contract_id={contract_id} stage=parse_music_usage_areas: "
                f"JSONDecodeError={e}, fallback []"
            )
            music_usage_areas = []
        except Exception as e:
            logger.exception(
                f"[prefill-source] contract_id={contract_id} stage=parse_music_usage_areas: "
                f"error={type(e).__name__}:{e}, fallback []"
            )
            music_usage_areas = []

        # ================================================================
        # STAGE 4: Normalize addresses (safe, no crash)
        # ================================================================
        try:
            legal_full_address, usage_full_address, legal_address_line, usage_address_line, usage_same_as_legal = \
                _prefill_normalize_address(contract_id, row)
        except Exception as e:
            logger.exception(
                f"[prefill-source] contract_id={contract_id} stage=normalize_address: "
                f"error={type(e).__name__}:{e}"
            )
            # Safe defaults for address
            legal_full_address = None
            usage_full_address = None
            legal_address_line = None
            usage_address_line = None
            usage_same_as_legal = True

        # ================================================================
        # STAGE 5: Normalize domain (safe, no crash)
        # ================================================================
        try:
            domain_code, domain_display_name, domain_group = \
                _prefill_normalize_domain(contract_id, row)
        except Exception as e:
            logger.exception(
                f"[prefill-source] contract_id={contract_id} stage=normalize_domain: "
                f"error={type(e).__name__}:{e}"
            )
            domain_code = None
            domain_display_name = None
            domain_group = None

        # ================================================================
        # STAGE 6: Normalize music_usage_areas fallback
        # ================================================================
        try:
            music_usage_areas = _prefill_normalize_music_usage_areas(
                contract_id, row, music_usage_areas, room_sections
            )
        except Exception as e:
            logger.exception(
                f"[prefill-source] contract_id={contract_id} stage=normalize_music_usage_areas: "
                f"error={type(e).__name__}:{e}, fallback []"
            )
            music_usage_areas = []

        # ================================================================
        # STAGE 7: Normalize royalty fields (safe, no crash)
        # ================================================================
        try:
            royalty_data = _prefill_normalize_royalty(contract_id, row)
        except Exception as e:
            logger.exception(
                f"[prefill-source] contract_id={contract_id} stage=normalize_royalty: "
                f"error={type(e).__name__}:{e}, fallback null"
            )
            royalty_data = {
                'royalty_amount_before_vat': None,
                'vat_rate': None,
                'vat_amount': None,
                'royalty_amount_after_vat': None,
                'royalty_amount_in_words': None,
            }

        # ================================================================
        # STAGE 8: Build response with safe JSON serialization
        # ================================================================
        try:
            response = PrefillSourceResponse(
                ok=True,
                contract_id=row.id,
                contract_no=row.contract_no or "",
                legal_name=row.don_vi_ten,
                brand_name=row.ten_bang_hieu,
                representative_name=row.don_vi_nguoi_dai_dien,
                representative_title=row.don_vi_chuc_vu,
                tax_code=row.don_vi_mst,
                cccd=None,
                phone=row.don_vi_dien_thoai,
                email=row.don_vi_email,
                legal_address_line=legal_address_line,
                legal_ward=row.legal_ward,
                legal_province=row.legal_province,
                legal_full_address=legal_full_address,
                usage_same_as_legal=usage_same_as_legal,
                usage_address_line=usage_address_line,
                usage_ward=row.usage_ward,
                usage_province=row.usage_province,
                usage_full_address=usage_full_address,
                domain_code=domain_code,
                domain_display_name=domain_display_name,
                domain_group=domain_group,
                field_code=row.field_code,
                music_usage_areas=music_usage_areas,
                karaoke_type=row.loai_hinh_karaoke,
                area_group=None,
                total_rooms=_safe_int(row.tong_so_phong),
                total_boxes=_safe_int(row.tong_so_box),
                room_sections=room_sections,
                royalty_amount_before_vat=royalty_data['royalty_amount_before_vat'],
                vat_rate=royalty_data['vat_rate'],
                vat_amount=royalty_data['vat_amount'],
                royalty_amount_after_vat=royalty_data['royalty_amount_after_vat'],
                royalty_amount_in_words=royalty_data['royalty_amount_in_words'],
                contract_terms_note=_safe_str(row.contract_terms_note),
                internal_note=None,
            )

            # Validate JSON serialization before returning
            _prefill_validate_json_response(response, contract_id)
            return response

        except Exception as e:
            logger.exception(
                f"[prefill-source] contract_id={contract_id} stage=build_response: "
                f"error={type(e).__name__}:{e}"
            )
            raise HTTPException(
                status_code=500,
                detail={
                    "error_code": "PREFILL_BUILD_RESPONSE_FAILED",
                    "stage": "build_response",
                    "contract_id": contract_id,
                    "detail": str(e),
                }
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            f"[prefill-source] contract_id={contract_id} stage=unknown: "
            f"error={type(e).__name__}:{e}"
        )
        raise HTTPException(
            status_code=500,
            detail={
                "error_code": "PREFILL_UNEXPECTED_ERROR",
                "stage": "unknown",
                "contract_id": contract_id,
                "detail": str(e),
            }
        )


# =============================================================================
# PREFILL DEBUG ENDPOINT
# =============================================================================

@router.get("/{contract_id}/prefill-debug")
def get_contract_prefill_debug(
    contract_id: int,
    db: Session = Depends(get_db),
):
    """
    Debug endpoint that returns detailed stage-by-stage results for prefill-source.
    Use this to diagnose which stage is failing for a specific contract.
    """
    import traceback
    from pydantic import BaseModel

    class StageResult(BaseModel):
        ok: bool
        error: str | None = None
        data: dict | None = None
        input_repr: str | None = None

    stages = {}

    # STAGE 1: Load contract
    try:
        row = db.query(ContractRecordRow).filter(
            ContractRecordRow.id == contract_id
        ).first()
        if not row:
            return {
                "contract_id": contract_id,
                "error": f"Contract {contract_id} not found",
                "stages": stages
            }
        stages["load_contract"] = StageResult(ok=True, data={
            "id": row.id,
            "contract_no": row.contract_no,
            "don_vi_ten": _safe_repr(row.don_vi_ten),
        }).model_dump()
    except Exception as e:
        stages["load_contract"] = StageResult(ok=False, error=str(e)).model_dump()
        return {"contract_id": contract_id, "error": f"Stage load_contract failed: {e}", "stages": stages}

    # STAGE 2: Parse room_sections
    try:
        raw_rs = getattr(row, 'karaoke_room_details_json', None)
        rs = []
        if raw_rs:
            try:
                rs = json.loads(raw_rs)
                if not isinstance(rs, list):
                    rs = []
                    raise ValueError(f"Expected list, got {type(raw_rs).__name__}")
            except Exception as e2:
                rs = []
                stages["parse_room_sections"] = StageResult(
                    ok=False,
                    error=str(e2),
                    input_repr=_safe_repr(raw_rs)
                ).model_dump()
            else:
                stages["parse_room_sections"] = StageResult(ok=True, data={
                    "type": type(rs).__name__,
                    "len": len(rs),
                    "sample": rs[0] if rs else None,
                }).model_dump()
        else:
            stages["parse_room_sections"] = StageResult(ok=True, data={"raw": None, "parsed": []}).model_dump()
    except Exception as e:
        stages["parse_room_sections"] = StageResult(ok=False, error=str(e)).model_dump()

    # STAGE 3: Parse music_usage_areas
    try:
        raw_mua = getattr(row, 'music_usage_areas', None)
        mua = []
        if raw_mua:
            try:
                if isinstance(raw_mua, str):
                    mua = json.loads(raw_mua)
                elif isinstance(raw_mua, list):
                    mua = raw_mua
                else:
                    mua = []
                if not isinstance(mua, list):
                    raise ValueError(f"Expected list, got {type(raw_mua).__name__}")
            except Exception as e2:
                mua = []
                stages["parse_music_usage_areas"] = StageResult(
                    ok=False,
                    error=str(e2),
                    input_repr=_safe_repr(raw_mua)
                ).model_dump()
            else:
                stages["parse_music_usage_areas"] = StageResult(ok=True, data={
                    "type": type(mua).__name__,
                    "len": len(mua),
                    "sample": mua[0] if mua else None,
                }).model_dump()
        else:
            stages["parse_music_usage_areas"] = StageResult(ok=True, data={"raw": None, "parsed": []}).model_dump()
    except Exception as e:
        stages["parse_music_usage_areas"] = StageResult(ok=False, error=str(e)).model_dump()

    # STAGE 4: Normalize address
    try:
        legal_full_address, usage_full_address, legal_address_line, usage_address_line, usage_same_as_legal = \
            _prefill_normalize_address(contract_id, row)
        stages["normalize_address"] = StageResult(ok=True, data={
            "legal_full_address": _safe_repr(legal_full_address),
            "usage_full_address": _safe_repr(usage_full_address),
            "usage_same_as_legal": usage_same_as_legal,
        }).model_dump()
    except Exception as e:
        stages["normalize_address"] = StageResult(ok=False, error=str(e)).model_dump()

    # STAGE 5: Normalize domain
    try:
        domain_code, domain_display_name, domain_group = _prefill_normalize_domain(contract_id, row)
        stages["normalize_domain"] = StageResult(ok=True, data={
            "domain_code": _safe_repr(domain_code),
            "domain_display_name": _safe_repr(domain_display_name),
            "domain_group": _safe_repr(domain_group),
        }).model_dump()
    except Exception as e:
        stages["normalize_domain"] = StageResult(ok=False, error=str(e)).model_dump()

    # STAGE 6: Normalize music_usage_areas (with fallback generation)
    try:
        mua_result = _prefill_normalize_music_usage_areas(contract_id, row, mua, rs)
        stages["normalize_music_usage_areas"] = StageResult(ok=True, data={
            "len": len(mua_result),
            "result": mua_result,
        }).model_dump()
    except Exception as e:
        stages["normalize_music_usage_areas"] = StageResult(ok=False, error=str(e)).model_dump()

    # STAGE 7: Normalize royalty
    try:
        royalty_data = _prefill_normalize_royalty(contract_id, row)
        stages["normalize_royalty"] = StageResult(ok=True, data={
            k: _safe_repr(v) for k, v in royalty_data.items()
        }).model_dump()
    except Exception as e:
        stages["normalize_royalty"] = StageResult(ok=False, error=str(e)).model_dump()

    # STAGE 8: Build response
    json_safe = False
    build_error = None
    try:
        legal_full_address, usage_full_address, legal_address_line, usage_address_line, usage_same_as_legal = \
            _prefill_normalize_address(contract_id, row)
        domain_code, domain_display_name, domain_group = _prefill_normalize_domain(contract_id, row)
        mua_result = _prefill_normalize_music_usage_areas(contract_id, row, mua, rs)
        royalty_data = _prefill_normalize_royalty(contract_id, row)

        response = PrefillSourceResponse(
            ok=True,
            contract_id=row.id,
            contract_no=row.contract_no or "",
            legal_name=row.don_vi_ten,
            brand_name=row.ten_bang_hieu,
            representative_name=row.don_vi_nguoi_dai_dien,
            representative_title=row.don_vi_chuc_vu,
            tax_code=row.don_vi_mst,
            cccd=None,
            phone=row.don_vi_dien_thoai,
            email=row.don_vi_email,
            legal_address_line=legal_address_line,
            legal_ward=row.legal_ward,
            legal_province=row.legal_province,
            legal_full_address=legal_full_address,
            usage_same_as_legal=usage_same_as_legal,
            usage_address_line=usage_address_line,
            usage_ward=row.usage_ward,
            usage_province=row.usage_province,
            usage_full_address=usage_full_address,
            domain_code=domain_code,
            domain_display_name=domain_display_name,
            domain_group=domain_group,
            field_code=row.field_code,
            music_usage_areas=mua_result,
            karaoke_type=row.loai_hinh_karaoke,
            area_group=None,
            total_rooms=_safe_int(row.tong_so_phong),
            total_boxes=_safe_int(row.tong_so_box),
            room_sections=rs,
            royalty_amount_before_vat=royalty_data['royalty_amount_before_vat'],
            vat_rate=royalty_data['vat_rate'],
            vat_amount=royalty_data['vat_amount'],
            royalty_amount_after_vat=royalty_data['royalty_amount_after_vat'],
            royalty_amount_in_words=royalty_data['royalty_amount_in_words'],
            contract_terms_note=_safe_str(row.contract_terms_note),
            internal_note=None,
        )
        # Validate JSON serialization
        _prefill_validate_json_response(response, contract_id)
        json_safe = True
        stages["build_response"] = StageResult(ok=True, data={"json_safe": True}).model_dump()
    except Exception as e:
        build_error = str(e)
        stages["build_response"] = StageResult(ok=False, error=build_error).model_dump()

    return {
        "contract_id": contract_id,
        "contract_no": row.contract_no,
        "stages": stages,
        "final_response_json_safe": json_safe,
        "build_error": build_error,
    }


# =============================================================================
# PREFILL SOURCE HELPER FUNCTIONS
# =============================================================================

def _safe_int(value) -> int | None:
    """Safely convert value to int, return None on failure."""
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _safe_float(value) -> float | None:
    """Safely convert value to float, return None on failure."""
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def _safe_str(value) -> str | None:
    """Safely convert value to string, return None if empty."""
    if value is None:
        return None
    try:
        s = str(value)
        return s if s.strip() else None
    except Exception:
        return None


def _safe_number_or_null(value) -> int | float | None:
    """Safely extract a number from any format (Decimal, string, float, int)."""
    if value is None:
        return None
    try:
        # Handle Decimal
        if hasattr(value, '__float__'):
            f = float(value)
            # If it's a whole number, return as int
            if f == int(f):
                return int(f)
            return f
        # Handle string
        if isinstance(value, str):
            s = value.strip()
            if not s:
                return None
            f = float(s)
            if f == int(f):
                return int(f)
            return f
        # Handle numeric types
        return float(value)
    except (ValueError, TypeError, ArithmeticError):
        return None


def _parse_music_usage_areas(row) -> list[MusicUsageArea] | None:
    """Parse music_usage_areas from a contract row for list API responses.

    Returns a list of MusicUsageArea objects, or None if no data.
    Does NOT generate fallback rows — returns raw data only.
    """
    try:
        raw = getattr(row, "music_usage_areas", None)
        if not raw:
            return None

        # Handle JSON string
        if isinstance(raw, str):
            try:
                parsed = json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                return None
        else:
            parsed = raw

        if not isinstance(parsed, list) or len(parsed) == 0:
            return None

        return [
            MusicUsageArea(
                area_name=str(a.get("area_name", "") or ""),
                scale_description=str(a.get("scale_description", "") or ""),
                music_usage_type=str(a.get("music_usage_type", "") or ""),
                pricing_label=(str(a.get("pricing_label", "") or "").strip() or None),
                urban_class=str(a.get("urban_class", "") or ""),
                urban_coefficient=float(a.get("urban_coefficient") or 1.0),
                location_name=str(a.get("location_name", "") or ""),
                trade_name=str(a.get("trade_name", "") or ""),
                address_line=str(a.get("address_line", "") or ""),
                ward=str(a.get("ward", "") or ""),
                province=str(a.get("province", "") or ""),
                area_m2=float(a.get("area_m2") or 0),
                duration_months=int(a.get("duration_months") or 12),
                royalty_subtotal=float(a.get("royalty_subtotal") or 0),
            )
            for a in parsed
        ]
    except Exception:
        return None


def _sync_money_fields_on_read(row) -> None:
    """In-memory sync: correct Phase 2 royalty fields for a row read from DB.

    Does NOT write to DB. Only corrects the Python object for serialization.
    - If Phase 2 before_vat is null but legacy exists, backfill Phase 2 from legacy.
    - Then derive vat_amount and after_vat from before_vat + vat_rate.
    - Recomputes even when before_vat is 0, so reads after a zero-edit return
      vat_amount=0 and royalty_amount_after_vat=0 (not stale old values).
    """
    before_vat: int | float | None = getattr(row, "royalty_amount_before_vat", None)
    vat_rate_val: float | None = getattr(row, "vat_rate", None)

    if before_vat is None:
        legacy_before_vat = getattr(row, "so_tien_chua_gtgt_value", None)
        if legacy_before_vat is not None and legacy_before_vat > 0:
            setattr(row, "royalty_amount_before_vat", legacy_before_vat)
            before_vat = legacy_before_vat

    if vat_rate_val is None:
        legacy_vat_rate = getattr(row, "thue_percent", None)
        if legacy_vat_rate is not None:
            setattr(row, "vat_rate", legacy_vat_rate)
            vat_rate_val = legacy_vat_rate

    # Recompute whenever before_vat is set (including 0) so reads reflect saved values.
    if before_vat is not None:
        vat_rate_val = vat_rate_val or 0.0
        new_vat_amount = int(round(before_vat * vat_rate_val / 100.0))
        new_after_vat = int(round(before_vat + new_vat_amount))
        setattr(row, "vat_amount", new_vat_amount)
        setattr(row, "royalty_amount_after_vat", new_after_vat)


def _sync_money_fields_on_update(row, payload_dict: dict, updated_fields: list[str]) -> None:
    """Keep Phase 2 simplified royalty fields in sync with legacy fields on update.

    Business rules:
    - Phase 2 (simplified royalty) fields are the canonical source for contracts created/edited
      via the new app: royalty_amount_before_vat, vat_rate, vat_amount, royalty_amount_after_vat.
    - Legacy fields co-exist for backward compatibility: so_tien_chua_gtgt_value, thue_percent,
      thue_gtgt_value, so_tien_value.
    - After any update that touches any money field (Phase 2 or legacy), we re-derive the
      canonical values from Phase 2 fields and propagate to legacy fields.

    Priority: Phase 2 fields take precedence.
    """
    money_phase2_keys = {
        "royalty_amount_before_vat", "vat_rate", "vat_amount",
        "royalty_amount_after_vat", "royalty_amount_in_words",
    }
    money_legacy_keys = {
        "so_tien_chua_gtgt_value", "thue_percent",
        "thue_gtgt_value", "so_tien_value",
    }

    # Determine authoritative before-vat and vat-rate from Phase 2 fields
    before_vat: int | float | None = getattr(row, "royalty_amount_before_vat", None)
    vat_rate_val: float | None = getattr(row, "vat_rate", None)

    # If Phase 2 before-vat is null but legacy exists, backfill Phase 2 from legacy
    if before_vat is None:
        legacy_before_vat = getattr(row, "so_tien_chua_gtgt_value", None)
        if legacy_before_vat is not None and legacy_before_vat > 0:
            setattr(row, "royalty_amount_before_vat", legacy_before_vat)
            updated_fields.append("royalty_amount_before_vat")
            before_vat = legacy_before_vat

    # If Phase 2 vat-rate is null but legacy exists, backfill Phase 2 from legacy
    if vat_rate_val is None:
        legacy_vat_rate = getattr(row, "thue_percent", None)
        if legacy_vat_rate is not None:
            setattr(row, "vat_rate", legacy_vat_rate)
            updated_fields.append("vat_rate")
            vat_rate_val = legacy_vat_rate

    # Derive Phase 2 values from authoritative before-vat + vat-rate.
    # Recompute whenever before_vat is set (including 0) so zero-edits are persisted
    # to legacy and phase2 fields. Old behavior (before_vat > 0) skipped sync for 0,
    # which left vat_amount / royalty_amount_after_vat / legacy fields at stale values.
    if before_vat is not None:
        vat_rate_val = vat_rate_val or 0.0
        new_vat_amount = int(round(before_vat * vat_rate_val / 100.0))
        new_after_vat = int(round(before_vat + new_vat_amount))

        # Update Phase 2 fields
        changed = False
        if getattr(row, "vat_amount", None) != new_vat_amount:
            setattr(row, "vat_amount", new_vat_amount)
            updated_fields.append("vat_amount")
            changed = True
        if getattr(row, "royalty_amount_after_vat", None) != new_after_vat:
            setattr(row, "royalty_amount_after_vat", new_after_vat)
            updated_fields.append("royalty_amount_after_vat")
            changed = True

        # Propagate to legacy fields
        legacy_before_vat = getattr(row, "so_tien_chua_gtgt_value", None)
        if legacy_before_vat != int(before_vat) if isinstance(before_vat, float) else legacy_before_vat != before_vat:
            setattr(row, "so_tien_chua_gtgt_value", int(before_vat) if isinstance(before_vat, float) else before_vat)
            updated_fields.append("so_tien_chua_gtgt_value")

        if getattr(row, "thue_percent", None) != vat_rate_val:
            setattr(row, "thue_percent", vat_rate_val)
            updated_fields.append("thue_percent")

        if getattr(row, "thue_gtgt_value", None) != new_vat_amount:
            setattr(row, "thue_gtgt_value", new_vat_amount)
            updated_fields.append("thue_gtgt_value")

        if getattr(row, "so_tien_value", None) != new_after_vat:
            setattr(row, "so_tien_value", new_after_vat)
            updated_fields.append("so_tien_value")


def _safe_repr(value, max_len=200) -> str:
    """Safe representation of a value for logging."""
    try:
        s = repr(value)
        if len(s) > max_len:
            s = s[:max_len] + "..."
        return s
    except Exception:
        return f"<{type(value).__name__}>"


def _prefill_normalize_address(contract_id, row) -> tuple:
    """Normalize address fields safely."""
    # USAGE ADDRESS FALLBACK
    usage_full_address = row.usage_full_address
    if not usage_full_address:
        legacy_usage_addresses = [
            getattr(row, 'usage_address', None),
            getattr(row, 'business_address', None),
            getattr(row, 'address_used', None),
            getattr(row, 'dia_chi_su_dung', None),
        ]
        for legacy_addr in legacy_usage_addresses:
            addr_str = str(legacy_addr) if legacy_addr else ""
            if _is_real_address_value(addr_str):
                usage_full_address = addr_str.strip()
                break

    usage_address_line = None
    if usage_full_address:
        usage_address_line = usage_full_address
    elif row.usage_address_line and _is_real_address_value(row.usage_address_line):
        usage_address_line = row.usage_address_line

    # LEGAL ADDRESS FALLBACK
    legal_full_address = row.legal_full_address
    if not _is_real_address_value(legal_full_address):
        legal_full_address = None

    if not legal_full_address:
        legacy_legal_addresses = [
            getattr(row, 'legal_address', None),
            getattr(row, 'address', None),
            getattr(row, 'customer_address', None),
            getattr(row, 'dia_chi_phap_ly', None),
            getattr(row, 'dia_chi', None),
            getattr(row, 'don_vi_dia_chi', None),
        ]
        for legacy_addr in legacy_legal_addresses:
            addr_str = str(legacy_addr) if legacy_addr else ""
            if _is_real_address_value(addr_str):
                legal_full_address = addr_str.strip()
                break

        if not legal_full_address and _is_real_address_value(usage_full_address):
            legal_full_address = usage_full_address

    legal_address_line = None
    if legal_full_address:
        legal_address_line = legal_full_address
    elif row.legal_address_line and _is_real_address_value(row.legal_address_line):
        legal_address_line = row.legal_address_line

    # USAGE SAME AS LEGAL
    usage_same_as_legal = True
    if row.usage_same_as_legal is not None:
        try:
            usage_same_as_legal = bool(row.usage_same_as_legal)
        except Exception:
            usage_same_as_legal = True
    else:
        usage_same_as_legal = (
            not _is_real_address_value(usage_full_address) or
            (_is_real_address_value(legal_full_address) and usage_full_address == legal_full_address)
        )

    return legal_full_address, usage_full_address, legal_address_line, usage_address_line, usage_same_as_legal


def _prefill_normalize_domain(contract_id, row) -> tuple:
    """Normalize domain fields safely."""
    domain_code = getattr(row, 'linh_vuc', None)
    domain_display_name = getattr(row, 'linh_vuc_hien_thi', None)
    domain_group = getattr(row, 'domain_group', None)

    if domain_code == "KARAOKE" and not domain_display_name:
        domain_display_name = "Karaoke"

    if domain_code == "KARAOKE" and not domain_group:
        domain_group = "background"

    return domain_code, domain_display_name, domain_group


def _prefill_normalize_music_usage_areas(contract_id, row, music_usage_areas, room_sections) -> list:
    """Normalize music_usage_areas with fallback generation."""
    if music_usage_areas:
        return music_usage_areas

    if not (room_sections or row.tong_so_phong):
        return []

    # Expand each room_section into a separate music_usage_areas row
    if room_sections:
        result = []
        for section in room_sections:
            if not isinstance(section, dict):
                continue
            room_count = _safe_int(section.get('room_count', 0)) or _safe_int(section.get('quantity', 0)) or 0
            section_key = section.get('key', '') or ''
            section_name = section.get('name', '') or ''
            room_names = section.get('room_names', '') or ''
            
            # Map section key to display name
            section_display = _get_room_section_display_name(section_key, section_name)
            
            # Build scale_description
            if room_count:
                scale_desc = f"{room_count} phòng"
                if room_names:
                    scale_desc += f" ({room_names})"
            else:
                scale_desc = "Theo thông tin hợp đồng cũ"
            
            result.append({
                "area_name": section_display,
                "scale_description": scale_desc,
                "music_usage_type": "Sử dụng nhạc qua đầu Karaoke"
            })
        
        if result:
            return result

    # Fallback: summary row from total rooms
    total_rooms = _safe_int(row.tong_so_phong) or 0

    if not total_rooms and room_sections:
        try:
            total_rooms = sum(
                _safe_int(section.get('room_count', 0)) or 0 +
                _safe_int(section.get('quantity', 0)) or 0
                for section in room_sections
                if isinstance(section, dict)
            )
        except Exception as e:
            logger.warning(
                f"[prefill-source] contract_id={contract_id} stage=normalize_music_usage_areas: "
                f"sum room_sections failed={e}, using 0"
            )
            total_rooms = 0

    if total_rooms:
        scale_description = f"{total_rooms} phòng"
    elif room_sections:
        scale_description = "Theo thông tin hợp đồng cũ"
    else:
        scale_description = "Theo thông tin hợp đồng cũ"

    return [
        {
            "area_name": "Phòng Karaoke",
            "scale_description": scale_description,
            "music_usage_type": "Sử dụng nhạc qua đầu Karaoke"
        }
    ]


# Room section key to display name mapping
_ROOM_SECTION_DISPLAY_NAMES = {
    'TRET': 'Tầng Trệt',
    'LUNG': 'Tầng Lửng',
    'LAU1': 'Lầu 1',
    'LAU2': 'Lầu 2',
    'LAU3': 'Lầu 3',
    'LAU4': 'Lầu 4',
    'LAU5': 'Lầu 5',
    'LAU6': 'Lầu 6',
    'LAU7': 'Lầu 7',
    'LAU8': 'Lầu 8',
    'LAU9': 'Lầu 9',
    'LAU10': 'Lầu 10',
    'SAN_VUON': 'Sân Vườn',
    'KHAC': 'Khác',
}


def _get_room_section_display_name(section_key: str, section_name: str = '') -> str:
    """Get display name for room section key."""
    key_upper = section_key.upper() if section_key else ''
    if key_upper in _ROOM_SECTION_DISPLAY_NAMES:
        base_name = _ROOM_SECTION_DISPLAY_NAMES[key_upper]
        if section_name and key_upper == 'KHAC':
            return section_name
        return base_name
    return section_name or section_key or 'Khu vực'


def _prefill_normalize_royalty(contract_id, row) -> dict:
    """Normalize royalty fields safely."""
    return {
        'royalty_amount_before_vat': _safe_number_or_null(getattr(row, 'royalty_amount_before_vat', None)),
        'vat_rate': _safe_float(getattr(row, 'vat_rate', None)),
        'vat_amount': _safe_number_or_null(getattr(row, 'vat_amount', None)),
        'royalty_amount_after_vat': _safe_number_or_null(getattr(row, 'royalty_amount_after_vat', None)),
        'royalty_amount_in_words': _safe_str(getattr(row, 'royalty_amount_in_words', None)),
    }


def _prefill_validate_json_response(response: PrefillSourceResponse, contract_id: int) -> None:
    """Validate that response can be serialized to JSON."""
    try:
        # Try to serialize the response to catch any non-JSON-serializable fields
        json.dumps(response.model_dump(mode='json'))
    except TypeError as e:
        # Find which field caused the error
        data = response.model_dump()
        for key, value in data.items():
            try:
                json.dumps(value)
            except TypeError:
                logger.error(
                    f"[prefill-source] contract_id={contract_id} JSON serialize field '{key}' failed: "
                    f"value={_safe_repr(value)}, error={e}"
                )
        raise


def _get_contract_prefill_source_impl(contract_id, row, room_sections, music_usage_areas):

    # Log for debugging (commented out to avoid UnicodeEncodeError on Windows console)
    # print(f"[prefill-source] Contract {contract_id}: don_vi_dia_chi='{row.don_vi_dia_chi}', dia_chi_su_dung='{row.dia_chi_su_dung}'")

    # ================================================================
    # 1. ADDRESS FALLBACK (Backward Compatibility)
    # ================================================================

    # USAGE ADDRESS FALLBACK (resolve first, as it may be used for legal fallback)
    usage_full_address = row.usage_full_address
    if not usage_full_address:
        legacy_usage_addresses = [
            getattr(row, 'usage_address', None),
            getattr(row, 'business_address', None),
            getattr(row, 'address_used', None),
            getattr(row, 'dia_chi_su_dung', None),
        ]
        for legacy_addr in legacy_usage_addresses:
            addr_str = str(legacy_addr) if legacy_addr else ""
            if _is_real_address_value(addr_str):
                usage_full_address = addr_str.strip()
                break

        # if not usage_full_address:
        #     print(f"[prefill-source] WARNING: No legacy usage address found for contract {contract_id}")

    # Set usage_address_line - ALWAYS prefer usage_full_address (already validated)
    # Only use usage_address_line if usage_full_address is empty AND usage_address_line is valid
    usage_address_line = None
    if usage_full_address:
        usage_address_line = usage_full_address  # Use the validated full address
    elif row.usage_address_line and _is_real_address_value(row.usage_address_line):
        usage_address_line = row.usage_address_line  # Fallback to DB field if valid

    # LEGAL ADDRESS FALLBACK
    legal_full_address = row.legal_full_address
    # Validate that we have a real address, not a placeholder/key string
    if not _is_real_address_value(legal_full_address):
        legal_full_address = None

    if not legal_full_address:
        # Try legacy fields in order (NONE of these should be literal placeholder strings)
        legacy_legal_addresses = [
            getattr(row, 'legal_address', None),
            getattr(row, 'address', None),
            getattr(row, 'customer_address', None),
            getattr(row, 'dia_chi_phap_ly', None),
            getattr(row, 'dia_chi', None),
            row.don_vi_dia_chi,  # Actual column value, not a key
        ]
        for legacy_addr in legacy_legal_addresses:
            addr_str = str(legacy_addr) if legacy_addr else ""
            if _is_real_address_value(addr_str):
                legal_full_address = addr_str.strip()
                break

        # If still no valid legal address, fallback to usage_full_address
        if not legal_full_address and _is_real_address_value(usage_full_address):
            legal_full_address = usage_full_address
            # print(f"[prefill-source] WARNING: No real legal address found; using usage_full_address fallback")

        # if not legal_full_address:
        #     print(f"[prefill-source] WARNING: No legacy legal address found for contract {contract_id}")

    # Set legal_address_line - ALWAYS prefer legal_full_address (already validated)
    # Only use row.legal_address_line if legal_full_address is empty AND row.legal_address_line is valid
    legal_address_line = None
    if legal_full_address:
        legal_address_line = legal_full_address  # Use the validated full address
    elif row.legal_address_line and _is_real_address_value(row.legal_address_line):
        legal_address_line = row.legal_address_line  # Fallback to DB field if valid

    # USAGE SAME AS LEGAL
    if row.usage_same_as_legal is not None:
        usage_same_as_legal = row.usage_same_as_legal
    else:
        # If usage address is empty or same as legal, default to True
        usage_same_as_legal = (
            not _is_real_address_value(usage_full_address) or
            (_is_real_address_value(legal_full_address) and usage_full_address == legal_full_address)
        )

    # ================================================================
    # 2. MUSIC USAGE AREAS FALLBACK (Backward Compatibility)
    # ================================================================

    if not music_usage_areas and (room_sections or row.tong_so_phong):
        music_usage_areas = _prefill_normalize_music_usage_areas(contract_id, row, music_usage_areas, room_sections)

    # ================================================================
    # 3. DOMAIN FALLBACK
    # ================================================================

    domain_code = row.linh_vuc
    domain_display_name = row.linh_vuc_hien_thi
    domain_group = row.domain_group

    # Fix Karaoke domain display name if missing
    if domain_code == "KARAOKE" and not domain_display_name:
        domain_display_name = "Karaoke"

    if domain_code == "KARAOKE" and not domain_group:
        domain_group = "background"

    # ================================================================
    # BUILD RESPONSE
    # ================================================================

    # print(f"[prefill-source] Contract {contract_id} final values:")
    # print(f"  legal_full_address: {legal_full_address}")
    # print(f"  usage_full_address: {usage_full_address}")
    # print(f"  music_usage_areas: {len(music_usage_areas)} areas")

    return PrefillSourceResponse(
        ok=True,
        contract_id=row.id,
        contract_no=row.contract_no or "",
        legal_name=row.don_vi_ten,
        brand_name=row.ten_bang_hieu,
        representative_name=row.don_vi_nguoi_dai_dien,
        representative_title=row.don_vi_chuc_vu,
        tax_code=row.don_vi_mst,
        cccd=None,
        phone=row.don_vi_dien_thoai,
        email=row.don_vi_email,
        legal_address_line=legal_address_line,
        legal_ward=row.legal_ward,
        legal_province=row.legal_province,
        legal_full_address=legal_full_address,
        usage_same_as_legal=usage_same_as_legal,
        usage_address_line=usage_address_line,
        usage_ward=row.usage_ward,
        usage_province=row.usage_province,
        usage_full_address=usage_full_address,
        domain_code=domain_code,
        domain_display_name=domain_display_name,
        domain_group=domain_group,
        field_code=row.field_code,
        music_usage_areas=music_usage_areas,
        karaoke_type=row.loai_hinh_karaoke,
        area_group=None,
        total_rooms=row.tong_so_phong,
        total_boxes=row.tong_so_box,
        room_sections=room_sections,
        royalty_amount_before_vat=row.royalty_amount_before_vat,
        vat_rate=row.vat_rate,
        vat_amount=row.vat_amount,
        royalty_amount_after_vat=row.royalty_amount_after_vat,
        royalty_amount_in_words=row.royalty_amount_in_words,
        contract_terms_note=row.contract_terms_note,
        internal_note=None,
    )


@router.get("", response_model=ContractsListResponse)
def list_contracts(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30),
    q: str | None = Query(default=None),
    domain: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    year: int | None = Query(default=None),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> ContractsListResponse:
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db, current_user)

    # List-only accounts use `contracts.list`; legacy accounts with
    # `contracts.read` continue to list as before.
    if not has_contract_list(permissions):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Không có quyền xem danh sách hợp đồng.",
        )

    safe_page_size = _normalize_page_size(int(page_size))
    safe_page = max(int(page), 1)
    offset = (safe_page - 1) * safe_page_size
    today = date.today()

    query = db.query(ContractRecordRow).filter(ContractRecordRow.annex_no.is_(None))
    query = _apply_contract_visibility(query=query, user=current_user, permissions=permissions, db=db)

    if year is not None:
        query = query.filter(ContractRecordRow.contract_year == int(year))

    keyword = str(q or "").strip()
    if keyword:
        term = f"%{keyword}%"
        query = query.filter(
            or_(
                ContractRecordRow.contract_no.ilike(term),
                ContractRecordRow.don_vi_ten.ilike(term),
                ContractRecordRow.ten_bang_hieu.ilike(term),
                ContractRecordRow.dia_chi_su_dung.ilike(term),
            )
        )

    requested_domain = str(domain or "").strip()
    if requested_domain:
        term = f"%{requested_domain}%"
        query = query.filter(
            or_(
                ContractRecordRow.linh_vuc_hien_thi.ilike(term),
                ContractRecordRow.field_code.ilike(term),
                ContractRecordRow.domain_group.ilike(term),
            )
        )

    requested_status = str(status_filter or "").strip().lower()
    if requested_status == "expired":
        query = query.filter(ContractRecordRow.ngay_ket_thuc.is_not(None), ContractRecordRow.ngay_ket_thuc < today)
    elif requested_status == "expiring":
        query = query.filter(
            ContractRecordRow.ngay_ket_thuc.is_not(None),
            ContractRecordRow.ngay_ket_thuc >= today,
            ContractRecordRow.ngay_ket_thuc <= today + timedelta(days=60),
        )
    elif requested_status == "active":
        query = query.filter(
            or_(
                ContractRecordRow.ngay_ket_thuc.is_(None),
                ContractRecordRow.ngay_ket_thuc > today + timedelta(days=60),
            )
        )
    elif requested_status == "pending_renewal":
        query = query.filter(func.upper(ContractRecordRow.renewal_status) == "PENDING_RENEWAL")
    elif requested_status == "new":
        query = query.filter(func.upper(ContractRecordRow.renewal_status) == "NEW")
    elif requested_status == "unknown":
        query = query.filter(
            or_(
                ContractRecordRow.renewal_status.is_(None),
                func.trim(ContractRecordRow.renewal_status) == "",
            )
        )

    total = int(query.count())
    total_pages = (total + safe_page_size - 1) // safe_page_size if total > 0 else 0

    rows = (
        query.order_by(
            ContractRecordRow.contract_year.desc(),
            ContractRecordRow.id.desc(),
        )
        .offset(offset)
        .limit(safe_page_size)
        .all()
    )

    # Phase 3: fetch GCN status for all contracts in this page
    # One query to get the most recent certificate per contract_id (domain_group=background).
    contract_ids = [row.id for row in rows]
    gcn_map: dict[int, tuple[str | None, str | None, int | None]] = {}
    if contract_ids:
        cert_rows = (
            db.query(
                CertificateRecordRow.contract_id,
                CertificateRecordRow.status,
                CertificateRecordRow.certificate_no,
                CertificateRecordRow.certificate_id,
            )
            .filter(CertificateRecordRow.contract_id.in_(contract_ids))
            .filter(func.lower(func.coalesce(CertificateRecordRow.domain_group, "")) == BACKGROUND_WORKSPACE_CODE)
            .order_by(CertificateRecordRow.created_at.desc())
            .all()
        )
        # Keep only the most recent certificate per contract
        for cr in cert_rows:
            cid = int(cr.contract_id)
            if cid not in gcn_map:
                gcn_map[cid] = (str(cr.status) if cr.status else None, str(cr.certificate_no) if cr.certificate_no else None, int(cr.certificate_id) if cr.certificate_id else None)

    # In-memory sync: ensure Phase 2 royalty fields are correct for each row
    # so list API returns authoritative values even for old contracts.
    for row in rows:
        _sync_money_fields_on_read(row)

    items: list[ContractListItem] = []
    for row in rows:
        domain_text = str(row.linh_vuc_hien_thi or row.field_code or row.domain_group or "").strip()
        customer_name = str(row.don_vi_ten or "").strip()
        start_date = _to_iso(row.ngay_bat_dau)
        end_date = _to_iso(row.ngay_ket_thuc)
        created_at = _to_iso(row.ngay_lap_hop_dong)

        # Phase 3: GCN data
        gcn_status_val, gcn_cert_no, gcn_cert_id = gcn_map.get(int(row.id), (None, None, None))
        derived_gcn_status: str | None = None
        if gcn_status_val:
            derived_gcn_status = gcn_status_val
        elif gcn_cert_no:
            derived_gcn_status = "draft"  # has cert_no but no status from query means draft

        # DEBUG: trace money fields for each row
        logger.warning(
            "[LIST_API] id=%s contract_no=%s royalty_before_vat=%s so_tien_value=%s",
            row.id, row.contract_no,
            getattr(row, "royalty_amount_before_vat", "N/A"),
            row.so_tien_value,
        )

        items.append(
            ContractListItem(
                id=int(row.id),
                contract_no=str(row.contract_no or ""),
                customer_name=customer_name,
                domain=domain_text,
                status=_derived_status(row, today=today),
                start_date=start_date,
                end_date=end_date,
                created_at=created_at,
                contract_year=int(row.contract_year or _parse_contract_year(str(row.contract_no or "")) or 0),
                field_code=row.field_code,
                region_code=row.region_code,
                ten_bang_hieu=row.ten_bang_hieu,
                dia_chi_su_dung=row.dia_chi_su_dung,
                so_tien_value=int(row.so_tien_value) if row.so_tien_value is not None else None,
                renewal_status=row.renewal_status,
                is_renewable=row.is_renewable,
                loai_hinh_karaoke=row.loai_hinh_karaoke,
                tong_so_phong=row.tong_so_phong,
                tong_so_box=row.tong_so_box,
                # Phase 2 simplified royalty fields (canonical source)
                royalty_amount_before_vat=_safe_number_or_null(getattr(row, "royalty_amount_before_vat", None)),
                vat_rate=_safe_float(getattr(row, "vat_rate", None)),
                vat_amount=_safe_number_or_null(getattr(row, "vat_amount", None)),
                royalty_amount_after_vat=_safe_number_or_null(getattr(row, "royalty_amount_after_vat", None)),
                # Phase 2: Music usage areas
                music_usage_areas=_parse_music_usage_areas(row),
                # Phase 3: GCN integrated status
                gcn_status=derived_gcn_status,
                gcn_certificate_no=gcn_cert_no,
                gcn_certificate_id=gcn_cert_id,
            )
        )

    return ContractsListResponse(
        items=items,
        page=safe_page,
        page_size=safe_page_size,
        total=total,
        total_pages=total_pages,
    )


def _run_create_dry_run(
    payload: DryRunCreateContractRequest,
    credentials: HTTPAuthorizationCredentials | None,
    db: Session,
) -> DryRunCreateContractResponse:
    # Hard guard: this endpoint is SELECT-only. PostgreSQL refuses write statements
    # inside this transaction, and the session is rolled back before returning.
    db.execute(text("SET TRANSACTION READ ONLY"))

    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db, current_user)

    errors: list[DryRunIssue] = []
    warnings: list[DryRunIssue] = []
    candidate = _extract_create_candidate(payload)

    contract_no = _clean_text(candidate.get("contract_no"))
    contract_year = _parse_int_or_none(candidate.get("contract_year")) or _parse_contract_year(contract_no)
    signed_date = _parse_iso_date(candidate.get("ngay_lap_hop_dong"))
    start_date = _parse_iso_date(candidate.get("ngay_bat_dau"))
    end_date = _parse_iso_date(candidate.get("ngay_ket_thuc"))
    amount_before_gtgt = _parse_int_or_none(candidate.get("so_tien_chua_gtgt_value"))
    gtgt_percent = _parse_float_or_none(candidate.get("thue_percent"))
    gtgt_value = _parse_int_or_none(candidate.get("thue_gtgt_value"))
    total_value = _parse_int_or_none(candidate.get("so_tien_value"))
    domain_group = _clean_text(candidate.get("domain_group")).lower()
    domain_code = _canonical_create_domain(candidate.get("linh_vuc"), candidate.get("linh_vuc_hien_thi"))
    field_code = _normalize_domain_code(candidate.get("field_code"))
    display_name = _clean_text(candidate.get("linh_vuc_hien_thi")) or (
        "Phong thu am" if domain_code == PHONG_THU_AM_CANONICAL else domain_code.title()
    )

    if not contract_no:
        _add_issue(errors, "contract_records.contract_no", "contract_no is required")
    if not contract_year:
        _add_issue(errors, "contract_records.contract_year", "contract_year is required or must be parseable from contract_no")
    if signed_date is None:
        _add_issue(errors, "contract_records.ngay_lap_hop_dong", "signed date must be parseable as YYYY-MM-DD")
    if not _clean_text(candidate.get("don_vi_ten")):
        _add_issue(errors, "contract_records.don_vi_ten", "customer name is required")
    if not domain_code:
        _add_issue(errors, "contract_records.linh_vuc", "domain code is required")
    elif domain_code not in CREATE_ALLOWED_DOMAIN_CODES:
        _add_issue(errors, "contract_records.linh_vuc", f"domain code {domain_code} is not enabled for create dry-run")
    if not field_code:
        _add_issue(errors, "contract_records.field_code", "field code is required")
    if start_date is None:
        _add_issue(errors, "contract_records.ngay_bat_dau", "start_date must be parseable as YYYY-MM-DD")
    if end_date is None:
        _add_issue(errors, "contract_records.ngay_ket_thuc", "end_date must be parseable as YYYY-MM-DD")
    if start_date is not None and end_date is not None and end_date < start_date:
        _add_issue(errors, "contract_records.ngay_ket_thuc", "end_date must be greater than or equal to start_date")
    if amount_before_gtgt is None:
        _add_issue(errors, "contract_records.so_tien_chua_gtgt_value", "amount before GTGT must be parseable")
    elif amount_before_gtgt <= 0:
        _add_issue(errors, "contract_records.so_tien_chua_gtgt_value", "amount before GTGT must be greater than zero")
    if gtgt_percent is not None and gtgt_percent < 0:
        _add_issue(errors, "contract_records.thue_percent", "GTGT percent cannot be negative")

    if domain_group in LOCKED_DOMAIN_GROUPS:
        _add_issue(errors, "contract_records.domain_group", "Media/SCTT create remains locked")
    elif domain_group and domain_group != BACKGROUND_WORKSPACE_CODE:
        _add_issue(errors, "contract_records.domain_group", "only background domain_group is enabled for dry-run create")
    elif not domain_group:
        domain_group = BACKGROUND_WORKSPACE_CODE

    if _normalize_domain_code(candidate.get("linh_vuc")) in {"PHONG_GHI_AM", "PTA"}:
        _add_issue(warnings, "contract_records.linh_vuc", "legacy Phong ghi am/PTA alias was normalized to PHONG_THU_AM", "warning")

    if domain_code == "KARAOKE":
        usage_type = _clean_text(candidate.get("loai_hinh_karaoke")).upper() or "PHONG"
        room_count = _parse_int_or_none(candidate.get("tong_so_phong")) or 0
        box_count = _parse_int_or_none(candidate.get("tong_so_box")) or 0
        if usage_type == "BOX" and box_count <= 0:
            _add_issue(warnings, "contract_records.tong_so_box", "Karaoke BOX should include box count before real create", "warning")
        if usage_type != "BOX" and room_count <= 0:
            _add_issue(warnings, "contract_records.tong_so_phong", "Karaoke room count should be confirmed before real create", "warning")
        _add_issue(warnings, "karaoke.pricing", "Karaoke base salary/support pricing fields are not yet in the form", "warning")

    normalized = {
        "contract_no": contract_no,
        "contract_year": contract_year,
        "annex_no": None,
        "ngay_lap_hop_dong": signed_date.isoformat() if signed_date else _clean_text(candidate.get("ngay_lap_hop_dong")),
        "domain_group": domain_group,
        "linh_vuc": domain_code,
        "linh_vuc_hien_thi": display_name,
        "region_code": _clean_text(candidate.get("region_code")),
        "field_code": field_code,
        "don_vi_ten": _clean_text(candidate.get("don_vi_ten")),
        "ten_bang_hieu": _clean_text(candidate.get("ten_bang_hieu")),
        "don_vi_dia_chi": _clean_text(candidate.get("don_vi_dia_chi")),
        "don_vi_dien_thoai": _clean_text(candidate.get("don_vi_dien_thoai")),
        "don_vi_email": _clean_text(candidate.get("don_vi_email")),
        "don_vi_nguoi_dai_dien": _clean_text(candidate.get("don_vi_nguoi_dai_dien")),
        "don_vi_chuc_vu": _clean_text(candidate.get("don_vi_chuc_vu")),
        "don_vi_mst": _clean_text(candidate.get("don_vi_mst")),
        "dia_chi_su_dung": _clean_text(candidate.get("dia_chi_su_dung")),
        "nguoi_thuc_hien_email": _clean_text(candidate.get("nguoi_thuc_hien_email")) or str(current_user.username or ""),
        "loai_hinh_karaoke": _clean_text(candidate.get("loai_hinh_karaoke")).upper() or None,
        "tong_so_phong": _parse_int_or_none(candidate.get("tong_so_phong")),
        "tong_so_box": _parse_int_or_none(candidate.get("tong_so_box")),
        "karaoke_room_details_json": _clean_text(candidate.get("karaoke_room_details_json")),
        "room_display_text": _clean_text(candidate.get("room_display_text")),
        "ngay_bat_dau": start_date.isoformat() if start_date else _clean_text(candidate.get("ngay_bat_dau")),
        "ngay_ket_thuc": end_date.isoformat() if end_date else _clean_text(candidate.get("ngay_ket_thuc")),
        "so_tien_chua_gtgt_value": amount_before_gtgt,
        "thue_percent": gtgt_percent,
        "thue_gtgt_value": gtgt_value,
        "so_tien_value": total_value,
        "renewal_status": _clean_text(candidate.get("renewal_status")) or "NEW",
    }

    is_full_access = _is_full_access_user(current_user, permissions)
    allowed_codes = _get_create_allowed_domain_codes_for_user(db=db, user=current_user)
    if is_full_access:
        permission = DryRunPermission(allowed=True, reason="full-access role/permission")
    elif domain_code in allowed_codes and domain_group == BACKGROUND_WORKSPACE_CODE:
        permission = DryRunPermission(allowed=True, reason="assigned active background domain with create access")
    else:
        permission = DryRunPermission(allowed=False, reason="user lacks create permission for this active background domain")
        _add_issue(errors, "permission.domain", permission.reason)

    duplicate_matches: list[DryRunDuplicateMatch] = []
    if contract_no:
        cr_query = db.query(ContractRecordRow).filter(ContractRecordRow.contract_no == contract_no)
        if contract_year:
            cr_query = cr_query.filter(ContractRecordRow.contract_year == int(contract_year))
        cr_rows = cr_query.filter(ContractRecordRow.annex_no.is_(None)).limit(5).all()
        for row in cr_rows:
            duplicate_matches.append(
                DryRunDuplicateMatch(
                    source="contract_records",
                    id=int(row.id),
                    contract_no=str(row.contract_no or ""),
                    contract_year=int(row.contract_year) if row.contract_year is not None else None,
                    customer_name=row.don_vi_ten,
                )
            )

        # Normalized contracts table is checked with raw SQL to avoid expanding the ORM write surface.
        normalized_rows = db.execute(
            text(
                "select id, contract_no, source_year from contracts "
                "where contract_no = :contract_no or legacy_contract_no = :contract_no "
                "limit 5"
            ),
            {"contract_no": contract_no},
        ).mappings().all()
        for row in normalized_rows:
            duplicate_matches.append(
                DryRunDuplicateMatch(
                    source="contracts",
                    id=int(row["id"]),
                    contract_no=str(row["contract_no"] or ""),
                    contract_year=int(row["source_year"]) if row["source_year"] is not None else None,
                    customer_name=None,
                )
            )

    if duplicate_matches:
        _add_issue(errors, "duplicate.contract_no", "contract_no already exists in clone DB")

    can_create = not errors and permission.allowed
    response = DryRunCreateContractResponse(
        ok=not errors,
        can_create=can_create,
        errors=errors,
        warnings=warnings,
        normalized=normalized,
        db_mapping=_build_db_mapping(normalized, errors),
        duplicate_checks=DryRunDuplicateChecks(
            contract_no_exists=bool(duplicate_matches),
            matches=duplicate_matches,
        ),
        permission=permission,
        write_performed=False,
    )
    db.rollback()
    return response


@router.post("/dry-run-create", response_model=DryRunCreateContractResponse)
def dry_run_create_contract(
    payload: DryRunCreateContractRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> DryRunCreateContractResponse:
    return _run_create_dry_run(payload=payload, credentials=credentials, db=db)


@router.post("", response_model=CreateContractWriteGuardResponse)
def create_contract_guarded(
    payload: DryRunCreateContractRequest,
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    idempotency_key_header: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
) -> CreateContractWriteGuardResponse:
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db=db, user=current_user)
    if not _has_permission(permissions, "contracts", "create"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền tạo hợp đồng.",
        )
    dry_run = _run_create_dry_run(payload=payload, credentials=credentials, db=db)
    write_enabled = bool(settings.create_contract_write_enabled)
    rollback_only = bool(settings.create_contract_rollback_only)
    persist_test_only = bool(settings.create_contract_persist_test_only)
    clone_only_enabled = bool(settings.create_contract_clone_only_enabled)
    response.status_code = status.HTTP_423_LOCKED

    message = "Create contract write is disabled. Run dry-run only."
    mode = "write_disabled"
    if str(settings.app_instance or "").strip() != "new-app":
        message = "Create contract write refused because APP_INSTANCE is not new-app."
        mode = "write_guard_refused"
    elif _is_production_like_env():
        message = "Create contract write refused in production-like environment."
        mode = "write_guard_refused"
    elif write_enabled and not rollback_only and not persist_test_only and not clone_only_enabled:
        message = "Real create persistence is not enabled without CREATE_CONTRACT_CLONE_ONLY_ENABLED=true."
        mode = "write_guard_not_implemented"
    elif write_enabled and not rollback_only and not persist_test_only and clone_only_enabled:
        contract_no = _clean_text(dry_run.normalized.get("contract_no"))
        idempotency_key: str | None = None
        if contract_no.startswith(CLONE_CONTRACT_PREFIX) and _payload_confirms_clone_only_create(payload):
            try:
                _assert_create_runtime_safe(db)
                idempotency_key = _payload_idempotency_key(payload, idempotency_key_header)
                current_user = _get_current_user(credentials=credentials, db=db)
                persisted_record, row, replay_error = find_clone_only_created_row(
                    db=db,
                    idempotency_key=idempotency_key,
                    contract_no=contract_no,
                )
            except ValueError:
                persisted_record = None
                row = None
                replay_error = None
                current_user = None

            if persisted_record is not None:
                if replay_error == "contract_no_mismatch":
                    response.status_code = status.HTTP_409_CONFLICT
                    return CreateContractWriteGuardResponse(
                        ok=False,
                        mode="clone_only_idempotency_conflict",
                        message="Idempotency key was already used for a different contract_no.",
                        write_enabled=write_enabled,
                        rollback_only=rollback_only,
                        clone_only_enabled=clone_only_enabled,
                        write_performed=False,
                        rollback_performed=False,
                        artifacts_generated=False,
                        idempotency_key=idempotency_key,
                        dry_run=dry_run,
                    )

                if replay_error == "created_row_missing" or row is None:
                    response.status_code = status.HTTP_409_CONFLICT
                    return CreateContractWriteGuardResponse(
                        ok=False,
                        mode="clone_only_idempotency_conflict",
                        message="Idempotency key points to an audit record whose created row is no longer present.",
                        write_enabled=write_enabled,
                        rollback_only=rollback_only,
                        clone_only_enabled=clone_only_enabled,
                        write_performed=False,
                        rollback_performed=False,
                        artifacts_generated=False,
                        idempotency_key=idempotency_key,
                        dry_run=dry_run,
                    )

                created = {
                    "id": int(row.id),
                    "contract_no": row.contract_no,
                    "contract_year": row.contract_year,
                    "customer_name": row.don_vi_ten,
                    "table": "contract_records",
                    "db_name": str(db.execute(text("select current_database()")).scalar_one()),
                }
                if current_user is not None:
                    _append_clone_create_audit(
                        db=db,
                        mode="clone_only_idempotent_replay",
                        idempotency_key=idempotency_key,
                        user=current_user,
                        contract_no=contract_no,
                        created=created,
                        write_performed=False,
                        idempotent_replay=True,
                    )
                response.status_code = status.HTTP_200_OK
                return CreateContractWriteGuardResponse(
                    ok=True,
                    mode="clone_only_persisted",
                    message="Idempotent replay: original clone-only create response returned without inserting another row.",
                    write_enabled=write_enabled,
                    rollback_only=rollback_only,
                    clone_only_enabled=clone_only_enabled,
                    write_performed=False,
                    rollback_performed=False,
                    artifacts_generated=False,
                    idempotency_key=idempotency_key,
                    idempotent_replay=True,
                    created=created,
                    dry_run=dry_run,
                )

        if not dry_run.ok or not dry_run.can_create:
            return CreateContractWriteGuardResponse(
                ok=False,
                mode="clone_only_validation_failed",
                message="Dry-run validation failed. Clone-only insert was not attempted.",
                write_enabled=write_enabled,
                rollback_only=rollback_only,
                clone_only_enabled=clone_only_enabled,
                write_performed=False,
                rollback_performed=False,
                artifacts_generated=False,
                dry_run=dry_run,
            )
        if _payload_requests_persist_test(payload):
            return CreateContractWriteGuardResponse(
                ok=False,
                mode="clone_only_refused",
                message="Clone-only create refuses persist-test payload markers.",
                write_enabled=write_enabled,
                rollback_only=rollback_only,
                clone_only_enabled=clone_only_enabled,
                write_performed=False,
                rollback_performed=False,
                artifacts_generated=False,
                dry_run=dry_run,
            )
        if not _payload_confirms_clone_only_create(payload):
            return CreateContractWriteGuardResponse(
                ok=False,
                mode="clone_only_refused",
                message="Clone-only create requires client_confirmation.clone_only_create_confirmed=true.",
                write_enabled=write_enabled,
                rollback_only=rollback_only,
                clone_only_enabled=clone_only_enabled,
                write_performed=False,
                rollback_performed=False,
                artifacts_generated=False,
                dry_run=dry_run,
            )
        _assert_create_runtime_safe(db)
        try:
            idempotency_key = _payload_idempotency_key(payload, idempotency_key_header)
        except ValueError as exc:
            response.status_code = status.HTTP_400_BAD_REQUEST
            return CreateContractWriteGuardResponse(
                ok=False,
                mode="clone_only_idempotency_required",
                message=str(exc),
                write_enabled=write_enabled,
                rollback_only=rollback_only,
                clone_only_enabled=clone_only_enabled,
                write_performed=False,
                rollback_performed=False,
                artifacts_generated=False,
                dry_run=dry_run,
            )
        current_user = _get_current_user(credentials=credentials, db=db)
        persisted_record, row, replay_error = find_clone_only_created_row(
            db=db,
            idempotency_key=idempotency_key,
            contract_no=contract_no,
        )
        if persisted_record is not None:
            if replay_error == "contract_no_mismatch":
                response.status_code = status.HTTP_409_CONFLICT
                return CreateContractWriteGuardResponse(
                    ok=False,
                    mode="clone_only_idempotency_conflict",
                    message="Idempotency key was already used for a different contract_no.",
                    write_enabled=write_enabled,
                    rollback_only=rollback_only,
                    clone_only_enabled=clone_only_enabled,
                    write_performed=False,
                    rollback_performed=False,
                    artifacts_generated=False,
                    idempotency_key=idempotency_key,
                    dry_run=dry_run,
                )

            if replay_error == "created_row_missing" or row is None:
                response.status_code = status.HTTP_409_CONFLICT
                return CreateContractWriteGuardResponse(
                    ok=False,
                    mode="clone_only_idempotency_conflict",
                    message="Idempotency key points to an audit record whose created row is no longer present.",
                    write_enabled=write_enabled,
                    rollback_only=rollback_only,
                    clone_only_enabled=clone_only_enabled,
                    write_performed=False,
                    rollback_performed=False,
                    artifacts_generated=False,
                    idempotency_key=idempotency_key,
                    dry_run=dry_run,
                )

            created = {
                "id": int(row.id),
                "contract_no": row.contract_no,
                "contract_year": row.contract_year,
                "customer_name": row.don_vi_ten,
                "table": "contract_records",
                "db_name": str(db.execute(text("select current_database()")).scalar_one()),
            }
            _append_clone_create_audit(
                db=db,
                mode="clone_only_idempotent_replay",
                idempotency_key=idempotency_key,
                user=current_user,
                contract_no=contract_no,
                created=created,
                write_performed=False,
                idempotent_replay=True,
            )
            response.status_code = status.HTTP_200_OK
            return CreateContractWriteGuardResponse(
                ok=True,
                mode="clone_only_persisted",
                message="Idempotent replay: original clone-only create response returned without inserting another row.",
                write_enabled=write_enabled,
                rollback_only=rollback_only,
                clone_only_enabled=clone_only_enabled,
                write_performed=False,
                rollback_performed=False,
                artifacts_generated=False,
                idempotency_key=idempotency_key,
                idempotent_replay=True,
                created=created,
                dry_run=dry_run,
            )

        if contract_no.startswith(CLONE_UI01_CONTRACT_PREFIX):
            existing_clone_rows = int(
                db.execute(
                    text("select count(*) from contract_records where contract_no = :contract_no"),
                    {"contract_no": contract_no},
                ).scalar_one()
            )
            existing_message = "A CLONE-NEWAPP-UI01 contract row with the same contract_no already exists."
        elif contract_no.startswith(CLONE_D5_CONTRACT_PREFIX):
            existing_clone_rows = int(
                db.execute(
                    text("select count(*) from contract_records where contract_no like :prefix"),
                    {"prefix": f"{CLONE_D5_CONTRACT_PREFIX}%"},
                ).scalar_one()
            )
            existing_message = "A CLONE-NEWAPP-D5 contract row already exists. D5 permits only one controlled validation row."
        else:
            existing_clone_rows = int(
                db.execute(
                    text("select count(*) from contract_records where contract_no = :contract_no"),
                    {"contract_no": contract_no},
                ).scalar_one()
            )
            existing_message = "A contract row with the same contract_no already exists in clone DB."
        if existing_clone_rows > 0:
            return CreateContractWriteGuardResponse(
                ok=False,
                mode="clone_only_refused",
                message=existing_message,
                write_enabled=write_enabled,
                rollback_only=rollback_only,
                clone_only_enabled=clone_only_enabled,
                write_performed=False,
                rollback_performed=False,
                artifacts_generated=False,
                idempotency_key=idempotency_key,
                dry_run=dry_run,
            )
        try:
            _preflight_clone_create_audit(
                db=db,
                mode="clone_only_persisted",
                idempotency_key=idempotency_key,
                user=current_user,
                contract_no=contract_no,
                created=None,
                write_performed=True,
                idempotent_replay=False,
            )
            created = insert_contract_record_clone_only(db=db, dry_run=dry_run)
            _append_clone_create_audit_after_commit(
                db=db,
                mode="clone_only_persisted",
                idempotency_key=idempotency_key,
                user=current_user,
                contract_no=contract_no,
                created=created,
                write_performed=True,
                idempotent_replay=False,
            )
            response.status_code = status.HTTP_200_OK
            return CreateContractWriteGuardResponse(
                ok=True,
                mode="clone_only_persisted",
                message="Exactly one normal clone-only contract_records row was persisted on clone DB.",
                write_enabled=write_enabled,
                rollback_only=rollback_only,
                clone_only_enabled=clone_only_enabled,
                write_performed=True,
                rollback_performed=False,
                artifacts_generated=False,
                idempotency_key=idempotency_key,
                created=created,
                dry_run=dry_run,
            )
        except Exception:
            db.rollback()
            raise
    elif write_enabled and not rollback_only and persist_test_only:
        if not dry_run.ok or not dry_run.can_create:
            return CreateContractWriteGuardResponse(
                ok=False,
                mode="persist_test_validation_failed",
                message="Dry-run validation failed. Test insert was not attempted.",
                write_enabled=write_enabled,
                rollback_only=rollback_only,
                clone_only_enabled=clone_only_enabled,
                write_performed=False,
                rollback_performed=False,
                artifacts_generated=False,
                dry_run=dry_run,
            )
        contract_no = _clean_text(dry_run.normalized.get("contract_no"))
        if not contract_no.startswith(TEST_CONTRACT_PREFIX):
            return CreateContractWriteGuardResponse(
                ok=False,
                mode="persist_test_refused",
                message=f"Persist test requires contract_no prefix {TEST_CONTRACT_PREFIX}.",
                write_enabled=write_enabled,
                rollback_only=rollback_only,
                clone_only_enabled=clone_only_enabled,
                write_performed=False,
                rollback_performed=False,
                artifacts_generated=False,
                dry_run=dry_run,
            )
        if not _payload_requests_persist_test(payload):
            return CreateContractWriteGuardResponse(
                ok=False,
                mode="persist_test_refused",
                message="Persist test requires payload draft.internal.test_mode=true or client_preflight.internal.test_mode=true.",
                write_enabled=write_enabled,
                rollback_only=rollback_only,
                clone_only_enabled=clone_only_enabled,
                write_performed=False,
                rollback_performed=False,
                artifacts_generated=False,
                dry_run=dry_run,
            )
        _assert_create_runtime_safe(db)
        existing_test_rows = int(
            db.execute(
                text("select count(*) from contract_records where contract_no like :prefix"),
                {"prefix": f"{TEST_CONTRACT_PREFIX}%"},
            ).scalar_one()
        )
        if existing_test_rows > 0:
            return CreateContractWriteGuardResponse(
                ok=False,
                mode="persist_test_refused",
                message="A TEST-NEWAPP contract row already exists. Use the cleanup script before creating another test row.",
                write_enabled=write_enabled,
                rollback_only=rollback_only,
                clone_only_enabled=clone_only_enabled,
                write_performed=False,
                rollback_performed=False,
                artifacts_generated=False,
                dry_run=dry_run,
            )
        try:
            created = insert_contract_record_persist_test_only(db=db, dry_run=dry_run)
            response.status_code = status.HTTP_200_OK
            return CreateContractWriteGuardResponse(
                ok=True,
                mode="persisted_test_only",
                message="Exactly one test contract_records row was persisted on clone DB.",
                write_enabled=write_enabled,
                rollback_only=rollback_only,
                clone_only_enabled=clone_only_enabled,
                write_performed=True,
                rollback_performed=False,
                artifacts_generated=False,
                created=created,
                dry_run=dry_run,
            )
        except Exception:
            db.rollback()
            raise
    elif write_enabled and rollback_only:
        if not dry_run.ok or not dry_run.can_create:
            return CreateContractWriteGuardResponse(
                ok=False,
                mode="rollback_only_validation_failed",
                message="Dry-run validation failed. Rollback-only insert was not attempted.",
                write_enabled=write_enabled,
                rollback_only=rollback_only,
                clone_only_enabled=clone_only_enabled,
                write_performed=False,
                rollback_performed=True,
                artifacts_generated=False,
                dry_run=dry_run,
            )
        try:
            _assert_create_runtime_safe(db)
            created_preview = insert_contract_record_rollback_only(db=db, dry_run=dry_run)
            response.status_code = status.HTTP_200_OK
            return CreateContractWriteGuardResponse(
                ok=True,
                mode="rollback_only",
                message="Create insert path executed in rollback-only mode. No data was persisted.",
                write_enabled=write_enabled,
                rollback_only=rollback_only,
                clone_only_enabled=clone_only_enabled,
                write_performed=False,
                rollback_performed=True,
                artifacts_generated=False,
                created_preview=created_preview,
                dry_run=dry_run,
            )
        finally:
            db.rollback()

    return CreateContractWriteGuardResponse(
        ok=False,
        mode=mode,
        message=message,
        write_enabled=write_enabled,
        rollback_only=rollback_only,
        clone_only_enabled=clone_only_enabled,
        write_performed=False,
        rollback_performed=True,
        artifacts_generated=False,
        dry_run=dry_run,
    )


# =============================================================================
# CONTRACT NUMBER AVAILABILITY CHECK
# =============================================================================

def _build_full_contract_no(
    contract_no: str | None,
    short_no: str | None,
    year: int | None,
    region_code: str | None,
    permission_code: str | None,
) -> str | None:
    """Build full contract_no from parts."""
    if contract_no:
        return contract_no.strip()
    if short_no and year and region_code and permission_code:
        return f"{short_no.strip()}/{year}/{region_code.strip()}/{permission_code.strip()}"
    return None


def _find_next_available(
    db: Session,
    short_no: str,
    year: int,
    region_code: str,
    permission_code: str,
    max_attempts: int = 100,
) -> str | None:
    """Find next available contract number by incrementing short_no."""
    try:
        base_num = int(short_no)
    except (ValueError, TypeError):
        return None

    for i in range(max_attempts):
        candidate = f"{base_num + i}/{year}/{region_code}/{permission_code}"
        existing = db.query(ContractRecordRow).filter(
            ContractRecordRow.contract_year == year,
            ContractRecordRow.contract_no == candidate,
            ContractRecordRow.annex_no.is_(None),
        ).first()
        if not existing:
            return candidate

    return None


@router.get("/check-contract-no", response_model=CheckContractNoResponse)
def check_contract_no(
    contract_no: str | None = Query(default=None, description="Full contract number"),
    short_no: str | None = Query(default=None, description="Short number part"),
    year: int | None = Query(default=None, description="Contract year"),
    region_code: str | None = Query(default=None, description="Region code"),
    permission_code: str | None = Query(default=None, alias="permission_code", description="Permission/field code"),
    db: Session = Depends(get_db),
) -> CheckContractNoResponse:
    """Check if a contract number is available for creation."""
    full_no = _build_full_contract_no(contract_no, short_no, year, region_code, permission_code)

    if not full_no:
        return CheckContractNoResponse(
            ok=True,
            available=False,
            contract_no="",
            message="Vui lòng cung cấp đầy đủ thông tin số hợp đồng.",
        )

    # Parse year from full_no if not provided
    if year is None:
        parts = full_no.split("/")
        if len(parts) >= 2:
            try:
                year = int(parts[1])
            except (ValueError, IndexError):
                year = None

    existing = None
    if year:
        existing = db.query(ContractRecordRow).filter(
            ContractRecordRow.contract_year == year,
            ContractRecordRow.contract_no == full_no,
            ContractRecordRow.annex_no.is_(None),
        ).first()
    else:
        existing = db.query(ContractRecordRow).filter(
            ContractRecordRow.contract_no == full_no,
            ContractRecordRow.annex_no.is_(None),
        ).first()

    if existing:
        # Find suggested next
        suggested_next = None
        parts = full_no.split("/")
        if len(parts) >= 4:
            next_short = _find_next_available(
                db,
                parts[0],
                int(parts[1]) if parts[1].isdigit() else 2026,
                parts[2],
                parts[3],
            )
            if next_short and next_short != full_no:
                suggested_next = next_short

        logger.info(
            "[contract-no-check] full_contract_no=%s available=false existing_id=%s",
            full_no,
            existing.id,
        )
        return CheckContractNoResponse(
            ok=True,
            available=False,
            contract_no=full_no,
            existing_contract_id=existing.id,
            message="Số hợp đồng đã tồn tại.",
            suggested_next=suggested_next,
        )

    logger.info(
        "[contract-no-check] full_contract_no=%s available=true",
        full_no,
    )
    return CheckContractNoResponse(
        ok=True,
        available=True,
        contract_no=full_no,
        existing_contract_id=None,
        message="Số hợp đồng có thể sử dụng.",
    )


@router.post("/simple-create", response_model=SimpleCreateContractResponse)
def simple_create_contract(
    payload: SimpleCreateContractRequest,
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> SimpleCreateContractResponse:
    """Create a contract directly from form data without dry-run validation.

    This endpoint:
    - Does NOT run dry-run validation
    - Does NOT require a contract number prefix
    - Writes whatever is in client_preflight directly to the DB clone
    - Auto-assigns TMP-{timestamp} if contract_no is empty
    - Is intended for quick form-to-DB workflow

    This is a BYPASS endpoint for development/testing. Use with caution.
    """
    write_enabled = bool(settings.create_contract_write_enabled)

    if not write_enabled:
        response.status_code = status.HTTP_423_LOCKED
        return SimpleCreateContractResponse(
            ok=False,
            mode="simple_create",
            message="CREATE_CONTRACT_WRITE_ENABLED is false. Simple create is disabled.",
        )

    if str(settings.app_instance or "").strip() != "new-app":
        response.status_code = status.HTTP_423_LOCKED
        return SimpleCreateContractResponse(
            ok=False,
            mode="simple_create",
            message="Simple create refused because APP_INSTANCE is not new-app.",
        )

    if _is_production_like_env():
        response.status_code = status.HTTP_423_LOCKED
        return SimpleCreateContractResponse(
            ok=False,
            mode="simple_create",
            message="Simple create refused in production-like environment.",
        )

    _assert_create_runtime_safe(db)
    current_user = _get_current_user(credentials=credentials, db=db)
    _ = get_user_permissions(db=db, user=current_user)

    client = payload.client_preflight if isinstance(payload.client_preflight, dict) else {}

    if not client.get("don_vi_ten"):
        response.status_code = status.HTTP_400_BAD_REQUEST
        return SimpleCreateContractResponse(
            ok=False,
            mode="simple_create",
            message="don_vi_ten (customer name) is required.",
        )

    try:
        created = insert_contract_record_simple(db=db, candidate=client)
        response.status_code = status.HTTP_201_CREATED
        return SimpleCreateContractResponse(
            ok=True,
            mode="simple_create",
            message="Contract created successfully via simple-create.",
            contract_id=int(created.get("id")) if created.get("id") else None,
            contract_no=created.get("contract_no"),
            contract_year=int(created.get("contract_year")) if created.get("contract_year") else None,
            customer_name=created.get("customer_name"),
            db_name=created.get("db_name"),
            write_performed=True,
            errors=[],
        )
    except IntegrityError as exc:
        db.rollback()
        logger.exception("simple_create_contract failed (IntegrityError): %s", exc)
        response.status_code = status.HTTP_409_CONFLICT
        return SimpleCreateContractResponse(
            ok=False,
            mode="simple_create",
            message="Số hợp đồng đã tồn tại. Vui lòng nhập số khác.",
            errors=[{"field": "contract_no", "message": "Số hợp đồng đã tồn tại."}],
        )
    except ValueError as exc:
        db.rollback()
        logger.warning("simple_create_contract failed (ValueError): %s", exc)
        response.status_code = status.HTTP_400_BAD_REQUEST
        return SimpleCreateContractResponse(
            ok=False,
            mode="simple_create",
            message=str(exc),
            errors=[str(exc)],
        )
    except Exception as exc:
        import traceback
        db.rollback()
        logger.exception("simple_create_contract failed: %s", exc)
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return SimpleCreateContractResponse(
            ok=False,
            mode="simple_create",
            message=f"Simple create failed: {exc}",
            errors=[str(exc)],
        )


# =============================================================================
# OFFICIAL CREATE + DOWNLOAD DOCX (PHASE FIX-CREATE-DOWNLOAD-01)
# =============================================================================

from fastapi.responses import FileResponse


@router.post("/create-and-export-docx", response_model=CreateAndExportDocxResponse)
def create_and_export_docx(
    payload: SimpleCreateContractRequest,
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> CreateAndExportDocxResponse:
    """Official create contract and export DOCX in one step.

    This endpoint:
    1. Creates contract record in DB
    2. Exports DOCX for Karaoke contracts
    3. Returns file path for download

    For Karaoke: generates DOCX with pricing blocks.
    For other domains: creates contract but DOCX may not be available yet.
    """
    # Check write enabled
    if not bool(settings.create_contract_write_enabled):
        response.status_code = status.HTTP_423_LOCKED
        return CreateAndExportDocxResponse(
            ok=False,
            mode="disabled",
            message="Contract creation is disabled. Set CREATE_CONTRACT_WRITE_ENABLED=true.",
            contract_id=None,
            contract_no=None,
            docx_path=None,
            docx_export_skipped=True,
            docx_skip_reason="Feature disabled",
        )

    # Check app instance
    if str(settings.app_instance or "").strip() not in {"new-app", "new-app-main-db-dev"}:
        response.status_code = status.HTTP_423_LOCKED
        return CreateAndExportDocxResponse(
            ok=False,
            mode="refused",
            message="Contract creation refused: APP_INSTANCE not recognized.",
            contract_id=None,
            contract_no=None,
            docx_path=None,
            docx_export_skipped=True,
            docx_skip_reason="Invalid APP_INSTANCE",
        )

    current_user = _get_current_user(credentials=credentials, db=db)
    _ = get_user_permissions(db=db, user=current_user)

    client = payload.client_preflight if isinstance(payload.client_preflight, dict) else {}
    if not client:
        client = payload.draft if isinstance(payload.draft, dict) else {}

    if not client.get("don_vi_ten"):
        response.status_code = status.HTTP_400_BAD_REQUEST
        return CreateAndExportDocxResponse(
            ok=False,
            mode="validation",
            message="don_vi_ten (customer name) is required.",
            contract_id=None,
            contract_no=None,
            docx_path=None,
            docx_export_skipped=True,
            docx_skip_reason="Missing required fields",
        )

    # Ensure contract_no is built from parts if not present
    if not client.get("contract_no"):
        short_no = client.get("contract_no") or client.get("short_no")
        year = client.get("contract_year")
        region_code = client.get("region_code")
        field_code = client.get("field_code")
        if short_no and year and region_code and field_code:
            client["contract_no"] = f"{short_no}/{year}/{region_code}/{field_code}"
        else:
            # Try to build from nested contract info
            if client.get("contract_no"):
                pass  # already set
            else:
                response.status_code = status.HTTP_400_BAD_REQUEST
                return CreateAndExportDocxResponse(
                    ok=False,
                    mode="validation",
                    error_code="CONTRACT_NO_REQUIRED",
                    message="Thiếu số hợp đồng. Vui lòng nhập số hợp đồng.",
                    contract_id=None,
                    contract_no=None,
                    docx_path=None,
                    docx_export_skipped=True,
                    docx_skip_reason="Missing contract_no",
                )

    logger.info(
        "[create-contract] normalized contract_no=%s client_keys=%s",
        client.get("contract_no"),
        list(client.keys()) if client else [],
    )
    _write_debug_log = bool(settings.debug_contract_create)
    if _write_debug_log:
        with open("debug-390525.log", "a", encoding="utf-8") as _debug_log:
            _debug_log.write(json.dumps({
                "sessionId": "390525",
                "runId": "repro-backend",
                "hypothesisId": "H1",
                "location": "contracts.py:2680",
                "message": "create-and-export-docx request",
                "data": {
                    "client_keys": list(client.keys()) if client else [],
                    "linh_vuc": client.get("linh_vuc"),
                    "room_keys": [k for k in (client.keys() if isinstance(client, dict) else []) if "room" in k.lower() or "phong" in k.lower() or "box" in k.lower() or "karaoke" in k.lower()],
                    "room_values": {k: client.get(k) for k in [k for k in (client.keys() if isinstance(client, dict) else []) if "room" in k.lower() or "phong" in k.lower() or "box" in k.lower() or "karaoke" in k.lower()]}
                },
                "timestamp": int(datetime.datetime.utcnow().timestamp()*1000)
            }) + "\n")

    # Create contract
    try:
        created = insert_contract_record_simple(db=db, candidate=client)
        contract_id = int(created.get("id")) if created.get("id") else None
        contract_no = created.get("contract_no")
        if _write_debug_log:
            with open("debug-390525.log", "a", encoding="utf-8") as _debug_log:
                _debug_log.write(json.dumps({
                    "sessionId": "390525",
                    "runId": "repro-backend",
                    "hypothesisId": "H1",
                    "location": "contracts.py:2691",
                    "message": "create-and-export-docx response",
                    "data": {
                        "ok": True,
                        "mode": "created",
                        "contract_id": contract_id,
                        "contract_no": contract_no,
                    },
                    "timestamp": int(datetime.datetime.utcnow().timestamp()*1000)
                }) + "\n")
    except ValueError as exc:
        # Pre-check found duplicate - this is expected, return clean 409
        if "đã tồn tại" in str(exc):
            db.rollback()
            # Extract contract_no from candidate
            full_no = client.get("contract_no") if client else None
            year = client.get("contract_year") if client else None
            suggested_next = None
            existing_id = None

            # Try to find existing contract and suggested next
            if full_no and year:
                parts = full_no.split("/")
                if len(parts) >= 4:
                    try:
                        existing = db.query(ContractRecordRow).filter(
                            ContractRecordRow.contract_year == int(year),
                            ContractRecordRow.contract_no == full_no,
                            ContractRecordRow.annex_no.is_(None),
                        ).first()
                        if existing:
                            existing_id = existing.id
                            suggested_next = _find_next_available(
                                db, parts[0], int(parts[1]), parts[2], parts[3]
                            )
                    except (ValueError, IndexError):
                        pass

            response.status_code = status.HTTP_409_CONFLICT
            return CreateAndExportDocxResponse(
                ok=False,
                mode="duplicate",
                error_code="CONTRACT_NO_EXISTS",
                message="Số hợp đồng đã tồn tại. Vui lòng nhập số khác.",
                contract_id=None,
                contract_no=full_no,
                docx_path=None,
                docx_export_skipped=True,
                docx_skip_reason="Duplicate contract_no",
                existing_contract_id=existing_id,
                suggested_next=suggested_next,
            )
        # Other ValueError - validation issue
        db.rollback()
        response.status_code = status.HTTP_400_BAD_REQUEST
        return CreateAndExportDocxResponse(
            ok=False,
            mode="validation",
            error_code="VALIDATION_ERROR",
            message=str(exc),
            contract_id=None,
            contract_no=None,
            docx_path=None,
            docx_export_skipped=True,
            docx_skip_reason="Validation error",
        )
    except IntegrityError as exc:
        db.rollback()
        logger.exception("create_and_export_docx IntegrityError: %s", exc)

        # Check SQLSTATE code for proper error classification
        sqlstate = getattr(exc, 'pgcode', None)
        error_detail = str(exc).lower()

        # 23502 = not_null_violation
        if sqlstate == '23502' or 'not null' in error_detail:
            response.status_code = status.HTTP_400_BAD_REQUEST
            return CreateAndExportDocxResponse(
                ok=False,
                mode="validation",
                error_code="CONTRACT_NO_REQUIRED",
                message="Thiếu số hợp đồng. Vui lòng nhập số hợp đồng.",
                contract_id=None,
                contract_no=None,
                docx_path=None,
                docx_export_skipped=True,
                docx_skip_reason="NotNullViolation on contract_no",
            )

        # 23505 = unique_violation (duplicate)
        if sqlstate == '23505' or 'duplicate' in error_detail or 'unique' in error_detail:
            response.status_code = status.HTTP_409_CONFLICT
            return CreateAndExportDocxResponse(
                ok=False,
                mode="duplicate",
                error_code="CONTRACT_NO_EXISTS",
                message="Số hợp đồng đã tồn tại. Vui lòng nhập số khác.",
                contract_id=None,
                contract_no=client.get("contract_no"),
                docx_path=None,
                docx_export_skipped=True,
                docx_skip_reason="Duplicate contract_no (DB constraint)",
            )

        # Other constraint violation - return error with details
        response.status_code = status.HTTP_409_CONFLICT
        return CreateAndExportDocxResponse(
            ok=False,
            mode="constraint_error",
            error_code="INTEGRITY_ERROR",
            message="Không thể tạo hợp đồng do lỗi dữ liệu. Vui lòng kiểm tra lại thông tin.",
            contract_id=None,
            contract_no=None,
            docx_path=None,
            docx_export_skipped=True,
            docx_skip_reason="Database constraint error",
        )
    except Exception as exc:
        db.rollback()
        logger.exception("create_and_export_docx failed: %s", exc)
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return CreateAndExportDocxResponse(
            ok=False,
            mode="error",
            message=f"Tạo hợp đồng thất bại: {exc}",
            contract_id=None,
            contract_no=None,
            docx_path=None,
            docx_export_skipped=True,
            docx_skip_reason="Internal error",
        )

    if contract_id is None:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return CreateAndExportDocxResponse(
            ok=False,
            mode="error",
            message="Contract created but ID not returned.",
            contract_id=None,
            contract_no=contract_no,
            docx_path=None,
            docx_export_skipped=True,
            docx_skip_reason="Missing contract ID",
        )

    # Try to export DOCX for Karaoke
    docx_path = None
    docx_export_skipped = False
    docx_skip_reason = None

    domain_code = str(client.get("linh_vuc") or "").upper()
    # Normalize KHU_VUI_CHOI variations (match download_contract_docx behavior)
    if domain_code in ("KHU_VUI_CHOI", "KVC", "KHU_VUI_CHOI_GIAI_TRI", "CITYGAMES"):
        domain_code = "KHU_VUI_CHOI"
    # #region agent log
    import sys as _sys
    try:
        with open(r"F:\APPs\debug-bb17f6.log", "a", encoding="utf-8") as _f:
            _f.write(__import__("json").dumps({"sessionId":"bb17f6","location":"backend/app/api/contracts.py:create_and_export_docx","message":"docx dispatcher entry - H1","data":{"contract_id":contract_id,"contract_no":contract_no,"domain_raw":client.get("linh_vuc"),"domain_normalized":domain_code,"will_route":"KARAOKE" if domain_code=="KARAOKE" else ("KHU_VUI_CHOI" if domain_code=="KHU_VUI_CHOI" else "SKIP")},"timestamp":int(__import__("time").time()*1000)})+"\n")
    except Exception: pass
    # #endregion

    if domain_code == "KARAOKE":
        try:
            from ..services.karaoke_export_preview import render_karaoke_docx_preview

            # Simplified flow: no pricing_snapshot needed for DOCX export
            result = render_karaoke_docx_preview(
                db=db,
                contract_id=contract_id,
            )
            if result.ok and result.preview_path:
                # Verify file actually exists before reporting success
                preview_path = Path(result.preview_path)
                if preview_path.exists() and preview_path.stat().st_size > 0:
                    docx_path = str(preview_path)
                else:
                    docx_export_skipped = True
                    docx_skip_reason = (
                        f"DOCX preview missing on disk: {result.preview_path}"
                    )
                    logger.warning(
                        "[create-contract] DOCX preview file missing for contract_id=%s contract_no=%s path=%s",
                        contract_id, contract_no, result.preview_path,
                    )
            else:
                docx_export_skipped = True
                warnings_list = getattr(result, "warnings", None) or []
                docx_skip_reason = (
                    "; ".join(warnings_list) if warnings_list
                    else "render_karaoke_docx_preview did not produce preview_path"
                )
                logger.warning(
                    "[create-contract] DOCX render did not succeed for contract_id=%s contract_no=%s warnings=%s",
                    contract_id, contract_no, warnings_list,
                )
        except Exception as exc:
            docx_export_skipped = True
            docx_skip_reason = f"DOCX export failed ({type(exc).__name__}): {exc}"
            logger.warning(
                "[create-contract] DOCX export threw contract_id=%s contract_no=%s domain=%s template=%s exception=%s: %s",
                contract_id, contract_no, domain_code,
                client.get("contract_template_code"), type(exc).__name__, exc,
            )
    elif domain_code == "KHU_VUI_CHOI":
        # KVC: route to existing render_kvc_docx_preview (already used by GET /download-docx)
        try:
            from ..services.kvc_export_preview import render_kvc_docx_preview
            # #region agent log
            try:
                with open(r"F:\APPs\debug-bb17f6.log", "a", encoding="utf-8") as _f:
                    _f.write(__import__("json").dumps({"sessionId":"bb17f6","location":"backend/app/api/contracts.py:create_and_export_docx","message":"KVC branch entered - H1","data":{"contract_id":contract_id,"contract_no":contract_no},"timestamp":int(__import__("time").time()*1000)})+"\n")
            except Exception: pass
            # #endregion
            result = render_kvc_docx_preview(db=db, contract_id=contract_id)
            if result.ok and result.preview_path:
                preview_path = Path(result.preview_path)
                if preview_path.exists() and preview_path.stat().st_size > 0:
                    docx_path = str(preview_path)
                else:
                    docx_export_skipped = True
                    docx_skip_reason = f"DOCX preview missing on disk: {result.preview_path}"
                    logger.warning(
                        "[create-contract] KVC DOCX preview file missing contract_id=%s contract_no=%s path=%s",
                        contract_id, contract_no, result.preview_path,
                    )
            else:
                docx_export_skipped = True
                warnings_list = getattr(result, "warnings", None) or []
                docx_skip_reason = (
                    "; ".join(warnings_list) if warnings_list
                    else "render_kvc_docx_preview did not produce preview_path"
                )
                logger.warning(
                    "[create-contract] KVC DOCX render did not succeed contract_id=%s contract_no=%s warnings=%s",
                    contract_id, contract_no, warnings_list,
                )
        except Exception as exc:
            docx_export_skipped = True
            docx_skip_reason = f"DOCX export failed ({type(exc).__name__}): {exc}"
            logger.warning(
                "[create-contract] KVC DOCX export threw contract_id=%s contract_no=%s template=%s exception=%s: %s",
                contract_id, contract_no,
                client.get("contract_template_code"), type(exc).__name__, exc,
            )
    else:
        docx_export_skipped = True
        docx_skip_reason = f"DOCX export not available for domain: {domain_code}"

    response.status_code = status.HTTP_201_CREATED

    # Build suggested DOCX filename (no new DB columns).
    # Fetch the full row from DB so filename includes music_usage_areas / totals.
    docx_filename: str | None = None
    if docx_path and contract_id:
        try:
            row_for_filename = db.query(ContractRecordRow).filter(
                ContractRecordRow.id == int(contract_id)
            ).first()
            if row_for_filename is not None:
                from app.services.contract_filename import build_contract_docx_filename
                docx_filename = build_contract_docx_filename(row_for_filename)
        except Exception as fn_exc:
            logger.warning(
                "[create-contract] could not build filename contract_id=%s err=%s",
                contract_id, fn_exc,
            )
            docx_filename = None

    return CreateAndExportDocxResponse(
        ok=True,
        mode="created_with_docx" if docx_path else "created_no_docx",
        message="Hợp đồng đã được tạo." + (" DOCX đã được xuất." if docx_path else ""),
        contract_id=contract_id,
        contract_no=contract_no,
        docx_path=docx_path,
        docx_export_skipped=docx_export_skipped,
        docx_skip_reason=docx_skip_reason,
        docx_filename=docx_filename,
    )


@router.get("/{contract_id}/download-docx")
def download_contract_docx(
    contract_id: int,
    template_code: str | None = Query(default=None, description="Override template code: TEMPLATE_1 or TEMPLATE_2"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    """Download DOCX file for a contract.

    Supports Karaoke, KVC, and Background contracts with generated DOCX.
    For Background contracts: uses contract_template_code (TEMPLATE_1/TEMPLATE_2)
    to select template. Query param `template_code` overrides DB field.

    Returns FileResponse on success, or JSON with error details on failure.
    """
    # Auth check - get current user for executor fields
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db=db, user=current_user)

    # Download is gated behind `contracts.read` (or update/delete, which imply
    # read) AND record visibility, so a list-only user cannot guess an id and
    # download a contract outside their scope. The list endpoint still allows
    # rows to be seen, but downloading the artifact is a detail-level action.
    if not has_contract_detail_read(permissions):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền tải xuống hợp đồng.",
        )

    query = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.id == int(contract_id))
        .filter(ContractRecordRow.annex_no.is_(None))
    )
    query = _apply_contract_visibility(query=query, user=current_user, permissions=permissions, db=db)
    row = query.first()
    if not row:
        return {
            "ok": False,
            "error_code": "CONTRACT_NOT_FOUND",
            "message": "Không tìm thấy hợp đồng.",
            "contract_id": contract_id,
        }, status.HTTP_404_NOT_FOUND

    domain_code = str(row.linh_vuc or "").upper()
    # Normalize KHU_VUI_CHOI variations
    if domain_code in ("KHU_VUI_CHOI", "KVC", "KHU_VUI_CHOI_GIAI_TRI", "CITYGAMES"):
        domain_code = "KHU_VUI_CHOI"

    # Define supported domains
    karaoke_domains = {"KARAOKE"}
    kvc_domains = {"KHU_VUI_CHOI"}
    # All non-karaoke, non-kvc domains use Background renderer with template_code
    background_domains = {
        "CAFE", "NHA_HANG", "CHAM_SOC_SUC_KHOE",
        "PHONG_THU_AM", "KHACH_SAN", "BAR", "VAN_PHONG",
        "CUA_HANG", "RAP_CHIEU", "PHONG_TRA", "SCTT", "BD",
        "COFFEE", "RESTAURANT", "FNB", "HEALTHCARE",
        "GAME_CENTER", "ARCADE", "RECORDING_STUDIO",
        "CLUB", "LOUNGE", "SPA", "GYM", "FITNESS", "YOGA",
        "EDUCATION", "OTHER", "BACKGROUND",
    }

    if domain_code not in karaoke_domains | kvc_domains | background_domains:
        return {
            "ok": False,
            "error_code": "DOCX_EXPORT_UNSUPPORTED_DOMAIN",
            "message": f"Chưa có mẫu Word cho lĩnh vực: {row.linh_vuc_hien_thi or domain_code}",
            "domain_code": domain_code,
        }, status.HTTP_400_BAD_REQUEST

    # Generate DOCX
    try:
        if domain_code == "KARAOKE":
            from ..services.karaoke_export_preview import render_karaoke_docx_preview
            # GET /download-docx: simplified flow uses DB data, no pricing_snapshot needed
            result = render_karaoke_docx_preview(
                db=db,
                contract_id=contract_id,
            )
        elif domain_code == "KHU_VUI_CHOI":
            from ..services.kvc_export_preview import render_kvc_docx_preview
            result = render_kvc_docx_preview(db=db, contract_id=contract_id)
        else:
            # Background domain - use template_code resolver (not domain-based)
            from ..services.background_export_preview import render_background_docx_preview
            result = render_background_docx_preview(
                db=db,
                contract_id=contract_id,
                template_code_override=template_code,  # Query param overrides DB field
                executor_user=current_user,  # Pass current user for executor fields
            )

        # For Background domains, validation failure means we don't return corrupted file
        if not result.ok:
            logger.warning(
                "download_contract_docx: DOCX generation/validation failed for contract_id=%s domain=%s",
                contract_id, domain_code
            )
            # Check if it's a validation error (corrupted file)
            if any("VALIDATION FAILED" in w or "lỗi cấu trúc" in w for w in result.warnings):
                return {
                    "ok": False,
                    "error_code": "DOCX_VALIDATION_FAILED",
                    "message": "File Word export bị lỗi cấu trúc, vui lòng kiểm tra renderer.",
                    "contract_id": contract_id,
                    "warnings": result.warnings,
                }, status.HTTP_500_INTERNAL_SERVER_ERROR

        file_path = Path(result.preview_path)
        if not file_path.exists():
            logger.warning("download_contract_docx: File not found: %s", file_path)
            return {
                "ok": False,
                "error_code": "DOCX_NOT_FOUND",
                "message": "Không tìm thấy file Word đã xuất.",
                "expected_path": str(file_path),
            }, status.HTTP_404_NOT_FOUND

        # Validate DOCX structure before returning file
        try:
            import zipfile
            with zipfile.ZipFile(file_path) as z:
                names = set(z.namelist())
                if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                    logger.warning(
                        "download_contract_docx: Invalid DOCX structure for contract_id=%s, names=%s",
                        contract_id, sorted(names)
                    )
                    return {
                        "ok": False,
                        "error_code": "DOCX_INVALID_STRUCTURE",
                        "message": "File Word export bị lỗi cấu trúc, không chứa document.xml.",
                        "contract_id": contract_id,
                    }, status.HTTP_500_INTERNAL_SERVER_ERROR
            if file_path.stat().st_size == 0:
                logger.warning("download_contract_docx: Empty file for contract_id=%s", contract_id)
                return {
                    "ok": False,
                    "error_code": "DOCX_EMPTY",
                    "message": "File Word export rỗng.",
                    "contract_id": contract_id,
                }, status.HTTP_500_INTERNAL_SERVER_ERROR
        except zipfile.BadZipFile:
            logger.warning("download_contract_docx: Bad ZIP for contract_id=%s path=%s", contract_id, file_path)
            return {
                "ok": False,
                "error_code": "DOCX_INVALID",
                "message": "File Word export không hợp lệ (không phải ZIP/DOCX).",
                "contract_id": contract_id,
            }, status.HTTP_500_INTERNAL_SERVER_ERROR

        # Build safe download filename using the canonical helper.
        # Format: <short_no>_<year>_<customer>_<province>.docx
        try:
            from app.services.contract_filename import build_contract_docx_filename
            download_filename = build_contract_docx_filename(row)
        except Exception as filename_exc:
            logger.warning(
                "download_contract_docx: filename helper failed for contract_id=%s err=%s",
                contract_id, filename_exc,
            )
            safe_name = str(row.contract_no or f"contract_{contract_id}").replace("/", "_").replace("\\", "_")
            download_filename = f"{safe_name}.docx"

        return FileResponse(
            path=str(file_path),
            filename=download_filename,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("download_contract_docx failed: %s", exc)
        return {
            "ok": False,
            "error_code": "INTERNAL_ERROR",
            "message": "Lỗi khi tải file Word.",
        }, status.HTTP_500_INTERNAL_SERVER_ERROR


# =============================================================================
# DOWNLOAD GENERATED DOCX BY PATH (FIX: avoid GET regenerating without snapshot)
# =============================================================================


class DownloadGeneratedDocxRequest(BaseModel):
    """Request to download an already-generated DOCX file."""
    contract_id: int = Field(description="Contract ID to verify ownership/existence")
    docx_path: str = Field(description="Absolute path to the generated DOCX file")


ALLOWED_DOCX_BASE_DIRS = [
    Path("F:\\APPs\\storage\\preview"),
    Path("F:\\APPs\\storage\\exports"),
]


def _is_path_safe(requested_path: str) -> tuple[bool, str | None]:
    """Check if requested path is within allowed directories and is a valid DOCX file.

    Returns (is_safe, error_message).
    """
    try:
        requested = Path(requested_path).resolve()
    except Exception:
        return False, "Invalid path"

    # Must have .docx extension
    if requested.suffix.lower() != ".docx":
        return False, "File must have .docx extension"

    # Check against allowed base directories
    is_allowed = False
    for base_dir in ALLOWED_DOCX_BASE_DIRS:
        try:
            base_resolved = base_dir.resolve()
            requested.relative_to(base_resolved)
            is_allowed = True
            break
        except ValueError:
            continue

    if not is_allowed:
        return False, f"Path must be within allowed directories: {[str(d) for d in ALLOWED_DOCX_BASE_DIRS]}"

    return True, None


@router.post("/download-generated-docx")
def download_generated_docx(
    body: DownloadGeneratedDocxRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> FileResponse:
    """Download an already-generated DOCX file by its path.

    This endpoint is used after POST create-and-export-docx when the file was already
    generated with pricing_snapshot. Unlike GET /download-docx which regenerates,
    this downloads the exact file that was created.

    Security:
    - Requires authentication
    - List-only accounts cannot download.
    - Validates contract exists and user has access
    - Only allows files within F:\\APPs\\storage\\preview and F:\\APPs\\storage\\exports
    - Validates file exists and is a valid DOCX
    """
    # Auth check
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db=db, user=current_user)

    if not has_contract_list(permissions):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền tải xuống hợp đồng.",
        )

    # Visibility check: the contract must be in scope for this user.
    allowed_codes: set[str] = set()
    if not _is_full_access_user(current_user, permissions):
        allowed_codes = _get_allowed_domain_codes_for_user(db=db, user=current_user)
        if not allowed_codes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tài khoản chưa được cấp lĩnh vực nào.",
            )

    # Verify contract exists and is in scope
    row = db.query(ContractRecordRow).filter(ContractRecordRow.id == int(body.contract_id)).first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy hợp đồng {body.contract_id}"
        )

    if not _is_full_access_user(current_user, permissions):
        row_domain = str(row.linh_vuc or row.field_code or row.domain_group or "").strip().upper()
        allowed_upper = {c.upper() for c in allowed_codes}
        if row_domain not in allowed_upper:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Không tìm thấy hợp đồng.",
            )

    # Security: validate path is within allowed directories
    is_safe, error_msg = _is_path_safe(body.docx_path)
    if not is_safe:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không được phép tải file từ đường dẫn này: {error_msg}"
        )

    # Check file exists
    file_path = Path(body.docx_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File không tồn tại: {body.docx_path}"
        )

    # Validate it's a valid DOCX (check zip structure)
    try:
        import zipfile
        with zipfile.ZipFile(file_path, "r") as z:
            names = set(z.namelist())
            if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="File không phải là DOCX hợp lệ"
                )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể đọc file DOCX: {exc}"
        )

    # Generate safe filename using the canonical helper.
    try:
        from app.services.contract_filename import build_contract_docx_filename
        safe_filename = build_contract_docx_filename(row)
    except Exception as filename_exc:
        logger.warning(
            "download_generated_docx: filename helper failed for contract_id=%s err=%s",
            row.id, filename_exc,
        )
        safe_name = str(row.contract_no or f"contract_{row.id}").replace("/", "_").replace("\\", "_")
        safe_filename = f"{safe_name}.docx"

    logger.info(
        "download_generated_docx: serving existing file for contract_id=%s path=%s",
        body.contract_id, body.docx_path
    )

    return FileResponse(
        path=file_path,
        filename=safe_filename,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


def _run_karaoke_make_hd_word(
    payload: KaraokeMakeHdPreviewRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> KaraokeMakeHdPreviewResponse:
    if str(settings.app_instance or "").strip() != "new-app":
        raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="Refused because APP_INSTANCE is not new-app.")
    if not bool(settings.create_contract_write_enabled):
        raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="CREATE_CONTRACT_WRITE_ENABLED is false.")
    if bool(settings.create_contract_rollback_only):
        raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="CREATE_CONTRACT_ROLLBACK_ONLY must be false.")
    if not bool(settings.create_contract_clone_only_enabled):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="CREATE_CONTRACT_CLONE_ONLY_ENABLED must be true for Karaoke make-hd.",
        )

    _assert_create_runtime_safe(db)
    current_user = _get_current_user(credentials=credentials, db=db)
    _ = get_user_permissions(db=db, user=current_user)

    candidate: dict[str, object] = {}
    if isinstance(payload.client_preflight, dict):
        candidate = dict(payload.client_preflight)
    elif isinstance(payload.draft, dict):
        candidate = dict(payload.draft)

    from ..services.karaoke_old_app_direct_flow import make_karaoke_hd_word_old_app_direct

    result = make_karaoke_hd_word_old_app_direct(db=db, payload=candidate)
    return KaraokeMakeHdPreviewResponse(
        ok=result.ok,
        contract_id=result.contract_id,
        contract_no=result.contract_no,
        word_path=result.word_path,
        preview_path=result.word_path,
        file_size=result.file_size,
        db_name=result.db_name,
        render_context_keys=result.render_context_keys,
        missing_placeholders=result.missing_placeholders,
        unresolved_placeholders=result.unresolved_placeholders,
        db_write_performed=result.db_write_performed,
        docx_path_attached=result.docx_path_attached,
        official_export=result.official_export,
        gcn_created=result.gcn_created,
        warnings=result.warnings,
    )


@router.post("/karaoke/make-hd", response_model=KaraokeMakeHdPreviewResponse)
def post_karaoke_make_hd(
    payload: KaraokeMakeHdPreviewRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> KaraokeMakeHdPreviewResponse:
    return _run_karaoke_make_hd_word(payload=payload, credentials=credentials, db=db)


@router.post("/karaoke/make-hd-preview", response_model=KaraokeMakeHdPreviewResponse)
def post_karaoke_make_hd_preview(
    payload: KaraokeMakeHdPreviewRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> KaraokeMakeHdPreviewResponse:
    return _run_karaoke_make_hd_word(payload=payload, credentials=credentials, db=db)


@router.get("/{contract_id}/export-plan", response_model=ContractExportPlanResponse)
def get_contract_export_plan(
    contract_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> ContractExportPlanResponse:
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db, current_user)

    query = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.id == int(contract_id))
        .filter(ContractRecordRow.annex_no.is_(None))
    )
    query = _apply_contract_visibility(query=query, user=current_user, permissions=permissions, db=db)

    row = query.first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")

    return resolve_contract_export_plan(row=row)


@router.get("/{contract_id}/certificate-context-dry-run", response_model=CertificateContextDryRunResponse)
def get_contract_certificate_context_dry_run(
    contract_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> CertificateContextDryRunResponse:
    db.execute(text("SET TRANSACTION READ ONLY"))
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db, current_user)

    query = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.id == int(contract_id))
        .filter(ContractRecordRow.annex_no.is_(None))
        .filter(func.lower(func.coalesce(ContractRecordRow.domain_group, "")) == BACKGROUND_WORKSPACE_CODE)
    )
    query = _apply_contract_visibility(query=query, user=current_user, permissions=permissions, db=db)

    row = query.first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")

    return CertificateContextDryRunResponse(
        context=build_context_from_contract_row(row, db=db),
        locked_layout=locked_layout_metadata(),
    )


@router.post("/{contract_id}/certificate-create-dry-run", response_model=CertificateCreateDryRunResponse)
def post_contract_certificate_create_dry_run(
    contract_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> CertificateCreateDryRunResponse:
    db.execute(text("SET TRANSACTION READ ONLY"))
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db, current_user)

    query = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.id == int(contract_id))
        .filter(ContractRecordRow.annex_no.is_(None))
    )
    query = _apply_contract_visibility(query=query, user=current_user, permissions=permissions, db=db)

    row = query.first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")

    return build_certificate_create_dry_run(db=db, contract=row)


@router.post("/{contract_id}/certificates/draft", response_model=CreateCertificateDraftResponse)
def create_contract_certificate_draft(
    contract_id: int,
    payload: CreateCertificateDraftRequest | None = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> CreateCertificateDraftResponse:
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db, current_user)

    query = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.id == int(contract_id))
        .filter(ContractRecordRow.annex_no.is_(None))
        .filter(func.lower(func.coalesce(ContractRecordRow.domain_group, "")) == BACKGROUND_WORKSPACE_CODE)
    )
    query = _apply_contract_visibility(query=query, user=current_user, permissions=permissions, db=db)

    row = query.first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")

    payload_dict = payload.model_dump() if payload else {}
    return create_certificate_draft(db=db, contract=row, payload=payload_dict)


@router.post("/{contract_id}/export-docx-text-dry-run", response_model=ExportDryRunResponse)
def post_contract_export_docx_text_dry_run(
    contract_id: int,
    request: ExportDryRunRequest | None = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> ExportDryRunResponse:
    """Render contract DOCX text placeholders to a temporary file (DRY-RUN ONLY).

    This endpoint:
    - Renders text placeholders using docxtpl
    - Optionally inserts KVC pricing/usage blocks (if include_kvc_blocks=true)
    - Outputs to a temporary file only
    - Does NOT write to permanent storage
    - Does NOT update DB

    Only KVC and Karaoke domains are supported in this phase.

    Request body (optional):
    {
        "include_kvc_blocks": true,   // Attempt KVC block insertion
        "pricing_context": {...},     // Context for block insertion
        "dry_run_label": "KVC test"  // Optional label
    }

    Safety guarantees:
    - No permanent file output
    - No DB write
    - No docx_path attachment
    - No GCN creation
    """
    from ..schemas.export_dry_run import ExportDryRunRequest as _RequestSchema

    body = _RequestSchema.model_validate(request) if request else None

    db.execute(text("SET TRANSACTION READ ONLY"))
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db=db, user=current_user)

    from ..services.contract_export_dry_run import render_contract_docx_text_dry_run

    return render_contract_docx_text_dry_run(db=db, contract_id=contract_id, request=body)


@router.post("/{contract_id}/export-docx-preview", response_model=ExportPreviewResponse)
def post_contract_export_docx_preview(
    contract_id: int,
    request: ExportPreviewRequest | None = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> ExportPreviewResponse:
    """Render contract DOCX to a preview file for manual inspection.

    This endpoint:
    - Renders text placeholders using docxtpl
    - Inserts pricing/usage blocks if include_blocks=true and context provided
    - Writes preview DOCX to F:\\APPs\\storage\\preview\\
    - Does NOT write to DB
    - Does NOT attach docx_path
    - Does NOT create official/permanent export

    Only KVC and Karaoke domains are supported.

    Request body (optional):
    {
        "include_blocks": true,        // Attempt block insertion
        "pricing_context": {...},       // Context for block insertion
        "synthetic_preview": false,  // Mark as synthetic/sample
        "dry_run_label": "preview test"
    }

    Preview file naming:
    - PREVIEW_KARAOKE_{contract_id}_{timestamp}.docx
    - PREVIEW_KVC_{contract_id}_{timestamp}.docx
    - PREVIEW_KVC_SYNTHETIC_{timestamp}.docx (for synthetic)
    """
    from ..schemas.export_preview import ExportPreviewRequest as _PreviewRequestSchema
    from ..schemas.export_preview import ExportPreviewResponse as _ResponseSchema

    body = _PreviewRequestSchema.model_validate(request) if request else None

    db.execute(text("SET TRANSACTION READ ONLY"))
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db=db, user=current_user)

    try:
        result = render_contract_docx_preview(db=db, contract_id=contract_id, request=body)
        # Validate DOCX structure before returning
        if result.preview_path:
            from pathlib import Path
            import zipfile
            file_path = Path(result.preview_path)
            if file_path.exists() and file_path.stat().st_size > 0:
                try:
                    with zipfile.ZipFile(file_path) as z:
                        names = set(z.namelist())
                        if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                            logger.warning("post_contract_export_docx_preview: Invalid DOCX structure: %s", sorted(names))
                            return _ResponseSchema(
                                ok=False,
                                message="File Word export bị lỗi cấu trúc.",
                                warnings=["DOCX_VALIDATION_FAILED: Invalid DOCX structure."],
                            )
                except zipfile.BadZipFile:
                    logger.warning("post_contract_export_docx_preview: Bad ZIP: %s", file_path)
                    return _ResponseSchema(
                        ok=False,
                        message="File Word export không hợp lệ.",
                        warnings=["DOCX_VALIDATION_FAILED: Bad ZIP file."],
                    )
        return result
    except Exception as exc:
        logger.exception("post_contract_export_docx_preview failed for contract_id=%s: %s", contract_id, exc)
        return _ResponseSchema(
            ok=False,
            message=f"Lỗi khi tạo Word preview: {exc}",
            warnings=[str(exc)],
        )


@router.post("/{contract_id}/export-karaoke-preview", response_model=KaraokeExportPreviewResponse)
def post_karaoke_export_preview(
    contract_id: int,
    request: KaraokeExportPreviewRequest | None = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> KaraokeExportPreviewResponse:
    """Get Karaoke export preview context without generating file.

    This endpoint:
    - Fetches contract data
    - Builds karaoke calculation
    - Builds DOCX render context
    - Returns preview data (no file output)

    For full DOCX render, use POST /{contract_id}/export-karaoke-docx.

    Request body (optional):
    {
        "include_calculation": true,        // Include full calculation result
        "render_mode": "table",            // Render mode (table or text)
        "pricing_render_mode": "TABLE",     // Pricing block mode (TABLE or ROWS)
        "effective_term_months": 12         // Override term (6 or 12), auto-detect if null
    }
    """
    from ..schemas.karaoke_export import KaraokeExportPreviewRequest as _Schema

    body = _Schema.model_validate(request) if request else _Schema()

    db.execute(text("SET TRANSACTION READ ONLY"))
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db=db, user=current_user)

    from ..services.karaoke_export_service import build_karaoke_export_preview_context

    row = db.query(ContractRecordRow).filter(ContractRecordRow.id == int(contract_id)).first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Contract {contract_id} not found"
        )

    # Check domain
    domain_code = str(row.linh_vuc or row.field_code or "").upper()
    if "KARAOKE" not in domain_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Contract {contract_id} is not a Karaoke contract (domain: {row.linh_vuc})"
        )

    return build_karaoke_export_preview_context(
        row=row,
        include_calculation=body.include_calculation,
        effective_term_months_override=body.effective_term_months,
        include_6_month_option=body.include_6_month_option,
    )


@router.post("/{contract_id}/export-karaoke-docx", response_model=ExportPreviewResponse)
def post_karaoke_export_docx(
    contract_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> ExportPreviewResponse:
    """Render Karaoke contract DOCX with room and pricing blocks to preview file.

    This endpoint:
    - Fetches contract data
    - Builds karaoke calculation and render context
    - Renders DOCX template with placeholders
    - Inserts karaoke room and pricing blocks
    - Writes preview DOCX to F:\\APPs\\storage\\preview\\

    This does NOT:
    - Write to DB
    - Attach docx_path
    - Create official export
    """
    db.execute(text("SET TRANSACTION READ ONLY"))
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db=db, user=current_user)

    from ..services.karaoke_export_preview import render_karaoke_docx_preview

    return render_karaoke_docx_preview(db=db, contract_id=contract_id)


@router.post("/export/preview/kvc-synthetic", response_model=ExportPreviewResponse)
def post_kvc_synthetic_preview(
    request: ExportPreviewRequest | None = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> ExportPreviewResponse:
    """Generate synthetic KVC preview DOCX for layout inspection.

    This endpoint creates a preview using sample CityGames data:
    - 855m2 => 7,400,000
    - 701m2 => 6,200,000
    - 920m2 => 7,800,000
    - subtotal = 21,400,000
    - GTGT 8% = 1,712,000
    - total = 23,112,000

    This does NOT:
    - Create a contract row
    - Write to DB
    - Create official export
    - Attach docx_path

    The preview file is marked as synthetic/sample.
    """
    from ..schemas.export_preview import ExportPreviewRequest as _PreviewRequestSchema
    from ..services.contract_export_preview import (
        ExportPreviewRequest as _PreviewServiceRequest,
        get_synthetic_kvc_pricing_context,
        render_contract_docx_preview,
    )

    body = _PreviewRequestSchema.model_validate(request) if request else _PreviewRequestSchema()

    # Mark as synthetic
    body.synthetic_preview = True

    # Build KVC synthetic pricing context
    pricing_context = get_synthetic_kvc_pricing_context()
    pricing_context["domain"] = "KVC"
    body.pricing_context = pricing_context

    # Convert to service request
    service_body = _PreviewServiceRequest(
        include_blocks=body.include_blocks,
        pricing_context=body.pricing_context,
        synthetic_preview=body.synthetic_preview,
        dry_run_label=body.dry_run_label,
    )

    db.execute(text("SET TRANSACTION READ ONLY"))
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db=db, user=current_user)

    return render_contract_docx_preview(db=db, contract_id=None, request=service_body)


@router.post("/export/preview/karaoke-synthetic", response_model=ExportPreviewResponse)
def post_karaoke_synthetic_preview(
    request: ExportPreviewRequest | None = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> ExportPreviewResponse:
    """Generate synthetic Karaoke ND17 preview DOCX for layout inspection.

    This endpoint creates a preview using sample ND17 Karaoke data:
    - 4 phòng đầu: 2,340,000 x 1.6 = 14,976,000
    - 6 phòng sau: 2,340,000 x 1.28 = 17,971,200
    - 16 phòng sau: 2,340,000 x 1.12 = 41,932,800
    - Subtotal: 74,880,000
    - GTGT 8%: 5,990,400
    - Total: 80,870,400

    This does NOT:
    - Create a contract row
    - Write to DB
    - Create official export
    - Attach docx_path

    The preview file is marked as synthetic/sample.
    """
    from ..schemas.export_preview import ExportPreviewRequest as _PreviewRequestSchema
    from ..services.contract_export_preview import (
        ExportPreviewRequest as _PreviewServiceRequest,
        get_synthetic_karaoke_nd17_pricing_context,
        render_contract_docx_preview,
    )

    body = _PreviewRequestSchema.model_validate(request) if request else _PreviewRequestSchema()

    # Mark as synthetic
    body.synthetic_preview = True

    # Build Karaoke ND17 synthetic pricing context
    pricing_context = get_synthetic_karaoke_nd17_pricing_context()
    pricing_context["domain"] = "KARAOKE"
    body.pricing_context = pricing_context

    # Convert to service request
    service_body = _PreviewServiceRequest(
        include_blocks=body.include_blocks,
        pricing_context=body.pricing_context,
        synthetic_preview=body.synthetic_preview,
        dry_run_label=body.dry_run_label,
    )

    db.execute(text("SET TRANSACTION READ ONLY"))
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db=db, user=current_user)

    return render_contract_docx_preview(db=db, contract_id=None, request=service_body)


@router.get("/{contract_id}", response_model=ContractDetailResponse)
def get_contract_detail(
    contract_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> ContractDetailResponse:
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db, current_user)

    # Detail page requires `contracts.read` (or update/delete which imply read).
    # List-only accounts must NOT be able to open a contract detail even by
    # guessing a record id. Use 403 here so the UI can show "Không có quyền"
    # inside the redesigned AppShell, distinct from the 404 the record-scope
    # check returns below.
    if not has_contract_detail_read(permissions):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn chỉ có quyền xem danh sách hợp đồng, không có quyền mở chi tiết.",
        )

    today = date.today()

    query = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.id == int(contract_id))
        .filter(ContractRecordRow.annex_no.is_(None))
    )
    query = _apply_contract_visibility(query=query, user=current_user, permissions=permissions, db=db)

    row = query.first()
    if row is None:
        # Avoid leaking existence of hidden records.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")

    domain_display = str(row.linh_vuc_hien_thi or row.field_code or row.domain_group or "").strip()

    # Parse music_usage_areas from DB (JSON string or dict)
    # Supports FAB multi-location fields
    raw_music_areas = row.get_music_usage_areas() if hasattr(row, "get_music_usage_areas") else []
    music_usage_areas_list: list[MusicUsageArea] = [
        MusicUsageArea(
            area_name=str(a.get("area_name", "") or ""),
            scale_description=str(a.get("scale_description", "") or ""),
            music_usage_type=str(a.get("music_usage_type", "") or ""),
            pricing_label=(str(a.get("pricing_label", "") or "").strip() or None),
            urban_class=str(a.get("urban_class", "") or ""),
            urban_coefficient=float(a.get("urban_coefficient") or 1.0),
            location_name=str(a.get("location_name", "") or ""),
            trade_name=str(a.get("trade_name", "") or ""),
            address_line=str(a.get("address_line", "") or ""),
            ward=str(a.get("ward", "") or ""),
            province=str(a.get("province", "") or ""),
            area_m2=float(a.get("area_m2") or 0),
            duration_months=int(a.get("duration_months") or 12),
            royalty_subtotal=float(a.get("royalty_subtotal") or 0),
        )
        for a in raw_music_areas
    ]

    return ContractDetailResponse(
        id=int(row.id),
        contract_no=str(row.contract_no or ""),
        contract_year=int(row.contract_year or _parse_contract_year(str(row.contract_no or "")) or 0),
        customer={
            "name": str(row.don_vi_ten or ""),
            "signage": row.ten_bang_hieu,
            "address": row.dia_chi_su_dung,
            "legal_address": row.don_vi_dia_chi,
            "usage_address": row.dia_chi_su_dung,
            "phone": row.don_vi_dien_thoai,
            "email": row.don_vi_email,
            "representative": row.don_vi_nguoi_dai_dien,
            "position": row.don_vi_chuc_vu,
            "mst": row.don_vi_mst,
        },
        domain={
            "display": domain_display,
            "field_code": row.field_code,
            "domain_group": row.domain_group,
        },
        dates={
            "signed_date": _to_iso(row.ngay_lap_hop_dong),
            "start_date": _to_iso(row.ngay_bat_dau),
            "end_date": _to_iso(row.ngay_ket_thuc),
        },
        financial={
            "amount": int(row.so_tien_value) if row.so_tien_value is not None else None,
            "total_amount": int(row.so_tien_value) if row.so_tien_value is not None else None,
            "currency": "VND",
            "amount_before_gtgt": int(row.so_tien_chua_gtgt_value) if row.so_tien_chua_gtgt_value is not None else None,
            "gtgt_percent": float(row.thue_percent) if row.thue_percent is not None else None,
            "gtgt_amount": int(row.thue_gtgt_value) if row.thue_gtgt_value is not None else None,
        },
        karaoke={
            "type": row.loai_hinh_karaoke,
            "room_count": row.tong_so_phong,
            "box_count": row.tong_so_box,
        },
        status=_derived_status(row, today=today),
        raw={
            "region_code": row.region_code,
            "renewal_status": row.renewal_status,
            "is_renewable": bool(row.is_renewable) if row.is_renewable is not None else None,
            "linh_vuc": row.linh_vuc,
        },
        music_usage_areas=music_usage_areas_list,
        # Phase 2 simplified royalty fields (canonical)
        # Exposed at top level so edit page can read authoritative values
        # without falling back to stale legacy columns when before_vat=0.
        royalty_amount_before_vat=int(row.royalty_amount_before_vat) if row.royalty_amount_before_vat is not None else None,
        vat_rate=float(row.vat_rate) if row.vat_rate is not None else None,
        vat_amount=int(row.vat_amount) if row.vat_amount is not None else None,
        royalty_amount_after_vat=int(row.royalty_amount_after_vat) if row.royalty_amount_after_vat is not None else None,
        royalty_amount_in_words=str(row.royalty_amount_in_words) if row.royalty_amount_in_words else None,
    )


# =============================================================================
# CONTRACT UPDATE ENDPOINT (PHASE CONTRACTS-ACTIONS-EDIT-01)
# Direct update to main DB for Background/Karaoke contracts.
# =============================================================================

ALLOWED_UPDATE_FIELDS = {
    # Contract info (fully editable)
    "contract_no",
    "ngay_lap_hop_dong",
    "contract_year",
    "region_code",
    "field_code",
    "linh_vuc",
    # Partner info
    "don_vi_ten",
    "ten_bang_hieu",
    "don_vi_dia_chi",
    "dia_chi_su_dung",
    # Post-2025 merger address fields
    "legal_address_line",
    "legal_ward",
    "legal_province",
    "legal_full_address",
    "usage_same_as_legal",
    "usage_address_line",
    "usage_ward",
    "usage_province",
    "usage_full_address",
    "don_vi_dien_thoai",
    "don_vi_email",
    "don_vi_nguoi_dai_dien",
    "don_vi_chuc_vu",
    "don_vi_mst",
    "nguoi_thuc_hien_email",
    "ngay_bat_dau",
    "ngay_ket_thuc",
    # Contract metadata
    "ngay_lap_hop_dong",
    "contract_year",
    "region_code",
    "field_code",
    "linh_vuc",
    # Financial fields
    "so_tien_chua_gtgt_value",
    "so_tien_value",  # Total amount
    "thue_percent",
    "thue_gtgt_value",  # GTGT amount
    "renewal_status",
    "contract_note",
    "contract_terms_note",
    "reference_contract_id",
    "reference_contract_no",
    # Karaoke specific
    "loai_hinh_karaoke",
    "tong_so_phong",
    "tong_so_box",
    # Phase 2: Music usage areas (source of truth for all domains)
    "music_usage_areas",
    # Phase 2: Simplified royalty fields
    "royalty_amount_before_vat",
    "vat_rate",
    "vat_amount",
    "royalty_amount_after_vat",
    "royalty_amount_in_words",
}


@router.patch("/{contract_id}", response_model=UpdateContractResponse)
def update_contract(
    contract_id: int,
    payload: UpdateContractRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> UpdateContractResponse:
    """Update a contract record directly on main DB.

    This endpoint:
    - Bearer auth required.
    - Requires edit or write permission on contracts.
    - Updates allowed fields directly to main DB.
    - No domain restrictions (all domain groups allowed).

    Fields that can be updated:
    - Partner info: don_vi_ten, ten_bang_hieu, don_vi_dia_chi, dia_chi_su_dung,
      don_vi_dien_thoai, don_vi_email, don_vi_nguoi_dai_dien, don_vi_chuc_vu, don_vi_mst
    - Term: ngay_bat_dau, ngay_ket_thuc
    - Finance: so_tien_chua_gtgt_value, thue_percent, renewal_status
    - Music usage: music_usage_areas (source of truth for all domains)
    - Simplified royalty: royalty_amount_before_vat, vat_rate, vat_amount,
      royalty_amount_after_vat, royalty_amount_in_words
    - Notes: contract_note
    """
    import logging
    _log = logging.getLogger(__name__)
    _log.warning(f"[UPDATE_CONTRACT] === START update_contract id={contract_id} ===")
    _log.warning(f"[UPDATE_CONTRACT] payload={payload.model_dump(exclude_unset=True)}")

    update_enabled = True
    clone_only_enabled = False

    # User authentication
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db=db, user=current_user)
    _log.warning(f"[UPDATE_CONTRACT] user={current_user.username} role={current_user.role} permissions={permissions}")

    # Check permission to edit contracts
    _log.warning(f"[UPDATE_CONTRACT] has_update={_has_permission(permissions, 'contracts', 'update')} has_write={_has_permission(permissions, 'contracts', 'write')}")
    if not _has_permission(permissions, "contracts", "update") and not _has_permission(permissions, "contracts", "write"):
        _log.warning(f"[UPDATE_CONTRACT] PERMISSION DENIED")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn chưa có quyền chỉnh sửa hợp đồng.",
        )

    query = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.id == int(contract_id))
        .filter(ContractRecordRow.annex_no.is_(None))
    )
    query = _apply_contract_visibility(query=query, user=current_user, permissions=permissions, db=db)
    row = query.first()
    _log.warning(f"[UPDATE_CONTRACT] row found: {row is not None}, id={row.id if row else None}, contract_no={row.contract_no if row else None}")
    if row is None:
        _log.warning(f"[UPDATE_CONTRACT] CONTRACT NOT FOUND")
        return UpdateContractResponse(
            ok=False,
            mode="not_found",
            message=f"Hợp đồng {contract_id} không tồn tại hoặc bạn không có quyền truy cập.",
            update_enabled=update_enabled,
            clone_only_enabled=clone_only_enabled,
            write_performed=False,
        )

    payload_dict = payload.model_dump(exclude_unset=True)
    _log.warning(f"[UPDATE_CONTRACT] payload_dict={payload_dict}")
    if not payload_dict:
        return UpdateContractResponse(
            ok=False,
            mode="empty_update",
            message="No fields provided for update.",
            update_enabled=update_enabled,
            clone_only_enabled=clone_only_enabled,
            write_performed=False,
            contract_id=int(row.id),
            contract_no=str(row.contract_no or ""),
        )

    unknown_fields = set(payload_dict.keys()) - ALLOWED_UPDATE_FIELDS
    if unknown_fields:
        return UpdateContractResponse(
            ok=False,
            mode="unknown_fields",
            message=f"Unknown fields: {', '.join(sorted(unknown_fields))}. Only allowed fields can be updated.",
            update_enabled=update_enabled,
            clone_only_enabled=clone_only_enabled,
            write_performed=False,
            contract_id=int(row.id),
            contract_no=str(row.contract_no or ""),
        )

    updated_fields: list[str] = []
    warnings: list[str] = []
    errors: list[str] = []

    # Pre-validate contract_no duplicate check (allow change, just check uniqueness)
    if "contract_no" in payload_dict:
        new_contract_no = _clean_text(payload_dict["contract_no"]) if isinstance(payload_dict["contract_no"], str) else payload_dict["contract_no"]
        current_contract_no = str(row.contract_no or "").strip()
        if new_contract_no and new_contract_no != current_contract_no:
            # Only check duplicate when actually changing to a different value
            existing = db.query(ContractRecordRow).filter(
                ContractRecordRow.contract_no == new_contract_no,
                ContractRecordRow.id != int(contract_id),
                ContractRecordRow.annex_no.is_(None),
            ).first()
            if existing:
                errors.append(f"So hop dong '{new_contract_no}' da ton tai (id={existing.id}). Vui long chon so khac.")
            # Also check normalized contracts table
            try:
                from sqlalchemy import text
                normalized_match = db.execute(
                    text("SELECT id FROM contracts WHERE contract_no = :cn LIMIT 1"),
                    {"cn": new_contract_no},
                ).fetchone()
                if normalized_match:
                    errors.append(f"So hop dong '{new_contract_no}' da ton tai trong bang contracts (id={normalized_match[0]}). Vui long chon so khac.")
            except Exception:
                pass  # Ignore normalized table check errors
        elif not new_contract_no and current_contract_no:
            errors.append("Khong the xoa so hop dong da co.")

    if errors:
        db.rollback()
        return UpdateContractResponse(
            ok=False,
            mode="validation_error",
            message="; ".join(errors),
            update_enabled=update_enabled,
            clone_only_enabled=clone_only_enabled,
            write_performed=False,
            contract_id=int(row.id),
            contract_no=str(row.contract_no or ""),
            errors=errors,
            warnings=warnings,
        )

    for field_name, field_value in payload_dict.items():
        current_value = getattr(row, field_name, None)
        normalized_value = _clean_text(field_value) if isinstance(field_value, str) else field_value

        if normalized_value == current_value:
            continue

        if field_name == "ngay_bat_dau":
            parsed = _parse_iso_date(normalized_value)
            if parsed is None and normalized_value:
                errors.append(f"Invalid ngay_bat_dau format: {field_value}")
                continue
            setattr(row, field_name, parsed)
            updated_fields.append(field_name)
        elif field_name == "ngay_ket_thuc":
            parsed = _parse_iso_date(normalized_value)
            if parsed is None and normalized_value:
                errors.append(f"Invalid ngay_ket_thuc format: {field_value}")
                continue
            setattr(row, field_name, parsed)
            updated_fields.append(field_name)
        elif field_name == "ngay_lap_hop_dong":
            parsed = _parse_iso_date(normalized_value)
            if parsed is None and normalized_value:
                errors.append(f"Invalid ngay_lap_hop_dong format: {field_value}")
                continue
            setattr(row, field_name, parsed)
            updated_fields.append(field_name)
        elif field_name == "contract_year":
            parsed = _parse_int_or_none(normalized_value)
            setattr(row, field_name, parsed)
            updated_fields.append(field_name)
        elif field_name == "so_tien_chua_gtgt_value":
            parsed = _parse_int_or_none(normalized_value)
            if parsed is not None and parsed < 0:
                errors.append(f"so_tien_chua_gtgt_value must be non-negative. Got: {field_value}")
                continue
            setattr(row, field_name, parsed)
            updated_fields.append(field_name)
        elif field_name == "so_tien_value":
            # Total amount after GTGT
            parsed = _parse_int_or_none(normalized_value)
            if parsed is not None and parsed < 0:
                errors.append(f"so_tien_value must be non-negative. Got: {field_value}")
                continue
            setattr(row, field_name, parsed)
            updated_fields.append(field_name)
        elif field_name == "thue_gtgt_value":
            # GTGT amount
            parsed = _parse_int_or_none(normalized_value)
            if parsed is not None and parsed < 0:
                errors.append(f"thue_gtgt_value must be non-negative. Got: {field_value}")
                continue
            setattr(row, field_name, parsed)
            updated_fields.append(field_name)
        elif field_name == "thue_percent":
            parsed = _parse_float_or_none(normalized_value)
            if parsed is not None and parsed < 0:
                errors.append(f"thue_percent must be non-negative. Got: {field_value}")
                continue
            setattr(row, field_name, parsed)
            updated_fields.append(field_name)
        elif field_name == "music_usage_areas":
            # Store as JSON string
            json_val = json.dumps(field_value, ensure_ascii=False) if field_value else None
            setattr(row, field_name, json_val)
            updated_fields.append(field_name)
        elif field_name == "nguoi_thuc_hien_email":
            setattr(row, field_name, _clean_text(normalized_value) if isinstance(normalized_value, str) else normalized_value)
            updated_fields.append(field_name)
        elif field_name == "contract_no":
            # Always allow updating contract_no (full edit - no longer read-only)
            if normalized_value:
                setattr(row, field_name, normalized_value)
                updated_fields.append(field_name)
        else:
            setattr(row, field_name, normalized_value if normalized_value != "" else None)
            updated_fields.append(field_name)

    # Auto-sync Phase 2 (simplified royalty) ↔ legacy fields so they stay consistent.
    # This prevents data drift when only one side is updated.
    _sync_money_fields_on_update(row=row, payload_dict=payload_dict, updated_fields=updated_fields)

    _log.warning(
        "[UPDATE_CONTRACT] sync done: updated_fields=%s",
        sorted(set(updated_fields))
    )

    if errors:
        db.rollback()
        return UpdateContractResponse(
            ok=False,
            mode="validation_error",
            message=f"Validation errors: {'; '.join(errors)}",
            update_enabled=update_enabled,
            clone_only_enabled=clone_only_enabled,
            write_performed=False,
            contract_id=int(row.id),
            contract_no=str(row.contract_no or ""),
            errors=errors,
            warnings=warnings,
        )

    try:
        db.commit()
        db.refresh(row)
        return UpdateContractResponse(
            ok=True,
            mode="updated",
            message="Hợp đồng đã được cập nhật thành công.",
            update_enabled=update_enabled,
            clone_only_enabled=clone_only_enabled,
            write_performed=True,
            contract_id=int(row.id),
            contract_no=str(row.contract_no or ""),
            updated_fields=sorted(updated_fields),
            errors=[],
            warnings=warnings if warnings else [],
        )
    except Exception:
        db.rollback()
        raise


# =============================================================================
# CONTRACT DELETE (PHASE FIX-ADMIN-DELETE-MAIN-DB-NOT-CLONE-01)
# Supports both clone DB safe delete and main DB admin delete.
# =============================================================================


@router.delete("/{contract_id}", response_model=DeleteContractCloneOnlyResponse)
def delete_contract(
    contract_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> DeleteContractCloneOnlyResponse:
    """Contract deletion endpoint - supports both clone DB and main DB modes.

    Gate chain (MAIN DB mode - DB_MODE=main):
    1. DELETE_CONTRACT_MAIN_DB_ENABLED must be true
    2. User must have admin/superuser/mod role
    3. No safe-prefix requirement
    4. No clone DB guard

    Gate chain (CLONE DB mode):
    1. DELETE_CONTRACT_CLONE_ONLY_ENABLED must be true
    2. APP_INSTANCE must be "new-app"
    3. Clone DB guard (port 5433)
    4. Admin or safe-prefix required

    Certificate handling (main DB):
    - Draft certificates: deleted automatically
    - Final/printed certificates: blocked unless DELETE_FINAL_CERTIFICATE_MAIN_DB_ENABLED=true
    """
    db_mode = str(settings.db_mode or "").strip().lower()

    # ============================================================
    # MAIN DB DELETE PATH
    # ============================================================
    if db_mode == "main":
        main_delete_enabled = bool(settings.delete_contract_main_db_enabled)
        logger.warning(f"[DELETE_GUARD] db_mode=main, delete_enabled={main_delete_enabled}, flag={settings.delete_contract_main_db_enabled}")
        if not main_delete_enabled:
            return DeleteContractCloneOnlyResponse(
                ok=False,
                mode="main_db_disabled",
                message="Admin delete on MAIN DB is disabled. Set DELETE_CONTRACT_MAIN_DB_ENABLED=true to enable.",
                write_performed=False,
            )

        current_user = _get_current_user(credentials=credentials, db=db)
        permissions = get_user_permissions(db=db, user=current_user)

        # Check admin role
        role = str(current_user.role or "").strip().lower()
        FULL_ACCESS_ROLES = {"admin", "mod", "moderator", "superuser"}
        is_admin = role in FULL_ACCESS_ROLES

        if not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ admin mới được xóa dữ liệu trên DB chính.",
            )

        # Enforce contracts.delete permission. List-only accounts must not
        # be able to delete even if they could otherwise reach this endpoint.
        if not _has_permission(permissions, "contracts", "delete"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn chưa có quyền xóa hợp đồng.",
            )

        # Fetch contract
        row = (
            db.query(ContractRecordRow)
            .filter(ContractRecordRow.id == int(contract_id))
            .filter(ContractRecordRow.annex_no.is_(None))
            .first()
        )

        if row is None:
            return DeleteContractCloneOnlyResponse(
                ok=False,
                mode="not_found",
                message=f"Contract {contract_id} not found.",
                write_performed=False,
            )

        contract_no = str(row.contract_no or "").strip()

        # Check for final/printed certificates
        from ..models.certificates import CertificateRecordRow as CertRow

        final_cert_delete_enabled = bool(settings.admin_delete_final_certificate_clone_enabled)
        blocked_final = 0
        if not final_cert_delete_enabled:
            blocked_final = (
                db.query(CertRow)
                .filter(CertRow.contract_id == int(contract_id))
                .filter(CertRow.status.in_(["test_printed", "final_printed"]))
                .count()
            )

        if blocked_final > 0:
            return DeleteContractCloneOnlyResponse(
                ok=False,
                mode="blocked_final_certificate",
                message="Khong xoa hop dong co GCN da in/final. Can xu ly GCN truoc.",
                write_performed=False,
                contract_id=int(row.id),
                contract_no=contract_no,
                admin_delete_any_enabled=True,
                permission_used="admin.delete_main_db",
                blocked_final_certificates=blocked_final,
            )

        # Perform deletion
        deleted_certificates = 0
        try:
            # Delete draft certificates (no number, no print, no QR)
            certs_to_delete = (
                db.query(CertRow)
                .filter(CertRow.contract_id == int(contract_id))
                .filter(CertRow.status == "draft")
                .filter(CertRow.certificate_no.is_(None))
                .filter(CertRow.print_count == 0)
                .filter(CertRow.qr_image_data.is_(None))
                .all()
            )
            deleted_certificates = len(certs_to_delete)
            for cert in certs_to_delete:
                db.delete(cert)

            # Delete contract record
            db.delete(row)
            db.commit()

            return DeleteContractCloneOnlyResponse(
                ok=True,
                mode="admin_main_db_deleted",
                message=f"Contract '{contract_no}' and {deleted_certificates} draft certificate(s) deleted from MAIN DB.",
                write_performed=True,
                contract_id=int(contract_id),
                contract_no=contract_no,
                deleted_contract_records=1,
                deleted_certificate_records=deleted_certificates,
                deleted_related_rows=0,
                old_db_touched=False,
                blocked_final_certificates=0,
                admin_delete_any_enabled=True,
                permission_used="admin.delete_main_db",
                warnings=["Admin deleted record from MAIN DB."],
            )

        except Exception as exc:
            db.rollback()
            return DeleteContractCloneOnlyResponse(
                ok=False,
                mode="delete_failed",
                message=f"Delete failed: {exc}",
                write_performed=False,
                contract_id=int(contract_id),
                contract_no=contract_no,
                admin_delete_any_enabled=True,
                permission_used="admin.delete_main_db",
                errors=[str(exc)],
            )

    # ============================================================
    # CLONE DB DELETE PATH (legacy - DB_MODE != main)
    # ============================================================
    delete_enabled = bool(settings.delete_contract_clone_only_enabled)
    admin_delete_any_enabled = bool(settings.admin_delete_any_contract_clone_enabled)
    final_cert_enabled = bool(settings.admin_delete_final_certificate_clone_enabled)

    if not delete_enabled:
        return DeleteContractCloneOnlyResponse(
            ok=False,
            mode="delete_disabled",
            message="Contract delete is disabled. Set DELETE_CONTRACT_CLONE_ONLY_ENABLED=true to enable.",
            write_performed=False,
        )

    if str(settings.app_instance or "").strip() != "new-app":
        return DeleteContractCloneOnlyResponse(
            ok=False,
            mode="delete_guard_refused",
            message="Contract delete refused because APP_INSTANCE is not new-app.",
            write_performed=False,
        )

    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db=db, user=current_user)

    # Fetch contract
    row = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.id == int(contract_id))
        .filter(ContractRecordRow.annex_no.is_(None))
        .first()
    )

    if row is None:
        return DeleteContractCloneOnlyResponse(
            ok=False,
            mode="not_found",
            message=f"Contract {contract_id} not found.",
            write_performed=False,
        )

    contract_no = str(row.contract_no or "").strip()

    # Determine permission mode
    is_admin = is_admin_delete_any_user(current_user, permissions)
    is_safe = is_safe_prefix_delete(contract_no)

    # Admin delete-any path
    if is_admin and admin_delete_any_enabled:
        permission_used = "admin.delete_any_clone"
        mode = "admin_clone_delete_any"
        warnings = ["Admin deleted imported/legacy clone record. This affects clone DB only."]

    # Safe-prefix path
    elif is_safe:
        permission_used = "safe_prefix"
        mode = "safe_prefix_deleted"
        warnings = []

    # Blocked
    else:
        return DeleteContractCloneOnlyResponse(
            ok=False,
            mode="unsafe_record",
            message="Chi duoc xoa record test/clone. Khong xoa du lieu import/cu. "
                    f"Hop dong '{contract_no}' khong phai record test.",
            write_performed=False,
            contract_id=int(row.id),
            contract_no=contract_no,
            admin_delete_any_enabled=admin_delete_any_enabled,
            permission_used="blocked" if is_admin else "no_permission",
            blocked_final_certificates=0,
        )

    # Check certificates
    from ..models.certificates import CertificateRecordRow as CertRow

    blocked_final = 0
    if not final_cert_enabled:
        blocked_final = (
            db.query(CertRow)
            .filter(CertRow.contract_id == int(contract_id))
            .filter(CertRow.status.in_(["test_printed", "final_printed"]))
            .count()
        )

    if blocked_final > 0:
        return DeleteContractCloneOnlyResponse(
            ok=False,
            mode="blocked_final_certificate",
            message=f"Contract has {blocked_final} final/printed certificate(s). "
                    "Cannot delete unless ADMIN_DELETE_FINAL_CERTIFICATE_CLONE_ENABLED=true.",
            write_performed=False,
            contract_id=int(row.id),
            contract_no=contract_no,
            admin_delete_any_enabled=admin_delete_any_enabled,
            permission_used=permission_used,
            blocked_final_certificates=blocked_final,
        )

    # Perform deletion
    deleted_certificates = 0
    try:
        # Delete draft certificates: status=draft, no cert_no, no print, no QR
        certs_to_delete = (
            db.query(CertRow)
            .filter(CertRow.contract_id == int(contract_id))
            .filter(CertRow.status == "draft")
            .filter(CertRow.certificate_no.is_(None))
            .filter(CertRow.print_count == 0)
            .filter(CertRow.qr_image_data.is_(None))
            .all()
        )
        deleted_certificates = len(certs_to_delete)
        for cert in certs_to_delete:
            db.delete(cert)

        # Delete contract record
        db.delete(row)

        db.commit()

        return DeleteContractCloneOnlyResponse(
            ok=True,
            mode=mode,
            message=f"Contract '{contract_no}' and {deleted_certificates} draft certificate(s) deleted from clone DB.",
            write_performed=True,
            contract_id=int(contract_id),
            contract_no=contract_no,
            deleted_contract_records=1,
            deleted_certificate_records=deleted_certificates,
            deleted_related_rows=0,
            old_db_touched=False,
            blocked_final_certificates=0,
            admin_delete_any_enabled=admin_delete_any_enabled,
            permission_used=permission_used,
            warnings=warnings,
        )

    except Exception as exc:
        db.rollback()
        return DeleteContractCloneOnlyResponse(
            ok=False,
            mode="delete_failed",
            message=f"Delete failed: {exc}",
            write_performed=False,
            contract_id=int(contract_id),
            contract_no=contract_no,
            admin_delete_any_enabled=admin_delete_any_enabled,
            permission_used=permission_used,
            errors=[str(exc)],
        )


