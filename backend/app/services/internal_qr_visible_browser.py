"""
Internal QR Portal — Visible Browser Automation Service.

Opens the portal in a VISIBLE (headful) browser, lets the user see and
verify the pre-filled form, and waits for the user to manually click Save.

This module is separate from internal_qr_automation.py which runs headless.

Key design:
- Uses sync_playwright (NOT async) for simplicity in threading.
- Runs in run_in_threadpool to avoid blocking the FastAPI async loop.
- Does NOT auto-submit — user must click Save on the portal.
- Checks for duplicate rows before opening the "Thêm mới" form.
- Uses actual selectors discovered from smoke testing the portal.

Usage:
    from app.services.internal_qr_visible_browser import open_and_fill_portal
    result = await run_in_threadpool(open_and_fill_portal, payload_dict)
"""

from __future__ import annotations

import asyncio
import logging
import os
import traceback
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page, Error as PlaywrightError

logger = logging.getLogger(__name__)


# =============================================================================
# CONFIG
# =============================================================================

PORTAL_URL = os.environ.get(
    "INTERNAL_QR_PORTAL_BASE_URL", "http://14.241.251.220:7879"
).rstrip("/")

PORTAL_API = "http://14.241.251.220:3769"
TIMEOUT_MS = 60_000  # 60 seconds for all operations

DEBUG_DIR = r"F:\APPs\storage\debug"


def _get_timeout() -> int:
    try:
        return int(os.environ.get("INTERNAL_QR_TIMEOUT_SECONDS", "60")) * 1000
    except (TypeError, ValueError):
        return TIMEOUT_MS


def _ensure_debug_dir() -> None:
    """Create debug directory if it doesn't exist."""
    try:
        os.makedirs(DEBUG_DIR, exist_ok=True)
    except Exception:
        pass


def _save_debug_artifacts(
    page: Page,
    stage: str,
    prefix: str = "qr_portal",
) -> tuple[str | None, str | None]:
    """
    Save screenshot and HTML of current page state.
    Returns (screenshot_path, html_path).
    """
    import time

    _ensure_debug_dir()
    ts = time.strftime("%Y%m%d_%H%M%S")
    screenshot_path: str | None = None
    html_path: str | None = None

    try:
        safe_stage = stage.replace(" ", "_").replace("/", "_")
        screenshot_path = os.path.join(DEBUG_DIR, f"{prefix}_{safe_stage}_{ts}.png")
        page.screenshot(path=screenshot_path, full_page=True)
    except Exception as e:
        logger.warning(f"[Debug] Screenshot failed: {e}")
        screenshot_path = None

    try:
        safe_stage = stage.replace(" ", "_").replace("/", "_")
        html_path = os.path.join(DEBUG_DIR, f"{prefix}_{safe_stage}_{ts}.html")
        content = page.content()
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception as e:
        logger.warning(f"[Debug] HTML save failed: {e}")
        html_path = None

    return screenshot_path, html_path


def _close_browser(browser: Browser | None, pw_manager: Any) -> None:
    """Safely close browser and playwright manager."""
    if browser:
        try:
            browser.close()
        except Exception:
            pass
    if pw_manager:
        try:
            pw_manager.stop()
        except Exception:
            pass


def _stage_to_error_code(stage: str) -> str:
    """Map stage name to specific error code."""
    stage_upper = stage.upper()
    if "PLAYWRIGHT" in stage_upper or "START" in stage_upper:
        return "PLAYWRIGHT_START_FAILED"
    if "OPEN_PORTAL" in stage_upper:
        return "PORTAL_OPEN_FAILED"
    if "LOGIN_PAGE" in stage_upper or "LOGIN_FORM" in stage_upper or "LOGIN_PASSWORD" in stage_upper:
        return "LOGIN_FORM_NOT_FOUND"
    if "LOGIN_SUBMIT" in stage_upper or "LOGIN_DONE" in stage_upper:
        return "LOGIN_FAILED"
    if "DASHBOARD" in stage_upper:
        return "DASHBOARD_NOT_FOUND"
    if "CLICK_ADD" in stage_upper or "ADD_BUTTON" in stage_upper:
        return "ADD_BUTTON_NOT_FOUND"
    if "CREATE_FORM" in stage_upper:
        return "CREATE_FORM_NOT_FOUND"
    if "FILL_FIELD" in stage_upper:
        return "FORM_FILL_FAILED"
    if "FORM_FILLED" in stage_upper:
        return "FORM_FILLED_WAITING_USER"
    return "UNEXPECTED_ERROR"


# =============================================================================
# ERROR CODES
# =============================================================================

class QrVisibleError:
    VISIBLE_BROWSER_NOT_AVAILABLE = "VISIBLE_BROWSER_NOT_AVAILABLE"
    LOGIN_FAILED = "LOGIN_FAILED"
    PORTAL_TIMEOUT = "PORTAL_TIMEOUT"
    PORTAL_UNREACHABLE = "PORTAL_UNREACHABLE"
    DASHBOARD_NOT_FOUND = "DASHBOARD_NOT_FOUND"
    ADD_BUTTON_NOT_FOUND = "ADD_BUTTON_NOT_FOUND"
    FORM_FIELD_NOT_FOUND = "FORM_FIELD_NOT_FOUND"
    DROPDOWN_OPTION_NOT_FOUND = "DROPDOWN_OPTION_NOT_FOUND"
    EXISTING_ROW_FOUND = "EXISTING_ROW_FOUND"
    SEARCH_FAILED = "SEARCH_FAILED"
    PLAYWRIGHT_START_FAILED = "PLAYWRIGHT_START_FAILED"
    UNEXPECTED_ERROR = "UNEXPECTED_ERROR"


# =============================================================================
# RESULT TYPE
# =============================================================================

@dataclass
class OpenAndFillResult:
    ok: bool
    status: str  # PORTAL_FORM_FILLED | EXISTING_ROW_FOUND | VISIBLE_BROWSER_NOT_AVAILABLE | ...
    message: str = ""
    session_id: str | None = None
    browser_context_id: str | None = None
    error_code: str | None = None
    error_message: str | None = None

    # Fields found/not found during fill
    filled_fields: list[str] = field(default_factory=list)
    missing_fields: list[str] = field(default_factory=list)


@dataclass
class DownloadQrResult:
    ok: bool
    status: str  # QR_DOWNLOADED | ROW_NOT_FOUND | AMBIGUOUS_MATCH | ...
    message: str = ""
    qr_image_data: str | None = None
    portal_certificate_no: str | None = None
    action_taken: str = "NONE"
    error_code: str | None = None
    error_message: str | None = None


@dataclass
class OpenPortalReviewResult:
    ok: bool
    status: str  # PORTAL_FORM_FILLED_FOR_REVIEW | LOGIN_FAILED | ...
    message: str = ""
    stage: str = ""  # Stage where operation failed/succeeded
    filled_fields: list[str] = field(default_factory=list)
    missing_fields: list[str] = field(default_factory=list)
    error_code: str | None = None
    error_message: str | None = None
    error_type: str | None = None  # Python exception class name, e.g. "PlaywrightError"
    debug_screenshot: str | None = None
    debug_html: str | None = None


# =============================================================================
# DATE UTILITIES
# =============================================================================

def _format_portal_date(value: Any) -> str:
    """Convert date to dd/mm/yyyy for portal form."""
    if value is None:
        return ""
    if hasattr(value, "strftime"):
        return value.strftime("%d/%m/%Y")
    val_str = str(value).strip()
    if not val_str:
        return ""
    if "/" in val_str:
        return val_str
    if "-" in val_str:
        parts = val_str.split("-")
        if len(parts) >= 3:
            y, m, d = parts[0], parts[1], parts[2]
            return f"{int(d):02d}/{int(m):02d}/{y}"
    return val_str


def _fmt_date_for_portal(val: str | None) -> str:
    """Convert YYYY-MM-DD to DD/MM/YYYY."""
    return _format_portal_date(val)


# =============================================================================
# DOMAIN MAPPING
# =============================================================================

DOMAIN_TO_PORTAL_VALUE: dict[str, str] = {
    "Karaoke": "Karaoke",
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


def _map_domain(domain: str) -> str:
    if not domain:
        return ""
    return DOMAIN_TO_PORTAL_VALUE.get(domain, domain)


# =============================================================================
# FORM FIELD MAPPING
# Maps app field names to portal HTML name attributes.
# Updated from smoke test.
# =============================================================================

# Portal field names discovered from smoke test:
#   Tình trạng  -> select[name="tinhtrang"]
#   Lĩnh vực   -> select[name="linhvuc"]
#   Số HĐ      -> input[name="sohd"]
#   Số GCN     -> input[name="sogcn"]
#   Ngày in     -> input[name="ngayincert"]
#   Ngày BD     -> input[name="ngaybatdau"]
#   Ngày KT     -> input[name="ngayketthuc"]
#   Tên đơn vị  -> input[name="tendonvi"]
#   Địa chỉ    -> input[name="diachi"]
#   MST        -> input[name="masothue"]
#   Tên bảng hiệu -> input[name="banghieu"]
#   Địa chỉ KD  -> input[name="diachikd"]
#   Khu vực    -> input[name="khuvuc"]
#   Ghi chú    -> textarea[name="ghichu"]


PORTAL_FORM_FIELDS = {
    "tinhtrang": "Tình trạng",
    "linhvuc": "Lĩnh vực",
    "sohd": "Số hợp đồng",
    "sogcn": "Số GCN",
    "ngayincert": "Ngày in GCN",
    "ngaybatdau": "Ngày bắt đầu",
    "ngayketthuc": "Ngày kết thúc",
    "tendonvi": "Tên đơn vị",
    "diachi": "Địa chỉ",
    "masothue": "Mã số thuế",
    "banghieu": "Tên bảng hiệu",
    "diachikd": "Địa chỉ kinh doanh",
    "khuvuc": "Khu vực",
    "ghichu": "Ghi chú",
}


# =============================================================================
# LOGIN
# =============================================================================

def _portal_login(page: Page, username: str, password: str, timeout_ms: int) -> tuple[bool, str]:
    """Login to the portal. Returns (success, error_message)."""
    login_url = PORTAL_URL + "/login"
    try:
        page.goto(login_url, timeout=timeout_ms)
        page.wait_for_load_state("networkidle", timeout=timeout_ms)

        # Fill credentials — try multiple selector strategies
        filled = False
        for email_sel in ['input[name="email"]', 'input[name="username"]', 'input[type="email"]', '#email', 'input#email']:
            try:
                inp = page.locator(email_sel).first
                if inp.is_visible(timeout=2000):
                    inp.fill(username, timeout=3000)
                    filled = True
                    logger.info(f"[VisibleBrowser] Logged in with selector: {email_sel}")
                    break
            except Exception:
                continue

        if not filled:
            return False, "Could not find username input field"

        # Fill password
        pw_filled = False
        for pw_sel in ['input[name="password"]', 'input[type="password"]', '#password', 'input#password']:
            try:
                inp = page.locator(pw_sel).first
                if inp.is_visible(timeout=2000):
                    inp.fill(password, timeout=3000)
                    pw_filled = True
                    break
            except Exception:
                continue

        if not pw_filled:
            return False, "Could not find password input field"

        # Click submit
        for submit_sel in ['button[type="submit"]', 'button:has-text("Đăng nhập")', 'button:has-text("Login")', '.btn-login']:
            try:
                btn = page.locator(submit_sel).first
                if btn.is_visible(timeout=2000):
                    btn.click(timeout=timeout_ms)
                    break
            except Exception:
                continue

        page.wait_for_load_state("networkidle", timeout=timeout_ms)

        # Check if still on login page
        if "/login" in page.url:
            error_text = ""
            try:
                for err_sel in [".alert-danger", ".text-danger", "[role=alert]", ".error-message"]:
                    try:
                        el = page.locator(err_sel).first
                        if el.is_visible(timeout=1000):
                            error_text = el.inner_text() or ""
                            break
                    except Exception:
                        continue
            except Exception:
                pass
            return False, f"Login failed — still on login page. Error: {error_text or 'unknown'}"

        logger.info(f"[VisibleBrowser] Login successful. URL: {page.url}")
        return True, ""

    except PlaywrightError as e:
        return False, f"Playwright error during login: {e}"
    except Exception as e:
        return False, f"Unexpected error during login: {e}"


# =============================================================================
# SEARCH FOR DUPLICATE ROWS
# =============================================================================

def _portal_search_existing(
    page: Page,
    cert_no: str,
    contract_no: str,
    timeout_ms: int,
) -> tuple[str, str | None]:
    """
    Search for existing row matching cert_no or contract_no.
    Returns (action, qr_base64_or_None).
    action: "EXISTING_ROW" | "NONE"
    """
    page.wait_for_load_state("networkidle", timeout=timeout_ms)

    search_term = cert_no if cert_no else contract_no
    if not search_term:
        return "NONE", None

    logger.info(f"[VisibleBrowser] Searching for existing: {search_term!r}")

    # Find search input
    search_input = None
    for sel in [
        'input[type="search"]',
        'input[placeholder*="Tìm" i]',
        'input[placeholder*="search" i]',
        'input[name="search"]',
        '.dataTables_filter input',
        '#table-filter',
    ]:
        try:
            inp = page.locator(sel).first
            if inp.is_visible(timeout=2000):
                search_input = inp
                logger.info(f"[VisibleBrowser] Found search input: {sel}")
                break
        except Exception:
            continue

    if not search_input:
        logger.warning("[VisibleBrowser] No search input found on page")
        return "NONE", None

    try:
        search_input.clear(timeout=3000)
        search_input.fill(search_term, timeout=5000)
        search_input.press("Enter", timeout=3000)
        page.wait_for_load_state("networkidle", timeout=timeout_ms)
        import time; time.sleep(1.5)  # Wait for table re-render
    except Exception as e:
        logger.warning(f"[VisibleBrowser] Search failed: {e}")
        return "NONE", None

    # Try to extract QR from visible rows
    qr = _extract_qr_from_visible_rows(page, timeout_ms)
    row_count = _count_visible_rows(page)

    if row_count > 0:
        logger.info(f"[VisibleBrowser] Found {row_count} row(s) for {search_term!r}")
        return "EXISTING_ROW", qr

    logger.info(f"[VisibleBrowser] No rows found for {search_term!r}")
    return "NONE", None


def _extract_qr_from_visible_rows(page: Page, timeout_ms: int) -> str | None:
    """Try to extract QR image from visible table rows."""
    import base64

    # Strategy 1: QR img with data URL
    for img_sel in ["img[src*=qr]", "img[alt*=QR]", ".qr-img img"]:
        try:
            for img in page.locator(img_sel).all():
                if img.is_visible(timeout=1000):
                    src = img.get_attribute("src") or ""
                    if src.startswith("data:image"):
                        return src
                    if src.startswith("/") or src.startswith("http"):
                        full_url = page.url.rstrip("/").rsplit("/", 1)[0] + "/" + src.lstrip("/")
                        try:
                            resp = page.context.request.get(full_url)
                            if resp.ok:
                                ct = resp.headers.get("content-type", "image/png")
                                body = resp.body()
                                return f"data:{ct};base64,{base64.b64encode(body).decode()}"
                        except Exception:
                            pass
        except Exception:
            continue

    # Strategy 2: Download links
    for link_sel in ["a[href*=qr]", "a[download]", "a.btn-qr"]:
        try:
            for link in page.locator(link_sel).all():
                if link.is_visible(timeout=1000):
                    href = link.get_attribute("href") or ""
                    if href.startswith("data:image"):
                        return href
        except Exception:
            continue

    return None


def _count_visible_rows(page: Page) -> int:
    """Count visible data rows in the table."""
    try:
        count = 0
        for row in page.locator("tbody tr, table.dataTable tbody tr").all():
            try:
                if row.is_visible(timeout=500):
                    text = (row.inner_text() or "").strip()
                    if text:
                        count += 1
            except Exception:
                pass
        return count
    except Exception:
        return 0


# =============================================================================
# CLICK "THÊM MỚI"
# =============================================================================

def _click_add_new(page: Page, timeout_ms: int) -> bool:
    """Click the 'Thêm mới' button. Returns True if found and clicked."""
    page.wait_for_load_state("networkidle", timeout=timeout_ms)

    selectors = [
        'button:has-text("Thêm mới")',
        'a:has-text("Thêm mới")',
        'button:has-text("Thêm")',
        'button.btn-primary',
        ".btn-add",
        'button[data-bs-target*="modal"]',
    ]

    for sel in selectors:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=3000):
                el.click(timeout=timeout_ms)
                page.wait_for_load_state("networkidle", timeout=timeout_ms)
                import time; time.sleep(0.5)
                logger.info(f"[VisibleBrowser] Clicked add button: {sel}")
                return True
        except Exception:
            continue

    return False


# =============================================================================
# WAIT FOR FORM/MODAL TO APPEAR
# =============================================================================

def _wait_for_form(page: Page, timeout_ms: int) -> bool:
    """Wait for form/modal to appear after clicking add. Returns True if found."""
    import time
    for _attempt in range(10):  # ~3 seconds total
        for sel in ["form", ".modal form", ".modal-content", "form[method=POST]", "[role=dialog]"]:
            try:
                el = page.locator(sel).first
                if el.is_visible(timeout=1000):
                    return True
            except Exception:
                continue
        time.sleep(0.3)
    return False


# =============================================================================
# FILL FORM — Step by step with actual portal field names
# =============================================================================

def _fill_form(
    page: Page,
    cert_no: str,
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
    timeout_ms: int,
) -> tuple[list[str], list[str]]:
    """
    Fill the portal form using actual field names discovered from smoke test.
    Returns (filled_fields, missing_fields).
    Does NOT submit.
    """
    filled: list[str] = []
    missing: list[str] = []

    # Build payload
    ngay_in = _fmt_date_for_portal(issue_date) or datetime.now().strftime("%d/%m/%Y")
    ngay_bd = _fmt_date_for_portal(effective_from)
    ngay_kt = _fmt_date_for_portal(effective_to)

    payload: dict[str, str] = {
        "tinhtrang": "Phát hành",
        "linhvuc": _map_domain(domain) if domain else "",
        "sohd": str(contract_no or "").strip(),
        "sogcn": str(cert_no or "").strip(),
        "ngayincert": ngay_in,
        "ngaybatdau": ngay_bd,
        "ngayketthuc": ngay_kt,
        "tendonvi": str(organization_name or "").strip(),
        "diachi": str(address or "").strip(),
        "masothue": str(tax_code or "").strip(),
        "banghieu": str(brand_name or "").strip(),
        "diachikd": str(usage_address or "").strip(),
        "khuvuc": str(region or "").strip(),
        "ghichu": str(portal_note or "").strip(),
    }

    # Wait for form
    if not _wait_for_form(page, timeout_ms):
        logger.warning("[VisibleBrowser] Form/modal did not appear")
        # Still try to fill fields that might be on the page
        for field_name in payload:
            if not payload[field_name]:
                continue
            missing.append(field_name)
        return [], list(payload.keys())

    # Fill each field
    for field_name, value in payload.items():
        if not value:
            missing.append(field_name)
            continue

        success = False

        # Try select first
        try:
            sel_el = page.locator(f'select[name="{field_name}"]').first
            if sel_el.is_visible(timeout=1000):
                # Try to find option by text
                options = sel_el.locator("option").all()
                for opt in options:
                    opt_text = opt.inner_text() or ""
                    if value.lower() in opt_text.lower() or opt_text.lower() in value.lower():
                        opt_value = opt.get_attribute("value") or ""
                        sel_el.select_option(opt_value if opt_value else opt_text, timeout=2000)
                        filled.append(field_name)
                        success = True
                        break
                if not success:
                    # Try direct value
                    sel_el.select_option(value, timeout=2000)
                    filled.append(field_name)
                    success = True
        except Exception:
            pass

        if success:
            continue

        # Try input text
        try:
            inp = page.locator(f'input[name="{field_name}"]').first
            if inp.is_visible(timeout=1000):
                inp.clear(timeout=2000)
                inp.fill(value, timeout=3000)
                filled.append(field_name)
                continue
        except Exception:
            pass

        # Try input with placeholder matching field label
        field_label = PORTAL_FORM_FIELDS.get(field_name, field_name)
        try:
            # Try by label association
            lbl = page.locator(f'label:has-text("{field_label}"), .form-label:has-text("{field_label}")').first
            if lbl.is_visible(timeout=1000):
                for_id = lbl.get_attribute("for")
                if for_id:
                    inp = page.locator(f'#{for_id}').first
                    if inp.is_visible(timeout=1000):
                        inp.clear(timeout=2000)
                        inp.fill(value, timeout=3000)
                        filled.append(field_name)
                        continue
        except Exception:
            pass

        # Try textarea
        try:
            ta = page.locator(f'textarea[name="{field_name}"]').first
            if ta.is_visible(timeout=1000):
                ta.clear(timeout=2000)
                ta.fill(value, timeout=3000)
                filled.append(field_name)
                continue
        except Exception:
            pass

        missing.append(field_name)
        logger.warning(f"[VisibleBrowser] Could not fill field: {field_name} ({field_label})")

    logger.info(f"[VisibleBrowser] Filled fields: {filled}")
    if missing:
        logger.warning(f"[VisibleBrowser] Missing fields: {missing}")

    return filled, missing


# =============================================================================
# MAIN: OPEN AND FILL
# =============================================================================

def open_and_fill_portal(payload: dict[str, Any]) -> OpenAndFillResult:
    """
    Open portal in visible browser, login, check duplicates, fill form.
    Does NOT auto-submit. Browser stays open for user to review and save.

    This function runs in a thread via run_in_threadpool.

    Returns OpenAndFillResult.
    """
    username = payload.get("portal_username", "")
    password = payload.get("portal_password", "")
    cert_no = payload.get("certificate_no", "") or ""
    contract_no = payload.get("contract_no", "") or ""
    effective_from = payload.get("effective_from")
    effective_to = payload.get("effective_to")
    issue_date = payload.get("issue_date")
    organization_name = payload.get("organization_name", "")
    address = payload.get("address", "")
    tax_code = payload.get("tax_code", "")
    brand_name = payload.get("brand_name", "")
    usage_address = payload.get("usage_address", "")
    domain = payload.get("domain", "")
    region = payload.get("region", "")
    portal_note = payload.get("portal_note", "")

    timeout_ms = _get_timeout()
    session_id = str(uuid.uuid4())

    # Validate required fields upfront
    validation_errors: list[str] = []
    if not username.strip():
        validation_errors.append("portal_username")
    if not password.strip():
        validation_errors.append("portal_password")
    if not cert_no.strip() and not contract_no.strip():
        validation_errors.append("certificate_no hoac contract_no")

    if validation_errors:
        return OpenAndFillResult(
            ok=False,
            status="VALIDATION_FAILED",
            message="Các trường bắt buộc: " + ", ".join(validation_errors),
            error_code="VALIDATION_FAILED",
            error_message=f"Thieu truong: {', '.join(validation_errors)}",
        )

    browser: Browser | None = None
    context: BrowserContext | None = None
    _browser_launched = False
    _result: OpenAndFillResult | None = None

    try:
        pw = sync_playwright()
        browser = pw.chromium.launch(
            headless=False,
            args=["--start-maximized", "--disable-popup-blocking"],
        )
        _browser_launched = True
        context = browser.new_context(viewport={"width": 1400, "height": 900})
        page = context.new_page()

        logger.info(f"[VisibleBrowser] Opening portal at {PORTAL_URL}")

        # Login
        login_ok, login_err = _portal_login(page, username, password, timeout_ms)
        if not login_ok:
            _result = OpenAndFillResult(
                ok=False,
                status="LOGIN_FAILED",
                message="Đăng nhập portal thất bại.",
                error_code=QrVisibleError.LOGIN_FAILED,
                error_message=login_err,
            )
        else:
            page.wait_for_load_state("networkidle", timeout=timeout_ms)
            if "/login" in page.url:
                _result = OpenAndFillResult(
                    ok=False,
                    status="LOGIN_FAILED",
                    message="Đăng nhập portal thất bại — chuyển hướng về trang login.",
                    error_code=QrVisibleError.LOGIN_FAILED,
                    error_message="Login redirected back to login page",
                )
            else:
                # Check for duplicate
                if cert_no or contract_no:
                    dup_action, dup_qr = _portal_search_existing(
                        page, cert_no, contract_no, timeout_ms,
                    )
                    if dup_action == "EXISTING_ROW":
                        logger.info(f"[VisibleBrowser] Found existing row — keeping browser open")
                        _result = OpenAndFillResult(
                            ok=True,
                            status="EXISTING_ROW_FOUND",
                            message=f"Đã tồn tại dữ liệu với Số GCN '{cert_no}' trên portal. Vui lòng dùng nút 'Tải QR từ portal' để lấy QR.",
                            session_id=session_id,
                            error_code=QrVisibleError.EXISTING_ROW_FOUND,
                            error_message="Dữ liệu đã tồn tại trên portal.",
                        )
                    else:
                        _result = None
                else:
                    _result = None

                if _result is None:
                    # Click "Thêm mới"
                    add_found = _click_add_new(page, timeout_ms)
                    if not add_found:
                        _result = OpenAndFillResult(
                            ok=False,
                            status="ADD_BUTTON_NOT_FOUND",
                            message="Không tìm thấy nút 'Thêm mới' trên portal.",
                            error_code=QrVisibleError.ADD_BUTTON_NOT_FOUND,
                            error_message="ADD_BUTTON_NOT_FOUND: Could not find 'Thêm mới' button",
                        )
                    else:
                        # Fill form — NO submit
                        filled, missing = _fill_form(
                            page=page,
                            cert_no=cert_no,
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
                            timeout_ms=timeout_ms,
                        )

                        if not filled:
                            _result = OpenAndFillResult(
                                ok=False,
                                status="FORM_FIELD_NOT_FOUND",
                                message="Không thể điền bất kỳ trường nào trên form portal.",
                                error_code=QrVisibleError.FORM_FIELD_NOT_FOUND,
                                error_message=f"Could not fill any fields. Missing: {missing}",
                                filled_fields=filled,
                                missing_fields=missing,
                            )
                        else:
                            # Success — form is filled, browser stays open for user
                            logger.info(
                                f"[VisibleBrowser] Form filled successfully. "
                                f"Filled: {filled}. Missing: {missing}. "
                                f"Browser kept open. session_id={session_id}"
                            )
                            _result = OpenAndFillResult(
                                ok=True,
                                status="PORTAL_FORM_FILLED",
                                message="Đã điền form trên portal. Vui lòng kiểm tra dữ liệu và tự bấm 'Lưu' trên portal. Sau khi lưu xong, quay lại app bấm 'Tải QR từ portal'.",
                                session_id=session_id,
                                filled_fields=filled,
                                missing_fields=missing,
                            )

    except PlaywrightError as e:
        logger.error(f"[VisibleBrowser] Playwright error: {e}")
        logger.error(traceback.format_exc())
        err_code = QrVisibleError.PORTAL_UNREACHABLE
        if "timeout" in str(e).lower():
            err_code = QrVisibleError.PORTAL_TIMEOUT
        _result = OpenAndFillResult(
            ok=False,
            status=err_code,
            message="Lỗi Playwright khi thao tác với portal.",
            error_code=err_code,
            error_message=str(e),
        )
    except Exception as e:
        logger.error(f"[VisibleBrowser] Unexpected error: {e}")
        logger.error(traceback.format_exc())
        _result = OpenAndFillResult(
            ok=False,
            status="UNEXPECTED_ERROR",
            message="Có lỗi không xác định khi mở portal.",
            error_code=QrVisibleError.UNEXPECTED_ERROR,
            error_message=str(e),
        )

    # If result is already set (error), close the browser
    # If result is PORTAL_FORM_FILLED or EXISTING_ROW_FOUND, keep browser open
    if _result is not None:
        if not _result.ok or _result.status in ("PORTAL_FORM_FILLED", "EXISTING_ROW_FOUND"):
            # Close browser only on error or when we're done (not when waiting for user)
            pass
        if _result.ok:
            # Success — keep browser open, user will close it manually
            # Return result without closing browser
            return _result
        else:
            # Error — close browser
            if browser:
                try:
                    browser.close()
                except Exception:
                    pass
            return _result

    # Should not reach here
    return OpenAndFillResult(
        ok=False,
        status="UNEXPECTED_ERROR",
        error_code=QrVisibleError.UNEXPECTED_ERROR,
        error_message="Unexpected code path in open_and_fill_portal",
    )


# =============================================================================
# DOWNLOAD QR AFTER USER SAVE (via API-first, no Playwright needed)
# =============================================================================

def download_qr_after_user_save(
    username: str,
    password: str,
    cert_no: str,
    contract_no: str,
) -> DownloadQrResult:
    """
    After user manually saves on the portal, search for the row and download QR.
    Uses API-first approach (httpx) — no browser needed.

    Returns DownloadQrResult.
    """
    import httpx

    if not username or not password:
        return DownloadQrResult(
            ok=False,
            status="VALIDATION_FAILED",
            error_code="VALIDATION_FAILED",
            error_message="portal_username and portal_password are required",
        )

    if not cert_no and not contract_no:
        return DownloadQrResult(
            ok=False,
            status="VALIDATION_FAILED",
            error_code="VALIDATION_FAILED",
            error_message="certificate_no or contract_no is required",
        )

    client = httpx.Client(timeout=30.0, follow_redirects=True)

    try:
        # 1. Login
        resp = client.post(
            f"{PORTAL_API}/ad/login",
            json={"username": username, "password": password},
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )

        if resp.status_code == 401:
            body = resp.json()
            return DownloadQrResult(
                ok=False,
                status="LOGIN_FAILED",
                error_code="LOGIN_FAILED",
                error_message=body.get("message", "Login failed"),
            )

        if resp.status_code != 200:
            return DownloadQrResult(
                ok=False,
                status="LOGIN_FAILED",
                error_code="LOGIN_FAILED",
                error_message=f"Login returned status {resp.status_code}",
            )

        body = resp.json()
        token = body.get("accessToken")
        if not token:
            return DownloadQrResult(
                ok=False,
                status="LOGIN_FAILED",
                error_code="LOGIN_FAILED",
                error_message="No accessToken in login response",
            )

        auth_headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        }

        # 2. Search by certificate_no first, then contract_no
        search_payload = {
            "keyword": cert_no or contract_no,
            "so_hop_dong": contract_no,
            "so_giay_chung_nhan_day_du": cert_no,
            "ten_don_vi": "",
            "ten_nguoi_tao": "",
            "ghi_chu": "",
            "page": 1,
            "limit": 200,
        }

        resp = client.post(
            f"{PORTAL_API}/ad/search",
            json=search_payload,
            headers=auth_headers,
        )

        if resp.status_code != 200:
            return DownloadQrResult(
                ok=False,
                status="SEARCH_FAILED",
                error_code="SEARCH_FAILED",
                error_message=f"Search failed with status {resp.status_code}",
            )

        results = resp.json().get("results", [])
        logger.info(f"[VisibleBrowser] Search results: {len(results)} rows")

        # Exact match by cert_no
        matched_rows = []
        if cert_no:
            matched_rows = [
                r for r in results
                if str(r.get("so_giay_chung_nhan_day_du") or "").strip() == cert_no.strip()
            ]

        # Fallback to contract_no
        if not matched_rows and contract_no:
            matched_rows = [
                r for r in results
                if str(r.get("so_hop_dong") or "").strip() == contract_no.strip()
            ]

        if not matched_rows:
            return DownloadQrResult(
                ok=False,
                status="ROW_NOT_FOUND",
                message="Không tìm thấy dòng dữ liệu sau khi lưu. Vui lòng đợi và thử lại.",
                error_code="ROW_NOT_FOUND_AFTER_USER_SAVE",
                error_message=f"No row found for cert={cert_no!r} contract={contract_no!r}",
            )

        if len(matched_rows) > 1:
            return DownloadQrResult(
                ok=False,
                status="AMBIGUOUS_MATCH",
                message=f"Tìm thấy {len(matched_rows)} dòng trùng nhau. Vui lòng kiểm tra trên portal.",
                error_code="AMBIGUOUS_MATCH",
                error_message=f"Multiple rows match cert={cert_no!r} contract={contract_no!r}",
            )

        row = matched_rows[0]

        # Extract QR
        qr_image = row.get("qr_image")
        if not qr_image or not isinstance(qr_image, str) or not qr_image.startswith("data:image"):
            return DownloadQrResult(
                ok=True,
                status="QR_NOT_IN_ROW",
                message="Đã tìm thấy dòng dữ liệu nhưng chưa có QR. Vui lòng đợi portal xử lý và thử lại.",
                portal_certificate_no=row.get("so_giay_chung_nhan_day_du") or cert_no or contract_no,
                action_taken="EXISTING_ROW",
                error_code="QR_DOWNLOAD_FAILED",
                error_message="Row found but qr_image not available",
            )

        return DownloadQrResult(
            ok=True,
            status="QR_DOWNLOADED",
            message="Đã tải QR từ portal thành công.",
            qr_image_data=qr_image,
            portal_certificate_no=row.get("so_giay_chung_nhan_day_du") or cert_no or contract_no,
            action_taken="DOWNLOADED_AFTER_USER_SAVE",
        )

    except httpx.ConnectError as e:
        return DownloadQrResult(
            ok=False,
            status="PORTAL_UNREACHABLE",
            error_code="PORTAL_UNREACHABLE",
            error_message=f"Cannot connect to portal: {e}",
        )
    except httpx.TimeoutException:
        return DownloadQrResult(
            ok=False,
            status="PORTAL_TIMEOUT",
            error_code="PORTAL_TIMEOUT",
            error_message="Portal request timed out",
        )
    except Exception as e:
        logger.error(f"[VisibleBrowser] Download QR error: {e}")
        logger.error(traceback.format_exc())
        return DownloadQrResult(
            ok=False,
            status="UNEXPECTED_ERROR",
            error_code="UNEXPECTED_ERROR",
            error_message=str(e),
        )
    finally:
        client.close()


# =============================================================================
# OPEN PORTAL FOR REVIEW — visible browser, fill form, STOP (no submit)
# =============================================================================

def _build_result(
    ok: bool,
    status: str,
    message: str,
    stage: str,
    error_code: str | None = None,
    error_message: str | None = None,
    error_type: str | None = None,
    filled_fields: list[str] | None = None,
    missing_fields: list[str] | None = None,
    screenshot: str | None = None,
    html: str | None = None,
) -> OpenPortalReviewResult:
    return OpenPortalReviewResult(
        ok=ok,
        status=status,
        message=message,
        stage=stage,
        error_code=error_code,
        error_message=error_message,
        error_type=error_type,
        filled_fields=filled_fields or [],
        missing_fields=missing_fields or [],
        debug_screenshot=screenshot,
        debug_html=html,
    )


def open_portal_for_review(payload: dict[str, Any]) -> OpenPortalReviewResult:
    """
    Opens the internal QR portal in a VISIBLE browser, logs in, clicks "Thêm mới",
    fills the form with the provided data, and STOPS — does NOT submit.

    Browser is kept open for user to manually review and click Save.

    Stage-based logging for debugging:
      VALIDATION -> PLAYWRIGHT_START -> BROWSER_LAUNCH -> OPEN_PORTAL ->
      LOGIN_FORM_FOUND -> LOGIN_SUBMIT -> LOGIN_DONE -> DASHBOARD_FOUND ->
      CLICK_ADD_BUTTON -> CREATE_FORM_OPENED -> FILL_FIELD_* -> FORM_FILLED_WAITING_USER

    On failure: saves screenshot + HTML at the failing stage.
    """
    username = payload.get("portal_username", "")
    password = payload.get("portal_password", "")
    cert_no = payload.get("certificate_no") or ""
    contract_no = payload.get("contract_no") or ""
    effective_from = payload.get("effective_from")
    effective_to = payload.get("effective_to")
    issue_date = payload.get("issue_date")
    organization_name = payload.get("organization_name") or ""
    address = payload.get("address") or ""
    tax_code = payload.get("tax_code") or ""
    brand_name = payload.get("brand_name") or ""
    usage_address = payload.get("usage_address") or ""
    domain = payload.get("domain") or ""
    region = payload.get("region") or ""
    portal_note = payload.get("portal_note") or ""

    logger.info("[OpenPortalReview] STAGE=VALIDATION")
    if not username.strip() or not password.strip():
        return _build_result(
            ok=False,
            status="VALIDATION_FAILED",
            message="Tài khoản và mật khẩu portal bắt buộc.",
            stage="VALIDATION",
            error_code="VALIDATION_FAILED",
            error_message="portal_username and portal_password are required",
        )

    browser: Browser | None = None
    pw_manager: Any = None
    pw: Any = None
    timeout_ms = _get_timeout()
    page: Page | None = None

    # Mutable tracker for exception handlers that can't access local variables
    current_stage: str = "START"
    filled_tracker: list[str] = []

    try:
        # Stage: PLAYWRIGHT_START
        current_stage = "PLAYWRIGHT_START"
        logger.info("[OpenPortalReview] STAGE=PLAYWRIGHT_START")
        pw_manager = sync_playwright()
        pw = pw_manager.start()
        current_stage = "PLAYWRIGHT_STARTED"
        logger.info("[OpenPortalReview] STAGE=PLAYWRIGHT_STARTED")

        # Stage: BROWSER_LAUNCH
        current_stage = "BROWSER_LAUNCH"
        logger.info("[OpenPortalReview] STAGE=BROWSER_LAUNCH")
        browser = pw.chromium.launch(
            headless=False,
            args=["--start-maximized", "--disable-popup-blocking"],
        )
        context = browser.new_context(viewport={"width": 1400, "height": 900})
        page = context.new_page()
        current_stage = "BROWSER_LAUNCHED"
        logger.info("[OpenPortalReview] STAGE=BROWSER_LAUNCHED")

        # Stage: OPEN_PORTAL
        current_stage = "OPEN_PORTAL"
        logger.info(f"[OpenPortalReview] STAGE=OPEN_PORTAL url={PORTAL_URL}/login")
        login_url = PORTAL_URL + "/login"
        try:
            page.goto(login_url, timeout=timeout_ms)
            page.wait_for_load_state("load", timeout=timeout_ms)
            page.wait_for_load_state("networkidle", timeout=timeout_ms)
            # Wait for React SPA to render form elements
            page.wait_for_selector('input, form', timeout=15000)
        except PlaywrightError as e:
            ss, html = _save_debug_artifacts(page, current_stage) if page else (None, None)
            _close_browser(browser, pw_manager)
            return _build_result(
                ok=False,
                status="PORTAL_OPEN_FAILED",
                message=f"Khong mo duoc trang login portal. URL: {login_url}",
                stage=current_stage,
                error_code="PORTAL_OPEN_FAILED",
                error_message=str(e),
                screenshot=ss,
                html=html,
            )

        current_stage = "LOGIN_PAGE_LOADED"
        logger.info(f"[OpenPortalReview] STAGE=LOGIN_PAGE_LOADED title='{page.title()}' url={page.url}")

        # Stage: LOGIN_FORM_FOUND
        current_stage = "LOGIN_FORM_FOUND"
        logger.info("[OpenPortalReview] STAGE=LOGIN_FORM_FOUND")
        # Try username input — wait for it to appear first (React SPA renders client-side)
        username_filled = False
        username_sel = ""
        for sel in ['input[name="email"]', 'input[name="username"]', 'input[type="email"]', '#email', 'input#email']:
            try:
                inp = page.locator(sel).first
                if inp.is_visible(timeout=5000):
                    inp.fill(username, timeout=3000)
                    username_filled = True
                    username_sel = sel
                    logger.info(f"[OpenPortalReview] STAGE=LOGIN_FORM_FOUND username_sel={sel}")
                    break
            except Exception:
                continue

        if not username_filled:
            ss, html = _save_debug_artifacts(page, current_stage)
            _close_browser(browser, pw_manager)
            return _build_result(
                ok=False,
                status="LOGIN_FORM_NOT_FOUND",
                message="Khong tim thay field tai khoan tren trang login portal.",
                stage=current_stage,
                error_code="LOGIN_FORM_NOT_FOUND",
                error_message="Could not find username input with any selector",
                error_type="SelectorNotFound",
                screenshot=ss,
                html=html,
            )

        # Stage: LOGIN_PASSWORD_FILLED
        current_stage = "LOGIN_PASSWORD_FILLED"
        logger.info("[OpenPortalReview] STAGE=LOGIN_PASSWORD_FILLED")
        password_filled = False
        for sel in ['input[name="password"]', 'input[type="password"]', '#password', 'input#password']:
            try:
                inp = page.locator(sel).first
                if inp.is_visible(timeout=2000):
                    inp.fill(password, timeout=3000)
                    password_filled = True
                    logger.info(f"[OpenPortalReview] STAGE=LOGIN_PASSWORD_FILLED password_sel={sel}")
                    break
            except Exception:
                continue

        if not password_filled:
            ss, html = _save_debug_artifacts(page, current_stage)
            _close_browser(browser, pw_manager)
            return _build_result(
                ok=False,
                status="LOGIN_FORM_NOT_FOUND",
                message="Khong tim thay field mat khau tren trang login portal.",
                stage=current_stage,
                error_code="LOGIN_FORM_NOT_FOUND",
                error_message="Could not find password input with any selector",
                error_type="SelectorNotFound",
                screenshot=ss,
                html=html,
            )

        # Stage: LOGIN_SUBMIT
        current_stage = "LOGIN_SUBMIT"
        logger.info("[OpenPortalReview] STAGE=LOGIN_SUBMIT")
        clicked = False
        for sel in ['button[type="submit"]', 'button:has-text("Đăng nhập")', 'button:has-text("Login")', '.btn-login']:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=2000):
                    btn.click(timeout=timeout_ms)
                    clicked = True
                    logger.info(f"[OpenPortalReview] STAGE=LOGIN_SUBMIT clicked_btn={sel}")
                    break
            except Exception:
                continue

        if not clicked:
            ss, html = _save_debug_artifacts(page, current_stage)
            _close_browser(browser, pw_manager)
            return _build_result(
                ok=False,
                status="LOGIN_SUBMIT_FAILED",
                message="Khong tim thay nut Dang nhap tren trang login portal.",
                stage=current_stage,
                error_code="LOGIN_SUBMIT_FAILED",
                error_message="Could not find login submit button with any selector",
                error_type="SelectorNotFound",
                screenshot=ss,
                html=html,
            )

        page.wait_for_load_state("networkidle", timeout=timeout_ms)

        # Stage: LOGIN_DONE
        current_stage = "LOGIN_DONE"
        logger.info(f"[OpenPortalReview] STAGE=LOGIN_DONE url={page.url} title='{page.title()}'")

        if "/login" in page.url:
            ss, html = _save_debug_artifacts(page, current_stage)
            error_text = ""
            try:
                for err_sel in [".alert-danger", ".text-danger", "[role=alert]", ".error-message"]:
                    try:
                        el = page.locator(err_sel).first
                        if el.is_visible(timeout=1000):
                            error_text = el.inner_text() or ""
                            break
                    except Exception:
                        continue
            except Exception:
                pass
            _close_browser(browser, pw_manager)
            return _build_result(
                ok=False,
                status="LOGIN_FAILED",
                message=f"Dang nhap portal that bai. Lỗi: {error_text or 'khong ro'}. URL sau login: {page.url}",
                stage=current_stage,
                error_code="LOGIN_FAILED",
                error_message=f"Login redirected to /login. Error text: {error_text}",
                error_type="LoginRedirect",
                screenshot=ss,
                html=html,
            )

        # Stage: DASHBOARD_FOUND
        current_stage = "DASHBOARD_FOUND"
        logger.info(f"[OpenPortalReview] STAGE=DASHBOARD_FOUND url={page.url}")
        page.wait_for_load_state("networkidle", timeout=timeout_ms)

        # Stage: CLICK_ADD_BUTTON
        current_stage = "CLICK_ADD_BUTTON"
        logger.info("[OpenPortalReview] STAGE=CLICK_ADD_BUTTON")
        add_found = False
        for sel in [
            'button:has-text("Thêm mới")',
            'a:has-text("Thêm mới")',
            'button:has-text("Thêm")',
            'button.btn-primary',
            ".btn-add",
            'button[data-bs-target*="modal"]',
        ]:
            try:
                el = page.locator(sel).first
                if el.is_visible(timeout=3000):
                    el.click(timeout=timeout_ms)
                    add_found = True
                    logger.info(f"[OpenPortalReview] STAGE=CLICK_ADD_BUTTON found={sel}")
                    page.wait_for_load_state("networkidle", timeout=timeout_ms)
                    import time; time.sleep(0.5)
                    break
            except Exception:
                continue

        if not add_found:
            ss, html = _save_debug_artifacts(page, current_stage)
            _close_browser(browser, pw_manager)
            return _build_result(
                ok=False,
                status="ADD_BUTTON_NOT_FOUND",
                message="Da login portal nhung khong tim thay nut 'Them moi'. Co the portal da thay doi giao dien.",
                stage=current_stage,
                error_code="ADD_BUTTON_NOT_FOUND",
                error_message="Could not find 'Them moi' button with any selector",
                error_type="SelectorNotFound",
                screenshot=ss,
                html=html,
            )

        # Stage: CREATE_FORM_OPENED
        current_stage = "CREATE_FORM_OPENED"
        logger.info("[OpenPortalReview] STAGE=CREATE_FORM_OPENED")
        form_found = False
        import time as _time
        for _attempt in range(10):
            for sel in ["form", ".modal form", ".modal-content", "form[method=POST]", "[role=dialog]"]:
                try:
                    el = page.locator(sel).first
                    if el.is_visible(timeout=1000):
                        form_found = True
                        logger.info(f"[OpenPortalReview] STAGE=CREATE_FORM_OPENED found={sel}")
                        break
                except Exception:
                    continue
            if form_found:
                break
            _time.sleep(0.3)
        _time.sleep(0.5)

        if not form_found:
            ss, html = _save_debug_artifacts(page, current_stage)
            _close_browser(browser, pw_manager)
            return _build_result(
                ok=False,
                status="CREATE_FORM_NOT_FOUND",
                message="Da bam 'Them moi' nhung form khong xuat hien.",
                stage=current_stage,
                error_code="CREATE_FORM_NOT_FOUND",
                error_message="Form/modal did not appear after clicking add button",
                error_type="FormNotFound",
                screenshot=ss,
                html=html,
            )

        # Stage: FILL_FIELD_START
        current_stage = "FILL_FIELD_START"
        logger.info("[OpenPortalReview] STAGE=FILL_FIELD_START")
        filled: list[str] = []
        missing: list[str] = []

        # Build payload
        ngay_in = _fmt_date_for_portal(issue_date) or _time.strftime("%d/%m/%Y")
        ngay_bd = _fmt_date_for_portal(effective_from)
        ngay_kt = _fmt_date_for_portal(effective_to)

        form_payload: dict[str, str] = {
            "tinhtrang": "Phát hành",
            "linhvuc": _map_domain(domain) if domain else "",
            "sohd": str(contract_no or "").strip(),
            "sogcn": str(cert_no or "").strip(),
            "ngayincert": ngay_in,
            "ngaybatdau": ngay_bd or "",
            "ngayketthuc": ngay_kt or "",
            "tendonvi": str(organization_name or "").strip(),
            "diachi": str(address or "").strip(),
            "masothue": str(tax_code or "").strip(),
            "banghieu": str(brand_name or "").strip(),
            "diachikd": str(usage_address or "").strip(),
            "khuvuc": str(region or "").strip(),
            "ghichu": str(portal_note or "").strip(),
        }

        for field_name, value in form_payload.items():
            if not value:
                missing.append(field_name)
                continue

            stage_tag = f"FILL_FIELD_{field_name.upper()}"
            current_stage = stage_tag
            success = False

            # Try select first
            try:
                sel_el = page.locator(f'select[name="{field_name}"]').first
                if sel_el.is_visible(timeout=1000):
                    options = sel_el.locator("option").all()
                    for opt in options:
                        opt_text = opt.inner_text() or ""
                        if value.lower() in opt_text.lower() or opt_text.lower() in value.lower():
                            opt_value = opt.get_attribute("value") or ""
                            sel_el.select_option(opt_value if opt_value else opt_text, timeout=2000)
                            filled.append(field_name)
                            success = True
                            logger.info(f"[OpenPortalReview] STAGE={stage_tag} OK select")
                            break
                    if not success:
                        sel_el.select_option(value, timeout=2000)
                        filled.append(field_name)
                        success = True
                        logger.info(f"[OpenPortalReview] STAGE={stage_tag} OK select_direct")
            except Exception:
                pass

            if success:
                continue

            # Try input text
            try:
                inp = page.locator(f'input[name="{field_name}"]').first
                if inp.is_visible(timeout=1000):
                    inp.clear(timeout=2000)
                    inp.fill(value, timeout=3000)
                    filled.append(field_name)
                    success = True
                    logger.info(f"[OpenPortalReview] STAGE={stage_tag} OK input")
                    continue
            except Exception:
                pass

            # Try textarea
            try:
                ta = page.locator(f'textarea[name="{field_name}"]').first
                if ta.is_visible(timeout=1000):
                    ta.clear(timeout=2000)
                    ta.fill(value, timeout=3000)
                    filled.append(field_name)
                    success = True
                    logger.info(f"[OpenPortalReview] STAGE={stage_tag} OK textarea")
                    continue
            except Exception:
                pass

            if not success:
                missing.append(field_name)
                logger.warning(f"[OpenPortalReview] STAGE={stage_tag} MISSING")

        logger.info(f"[OpenPortalReview] STAGE=FILL_FIELD_DONE filled={len(filled)} missing={len(missing)}")
        current_stage = "FILL_FIELD_DONE"

        if not filled:
            ss, html = _save_debug_artifacts(page, current_stage)
            _close_browser(browser, pw_manager)
            return _build_result(
                ok=False,
                status="FORM_FIELD_NOT_FOUND",
                message="Khong the dien bat ky truong nao tren form portal. Co the portal da thay doi giao dien.",
                stage=current_stage,
                error_code="FORM_FIELD_NOT_FOUND",
                error_message=f"Could not fill any fields. Missing: {missing}",
                error_type="AllFieldsMissing",
                screenshot=ss,
                html=html,
                filled_fields=[],
                missing_fields=missing,
            )

        # Success — browser stays open for user review
        current_stage = "FORM_FILLED_WAITING_USER"
        logger.info(
            f"[OpenPortalReview] STAGE=FORM_FILLED_WAITING_USER "
            f"filled={filled} missing={missing}. "
            f"Browser kept open. NOT submitting."
        )
        # Do NOT close browser — user needs to review and click Save
        return _build_result(
            ok=True,
            status="PORTAL_FORM_FILLED_FOR_REVIEW",
            message="Da mo portal va dien form. Vui long kiem tra du lieu tren portal roi tu bam Luu.",
            stage=current_stage,
            filled_fields=filled,
            missing_fields=missing,
        )

    except AttributeError as e:
        exc_name = type(e).__name__
        exc_msg = str(e)
        logger.error(f"[OpenPortalReview] STAGE={current_stage} FAILED AttributeError: {exc_msg}")
        logger.error(traceback.format_exc())
        ss, html = _save_debug_artifacts(page, current_stage) if page else (None, None)
        _close_browser(browser, pw_manager)
        if "PlaywrightContextManager" in exc_msg or "chromium" in exc_msg:
            return _build_result(
                ok=False,
                status="PLAYWRIGHT_START_FAILED",
                message="Không khởi động được Playwright visible browser. Thử chạy: playwright install chromium",
                stage=current_stage,
                error_code="PLAYWRIGHT_START_FAILED",
                error_message=exc_msg,
                error_type=exc_name,
                screenshot=ss,
                html=html,
            )
        return _build_result(
            ok=False,
            status="UNEXPECTED_ERROR",
            message=f"Lỗi AttributeError tại bước {current_stage}: {exc_msg}",
            stage=current_stage,
            error_code="UNEXPECTED_ERROR",
            error_message=exc_msg,
            error_type=exc_name,
            screenshot=ss,
            html=html,
        )
    except PlaywrightError as e:
        exc_name = type(e).__name__
        exc_msg = str(e)
        logger.error(f"[OpenPortalReview] STAGE={current_stage} FAILED PlaywrightError: {exc_msg}")
        logger.error(traceback.format_exc())
        ss, html = _save_debug_artifacts(page, current_stage) if page else (None, None)
        _close_browser(browser, pw_manager)
        err_code = "PORTAL_TIMEOUT" if "timeout" in exc_msg.lower() else "PLAYWRIGHT_ERROR"
        return _build_result(
            ok=False,
            status=err_code,
            message=f"Lỗi Playwright tại bước {current_stage}: {exc_msg}",
            stage=current_stage,
            error_code=err_code,
            error_message=exc_msg,
            error_type=exc_name,
            screenshot=ss,
            html=html,
        )
    except Exception as e:
        exc_name = type(e).__name__
        exc_msg = str(e)
        logger.error(f"[OpenPortalReview] STAGE={current_stage} FAILED {exc_name}: {exc_msg}")
        logger.error(traceback.format_exc())
        ss, html = _save_debug_artifacts(page, current_stage) if page else (None, None)
        _close_browser(browser, pw_manager)
        err_code = _stage_to_error_code(current_stage)
        return _build_result(
            ok=False,
            status=err_code,
            message=f"Lỗi {exc_name} tại bước {current_stage}: {exc_msg}",
            stage=current_stage,
            error_code=err_code,
            error_message=exc_msg,
            error_type=exc_name,
            screenshot=ss,
            html=html,
        )
