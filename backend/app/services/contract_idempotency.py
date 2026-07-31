from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from ..core.audit import (
    AuditWriteError,
    append_clone_create_audit_record,
    find_clone_create_persisted_record,
    normalize_idempotency_key,
    preflight_clone_create_audit_record,
    utc_timestamp,
)
from ..core.config import settings
from ..models.contracts import ContractRecordRow
from ..models.user import UserRow
from ..schemas.contracts import DryRunCreateContractRequest
from .contract_create import created_preview_from_row
from .contract_validation import clean_text, parse_int_or_none


def payload_idempotency_key(payload: DryRunCreateContractRequest, header_value: str | None) -> str:
    confirmation = payload.client_confirmation if isinstance(payload.client_confirmation, dict) else {}
    return normalize_idempotency_key(header_value or confirmation.get("idempotency_key"))


def safe_user_audit_info(user: UserRow) -> dict[str, object]:
    return {
        "id": parse_int_or_none(getattr(user, "id", None)),
        "username": clean_text(getattr(user, "username", "")),
        "role": clean_text(getattr(user, "role", "")),
    }


def build_clone_create_audit_record(
    *,
    db: Session,
    mode: str,
    idempotency_key: str,
    user: UserRow,
    contract_no: str,
    created: dict[str, object] | None,
    write_performed: bool,
    idempotent_replay: bool = False,
) -> dict[str, object]:
    db_name = str(db.execute(text("select current_database()")).scalar_one())
    return {
        "timestamp": utc_timestamp(),
        "mode": mode,
        "idempotency_key": idempotency_key,
        "user": safe_user_audit_info(user),
        "contract_no": contract_no,
        "created_id": created.get("id") if created else None,
        "created_contract_no": created.get("contract_no") if created else None,
        "write_performed": write_performed,
        "idempotent_replay": idempotent_replay,
        "artifacts_generated": False,
        "table_written": "contract_records",
        "app_instance": str(settings.app_instance or ""),
        "db_name": db_name,
    }


def append_clone_create_audit(**kwargs: object) -> None:
    append_clone_create_audit_record(build_clone_create_audit_record(**kwargs))


def preflight_clone_create_audit(**kwargs: object) -> None:
    preflight_clone_create_audit_record(build_clone_create_audit_record(**kwargs))


def append_clone_create_audit_after_commit(**kwargs: object) -> None:
    try:
        append_clone_create_audit(**kwargs)
        return
    except AuditWriteError:
        pass

    record = build_clone_create_audit_record(**kwargs)
    record["reconciled_after_append_failure"] = True
    append_clone_create_audit_record(record)


def find_clone_only_created_row(
    *,
    db: Session,
    idempotency_key: str,
    contract_no: str,
) -> tuple[dict[str, object] | None, ContractRecordRow | None, str | None]:
    record = find_clone_create_persisted_record(idempotency_key)
    if record is None:
        return None, None, None

    original_contract_no = clean_text(record.get("contract_no"))
    if original_contract_no != contract_no:
        return record, None, "contract_no_mismatch"

    created_id = parse_int_or_none(record.get("created_id"))
    row = None
    if created_id is not None:
        row = (
            db.query(ContractRecordRow)
            .filter(ContractRecordRow.id == created_id)
            .filter(ContractRecordRow.contract_no == contract_no)
            .first()
        )
    if row is None:
        return record, None, "created_row_missing"
    return record, row, None


def created_preview_for_idempotent_row(row: ContractRecordRow) -> dict[str, object]:
    return created_preview_from_row(row)
