"""
Migrations common library — connection + history tracking.

DB URL is read from the ``DATABASE_URL`` environment variable. No
credential is ever embedded in source.
"""
import os
import sys
import psycopg2


def db_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        sys.stderr.write(
            "FATAL: DATABASE_URL is not set. "
            "Provide a libpq URL via environment, e.g. "
            "export DATABASE_URL=postgresql://user:pass@host:port/dbname\n"
        )
        sys.exit(2)
    return url


def connect():
    return psycopg2.connect(db_url())


def ensure_history(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            tag VARCHAR(128) PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )


def is_applied(cur, tag: str) -> bool:
    cur.execute("SELECT 1 FROM schema_migrations WHERE tag = %s", (tag,))
    return cur.fetchone() is not None


def mark_applied(cur, tag: str) -> None:
    cur.execute(
        "INSERT INTO schema_migrations (tag) VALUES (%s) ON CONFLICT (tag) DO NOTHING",
        (tag,),
    )


def mark_reverted(cur, tag: str) -> None:
    cur.execute("DELETE FROM schema_migrations WHERE tag = %s", (tag,))
