"""
Run once: add tracking fields to existing dispatch tables.
Safe — all new columns have defaults or are nullable.
Requires: psycopg2
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from urllib.parse import urlparse

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(_BACKEND_ROOT / ".env", override=True)

DB_URL = os.getenv("DATABASE_URL", "")
assert DB_URL, "DATABASE_URL not set"

conn_cfg = urlparse(DB_URL)

BATCH_ADD = [
    ("create_envelope",          "ADD COLUMN IF NOT EXISTS create_envelope BOOLEAN NOT NULL DEFAULT FALSE"),
    ("merge_output",             "ADD COLUMN IF NOT EXISTS merge_output BOOLEAN NOT NULL DEFAULT TRUE"),
    ("envelope_recipient_mode",  "ADD COLUMN IF NOT EXISTS envelope_recipient_mode VARCHAR(32) NULL"),
    ("envelope_custom_prefix",   "ADD COLUMN IF NOT EXISTS envelope_custom_prefix VARCHAR(64) NULL"),
    ("ready_items",              "ADD COLUMN IF NOT EXISTS ready_items INTEGER NOT NULL DEFAULT 0"),
    ("missing_items",            "ADD COLUMN IF NOT EXISTS missing_items INTEGER NOT NULL DEFAULT 0"),
]

BATCH_IDX = [
    "CREATE INDEX IF NOT EXISTS ix_bg_congvan_batches_dispatch_type ON bg_congvan_batches (dispatch_type)",
    "CREATE INDEX IF NOT EXISTS ix_bg_congvan_batches_cong_van_no ON bg_congvan_batches (cong_van_no)",
]

ITEM_ADD = [
    ("lan_gui",                  "ADD COLUMN IF NOT EXISTS lan_gui INTEGER NOT NULL DEFAULT 1"),
    ("dong_nguoi_nhan_bia_thu",  "ADD COLUMN IF NOT EXISTS dong_nguoi_nhan_bia_thu TEXT NULL"),
    ("trang_thai_lien_he",       "ADD COLUMN IF NOT EXISTS trang_thai_lien_he VARCHAR(32) NOT NULL DEFAULT 'DA_GUI_CONG_VAN'"),
    ("ngay_lien_he_gan_nhat",    "ADD COLUMN IF NOT EXISTS ngay_lien_he_gan_nhat TIMESTAMP NULL"),
    ("ghi_chu_lien_he",          "ADD COLUMN IF NOT EXISTS ghi_chu_lien_he TEXT NULL"),
    ("trang_thai_hop_dong",      "ADD COLUMN IF NOT EXISTS trang_thai_hop_dong VARCHAR(32) NOT NULL DEFAULT 'CHUA_KY_HOP_DONG'"),
]

ITEM_IDX = [
    "CREATE INDEX IF NOT EXISTS ix_bg_congvan_trang_thai_lien_he ON bg_congvan (trang_thai_lien_he)",
    "CREATE INDEX IF NOT EXISTS ix_bg_congvan_trang_thai_hop_dong ON bg_congvan (trang_thai_hop_dong)",
]


def run():
    try:
        import psycopg2
    except ImportError:
        try:
            import psycopg2_binary as psycopg2
        except ImportError:
            print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
            return

    dbname = conn_cfg.path.lstrip("/")
    user = conn_cfg.username
    password = conn_cfg.password
    host = conn_cfg.hostname or "localhost"
    port = conn_cfg.port or "5432"

    print(f"Connecting to PostgreSQL {host}:{port}/{dbname} ...")
    conn = psycopg2.connect(
        host=host, port=port, dbname=dbname,
        user=user, password=password,
    )
    conn.autocommit = True
    cur = conn.cursor()

    # Batch table
    print("\n[bg_congvan_batches]")
    for col_name, ddl in BATCH_ADD:
        try:
            cur.execute(f"ALTER TABLE bg_congvan_batches {ddl}")
            print(f"  OK: {col_name}")
        except Exception as ex:
            print(f"  SKIP: {col_name} — {ex}")

    for ddl in BATCH_IDX:
        try:
            cur.execute(ddl)
            print(f"  OK: index created")
        except Exception as ex:
            print(f"  SKIP index — {ex}")

    # Item table
    print("\n[bg_congvan]")
    for col_name, ddl in ITEM_ADD:
        try:
            cur.execute(f"ALTER TABLE bg_congvan {ddl}")
            print(f"  OK: {col_name}")
        except Exception as ex:
            print(f"  SKIP: {col_name} — {ex}")

    for ddl in ITEM_IDX:
        try:
            cur.execute(ddl)
            print(f"  OK: index created")
        except Exception as ex:
            print(f"  SKIP index — {ex}")

    cur.close()
    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    run()
