#!/usr/bin/env python
"""Run migration to add contract_template_code column.

This script connects to the database and adds the contract_template_code column
to the contract_records table.
"""
import sys
from pathlib import Path

# Get the backend directory correctly
_script_dir = Path(__file__).parent.resolve()  # F:\APPs\backend\migrations
_backend_dir = _script_dir.parent  # F:\APPs\backend

# Change to backend directory so app module can be found
sys.path.insert(0, str(_backend_dir))
import os
os.chdir(str(_backend_dir))

from sqlalchemy import text
from app.core.database import engine


def run_migration():
    """Run the migration."""
    print("=" * 60)
    print("Migration: Add contract_template_code column")
    print("=" * 60)
    print()

    migration_statements = [
        "ALTER TABLE contract_records ADD COLUMN IF NOT EXISTS contract_template_code VARCHAR(32)",
        "COMMENT ON COLUMN contract_records.contract_template_code IS 'Export template selection: TEMPLATE_1 or TEMPLATE_2 for Background contracts'",
    ]

    try:
        with engine.connect() as conn:
            # Execute each statement separately
            for stmt in migration_statements:
                print(f"Executing: {stmt[:60]}...")
                conn.execute(text(stmt))
            conn.commit()
            print()
            print("[OK] Migration completed successfully!")
            print()
            print("Column contract_template_code has been added to contract_records table.")
            return True
    except Exception as e:
        print()
        print(f"[ERROR] Migration failed: {e}")
        return False


if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)
