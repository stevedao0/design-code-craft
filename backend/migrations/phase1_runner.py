"""Idempotent migration runner for Phase 1 KPI work.

Applies every migration once in lexical order against the DB given by
``DATABASE_URL``. Each migration is itself idempotent — its own
``upgrade()`` short-circuits when ``schema_migrations`` already lists
its tag — so re-running the whole sequence is safe.

Usage:
    DATABASE_URL=... python -m backend.migrations.phase1_runner upgrade
    DATABASE_URL=... python -m backend.migrations.phase1_runner downgrade
    DATABASE_URL=... python -m backend.migrations.phase1_runner status
"""
import importlib
import sys

from .phase1_lib import connect, ensure_history


MIGRATIONS = [
    ("phase1_00_fixture_schema", "phase1_00_fixture_schema"),
    ("phase1_00b_seed_fixture",  "phase1_00b_seed_fixture"),
    ("phase1_02a_seed_registry", "phase1_02a_seed_registry"),
    ("phase1_02_migrate_targets", "phase1_02_migrate_targets"),
]


def _import(tag):
    return importlib.import_module(f"backend.migrations.{tag}")


def upgrade():
    for tag, modname in MIGRATIONS:
        mod = _import(modname)
        mod.upgrade()


def downgrade():
    for tag, modname in reversed(MIGRATIONS):
        mod = _import(modname)
        try:
            mod.downgrade()
        except Exception as exc:
            print(f"WARN: downgrade of {tag} failed: {exc}")


def status():
    conn = connect()
    conn.autocommit = False
    cur = conn.cursor()
    try:
        ensure_history(cur)
        conn.commit()
        cur.execute("SELECT tag, applied_at FROM schema_migrations ORDER BY applied_at")
        rows = cur.fetchall()
        if not rows:
            print("(no migrations applied)")
        else:
            for tag, ts in rows:
                print(f"{ts.isoformat()}\t{tag}")
    finally:
        conn.close()


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("upgrade", "downgrade", "status"):
        sys.stderr.write("usage: phase1_runner {upgrade|downgrade|status}\n")
        sys.exit(1)
    cmd = sys.argv[1]
    if cmd == "upgrade":
        upgrade()
    elif cmd == "downgrade":
        downgrade()
    else:
        status()


if __name__ == "__main__":
    main()
