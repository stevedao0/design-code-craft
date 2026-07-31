"""
Certificate sync service - syncs certificate fields from contract.

Syncs fields like:
- organization_name
- business_registration_no
- address
- business_sign_name
- business_location
- contract_no
- effective_from
- effective_to
- gcn_scope columns
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.certificates import CertificateRecordRow
from ..models.contracts import ContractRecordRow
from ..schemas.certificates import CertificateSyncResponse
from .certificate_context import build_context_from_certificate_row


SYNCABLE_FIELDS = {
    "organization_name": "don_vi_ten",
    "business_registration_no": "don_vi_mst",
    "address": "dia_chi_su_dung",
    "business_sign_name": "ten_bang_hieu",
    "business_location": "dia_chi_su_dung",
    "contract_no": "contract_no",
    "effective_from": "ngay_bat_dau",
    "effective_to": "ngay_ket_thuc",
}


def _is_sync_enabled() -> bool:
    return bool(settings.sync_certificate_enabled)


def _assert_sync_runtime_safe() -> None:
    if str(settings.app_instance or "").strip() != "new-app":
        raise ValueError("Certificate sync requires APP_INSTANCE=new-app")
    if settings.app_env in {"prod", "production"}:
        raise ValueError("Certificate sync is refused in production-like environment")


def sync_certificate_from_contract(
    db: Session,
    certificate: CertificateRecordRow,
    contract: ContractRecordRow,
) -> CertificateSyncResponse:
    sync_enabled = _is_sync_enabled()

    if not sync_enabled:
        return CertificateSyncResponse(
            ok=False,
            mode="sync_disabled",
            message="Certificate sync is disabled. Set SYNC_CERTIFICATE_ENABLED=true and SYNC_CERTIFICATE_CLONE_ONLY_ENABLED=true to enable.",
            sync_enabled=False,
            write_performed=False,
        )

    try:
        _assert_sync_runtime_safe()
    except ValueError as e:
        return CertificateSyncResponse(
            ok=False,
            mode="sync_guard_refused",
            message=str(e),
            sync_enabled=sync_enabled,
            write_performed=False,
        )

    synced_fields: list[str] = []
    errors: list[str] = []

    for cert_field, contract_field in SYNCABLE_FIELDS.items():
        contract_value = getattr(contract, contract_field, None)
        cert_value = getattr(certificate, cert_field, None)

        contract_str = str(contract_value).strip() if contract_value else ""
        cert_str = str(cert_value).strip() if cert_value else ""

        if contract_str and contract_str != cert_str:
            setattr(certificate, cert_field, contract_value)
            synced_fields.append(cert_field)

    if not synced_fields:
        return CertificateSyncResponse(
            ok=True,
            mode="no_changes",
            message="No fields needed syncing",
            sync_enabled=sync_enabled,
            write_performed=False,
            certificate_id=certificate.certificate_id,
            synced_fields=[],
        )

    certificate.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(certificate)

    return CertificateSyncResponse(
        ok=True,
        mode="certificate_synced",
        message=f"Synced {len(synced_fields)} field(s) from contract",
        sync_enabled=sync_enabled,
        write_performed=True,
        certificate_id=certificate.certificate_id,
        synced_fields=synced_fields,
        errors=[],
    )
