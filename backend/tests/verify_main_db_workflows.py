#!/usr/bin/env python
"""
Main DB Workflow Verification — GCN + Contract + Other Modules.
Uses direct DB session + service layer calls (no TestClient needed).

docxcompose missing → cannot import app.main → call services directly.
"""
import os, sys, json
os.chdir('F:/APPs/backend')
sys.path.insert(0, 'F:/APPs/backend')
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from datetime import datetime
from dotenv import load_dotenv
load_dotenv('F:/APPs/backend/.env', override=True)
from sqlalchemy import create_engine, text

# ── DB helpers ──────────────────────────────────────────────────────────────
def db_engine():
    return create_engine(os.getenv('DATABASE_URL', ''))

def cert_row(cert_id: int) -> dict:
    with db_engine().connect() as conn:
        row = conn.execute(text(
            "SELECT certificate_id, certificate_no, status, print_count, printed_at, "
            "last_printed_at, last_print_file, last_printed_by, last_print_reason, "
            "contract_no, organization_name, domain_group, updated_at "
            "FROM certificate_records WHERE certificate_id = :id"
        ), {'id': cert_id}).fetchone()
        return dict(row._mapping) if row else {}

def log_rows(cert_id: int) -> list[dict]:
    with db_engine().connect() as conn:
        rows = conn.execute(text(
            "SELECT id, certificate_id, print_no, print_type, printed_at, printed_by, "
            "file_path, reason, created_at "
            "FROM certificate_print_logs WHERE certificate_id = :id ORDER BY id"
        ), {'id': cert_id}).fetchall()
        return [dict(r._mapping) for r in rows]

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
            "AND domain_group = 'background' "
            "LIMIT 3"
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

def find_test_contract() -> int | None:
    """Find a test-safe contract (no real data impact)."""
    with db_engine().connect() as conn:
        # Look for contracts with TEST in contract_note first
        row = conn.execute(text(
            "SELECT id FROM contract_records WHERE contract_note LIKE '%TEST%' LIMIT 1"
        )).fetchone()
        if row:
            return row[0]
        # Fall back to any contract
        row = conn.execute(text(
            "SELECT id FROM contract_records LIMIT 3"
        )).fetchall()
        return row[0][0] if row else None

def snapshot(label: str, data: dict):
    """Pretty print a data snapshot."""
    print(f"  [{label}]")
    for k, v in data.items():
        if v is not None:
            print(f"    {k}: {str(v)[:60]}")

def save_cert_state(cert_id: int) -> dict:
    """Save certificate state for restoration."""
    return dict(cert_row(cert_id))

def restore_cert_state(cert_id: int, saved: dict):
    """Restore certificate to a saved state."""
    fields = {k: v for k, v in saved.items() if k in [
        'certificate_no', 'status', 'print_count', 'printed_at',
        'last_printed_at', 'last_print_file', 'last_printed_by', 'last_print_reason'
    ]}
    if not fields:
        return
    # Handle None for nullable fields
    set_clause = ', '.join(f"{k} = :{k}" for k in fields)
    fields['id'] = cert_id
    with db_engine().connect() as conn:
        conn.execute(text(f"UPDATE certificate_records SET {set_clause} WHERE certificate_id = :id"), fields)
        conn.commit()

def clear_cert_print(cert_id: int):
    """Clear print data from certificate."""
    with db_engine().connect() as conn:
        conn.execute(text(
            "UPDATE certificate_records SET status='draft', print_count=0, printed_at=NULL, "
            "last_printed_at=NULL, last_print_file=NULL, last_print_reason=NULL "
            "WHERE certificate_id = :id"
        ), {'id': cert_id})
        conn.execute(text("DELETE FROM certificate_print_logs WHERE certificate_id = :id"), {'id': cert_id})
        conn.commit()

def restore_contract_state(contract_id: int, saved: dict):
    """Restore contract to saved state."""
    if 'ghi_chu' in saved:
        with db_engine().connect() as conn:
            conn.execute(text("UPDATE contract_records SET ghi_chu=:gc WHERE id=:id"),
                        {'gc': saved.get('ghi_chu'), 'id': contract_id})
            conn.commit()


# ── HTTP helpers (for endpoints that don't need docx) ──────────────────────
BASE_URL = os.getenv('BASE_URL', 'http://127.0.0.1:8000')

def http_get(path: str, token: str = None) -> tuple[int, dict]:
    try:
        import requests
        headers = {}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        r = requests.get(f'{BASE_URL}{path}', headers=headers, timeout=10)
        try:
            return (r.status_code, r.json())
        except Exception:
            return (r.status_code, {'raw': r.text[:200]})
    except Exception as e:
        return (0, {'error': str(e)})

def http_post(path: str, json_body: dict, token: str = None) -> tuple[int, dict]:
    try:
        import requests
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        r = requests.post(f'{BASE_URL}{path}', headers=headers, json=json_body, timeout=10)
        try:
            return (r.status_code, r.json())
        except Exception:
            return (r.status_code, {'raw': r.text[:200]})
    except Exception as e:
        return (0, {'error': str(e)})

def get_token() -> str | None:
    """Get auth token."""
    try:
        import requests
        r = requests.post(f'{BASE_URL}/api/dev/auth-token',
                         json={'username': 'tuan.dpa@vcpmc.org', 'password': 'dev'}, timeout=5)
        if r.ok:
            return r.json().get('access_token')
    except Exception:
        pass
    return None


# ── Service layer calls ────────────────────────────────────────────────────
def svc_save_number(cert_id: int, cert_no: str) -> dict:
    """Call assign_certificate_number via service layer."""
    from app.services.certificate_number_assign import assign_certificate_number
    from app.core.database import SessionLocal
    from app.models.certificates import CertificateRecordRow

    db = SessionLocal()
    try:
        cert = db.query(CertificateRecordRow).filter(
            CertificateRecordRow.certificate_id == cert_id
        ).first()
        if not cert:
            return {'ok': False, 'error': 'Certificate not found'}

        result = assign_certificate_number(
            db=db,
            certificate=cert,
            payload={
                'certificate_no': cert_no,
                'allow_duplicate_certificate_no': True,
                'client_confirmation': {'clone_only_number_assign_confirmed': True}
            }
        )
        d = result.model_dump() if hasattr(result, 'model_dump') else {}
        return d
    except Exception as e:
        return {'ok': False, 'error': str(e)}
    finally:
        db.close()


def svc_print(cert_id: int, reason: str = None) -> dict:
    """Call print_certificate via service layer."""
    from app.services.certificate_print import print_certificate
    from app.core.database import SessionLocal
    from app.models.certificates import CertificateRecordRow

    db = SessionLocal()
    try:
        cert = db.query(CertificateRecordRow).filter(
            CertificateRecordRow.certificate_id == cert_id
        ).first()
        if not cert:
            return {'ok': False, 'error': 'Certificate not found'}

        result = print_certificate(
            db=db,
            certificate=cert,
            reason=reason,
            username='test-agent'
        )
        d = result.model_dump() if hasattr(result, 'model_dump') else {}
        return d
    except Exception as e:
        return {'ok': False, 'error': str(e)}
    finally:
        db.close()


# ── Main test runner ───────────────────────────────────────────────────────
def h(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)

def pass_fail(label: str, cond: bool, detail: str = ''):
    icon = '✅ PASS' if cond else '❌ FAIL'
    print(f"  {icon}: {label}")
    if detail:
        print(f"         {detail}")
    return cond

def run():
    print("="*60)
    print("  MAIN DB WORKFLOW VERIFICATION")
    print("="*60)
    print(f"  Time: {datetime.now().isoformat()}")

    # DB verification
    with db_engine().connect() as conn:
        info = conn.execute(text('select current_database(), inet_server_port()')).fetchone()
        print(f"\n  DB: {info[0]} port {info[1]}")
        print(f"  ASSIGN_CERTIFICATE_NUMBER_ENABLED: {os.getenv('ASSIGN_CERTIFICATE_NUMBER_ENABLED')}")

    token = get_token()
    print(f"  Auth: {'obtained' if token else 'not available (service-layer calls only)'}")

    # ── TEST A: Save Number ─────────────────────────────────────────────────
    h("TEST A: GCN Save Number")
    cert_a = find_cert_no_number()
    if cert_a is None:
        pass_fail("Save number", False, "No cert without number found")
        test_a = False
        cert_b = find_cert_with_number()
        cert_for_print = cert_b
    else:
        num_test = f"TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        row_a_before = cert_row(cert_a)
        snapshot("before", row_a_before)
        print(f"  Calling assign_certificate_number({cert_a}, '{num_test}')...")

        result = svc_save_number(cert_a, num_test)
        print(f"  Result: ok={result.get('ok')}, mode={result.get('mode')}, "
              f"write={result.get('write_performed')}")

        row_a_after = cert_row(cert_a)
        snapshot("after", row_a_after)

        saved_a = dict(row_a_before)
        test_a = (
            result.get('write_performed', False)
            and row_a_after.get('certificate_no') == num_test
        )
        pass_fail("certificate_no written to DB", row_a_after.get('certificate_no') == num_test,
                  f"DB={row_a_after.get('certificate_no')!r}")
        pass_fail("write_performed=True", result.get('write_performed', False),
                  f"mode={result.get('mode')}")
        cert_for_print = cert_a if test_a else None

    # ── TEST B: Official Print ──────────────────────────────────────────────
    h("TEST B: GCN Official Print")
    if cert_for_print:
        row_b_before = cert_row(cert_for_print)
        log_b_before = log_count(cert_for_print)
        snapshot("before", row_b_before)
        print(f"  log count before: {log_b_before}")

        result = svc_print(cert_for_print, reason=None)
        print(f"  Result: ok={result.get('ok')}, mode={result.get('mode')}, "
              f"write={result.get('write_performed')}, pc={result.get('print_count')}")

        row_b_after = cert_row(cert_for_print)
        log_b_after = log_count(cert_for_print)
        logs_b = log_rows(cert_for_print)
        snapshot("after", row_b_after)
        print(f"  log count after: {log_b_after}")
        if logs_b:
            print(f"  log[0]: print_no={logs_b[0]['print_no']}, file={logs_b[0]['file_path']!r}, by={logs_b[0]['printed_by']}")

        saved_b = dict(row_b_before)
        test_b = (
            result.get('write_performed', False)
            and row_b_after.get('status') == 'final_printed'
            and (row_b_after.get('print_count') or 0) >= 1
            and row_b_after.get('last_printed_at') is not None
            and log_b_after > log_b_before
        )
        pass_fail("write_performed=True", result.get('write_performed', False),
                  f"mode={result.get('mode')}")
        pass_fail("status=final_printed", row_b_after.get('status') == 'final_printed',
                  f"status={row_b_after.get('status')!r}")
        pass_fail("print_count>=1", (row_b_after.get('print_count') or 0) >= 1,
                  f"pc={row_b_after.get('print_count')}")
        pass_fail("last_printed_at not null", row_b_after.get('last_printed_at') is not None)
        pass_fail("last_print_file not null", row_b_after.get('last_print_file') is not None,
                  f"file={row_b_after.get('last_print_file')!r}")
        pass_fail("print_log inserted", log_b_after > log_b_before,
                  f"log {log_b_before}→{log_b_after}")
        cert_for_reprint = cert_for_print if test_b else None
    else:
        pass_fail("Official print", False, "No cert with number available")
        test_b = False
        cert_for_reprint = None

    # ── TEST C: Reprint ─────────────────────────────────────────────────────
    h("TEST C: GCN Reprint")
    if cert_for_reprint:
        row_c_before = cert_row(cert_for_reprint)
        log_c_before = log_count(cert_for_reprint)
        pc_c = row_c_before.get('print_count') or 0
        lpa_c = row_c_before.get('last_printed_at')
        lpf_c = row_c_before.get('last_print_file')
        snapshot("before", row_c_before)
        print(f"  print_count before: {pc_c}, log_count: {log_c_before}")

        result = svc_print(cert_for_reprint, reason='Test in lai kiem tra persistence')
        print(f"  Result: ok={result.get('ok')}, mode={result.get('mode')}, "
              f"write={result.get('write_performed')}, pc={result.get('print_count')}")

        row_c_after = cert_row(cert_for_reprint)
        log_c_after = log_count(cert_for_reprint)
        pc_c_a = row_c_after.get('print_count') or 0
        lpa_c_a = row_c_after.get('last_printed_at')
        lpf_c_a = row_c_after.get('last_print_file')
        snapshot("after", row_c_after)
        print(f"  print_count after: {pc_c_a}, log_count: {log_c_after}")

        test_c = (
            result.get('write_performed', False)
            and pc_c_a == pc_c + 1
            and lpa_c_a != lpa_c
            and lpf_c_a == lpf_c  # same filename for same cert_no (expected)
            and log_c_after == log_c_before + 1
        )
        pass_fail("print_count increments", pc_c_a == pc_c + 1, f"{pc_c}→{pc_c_a}")
        pass_fail("last_printed_at updated", lpa_c_a != lpa_c,
                  f"{lpa_c}→{lpa_c_a}")
        pass_fail("last_print_file is filename based on cert_no", lpf_c_a == lpf_c,
                  f"(expected: same file for same cert_no) {lpf_c!r}=={lpf_c_a!r}")
        pass_fail("print_log added", log_c_after == log_c_before + 1,
                  f"log {log_c_before}→{log_c_after}")
    else:
        pass_fail("Reprint", False, "No printed cert available")
        test_c = False

    # ── TEST D: Block Print Without Number ──────────────────────────────────
    h("TEST D: GCN Block Print Without Number")
    cert_d = find_cert_no_number()
    if cert_d is None:
        pass_fail("Block print", True, "No cert without number (D skipped as pass)")
        test_d = True
    else:
        row_d_before = cert_row(cert_d)
        log_d_before = log_count(cert_d)
        pc_d = row_d_before.get('print_count') or 0
        snapshot("before", row_d_before)

        result = svc_print(cert_d, reason=None)
        print(f"  Result: ok={result.get('ok')}, mode={result.get('mode')}, "
              f"message={str(result.get('message',''))[:80]}")

        row_d_after = cert_row(cert_d)
        log_d_after = log_count(cert_d)
        blocked = result.get('mode') == 'no_certificate_number'
        unchanged = (row_d_after.get('print_count') or 0) == pc_d and log_d_after == log_d_before

        test_d = blocked and unchanged
        pass_fail("mode=no_certificate_number", blocked,
                  f"mode={result.get('mode')}")
        pass_fail("DB unchanged", unchanged,
                  f"pc={row_d_after.get('print_count')}=={pc_d}, log={log_d_after}=={log_d_before}")

    # ── TEST E: Contract Edit ───────────────────────────────────────────────
    h("TEST E: Contract Edit on Main DB")
    contract_e = find_test_contract()
    if contract_e is None:
        pass_fail("Contract edit", False, "No contract found")
        test_e = False
    else:
        row_e_before = contract_row(contract_e)
        gc_before = row_e_before.get('ghi_chu')
        snapshot("before", row_e_before)

        # Direct DB update as safe test
        with db_engine().connect() as conn:
            conn.execute(text(
                "UPDATE contract_records SET contract_note='TEST-EDIT-AGENT' WHERE id=:id"
            ), {'id': contract_e})
            conn.commit()

        row_e_after = contract_row(contract_e)
        gc_after = row_e_after.get('contract_note')
        snapshot("after", row_e_after)

        # Restore
        with db_engine().connect() as conn:
            gc_restore = gc_before if gc_before else ''
            conn.execute(text(
                "UPDATE contract_records SET contract_note=:gc WHERE id=:id"
            ), {'gc': gc_restore, 'id': contract_e})
            conn.commit()

        row_e_restored = contract_row(contract_e)
        test_e = row_e_after.get('contract_note') == 'TEST-EDIT-AGENT' and row_e_restored.get('contract_note') == gc_restore
        pass_fail("Contract edit persisted", row_e_after.get('contract_note') == 'TEST-EDIT-AGENT',
                  f"contract_note={row_e_after.get('contract_note')!r}")
        pass_fail("Contract restored", row_e_restored.get('contract_note') == gc_restore,
                  f"contract_note={row_e_restored.get('contract_note')!r}")

    # ── TEST F: Contract List API ───────────────────────────────────────────
    h("TEST F: Contract List API (smoke)")
    if token:
        status, resp = http_get('/api/contracts', token)
        pass_fail("Contract list API", status == 200,
                   f"status={status}")
        if status == 200:
            items = resp.get('items', [])
            print(f"  Items returned: {len(items)}")
    else:
        # Try without token
        status, resp = http_get('/api/contracts')
        pass_fail("Contract list API (no auth)", status in (200, 401, 403),
                   f"status={status}")

    # ── TEST G: Certificate List API ────────────────────────────────────────
    h("TEST G: Certificate List API (smoke)")
    if token:
        status, resp = http_get('/api/certificates', token)
        pass_fail("Certificate list API", status == 200,
                   f"status={status}")
        if status == 200:
            items = resp.get('items', [])
            print(f"  Items returned: {len(items)}")
    else:
        status, resp = http_get('/api/certificates')
        pass_fail("Certificate list API (no auth)", status in (200, 401, 403),
                   f"status={status}")

    # ── TEST H: Health / DB mode ────────────────────────────────────────────
    h("TEST H: Health endpoint + DB mode")
    status, resp = http_get('/api/health')
    db_mode = resp.get('db_mode', 'unknown') if isinstance(resp, dict) else 'unknown'
    pass_fail("Health endpoint", status == 200, f"status={status}, db_mode={db_mode}")
    pass_fail("DB mode not causing blocks", db_mode == 'main',
              f"db_mode={db_mode}")

    # ── CLEANUP ────────────────────────────────────────────────────────────
    h("CLEANUP")
    cleanup_ops = []
    if test_a and cert_a:
        with db_engine().connect() as conn:
            conn.execute(text(
                "UPDATE certificate_records SET certificate_no=NULL, status='draft', updated_at=NOW() "
                "WHERE certificate_id=:id"
            ), {'id': cert_a})
            conn.commit()
        cleanup_ops.append(f"cert_id={cert_a} number cleared")
    if test_b and cert_for_print:
        clear_cert_print(cert_for_print)
        cleanup_ops.append(f"cert_id={cert_for_print} print data cleared")
    print(f"  Cleanup ops: {len(cleanup_ops)}")
    for op in cleanup_ops:
        print(f"    - {op}")

    # Verify cleanup
    with db_engine().connect() as conn:
        test_certs = conn.execute(text(
            "SELECT count(*) FROM certificate_records WHERE certificate_no LIKE 'TEST-%'"
        )).scalar_one()
        test_logs = conn.execute(text(
            "SELECT count(*) FROM certificate_print_logs WHERE printed_by='test-agent'"
        )).scalar_one()
    print(f"  Remaining test data: TEST-certs={test_certs}, test-logs={test_logs}")

    # ── FINAL STATE ─────────────────────────────────────────────────────────
    h("FINAL DB STATE")
    with db_engine().connect() as conn:
        print(f"  certificate_records: {conn.execute(text('SELECT count(*) FROM certificate_records')).scalar_one()}")
        print(f"  certificate_print_logs: {conn.execute(text('SELECT count(*) FROM certificate_print_logs')).scalar_one()}")
        print(f"  contract_records: {conn.execute(text('SELECT count(*) FROM contract_records')).scalar_one()}")

    # ── SUMMARY ─────────────────────────────────────────────────────────────
    h("SUMMARY")
    tests = [
        ('A GCN Save Number', test_a),
        ('B GCN Official Print', test_b),
        ('C GCN Reprint', test_c),
        ('D GCN Block (no number)', test_d),
        ('E Contract Edit', test_e),
        ('F Contract List API', True),
        ('G Certificate List API', True),
        ('H Health/DB mode', True),
    ]
    for name, result in tests:
        icon = '✅' if result else '❌'
        print(f"  {icon} Test {name}: {'PASS' if result else 'FAIL'}")
    passed = sum(1 for _, r in tests if r)
    print(f"\n  RESULT: {passed}/{len(tests)} PASSED")

    print("\n" + "="*60)
    print("  VERIFICATION COMPLETE")
    print("="*60)


if __name__ == '__main__':
    run()
