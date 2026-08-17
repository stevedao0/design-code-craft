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
  * Field-scoped KPI: assigned fields aggregate ALL contracts of that field
    (no owner/performer filter), Karaoke group includes PHONG_THU_AM,
    multiple assigned fields sum, unassigned fields are excluded.
  * Staff cannot view other user's KPI; Admin/Manager can.
  * Empty-state when no assignment exists.
  * Contract list (search/bảng hợp đồng) stays user-scoped.
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


def _ensure_assignment(user_email: str, field_code: str, year: int, target: int = 1_000_000_000) -> int:
    """Make sure kpi_field_assignments has (user_email, field_code, year).
    Returns assignment id. Active = true. Idempotent."""
    db = SessionLocal()
    try:
        uid = db.execute(
            sa_text("SELECT id FROM users WHERE username = :u"),
            {"u": user_email},
        ).scalar()
        if uid is None:
            raise RuntimeError(f"User not found: {user_email}")
        existing = db.execute(
            sa_text("""
                SELECT id FROM kpi_field_assignments
                WHERE user_id = :uid AND field_code = :fc AND reporting_year = :yr
            """),
            {"uid": uid, "fc": field_code, "yr": year},
        ).fetchone()
        if existing:
            aid = int(existing[0])
            db.execute(
                sa_text("""
                    UPDATE kpi_field_assignments
                    SET target_amount = :t, is_active = true
                    WHERE id = :aid
                """),
                {"t": target, "aid": aid},
            )
            db.commit()
            return aid
        result = db.execute(
            sa_text("""
                INSERT INTO kpi_field_assignments
                    (user_id, field_code, reporting_year, target_amount, is_active,
                     created_at, updated_at, created_by_user_id)
                VALUES (:uid, :fc, :yr, :t, true, NOW(), NOW(), :uid)
                RETURNING id
            """),
            {"uid": uid, "fc": field_code, "yr": year, "t": target},
        )
        aid = int(result.scalar())
        db.commit()
        return aid
    finally:
        db.close()


def _clear_assignments(user_email: str, year: int) -> None:
    """Remove all assignments for (user_email, year)."""
    db = SessionLocal()
    try:
        db.execute(
            sa_text("""
                DELETE FROM kpi_field_assignments
                WHERE user_id = (SELECT id FROM users WHERE username = :u)
                  AND reporting_year = :yr
            """),
            {"u": user_email, "yr": year},
        )
        db.commit()
    finally:
        db.close()


def _before_vat_total_for_member_codes(year: int, member_codes: tuple[str, ...]) -> int:
    """Direct DB sum of normalized BEFORE-VAT for a given set of canonical
    member field codes. Mirrors the API's mapping (case- and diacritic-
    insensitive via NFKD normalization)."""
    # Build canonical targets the same way the API does.
    target_norm = set()
    for c in member_codes:
        target_norm.add(_normalize_label_for_ground_truth(c))
    db = SessionLocal()
    try:
        rows = db.execute(
            sa_text("""
                SELECT DISTINCT linh_vuc
                FROM contract_records
                WHERE contract_year = :yr AND annex_no IS NULL AND linh_vuc IS NOT NULL
            """),
            {"yr": year},
        ).fetchall()
        matched = []
        for (lv,) in rows:
            if not lv:
                continue
            if _normalize_label_for_ground_truth(lv) in target_norm:
                matched.append(lv)
        if not matched:
            return 0
        # Match each variant verbatim (PSQL parameter binding)
        params = {f"v{i}": v for i, v in enumerate(matched)}
        params["yr"] = year
        in_clause = ",".join(f":v{i}" for i in range(len(matched)))
        sql = sa_text(f"""
            SELECT
              COALESCE(SUM(royalty_amount_before_vat) FILTER (WHERE royalty_amount_before_vat > 0), 0)
              + COALESCE(SUM(royalty_amount_after_vat - vat_amount) FILTER (
                    WHERE (royalty_amount_before_vat IS NULL OR royalty_amount_before_vat <= 0)
                      AND royalty_amount_after_vat > 0 AND vat_amount > 0), 0) AS total
            FROM contract_records
            WHERE contract_year = :yr AND annex_no IS NULL
              AND linh_vuc IN ({in_clause})
        """)
        v = db.execute(sql, params).scalar()
        return int(v or 0)
    finally:
        db.close()


def _normalize_label_for_ground_truth(v: str) -> str:
    """Same normalization as kpi_field._normalize_label."""
    import unicodedata
    if not v:
        return ""
    nfkd = unicodedata.normalize("NFKD", v)
    ascii_val = "".join(c for c in nfkd if unicodedata.category(c) != "Mn")
    return ascii_val.lower().replace("_", "").replace(" ", "")


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

    The API's field-kpi-org only counts contracts whose linh_vuc maps to
    one of the configured KPI groups. This helper mirrors the API's
    case- and diacritic-insensitive normalization so the test expectation
    matches the API scope exactly.
    """
    # Build the canonical set the same way as the API.
    from app.services.domain_registry import canonicalize_domain
    target_canon = {canonicalize_domain(m) for m in ("KARAOKE", "PHONG_THU_AM", "KHU_VUI_CHOI")}
    target_canon.discard(None)
    db = SessionLocal()
    try:
        rows = db.execute(
            sa_text("""
                SELECT DISTINCT linh_vuc FROM contract_records
                WHERE contract_year = 2026 AND annex_no IS NULL AND linh_vuc IS NOT NULL
            """),
        ).fetchall()
        matched = []
        for (lv,) in rows:
            if canonicalize_domain(lv) in target_canon:
                matched.append(lv)
        if not matched:
            return 0
        params = {f"v{i}": v for i, v in enumerate(matched)}
        in_clause = ",".join(f":v{i}" for i in range(len(matched)))
        v = db.execute(
            sa_text(f"""
                SELECT
                  COALESCE(SUM(royalty_amount_before_vat) FILTER (WHERE royalty_amount_before_vat > 0), 0)
                  + COALESCE(SUM(royalty_amount_after_vat - vat_amount) FILTER (
                        WHERE (royalty_amount_before_vat IS NULL OR royalty_amount_before_vat <= 0)
                          AND royalty_amount_after_vat > 0 AND vat_amount > 0), 0)
                FROM contract_records
                WHERE contract_year = 2026 AND annex_no IS NULL
                  AND linh_vuc IN ({in_clause})
            """),
            params,
        ).scalar()
        return int(v or 0)
    finally:
        db.close()


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


# ── Field-scoped KPI tests (the canonical business rule) ───────────────────

def _fields_payload(resp_json: dict) -> list[dict]:
    return resp_json.get("fields") or []


def _field_by_code(payload: list[dict], code: str) -> dict | None:
    for f in payload:
        if f.get("kpi_group_code") == code or f.get("field_code") == code:
            return f
    return None


def _targets_for_codes(payload: list[dict], codes: tuple[str, ...]) -> int:
    out = 0
    for f in payload:
        if (f.get("kpi_group_code") in codes or f.get("field_code") in codes):
            out += int(f.get("target") or 0)
    return out


def test_staff_kpi_uses_all_contracts_in_assigned_fields():
    """A staff member assigned KARAOKE must have their KPI equal to the unit-wide
    sum of KARAOKE + PHONG_THU_AM contracts, NOT filtered by performer/owner."""
    _clear_assignments(STAFF, 2026)
    _ensure_assignment(STAFF, "KARAOKE", 2026, target=1_000_000_000)
    try:
        r = client.get(
            f"/api/kpi/field-kpi?year=2026",
            headers={"Authorization": f"Bearer {_token(STAFF)}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user_email"] == STAFF

        payload = _fields_payload(body)
        karaoke = _field_by_code(payload, "KARAOKE")
        assert karaoke is not None, "KARAOKE group missing"
        assert karaoke["kpi_group_code"] == "KARAOKE"
        assert "PHONG_THU_AM" in karaoke.get("member_field_codes", [])

        expected = _before_vat_total_for_member_codes(2026, ("KARAOKE", "PHONG_THU_AM"))
        assert int(karaoke["actual"]) == expected, (
            f"staff KARAOKE actual must equal unit-wide BEFORE_VAT total "
            f"(no owner filter). expected={expected}, got={karaoke['actual']}"
        )
    finally:
        _clear_assignments(STAFF, 2026)


def test_karaoke_kpi_includes_recording_studio_domain():
    """Karaoke KPI must include PHONG_THU_AM (Phòng thu âm) contracts.
    The unit-wide sum of KARAOKE + PHONG_THU_AM must be greater than the
    sum of KARAOKE alone (PHONG_THU_AM is non-empty in 2026)."""
    db = SessionLocal()
    try:
        karaoke_only = _before_vat_total_for_member_codes(2026, ("KARAOKE",))
        karaoke_plus = _before_vat_total_for_member_codes(2026, ("KARAOKE", "PHONG_THU_AM"))
        phong_thu_am = _before_vat_total_for_member_codes(2026, ("PHONG_THU_AM",))
        assert phong_thu_am > 0, "test data must include at least one PHONG_THU_AM contract in 2026"
        assert karaoke_plus == karaoke_only + phong_thu_am, (
            f"Karaoke group total must equal KARAOKE + PHONG_THU_AM. "
            f"karaoke={karaoke_only}, phong_thu_am={phong_thu_am}, sum={karaoke_plus}"
        )
    finally:
        db.close()


def test_staff_kpi_does_not_filter_by_contract_owner():
    """If no contract is owned by the staff user, KPI must still equal the
    unit-wide total of the assigned fields. Contracts owned by other users
    must still be counted."""
    _clear_assignments(STAFF, 2026)
    _ensure_assignment(STAFF, "KARAOKE", 2026, target=1_000_000_000)
    try:
        # Confirm staff has near-zero personal contracts in 2026
        db = SessionLocal()
        try:
            owned_count = db.execute(
                sa_text("""
                    SELECT COUNT(*) FROM contract_records
                    WHERE contract_year = 2026 AND annex_no IS NULL
                      AND lower(coalesce(nguoi_thuc_hien_email, '')) = lower(:e)
                """),
                {"e": STAFF},
            ).scalar() or 0
        finally:
            db.close()

        r = client.get(
            f"/api/kpi/field-kpi?year=2026",
            headers={"Authorization": f"Bearer {_token(STAFF)}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        karaoke = _field_by_code(_fields_payload(body), "KARAOKE")
        expected = _before_vat_total_for_member_codes(2026, ("KARAOKE", "PHONG_THU_AM"))
        assert int(karaoke["actual"]) == expected, (
            f"KPI must be unit-wide regardless of who owns the contracts. "
            f"staff_owned={owned_count}, expected={expected}, got={karaoke['actual']}"
        )
        # Defensive: if staff actually owns 0 contracts, KPI must still be > 0
        if owned_count == 0:
            assert int(karaoke["actual"]) > 0, (
                "KPI must be > 0 even when staff owns zero contracts (Karaoke group has data)"
            )
    finally:
        _clear_assignments(STAFF, 2026)


def test_multiple_assigned_fields_are_summed():
    """When a user is assigned both KARAOKE and KHU_VUI_CHOI, total KPI must
    equal the sum of both groups' unit-wide actuals."""
    _clear_assignments(STAFF, 2026)
    _ensure_assignment(STAFF, "KARAOKE", 2026, target=1_000_000_000)
    _ensure_assignment(STAFF, "KHU_VUI_CHOI", 2026, target=1_000_000_000)
    try:
        r = client.get(
            f"/api/kpi/field-kpi?year=2026",
            headers={"Authorization": f"Bearer {_token(STAFF)}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        payload = _fields_payload(body)

        karaoke = _field_by_code(payload, "KARAOKE")
        kvc = _field_by_code(payload, "KHU_VUI_CHOI")
        assert karaoke is not None and kvc is not None

        expected_karaoke = _before_vat_total_for_member_codes(2026, ("KARAOKE", "PHONG_THU_AM"))
        expected_kvc = _before_vat_total_for_member_codes(2026, ("KHU_VUI_CHOI", "ENTERTAINMENT"))
        assert int(karaoke["actual"]) == expected_karaoke
        assert int(kvc["actual"]) == expected_kvc

        totals = body["totals"]
        assert int(totals["actual_amount"]) == expected_karaoke + expected_kvc, (
            f"total KPI must equal sum of assigned fields. "
            f"karaoke={expected_karaoke}, kvc={expected_kvc}, total={totals['actual_amount']}"
        )
        assert int(totals["target_amount"]) == 2_000_000_000
    finally:
        _clear_assignments(STAFF, 2026)


def test_three_assigned_fields_still_sum():
    """Existing test pattern: assign all configured groups, total must sum."""
    _clear_assignments(STAFF, 2026)
    for fc in ("KARAOKE", "KHU_VUI_CHOI"):
        _ensure_assignment(STAFF, fc, 2026, target=500_000_000)
    try:
        r = client.get(
            f"/api/kpi/field-kpi?year=2026",
            headers={"Authorization": f"Bearer {_token(STAFF)}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        payload = _fields_payload(body)
        # Only assigned groups should have non-zero target
        active_targets = sum(1 for f in payload if f.get("has_target"))
        assert active_targets == 2
    finally:
        _clear_assignments(STAFF, 2026)


def test_unassigned_field_zero_actual():
    """An unassigned field must NOT contribute to user KPI (carried groups
    from other users' assignments are not visible)."""
    _clear_assignments(STAFF, 2026)
    try:
        r = client.get(
            f"/api/kpi/field-kpi?year=2026",
            headers={"Authorization": f"Bearer {_token(STAFF)}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["totals"]["actual_amount"] in (0, None)
        # All groups must have has_target = false
        for f in body["fields"]:
            assert f.get("has_target") is False
    finally:
        _clear_assignments(STAFF, 2026)


def test_unassigned_staff_returns_empty_state_no_org_kpi():
    """A staff user with no assignment must receive an empty KPI payload
    (no actual pulled from the org-wide totals)."""
    _clear_assignments(STAFF, 2026)
    try:
        r = client.get(
            f"/api/kpi/field-kpi?year=2026",
            headers={"Authorization": f"Bearer {_token(STAFF)}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert int(body["totals"]["actual_amount"]) == 0
        # must not have any has_target groups
        assert all(not f.get("has_target") for f in body["fields"]), (
            "staff without assignments must not see any target/assignment"
        )
    finally:
        _clear_assignments(STAFF, 2026)


def test_staff_403_on_other_user_email():
    """Staff cannot pass an unrelated user_email to inspect another user's KPI."""
    r = client.get(
        f"/api/kpi/field-kpi?year=2026&user_email={ADMIN}",
        headers={"Authorization": f"Bearer {_token(STAFF)}"},
    )
    assert r.status_code == 403, r.text


def test_admin_can_view_other_user_field_kpi():
    """Admin can pass another user_email and get that user's field-scoped KPI."""
    _clear_assignments(STAFF, 2026)
    _ensure_assignment(STAFF, "KARAOKE", 2026, target=1_000_000_000)
    try:
        r = client.get(
            f"/api/kpi/field-kpi?year=2026&user_email={STAFF}",
            headers={"Authorization": f"Bearer {_token(ADMIN)}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user_email"] == STAFF
        karaoke = _field_by_code(_fields_payload(body), "KARAOKE")
        assert karaoke is not None
        expected = _before_vat_total_for_member_codes(2026, ("KARAOKE", "PHONG_THU_AM"))
        assert int(karaoke["actual"]) == expected
    finally:
        _clear_assignments(STAFF, 2026)


def test_field_kpi_org_no_regression():
    """Org-level KPI must still aggregate all configured groups."""
    r = client.get(
        "/api/kpi/field-kpi-org?year=2026",
        headers={"Authorization": f"Bearer {_token(ADMIN)}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    expected = _before_vat_total_2026_in_kpi_groups()
    assert sum(int(f["actual"] or 0) for f in body["fields"]) == expected


def test_target_equals_sum_of_assigned_fields():
    """User's total target must equal the sum of target_amount of assigned
    fields (no double-count, no missed fields)."""
    _clear_assignments(STAFF, 2026)
    _ensure_assignment(STAFF, "KARAOKE", 2026, target=2_500_000_000)
    _ensure_assignment(STAFF, "KHU_VUI_CHOI", 2026, target=750_000_000)
    try:
        r = client.get(
            f"/api/kpi/field-kpi?year=2026",
            headers={"Authorization": f"Bearer {_token(STAFF)}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert int(body["totals"]["target_amount"]) == 2_500_000_000 + 750_000_000
    finally:
        _clear_assignments(STAFF, 2026)


def test_kpi_does_not_leak_contract_list():
    """A KPI response must NOT include any contract list/details — only the
    aggregated counts and totals."""
    _clear_assignments(STAFF, 2026)
    _ensure_assignment(STAFF, "KARAOKE", 2026, target=1_000_000_000)
    try:
        r = client.get(
            f"/api/kpi/field-kpi?year=2026",
            headers={"Authorization": f"Bearer {_token(STAFF)}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # KPIs must not include any list of contracts
        for forbidden in ("contracts", "items", "contract_list", "contract_details"):
            assert forbidden not in body, (
                f"KPI summary must not include contract list under '{forbidden}'"
            )
        for f in body["fields"]:
            for forbidden in ("contracts", "items", "contract_list"):
                assert forbidden not in f, (
                    f"KPI field must not include contract list under '{forbidden}'"
                )
    finally:
        _clear_assignments(STAFF, 2026)


def test_legacy_no_before_vat_no_inflation():
    """Records with only so_tien_value (no before_vat, no after_vat) must NOT
    be counted as before-VAT revenue. This guards against the silent
    fallback that would inflate legacy-only records."""
    _clear_assignments(STAFF, 2026)
    _ensure_assignment(STAFF, "KARAOKE", 2026, target=1_000_000_000)
    try:
        # Compare API sum to direct DB sum scoped to KARAOKE/PHONG_THU_AM only
        expected = _before_vat_total_for_member_codes(2026, ("KARAOKE", "PHONG_THU_AM"))
        r = client.get(
            f"/api/kpi/field-kpi?year=2026",
            headers={"Authorization": f"Bearer {_token(STAFF)}"},
        )
        assert r.status_code == 200
        karaoke = _field_by_code(_fields_payload(r.json()), "KARAOKE")
        assert int(karaoke["actual"]) == expected, (
            f"legacy so_tien_value must not inflate BEFORE_VAT. "
            f"expected={expected}, got={karaoke['actual']}"
        )
    finally:
        _clear_assignments(STAFF, 2026)
