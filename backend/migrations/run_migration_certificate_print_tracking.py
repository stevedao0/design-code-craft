#!/usr/bin/env python
"""Migration: Add official print tracking + print log table to certificate_records.

Adds nullable columns to certificate_records for improved print tracking:
- last_printed_at         -- datetime of the latest print (replaces printed_at as "first print")
- last_print_file         -- path to the most recently generated file
- last_printed_by         -- username of the latest print
- last_print_reason       -- reason for reprinting (if any)

Creates a new print log table certificate_print_logs:
- Each official print / reprint creates one log entry
- Full history of all print events is preserved

Safe: all columns nullable, no data changes, no NOT NULL constraints.
"""
import sys
from pathlib import Path

_script_dir = Path(__file__).parent.resolve()
_backend_dir = _script_dir.parent

sys.path.insert(0, str(_backend_dir))
import os
os.chdir(str(_backend_dir))

from sqlalchemy import text
from app.core.database import engine


def run_migration():
    print("=" * 60)
    print("Migration: Add official print tracking + print log table")
    print("=" * 60)
    print()

    statements = [
        # ── certificate_records: add print tracking columns ──────────────────
        # last_printed_at: mirrors printed_at for first print, updated for every reprint
        ("certificate_records", "last_printed_at", "TIMESTAMP NULL"),
        ("certificate_records", "last_print_file", "VARCHAR(512) NULL"),
        ("certificate_records", "last_printed_by", "VARCHAR(255) NULL"),
        ("certificate_records", "last_print_reason", "VARCHAR(512) NULL"),
    ]

    # ── certificate_print_logs table ───────────────────────────────────────
    create_log_table = """
    CREATE TABLE IF NOT EXISTS certificate_print_logs (
        id                       SERIAL PRIMARY KEY,
        certificate_id           INTEGER NOT NULL,
        contract_id              INTEGER,
        certificate_no           VARCHAR(128),
        print_no                 INTEGER NOT NULL DEFAULT 1,
        print_type              VARCHAR(32) NOT NULL DEFAULT 'official',
        printed_at              TIMESTAMP NOT NULL DEFAULT NOW(),
        printed_by              VARCHAR(255),
        file_path               VARCHAR(512),
        reason                  VARCHAR(512),
        created_at              TIMESTAMP NOT NULL DEFAULT NOW()
    );
    """
    create_log_comment = """
    COMMENT ON TABLE certificate_print_logs IS
        'Audit log for each certificate print/reprint event.';
    """
    create_log_fk = """
    ALTER TABLE certificate_print_logs
        ADD CONSTRAINT IF NOT EXISTS certificate_print_logs_cert_fk
        FOREIGN KEY (certificate_id)
        REFERENCES certificate_records(certificate_id)
        ON DELETE CASCADE;
    """

    try:
        with engine.connect() as conn:
            # Add columns
            for table, column, coltype in statements:
                stmt = f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {coltype}'
                print(f"  Adding: {table}.{column}")
                conn.execute(text(stmt))

            # Create log table
            print("  Creating: certificate_print_logs")
            conn.execute(text(create_log_table))
            conn.execute(text(create_log_comment))

            # Add FK constraint (ignore if already exists)
            try:
                conn.execute(text(create_log_fk))
                print("  FK added: certificate_print_logs.certificate_id -> certificate_records")
            except Exception:
                print("  FK constraint already exists (OK)")

            conn.commit()

        print()
        print("[OK] Migration completed successfully!")
        print()
        print("Added columns to certificate_records:")
        for _, col, _ in statements:
            print(f"  - {col}")
        print("Created table: certificate_print_logs")
        return True

    except Exception as e:
        print()
        print(f"[ERROR] Migration failed: {e}")
        return False


if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)
