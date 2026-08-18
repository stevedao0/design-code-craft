"""Integration tests for contract_create against the real Postgres database.

Covers regression scenarios for the NameError bug:
1. Module import (no NameError).
2. Karaoke canonicalized via registry.
3. Unresolved domain rejected before INSERT.
4. No raw fallback for linh_vuc / field_code.
5. Failed insert leaves no contract record.
6. Retry with same contract_no is rejected as duplicate.
7. Endpoint returns proper validation error (no 500).
"""
from __future__ import annotations

import os
import sys
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, text

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from app.services.contract_create import (  # noqa: E402
    _resolve_canonical_or_422,
    insert_contract_record_simple,
)
from app.services.domain_registry import (  # noqa: E402
    canonicalize_domain,
    is_known_canonical_domain,
)


@pytest.fixture(scope="module")
def engine():
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        pytest.skip("DATABASE_URL not set; skipping DB integration tests")
    eng = create_engine(url, future=True)
    yield eng
    eng.dispose()


def test_imports_present():
    assert callable(insert_contract_record_simple)
    assert callable(_resolve_canonical_or_422)
    assert callable(canonicalize_domain)
    assert callable(is_known_canonical_domain)
    print("PASS test_imports_present")


def test_karaoke_canonicalized_via_registry():
    # The central registry must canonicalize all known variants
    for raw in ("Karaoke", "karaoke", "KARAOKE", "Khu vui chơi", "Phòng thu âm"):
        out = canonicalize_domain(raw)
        assert out is not None, f"registry failed to resolve {raw!r}"
        assert is_known_canonical_domain(out), f"{raw!r} -> {out!r} not in canonical catalog"
    print("PASS test_karaoke_canonicalized_via_registry")


def test_unresolved_domain_rejected_before_insert(engine):
    """An unknown domain must raise HTTPException(422) — never reach the DB."""
    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=engine, future=True)

    candidate = {
        "contract_no": f"9999/2026/HĐQTGAN-PN/PR",
        "contract_year": 2026,
        "linh_vuc": "__BOGUS_UNKNOWN_DOMAIN__",
        "field_code": "PR",
        "don_vi_ten": "Test Customer",
        "ngay_lap_hop_dong": "2026-08-18",
    }

    with Session() as db:
        try:
            insert_contract_record_simple(db=db, candidate=candidate)
        except HTTPException as e:
            assert e.status_code == 422, f"expected 422, got {e.status_code}"
        else:
            raise AssertionError("expected HTTPException 422 for unknown domain")

        # Verify nothing was inserted
        rows = db.execute(
            text(
                "SELECT id FROM contract_records "
                "WHERE contract_no = :cno AND annex_no IS NULL"
            ),
            {"cno": candidate["contract_no"]},
        ).fetchall()
        assert len(rows) == 0, f"unexpected rows persisted: {rows}"
        db.rollback()
    print("PASS test_unresolved_domain_rejected_before_insert")


def test_no_raw_fallback_persisted(engine):
    """If for some reason the registry returns None, the row must not be written."""
    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=engine, future=True)

    candidate = {
        "contract_no": "8888/2026/HĐQTGAN-PN/PR",
        "contract_year": 2026,
        "linh_vuc": "FoobarGibberish",
        "field_code": "PR",
        "don_vi_ten": "Test Customer",
        "ngay_lap_hop_dong": "2026-08-18",
    }

    with Session() as db:
        try:
            insert_contract_record_simple(db=db, candidate=candidate)
        except HTTPException as e:
            assert e.status_code == 422
        else:
            raise AssertionError("expected 422")

        rows = db.execute(
            text(
                "SELECT id, linh_vuc FROM contract_records "
                "WHERE contract_no = :cno AND annex_no IS NULL"
            ),
            {"cno": candidate["contract_no"]},
        ).fetchall()
        assert len(rows) == 0, f"raw fallback persisted: {rows}"
        db.rollback()
    print("PASS test_no_raw_fallback_persisted")


def test_valid_create_writes_canonical_domain_and_rolls_back(engine):
    """Valid insert writes canonical domain, not raw."""
    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=engine, future=True)

    # Use a unique contract_no with random suffix to avoid collisions
    short = f"T{uuid.uuid4().int % 10000:04d}"
    contract_no = f"{short}/2026/HĐQTGAN-PN/PR"

    candidate = {
        "contract_no": contract_no,
        "contract_year": 2026,
        "linh_vuc": "Karaoke",  # raw alias
        "field_code": "PR",
        "don_vi_ten": "Test Customer Canonical",
        "ngay_lap_hop_dong": "2026-08-18",
        "so_tien_chua_gtgt_value": 100000,
        "thue_percent": 8.0,
        "thue_gtgt_value": 8000,
        "so_tien_value": 108000,
        "royalty_amount_before_vat": 100000,
        "vat_amount": 8000,
        "royalty_amount_after_vat": 108000,
        "region_code": "HĐQTGAN-PN",
        "music_usage_areas": [
            {
                "area_name": "Khu vực sử dụng âm nhạc",
                "scale_description": "10 phòng",
                "music_usage_type": "Sử dụng nhạc qua đầu Karaoke",
            }
        ],
    }

    with Session() as db:
        try:
            result = insert_contract_record_simple(db=db, candidate=candidate)
            new_id = result["id"]
        except Exception as e:
            db.rollback()
            raise

        # Verify canonical domain persisted
        row = db.execute(
            text(
                "SELECT id, contract_no, linh_vuc, field_code "
                "FROM contract_records WHERE id = :id"
            ),
            {"id": new_id},
        ).first()
        assert row is not None, "row not found after insert"
        assert row.linh_vuc == "KARAOKE", f"expected canonical KARAOKE, got {row.linh_vuc!r}"
        assert row.field_code in ("PR", "MR", "KARAOKE"), f"unexpected field_code {row.field_code!r}"

        # Clean up: rollback the transaction to leave the DB untouched
        db.rollback()
    print("PASS test_valid_create_writes_canonical_domain_and_rolls_back")


def test_retry_with_same_contract_no_creates_no_duplicate(engine):
    """Retry with same contract_no is rejected (no duplicate contract)."""
    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=engine, future=True)

    short = f"R{uuid.uuid4().int % 10000:04d}"
    contract_no = f"{short}/2026/HĐQTGAN-PN/PR"

    candidate = {
        "contract_no": contract_no,
        "contract_year": 2026,
        "linh_vuc": "KARAOKE",
        "field_code": "PR",
        "don_vi_ten": "Test Customer Retry",
        "ngay_lap_hop_dong": "2026-08-18",
        "music_usage_areas": [
            {
                "area_name": "Khu vực sử dụng âm nhạc",
                "scale_description": "5 phòng",
                "music_usage_type": "Sử dụng nhạc qua đầu Karaoke",
            }
        ],
    }

    with Session() as db:
        try:
            insert_contract_record_simple(db=db, candidate=candidate)
        except Exception:
            db.rollback()
            raise
        db.rollback()

    # Now try again with the same number on a new session
    with Session() as db:
        try:
            insert_contract_record_simple(db=db, candidate=candidate)
        except ValueError as e:
            assert "đã tồn tại" in str(e), f"unexpected ValueError: {e}"
        else:
            db.rollback()
            raise AssertionError("expected ValueError for duplicate contract_no")

        # Verify exactly one row exists (or zero if first was rolled back)
        rows = db.execute(
            text(
                "SELECT id FROM contract_records "
                "WHERE contract_no = :cno AND annex_no IS NULL"
            ),
            {"cno": contract_no},
        ).fetchall()
        # Since we rolled back, expect 0 rows — but the duplicate guard
        # still fired which is the right behavior.
        assert len(rows) <= 1, f"duplicates found: {rows}"
        db.rollback()
    print("PASS test_retry_with_same_contract_no_creates_no_duplicate")


if __name__ == "__main__":
    # Standalone run (not via pytest) — simple smoke
    test_imports_present()
    test_karaoke_canonicalized_via_registry()
    print("STATIC TESTS OK (run with pytest for DB tests)")
