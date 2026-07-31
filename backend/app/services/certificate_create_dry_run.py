"""
Certificate create dry-run service.

STRICTLY DRY-RUN: No DB write, no certificate_records create/update/delete,
no certificate_no allocation, no QR generation, no print, no offset save.
"""
from __future__ import annotations

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from ..models.certificates import CertificateRecordRow
from ..models.contracts import ContractRecordRow
from ..schemas.certificates import (
    CertificateCreateDryRunContract,
    CertificateCreateDryRunExistingCertificate,
    CertificateCreateDryRunIssue,
    CertificateCreateDryRunProposal,
    CertificateCreateDryRunResponse,
    CertificatePreviewContext,
)
from .certificate_context import build_context_from_contract_row, locked_layout_metadata


LOCKED_DOMAIN_GROUPS = {"media_sctt", "media", "sctt"}
BACKGROUND_WORKSPACE_CODE = "background"


def _add_issue(target: list[CertificateCreateDryRunIssue], field: str, message: str, severity: str = "error") -> None:
    target.append(CertificateCreateDryRunIssue(field=field, message=message, severity=severity))


def _check_existing_certificate(db: Session, contract_id: int, contract_no: str) -> tuple[CertificateCreateDryRunExistingCertificate, list[CertificateCreateDryRunIssue], list[CertificateCreateDryRunIssue]]:
    """Check if a certificate record already exists for this contract."""
    errors: list[CertificateCreateDryRunIssue] = []
    warnings: list[CertificateCreateDryRunIssue] = []

    by_contract = (
        db.query(CertificateRecordRow)
        .filter(CertificateRecordRow.contract_id == int(contract_id))
        .first()
    )

    by_contract_no = None
    if contract_no:
        by_contract_no = (
            db.query(CertificateRecordRow)
            .filter(func.lower(func.trim(CertificateRecordRow.contract_no)) == func.lower(func.trim(contract_no)))
            .first()
        )

    if by_contract is not None and by_contract_no is not None and by_contract.certificate_id != by_contract_no.certificate_id:
        _add_issue(
            errors,
            "existing_certificate",
            f"Multiple certificate rows found for contract_id={contract_id} and contract_no={contract_no}. Manual review required.",
        )
        return CertificateCreateDryRunExistingCertificate(
            exists=True,
            certificate_id=by_contract.certificate_id,
            certificate_no=by_contract.certificate_no,
            status=by_contract.status,
            match_type="multiple_mismatch",
        ), errors, warnings

    existing = by_contract or by_contract_no

    if existing is not None:
        match_type = "by_contract_id"
        if by_contract_no is not None and by_contract is None:
            match_type = "by_contract_no"
        elif by_contract is not None and by_contract_no is None:
            match_type = "by_contract_id"
        elif by_contract is not None and by_contract_no is not None:
            match_type = "by_both"

        _add_issue(
            warnings,
            "existing_certificate",
            f"A certificate record already exists (certificate_id={existing.certificate_id}, status={existing.status}). "
            "Create would be a duplicate.",
            "warning",
        )
        return CertificateCreateDryRunExistingCertificate(
            exists=True,
            certificate_id=existing.certificate_id,
            certificate_no=existing.certificate_no,
            status=existing.status,
            match_type=match_type,
        ), errors, warnings

    return CertificateCreateDryRunExistingCertificate(
        exists=False,
        certificate_id=None,
        certificate_no=None,
        status=None,
        match_type=None,
    ), errors, warnings


def _determine_numbering_strategy(
    db: Session,
    contract: ContractRecordRow,
    existing: CertificateCreateDryRunExistingCertificate,
) -> tuple[str, str | None, list[CertificateCreateDryRunIssue], list[CertificateCreateDryRunIssue]]:
    """
    Determine certificate numbering strategy.

    Returns (strategy, candidate_number, errors, warnings).
    candidate_number is always None in dry-run mode - we do NOT allocate or invent numbers.
    """
    errors: list[CertificateCreateDryRunIssue] = []
    warnings: list[CertificateCreateDryRunIssue] = []

    strategy = "unconfirmed"
    candidate = None

    if existing.exists:
        if existing.certificate_no:
            strategy = "already_allocated"
            candidate = existing.certificate_no
            _add_issue(
                warnings,
                "certificate_no",
                f"Certificate already has number {candidate}. No new number would be allocated.",
                "warning",
            )
        else:
            strategy = "draft_exists_without_number"
            _add_issue(
                warnings,
                "certificate_no",
                "Draft certificate exists but has no number. A number would need to be assigned before print.",
                "warning",
            )
    else:
        field_code = str(contract.field_code or "").strip().upper()
        contract_year = int(contract.contract_year or 0)

        if not field_code:
            strategy = "unconfirmed"
            _add_issue(
                warnings,
                "numbering.field_code",
                "field_code is not set on contract. Numbering strategy cannot be confirmed without field_code.",
                "warning",
            )
        elif contract_year <= 0:
            strategy = "unconfirmed"
            _add_issue(
                warnings,
                "numbering.contract_year",
                "contract_year is not set on contract. Numbering strategy cannot be confirmed without year.",
                "warning",
            )
        else:
            strategy = "candidates_exist"
            _add_issue(
                warnings,
                "numbering.strategy",
                "Numbering strategy not confirmed. This dry-run does not allocate certificate numbers.",
                "warning",
            )

    return strategy, candidate, errors, warnings


def build_certificate_create_dry_run(
    *,
    db: Session,
    contract: ContractRecordRow,
) -> CertificateCreateDryRunResponse:
    """
    Perform a dry-run validation for creating a certificate from a contract.

    STRICTLY DRY-RUN:
    - No DB write
    - No certificate_records insert/update/delete
    - No certificate_no allocation
    - No QR generation
    - No print
    - No offset save
    """
    errors: list[CertificateCreateDryRunIssue] = []
    warnings: list[CertificateCreateDryRunIssue] = []

    contract_id = int(contract.id)
    contract_no = str(contract.contract_no or "").strip()
    domain_group = str(contract.domain_group or "").strip().lower()

    if domain_group in LOCKED_DOMAIN_GROUPS:
        _add_issue(
            errors,
            "domain_group",
            "Media/SCTT/BD certificate create remains locked.",
        )

    if domain_group and domain_group != BACKGROUND_WORKSPACE_CODE:
        _add_issue(
            errors,
            "domain_group",
            "Certificate create is only enabled for background domain_group.",
        )

    existing_cert, existing_errors, existing_warnings = _check_existing_certificate(db, contract_id, contract_no)
    errors.extend(existing_errors)
    warnings.extend(existing_warnings)

    numbering_strategy, cert_no_candidate, numbering_errors, numbering_warnings = _determine_numbering_strategy(
        db, contract, existing_cert
    )
    errors.extend(numbering_errors)
    warnings.extend(numbering_warnings)

    context = build_context_from_contract_row(contract, db=db)

    proposal = CertificateCreateDryRunProposal(
        status="draft",
        certificate_no_candidate=None,
        certificate_no_strategy=numbering_strategy,
        offset_x_mm=0.0,
        offset_y_mm=0.0,
        context=context,
    )

    can_create = not errors and not existing_cert.exists

    return CertificateCreateDryRunResponse(
        ok=not errors,
        mode="certificate_create_dry_run",
        can_create=can_create,
        write_performed=False,
        certificate_created=False,
        certificate_no_allocated=False,
        qr_generation_enabled=False,
        print_enabled=False,
        artifacts_generated=False,
        errors=errors,
        warnings=warnings,
        contract=CertificateCreateDryRunContract(
            id=contract_id,
            contract_no=contract_no,
        ),
        existing_certificate=existing_cert,
        proposed=proposal,
    )
