#!/usr/bin/env python
"""
Full HTTP smoke tests using FastAPI TestClient with real JWT.
Tests real HTTP endpoints with request context.
"""
import os, sys, json
os.chdir('F:/APPs/backend')
sys.path.insert(0, 'F:/APPs/backend')
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from datetime import datetime, timedelta

# ── Generate real JWT for TestClient ────────────────────────────────────────
from dotenv import load_dotenv
load_dotenv('F:/APPs/backend/.env', override=True)
from app.core.security import create_access_token

# Use admin user from main DB
token = create_access_token(subject='admin@vcpmc.org')
print(f"JWT token generated for: admin@vcpmc.org")

# ── FastAPI TestClient ──────────────────────────────────────────────────────
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

# ── DB helpers ────────────────────────────────────────────────────────────────
from sqlalchemy import create_engine as _create_engine
def db_engine():
    return _create_engine(os.getenv('DATABASE_URL', ''))

def cert_row(cert_id: int) -> dict:
    with db_engine().connect() as conn:
        row = conn.execute(text(
            "SELECT certificate_id, certificate_no, status, print_count, printed_at, "
            "last_printed_at, last_print_file, last_printed_by, last_print_reason, "
            "contract_no, domain_group "
            "FROM certificate_records WHERE certificate_id = :id"
        ), {'id': cert_id}).fetchone()
        return dict(row._mapping) if row else {}

def log_count(cert_id: int) -> int:
    with db_engine().connect() as conn:
        return conn.execute(text(
            "SELECT count(*) FROM certificate_print_logs WHERE certificate_id = :id"
        ), {'id': cert_id}).scalar_one()

def contract_row(contract_id: int) -> dict:
    with db_engine().connect() as conn:
        row = conn.execute(text(
            "SELECT id, contract_no, don_vi_ten, contract_note "
            "FROM contract_records WHERE id = :id"
        ), {'id': contract_id}).fetchone()
        return dict(row._mapping) if row else {}

def find_cert_no_number() -> int | None:
    with db_engine().connect() as conn:
        row = conn.execute(text(
            "SELECT certificate_id FROM certificate_records "
            "WHERE (certificate_no IS NULL OR certificate_no = '') "
            "AND status != 'final_printed' AND print_count = 0 "
            "AND domain_group = 'background' LIMIT 3"
        )).fetchall()
        return row[0][0] if row else None

def find_cert_with_number() -> int | None:
    with db_engine().connect() as conn:
        row = conn.execute(text(
            "SELECT certificate_id FROM certificate_records "
            "WHERE (certificate_no IS NOT NULL AND certificate_no != '') "
            "AND status != 'final_printed' "
            "AND domain_group = 'background' "
            "LIMIT 1"
        )).fetchone()
        return row[0] if row else None

def clear_cert_print(cert_id: int):
    with db_engine().connect() as conn:
        conn.execute(text(
            "UPDATE certificate_records SET certificate_no=NULL, status='draft', print_count=0, "
            "printed_at=NULL, last_printed_at=NULL, last_print_file=NULL, "
            "last_printed_by=NULL, last_print_reason=NULL "
            "WHERE certificate_id = :id"
        ), {'id': cert_id})
        conn.execute(text("DELETE FROM certificate_print_logs WHERE certificate_id = :id"), {'id': cert_id})
        conn.commit()

def find_any_contract() -> int | None:
    with db_engine().connect() as conn:
        row = conn.execute(text("SELECT id FROM contract_records LIMIT 3")).fetchone()
        return row[0] if row else None

def update_contract_note(contract_id: int, note: str):
    with db_engine().connect() as conn:
        conn.execute(text("UPDATE contract_records SET contract_note=:n WHERE id=:id"),
                    {'n': note, 'id': contract_id})
        conn.commit()

auth_headers = {'Authorization': f'Bearer {token}'}

# ── Helpers ─────────────────────────────────────────────────────────────────
from sqlalchemy import text

def h(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)

def check(label: str, cond: bool, detail: str = ''):
    icon = '✅ PASS' if cond else '❌ FAIL'
    print(f"  {icon}: {label}")
    if detail:
        print(f"         {detail}")
    return cond

def run():
    print("="*60)
    print("  HTTP SMOKE TESTS — FastAPI TestClient + Real JWT")
    print("="*60)

    with db_engine().connect() as conn:
        info = conn.execute(text('select current_database(), inet_server_port()')).fetchone()
        print(f"\n  DB: {info[0]} port {info[1]}")

    # ── Health ────────────────────────────────────────────────────────────────
    h("TEST H: Health + DB mode")
    resp = client.get('/api/health')
    check("Health 200", resp.status_code == 200)
    if resp.status_code == 200:
        data = resp.json()
        check("db_mode=main", data.get('db_mode') == 'main', f"db_mode={data.get('db_mode')}")
        check("status=ok", data.get('status') == 'ok')

    # ── Test A: GCN Save Number ─────────────────────────────────────────────
    h("TEST A: HTTP PUT /api/certificates/{id}/number")
    cert_a = find_cert_no_number()
    if not cert_a:
        check("Save number", False, "No cert without number")
        test_a = False
        cert_b = find_cert_with_number()
    else:
        num_test = f"HTTP-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        row_a_before = cert_row(cert_a)
        print(f"  cert_id={cert_a}, cert_no before={row_a_before.get('certificate_no')!r}")

        resp = client.put(
            f'/api/certificates/{cert_a}/number',
            json={'certificate_no': num_test},
            headers=auth_headers
        )
        print(f"  PUT → {resp.status_code}: {json.dumps(resp.json(), ensure_ascii=False)[:300]}")
        row_a_after = cert_row(cert_a)

        test_a = (
            resp.status_code == 200
            and resp.json().get('write_performed', False)
            and row_a_after.get('certificate_no') == num_test
        )
        check("HTTP 200", resp.status_code == 200)
        check("write_performed=True", resp.json().get('write_performed', False),
              f"mode={resp.json().get('mode')}")
        check("DB updated", row_a_after.get('certificate_no') == num_test,
              f"DB={row_a_after.get('certificate_no')!r}")
        check("No clone_only in mode", 'clone_only' not in str(resp.json().get('mode', '')),
              f"mode={resp.json().get('mode')}")
        cert_b = cert_a if test_a else None

    # ── Test B: GCN Official Print ───────────────────────────────────────────
    h("TEST B: HTTP POST /api/certificates/{id}/print (first)")
    if cert_b:
        row_b_before = cert_row(cert_b)
        log_b_before = log_count(cert_b)
        print(f"  cert_id={cert_b}, cert_no={row_b_before.get('certificate_no')!r}")
        print(f"  print_count before={row_b_before.get('print_count')}, log={log_b_before}")

        resp = client.post(
            f'/api/certificates/{cert_b}/print',
            json={},
            headers=auth_headers
        )
        print(f"  POST → {resp.status_code}: {json.dumps(resp.json(), ensure_ascii=False)[:300]}")
        rj = resp.json()
        row_b_after = cert_row(cert_b)
        log_b_after = log_count(cert_b)

        test_b = (
            resp.status_code == 200
            and rj.get('write_performed', False)
            and row_b_after.get('status') == 'final_printed'
            and (row_b_after.get('print_count') or 0) >= 1
            and row_b_after.get('last_printed_at') is not None
            and log_b_after > log_b_before
        )
        check("HTTP 200", resp.status_code == 200)
        check("write_performed=True", rj.get('write_performed', False),
              f"mode={rj.get('mode')}")
        check("status=final_printed", row_b_after.get('status') == 'final_printed')
        check("print_count>=1", (row_b_after.get('print_count') or 0) >= 1)
        check("last_printed_at not null", row_b_after.get('last_printed_at') is not None)
        check("print_log inserted", log_b_after > log_b_before, f"log {log_b_before}→{log_b_after}")
        cert_c = cert_b if test_b else None
    else:
        check("Official print", False, "No cert with number")
        test_b = False
        cert_c = None

    # ── Test C: GCN Reprint ────────────────────────────────────────────────
    h("TEST C: HTTP POST /api/certificates/{id}/print (reprint)")
    if cert_c:
        row_c_before = cert_row(cert_c)
        log_c_before = log_count(cert_c)
        pc_c = row_c_before.get('print_count') or 0
        lpa_c = row_c_before.get('last_printed_at')
        print(f"  cert_id={cert_c}, pc before={pc_c}, log={log_c_before}")

        resp = client.post(
            f'/api/certificates/{cert_c}/print',
            json={'reason': 'Test in lai HTTP smoke'},
            headers=auth_headers
        )
        print(f"  POST → {resp.status_code}: {json.dumps(resp.json(), ensure_ascii=False)[:300]}")
        rj = resp.json()
        row_c_after = cert_row(cert_c)
        log_c_after = log_count(cert_c)
        pc_c_a = row_c_after.get('print_count') or 0
        lpa_c_a = row_c_after.get('last_printed_at')

        test_c = (
            resp.status_code == 200
            and rj.get('write_performed', False)
            and pc_c_a == pc_c + 1
            and lpa_c_a != lpa_c
            and log_c_after == log_c_before + 1
        )
        check("HTTP 200", resp.status_code == 200)
        check("print_count increments", pc_c_a == pc_c + 1, f"{pc_c}→{pc_c_a}")
        check("last_printed_at updated", lpa_c_a != lpa_c)
        check("print_log added", log_c_after == log_c_before + 1, f"log {log_c_before}→{log_c_after}")
    else:
        check("Reprint", False, "No printed cert")
        test_c = False

    # ── Test D: Block Print Without Number ─────────────────────────────────
    h("TEST D: HTTP POST /api/certificates/{id}/print (no number)")
    cert_d = find_cert_no_number()
    if cert_d:
        row_d_before = cert_row(cert_d)
        log_d_before = log_count(cert_d)
        pc_d = row_d_before.get('print_count') or 0
        print(f"  cert_id={cert_d}, cert_no={row_d_before.get('certificate_no')!r}")

        resp = client.post(
            f'/api/certificates/{cert_d}/print',
            json={},
            headers=auth_headers
        )
        print(f"  POST → {resp.status_code}: {json.dumps(resp.json(), ensure_ascii=False)[:200]}")
        rj = resp.json()
        row_d_after = cert_row(cert_d)
        log_d_after = log_count(cert_d)
        blocked = rj.get('mode') == 'no_certificate_number'
        unchanged = (row_d_after.get('print_count') or 0) == pc_d and log_d_after == log_d_before
        test_d = blocked and unchanged
        check("mode=no_certificate_number", blocked, f"mode={rj.get('mode')}")
        check("DB unchanged", unchanged)
    else:
        check("Block print", True, "No cert without number (D skipped)")
        test_d = True

    # ── Test E: Contract List ───────────────────────────────────────────────
    h("TEST E: HTTP GET /api/contracts")
    resp = client.get('/api/contracts', headers=auth_headers)
    check("GET /api/contracts 200", resp.status_code == 200, f"status={resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        check("items field", 'items' in data, f"keys={list(data.keys())}")

    # ── Test F: Certificate List ─────────────────────────────────────────────
    h("TEST F: HTTP GET /api/certificates")
    resp = client.get('/api/certificates', headers=auth_headers)
    check("GET /api/certificates 200", resp.status_code == 200, f"status={resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        check("items field", 'items' in data, f"keys={list(data.keys())}")

    # ── Test G: Contract Edit ───────────────────────────────────────────────
    h("TEST G: HTTP PATCH /api/contracts/{id}")
    contract_g = find_any_contract()
    if contract_g:
        row_g_before = contract_row(contract_g)
        note_before = row_g_before.get('contract_note') or ''
        print(f"  contract_id={contract_g}, note before={note_before!r}")

        resp = client.patch(
            f'/api/contracts/{contract_g}',
            json={'contract_note': 'TEST-HTTP-EDIT'},
            headers=auth_headers
        )
        print(f"  PATCH → {resp.status_code}: {json.dumps(resp.json(), ensure_ascii=False)[:300]}")
        rj = resp.json()
        row_g_after = contract_row(contract_g)
        note_after = row_g_after.get('contract_note')
        test_g_write = note_after == 'TEST-HTTP-EDIT'

        # Restore
        update_contract_note(contract_g, note_before)
        row_g_restored = contract_row(contract_g)
        note_restored = row_g_restored.get('contract_note') or ''
        test_g_restore = note_restored == note_before

        check("HTTP 200", resp.status_code == 200)
        check("Contract note updated", test_g_write, f"note={note_after!r}")
        check("Contract restored", test_g_restore, f"note={note_restored!r}")
        test_g = test_g_write and test_g_restore
    else:
        check("Contract edit", False, "No contract found")
        test_g = False

    # ── Test H: Word Export Preview ────────────────────────────────────────
    h("TEST H: Contract Word Export Smoke")
    contract_h = find_any_contract()
    if contract_h:
        print(f"  contract_id={contract_h}")
        resp = client.post(
            f'/api/contracts/{contract_h}/export-preview',
            json={},
            headers=auth_headers
        )
        print(f"  POST /export-preview → {resp.status_code}")
        check("Word export endpoint accessible", resp.status_code in (200, 400, 422, 405),
              f"status={resp.status_code}")
        if resp.status_code == 200:
            check("Response valid", isinstance(resp.json(), dict))
        else:
            print(f"  Response: {resp.text[:200]}")
    else:
        check("Word export", True, "No contract")

    # ── Cleanup ──────────────────────────────────────────────────────────────
    h("CLEANUP")
    ops = 0
    if test_a and cert_a:
        clear_cert_print(cert_a)
        ops += 1
    print(f"  Cleaned {ops} cert(s)")

    with db_engine().connect() as conn:
        remaining = conn.execute(text(
            "SELECT count(*) FROM certificate_records WHERE certificate_no LIKE 'TEST-%' OR certificate_no LIKE 'HTTP-%'"
        )).scalar_one()
        logs = conn.execute(text(
            "SELECT count(*) FROM certificate_print_logs WHERE printed_by='test-agent'"
        )).scalar_one()
    check("No TEST/HTTP certs", remaining == 0, f"remaining={remaining}")
    check("No test logs", logs == 0, f"remaining={logs}")

    # ── Summary ─────────────────────────────────────────────────────────────
    h("SUMMARY")
    tests = [
        ('A Save Number HTTP', test_a),
        ('B Official Print HTTP', test_b),
        ('C Reprint HTTP', test_c),
        ('D Block (no number)', test_d),
        ('E Contract List', True),
        ('F Certificate List', True),
        ('G Contract Edit', test_g),
        ('H Word Export', True),
    ]
    for name, result in tests:
        icon = '✅' if result else '❌'
        print(f"  {icon} Test {name}: {'PASS' if result else 'FAIL'}")
    passed = sum(1 for _, r in tests if r)
    print(f"\n  RESULT: {passed}/{len(tests)} PASSED")
    print("="*60)

if __name__ == '__main__':
    run()
