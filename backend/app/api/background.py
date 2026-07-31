"""
Background/Karaoke calculation API endpoints.

STRICTLY READ-ONLY:
- No DB write.
- No contract creation.
- No DOCX/XLSX generation.
- No GCN creation.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import text

from ..core.database import get_db
from ..core.security import decode_access_token, get_bearer_token, get_user_permissions, security_scheme
from ..models.user import UserRow
from ..schemas.background_calculation import (
    KaraokeCalculateDryRunRequest,
    KaraokeCalculateDryRunResponse,
    KaraokeInputEcho,
)
from ..schemas.kvc_calculation import (
    KvcVcpmcTariffDryRunRequest,
    KvcVcpmcTariffDryRunResponse,
    KvcNd17DryRunRequest,
    KvcNd17DryRunResponse,
)
from ..services.background_calculation import DEFAULT_BASE_SALARY_VND, build_karaoke_calculation_context
from ..calculations.kvc.vcpmc_tariff import calculate_kvc_vcpmc_tariff
from ..calculations.kvc.nd17 import calculate_nd17_kvc_tariff


router = APIRouter(prefix="/api/background", tags=["background"])


def _get_current_user(
    *,
    credentials: HTTPAuthorizationCredentials | None,
    db,
) -> UserRow:
    token = get_bearer_token(credentials)
    username = decode_access_token(token)
    user = db.query(UserRow).filter(UserRow.username.ilike(username)).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def _read_only_guard(db) -> None:
    """Set transaction to read only."""
    db.execute(text("SET TRANSACTION READ ONLY"))


@router.post("/karaoke/calculate-dry-run", response_model=KaraokeCalculateDryRunResponse)
def post_karaoke_calculate_dry_run(
    payload: KaraokeCalculateDryRunRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db = Depends(get_db),
) -> KaraokeCalculateDryRunResponse:
    """
    Calculate karaoke royalty amounts (dry-run only).

    STRICTLY READ-ONLY:
    - No DB write.
    - No contract creation.
    - No DOCX/XLSX generation.
    - No GCN creation.
    - No contract_no auto-generation.

    This endpoint computes:
    - Room tiers (1-4, 5-10, 11+)
    - Coefficients based on area group
    - Support percentages by tier and annually
    - GTGT calculation
    - 6-month vs 12-month effective term
    - Text blocks for DOCX rendering
    """
    _read_only_guard(db)
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db, current_user)

    # Validate that user has background domain permission or is admin
    perms_lower = [p.lower() for p in permissions]
    is_admin = any(p in perms_lower for p in ["admin.system.manage", "admin.data.manage", "admin.ops.view"])
    has_background = "background" in perms_lower or "karaoke" in perms_lower
    if not is_admin and not has_background:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have background domain permission",
        )

    # Contract_no is user input only - do not auto-generate
    contract_no = payload.contract_no

    # Build calculation context
    result = build_karaoke_calculation_context(
        karaoke_type=payload.karaoke_type,
        area_group=payload.area_group,
        tong_so_phong=payload.tong_so_phong,
        tong_so_box=payload.tong_so_box,
        muc_luong_co_so=payload.muc_luong_co_so,
        ty_le_ho_tro=payload.ty_le_ho_tro,
        ty_le_ho_tro_bac_1=payload.ty_le_ho_tro_bac_1,
        ty_le_ho_tro_bac_2=payload.ty_le_ho_tro_bac_2,
        ty_le_ho_tro_bac_3=payload.ty_le_ho_tro_bac_3,
        gtgt_percent=payload.gtgt_percent,
        start_date=payload.start_date,
        end_date=payload.end_date,
        room_sections=payload.room_sections,
        pricing_render_mode=payload.pricing_render_mode,
    )

    # Collect errors and warnings
    errors = result.pop("errors", [])
    warnings = result.pop("warnings", [])

    return KaraokeCalculateDryRunResponse(
        ok=len(errors) == 0,
        mode="background_karaoke_calculation_dry_run",
        write_performed=False,
        contract_created=False,
        docx_generated=False,
        xlsx_generated=False,
        gcn_created=False,
        contract_no_generated=False,
        errors=errors,
        warnings=warnings,
        input_echo=KaraokeInputEcho(
            contract_no=contract_no,
            karaoke_type=payload.karaoke_type,
            area_group=payload.area_group,
            tong_so_phong=payload.tong_so_phong,
            tong_so_box=payload.tong_so_box,
            muc_luong_co_so=payload.muc_luong_co_so if payload.muc_luong_co_so else DEFAULT_BASE_SALARY_VND,
            ty_le_ho_tro=payload.ty_le_ho_tro,
            ty_le_ho_tro_bac_1=payload.ty_le_ho_tro_bac_1,
            ty_le_ho_tro_bac_2=payload.ty_le_ho_tro_bac_2,
            ty_le_ho_tro_bac_3=payload.ty_le_ho_tro_bac_3,
            gtgt_percent=payload.gtgt_percent,
            start_date=payload.start_date,
            end_date=payload.end_date,
            pricing_render_mode=payload.pricing_render_mode,
        ),
        calculation=result,
    )


@router.post("/kvc/vcpmc-tariff/calculate-dry-run", response_model=KvcVcpmcTariffDryRunResponse)
def post_kvc_vcpmc_tariff_calculate_dry_run(
    payload: KvcVcpmcTariffDryRunRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db = Depends(get_db),
) -> KvcVcpmcTariffDryRunResponse:
    """
    Calculate KVC VCPMC tariff amounts (dry-run only).

    STRICTLY READ-ONLY:
    - No DB write.
    - No contract creation.
    - No DOCX/XLSX generation.
    - No GCN creation.
    - No ND17 calculation.

    This endpoint computes:
    - Per-location VCPMC tariff (base + increment blocks)
    - Sum of all locations
    - Support/discount before GTGT
    - GTGT calculation
    - Text blocks for DOCX rendering
    """
    _read_only_guard(db)
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db, current_user)

    perms_lower = [p.lower() for p in permissions]
    is_admin = any(p in perms_lower for p in ["admin.system.manage", "admin.data.manage", "admin.ops.view"])
    has_background = "background" in perms_lower or "kvc" in perms_lower
    if not is_admin and not has_background:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have background domain permission",
        )

    # Convert Pydantic locations to dict for calculation
    locations = [
        {"id": loc.id, "name": loc.name, "area_m2": loc.area_m2}
        for loc in payload.locations
    ]

    # Calculate KVC VCPMC tariff
    result = calculate_kvc_vcpmc_tariff(
        locations=locations,
        gtgt_percent=payload.gtgt_percent,
        support_percent=payload.support_percent,
        support_amount=payload.support_amount,
        support_note=payload.support_note,
        usage_display_mode=payload.usage_display_mode or "auto",
    )

    # Build response
    return KvcVcpmcTariffDryRunResponse(
        ok=result["ok"],
        mode=result["mode"],
        write_performed=result["write_performed"],
        contract_created=result["contract_created"],
        docx_generated=result["docx_generated"],
        xlsx_generated=result["xlsx_generated"],
        gcn_created=result["gcn_created"],
        nd17_calculated=result["nd17_calculated"],
        errors=result["errors"],
        warnings=result["warnings"],
        input_echo=result["input_echo"],
        calculation=result["calculation"],
        docx_context_preview=result["docx_context_preview"],
        docx_context_preview_v2=result.get("docx_context_preview_v2"),
    )


@router.post("/kvc/nd17/calculate-dry-run", response_model=KvcNd17DryRunResponse)
def post_kvc_nd17_calculate_dry_run(
    payload: KvcNd17DryRunRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db = Depends(get_db),
) -> KvcNd17DryRunResponse:
    """
    Calculate KVC ND17 royalty amounts (dry-run only).

    STRICTLY READ-ONLY:
    - No DB write.
    - No contract creation.
    - No DOCX/XLSX generation.
    - No GCN creation.
    - No ND17 for other domains.

    This endpoint computes:
    - Per-location ND17 coefficient based on area
    - Application of 12× base_salary cap
    - Urban classification adjustment (10%-100%)
    - Sum of all locations
    - Support/discount before GTGT
    - GTGT calculation
    - Text blocks for DOCX rendering

    Legal Basis: Nghị định 17/2023/NĐ-CP, Phụ lục II, Mục 8
    """
    _read_only_guard(db)
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db, current_user)

    perms_lower = [p.lower() for p in permissions]
    is_admin = any(p in perms_lower for p in ["admin.system.manage", "admin.data.manage", "admin.ops.view"])
    has_background = "background" in perms_lower or "kvc" in perms_lower
    if not is_admin and not has_background:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have background domain permission",
        )

    # Convert Pydantic locations to dict for calculation
    locations = [
        {"id": loc.id, "name": loc.name, "area_m2": loc.area_m2}
        for loc in payload.locations
    ]

    # Calculate ND17
    result = calculate_nd17_kvc_tariff(
        locations=locations,
        base_salary=payload.base_salary,
        urban_class=payload.urban_class,
        urban_rate=payload.urban_rate,
        gtgt_percent=payload.gtgt_percent,
        support_percent=payload.support_percent,
        support_amount=payload.support_amount,
        support_note=payload.support_note,
        include_premise_services=payload.include_premise_services,
        premise_services_note=payload.premise_services_note,
        usage_display_mode=payload.usage_display_mode or "auto",
    )

    # Build response
    return KvcNd17DryRunResponse(
        ok=result["ok"],
        mode=result["mode"],
        write_performed=result["write_performed"],
        contract_created=result["contract_created"],
        docx_generated=result["docx_generated"],
        xlsx_generated=result["xlsx_generated"],
        gcn_created=result["gcn_created"],
        nd17_calculated=result["nd17_calculated"],
        errors=result["errors"],
        warnings=result["warnings"],
        input_echo=result["input_echo"],
        calculation=result["calculation"],
        docx_context_preview_v2=result.get("docx_context_preview_v2"),
    )
