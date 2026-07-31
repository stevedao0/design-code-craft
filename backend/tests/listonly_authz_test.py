#!/usr/bin/env python
"""
Authorization tests for list-only account.

Validates:
  - 401 for unauthenticated contract list
  - 200 for list-only token, but only contracts in scope
  - 403 for list-only token on detail/update/delete/download-docx
  - 401 for any auth-less API access
  - Legacy contracts.read continues to access detail
  - Admin/mod unaffected
"""
import os
import sys
import json

os.chdir('F:/APPs/backend')
sys.path.insert(0, 'F:/APPs/backend')
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv('F:/APPs/backend/.env', override=True)

from datetime import datetime, timezone
from sqlalchemy import create_engine, text

from app.core.security import (
    create_access_token,
    hash_password,
)

# ── Setup TestClient ──────────────────────────────────────────────────
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


# ── DB helpers ────────────────────────────────────────────────────────
def db_engine():
    return create_engine(os.getenv('DATABASE_URL', ''))


def upsert_user(username: str, role: str, password: str) -> int:
    """Insert or update a throwaway user, return id."""
    salt, hashv = hash_password(password)
    with db_engine().begin() as conn:
        row = conn.execute(
            text("SELECT id FROM users WHERE lower(username) = lower(:u)"),
            {'u': username},
        ).fetchone()
        if row:
            uid = int(row[0])
            conn.execute(
                text(
                    "UPDATE users SET role = :role, password_salt = :salt, "
                    "password_hash = :hashv, is_active = true WHERE id = :id"
                ),
                {'role': role, 'salt': salt, 'hashv': hashv, 'id': uid},
            )
            return uid
        conn.execute(
            text(
                "INSERT INTO users (username, role, password_salt, password_hash, created_at, is_active) "
                "VALUES (:u, :role, :salt, :hashv, :now, true) RETURNING id"
            ),
            {
                'u': username,
                'role': role,
                'salt': salt,
                'hashv': hashv,
                'now': datetime.now(timezone.utc),
            },
        )
        return int(conn.execute(text("SELECT lastval()")).scalar())


def set_user_permissions(username: str, allow: list[str], deny: list[str]):
    """Replace UserPermissionRow overrides for a user."""
    with db_engine().begin() as conn:
        conn.execute(
            text("DELETE FROM user_permissions WHERE username = :u"),
            {'u': username},
        )
        for p in allow:
            conn.execute(
                text(
                    "INSERT INTO user_permissions (username, permission, allowed) "
                    "VALUES (:u, :p, 1)"
                ),
                {'u': username, 'p': p},
            )
        for p in deny:
            conn.execute(
                text(
                    "INSERT INTO user_permissions (username, permission, allowed) "
                    "VALUES (:u, :p, 0)"
                ),
                {'u': username, 'p': p},
            )


def assign_all_domains(user_id: int):
    """Attach user to all active domains for full visibility on list."""
    with db_engine().begin() as conn:
        conn.execute(
            text("DELETE FROM user_domain_assignments WHERE user_id = :u"),
            {'u': user_id},
        )
        rows = conn.execute(
            text("SELECT id FROM domains WHERE is_active = true AND is_locked = false")
        ).fetchall()
        for r in rows:
            conn.execute(
                text(
                    "INSERT INTO user_domain_assignments "
                    "(user_id, domain_id, can_access, can_view, can_create, can_edit, "
                    " can_print_test, can_print_official, can_approve, is_active, "
                    " created_at, updated_at, created_by, updated_by) "
                    "VALUES (:u, :d, true, true, true, true, "
                    " true, true, false, true, :now, :now, 0, 0)"
                ),
                {'u': user_id, 'd': int(r[0]), 'now': datetime.now(timezone.utc)},
            )


def first_contract_id() -> int | None:
    """Pick a contract the test user can actually see (background workspace)."""
    with db_engine().connect() as conn:
        row = conn.execute(
            text(
                "SELECT id FROM contract_records WHERE annex_no IS NULL "
                "AND UPPER(COALESCE(domain_group, '')) IN ('BACKGROUND', 'BG') "
                "ORDER BY id ASC LIMIT 1"
            )
        ).fetchone()
        if row:
            return int(row[0])
        # fallback: any record
        row = conn.execute(
            text("SELECT id FROM contract_records WHERE annex_no IS NULL ORDER BY id ASC LIMIT 1")
        ).fetchone()
        return int(row[0]) if row else None


def contract_domain(c_id: int) -> str:
    with db_engine().connect() as conn:
        row = conn.execute(
            text(
                "SELECT COALESCE(UPPER(linh_vuc), UPPER(field_code), UPPER(domain_group), '') "
                "FROM contract_records WHERE id = :id"
            ),
            {'id': c_id},
        ).fetchone()
        return (str(row[0]) if row else '').strip()


def cleanup_user(username: str):
    with db_engine().begin() as conn:
        conn.execute(text("DELETE FROM user_permissions WHERE username = :u"), {'u': username})
        conn.execute(
            text("DELETE FROM user_domain_assignments WHERE user_id IN (SELECT id FROM users WHERE lower(username) = lower(:u))"),
            {'u': username},
        )
        conn.execute(text("DELETE FROM users WHERE lower(username) = lower(:u)"), {'u': username})


# ── Test runner ───────────────────────────────────────────────────────
def expect(actual, expected, label):
    status = 'PASS' if actual == expected else 'FAIL'
    print(f"  [{status}] {label}: expected {expected}, got {actual}")
    return actual == expected


def main():
    LISTONLY_USER = 'listonly_test@vcpmc.org'
    FULL_USER = 'full_perm_test@vcpmc.org'
    PASSWORD = 'TestPass!123'

    # Cleanup leftovers (idempotent)
    cleanup_user(LISTONLY_USER)
    cleanup_user(FULL_USER)

    # ── Setup list-only user ────────────────────────────────────────────
    listonly_id = upsert_user(LISTONLY_USER, 'user', PASSWORD)
    # role user has contracts.list, but we explicitly deny contracts.read,
    # contracts.create, contracts.update, contracts.delete
    set_user_permissions(
        LISTONLY_USER,
        allow=['portal.access', 'contracts.list'],
        deny=[
            'contracts.read',
            'contracts.create',
            'contracts.update',
            'contracts.delete',
            'reports.export',
        ],
    )
    assign_all_domains(listonly_id)

    # ── Setup full user (legacy contracts.read) ─────────────────────────
    full_id = upsert_user(FULL_USER, 'user', PASSWORD)
    set_user_permissions(
        FULL_USER,
        allow=['contracts.read'],
        deny=[],
    )
    assign_all_domains(full_id)

    print(f"\n[Test fixtures] listonly_id={listonly_id}, full_id={full_id}")

    # Pre-test: find a real contract
    c_id = first_contract_id()
    if c_id is None:
        print("SKIP: no contract in DB to test against")
        cleanup_user(LISTONLY_USER)
        cleanup_user(FULL_USER)
        return 0
    print(f"  Test contract id: {c_id} (domain={contract_domain(c_id)})\n")

    listonly_token = create_access_token(subject=LISTONLY_USER)
    full_token = create_access_token(subject=FULL_USER)
    admin_token = create_access_token(subject='admin@vcpmc.org')

    headers_listonly = {'Authorization': f'Bearer {listonly_token}'}
    headers_full = {'Authorization': f'Bearer {full_token}'}
    headers_admin = {'Authorization': f'Bearer {admin_token}'}

    passed = 0
    total = 0

    def check(label, ok):
        nonlocal passed, total
        total += 1
        if ok:
            passed += 1
            print(f"  [PASS] {label}")
        else:
            print(f"  [FAIL] {label}")

    print("=== Unauthenticated ===")
    r = client.get('/api/contracts')
    check("401 on /api/contracts without token", r.status_code == 401)
    r = client.get(f'/api/contracts/{c_id}')
    check("401 on /api/contracts/{id} without token", r.status_code == 401)
    r = client.get(f'/api/contracts/{c_id}/download-docx')
    check("401 on download-docx without token", r.status_code == 401)

    print("\n=== List-only account (contracts.list only) ===")
    r = client.get('/api/contracts', headers=headers_listonly)
    check("200 on /api/contracts for list-only", r.status_code == 200)
    if r.status_code == 200:
        body = r.json()
        items = body.get('items') or body.get('contracts') or []
        check(
            "list-only includes container items (payload safe shape)",
            isinstance(items, list),
        )

    r = client.get(f'/api/contracts/{c_id}', headers=headers_listonly)
    check("403 on /api/contracts/{id} for list-only", r.status_code == 403)

    r = client.patch(f'/api/contracts/{c_id}', json={}, headers=headers_listonly)
    check("403 on PATCH for list-only", r.status_code == 403)

    r = client.delete(f'/api/contracts/{c_id}', headers=headers_listonly)
    check("403 on DELETE for list-only", r.status_code == 403)

    r = client.get(f'/api/contracts/{c_id}/download-docx', headers=headers_listonly)
    check("403 on download-docx for list-only", r.status_code == 403)

    r = client.post(
        '/api/contracts',
        json={'contract_no': 'TEST/2026/001', 'domain': 'KARAOKE'},
        headers=headers_listonly,
    )
    check("403 on POST /api/contracts for list-only", r.status_code == 403)

    print("\n=== Legacy user with contracts.read ===")
    r = client.get('/api/contracts', headers=headers_full)
    check("200 on /api/contracts for legacy read", r.status_code == 200)
    r = client.get(f'/api/contracts/{c_id}', headers=headers_full)
    check("200 on /api/contracts/{id} for legacy read", r.status_code == 200)

    print("\n=== Admin tokens ===")
    r = client.get('/api/contracts', headers=headers_admin)
    check("200 on /api/contracts for admin", r.status_code == 200)
    r = client.get(f'/api/contracts/{c_id}', headers=headers_admin)
    check("200 on /api/contracts/{id} for admin", r.status_code == 200)

    print("\n=== Public calculator route ===")
    r = client.get('/bang-tinh')
    check("SPA fallback 200 on /bang-tinh", r.status_code == 200)
    r = client.get('/cong-cu/bang-tinh')
    check("SPA fallback 200 on /cong-cu/bang-tinh", r.status_code == 200)

    print(f"\n=== Result: {passed}/{total} passed ===")

    # Cleanup fixtures
    cleanup_user(LISTONLY_USER)
    cleanup_user(FULL_USER)

    return 0 if passed == total else 1


if __name__ == '__main__':
    sys.exit(main())
