"""
Certificate print service — official print only.

Workflow: Cấp số → In chính thức → In lại (nếu cần)
- Blocks if certificate_no is not yet assigned
- Increments print_count every time
- Stores last_printed_at / last_print_file / last_print_reason on the main record
- Inserts a row into certificate_print_logs for full history
- printed_at stays as "first print" timestamp (not overwritten)
"""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.certificates import CertificateRecordRow, CertificatePrintLogRow
from ..schemas.certificates import CertificatePrintResponse

if TYPE_CHECKING:
    pass


def _is_print_enabled() -> bool:
    return bool(settings.print_certificate_enabled)


def _assert_print_runtime_safe() -> None:
    if str(settings.app_instance or "").strip() != "new-app":
        raise ValueError("Certificate print requires APP_INSTANCE=new-app")
    if settings.app_env in {"prod", "production"}:
        raise ValueError("Certificate print is refused in production-like environment")


def print_certificate(
    db: Session,
    certificate: CertificateRecordRow,
    reason: str | None = None,
    username: str = "",
) -> CertificatePrintResponse:
    """
    Official print — no test print workflow.

    Rules:
    - Must have certificate_no assigned first
    - Increments print_count
    - printed_at stays as first print timestamp
    - last_printed_at / last_print_file / last_print_reason always track the latest
    - certificate_print_logs gets one entry per print event
    """
    print_enabled = _is_print_enabled()

    if not print_enabled:
        return CertificatePrintResponse(
            ok=False,
            mode="print_disabled",
            message="Certificate print is disabled. Set PRINT_CERTIFICATE_ENABLED=true to enable.",
            print_enabled=False,
            write_performed=False,
            print_type="official",
            status_after=certificate.status or "unknown",
            print_count=certificate.print_count or 0,
        )

    # Block if no certificate number assigned
    cert_no = str(certificate.certificate_no or "").strip()
    if not cert_no:
        return CertificatePrintResponse(
            ok=False,
            mode="no_certificate_number",
            message="Cần cấp số GCN trước khi in chính thức.",
            print_enabled=print_enabled,
            write_performed=False,
            print_type="official",
            status_after=certificate.status or "unknown",
            print_count=certificate.print_count or 0,
        )

    try:
        _assert_print_runtime_safe()
    except ValueError as e:
        return CertificatePrintResponse(
            ok=False,
            mode="print_guard_refused",
            message=str(e),
            print_enabled=print_enabled,
            write_performed=False,
            certificate_id=certificate.certificate_id,
            print_type="official",
            status_after=certificate.status or "unknown",
            print_count=certificate.print_count or 0,
        )

    now = datetime.utcnow()
    is_first_print = (certificate.print_count or 0) == 0

    # Update main record
    certificate.status = "final_printed"
    certificate.print_count = int(certificate.print_count or 0) + 1

    # printed_at: keep first print timestamp (never overwrite)
    if is_first_print:
        certificate.printed_at = now
        certificate.printed_by = username

    # last_printed_* fields: always track the latest
    certificate.last_printed_at = now
    certificate.last_printed_by = username
    certificate.last_print_reason = reason if reason else None

    # File path is set by the caller (the endpoint generates the DOCX)
    # We pass None here; the endpoint will update last_print_file after generating
    # the file. To avoid a two-step update, we pass the expected filename
    # back in the response so the caller can set it.
    expected_filename = f"GCN_{cert_no.replace('/', '_')}.docx"
    certificate.last_print_file = expected_filename

    # Insert print log
    log_entry = CertificatePrintLogRow(
        certificate_id=int(certificate.certificate_id),
        contract_id=int(certificate.contract_id) if certificate.contract_id else None,
        certificate_no=cert_no,
        print_no=certificate.print_count,
        print_type="official",
        printed_at=now,
        printed_by=username,
        file_path=expected_filename,
        reason=reason if reason else None,
        created_at=now,
    )
    db.add(log_entry)

    db.commit()
    db.refresh(certificate)

    return CertificatePrintResponse(
        ok=True,
        mode="certificate_final_printed",
        message=f"Certificate printed successfully. Print #{certificate.print_count}.",
        print_enabled=print_enabled,
        write_performed=True,
        certificate_id=certificate.certificate_id,
        print_type="official" if is_first_print else "reprint",
        status_after=certificate.status,
        print_count=certificate.print_count,
        printed_at=certificate.printed_at.isoformat() if certificate.printed_at else None,
        printed_by=certificate.printed_by,
        last_printed_at=certificate.last_printed_at.isoformat() if certificate.last_printed_at else None,
        last_print_file=certificate.last_print_file,
        last_print_reason=certificate.last_print_reason,
    )
