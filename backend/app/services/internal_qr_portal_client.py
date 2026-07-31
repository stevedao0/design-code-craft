"""
Internal QR Portal Client (API-first, no Playwright).

Automates http://14.241.251.220:7879 (React SPA)
via its backend API at http://14.241.251.220:3769.

Auth: Bearer token from POST /ad/login stored as sessionStorage['_umsid'].

Endpoints used:
- POST /ad/login
- DELETE /ad/logout
- POST /ad/search
- POST /ad/filter
- POST /ad/add
- PUT /ad/update
- GET /ad/view-history/{id}
- GET /ad/countTotalCertificate

Usage:
    client = InternalQrPortalClient()
    client.login(username, password)
    client.search(certificate_no="0284/2026.GCN_KA")
    qr_data = client.download_qr_from_results()
"""

from __future__ import annotations

import base64
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# =============================================================================
# ERROR CODES
# =============================================================================

class QrPortalErrorCode:
    LOGIN_FAILED = "LOGIN_FAILED"
    CSRF_TOKEN_NOT_FOUND = "CSRF_TOKEN_NOT_FOUND"
    CREATE_FORM_NOT_FOUND = "CREATE_FORM_NOT_FOUND"
    DROPDOWN_OPTION_NOT_FOUND = "DROPDOWN_OPTION_NOT_FOUND"
    SUBMIT_FAILED = "SUBMIT_FAILED"
    SEARCH_FAILED = "SEARCH_FAILED"
    ROW_NOT_FOUND_AFTER_SUBMIT = "ROW_NOT_FOUND_AFTER_SUBMIT"
    AMBIGUOUS_MATCH = "AMBIGUOUS_MATCH"
    QR_DOWNLOAD_FAILED = "QR_DOWNLOAD_FAILED"
    PORTAL_API_NOT_FOUND = "PORTAL_API_NOT_FOUND"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    PORTAL_TIMEOUT = "PORTAL_TIMEOUT"
    PORTAL_UNREACHABLE = "PORTAL_UNREACHABLE"


# =============================================================================
# RESULT TYPES
# =============================================================================

@dataclass
class QrPortalResult:
    ok: bool
    action_taken: str       # CREATED_NEW | EXISTING_ROW | NONE
    qr_image_data: str | None = None   # data:image/png;base64,...
    portal_certificate_no: str | None = None
    search_results: list[dict] = field(default_factory=list)
    error_code: str | None = None
    error_message: str | None = None
    raw_response: dict | None = None


# =============================================================================
# CLIENT
# =============================================================================

class InternalQrPortalClient:
    """
    API-first client for the internal QR portal.

    Does NOT use Playwright. Uses httpx for HTTP requests.
    Manages its own session, CSRF tokens, and authentication.
    """

    BASE_APP = "http://14.241.251.220:7879"   # React SPA (for static assets)
    BASE_API = "http://14.241.251.220:3769"    # Express API
    TIMEOUT = 30.0

    def __init__(
        self,
        base_api: str | None = None,
        base_app: str | None = None,
        timeout: float = 30.0,
    ):
        self.base_api = base_api or self.BASE_API
        self.base_app = base_app or self.BASE_APP
        self.timeout = timeout
        self._client = httpx.Client(timeout=self.timeout, follow_redirects=True)
        self._token: str | None = None
        self._username: str | None = None
        self._logged_in = False

    def close(self):
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    # -------------------------------------------------------------------------
    # AUTH
    # -------------------------------------------------------------------------

    def login(self, username: str, password: str) -> QrPortalResult:
        """
        Login to the portal.

        Returns QrPortalResult with ok=True and error_code set if failed.
        """
        if not username or not password:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.VALIDATION_FAILED,
                error_message="username and password are required",
            )

        self._username = username

        try:
            resp = self._client.post(
                f"{self.base_api}/ad/login",
                json={"username": username, "password": password},
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
        except httpx.ConnectError as e:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.PORTAL_UNREACHABLE,
                error_message=f"Cannot connect to portal: {e}",
            )
        except httpx.TimeoutException as e:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.PORTAL_TIMEOUT,
                error_message=f"Portal timeout: {e}",
            )
        except Exception as e:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.PORTAL_UNREACHABLE,
                error_message=f"Portal error: {e}",
            )

        if resp.status_code == 401:
            body = resp.json()
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.LOGIN_FAILED,
                error_message=body.get("message", "Login failed"),
                raw_response=body,
            )

        if resp.status_code != 200:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.LOGIN_FAILED,
                error_message=f"Unexpected status {resp.status_code}: {resp.text[:200]}",
                raw_response={"status_code": resp.status_code},
            )

        body = resp.json()
        token = body.get("accessToken")
        if not token:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.LOGIN_FAILED,
                error_message="No accessToken in login response",
                raw_response=body,
            )

        self._token = token
        self._logged_in = True
        logger.info(f"[PortalClient] Logged in as {username}")
        return QrPortalResult(ok=True, action_taken="NONE")

    def logout(self) -> None:
        """Logout from the portal."""
        if self._token and self._logged_in:
            try:
                self._client.delete(
                    f"{self.base_api}/ad/logout",
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self._token}",
                    },
                )
            except Exception as e:
                logger.warning(f"[PortalClient] Logout error: {e}")
            self._token = None
            self._logged_in = False

    def _auth_headers(self) -> dict[str, str]:
        if not self._token:
            raise RuntimeError("Not logged in. Call login() first.")
        return {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {self._token}",
        }

    def _assert_logged_in(self):
        if not self._logged_in or not self._token:
            raise RuntimeError("Not logged in. Call login() first.")

    # -------------------------------------------------------------------------
    # SEARCH / FILTER
    # -------------------------------------------------------------------------

    def search(
        self,
        keyword: str = "",
        certificate_no: str = "",
        contract_no: str = "",
        organization_name: str = "",
        page: int = 1,
        limit: int = 200,
    ) -> QrPortalResult:
        """
        Search certificates by keyword (falls back to exact match via filter).
        """
        self._assert_logged_in()

        # Prefer exact field matches via filter
        if certificate_no or contract_no:
            return self.filter(
                certificate_no=certificate_no,
                contract_no=contract_no,
            )

        # Keyword search
        payload = {
            "keyword": keyword,
            "so_hop_dong": contract_no,
            "so_giay_chung_nhan_day_du": certificate_no,
            "ten_don_vi": organization_name,
            "ten_nguoi_tao": "",
            "ghi_chu": "",
            "page": page,
            "limit": limit,
        }

        try:
            resp = self._client.post(
                f"{self.base_api}/ad/search",
                json=payload,
                headers=self._auth_headers(),
            )
        except httpx.TimeoutException:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.SEARCH_FAILED,
                error_message="Search request timed out",
            )
        except Exception as e:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.SEARCH_FAILED,
                error_message=f"Search failed: {e}",
            )

        if resp.status_code == 401:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.LOGIN_FAILED,
                error_message="Session expired",
            )

        if resp.status_code != 200:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.SEARCH_FAILED,
                error_message=f"Search failed with status {resp.status_code}",
            )

        body = resp.json()
        results = body.get("results", [])
        total = body.get("total", 0)

        return QrPortalResult(
            ok=True,
            action_taken="NONE",
            search_results=results,
            raw_response=body,
        )

    def filter(
        self,
        status: str = "",
        khu_vuc: str = "",
        start_date: str = "",
        end_date: str = "",
        created_by: str = "",
        certificate_no: str = "",
        contract_no: str = "",
        page: int = 1,
        limit: int = 200,
    ) -> QrPortalResult:
        """
        Filter certificates with detailed field matching.
        Uses search endpoint for exact GCN/contract matching.
        """
        self._assert_logged_in()

        # Use search for exact certificate/contract matching
        if certificate_no or contract_no:
            payload = {
                "keyword": certificate_no or contract_no,
                "so_hop_dong": contract_no,
                "so_giay_chung_nhan_day_du": certificate_no,
                "ten_don_vi": "",
                "ten_nguoi_tao": created_by,
                "ghi_chu": "",
                "page": page,
                "limit": limit,
            }
            endpoint = f"{self.base_api}/ad/search"
        else:
            payload = {
                "status": status,
                "khu_vuc": khu_vuc,
                "startDate": start_date,
                "endDate": end_date,
                "createdBy": created_by,
                "ngayInTu": "",
                "ngayInDen": "",
                "page": page,
                "limit": limit,
            }
            endpoint = f"{self.base_api}/ad/filter"

        try:
            resp = self._client.post(
                endpoint,
                json=payload,
                headers=self._auth_headers(),
            )
        except httpx.TimeoutException:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.SEARCH_FAILED,
                error_message="Filter request timed out",
            )
        except Exception as e:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.SEARCH_FAILED,
                error_message=f"Filter failed: {e}",
            )

        if resp.status_code == 401:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.LOGIN_FAILED,
                error_message="Session expired",
            )

        if resp.status_code != 200:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.SEARCH_FAILED,
                error_message=f"Filter failed with status {resp.status_code}",
            )

        body = resp.json()
        results = body.get("results", [])
        total = body.get("total", 0)

        return QrPortalResult(
            ok=True,
            action_taken="NONE",
            search_results=results,
            raw_response=body,
        )

    # -------------------------------------------------------------------------
    # SUBMIT
    # -------------------------------------------------------------------------

    def submit_certificate(self, payload: dict[str, Any]) -> QrPortalResult:
        """
        Submit a new certificate record.

        Payload fields (all snake_case):
            tinh_trang, linh_vuc, so_hop_dong, so_giay_chung_nhan,
            ngay_bat_dau, ngay_ket_thuc, ngay_in_giay_chung_nhan,
            ten_don_vi, dia_chi, ma_so_thue, ten_bang_hieu,
            dia_chi_kinh_doanh, khu_vuc, ghi_chu,
            created_by, created_by_fullname
        """
        self._assert_logged_in()

        required = ["tinh_trang", "linh_vuc", "so_hop_dong", "so_giay_chung_nhan",
                    "ten_don_vi", "dia_chi"]
        missing = [f for f in required if not payload.get(f)]
        if missing:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.VALIDATION_FAILED,
                error_message=f"Missing required fields: {missing}",
            )

        try:
            resp = self._client.post(
                f"{self.base_api}/ad/add",
                json=payload,
                headers=self._auth_headers(),
            )
        except httpx.TimeoutException:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.SUBMIT_FAILED,
                error_message="Submit request timed out",
            )
        except Exception as e:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.SUBMIT_FAILED,
                error_message=f"Submit failed: {e}",
            )

        if resp.status_code == 401:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.LOGIN_FAILED,
                error_message="Session expired",
            )

        if resp.status_code == 403:
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.SUBMIT_FAILED,
                error_message="No permission to add records",
            )

        if resp.status_code not in (200, 201):
            return QrPortalResult(
                ok=False,
                action_taken="NONE",
                error_code=QrPortalErrorCode.SUBMIT_FAILED,
                error_message=f"Submit failed with status {resp.status_code}: {resp.text[:200]}",
                raw_response={"status_code": resp.status_code},
            )

        body = resp.json()
        logger.info(f"[PortalClient] Submit success: {body}")
        return QrPortalResult(
            ok=True,
            action_taken="CREATED_NEW",
            raw_response=body,
        )

    # -------------------------------------------------------------------------
    # QR DOWNLOAD
    # -------------------------------------------------------------------------

    def _extract_qr_from_results(self, results: list[dict]) -> tuple[str | None, str | None]:
        """
        Extract QR image from search results.
        Returns (qr_image_data, certificate_no) or (None, None).
        """
        if not results:
            return None, None

        for row in results:
            qr_image = row.get("qr_image")
            if qr_image and isinstance(qr_image, str) and qr_image.startswith("data:image"):
                cert_no = row.get("so_giay_chung_nhan_day_du") or row.get("so_hop_dong", "")
                return qr_image, cert_no

        return None, None

    def find_and_download_qr(
        self,
        certificate_no: str = "",
        contract_no: str = "",
    ) -> QrPortalResult:
        """
        Search for a certificate by GCN or contract number and download its QR.

        Returns QR image data and action taken.
        """
        search_result = self.search(
            certificate_no=certificate_no,
            contract_no=contract_no,
        )

        if not search_result.ok:
            return search_result

        results = search_result.search_results

        # Exact match by certificate_no
        if certificate_no:
            exact = [r for r in results
                     if str(r.get("so_giay_chung_nhan_day_du") or "").strip() == certificate_no.strip()]
            if len(exact) > 1:
                return QrPortalResult(
                    ok=False,
                    action_taken="NONE",
                    error_code=QrPortalErrorCode.AMBIGUOUS_MATCH,
                    error_message=f"Multiple rows match certificate_no={certificate_no!r}",
                    search_results=exact,
                )
            if exact:
                qr_data, cert_no = self._extract_qr_from_results(exact)
                if qr_data:
                    return QrPortalResult(
                        ok=True,
                        action_taken="EXISTING_ROW",
                        qr_image_data=qr_data,
                        portal_certificate_no=cert_no,
                        search_results=results,
                    )
                # Row exists but no QR — return existing row
                return QrPortalResult(
                    ok=True,
                    action_taken="EXISTING_ROW",
                    qr_image_data=None,
                    portal_certificate_no=exact[0].get("so_giay_chung_nhan_day_du") or cert_no,
                    search_results=results,
                )

        # Exact match by contract_no
        if contract_no:
            exact = [r for r in results
                     if str(r.get("so_hop_dong") or "").strip() == contract_no.strip()]
            if len(exact) > 1:
                return QrPortalResult(
                    ok=False,
                    action_taken="NONE",
                    error_code=QrPortalErrorCode.AMBIGUOUS_MATCH,
                    error_message=f"Multiple rows match contract_no={contract_no!r}",
                    search_results=exact,
                )
            if exact:
                qr_data, cert_no = self._extract_qr_from_results(exact)
                if qr_data:
                    return QrPortalResult(
                        ok=True,
                        action_taken="EXISTING_ROW",
                        qr_image_data=qr_data,
                        portal_certificate_no=cert_no or exact[0].get("so_giay_chung_nhan_day_du"),
                        search_results=results,
                    )
                return QrPortalResult(
                    ok=True,
                    action_taken="EXISTING_ROW",
                    qr_image_data=None,
                    portal_certificate_no=exact[0].get("so_giay_chung_nhan_day_du"),
                    search_results=results,
                )

        # No match
        return QrPortalResult(
            ok=True,
            action_taken="NONE",
            search_results=results,
        )

    # -------------------------------------------------------------------------
    # FULL FLOW: generate QR for certificate
    # -------------------------------------------------------------------------

    def generate_qr(
        self,
        portal_username: str,
        portal_password: str,
        certificate_no: str,
        contract_no: str,
        effective_from: str | None,
        effective_to: str | None,
        issue_date: str | None,
        organization_name: str,
        address: str,
        tax_code: str,
        brand_name: str,
        usage_address: str,
        domain: str,
        region: str,
        portal_note: str = "",
    ) -> QrPortalResult:
        """
        Full flow: login -> search -> create if needed -> download QR.

        Args:
            portal_username: Portal login username
            portal_password: Portal login password
            certificate_no: So GCN
            contract_no: So hop dong
            effective_from: Ngay bat dau (YYYY-MM-DD)
            effective_to: Ngay ket thuc (YYYY-MM-DD)
            issue_date: Ngay in GCN (YYYY-MM-DD)
            organization_name: Ten don vi
            address: Dia chi phap ly
            tax_code: Ma so thue
            brand_name: Ten bang hieu
            usage_address: Dia chi kinh doanh
            domain: Linh vuc (e.g. "Karaoke")
            region: Khu vuc (e.g. "Miền Nam", "Miền Bắc")
            portal_note: Ghi chu

        Returns QrPortalResult with:
            - ok: True/False
            - action_taken: CREATED_NEW | EXISTING_ROW | NONE
            - qr_image_data: data URL or None
            - portal_certificate_no: So GCN tren portal
            - error_code: ErrorCode if failed
        """
        # 1. Login
        login_result = self.login(portal_username, portal_password)
        if not login_result.ok:
            return login_result

        # 2. Search for existing
        search_result = self.find_and_download_qr(
            certificate_no=certificate_no,
            contract_no=contract_no,
        )

        if search_result.action_taken == "EXISTING_ROW":
            logger.info(f"[PortalClient] Found existing row for cert={certificate_no}")
            return search_result

        # 3. Not found — create new
        logger.info(f"[PortalClient] No existing row, creating new for cert={certificate_no}")

        submit_payload = self._build_submit_payload(
            certificate_no=certificate_no,
            contract_no=contract_no,
            effective_from=effective_from,
            effective_to=effective_to,
            issue_date=issue_date,
            organization_name=organization_name,
            address=address,
            tax_code=tax_code,
            brand_name=brand_name,
            usage_address=usage_address,
            domain=domain,
            region=region,
            portal_note=portal_note,
        )

        submit_result = self.submit_certificate(submit_payload)
        if not submit_result.ok:
            return submit_result

        # 4. Search for the newly created row
        time.sleep(1.5)  # Wait for DB write
        search_after = self.find_and_download_qr(
            certificate_no=certificate_no,
            contract_no=contract_no,
        )

        if search_after.action_taken == "EXISTING_ROW" and search_after.qr_image_data:
            return search_after

        if not search_after.qr_image_data and search_after.action_taken == "EXISTING_ROW":
            # Row exists but no QR
            return QrPortalResult(
                ok=True,
                action_taken="CREATED_NEW",
                qr_image_data=None,
                portal_certificate_no=search_after.portal_certificate_no,
                error_code=QrPortalErrorCode.QR_DOWNLOAD_FAILED,
                error_message="Created new row but QR not available yet",
            )

        return QrPortalResult(
            ok=False,
            action_taken="CREATED_NEW",
            error_code=QrPortalErrorCode.ROW_NOT_FOUND_AFTER_SUBMIT,
            error_message="Created new row but could not find it in search results",
            search_results=search_after.search_results,
        )

    def _build_submit_payload(
        self,
        certificate_no: str,
        contract_no: str,
        effective_from: str | None,
        effective_to: str | None,
        issue_date: str | None,
        organization_name: str,
        address: str,
        tax_code: str,
        brand_name: str,
        usage_address: str,
        domain: str,
        region: str,
        portal_note: str,
    ) -> dict[str, Any]:
        """Build the submit payload from form data."""

        def fmt_date(val: str | None) -> str:
            if not val:
                return ""
            val = val.strip()
            if not val:
                return ""
            # Already DD/MM/YYYY
            if "/" in val:
                return val
            # YYYY-MM-DD -> DD/MM/YYYY
            if "-" in val and len(val) == 10:
                parts = val.split("-")
                if len(parts) == 3:
                    y, m, d = parts
                    return f"{d}/{m}/{y}"
            return val

        # Map domain to portal linh_vuc value
        linh_vuc = self._map_domain(domain)

        payload = {
            "tinh_trang": "Phát hành",
            "linh_vuc": linh_vuc,
            "so_hop_dong": str(contract_no or "").strip(),
            "so_giay_chung_nhan": str(certificate_no or "").strip(),
            "ngay_bat_dau": fmt_date(effective_from),
            "ngay_ket_thuc": fmt_date(effective_to),
            "ngay_in_giay_chung_nhan": fmt_date(issue_date) or fmt_date(None),
            "ten_don_vi": str(organization_name or "").strip(),
            "dia_chi": str(address or "").strip(),
            "ma_so_thue": str(tax_code or "").strip(),
            "ten_bang_hieu": str(brand_name or "").strip(),
            "dia_chi_kinh_doanh": str(usage_address or "").strip(),
            "khu_vuc": str(region or "").strip(),
            "ghi_chu": str(portal_note or "").strip(),
            "created_by": self._username or "",
            "created_by_fullname": self._username or "",
        }
        return payload

    def _map_domain(self, domain: str) -> str:
        """
        Map app domain/field_code to portal linh_vuc value.
        Returns the portal option value as-is if no mapping found.
        """
        mapping: dict[str, str] = {
            "Karaoke": "Karaoke",
            "karaoke": "Karaoke",
            "PHONG_THU_AM": "Phòng Thu Âm",
            "PHONG_TAP": "Phòng Tập",
            "MANG_XA_HOI": "Mạng Xã Hội",
            "BAR_CAFE": "Bar / Cafe",
            "KHDT_BAN_LE": "Kinh Doanh Hoa Dai - Ban Le",
            "KHDT_BAN_SI": "Kinh Doanh Hoa Dai - Ban Si",
            "TRUYEN_HINH": "Truyền Hình",
            "DICH_VU_BUOI_CHIEU": "Dịch Vụ Buổi Chiều",
            "TIEP_KHAN_BENH_VIEN": "Tiếp Khách Bệnh Viện",
        }
        return mapping.get(domain, domain)


# =============================================================================
# CONVENIENCE FUNCTION
# =============================================================================

def generate_qr_from_portal(
    portal_username: str,
    portal_password: str,
    certificate_no: str,
    contract_no: str,
    effective_from: str | None,
    effective_to: str | None,
    issue_date: str | None,
    organization_name: str,
    address: str,
    tax_code: str,
    brand_name: str,
    usage_address: str,
    domain: str,
    region: str,
    portal_note: str = "",
) -> QrPortalResult:
    """
    One-shot QR generation from portal.

    Usage:
        result = generate_qr_from_portal(
            portal_username="...",
            portal_password="...",
            certificate_no="0284/2026.GCN_KA",
            contract_no="HD-001",
            effective_from="2026-05-01",
            effective_to="2027-05-01",
            issue_date="2026-05-19",
            organization_name="Công ty TNHH MTV",
            address="123 Đường ABC",
            tax_code="0123456789",
            brand_name="Karaoke ABC",
            usage_address="456 Đường XYZ",
            domain="Karaoke",
            region="Miền Nam",
        )
        if result.ok:
            print(result.qr_image_data)
            print(result.action_taken)
    """
    with InternalQrPortalClient() as client:
        return client.generate_qr(
            portal_username=portal_username,
            portal_password=portal_password,
            certificate_no=certificate_no,
            contract_no=contract_no,
            effective_from=effective_from,
            effective_to=effective_to,
            issue_date=issue_date,
            organization_name=organization_name,
            address=address,
            tax_code=tax_code,
            brand_name=brand_name,
            usage_address=usage_address,
            domain=domain,
            region=region,
            portal_note=portal_note,
        )
