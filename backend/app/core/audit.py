from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[3]
AUDIT_DIR = APP_ROOT / "audit"
CLONE_CREATE_AUDIT_PATH = AUDIT_DIR / "clone-create-audit.jsonl"
IDEMPOTENCY_KEY_RE = re.compile(r"^[A-Za-z0-9._:-]{8,160}$")


class AuditWriteError(RuntimeError):
    pass


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_idempotency_key(raw: object | None) -> str:
    key = str(raw or "").strip()
    if not key:
        raise ValueError("Clone-only create requires Idempotency-Key or client_confirmation.idempotency_key.")
    if not IDEMPOTENCY_KEY_RE.fullmatch(key):
        raise ValueError("Idempotency key must be 8-160 chars using letters, numbers, '.', '_', ':', or '-'.")
    return key


def _safe_json_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(k): _safe_json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_safe_json_value(item) for item in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def serialize_clone_create_audit_record(record: dict[str, Any]) -> str:
    safe_record = _safe_json_value(dict(record))
    if not isinstance(safe_record, dict):
        raise AuditWriteError("Audit record must serialize to an object.")
    safe_record.setdefault("timestamp", utc_timestamp())
    try:
        return json.dumps(safe_record, ensure_ascii=False, sort_keys=True)
    except Exception as exc:
        raise AuditWriteError("Audit record is not JSON serializable.") from exc


def _assert_audit_path_safe() -> None:
    try:
        resolved_dir = AUDIT_DIR.resolve()
        resolved_file = CLONE_CREATE_AUDIT_PATH.resolve()
    except Exception as exc:
        raise AuditWriteError("Audit path cannot be resolved.") from exc
    if resolved_dir != resolved_file.parent:
        raise AuditWriteError("Audit file must stay directly under the configured audit directory.")
    if APP_ROOT.resolve() not in (resolved_dir, *resolved_dir.parents):
        raise AuditWriteError("Audit directory must stay under the NEW APP root.")


def preflight_clone_create_audit_record(record: dict[str, Any]) -> None:
    _assert_audit_path_safe()
    serialize_clone_create_audit_record(record)
    try:
        AUDIT_DIR.mkdir(parents=True, exist_ok=True)
        with CLONE_CREATE_AUDIT_PATH.open("a", encoding="utf-8"):
            pass
    except Exception as exc:
        raise AuditWriteError("Clone create audit file is not writable.") from exc


def append_clone_create_audit_record(record: dict[str, Any]) -> None:
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    line = serialize_clone_create_audit_record(record)
    with CLONE_CREATE_AUDIT_PATH.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def iter_clone_create_audit_records() -> list[dict[str, Any]]:
    if not CLONE_CREATE_AUDIT_PATH.exists():
        return []
    records: list[dict[str, Any]] = []
    with CLONE_CREATE_AUDIT_PATH.open("r", encoding="utf-8") as handle:
        for line in handle:
            text = line.strip()
            if not text:
                continue
            try:
                record = json.loads(text)
            except json.JSONDecodeError:
                continue
            if isinstance(record, dict):
                records.append(record)
    return records


def find_clone_create_persisted_record(idempotency_key: str) -> dict[str, Any] | None:
    for record in iter_clone_create_audit_records():
        if record.get("idempotency_key") != idempotency_key:
            continue
        if record.get("mode") == "clone_only_persisted" and record.get("created_id") is not None:
            return record
    return None
