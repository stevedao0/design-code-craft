"""
Phase 1.2b migration: legacy ``kpi_field_assignments`` →
``kpi_group_assignments`` + ``kpi_group_targets``.

Idempotent, versioned, upgrade/downgrade.

CONFLICT POLICY (per requirement spec):
1. Empty assignment set → migration is a no-op (records target NULL).
2. Exactly one distinct ``(target_amount)`` for a (group, year) pair →
   insert one ``kpi_group_targets`` row, dedupe assignments.
3. Multiple rows with the SAME target value → dedupe to one row.
4. Multiple rows with DIFFERENT target values for the SAME (group, year)
   → FAIL (no MAX/SUM). Operator must resolve manually.
5. Rows where ``target_amount IS NULL`` → assignment only, NO target row.
6. Rows where ``field_code`` cannot be resolved to a KPI group → SKIP.
7. annual_kpi_targets is NEVER touched (orphan kept).

This script does NOT touch production data. The ``field_code`` →
``kpi_group_code`` mapping is derived from the SINGLE canonical
registry in ``backend.app.services.domain_registry``. No second copy
of the mapping is defined here.

Run:
    DATABASE_URL=... python -m backend.migrations.phase1_02_migrate_targets upgrade
    DATABASE_URL=... python -m backend.migrations.phase1_02_migrate_targets downgrade
"""
import os
import sys
from collections import defaultdict

import psycopg2
from psycopg2.extras import RealDictCursor

from .phase1_lib import connect, ensure_history, is_applied, mark_applied, mark_reverted
from .phase1_02a_seed_registry import _resolve_group  # alias map (single source)


HIST_TAG = "phase1_02_migrate_targets"


def upgrade():
    conn = connect()
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        ensure_history(cur)
        if is_applied(cur, HIST_TAG):
            print(f"upgrade {HIST_TAG} no-op (already applied)")
            conn.commit()
            return

        # 1. Read all legacy assignment rows (no DELETE on legacy data).
        cur.execute(
            """
            SELECT id, user_id, field_code, reporting_year, is_active,
                   target_amount
            FROM kpi_field_assignments
            ORDER BY reporting_year, field_code, user_id
            """
        )
        rows = cur.fetchall()
        print(f"Found {len(rows)} legacy assignment rows")

        # 2. Bucket distinct target values per (group, year).
        #    An assignment row with target_amount IS NULL → counted
        #    as assignment but contributes NO kpi_group_targets row.
        group_year_values: dict[tuple[str, int], set[int]] = defaultdict(set)
        assignments_per_aky: dict[tuple[int, str, int], dict] = {}

        skipped_unknown_field = 0
        skipped_null_target = 0

        for r in rows:
            grp = _resolve_group(r["field_code"] or "")
            if grp is None:
                skipped_unknown_field += 1
                continue
            target = r["target_amount"]
            key_aa = (int(r["reporting_year"]), grp, int(r["user_id"]))
            assignments_per_aky[key_aa] = {
                "reporting_year": int(r["reporting_year"]),
                "kpi_group_code": grp,
                "user_id": int(r["user_id"]),
                "is_active": bool(r["is_active"]),
            }
            if target is None:
                skipped_null_target += 1
                continue
            group_year_values[(grp, int(r["reporting_year"]))].add(int(target))

        # 3. Conflict detection.
        conflicts = []
        for (grp, yr), vals in sorted(group_year_values.items()):
            if len(vals) > 1:
                conflicts.append((grp, yr, sorted(vals)))
        if conflicts:
            print("FAIL-CONFLICT detected:")
            for grp, yr, vals in conflicts:
                print(f"  {grp} {yr} -> {vals}")
            sys.stderr.write(
                "Migration aborted: distinct target values conflict. "
                "Resolve in ``kpi_field_assignments`` before re-running.\n"
            )
            sys.exit(3)

        # 4. Idempotent upsert of kpi_group_targets.
        #    One row per (year, group) with the single target_amount.
        for (grp, yr), vals in sorted(group_year_values.items()):
            target = sorted(vals)[0]
            cur.execute(
                """
                INSERT INTO kpi_group_targets
                    (reporting_year, kpi_group_code, target_amount_before_tax,
                     is_active, note)
                VALUES (%s, %s, %s, TRUE, %s)
                ON CONFLICT (reporting_year, kpi_group_code) DO UPDATE
                    SET target_amount_before_tax = EXCLUDED.target_amount_before_tax,
                        is_active = TRUE,
                        note = EXCLUDED.note
                """,
                (yr, grp, target, "migrated from kpi_field_assignments"),
            )
            print(f"  target {grp} {yr} = {target}")

        if skipped_null_target:
            print(f"  {skipped_null_target} assignment rows had target=NULL (kept as assignment only)")
        if skipped_unknown_field:
            print(f"  {skipped_unknown_field} assignment rows had unknown field_code (skipped)")

        # 5. Idempotent upsert of kpi_group_assignments. Never DELETE.
        for (yr, grp, uid), info in sorted(assignments_per_aky.items()):
            cur.execute(
                """
                INSERT INTO kpi_group_assignments
                    (reporting_year, kpi_group_code, user_id, is_active)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (reporting_year, kpi_group_code, user_id) DO UPDATE
                    SET is_active = EXCLUDED.is_active
                """,
                (yr, grp, uid, info["is_active"]),
            )
        print(f"  upserted {len(assignments_per_aky)} assignment rows")

        # 6. annual_kpi_targets NOT touched.
        cur.execute("SELECT COUNT(*) AS n FROM annual_kpi_targets")
        n = cur.fetchone()["n"]
        print(f"annual_kpi_targets preserved: {n} rows (untouched)")

        mark_applied(cur, HIST_TAG)
        conn.commit()
        print(f"upgrade {HIST_TAG} OK")
    except SystemExit:
        # Conflict exit: ensure the txn is rolled back.
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def downgrade():
    """
    Reverse of the migration: drop the rows THIS TAG created. We can
    identify them by the unique note marker.
    """
    conn = connect()
    conn.autocommit = False
    cur = conn.cursor()
    try:
        ensure_history(cur)
        cur.execute(
            "DELETE FROM kpi_group_assignments WHERE assigned_by_user_id IS NULL "
            "AND created_at >= NOW() - INTERVAL '30 days'"
        )
        # Targets are not easily distinguishable from a manual entry by
        # tag. We only delete targets inserted with the ``migrated from``
        # note marker; manual targets are preserved.
        cur.execute(
            "DELETE FROM kpi_group_targets WHERE note LIKE 'migrated from kpi_field_assignments'"
        )
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
        sys.stderr.write("usage: phase1_02_migrate_targets {upgrade|downgrade}\n")
        sys.exit(1)
    if sys.argv[1] == "upgrade":
        upgrade()
    else:
        downgrade()


if __name__ == "__main__":
    main()
