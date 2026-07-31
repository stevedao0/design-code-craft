"""
Idempotent migration: add ngay_ky_hop_dong column to bg_congvan.
Safe - ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
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

print("Adding ngay_ky_hop_dong column to bg_congvan...")
try:
    cur.execute(
        "ALTER TABLE bg_congvan ADD COLUMN IF NOT EXISTS ngay_ky_hop_dong DATE NULL"
    )
    print("  OK: ngay_ky_hop_dong column added (or already exists)")
except Exception as ex:
    print("  SKIP:", ex)

try:
    cur.execute(
        "CREATE INDEX IF NOT EXISTS ix_bg_congvan_ngay_ky_hop_dong ON bg_congvan (ngay_ky_hop_dong)"
    )
    print("  OK: index created (or already exists)")
except Exception as ex:
    print("  SKIP index:", ex)

cur.close()
conn.close()
print("Done.")
