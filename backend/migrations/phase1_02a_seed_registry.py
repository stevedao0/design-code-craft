"""
Phase 1.2a: seed canonical registry rows (kpi_group, domain_catalog).
Run on DB 5433 only.
"""
import psycopg2

DB_URL = "postgresql://vcpmc_user:change_me@localhost:5433/vcpmc_contract_new"


SEED_KPI_GROUPS = [
    ("KARAOKE", "Karaoke", 1),
    ("KHU_VUI_CHOI", "Khu vui chơi", 2),
]

SEED_DOMAINS = [
    ("KARAOKE",      "Karaoke",      1, True,  False),
    ("PHONG_THU_AM", "Phòng thu âm", 2, True,  False),
    ("KHU_VUI_CHOI", "Khu vui chơi", 3, True,  False),
    ("SCTT",         "SCTT",         50, True, False),
    ("BD",           "BD",           51, True, False),
    ("BACKGROUND",   "Nhạc nền",     60, True, False),
]

SEED_DOMAIN_MEMBERS = [
    ("KARAOKE",      "KARAOKE"),
    ("KARAOKE",      "PHONG_THU_AM"),
    ("KHU_VUI_CHOI", "KHU_VUI_CHOI"),
]


def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("DELETE FROM kpi_group_member")
    cur.execute("DELETE FROM domain_alias")
    cur.execute("DELETE FROM domain_catalog")
    cur.execute("DELETE FROM kpi_group")

    cur.executemany(
        "INSERT INTO kpi_group (code, label, sort_order) VALUES (%s, %s, %s)",
        SEED_KPI_GROUPS,
    )
    cur.executemany(
        """INSERT INTO domain_catalog
              (code, name_vi, sort_order, is_active, is_locked)
           VALUES (%s, %s, %s, %s, %s)""",
        SEED_DOMAINS,
    )
    cur.executemany(
        "INSERT INTO kpi_group_member (kpi_group_code, domain_code) VALUES (%s, %s)",
        SEED_DOMAIN_MEMBERS,
    )

    # Seed alias map mirroring services/domain_registry.
    alias_rows = [
        ("karaoke", "KARAOKE"),
        ("phong thu am", "PHONG_THU_AM"),
        ("phong_thu_am", "PHONG_THU_AM"),
        ("phongthuam", "PHONG_THU_AM"),
        ("studio", "PHONG_THU_AM"),
        ("khu vui choi", "KHU_VUI_CHOI"),
        ("khu_vui_choi", "KHU_VUI_CHOI"),
        ("khuvuichoi", "KHU_VUI_CHOI"),
        ("entertainment", "KHU_VUI_CHOI"),
        ("amusement", "KHU_VUI_CHOI"),
        ("sctt", "SCTT"),
        ("bd", "BD"),
        ("background", "BACKGROUND"),
        ("background_music", "BACKGROUND"),
        ("nhac nen", "BACKGROUND"),
    ]
    # Normalize: lowercase + strip
    normalized = []
    seen = set()
    for raw, canon in alias_rows:
        n = raw.lower().replace("_", "").replace(" ", "").replace(",", "")
        if n in seen:
            continue
        seen.add(n)
        normalized.append((n, canon))
    cur.executemany(
        "INSERT INTO domain_alias (alias_normalized, canonical_code) VALUES (%s, %s)",
        normalized,
    )
    print(f"Inserted kpi_group={len(SEED_KPI_GROUPS)} domain_catalog={len(SEED_DOMAINS)} "
          f"alias={len(normalized)}")
    cur.execute("SELECT code, label FROM kpi_group ORDER BY sort_order")
    for r in cur.fetchall(): print(r)
    conn.close()


if __name__ == "__main__":
    main()