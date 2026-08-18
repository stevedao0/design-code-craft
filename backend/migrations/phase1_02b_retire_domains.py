"""
Phase 1.2b: Retire SCTT, BD, and Chăm sóc sức khỏe domains.

This migration removes references to three permanently retired business domains
that had their contract data pruned (see backup vcpmc_contract_pre_prune_*).
No new contracts of these domains can be created going forward.

OPERATIONS (idempotent — safe to re-run):
- DELETE SCTT, BD from domains table (if present).
- DELETE SCTT, BD aliases from domain_alias (if present).
- No KPI group or target changes (SCTT/BD had none).

Run:
    DATABASE_URL=... python -m backend.migrations.phase1_02b_retire_domains upgrade
    DATABASE_URL=... python -m backend.migrations.phase1_02b_retire_domains downgrade
"""
import os
import sys

from .phase1_lib import connect, ensure_history, mark_applied, mark_reverted

HIST_TAG = "phase1_02b_retire_domains"

# Domain codes being retired (no new contracts allowed)
RETIRED_DOMAIN_CODES = ["SCTT", "BD"]


def upgrade():
    conn = connect()
    conn.autocommit = False
    cur = conn.cursor()
    try:
        ensure_history(cur)

        for code in RETIRED_DOMAIN_CODES:
            cur.execute(
                "DELETE FROM domain_alias WHERE canonical_code = %s",
                (code,),
            )
            cur.execute(
                "DELETE FROM domains WHERE code = %s",
                (code,),
            )

        mark_applied(cur, HIST_TAG)
        conn.commit()
        print(f"upgrade {HIST_TAG} OK — SCTT and BD domains retired")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def downgrade():
    # This is a data-destruction rollback. Not implemented by default.
    # To re-enable, operator must re-seed via phase1_02a_seed_registry
    # with updated DOMAINS list.
    raise NotImplementedError(
        f"downgrade for {HIST_TAG} not implemented — "
        "domains were retired; re-enable via phase1_02a_seed_registry"
    )
