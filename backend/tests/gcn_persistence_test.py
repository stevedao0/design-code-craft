#!/usr/bin/env python
"""
GCN Persistence Tests A/B/C/D after clone guard removal.
Run AFTER restarting backend to pick up new .env settings.

Usage:
  1. Restart backend: taskkill + start, or Ctrl+C + uvicorn
  2. python F:\APPs\backend\tests\gcn_persistence_test.py

This tests the GCN flow on MAIN DB (port 5432) now that:
  - assert_clone_db_target is a no-op
  - ASSIGN_CERTIFICATE_NUMBER_ENABLED=true
  - start_database_guard has no port restrictions
"""
import os
import sys
import json
from datetime import datetime

os.chdir(os.path.dirname(os.path.abspath(__file__)) or "F:/APPs/backend")
sys.path.insert(0, "F:/APPs/backend")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ── DB helpers ──────────────────────────────────────────────────────────────
from dotenv import load_dotenv
load_dotenv("F:/APPs/backend/.env", override=True)
from sqlalchemy import create_engine, text

def _db_engine():
    return create_engine(os.getenv("DATABASE_URL", ""))


def get_cert_db(cert_id: int) -> dict:
    with _db_engine().connect() as conn:
        row = conn.execute(text(
            "SELECT certificate_id, certificate_no, status, print_count, printed_at, "
            "last_printed_at, last_print_file, last_printed_by, last_print_reason "
            "FROM certificate_records WHERE certificate_id = :id"
        ), {"id": cert_id}).fetchone()
        return dict(row._mapping) if row else {}


def log_count_cert(cert_id: int) -> int:
    with _db_engine().connect() as conn:
        return conn.execute(text(
            "SELECT count(*) FROM certificate_print_logs WHERE certificate_id = :id"
        ), {"id": cert_id}).scalar_one()


def find_cert_without_number() -> int | None:
    with _db_engine().connect() as conn:
        row = conn.execute(text(
            "SELECT certificate_id FROM certificate_records "
            "WHERE (certificate_no IS NULL OR certificate_no = '') "
            "AND status != 'final_printed' AND print_count = 0 "
            "LIMIT 1"
        )).fetchone()
        return row[0] if row else None


def find_cert_with_number_not_printed() -> int | None:
    with _db_engine().connect() as conn:
        row = conn.execute(text(
            "SELECT certificate_id FROM certificate_records "
            "WHERE (certificate_no IS NOT NULL AND certificate_no != '') "
            "AND status != 'final_printed' AND print_count = 0 "
            "LIMIT 1"
        )).fetchone()
        return row[0] if row else None


# ── HTTP helpers ─────────────────────────────────────────────────────────────
BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:8000")

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False


def get_token() -> str | None:
    """Try to get auth token. May fail if dev auth still blocks port 5432."""
    if not HAS_REQUESTS:
        return None
    try:
        resp = requests.post(
            f"{BASE_URL}/api/dev/auth-token",
            json={"username": "tuan.dpa@vcpmc.org", "password": "dev"},
            timeout=10,
        )
        if resp.ok:
            return resp.json()["access_token"]
        print(f"  [WARN] Auth failed {resp.status_code}: {resp.text[:200]}")
        return None
    except Exception as e:
        print(f"  [WARN] Auth error: {e}")
        return None


def api_call(method: str, path: str, token: str, json_body=None) -> tuple[int, dict]:
    if not HAS_REQUESTS:
        return (0, {})
    import requests
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        resp = requests.request(method, f"{BASE_URL}{path}", headers=headers, json=json_body, timeout=15)
        try:
            return (resp.status_code, resp.json())
        except Exception:
            return (resp.status_code, {"raw": resp.text[:300]})
    except Exception as e:
        return (0, {"error": str(e)})


# ── Run tests ───────────────────────────────────────────────────────────────
def run_tests():
    print("=" * 60)
    print("  GCN Persistence Tests — Main DB (Port 5432)")
    print("=" * 60)
    print(f"  BASE_URL: {BASE_URL}")

    # Verify DB
    with _db_engine().connect() as conn:
        db = conn.execute(text("select current_database(), inet_server_port()")).fetchone()
        print(f"  Database: {db[0]}, port: {db[1]}")
        print(f"  ASSIGN_CERTIFICATE_NUMBER_ENABLED: {os.getenv('ASSIGN_CERTIFICATE_NUMBER_ENABLED')}")
        print()

    token = get_token()
    if not token:
        print("[ERROR] Cannot get auth token. Backend may not be restarted yet.")
        print("        Restart backend with new .env, then run this script again.")
        return

    print(f"[OK] Auth token obtained")

    # ── TEST A ──────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  TEST A: Save Certificate Number")
    print("=" * 60)
    cert_id_a = find_cert_without_number()
    if cert_id_a is None:
        print("  [SKIP] No cert without number found")
        test_a_pass = None
    else:
        db_before = get_cert_db(cert_id_a)
        test_number = f"TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        print(f"  cert_id: {cert_id_a}")
        print(f"  Assigning: {test_number}")
        status, resp = api_call("PUT", f"/api/certificates/{cert_id_a}/number", token,
                                 json_body={"certificate_no": test_number})
        print(f"  PUT /api/certificates/{cert_id_a}/number → {status}")
        print(f"  Response: {json.dumps(resp, ensure_ascii=False)[:400]}")
        db_after = get_cert_db(cert_id_a)
        actual = db_after.get("certificate_no")
        test_a_pass = actual == test_number
        print(f"  DB certificate_no: {actual!r} (expected: {test_number!r})")
        print(f"  TEST A: {'PASS' if test_a_pass else 'FAIL'}")

    # ── TEST B ──────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  TEST B: Official Print — First Print")
    print("=" * 60)
    if test_a_pass:
        cert_id_b = cert_id_a
    else:
        cert_id_b = find_cert_with_number_not_printed()
    if cert_id_b is None:
        print("  [SKIP] No cert with number not yet printed")
        test_b_pass = None
    else:
        log_before = log_count_cert(cert_id_b)
        db_before = get_cert_db(cert_id_b)
        print(f"  cert_id: {cert_id_b}")
        print(f"  certificate_no: {db_before.get('certificate_no')!r}")
        print(f"  print_count before: {db_before.get('print_count')}")
        status, resp = api_call("POST", f"/api/certificates/{cert_id_b}/print", token, json_body={})
        print(f"  POST /api/certificates/{cert_id_b}/print → {status}")
        print(f"  Response: {json.dumps(resp, ensure_ascii=False)[:500]}")
        db_after = get_cert_db(cert_id_b)
        log_after = log_count_cert(cert_id_b)
        test_b_pass = (
            status == 200
            and db_after.get("status") == "final_printed"
            and (db_after.get("print_count") or 0) >= 1
            and db_after.get("last_printed_at") is not None
            and log_after > log_before
        )
        print(f"  status: {db_after.get('status')}")
        print(f"  print_count: {db_after.get('print_count')}")
        print(f"  last_printed_at: {db_after.get('last_printed_at')}")
        print(f"  last_print_file: {db_after.get('last_print_file')}")
        print(f"  log count: {log_before} → {log_after}")
        print(f"  TEST B: {'PASS' if test_b_pass else 'FAIL'}")

    # ── TEST C ──────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  TEST C: Reprint")
    print("=" * 60)
    cert_id_c = cert_id_b if test_b_pass else None
    if cert_id_c is None:
        print("  [SKIP]")
        test_c_pass = None
    else:
        log_before = log_count_cert(cert_id_c)
        db_before = get_cert_db(cert_id_c)
        pc_before = db_before.get("print_count") or 0
        lpa_before = db_before.get("last_printed_at")
        lpf_before = db_before.get("last_print_file")
        print(f"  cert_id: {cert_id_c}")
        print(f"  print_count before: {pc_before}")
        status, resp = api_call("POST", f"/api/certificates/{cert_id_c}/print", token,
                                 json_body={"reason": "Test in lai kiem tra persistence"})
        print(f"  POST /api/certificates/{cert_id_c}/print → {status}")
        print(f"  Response: {json.dumps(resp, ensure_ascii=False)[:400]}")
        db_after = get_cert_db(cert_id_c)
        log_after = log_count_cert(cert_id_c)
        pc_after = db_after.get("print_count") or 0
        lpa_after = db_after.get("last_printed_at")
        lpf_after = db_after.get("last_print_file")
        test_c_pass = (
            status == 200
            and pc_after == pc_before + 1
            and lpa_after != lpa_before
            and lpf_after != lpf_before
            and log_after == log_before + 1
        )
        print(f"  print_count: {pc_before} → {pc_after}")
        print(f"  last_printed_at: {lpa_before} → {lpa_after}")
        print(f"  last_print_file: {lpf_before!r} → {lpf_after!r}")
        print(f"  log count: {log_before} → {log_after}")
        print(f"  TEST C: {'PASS' if test_c_pass else 'FAIL'}")

    # ── TEST D ──────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  TEST D: Block Print Without Number")
    print("=" * 60)
    cert_id_d = find_cert_without_number()
    if cert_id_d is None:
        print("  [SKIP] No cert without number")
        test_d_pass = True
    else:
        log_before = log_count_cert(cert_id_d)
        db_before = get_cert_db(cert_id_d)
        print(f"  cert_id: {cert_id_d}")
        print(f"  certificate_no: {db_before.get('certificate_no')!r}")
        status, resp = api_call("POST", f"/api/certificates/{cert_id_d}/print", token, json_body={})
        print(f"  POST /api/certificates/{cert_id_d}/print → {status}")
        print(f"  Response: {json.dumps(resp, ensure_ascii=False)[:300]}")
        db_after = get_cert_db(cert_id_d)
        log_after = log_count_cert(cert_id_d)
        unchanged = db_before.get("print_count") == db_after.get("print_count") and log_before == log_after
        blocked = status >= 400 or resp.get("mode") == "no_certificate_number"
        test_d_pass = blocked and unchanged
        print(f"  Blocked: {blocked}, DB unchanged: {unchanged}")
        print(f"  TEST D: {'PASS' if test_d_pass else 'FAIL'}")

    # ── Summary ──────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  SUMMARY")
    print("=" * 60)
    for name, result in [("A (Save number)", test_a_pass), ("B (First print)", test_b_pass),
                          ("C (Reprint)", test_c_pass), ("D (Block)", test_d_pass)]:
        label = "PASS" if result else ("FAIL" if result is False else "SKIP")
        print(f"  Test {name}: {label}")
    all_pass = all(r is True for r in [test_a_pass, test_b_pass, test_c_pass, test_d_pass] if r is not None)
    print(f"\n  OVERALL: {'ALL PASS' if all_pass else 'SOME FAILED'}")

    # ── Cleanup: restore test data ───────────────────────────────────────────
    if test_a_pass and cert_id_a:
        print("\n[INFO] Cleaning up test certificate number...")
        with _db_engine().connect() as conn:
            conn.execute(text(
                "UPDATE certificate_records SET certificate_no = NULL, status = 'draft', "
                "updated_at = NOW() WHERE certificate_id = :id"
            ), {"id": cert_id_a})
            conn.commit()
        print(f"[INFO] certificate_no cleared for cert_id={cert_id_a}")
    if test_b_pass and cert_id_b:
        print("[INFO] Cleaning up print data for Test B...")
        with _db_engine().connect() as conn:
            conn.execute(text(
                "UPDATE certificate_records SET status = 'draft', print_count = 0, "
                "printed_at = NULL, last_printed_at = NULL, last_print_file = NULL, "
                "last_print_reason = NULL WHERE certificate_id = :id"
            ), {"id": cert_id_b})
            conn.execute(text(
                "DELETE FROM certificate_print_logs WHERE certificate_id = :id"
            ), {"id": cert_id_b})
            conn.commit()
        print(f"[INFO] Print data cleared for cert_id={cert_id_b}")


if __name__ == "__main__":
    run_tests()
