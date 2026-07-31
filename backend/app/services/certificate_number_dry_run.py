"""
Certificate number dry-run service.

STRICTLY READ-ONLY:
- No DB write.
- No certificate_no allocation/persistence.
- No print.
- No QR.

Analyzes existing certificate numbers and validates certificate number candidates.
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from ..models.certificates import CertificateRecordRow
from ..schemas.certificates import (
    CertificateNumberCandidate,
    CertificateNumberDryRunResponse,
    CertificateNumberStrategy,
)
from .contract_validation import BACKGROUND_WORKSPACE_CODE, assert_clone_db_target


# Known format patterns observed in clone DB:
# - Legacy sequential: "0015", "0019", "0036" (4-digit zero-padded)
# - Modern sequential: "0131/2026.GCN_KA", "0286/2026.GCN_KVC" (NNNN/YYYY.GCN_KX)
# - Mixed: "0903/2023"
MODERN_FORMAT_PATTERN = re.compile(r"^\d{4}/\d{4}\.GCN_[A-Z]{2,}$")
LEGACY_FORMAT_PATTERN = re.compile(r"^\d{4}$")
YEAR_SLASH_PATTERN = re.compile(r"^\d{4}/\d{4}$")


def _detect_format(value: str) -> str:
    """Detect the format of a certificate number."""
    if not value:
        return "empty"
    if MODERN_FORMAT_PATTERN.match(value):
        return "modern"  # NNNN/YYYY.GCN_KX
    if LEGACY_FORMAT_PATTERN.match(value):
        return "legacy"  # NNNN
    if YEAR_SLASH_PATTERN.match(value):
        return "year_slash"  # NNNN/YYYY
    return "unknown"


def _parse_year_from_cert_no(cert_no: str) -> int | None:
    """Extract year from certificate number if present."""
    if not cert_no:
        return None
    # Modern format: NNNN/YYYY.GCN_KX
    m = re.search(r"/(\d{4})\.", cert_no)
    if m:
        return int(m.group(1))
    # Year slash: NNNN/YYYY
    m = re.search(r"/(\d{4})$", cert_no)
    if m:
        return int(m.group(1))
    return None


def _parse_field_code_from_cert_no(cert_no: str) -> str | None:
    """Extract field code from certificate number if present."""
    if not cert_no:
        return None
    # Modern format: NNNN/YYYY.GCN_KX
    m = re.search(r"\.GCN_([A-Z]+)$", cert_no)
    if m:
        return m.group(1)
    return None


def _get_existing_certificates_by_no(db: Session, cert_no: str) -> list[CertificateRecordRow]:
    """Get all certificates with the given certificate number."""
    return (
        db.query(CertificateRecordRow)
        .filter(CertificateRecordRow.certificate_no == cert_no)
        .filter(func.lower(func.coalesce(CertificateRecordRow.domain_group, "")) == BACKGROUND_WORKSPACE_CODE)
        .all()
    )


def _get_certificates_by_year_field(
    db: Session, year: int | None, field_code: str | None
) -> list[CertificateRecordRow]:
    """Get all certificates with given year and field code, optionally filtered."""
    query = db.query(CertificateRecordRow).filter(
        func.lower(func.coalesce(CertificateRecordRow.domain_group, "")) == BACKGROUND_WORKSPACE_CODE
    )

    if year:
        # We need to filter by year extracted from certificate_no
        # This is complex, so we'll use raw SQL for this
        rows = db.execute(
            text("""
                SELECT certificate_id, certificate_no
                FROM certificate_records
                WHERE LOWER(COALESCE(domain_group, '')) = 'background'
                  AND certificate_no IS NOT NULL
                  AND (
                    certificate_no ~ :modern_pattern
                    OR certificate_no ~ :year_slash_pattern
                  )
            """),
            {
                "modern_pattern": r"/" + str(year) + r"\.GCN_",
                "year_slash_pattern": r"/" + str(year) + r"$",
            },
        ).mappings().all()

        cert_ids = [r["certificate_id"] for r in rows]
        if cert_ids:
            query = query.filter(CertificateRecordRow.certificate_id.in_(cert_ids))

    return query.all()


def analyze_existing_certificate_numbers(
    db: Session, year: int | None = None, field_code: str | None = None
) -> dict[str, Any]:
    """
    Analyze existing certificate numbers from the clone DB.

    Returns statistics about certificate number distribution.
    """
    query = (
        db.query(CertificateRecordRow)
        .filter(CertificateRecordRow.certificate_no.isnot(None))
        .filter(func.lower(func.coalesce(CertificateRecordRow.domain_group, "")) == BACKGROUND_WORKSPACE_CODE)
    )

    if year:
        # Filter by year (need to check certificate_no format)
        matching_ids = []
        all_rows = db.execute(
            text("""
                SELECT certificate_id, certificate_no
                FROM certificate_records
                WHERE LOWER(COALESCE(domain_group, '')) = 'background'
                  AND certificate_no IS NOT NULL
            """)
        ).mappings().all()

        for row in all_rows:
            cert_no = row["certificate_no"]
            if cert_no and _parse_year_from_cert_no(cert_no) == year:
                matching_ids.append(row["certificate_id"])

        if matching_ids:
            query = query.filter(CertificateRecordRow.certificate_id.in_(matching_ids))
        else:
            return {"total": 0, "years": {}, "formats": {}, "max_by_year": {}}

    rows = query.all()

    total = len(rows)
    formats: dict[str, int] = {}
    years: dict[int, int] = {}
    max_by_year: dict[int, str] = {}

    for row in rows:
        cert_no = row.certificate_no or ""
        fmt = _detect_format(cert_no)
        formats[fmt] = formats.get(fmt, 0) + 1

        parsed_year = _parse_year_from_cert_no(cert_no)
        if parsed_year:
            years[parsed_year] = years.get(parsed_year, 0) + 1
            # Track max cert_no per year (lexicographic max for simplicity)
            if parsed_year not in max_by_year or cert_no > max_by_year[parsed_year]:
                max_by_year[parsed_year] = cert_no

    return {
        "total": total,
        "formats": formats,
        "years": years,
        "max_by_year": max_by_year,
    }


def validate_certificate_number_candidate(
    db: Session, candidate: str
) -> CertificateNumberCandidate:
    """
    Validate a certificate number candidate.

    Returns duplicate check and format warnings.
    """
    format_warnings: list[str] = []
    format_type = _detect_format(candidate)

    # Format warnings (not errors - old app has no strict format)
    if format_type == "unknown":
        format_warnings.append(f"Certificate number format '{candidate}' is not a recognized pattern. Recognized formats: NNNN/YYYY.GCN_KX, NNNN, NNNN/YYYY.")

    if format_type == "legacy":
        format_warnings.append("Legacy format 'NNNN' detected. Consider using modern format 'NNNN/YYYY.GCN_KX'.")

    # Check for exact duplicates
    existing = _get_existing_certificates_by_no(db, candidate)
    duplicate_count = len(existing)

    # Note: duplicates are allowed by old app behavior
    # But we should warn about it

    return CertificateNumberCandidate(
        value=candidate,
        duplicate_exists=duplicate_count > 0,
        duplicate_count=duplicate_count,
        format_warnings=format_warnings,
        format_type=format_type,
    )


def build_certificate_number_dry_run(
    db: Session,
    certificate: CertificateRecordRow,
    candidate: str | None = None,
) -> CertificateNumberDryRunResponse:
    """
    Build a certificate number dry-run response.

    STRICTLY READ-ONLY - no DB write.
    """
    warnings: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []

    # Check current state
    current_no = certificate.certificate_no
    current_status = certificate.status

    # Check if already allocated
    if current_no is not None and current_no.strip() != "":
        warnings.append({
            "field": "already_allocated",
            "message": f"This certificate already has certificate_no='{current_no}'. Number change not needed.",
            "severity": "warning",
        })

    # Check if final_printed - cannot change
    if current_status == "final_printed":
        warnings.append({
            "field": "cannot_change",
            "message": "This certificate is final_printed. Certificate number cannot be changed after final print.",
            "severity": "warning",
        })

    # Build candidate result
    candidate_result: CertificateNumberCandidate | None = None
    can_assign = True

    if candidate:
        # Validate the candidate
        candidate_result = validate_certificate_number_candidate(db, candidate)

        if candidate_result.duplicate_exists:
            warnings.append({
                "field": "duplicate",
                "message": f"Certificate number '{candidate}' is already used by {candidate_result.duplicate_count} other certificate(s). Duplicates are allowed by old app but may cause confusion.",
                "severity": "warning",
            })

        if candidate_result.format_warnings:
            for fw in candidate_result.format_warnings:
                warnings.append({
                    "field": "format_warning",
                    "message": fw,
                    "severity": "warning",
                })

        if current_status == "final_printed":
            can_assign = False
            errors.append({
                "field": "cannot_change",
                "message": "Cannot assign number to final_printed certificate.",
                "severity": "error",
            })

        if not candidate.strip():
            can_assign = False
            errors.append({
                "field": "empty_candidate",
                "message": "Certificate number cannot be empty.",
                "severity": "error",
            })

    # Build strategy
    if current_no is not None and current_no.strip() != "":
        strategy = CertificateNumberStrategy(
            type="already_allocated",
            message="This certificate already has a number assigned.",
        )
    elif current_status == "final_printed":
        strategy = CertificateNumberStrategy(
            type="cannot_change",
            message="Number cannot be changed for final_printed certificates.",
        )
    else:
        strategy = CertificateNumberStrategy(
            type="manual_required",
            message="Certificate numbers are manually assigned; this dry-run does not allocate numbers. Enter a candidate to validate.",
        )

    return CertificateNumberDryRunResponse(
        ok=True,
        mode="certificate_number_dry_run",
        write_performed=False,
        certificate_no_allocated=False,
        can_assign=can_assign,
        certificate={
            "certificate_id": certificate.certificate_id,
            "contract_id": certificate.contract_id,
            "current_certificate_no": current_no,
            "status": current_status,
            "domain_group": certificate.domain_group,
            "field_code": certificate.field_code,
        },
        candidate=candidate_result,
        strategy=strategy,
        warnings=warnings,
        errors=errors,
    )
