#!/usr/bin/env python
"""Migration: Add dispatch tracking columns to bg_congvan and bg_congvan_batches.

This script adds 4 nullable columns:
- bg_congvan.dispatch_type        -- tracks if this is renewal_reminder / expired / etc.
- bg_congvan.attempt_no          -- tracks which reminder attempt (1st, 2nd, 3rd) per contract
- bg_congvan_batches.dispatch_type
- bg_congvan_batches.template_name -- stores which template was used (e.g. cong van_tai ky_karaoke.docx)

Safe: all columns are nullable, no data changes, no NOT NULL constraints.
"""
import sys
from pathlib import Path

_script_dir = Path(__file__).parent.resolve()   # F:\APPs\backend\migrations
_backend_dir = _script_dir.parent               # F:\APPs\backend

sys.path.insert(0, str(_backend_dir))
import os
os.chdir(str(_backend_dir))

from sqlalchemy import text
from app.core.database import engine


def run_migration():
    print("=" * 60)
    print("Migration: Add dispatch tracking columns")
    print("=" * 60)
    print()

    migration_statements = [
        # bg_congvan
        ("bg_congvan", "dispatch_type", "VARCHAR(64)"),
        ("bg_congvan", "attempt_no",     "INTEGER"),
        # bg_congvan_batches
        ("bg_congvan_batches", "dispatch_type",  "VARCHAR(64)"),
        ("bg_congvan_batches", "template_name",   "VARCHAR(255)"),
    ]

    try:
        with engine.connect() as conn:
            for table, column, coltype in migration_statements:
                stmt = f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {coltype} NULL"
                print(f"  Executing: {stmt}")
                conn.execute(text(stmt))
            conn.commit()
            print()
            print("[OK] Migration completed successfully!")
            print()
            for table, column, _ in migration_statements:
                print(f"  Added: {table}.{column}")
            return True
    except Exception as e:
        print()
        print(f"[ERROR] Migration failed: {e}")
        return False


if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)
