#!/usr/bin/env python
"""
Tests for /api/kpi/field-kpi + /api/kpi/field-kpi-org covering:

  1. KPI target is NOT double-counted by JOIN (target after aggregate == raw sum).
  2. /api/kpi/field-kpi-org returns 200 for admin.
  3. /api/kpi/field-kpi without user_email returns 200 with current user's data
     (not 422).
  4. /api/kpi/field-kpi honours permission: a non-admin staff cannot view
     another user's KPI (403).
  5. Admin / manager CAN view another user's KPI (200).
"""
import os, sys, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

os.chdir('F:/APPs/backend')
sys.path.insert(0, 'F:/APPs/backend')

from dotenv import load_dotenv
load_dotenv('F:/APPs/backend/.env', override=True)

from sqlalchemy import text as sa_text
from app.core.database import engine
from app.core.security import create_access_token
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _tok(username: str) -> str:
    return create_access_token(subject=username)


ADMIN = "admin@vcpmc.org"
STAFF = "binh.hv@vcpmc.org"


def raw_target_sum(year: int) -> int:
    """Direct sum from kpi_field_assignments, no JOIN with contracts."""
    with engine.connect() as c:
        return c.execute(sa_text(
            "SELECT COALESCE(SUM(target_amount), 0) FROM kpi_field_assignments "
            "WHERE reporting_year = :yr AND is_active = true"
        ), {"yr": year}).scalar() or 0


# Test 1: target NOT double-counted by JOIN
def test_kpi_target_not_double_counted():
    year = 2026
    expected_total = raw_target_sum(year)
    r = client.get(
        f"/api/kpi/field-kpi-org?year={year}",
        headers={"Authorization": f"Bearer {_tok(ADMIN)}"},
    )
    assert r.status_code == 200, f"got {r.status_code}: {r.text}"
    body = r.json()
    api_total = sum(int(f["target"] or 0) for f in body["fields"])
    print(f"[TEST1] raw target sum: {expected_total}, API target sum: {api_total}")
    assert api_total == expected_total, (
        f"KPI target double-counted by JOIN: raw={expected_total}, api={api_total}"
    )


# Test 2: field-kpi-org returns 200 for admin
def test_field_kpi_org_admin_200():
    r = client.get(
        "/api/kpi/field-kpi-org?year=2026",
        headers={"Authorization": f"Bearer {_tok(ADMIN)}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["year"] == 2026
    assert isinstance(body["fields"], list)
    print(f"[TEST2] field-kpi-org admin 200, {len(body['fields'])} groups")


# Test 3: field-kpi without user_email returns 200 (current user fallback), not 422
def test_field_kpi_missing_email_falls_back():
    r = client.get(
        "/api/kpi/field-kpi?year=2026",
        headers={"Authorization": f"Bearer {_tok(STAFF)}"},
    )
    assert r.status_code == 200, f"got {r.status_code}: {r.text}"
    body = r.json()
    assert body["user_email"] == STAFF
    print(f"[TEST3] field-kpi missing email: 200 with user_email={body['user_email']}")


# Test 4: staff cannot view another user's KPI
def test_field_kpi_staff_cannot_see_other():
    r = client.get(
        f"/api/kpi/field-kpi?year=2026&user_email={ADMIN}",
        headers={"Authorization": f"Bearer {_tok(STAFF)}"},
    )
    assert r.status_code == 403, (
        f"expected 403, got {r.status_code}: {r.text}"
    )
    print(f"[TEST4] staff seeing admin KPI blocked: 403")


# Test 5: admin can view another user's KPI
def test_field_kpi_admin_can_see_other():
    r = client.get(
        f"/api/kpi/field-kpi?year=2026&user_email={STAFF}",
        headers={"Authorization": f"Bearer {_tok(ADMIN)}"},
    )
    assert r.status_code == 200, f"got {r.status_code}: {r.text}"
    body = r.json()
    assert body["user_email"] == STAFF
    print(f"[TEST5] admin seeing staff KPI allowed: 200")


# Test 6: VAT reconciliation — sum(before) + sum(vat) = sum(after)
def test_vat_reconciliation():
    """Each individual contract should satisfy before+vat==after on records
    where all three fields are positive. We verify on a row-level basis so
    the test is robust against partial NULLs."""
    with engine.connect() as c:
        rows = c.execute(sa_text("""
            SELECT
                COUNT(*) FILTER (
                    WHERE royalty_amount_before_vat IS NOT NULL
                      AND royalty_amount_before_vat > 0
                      AND vat_amount IS NOT NULL AND vat_amount > 0
                      AND royalty_amount_after_vat IS NOT NULL
                      AND royalty_amount_after_vat > 0
                      AND royalty_amount_before_vat + vat_amount <> royalty_amount_after_vat
                ) AS mismatch,
                COUNT(*) FILTER (
                    WHERE royalty_amount_before_vat IS NOT NULL
                      AND royalty_amount_before_vat > 0
                      AND vat_amount IS NOT NULL AND vat_amount > 0
                      AND royalty_amount_after_vat IS NOT NULL
                      AND royalty_amount_after_vat > 0
                      AND royalty_amount_before_vat + vat_amount = royalty_amount_after_vat
                ) AS match
            FROM contract_records
            WHERE contract_year = 2026 AND annex_no IS NULL
        """)).mappings().one()
    mismatch = int(rows["mismatch"])
    match = int(rows["match"])
    print(f"[TEST6] VAT row-level: match={match}, mismatch={mismatch}")
    assert mismatch == 0, f"per-contract VAT mismatch: {mismatch}"


def main():
    test_kpi_target_not_double_counted()
    test_field_kpi_org_admin_200()
    test_field_kpi_missing_email_falls_back()
    test_field_kpi_staff_cannot_see_other()
    test_field_kpi_admin_can_see_other()
    test_vat_reconciliation()
    print("\n[OK] all KPI/VAT tests passed")


if __name__ == "__main__":
    main()
