"""
Internal QR Portal Automation Service.

Automates the internal QR code portal at http://14.241.251.220:7879
to create GCN entries and download QR code images with deduplication.

Key design:
- Search portal BEFORE creating to avoid duplicate records.
- Precise row matching (exact GCN number preferred).
- Detailed error codes for all failure modes.
- Screenshot debug on failure.
- QR saved as base64 in DB (qr_image_data field) and as PNG file on disk.

Usage:
    from app.services.internal_qr_automation import create_qr_for_certificate
    result = asyncio.run(create_qr_for_certificate(certificate_id, db))
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import traceback
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from typing import TYPE_CHECKING, Any

from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from playwright.async_api import TimeoutError as PlaywrightTimeout

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# =============================================================================
# ERROR CODES
# =============================================================================

class QrErrorCode:
    # Config / auth
    CONFIG_MISSING = "CONFIG_MISSING"
    LOGIN_FAILED = "LOGIN_FAILED"
    PORTAL_TIMEOUT = "PORTAL_TIMEOUT"
    PORTAL_UNREACHABLE = "PORTAL_UNREACHABLE"

    # Navigation / form
    DASHBOARD_NOT_FOUND = "DASHBOARD_NOT_FOUND"
    ADD_BUTTON_NOT_FOUND = "ADD_BUTTON_NOT_FOUND"
    FORM_NOT_FOUND = "FORM_NOT_FOUND"
    DROPDOWN_OPTION_NOT_FOUND = "DROPDOWN_OPTION_NOT_FOUND"
    FORM_FIELD_NOT_FOUND = "FORM_FIELD_NOT_FOUND"
    SUBMIT_FAILED = "SUBMIT_FAILED"

    # Certificate data
    CERTIFICATE_NOT_FOUND = "CERTIFICATE_NOT_FOUND"
    CERTIFICATE_MISSING_REQUIRED_FIELD = "CERTIFICATE_MISSING_REQUIRED_FIELD"

    # Row matching
    ROW_NOT_FOUND_AFTER_SUBMIT = "ROW_NOT_FOUND_AFTER_SUBMIT"
    ROW_NOT_FOUND_IN_SEARCH = "ROW_NOT_FOUND_IN_SEARCH"
    AMBIGUOUS_MATCH = "AMBIGUOUS_MATCH"

    # QR download
    QR_LINK_NOT_FOUND = "QR_LINK_NOT_FOUND"
    QR_DOWNLOAD_FAILED = "QR_DOWNLOAD_FAILED"
    QR_IMAGE_NOT_FOUND = "QR_IMAGE_NOT_FOUND"

    # Unexpected
    UNEXPECTED_ERROR = "UNEXPECTED_ERROR"


# =============================================================================
# RESULT TYPE
# =============================================================================

@dataclass
class QrAutomationResult:
    ok: bool
    certificate_id: int
    qr_status: str          # SUCCESS | FAILED
    action_taken: str       # CREATED_NEW | EXISTING_ROW
    qr_file_path: str | None = None
    qr_base64_data: str | None = None
    external_ref: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    debug_screenshot: str | None = None

    @property
    def is_existing(self) -> bool:
        return self.action_taken == "EXISTING_ROW"


# =============================================================================
# DOMAIN MAPPING
# Maps app field_code to portal "Lĩnh vực" option value.
# PLACEHOLDER — must be updated after smoke test reads real dropdown values.
# =============================================================================

# Format: "field_code_in_app": "portal_select_option_value"
# Update these values from smoke test output.
DOMAIN_TO_PORTAL_VALUE: dict[str, str] = {
    "Karaoke":         "Karaoke",           # TODO: update from smoke test
    "PHONG_THU_AM":    "Phòng Thu Âm",      # TODO: update from smoke test
    "PHONG_TAP":       "Phòng Tập",         # TODO: update from smoke test
    "MANG_XA_HOI":     "Mạng Xã Hội",       # TODO: update from smoke test
    "BAR_CAFE":        "Bar / Cafe",         # TODO: update from smoke test
    "KHDT_BAN_LE":     "Kinh Doanh Hoa Dai - Ban Le",  # TODO: update from smoke test
    "KHDT_BAN_SI":     "Kinh Doanh Hoa Dai - Ban Si",  # TODO: update from smoke test
    "TRUYEN_HINH":     "Truyền Hình",        # TODO: update from smoke test
    "DICH_VU_BUOI_CHIEU": "Dịch Vụ Buổi Chiều",  # TODO: update from smoke test
    "TIEP_KHAN_BENH_VIEN": "Tiếp Khách Bệnh Viện",   # TODO: update from smoke test
}


def _get_portal_domain_value(field_code: str) -> str:
    """Map app field_code to portal option value."""
    return DOMAIN_TO_PORTAL_VALUE.get(field_code, field_code)


# =============================================================================
# PORTAL PAYLOAD BUILDER
# =============================================================================

def _build_portal_payload(cert_row: Any) -> dict[str, str]:
    """
    Build the portal form payload from a certificate row.
    Returns dict of {name_attribute: value}.
    """
    ngay_in = _format_portal_date(cert_row.certificate_issue_date) or date.today().strftime("%d/%m/%Y")

    return {
        "tinhtrang":   "Phát hành",
        "linhvuc":    _get_portal_domain_value(str(cert_row.field_code or "").strip()),
        "sohd":       str(cert_row.contract_no or "").strip(),
        "sogcn":      str(cert_row.certificate_no or "").strip(),
        "ngayincert": ngay_in,
        "ngaybatdau": _format_portal_date(cert_row.effective_from),
        "ngayketthuc": _format_portal_date(cert_row.effective_to),
        "tendonvi":   str(cert_row.organization_name or "").strip(),
        "diachi":     str(cert_row.address or cert_row.business_location or "").strip(),
        "ghichu":     "",
    }


def _format_portal_date(value: Any) -> str:
    """Convert date to dd/mm/yyyy for portal form."""
    if value is None:
        return ""
    if hasattr(value, "strftime"):
        return value.strftime("%d/%m/%Y")  # Fixed: 18/05/2026
    val_str = str(value).strip()
    if not val_str:
        return ""
    if "/" in val_str:
        return val_str
    if "-" in val_str:
        parts = val_str.split("-")
        if len(parts) >= 3:
            y, m, d = parts[0], parts[1], parts[2]
            return f"{int(d):02d}/{int(m):02d}/{y}"  # Fixed: pad month and day
    return val_str


# =============================================================================
# CONFIG
# =============================================================================

def _get_config() -> dict[str, Any]:
    from dotenv import load_dotenv
    load_dotenv()

    base_url = os.environ.get(
        "INTERNAL_QR_PORTAL_BASE_URL", "http://14.241.251.220:7879"
    ).rstrip("/")
    username = os.environ.get("INTERNAL_QR_PORTAL_USERNAME", "")
    password = os.environ.get("INTERNAL_QR_PORTAL_PASSWORD", "")
    headless = os.environ.get("INTERNAL_QR_AUTOMATION_HEADLESS", "true").lower() == "true"
    storage_dir = os.environ.get(
        "INTERNAL_QR_DOWNLOAD_DIR",
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "storage", "gcn_qr"),
    )
    timeout_sec = int(os.environ.get("INTERNAL_QR_TIMEOUT_SECONDS", "60"))

    return {
        "base_url": base_url,
        "username": username,
        "password": password,
        "headless": headless,
        "storage_dir": storage_dir,
        "timeout_ms": timeout_sec * 1000,
    }


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

async def create_qr_for_certificate(
    certificate_id: int,
    db: "Session",
) -> QrAutomationResult:
    """
    Create or retrieve QR from the internal portal for a certificate.

    Flow:
    1. Load certificate from DB.
    2. Validate required fields.
    3. Login to portal.
    4. Search for existing row (deduplicate).
       - If found: download QR, skip creation.
       - If not found: create new row, then download QR.
    5. Save QR to DB and disk.
    6. Return result.
    """
    config = _get_config()

    if not config["username"] or not config["password"]:
        return QrAutomationResult(
            ok=False, certificate_id=certificate_id, qr_status="FAILED",
            action_taken="NONE",
            error_code=QrErrorCode.CONFIG_MISSING,
            error_message="INTERNAL_QR_PORTAL_USERNAME or PASSWORD not configured in .env",
        )

    os.makedirs(config["storage_dir"], exist_ok=True)

    browser: Browser | None = None
    context: BrowserContext | None = None

    try:
        # --- Load certificate ---
        from app.models.certificates import CertificateRecordRow

        cert_row = db.query(CertificateRecordRow).filter(
            CertificateRecordRow.certificate_id == certificate_id
        ).first()

        if not cert_row:
            return QrAutomationResult(
                ok=False, certificate_id=certificate_id, qr_status="FAILED",
                action_taken="NONE",
                error_code=QrErrorCode.CERTIFICATE_NOT_FOUND,
                error_message=f"Certificate id={certificate_id} not found in DB",
            )

        # --- Validate required fields ---
        cert_no = str(cert_row.certificate_no or "").strip()
        contract_no = str(cert_row.contract_no or "").strip()

        if not cert_no and not contract_no:
            return QrAutomationResult(
                ok=False, certificate_id=certificate_id, qr_status="FAILED",
                action_taken="NONE",
                error_code=QrErrorCode.CERTIFICATE_MISSING_REQUIRED_FIELD,
                error_message="Certificate has neither certificate_no nor contract_no — cannot search in portal",
            )

        org_name = str(cert_row.organization_name or "").strip()
        if not org_name:
            return QrAutomationResult(
                ok=False, certificate_id=certificate_id, qr_status="FAILED",
                action_taken="NONE",
                error_code=QrErrorCode.CERTIFICATE_MISSING_REQUIRED_FIELD,
                error_message="Certificate has no organization_name — required for portal form",
            )

        payload = _build_portal_payload(cert_row)
        logger.info(f"[QR-AUTO] cert_id={certificate_id} cert_no={cert_no!r} contract_no={contract_no!r}")

        # --- Launch Playwright ---
        pw = await async_playwright().start()
        try:
            browser = await pw.chromium.launch(headless=config["headless"])
            context = await browser.new_context(
                accept_downloads=True,
                viewport={"width": 1280, "height": 900},
            )
            page = await context.new_page()

            timeout_ms = config["timeout_ms"]

            # --- Login ---
            await _portal_login(page, config, timeout_ms)

            # --- DEDUPLICATE: Search for existing row first ---
            found_action, existing_qr = await _portal_search_existing(
                page, cert_no, contract_no, timeout_ms,
            )

            if found_action == "EXISTING_ROW" and existing_qr:
                # Found existing row with QR — use it directly
                logger.info(f"[QR-AUTO] Found existing row with QR for cert_id={certificate_id}")
                qr_base64 = existing_qr
                external_ref = f"existing_row_cert={cert_no}"

            elif found_action == "EXISTING_ROW" and not existing_qr:
                # Found row but no QR — download from it
                logger.info(f"[QR-AUTO] Found existing row without QR, downloading for cert_id={certificate_id}")
                qr_base64 = await _portal_download_qr_from_row(page, cert_no, contract_no, timeout_ms)
                external_ref = f"existing_row_cert={cert_no}"

                if not qr_base64:
                    return QrAutomationResult(
                        ok=False, certificate_id=certificate_id, qr_status="FAILED",
                        action_taken="EXISTING_ROW",
                        error_code=QrErrorCode.QR_DOWNLOAD_FAILED,
                        error_message="Found existing row but could not download QR from it",
                        debug_screenshot=await _save_debug_screenshot(context, certificate_id, "existing_row_no_qr"),
                    )

            else:
                # Not found — create new row
                logger.info(f"[QR-AUTO] No existing row, creating new for cert_id={certificate_id}")

                # Click "Thêm mới"
                await _portal_click_add_new(page, timeout_ms)

                # Fill form
                await _portal_fill_form(page, payload, timeout_ms)

                # Submit
                await _portal_submit(page, timeout_ms)

                # Search for the new row
                qr_base64 = await _portal_find_and_download_qr(
                    page, cert_no, contract_no, timeout_ms,
                )

                if not qr_base64:
                    return QrAutomationResult(
                        ok=False, certificate_id=certificate_id, qr_status="FAILED",
                        action_taken="CREATED_NEW",
                        error_code=QrErrorCode.ROW_NOT_FOUND_AFTER_SUBMIT,
                        error_message="Created new row but could not find or download its QR",
                        debug_screenshot=await _save_debug_screenshot(context, certificate_id, "after_submit_no_qr"),
                    )

                external_ref = f"new_row_cert={cert_no}"

            # --- Save QR to DB ---
            if qr_base64:
                cert_row.qr_image_data = qr_base64
                db.commit()
                logger.info(f"[QR-AUTO] QR saved to DB for cert_id={certificate_id}")

            # --- Save QR to file ---
            qr_file_path = None
            if qr_base64:
                qr_file_path = await _save_qr_file(
                    qr_base64, certificate_id, cert_no or contract_no, config["storage_dir"],
                )

            return QrAutomationResult(
                ok=True,
                certificate_id=certificate_id,
                qr_status="SUCCESS",
                action_taken=found_action if found_action == "EXISTING_ROW" else "CREATED_NEW",
                qr_file_path=qr_file_path,
                qr_base64_data=qr_base64,
                external_ref=external_ref,
                error_code=None,
                error_message=None,
                debug_screenshot=None,
            )

        finally:
            await pw.stop()

    except PlaywrightTimeout as e:
        logger.error(f"[QR-AUTO] Timeout for cert_id={certificate_id}: {e}")
        return QrAutomationResult(
            ok=False, certificate_id=certificate_id, qr_status="FAILED",
            action_taken="NONE",
            error_code=QrErrorCode.PORTAL_TIMEOUT,
            error_message=f"Portal operation timed out after {config['timeout_ms'] // 1000}s",
            debug_screenshot=await _save_debug_screenshot(context, certificate_id, "timeout"),
        )

    except Exception as e:
        logger.error(f"[QR-AUTO] Error for cert_id={certificate_id}: {e}")
        logger.error(traceback.format_exc())
        return QrAutomationResult(
            ok=False, certificate_id=certificate_id, qr_status="FAILED",
            action_taken="NONE",
            error_code=QrErrorCode.UNEXPECTED_ERROR,
            error_message=str(e),
            debug_screenshot=await _save_debug_screenshot(context, certificate_id, "error"),
        )

    finally:
        if browser:
            await browser.close()


# =============================================================================
# QR FROM PRINT FORM — accepts credentials + form data directly
# No pre-existing certificate record required.
# =============================================================================

@dataclass
class QrFromPrintFormResult:
    ok: bool
    qr_status: str          # SUCCESS | FAILED
    action_taken: str       # CREATED_NEW | EXISTING_ROW
    qr_base64_data: str | None = None
    qr_file_path: str | None = None
    portal_certificate_no: str | None = None
    external_ref: str | None = None
    error_code: str | None = None
    error_message: str | None = None


async def create_qr_from_print_form(
    portal_username: str,
    portal_password: str,
    form_data: dict[str, Any],
) -> QrFromPrintFormResult:
    """
    Generate QR from print form data using the internal portal.

    Unlike create_qr_for_certificate, this function:
    - Accepts portal credentials as parameters (not env vars)
    - Uses form_data dict directly instead of reading from DB
    - Does NOT save QR to DB (returns it to caller)
    - Does NOT require a certificate_id

    Args:
        portal_username: Portal login username
        portal_password: Portal login password
        form_data: Dict with fields like certificate_no, contract_no,
                   organization_name, address, business_sign_name,
                   business_location, effective_from, effective_to,
                   gcn_scope_col_1_text, field_code, etc.

    Returns:
        QrFromPrintFormResult with QR base64 data and portal certificate number.
    """
    if not portal_username or not portal_password:
        return QrFromPrintFormResult(
            ok=False,
            qr_status="FAILED",
            action_taken="NONE",
            error_code=QrErrorCode.CONFIG_MISSING,
            error_message="portal_username and portal_password are required",
        )

    cert_no = str(form_data.get("certificate_no") or "").strip()
    contract_no = str(form_data.get("contract_no") or "").strip()

    if not cert_no and not contract_no:
        return QrFromPrintFormResult(
            ok=False,
            qr_status="FAILED",
            action_taken="NONE",
            error_code=QrErrorCode.CERTIFICATE_MISSING_REQUIRED_FIELD,
            error_message="certificate_no or contract_no is required",
        )

    org_name = str(form_data.get("organization_name") or "").strip()
    if not org_name:
        return QrFromPrintFormResult(
            ok=False,
            qr_status="FAILED",
            action_taken="NONE",
            error_code=QrErrorCode.CERTIFICATE_MISSING_REQUIRED_FIELD,
            error_message="organization_name is required for portal form",
        )

    field_code = str(form_data.get("field_code") or "").strip()
    ngay_in = _format_portal_date(form_data.get("certificate_issue_date"))

    payload: dict[str, str] = {
        "tinhtrang":    "Phát hành",
        "linhvuc":     _get_portal_domain_value(field_code) if field_code else field_code,
        "sohd":        contract_no,
        "sogcn":       cert_no,
        "ngayincert":  ngay_in or date.today().strftime("%d/%m/%Y"),
        "ngaybatdau":  _format_portal_date(form_data.get("effective_from")),
        "ngayketthuc": _format_portal_date(form_data.get("effective_to")),
        "tendonvi":    org_name,
        "diachi":      str(form_data.get("address") or form_data.get("business_location") or "").strip(),
        "ghichu":      "",
    }

    logger.info(f"[QR-FORM] cert_no={cert_no!r} contract_no={contract_no!r} org={org_name!r}")

    config = _get_config()
    config = {**config, "username": portal_username, "password": portal_password}
    os.makedirs(config["storage_dir"], exist_ok=True)

    browser: Browser | None = None
    context: BrowserContext | None = None

    try:
        pw = await async_playwright().start()
        try:
            browser = await pw.chromium.launch(headless=config["headless"])
            context = await browser.new_context(
                accept_downloads=True,
                viewport={"width": 1280, "height": 900},
            )
            page = await context.new_page()
            timeout_ms = config["timeout_ms"]

            # Login with provided credentials
            await _portal_login(page, config, timeout_ms)

            # Search for existing row first (deduplicate)
            found_action, existing_qr = await _portal_search_existing(
                page, cert_no, contract_no, timeout_ms,
            )

            qr_base64: str | None = None
            external_ref: str | None = None

            if found_action == "EXISTING_ROW" and existing_qr:
                logger.info("[QR-FORM] Found existing row with QR")
                qr_base64 = existing_qr
                external_ref = f"existing_row_cert={cert_no or contract_no}"

            elif found_action == "EXISTING_ROW" and not existing_qr:
                logger.info("[QR-FORM] Found existing row without QR, downloading")
                qr_base64 = await _portal_download_qr_from_row(page, cert_no, contract_no, timeout_ms)
                external_ref = f"existing_row_cert={cert_no or contract_no}"

                if not qr_base64:
                    return QrFromPrintFormResult(
                        ok=False,
                        qr_status="FAILED",
                        action_taken="EXISTING_ROW",
                        error_code=QrErrorCode.QR_DOWNLOAD_FAILED,
                        error_message="Found existing row but could not download QR",
                    )

            else:
                logger.info("[QR-FORM] No existing row, creating new")
                await _portal_click_add_new(page, timeout_ms)
                await _portal_fill_form(page, payload, timeout_ms)
                await _portal_submit(page, timeout_ms)

                qr_base64 = await _portal_find_and_download_qr(
                    page, cert_no, contract_no, timeout_ms,
                )

                if not qr_base64:
                    return QrFromPrintFormResult(
                        ok=False,
                        qr_status="FAILED",
                        action_taken="CREATED_NEW",
                        error_code=QrErrorCode.ROW_NOT_FOUND_AFTER_SUBMIT,
                        error_message="Created new row but could not find or download QR",
                    )

                external_ref = f"new_row_cert={cert_no or contract_no}"

            # Save QR to file
            qr_file_path: str | None = None
            if qr_base64:
                qr_file_path = await _save_qr_file(
                    qr_base64, 0, cert_no or contract_no, config["storage_dir"],
                )

            return QrFromPrintFormResult(
                ok=True,
                qr_status="SUCCESS",
                action_taken=found_action if found_action == "EXISTING_ROW" else "CREATED_NEW",
                qr_base64_data=qr_base64,
                qr_file_path=qr_file_path,
                portal_certificate_no=cert_no or None,
                external_ref=external_ref,
            )

        finally:
            await pw.stop()

    except PlaywrightTimeout as e:
        logger.error(f"[QR-FORM] Timeout: {e}")
        return QrFromPrintFormResult(
            ok=False,
            qr_status="FAILED",
            action_taken="NONE",
            error_code=QrErrorCode.PORTAL_TIMEOUT,
            error_message=f"Portal operation timed out after {config['timeout_ms'] // 1000}s",
        )

    except Exception as e:
        logger.error(f"[QR-FORM] Error: {e}")
        logger.error(traceback.format_exc())
        return QrFromPrintFormResult(
            ok=False,
            qr_status="FAILED",
            action_taken="NONE",
            error_code=QrErrorCode.UNEXPECTED_ERROR,
            error_message=str(e),
        )

    finally:
        if browser:
            await browser.close()


# =============================================================================
# STEP 1: LOGIN
# =============================================================================

async def _portal_login(page: Page, config: dict, timeout_ms: int) -> None:
    """Login to the internal QR portal."""
    login_url = config["base_url"] + "/login"
    await page.goto(login_url, timeout=timeout_ms)
    await page.wait_for_load_state("networkidle", timeout=timeout_ms)

    await page.fill('input[name="email"]', config["username"], timeout=timeout_ms)
    await page.fill('input[name="password"]', config["password"], timeout=timeout_ms)
    await page.click('button[type="submit"]', timeout=timeout_ms)
    await page.wait_for_load_state("networkidle", timeout=timeout_ms)

    if "/login" in page.url:
        error_text = ""
        try:
            error_text = await page.locator(".alert-danger, .text-danger, [role=alert]").first.text_content()
        except Exception:
            pass
        raise RuntimeError(
            f"LOGIN_FAILED: still on login page. Error: {error_text or 'unknown'}"
        )


# =============================================================================
# STEP 2: SEARCH FOR EXISTING ROW (DEDUPLICATE)
# Returns ("EXISTING_ROW", qr_base64 | None) or ("NONE", None)
# =============================================================================

async def _portal_search_existing(
    page: Page,
    cert_no: str,
    contract_no: str,
    timeout_ms: int,
) -> tuple[str, str | None]:
    """
    Search portal table for an existing row matching cert_no or contract_no.
    Returns (action, qr_base64_or_None).
    """
    await page.wait_for_load_state("networkidle", timeout=timeout_ms)

    # Determine search term — prefer cert_no (more specific)
    search_term = cert_no if cert_no else contract_no
    search_by = "cert_no" if cert_no else "contract_no"

    logger.info(f"[QR-AUTO] Searching portal for {search_by}={search_term!r}")

    # Try various search box selectors
    search_selectors = [
        'input[type="search"]',
        'input[data-table-filter]',
        'input[data-global-filter]',
        'input[placeholder*="Tìm" i]',
        'input[placeholder*="tìm" i]',
        'input[placeholder*="Search" i]',
        'input[placeholder*="search" i]',
        'input[name="search"]',
        'input[name="q"]',
        'input#table-filter',
        '.dataTables_filter input',
        'input[aria-label*="search" i]',
    ]

    search_input = None
    for sel in search_selectors:
        try:
            inp = page.locator(sel).first
            if await inp.is_visible(timeout=2000):
                search_input = inp
                logger.info(f"[QR-AUTO] Found search input with: {sel}")
                break
        except Exception:
            continue

    if not search_input:
        # Try DataTables global search
        try:
            inp = page.locator(".dataTables_filter input, #DataTables_Table_0_filter input").first
            if await inp.is_visible(timeout=2000):
                search_input = inp
        except Exception:
            pass

    qr_base64 = None
    action = "NONE"

    if search_input:
        try:
            await search_input.clear(timeout=3000)
            await search_input.fill(search_term, timeout=5000)
            await search_input.press("Enter", timeout=3000)
            await page.wait_for_load_state("networkidle", timeout=timeout_ms)
            await asyncio.sleep(1.5)  # Wait for table to re-render

            logger.info(f"[QR-AUTO] Search executed for: {search_term!r}")

            # Try to get QR from visible rows
            qr_base64 = await _try_get_qr_from_visible_rows(page, timeout_ms)

            if qr_base64:
                action = "EXISTING_ROW"
                logger.info(f"[QR-AUTO] Found QR in search results")
            else:
                # Check if any rows matched
                row_count = await _count_visible_rows(page)
                if row_count > 0:
                    action = "EXISTING_ROW"
                    logger.info(f"[QR-AUTO] Found {row_count} row(s) but no QR")
                else:
                    action = "NONE"
                    logger.info(f"[QR-AUTO] No rows matched search")

        except Exception as e:
            logger.warning(f"[QR-AUTO] Search failed: {e}")
            action = "NONE"

    else:
        logger.warning("[QR-AUTO] No search input found on page — skipping deduplicate search")

    return action, qr_base64


def _extract_row_values_sync(row) -> dict[str, str]:
    """Extract text values from a table row (sync version)."""
    try:
        cells = row.locator("td").all()
        cell_texts = []
        for c in cells:
            try:
                cell_texts.append((c.inner_text() or "").strip())
            except Exception:
                cell_texts.append("")
        return {"cells": cell_texts}
    except Exception:
        return {"cells": []}


async def _try_get_qr_from_visible_rows(page: Page, timeout_ms: int) -> str | None:
    """
    Try to find and extract QR from visible table rows.
    Returns base64 string or None.
    """
    # Strategy 1: QR image in row
    for img_sel in ["img[src*=qr]", "img.qr", "img[alt*=QR]", ".qr-img img"]:
        try:
            imgs = page.locator(img_sel).all()
            for img in imgs:
                if await img.is_visible(timeout=1000):
                    src = await img.get_attribute("src") or ""
                    if src.startswith("data:image"):
                        return src
                    if src.startswith("/") or src.startswith("http"):
                        full_url = page.url.rstrip("/").rsplit("/", 1)[0] + "/" + src.lstrip("/")
                        async with page.context.request.get(full_url) as resp:
                            if resp.ok:
                                ct = resp.headers.get("content-type", "image/png")
                                body = await resp.body()
                                return f"data:{ct};base64,{base64.b64encode(body).decode()}"
        except Exception:
            continue

    # Strategy 2: Download button/link with data URL
    for link_sel in [
        "a[href*=data:image]",
        "a[download]",
        "a.btn-download",
        "a.qr-btn",
        "a[href*=qr]",
        "a[href*=download]",
    ]:
        try:
            links = page.locator(link_sel).all()
            for link in links:
                if await link.is_visible(timeout=1000):
                    href = await link.get_attribute("href") or ""
                    if href.startswith("data:image"):
                        return href
                    if href.startswith("/") or href.startswith("http"):
                        full_url = page.url.rstrip("/").rsplit("/", 1)[0] + "/" + href.lstrip("/")
                        async with page.context.request.get(full_url) as resp:
                            if resp.ok:
                                ct = resp.headers.get("content-type", "image/png")
                                body = await resp.body()
                                return f"data:{ct};base64,{base64.b64encode(body).decode()}"
        except Exception:
            continue

    # Strategy 3: Click row to open detail/modal, then find QR
    try:
        rows = page.locator("tbody tr, table.dataTable tbody tr").all()
        for row in rows:
            try:
                first_cell_text = (await row.locator("td").first.text_content() or "").strip()
                # Click the first cell (usually the action button)
                action_btn = row.locator("td:last-child a, td:last-child button").first
                if await action_btn.is_visible(timeout=1000):
                    await action_btn.click(timeout=3000)
                    await page.wait_for_load_state("networkidle", timeout=timeout_ms)
                    await asyncio.sleep(0.5)

                    # Look for QR in modal/expanded row
                    for img_sel in ["img[src*=qr]", "img[alt*=QR]", "img[src^=data]", ".modal img"]:
                        try:
                            imgs = page.locator(img_sel).all()
                            for img in imgs:
                                if await img.is_visible(timeout=2000):
                                    src = await img.get_attribute("src") or ""
                                    if src.startswith("data:image"):
                                        return src
                        except Exception:
                            continue

                    # Close modal if any
                    try:
                        close_btn = page.locator(".modal .btn-close, .modal-header button, .modal .close").first
                        if await close_btn.is_visible(timeout=1000):
                            await close_btn.click(timeout=2000)
                    except Exception:
                        pass
            except Exception:
                continue
    except Exception:
        pass

    return None


async def _count_visible_rows(page: Page) -> int:
    """Count visible data rows in the table."""
    try:
        rows = page.locator("tbody tr:not(.dtrg-group), table.dataTable tbody tr:not(.dtrg-group)").all()
        count = 0
        for row in rows:
            try:
                if await row.is_visible(timeout=500):
                    text = (await row.text_content() or "").strip()
                    if text:
                        count += 1
            except Exception:
                pass
        return count
    except Exception:
        return 0


# =============================================================================
# STEP 3: CLICK "THÊM MỚI"
# =============================================================================

async def _portal_click_add_new(page: Page, timeout_ms: int) -> None:
    """Click the 'Thêm mới' button to open the create form."""
    await page.wait_for_load_state("networkidle", timeout=timeout_ms)

    selectors = [
        'button:has-text("Thêm mới")',
        'a:has-text("Thêm mới")',
        'button:has-text("Thêm")',
        'button.btn-primary:has-text("Thêm")',
        'button.btn-add',
        ".btn-add",
        'a[data-bs-target*="modal"]',
        'button[data-bs-target*="modal"]',
    ]

    for selector in selectors:
        try:
            el = page.locator(selector).first
            if await el.is_visible(timeout=3000):
                await el.click(timeout=timeout_ms)
                await page.wait_for_load_state("networkidle", timeout=timeout_ms)
                await asyncio.sleep(0.5)  # Let modal animate in
                logger.info(f"[QR-AUTO] Clicked add button: {selector}")
                return
        except PlaywrightTimeout:
            continue

    raise RuntimeError(
        f"ADD_BUTTON_NOT_FOUND: Could not find or click 'Thêm mới'. "
        f"Tried: {', '.join(selectors)}. URL: {page.url}"
    )


# =============================================================================
# STEP 4: FILL FORM
# =============================================================================

async def _portal_fill_form(page: Page, payload: dict[str, str], timeout_ms: int) -> None:
    """Fill the 'Thêm mới' form with certificate data."""
    await page.wait_for_load_state("networkidle", timeout=timeout_ms)

    # Wait for form/modal to appear
    form_appeared = False
    for _ in range(5):
        try:
            form_sel = page.locator("form, .modal form, .modal-content, form[method=POST]").first
            if await form_sel.is_visible(timeout=3000):
                form_appeared = True
                break
        except Exception:
            pass
        await asyncio.sleep(0.3)

    if not form_appeared:
        raise RuntimeError(f"FORM_NOT_FOUND: Form/modal did not appear after clicking 'Thêm mới'. URL: {page.url}")

    filled = []
    failed = []

    for field_name, value in payload.items():
        if not value:
            continue

        filled_field = False

        # Try select first
        try:
            sel = page.locator(f'select[name="{field_name}"]')
            if await sel.count() > 0 and await sel.is_visible(timeout=2000):
                await sel.select_option(value, timeout=5000)
                filled.append(f"{field_name}={value!r} (select)")
                filled_field = True
        except Exception:
            pass

        if filled_field:
            continue

        # Try input[type=text]
        try:
            inp = page.locator(f'input[name="{field_name}"]')
            if await inp.count() > 0 and await inp.is_visible(timeout=2000):
                inp_type = (await inp.get_attribute("type") or "text").lower()
                if inp_type in ("text", "search", "url", "email", "tel"):
                    await inp.clear(timeout=3000)
                    await inp.fill(value, timeout=3000)
                    filled.append(f"{field_name}={value!r} (input)")
                    filled_field = True
        except Exception:
            pass

        if filled_field:
            continue

        # Try textarea
        try:
            ta = page.locator(f'textarea[name="{field_name}"]')
            if await ta.count() > 0 and await ta.is_visible(timeout=2000):
                await ta.clear(timeout=3000)
                await ta.fill(value, timeout=3000)
                filled.append(f"{field_name}={value!r} (textarea)")
                filled_field = True
        except Exception:
            pass

        if not filled_field:
            failed.append(field_name)

    logger.info(f"[QR-AUTO] Filled {len(filled)} fields: {filled}")
    if failed:
        logger.warning(f"[QR-AUTO] Could not fill fields: {failed}")


# =============================================================================
# STEP 5: SUBMIT
# =============================================================================

async def _portal_submit(page: Page, timeout_ms: int) -> None:
    """Submit the form."""
    await page.wait_for_load_state("networkidle", timeout=timeout_ms)

    submit_selectors = [
        'button[type="submit"]',
        'button:has-text("Lưu")',
        'button:has-text("Tạo")',
        'button.btn-success',
        'input[type="submit"]',
        ".modal button.btn-primary",
        ".modal-footer button.btn-primary",
    ]

    for selector in submit_selectors:
        try:
            el = page.locator(selector).first
            if await el.is_visible(timeout=2000):
                await el.click(timeout=timeout_ms)
                await page.wait_for_load_state("networkidle", timeout=timeout_ms)
                await asyncio.sleep(1)
                logger.info(f"[QR-AUTO] Submitted with: {selector}")
                return
        except PlaywrightTimeout:
            continue

    raise RuntimeError(f"SUBMIT_FAILED: Could not find submit button. Tried: {', '.join(submit_selectors)}")


# =============================================================================
# STEP 6: FIND ROW AND DOWNLOAD QR
# After creating a new row, search for it and extract QR.
# =============================================================================

async def _portal_find_and_download_qr(
    page: Page,
    cert_no: str,
    contract_no: str,
    timeout_ms: int,
) -> str | None:
    """
    Search for the created row and download its QR.
    Uses the DataTables search or fallback manual search.
    """
    await page.wait_for_load_state("networkidle", timeout=timeout_ms)
    await asyncio.sleep(1)

    # Use DataTables search if available
    search_term = cert_no if cert_no else contract_no

    search_selectors = [
        'input[type="search"]',
        '.dataTables_filter input',
        'input[data-table-filter]',
        'input[name="search"]',
        'input[placeholder*="Tìm"]',
        'input[placeholder*="tìm"]',
    ]

    for sel in search_selectors:
        try:
            inp = page.locator(sel).first
            if await inp.is_visible(timeout=2000):
                await inp.clear(timeout=2000)
                await inp.fill(search_term, timeout=3000)
                await inp.press("Enter", timeout=2000)
                await page.wait_for_load_state("networkidle", timeout=timeout_ms)
                await asyncio.sleep(1.5)
                logger.info(f"[QR-AUTO] Searched for: {search_term!r}")
                break
        except Exception:
            continue

    # Check for ambiguous results (multiple rows)
    row_count = await _count_visible_rows(page)

    if row_count == 0:
        logger.warning(f"[QR-AUTO] No rows found after searching for {search_term!r}")
        return None

    if row_count > 1:
        logger.warning(f"[QR-AUTO] Ambiguous match: {row_count} rows for {search_term!r}")
        # Prefer row where GCN column matches exactly
        exact_match = await _find_exact_row_index(page, cert_no, contract_no)
        if exact_match is None:
            logger.error(f"[QR-AUTO] AMBIGUOUS_MATCH: multiple rows, no exact GCN match")
            # Still try to get QR from any visible row
        else:
            logger.info(f"[QR-AUTO] Found exact match at row index: {exact_match}")

    # Try to get QR from visible rows
    qr = await _try_get_qr_from_visible_rows(page, timeout_ms)

    if qr:
        return qr

    # Fallback: try each visible row
    for attempt in range(2):
        try:
            rows = page.locator("tbody tr, table.dataTable tbody tr").all()
            for idx, row in enumerate(rows):
                try:
                    if not await row.is_visible(timeout=500):
                        continue
                    text = (await row.text_content() or "").strip()
                    if not text:
                        continue

                    # Try QR download from this row
                    qr = await _try_get_qr_from_row(page, row, timeout_ms)
                    if qr:
                        logger.info(f"[QR-AUTO] Got QR from row {idx}")
                        return qr

                except Exception as e:
                    logger.warning(f"[QR-AUTO] Row {idx} failed: {e}")
                    continue
        except Exception:
            pass

        # Clear search and retry
        if attempt == 0:
            for sel in search_selectors:
                try:
                    inp = page.locator(sel).first
                    if await inp.is_visible(timeout=2000):
                        await inp.clear(timeout=2000)
                        await inp.fill("", timeout=2000)
                        await inp.press("Enter", timeout=2000)
                        await page.wait_for_load_state("networkidle", timeout=timeout_ms)
                        await asyncio.sleep(1)
                        break
                except Exception:
                    continue

    logger.warning(f"[QR-AUTO] Could not find QR for {search_term!r} after all attempts")
    return None


async def _portal_download_qr_from_row(
    page: Page,
    cert_no: str,
    contract_no: str,
    timeout_ms: int,
) -> str | None:
    """Download QR from an existing row that was found in search."""
    # Search for the row first
    search_term = cert_no if cert_no else contract_no

    for sel in ['input[type="search"]', '.dataTables_filter input']:
        try:
            inp = page.locator(sel).first
            if await inp.is_visible(timeout=2000):
                await inp.clear(timeout=2000)
                await inp.fill(search_term, timeout=3000)
                await inp.press("Enter", timeout=2000)
                await page.wait_for_load_state("networkidle", timeout=timeout_ms)
                await asyncio.sleep(1)
                break
        except Exception:
            continue

    row_count = await _count_visible_rows(page)
    if row_count == 0:
        return None

    return await _try_get_qr_from_visible_rows(page, timeout_ms)


async def _try_get_qr_from_row(page: Page, row, timeout_ms: int) -> str | None:
    """Try to get QR by clicking action button in a specific row."""
    try:
        # Click any action button in the row
        action_links = row.locator("a, button").all()
        for link in action_links:
            try:
                if not await link.is_visible(timeout=500):
                    continue
                href = await link.get_attribute("href") or ""
                text = (await link.text_content() or "").strip()

                # Check if it's a QR/download link
                if any(kw in (href + text).lower() for kw in ["qr", "download", "tải", "tai"]):
                    await link.click(timeout=3000)
                    await page.wait_for_load_state("networkidle", timeout=timeout_ms)
                    await asyncio.sleep(0.5)

                    # Look for QR image in the new view
                    for img_sel in ["img[src*=qr]", "img[src^=data]", "img.qr"]:
                        try:
                            imgs = page.locator(img_sel).all()
                            for img in imgs:
                                if await img.is_visible(timeout=2000):
                                    src = await img.get_attribute("src") or ""
                                    if src.startswith("data:image"):
                                        return src
                        except Exception:
                            continue

                    # Close modal
                    try:
                        close = page.locator(".modal .close, .modal .btn-close, [aria-label=Close]").first
                        if await close.is_visible(timeout=1000):
                            await close.click(timeout=2000)
                    except Exception:
                        pass
            except Exception:
                continue
    except Exception:
        pass
    return None


async def _find_exact_row_index(page: Page, cert_no: str, contract_no: str) -> int | None:
    """Find the row index where GCN column exactly matches cert_no."""
    try:
        rows = page.locator("tbody tr, table.dataTable tbody tr").all()
        for idx, row in enumerate(rows):
            try:
                cells = row.locator("td").all()
                for cell in cells:
                    text = (await cell.text_content() or "").strip()
                    if cert_no and text == cert_no:
                        return idx
                    if contract_no and text == contract_no:
                        return idx
            except Exception:
                pass
    except Exception:
        pass
    return None


# =============================================================================
# SAVE QR FILE
# =============================================================================

async def _save_qr_file(
    qr_base64: str,
    certificate_id: int,
    label: str,
    storage_dir: str,
) -> str | None:
    """Decode base64 QR and save as PNG file."""
    try:
        data_part = qr_base64.split(",", 1)[1] if "," in qr_base64 else qr_base64
        image_data = base64.b64decode(data_part)

        safe_label = "".join(c for c in (label or str(certificate_id)) if c.isalnum() or c in "-_").rstrip()
        filename = f"qr_cert_{certificate_id}_{safe_label}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        filepath = os.path.join(storage_dir, filename)

        with open(filepath, "wb") as f:
            f.write(image_data)

        logger.info(f"[QR-AUTO] Saved QR file: {filepath}")
        return filepath

    except Exception as e:
        logger.error(f"[QR-AUTO] Failed to save QR file: {e}")
        return None


async def _save_debug_screenshot(
    context: BrowserContext | None,
    certificate_id: int,
    phase: str,
) -> str | None:
    """Save a debug screenshot to the storage directory."""
    if not context:
        return None
    try:
        config = _get_config()
        os.makedirs(config["storage_dir"], exist_ok=True)
        filename = f"debug_cert{certificate_id}_{phase}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        filepath = os.path.join(config["storage_dir"], filename)
        pages = context.pages
        if pages:
            await pages[0].screenshot(path=filepath, full_page=True)
            logger.info(f"[QR-AUTO] Debug screenshot: {filepath}")
            return filepath
    except Exception as e:
        logger.error(f"[QR-AUTO] Debug screenshot failed: {e}")
    return None
