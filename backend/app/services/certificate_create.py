"""
Certificate create service for draft GCN on clone DB only.

STRICTLY DRAFT-ONLY:
- Creates certificate with certificate_no=NULL
- status="draft"
- offset_x_mm=0.0
- offset_y_mm=0.0
- qr_image_data=NULL/empty
- No QR generation
- No print
- No number allocation
- Clone DB only
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.certificates import CertificateRecordRow
from ..models.contracts import ContractRecordRow
from ..schemas.certificates import (
    CertificateCreateDryRunIssue,
    CertificateCreateDryRunResponse,
    CertificateDraftCreated,
    CertificatePreviewContext,
    CreateCertificateDraftResponse,
)
from .certificate_context import build_context_from_contract_row
from .certificate_create_dry_run import build_certificate_create_dry_run
from .contract_validation import assert_clone_db_target


LOCKED_DOMAIN_GROUPS = {"media_sctt", "media", "sctt"}
BACKGROUND_WORKSPACE_CODE = "background"
CERTIFICATE_FIELD_CODE = "karaoke"


def _add_issue(target: list[CertificateCreateDryRunIssue], field: str, message: str, severity: str = "error") -> None:
    target.append(CertificateCreateDryRunIssue(field=field, message=message, severity=severity))


def _assert_certificate_write_safe(db: Session) -> None:
    """Assert that certificate write is safe (correct instance, correct env)."""
    if str(settings.app_instance or "").strip() != "new-app":
        raise ValueError("Certificate create requires APP_INSTANCE=new-app")

    if settings.app_env in {"prod", "production"}:
        raise ValueError("Certificate create is refused in production-like environment")


def _is_certificate_write_enabled() -> bool:
    """Check if certificate write is enabled."""
    return bool(settings.create_certificate_write_enabled)


def _check_existing_certificate_for_contract(
    db: Session, contract_id: int, domain_group: str = BACKGROUND_WORKSPACE_CODE, field_code: str = CERTIFICATE_FIELD_CODE
) -> tuple[CertificateRecordRow | None, list[CertificateCreateDryRunIssue]]:
    """Check if a certificate already exists for this (contract_id, domain_group, field_code)."""
    errors: list[CertificateCreateDryRunIssue] = []

    existing = (
        db.query(CertificateRecordRow)
        .filter(CertificateRecordRow.contract_id == int(contract_id))
        .filter(CertificateRecordRow.domain_group == domain_group)
        .filter(CertificateRecordRow.field_code == field_code)
        .first()
    )

    if existing is not None:
        _add_issue(
            errors,
            "existing_certificate",
            f"A certificate already exists for this contract (certificate_id={existing.certificate_id}, status={existing.status}). "
            "Duplicate certificate creation is not allowed.",
        )

    return existing, errors


def _build_certificate_context(contract: ContractRecordRow, db: Session) -> dict[str, Any]:
    """Build context from contract for certificate creation."""
    context = build_context_from_contract_row(contract, db=db)
    return context


def insert_certificate_draft_clone_only(
    db: Session, contract: ContractRecordRow, dry_run: CertificateCreateDryRunResponse
) -> CertificateRecordRow:
    """
    Insert a draft certificate row for the given contract.

    STRICTLY DRAFT-ONLY:
    - certificate_no = NULL
    - status = "draft"
    - offset_x_mm = 0.0
    - offset_y_mm = 0.0
    - qr_image_data = NULL
    - printed_at = NULL
    - printed_by = NULL
    - print_count = 0
    """
    context = dry_run.proposed.context

    row = CertificateRecordRow(
        contract_id=int(contract.id),
        domain_group="background",
        field_code="karaoke",
        certificate_no=None,
        certificate_issue_date=None,
        status="draft",
        organization_name=context.organization_name or None,
        business_registration_no=context.business_registration_no or None,
        address=context.address or None,
        business_sign_name=context.business_sign_name or None,
        business_location=context.business_location or None,
        contract_no=context.contract_no or str(contract.contract_no or ""),
        effective_from=date.fromisoformat(context.effective_from) if context.effective_from else None,
        effective_to=date.fromisoformat(context.effective_to) if context.effective_to else None,
        gcn_scope_col_1_text=context.gcn_scope_col_1_text or None,
        gcn_scope_col_2_text=context.gcn_scope_col_2_text or None,
        gcn_scope_col_3_text=context.gcn_scope_col_3_text or None,
        qr_image_data=None,
        offset_x_mm=0.0,
        offset_y_mm=0.0,
        print_count=0,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    db.add(row)
    db.flush()
    return row


def create_certificate_draft(
    db: Session, contract: ContractRecordRow, payload: dict[str, Any]
) -> CreateCertificateDraftResponse:
    """
    Create a draft certificate for the given contract.

    Flow:
    1. Run dry-run validation
    2. Check write flags
    3. Check existing certificate
    4. If existing draft found: reuse it (optionally update certificate_no)
    5. If no existing draft: insert new draft row
    6. Commit only if write is enabled and all checks pass
    """
    import logging
    _log = logging.getLogger(__name__)

    errors: list[CertificateCreateDryRunIssue] = []
    warnings: list[CertificateCreateDryRunIssue] = []

    dry_run = build_certificate_create_dry_run(db=db, contract=contract)
    errors.extend(dry_run.errors)
    warnings.extend(dry_run.warnings)

    _log.warning(
        f"[CERT_CREATE] contract_id={contract.id} contract_no={contract.contract_no} "
        f"dry_run.ok={dry_run.ok} can_create={dry_run.can_create} "
        f"existing.exists={dry_run.existing_certificate.exists} "
        f"existing.certificate_id={dry_run.existing_certificate.certificate_id} "
        f"errors={[(e.field, e.message) for e in dry_run.errors]} "
        f"warnings={[(w.field, w.message) for w in dry_run.warnings]}"
    )

    if not dry_run.ok:
        return CreateCertificateDraftResponse(
            ok=False,
            mode="certificate_create_dry_run_failed",
            message="Dry-run validation failed",
            write_performed=False,
            certificate_created=False,
            certificate_no_allocated=False,
            qr_generation_enabled=False,
            print_enabled=False,
            artifacts_generated=False,
            errors=errors,
            warnings=warnings,
            created=None,
        )

    # FIX: Existing draft found — this is a REUSE case, NOT an error.
    # The previous code returned ok=false with "Unknown validation reason"
    # because can_create=False due to existing_cert.exists=True.
    # We now handle this properly.
    if dry_run.existing_certificate.exists:
        existing_id = dry_run.existing_certificate.certificate_id
        existing_no = dry_run.existing_certificate.certificate_no
        client_cert_no = payload.get("client_certificate_no") if isinstance(payload, dict) else None

        # Load the existing draft row
        existing_row = db.query(CertificateRecordRow).filter(
            CertificateRecordRow.certificate_id == existing_id
        ).first()

        if existing_row is None:
            _add_issue(errors, "existing_certificate", f"Existing certificate_id={existing_id} not found in DB")
            return CreateCertificateDraftResponse(
                ok=False,
                mode="existing_certificate_not_found",
                message=f"Existing draft certificate_id={existing_id} not found",
                write_performed=False,
                certificate_created=False,
                certificate_no_allocated=False,
                qr_generation_enabled=False,
                print_enabled=False,
                artifacts_generated=False,
                errors=errors,
                warnings=warnings,
                created=None,
            )

        # If user provided a certificate_no and the draft doesn't have one, update it
        updated_cert_no = None
        if client_cert_no and not existing_no:
            if not _is_certificate_write_enabled():
                _add_issue(warnings, "feature_flag",
                    "Certificate write is disabled. Cannot update existing draft with certificate_no.")
            else:
                try:
                    _assert_certificate_write_safe(db)
                    existing_row.certificate_no = str(client_cert_no).strip()
                    existing_row.updated_at = datetime.utcnow()
                    db.commit()
                    updated_cert_no = client_cert_no
                    _log.warning(f"[CERT_CREATE] Updated existing cert_id={existing_id} with certificate_no={client_cert_no}")
                except ValueError as e:
                    _add_issue(warnings, "runtime_guard", str(e))

        final_cert_no = updated_cert_no or existing_no

        # Build reuse warnings (only the specific ones, not the duplicate-create warnings)
        reuse_warnings: list[CertificateCreateDryRunIssue] = []
        if not existing_no and not client_cert_no:
            _add_issue(
                reuse_warnings, "certificate_no",
                "Đã có bản nháp GCN nhưng chưa có số GCN. Vui lòng nhập Số GCN để tiếp tục.",
                "warning",
            )
        elif not existing_no and client_cert_no:
            _add_issue(
                reuse_warnings, "certificate_no",
                f"Đã có bản nháp GCN (id={existing_id}). Đã cập nhật số GCN: {client_cert_no}",
                "warning",
            )
        else:
            _add_issue(
                reuse_warnings, "existing_certificate",
                f"Đã có bản nháp GCN (id={existing_id}). Hệ thống sẽ dùng lại bản nháp này.",
                "warning",
            )

        return CreateCertificateDraftResponse(
            ok=True,
            mode="existing_draft_reused",
            message=f"Đã dùng lại bản nháp GCN id={existing_id}",
            write_performed=updated_cert_no is not None,
            certificate_created=False,
            certificate_no_allocated=updated_cert_no is not None,
            qr_generation_enabled=False,
            print_enabled=False,
            artifacts_generated=False,
            errors=[],
            warnings=reuse_warnings,
            created=CertificateDraftCreated(
                certificate_id=existing_id,
                contract_id=int(contract.id),
                contract_no=str(contract.contract_no or ""),
                certificate_no=final_cert_no,
                status=existing_row.status,
            ),
        )

    if not dry_run.can_create:
        # Build a user-friendly message from the errors list
        error_msgs = [f"[{e.field}] {e.message}" for e in errors]
        detail_msg = "; ".join(error_msgs) if error_msgs else "Có lỗi validation nhưng không có chi tiết. Vui lòng kiểm tra log."
        return CreateCertificateDraftResponse(
            ok=False,
            mode="certificate_create_validation_failed",
            message=f"Validation checks failed: {detail_msg}",
            write_performed=False,
            certificate_created=False,
            certificate_no_allocated=False,
            qr_generation_enabled=False,
            print_enabled=False,
            artifacts_generated=False,
            errors=errors,
            warnings=warnings,
            created=None,
        )

    if not _is_certificate_write_enabled():
        _add_issue(
            errors,
            "feature_flag",
            "Certificate write is disabled. Set CREATE_CERTIFICATE_WRITE_ENABLED=true, "
            "CREATE_CERTIFICATE_DRAFT_ONLY_ENABLED=true, and CREATE_CERTIFICATE_CLONE_ONLY_ENABLED=true to enable.",
        )
        return CreateCertificateDraftResponse(
            ok=False,
            mode="write_disabled",
            message="Certificate write is disabled by feature flags",
            write_performed=False,
            certificate_created=False,
            certificate_no_allocated=False,
            qr_generation_enabled=False,
            print_enabled=False,
            artifacts_generated=False,
            errors=errors,
            warnings=warnings,
            created=None,
        )

    try:
        _assert_certificate_write_safe(db)
    except ValueError as e:
        _add_issue(errors, "runtime_guard", str(e))
        return CreateCertificateDraftResponse(
            ok=False,
            mode="write_guard_refused",
            message="Certificate write guard refused",
            write_performed=False,
            certificate_created=False,
            certificate_no_allocated=False,
            qr_generation_enabled=False,
            print_enabled=False,
            artifacts_generated=False,
            errors=errors,
            warnings=warnings,
            created=None,
        )

    # No existing certificate — proceed with creating a new draft
    client_confirmation = payload.get("client_confirmation", {}) if isinstance(payload, dict) else {}
    client_cert_no = payload.get("client_certificate_no") if isinstance(payload, dict) else None
    if not client_confirmation.get("clone_only_certificate_draft_confirmed"):
        _add_issue(
            warnings,
            "client_confirmation",
            "client_confirmation.clone_only_certificate_draft_confirmed=true is recommended",
        )

    row = insert_certificate_draft_clone_only(db, contract, dry_run)

    # If user provided certificate_no, update it on the new row
    if client_cert_no:
        row.certificate_no = str(client_cert_no).strip()
        row.updated_at = datetime.utcnow()
        db.commit()
        _log.warning(f"[CERT_CREATE] Created new cert_id={row.certificate_id} with certificate_no={client_cert_no}")
    else:
        db.commit()

    return CreateCertificateDraftResponse(
        ok=True,
        mode="certificate_draft_created",
        message="Draft certificate created successfully",
        write_performed=True,
        certificate_created=True,
        certificate_no_allocated=bool(client_cert_no),
        qr_generation_enabled=False,
        print_enabled=False,
        artifacts_generated=False,
        errors=errors,
        warnings=warnings,
        created=CertificateDraftCreated(
            certificate_id=row.certificate_id,
            contract_id=int(contract.id),
            contract_no=str(contract.contract_no or ""),
            certificate_no=row.certificate_no,
            status=row.status,
        ),
    )
