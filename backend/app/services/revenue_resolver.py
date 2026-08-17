"""
Shared revenue resolver — single source of truth for contract revenue values.

Business rules:
- KPI_SIGNED_REVENUE: authoritative measure for KPI group totals (toàn đơn vị).
  Chain: royalty_amount_before_vat → royalty_amount_after_vat → so_tien_value
  Only resolved (positive) values count toward KPI actual.
- BEFORE_VAT_REVENUE: "Doanh thu chưa GTGT" — before-tax amount.
  Chain: royalty_amount_before_vat → royalty_amount_after_vat → so_tien_value
  Returns (amount, value_source, resolution_status).
  Unresolved records are returned with status="unresolved", NOT converted to 0.
- AFTER_VAT_REVENUE: "Doanh thu đã GTGT" — after-tax amount.
  Chain: royalty_amount_after_vat → royalty_amount_before_vat → so_tien_value

Contract eligibility:
- annex_no IS NULL (canonical contracts only)
- contract_year matches the reporting year

For personal revenue (Reports cá nhân / Dashboard cá nhân):
  Additional filter: nguoi_thuc_hien_email = target_user_email
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Literal

from sqlalchemy.orm import Session

from datetime import date
from typing import Tuple

from sqlalchemy import and_

from ..models.contracts import ContractRecordRow


# Canonical year filter — uses ``ngay_lap_hop_dong`` (signed date) only.
# No fallback to ``contract_year``: rows missing a signed date are
# deliberately excluded so a buggy importer can't inflate the KPI total.
SIGNED_DATE_YEAR_BOUNDS: dict[int, Tuple[date, date]] = {}


def signed_date_year_bounds(year: int) -> Tuple[date, date]:
    """Return the [start, end) signed-date window for ``year``."""
    return (date(year, 1, 1), date(year + 1, 1, 1))


def signed_date_year_clause(year: int):
    """SQLAlchemy boolean clause: signed_date in [year-01-01, year+1-01-01)."""
    start, end = signed_date_year_bounds(year)
    return and_(
        ContractRecordRow.ngay_lap_hop_dong >= start,
        ContractRecordRow.ngay_lap_hop_dong < end,
    )


class RevenueBasis(Enum):
    # KPI_SIGNED: baseline chain from kpi_field._signed_actual
    #   after_vat (any non-null) → before_vat (any non-null) → so_tien (any non-null)
    #   Used for KPI actual, does NOT filter by > 0 (matches baseline behavior)
    KPI_SIGNED = "kpi_signed"
    # BEFORE_VAT: "Doanh thu chưa GTGT" — before-tax, positive only
    BEFORE_VAT = "before_vat"
    # AFTER_VAT: "Doanh thu đã GTGT" — after-tax, positive only
    AFTER_VAT = "after_vat"


@dataclass
class RevenueResult:
    amount: int
    value_source: str       # "royalty_amount_before_vat" | "royalty_amount_after_vat" | "so_tien_value" | "null"
    resolution_status: str  # "resolved" | "unresolved"


# ─── Core resolver ────────────────────────────────────────────────────────────

def resolve_contract_revenue(
    row: ContractRecordRow,
    basis: RevenueBasis = RevenueBasis.BEFORE_VAT,
) -> RevenueResult:
    """Return revenue for a single contract row using the specified basis."""
    if basis == RevenueBasis.AFTER_VAT:
        # AFTER_VAT: after_vat first (positive only)
        v = row.royalty_amount_after_vat
        if v is not None and v > 0:
            return RevenueResult(int(v), "royalty_amount_after_vat", "resolved")
        v = row.royalty_amount_before_vat
        if v is not None and v > 0:
            return RevenueResult(int(v), "royalty_amount_before_vat", "resolved")
        v = row.so_tien_value
        if v is not None and v > 0:
            return RevenueResult(int(v), "so_tien_value", "resolved")
        return RevenueResult(0, "null", "unresolved")

    if basis == RevenueBasis.BEFORE_VAT:
        # BEFORE_VAT: before_vat first (positive only)
        v = row.royalty_amount_before_vat
        if v is not None and v > 0:
            return RevenueResult(int(v), "royalty_amount_before_vat", "resolved")
        v = row.royalty_amount_after_vat
        if v is not None and v > 0:
            return RevenueResult(int(v), "royalty_amount_after_vat", "resolved")
        v = row.so_tien_value
        if v is not None and v > 0:
            return RevenueResult(int(v), "so_tien_value", "resolved")
        return RevenueResult(0, "null", "unresolved")

    # KPI_SIGNED: baseline chain — after_vat → before_vat → so_tien
    # Does NOT filter by > 0 (matches kpi_field._signed_actual baseline behavior)
    v = row.royalty_amount_after_vat
    if v is not None:
        return RevenueResult(int(v), "royalty_amount_after_vat", "resolved")
    v = row.royalty_amount_before_vat
    if v is not None:
        return RevenueResult(int(v), "royalty_amount_before_vat", "resolved")
    v = row.so_tien_value
    if v is not None:
        return RevenueResult(int(v), "so_tien_value", "resolved")
    return RevenueResult(0, "null", "unresolved")


def resolve_row_revenue_only(
    row: ContractRecordRow,
    basis: RevenueBasis = RevenueBasis.BEFORE_VAT,
) -> int:
    """Shorthand: return only the amount (int), 0 if unresolved."""
    return resolve_contract_revenue(row, basis).amount


# ─── Batch aggregation helpers ──────────────────────────────────────────────────

def aggregate_revenue_for_rows(
    rows: list[ContractRecordRow],
    basis: RevenueBasis = RevenueBasis.BEFORE_VAT,
) -> dict:
    """
    Aggregate revenue across a list of contract rows.
    Returns:
      {
        "total_amount": int,
        "contract_count": int,
        "valued_contract_count": int,
        "unresolved_value_count": int,
        "value_source_distribution": dict,
        "results": list[RevenueResult],
      }
    """
    total = 0
    valued = 0
    unresolved = 0
    source_dist: dict[str, int] = {}
    results: list[RevenueResult] = []

    for row in rows:
        result = resolve_contract_revenue(row, basis)
        results.append(result)
        if result.resolution_status == "resolved":
            total += result.amount
            valued += 1
        else:
            unresolved += 1
        source_dist[result.value_source] = source_dist.get(result.value_source, 0) + 1

    return {
        "total_amount": total,
        "contract_count": len(rows),
        "valued_contract_count": valued,
        "unresolved_value_count": unresolved,
        "value_source_distribution": source_dist,
        "results": results,
    }


# ─── Public API aliases matching old function names ─────────────────────────────

def get_signed_actual(row: ContractRecordRow) -> int:
    """KPI_SIGNED revenue: positive values only. Returns 0 if unresolved."""
    return resolve_row_revenue_only(row, RevenueBasis.KPI_SIGNED)


def get_before_vat_revenue(row: ContractRecordRow) -> int:
    """BEFORE_VAT revenue: returns 0 if unresolved (call resolve_contract_revenue for status)."""
    return resolve_row_revenue_only(row, RevenueBasis.BEFORE_VAT)


def get_normalized_before_vat(row: ContractRecordRow) -> int:
    """Authoritative before-VAT value for KPI/Reports — uses the shared
    ``normalize_contract_revenue`` resolver. ``so_tien_value`` is NOT
    used as a fallback here, so this number is consistent across all
    Reports/KPI surfaces and the UI card labeled "chưa Thuế GTGT".

    Replaces the old `get_before_vat_revenue` for KPI/Reports surfaces
    where the label says "chưa GTGT". Do NOT use for after-VAT totals.
    """
    return int(normalize_contract_revenue(row).before_vat)


# ─── Normalized revenue (single source of truth for Reports & KPI) ─────────────
#
# ``so_tien_value`` is a legacy column that the import mapper and the
# legacy sync path (see backend/app/api/contracts.py ~line 1168) populate
# with the *after-VAT* total. Falling back to it for BEFORE_VAT would mix
# after-VAT money into the before-VAT total and silently inflate KPIs.
#
# Therefore the normalized resolver for the Reports/KPI surface:
#   1. Use royalty_amount_before_vat when positive.
#   2. If missing but after_vat and vat_amount are positive, derive
#      before = after - vat (algebraically valid for the phase-2 schema).
#   3. Otherwise the record is unresolved (not silently pulled from
#      so_tien_value).

@dataclass
class NormalizedRevenue:
    before_vat: int
    vat_amount: int
    after_vat: int
    before_vat_status: str       # "resolved" | "from_legacy_import" | "unresolved"
    after_vat_status: str        # "resolved" | "unresolved"
    value_source: str            # "phase2_before_vat" | "derived_after_minus_vat" | "legacy_after_vat" | "null"


def normalize_contract_revenue(row: ContractRecordRow) -> NormalizedRevenue:
    """Return (before_vat, vat, after_vat) using only well-defined mappings.

    Falls back to after_vat - vat_amount when before_vat is missing but
    after_vat and vat_amount are positive. ``so_tien_value`` is NOT used
    as a substitute for before_vat because it represents the after-VAT
    total in the legacy import path.
    """
    before = row.royalty_amount_before_vat
    after = row.royalty_amount_after_vat
    vat = row.vat_amount

    if before is not None and before > 0:
        before_n = int(before)
        before_status = "resolved"
        before_source = "phase2_before_vat"
    elif (
        (before is None or before <= 0)
        and after is not None and after > 0
        and vat is not None and vat > 0
    ):
        before_n = int(after - vat)
        before_status = "from_legacy_import"
        before_source = "derived_after_minus_vat"
    else:
        before_n = 0
        before_status = "unresolved"
        before_source = "null"

    vat_n = int(vat) if vat is not None and vat > 0 else 0
    after_n = int(after) if after is not None and after > 0 else 0
    after_status = "resolved" if after_n > 0 else "unresolved"

    return NormalizedRevenue(
        before_vat=before_n,
        vat_amount=vat_n,
        after_vat=after_n,
        before_vat_status=before_status,
        after_vat_status=after_status,
        value_source=before_source,
    )
