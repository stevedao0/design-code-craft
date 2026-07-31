"""
Employee KPI Portfolio — centralizes employee KPI aggregation.

An employee KPI portfolio is the sum of KPI groups assigned to that employee
via kpi_field_assignments.

Business rules:
- Employee KPI portfolio = sum of assigned KPI group actuals
- Target = sum of assignment.target_amount
- Actual = sum of group actual (unit-wide, NOT filtered by email)
- Scope = assigned KPI groups only
- If no assignments: return "Chưa được phân công"

This replaces _compute_user_kpi_totals with personal_scope=True (which was wrong).
"""
from __future__ import annotations

from sqlalchemy.orm import Session
from sqlalchemy import text

from ..models.contracts import ContractRecordRow
from ..services.revenue_resolver import get_signed_actual


# ─── KPI group resolution helpers (mirrored from kpi_field.py) ──────────────

_KPI_FIELD_GROUPS: dict[str, dict] = {
    "KARAOKE": {
        "label": "Karaoke",
        "member_field_codes": ("KARAOKE", "PHONG_THU_AM"),
    },
    "KHU_VUI_CHOI": {
        "label": "Khu vui chơi",
        "member_field_codes": ("KHU_VUI_CHOI",),
    },
}

_VARIANT_TO_MEMBER: dict[str, str] = {}

def _normalize_label(v: str) -> str:
    """Normalize a label for case/diacritic/space-insensitive matching."""
    import unicodedata
    if not v:
        return ""
    nfkd = unicodedata.normalize("NFKD", v)
    ascii_val = "".join(c for c in nfkd if unicodedata.category(c) != "Mn")
    return ascii_val.lower().replace("_", "").replace(" ", "")

def _init_variant_map():
    global _VARIANT_TO_MEMBER
    _display_variants = {
        "KARAOKE": ("KARAOKE", "Karaoke", "karaoke", "KARAOKE "),
        "PHONG_THU_AM": ("PHONG_THU_AM", "Phòng thu âm", "phong thu am", "phong_thu_am"),
        "KHU_VUI_CHOI": ("KHU_VUI_CHOI", "Khu vui chơi", "Khu vui choi", "KHU VUI CHOI",
                          "khu vui choi", "khu_vui_choi", "ENTERTAINMENT", "entertainment"),
    }
    for member_code, variants in _display_variants.items():
        for variant in variants:
            _VARIANT_TO_MEMBER[_normalize_label(variant)] = member_code

_init_variant_map()

def _variant_to_group(label: str | None) -> str | None:
    """Resolve a stored linh_vuc label to its KPI group code."""
    if not label:
        return None
    member = _VARIANT_TO_MEMBER.get(_normalize_label(label))
    if member is None:
        return None
    for group_code, cfg in _KPI_FIELD_GROUPS.items():
        if member in cfg["member_field_codes"]:
            return group_code
    return None

def _group_to_label(group_code: str) -> str:
    cfg = _KPI_FIELD_GROUPS.get(group_code)
    return cfg["label"] if cfg else group_code


# ─── Core aggregation ───────────────────────────────────────────────────────

def _resolve_actual_for_group(db: Session, year: int, group_code: str) -> dict:
    """Aggregate canonical contracts for one KPI group (unit-wide, no email filter)."""
    cfg = _KPI_FIELD_GROUPS.get(group_code)
    if not cfg:
        return {
            "contract_count": 0,
            "valued_contract_count": 0,
            "unresolved_value_count": 0,
            "actual": 0,
        }

    rows = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.annex_no.is_(None))
        .filter(ContractRecordRow.contract_year == year)
        .all()
    )

    total_count = 0
    total_valued = 0
    total_unresolved = 0
    total_actual = 0

    for row in rows:
        group_for_row = _variant_to_group(row.linh_vuc)
        if group_for_row != group_code:
            continue
        total_count += 1
        val = get_signed_actual(row)
        if val > 0:
            total_valued += 1
            total_actual += val
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
        "groups": [
          {
            "kpi_group_code": str,
            "field_label": str,
            "target_amount": int,
            "actual_amount": int,
            "contract_count": int,
            "valued_contract_count": int,
            "unresolved_value_count": int,
            "progress_percent": float | None,
          },
          ...
        ],
        "total_target": int,
        "total_actual": int,
        "total_contract_count": int,
        "completion_percent": float | None,
        "remaining_amount": int | None,
        "exceeded_amount": int | None,
        "unassigned": bool,  # True if no groups assigned
      }
    """
    # Get KPI group assignments for this user/year
    assignment_rows = db.execute(
        text("""
            SELECT field_code, target_amount
            FROM kpi_field_assignments
            WHERE user_id = :uid AND reporting_year = :yr
              AND (is_active IS NULL OR is_active = TRUE)
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

    # Collect unique group codes from assignments
    assigned_groups: dict[str, int] = {}  # group_code -> target_amount
    for (fc, tgt) in assignment_rows:
        gc = _normalize_label(str(fc)).upper()
        # Map assignment field_code to KPI group
        if gc == "KARAOKE":
            assigned_groups["KARAOKE"] = assigned_groups.get("KARAOKE", 0) + int(tgt or 0)
        elif gc == "KHU_VUI_CHOI":
            assigned_groups["KHU_VUI_CHOI"] = assigned_groups.get("KHU_VUI_CHOI", 0) + int(tgt or 0)
        elif gc in ("PHONG_THU_AM",):
            assigned_groups["KARAOKE"] = assigned_groups.get("KARAOKE", 0) + int(tgt or 0)
        elif gc in ("KHU_VUI_CHOI", "ENTERTAINMENT"):
            assigned_groups["KHU_VUI_CHOI"] = assigned_groups.get("KHU_VUI_CHOI", 0) + int(tgt or 0)
        else:
            # Unknown group — try as-is
            assigned_groups[fc] = assigned_groups.get(fc, 0) + int(tgt or 0)

    groups = []
    total_target = 0
    total_actual = 0
    total_contract_count = 0

    for group_code, target in assigned_groups.items():
        cfg = _KPI_FIELD_GROUPS.get(group_code)
        if not cfg:
            continue
        agg = _resolve_actual_for_group(db, year, group_code)
        actual = agg["actual"]
        progress = round(actual / target * 100, 1) if target and target > 0 else None
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
        })
        total_target += target
        total_actual += actual
        total_contract_count += agg["contract_count"]

    completion = round(total_actual / total_target * 100, 1) if total_target > 0 else None
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
