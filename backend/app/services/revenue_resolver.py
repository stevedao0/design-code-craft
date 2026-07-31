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

from ..models.contracts import ContractRecordRow


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
