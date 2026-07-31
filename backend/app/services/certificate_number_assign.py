"""
Certificate number assign service for assigning certificate_no.

STRICTLY WRITE-ONLY for certificate_no field:
- Updates certificate_no only
- Updates updated_at only
- Does NOT update status
- Does NOT update offsets
- Does NOT update qr_image_data
- Does NOT update print fields
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.certificates import CertificateRecordRow
from ..schemas.certificates import (
    CertificateNumberAssignResponse,
    CertificateNumberAssignUpdated,
)
from ..services.certificate_number_dry_run import (
    build_certificate_number_dry_run,
    validate_certificate_number_candidate,
)
from .contract_validation import BACKGROUND_WORKSPACE_CODE


def _is_assign_enabled() -> bool:
    """Check if number assignment is enabled."""
    return bool(settings.assign_certificate_number_enabled)


def _assert_assign_runtime_safe(db: Session) -> None:
    """Assert that number assignment is safe (clone DB, correct instance, correct env)."""
    if str(settings.app_instance or "").strip() != "new-app":
        raise ValueError("Certificate number assign requires APP_INSTANCE=new-app")

    if settings.app_env in {"prod", "production"}:
        raise ValueError("Certificate number assign is refused in production-like environment")


def assign_certificate_number(
    db: Session,
    certificate: CertificateRecordRow,
    payload: dict[str, Any],
) -> CertificateNumberAssignResponse:
    """
    Assign a certificate number to an existing certificate.

    Flow:
    1. Check write flags
    2. Check certificate state (NULL number, draft status, background)
    3. Validate candidate
    4. If valid, update certificate_no and updated_at
    5. Commit only if write is enabled and all checks pass
    """
    warnings: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []

    # Check if certificate already has a number
    current_no = certificate.certificate_no
    if current_no is not None and current_no.strip() != "":
        errors.append({
            "field": "already_assigned",
            "message": f"This certificate already has certificate_no='{current_no}'. Cannot assign a new number.",
            "severity": "error",
        })
        return CertificateNumberAssignResponse(
            ok=False,
            mode="number_assign_blocked",
            message="Certificate already has a number",
            write_performed=False,
            certificate_no_allocated=False,
            qr_generation_enabled=False,
            print_enabled=False,
            artifacts_generated=False,
            warnings=warnings,
            errors=errors,
            updated=None,
        )

    # Check status
    if certificate.status == "final_printed":
        errors.append({
            "field": "cannot_change",
            "message": "Cannot assign number to final_printed certificate.",
            "severity": "error",
        })
        return CertificateNumberAssignResponse(
            ok=False,
            mode="number_assign_blocked",
            message="Cannot change final_printed certificate",
            write_performed=False,
            certificate_no_allocated=False,
            qr_generation_enabled=False,
            print_enabled=False,
            artifacts_generated=False,
            warnings=warnings,
            errors=errors,
            updated=None,
        )

    # Check domain
    if certificate.domain_group.lower() != BACKGROUND_WORKSPACE_CODE:
        errors.append({
            "field": "domain_not_allowed",
            "message": f"Certificate domain '{certificate.domain_group}' is not allowed. Only Background domain is supported.",
            "severity": "error",
        })
        return CertificateNumberAssignResponse(
            ok=False,
            mode="number_assign_blocked",
            message="Domain not allowed",
            write_performed=False,
            certificate_no_allocated=False,
            qr_generation_enabled=False,
            print_enabled=False,
            artifacts_generated=False,
            warnings=warnings,
            errors=errors,
            updated=None,
        )

    # Get candidate number from payload
    cert_no = payload.get("certificate_no", "")
    if not cert_no or not cert_no.strip():
        errors.append({
            "field": "empty_certificate_no",
            "message": "Certificate number cannot be empty.",
            "severity": "error",
        })
        return CertificateNumberAssignResponse(
            ok=False,
            mode="number_assign_blocked",
            message="Empty certificate number",
            write_performed=False,
            certificate_no_allocated=False,
            qr_generation_enabled=False,
            print_enabled=False,
            artifacts_generated=False,
            warnings=warnings,
            errors=errors,
            updated=None,
        )

    cert_no = cert_no.strip()

    # Validate candidate
    candidate_result = validate_certificate_number_candidate(db, cert_no)

    for fw in candidate_result.format_warnings:
        warnings.append({
            "field": "format_warning",
            "message": fw,
            "severity": "warning",
        })

    # Check for duplicates
    if candidate_result.duplicate_exists:
        allow_duplicate = payload.get("allow_duplicate_certificate_no", False)
        if not allow_duplicate:
            errors.append({
                "field": "duplicate_blocked",
                "message": f"Certificate number '{cert_no}' already exists ({candidate_result.duplicate_count} times). "
                           f"Set allow_duplicate_certificate_no=true to allow.",
                "severity": "error",
            })
            return CertificateNumberAssignResponse(
                ok=False,
                mode="number_assign_blocked",
                message="Duplicate certificate number blocked",
                write_performed=False,
                certificate_no_allocated=False,
                qr_generation_enabled=False,
                print_enabled=False,
                artifacts_generated=False,
                warnings=warnings,
                errors=errors,
                updated=None,
            )
        else:
            warnings.append({
                "field": "duplicate_allowed",
                "message": f"Certificate number '{cert_no}' already exists ({candidate_result.duplicate_count} times). "
                           f"Assigning anyway per allow_duplicate_certificate_no=true.",
                "severity": "warning",
            })

    # Check write flags
    if not _is_assign_enabled():
        errors.append({
            "field": "feature_flag",
            "message": "Certificate number assign is disabled. Set ASSIGN_CERTIFICATE_NUMBER_ENABLED=true "
                       "and ASSIGN_CERTIFICATE_NUMBER_CLONE_ONLY_ENABLED=true to enable.",
            "severity": "error",
        })
        return CertificateNumberAssignResponse(
            ok=False,
            mode="write_disabled",
            message="Number assign disabled by feature flags",
            write_performed=False,
            certificate_no_allocated=False,
            qr_generation_enabled=False,
            print_enabled=False,
            artifacts_generated=False,
            warnings=warnings,
            errors=errors,
            updated=None,
        )

    # Check runtime safety
    try:
        _assert_assign_runtime_safe(db)
    except ValueError as e:
        errors.append({
            "field": "runtime_guard",
            "message": str(e),
            "severity": "error",
        })
        return CertificateNumberAssignResponse(
            ok=False,
            mode="write_guard_refused",
            message="Number assign guard refused",
            write_performed=False,
            certificate_no_allocated=False,
            qr_generation_enabled=False,
            print_enabled=False,
            artifacts_generated=False,
            warnings=warnings,
            errors=errors,
            updated=None,
        )

    # Client confirmation
    client_confirmation = payload.get("client_confirmation", {}) if isinstance(payload, dict) else {}
    if not client_confirmation.get("clone_only_number_assign_confirmed"):
        warnings.append({
            "field": "client_confirmation",
            "message": "client_confirmation.clone_only_number_assign_confirmed=true is recommended",
            "severity": "warning",
        })

    # Update the certificate
    certificate.certificate_no = cert_no
    certificate.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(certificate)

    return CertificateNumberAssignResponse(
        ok=True,
        mode="certificate_number_assigned",
        message="Certificate number assigned successfully",
        write_performed=True,
        certificate_no_allocated=True,
        qr_generation_enabled=False,
        print_enabled=False,
        artifacts_generated=False,
        warnings=warnings,
        errors=errors,
        updated=CertificateNumberAssignUpdated(
            certificate_id=certificate.certificate_id,
            contract_id=certificate.contract_id,
            certificate_no=certificate.certificate_no,
            status=certificate.status,
        ),
    )
