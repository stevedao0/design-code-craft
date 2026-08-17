"""
Employee KPI Portfolio — centralizes employee KPI aggregation.

REFACTORED (Phase 1.3):
- Uses the canonical `services.domain_registry` for KPI group mapping.
- Uses the authoritative `normalize_contract_revenue` resolver
  (so `so_tien_value` no longer leaks into before-VAT totals).
- Group code resolution delegated to `kpi_snapshot_service`.

Business rules:
- Employee KPI portfolio = sum of assigned KPI group actuals
- Target = sum of assignment.target_amount (kpi_field_assignments legacy)
- Actual = sum of group actual (unit-wide, NOT filtered by email)
- Scope = assigned KPI groups only
- If no assignments: return "Chưa được phân công"
"""
from __future__ import annotations

from sqlalchemy.orm import Session
from sqlalchemy import text

from .domain_registry import (
    kpi_groups,
    kpi_group_member_codes,
    label_for_kpi_group,
    canonicalize_domain,
    get_kpi_group_for_domain,
)
from .revenue_resolver import normalize_contract_revenue, signed_date_year_clause
from ..models.contracts import ContractRecordRow


# Backward-compat: keep aliases so existing imports keep working.
def _normalize_label(v: str | None) -> str:
    """Kept for any external caller; new code should call the registry."""
    if not v:
        return ""
    return canonicalize_domain(v) or v  # registry returns canonical or None


def _variant_to_group(label: str | None) -> str | None:
    return get_kpi_group_for_domain(canonicalize_domain(label))


def _group_to_label(group_code: str) -> str:
    return label_for_kpi_group(group_code) or group_code


def _resolve_actual_for_group(db: Session, year: int, group_code: str) -> dict:
    """
    Aggregate canonical contracts for one KPI group.

    Now delegates to the same resolver as the rest of the system:
    filters `annex_no IS NULL` rows for the year, classifies
    ``linh_vuc`` via canonical domain registry, sums normalized
    before-VAT. ``so_tien_value`` is never used as a fallback.
    """
    if not kpi_group_member_codes(group_code):
        return {
            "contract_count": 0,
            "valued_contract_count": 0,
            "unresolved_value_count": 0,
            "actual": 0,
        }

    rows = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.annex_no.is_(None))
        .filter(signed_date_year_clause(year))
        .all()
    )
    total_count = 0
    total_valued = 0
    total_unresolved = 0
    total_actual = 0
    for row in rows:
        if get_kpi_group_for_domain(canonicalize_domain(row.linh_vuc)) != group_code:
            continue
        total_count += 1
        nr = normalize_contract_revenue(row)
        if nr.before_vat > 0:
            total_valued += 1
            total_actual += nr.before_vat
        else:
            total_unresolved += 1
    return {
        "contract_count": total_count,
        "valued_contract_count": total_valued,
        "unresolved_value_count": total_unresolved,
        "actual": total_actual,
    }


# ─── Public API ─────────────────────────────────────────────────────────────

def get_employee_kpi_portfolio(
    db: Session,
    user_id: int,
    user_email: str,
    year: int,
) -> dict:
    """
    Return the employee KPI portfolio for a given user/year.

    Returns:
      {
        "scope_type": "employee_kpi_portfolio",
        "selected_employee": user_email,
        "reporting_year": year,
        "assigned_kpi_group_codes": ["KARAOKE", "KHU_VUI_CHOI"],
        "groups": [...],
        "total_target": int,
        "total_actual": int,
        ...
        "unassigned": bool,
      }

    NOTE: legacy `kpi_field_assignments` is used as the source of
    per-employee assignment + target. For Phase 1.7+ the migration
    will move this to `kpi_group_assignments` + `kpi_group_targets`.
    During the transition the legacy table is the source of truth for
    assignment; the registry is the source of truth for membership.
    """
    assignment_rows = db.execute(
        text("""
            SELECT field_code, target_amount, is_active
            FROM kpi_field_assignments
            WHERE user_id = :uid AND reporting_year = :yr
        """),
        {"uid": user_id, "yr": year},
    ).fetchall()

    if not assignment_rows:
        return {
            "scope_type": "employee_kpi_portfolio",
            "selected_employee": user_email,
            "reporting_year": year,
            "assigned_kpi_group_codes": [],
            "groups": [],
            "total_target": 0,
            "total_actual": 0,
            "total_contract_count": 0,
            "completion_percent": None,
            "remaining_amount": None,
            "exceeded_amount": None,
            "unassigned": True,
        }

    # Aggregate by KPI group (use the registry's canonical mapping).
    assigned_groups: dict[str, dict[str, int]] = {}
    for fc, tgt, is_active in assignment_rows:
        code = (fc or "").strip().upper()
        # field_code is mapped to KPI group via the registry's membership.
        # We try both direct lookup (KARAOKE → KARAOKE group) and
        # resolution via member_domains (PHONG_THU_AM → KARAOKE group).
        target_group: str | None = None
        # Try direct group lookup first
        if any(g.code == code for g in kpi_groups()):
            target_group = code
        else:
            # Try member-of lookup
            for g in kpi_groups():
                if code in g.member_domain_codes:
                    target_group = g.code
                    break
        if target_group is None:
            continue
        bucket = assigned_groups.setdefault(
            target_group, {"target": 0, "active": True}
        )
        if bool(is_active):
            bucket["target"] += int(tgt or 0)
            bucket["active"] = bucket["active"] and True
        else:
            bucket["active"] = False

    groups = []
    total_target = 0
    total_actual = 0
    total_contract_count = 0

    for group_code in list(assigned_groups.keys()):
        bucket = assigned_groups[group_code]
        agg = _resolve_actual_for_group(db, year, group_code)
        actual = agg["actual"]
        target = bucket["target"] if bucket["active"] else 0
        progress = (
            round(actual / target * 100, 1) if target and target > 0 else None
        )
        gap = (target - actual) if target and target > 0 else None
        remaining = gap if gap is not None and gap > 0 else 0
        exceeded = (-gap) if gap is not None and gap < 0 else 0

        groups.append({
            "kpi_group_code": group_code,
            "field_label": _group_to_label(group_code),
            "target_amount": target,
            "actual_amount": actual,
            "contract_count": agg["contract_count"],
            "valued_contract_count": agg["valued_contract_count"],
            "unresolved_value_count": agg["unresolved_value_count"],
            "progress_percent": progress,
            "remaining": remaining,
            "exceeded": exceeded,
            "is_active": bucket["active"],
        })
        if bucket["active"]:
            total_target += target
            total_actual += actual
            total_contract_count += agg["contract_count"]

    completion = (
        round(total_actual / total_target * 100, 1)
        if total_target > 0 else None
    )
    gap = (total_target - total_actual) if total_target > 0 else None
    remaining = gap if gap is not None and gap > 0 else 0
    exceeded = (-gap) if gap is not None and gap < 0 else 0

    return {
        "scope_type": "employee_kpi_portfolio",
        "selected_employee": user_email,
        "reporting_year": year,
        "assigned_kpi_group_codes": list(assigned_groups.keys()),
        "groups": groups,
        "total_target": total_target,
        "total_actual": total_actual,
        "total_contract_count": total_contract_count,
        "completion_percent": completion,
        "remaining_amount": remaining,
        "exceeded_amount": exceeded,
        "unassigned": False,
    }