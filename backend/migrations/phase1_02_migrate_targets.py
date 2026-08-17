"""
Phase 1.2 migration (test schema, DB 5433):

- Reads from legacy `kpi_field_assignments.target_amount`.
- Maps each (user_id, field_code, reporting_year) to its KPI group via
  the current (old) `KPI_FIELD_GROUPS` mapping in `kpi_field.py` —
  which mirrors the new registry:
    field_code = KARAOKE → group KARAOKE
    field_code = KHU_VUI_CHOI → group KHU_VUI_CHOI
  Field code KARAOKE + PHONG_THU_AM both roll up under KARAOKE group.

- Aggregates (SUM) per (group, year). Different aggregation rules:
    * If unique target value for (group, year): use it.
    * If multiple rows but same value: dedupe, write one.
    * If multiple rows with different values: FAIL (no MAX/SUM trick).

- Then backfills `kpi_group_assignments` for every user that had an
  active assignment row.
- Leaves `annual_kpi_targets` untouched (orphan).
- Leaves `kpi_field_assignments` rows intact.

Run on DB 5433 only.
"""
import os
import sys
import psycopg2
from collections import defaultdict
from psycopg2.extras import RealDictCursor

DB_URL = "postgresql://vcpmc_user:change_me@localhost:5433/vcpmc_contract_new"


# Mirror of the canonical mapping for migration purposes.
# Keep aligned with services/domain_registry.py.
_FIELD_TO_GROUP_CODE = {
    "KARAOKE": "KARAOKE",
    "PHONG_THU_AM": "KARAOKE",
    "KHU_VUI_CHOI": "KHU_VUI_CHOI",
    "BACKGROUND": "BACKGROUND",
}


def _resolve_group_code(field_code: str) -> str | None:
    fc = (field_code or "").strip().upper()
    return _FIELD_TO_GROUP_CODE.get(fc)


def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=RealDictCursor)

    print("=== Phase 1.2 migration on disposable DB ===")

    # 1. Find distinct target values per (group_code, reporting_year)
    cur.execute("""
        SELECT user_id, field_code, reporting_year, target_amount, is_active
        FROM kpi_field_assignments
        ORDER BY reporting_year, field_code, user_id
    """)
    rows = cur.fetchall()
    print(f"Found {len(rows)} assignment rows in legacy table")

    # Group targets by (group_code, year) with target values per group
    group_target_values: dict[tuple[str, int], set[int]] = defaultdict(set)
    group_assignments: dict[tuple[str, int, int], dict] = {}

    for r in rows:
        if r["target_amount"] is None:
            continue
        grp = _resolve_group_code(r["field_code"])
        if grp is None:
            print(f"  SKIP unknown field_code={r['field_code']}")
            continue
        gt_key = (grp, r["reporting_year"])
        # Per-user assignment (no target_value tie); we just record the link
        ak_key = (grp, r["reporting_year"], r["user_id"])
        existing = group_assignments.get(ak_key)
        if existing is None:
            group_assignments[ak_key] = {
                "group": grp,
                "year": r["reporting_year"],
                "user_id": r["user_id"],
                "is_active": bool(r["is_active"]),
                "target_amount_value": r["target_amount"],
            }
            group_target_values[gt_key].add(int(r["target_amount"]))

    # 2. Conflict detection
    print()
    print("Distinct target values per (group, year):")
    conflicts = []
    for (grp, yr), vals in sorted(group_target_values.items()):
        print(f"  {grp} {yr}: {sorted(vals)}")
        if len(vals) > 1:
            conflicts.append((grp, yr, sorted(vals)))

    if conflicts:
        print()
        print("FAIL-CONFLICT detected:")
        for grp, yr, vals in conflicts:
            print(f"  {grp} {yr} -> {vals}")
        conn.rollback()
        print("\nNo migration applied (rolled back). Resolve conflicts first.")
        sys.exit(1)

    # 3. Write kpi_group_targets (deduped)
    print()
    print("Writing kpi_group_targets…")
    # Clear existing test rows for disposable DB
    cur.execute("DELETE FROM kpi_group_targets")
    target_rows = []
    for (grp, yr), vals in sorted(group_target_values.items()):
        val = sorted(vals)[0]  # only one, we know
        target_rows.append((yr, grp, val, True, "migrated from kpi_field_assignments"))
    cur.executemany("""
        INSERT INTO kpi_group_targets
            (reporting_year, kpi_group_code, target_amount_before_tax, is_active, note)
        VALUES (%s, %s, %s, %s, %s)
    """, target_rows)
    print(f"  inserted {len(target_rows)} target rows")

    # 4. Write kpi_group_assignments
    print()
    print("Writing kpi_group_assignments…")
    cur.execute("DELETE FROM kpi_group_assignments")
    assignment_rows = [
        (a["year"], a["group"], a["user_id"], a["is_active"], 9991)
        for a in group_assignments.values()
    ]
    cur.executemany("""
        INSERT INTO kpi_group_assignments
            (reporting_year, kpi_group_code, user_id, is_active, assigned_by_user_id)
        VALUES (%s, %s, %s, %s, %s)
    """, assignment_rows)
    print(f"  inserted {len(assignment_rows)} assignment rows")

    # 5. annual_kpi_targets NOT touched
    cur.execute("SELECT COUNT(*) FROM annual_kpi_targets")
    orphans = cur.fetchone()["count"]
    print(f"\nannual_kpi_targets untouched: {orphans} orphan rows preserved")

    conn.commit()

    # 6. Verify
    print()
    print("=== Post-migration state ===")
    cur.execute("""
        SELECT reporting_year, kpi_group_code, target_amount_before_tax, is_active
        FROM kpi_group_targets ORDER BY reporting_year, kpi_group_code
    """)
    print("kpi_group_targets:")
    for r in cur.fetchall(): print(f"  {r}")

    cur.execute("""
        SELECT reporting_year, kpi_group_code, user_id, is_active
        FROM kpi_group_assignments ORDER BY reporting_year, kpi_group_code, user_id
    """)
    print("\nkpi_group_assignments:")
    for r in cur.fetchall(): print(f"  {r}")

    cur.execute("""
        SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE field_code='KARAOKE') AS karaoke,
               COUNT(*) FILTER (WHERE field_code='KHU_VUI_CHOI') AS kvc
        FROM kpi_field_assignments
    """)
    r = cur.fetchone()
    print(f"\nkpi_field_assignments (legacy, untouched): total={r['total']} karaoke={r['karaoke']} kvc={r['kvc']}")

    cur.close()
    conn.close()
    print("\nPhase 1.2 DONE — no conflicts, no orphan mutation.")


if __name__ == "__main__":
    main()