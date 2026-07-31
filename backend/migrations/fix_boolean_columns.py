import psycopg2, os
from dotenv import load_dotenv

import os

SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend root
DOTENV_PATH = os.path.join(SCRIPT_DIR, '.env')
load_dotenv(DOTENV_PATH)

DB_URL = os.getenv('DATABASE_URL', '')
parts = DB_URL.replace('postgresql://', '').split(':')
user = parts[0]
password = parts[1].split('@')[0]

conn = psycopg2.connect(
    host='localhost', port=5432, dbname='vcpmc_contract',
    user=user, password=password
)
conn.autocommit = True
cur = conn.cursor()

# Drop defaults first
cur.execute("ALTER TABLE bg_congvan_batches ALTER COLUMN create_envelope DROP DEFAULT")
print("Dropped default for create_envelope")
cur.execute("ALTER TABLE bg_congvan_batches ALTER COLUMN merge_output DROP DEFAULT")
print("Dropped default for merge_output")

# Cast INTEGER to BOOLEAN
cur.execute(
    "ALTER TABLE bg_congvan_batches ALTER COLUMN create_envelope TYPE BOOLEAN "
    "USING CASE WHEN create_envelope::int <> 0 THEN TRUE ELSE FALSE END"
)
print("create_envelope -> BOOLEAN OK")

cur.execute(
    "ALTER TABLE bg_congvan_batches ALTER COLUMN merge_output TYPE BOOLEAN "
    "USING CASE WHEN merge_output::int <> 0 THEN TRUE ELSE FALSE END"
)
print("merge_output -> BOOLEAN OK")

cur.close()
conn.close()
print("Done.")
