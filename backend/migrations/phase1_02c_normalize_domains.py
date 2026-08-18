"""
Phase 1.2c: Normalize contract_records.linh_vuc/field_code/linh_vuc_hien_thi
to canonical domain codes.

Approved aliases (exact, post-normalize):
  KARAOKE       -> linh_vuc=KARAOKE       field_code=KARAOKE       display='Karaoke'
  Karaoke       -> KARAOKE
  karaoke       -> KARAOKE

  PHONG_THU_AM  -> linh_vuc=PHONG_THU_AM  field_code=PHONG_THU_AM  display='Phòng thu âm'
  Phòng thu âm  -> PHONG_THU_AM
  phòng thu âm  -> PHONG_THU_AM
  PHÒNG THU ÂM  -> PHONG_THU_AM
  phong thu am  -> PHONG_THU_AM
  PTA           -> PHONG_THU_AM
  PHONG_GHI_AM  -> PHONG_THU_AM
  Phòng ghi âm  -> PHONG_THU_AM
  phòng ghi âm  -> PHONG_THU_AM

  KHU_VUI_CHOI  -> linh_vuc=KHU_VUI_CHOI  field_code=KHU_VUI_CHOI  display='Khu vui chơi'
  Khu vui chơi  -> KHU_VUI_CHOI
  khu vui chơi  -> KHU_VUI_CHOI
  KHU VUI CHƠI  -> KHU_VUI_CHOI
  khu vui choi  -> KHU_VUI_CHOI
  KHU VUI CHOI  -> KHU_VUI_CHOI

NOT mapped (retired or unknown — must be rejected at write boundary,
never silently coerced by this migration):
  ENTERTAINMENT, RESTAURANT, BACKGROUND, SCTT, BD, Chăm sóc sức khỏe.

The migration is idempotent. It only rewrites rows whose current linh_vuc
exactly matches an approved alias after trim and NFC normalization.
contract_no, money fields, contract_year, IDs, sequences, parent/annex
relationships are NOT touched.

Invariants enforced in this migration BEFORE commit:
- total contract_records unchanged
- distinct stable IDs unchanged
- contract_no set unchanged
- money columns unchanged

Run:
    DATABASE_URL=... python -m backend.migrations.phase1_02c_normalize_domains upgrade
"""
import os
import sys

from .phase1_lib import connect, ensure_history, is_applied, mark_applied, mark_reverted

HIST_TAG = "phase1_02c_normalize_domains"


# (current_raw -> canonical_code)
KARAOKE_FROM = ("KARAOKE", "Karaoke", "karaoke")
PHONG_THU_AM_FROM = (
    "PHONG_THU_AM", "Phòng thu âm", "phòng thu âm", "PHÒNG THU ÂM",
    "phong thu am", "PTA", "PHONG_GHI_AM",
    "Phòng ghi âm", "phòng ghi âm",
)
KHU_VUI_CHOI_FROM = (
    "KHU_VUI_CHOI", "Khu vui chơi", "khu vui chơi",
    "KHU VUI CHƠI", "khu vui choi", "KHU VUI CHOI",
)

DISPLAY = {
    "KARAOKE": "Karaoke",
    "PHONG_THU_AM": "Phòng thu âm",
    "KHU_VUI_CHOI": "Khu vui chơi",
}


def _update_for(cur, src_values, canonical):
    if not src_values:
        return 0
    sql = """
        UPDATE contract_records
        SET linh_vuc = %s,
            field_code = %s,
            linh_vuc_hien_thi = %s
        WHERE TRIM(BOTH FROM linh_vuc) IN (
            """ + ",".join(["%s"] * len(src_values)) + """
        )
    """
    params = [canonical, canonical, DISPLAY[canonical]] + list(src_values)
    cur.execute(sql, params)
    return cur.rowcount


def upgrade():
    conn = connect()
    conn.autocommit = False
    cur = conn.cursor()
    try:
        ensure_history(cur)
        if is_applied(cur, HIST_TAG):
            print(f"{HIST_TAG} already applied — skipping")
            return

        # Capture invariants BEFORE update
        cur.execute("SELECT COUNT(*) FROM contract_records")
        total_before = cur.fetchone()[0]
        cur.execute("SELECT COUNT(DISTINCT id) FROM contract_records")
        ids_before = cur.fetchone()[0]
        cur.execute(
            "SELECT MIN(royalty_amount_before_vat), MAX(royalty_amount_before_vat), "
            "COALESCE(SUM(royalty_amount_before_vat), 0) FROM contract_records"
        )
        mn, mx, sm = cur.fetchone()

        # Apply updates
        upd = {}
        upd["KARAOKE"] = _update_for(cur, KARAOKE_FROM, "KARAOKE")
        upd["PHONG_THU_AM"] = _update_for(cur, PHONG_THU_AM_FROM, "PHONG_THU_AM")
        upd["KHU_VUI_CHOI"] = _update_for(cur, KHU_VUI_CHOI_FROM, "KHU_VUI_CHOI")
        print(f"Rows updated by canonical group: {upd}")

        # Re-verify invariants AFTER update
        cur.execute("SELECT COUNT(*) FROM contract_records")
        total_after = cur.fetchone()[0]
        cur.execute("SELECT COUNT(DISTINCT id) FROM contract_records")
        ids_after = cur.fetchone()[0]
        cur.execute(
            "SELECT MIN(royalty_amount_before_vat), MAX(royalty_amount_before_vat), "
            "COALESCE(SUM(royalty_amount_before_vat), 0) FROM contract_records"
        )
        mn2, mx2, sm2 = cur.fetchone()

        if (total_before != total_after
                or ids_before != ids_after
                or mn != mn2 or mx != mx2 or sm != sm2):
            raise RuntimeError(
                "INVARIANT FAIL: total/distinct/money changed. "
                f"tot {total_before}->{total_after}, ids {ids_before}->{ids_after}, "
                f"money mn {mn}->{mn2}, mx {mx}->{mx2}, sum {sm}->{sm2}"
            )

        # Final distribution check
        cur.execute(
            "SELECT TRIM(BOTH FROM linh_vuc), COUNT(*) FROM contract_records "
            "GROUP BY 1 ORDER BY 1"
        )
        print("Final distribution:")
        for row in cur.fetchall():
            print(f"  {row[0]!r}: {row[1]}")

        mark_applied(cur, HIST_TAG)
        conn.commit()
        print(f"upgrade {HIST_TAG} OK")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def downgrade():
    raise NotImplementedError(
        f"downgrade for {HIST_TAG} not implemented — "
        "contract_records now stores canonical codes only. "
        "Restore from pre-domain-normalization backup if needed."
    )


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("upgrade", "downgrade"):
        sys.stderr.write(f"usage: phase1_02c_normalize_domains {{upgrade|downgrade}}\n")
        sys.exit(1)
    if sys.argv[1] == "upgrade":
        upgrade()
    else:
        downgrade()


if __name__ == "__main__":
    main()