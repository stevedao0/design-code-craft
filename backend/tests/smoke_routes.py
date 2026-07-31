#!/usr/bin/env python
"""Smoke tests for Reports and Dispatches (Công văn) routes."""
import os, sys, json
os.chdir('F:/APPs/backend')
sys.path.insert(0, 'F:/APPs/backend')
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv('F:/APPs/backend/.env', override=True)
from app.core.security import create_access_token
from fastapi.testclient import TestClient
from app.main import app

token = create_access_token(subject='admin@vcpmc.org')
client = TestClient(app)
auth = {'Authorization': f'Bearer {token}'}

def h(t): print(f"\n{'='*60}\n  {t}\n{'='*60}")
def ok(label, cond, detail=''):
    icon = '✅ PASS' if cond else '❌ FAIL'
    print(f"  {icon}: {label}")
    if detail: print(f"         {detail}")
    return cond

h("REPORTS ROUTES SMOKE")
routes = [
    ('GET', '/api/reports/summary', 'Reports summary'),
    ('GET', '/api/reports/certificates', 'Certificates in reports'),
    ('GET', '/api/reports/contracts/expiring', 'Expiring contracts'),
    ('GET', '/api/reports/contracts/pending', 'Pending contracts'),
    ('GET', '/api/reports/contracts/signed', 'Signed contracts'),
]
for method, path, label in routes:
    if method == 'GET':
        r = client.get(path, headers=auth)
    ok(f"{method} {path}", r.status_code in (200, 401), f"status={r.status_code}")

h("DISPATCHES (CÔNG VĂN) ROUTES SMOKE")
d_routes = [
    ('GET', '/api/dispatches', 'List công văn'),
    ('GET', '/api/dispatches/expired-contracts', 'Expired contracts'),
    ('GET', '/api/dispatches/envelope-layout-config', 'Envelope layout config'),
]
for method, path, label in d_routes:
    if method == 'GET':
        r = client.get(path, headers=auth)
    ok(f"{method} {path}", r.status_code in (200, 401, 404), f"status={r.status_code}")

h("SEARCH / API DISPATCHES")
s_routes = [
    ('GET', '/api/dispatches?search=test', 'Search dispatches'),
    ('GET', '/api/contracts?q=test', 'Search contracts'),
]
for method, path, label in s_routes:
    r = client.get(path, headers=auth)
    ok(f"{method} {path}", r.status_code in (200, 401, 404), f"status={r.status_code}")

h("IN GCN HANDOFF ROUTES")
gcn_routes = [
    ('GET', '/api/certificates', 'GCN list'),
    ('GET', '/api/certificates/1/print-logs', 'Print logs'),
]
for method, path, label in gcn_routes:
    r = client.get(path, headers=auth)
    ok(f"{method} {path}", r.status_code in (200, 401, 404), f"status={r.status_code}")

print(f"\n{'='*60}")
print("  DONE")
print('='*60)
