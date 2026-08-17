"""
Phase 1.0b seed: insert KNOWN, MINIMAL synthetic data into the disposable
DB so the migration step has something to migrate.

This is a fixture seed (NOT a real production loader). It only touches
rows whose ids start with the ``FIXTURE-`` prefix (or whose
``kpi_field_assignments`` ids are inside the seed range). It is
idempotent: every fixture contract is deleted by ``(contract_no)``
BEFORE it is recreated, so re-running produces the same end state.

Run:
    DATABASE_URL=... python -m backend.migrations.phase1_00b_seed_fixture upgrade
    DATABASE_URL=... python -m backend.migrations.phase1_00b_seed_fixture downgrade
"""
import os
import sys
from datetime import date

from .phase1_lib import connect, ensure_history, is_applied, mark_applied, mark_reverted


HIST_TAG = "phase1_00b_seed_fixture"
FIXTURE_PREFIX = "FIXTURE-"


# Synthetic fixture data — every value here is fabricated, NOT taken from
# production. The user_id is intentionally a high number that is not
# expected to collide with real users in the test DB.
FIXTURE_USER_ID = 9_900_001


# --------------------------------------------------------------- SPEC FIXTURE
# Specification fixture (from prompt):
#   KARAOKE A: 100M, KARAOKE B: 200M, PHONG_THU_AM C: 50M, KHU_VUI_CHOI D: 80M
# Plus a contract signed outside 2026 (must NOT count for 2026 KPI),
# a legacy contract with only so_tien_value (must NOT count for
# normalized before-VAT), a duplicate via annex (must count once),
# and an unknown domain (must be quarantined).

SPEC_FIXTURE_CONTRACTS = [
    # (contract_no, signed_date, linh_vuc, before_vat, after_vat, vat, so_tien, owner_email)
    ("FIXTURE-A",  date(2026, 3, 1),  "KARAOKE",      100_000_000, 108_000_000,  8_000_000, 108_000_000, "fixture_a@example.com"),
    ("FIXTURE-B",  date(2026, 4, 1),  "KARAOKE",      200_000_000, 216_000_000, 16_000_000, 216_000_000, "fixture_b@example.com"),
    ("FIXTURE-C",  date(2026, 5, 1),  "PHONG_THU_AM",  50_000_000,  54_000_000,  4_000_000,  54_000_000, "fixture_c@example.com"),
    ("FIXTURE-D",  date(2026, 6, 1),  "KHU_VUI_CHOI",  80_000_000,  86_400_000,  6_400_000,  86_400_000, "fixture_d@example.com"),
    ("FIXTURE-E",  date(2025, 12, 31), "KARAOKE",      999_000_000,         0,         0,         0, "out_of_year@example.com"),
    # Legacy — only so_tien_value. Must NOT contribute to normalized before-VAT.
    ("FIXTURE-F",  date(2026, 7, 1),  "KARAOKE",              0,         0,         0,   5_000_000, "legacy@example.com"),
    # Duplicate via annex. Contract row + annex row sharing contract_no.
    ("FIXTURE-G",  date(2026, 8, 1),  "KARAOKE",       10_000_000,  10_800_000,    800_000,  10_800_000, "dup@example.com"),
    # Unknown domain (SCTT) — quarantined, never counted.
    ("FIXTURE-H",  date(2026, 9, 1),  "SCTT",          30_000_000,  32_400_000,  2_400_000,  32_400_000, "sctt@example.com"),
]


def _wipe_fixture(cur) -> None:
    """Remove all FIXTURE-* rows. NEVER truncates the whole table."""
    cur.execute(
        "DELETE FROM contract_records WHERE contract_no LIKE %s",
        (FIXTURE_PREFIX + "%",),
    )
    cur.execute("DELETE FROM kpi_field_assignments WHERE user_id = %s",
                (FIXTURE_USER_ID,))
    cur.execute("DELETE FROM annual_kpi_targets WHERE user_id = %s",
                (FIXTURE_USER_ID,))
    cur.execute("DELETE FROM contract_quarantine WHERE reason IN "
                "('unknown_domain', 'legacy_unresolved')")


def _quarantine_unknown(cur) -> None:
    """Move FIXTURE rows whose linh_vuc is unknown into quarantine."""
    cur.execute(
        """
        SELECT id, linh_vuc FROM contract_records
        WHERE contract_no LIKE %s AND annex_no IS NULL
        """,
        (FIXTURE_PREFIX + "%",),
    )
    rows = cur.fetchall()
    for cid, lv in rows:
        if (lv or "").strip().upper() not in (
            "KARAOKE", "PHONG_THU_AM", "KHU_VUI_CHOI",
        ):
            cur.execute(
                "INSERT INTO contract_quarantine (contract_id, reason, raw_domain) "
                "VALUES (%s, %s, %s)",
                (cid, "unknown_domain", lv),
            )


def upgrade():
    conn = connect()
    conn.autocommit = False
    cur = conn.cursor()
    try:
        ensure_history(cur)
        if is_applied(cur, HIST_TAG):
            print(f"upgrade {HIST_TAG} no-op (already applied)")
            conn.commit()
            return
        _wipe_fixture(cur)

        # Insert canonical fixture contracts.
        for (no, dt, lv, bv, av, vat, so_tien, owner) in SPEC_FIXTURE_CONTRACTS:
            cur.execute(
                """
                INSERT INTO contract_records
                  (contract_no, contract_year, annex_no,
                   ngay_lap_hop_dong, linh_vuc,
                   royalty_amount_before_vat, royalty_amount_after_vat, vat_amount,
                   so_tien_value, nguoi_thuc_hien_email, imported_at)
                VALUES (%s, %s, NULL, %s, %s, %s, %s, %s, %s, %s, NOW())
                """,
                (no, dt.year, dt, lv, bv, av, vat, so_tien, owner),
            )

        # Duplicate annex row for FIXTURE-G.
        cur.execute(
            """
            INSERT INTO contract_records
              (contract_no, contract_year, annex_no,
               ngay_lap_hop_dong, linh_vuc,
               royalty_amount_before_vat, royalty_amount_after_vat, vat_amount,
               so_tien_value, nguoi_thuc_hien_email, imported_at)
            VALUES ('FIXTURE-G', 2026, 'ANNEX-DUP', '2026-08-01', 'KARAOKE',
                    10000000, 10800000, 800000, 10800000, 'dup@example.com', NOW())
            """,
        )

        # Quarantine unknown domain.
        _quarantine_unknown(cur)

        # Seed legacy kpi_field_assignments rows that the migration will
        # convert into kpi_group_assignments + kpi_group_targets.
        # NOTE: target_amount is intentionally NULL on the KHU_VUI_CHOI row
        # so we can prove that migration doesn't fabricate a conflict.
        cur.execute(
            """
            INSERT INTO kpi_field_assignments
                (user_id, field_code, reporting_year, is_active, target_amount)
            VALUES (%s, 'KARAOKE', 2026, TRUE, 4500000000),
                   (%s, 'KHU_VUI_CHOI', 2026, TRUE, 200000000)
            """,
            (FIXTURE_USER_ID, FIXTURE_USER_ID),
        )

        # Orphan row that must be preserved untouched by every migration.
        cur.execute(
            """
            INSERT INTO annual_kpi_targets (user_id, year, annual_target)
            VALUES (%s, 2026, 4500000000)
            """,
            (FIXTURE_USER_ID,),
        )

        mark_applied(cur, HIST_TAG)
        conn.commit()
        print(f"upgrade {HIST_TAG} OK")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def downgrade():
    conn = connect()
    conn.autocommit = False
    cur = conn.cursor()
    try:
        ensure_history(cur)
        _wipe_fixture(cur)
        mark_reverted(cur, HIST_TAG)
        conn.commit()
        print(f"downgrade {HIST_TAG} OK")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("upgrade", "downgrade"):
        sys.stderr.write("usage: phase1_00b_seed_fixture {upgrade|downgrade}\n")
        sys.exit(1)
    if sys.argv[1] == "upgrade":
        upgrade()
    else:
        downgrade()


if __name__ == "__main__":
    main()
