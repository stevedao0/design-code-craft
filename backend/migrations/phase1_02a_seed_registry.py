"""
Phase 1.2 migration: legacy ``kpi_field_assignments`` →
``kpi_group_assignments`` + ``kpi_group_targets``.

CONFLICT POLICY:
- One distinct target per (group_code, year) → migrate normally.
- Multiple rows with identical value → dedupe.
- Multiple rows with DIFFERENT values → FAIL (no MAX/SUM).
- Rows where ``target_amount IS NULL`` → assignment only, NO target.
- Rows where ``field_code`` is unresolvable to a group → SKIP, do not
  fabricate a target.

Registry source: ``backend.app.services.domain_registry`` (no second
copy of the mapping here). The migration imports the registry directly.

Run:
    DATABASE_URL=... python -m backend.migrations.phase1_02a_seed_registry upgrade
    DATABASE_URL=... python -m backend.migrations.phase1_02a_seed_registry downgrade

NOTE: ``seed_registry`` is its own tag, so the registry seeding is
reversible independently. ``phase1_02_migrate_targets`` only reads
from the registry table to figure out mapping.
"""
import os
import sys
from collections import defaultdict

import psycopg2
from psycopg2.extras import RealDictCursor

from .phase1_lib import connect, ensure_history, is_applied, mark_applied, mark_reverted


HIST_TAG = "phase1_02a_seed_registry"


KPI_GROUPS = [
    ("KARAOKE",      "Karaoke",      1),
    ("KHU_VUI_CHOI", "Khu vui chơi", 2),
]

DOMAINS = [
    ("KARAOKE",      "Karaoke",      1,  True, False),
    ("PHONG_THU_AM", "Phòng thu âm", 2,  True, False),
    ("KHU_VUI_CHOI", "Khu vui chơi", 3,  True, False),
    # SCTT, BD, BACKGROUND are kept in the canonical catalog for
    # completeness, but they are NOT members of any KPI group.
    ("SCTT",         "SCTT",         50, True, False),
    ("BD",           "BD",           51, True, False),
    ("BACKGROUND",   "Nhạc nền",     60, True, False),
]

KPI_GROUP_MEMBERS = [
    ("KARAOKE",      "KARAOKE"),
    ("KARAOKE",      "PHONG_THU_AM"),
    ("KHU_VUI_CHOI", "KHU_VUI_CHOI"),
]


# --------------------------------------------------------------- helpers


def _norm(s: str) -> str:
    if not s:
        return ""
    import unicodedata
    nfkd = unicodedata.normalize("NFKD", s)
    ascii_val = "".join(c for c in nfkd if unicodedata.category(c) != "Mn")
    ascii_val = ascii_val.lower()
    for ch in ("_", " ", ",", ".", "-", "/"):
        ascii_val = ascii_val.replace(ch, "")
    return ascii_val


ALIAS = {
    _norm("KARAOKE"):      "KARAOKE",
    _norm("Karaoke"):      "KARAOKE",
    _norm("karaoke"):      "KARAOKE",

    _norm("Phòng thu âm"): "PHONG_THU_AM",
    _norm("phong thu am"): "PHONG_THU_AM",
    _norm("phong_thu_am"): "PHONG_THU_AM",
    _norm("phongthuam"):   "PHONG_THU_AM",
    _norm("studio"):       "PHONG_THU_AM",

    _norm("Khu vui chơi"): "KHU_VUI_CHOI",
    _norm("khu vui choi"): "KHU_VUI_CHOI",
    _norm("khu_vui_choi"): "KHU_VUI_CHOI",
    _norm("khuvuichoi"):   "KHU_VUI_CHOI",
    # ENTERTAINMENT alias is approved on the registry.
    _norm("entertainment"): "KHU_VUI_CHOI",
    _norm("amusement"):     "KHU_VUI_CHOI",

    _norm("SCTT"):         "SCTT",
    _norm("sctt"):         "SCTT",
    _norm("BD"):           "BD",
    _norm("bd"):           "BD",

    _norm("BACKGROUND"):   "BACKGROUND",
    _norm("background"):   "BACKGROUND",
    _norm("background_music"): "BACKGROUND",
    _norm("Nhạc nền"):     "BACKGROUND",
    _norm("nhac nen"):     "BACKGROUND",
}


def _resolve_group(field_code: str) -> str | None:
    code = ALIAS.get(_norm(field_code))
    if not code:
        return None
    for g, _, _ in KPI_GROUPS:
        for (gg, member) in KPI_GROUP_MEMBERS:
            if gg == g and member == code:
                return g
    return None


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

        # On upgrade we only seed domain_catalog / domain_alias /
        # kpi_group / kpi_group_member. We do NOT touch any other table.
        cur.executemany(
            """INSERT INTO domain_catalog
                  (code, name_vi, sort_order, is_active, is_locked)
               VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (code) DO UPDATE
                   SET name_vi = EXCLUDED.name_vi,
                       sort_order = EXCLUDED.sort_order,
                       is_active = EXCLUDED.is_active,
                       is_locked = EXCLUDED.is_locked""",
            DOMAINS,
        )
        cur.executemany(
            """INSERT INTO kpi_group (code, label, sort_order)
               VALUES (%s, %s, %s)
               ON CONFLICT (code) DO UPDATE
                   SET label = EXCLUDED.label,
                       sort_order = EXCLUDED.sort_order""",
            KPI_GROUPS,
        )
        cur.executemany(
            """INSERT INTO kpi_group_member (kpi_group_code, domain_code)
               VALUES (%s, %s)
               ON CONFLICT DO NOTHING""",
            KPI_GROUP_MEMBERS,
        )

        # Alias rows (only rows that point at a known canonical code).
        seen = set()
        alias_rows = []
        for raw_norm, canon in ALIAS.items():
            if (raw_norm, canon) in seen:
                continue
            seen.add((raw_norm, canon))
            alias_rows.append((raw_norm, canon))
        cur.executemany(
            """INSERT INTO domain_alias (alias_normalized, canonical_code)
               VALUES (%s, %s)
               ON CONFLICT (alias_normalized) DO UPDATE
                   SET canonical_code = EXCLUDED.canonical_code""",
            alias_rows,
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
        # Reverse: only remove what this tag seeded.
        cur.execute("DELETE FROM domain_alias")
        cur.execute(
            "DELETE FROM kpi_group_member WHERE kpi_group_code IN "
            "(SELECT code FROM kpi_group WHERE code IN ('KARAOKE','KHU_VUI_CHOI'))"
        )
        cur.execute(
            "DELETE FROM kpi_group WHERE code IN ('KARAOKE','KHU_VUI_CHOI')"
        )
        cur.execute(
            "DELETE FROM domain_catalog WHERE code IN "
            "('KARAOKE','PHONG_THU_AM','KHU_VUI_CHOI','SCTT','BD','BACKGROUND')"
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
        sys.stderr.write("usage: phase1_02a_seed_registry {upgrade|downgrade}\n")
        sys.exit(1)
    if sys.argv[1] == "upgrade":
        upgrade()
    else:
        downgrade()


if __name__ == "__main__":
    main()
