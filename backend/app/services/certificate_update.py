"""
Certificate update service for updating GCN fields on clone DB only.

Updates certificate fields including:
- certificate_no
- certificate_issue_date
- status
- organization info (name, address, etc.)
- contract info
- scope text columns
- offset positions
- qr_image_data
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.certificates import CertificateRecordRow
from ..schemas.certificates import (
    CertificateUpdateResponse,
)


ALLOWED_UPDATE_FIELDS = {
    "certificate_no",
    "certificate_issue_date",
    "status",
    "organization_name",
    "business_registration_no",
    "address",
    "business_sign_name",
    "business_location",
    "contract_no",
    "effective_from",
    "effective_to",
    "gcn_scope_col_1_text",
    "gcn_scope_col_2_text",
    "gcn_scope_col_3_text",
    "qr_image_data",
    "offset_x_mm",
    "offset_y_mm",
}

ALLOWED_STATUSES = {"draft", "test_printed", "final_printed"}


def _is_update_enabled() -> bool:
    return bool(settings.update_certificate_enabled)


def _assert_update_runtime_safe() -> None:
    if str(settings.app_instance or "").strip() != "new-app":
        raise ValueError("Certificate update requires APP_INSTANCE=new-app")
    if settings.app_env in {"prod", "production"}:
        raise ValueError("Certificate update is refused in production-like environment")


def update_certificate(
    db: Session,
    certificate: CertificateRecordRow,
    payload: dict[str, Any],
) -> CertificateUpdateResponse:
    warnings: list[str] = []
    errors: list[str] = []
    updated_fields: list[str] = []

    update_enabled = _is_update_enabled()

    if not update_enabled:
        return CertificateUpdateResponse(
            ok=False,
            mode="update_disabled",
            message="Certificate update is disabled. Set UPDATE_CERTIFICATE_ENABLED=true and UPDATE_CERTIFICATE_CLONE_ONLY_ENABLED=true to enable.",
            update_enabled=False,
            clone_only_enabled=False,
            write_performed=False,
        )

    try:
        _assert_update_runtime_safe()
    except ValueError as e:
        return CertificateUpdateResponse(
            ok=False,
            mode="update_guard_refused",
            message=str(e),
            update_enabled=update_enabled,
            clone_only_enabled=True,
            write_performed=False,
        )

    for field_name, field_value in payload.items():
        if field_name not in ALLOWED_UPDATE_FIELDS:
            continue
        if field_value is None:
            continue

        current_value = getattr(certificate, field_name, None)
        normalized_value = field_value if not isinstance(field_value, str) else str(field_value).strip()

        if normalized_value == current_value:
            continue

        if field_name == "status":
            if normalized_value not in ALLOWED_STATUSES:
                errors.append(f"Invalid status: {normalized_value}. Allowed: {', '.join(ALLOWED_STATUSES)}")
                continue
            certificate.status = normalized_value
            updated_fields.append(field_name)
        elif field_name == "certificate_issue_date":
            certificate.certificate_issue_date = normalized_value or None
            updated_fields.append(field_name)
        elif field_name == "effective_from":
            certificate.effective_from = normalized_value or None
            updated_fields.append(field_name)
        elif field_name == "effective_to":
            certificate.effective_to = normalized_value or None
            updated_fields.append(field_name)
        elif field_name in ("offset_x_mm", "offset_y_mm"):
            try:
                float_val = float(normalized_value)
                setattr(certificate, field_name, float_val)
                updated_fields.append(field_name)
            except (ValueError, TypeError):
                errors.append(f"Invalid {field_name}: {field_value}")
        else:
            setattr(certificate, field_name, normalized_value if normalized_value != "" else None)
            updated_fields.append(field_name)

    if errors:
        db.rollback()
        return CertificateUpdateResponse(
            ok=False,
            mode="validation_error",
            message=f"Validation errors: {'; '.join(errors)}",
            update_enabled=update_enabled,
            clone_only_enabled=True,
            write_performed=False,
            certificate_id=certificate.certificate_id,
            updated_fields=updated_fields,
            errors=errors,
        )

    if not updated_fields:
        return CertificateUpdateResponse(
            ok=True,
            mode="no_changes",
            message="No fields changed",
            update_enabled=update_enabled,
            clone_only_enabled=True,
            write_performed=False,
            certificate_id=certificate.certificate_id,
            updated_fields=[],
        )

    certificate.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(certificate)

    return CertificateUpdateResponse(
        ok=True,
        mode="certificate_updated",
        message="Certificate updated successfully on clone DB",
        update_enabled=update_enabled,
        clone_only_enabled=True,
        write_performed=True,
        certificate_id=certificate.certificate_id,
        updated_fields=sorted(updated_fields),
        errors=[],
        warnings=warnings if warnings else [],
    )
