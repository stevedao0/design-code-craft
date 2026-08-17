"""
Reports API — read-only aggregation endpoints for the frontend Reports page.

No write operations. No docx export. No GCN creation.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, nullslast, or_, text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from ..core.database import get_db
from ..core.security import decode_access_token, get_user_permissions, security_scheme
from ..models.contracts import ContractRecordRow
from ..models.certificates import CertificateRecordRow
from ..models.user import UserRow
from ..services.report_excel_exporter import export_period_xlsx as build_period_excel
from ..services.revenue_resolver import get_before_vat_revenue, get_signed_actual, normalize_contract_revenue
from ..services.kpi_employee_portfolio import get_employee_kpi_portfolio
from fastapi.security import HTTPAuthorizationCredentials

router = APIRouter(prefix="/api/reports", tags=["reports"])


# =============================================================================
# Response schemas
# =============================================================================

class RevenueYearItem(BaseModel):
    year: int
    contract_count: int
    total_revenue: Optional[int] = None  # None = no data
    cumulative: bool = False


class ExpiringContractItem(BaseModel):
    id: int
    contract_no: str
    partner: str
    field: str
    expire_date: Optional[str] = None
    days_left: int
    value: Optional[int] = None
    # Structured address fields
    usage_ward: Optional[str] = None
    usage_province: Optional[str] = None


class FieldCategoryCount(BaseModel):
    key: str
    label: str
    count: int


class GcnStatusCount(BaseModel):
    status: str  # draft | test_printed | final_printed
    label: str
    count: int


class SignedContractItem(BaseModel):
    id: int
    contract_no: str
    signed_date: Optional[str] = None
    partner: str
    brand: Optional[str] = None
    field: Optional[str] = None
    value: Optional[int] = None
    gcn_status: str  # final_printed | test_printed | draft | no_gcn
    gcn_certificate_no: Optional[str] = None  # actual GCN number if assigned
    renewal_status: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    # Structured address fields
    legal_ward: Optional[str] = None
    legal_province: Optional[str] = None
    usage_ward: Optional[str] = None
    usage_province: Optional[str] = None
    usage_full_address: Optional[str] = None


class CertificateListItem(BaseModel):
    id: int
    certificate_no: Optional[str] = None
    contract_no: str
    organization_name: str
    status: str  # draft | test_printed | final_printed
    print_count: int
    printed_at: Optional[str] = None


class ReportsSummaryResponse(BaseModel):
    # Year context
    selected_year: int = Field(description="Year requested by frontend (defaults to current year)")

    # Contract counts
    contracts_total_all_time: int = Field(description="Total non-annex, non-cancelled contract rows")
    contracts_total_in_year: int = Field(description="Contracts signed (ngay_lap_hop_dong) in selected_year")
    contracts_active: int = Field(description="Contracts active today: end_date >= today, not cancelled/expired/pending_renewal")
    contracts_expiring_30_days: int = Field(description="Active contracts with end_date in [today, today+30d]")
    contracts_expiring_60_days: int = Field(description="Active contracts with end_date in [today, today+60d]")
    contracts_expired: int = Field(description="Contracts expired: end_date < today, not renewed")
    contracts_pending_renewal: int = Field(description="Contracts with renewal_status=PENDING_RENEWAL")

    # Revenue (using so_tien_value from contract_records — same source as Reports/KPI)
    revenue_year: Optional[int] = Field(description="Branch revenue for selected_year")
    revenue_previous_year: Optional[int] = Field(description="Branch revenue for selected_year-1")
    revenue_growth_percent: Optional[float] = Field(description="YoY growth % or null if previous_year=0")

    # User-scoped revenue (KPI totals.actual_amount for the current logged-in user)
    user_email: Optional[str] = None
    user_revenue_year: Optional[int] = Field(description="KPI actual_amount of current user for selected_year")
    user_kpi_contract_count: Optional[int] = Field(description="KPI contract_count for current user")

    # Monthly trend (contracts signed per month in selected_year)
    monthly_trend: list[MonthlyTrendItem] = Field(default_factory=list)

    # Priority contracts (active contracts expiring within 60 days, sorted by end_date)
    priority_contracts: list[ExpiringContractItem] = Field(default_factory=list)

    # Operational signals
    operational_signals: list[OperationalSignalItem] = Field(default_factory=list)

    # Certificate stats (from certificate_records filtered to background domain_group)
    certificates_issued: int = Field(description="Certificates with certificate_no assigned in background domain")
    certificates_draft: int = Field(description="Certificates in draft status in background domain")
    certificates_pending_print: int = Field(description="Certificates issued but not yet final_printed")

    # Legacy / deprecated — kept for backwards compat during transition
    certificate_total: int = 0
    certificate_by_status: list = Field(default_factory=list)
    certificate_recent: list = Field(default_factory=list)
    total_works: int = 0
    gcn_draft: int = 0
    gcn_test_printed: int = 0
    gcn_final_printed: int = 0
    active_count: int = 0
    expiring_30d_count: int = 0
    expiring_60d_count: int = 0
    expired_count: int = 0
    pending_renewal_count: int = 0
    new_count: int = 0
    unknown_status_count: int = 0
    revenue_by_year: list = Field(default_factory=list)
    expiring_contracts: list = Field(default_factory=list)
    field_breakdown: list = Field(default_factory=list)
    signed_contracts: list = Field(default_factory=list)


class MonthlyTrendItem(BaseModel):
    month: int  # 1-12
    year: int
    contract_count: int
    total_revenue: Optional[int] = None


class OperationalSignalItem(BaseModel):
    key: str
    label: str
    sub: str
    value: int
    tone: str  # warning | danger | success | violet


# =============================================================================
# Helpers
# =============================================================================

def _to_iso(value) -> Optional[str]:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return str(value.isoformat())
    return str(value)


def _derived_status_v2(
    renewal_status: Optional[str],
    end_date: Optional[date],
    today: date,
) -> str:
    """Mirrors _derived_status from contracts.py but works with raw values."""
    renewal = str(renewal_status or "").strip().upper()
    if renewal in {"NEW", "PENDING_RENEWAL", "RENEWED"}:
        return renewal.lower()
    if end_date is None:
        return "unknown"
    if end_date < today:
        return "expired"
    if end_date <= today + timedelta(days=60):
        return "expiring"
    return "active"



# Field code canonicalization map (matches kpi_field._resolve_actual)
_FIELD_CANON_MAP = {
    'KHU_VUI_CHOI': 'khu vui choi',
    'Khu vui chơi': 'khu vui choi',
    'ENTERTAINMENT': 'khu vui choi',
    'KARAOKE': 'karaoke',
    'Karaoke': 'karaoke',
    'karaoke': 'karaoke',
    'BACKGROUND': 'background',
    'Background': 'background',
    'background': 'background',
    'PHONG_THU_AM': 'phong thu am',
    'Phòng thu âm': 'phong thu am',
    'BD': 'bd',
    'SCTT': 'sctt',
}


def _normalize_field_for_match(raw: str) -> str:
    """Match kpi_field._normalize_linh_vuc + canon_map lookup."""
    if not raw:
        return ""
    if raw in _FIELD_CANON_MAP:
        return _FIELD_CANON_MAP[raw]
    import unicodedata
    v = unicodedata.normalize('NFKD', raw)
    ascii_val = ''.join(c for c in v if unicodedata.category(c) != 'Mn')
    ascii_val = ascii_val.lower().replace('_', '').replace(' ', '')
    return ascii_val


def _compute_user_kpi_totals(
    db: Session,
    user_id: int,
    user_email: str,
    year: int,
) -> tuple[int, int]:
    """
    Compute user KPI totals.

    Field-based KPI scope (branch-wide, filtered by linh_vuc):
      Sum revenue across ALL contracts whose linh_vuc matches the user's
      assigned fields — regardless of who owns or performs the contract.
      KPIs are unit-wide aggregates per assigned field, not per performer.

    Both paths use the shared BEFORE_VAT revenue chain.
    Returns (actual_amount, contract_count).
    """
    # Field-based KPI scope (branch-wide, filtered by linh_vuc)
    assignment_rows = db.execute(
        text("""
            SELECT field_code FROM kpi_field_assignments
            WHERE user_id = :uid AND reporting_year = :yr
              AND (is_active IS NULL OR is_active = TRUE)
        """),
        {"uid": user_id, "yr": year},
    ).fetchall()

    if not assignment_rows:
        return 0, 0

    canon_keys: set[str] = set()
    for (fc,) in assignment_rows:
        if fc:
            canon_keys.add(_normalize_field_for_match(str(fc)))

    if not canon_keys:
        return 0, 0

    rows = (
        db.query(
            ContractRecordRow.id,
            ContractRecordRow.linh_vuc,
            ContractRecordRow.royalty_amount_after_vat,
            ContractRecordRow.royalty_amount_before_vat,
            ContractRecordRow.so_tien_value,
        )
        .filter(ContractRecordRow.annex_no.is_(None))
        .filter(ContractRecordRow.contract_year == year)
        .all()
    )

    total = 0
    count = 0
    for cid, lv, after, before, so_tien in rows:
        if not lv:
            continue
        if _normalize_field_for_match(str(lv)) not in canon_keys:
            continue
        sentinel = ContractRecordRow(
            royalty_amount_after_vat=after,
            royalty_amount_before_vat=before,
            so_tien_value=so_tien,
        )
        val = get_before_vat_revenue(sentinel)
        if val > 0:
            total += val
            count += 1
    return total, count


# =============================================================================
# GET /api/reports/summary
# =============================================================================

@router.get("/summary", response_model=ReportsSummaryResponse)
def get_reports_summary(
    year: Optional[int] = Query(default=None, ge=2000, le=2100, description="Filter contracts by signing year"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> ReportsSummaryResponse:
    """
    Compute real-time report statistics from the database.

    This is a READ-ONLY endpoint — no DB writes, no file generation, no GCN.

    Logic:
    - Contracts filtered to: annex_no IS NULL, domain_group='background' (matches app GCN source)
    - Active: end_date >= today, not cancelled/expired
    - Revenue uses so_tien_value (canonical field for Reports/KPI)
    - Year filter uses ngay_lap_hop_dong (signing date)

    GCN source: certificate_records filtered to background domain_group.
    This matches ContractsListPage behavior where GCN is shown per contract.
    """
    today = date.today()
    selected_year = year if year else today.year
    today60 = today + timedelta(days=60)
    today30 = today + timedelta(days=30)

    # Resolve current user from credentials (for user-scoped KPI totals)
    current_user = None
    current_user_email = None
    if credentials:
        try:
            from ..core.security import get_bearer_token, decode_access_token
            token = get_bearer_token(credentials)
            username = decode_access_token(token)
            if username:
                current_user = (
                    db.query(UserRow)
                    .filter(func.lower(UserRow.username) == str(username).lower())
                    .first()
                )
                if current_user:
                    current_user_email = str(current_user.username or "")
        except Exception:
            current_user = None
            current_user_email = None

    # Employee KPI portfolio: sum of assigned KPI group actuals
    user_revenue_year = 0
    user_kpi_contract_count = 0
    if current_user and current_user_email:
        portfolio = get_employee_kpi_portfolio(
            db=db,
            user_id=int(current_user.id),
            user_email=current_user_email,
            year=selected_year,
        )
        user_revenue_year = portfolio["total_actual"]
        user_kpi_contract_count = portfolio["total_contract_count"]

    # Fetch all canonical contracts for KPI counts (no domain_group filter — KPI is unit-wide)
    all_rows = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.annex_no.is_(None))
        .all()
    )

    # Count by year from all contracts
    count_by_year: dict[int, int] = {}
    revenue_by_year: dict[int, dict[str, int]] = {}  # year -> {count, total}
    # Initialize last 3 years
    for yr in [today.year - 2, today.year - 1, today.year]:
        revenue_by_year[yr] = {"count": 0, "total": 0}
    # Also init selected year and prev year for revenue
    if selected_year not in revenue_by_year:
        revenue_by_year[selected_year] = {"count": 0, "total": 0}
    prev_year = selected_year - 1
    if prev_year not in revenue_by_year:
        revenue_by_year[prev_year] = {"count": 0, "total": 0}

    # KPI counters
    contracts_total_all_time = len(all_rows)
    contracts_active = 0
    contracts_expiring_30 = 0
    contracts_expiring_60 = 0
    contracts_expired = 0
    contracts_pending_renewal = 0
    contracts_total_in_year = 0

    # Monthly trend for selected_year
    monthly: dict[int, dict[str, int]] = {m: {"count": 0, "total": 0} for m in range(1, 13)}

    # Priority contracts (expiring in 60 days)
    priority_list: list[ExpiringContractItem] = []

    for row in all_rows:
        rs = str(row.renewal_status or "").strip().upper()
        end = row.ngay_ket_thuc
        sign = row.ngay_lap_hop_dong

        # Revenue by year (based on signing date)
        # Business semantics: "Branch revenue" / "Doanh thu chi nhánh" / "Doanh thu KPI năm nay"
        # represent the total payment contractually due (royalty_amount_after_vat).
        # Use KPI_SIGNED chain (after_vat > before_vat > so_tien_value) — matches
        # the kpi_field._signed_actual baseline used by KPI employee portfolio
        # and the resolver.py top-of-file "Authoritative" contract.
        sign_year = getattr(row, "contract_year", None) or (sign.year if sign else None)
        if sign_year and sign_year in revenue_by_year:
            revenue_by_year[sign_year]["count"] += 1
            _val = get_signed_actual(row)
            if _val > 0:
                revenue_by_year[sign_year]["total"] += _val

        # Count by selected year (signing date)
        if sign_year == selected_year:
            contracts_total_in_year += 1
            # Monthly trend
            if sign:
                m = sign.month
                monthly[m]["count"] += 1
                _val = get_signed_actual(row)
                if _val > 0:
                    monthly[m]["total"] += _val

        # Derive status
        if rs in {"NEW", "PENDING_RENEWAL", "RENEWED"}:
            status = rs.lower()
        elif end is None:
            status = "unknown"
        elif end < today:
            status = "expired"
        elif end <= today60:
            status = "expiring"
        else:
            status = "active"

        # Count into buckets
        if status == "active":
            contracts_active += 1
        elif status == "expiring":
            contracts_expiring_60 += 1
            days_left = (end - today).days if end else 0
            if end and end <= today30:
                contracts_expiring_30 += 1
            if end and end <= today60:
                priority_list.append(ExpiringContractItem(
                    id=int(row.id),
                    contract_no=str(row.contract_no or ""),
                    partner=str(row.don_vi_ten or ""),
                    field=str(row.linh_vuc_hien_thi or ""),
                    expire_date=_to_iso(end),
                    days_left=days_left,
                    value=int(row.so_tien_value) if row.so_tien_value is not None else None,
                    usage_ward=str(row.usage_ward or "") or None,
                    usage_province=str(row.usage_province or "") or None,
                ))
        elif status == "expired":
            contracts_expired += 1

        if status == "pending_renewal":
            contracts_pending_renewal += 1

    # Sort priority by end_date
    priority_list.sort(key=lambda x: x.expire_date or "9999-12-31")
    priority_contracts = priority_list[:50]

    # Monthly trend
    monthly_trend = [
        MonthlyTrendItem(month=m, year=selected_year, contract_count=v["count"], total_revenue=v["total"] if v["total"] > 0 else None)
        for m, v in sorted(monthly.items())
    ]

    # Revenue
    ry = revenue_by_year.get(selected_year, {"count": 0, "total": 0})
    rp = revenue_by_year.get(prev_year, {"count": 0, "total": 0})
    rev_year = ry["total"] if ry["total"] > 0 else None
    rev_prev = rp["total"] if rp["total"] > 0 else None
    if rev_prev and rev_prev > 0:
        rev_growth = round((rev_year - rev_prev) / rev_prev * 100, 1) if rev_year else None
    else:
        rev_growth = None

    # ---- Certificate stats (background domain_group only — matches app GCN source) ----
    # Match Reports V2 logic: count distinct contracts in year that have a cert with certificate_no.
    # Use 'latest cert per contract' approach.
    cert_rows = (
        db.query(
            CertificateRecordRow.contract_id,
            CertificateRecordRow.status,
            CertificateRecordRow.certificate_no,
            CertificateRecordRow.certificate_issue_date,
            CertificateRecordRow.created_at,
        )
        .filter(func.lower(func.coalesce(CertificateRecordRow.domain_group, "")) == "background")
        .order_by(
            CertificateRecordRow.contract_id,
            CertificateRecordRow.created_at.desc(),
        )
        .all()
    )
    # cert_map[contract_id] = (status, cert_no) for the latest cert record
    cert_map: dict[int, tuple[str, str | None]] = {}
    for cid, cstatus, ccert_no, _issue_dt, _created in cert_rows:
        if cid in cert_map:
            continue
        cert_map[cid] = (str(cstatus or "draft"), ccert_no)

    # Build contract id set for selected_year (annex_no IS NULL, domain_group=background)
    year_contract_ids = {
        r.id for r in all_rows
        if r.id is not None
        and (getattr(r, "contract_year", None) or (r.ngay_lap_hop_dong.year if r.ngay_lap_hop_dong else None)) == selected_year
    }

    # Count: contracts in year that have a cert with valid certificate_no
    certs_issued = 0
    certs_draft = 0
    for cid in cert_map:
        _status, cert_no = cert_map[cid]
        has_number = bool(cert_no and str(cert_no).strip() not in ("", "-"))
        if cid in year_contract_ids:
            if has_number:
                certs_issued += 1
            else:
                certs_draft += 1
        elif has_number:
            # cert has number but contract not in year — count as draft in dashboard scope
            # but only count if no number assigned
            pass

    # Operational signals
    operational_signals = [
        OperationalSignalItem(
            key="certificates-pending",
            label="GCN chưa cấp số",
            sub="Bản nháp chờ phát hành",
            value=certs_draft,
            tone="warning",
        ),
        OperationalSignalItem(
            key="pending-renewal",
            label="Chờ tái ký",
            sub="Cần theo dõi trước deadline",
            value=contracts_pending_renewal,
            tone="violet",
        ),
        OperationalSignalItem(
            key="expiring-30",
            label="Sắp hết 30 ngày",
            sub="Deadline cận kề",
            value=contracts_expiring_30,
            tone="danger",
        ),
    ]

    return ReportsSummaryResponse(
        selected_year=selected_year,
        user_email=current_user_email,
        user_revenue_year=user_revenue_year,
        user_kpi_contract_count=user_kpi_contract_count,
        contracts_total_all_time=contracts_total_all_time,
        contracts_total_in_year=contracts_total_in_year,
        contracts_active=contracts_active,
        contracts_expiring_30_days=contracts_expiring_30,
        contracts_expiring_60_days=contracts_expiring_60,
        contracts_expired=contracts_expired,
        contracts_pending_renewal=contracts_pending_renewal,
        revenue_year=rev_year,
        revenue_previous_year=rev_prev,
        revenue_growth_percent=rev_growth,
        monthly_trend=monthly_trend,
        priority_contracts=priority_contracts,
        operational_signals=operational_signals,
        certificates_issued=certs_issued,
        certificates_draft=certs_draft,
        certificates_pending_print=0,
    )


# =============================================================================
# GET /api/reports/certificates — list certificates with pagination
# =============================================================================

class CertificateListResponse(BaseModel):
    items: list[CertificateListItem]
    total: int


@router.get("/certificates", response_model=CertificateListResponse)
def list_reports_certificates(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> CertificateListResponse:
    """
    List certificate records for the Reports page GCN table.
    Supports filtering by status (draft, test_printed, final_printed).
    """
    query = db.query(CertificateRecordRow)

    if status_filter:
        query = query.filter(func.lower(CertificateRecordRow.status) == status_filter.lower())

    total = int(query.count())

    offset = (page - 1) * page_size
    rows = (
        query.order_by(CertificateRecordRow.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    items = [
        CertificateListItem(
            id=int(r.certificate_id),
            certificate_no=r.certificate_no,
            contract_no=str(r.contract_no or ""),
            organization_name=str(r.organization_name or ""),
            status=str(r.status or "draft").lower(),
            print_count=int(r.print_count or 0),
            printed_at=_to_iso(r.printed_at) if r.printed_at else None,
        )
        for r in rows
    ]

    return CertificateListResponse(items=items, total=total)


# =============================================================================
# GET /api/reports/contracts/expiring — expiring contracts with pagination
# =============================================================================

class ExpiringContractsResponse(BaseModel):
    items: list[ExpiringContractItem]
    total: int


@router.get("/contracts/expiring", response_model=ExpiringContractsResponse)
def list_expiring_contracts(
    days: int = Query(default=60, ge=7, le=365, description="Expiring within N days"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> ExpiringContractsResponse:
    """
    List contracts expiring within N days (default 60).
    Sorted by end_date ascending.
    """
    today = date.today()
    cutoff = today + timedelta(days=days)

    query = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.annex_no.is_(None))
        .filter(ContractRecordRow.ngay_ket_thuc.is_not(None))
        .filter(ContractRecordRow.ngay_ket_thuc <= cutoff)
        .filter(ContractRecordRow.ngay_ket_thuc >= today)
    )

    total = int(query.count())

    offset = (page - 1) * page_size
    rows = (
        query.order_by(ContractRecordRow.ngay_ket_thuc.asc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    items = [
        ExpiringContractItem(
            id=int(r.id),
            contract_no=str(r.contract_no or ""),
            partner=str(r.don_vi_ten or ""),
            field=str(r.linh_vuc_hien_thi or ""),
            expire_date=_to_iso(r.ngay_ket_thuc),
            days_left=max(0, (r.ngay_ket_thuc - today).days),
            value=int(r.so_tien_value) if r.so_tien_value is not None else None,
        )
        for r in rows
    ]

    return ExpiringContractsResponse(items=items, total=total)


# =============================================================================
# GET /api/reports/contracts/pending — contracts pending action
# =============================================================================

class PendingContractItem(BaseModel):
    id: int
    contract_no: str
    partner: str
    brand: Optional[str] = None
    field: Optional[str] = None
    signed_date: Optional[str] = None
    renewal_status: Optional[str] = None
    value: Optional[int] = None
    nguoi_thuc_hien: Optional[str] = None
    days_pending: int = 0
    category: str  # missing_finance | awaiting_partner | draft | no_gcn | etc.


class PendingContractsResponse(BaseModel):
    items: list[PendingContractItem]
    total: int


@router.get("/contracts/pending", response_model=PendingContractsResponse)
def list_pending_contracts(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    year: Optional[int] = Query(default=None, description="Filter by specific year"),
    employee: Optional[str] = Query(default=None, description="Filter by employee name"),
    field: Optional[str] = Query(default=None, description="Filter by field/domain"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> PendingContractsResponse:
    """
    List contracts that need action:
    - No value (so_tien_value is null or 0) — missing_finance
    - renewal_status = PENDING_RENEWAL — awaiting_partner
    - renewal_status = NEW / draft — draft
    - No certificate record — no_gcn (only for contracts with values)

    Sorted by days_pending descending (most urgent first).
    Supports year filter.
    """
    today = date.today()

    query = db.query(ContractRecordRow).filter(ContractRecordRow.annex_no.is_(None))

    # Year filter - filter by contract_year field
    if year:
        query = query.filter(ContractRecordRow.contract_year == year)

    if employee:
        query = query.filter(ContractRecordRow.nguoi_thuc_hien_email == employee)

    if field:
        query = query.filter(
            (ContractRecordRow.linh_vuc.ilike(f"%{field}%")) |
            (ContractRecordRow.linh_vuc_hien_thi.ilike(f"%{field}%"))
        )

    # Filter: contracts needing action
    query = query.filter(
        or_(
            ContractRecordRow.so_tien_value.is_(None),
            ContractRecordRow.so_tien_value == 0,
            ContractRecordRow.renewal_status == "PENDING_RENEWAL",
            ContractRecordRow.renewal_status == "NEW",
        )
    )

    total = int(query.count())

    offset = (page - 1) * page_size
    rows = (
        query.order_by(nullslast(ContractRecordRow.ngay_lap_hop_dong.asc()))
        .offset(offset)
        .limit(page_size)
        .all()
    )

    # Pre-fetch certificates to detect no_gcn
    contract_ids = [int(r.id) for r in rows]
    cert_contract_ids: set[int] = set()
    if contract_ids:
        cert_q = db.query(CertificateRecordRow.contract_id).filter(
            CertificateRecordRow.contract_id.in_(contract_ids)
        ).distinct().all()
        cert_contract_ids = {cid for (cid,) in cert_q}

    items: list[PendingContractItem] = []
    for r in rows:
        renewal = str(r.renewal_status or "").strip().upper()
        has_value = r.so_tien_value is not None and r.so_tien_value > 0
        has_cert = int(r.id) in cert_contract_ids

        # Determine category
        if not has_value:
            category = "missing_finance"
        elif renewal == "PENDING_RENEWAL":
            category = "awaiting_partner"
        elif renewal == "NEW":
            category = "draft"
        elif not has_cert:
            category = "no_gcn"
        else:
            category = "awaiting_partner"

        # Days pending: based on signed_date or contract creation
        signed_date = r.ngay_lap_hop_dong
        if signed_date:
            days_pending = (today - signed_date).days
        else:
            days_pending = 0

        items.append(PendingContractItem(
            id=int(r.id),
            contract_no=str(r.contract_no or ""),
            partner=str(r.don_vi_ten or ""),
            brand=str(r.ten_bang_hieu or ""),
            field=str(r.linh_vuc_hien_thi or ""),
            signed_date=_to_iso(signed_date),
            renewal_status=r.renewal_status,
            value=int(r.so_tien_value) if r.so_tien_value is not None else None,
            nguoi_thuc_hien=str(r.nguoi_thuc_hien_email or ""),
            days_pending=days_pending,
            category=category,
        ))

    return PendingContractsResponse(items=items, total=total)


class SignedContractsResponse(BaseModel):
    items: list[SignedContractItem]
    total: int
    total_value: int = 0
    average_value: int = 0
    applied_scope: str = "year"
    applied_date_from: str
    applied_date_to: str


def _get_calendar_period_range(*, today: date, scope: Optional[str]) -> tuple[date, date]:
    normalized_scope = str(scope or "year").strip().lower()
    if normalized_scope == "week":
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=6)
        return start, end
    if normalized_scope == "month":
        start = today.replace(day=1)
        if today.month == 12:
            end = date(today.year + 1, 1, 1) - timedelta(days=1)
        else:
            end = date(today.year, today.month + 1, 1) - timedelta(days=1)
        return start, end
    if normalized_scope == "quarter":
        quarter_start_month = ((today.month - 1) // 3) * 3 + 1
        start = date(today.year, quarter_start_month, 1)
        if quarter_start_month == 10:
            end = date(today.year + 1, 1, 1) - timedelta(days=1)
        else:
            end = date(today.year, quarter_start_month + 3, 1) - timedelta(days=1)
        return start, end
    return date(today.year, 1, 1), date(today.year, 12, 31)


@router.get("/contracts/signed", response_model=SignedContractsResponse)
def list_signed_contracts(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    scope: Optional[str] = Query(default="month", description="week|month|quarter|year"),
    year: Optional[int] = Query(default=None, description="Filter by specific year"),
    employee: Optional[str] = Query(default=None, description="Filter by employee"),
    field: Optional[str] = Query(default=None, description="Filter by field"),
    date_from: Optional[str] = Query(default=None, description="Start date filter (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(default=None, description="End date filter (YYYY-MM-DD)"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> SignedContractsResponse:
    """
    List signed contracts (has value) with optional filtering.
    Supports both year filter and time scope filter.
    """
    today = date.today()
    applied_scope = str(scope or "year").strip().lower() if scope else ("custom" if date_from or date_to else "year")
    if date_from or date_to:
        resolved_from = datetime.strptime(date_from, "%Y-%m-%d").date() if date_from else None
        resolved_to = datetime.strptime(date_to, "%Y-%m-%d").date() if date_to else None
        if resolved_from and resolved_to:
            range_from, range_to = resolved_from, resolved_to
        elif resolved_from:
            range_from, range_to = resolved_from, resolved_from
        elif resolved_to:
            range_from, range_to = resolved_to, resolved_to
        else:
            range_from, range_to = date(today.year, 1, 1), date(today.year, 12, 31)
        applied_scope = "custom"
    elif scope:
        range_from, range_to = _get_calendar_period_range(today=today, scope=scope)
    elif year:
        range_from, range_to = date(year, 1, 1), date(year, 12, 31)
    else:
        range_from, range_to = date(today.year, 1, 1), date(today.year, 12, 31)

    query = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.annex_no.is_(None))
        .filter(ContractRecordRow.ngay_lap_hop_dong.isnot(None))
        .filter(ContractRecordRow.so_tien_value.isnot(None))
        .filter(ContractRecordRow.so_tien_value > 0)
        .filter(ContractRecordRow.ngay_lap_hop_dong >= range_from)
        .filter(ContractRecordRow.ngay_lap_hop_dong <= range_to)
    )

    if employee:
        query = query.filter(ContractRecordRow.nguoi_thuc_hien_email == employee)

    if field:
        query = query.filter(
            (ContractRecordRow.linh_vuc.ilike(f"%{field}%")) |
            (ContractRecordRow.linh_vuc_hien_thi.ilike(f"%{field}%"))
        )

    total = int(query.count())
    total_value = int(query.with_entities(func.coalesce(func.sum(ContractRecordRow.so_tien_value), 0)).scalar() or 0)
    average_value = int(round(total_value / total)) if total > 0 else 0

    offset = (page - 1) * page_size
    rows = (
        query.order_by(ContractRecordRow.ngay_lap_hop_dong.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    # Pre-fetch certificate statuses and numbers
    contract_ids = [int(r.id) for r in rows]
    cert_map_signed: dict[int, str] = {}
    cert_no_map_signed: dict[int, Optional[str]] = {}
    if contract_ids:
        cert_all = db.query(
            CertificateRecordRow.contract_id,
            CertificateRecordRow.status,
            CertificateRecordRow.certificate_no,
            CertificateRecordRow.created_at
        ).filter(
            CertificateRecordRow.contract_id.in_(contract_ids)
        ).order_by(
            CertificateRecordRow.contract_id,
            CertificateRecordRow.created_at.desc()
        ).all()
        for cid, cstatus, cert_no, _ in cert_all:
            if cid not in cert_map_signed:
                cert_map_signed[cid] = str(cstatus or "draft").lower() if cstatus else "draft"
                cert_no_map_signed[cid] = cert_no if cert_no else None

    items: list[SignedContractItem] = []
    for r in rows:
        cert_status = cert_map_signed.get(int(r.id), "no_gcn")
        items.append(SignedContractItem(
            id=int(r.id),
            contract_no=str(r.contract_no or ""),
            signed_date=_to_iso(r.ngay_lap_hop_dong),
            partner=str(r.don_vi_ten or ""),
            brand=str(r.ten_bang_hieu or ""),
            field=str(r.linh_vuc_hien_thi or ""),
            value=int(r.so_tien_value),
            gcn_status=cert_status,
            gcn_certificate_no=cert_no_map_signed.get(int(r.id)),
            renewal_status=r.renewal_status,
            start_date=_to_iso(r.ngay_bat_dau),
            end_date=_to_iso(r.ngay_ket_thuc),
            legal_ward=str(r.legal_ward or "") or None,
            legal_province=str(r.legal_province or "") or None,
            usage_ward=str(r.usage_ward or "") or None,
            usage_province=str(r.usage_province or "") or None,
            usage_full_address=str(r.usage_full_address or "") or None,
        ))

    return SignedContractsResponse(
        items=items,
        total=total,
        total_value=total_value,
        average_value=average_value,
        applied_scope=applied_scope,
        applied_date_from=range_from.isoformat(),
        applied_date_to=range_to.isoformat(),
    )


# =============================================================================
# GET /api/reports/contracts/signed/export — export signed contracts to Excel
# =============================================================================

@router.get("/contracts/signed/export-xlsx")
def export_signed_contracts_xlsx(
    scope: Optional[str] = Query(default="month", description="week|month|quarter|year"),
    year: Optional[int] = Query(default=None, description="Filter by specific year"),
    employee: Optional[str] = Query(default=None, description="Filter by employee"),
    field: Optional[str] = Query(default=None, description="Filter by field"),
    mode: Optional[str] = Query(default="contract", description="contract|detail"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    """
    Export signed contracts to Excel (.xlsx).
    Supports two modes:
      - mode=contract (default): one row per contract; area info summarized
      - mode=detail: one row per music usage area (legacy behavior)
    """
    today = date.today()
    if scope:
        date_from, date_to = _get_calendar_period_range(today=today, scope=scope)
    elif year:
        date_from, date_to = date(year, 1, 1), date(year, 12, 31)
    else:
        date_from, date_to = date(today.year, 1, 1), date(today.year, 12, 31)

    query = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.annex_no.is_(None))
        .filter(ContractRecordRow.ngay_lap_hop_dong.isnot(None))
        .filter(ContractRecordRow.so_tien_value.isnot(None))
        .filter(ContractRecordRow.so_tien_value > 0)
        .filter(ContractRecordRow.ngay_lap_hop_dong >= date_from)
        .filter(ContractRecordRow.ngay_lap_hop_dong <= date_to)
    )

    if employee:
        query = query.filter(ContractRecordRow.nguoi_thuc_hien_email == employee)

    if field:
        query = query.filter(
            (ContractRecordRow.linh_vuc.ilike(f"%{field}%")) |
            (ContractRecordRow.linh_vuc_hien_thi.ilike(f"%{field}%"))
        )

    rows = query.order_by(ContractRecordRow.ngay_lap_hop_dong.desc()).all()

    # Pre-fetch GCN numbers for contract rows
    contract_ids = [int(r.id) for r in rows]
    gcn_map: dict[int, str] = {}
    if contract_ids:
        from ..models.certificates import CertificateRecordRow
        cert_rows = (
            db.query(CertificateRecordRow.certificate_id, CertificateRecordRow.contract_id, CertificateRecordRow.certificate_no)
            .filter(CertificateRecordRow.contract_id.in_(contract_ids))
            .all()
        )
        for cert in cert_rows:
            cid = int(cert.contract_id) if cert.contract_id else None
            if cid:
                gcn_map[cid] = str(cert.certificate_no or "")

    # Build export data
    contracts = []
    seen_ids: set[int] = set()
    for r in rows:
        row_id = int(r.id)
        if row_id in seen_ids:
            continue
        seen_ids.add(row_id)

        status = _derived_status_v2(r.renewal_status, r.ngay_ket_thuc, today)
        status_labels = {
            "active": "Hoạt động",
            "expiring": "Sắp hết hạn",
            "expired": "Hết hạn",
            "pending_renewal": "Chờ gia hạn",
            "new": "Mới",
            "unknown": "Không xác định",
        }
        domain_raw = str(r.linh_vuc_hien_thi or "")
        if domain_raw:
            from ..services.report_excel_exporter import normalize_domain_label_for_report
            domain_normalized = normalize_domain_label_for_report(domain_raw)
        else:
            domain_normalized = "Không xác định"

        # Money source: Phase 2 royalty fields with legacy fallback
        royalty_before = getattr(r, "royalty_amount_before_vat", None) or 0
        royalty_after = getattr(r, "royalty_amount_after_vat", None) or 0
        legacy_before = r.so_tien_value or 0
        so_tien = royalty_before if royalty_before > 0 else legacy_before
        vat_rate = r.vat_rate or 0
        vat_amount = int(so_tien * vat_rate / 100) if vat_rate else 0
        total = royalty_after if royalty_after > 0 else (so_tien + vat_amount)

        # GCN number
        gcn_no = gcn_map.get(row_id, "")

        # Get music_usage_areas (normalized)
        from ..services.normalize_music_usage_areas import normalize_music_usage_areas
        music_areas = normalize_music_usage_areas(r)

        contracts.append({
            "contract_no": str(r.contract_no or ""),
            "year": str(r.contract_year or ""),
            "customer_name": str(r.don_vi_ten or ""),
            "ten_bang_hieu": str(r.ten_bang_hieu or ""),
            "domain": domain_normalized,
            "status": status_labels.get(status, status),
            "start_date": _to_iso(r.ngay_bat_dau),
            "end_date": _to_iso(r.ngay_ket_thuc),
            "so_tien_value": so_tien,
            "vat_rate": vat_rate,
            "vat_amount": vat_amount,
            "total": total,
            "nguoi_thuc_hien": str(r.nguoi_thuc_hien_email or ""),
            "signed_date": _to_iso(r.ngay_lap_hop_dong),
            "music_usage_areas": music_areas,
            "row_contract": r,
            "gcn_no": gcn_no,
            # Structured address fields
            "usage_ward": str(r.usage_ward or "") or None,
            "usage_province": str(r.usage_province or "") or None,
            "usage_full_address": str(r.usage_full_address or "") or None,
            "legal_ward": str(r.legal_ward or "") or None,
            "legal_province": str(r.legal_province or "") or None,
        })

    # Build filter info
    filters = {}
    if year:
        filters["Năm"] = str(year)
    if scope:
        filters["Phạm vi"] = scope
    if employee:
        filters["Nhân viên"] = employee
    if field:
        filters["Lĩnh vực"] = field

    is_detail = mode == "detail"
    if is_detail:
        expanded_contracts = _expand_contracts_with_music_areas(contracts)
        buffer = export_contracts_report_xlsx(
            expanded_contracts, filters,
            has_music_areas=True,
            filename_suffix="_chi_tiet",
        )
        filename = _get_export_filename("hop_dong_da_ky_chi_tiet")
    else:
        # Contract-level: summarize area info into cells (no row expansion)
        for c in contracts:
            areas = c.get("music_usage_areas") or []
            area_names = "; ".join(
                a.get("area_name", "") for a in areas if a.get("area_name")
            )
            scale_descs = "; ".join(
                a.get("scale_description", "") for a in areas if a.get("scale_description")
            )
            usage_types = "; ".join(
                dict.fromkeys(a.get("music_usage_type", "") for a in areas if a.get("music_usage_type"))
            )
            notes = "; ".join(
                a.get("note", "") for a in areas if a.get("note")
            )
            c["area_name"] = area_names
            c["scale_description"] = scale_descs
            c["music_usage_type"] = usage_types
            c["note"] = notes
        # Remove non-serializable fields
        for c in contracts:
            c.pop("music_usage_areas", None)
            c.pop("row_contract", None)
        buffer = export_contracts_report_xlsx(
            contracts, filters,
            has_music_areas=True,
            filename_suffix="_tom_tat",
        )
        filename = _get_export_filename("hop_dong_da_ky_tom_tat")

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# =============================================================================
# GET /api/reports/contracts/pending/export — export pending contracts to Excel
# =============================================================================

@router.get("/contracts/pending/export-xlsx")
def export_pending_contracts_xlsx(
    year: Optional[int] = Query(default=None, description="Filter by specific year"),
    employee: Optional[str] = Query(default=None, description="Filter by employee"),
    field: Optional[str] = Query(default=None, description="Filter by field"),
    mode: Optional[str] = Query(default="contract", description="contract|detail"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    """
    Export pending contracts (missing data) to Excel (.xlsx).
    Supports mode=contract (default, one row per contract) or mode=detail (one row per area).
    """
    try:
        query = db.query(ContractRecordRow).filter(ContractRecordRow.annex_no.is_(None))

        if year:
            query = query.filter(ContractRecordRow.contract_year == year)

        if employee:
            query = query.filter(ContractRecordRow.nguoi_thuc_hien_email == employee)

        if field:
            query = query.filter(
                (ContractRecordRow.linh_vuc.ilike(f"%{field}%")) |
                (ContractRecordRow.linh_vuc_hien_thi.ilike(f"%{field}%"))
            )

        # Filter: contracts needing action
        query = query.filter(
            or_(
                ContractRecordRow.so_tien_value.is_(None),
                ContractRecordRow.so_tien_value == 0,
                ContractRecordRow.renewal_status == "PENDING_RENEWAL",
                ContractRecordRow.renewal_status == "NEW",
            )
        )

        rows = query.order_by(nullslast(ContractRecordRow.ngay_lap_hop_dong.asc())).all()

        # Pre-fetch GCN numbers
        contract_ids = [int(r.id) for r in rows]
        gcn_map: dict[int, str] = {}
        if contract_ids:
            from ..models.certificates import CertificateRecordRow
            cert_rows = (
                db.query(CertificateRecordRow.certificate_id, CertificateRecordRow.contract_id, CertificateRecordRow.certificate_no)
                .filter(CertificateRecordRow.contract_id.in_(contract_ids))
                .all()
            )
            for cert in cert_rows:
                cid = int(cert.contract_id) if cert.contract_id else None
                if cid:
                    gcn_map[cid] = str(cert.certificate_no or "")

        # Build export data with dedup
        contracts = []
        seen_ids: set[int] = set()
        for r in rows:
            rid = int(r.id)
            if rid in seen_ids:
                continue
            seen_ids.add(rid)

            renewal = str(r.renewal_status or "").strip().upper()
            has_value = r.so_tien_value is not None and r.so_tien_value > 0

            if not has_value:
                category = "Thiếu dữ liệu tài chính"
            elif renewal == "PENDING_RENEWAL":
                category = "Chờ phản hồi tái ký"
            elif renewal == "NEW":
                category = "Bản nháp"
            else:
                category = "Cần xử lý"

            domain_raw = str(r.linh_vuc_hien_thi or "")
            if domain_raw:
                from ..services.report_excel_exporter import normalize_domain_label_for_report
                domain_normalized = normalize_domain_label_for_report(domain_raw)
            else:
                domain_normalized = "Không xác định"

            # Phase 2 money source priority
            royalty_before = getattr(r, "royalty_amount_before_vat", None) or 0
            royalty_after = getattr(r, "royalty_amount_after_vat", None) or 0
            legacy_before = r.so_tien_value or 0
            so_tien = royalty_before if royalty_before > 0 else legacy_before
            vat_rate = r.vat_rate or 0
            vat_amount = int(so_tien * vat_rate / 100) if vat_rate else 0
            total = royalty_after if royalty_after > 0 else (so_tien + vat_amount)

            # GCN number
            gcn_no = gcn_map.get(rid, "")

            # Get music_usage_areas (normalized)
            from ..services.normalize_music_usage_areas import normalize_music_usage_areas
            music_areas = normalize_music_usage_areas(r)

            contracts.append({
                "contract_no": str(r.contract_no or ""),
                "year": str(r.contract_year or ""),
                "customer_name": str(r.don_vi_ten or ""),
                "ten_bang_hieu": str(r.ten_bang_hieu or ""),
                "domain": domain_normalized,
                "status": category,
                "nguoi_thuc_hien": str(r.nguoi_thuc_hien_email or ""),
                "signed_date": _to_iso(r.ngay_lap_hop_dong),
                "end_date": _to_iso(r.ngay_ket_thuc),
                "start_date": _to_iso(r.ngay_bat_dau),
                "so_tien_value": so_tien,
                "vat_rate": vat_rate,
                "vat_amount": vat_amount,
                "total": total,
                "renewal_status": r.renewal_status or "",
                "music_usage_areas": music_areas,
                "row_contract": r,
                "gcn_no": gcn_no,
                # Structured address fields
                "usage_ward": str(r.usage_ward or "") or None,
                "usage_province": str(r.usage_province or "") or None,
                "usage_full_address": str(r.usage_full_address or "") or None,
                "legal_ward": str(r.legal_ward or "") or None,
                "legal_province": str(r.legal_province or "") or None,
            })

        # Build filter info
        filters = {}
        if year:
            filters["Năm"] = str(year)
        if employee:
            filters["Nhân viên"] = employee
        if field:
            filters["Lĩnh vực"] = field

        is_detail = mode == "detail"
        if is_detail:
            expanded_contracts = _expand_contracts_with_music_areas(contracts)
            buffer = export_contracts_report_xlsx(
                expanded_contracts, filters,
                has_music_areas=True,
                filename_suffix="_chi_tiet",
            )
            filename = _get_export_filename("hop_dong_cho_xu_ly_chi_tiet")
        else:
            for c in contracts:
                areas = c.get("music_usage_areas") or []
                c["area_name"] = "; ".join(a.get("area_name", "") for a in areas if a.get("area_name"))
                c["scale_description"] = "; ".join(a.get("scale_description", "") for a in areas if a.get("scale_description"))
                c["music_usage_type"] = "; ".join(dict.fromkeys(a.get("music_usage_type", "") for a in areas if a.get("music_usage_type")))
                c["note"] = "; ".join(a.get("note", "") for a in areas if a.get("note"))
            for c in contracts:
                c.pop("music_usage_areas", None)
                c.pop("row_contract", None)
            buffer = export_contracts_report_xlsx(
                contracts, filters,
                has_music_areas=True,
                filename_suffix="_tom_tat",
            )
            filename = _get_export_filename("hop_dong_cho_xu_ly_tom_tat")

        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as exc:
        import traceback
        logger.error("[PENDING_EXPORT] Export failed", exc_info=True)
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=500,
            content={"detail": f"[PENDING_EXPORT] {type(exc).__name__}: {exc}"},
        )


# =============================================================================
# EXPORT ENDPOINTS — Excel (.xlsx) generation
# =============================================================================

from datetime import datetime
from fastapi.responses import StreamingResponse

from ..services.report_excel_exporter import (
    export_contracts_report_xlsx,
    export_expiring_contracts_xlsx,
    export_revenue_summary_xlsx,
    export_period_xlsx,
)


def _format_date(dt: date) -> str:
    """Format date as DD/MM/YYYY."""
    return dt.strftime("%d/%m/%Y")


def _get_export_filename(prefix: str) -> str:
    """Generate export filename with current date."""
    today = datetime.now().strftime("%Y%m%d")
    return f"{prefix}_{today}.xlsx"


def _build_contract_dict(row, gcn_map: Optional[dict[int, str]] = None) -> dict:
    """Convert ContractRecordRow to dict for export."""
    status = _derived_status_v2(row.renewal_status, row.ngay_ket_thuc, date.today())

    # Format status for display
    status_labels = {
        "active": "Hoạt động",
        "expiring": "Sắp hết hạn",
        "expired": "Hết hạn",
        "pending_renewal": "Chờ gia hạn",
        "new": "Mới",
        "unknown": "Không xác định",
    }

    # Normalize domain label
    domain_raw = str(row.linh_vuc_hien_thi or "")
    if domain_raw:
        from ..services.report_excel_exporter import normalize_domain_label_for_report
        domain_normalized = normalize_domain_label_for_report(domain_raw)
    else:
        domain_normalized = "Không xác định"

    # Phase 2 money source priority
    royalty_before = getattr(row, "royalty_amount_before_vat", None) or 0
    royalty_after = getattr(row, "royalty_amount_after_vat", None) or 0
    legacy_before = row.so_tien_value or 0
    so_tien = royalty_before if royalty_before > 0 else legacy_before
    vat_rate = row.vat_rate or 0
    vat_amount = int(so_tien * vat_rate / 100) if vat_rate else 0
    total = royalty_after if royalty_after > 0 else (so_tien + vat_amount)

    # GCN number
    row_id = int(row.id)
    gcn_no = ""
    if gcn_map:
        gcn_no = gcn_map.get(row_id, "")

    # Get music_usage_areas (normalized)
    from ..services.normalize_music_usage_areas import normalize_music_usage_areas
    music_areas = normalize_music_usage_areas(row)

    return {
        "contract_no": str(row.contract_no or ""),
        "year": str(row.contract_year or ""),
        "customer_name": str(row.don_vi_ten or ""),
        "ten_bang_hieu": str(row.ten_bang_hieu or ""),
        "domain": domain_normalized,
        "status": status_labels.get(status, status),
        "start_date": _to_iso(row.ngay_bat_dau),
        "end_date": _to_iso(row.ngay_ket_thuc),
        "so_tien_value": so_tien,
        "vat_rate": vat_rate,
        "vat_amount": vat_amount,
        "total": total,
        "nguoi_thuc_hien": str(row.nguoi_thuc_hien_email or ""),
        "music_usage_areas": music_areas,
        "row_contract": row,
        "gcn_no": gcn_no,
        # Structured address fields
        "usage_ward": str(row.usage_ward or "") or None,
        "usage_province": str(row.usage_province or "") or None,
        "usage_full_address": str(row.usage_full_address or "") or None,
        "legal_ward": str(row.legal_ward or "") or None,
        "legal_province": str(row.legal_province or "") or None,
    }


def _expand_contracts_with_music_areas(contracts: list[dict]) -> list[dict]:
    """
    Expand contracts that have multiple music_usage_areas into multiple rows.

    Each area becomes a separate Excel row. Contract info repeats.
    If no areas, creates 1 row with empty area fields.
    """
    expanded = []
    for c in contracts:
        areas = c.get("music_usage_areas") or []
        if not areas:
            row = {k: v for k, v in c.items() if k != "music_usage_areas" and k != "row_contract"}
            row["area_name"] = ""
            row["scale_description"] = ""
            row["music_usage_type"] = ""
            row["note"] = ""
            expanded.append(row)
        else:
            for area in areas:
                row = {k: v for k, v in c.items() if k != "music_usage_areas" and k != "row_contract"}
                row["area_name"] = area.get("area_name", "")
                row["scale_description"] = area.get("scale_description", "")
                row["music_usage_type"] = area.get("music_usage_type", "")
                row["note"] = area.get("note", "")
                expanded.append(row)
    return expanded


def _expand_full_data_with_music_areas(contracts: list[dict]) -> list[dict]:
    """
    Expand full-data contracts that have multiple music_usage_areas into multiple rows.

    For full-data export, we keep all the original template columns and add
    music_usage_areas columns at the end.
    """
    expanded = []
    for c in contracts:
        areas = c.get("music_usage_areas") or []
        if not areas:
            row = {k: v for k, v in c.items() if k != "music_usage_areas" and k != "row_contract"}
            row["area_name"] = ""
            row["scale_description"] = ""
            row["music_usage_type"] = ""
            row["note"] = ""
            expanded.append(row)
        else:
            for area in areas:
                row = {k: v for k, v in c.items() if k != "music_usage_areas" and k != "row_contract"}
                row["area_name"] = area.get("area_name", "")
                row["scale_description"] = area.get("scale_description", "")
                row["music_usage_type"] = area.get("music_usage_type", "")
                row["note"] = area.get("note", "")
                expanded.append(row)
    return expanded


def _build_expiring_dict(row, days_left: int, gcn_map: Optional[dict[int, str]] = None) -> dict:
    """Convert ContractRecordRow to dict for expiring export."""
    status = _derived_status_v2(row.renewal_status, row.ngay_ket_thuc, date.today())

    status_labels = {
        "expiring": "Sắp hết hạn",
        "expired": "Hết hạn",
    }

    # Normalize domain label
    domain_raw = str(row.linh_vuc_hien_thi or "")
    if domain_raw:
        from ..services.report_excel_exporter import normalize_domain_label_for_report
        domain_normalized = normalize_domain_label_for_report(domain_raw)
    else:
        domain_normalized = "Không xác định"

    # Phase 2 money source priority
    royalty_before = getattr(row, "royalty_amount_before_vat", None) or 0
    royalty_after = getattr(row, "royalty_amount_after_vat", None) or 0
    legacy_before = row.so_tien_value or 0
    so_tien = royalty_before if royalty_before > 0 else legacy_before
    vat_rate = row.vat_rate or 0
    vat_amount = int(so_tien * vat_rate / 100) if vat_rate else 0
    total = royalty_after if royalty_after > 0 else (so_tien + vat_amount)

    # GCN number
    row_id = int(row.id)
    gcn_no = gcn_map.get(row_id, "") if gcn_map else ""

    return {
        "id": int(row.id),
        "contract_no": str(row.contract_no or ""),
        "gcn_no": gcn_no,
        "partner": str(row.don_vi_ten or ""),
        "field": domain_normalized,
        "expire_date": _to_iso(row.ngay_ket_thuc),
        "days_left": days_left,
        "status": status_labels.get(status, status),
        "nguoi_phu_trach": str(row.nguoi_thuc_hien_email or ""),
        "so_tien_value": so_tien,
        "vat_rate": vat_rate,
        "vat_amount": vat_amount,
        "total": total,
        # Structured address fields
        "usage_ward": str(row.usage_ward or "") or None,
        "usage_province": str(row.usage_province or "") or None,
        "usage_full_address": str(row.usage_full_address or "") or None,
        "legal_ward": str(row.legal_ward or "") or None,
        "legal_province": str(row.legal_province or "") or None,
    }


@router.get("/contracts/export-xlsx")
def export_contracts_xlsx(
    q: Optional[str] = Query(default=None, description="Search keyword"),
    year: Optional[int] = Query(default=None, description="Contract year"),
    domain: Optional[str] = Query(default=None, description="Domain/linh vuc"),
    status: Optional[str] = Query(default=None, description="Status filter"),
    date_from: Optional[str] = Query(default=None, description="Start date filter (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(default=None, description="End date filter (YYYY-MM-DD)"),
    mode: Optional[str] = Query(default="contract", description="contract|detail"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    """
    Export contracts list to Excel (.xlsx).
    Supports mode=contract (default, one row per contract) or mode=detail (one row per area).
    """
    from fastapi.responses import JSONResponse
    from ..core.security import decode_access_token, get_user_permissions
    from ..services.contract_permissions import apply_contract_visibility
    from ..models.user import UserRow
    
    try:
        # Auth
        user = None
        permissions = []
        if credentials:
            token = credentials.credentials
            username = decode_access_token(token)
            user = db.query(UserRow).filter(func.lower(UserRow.username) == username.lower()).first()
            if user:
                permissions = get_user_permissions(db, user)
        
        # Build query
        query = db.query(ContractRecordRow).filter(ContractRecordRow.annex_no.is_(None))
        query = apply_contract_visibility(query=query, user=user, permissions=permissions, db=db)
        
        # Apply filters
        if q:
            search_term = f"%{q}%"
            query = query.filter(
                ContractRecordRow.contract_no.ilike(search_term) |
                ContractRecordRow.don_vi_ten.ilike(search_term) |
                ContractRecordRow.ten_bang_hieu.ilike(search_term) |
                ContractRecordRow.dia_chi_su_dung.ilike(search_term)
            )
        
        if year:
            query = query.filter(ContractRecordRow.contract_year == year)
        
        if domain:
            query = query.filter(
                (ContractRecordRow.linh_vuc.ilike(f"%{domain}%")) |
                (ContractRecordRow.linh_vuc_hien_thi.ilike(f"%{domain}%"))
            )
        
        if status:
            today = date.today()
            if status == "active":
                query = query.filter(
                    (ContractRecordRow.ngay_ket_thuc.is_(None)) |
                    (ContractRecordRow.ngay_ket_thuc > today + timedelta(days=60))
                )
            elif status == "expiring":
                query = query.filter(
                    ContractRecordRow.ngay_ket_thuc.is_not(None),
                    ContractRecordRow.ngay_ket_thuc <= today + timedelta(days=60),
                    ContractRecordRow.ngay_ket_thuc >= today
                )
            elif status == "expired":
                query = query.filter(
                    ContractRecordRow.ngay_ket_thuc.is_not(None),
                    ContractRecordRow.ngay_ket_thuc < today
                )
        
        if date_from:
            try:
                from_dt = datetime.strptime(date_from, "%Y-%m-%d").date()
                query = query.filter(ContractRecordRow.ngay_bat_dau >= from_dt)
            except: pass
        
        if date_to:
            try:
                to_dt = datetime.strptime(date_to, "%Y-%m-%d").date()
                query = query.filter(ContractRecordRow.ngay_ket_thuc <= to_dt)
            except: pass
        
        # Get results
        rows = query.order_by(ContractRecordRow.contract_year.desc(), ContractRecordRow.id.desc()).all()

        # Pre-fetch GCN numbers
        contract_ids = [int(r.id) for r in rows]
        gcn_map: dict[int, str] = {}
        if contract_ids:
            from ..models.certificates import CertificateRecordRow
            cert_rows = (
                db.query(CertificateRecordRow.certificate_id, CertificateRecordRow.contract_id, CertificateRecordRow.certificate_no)
                .filter(CertificateRecordRow.contract_id.in_(contract_ids))
                .all()
            )
            for cert in cert_rows:
                cid = int(cert.contract_id) if cert.contract_id else None
                if cid:
                    gcn_map[cid] = str(cert.certificate_no or "")

        # Deduplicate by contract id and build contract dicts
        seen_ids: set[int] = set()
        contracts = []
        for r in rows:
            rid = int(r.id)
            if rid in seen_ids:
                continue
            seen_ids.add(rid)
            contracts.append(_build_contract_dict(r, gcn_map))

        # Build filter info
        filters = {}
        if q: filters["Từ khóa"] = q
        if year: filters["Năm"] = str(year)
        if domain: filters["Lĩnh vực"] = domain
        if status: filters["Trạng thái"] = status
        if date_from: filters["Từ ngày"] = date_from
        if date_to: filters["Đến ngày"] = date_to

        is_detail = mode == "detail"
        if is_detail:
            # mode=detail: expand multi-area contracts into multiple rows
            expanded = _expand_contracts_with_music_areas(contracts)
            buffer = export_contracts_report_xlsx(
                expanded, filters,
                has_music_areas=True,
                filename_suffix="_chi_tiet",
            )
            filename = _get_export_filename("bao_cao_hop_dong_chi_tiet")
        else:
            # mode=contract: summarize area info into cells (no row expansion)
            for c in contracts:
                areas = c.get("music_usage_areas") or []
                c["area_name"] = "; ".join(a.get("area_name", "") for a in areas if a.get("area_name"))
                c["scale_description"] = "; ".join(a.get("scale_description", "") for a in areas if a.get("scale_description"))
                c["music_usage_type"] = "; ".join(dict.fromkeys(a.get("music_usage_type", "") for a in areas if a.get("music_usage_type")))
                c["note"] = "; ".join(a.get("note", "") for a in areas if a.get("note"))
            for c in contracts:
                c.pop("music_usage_areas", None)
                c.pop("row_contract", None)
            buffer = export_contracts_report_xlsx(
                contracts, filters,
                has_music_areas=True,
                filename_suffix="_tom_tat",
            )
            filename = _get_export_filename("bao_cao_hop_dong_tom_tat")
        
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        import traceback
        logger.error(f"Export error: {e}")
        logger.error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"detail": str(e)},
        )


@router.get("/contracts/expiring/export-xlsx")
def export_expiring_contracts_xlsx_endpoint(
    days: int = Query(default=60, ge=7, le=365, description="Expiring within N days"),
    domain: Optional[str] = Query(default=None, description="Domain/linh vuc filter"),
    q: Optional[str] = Query(default=None, description="Search keyword"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    """
    Export expiring contracts to Excel (.xlsx).
    
    Returns contracts expiring within specified days.
    """
    from ..core.security import decode_access_token, get_bearer_token, get_user_permissions
    from ..services.contract_permissions import apply_contract_visibility
    from ..models.user import UserRow
    
    # Get current user and permissions
    user = None
    permissions = []
    if credentials:
        try:
            token = get_bearer_token(credentials)
            username = decode_access_token(token)
            user = db.query(UserRow).filter(func.lower(UserRow.username) == username.lower()).first()
            if user:
                permissions = get_user_permissions(db, user)
        except:
            pass
    
    today = date.today()
    cutoff = today + timedelta(days=days)
    
    # Build query
    query = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.annex_no.is_(None))
        .filter(ContractRecordRow.ngay_ket_thuc.is_not(None))
        .filter(ContractRecordRow.ngay_ket_thuc <= cutoff)
        .filter(ContractRecordRow.ngay_ket_thuc >= today)
    )
    query = apply_contract_visibility(query=query, user=user, permissions=permissions, db=db)
    
    # Apply additional filters
    if domain:
        query = query.filter(
            (ContractRecordRow.linh_vuc.ilike(f"%{domain}%")) |
            (ContractRecordRow.linh_vuc_hien_thi.ilike(f"%{domain}%"))
        )
    
    if q:
        search_term = f"%{q}%"
        query = query.filter(
            ContractRecordRow.contract_no.ilike(search_term) |
            ContractRecordRow.don_vi_ten.ilike(search_term) |
            ContractRecordRow.ten_bang_hieu.ilike(search_term)
        )
    
    # Get all results
    rows = query.order_by(ContractRecordRow.ngay_ket_thuc.asc()).all()

    # Pre-fetch GCN numbers
    contract_ids = [int(r.id) for r in rows]
    gcn_map: dict[int, str] = {}
    if contract_ids:
        from ..models.certificates import CertificateRecordRow
        cert_rows = (
            db.query(CertificateRecordRow.certificate_id, CertificateRecordRow.contract_id, CertificateRecordRow.certificate_no)
            .filter(CertificateRecordRow.contract_id.in_(contract_ids))
            .all()
        )
        for cert in cert_rows:
            cid = int(cert.contract_id) if cert.contract_id else None
            if cid:
                gcn_map[cid] = str(cert.certificate_no or "")

    # Convert to dicts
    contracts = []
    for row in rows:
        days_left = max(0, (row.ngay_ket_thuc - today).days)
        contracts.append(_build_expiring_dict(row, days_left, gcn_map))
    
    # Build filter info
    filters = {"Số ngày": f"{days} ngày"}
    if domain:
        filters["Lĩnh vực"] = domain
    if q:
        filters["Từ khóa"] = q
    
    # Generate Excel
    buffer = export_expiring_contracts_xlsx(contracts, filters)
    
    filename = _get_export_filename("hop_dong_sap_het_han")
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
    )


@router.get("/revenue/export-xlsx")
def export_revenue_xlsx(
    year: Optional[int] = Query(default=None, description="Year filter"),
    domain: Optional[str] = Query(default=None, description="Domain filter"),
    date_from: Optional[str] = Query(default=None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(default=None, description="End date (YYYY-MM-DD)"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    """
    Export revenue summary to Excel (.xlsx).
    
    Exports data from /api/reports/summary in Excel format.
    """
    today = date.today()
    today60 = today + timedelta(days=60)
    today30 = today + timedelta(days=30)
    
    # Fetch all non-annex contracts
    query = db.query(ContractRecordRow).filter(ContractRecordRow.annex_no.is_(None))
    
    # Apply filters
    if year:
        query = query.filter(ContractRecordRow.contract_year == year)
    
    if domain:
        query = query.filter(
            (ContractRecordRow.linh_vuc.ilike(f"%{domain}%")) |
            (ContractRecordRow.linh_vuc_hien_thi.ilike(f"%{domain}%"))
        )
    
    if date_from:
        try:
            from_dt = datetime.strptime(date_from, "%Y-%m-%d").date()
            query = query.filter(ContractRecordRow.ngay_bat_dau >= from_dt)
        except:
            pass
    
    if date_to:
        try:
            to_dt = datetime.strptime(date_to, "%Y-%m-%d").date()
            query = query.filter(ContractRecordRow.ngay_ket_thuc <= to_dt)
        except:
            pass
    
    rows = query.all()
    
    # Calculate KPIs
    active_count = 0
    expiring_30d_count = 0
    expiring_60d_count = 0
    expired_count = 0
    pending_renewal_count = 0
    new_count = 0
    unknown_status_count = 0
    
    revenue_by_year: dict[int, dict] = {}
    for yr in [today.year - 2, today.year - 1, today.year]:
        revenue_by_year[yr] = {"count": 0, "total": 0}
    
    field_counts: dict[str, dict] = {}
    
    for row in rows:
        status = _derived_status_v2(row.renewal_status, row.ngay_ket_thuc, today)
        
        if status == "active":
            active_count += 1
        elif status == "expiring":
            expiring_60d_count += 1
            if row.ngay_ket_thuc and row.ngay_ket_thuc <= today30:
                expiring_30d_count += 1
        elif status == "expired":
            expired_count += 1
        
        if status == "pending_renewal":
            pending_renewal_count += 1
        elif status == "new":
            new_count += 1
        elif status == "unknown":
            unknown_status_count += 1
        
        # Revenue by year
        contract_year = row.contract_year
        if contract_year and contract_year in revenue_by_year:
            revenue_by_year[contract_year]["count"] += 1
            if row.so_tien_value is not None:
                revenue_by_year[contract_year]["total"] += int(row.so_tien_value)
        
        # Field breakdown with normalization
        field_raw = str(row.linh_vuc_hien_thi or row.linh_vuc or "").strip()
        if field_raw:
            from ..services.report_excel_exporter import normalize_domain_label_for_report
            field_normalized = normalize_domain_label_for_report(field_raw)
            if field_normalized not in field_counts:
                field_counts[field_normalized] = {"label": field_normalized, "count": 0}
            field_counts[field_normalized]["count"] += 1
    
    # Build summary data
    summary_data = {
        "totals": {
            "total_contracts": len(rows),
            "active_count": active_count,
            "expiring_30d_count": expiring_30d_count,
            "expiring_60d_count": expiring_60d_count,
            "expired_count": expired_count,
            "pending_renewal_count": pending_renewal_count,
            "new_count": new_count,
            "unknown_status_count": unknown_status_count,
        },
        "revenue_by_year": [
            {"year": yr, "contract_count": data["count"], "total_revenue": data["total"]}
            for yr, data in sorted(revenue_by_year.items(), reverse=True)
        ],
        "field_breakdown": [
            {"key": k, "label": v["label"], "count": v["count"]}
            for k, v in sorted(field_counts.items(), key=lambda x: x[1]["count"], reverse=True)
        ],
    }
    
    # Build filter info
    filters = {}
    if year:
        filters["Năm"] = str(year)
    if domain:
        filters["Lĩnh vực"] = domain
    if date_from:
        filters["Từ ngày"] = date_from
    if date_to:
        filters["Đến ngày"] = date_to
    
    # Generate Excel
    buffer = export_revenue_summary_xlsx(summary_data, filters)
    
    filename = _get_export_filename("bao_cao_doanh_thu")
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
    )


# =============================================================================
# GET /api/reports/full-data/export-xlsx — Export full contract data
# =============================================================================

def _build_full_data_dict(row) -> dict:
    """Convert ContractRecordRow to dict for full data export matching import template."""
    # Import helper here to avoid circular imports
    from ..services.normalize_music_usage_areas import normalize_music_usage_areas
    
    # Build legal address
    if row.legal_full_address:
        dia_chi = str(row.legal_full_address or "")
    elif row.don_vi_dia_chi:
        dia_chi = str(row.don_vi_dia_chi or "")
    elif row.legal_address_line:
        parts = [row.legal_address_line]
        if row.legal_ward:
            parts.append(row.legal_ward)
        if row.legal_province:
            parts.append(row.legal_province)
        dia_chi = ", ".join(filter(None, parts))
    else:
        dia_chi = ""
    
    # Build business address
    if row.dia_chi_su_dung:
        dia_chi_su_dung = str(row.dia_chi_su_dung or "")
    elif row.usage_full_address:
        dia_chi_su_dung = str(row.usage_full_address or "")
    else:
        parts = []
        if row.usage_address_line:
            parts.append(row.usage_address_line)
        if row.usage_ward:
            parts.append(row.usage_ward)
        if row.usage_province:
            parts.append(row.usage_province)
        dia_chi_su_dung = ", ".join(filter(None, parts))
    
    # Build region
    linh_vuc = str(row.linh_vuc or "")
    linh_vuc_hien_thi = str(row.linh_vuc_hien_thi or "")
    
    # Build dates
    ngay_lap = _to_iso(row.ngay_lap_hop_dong) if row.ngay_lap_hop_dong else ""
    ngay_bat_dau = _to_iso(row.ngay_bat_dau) if row.ngay_bat_dau else ""
    ngay_ket_thuc = _to_iso(row.ngay_ket_thuc) if row.ngay_ket_thuc else ""
    
    # Build amounts
    so_tien = row.so_tien_value or 0
    thue_percent = row.thue_percent or 0
    royalty_before_vat = row.royalty_amount_before_vat or 0
    vat_rate = row.vat_rate or 0
    vat_amount = row.vat_amount or 0
    royalty_after_vat = row.royalty_amount_after_vat or 0
    
    return {
        # Template columns
        "so_hop_dong": str(row.contract_no or ""),
        "nam_hop_dong": str(row.contract_year or ""),
        "so_phu_luc": str(row.annex_no or ""),
        "ten_don_vi": str(row.don_vi_ten or ""),
        "dia_chi_don_vi": dia_chi,
        "dien_thoai": str(row.don_vi_dien_thoai or ""),
        "nguoi_dai_dien": str(row.don_vi_nguoi_dai_dien or ""),
        "chuc_vu": str(row.don_vi_chuc_vu or ""),
        "ma_so_thue": str(row.don_vi_mst or ""),
        "email": str(row.don_vi_email or ""),
        "ten_bien_hieu": str(row.ten_bang_hieu or ""),
        "dia_chi_su_dung": dia_chi_su_dung,
        "dia_chi_phap_ly": str(row.legal_full_address or ""),
        "phuong_xa_phap_ly": str(row.legal_ward or ""),
        "tinh_phap_ly": str(row.legal_province or ""),
        "dia_chi_su_dung_day_du": str(row.usage_full_address or ""),
        "phuong_xa_su_dung": str(row.usage_ward or ""),
        "tinh_su_dung": str(row.usage_province or ""),
        "linh_vuc": linh_vuc,
        "linh_vuc_hien_thi": linh_vuc_hien_thi,
        "ngay_lap_hop_dong": ngay_lap,
        "ngay_bat_dau": ngay_bat_dau,
        "ngay_ket_thuc": ngay_ket_thuc,
        "so_tien": so_tien,
        "thue_percent": thue_percent,
        "royalty_before_vat": royalty_before_vat,
        "vat_rate": vat_rate,
        "vat_amount": vat_amount,
        "royalty_after_vat": royalty_after_vat,
        # Legacy fields (read-only, not written) — kept for backward compatibility
        "loai_hinh_karaoke": str(row.loai_hinh_karaoke or ""),
        "tong_so_phong": row.tong_so_phong or 0,
        "tong_so_box": row.tong_so_box or 0,
        "nguoi_thuc_hien": str(row.nguoi_thuc_hien_email or ""),
        "trang_thai_gia_han": str(row.renewal_status or ""),
        "co_the_gia_han": str(row.is_renewable or ""),
        "mau_hop_dong": str(row.contract_template_code or ""),
        # music_usage_areas for multi-area expansion (use normalize helper for consistency)
        "music_usage_areas": normalize_music_usage_areas(row),
        "row_contract": row,
    }


@router.get("/full_data/export-xlsx")
def export_full_data_xlsx(
    year: Optional[int] = Query(default=None, description="Contract year filter"),
    domain: Optional[str] = Query(default=None, description="Domain/linh vuc filter"),
    date_from: Optional[str] = Query(default=None, description="Start date filter (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(default=None, description="End date filter (YYYY-MM-DD)"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    """
    Export full contract data to Excel (.xlsx) with specific columns:
    STT, Tên đơn vị, Địa chỉ, Bảng hiệu, Địa chỉ kinh doanh, 
    Số điện thoại, Khu vực kinh doanh, Số tiền trước thuế
    
    Supports filtering by year, domain, and date range.
    """
    from ..core.security import decode_access_token, get_bearer_token, get_user_permissions
    from ..services.contract_permissions import apply_contract_visibility
    from ..models.user import UserRow
    from ..services.report_excel_exporter import export_full_data_xlsx as generate_full_export
    
    # Get current user and permissions
    user = None
    permissions = []
    if credentials:
        try:
            token = get_bearer_token(credentials)
            username = decode_access_token(token)
            user = db.query(UserRow).filter(func.lower(UserRow.username) == username.lower()).first()
            if user:
                permissions = get_user_permissions(db, user)
        except:
            pass
    
    # Build query
    query = db.query(ContractRecordRow).filter(ContractRecordRow.annex_no.is_(None))
    query = apply_contract_visibility(query=query, user=user, permissions=permissions, db=db)
    
    # Apply filters
    if year:
        query = query.filter(ContractRecordRow.contract_year == year)
    
    if domain:
        query = query.filter(
            (ContractRecordRow.linh_vuc.ilike(f"%{domain}%")) |
            (ContractRecordRow.linh_vuc_hien_thi.ilike(f"%{domain}%"))
        )
    
    if date_from:
        try:
            from_dt = datetime.strptime(date_from, "%Y-%m-%d").date()
            query = query.filter(ContractRecordRow.ngay_bat_dau >= from_dt)
        except:
            pass
    
    if date_to:
        try:
            to_dt = datetime.strptime(date_to, "%Y-%m-%d").date()
            query = query.filter(ContractRecordRow.ngay_ket_thuc <= to_dt)
        except:
            pass
    
    # Get all results (no pagination for export)
    rows = query.order_by(ContractRecordRow.don_vi_ten.asc()).all()

    # Convert to dicts
    contracts = [_build_full_data_dict(row) for row in rows]

    # Expand multi-area contracts into multiple rows
    expanded_contracts = _expand_full_data_with_music_areas(contracts)

    # Build filter info
    filters = {}
    if year:
        filters["Năm"] = str(year)
    if domain:
        filters["Lĩnh vực"] = domain
    if date_from:
        filters["Từ ngày"] = date_from
    if date_to:
        filters["Đến ngày"] = date_to

    # Generate Excel with music_usage_areas columns
    buffer = generate_full_export(expanded_contracts, filters, has_music_areas=True)
    
    filename = _get_export_filename("du_lieu_toan_bo")
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
    )


# =============================================================================
# GET /api/reports/employees — employee performance stats
# =============================================================================

class EmployeeStatsItem(BaseModel):
    name: str = Field(description="Employee name")
    signed_this_week: int = Field(default=0, description="Contracts signed this week")
    signed_this_month: int = Field(default=0, description="Contracts signed this month")
    signed_this_quarter: int = Field(default=0, description="Contracts signed this quarter")
    signed_this_year: int = Field(default=0, description="Contracts signed this year")
    total_value: int = Field(default=0, description="Total contract value")
    avg_value: int = Field(default=0, description="Average contract value")
    pending_count: int = Field(default=0, description="Contracts pending action")
    expiring_soon: int = Field(default=0, description="Contracts expiring within 30 days assigned to this employee")


class EmployeeStatsResponse(BaseModel):
    employees: list[EmployeeStatsItem] = Field(description="List of employee stats")
    total_employees: int = Field(description="Total number of employees with contracts")


@router.get("/employees", response_model=EmployeeStatsResponse)
def get_employee_stats(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> EmployeeStatsResponse:
    """
    Compute employee performance statistics from contracts.

    Uses nguoi_thuc_hien_email field to group contracts by employee.
    Stats include:
    - Signed contracts by week/month/quarter/year
    - Total and average contract values
    - Pending contracts count
    - Contracts expiring soon (within 30 days)
    """
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    quarter_start = today.replace(month=((today.month - 1) // 3) * 3 + 1, day=1)
    year_start = today.replace(month=1, day=1)

    # Get all employees from contracts
    employee_names = (
        db.query(ContractRecordRow.nguoi_thuc_hien_email)
        .filter(
            ContractRecordRow.nguoi_thuc_hien_email.isnot(None),
            ContractRecordRow.nguoi_thuc_hien_email != ""
        )
        .distinct()
        .all()
    )

    employees_data: list[EmployeeStatsItem] = []

    for (emp_name,) in employee_names:
        name = str(emp_name).strip()
        if not name:
            continue

        # Query all contracts for this employee
        contracts = (
            db.query(ContractRecordRow)
            .filter(
                ContractRecordRow.nguoi_thuc_hien_email == name,
                ContractRecordRow.annex_no.is_(None)  # Exclude annexes
            )
            .all()
        )

        # Calculate stats
        signed_this_week = 0
        signed_this_month = 0
        signed_this_quarter = 0
        signed_this_year = 0
        total_value = 0
        pending_count = 0
        expiring_soon = 0

        for c in contracts:
            # Signed contracts (has signed_date and value)
            if c.ngay_lap_hop_dong and c.so_tien_value:
                signed_date = c.ngay_lap_hop_dong

                if signed_date >= week_start:
                    signed_this_week += 1
                if signed_date >= month_start:
                    signed_this_month += 1
                if signed_date >= quarter_start:
                    signed_this_quarter += 1
                if signed_date >= year_start:
                    signed_this_year += 1

                total_value += int(c.so_tien_value)

            # Pending (no value or missing data)
            if c.so_tien_value is None or c.so_tien_value == 0:
                pending_count += 1

            # Expiring soon (within 30 days)
            if c.ngay_ket_thuc:
                days_left = (c.ngay_ket_thuc - today).days
                if 0 <= days_left <= 30:
                    expiring_soon += 1

        # Calculate average
        avg_value = total_value // signed_this_year if signed_this_year > 0 else 0

        employees_data.append(EmployeeStatsItem(
            name=name,
            signed_this_week=signed_this_week,
            signed_this_month=signed_this_month,
            signed_this_quarter=signed_this_quarter,
            signed_this_year=signed_this_year,
            total_value=total_value,
            avg_value=avg_value,
            pending_count=pending_count,
            expiring_soon=expiring_soon,
        ))

    # Sort by signed_this_year descending
    employees_data.sort(key=lambda x: -x.signed_this_year)

    return EmployeeStatsResponse(
        employees=employees_data,
        total_employees=len(employees_data),
    )


# =============================================================================
# GET /api/reports/employees/options — danh sách nhân viên cho filter/select
# =============================================================================

class EmployeeOption(BaseModel):
    id: str = Field(description="Employee identifier (username)")
    name: str = Field(description="Employee display name or username")
    email: str = Field(description="Employee email (from contract or user table)")
    role: str = Field(description="User role")
    contract_count: int = Field(default=0, description="Number of contracts assigned to this employee")


class EmployeeOptionsResponse(BaseModel):
    items: list[EmployeeOption] = Field(description="List of employee options")


@router.get("/employees/options", response_model=EmployeeOptionsResponse)
def get_employee_options(
    with_contracts_only: bool = Query(default=False, description="Only return employees with contracts"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> EmployeeOptionsResponse:
    """
    Get list of employees for filter/select in Reports page.

    Lấy danh sách nhân viên từ:
    1. Users có trong bảng users (UserRow)
    2. Người thực hiện từ contract_records (nguoi_thuc_hien_email)

    Join không có user_id trong contract nên dùng name matching.
    """
    today = date.today()
    employees_map: dict[str, dict] = {}

    # Lấy users từ bảng users
    users = db.query(UserRow).filter(UserRow.is_active == True).all()
    for u in users:
        key = str(u.username or "").strip().lower()
        if key:
            employees_map[key] = {
                "id": str(u.username),
                "name": str(u.display_name or u.username or ""),
                "email": "",
                "role": str(u.role or "user"),
                "contract_count": 0,
            }

    # Lấy nguoi_thuc_hien_email từ contracts và đếm contract
    contracts_q = db.query(
        ContractRecordRow.nguoi_thuc_hien_email,
        func.count(ContractRecordRow.id).label("contract_count")
    ).filter(
        ContractRecordRow.annex_no.is_(None),
        ContractRecordRow.nguoi_thuc_hien_email.isnot(None),
        ContractRecordRow.nguoi_thuc_hien_email != ""
    ).group_by(ContractRecordRow.nguoi_thuc_hien_email).all()

    for (emp_name, count) in contracts_q:
        name = str(emp_name).strip()
        if not name:
            continue

        # Thử match với user bằng name
        key = name.lower()
        if key in employees_map:
            employees_map[key]["contract_count"] = int(count)
            # Nếu user không có display_name, dùng tên từ contract
            if not employees_map[key]["name"] or employees_map[key]["name"] == employees_map[key]["id"]:
                employees_map[key]["name"] = name
        else:
            # Không match được với user, tạo entry mới
            employees_map[key] = {
                "id": name,
                "name": name,
                "email": "",
                "role": "unknown",
                "contract_count": int(count),
            }

    items = [
        EmployeeOption(
            id=emp["id"],
            name=emp["name"],
            email=emp["email"],
            role=emp["role"],
            contract_count=emp["contract_count"],
        )
        for emp in employees_map.values()
    ]

    # Filter nếu cần
    if with_contracts_only:
        items = [i for i in items if i.contract_count > 0]

    # Sort theo contract_count desc, rồi name
    items.sort(key=lambda x: (-x.contract_count, x.name))

    return EmployeeOptionsResponse(items=items)


# =============================================================================
# GET /api/reports/employees/performance — thống kê hiệu suất theo nhân viên
# =============================================================================

class EmployeePerformanceItem(BaseModel):
    employee_id: str = Field(description="Employee identifier")
    employee_name: str = Field(description="Employee name")
    employee_email: str = Field(description="Employee email")
    total_contracts: int = Field(default=0, description="Total contracts assigned")
    signed_contracts: int = Field(default=0, description="Contracts with values (signed)")
    pending_contracts: int = Field(default=0, description="Contracts pending (no value)")
    expiring_contracts: int = Field(default=0, description="Contracts expiring within 60 days")
    expired_contracts: int = Field(default=0, description="Contracts already expired")
    total_revenue: int = Field(default=0, description="Total revenue from signed contracts")
    avg_revenue_per_contract: int = Field(default=0, description="Average revenue per contract")
    last_contract_date: Optional[str] = Field(default=None, description="Last contract date (ISO)")


class EmployeePerformanceSummary(BaseModel):
    total_employees: int = Field(default=0)
    total_contracts: int = Field(default=0)
    signed_contracts: int = Field(default=0)
    pending_contracts: int = Field(default=0)
    expiring_contracts: int = Field(default=0)
    expired_contracts: int = Field(default=0)
    total_revenue: int = Field(default=0)


class EmployeePerformanceResponse(BaseModel):
    summary: EmployeePerformanceSummary
    items: list[EmployeePerformanceItem]


@router.get("/employees/performance", response_model=EmployeePerformanceResponse)
def get_employee_performance(
    employee_id: Optional[str] = Query(default=None, description="Filter by employee id/username"),
    employee_email: Optional[str] = Query(default=None, description="Filter by employee email"),
    year: Optional[int] = Query(default=None, description="Filter by contract year"),
    date_from: Optional[str] = Query(default=None, description="Start date filter (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(default=None, description="End date filter (YYYY-MM-DD)"),
    domain: Optional[str] = Query(default=None, description="Domain/linh_vuc filter"),
    status: Optional[str] = Query(default=None, description="Status filter"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> EmployeePerformanceResponse:
    """
    Get employee performance statistics.

    Nếu không truyền employee_id: trả summary của tất cả nhân viên.
    Nếu truyền employee_id: trả chi tiết của nhân viên đó.
    """
    today = date.today()
    today60 = today + timedelta(days=60)

    # Build base query
    query = db.query(ContractRecordRow).filter(ContractRecordRow.annex_no.is_(None))

    # Apply filters
    if year:
        query = query.filter(ContractRecordRow.contract_year == year)

    if date_from:
        try:
            from_dt = datetime.strptime(date_from, "%Y-%m-%d").date()
            query = query.filter(ContractRecordRow.ngay_bat_dau >= from_dt)
        except:
            pass

    if date_to:
        try:
            to_dt = datetime.strptime(date_to, "%Y-%m-%d").date()
            query = query.filter(ContractRecordRow.ngay_ket_thuc <= to_dt)
        except:
            pass

    if domain:
        query = query.filter(
            (ContractRecordRow.linh_vuc.ilike(f"%{domain}%")) |
            (ContractRecordRow.linh_vuc_hien_thi.ilike(f"%{domain}%"))
        )

    if status:
        if status == "active":
            query = query.filter(
                (ContractRecordRow.ngay_ket_thuc.is_(None)) |
                (ContractRecordRow.ngay_ket_thuc > today60)
            )
        elif status == "expiring":
            query = query.filter(
                ContractRecordRow.ngay_ket_thuc.is_not(None),
                ContractRecordRow.ngay_ket_thuc <= today60,
                ContractRecordRow.ngay_ket_thuc >= today
            )
        elif status == "expired":
            query = query.filter(
                ContractRecordRow.ngay_ket_thuc.is_not(None),
                ContractRecordRow.ngay_ket_thuc < today
            )
        elif status == "pending":
            query = query.filter(
                (ContractRecordRow.so_tien_value.is_(None)) |
                (ContractRecordRow.so_tien_value == 0)
            )

    # Filter by employee if specified
    if employee_id:
        query = query.filter(ContractRecordRow.nguoi_thuc_hien_email == employee_id)
    elif employee_email:
        query = query.filter(ContractRecordRow.nguoi_thuc_hien_email.ilike(f"%{employee_email}%"))

    rows = query.all()

    # Get all employees with their contracts
    employees_stats: dict[str, dict] = {}
    total_summary = EmployeePerformanceSummary()

    for row in rows:
        emp_name = str(row.nguoi_thuc_hien_email or "").strip()
        if not emp_name:
            emp_name = "__unassigned__"

        if emp_name not in employees_stats:
            employees_stats[emp_name] = {
                "employee_id": emp_name,
                "employee_name": emp_name,
                "employee_email": str(row.nguoi_thuc_hien_email or ""),
                "total_contracts": 0,
                "signed_contracts": 0,
                "pending_contracts": 0,
                "expiring_contracts": 0,
                "expired_contracts": 0,
                "total_revenue": 0,
                "last_contract_date": None,
            }

        stats = employees_stats[emp_name]
        stats["total_contracts"] += 1

        # Track last contract date
        if row.ngay_lap_hop_dong:
            date_str = _to_iso(row.ngay_lap_hop_dong)
            if stats["last_contract_date"] is None or date_str > stats["last_contract_date"]:
                stats["last_contract_date"] = date_str

        # Status analysis
        contract_status = _derived_status_v2(row.renewal_status, row.ngay_ket_thuc, today)

        if row.so_tien_value and row.so_tien_value > 0:
            stats["signed_contracts"] += 1
            stats["total_revenue"] += int(row.so_tien_value)
        else:
            stats["pending_contracts"] += 1

        if contract_status == "expiring":
            stats["expiring_contracts"] += 1
        elif contract_status == "expired":
            stats["expired_contracts"] += 1

        # Update summary
        total_summary.total_contracts += 1
        if row.so_tien_value and row.so_tien_value > 0:
            total_summary.signed_contracts += 1
            total_summary.total_revenue += int(row.so_tien_value)
        else:
            total_summary.pending_contracts += 1
        if contract_status == "expiring":
            total_summary.expiring_contracts += 1
        elif contract_status == "expired":
            total_summary.expired_contracts += 1

    # Calculate averages and build items
    items = []
    for emp_name, stats in employees_stats.items():
        if stats["signed_contracts"] > 0:
            stats["avg_revenue_per_contract"] = stats["total_revenue"] // stats["signed_contracts"]

        if emp_name != "__unassigned__":
            items.append(EmployeePerformanceItem(**stats))
        elif stats["total_contracts"] > 0:
            # Unassigned contracts
            items.append(EmployeePerformanceItem(
                employee_id="__unassigned__",
                employee_name="Chưa phân công",
                employee_email="",
                total_contracts=stats["total_contracts"],
                signed_contracts=stats["signed_contracts"],
                pending_contracts=stats["pending_contracts"],
                expiring_contracts=stats["expiring_contracts"],
                expired_contracts=stats["expired_contracts"],
                total_revenue=stats["total_revenue"],
                avg_revenue_per_contract=stats["avg_revenue_per_contract"],
                last_contract_date=stats["last_contract_date"],
            ))

    # Sort by total_revenue desc
    items.sort(key=lambda x: -x.total_revenue)

    # Update summary total_employees
    total_summary.total_employees = len([i for i in items if i.employee_id != "__unassigned__"])

    return EmployeePerformanceResponse(summary=total_summary, items=items)


# =============================================================================
# GET /api/reports/employees/{employee_id}/contracts — chi tiết hợp đồng theo nhân viên
# =============================================================================

class EmployeeContractItem(BaseModel):
    contract_id: int
    contract_no: str
    legal_name: Optional[str] = None
    brand_name: Optional[str] = None
    domain: Optional[str] = None
    status: str
    effective_date: Optional[str] = None
    expiry_date: Optional[str] = None
    total_amount: Optional[int] = None
    created_at: Optional[str] = None


class EmployeeContractsResponse(BaseModel):
    items: list[EmployeeContractItem]
    total: int
    page: int
    page_size: int


@router.get("/employees/{employee_id}/contracts", response_model=EmployeeContractsResponse)
def get_employee_contracts(
    employee_id: str,
    year: Optional[int] = Query(default=None, description="Filter by contract year"),
    date_from: Optional[str] = Query(default=None, description="Start date filter (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(default=None, description="End date filter (YYYY-MM-DD)"),
    domain: Optional[str] = Query(default=None, description="Domain/linh_vuc filter"),
    status: Optional[str] = Query(default=None, description="Status filter"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> EmployeeContractsResponse:
    """
    Get contracts for a specific employee with pagination.

    employee_id: email người thực hiện (nguoi_thuc_hien_email)
    """
    today = date.today()
    today60 = today + timedelta(days=60)

    # Build query
    query = db.query(ContractRecordRow).filter(
        ContractRecordRow.annex_no.is_(None),
        ContractRecordRow.nguoi_thuc_hien_email == employee_id
    )

    # Apply filters
    if year:
        query = query.filter(ContractRecordRow.contract_year == year)

    if date_from:
        try:
            from_dt = datetime.strptime(date_from, "%Y-%m-%d").date()
            query = query.filter(ContractRecordRow.ngay_bat_dau >= from_dt)
        except:
            pass

    if date_to:
        try:
            to_dt = datetime.strptime(date_to, "%Y-%m-%d").date()
            query = query.filter(ContractRecordRow.ngay_ket_thuc <= to_dt)
        except:
            pass

    if domain:
        query = query.filter(
            (ContractRecordRow.linh_vuc.ilike(f"%{domain}%")) |
            (ContractRecordRow.linh_vuc_hien_thi.ilike(f"%{domain}%"))
        )

    if status:
        if status == "active":
            query = query.filter(
                (ContractRecordRow.ngay_ket_thuc.is_(None)) |
                (ContractRecordRow.ngay_ket_thuc > today60)
            )
        elif status == "expiring":
            query = query.filter(
                ContractRecordRow.ngay_ket_thuc.is_not(None),
                ContractRecordRow.ngay_ket_thuc <= today60,
                ContractRecordRow.ngay_ket_thuc >= today
            )
        elif status == "expired":
            query = query.filter(
                ContractRecordRow.ngay_ket_thuc.is_not(None),
                ContractRecordRow.ngay_ket_thuc < today
            )
        elif status == "pending":
            query = query.filter(
                (ContractRecordRow.so_tien_value.is_(None)) |
                (ContractRecordRow.so_tien_value == 0)
            )
        elif status == "signed":
            query = query.filter(
                ContractRecordRow.so_tien_value.isnot(None),
                ContractRecordRow.so_tien_value > 0
            )

    total = int(query.count())

    # Pagination
    offset = (page - 1) * page_size
    rows = query.order_by(nullslast(ContractRecordRow.ngay_lap_hop_dong.desc())).offset(offset).limit(page_size).all()

    # Build items
    items = []
    for row in rows:
        contract_status = _derived_status_v2(row.renewal_status, row.ngay_ket_thuc, today)
        status_labels = {
            "active": "Hoạt động",
            "expiring": "Sắp hết hạn",
            "expired": "Hết hạn",
            "pending_renewal": "Chờ gia hạn",
            "new": "Mới",
            "unknown": "Không xác định",
        }

        items.append(EmployeeContractItem(
            contract_id=int(row.id),
            contract_no=str(row.contract_no or ""),
            legal_name=str(row.don_vi_ten or ""),
            brand_name=str(row.ten_bang_hieu or ""),
            domain=str(row.linh_vuc_hien_thi or ""),
            status=status_labels.get(contract_status, contract_status),
            effective_date=_to_iso(row.ngay_bat_dau),
            expiry_date=_to_iso(row.ngay_ket_thuc),
            total_amount=int(row.so_tien_value) if row.so_tien_value else None,
            created_at=_to_iso(row.ngay_lap_hop_dong),
        ))

    return EmployeeContractsResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/period/export-xlsx")
def export_period_xlsx(
    scope: str = Query(default="month", description="week|month|quarter|year"),
    year: Optional[int] = Query(default=None, description="Filter by specific year"),
    date_from: Optional[str] = Query(default=None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(default=None, description="End date (YYYY-MM-DD)"),
    employee: Optional[str] = Query(default=None, description="Filter by employee"),
    field: Optional[str] = Query(default=None, description="Filter by field/domain"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    """
    Export period-based report to Excel (.xlsx) with 4 sheets:
    TONG_HOP, HOP_DONG_TRONG_KY, THEO_LINH_VUC, SAP_HET_HAN.

    Period is determined by scope and year; explicit date_from/date_to override when provided.
    Contracts are filtered by ngay_lap_hop_dong within the selected period.
    """
    from fastapi.responses import JSONResponse
    from ..core.security import decode_access_token, get_user_permissions
    from ..services.contract_permissions import apply_contract_visibility
    from ..models.user import UserRow

    try:
        # Auth
        user = None
        permissions = []
        if credentials:
            token = credentials.credentials
            username = decode_access_token(token)
            user = db.query(UserRow).filter(func.lower(UserRow.username) == username.lower()).first()
            if user:
                permissions = get_user_permissions(db, user)

        today = date.today()
        scope_lower = str(scope or "month").strip().lower()

        # Determine period start and end dates
        if date_from and date_to:
            try:
                period_start = datetime.strptime(date_from, "%Y-%m-%d").date()
                period_end = datetime.strptime(date_to, "%Y-%m-%d").date()
            except Exception:
                period_start, period_end = _get_calendar_period_range(today=today, scope=scope_lower)
        else:
            # Use year override for year scope
            if scope_lower == "year" and year:
                period_start = date(year, 1, 1)
                period_end = date(year, 12, 31)
            elif scope_lower == "year":
                period_start = date(today.year, 1, 1)
                period_end = date(today.year, 12, 31)
            else:
                period_start, period_end = _get_calendar_period_range(today=today, scope=scope_lower)

        # Period label for Excel
        if scope_lower == "week":
            period_label = f"Tuần {period_start.strftime('%d/%m/%Y')} – {period_end.strftime('%d/%m/%Y')}"
        elif scope_lower == "month":
            period_label = f"Tháng {period_start.strftime('%m/%Y')}"
        elif scope_lower == "quarter":
            quarter = (period_start.month - 1) // 3 + 1
            period_label = f"Quý {quarter}/{period_start.year}"
        else:
            period_label = f"Năm {period_start.year}"

        # Build base query
        query = db.query(ContractRecordRow).filter(ContractRecordRow.annex_no.is_(None))
        query = apply_contract_visibility(query=query, user=user, permissions=permissions, db=db)

        # Apply period filter: signed date within selected period
        query = query.filter(
            ContractRecordRow.ngay_lap_hop_dong.isnot(None),
            ContractRecordRow.ngay_lap_hop_dong >= period_start,
            ContractRecordRow.ngay_lap_hop_dong <= period_end,
        )

        # Apply additional filters
        if employee:
            query = query.filter(ContractRecordRow.nguoi_thuc_hien_email == employee)

        if field:
            query = query.filter(
                (ContractRecordRow.linh_vuc.ilike(f"%{field}%")) |
                (ContractRecordRow.linh_vuc_hien_thi.ilike(f"%{field}%"))
            )

        rows = query.order_by(ContractRecordRow.ngay_lap_hop_dong.desc()).all()

        # Deduplicate
        seen_ids: set[int] = set()
        unique_rows: list[ContractRecordRow] = []
        for r in rows:
            rid = int(r.id)
            if rid not in seen_ids:
                seen_ids.add(rid)
                unique_rows.append(r)
        rows = unique_rows

        # Pre-fetch GCN numbers
        contract_ids = [int(r.id) for r in rows]
        gcn_map: dict[int, str] = {}
        if contract_ids:
            from ..models.certificates import CertificateRecordRow
            cert_rows = (
                db.query(
                    CertificateRecordRow.certificate_id,
                    CertificateRecordRow.contract_id,
                    CertificateRecordRow.certificate_no,
                    CertificateRecordRow.status,
                )
                .filter(CertificateRecordRow.contract_id.in_(contract_ids))
                .all()
            )
            for cert in cert_rows:
                cid = int(cert.contract_id) if cert.contract_id else None
                if cid:
                    gcn_map[cid] = str(cert.certificate_no or "")

        # Build contract dicts using _build_contract_dict (Phase 2 money + GCN)
        contracts = []
        for r in rows:
            d = _build_contract_dict(r, gcn_map)
            contracts.append(d)

        # ----- Summary KPIs -----
        # total_contracts: all contracts matching query
        total_contracts = len(contracts)

        # signed_in_period: contracts with money > 0 (signed)
        signed_in_period = sum(1 for c in contracts if c.get("so_tien_value", 0) > 0)

        # Expiring window: period_end + 60 days
        expiring_window = period_end + timedelta(days=60)

        # active_count: contracts still valid after period end
        active_count = 0
        expiring_count = 0
        expired_count = 0
        pending_renewal_count = 0
        total_before_vat = 0
        total_vat = 0
        total_after_vat = 0

        for c in contracts:
            so_tien = c.get("so_tien_value") or 0
            vat_amount = c.get("vat_amount") or 0
            total_before_vat += so_tien
            total_vat += vat_amount
            total_after_vat += c.get("total") or 0

            end_date = c.get("end_date")
            if end_date:
                try:
                    end_d = datetime.strptime(end_date, "%Y-%m-%d").date() if isinstance(end_date, str) else end_date
                    if end_d < today:
                        expired_count += 1
                    elif end_d <= expiring_window:
                        expiring_count += 1
                    else:
                        active_count += 1
                except Exception:
                    active_count += 1
            else:
                active_count += 1

            renewal = str(c.get("renewal_status") or "").upper()
            if renewal == "PENDING_RENEWAL":
                pending_renewal_count += 1

        # GCN stats
        gcn_issued = 0
        gcn_draft = 0
        for cid in seen_ids:
            gcn_no = gcn_map.get(cid, "")
            if gcn_no:
                gcn_issued += 1
            else:
                gcn_draft += 1

        summary_data = {
            "period_label": period_label,
            "generated_date": today.strftime("%d/%m/%Y"),
            "total_contracts": total_contracts,
            "signed_in_period": signed_in_period,
            "active_count": active_count,
            "expiring_count": expiring_count,
            "expired_count": expired_count,
            "pending_renewal_count": pending_renewal_count,
            "total_before_vat": total_before_vat,
            "total_vat": total_vat,
            "total_after_vat": total_after_vat,
            "gcn_issued": gcn_issued,
            "gcn_draft": gcn_draft,
        }

        # ----- Expiring contracts for Sheet 4 -----
        # Contracts from the same period that have expiry dates in the expiring window
        expiring_query = (
            db.query(ContractRecordRow)
            .filter(ContractRecordRow.annex_no.is_(None))
            .filter(ContractRecordRow.ngay_lap_hop_dong.isnot(None))
            .filter(ContractRecordRow.ngay_lap_hop_dong >= period_start)
            .filter(ContractRecordRow.ngay_lap_hop_dong <= period_end)
        )
        if employee:
            expiring_query = expiring_query.filter(ContractRecordRow.nguoi_thuc_hien_email == employee)
        if field:
            expiring_query = expiring_query.filter(
                (ContractRecordRow.linh_vuc.ilike(f"%{field}%")) |
                (ContractRecordRow.linh_vuc_hien_thi.ilike(f"%{field}%"))
            )
        expiring_query = expiring_query.filter(
            ContractRecordRow.ngay_ket_thuc.isnot(None),
            ContractRecordRow.ngay_ket_thuc >= period_start,
            ContractRecordRow.ngay_ket_thuc <= expiring_window,
        )
        expiring_rows = expiring_query.order_by(ContractRecordRow.ngay_ket_thuc.asc()).all()

        expiring_seen: set[int] = set()
        expiring_list: list[dict] = []
        for r in expiring_rows:
            rid = int(r.id)
            if rid not in expiring_seen:
                expiring_seen.add(rid)
                days_left = max(0, (r.ngay_ket_thuc - today).days)
                expiring_list.append(_build_expiring_dict(r, days_left, gcn_map))

        # ----- Build filter info -----
        filters: dict[str, str] = {}
        filters["Kỳ báo cáo"] = period_label
        if employee:
            filters["Nhân viên"] = employee
        if field:
            filters["Lĩnh vực"] = field
        if date_from:
            filters["Từ ngày"] = date_from
        if date_to:
            filters["Đến ngày"] = date_to

        # ----- Filename -----
        if scope_lower == "week":
            filename = f"bao_cao_tuan_{period_start.strftime('%Y%m%d')}_den_{period_end.strftime('%Y%m%d')}.xlsx"
        elif scope_lower == "month":
            filename = f"bao_cao_thang_{period_start.strftime('%m_%Y')}.xlsx"
        elif scope_lower == "quarter":
            quarter = (period_start.month - 1) // 3 + 1
            filename = f"bao_cao_quy_{quarter}_{period_start.year}.xlsx"
        else:
            filename = f"bao_cao_nam_{period_start.year}.xlsx"

        # ----- Generate Excel -----
        buffer = build_period_excel(summary_data, contracts, expiring_list, filters)

        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as exc:
        import traceback
        logger.error(f"[PERIOD_EXPORT] Export failed: {exc}")
        logger.error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"detail": f"[PERIOD_EXPORT] {type(exc).__name__}: {exc}"},
        )
