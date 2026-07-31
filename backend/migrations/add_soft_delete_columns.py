"""
Idempotent migration: add soft delete columns to bg_congvan_batches and bg_congvan.
Safe - ADD COLUMN IF NOT EXISTS, no data wipe, no destructive operations.
"""
import os, sys
from pathlib import Path
from dotenv import load_dotenv

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(_BACKEND_ROOT / ".env", override=True)

DB_URL = os.getenv("DATABASE_URL", "")
parts = DB_URL.replace("postgresql://", "").split(":")
user = parts[0]
password = parts[1].split("@")[0]

import psycopg2

conn = psycopg2.connect(
    host="localhost", port=5432, dbname="vcpmc_contract",
    user=user, password=password
)
conn.autocommit = True
cur = conn.cursor()

print("=" * 60)
print("SOFT DELETE COLUMNS MIGRATION")
print("=" * 60)

# --- bg_congvan_batches ---
print("\n[bg_congvan_batches]")
for col, coltype in [
    ("deleted_at",   "TIMESTAMP NULL"),
    ("deleted_by",   "VARCHAR(255) NULL"),
    ("delete_reason","TEXT NULL"),
]:
    try:
        cur.execute(f'ALTER TABLE bg_congvan_batches ADD COLUMN IF NOT EXISTS {col} {coltype}')
        print(f"  OK: {col} {coltype} (or already exists)")
    except Exception as ex:
        print(f"  SKIP: {col} - {ex}")

# --- bg_congvan ---
print("\n[bg_congvan]")
for col, coltype in [
    ("deleted_at",   "TIMESTAMP NULL"),
    ("deleted_by",   "VARCHAR(255) NULL"),
    ("delete_reason","TEXT NULL"),
]:
    try:
        cur.execute(f'ALTER TABLE bg_congvan ADD COLUMN IF NOT EXISTS {col} {coltype}')
        print(f"  OK: {col} {coltype} (or already exists)")
    except Exception as ex:
        print(f"  SKIP: {col} - {ex}")

cur.close()
conn.close()
print("\nDone.")
