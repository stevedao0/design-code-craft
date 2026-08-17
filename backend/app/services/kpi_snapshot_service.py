"""
KPI Snapshot Service — single backend service for KPI group/target/actual.

Admin and User flows both call into this service. The service:

- Filters canonical contracts only (annex_no IS NULL).
- Uses signed_date >= year-01-01 AND signed_date < (year+1)-01-01.
- Counts each contract_id at most once (DISTINCT).
- Aggregates by canonical domain code → KPI group.
- Applies the shared resolver `normalize_contract_revenue` from
  `services.revenue_resolver`. so_tien_value is NEVER used as a fallback
  for "chưa Thuế GTGT".
- Returns amount + status so callers can audit.
- Does NOT accept user_id/user_email to filter ACTUAL. ACTUAL is unit-wide.
  (User→KPI group assignment is read separately and only decides which
  group rows appear in the user's view, not the actual amount.)
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from ..models.contracts import ContractRecordRow
from ..services.domain_registry import (
    KpiGroup,
    canonicalize_domain,
    get_kpi_group_for_domain,
    kpi_group_member_codes,
    kpi_groups,
    label_for_kpi_group,
)
from ..services.revenue_resolver import normalize_contract_revenue


@dataclass
class ContractRevenueRow:
    """Per-contract canonical revenue result."""
    contract_id: int
    domain_code: Optional[str]
    kpi_group_code: Optional[str]
    raw_linh_vuc: Optional[str]
    signed_date: Optional[date]
    before_vat: int
    after_vat: int
    vat_amount: int
    so_tien_value: int
    status: str  # "resolved" | "derived" | "legacy_unresolved" | "missing" | "unknown_domain"
    target_participates: bool


@dataclass
class KpiGroupSnapshot:
    kpi_group_code: str
    field_label: str
    member_domain_codes: tuple[str, ...]
    target_amount: int
    actual_before_tax: int
    contract_count: int           # total canonical contracts in group
    valued_contract_count: int    # contracts contributing actual > 0
    unresolved_value_count: int   # contracts in scope with value=0
    has_target: bool
    progress_percent: Optional[float]
    member_breakdown: list[dict]


@dataclass
class UnitYearSnapshot:
    """Full unit-wide KPI snapshot for a year."""
    year: int
    groups: list[KpiGroupSnapshot]
    total_target: int
    total_actual: int
    total_contract_count: int
    completion_percent: Optional[float]


# ─── Low-level row resolver ────────────────────────────────────────────────

def _resolve_row(row: ContractRecordRow) -> ContractRevenueRow:
    """Convert one ORM row to a normalized ContractRevenueRow."""
    canonical = canonicalize_domain(row.linh_vuc)
    grp = get_kpi_group_for_domain(canonical) if canonical else None
    nr = normalize_contract_revenue(row)

    # Status classification — caller can audit
    if canonical is None:
        status = "unknown_domain"
    elif nr.before_vat_status == "resolved":
        status = "resolved"
    elif nr.before_vat_status == "from_legacy_import":
        status = "derived"
    elif nr.before_vat_status == "unresolved":
        status = "legacy_unresolved"
    else:
        status = "missing"

    so_tien = int(row.so_tien_value) if row.so_tien_value is not None else 0

    return ContractRevenueRow(
        contract_id=row.id,
        domain_code=canonical,
        kpi_group_code=grp,
        raw_linh_vuc=row.linh_vuc,
        signed_date=row.ngay_lap_hop_dong,
        before_vat=int(nr.before_vat) if nr.before_vat else 0,
        after_vat=int(nr.after_vat) if nr.after_vat else 0,
        vat_amount=int(nr.vat_amount) if nr.vat_amount else 0,
        so_tien_value=so_tien,
        status=status,
        target_participates=False,  # set later if group has target
    )


# ─── Year window ───────────────────────────────────────────────────────────

def _year_window(year: int) -> tuple[date, date]:
    return (date(year, 1, 1), date(year + 1, 1, 1))


def _load_canonical_rows_for_year(db: Session, year: int) -> list[ContractRecordRow]:
    """Load canonical contracts for the year using ngay_lap_hop_dong window."""
    win_start, win_end = _year_window(year)
    return (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.annex_no.is_(None))
        .filter(
            (ContractRecordRow.ngay_lap_hop_dong >= win_start)
            & (ContractRecordRow.ngay_lap_hop_dong < win_end)
            | (
                ContractRecordRow.ngay_lap_hop_dong.is_(None)
                & (ContractRecordRow.contract_year == year)
            )
        )
        .all()
    )


# ─── Public: per-year unit-wide snapshot ───────────────────────────────────

def _compute_unit_snapshot_from_rows(
    rows: list[ContractRecordRow], year: int
) -> UnitYearSnapshot:
    """Pure aggregation from a pre-loaded list of rows.

    Allows callers that already loaded rows (e.g. via raw SQL on a
    fixture DB whose schema differs slightly) to reuse the snapshot
    logic. Same guarantees as `get_unit_year_snapshot`.
    """
    group_actuals: dict[str, int] = {}
    group_counts: dict[str, int] = {}
    group_valued: dict[str, int] = {}
    group_unresolved: dict[str, int] = {}
    group_members: dict[str, dict[str, dict]] = {}

    for grp in kpi_groups():
        group_actuals[grp.code] = 0
        group_counts[grp.code] = 0
        group_valued[grp.code] = 0
        group_unresolved[grp.code] = 0
        group_members[grp.code] = {
            member: {
                "member_field_code": member,
                "contract_count": 0,
                "valued_contract_count": 0,
                "actual": 0,
            }
            for member in grp.member_domain_codes
        }

    for row in rows:
        rr = _resolve_row(row)
        if rr.kpi_group_code is None:
            continue
        if rr.kpi_group_code not in group_actuals:
            continue
        grp_code = rr.kpi_group_code
        group_counts[grp_code] += 1
        if rr.domain_code and rr.domain_code in group_members[grp_code]:
            group_members[grp_code][rr.domain_code]["contract_count"] += 1
        if rr.before_vat > 0:
            group_valued[grp_code] += 1
            group_actuals[grp_code] += rr.before_vat
            if rr.domain_code and rr.domain_code in group_members[grp_code]:
                group_members[grp_code][rr.domain_code]["valued_contract_count"] += 1
                group_members[grp_code][rr.domain_code]["actual"] += rr.before_vat
        else:
            group_unresolved[grp_code] += 1

    return _build_snapshot(year, group_actuals, group_counts, group_valued, group_unresolved, group_members)


def _compute_unit_normalized_total_from_rows(
    rows: list[ContractRecordRow], year: int
) -> dict:
    total_actual = 0
    total_count = 0
    kpi_actual = 0
    kpi_count = 0
    non_kpi_actual = 0
    non_kpi_count = 0
    for row in rows:
        rr = _resolve_row(row)
        if rr.before_vat <= 0:
            continue
        total_actual += rr.before_vat
        total_count += 1
        if rr.kpi_group_code:
            kpi_actual += rr.before_vat
            kpi_count += 1
        else:
            non_kpi_actual += rr.before_vat
            non_kpi_count += 1
    return {
        "year": year,
        "total_actual_before_tax": total_actual,
        "total_contract_count": total_count,
        "kpi_groups_actual_before_tax": kpi_actual,
        "kpi_groups_contract_count": kpi_count,
        "non_kpi_field_actual_before_tax": non_kpi_actual,
        "non_kpi_field_contract_count": non_kpi_count,
    }


def _build_snapshot(
    year: int,
    group_actuals: dict[str, int],
    group_counts: dict[str, int],
    group_valued: dict[str, int],
    group_unresolved: dict[str, int],
    group_members: dict[str, dict[str, dict]],
) -> UnitYearSnapshot:
    """Assemble a UnitYearSnapshot from already-computed group aggregates.

    Reads kpi_group_targets via SQL on the same DB session passed in by
    the caller. Kept separate so we can test the pure aggregation logic.
    """
    snapshots: list[KpiGroupSnapshot] = []
    total_target = 0
    total_actual = 0
    total_count = 0
    for grp in kpi_groups():
        target, is_active = _read_target(year, grp.code)
        has_target = is_active and target > 0
        actual = group_actuals.get(grp.code, 0)
        cnt = group_counts.get(grp.code, 0)
        valued = group_valued.get(grp.code, 0)
        unresolved = group_unresolved.get(grp.code, 0)
        progress = (
            round(actual / target * 100, 1) if has_target else None
        )
        snap = KpiGroupSnapshot(
            kpi_group_code=grp.code,
            field_label=label_for_kpi_group(grp.code) or grp.code,
            member_domain_codes=grp.member_domain_codes,
            target_amount=target if has_target else 0,
            actual_before_tax=actual,
            contract_count=cnt,
            valued_contract_count=valued,
            unresolved_value_count=unresolved,
            has_target=has_target,
            progress_percent=progress,
            member_breakdown=list(group_members[grp.code].values()),
        )
        snapshots.append(snap)
        if has_target:
            total_target += target
            total_actual += actual
            total_count += cnt

    completion = (
        round(total_actual / total_target * 100, 1)
        if total_target > 0 else None
    )

    return UnitYearSnapshot(
        year=year,
        groups=snapshots,
        total_target=total_target,
        total_actual=total_actual,
        total_contract_count=total_count,
        completion_percent=completion,
    )


# Module-level target cache — overwritten by tests with monkey-patched
# reader. Keeps get_unit_year_snapshot decoupled from the helper.
_target_reader = None


def _read_target(year: int, group_code: str) -> tuple[int, bool]:
    """Read (target_amount, is_active) for one KPI group/year.

    Overridable via `set_target_reader()` so tests can plug a different
    DB session. Default uses SQLAlchemy text query on the caller's DB.
    """
    if _target_reader is not None:
        return _target_reader(year, group_code)
    raise RuntimeError("kpi_snapshot_service: target reader not configured")


def set_target_reader(fn) -> None:
    """Inject a (year, group_code) -> (amount, is_active) reader.

    The reader MUST return (0, False) when no row exists for that pair.
    """
    global _target_reader
    _target_reader = fn


def default_target_reader(db: Session):
    """Factory: return a closure that reads kpi_group_targets via `db`."""
    def reader(year: int, group_code: str) -> tuple[int, bool]:
        row = db.execute(
            text("""
                SELECT target_amount_before_tax, is_active
                FROM kpi_group_targets
                WHERE reporting_year = :yr AND kpi_group_code = :gc
                LIMIT 1
            """),
            {"yr": year, "gc": group_code},
        ).fetchone()
        if not row:
            return (0, False)
        return (int(row[0] or 0), bool(row[1]))
    return reader


def get_unit_year_snapshot(db: Session, year: int) -> UnitYearSnapshot:
    rows = _load_canonical_rows_for_year(db, year)
    # Install default reader for this call
    set_target_reader(default_target_reader(db))
    snap = _compute_unit_snapshot_from_rows(rows, year)
    set_target_reader(None)
    return snap


# ─── User-scoped view (assignment gating only) ─────────────────────────────

def get_user_year_snapshot(
    db: Session,
    user_id: int,
    year: int,
) -> dict:
    """
    Compose a user-scoped KPI payload.

    - Uses the unit-wide snapshot for ACTUAL.
    - Restricts the visible groups to those assigned to this user/year.
    - Reports `unassigned=True` (and empty groups/totals) if the user has
      no active assignments.
    """
    unit = get_unit_year_snapshot(db, year)

    assignment_rows = db.execute(
        text("""
            SELECT kpi_group_code, is_active
            FROM kpi_group_assignments
            WHERE user_id = :uid AND reporting_year = :yr
        """),
        {"uid": user_id, "yr": year},
    ).fetchall()
    assigned: dict[str, bool] = {str(r[0]): bool(r[1]) for r in assignment_rows}

    if not assigned:
        return {
            "year": year,
            "groups": [],
            "total_target": 0,
            "total_actual": 0,
            "total_contract_count": 0,
            "completion_percent": None,
            "unassigned": True,
        }

    visible_groups: list[dict] = []
    total_target = 0
    total_actual = 0
    total_count = 0
    for grp in unit.groups:
        if grp.kpi_group_code not in assigned:
            continue
        if not assigned[grp.kpi_group_code]:
            # Inactive assignment: show group but zero target, no progress.
            visible_groups.append({
                "kpi_group_code": grp.kpi_group_code,
                "field_label": grp.field_label,
                "member_domain_codes": list(grp.member_domain_codes),
                "target_amount": 0,
                "actual_before_tax": grp.actual_before_tax,
                "contract_count": grp.contract_count,
                "valued_contract_count": grp.valued_contract_count,
                "unresolved_value_count": grp.unresolved_value_count,
                "has_target": False,
                "progress_percent": None,
                "member_breakdown": grp.member_breakdown,
                "is_active": False,
            })
            continue
        # Active assignment: show full row
        visible_groups.append({
            "kpi_group_code": grp.kpi_group_code,
            "field_label": grp.field_label,
            "member_domain_codes": list(grp.member_domain_codes),
            "target_amount": grp.target_amount,
            "actual_before_tax": grp.actual_before_tax,
            "contract_count": grp.contract_count,
            "valued_contract_count": grp.valued_contract_count,
            "unresolved_value_count": grp.unresolved_value_count,
            "has_target": grp.has_target,
            "progress_percent": grp.progress_percent,
            "member_breakdown": grp.member_breakdown,
            "is_active": True,
        })
        if grp.has_target:
            total_target += grp.target_amount
            total_actual += grp.actual_before_tax
            total_count += grp.contract_count

    completion = (
        round(total_actual / total_target * 100, 1)
        if total_target > 0 else None
    )

    return {
        "year": year,
        "groups": visible_groups,
        "total_target": total_target,
        "total_actual": total_actual,
        "total_contract_count": total_count,
        "completion_percent": completion,
        "unassigned": False,
    }


# ─── Service: contracts-only normalized before-VAT total ───────────────────

def get_unit_normalized_total(db: Session, year: int) -> dict:
    """
    Sum normalized before-VAT across ALL canonical contracts (regardless of
    KPI group). Used to render "Tổng giá trị hợp đồng normalized trước
    Thuế GTGT" card without conflating it with KPI group totals.
    """
    win_start, win_end = _year_window(year)
    rows = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.annex_no.is_(None))
        .filter(
            (ContractRecordRow.ngay_lap_hop_dong >= win_start)
            & (ContractRecordRow.ngay_lap_hop_dong < win_end)
            | (
                ContractRecordRow.ngay_lap_hop_dong.is_(None)
                & (ContractRecordRow.contract_year == year)
            )
        )
        .all()
    )
    total_actual = 0
    total_count = 0
    kpi_actual = 0
    kpi_count = 0
    non_kpi_actual = 0
    non_kpi_count = 0
    for row in rows:
        rr = _resolve_row(row)
        if rr.before_vat <= 0:
            continue
        total_actual += rr.before_vat
        total_count += 1
        if rr.kpi_group_code:
            kpi_actual += rr.before_vat
            kpi_count += 1
        else:
            non_kpi_actual += rr.before_vat
            non_kpi_count += 1
    return {
        "year": year,
        "total_actual_before_tax": total_actual,
        "total_contract_count": total_count,
        "kpi_groups_actual_before_tax": kpi_actual,
        "kpi_groups_contract_count": kpi_count,
        "non_kpi_field_actual_before_tax": non_kpi_actual,
        "non_kpi_field_contract_count": non_kpi_count,
    }


__all__ = [
    "ContractRevenueRow",
    "KpiGroupSnapshot",
    "UnitYearSnapshot",
    "get_unit_year_snapshot",
    "get_user_year_snapshot",
    "get_unit_normalized_total",
]