from __future__ import annotations

from datetime import date
import anyio
import json
import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import extract, func, or_, text
from sqlalchemy.orm import Query as SAQuery
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.security import decode_access_token, get_bearer_token, get_user_permissions, security_scheme
from ..models.certificates import CertificateRecordRow, CertificatePrintLogRow
from ..models.contracts import ContractRecordRow
from ..models.user import UserRow
from ..schemas.certificates import (
    CertificateContextDryRunResponse,
    CertificateDetailResponse,
    CertificateListItem,
    CertificateListSummary,
    PendingCertificateContractItem,
    PendingCertificatesListResponse,
    CertificateNumberAssignRequest,
    CertificateNumberAssignResponse,
    CertificateNumberDryRunRequest,
    CertificateNumberDryRunResponse,
    CertificatePrintRequest,
    CertificatePrintResponse,
    CertificateSyncResponse,
    CertificateUpdateRequest,
    CertificateUpdateResponse,
    CertificatesListResponse,
    InternalQrDownloadAfterUserSaveRequest,
    InternalQrDownloadAfterUserSaveResponse,
    InternalQrFromPrintFormRequest,
    InternalQrFromPrintFormResponse,
    InternalQrGenerateResponse,
    InternalQrOpenAndFillRequest,
    InternalQrOpenAndFillResponse,
    InternalQrStatusResponse,
    InternalQrApiFirstRequest,
    InternalQrApiFirstResponse,
    InternalQrOpenPortalReviewRequest,
    InternalQrOpenPortalReviewResponse,
    PortalActionRequest,
    PortalActionResponse,
)
from ..schemas.internal_qr_portal_credential import (
    CredentialGetResponse,
    CredentialSaveRequest,
    CredentialSaveResponse,
    CredentialDeleteResponse,
)
from ..models.internal_qr_portal_credential import InternalQrPortalCredentialRow
from ..services.credential_crypto import (
    encrypt_password,
    decrypt_password,
    is_encryption_available,
)
from ..services.contract_permissions import apply_contract_visibility
from ..services.internal_qr_portal_client import InternalQrPortalClient, QrPortalErrorCode
from ..services.internal_qr_visible_browser import (
    open_and_fill_portal,
    download_qr_after_user_save,
)
from ..services.contract_validation import BACKGROUND_WORKSPACE_CODE
from ..services.certificate_context import (
    build_context_from_certificate_row,
    build_context_from_contract_row,
    locked_layout_metadata,
)
from ..services.certificate_number_dry_run import build_certificate_number_dry_run
from ..services.certificate_number_assign import assign_certificate_number
from ..services.certificate_update import update_certificate
from ..services.certificate_sync import sync_certificate_from_contract
from ..services.certificate_print import print_certificate


router = APIRouter(prefix="/api/certificates", tags=["certificates"])

ALLOWED_PAGE_SIZES = {30, 60, 90, 120}
ALLOWED_STATUSES = {"draft", "test_printed", "final_printed"}


def _to_iso(value: object | None) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return str(value.isoformat())
    return str(value)


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


def _read_only_clone_guard(db: Session) -> None:
    db.execute(text("SET TRANSACTION READ ONLY"))


def _safe_page_size(value: int) -> int:
    return value if value in ALLOWED_PAGE_SIZES else 30


def _base_certificate_query(
    *,
    db: Session,
    user: UserRow,
    permissions: list[str],
) -> SAQuery:
    """
    Base query for reading CertificateRecordRow joined with ContractRecordRow.

    Used by: get_certificate_detail, get_certificate_context_dry_run,
    post_certificate_number_dry_run, put_certificate_number,
    update_certificate_endpoint, sync_certificate_endpoint.

    Returns tuples of (CertificateRecordRow, ContractRecordRow).
    """
    query = (
        db.query(CertificateRecordRow, ContractRecordRow)
        .join(
            ContractRecordRow,
            CertificateRecordRow.contract_id == ContractRecordRow.id,
        )
        .filter(ContractRecordRow.annex_no.is_(None))
    )
    return apply_contract_visibility(query=query, user=user, permissions=permissions, db=db)


def _certificate_list_query(
    *,
    db: Session,
    user: UserRow,
    permissions: list[str],
    q: str | None = None,
    status_filter: str | None = None,
    year: int | None = None,
    contract_no: str | None = None,
) -> SAQuery:
    """
    Paginated certificate list query with all filters.

    Returns tuples of (CertificateRecordRow, ContractRecordRow).
    """
    query = _base_certificate_query(db=db, user=user, permissions=permissions)
    return _apply_filters(
        query,
        q=q,
        status_filter=status_filter,
        year=year,
        contract_no=contract_no,
    )


def _cert_row_item(cert: CertificateRecordRow, contract: ContractRecordRow) -> CertificateListItem:
    """Map a certificate row + contract row to CertificateListItem."""
    return CertificateListItem(
        id=int(cert.certificate_id),
        certificate_id=int(cert.certificate_id),
        contract_id=int(cert.contract_id),
        certificate_no=str(cert.certificate_no or ""),
        certificate_issue_date=_to_iso(cert.certificate_issue_date),
        status=str(cert.status or "draft"),
        domain_group=str(cert.domain_group or ""),
        field_code=str(cert.field_code or ""),
        organization_name=str(cert.organization_name or ""),
        business_registration_no=str(cert.business_registration_no or ""),
        address=str(cert.address or ""),
        business_sign_name=str(cert.business_sign_name or ""),
        business_location=str(cert.business_location or ""),
        contract_no=str(cert.contract_no or ""),
        effective_from=_to_iso(cert.effective_from),
        effective_to=_to_iso(cert.effective_to),
        gcn_scope_col_1_text=str(cert.gcn_scope_col_1_text or ""),
        gcn_scope_col_2_text=str(cert.gcn_scope_col_2_text or ""),
        gcn_scope_col_3_text=str(cert.gcn_scope_col_3_text or ""),
        offset_x_mm=float(cert.offset_x_mm or 0),
        offset_y_mm=float(cert.offset_y_mm or 0),
        printed_at=_to_iso(cert.printed_at),
        printed_by=str(cert.printed_by) if cert.printed_by else None,
        print_count=int(cert.print_count or 0),
        last_printed_at=_to_iso(cert.last_printed_at),
        last_print_file=str(cert.last_print_file) if cert.last_print_file else None,
        last_print_reason=str(cert.last_print_reason) if cert.last_print_reason else None,
        created_at=_to_iso(cert.created_at),
        updated_at=_to_iso(cert.updated_at),
        has_qr_image=bool(cert.qr_image_data),
        qr_image_data=str(cert.qr_image_data) if cert.qr_image_data else None,
        contract_visible=True,
    )


# =============================================================================
# REMOTE CLIENT DETECTION
# =============================================================================

def _is_local_client(request: Request) -> bool:
    """
    Returns True if the request comes from the same machine as the backend.
    Checks request.client.host against localhost/127.0.0.1/::1.

    This is used to determine whether Playwright automation can safely run
    on the backend machine without accidentally opening a browser on the wrong
    device when a remote user clicks "automation" on their own machine.
    """
    if request.client is None:
        return True  # No client info — assume local (fail-safe)
    host = request.client.host or ""
    return host in ("127.0.0.1", "::1") or host.lower() == "localhost"


def _can_run_playwright(request: Request) -> bool:
    """
    Returns True if Playwright automation is allowed for this request.

    DISABLED BY DEFAULT — use extension-only mode instead.

    Playwright automation is allowed ONLY when:
    1. QR_PORTAL_BACKEND_PLAYWRIGHT_ENABLED=true (must be explicitly set)
    2. AND request is from localhost/127.0.0.1/::1 (local debugging only)

    Default: QR_PORTAL_BACKEND_PLAYWRIGHT_ENABLED=false (extension-only mode)
    Even dev machines use extension-only from UI; backend Playwright is only for
    local script/debugging, not for UI-triggered automation.
    """
    if not _QR_PORTAL_BACKEND_PLAYWRIGHT_ENABLED:
        return False
    return _is_local_client(request)


def _base_pending_certificate_query(*, db: Session, user: UserRow, permissions: list[str]) -> SAQuery:
    certificate_exists = (
        db.query(CertificateRecordRow.certificate_id)
        .filter(CertificateRecordRow.contract_id == ContractRecordRow.id)
        .filter(func.lower(func.coalesce(CertificateRecordRow.domain_group, "")) == BACKGROUND_WORKSPACE_CODE)
        .filter(ContractRecordRow.annex_no.is_(None))
        .exists()
    )
    query = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.annex_no.is_(None))
        .filter(ContractRecordRow.domain_group.isnot(None))
        .filter(func.lower(func.coalesce(ContractRecordRow.domain_group, "")) == BACKGROUND_WORKSPACE_CODE)
        .filter(~certificate_exists)
    )
    return apply_contract_visibility(query=query, user=user, permissions=permissions, db=db)


def _apply_filters(
    query: SAQuery,
    *,
    q: str | None,
    status_filter: str | None,
    year: int | None,
    contract_no: str | None,
) -> SAQuery:
    search = str(q or "").strip()
    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                CertificateRecordRow.certificate_no.ilike(term),
                CertificateRecordRow.contract_no.ilike(term),
                CertificateRecordRow.organization_name.ilike(term),
                CertificateRecordRow.business_sign_name.ilike(term),
                CertificateRecordRow.address.ilike(term),
                CertificateRecordRow.business_location.ilike(term),
            )
        )

    requested_status = str(status_filter or "").strip().lower()
    if requested_status:
        if requested_status not in ALLOWED_STATUSES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported certificate status filter")
        query = query.filter(func.lower(CertificateRecordRow.status) == requested_status)

    if year is not None:
        query = query.filter(
            or_(
                extract("year", CertificateRecordRow.certificate_issue_date) == int(year),
                extract("year", CertificateRecordRow.created_at) == int(year),
            )
        )

    requested_contract_no = str(contract_no or "").strip()
    if requested_contract_no:
        query = query.filter(CertificateRecordRow.contract_no.ilike(f"%{requested_contract_no}%"))

    return query


def _pending_certificate_item(contract: ContractRecordRow) -> PendingCertificateContractItem:
    return PendingCertificateContractItem(
        contract_id=int(contract.id),
        contract_no=str(contract.contract_no or ""),
        organization_name=contract.don_vi_ten,
        business_sign_name=contract.ten_bang_hieu,
        address=contract.usage_full_address or contract.dia_chi_su_dung or contract.legal_full_address or contract.legal_address_line,
        business_location=contract.usage_full_address or contract.dia_chi_su_dung or contract.legal_full_address or contract.legal_address_line,
        field_code=contract.field_code,
        domain_group=contract.domain_group,
        effective_from=_to_iso(contract.ngay_bat_dau),
        effective_to=_to_iso(contract.ngay_ket_thuc),
        royalty_amount_before_vat=int(contract.royalty_amount_before_vat) if contract.royalty_amount_before_vat is not None else None,
        created_at=_to_iso(contract.ngay_lap_hop_dong),
        has_certificate=False,
    )


def _summary_for_query(query: SAQuery) -> CertificateListSummary:
    rows = query.all()
    total = len(rows)
    draft_count = 0
    numbered_count = 0
    official_printed_count = 0
    missing_number = 0
    printed_multiple = 0
    for cert, _contract in rows:
        cert_no = str(cert.certificate_no or "").strip()
        pcount = int(cert.print_count or 0)
        has_number = bool(cert_no)
        is_official = str(cert.status or "").strip().lower() == "final_printed"

        if pcount == 0:
            draft_count += 1
        if has_number:
            numbered_count += 1
        if is_official:
            official_printed_count += 1
        if not cert_no:
            missing_number += 1
        if pcount > 1:
            printed_multiple += 1
    return CertificateListSummary(
        total=total,
        draft=draft_count,
        numbered=numbered_count,
        official_printed=official_printed_count,
        final_printed=official_printed_count,
        missing_number=missing_number,
        printed_multiple=printed_multiple,
    )


def _pending_summary(total: int) -> CertificateListSummary:
    return CertificateListSummary(
        total=total,
        draft=total,
        numbered=0,
        official_printed=0,
        final_printed=0,
        missing_number=total,
        printed_multiple=0,
    )


@router.get("/pending-contracts", response_model=PendingCertificatesListResponse)
def list_pending_contracts(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30),
    q: str | None = Query(default=None),
    year: int | None = Query(default=None, ge=2000, le=2100),
    contract_no: str | None = Query(default=None),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> PendingCertificatesListResponse:
    _read_only_clone_guard(db)
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db, current_user)

    safe_page_size = _safe_page_size(int(page_size))
    safe_page = max(1, int(page))
    offset = (safe_page - 1) * safe_page_size

    base_query = _base_pending_certificate_query(db=db, user=current_user, permissions=permissions)

    search = str(q or "").strip()
    if search:
        term = f"%{search}%"
        base_query = base_query.filter(
            or_(
                ContractRecordRow.contract_no.ilike(term),
                ContractRecordRow.don_vi_ten.ilike(term),
                ContractRecordRow.ten_bang_hieu.ilike(term),
                ContractRecordRow.dia_chi_su_dung.ilike(term),
                ContractRecordRow.usage_full_address.ilike(term),
                ContractRecordRow.legal_full_address.ilike(term),
                ContractRecordRow.legal_address_line.ilike(term),
            )
        )

    if year is not None:
        base_query = base_query.filter(ContractRecordRow.contract_year == int(year))

    requested_contract_no = str(contract_no or "").strip()
    if requested_contract_no:
        base_query = base_query.filter(ContractRecordRow.contract_no.ilike(f"%{requested_contract_no}%"))

    total = int(base_query.count())
    total_pages = (total + safe_page_size - 1) // safe_page_size if total > 0 else 0

    rows = (
        base_query.order_by(
            ContractRecordRow.ngay_lap_hop_dong.desc().nullslast(),
            ContractRecordRow.id.desc(),
        )
        .offset(offset)
        .limit(safe_page_size)
        .all()
    )

    return PendingCertificatesListResponse(
        items=[_pending_certificate_item(contract) for contract in rows],
        page=safe_page,
        page_size=safe_page_size,
        total=total,
        total_pages=total_pages,
        write_performed=False,
        print_enabled=False,
        qr_generation_enabled=False,
    )


# =============================================================================
# CERTIFICATE LIST — root GET /api/certificates
# Frontend uses: certificatesClient.listCertificates() -> GET /api/certificates
# =============================================================================

@router.get("", response_model=CertificatesListResponse)
def list_certificates(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30),
    q: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    year: int | None = Query(default=None, ge=2000, le=2100),
    contract_no: str | None = Query(default=None),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> CertificatesListResponse:
    """
    List all certificate records with pagination and filters.

    Matches frontend: certificatesClient.listCertificates() -> GET /api/certificates
    """
    _read_only_clone_guard(db)
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db, current_user)

    safe_page_size = _safe_page_size(int(page_size))
    safe_page = max(1, int(page))
    offset = (safe_page - 1) * safe_page_size

    base_query = _certificate_list_query(
        db=db,
        user=current_user,
        permissions=permissions,
        q=q,
        status_filter=status_filter,
        year=year,
        contract_no=contract_no,
    )
    summary_query = _certificate_list_query(
        db=db,
        user=current_user,
        permissions=permissions,
        q=q,
        status_filter=status_filter,
        year=year,
        contract_no=contract_no,
    )

    total = int(base_query.count())
    total_pages = (total + safe_page_size - 1) // safe_page_size if total > 0 else 0

    rows = (
        base_query
        .order_by(CertificateRecordRow.created_at.desc().nullslast())
        .offset(offset)
        .limit(safe_page_size)
        .all()
    )

    return CertificatesListResponse(
        items=[_cert_row_item(cert, contract) for cert, contract in rows],
        page=safe_page,
        page_size=safe_page_size,
        total=total,
        total_pages=total_pages,
        summary=_summary_for_query(summary_query),
        write_performed=False,
        print_enabled=False,
        qr_generation_enabled=False,
    )


@router.get("/{certificate_id}", response_model=CertificateDetailResponse)
def get_certificate_detail(
    certificate_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> CertificateDetailResponse:
    _read_only_clone_guard(db)
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db, current_user)

    query = _base_certificate_query(db=db, user=current_user, permissions=permissions).filter(
        CertificateRecordRow.certificate_id == int(certificate_id)
    )
    result = query.first()
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")

    cert, _contract = result
    logs = (
        db.query(CertificatePrintLogRow)
        .filter(CertificatePrintLogRow.certificate_id == int(certificate_id))
        .order_by(CertificatePrintLogRow.print_no.desc())
        .all()
    )
    from ..schemas.certificates import CertificatePrintLogItem
    print_log_items = [
        CertificatePrintLogItem(
            id=int(log.id),
            certificate_id=int(log.certificate_id),
            print_no=int(log.print_no),
            print_type=str(log.print_type or "official"),
        printed_at=(log.printed_at.isoformat() if log.printed_at else ""),
        printed_by=str(log.printed_by) if log.printed_by else None,
        file_path=str(log.file_path) if log.file_path else None,
        reason=str(log.reason) if log.reason else None,
        created_at=(log.created_at.isoformat() if log.created_at else ""),
        )
        for log in logs
    ]
    return CertificateDetailResponse(
        certificate=_certificate_item(cert, include_qr=True),
        print_logs=print_log_items,
    )


@router.get("/{certificate_id}/context-dry-run", response_model=CertificateContextDryRunResponse)
def get_certificate_context_dry_run(
    certificate_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> CertificateContextDryRunResponse:
    _read_only_clone_guard(db)
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db, current_user)

    query = _base_certificate_query(db=db, user=current_user, permissions=permissions).filter(
        CertificateRecordRow.certificate_id == int(certificate_id)
    )
    result = query.first()
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")

    cert, _contract = result
    return CertificateContextDryRunResponse(
        context=build_context_from_certificate_row(cert),
        locked_layout=locked_layout_metadata(),
    )


@router.post("/{certificate_id}/number-dry-run", response_model=CertificateNumberDryRunResponse)
def post_certificate_number_dry_run(
    certificate_id: int,
    payload: CertificateNumberDryRunRequest | None = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> CertificateNumberDryRunResponse:
    """
    Certificate number dry-run endpoint.

    STRICTLY READ-ONLY:
    - No DB write.
    - No certificate_no allocation.
    - No print.
    - No QR.

    Validates a certificate number candidate without persisting changes.
    """
    _read_only_clone_guard(db)
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db, current_user)

    query = _base_certificate_query(db=db, user=current_user, permissions=permissions).filter(
        CertificateRecordRow.certificate_id == int(certificate_id)
    )
    result = query.first()
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")

    cert, _contract = result

    candidate = None
    if payload:
        candidate = payload.candidate_certificate_no

    return build_certificate_number_dry_run(db=db, certificate=cert, candidate=candidate)


@router.put("/{certificate_id}/number", response_model=CertificateNumberAssignResponse)
def put_certificate_number(
    certificate_id: int,
    payload: CertificateNumberAssignRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> CertificateNumberAssignResponse:
    """
    Assign certificate number to an existing certificate.

    STRICTLY CLONE DB ONLY:
    - Updates certificate_no only
    - Updates updated_at only
    - Does NOT update status
    - Does NOT update offsets
    - Does NOT update qr_image_data
    - Does NOT update print fields

    Requires feature flags:
    - ASSIGN_CERTIFICATE_NUMBER_ENABLED=true
    """
    current_user = _get_current_user(credentials=credentials, db=db)
    permissions = get_user_permissions(db=db, user=current_user)

    query = _base_certificate_query(db=db, user=current_user, permissions=permissions).filter(
        CertificateRecordRow.certificate_id == int(certificate_id)
    )
    result = query.first()
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")

    cert, _contract = result

    payload_dict = payload.model_dump() if payload else {}
    return assign_certificate_number(db=db, certificate=cert, payload=payload_dict)


@router.patch("/{certificate_id}", response_model=CertificateUpdateResponse)
def update_certificate_endpoint(
    certificate_id: int,
    payload: CertificateUpdateRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> CertificateUpdateResponse:
    """
    Update certificate fields.

    Clone-only update with flag gates.
    """
    current_user = _get_current_user(credentials=credentials, db=db)

    query = _base_certificate_query(db=db, user=current_user, permissions=[]).filter(
        CertificateRecordRow.certificate_id == int(certificate_id)
    )
    result = query.first()
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")

    cert, _contract = result
    payload_dict = payload.model_dump(exclude_unset=True)
    return update_certificate(db=db, certificate=cert, payload=payload_dict)


@router.post("/{certificate_id}/sync", response_model=CertificateSyncResponse)
def sync_certificate_endpoint(
    certificate_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> CertificateSyncResponse:
    """
    Sync certificate fields from contract.

    Pulls latest values from contract into certificate.
    """
    current_user = _get_current_user(credentials=credentials, db=db)

    query = _base_certificate_query(db=db, user=current_user, permissions=[]).filter(
        CertificateRecordRow.certificate_id == int(certificate_id)
    )
    result = query.first()
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")

    cert, contract = result
    return sync_certificate_from_contract(db=db, certificate=cert, contract=contract)


@router.post("/{certificate_id}/print", response_model=CertificatePrintResponse)
def print_certificate_endpoint(
    certificate_id: int,
    payload: CertificatePrintRequest | None = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> CertificatePrintResponse:
    """
    Official print — marks certificate as printed and records in print log.

    BLOCKS if certificate_no is not yet assigned.
    Increments print_count. Stores last_printed_at / last_print_file / last_print_reason.
    No test print workflow.
    """
    current_user = _get_current_user(credentials=credentials, db=db)

    query = _base_certificate_query(db=db, user=current_user, permissions=[]).filter(
        CertificateRecordRow.certificate_id == int(certificate_id)
    )
    result = query.first()
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")

    cert, _contract = result
    reason = payload.reason if payload else None
    return print_certificate(
        db=db,
        certificate=cert,
        reason=reason,
        username=str(current_user.username or ""),
    )


# =============================================================================
# GET /api/certificates/{id}/print-logs — print history
# =============================================================================

@router.get("/{certificate_id}/print-logs")
def get_certificate_print_logs(
    certificate_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    """
    Return print log entries for a certificate, newest first.
    Returns empty list if no logs exist yet.
    """
    _get_current_user(credentials=credentials, db=db)

    logs = (
        db.query(CertificatePrintLogRow)
        .filter(CertificatePrintLogRow.certificate_id == int(certificate_id))
        .order_by(CertificatePrintLogRow.print_no.desc())
        .all()
    )

    return {
        "ok": True,
        "certificate_id": int(certificate_id),
        "logs": [
            {
                "id": int(log.id),
                "certificate_id": int(log.certificate_id),
                "print_no": int(log.print_no),
                "print_type": str(log.print_type or "official"),
                "printed_at": log.printed_at.isoformat() if log.printed_at else None,
                "printed_by": str(log.printed_by or ""),
                "file_path": str(log.file_path or ""),
                "reason": str(log.reason or "") if log.reason else None,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
    }


# =============================================================================
# INTERNAL QR PORTAL AUTOMATION ENDPOINTS — DISABLED
# These endpoints are temporarily disabled pending redesign.
# =============================================================================

class _QrPortalDisabledResponse(BaseModel):
    ok: bool = False
    error_code: str = "QR_PORTAL_REDESIGN_PENDING"
    message: str = "Tính năng QR portal nội bộ đang được thiết kế lại. Vui lòng sử dụng tải QR thủ công."


@router.post("/{certificate_id}/generate-internal-qr", response_model=_QrPortalDisabledResponse)
def generate_internal_qr(
    certificate_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> _QrPortalDisabledResponse:
    """
    [DISABLED] Create a GCN entry in the internal QR portal and download the QR code image.

    This endpoint is temporarily disabled pending redesign.
    """
    _ = credentials, db
    return _QrPortalDisabledResponse()


@router.get("/{certificate_id}/qr-status", response_model=InternalQrStatusResponse)
def get_qr_status(
    certificate_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> InternalQrStatusResponse:
    """
    Get QR image status for a certificate.

    Returns whether the certificate has a QR image stored in DB.
    """
    current_user = _get_current_user(credentials=credentials, db=db)

    cert = db.query(CertificateRecordRow).filter(
        CertificateRecordRow.certificate_id == int(certificate_id)
    ).first()

    if cert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")

    return InternalQrStatusResponse(
        ok=True,
        mode="internal_qr_status",
        certificate_id=certificate_id,
        has_qr_image=bool(cert.qr_image_data),
        qr_image_data=cert.qr_image_data,
        qr_file_path=None,
    )


@router.post("/internal-qr/from-print-form", response_model=InternalQrFromPrintFormResponse)
def generate_internal_qr_from_print_form(
    payload: InternalQrFromPrintFormRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> InternalQrFromPrintFormResponse:
    """
    [DISABLED] Generate QR from print form data using the internal portal.

    This endpoint is temporarily disabled pending redesign.
    """
    _ = payload, credentials, db
    return InternalQrFromPrintFormResponse(
        ok=False,
        mode="qr_portal_disabled",
        message="Tính năng QR portal nội bộ đang được thiết kế lại. Vui lòng sử dụng tải QR thủ công.",
        qr_status="DISABLED",
        action_taken="NONE",
        qr_image_data=None,
        qr_file_path=None,
        portal_certificate_no=None,
        external_ref=None,
        error_code="QR_PORTAL_REDESIGN_PENDING",
        error_message="Tính năng QR portal nội bộ đang được thiết kế lại. Vui lòng sử dụng tải QR thủ công.",
        has_qr_image=False,
    )


@router.post("/internal-qr/api-first/generate", response_model=InternalQrApiFirstResponse)
def generate_qr_api_first(
    payload: InternalQrApiFirstRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
) -> InternalQrApiFirstResponse:
    """
    Generate QR from internal portal using API-first approach (no Playwright).

    Flow:
    1. Login to portal with provided credentials.
    2. Search for existing certificate by GCN or contract number.
    3. If found: download QR from existing row.
    4. If not found: submit new certificate record, then download QR.
    5. Return QR image data (base64 data URL).

    Credentials are passed in the request body and NOT stored.
    """
    _ = credentials  # credentials may be None for public endpoints, not used here

    cert_no = str(payload.certificate_no or "").strip()
    contract_no = str(payload.contract_no or "").strip()

    if not cert_no and not contract_no:
        return InternalQrApiFirstResponse(
            ok=False,
            qr_status="FAILED",
            action_taken="NONE",
            error_code=QrPortalErrorCode.VALIDATION_FAILED,
            error_message="certificate_no or contract_no is required",
        )

    org_name = str(payload.organization_name or "").strip()
    if not org_name:
        return InternalQrApiFirstResponse(
            ok=False,
            qr_status="FAILED",
            action_taken="NONE",
            error_code=QrPortalErrorCode.VALIDATION_FAILED,
            error_message="organization_name is required",
        )

    with InternalQrPortalClient() as client:
        result = client.generate_qr(
            portal_username=payload.portal_username,
            portal_password=payload.portal_password,
            certificate_no=cert_no,
            contract_no=contract_no,
            effective_from=payload.effective_from,
            effective_to=payload.effective_to,
            issue_date=payload.issue_date,
            organization_name=org_name,
            address=str(payload.address or "").strip(),
            tax_code=str(payload.tax_code or "").strip(),
            brand_name=str(payload.brand_name or "").strip(),
            usage_address=str(payload.usage_address or "").strip(),
            domain=str(payload.domain or "").strip(),
            region=str(payload.region or "").strip(),
            portal_note=payload.portal_note,
        )

        message = ""
        if result.action_taken == "EXISTING_ROW":
            if result.qr_image_data:
                message = "Đã tìm thấy dữ liệu trên portal và tải QR."
            else:
                message = "Đã tìm thấy dữ liệu trên portal nhưng chưa có QR."
        elif result.action_taken == "CREATED_NEW":
            if result.qr_image_data:
                message = "Đã tạo dữ liệu mới trên portal và tải QR."
            else:
                message = "Đã tạo dữ liệu mới trên portal nhưng chưa có QR."
        elif result.error_code:
            message = result.error_message or result.error_code

        return InternalQrApiFirstResponse(
            ok=result.ok,
            qr_status="SUCCESS" if result.qr_image_data else "FAILED",
            action_taken=result.action_taken,
            qr_image_data=result.qr_image_data,
            portal_certificate_no=result.portal_certificate_no,
            error_code=result.error_code,
            error_message=message if not result.ok else None,
        )


# =============================================================================
# OPEN AND FILL — visible browser, user confirms save manually
# =============================================================================

@router.post("/internal-qr/open-and-fill", response_model=InternalQrOpenAndFillResponse)
async def open_and_fill_portal_endpoint(
    payload: InternalQrOpenAndFillRequest,
    request: Request,
) -> InternalQrOpenAndFillResponse:
    """
    [DISABLED FROM UI] Open portal in visible browser, auto-fill form, and STOP.

    QR portal automation now uses Chrome Extension on the user's machine.
    Backend Playwright is disabled from UI by default
    (QR_PORTAL_BACKEND_PLAYWRIGHT_ENABLED=false).

    Returns QR_PORTAL_EXTENSION_REQUIRED if called from a remote client.
    Only runs locally when QR_PORTAL_BACKEND_PLAYWRIGHT_ENABLED=true
    AND request originates from localhost/127.0.0.1/::1.
    """
    if not _can_run_playwright(request):
        return InternalQrOpenAndFillResponse(
            ok=False,
            status="QR_PORTAL_EXTENSION_REQUIRED",
            message="QR portal automation đã chuyển sang Chrome Extension. "
                    "Backend Playwright đã tắt. Vui lòng cài VCPMC QR Helper.",
            error_code="QR_PORTAL_EXTENSION_REQUIRED",
            error_message="QR portal automation đã chuyển sang Chrome Extension. Backend Playwright đã tắt.",
        )
    payload_dict = {
        "portal_username": payload.portal_username,
        "portal_password": payload.portal_password,
        "certificate_no": payload.certificate_no,
        "contract_no": payload.contract_no,
        "issue_date": payload.issue_date,
        "effective_from": payload.effective_from,
        "effective_to": payload.effective_to,
        "organization_name": payload.organization_name,
        "brand_name": payload.brand_name,
        "tax_code": payload.tax_code,
        "address": payload.address,
        "usage_address": payload.usage_address,
        "domain": payload.domain,
        "region": payload.region,
        "portal_note": payload.portal_note,
    }

    try:
        result = await anyio.to_thread.run_sync(open_and_fill_portal, payload_dict)

        return InternalQrOpenAndFillResponse(
            ok=result.ok,
            status=result.status,
            message=result.message,
            session_id=result.session_id,
            error_code=result.error_code,
            error_message=result.error_message,
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"open_and_fill_portal error: {e}")
        return InternalQrOpenAndFillResponse(
            ok=False,
            status="UNEXPECTED_ERROR",
            message="Có lỗi khi mở portal. Vui lòng thử lại.",
            error_code="UNEXPECTED_ERROR",
            error_message=str(e),
        )


# =============================================================================
# DOWNLOAD QR AFTER USER SAVE — API-first, no browser
# =============================================================================

@router.post("/internal-qr/download-after-user-save", response_model=InternalQrDownloadAfterUserSaveResponse)
def download_qr_after_user_save_endpoint(
    payload: InternalQrDownloadAfterUserSaveRequest,
) -> InternalQrDownloadAfterUserSaveResponse:
    """
    After the user manually saves a certificate record on the portal,
    search for the row and download the QR code.

    Uses API-first approach (httpx) — no browser needed.

    Flow:
    1. Login to portal with provided credentials.
    2. Search by certificate_no (preferred) or contract_no.
    3. Find the exact matching row.
    4. Download QR from the row.
    5. Return QR image data.

    Returns ROW_NOT_FOUND if the row is not found after user save.
    Returns AMBIGUOUS_MATCH if multiple rows match.
    """
    cert_no = str(payload.certificate_no or "").strip()
    contract_no = str(payload.contract_no or "").strip()

    if not cert_no and not contract_no:
        return InternalQrDownloadAfterUserSaveResponse(
            ok=False,
            status="VALIDATION_FAILED",
            message="certificate_no hoặc contract_no bắt buộc.",
            error_code="VALIDATION_FAILED",
            error_message="certificate_no or contract_no is required",
        )

    result = download_qr_after_user_save(
        username=payload.portal_username,
        password=payload.portal_password,
        cert_no=cert_no,
        contract_no=contract_no,
    )

    return InternalQrDownloadAfterUserSaveResponse(
        ok=result.ok,
        status=result.status,
        message=result.message,
        qr_image_data=result.qr_image_data,
        portal_certificate_no=result.portal_certificate_no,
        action_taken=result.action_taken,
        error_code=result.error_code,
        error_message=result.error_message,
    )


# =============================================================================
# OPEN PORTAL FOR REVIEW — visible browser, fill form, STOP (no submit)
# =============================================================================

@router.post("/internal-qr/open-portal-review", response_model=InternalQrOpenPortalReviewResponse)
async def open_portal_review_endpoint(
    payload: InternalQrOpenPortalReviewRequest,
    request: Request,
) -> InternalQrOpenPortalReviewResponse:
    """
    [DISABLED FROM UI] Opens the QR portal in visible browser, fills form, and STOPS.

    QR portal automation now uses Chrome Extension on the user's machine.
    Backend Playwright is disabled from UI by default
    (QR_PORTAL_BACKEND_PLAYWRIGHT_ENABLED=false).

    Returns QR_PORTAL_EXTENSION_REQUIRED if called from a remote client.
    Only runs locally when QR_PORTAL_BACKEND_PLAYWRIGHT_ENABLED=true
    AND request originates from localhost/127.0.0.1/::1.
    """
    if not _can_run_playwright(request):
        return InternalQrOpenPortalReviewResponse(
            ok=False,
            status="QR_PORTAL_EXTENSION_REQUIRED",
            message="QR portal automation đã chuyển sang Chrome Extension. "
                    "Backend Playwright đã tắt. Vui lòng cài VCPMC QR Helper.",
            stage="EXTENSION_REQUIRED",
            error_code="QR_PORTAL_EXTENSION_REQUIRED",
            error_message="QR portal automation đã chuyển sang Chrome Extension. Backend Playwright đã tắt.",
        )
    _log = logging.getLogger(__name__)

    payload_dict = {
        "portal_username": payload.portal_username,
        "portal_password": payload.portal_password,
        "certificate_no": payload.certificate_no,
        "contract_no": payload.contract_no,
        "issue_date": payload.issue_date,
        "effective_from": payload.effective_from,
        "effective_to": payload.effective_to,
        "organization_name": payload.organization_name,
        "brand_name": payload.brand_name,
        "tax_code": payload.tax_code,
        "address": payload.address,
        "usage_address": payload.usage_address,
        "domain": payload.domain,
        "region": payload.region,
        "portal_note": payload.portal_note,
    }

    # ---- Validate credentials ----
    if not payload.portal_username.strip() or not payload.portal_password.strip():
        return InternalQrOpenPortalReviewResponse(
            ok=False,
            status="VALIDATION_FAILED",
            message="Tài khoản và mật khẩu portal bắt buộc.",
            stage="VALIDATION",
            error_code="VALIDATION_FAILED",
            error_message="portal_username and portal_password are required",
        )

    # ---- Write payload to temp file ----
    try:
        backend_root = Path(__file__).parent.parent.parent.resolve()
    except Exception:
        backend_root = Path.cwd()

    worker_script = backend_root / "scripts" / "open_portal_review_worker.py"
    if not worker_script.exists():
        _log.error(f"Worker script not found: {worker_script}")
        return InternalQrOpenPortalReviewResponse(
            ok=False,
            status="WORKER_NOT_FOUND",
            message="Worker script not found. Restart backend.",
            stage="WORKER_SPAWN",
            error_code="WORKER_NOT_FOUND",
            error_message=f"File not found: {worker_script}",
        )

    try:
        with tempfile.TemporaryDirectory(prefix="qr_worker_") as tmpdir:
            payload_path = Path(tmpdir) / "payload.json"
            result_path = Path(tmpdir) / "result.json"

            with open(payload_path, "w", encoding="utf-8") as f:
                json.dump(payload_dict, f)

            # ---- Run worker subprocess ----
            _log.info(
                f"Spawning portal_review_worker for user={payload.portal_username}, "
                f"cert={payload.certificate_no}"
            )

            python_exe = Path(sys.executable)
            proc = subprocess.run(
                [str(python_exe), str(worker_script), str(payload_path), str(result_path)],
                capture_output=False,
                timeout=180,
            )

            if proc.returncode not in (0, 1, 2):
                _log.error(f"Worker crashed: exit_code={proc.returncode}")
                return InternalQrOpenPortalReviewResponse(
                    ok=False,
                    status="WORKER_CRASH",
                    message="Worker process crashed unexpectedly.",
                    stage="WORKER_SPAWN",
                    error_code="WORKER_CRASH",
                    error_message=f"Exit code: {proc.returncode}",
                )

            # ---- Read result ----
            if not result_path.exists():
                _log.error("Worker did not produce result file")
                return InternalQrOpenPortalReviewResponse(
                    ok=False,
                    status="WORKER_NO_RESULT",
                    message="Worker did not produce result file.",
                    stage="WORKER_RESULT",
                    error_code="WORKER_NO_RESULT",
                )

            with open(result_path, "r", encoding="utf-8") as f:
                result_data = json.load(f)

            _log.info(
                f"Worker returned: ok={result_data.get('ok')}, "
                f"status={result_data.get('status')}, "
                f"stage={result_data.get('stage')}"
            )

            return InternalQrOpenPortalReviewResponse(
                ok=result_data.get("ok", False),
                status=result_data.get("status", "UNKNOWN"),
                message=result_data.get("message", ""),
                stage=result_data.get("stage", ""),
                filled_fields=result_data.get("filled_fields") or [],
                missing_fields=result_data.get("missing_fields") or [],
                error_code=result_data.get("error_code"),
                error_message=result_data.get("error_message"),
                error_type=result_data.get("error_type"),
                debug_screenshot=result_data.get("debug_screenshot"),
                debug_html=result_data.get("debug_html"),
            )

    except subprocess.TimeoutExpired:
        _log.error("Worker subprocess timed out")
        return InternalQrOpenPortalReviewResponse(
            ok=False,
            status="WORKER_TIMEOUT",
            message="Worker timed out after 180 seconds.",
            stage="WORKER_TIMEOUT",
            error_code="WORKER_TIMEOUT",
            error_message="subprocess timeout after 180s",
        )
    except Exception as e:
        _log.exception(f"open_portal_review endpoint exception: {e}")
        return InternalQrOpenPortalReviewResponse(
            ok=False,
            status="UNEXPECTED_ERROR",
            message="Co loi khi mo portal. Vui long thu lai.",
            stage="ENDPOINT_EXCEPTION",
            error_code="UNEXPECTED_ERROR",
            error_message=str(e),
            error_type=type(e).__name__,
        )


# =============================================================================
# STEP-BY-STEP PORTAL QR ENDPOINTS
# Each endpoint calls portal_qr_worker.py via subprocess with a specific action.
# =============================================================================

def _run_portal_worker(action: str, payload: dict) -> dict:
    """Run portal_qr_worker.py with the given action and payload via stdin."""
    from pathlib import Path

    try:
        backend_root = Path(__file__).parent.parent.parent.resolve()
    except Exception:
        backend_root = Path.cwd()

    worker_script = backend_root / "scripts" / "portal_qr_worker.py"
    if not worker_script.exists():
        return {
            "ok": False,
            "status": "WORKER_NOT_FOUND",
            "message": f"Worker script not found: {worker_script}",
            "stage": "WORKER_SPAWN",
            "error_code": "WORKER_NOT_FOUND",
        }

    worker_payload = json.dumps({"action": action, "data": payload}, ensure_ascii=False)

    try:
        python_exe = Path(sys.executable)
        proc_env = os.environ.copy()
        proc_env["PYTHONIOENCODING"] = "utf-8"
        proc = subprocess.Popen(
            [str(python_exe), str(worker_script)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=proc_env,
        )
        stdout_raw, stderr_raw = proc.communicate(input=worker_payload.encode("utf-8"), timeout=300)

        if proc.returncode not in (0, 1, 2):
            return {
                "ok": False,
                "status": "WORKER_CRASH",
                "message": f"Worker crashed with exit code {proc.returncode}",
                "stage": "WORKER_SPAWN",
                "error_code": "WORKER_CRASH",
                "error_message": stderr_raw.decode("utf-8", errors="replace"),
            }

        result_str = stdout_raw.decode("utf-8", errors="replace").strip()
        if not result_str:
            return {
                "ok": False,
                "status": "WORKER_NO_OUTPUT",
                "message": "Worker produced no output",
                "stage": "WORKER_RESULT",
                "error_code": "WORKER_NO_OUTPUT",
                "error_message": stderr_raw.decode("utf-8", errors="replace"),
            }

        return json.loads(result_str)

    except subprocess.TimeoutExpired:
        proc.kill()
        proc.communicate()
        return {
            "ok": False,
            "status": "WORKER_TIMEOUT",
            "message": "Worker timed out after 300 seconds",
            "stage": "WORKER_TIMEOUT",
            "error_code": "WORKER_TIMEOUT",
        }
    except Exception as e:
        return {
            "ok": False,
            "status": "UNEXPECTED_ERROR",
            "message": str(e),
            "stage": "ENDPOINT_EXCEPTION",
            "error_code": "UNEXPECTED_ERROR",
            "error_message": str(e),
            "error_type": type(e).__name__,
        }


def _build_portal_payload(
    req: PortalActionRequest,
    *,
    saved_decrypted_password: str | None = None,
) -> dict:
    """
    Build worker payload from request.
    If use_saved_credential=True and portal_password is empty, use saved_decrypted_password.
    """
    effective_password = ""
    if req.portal_password:
        effective_password = req.portal_password
    elif req.use_saved_credential and saved_decrypted_password:
        effective_password = saved_decrypted_password

    return {
        "portal_username": req.portal_username or "",
        "portal_password": effective_password,
        "certificate_no": req.certificate_no,
        "contract_no": req.contract_no,
        "issue_date": req.issue_date,
        "effective_from": req.effective_from,
        "effective_to": req.effective_to,
        "organization_name": req.organization_name,
        "address": req.address,
        "brand_name": req.brand_name,
        "tax_code": req.tax_code,
        "usage_address": req.usage_address,
        "domain": req.domain,
        "region": req.region,
        "portal_note": req.portal_note,
    }


def _portal_action_response(worker_result: dict) -> PortalActionResponse:
    return PortalActionResponse(
        ok=worker_result.get("ok", False),
        status=worker_result.get("status", "UNKNOWN"),
        message=worker_result.get("message", ""),
        stage=worker_result.get("stage", ""),
        error_code=worker_result.get("error_code"),
        error_message=worker_result.get("error_message"),
        error_type=worker_result.get("error_type"),
        debug_screenshot=worker_result.get("debug_screenshot"),
        debug_html=worker_result.get("debug_html"),
        filled_fields=worker_result.get("filled_fields") or [],
        missing_fields=worker_result.get("missing_fields") or [],
        search_found=worker_result.get("search_found", False),
        search_count=worker_result.get("search_count", 0),
        qr_image_base64=worker_result.get("qr_image_base64"),
    )


@router.post("/internal-qr/portal/open", response_model=PortalActionResponse)
async def portal_open(
    req: PortalActionRequest,
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    """
    Step 1: Open portal QR in visible browser, auto-login with provided credentials
    or with saved credentials (decrypted server-side).

    Priority:
    1. If portal_username + portal_password are provided in request -> use them
    2. If use_saved_credential=True and credentials are saved for user -> decrypt and use
    3. Otherwise -> VALIDATION_FAILED

    SECURITY:
    - Plain password is never logged.
    - Password is never returned in response.
    - Saved credentials are encrypted at rest in DB.

    REMOTE CLIENT SAFETY:
    - If the request comes from a non-localhost client AND
      QR_PORTAL_ALLOW_REMOTE_PLAYWRIGHT=false (default), the request is rejected.
    - This prevents remote users from accidentally triggering Playwright on the
      backend machine instead of their own machine.
    """
    _log = logging.getLogger(__name__)

    # ── Extension-only guard — backend Playwright disabled from UI ─────────────────
    # QR portal automation now requires VCPMC QR Helper extension on the user's machine.
    # Backend Playwright is disabled by default (QR_PORTAL_BACKEND_PLAYWRIGHT_ENABLED=false).
    # This prevents remote clients from accidentally triggering Playwright on the
    # backend machine. Portal automation runs via Chrome Extension on the user's machine.
    if not _can_run_playwright(request):
        _log.warning(
            f"[portal/open] BLOCKED: QR portal automation now requires VCPMC QR Helper extension "
            f"(client={request.client.host}). Backend Playwright is disabled from UI."
        )
        return PortalActionResponse(
            ok=False,
            status="QR_PORTAL_EXTENSION_REQUIRED",
            message="QR portal automation now requires VCPMC QR Helper extension on this machine. "
                    "Please install the VCPMC QR Helper Chrome Extension.",
            stage="EXTENSION_REQUIRED",
            error_code="QR_PORTAL_EXTENSION_REQUIRED",
        )
    # ── End guard ─────────────────────────────────────────────────────────────

    # Determine effective credentials
    username = (req.portal_username or "").strip()
    password = (req.portal_password or "").strip() if req.portal_password else ""
    saved_decrypted_password: str | None = None

    if username and password:
        # Credentials explicitly provided — use them
        _log.info(f"[portal/open] Using explicit credentials for user={username!r}")
    elif req.use_saved_credential:
        # Try to load saved credentials for the current user
        current_user = _get_current_user(credentials=credentials, db=db)
        row = db.query(InternalQrPortalCredentialRow).filter(
            InternalQrPortalCredentialRow.user_id == current_user.id,
            InternalQrPortalCredentialRow.portal_url == _QR_PORTAL_URL,
        ).first()
        if not row or not row.portal_password_encrypted:
            _log.warning(f"[portal/open] use_saved_credential=True but no saved credential found for user_id={current_user.id}")
            return PortalActionResponse(
                ok=False,
                status="NO_SAVED_CREDENTIAL",
                message="Chưa lưu thông tin đăng nhập. Vui lòng nhập tài khoản và mật khẩu.",
                stage="CREDENTIAL_CHECK",
                error_code="NO_SAVED_CREDENTIAL",
            )
        username = row.portal_username or ""
        if not username:
            return PortalActionResponse(
                ok=False,
                status="NO_SAVED_CREDENTIAL",
                message="Không tìm thấy tài khoản đã lưu.",
                stage="CREDENTIAL_CHECK",
                error_code="NO_SAVED_CREDENTIAL",
            )
        if not is_encryption_available():
            _log.error("[portal/open] Encryption key not configured but saved credential exists")
            return PortalActionResponse(
                ok=False,
                status="CREDENTIAL_ENCRYPTION_KEY_MISSING",
                message="Không thể giải mã thông tin đã lưu. Vui lòng nhập tài khoản và mật khẩu.",
                stage="CREDENTIAL_CHECK",
                error_code="CREDENTIAL_ENCRYPTION_KEY_MISSING",
            )
        saved_decrypted_password = decrypt_password(row.portal_password_encrypted)
        if not saved_decrypted_password:
            _log.error(f"[portal/open] Decryption failed for user_id={current_user.id}")
            return PortalActionResponse(
                ok=False,
                status="CREDENTIAL_DECRYPT_FAILED",
                message="Không thể giải mã thông tin đã lưu. Vui lòng nhập lại tài khoản và mật khẩu.",
                stage="CREDENTIAL_CHECK",
                error_code="CREDENTIAL_DECRYPT_FAILED",
            )
        _log.info(f"[portal/open] Using saved credential for user_id={current_user.id} username={username!r}")
    else:
        return PortalActionResponse(
            ok=False,
            status="VALIDATION_FAILED",
            message="Cần nhập tài khoản và mật khẩu portal, hoặc bật 'Dùng thông tin đã lưu'.",
            stage="VALIDATION",
            error_code="VALIDATION_FAILED",
        )

    payload = _build_portal_payload(req, saved_decrypted_password=saved_decrypted_password)
    worker_result = _run_portal_worker("open_portal", payload)

    _log.info(
        f"[portal/open] Done: ok={worker_result.get('ok')}, "
        f"status={worker_result.get('status')}"
    )
    return _portal_action_response(worker_result)


@router.post("/internal-qr/portal/fill-form", response_model=PortalActionResponse)
async def portal_fill_form(
    req: PortalActionRequest,
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    """
    Step 2: Click "Thêm mới" on portal, fill form with app data, stop.
    Does NOT submit. Browser stays open for user to review.
    Returns LOGIN_REQUIRED if session not found.

    If use_saved_credential=True and no explicit credentials provided,
    uses the saved credentials (decrypted server-side).
    """
    _log = logging.getLogger(__name__)

    # ── Extension-only guard ──────────────────────────────────────────────────
    if not _can_run_playwright(request):
        _log.warning(
            f"[portal/fill-form] BLOCKED: extension required "
            f"(client={request.client.host}). Backend Playwright disabled from UI."
        )
        return PortalActionResponse(
            ok=False,
            status="QR_PORTAL_EXTENSION_REQUIRED",
            message="QR portal automation now requires VCPMC QR Helper extension on this machine.",
            stage="EXTENSION_REQUIRED",
            error_code="QR_PORTAL_EXTENSION_REQUIRED",
        )
    # ── End guard ─────────────────────────────────────────────────────────────

    _log.info(f"[portal/fill-form] Starting, cert={req.certificate_no}")

    username = (req.portal_username or "").strip()
    password = (req.portal_password or "").strip() if req.portal_password else ""
    saved_decrypted_password: str | None = None

    if not username or not password:
        if req.use_saved_credential:
            current_user = _get_current_user(credentials=credentials, db=db)
            row = db.query(InternalQrPortalCredentialRow).filter(
                InternalQrPortalCredentialRow.user_id == current_user.id,
                InternalQrPortalCredentialRow.portal_url == _QR_PORTAL_URL,
            ).first()
            if not row or not row.portal_username or not row.portal_password_encrypted:
                _log.warning(f"[portal/fill-form] use_saved_credential=True but no saved credential for user_id={current_user.id}")
                return PortalActionResponse(
                    ok=False,
                    status="NO_SAVED_CREDENTIAL",
                    message="Chưa lưu thông tin đăng nhập. Vui lòng nhập tài khoản và mật khẩu.",
                    stage="CREDENTIAL_CHECK",
                    error_code="NO_SAVED_CREDENTIAL",
                )
            if not is_encryption_available():
                return PortalActionResponse(
                    ok=False,
                    status="CREDENTIAL_ENCRYPTION_KEY_MISSING",
                    message="Không thể giải mã thông tin đã lưu. Vui lòng nhập tài khoản và mật khẩu.",
                    stage="CREDENTIAL_CHECK",
                    error_code="CREDENTIAL_ENCRYPTION_KEY_MISSING",
                )
            username = row.portal_username or ""
            saved_decrypted_password = decrypt_password(row.portal_password_encrypted)
            if not saved_decrypted_password:
                return PortalActionResponse(
                    ok=False,
                    status="CREDENTIAL_DECRYPT_FAILED",
                    message="Không thể giải mã thông tin đã lưu. Vui lòng nhập lại.",
                    stage="CREDENTIAL_CHECK",
                    error_code="CREDENTIAL_DECRYPT_FAILED",
                )
            _log.info(f"[portal/fill-form] Using saved credential for user_id={current_user.id} username={username!r}")
        else:
            _log.warning("[portal/fill-form] No credentials provided and use_saved_credential=False")

    payload = _build_portal_payload(req, saved_decrypted_password=saved_decrypted_password)
    worker_result = _run_portal_worker("fill_form", payload)

    _log.info(
        f"[portal/fill-form] Done: ok={worker_result.get('ok')}, "
        f"status={worker_result.get('status')}, "
        f"filled={worker_result.get('filled_fields', [])}, "
        f"missing={worker_result.get('missing_fields', [])}"
    )
    return _portal_action_response(worker_result)


@router.post("/internal-qr/portal/search", response_model=PortalActionResponse)
async def portal_search(
    req: PortalActionRequest,
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    """
    Step 3: Search for record by certificate number or contract number.
    Returns FOUND (1 match), NOT_FOUND (0), or AMBIGUOUS (multiple).
    Does NOT auto-download if ambiguous.

    If use_saved_credential=True and no explicit credentials provided,
    uses the saved credentials (decrypted server-side).
    """
    _log = logging.getLogger(__name__)

    # ── Extension-only guard ──────────────────────────────────────────────────
    if not _can_run_playwright(request):
        _log.warning(
            f"[portal/search] BLOCKED: extension required "
            f"(client={request.client.host}). Backend Playwright disabled from UI."
        )
        return PortalActionResponse(
            ok=False,
            status="QR_PORTAL_EXTENSION_REQUIRED",
            message="QR portal automation now requires VCPMC QR Helper extension on this machine.",
            stage="EXTENSION_REQUIRED",
            error_code="QR_PORTAL_EXTENSION_REQUIRED",
        )
    # ── End guard ───────────────────────────────────────────────────────────

    _log.info(f"[portal/search] Starting, cert={req.certificate_no}, contract={req.contract_no}")

    username = (req.portal_username or "").strip()
    password = (req.portal_password or "").strip() if req.portal_password else ""
    saved_decrypted_password: str | None = None

    if not username or not password:
        if req.use_saved_credential:
            current_user = _get_current_user(credentials=credentials, db=db)
            row = db.query(InternalQrPortalCredentialRow).filter(
                InternalQrPortalCredentialRow.user_id == current_user.id,
                InternalQrPortalCredentialRow.portal_url == _QR_PORTAL_URL,
            ).first()
            if not row or not row.portal_username or not row.portal_password_encrypted:
                _log.warning(f"[portal/search] use_saved_credential=True but no saved credential for user_id={current_user.id}")
                return PortalActionResponse(
                    ok=False,
                    status="NO_SAVED_CREDENTIAL",
                    message="Chưa lưu thông tin đăng nhập. Vui lòng nhập tài khoản và mật khẩu.",
                    stage="CREDENTIAL_CHECK",
                    error_code="NO_SAVED_CREDENTIAL",
                )
            if not is_encryption_available():
                return PortalActionResponse(
                    ok=False,
                    status="CREDENTIAL_ENCRYPTION_KEY_MISSING",
                    message="Không thể giải mã thông tin đã lưu.",
                    stage="CREDENTIAL_CHECK",
                    error_code="CREDENTIAL_ENCRYPTION_KEY_MISSING",
                )
            username = row.portal_username or ""
            saved_decrypted_password = decrypt_password(row.portal_password_encrypted)
            if not saved_decrypted_password:
                return PortalActionResponse(
                    ok=False,
                    status="CREDENTIAL_DECRYPT_FAILED",
                    message="Không thể giải mã thông tin đã lưu.",
                    stage="CREDENTIAL_CHECK",
                    error_code="CREDENTIAL_DECRYPT_FAILED",
                )
            _log.info(f"[portal/search] Using saved credential for user_id={current_user.id} username={username!r}")

    payload = _build_portal_payload(req, saved_decrypted_password=saved_decrypted_password)
    worker_result = _run_portal_worker("search_record", payload)

    _log.info(
        f"[portal/search] Done: ok={worker_result.get('ok')}, "
        f"status={worker_result.get('status')}, "
        f"search_count={worker_result.get('search_count')}"
    )
    return _portal_action_response(worker_result)


@router.post("/internal-qr/portal/download-qr", response_model=PortalActionResponse)
async def portal_download_qr(
    req: PortalActionRequest,
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    """
    Step 4: Search for record, open it, download QR image.
    Returns QR as base64 data URI in qr_image_base64 field.
    Only use after step 3 returns FOUND.

    If use_saved_credential=True and no explicit credentials provided,
    uses the saved credentials (decrypted server-side).
    """
    _log = logging.getLogger(__name__)

    # ── Extension-only guard ──────────────────────────────────────────────────
    if not _can_run_playwright(request):
        _log.warning(
            f"[portal/download-qr] BLOCKED: extension required "
            f"(client={request.client.host}). Backend Playwright disabled from UI."
        )
        return PortalActionResponse(
            ok=False,
            status="QR_PORTAL_EXTENSION_REQUIRED",
            message="QR portal automation now requires VCPMC QR Helper extension on this machine.",
            stage="EXTENSION_REQUIRED",
            error_code="QR_PORTAL_EXTENSION_REQUIRED",
        )
    # ── End guard ───────────────────────────────────────────────────────────

    _log.info(f"[portal/download-qr] Starting, cert={req.certificate_no}")

    username = (req.portal_username or "").strip()
    password = (req.portal_password or "").strip() if req.portal_password else ""
    saved_decrypted_password: str | None = None

    if not username or not password:
        if req.use_saved_credential:
            current_user = _get_current_user(credentials=credentials, db=db)
            row = db.query(InternalQrPortalCredentialRow).filter(
                InternalQrPortalCredentialRow.user_id == current_user.id,
                InternalQrPortalCredentialRow.portal_url == _QR_PORTAL_URL,
            ).first()
            if not row or not row.portal_username or not row.portal_password_encrypted:
                _log.warning(f"[portal/download-qr] use_saved_credential=True but no saved credential for user_id={current_user.id}")
                return PortalActionResponse(
                    ok=False,
                    status="NO_SAVED_CREDENTIAL",
                    message="Chưa lưu thông tin đăng nhập.",
                    stage="CREDENTIAL_CHECK",
                    error_code="NO_SAVED_CREDENTIAL",
                )
            if not is_encryption_available():
                return PortalActionResponse(
                    ok=False,
                    status="CREDENTIAL_ENCRYPTION_KEY_MISSING",
                    message="Không thể giải mã thông tin đã lưu.",
                    stage="CREDENTIAL_CHECK",
                    error_code="CREDENTIAL_ENCRYPTION_KEY_MISSING",
                )
            username = row.portal_username or ""
            saved_decrypted_password = decrypt_password(row.portal_password_encrypted)
            if not saved_decrypted_password:
                return PortalActionResponse(
                    ok=False,
                    status="CREDENTIAL_DECRYPT_FAILED",
                    message="Không thể giải mã thông tin đã lưu.",
                    stage="CREDENTIAL_CHECK",
                    error_code="CREDENTIAL_DECRYPT_FAILED",
                )
            _log.info(f"[portal/download-qr] Using saved credential for user_id={current_user.id} username={username!r}")

    payload = _build_portal_payload(req, saved_decrypted_password=saved_decrypted_password)
    worker_result = _run_portal_worker("download_qr", payload)

    _log.info(
        f"[portal/download-qr] Done: ok={worker_result.get('ok')}, "
        f"status={worker_result.get('status')}, "
        f"qr_len={len(worker_result.get('qr_image_base64') or '')}"
    )
    return _portal_action_response(worker_result)


# =============================================================================
# PORTAL CREDENTIAL — per-user saved credentials for QR portal
# =============================================================================

_QR_PORTAL_URL = "http://14.241.251.220:7879"

# PART D — Hard disable backend Playwright from UI:
# - QR_PORTAL_BACKEND_PLAYWRIGHT_ENABLED=false (default): backend Playwright is disabled.
#   UI calls to portal_open/fill/search/download return QR_PORTAL_EXTENSION_REQUIRED.
#   Extension-only mode: QR automation uses Chrome Extension on every machine.
# - QR_PORTAL_BACKEND_PLAYWRIGHT_ENABLED=true: allow legacy backend Playwright ONLY for
#   local debugging (localhost/127.0.0.1/::1 requests).
#   NEVER enable this for production remote clients.
_QR_PORTAL_BACKEND_PLAYWRIGHT_ENABLED = (
    os.environ.get("QR_PORTAL_BACKEND_PLAYWRIGHT_ENABLED", "false").lower() in ("1", "true", "yes")
)


# Remote browser safety: controls whether Playwright automation (portal_open,
# fill_form, etc.) can be triggered from a remote client machine.
# - False (default): Playwright only runs when the frontend is served from the
#   same machine as the backend. Remote clients receive QR_PORTAL_EXTENSION_REQUIRED.
# - True: allow from any client, but the browser opens on the backend machine.
#   Set to True only if you understand that remote users will trigger browser
#   automation on your server, not on their own machine.
_QR_PORTAL_ALLOW_REMOTE = (
    os.environ.get("QR_PORTAL_ALLOW_REMOTE_PLAYWRIGHT", "false").lower() in ("1", "true", "yes")
)


# ──────────────────────────────────────────────────────────────────────────────
# CHROME EXTENSION (IMPLEMENTED) — QR Portal Automation on user's machine
# ──────────────────────────────────────────────────────────────────────────────
# QR portal automation now uses VCPMC QR Helper Chrome Extension on the user's machine.
# Extension detects app pages via content-app-bridge.js (content-script bridge).
# Backend Playwright is disabled from UI (QR_PORTAL_BACKEND_PLAYWRIGHT_ENABLED=false).
# Extension opens portal tab on user's browser, fills form, and stops (no submit).
#
# Flow:
# 1. Frontend detects extension via content-script bridge (no hardcoded extension ID)
# 2. Frontend sends VCPMC_QR_PORTAL_OPEN_AND_WATCH to extension via chrome.runtime
# 3. Extension opens/focuses portal tab, logs in if needed
# 4. Extension watches for "Thêm mới" form, fills it, stops
# 5. User reviews and clicks Lưu manually
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/internal-qr/portal/runtime-mode", response_model=dict)
def portal_runtime_mode(request: Request):
    """
    Returns the runtime mode of the QR portal automation.

    EXTENSION-ONLY MODE: QR portal automation uses Chrome Extension on the user's machine.
    Backend Playwright is disabled from UI by default.

    Response:
    - ok: always true
    - is_local_client: True if request originates from localhost/127.0.0.1/::1
    - backend_playwright_available: True only if QR_PORTAL_BACKEND_PLAYWRIGHT_ENABLED=true
                                   AND request is from localhost (for local debugging only)
    - extension_required: True (always, for UI calls)
    - portal_url: The portal URL

    Frontend uses this to show appropriate UI:
    - Frontend now always uses extension-only mode
    - automation_available in frontend is determined by extension detection, not this endpoint
    """
    is_local = _is_local_client(request)
    backend_available = _can_run_playwright(request)
    reason: str
    if backend_available:
        reason = "backend_local_debug"
    else:
        reason = "extension_only"

    return {
        "ok": True,
        "is_local_client": is_local,
        "backend_playwright_available": backend_available,
        "extension_required": True,
        "reason": reason,
        "portal_url": _QR_PORTAL_URL,
    }


@router.get("/internal-qr/portal/credential", response_model=CredentialGetResponse)
def get_portal_credential(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> CredentialGetResponse:
    """
    Get saved portal credentials for the current authenticated user.

    Returns:
    - portal_url: fixed portal URL
    - portal_username: saved username (or None)
    - has_saved_password: True if password is saved (encrypted)

    Password is NEVER returned to frontend.
    """
    user = _get_current_user(credentials=credentials, db=db)

    try:
        row = db.query(InternalQrPortalCredentialRow).filter(
            InternalQrPortalCredentialRow.user_id == user.id,
            InternalQrPortalCredentialRow.portal_url == _QR_PORTAL_URL,
        ).first()
    except Exception:
        # Table may not exist — treat as no saved credential
        return CredentialGetResponse(
            ok=True,
            portal_url=_QR_PORTAL_URL,
            portal_username=None,
            has_saved_password=False,
            credential_status="error",
        )

    if row and row.portal_password_encrypted:
        credential_status = "saved"
    elif row and row.portal_username:
        credential_status = "username_only"
    else:
        credential_status = "not_saved"

    return CredentialGetResponse(
        ok=True,
        portal_url=_QR_PORTAL_URL,
        portal_username=row.portal_username if row else None,
        has_saved_password=bool(row and row.portal_password_encrypted),
        credential_status=credential_status,
    )


@router.put("/internal-qr/portal/credential", response_model=CredentialSaveResponse)
def save_portal_credential(
    payload: CredentialSaveRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> CredentialSaveResponse:
    """
    Save (or update) portal credentials for the current authenticated user.

    If remember_password=True and portal_password is provided:
    - Encrypt password with Fernet
    - Store encrypted password in DB

    If remember_password=False or portal_password is empty:
    - Password field is cleared

    SECURITY:
    - Password is encrypted at rest in DB
    - Plain password is never logged
    - Password is never returned in response

    Error codes:
    - VALIDATION_FAILED: username is empty
    - CREDENTIAL_ENCRYPTION_KEY_MISSING: QR_PORTAL_CREDENTIAL_KEY env var not set
    - ENCRYPTION_FAILED: encryption operation failed
    - DB_TABLE_MISSING: internal_qr_portal_credentials table does not exist
    """
    _log = logging.getLogger(__name__)
    user = _get_current_user(credentials=credentials, db=db)

    username = (payload.portal_username or "").strip()
    if not username:
        return CredentialSaveResponse(
            ok=False,
            portal_url=_QR_PORTAL_URL,
            portal_username="",
            has_saved_password=False,
            error_code="VALIDATION_FAILED",
            message="portal_username is required.",
        )

    # ---- Check for missing encryption key FIRST (before touching DB) ----
    if payload.remember_password and payload.portal_password:
        plain_pw = (payload.portal_password or "").strip()
        if plain_pw:
            if is_encryption_key_missing():
                _log.warning(
                    f"[save_portal_credential] user_id={user.id} username={username!r} "
                    f"error=CREDENTIAL_ENCRYPTION_KEY_MISSING "
                    f"reason=QR_PORTAL_CREDENTIAL_KEY env var not set"
                )
                return CredentialSaveResponse(
                    ok=False,
                    portal_url=_QR_PORTAL_URL,
                    portal_username=username,
                    has_saved_password=False,
                    error_code="CREDENTIAL_ENCRYPTION_KEY_MISSING",
                    message="Thiếu QR_PORTAL_CREDENTIAL_KEY. Không thể lưu mật khẩu. Vui lòng báo admin cấu hình biến môi trường.",
                )

    # ---- Ensure DB table exists ----
    try:
        table_exists = db.execute(
            text("SELECT 1 FROM internal_qr_portal_credentials LIMIT 1")
        ).scalar() is not None
    except Exception as table_exc:
        _log.warning(f"[save_portal_credential] Table check failed: {table_exc}")
        table_exists = False

    if not table_exists:
        _log.warning(
            f"[save_portal_credential] user_id={user.id} username={username!r} "
            f"error=DB_TABLE_MISSING "
            f"table=internal_qr_portal_credentials"
        )
        # Attempt to create the table automatically
        try:
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS internal_qr_portal_credentials (
                    id SERIAL PRIMARY KEY,
                    user_id INT NOT NULL,
                    portal_url VARCHAR(512) NOT NULL,
                    portal_username VARCHAR(128) NOT NULL,
                    portal_password_encrypted TEXT,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """))
            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_internal_qr_portal_credentials_user_id
                ON internal_qr_portal_credentials(user_id)
            """))
            db.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_qr_portal_credentials_unique
                ON internal_qr_portal_credentials(user_id, portal_url)
            """))
            db.commit()
            _log.info("[save_portal_credential] Table internal_qr_portal_credentials created successfully")
            table_exists = True
        except Exception as create_exc:
            _log.error(f"[save_portal_credential] Failed to create table: {create_exc}")
            db.rollback()
            return CredentialSaveResponse(
                ok=False,
                portal_url=_QR_PORTAL_URL,
                portal_username=username,
                has_saved_password=False,
                error_code="DB_TABLE_MISSING",
                message="Thiếu bảng internal_qr_portal_credentials và không thể tạo tự động. Vui lòng báo admin chạy migration.",
            )

    # ---- Load existing row if any ----
    row: InternalQrPortalCredentialRow | None = None
    try:
        row = db.query(InternalQrPortalCredentialRow).filter(
            InternalQrPortalCredentialRow.user_id == user.id,
            InternalQrPortalCredentialRow.portal_url == _QR_PORTAL_URL,
        ).first()
    except Exception as query_exc:
        _log.warning(f"[save_portal_credential] Query existing row failed: {query_exc}")

    from datetime import datetime

    encrypted: str | None = None
    has_password = False

    if payload.remember_password and payload.portal_password:
        plain_pw = (payload.portal_password or "").strip()
        if plain_pw:
            encrypted = encrypt_password(plain_pw)
            if encrypted is None:
                _log.error(
                    f"[save_portal_credential] user_id={user.id} username={username!r} "
                    f"error=ENCRYPTION_FAILED"
                )
                return CredentialSaveResponse(
                    ok=False,
                    portal_url=_QR_PORTAL_URL,
                    portal_username=username,
                    has_saved_password=False,
                    error_code="ENCRYPTION_FAILED",
                    message="Encryption failed. Password was NOT saved.",
                )
            has_password = True

    now = datetime.utcnow()

    try:
        if row:
            row.portal_username = username
            row.portal_password_encrypted = encrypted
            row.updated_at = now
        else:
            row = InternalQrPortalCredentialRow(
                user_id=user.id,
                portal_url=_QR_PORTAL_URL,
                portal_username=username,
                portal_password_encrypted=encrypted,
                created_at=now,
                updated_at=now,
            )
            db.add(row)

        db.commit()

        _log.info(
            f"[save_portal_credential] user_id={user.id} username={username!r} "
            f"remember={payload.remember_password} has_password={has_password}"
        )

        return CredentialSaveResponse(
            ok=True,
            portal_url=_QR_PORTAL_URL,
            portal_username=username,
            has_saved_password=has_password,
            message=f"Đã lưu thông tin đăng nhập cho {username}." if has_password else f"Username đã lưu cho {username}.",
        )
    except Exception as commit_exc:
        _log.error(f"[save_portal_credential] DB commit failed: {commit_exc}")
        db.rollback()
        return CredentialSaveResponse(
            ok=False,
            portal_url=_QR_PORTAL_URL,
            portal_username=username,
            has_saved_password=False,
            error_code="DB_COMMIT_FAILED",
            message=f"Lưu thất bại: {commit_exc}",
        )


@router.delete("/internal-qr/portal/credential", response_model=CredentialDeleteResponse)
def delete_portal_credential(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> CredentialDeleteResponse:
    """Delete saved portal credentials for the current authenticated user."""
    user = _get_current_user(credentials=credentials, db=db)

    deleted = db.query(InternalQrPortalCredentialRow).filter(
        InternalQrPortalCredentialRow.user_id == user.id,
        InternalQrPortalCredentialRow.portal_url == _QR_PORTAL_URL,
    ).delete()

    db.commit()

    return CredentialDeleteResponse(
        ok=True,
        portal_url=_QR_PORTAL_URL,
        message=f"Credential deleted ({deleted} record(s))." if deleted else "No credential found to delete.",
    )

