"""
Phase 1.0 fixture: create source-schema (legacy) tables on disposable DB 5433.

Tables to create (mirror prod schema for kpi-side):
- kpi_field_assignments (with target_amount per user/group/year)
- annual_kpi_targets (orphan kept untouched)
- kpi_field_assignments_audit (optional helper)

Seed with fake (non-production) data:
- 1 user (synthetic, not from prod users table)
- 2 assignments: KARAOKE=4.5B, KHU_VUI_CHOI=200M, year=2026
- 1 annual_kpi_targets row (orphan, kept intact by migration)
- 4 contracts (fixture from prompt):
    KARAOKE A: 100M, KARAOKE B: 200M, PHONG_THU_AM C: 50M, KHU_VUI_CHOI D: 80M
  All contract records use canonical linh_vuc codes after our migration.
  Raw domain variants (Karaoke, phong_thu_am, KHU VUI CHOI) get normalized.
- 1 contract signed outside 2026 (must NOT count)
- 1 contract legacy with only so_tien_value (must NOT count toward normalized KPI)
- 1 contract with join-duplicating data (must count once)
- 1 unknown domain (SCTT) → quarantine, NOT counted in KPI
"""
import psycopg2
from psycopg2.extras import RealDictCursor
from decimal import Decimal

DB_URL = "postgresql://vcpmc_user:change_me@localhost:5433/vcpmc_contract_new"

DDL = [
    # Mirror kpi_field_assignments from prod
    """
    CREATE TABLE IF NOT EXISTS kpi_field_assignments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        field_code VARCHAR(64) NOT NULL,
        reporting_year INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        target_amount BIGINT,
        note TEXT,
        created_by_user_id INTEGER,
        updated_by_user_id INTEGER
    )
    """,
    # annual_kpi_targets: kept as orphan, untouched
    """
    CREATE TABLE IF NOT EXISTS annual_kpi_targets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        annual_target BIGINT NOT NULL,
        note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """,
    # New canonical catalog for domains (Phase 1.1 base)
    # Note: existing domains table has only background domains; PHONG_THU_AM, KHU_VUI_CHOI
    # must be added here. We DO NOT replace domains; we extend via new canonical table.
    """
    CREATE TABLE IF NOT EXISTS domain_catalog (
        code VARCHAR(64) PRIMARY KEY,
        name_vi VARCHAR(255) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_locked BOOLEAN NOT NULL DEFAULT FALSE,
        sort_order INTEGER NOT NULL DEFAULT 0
    )
    """,
    # Domain alias map for normalizing raw labels → canonical
    """
    CREATE TABLE IF NOT EXISTS domain_alias (
        alias_normalized VARCHAR(128) PRIMARY KEY,
        canonical_code VARCHAR(64) NOT NULL REFERENCES domain_catalog(code)
    )
    """,
    # KPI group registry (configurable)
    """
    CREATE TABLE IF NOT EXISTS kpi_group (
        code VARCHAR(64) PRIMARY KEY,
        label VARCHAR(255) NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS kpi_group_member (
        kpi_group_code VARCHAR(64) NOT NULL REFERENCES kpi_group(code),
        domain_code VARCHAR(64) NOT NULL REFERENCES domain_catalog(code),
        PRIMARY KEY (kpi_group_code, domain_code)
    )
    """,
    # Target per group/year
    """
    CREATE TABLE IF NOT EXISTS kpi_group_targets (
        id SERIAL PRIMARY KEY,
        reporting_year INTEGER NOT NULL,
        kpi_group_code VARCHAR(64) NOT NULL REFERENCES kpi_group(code),
        target_amount_before_tax BIGINT NOT NULL CHECK (target_amount_before_tax >= 0),
        note TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by_user_id INTEGER,
        updated_by_user_id INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (reporting_year, kpi_group_code)
    )
    """,
    # Assignment per user/group/year (no target)
    """
    CREATE TABLE IF NOT EXISTS kpi_group_assignments (
        id SERIAL PRIMARY KEY,
        reporting_year INTEGER NOT NULL,
        kpi_group_code VARCHAR(64) NOT NULL REFERENCES kpi_group(code),
        user_id INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        assigned_by_user_id INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (reporting_year, kpi_group_code, user_id)
    )
    """,
    # Quarantine table for unknown domains
    """
    CREATE TABLE IF NOT EXISTS contract_quarantine (
        id SERIAL PRIMARY KEY,
        contract_id INTEGER NOT NULL,
        reason VARCHAR(64) NOT NULL,
        raw_domain VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """,
]


def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()
    for sql in DDL:
        cur.execute(sql)
    print("DDL applied.")

    # Verify
    cur.execute("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_name IN
          ('kpi_field_assignments','annual_kpi_targets','domain_catalog',
           'domain_alias','kpi_group','kpi_group_member','kpi_group_targets',
           'kpi_group_assignments','contract_quarantine')
        ORDER BY table_name
    """)
    print("Created tables:", [r[0] for r in cur.fetchall()])
    conn.close()


if __name__ == "__main__":
    main()