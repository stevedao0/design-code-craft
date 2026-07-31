"""Build safe DOCX download filename from contract data.

Format (per user spec, July 2026):
    <short_no>_<year>_<customer_name>_<province>.docx

Example:
    9999_2026_Karaoke ABC_HCM.docx

Rules:
- short_no: part of contract_no before the first "/" (e.g., "9999/2026/..." -> "9999").
  If no "/" present, fall back to the full sanitized contract_no.
- year: contract_year → first 4-digit year chunk in contract_no → ngay_lap.year → "2026".
- customer: don_vi_ten → ten_bang_hieu → "Don vi".
- province: usage_province → legal_province → city → address last token → "NA".
  Major cities are mapped to short form: HCM, HN, NT, etc.

Forbidden characters (< > : " / \\ | ? *) are replaced with "-".
Vietnamese diacritics are stripped: "Công ty" -> "Cong ty".
Multiple whitespace collapses to a single space; multiple "-" collapses to one "-".
underscore-separated components are joined by single "_"; no double "__".

NO region_code, field_code, "HĐQTGAN-PN", "PR", or room count is included.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any


_FORBIDDEN = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_WHITESPACE = re.compile(r"\s+")
_MULTI_DASH = re.compile(r"-{2,}")
_MULTI_UNDERSCORE = re.compile(r"_+")
_YEAR_4 = re.compile(r"\b(19|20)\d{2}\b")


# Short-form alias for major provinces/cities. Anything not in this map keeps
# its sanitized Vietnamese name (without diacritics).
_PROVINCE_SHORT = {
    "ho chi minh": "HCM",
    "thanh pho ho chi minh": "HCM",
    "tp ho chi minh": "HCM",
    "tp. ho chi minh": "HCM",
    "hcm": "HCM",
    "ha noi": "Ha Noi",
    "thanh pho ha noi": "Ha Noi",
    "tp ha noi": "Ha Noi",
    "tp. ha noi": "Ha Noi",
    "hn": "Ha Noi",
    "da nang": "Da Nang",
    "thanh pho da nang": "Da Nang",
    "hai phong": "Hai Phong",
    "can tho": "Can Tho",
}


def _strip_vietnamese_diacritics(text: str) -> str:
    """Remove Vietnamese diacritics for safe filenames.

    'Công ty ABC' -> 'Cong ty ABC' ; 'Đồng Nai' -> 'Dong Nai'.
    """
    if not text:
        return ""
    # Special-case Vietnamese letters with stroke/horn marks not handled
    # by Unicode NFD decomposition alone.
    special = {
        "Đ": "D", "đ": "d",
        "Ư": "U", "ư": "u",
        "Ơ": "O", "ơ": "o",
        "Ă": "A", "ă": "a",
        "Ắ": "A", "ắ": "a",
        "Ằ": "A", "ằ": "a",
        "Ẳ": "A", "ẳ": "a",
        "Ẵ": "A", "ẵ": "a",
        "Ặ": "A", "ặ": "a",
        "Â": "A", "â": "a",
        "Ấ": "A", "ấ": "a",
        "Ầ": "A", "ầ": "a",
        "Ẩ": "A", "ẩ": "a",
        "Ẫ": "A", "ẫ": "a",
        "Ậ": "A", "ậ": "a",
        "Ê": "E", "ê": "e",
        "Ế": "E", "ế": "e",
        "Ề": "E", "ề": "e",
        "Ể": "E", "ể": "e",
        "Ễ": "E", "ễ": "e",
        "Ệ": "E", "ệ": "e",
        "Ô": "O", "ô": "o",
        "Ố": "O", "ố": "o",
        "Ồ": "O", "ồ": "o",
        "Ổ": "O", "ổ": "o",
        "Ỗ": "O", "ỗ": "o",
        "Ộ": "O", "ộ": "o",
        "Ư": "U", "ư": "u",
        "Ứ": "U", "ứ": "u",
        "Ừ": "U", "ừ": "u",
        "Ử": "U", "ử": "u",
        "Ữ": "U", "ữ": "u",
        "Ự": "U", "ự": "u",
        "Ý": "Y", "ý": "y",
        "Ỳ": "Y", "ỳ": "y",
        "Ỷ": "Y", "ỷ": "y",
        "Ỹ": "Y", "ỹ": "y",
        "Ỵ": "Y", "ỵ": "y",
        "Í": "I", "í": "i",
        "Ì": "I", "ì": "i",
        "Ỉ": "I", "ỉ": "i",
        "Ĩ": "I", "ĩ": "i",
        "Ị": "I", "ị": "i",
    }
    out = []
    for ch in text:
        if ch in special:
            out.append(special[ch])
            continue
        normalized = unicodedata.normalize("NFD", ch)
        decomposed = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
        out.append(decomposed)
    return "".join(out)


def _strip_and_sanitize(text: str) -> str:
    """Strip Vietnamese diacritics; replace forbidden chars with '-';
    collapse whitespace and dashes."""
    if not text:
        return ""
    text = _strip_vietnamese_diacritics(str(text))
    text = _FORBIDDEN.sub("-", text)
    text = _WHITESPACE.sub(" ", text)  # normalize internal whitespace
    text = _MULTI_DASH.sub("-", text)
    text = text.strip("-._ ")
    return text


def _short_province(text: str) -> str:
    """Return short-form province if known, else sanitized text."""
    cleaned = _strip_and_sanitize(text)
    if not cleaned:
        return ""
    key = cleaned.lower()
    if key in _PROVINCE_SHORT:
        return _PROVINCE_SHORT[key]
    # Try with "thanh pho " prefix removed
    if key.startswith("thanh pho "):
        key = key[len("thanh pho "):]
    if key in _PROVINCE_SHORT:
        return _PROVINCE_SHORT[key]
    if key.startswith("tp ") or key.startswith("tp. "):
        key = key.replace("tp. ", "").replace("tp ", "", 1)
        if key in _PROVINCE_SHORT:
            return _PROVINCE_SHORT[key]
    return cleaned


def _extract_short_no(row: Any) -> str:
    """Extract the short contract number from `contract_no`.

    Handles BOTH `/` and `-` separators so legacy rows whose contract_no is
    stored as "9999-2026-HDQTGAN-PN-PR" still produce a sane short number.

    Rules:
      - If contract_no contains "/", short_no = first slash-separated part.
      - Else if contract_no contains "-", short_no = the leading numeric
        segment (e.g. "9999"). If none, fall back to the first dash segment.
      - Else, sanitize the whole string.
    """
    contract_no = str(getattr(row, "contract_no", "") or "").strip()
    if not contract_no:
        return ""
    if "/" in contract_no:
        short = contract_no.split("/", 1)[0].strip()
        return _strip_and_sanitize(short)
    if "-" in contract_no:
        # Prefer the first purely-numeric chunk ("9999").
        first_numeric = ""
        for seg in contract_no.split("-"):
            seg = seg.strip()
            if seg.isdigit():
                first_numeric = seg
                break
        if first_numeric:
            return _strip_and_sanitize(first_numeric)
        # Otherwise fall back to first dash-separated segment.
        short = contract_no.split("-", 1)[0].strip()
        return _strip_and_sanitize(short)
    return _strip_and_sanitize(contract_no)


def _extract_year(row: Any) -> str:
    """Extract year with priority: contract_year > signed_date > parse from contract_no."""
    year = getattr(row, "contract_year", None)
    if year is not None and str(year).strip():
        try:
            return str(int(year))
        except (ValueError, TypeError):
            pass
    signed = getattr(row, "ngay_lap_hop_dong", None)
    if signed and hasattr(signed, "year"):
        try:
            return str(int(signed.year))
        except Exception:
            pass
    # Try first 4-digit year chunk in contract_no (slash-separated parts)
    contract_no = str(getattr(row, "contract_no", "") or "")
    parts_year = contract_no.split("/")
    for part in parts_year:
        part = part.strip()
        if _YEAR_4.fullmatch(part):
            return part
        # also accept embedded year as in "9999-2026-HDQTGAN-PN-PR"
        m = _YEAR_4.search(part)
        if m:
            return m.group(0)
    return "2026"


def _contract_no_segments(row: Any) -> set:
    """Return a set of contract_no sub-segments used to detect bad-data rows.

    For a contract_no like "9999/2026/HĐQTGAN-PN/PR" we collect
    {"9999", "2026", "HĐQTGAN-PN", "PR"} so the helper can ignore any
    candidate that matches a contract_no sub-segment (which usually means
    the row's customer/province was incorrectly populated from the
    contract_no during legacy import or migration).

    Both raw and diacritic-stripped forms are stored, so candidates that have
    been sanitized via `_strip_and_sanitize` still match correctly.
    """
    contract_no = str(getattr(row, "contract_no", "") or "").strip()
    if not contract_no:
        return set()
    segments = set()
    for part in contract_no.replace("\\", "/").split("/"):
        part = part.strip()
        if not part:
            continue
        segments.add(part)
        # Also add each dash-separated chunk for "9999-2026-HDQTGAN-PN-PR"
        for sub in part.split("-"):
            sub = sub.strip()
            if sub:
                segments.add(sub)
        # Diacritic-stripped form so sanitized candidates also match
        san = _strip_and_sanitize(part)
        if san:
            segments.add(san)
        for sub in part.split("-"):
            san = _strip_and_sanitize(sub)
            if san:
                segments.add(san)
    return segments


def _extract_customer(row: Any) -> str:
    """Pick the customer name from `don_vi_ten` (legal/unit name) first, then
    fall back to `ten_bang_hieu` (signboard).

    Rationale: per the canonical filename spec, the customer slot uses the
    legal unit name ("tên đơn vị"). The signboard is only a fallback when
    the legal name is missing.

    Defensive: ignore a value that is identical to one of the contract_no's
    sub-segments (which would mean the row stored the region/field code in
    this column by mistake).
    """
    bad = _contract_no_segments(row)
    for attr in ("don_vi_ten", "ten_bang_hieu"):
        value = getattr(row, attr, None)
        if not value:
            continue
        cleaned = _strip_and_sanitize(value)
        if not cleaned:
            continue
        if cleaned in bad:
            continue
        return cleaned
    return "Don vi"


def _extract_province(row: Any) -> str:
    """Pick the province name from `usage_province` then `legal_province` then
    last token of full address. Same defensive rule: ignore values that match
    a contract_no sub-segment.
    """
    bad = _contract_no_segments(row)
    for attr in ("usage_province", "legal_province", "city"):
        value = getattr(row, attr, None)
        if value:
            cleaned = _strip_and_sanitize(value)
            if not cleaned:
                continue
            if cleaned in bad:
                continue
            short = _short_province(cleaned)
            if short:
                return short
    for attr in ("usage_full_address", "dia_chi_su_dung", "legal_full_address"):
        full = str(getattr(row, attr, "") or "")
        if full:
            parts = [p.strip() for p in full.split(",") if p.strip()]
            if parts:
                cleaned = _strip_and_sanitize(parts[-1])
                if cleaned and cleaned not in bad:
                    short = _short_province(cleaned)
                    if short:
                        return short
    return "NA"


def build_contract_docx_filename(row: Any) -> str:
    """Build the canonical DOCX filename for a contract row.

    Format: <short_no>_<year>_<customer>_<province>.docx

    Uses ONLY existing DB fields. NO new columns.
    """
    short_no = _extract_short_no(row) or "contract"
    year = _extract_year(row)
    customer = _extract_customer(row)
    province = _extract_province(row)

    parts = [short_no, year, customer, province]
    filename = "_".join(parts) + ".docx"

    # Collapse any double underscores introduced after sanitization
    base, _, ext = filename.rpartition(".")
    base = _MULTI_UNDERSCORE.sub("_", base).strip("_")
    filename = f"{base}.{ext}"

    # Cap total length to be friendly with Windows MAX_PATH
    if len(filename) > 180:
        base, _, ext = filename.rpartition(".")
        keep = 180 - len(ext) - 1
        filename = base[: max(1, keep)].rstrip("_") + "." + ext
    return filename
