"""
In-memory bookmarklet-draft API for QR portal autofill via bookmarklet.

Flow:
1. User clicks "Chuẩn bị dữ liệu QR" in the app
   → POST /api/certificates/internal-qr/bookmarklet-drafts
   → Stores draft in memory for 10 minutes

2. User drags bookmarklet to bookmarks bar, clicks it on portal
   → Bookmarklet JS fetches GET /api/certificates/internal-qr/bookmarklet-drafts/latest?client_key=...
   → Fills the "Thêm mới" form on the portal, STOPS (no submit)

No DB, no Playwright, no extension required.

CORS / Private Network Access:
- Portal at http://14.241.251.220:7879 is a different origin than the app at http://127.0.0.1:8000.
- The browser sends a CORS preflight (OPTIONS) + Private-Network-Access header.
- A custom middleware below handles preflight for these endpoints.
"""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/certificates/internal-qr/bookmarklet-drafts", tags=["bookmarklet-drafts"])

# ─────────────────────────────────────────────────────────────────────────────
# CORS + Private Network Access middleware for bookmarklet draft endpoints
# Handles OPTIONS preflight that FastAPI's CORSMiddleware doesn't cover
# for Access-Control-Request-Private-Network.
# ─────────────────────────────────────────────────────────────────────────────

_BOOKMARKLET_ALLOWED_ORIGINS = frozenset([
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://14.241.251.220:7879",
])


@router.api_route(
    "",
    methods=["OPTIONS"],
    include_in_schema=False,
)
async def bookmarklet_base_options(request: Request) -> Response:
    """Handle CORS preflight for the base path (POST from app)."""
    origin = request.headers.get("origin", "")
    pna_requested = request.headers.get("access-control-request-private-network", "").lower() == "true"
    allowed_origin = origin if origin in _BOOKMARKLET_ALLOWED_ORIGINS else ""
    headers = {"Vary": "Origin"}
    if allowed_origin:
        headers["Access-Control-Allow-Origin"] = allowed_origin
        headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        headers["Access-Control-Allow-Headers"] = "content-type, accept"
        if pna_requested:
            headers["Access-Control-Allow-Private-Network"] = "true"
    return Response(status_code=200, headers=headers)


@router.api_route(
    "/{path:path}",
    methods=["OPTIONS"],
    include_in_schema=False,
)
async def bookmarklet_options_preflight(request: Request, path: str) -> Response:
    """
    Handle CORS preflight + Private Network Access for all bookmarklet draft sub-paths.

    Intercepts OPTIONS requests so the browser's preflight succeeds from:
    - http://14.241.251.220:7879 (portal, public IP → private app)
    - http://127.0.0.1:8000 (same origin, dev)
    - http://localhost:8000 (same origin, dev)
    """
    origin = request.headers.get("origin", "")
    pna_requested = request.headers.get("access-control-request-private-network", "").lower() == "true"
    allowed_origin = origin if origin in _BOOKMARKLET_ALLOWED_ORIGINS else ""
    headers = {"Vary": "Origin"}
    if allowed_origin:
        headers["Access-Control-Allow-Origin"] = allowed_origin
        headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        headers["Access-Control-Allow-Headers"] = "content-type, accept"
        if pna_requested:
            headers["Access-Control-Allow-Private-Network"] = "true"
    return Response(status_code=200, headers=headers)

# ─────────────────────────────────────────────────────────────────────────────
# In-memory store
# ─────────────────────────────────────────────────────────────────────────────

_DRAFT_TTL_SECONDS = 600  # 10 minutes


@dataclass
class BookmarkletDraft:
    client_key: str
    created_at: datetime
    expires_at: datetime
    contract_no: str | None
    certificate_no: str | None
    organization_name: str | None
    effective_from: str | None
    effective_to: str | None
    tax_code: str | None
    brand_name: str | None
    address: str | None
    usage_address: str | None
    region: str | None
    domain: str | None

    def is_expired(self) -> bool:
        return datetime.now(timezone.utc) >= self.expires_at


# Thread-safe in-memory store
_store: dict[str, BookmarkletDraft] = {}
_store_lock = threading.Lock()


def _clean_expired():
    """Remove expired drafts."""
    now = datetime.now(timezone.utc)
    expired = [k for k, d in _store.items() if now >= d.expires_at]
    for k in expired:
        del _store[k]


def _get_latest(client_key: str) -> BookmarkletDraft | None:
    _clean_expired()
    drafts = [d for d in _store.values() if d.client_key == client_key]
    if not drafts:
        return None
    return max(drafts, key=lambda d: d.created_at)


# ─────────────────────────────────────────────────────────────────────────────
# Request / Response schemas
# ─────────────────────────────────────────────────────────────────────────────

class BookmarkletDraftCreateRequest(BaseModel):
    client_key: str
    contract_no: str | None = None
    certificate_no: str | None = None
    organization_name: str | None = None
    effective_from: str | None = None
    effective_to: str | None = None
    tax_code: str | None = None
    brand_name: str | None = None
    address: str | None = None
    usage_address: str | None = None
    region: str | None = None
    domain: str | None = None


class BookmarkletDraftCreateResponse(BaseModel):
    ok: bool = True
    message: str
    draft_id: str


class BookmarkletDraftData(BaseModel):
    contract_no: str | None = None
    certificate_no: str | None = None
    organization_name: str | None = None
    effective_from: str | None = None
    effective_to: str | None = None
    tax_code: str | None = None
    brand_name: str | None = None
    address: str | None = None
    usage_address: str | None = None
    region: str | None = None
    domain: str | None = None
    created_at: str | None = None
    expires_in_seconds: int | None = None


class BookmarkletDraftGetResponse(BaseModel):
    ok: bool = True
    found: bool
    draft: BookmarkletDraftData | None = None
    message: str = ""


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post("", response_model=BookmarkletDraftCreateResponse)
def create_bookmarklet_draft(payload: BookmarkletDraftCreateRequest) -> BookmarkletDraftCreateResponse:
    """
    Save a QR bookmarklet draft (10-minute TTL).

    Called by the app when user clicks "Chuẩn bị dữ liệu QR".
    The draft is stored in-memory and accessible via client_key.
    """
    if not payload.client_key:
        return BookmarkletDraftCreateResponse(ok=False, message="client_key is required", draft_id="")

    now = datetime.now(timezone.utc)
    expires_at = datetime.fromtimestamp(now.timestamp() + _DRAFT_TTL_SECONDS, tz=timezone.utc)
    draft_id = str(uuid.uuid4())[:8]

    draft = BookmarkletDraft(
        client_key=payload.client_key,
        created_at=now,
        expires_at=expires_at,
        contract_no=payload.contract_no,
        certificate_no=payload.certificate_no,
        organization_name=payload.organization_name,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
        tax_code=payload.tax_code,
        brand_name=payload.brand_name,
        address=payload.address,
        usage_address=payload.usage_address,
        region=payload.region,
        domain=payload.domain,
    )

    with _store_lock:
        _clean_expired()
        _store[draft_id] = draft

    return BookmarkletDraftCreateResponse(
        ok=True,
        message=f"Draft saved. Expires in {_DRAFT_TTL_SECONDS // 60} minutes.",
        draft_id=draft_id,
    )


@router.get("/latest", response_model=BookmarkletDraftGetResponse)
def get_latest_bookmarklet_draft(
    client_key: str = Query(..., description="Client key used when creating the draft"),
) -> BookmarkletDraftGetResponse:
    """
    Get the latest non-expired draft for a client_key.

    Called by the bookmarklet JS when user clicks the bookmark on the portal page.
    Returns draft data so the bookmarklet can fill the "Thêm mới" form.
    """
    if not client_key:
        return BookmarkletDraftGetResponse(ok=True, found=False, message="client_key is required")

    with _store_lock:
        draft = _get_latest(client_key)

    if draft is None:
        return BookmarkletDraftGetResponse(
            ok=True,
            found=False,
            message="Không tìm thấy draft. Vui lòng bấm 'Chuẩn bị dữ liệu QR' trong app trước.",
        )

    if draft.is_expired():
        return BookmarkletDraftGetResponse(
            ok=True,
            found=False,
            message="Draft đã hết hạn (10 phút). Vui lòng bấm 'Chuẩn bị dữ liệu QR' lại.",
        )

    now = datetime.now(timezone.utc)
    ttl = int((draft.expires_at - now).total_seconds())

    return BookmarkletDraftGetResponse(
        ok=True,
        found=True,
        message="Draft found.",
        draft=BookmarkletDraftData(
            contract_no=draft.contract_no,
            certificate_no=draft.certificate_no,
            organization_name=draft.organization_name,
            effective_from=draft.effective_from,
            effective_to=draft.effective_to,
            tax_code=draft.tax_code,
            brand_name=draft.brand_name,
            address=draft.address,
            usage_address=draft.usage_address,
            region=draft.region,
            domain=draft.domain,
            created_at=draft.created_at.isoformat(),
            expires_in_seconds=max(0, ttl),
        ),
    )
