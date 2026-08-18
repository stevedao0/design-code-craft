"""Regression tests for /api/kpi-v2/snapshot endpoint.

The original 500 was caused by missing ``kpi_group_targets`` table. This test
reproduces the issue at the unit-of-test level by querying the table
directly and asserting the snapshot endpoint returns 200 + valid payload.

Run:
    set PYTHONPATH=F:\\APPs\\backend
    F:\\APPs\\.venv\\Scripts\\python.exe -m pytest tests/test_kpi_v2_snapshot.py -v

Covers:
  * kpi_group_targets table exists (regression of the ISE that broke /bg/reports)
  * Admin self (no user_email) → unit-scope payload
  * Admin with user_email → user-scope payload
  * Staff self → user-scope (own assignments only)
  * Staff trying to read another user → 403 (NOT 500)
  * Unknown email → graceful empty payload (NOT 500)
  * Year with no targets → unit-scope empty (NOT 500)
  * Response schema includes all required keys
"""
from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import pytest
from sqlalchemy import text as sa_text

from app.core.database import SessionLocal, engine
from app.core.security import create_access_token
from app.main import app
from fastapi.testclient import TestClient


client = TestClient(app)


ADMIN = "admin@vcpmc.org"
STAFF = "binh.hv@vcpmc.org"  # role=user (staff, no kpi.manage)


def _token(username: str) -> str:
    return create_access_token(subject=username)


def _auth(username: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(username)}"}


# ── Schema regression (the original 500 root cause) ──────────────────────


def test_kpi_group_targets_table_exists():
    """Regression: kpi_group_targets must exist for the snapshot endpoint
    to function. The bug that broke /bg/reports was precisely that this
    table was missing on the production DB.
    """
    db = SessionLocal()
    try:
        row = db.execute(
            sa_text(
                "SELECT to_regclass('public.kpi_group_targets') AS t"
            )
        ).scalar()
        assert row == "kpi_group_targets", (
            f"kpi_group_targets missing — snapshot endpoint will return 500. "
            f"Got: {row!r}"
        )
    finally:
        db.close()


def test_kpi_group_assignments_table_exists():
    db = SessionLocal()
    try:
        row = db.execute(
            sa_text(
                "SELECT to_regclass('public.kpi_group_assignments') AS t"
            )
        ).scalar()
        assert row == "kpi_group_assignments"
    finally:
        db.close()


def test_schema_migrations_marks_phase1_applied():
    """Regression: ensure the runner has registered phase1 tags."""
    db = SessionLocal()
    try:
        rows = db.execute(
            sa_text("SELECT tag FROM schema_migrations ORDER BY applied_at")
        ).fetchall()
        tags = {r[0] for r in rows}
        for required in (
            "phase1_00_fixture_schema",
            "phase1_02a_seed_registry",
            "phase1_02_migrate_targets",
        ):
            assert required in tags, f"migration {required} not applied: {tags}"
    finally:
        db.close()


# ── Endpoint behaviour ────────────────────────────────────────────────────


def test_admin_unit_scope_returns_200_with_payload():
    resp = client.get("/api/kpi-v2/snapshot?year=2026", headers=_auth(ADMIN))
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["scope"] == "unit"
    assert payload["user_email"] is None
    assert isinstance(payload.get("groups"), list)
    for g in payload["groups"]:
        # Each group must have the documented fields.
        for key in (
            "kpi_group_code",
            "field_label",
            "member_domain_codes",
            "target_amount",
            "actual_before_tax",
            "contract_count",
            "valued_contract_count",
            "unresolved_value_count",
            "has_target",
            "progress_percent",
            "member_breakdown",
            "is_active",
        ):
            assert key in g, f"missing key {key} in group payload: {g}"
        # has_target=False ⇒ progress_percent must be null
        if not g["has_target"]:
            assert g["progress_percent"] is None


def test_admin_cross_user_returns_user_payload():
    resp = client.get(
        "/api/kpi-v2/snapshot?year=2026&user_email=tuan.dpa@vcpmc.org",
        headers=_auth(ADMIN),
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["scope"] == "user"
    assert payload["user_email"] == "tuan.dpa@vcpmc.org"
    assert isinstance(payload["groups"], list)


def test_staff_self_snapshot_returns_user_payload():
    """Staff gets their assigned-group snapshot when omitting user_email."""
    resp = client.get("/api/kpi-v2/snapshot?year=2026", headers=_auth(STAFF))
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["scope"] == "user"
    assert payload["user_email"] == STAFF


def test_staff_cross_user_is_forbidden_not_500():
    """Security invariant: staff cannot read another user via user_email.
    Must return 403, never 500 (which would leak via Internal Server Error).
    """
    resp = client.get(
        "/api/kpi-v2/snapshot?year=2026&user_email=tuan.dpa@vcpmc.org",
        headers=_auth(STAFF),
    )
    assert resp.status_code == 403, (
        f"Staff cross-user request must 403, got {resp.status_code}: {resp.text}"
    )


def test_unknown_email_returns_graceful_empty_not_500():
    resp = client.get(
        "/api/kpi-v2/snapshot?year=2026&user_email=nobody@nowhere.invalid",
        headers=_auth(ADMIN),
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["groups"] == []
    assert payload["unassigned"] is True


def test_year_with_no_data_returns_200_not_500():
    # 2025 has no targets/data on this DB but is within the year range.
    resp = client.get("/api/kpi-v2/snapshot?year=2025", headers=_auth(ADMIN))
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["scope"] == "unit"
    assert isinstance(payload["groups"], list)


def test_unit_scope_total_actual_independent_of_targets():
    """Regression: ``total_actual`` must reflect actuals regardless of
    whether any group has a target. ``completion_percent`` is the only
    field that should depend on target presence.
    """
    resp = client.get("/api/kpi-v2/snapshot?year=2026", headers=_auth(ADMIN))
    assert resp.status_code == 200
    payload = resp.json()
    # total_actual is sum of group actuals
    expected_total_actual = sum(g["actual_before_tax"] for g in payload["groups"])
    assert payload["total_actual"] == expected_total_actual
    if payload["total_target"] == 0:
        assert payload["completion_percent"] is None


def test_karaoke_group_includes_phong_thu_am():
    """KARAOKE group must aggregate KARAOKE + PHONG_THU_AM."""
    resp = client.get("/api/kpi-v2/snapshot?year=2026", headers=_auth(ADMIN))
    assert resp.status_code == 200
    payload = resp.json()
    karaoke = next(
        (g for g in payload["groups"] if g["kpi_group_code"] == "KARAOKE"), None
    )
    assert karaoke is not None, f"KARAOKE missing from payload: {payload['groups']}"
    assert "KARAOKE" in karaoke["member_domain_codes"]
    assert "PHONG_THU_AM" in karaoke["member_domain_codes"]
    # Contract count should sum across members.
    member_sum = sum(m["contract_count"] for m in karaoke["member_breakdown"])
    assert karaoke["contract_count"] == member_sum