"""
Phase 1.0 fixture: create source-schema (legacy) tables on disposable DB.

This is an upgrade revision of the V1 KPI source-schema fixture. It is
idempotent: every CREATE uses IF NOT EXISTS. It only creates a
schema skeleton; the actual data is owned by the versioned seed
fixture (``phase1_seed_*.py``).

Connection details are read from environment so credentials never
land in source. Required:
  - DATABASE_URL (full libpq URL)

Run from project root:
    DATABASE_URL=... python -m backend.migrations.phase1_00_fixture_schema upgrade
    DATABASE_URL=... python -m backend.migrations.phase1_00_fixture_schema downgrade
"""
import os
import sys
import psycopg2


DB_URL = os.environ.get("DATABASE_URL", "").strip()
if not DB_URL:
    sys.stderr.write(
        "FATAL: DATABASE_URL is not set. "
        "Provide a libpq URL via environment, e.g. "
        "export DATABASE_URL=postgresql://user:pass@host:port/dbname\n"
    )
    sys.exit(2)


HIST_TAG = "phase1_00_fixture_schema"


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
    # annual_kpi_targets: kept as orphan, untouched by migration
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
    # New canonical catalog for domains
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
    # KPI group registry
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
    # Assignment per user/group/year (target NULL — only link)
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
    # Quarantine for unknown/unresolved domains
    """
    CREATE TABLE IF NOT EXISTS contract_quarantine (
        id SERIAL PRIMARY KEY,
        contract_id INTEGER NOT NULL,
        reason VARCHAR(64) NOT NULL,
        raw_domain VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """,
    # Migration history
    """
    CREATE TABLE IF NOT EXISTS schema_migrations (
        tag VARCHAR(128) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """,
]


DROP_ORDER = [
    "contract_quarantine",
    "kpi_group_assignments",
    "kpi_group_targets",
    "kpi_group_member",
    "kpi_group",
    "domain_alias",
    "domain_catalog",
    "annual_kpi_targets",
    "kpi_field_assignments",
]


def _connect():
    return psycopg2.connect(DB_URL)


def _mark_applied(cur, tag: str):
    cur.execute(
        "INSERT INTO schema_migrations (tag) VALUES (%s) ON CONFLICT (tag) DO NOTHING",
        (tag,),
    )


def _mark_reverted(cur, tag: str):
    cur.execute("DELETE FROM schema_migrations WHERE tag = %s", (tag,))


def upgrade():
    conn = _connect()
    conn.autocommit = False
    cur = conn.cursor()
    try:
        for sql in DDL:
            cur.execute(sql)
        _mark_applied(cur, HIST_TAG)
        conn.commit()
        print(f"upgrade {HIST_TAG} OK")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def downgrade():
    conn = _connect()
    conn.autocommit = False
    cur = conn.cursor()
    try:
        for tbl in DROP_ORDER:
            cur.execute(f"DROP TABLE IF EXISTS {tbl} CASCADE")
        _mark_reverted(cur, HIST_TAG)
        conn.commit()
        print(f"downgrade {HIST_TAG} OK")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("upgrade", "downgrade"):
        sys.stderr.write("usage: phase1_00_fixture_schema {upgrade|downgrade}\n")
        sys.exit(1)
    if sys.argv[1] == "upgrade":
        upgrade()
    else:
        downgrade()


if __name__ == "__main__":
    main()