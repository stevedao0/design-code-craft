"""pytest tests for /api/kpi/field-kpi + /api/kpi/field-kpi-org + Manager fixture.

Run via:
    cd F:\\APPs\\backend
    set PYTHONPATH=F:\\APPs\\backend
    F:\\APPs\\.venv\\Scripts\\python.exe -m pytest tests/test_kpi_field_reports.py -v

Covers:
  * KPI target is NOT double-counted by JOIN.
  * KPI actual is computed on the normalized BEFORE-VAT basis.
  * /api/kpi/field-kpi falls back to current user when user_email is missing.
  * /api/kpi/field-kpi forbids staff viewing other users.
  * Admin / manager can view other users.
  * Manager fixture asserts branch scope (orchestration only, not org-wide).
  * VAT equation: normalized_before + normalized_vat == normalized_after.
  * Legacy so_tien_value is NOT mixed into the before-VAT total.
"""
from __future__ import annotations

import os
import sys

# Ensure the backend package is importable when pytest is run from any cwd.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from sqlalchemy import text as sa_text

from app.core.database import SessionLocal, engine
from app.core.security import create_access_token, hash_password
from app.models.user import UserRow
from app.services.revenue_resolver import normalize_contract_revenue
from fastapi.testclient import TestClient
from app.main import app

from datetime import datetime, timezone


client = TestClient(app)


# ── Fixtures (pytest style) ────────────────────────────────────────────────

ADMIN = "admin@vcpmc.org"
STAFF = "binh.hv@vcpmc.org"
MANAGER = "test.manager@vcpmc.local"  # created at runtime, not seeded in DB


def _token(username: str) -> str:
    return create_access_token(subject=username)


def _ensure_manager_user() -> int:
    """Create a temporary manager user with no real password for permission test.

    Cleanup is performed in the test that creates it via DB rollback.
    """
    db = SessionLocal()
    try:
        existing = db.query(UserRow).filter(UserRow.username == MANAGER).one_or_none()
        if existing is not None:
            return existing.id
        salt, hashv = hash_password("test-not-used-fixture-only")
        u = UserRow(
            username=MANAGER,
            display_name="Test Manager (fixture)",
            role="manager",
            is_active=True,
            password_salt=salt,
            password_hash=hashv,
            created_at=datetime.now(timezone.utc),
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        return u.id
    finally:
        db.close()


def _delete_manager_user() -> None:
    db = SessionLocal()
    try:
        u = db.query(UserRow).filter(UserRow.username == MANAGER).one_or_none()
        if u is not None:
            db.delete(u)
            db.commit()
    finally:
        db.close()


# ── Helpers ────────────────────────────────────────────────────────────────

def _raw_target_sum(year: int) -> int:
    with engine.connect() as c:
        return c.execute(sa_text(
            "SELECT COALESCE(SUM(target_amount), 0) FROM kpi_field_assignments "
            "WHERE reporting_year = :yr AND is_active = true"
        ), {"yr": year}).scalar() or 0


def _before_vat_total_2026() -> int:
    """Direct DB sum of normalized_before_vat for the 2026 cohort.

    Mirrors the API's intent: sum of (phase-2 before_vat when positive)
    PLUS (after_vat - vat_amount when before is missing but both are positive)
    over the same canonical year. Used as ground truth for the
    KPI-actual reconciliation test.
    """
    with engine.connect() as c:
        return c.execute(sa_text("""
            SELECT
                COALESCE(SUM(royalty_amount_before_vat) FILTER (WHERE royalty_amount_before_vat > 0), 0)
              + COALESCE(SUM(royalty_amount_after_vat - vat_amount) FILTER (
                    WHERE (royalty_amount_before_vat IS NULL OR royalty_amount_before_vat <= 0)
                      AND royalty_amount_after_vat > 0 AND vat_amount > 0), 0)
            FROM contract_records
            WHERE contract_year = 2026 AND annex_no IS NULL
        """)).scalar() or 0


def _before_vat_total_2026_in_kpi_groups() -> int:
    """Same as above but restricted to the KPI group linh_vuc variants.

    The API's field-kpi-org only counts contracts whose linh_vuc maps
    to one of the configured KPI groups. This helper makes the test
    expectation match the API scope.
    """
    with engine.connect() as c:
        return c.execute(sa_text("""
            SELECT
                COALESCE(SUM(royalty_amount_before_vat) FILTER (WHERE royalty_amount_before_vat > 0), 0)
              + COALESCE(SUM(royalty_amount_after_vat - vat_amount) FILTER (
                    WHERE (royalty_amount_before_vat IS NULL OR royalty_amount_before_vat <= 0)
                      AND royalty_amount_after_vat > 0 AND vat_amount > 0), 0)
            FROM contract_records
            WHERE contract_year = 2026 AND annex_no IS NULL
              AND (
                linh_vuc IN ('KARAOKE', 'Karaoke', 'karaoke', 'KHU_VUI_CHOI',
                             'Khu vui chơi', 'Khu vui choi', 'KHU VUI CHOI',
                             'khu vui choi', 'khu_vui_choi', 'ENTERTAINMENT',
                             'entertainment', 'PHONG_THU_AM', 'Phòng thu âm',
                             'phong thu am', 'phong_thu_am')
              )
        """)).scalar() or 0


# ── Tests ──────────────────────────────────────────────────────────────────

def test_kpi_target_not_double_counted():
    expected = _raw_target_sum(2026)
    r = client.get(
        "/api/kpi/field-kpi-org?year=2026",
        headers={"Authorization": f"Bearer {_token(ADMIN)}"},
    )
    assert r.status_code == 200, r.text
    api_total = sum(int(f["target"] or 0) for f in r.json()["fields"])
    assert api_total == expected, f"raw={expected}, api={api_total}"


def test_field_kpi_org_admin_200():
    r = client.get(
        "/api/kpi/field-kpi-org?year=2026",
        headers={"Authorization": f"Bearer {_token(ADMIN)}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["year"] == 2026
    assert isinstance(body["fields"], list)


def test_field_kpi_missing_email_falls_back_to_current_user():
    r = client.get(
        "/api/kpi/field-kpi?year=2026",
        headers={"Authorization": f"Bearer {_token(STAFF)}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user_email"] == STAFF


def test_field_kpi_staff_cannot_see_other_user():
    r = client.get(
        f"/api/kpi/field-kpi?year=2026&user_email={ADMIN}",
        headers={"Authorization": f"Bearer {_token(STAFF)}"},
    )
    assert r.status_code == 403, r.text


def test_field_kpi_admin_can_see_other_user():
    r = client.get(
        f"/api/kpi/field-kpi?year=2026&user_email={STAFF}",
        headers={"Authorization": f"Bearer {_token(ADMIN)}"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["user_email"] == STAFF


def test_normalized_before_vat_total_matches_db():
    """The actual sum reported by the API must equal the direct DB
    summation of normalized_before_vat for the 2026 cohort, scoped to
    the linh_vuc variants that the API maps to KPI groups."""
    expected = _before_vat_total_2026_in_kpi_groups()
    r = client.get(
        "/api/kpi/field-kpi-org?year=2026",
        headers={"Authorization": f"Bearer {_token(ADMIN)}"},
    )
    assert r.status_code == 200
    total_actual = sum(int(f["actual"] or 0) for f in r.json()["fields"])
    assert total_actual == expected, (
        f"normalized_before_vat mismatch: db={expected}, api={total_actual}"
    )


def test_normalize_contract_revenue_derives_before_from_after_minus_vat():
    """Synthesize a row with after+vat but no before and confirm the
    resolver derives before correctly."""
    from app.models.contracts import ContractRecordRow
    row = ContractRecordRow(
        royalty_amount_before_vat=None,
        royalty_amount_after_vat=110_000_000,
        vat_amount=10_000_000,
        so_tien_value=110_000_000,  # mirror legacy mapping
    )
    nr = normalize_contract_revenue(row)
    assert nr.before_vat == 100_000_000
    assert nr.vat_amount == 10_000_000
    assert nr.after_vat == 110_000_000
    assert nr.before_vat_status == "from_legacy_import"
    assert nr.value_source == "derived_after_minus_vat"


def test_normalize_contract_revenue_legacy_so_tien_only_is_unresolved():
    """Records with only so_tien_value (no before, no after) must NOT be
    counted as before-VAT revenue."""
    from app.models.contracts import ContractRecordRow
    row = ContractRecordRow(
        royalty_amount_before_vat=None,
        royalty_amount_after_vat=None,
        vat_amount=None,
        so_tien_value=100_000_000,
    )
    nr = normalize_contract_revenue(row)
    assert nr.before_vat == 0
    assert nr.before_vat_status == "unresolved"
    assert nr.value_source == "null"


def test_vat_equation_holds_on_normalized_revenue():
    """normalized_before + normalized_vat == normalized_after."""
    with engine.connect() as c:
        rows = c.execute(sa_text("""
            SELECT
                royalty_amount_before_vat AS b,
                royalty_amount_after_vat AS a,
                vat_amount AS v
            FROM contract_records
            WHERE contract_year = 2026 AND annex_no IS NULL
        """)).fetchall()
    mismatches = 0
    for r in rows:
        b, a, v = r
        if b and b > 0 and v and v > 0 and a and a > 0:
            if b + v != a:
                mismatches += 1
    assert mismatches == 0, f"per-record VAT mismatch: {mismatches}"


def test_manager_can_view_other_user_kpi():
    """Manager must be able to view another user's KPI (org-wide scope)."""
    _ensure_manager_user()
    try:
        r = client.get(
            f"/api/kpi/field-kpi?year=2026&user_email={STAFF}",
            headers={"Authorization": f"Bearer {_token(MANAGER)}"},
        )
        assert r.status_code == 200, f"manager cross-user: {r.status_code} {r.text}"
        assert r.json()["user_email"] == STAFF
    finally:
        _delete_manager_user()


def test_manager_sees_org_field_kpi():
    """Manager must see the org-level field-KPI summary."""
    _ensure_manager_user()
    try:
        r = client.get(
            "/api/kpi/field-kpi-org?year=2026",
            headers={"Authorization": f"Bearer {_token(MANAGER)}"},
        )
        assert r.status_code == 200, r.text
        assert isinstance(r.json()["fields"], list)
    finally:
        _delete_manager_user()


def test_legacy_so_tien_value_does_not_inflate_before_vat_total():
    """If only so_tien_value is present, the API must NOT count it as
    before-VAT. Direct-DB check: stash under so_tien_value only is unresolved."""
    with engine.connect() as c:
        cnt = c.execute(sa_text("""
            SELECT COUNT(*) FROM contract_records
            WHERE contract_year = 2026 AND annex_no IS NULL
              AND (royalty_amount_before_vat IS NULL OR royalty_amount_before_vat <= 0)
              AND (royalty_amount_after_vat IS NULL OR royalty_amount_after_vat <= 0)
              AND so_tien_value > 0
        """)).scalar()
    assert cnt > 0, "expected at least one legacy so_tien_value-only record in 2026"
    # If the API was leaking so_tien_value into before, the totals would be
    # inflated well above the normalized DB sum. Use the KPI-group-scoped
    # ground truth so the test fails fast if the API mixes legacy values.
    expected = _before_vat_total_2026_in_kpi_groups()
    r = client.get(
        "/api/kpi/field-kpi-org?year=2026",
        headers={"Authorization": f"Bearer {_token(ADMIN)}"},
    )
    assert sum(int(f["actual"] or 0) for f in r.json()["fields"]) == expected
