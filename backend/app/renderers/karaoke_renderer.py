"""Karaoke DOCX block insertion for Karaoke contracts.

This module provides Karaoke-specific block insertion into DOCX templates:
- Karaoke room block (location/room list)
- Karaoke pricing block (pricing table)

Derived from OLD APP: F:\VCPMC\APPS\contract\libs\docx_renderer\__init__.py
Ported functions: _insert_karaoke_pricing_table_at_anchor, _insert_karaoke_leader_blocks

IMPORTANT: Renderer must NOT recalculate money. All values must come from pre-calculated context.
"""
from __future__ import annotations

import logging
import re
import unicodedata
import zipfile
from pathlib import Path

from lxml import etree

from app.services.placeholder_registry import (
    PLACEHOLDERS,
    get_anchors_for_key,
    get_sentinel_for_key,
)

logger = logging.getLogger("uvicorn.error")

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}

# Canonical block placeholders (derived from registry for convenience)
KARAOKE_ROOM_PLACEHOLDER = PLACEHOLDERS["khu_vuc_su_dung_nhac"].template_placeholder
KARAOKE_PRICING_PLACEHOLDER = PLACEHOLDERS["tien_ban_quyen"].template_placeholder
MUSIC_USAGE_AREAS_PLACEHOLDER = PLACEHOLDERS["khu_vuc_su_dung_nhac"].template_placeholder

# Royalty field placeholders (individual, defined in registry)
ROYALTY_BEFORE_VAT_PLACEHOLDER = PLACEHOLDERS["royalty_amount_before_vat"].template_placeholder
VAT_RATE_PLACEHOLDER = PLACEHOLDERS["vat_rate"].template_placeholder
VAT_AMOUNT_PLACEHOLDER = PLACEHOLDERS["vat_amount"].template_placeholder
ROYALTY_AFTER_VAT_PLACEHOLDER = PLACEHOLDERS["royalty_amount_after_vat"].template_placeholder
ROYALTY_IN_WORDS_PLACEHOLDER = PLACEHOLDERS["royalty_amount_in_words"].template_placeholder


def _docx_contains_anchor(*, docx_path: Path, anchor_text: str) -> bool:
    """Check if a DOCX file contains a specific plain-text anchor."""
    try:
        with zipfile.ZipFile(docx_path, "r") as zf:
            xml = zf.read("word/document.xml").decode("utf-8", errors="ignore")
        plain = re.sub(r"<[^>]+>", "", xml)
        return anchor_text in plain
    except Exception:
        return False


def _resolve_area_display_name(area) -> str:
    """Resolve display name for music usage area row.

    Logic (nghiệp vụ):
    - Nếu user đã nhập pricing_label → dùng pricing_label.
    - Ngược lại fallback về area_name.
    - Luôn trả về str không rỗng (fallback cuối '-').

    pricing_label CHỈ dùng để hiển thị/in ấn — không ảnh hưởng công thức.
    """
    raw_label = ""
    raw_area = ""
    try:
        if isinstance(area, dict):
            raw_label = str(area.get("pricing_label") or "").strip()
            raw_area = str(area.get("area_name") or "").strip()
        else:
            # Pydantic model (MusicUsageArea)
            raw_label = str(getattr(area, "pricing_label", "") or "").strip()
            raw_area = str(getattr(area, "area_name", "") or "").strip()
    except Exception:
        pass
    if raw_label:
        return raw_label
    if raw_area:
        return raw_area
    return "-"


def _norm_anchor(value: str) -> str:
    """Normalize anchor text for matching."""
    return re.sub(r"[^0-9A-Za-z]+", "", str(value or "").strip()).upper()


def _extract_paragraph_text(p: etree._Element) -> str:
    """Extract all text from a paragraph element."""
    return "".join(
        p.xpath(
            ".//w:t/text() | .//w:instrText/text() | .//w:delText/text()",
            namespaces=NS,
        )
    )


def _find_anchor_paragraph(root: etree._Element, anchor_text: str) -> etree._Element | None:
    """Find the paragraph element containing an anchor."""
    target = _norm_anchor(anchor_text)
    for p in root.xpath(".//w:p", namespaces=NS):
        if target in _norm_anchor(_extract_paragraph_text(p)):
            return p
    return None


def _normalize_search_text(value: str | None) -> str:
    """Normalize Vietnamese/Unicode labels to ASCII key for matching."""
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    folded = unicodedata.normalize("NFKD", raw)
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "", folded)


def _decode_mojibake_text(value: str | None) -> str:
    """Decode mojibake text from Word encoding issues."""
    text = str(value or "")
    if not text:
        return ""
    has_mojibake_marker = any(ch in text for ch in ("Ã", "Â", "Ä"))
    has_c1_control = any(0x80 <= ord(ch) <= 0x9F for ch in text)
    if not (has_mojibake_marker or has_c1_control):
        return text
    try:
        fixed = text.encode("latin1").decode("utf-8")
        return fixed or text
    except Exception:
        return text


def _normalize_amount_text(value: str | None) -> str:
    """Normalize amount text for display."""
    raw = _decode_mojibake_text(str(value or "")).strip()
    if not raw:
        return ""
    is_minus = "(-)" in raw
    digits = re.sub(r"[^0-9]", "", raw)
    if digits:
        number = f"{int(digits):,}"
        return f"{number} (-)" if is_minus else number
    return raw


def _split_tab_line(line: str) -> tuple[str, str] | None:
    """Split a tab-separated line into (left, right) parts."""
    parts = line.split("\t", 1)
    if len(parts) < 2:
        return None
    return parts[0], parts[1]


def _is_zero_room_detail(left: str) -> bool:
    """Check if this is a zero-room detail line to skip."""
    normalized = _normalize_search_text(left)
    # Only skip if "khong" (Vietnamese "zero") is explicitly present
    return "khong" in normalized


def _normalize_para_text(p: etree._Element) -> str:
    """Get all text from a paragraph element."""
    return "".join(p.xpath(".//w:t/text()", namespaces=NS))


def _escape_xml_text(value: str) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _fill_empty_business_address_paragraph(root: etree._Element, render_ctx: dict) -> bool:
    """Fill the Karaoke "Dia chi kinh doanh:" paragraph after block insertion.

    The Word template can render the split {{dia_chi_kinh_doanh}} placeholder as
    an empty run in the live preview path. This guard uses the contract row's
    usage address from render_ctx and only mutates the exact empty paragraph.
    """
    address = _decode_mojibake_text(
        str(render_ctx.get("dia_chi_kinh_doanh") or render_ctx.get("business_address") or "")
    ).strip()
    if not address:
        return False

    for p in root.xpath(".//w:p", namespaces=NS):
        plain = _extract_paragraph_text(p)
        normalized = _normalize_search_text(plain)
        plain_lower = plain.lower()
        is_business_address_label = (
            "địa chỉ kinh doanh" in plain_lower
            or "dia chi kinh doanh" in plain_lower
            or "iachikinhdoanh" in normalized
            or "diachikinhdoanh" in normalized
        )
        if not is_business_address_label:
            continue
        if address in plain:
            return False
        stripped_plain = plain.strip()
        if not (stripped_plain.endswith("doanh:") or stripped_plain.endswith("kinh doanh:")):
            continue

        r = etree.SubElement(p, f"{{{W_NS}}}r")
        rpr = etree.SubElement(r, f"{{{W_NS}}}rPr")
        etree.SubElement(rpr, f"{{{W_NS}}}iCs")
        sz = etree.SubElement(rpr, f"{{{W_NS}}}sz")
        sz.set(f"{{{W_NS}}}val", "26")
        szcs = etree.SubElement(rpr, f"{{{W_NS}}}szCs")
        szcs.set(f"{{{W_NS}}}val", "26")
        t = etree.SubElement(r, f"{{{W_NS}}}t")
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        t.text = address
        return True

    return False


def _replace_anchor_with_entries(
    root: etree._Element,
    anchor_text: str,
    entries: list[dict],
) -> bool:
    """Replace anchor paragraph with formatted entries."""
    anchor_p = _find_anchor_paragraph(root, anchor_text)
    if anchor_p is None:
        return False

    parent = anchor_p.getparent()
    if parent is None:
        return False
    idx = parent.index(anchor_p)

    for entry in entries:
        kind = str(entry.get("kind") or "text")
        is_tab = kind == "tab"
        is_bold = bool(entry.get("bold"))
        is_italic = bool(entry.get("italic"))

        p = etree.Element(f"{{{W_NS}}}p")
        anchor_ppr = anchor_p.find(f"{{{W_NS}}}pPr")
        if anchor_ppr is not None:
            ppr = etree.SubElement(p, f"{{{W_NS}}}pPr")
            for child in anchor_ppr:
                ppr.append(child)
        else:
            ppr = etree.SubElement(p, f"{{{W_NS}}}pPr")

        for tabs in list(ppr.findall(f"{{{W_NS}}}tabs")):
            ppr.remove(tabs)

        if is_tab:
            tabs_el = etree.SubElement(ppr, f"{{{W_NS}}}tabs")
            tab_el = etree.SubElement(tabs_el, f"{{{W_NS}}}tab")
            tab_el.set(f"{{{W_NS}}}val", "right")
            tab_el.set(f"{{{W_NS}}}leader", "dot")
            tab_el.set(f"{{{W_NS}}}pos", "9360")

        template_rpr = anchor_p.find(".//w:r/w:rPr", namespaces=NS)
        if is_tab:
            left_text = str(entry.get("left") or "")
            right_text = str(entry.get("right") or "")

            if left_text:
                r1 = etree.SubElement(p, f"{{{W_NS}}}r")
                if template_rpr is not None:
                    rpr = etree.SubElement(r1, f"{{{W_NS}}}rPr")
                    for child in template_rpr:
                        rpr.append(child)
                    # Override color to black
                    existing_color = rpr.find(f"{{{W_NS}}}color")
                    if existing_color is not None:
                        existing_color.set(f"{{{W_NS}}}val", "000000")
                    else:
                        color = etree.SubElement(rpr, f"{{{W_NS}}}color")
                        color.set(f"{{{W_NS}}}val", "000000")
                else:
                    rpr = etree.SubElement(r1, f"{{{W_NS}}}rPr")
                if is_bold:
                    if rpr.find(f"{{{W_NS}}}b") is None:
                        etree.SubElement(rpr, f"{{{W_NS}}}b")
                t1 = etree.SubElement(r1, f"{{{W_NS}}}t")
                t1.text = _decode_mojibake_text(left_text)
                if left_text and (left_text[0] == " " or left_text[-1] == " "):
                    t1.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")

            r2 = etree.SubElement(p, f"{{{W_NS}}}r")
            tab_char = etree.SubElement(r2, f"{{{W_NS}}}tab")
            if template_rpr is not None:
                rpr2 = etree.SubElement(r2, f"{{{W_NS}}}rPr")
                for child in template_rpr:
                    rpr2.append(child)
                # Override color to black
                existing_color = rpr2.find(f"{{{W_NS}}}color")
                if existing_color is not None:
                    existing_color.set(f"{{{W_NS}}}val", "000000")
                else:
                    color = etree.SubElement(rpr2, f"{{{W_NS}}}color")
                    color.set(f"{{{W_NS}}}val", "000000")
            else:
                rpr2 = etree.SubElement(r2, f"{{{W_NS}}}rPr")
            if is_bold:
                if rpr2.find(f"{{{W_NS}}}b") is None:
                    etree.SubElement(rpr2, f"{{{W_NS}}}b")
            t2 = etree.SubElement(r2, f"{{{W_NS}}}t")
            t2.text = _decode_mojibake_text(right_text)
            if right_text and (right_text[0] == " " or right_text[-1] == " "):
                t2.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        else:
            text = str(entry.get("text") or "")
            r = etree.SubElement(p, f"{{{W_NS}}}r")
            if template_rpr is not None:
                rpr = etree.SubElement(r, f"{{{W_NS}}}rPr")
                for child in template_rpr:
                    rpr.append(child)
                # Override color to black
                existing_color = rpr.find(f"{{{W_NS}}}color")
                if existing_color is not None:
                    existing_color.set(f"{{{W_NS}}}val", "000000")
                else:
                    color = etree.SubElement(rpr, f"{{{W_NS}}}color")
                    color.set(f"{{{W_NS}}}val", "000000")
            else:
                rpr = etree.SubElement(r, f"{{{W_NS}}}rPr")
            if is_bold:
                if rpr.find(f"{{{W_NS}}}b") is None:
                    etree.SubElement(rpr, f"{{{W_NS}}}b")
            if is_italic:
                if rpr.find(f"{{{W_NS}}}i") is None:
                    etree.SubElement(rpr, f"{{{W_NS}}}i")
            t = etree.SubElement(r, f"{{{W_NS}}}t")
            t.text = _decode_mojibake_text(text)
            if text and (text[0] == " " or text[-1] == " "):
                t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")

        parent.insert(idx, p)
        idx += 1

    parent.remove(anchor_p)
    return True


def insert_karaoke_blocks(
    *,
    docx_path: Path,
    render_ctx: dict,
) -> dict:
    """Insert Karaoke room block into a DOCX file.

    NOTE: Pricing is handled separately by Phase 2 simplified royalty.
    This function only handles the room/location block.
    The {{tien_ban_quyen}} placeholder is no longer used - replaced by
    individual royalty amount placeholders in replace_royalty_placeholders().

    Args:
        docx_path: Path to the rendered DOCX file (after text render).
        render_ctx: Dictionary containing:
            - room_display_text or karaoke_room_block_text: room entries

    Returns:
        dict with insertion status:
            - karaoke_room_block_inserted: bool
            - karaoke_pricing_block_inserted: bool (always False - deprecated)
            - warnings: list of warning strings
    """
    warnings: list[str] = []
    room_inserted = False
    address_filled = _fill_business_address_in_docx(docx_path=docx_path, render_ctx=render_ctx)

    # Try all anchors for khu_vuc_su_dung_nhac (canonical + aliases)
    all_anchors = get_anchors_for_key("khu_vuc_su_dung_nhac")
    room_anchor = None
    for anchor in all_anchors:
        if _docx_contains_anchor(docx_path=docx_path, anchor_text=anchor):
            room_anchor = anchor
            break

    if room_anchor is None:
        warnings.append(
            f"Karaoke room block: no anchor found. Tried: {all_anchors}. "
            f"Template: {docx_path}. Ensure {{khu_vuc_su_dung_nhac}} exists in template."
        )
    else:
        room_inserted = _insert_karaoke_room_block_at_anchor(
            docx_path=docx_path,
            render_ctx=render_ctx,
            anchor_text=room_anchor,
        )
        if not room_inserted:
            warnings.append("Karaoke room anchor found but insertion failed or no data to insert.")

    # {{tien_ban_quyen}} is DEPRECATED - removed, use Phase 2 royalty placeholders instead
    pricing_inserted = False

    return {
        "karaoke_room_block_inserted": room_inserted,
        "karaoke_pricing_block_inserted": pricing_inserted,
        "karaoke_business_address_filled": address_filled,
        "warnings": warnings,
    }


def _fill_business_address_in_docx(*, docx_path: Path, render_ctx: dict) -> bool:
    """Fill empty business address paragraph in an already-rendered DOCX."""
    address = _decode_mojibake_text(
        str(render_ctx.get("dia_chi_kinh_doanh") or render_ctx.get("business_address") or "")
    ).strip()
    if not address:
        return False

    try:
        with zipfile.ZipFile(docx_path, "r") as zin:
            xml_bytes = zin.read("word/document.xml")
            other_items = [(item, zin.read(item.filename)) for item in zin.infolist() if item.filename != "word/document.xml"]
    except Exception:
        return False

    parser = etree.XMLParser(recover=True, huge_tree=True)
    root = etree.fromstring(xml_bytes, parser=parser)
    changed = _fill_empty_business_address_paragraph(root=root, render_ctx=render_ctx)
    if not changed:
        return False

    out_xml = etree.tostring(root, encoding="utf-8", xml_declaration=True)
    with zipfile.ZipFile(docx_path, "w") as zout:
        zout.writestr("word/document.xml", out_xml)
        for item, data in other_items:
            zout.writestr(item, data)

    return True


def _build_karaoke_room_entries(render_ctx: dict) -> list[dict]:
    """Build Karaoke room entries from render context."""
    raw = str(render_ctx.get("room_display_text") or render_ctx.get("karaoke_room_block_text") or "")
    entries: list[dict] = []
    for line in raw.replace("\r\n", "\n").split("\n"):
        line = line.strip()
        if not line:
            continue
        pair = _split_tab_line(line)
        if pair is None:
            entries.append({"kind": "text", "text": _decode_mojibake_text(line), "bold": False})
        else:
            entries.append({"kind": "tab", "left": _decode_mojibake_text(pair[0]), "right": _decode_mojibake_text(pair[1]), "bold": False})

    # If no room entries but we have total rooms, show a summary row
    if not entries:
        total_rooms = int(render_ctx.get("tong_so_phong") or 0)
        total_boxes = int(render_ctx.get("tong_so_box") or 0)
        karaoke_type = str(render_ctx.get("loai_hinh_karaoke") or "PHONG").strip().upper()

        if karaoke_type == "BOX" and total_boxes > 0:
            entries.append({"kind": "text", "text": f"Tổng số: {total_boxes} box", "bold": False})
        elif total_rooms > 0:
            entries.append({"kind": "text", "text": f"Tổng số: {total_rooms} phòng", "bold": False})

    return entries


def _build_karaoke_pricing_entries(render_ctx: dict) -> list[dict]:
    """Build Karaoke pricing entries from render context."""
    detail = str(render_ctx.get("pricing_detail_text") or "")
    total = str(render_ctx.get("pricing_total_text") or "")
    bang_chu = str(render_ctx.get("so_tien_bang_chu") or "").strip().rstrip(".;")
    effective_term_months = 6 if int(render_ctx.get("contract_term_months") or 12) == 6 else 12

    entries: list[dict] = []

    for line in detail.replace("\r\n", "\n").split("\n"):
        line = line.strip()
        if not line:
            continue
        pair = _split_tab_line(line)
        if pair is None:
            continue
        if _is_zero_room_detail(pair[0]):
            continue
        entries.append({"kind": "tab", "left": pair[0], "right": pair[1], "bold": False})

    for line in total.replace("\r\n", "\n").split("\n"):
        line = line.strip()
        if not line:
            continue
        pair = _split_tab_line(line)
        if pair is None:
            continue
        label_key = _normalize_search_text(pair[0])
        is_total_label = label_key.startswith("tonggiatrihopdong")
        is_12_month_row = is_total_label and "12thangsudung" in label_key
        is_6_month_row = is_total_label and "6thangsudung" in label_key
        is_total = (effective_term_months == 12 and is_12_month_row) or (effective_term_months == 6 and is_6_month_row)
        entries.append({"kind": "tab", "left": pair[0], "right": pair[1], "bold": is_total})

    if bang_chu:
        entries.append({"kind": "text", "text": f"(Bằng chữ: {bang_chu}.)", "bold": False})

    return entries


def _insert_karaoke_room_block_at_anchor(*, docx_path: Path, render_ctx: dict, anchor_text: str = KARAOKE_ROOM_PLACEHOLDER) -> bool:
    """Insert Karaoke room block at the real room placeholder."""
    entries = _build_karaoke_room_entries(render_ctx)
    if not entries:
        logger.warning("Karaoke room: no entries to insert")
        return False

    with zipfile.ZipFile(docx_path, "r") as zin:
        xml_bytes = zin.read("word/document.xml")
        other_items = [(item, zin.read(item.filename)) for item in zin.infolist() if item.filename != "word/document.xml"]

    parser = etree.XMLParser(recover=True, huge_tree=True)
    root = etree.fromstring(xml_bytes, parser=parser)

    room_changed = _replace_anchor_with_entries(root=root, anchor_text=anchor_text, entries=entries)
    address_changed = _fill_empty_business_address_paragraph(root=root, render_ctx=render_ctx)
    if not room_changed and not address_changed:
        return False

    out_xml = etree.tostring(root, encoding="utf-8", xml_declaration=True)
    with zipfile.ZipFile(docx_path, "w") as zout:
        zout.writestr("word/document.xml", out_xml)
        for item, data in other_items:
            zout.writestr(item, data)

    return room_changed


def _build_simple_royalty_entries(render_ctx: dict) -> list[dict]:
    """Build simplified royalty entries from Phase 2 fields."""
    def fmt_amount(val):
        try:
            return f"{int(val or 0):,}".replace(",", ".")
        except:
            return str(val or "0")

    entries: list[dict] = []

    # Row 1: Tiền bản quyền trước thuế
    before_vat = fmt_amount(render_ctx.get("royalty_amount_before_vat"))
    if before_vat and before_vat != "0":
        entries.append({"kind": "tab", "left": "Tiền bản quyền trước thuế:", "right": before_vat, "bold": False})

    # Row 2: Thuế GTGT
    vat_rate = render_ctx.get("vat_rate") or 8
    vat_amount = fmt_amount(render_ctx.get("vat_amount"))
    entries.append({"kind": "tab", "left": f"Thuế GTGT ({vat_rate}%):", "right": vat_amount, "bold": False})

    # Row 3: Tổng giá trị hợp đồng
    after_vat = fmt_amount(render_ctx.get("royalty_amount_after_vat"))
    if after_vat and after_vat != "0":
        entries.append({"kind": "tab", "left": "Tổng giá trị hợp đồng:", "right": after_vat, "bold": True})

    # Row 4: Bằng chữ
    in_words = str(render_ctx.get("royalty_amount_in_words") or "").strip()
    if in_words:
        entries.append({"kind": "text", "text": f"(Bằng chữ: {in_words} đồng.)", "bold": False, "italic": True})

    return entries


def _insert_karaoke_pricing_rows_at_anchor(
    *,
    docx_path: Path,
    render_ctx: dict,
    anchor_text: str = KARAOKE_PRICING_PLACEHOLDER,
) -> bool:
    """Insert simplified royalty text at the pricing placeholder.

    Uses Phase 2 simplified royalty fields instead of complex calculation table.
    """
    # Try simplified royalty first, fall back to old format
    entries = _build_simple_royalty_entries(render_ctx)
    if not entries:
        entries = _build_karaoke_pricing_entries(render_ctx)

    if not entries:
        logger.warning("Karaoke pricing: no entries to insert")
        return False

    with zipfile.ZipFile(docx_path, "r") as zin:
        xml_bytes = zin.read("word/document.xml")
        other_items = [(item, zin.read(item.filename)) for item in zin.infolist() if item.filename != "word/document.xml"]

    parser = etree.XMLParser(recover=True, huge_tree=True)
    root = etree.fromstring(xml_bytes, parser=parser)

    changed = _replace_anchor_with_entries(root=root, anchor_text=anchor_text, entries=entries)
    if not changed:
        return False

    out_xml = etree.tostring(root, encoding="utf-8", xml_declaration=True)
    with zipfile.ZipFile(docx_path, "w") as zout:
        zout.writestr("word/document.xml", out_xml)
        for item, data in other_items:
            zout.writestr(item, data)

    return True


def _parse_karaoke_pricing_block(render_ctx: dict) -> dict:
    """Parse Karaoke pricing context into structured format for rendering."""
    detail = _decode_mojibake_text(str(render_ctx.get("pricing_detail_text") or ""))
    total_text = _decode_mojibake_text(str(render_ctx.get("pricing_total_text") or ""))
    quantity_rooms = int(render_ctx.get("tong_so_phong") or 0)
    quantity_box = int(render_ctx.get("tong_so_box") or 0)
    karaoke_type = str(render_ctx.get("loai_hinh_karaoke") or "").strip().upper()
    effective_term_months = 6 if int(render_ctx.get("contract_term_months") or 12) == 6 else 12

    quantity_label = f"{quantity_box} box" if karaoke_type == "BOX" else f"{quantity_rooms} phòng"

    detail_rows: list[dict] = []
    has_row_support = False

    for line in detail.replace("\r\n", "\n").split("\n"):
        line = line.strip()
        if not line:
            continue
        pair = _split_tab_line(line)
        if pair is None:
            continue
        left = pair[0]
        right = pair[1]
        if _is_zero_room_detail(left):
            continue
        support_text = ""
        m = re.search(r"\(([^)]*?\d+(?:[.,]\d+)?\s*%)\)\s*$", left, flags=re.IGNORECASE)
        if m:
            bracket_text = m.group(1).strip()
            normalized_support = _normalize_search_text(bracket_text)
            if "hotro" in normalized_support or "%" in bracket_text:
                support_text = re.sub(r"(?i)\b(hỗ\s*trợ|ho\s*tro)\b", "", bracket_text).strip(" :")
                left = re.sub(r"\(([^)]*?\d+(?:[.,]\d+)?\s*%)\)\s*$", "", left, flags=re.IGNORECASE).strip()
                support_number_text = re.sub(r"[^0-9,.\-]", "", support_text).replace(",", ".")
                try:
                    support_number = float(support_number_text)
                except Exception:
                    support_number = 0.0
                if support_number > 0:
                    has_row_support = True
                else:
                    support_text = ""
        detail_rows.append({"left": left, "support": support_text, "amount": right})

    summary_rows: list[dict] = []
    words_line = ""
    for line in total_text.replace("\r\n", "\n").split("\n"):
        line = line.strip()
        if not line:
            continue
        normalized_line = _normalize_search_text(line)
        if (
            normalized_line.startswith("bangchu")
            or normalized_line.startswith("bngch")
            or re.match(r"^\(\s*b.*ch.*:", line, flags=re.IGNORECASE)
        ):
            words_line = line
            continue
        pair = _split_tab_line(line)
        if pair is None:
            continue
        label = pair[0]
        amount = pair[1]
        normalized = _normalize_search_text(label)
        is_total_label = normalized.startswith("tonggiatrihopdong")
        # The total line is always primary (bold) since we now only show one term
        is_primary = is_total_label
        summary_rows.append({"label": label, "amount": amount, "primary": is_primary})

    footer_note = _decode_mojibake_text(str(render_ctx.get("karaoke_pricing_footer_note") or "")).strip()
    if not footer_note:
        base_salary = str(render_ctx.get("muc_luong_co_so") or "").strip()
        if base_salary:
            footer_note = (
                f"Mức lương cơ sở {base_salary}đ có thời hạn bắt đầu từ ngày 1/7/2026 "
                f"áp dụng khoản 2 Điều 3 Nghị định 161/2026/NĐ-CP ngày 15/5/2026"
            )

    if (not words_line) or ("?" in words_line):
        so_tien_bang_chu = _decode_mojibake_text(str(render_ctx.get("so_tien_bang_chu") or "")).strip().rstrip(".;")
        if so_tien_bang_chu:
            words_line = f"(Bằng chữ: {so_tien_bang_chu}.)"

    return {
        "quantity_label": quantity_label,
        "detail_rows": detail_rows,
        "has_row_support": has_row_support,
        "summary_rows": summary_rows,
        "words_line": words_line,
        "footer_note": footer_note,
    }


def _insert_karaoke_pricing_table_at_anchor(
    *,
    docx_path: Path,
    render_ctx: dict,
    anchor_text: str = KARAOKE_PRICING_PLACEHOLDER,
) -> bool:
    """Insert Karaoke pricing table at the real pricing placeholder."""
    parsed = _parse_karaoke_pricing_block(render_ctx)
    detail_rows = parsed.get("detail_rows") or []
    summary_rows = parsed.get("summary_rows") or []
    has_row_support = bool(parsed.get("has_row_support"))
    quantity_label = str(parsed.get("quantity_label") or "").strip() or "-"
    words_line = str(parsed.get("words_line") or "").strip()
    footer_note = str(parsed.get("footer_note") or "").strip()

    if not detail_rows and not summary_rows and not words_line:
        logger.warning("Karaoke pricing: no data to insert")
        return False

    with zipfile.ZipFile(docx_path, "r") as zin:
        xml_bytes = zin.read("word/document.xml")
        other_items = [(item, zin.read(item.filename)) for item in zin.infolist() if item.filename != "word/document.xml"]

    parser = etree.XMLParser(recover=True, huge_tree=True)
    root = etree.fromstring(xml_bytes, parser=parser)

    anchor_p = _find_anchor_paragraph(root, anchor_text)
    if anchor_p is None:
        return False

    parent = anchor_p.getparent()
    if parent is None:
        return False
    idx = parent.index(anchor_p)

    w = f"{{{W_NS}}}"

    def _apply_run_style(rpr: etree._Element, *, bold: bool, italic: bool, underline: bool = False) -> None:
        rfonts = etree.SubElement(rpr, f"{w}rFonts")
        rfonts.set(f"{w}ascii", "Times New Roman")
        rfonts.set(f"{w}hAnsi", "Times New Roman")
        rfonts.set(f"{w}cs", "Times New Roman")
        rfonts.set(f"{w}eastAsia", "Times New Roman")
        # Explicit black color to prevent red text from template styles
        color = etree.SubElement(rpr, f"{w}color")
        color.set(f"{w}val", "000000")
        sz = etree.SubElement(rpr, f"{w}sz")
        sz.set(f"{w}val", "26")  # 13pt
        szcs = etree.SubElement(rpr, f"{w}szCs")
        szcs.set(f"{w}val", "26")  # 13pt
        if bold:
            etree.SubElement(rpr, f"{w}b")
            etree.SubElement(rpr, f"{w}bCs")
        if italic:
            etree.SubElement(rpr, f"{w}i")
            etree.SubElement(rpr, f"{w}iCs")
        if underline:
            u = etree.SubElement(rpr, f"{w}u")
            u.set(f"{w}val", "single")

    def _set_cell_margin(tcpr: etree._Element, *, top: int = 80, right: int = 110, bottom: int = 80, left: int = 110) -> None:
        tc_mar = etree.SubElement(tcpr, f"{w}tcMar")
        for side, amount in (("top", top), ("right", right), ("bottom", bottom), ("left", left)):
            n = etree.SubElement(tc_mar, f"{w}{side}")
            n.set(f"{w}w", str(amount))
            n.set(f"{w}type", "dxa")

    def _mk_p(text: str, *, center: bool = False, right: bool = False, bold: bool = False, italic: bool = False, underline: bool = False) -> etree._Element:
        p = etree.Element(f"{w}p")
        ppr = etree.SubElement(p, f"{w}pPr")
        spacing = etree.SubElement(ppr, f"{w}spacing")
        spacing.set(f"{w}before", "0")
        spacing.set(f"{w}after", "0")
        spacing.set(f"{w}line", "300")
        spacing.set(f"{w}lineRule", "auto")
        if center:
            jc = etree.SubElement(ppr, f"{w}jc")
            jc.set(f"{w}val", "center")
        elif right:
            jc = etree.SubElement(ppr, f"{w}jc")
            jc.set(f"{w}val", "right")
        r = etree.SubElement(p, f"{w}r")
        rpr = etree.SubElement(r, f"{w}rPr")
        _apply_run_style(rpr, bold=bold, italic=italic, underline=underline)
        t = etree.SubElement(r, f"{w}t")
        t.text = _decode_mojibake_text(text)
        return p

    def _make_tc(
        text: str = "",
        *,
        center: bool = False,
        left: bool = False,
        right: bool = False,
        bold: bool = False,
        italic: bool = False,
        underline: bool = False,
        shade_header: bool = False,
        grid_span: int | None = None,
        vmerge: str | None = None,
    ) -> etree._Element:
        tc = etree.Element(f"{w}tc")
        tcpr = etree.SubElement(tc, f"{w}tcPr")
        _set_cell_margin(tcpr)
        if shade_header:
            shd = etree.SubElement(tcpr, f"{w}shd")
            shd.set(f"{w}val", "clear")
            shd.set(f"{w}color", "auto")
            shd.set(f"{w}fill", "D9D9D9")
        v = etree.SubElement(tcpr, f"{w}vAlign")
        v.set(f"{w}val", "center")
        if grid_span and grid_span > 1:
            gs = etree.SubElement(tcpr, f"{w}gridSpan")
            gs.set(f"{w}val", str(int(grid_span)))
        if vmerge:
            vm = etree.SubElement(tcpr, f"{w}vMerge")
            if vmerge == "restart":
                vm.set(f"{w}val", "restart")
        # Determine justification
        jc_val = "center"
        if left:
            jc_val = "left"
        elif right:
            jc_val = "right"
        tc.append(_mk_p(text, center=(jc_val == "center"), right=(jc_val == "right"), bold=bold, italic=italic, underline=underline))
        return tc

    def _make_tr(cells: list, bold_border: bool = False) -> etree._Element:
        tr = etree.Element(f"{w}tr")
        trpr = etree.SubElement(tr, f"{w}trPr")
        if bold_border:
            tr_borders = etree.SubElement(trpr, f"{w}trBorder")
            for side in ["top", "left", "bottom", "right"]:
                b = etree.SubElement(tr_borders, f"{w}{side}")
                b.set(f"{w}val", "single")
                b.set(f"{w}sz", "16")
                b.set(f"{w}space", "0")
                b.set(f"{w}color", "000000")
        for c in cells:
            tr.append(c)
        return tr

    col_count = 4 if has_row_support else 3
    grid_widths = [2050, 5000, 1450, 2200] if has_row_support else [2050, 6450, 2200]

    tbl = etree.Element(f"{w}tbl")
    tblpr = etree.SubElement(tbl, f"{w}tblPr")
    layout = etree.SubElement(tblpr, f"{w}tblLayout")
    layout.set(f"{w}type", "fixed")
    borders = etree.SubElement(tblpr, f"{w}tblBorders")
    for side in ["top", "left", "bottom", "right", "insideH", "insideV"]:
        b = etree.SubElement(borders, f"{w}{side}")
        b.set(f"{w}val", "single")
        b.set(f"{w}sz", "8")
        b.set(f"{w}space", "0")
        b.set(f"{w}color", "000000")
    tblw = etree.SubElement(tblpr, f"{w}tblW")
    tblw.set(f"{w}type", "pct")
    tblw.set(f"{w}w", "5000")
    grid = etree.SubElement(tbl, f"{w}tblGrid")
    for width in grid_widths:
        gc = etree.SubElement(grid, f"{w}gridCol")
        gc.set(f"{w}w", str(width))

    # Build table rows
    # Header row 1 - simple headers without vmerge
    row1 = [
        _make_tc("Số lượng phòng Karaoke", center=True, bold=True, shade_header=True),
        _make_tc("Mức tiền bản quyền chưa bao gồm thuế GTGT", center=True, bold=True, shade_header=True),
    ]
    if has_row_support:
        row1.append(_make_tc("Hỗ trợ", center=True, bold=True, shade_header=True))
    row1.append(_make_tc("Thành tiền (đồng)", center=True, bold=True, shade_header=True))
    tbl.append(_make_tr(row1))

    row2 = [
        _make_tc("", shade_header=True),
        _make_tc("(Số tiền bản quyền chi trả (tính theo năm) = Mức lương cơ sở x Hệ số điều chỉnh)", center=True, italic=True, shade_header=True),
    ]
    if has_row_support:
        row2.append(_make_tc("", shade_header=True))
    row2.append(_make_tc("", shade_header=True))
    tbl.append(_make_tr(row2))

    if detail_rows:
        for i, row in enumerate(detail_rows):
            cells: list = []
            # Show quantity label only on first row, empty for subsequent rows
            cells.append(_make_tc(quantity_label if i == 0 else "", center=True, bold=(i == 0)))
            cells.append(_make_tc(str(row.get("left") or ""), right=True))
            if has_row_support:
                support_text = str(row.get("support") or "").strip()
                cells.append(_make_tc(support_text, right=True))
            cells.append(_make_tc(_normalize_amount_text(str(row.get("amount") or "")), right=True))
            tbl.append(_make_tr(cells))
    else:
        cells = [_make_tc(quantity_label, center=True, bold=True), _make_tc("Chưa có dữ liệu tính chi tiết", center=True)]
        if has_row_support:
            cells.append(_make_tc("", center=True))
        cells.append(_make_tc("0", right=True))
        tbl.append(_make_tr(cells))

    for i, row in enumerate(summary_rows):
        label = str(row.get("label") or "")
        amount = str(row.get("amount") or "")
        is_primary = bool(row.get("primary"))
        label_span = col_count - 1
        # Primary rows get underline (gạch chân) instead of bold
        # All cells aligned right for summary rows (label right-aligned)
        label_cell = _make_tc(label, right=True, underline=is_primary, grid_span=label_span)
        amount_cell = _make_tc(_normalize_amount_text(amount), right=True, underline=is_primary)
        
        # Apply bold top border to primary rows for emphasis
        if is_primary:
            label_tcpr = label_cell.find(f".//{w}tcPr")
            amount_tcpr = amount_cell.find(f".//{w}tcPr")
            if label_tcpr is not None:
                tc_borders = etree.SubElement(label_tcpr, f"{w}tcBorders")
                b = etree.SubElement(tc_borders, f"{w}top")
                b.set(f"{w}val", "single")
                b.set(f"{w}sz", "16")
                b.set(f"{w}space", "0")
                b.set(f"{w}color", "000000")
            if amount_tcpr is not None:
                tc_borders = etree.SubElement(amount_tcpr, f"{w}tcBorders")
                b = etree.SubElement(tc_borders, f"{w}top")
                b.set(f"{w}val", "single")
                b.set(f"{w}sz", "16")
                b.set(f"{w}space", "0")
                b.set(f"{w}color", "000000")
        
        tbl.append(_make_tr([label_cell, amount_cell], bold_border=is_primary))

    if words_line:
        tbl.append(_make_tr([_make_tc(words_line, center=True, italic=True, grid_span=col_count)]))
    if footer_note:
        tbl.append(_make_tr([_make_tc(footer_note, center=True, italic=True, grid_span=col_count)]))

    parent.insert(idx, tbl)
    parent.remove(anchor_p)

    out_xml = etree.tostring(root, encoding="utf-8", xml_declaration=True)
    with zipfile.ZipFile(docx_path, "w") as zout:
        zout.writestr("word/document.xml", out_xml)
        for item, data in other_items:
            zout.writestr(item, data)

    return True



# =============================================================================
# UNIFIED BLOCK HANDLER — single-pass DOCX modification
# Replaces: insert_karaoke_blocks + insert_music_usage_areas_table + replace_royalty_placeholders
# Fixes anchor conflict: all 3 handlers tried to use the same {{khu_vuc_su_dung_nhac}} anchor
# =============================================================================

def insert_khu_vuc_and_tien_ban_quyen_blocks(
    *,
    docx_path: Path,
    render_ctx: dict,
) -> dict:
    """Unified handler: insert all karaoke blocks in a single DOCX pass.

    Anchor resolution priority for khu_vuc_su_dung_nhac:
      1. {{khu_vuc_su_dung_nhac}} (canonical — in template)
      2. {{music_usage_areas_table}} (legacy alias)
      3. __MUSIC_USAGE_AREAS_TABLE__ (old sentinel)
      4. __KARAOKE_ROOM_BLOCK__ (old sentinel)

    Anchor resolution for tien_ban_quyen:
      1. {{tien_ban_quyen}} (canonical — in template)

    Reads DOCX once, writes once. All blocks are inserted/replaced in one pass.

    Returns:
        dict with insertion status for each block
    """
    warnings: list[str] = []

    # -------------------------------------------------------------------------
    # Parse data
    # -------------------------------------------------------------------------
    def fmt_amount(value) -> str:
        try:
            return f"{int(value or 0):,}".replace(",", ".")
        except Exception:
            return str(value or "")

    music_areas = render_ctx.get("music_usage_areas") or []
    if isinstance(music_areas, str):
        try:
            import json
            music_areas = json.loads(music_areas)
        except Exception:
            music_areas = []

    room_display = str(render_ctx.get("room_display_text") or
                       render_ctx.get("karaoke_room_block_text") or "")
    tong_so_phong = int(render_ctx.get("tong_so_phong") or 0)
    tong_so_box = int(render_ctx.get("tong_so_box") or 0)
    loai_hinh = str(render_ctx.get("loai_hinh_karaoke") or "PHONG").strip().upper()
    royalty_before = fmt_amount(render_ctx.get("royalty_amount_before_vat"))
    vat_rate = f"{float(render_ctx.get('vat_rate') or 8):.0f}%"
    vat_amt = fmt_amount(render_ctx.get("vat_amount"))
    royalty_after = fmt_amount(render_ctx.get("royalty_amount_after_vat"))
    royalty_words = str(render_ctx.get("royalty_amount_in_words") or "").strip()

    # DEBUG: Log music usage areas count
    import logging as _log
    _log.getLogger("karaoke_export").debug(
        f"[RENDERER] music_usage_areas_count={len(music_areas)}, "
        f"music_usage_areas={music_areas}"
    )

    # DEBUG: Log each row being rendered
    for idx, area in enumerate(music_areas):
        _log.getLogger("karaoke_export").debug(
            f"[RENDERER] rendering row {idx + 1}: area_name={area.get('area_name')}, "
            f"scale_description={area.get('scale_description')}, "
            f"music_usage_type={area.get('music_usage_type')}"
        )

    # -------------------------------------------------------------------------
    # Read DOCX once
    # -------------------------------------------------------------------------
    try:
        with zipfile.ZipFile(docx_path, "r") as zin:
            xml_bytes = zin.read("word/document.xml")
            other_items = [(item, zin.read(item.filename))
                           for item in zin.infolist() if item.filename != "word/document.xml"]
    except Exception as e:
        warnings.append(f"Failed to read DOCX: {e}")
        return {"khu_vuc_inserted": False, "tien_ban_quyen_inserted": False, "warnings": warnings}

    parser = etree.XMLParser(recover=True, huge_tree=True)
    root = etree.fromstring(xml_bytes, parser=parser)
    w = f"{{{W_NS}}}"

    # -------------------------------------------------------------------------
    # Helper: make a table row with 2 cells (label | value)
    # -------------------------------------------------------------------------
    def _make_2col_tr(label: str, value: str, bold: bool = False) -> etree._Element:
        tr = etree.Element(f"{w}tr")

        # Label cell
        tc1 = etree.Element(f"{w}tc")
        tcpr1 = etree.SubElement(tc1, f"{w}tcPr")
        ind = etree.SubElement(tcpr1, f"{w}ind")
        ind.set(f"{w}left", "450")
        p1 = etree.Element(f"{w}p")
        r1 = etree.SubElement(p1, f"{w}r")
        rpr1 = etree.SubElement(r1, f"{w}rPr")
        rfonts1 = etree.SubElement(rpr1, f"{w}rFonts")
        rfonts1.set(f"{w}ascii", "Times New Roman")
        rfonts1.set(f"{w}hAnsi", "Times New Roman")
        sz1 = etree.SubElement(rpr1, f"{w}sz")
        sz1.set(f"{w}val", "26")
        if bold:
            etree.SubElement(rpr1, f"{w}b")
        t1 = etree.SubElement(r1, f"{w}t")
        t1.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        t1.text = label
        tc1.append(p1)

        # Value cell
        tc2 = etree.Element(f"{w}tc")
        tcpr2 = etree.SubElement(tc2, f"{w}tcPr")
        jc = etree.SubElement(tcpr2, f"{w}jc")
        jc.set(f"{w}val", "right")
        p2 = etree.Element(f"{w}p")
        r2 = etree.SubElement(p2, f"{w}r")
        rpr2 = etree.SubElement(r2, f"{w}rPr")
        rfonts2 = etree.SubElement(rpr2, f"{w}rFonts")
        rfonts2.set(f"{w}ascii", "Times New Roman")
        rfonts2.set(f"{w}hAnsi", "Times New Roman")
        sz2 = etree.SubElement(rpr2, f"{w}sz")
        sz2.set(f"{w}val", "26")
        if bold:
            etree.SubElement(rpr2, f"{w}b")
        t2 = etree.SubElement(r2, f"{w}t")
        t2.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        t2.text = value
        tc2.append(p2)

        tr.append(tc1)
        tr.append(tc2)
        return tr

    def _make_3col_tr(c1: str, c2: str, c3: str, shade: bool = False) -> etree._Element:
        tr = etree.Element(f"{w}tr")
        for txt, center in [(c1, True), (c2, True), (c3, True)]:
            tc = etree.Element(f"{w}tc")
            tcpr = etree.SubElement(tc, f"{w}tcPr")
            if shade:
                shd = etree.SubElement(tcpr, f"{w}shd")
                shd.set(f"{w}val", "clear")
                shd.set(f"{w}fill", "D9D9D9")
            p = etree.Element(f"{w}p")
            ppr = etree.SubElement(p, f"{w}pPr")
            if center:
                jc = etree.SubElement(ppr, f"{w}jc")
                jc.set(f"{w}val", "center")
            r = etree.SubElement(p, f"{w}r")
            rpr = etree.SubElement(r, f"{w}rPr")
            rfonts = etree.SubElement(rpr, f"{w}rFonts")
            rfonts.set(f"{w}ascii", "Times New Roman")
            rfonts.set(f"{w}hAnsi", "Times New Roman")
            sz = etree.SubElement(rpr, f"{w}sz")
            sz.set(f"{w}val", "26")
            etree.SubElement(rpr, f"{w}b")
            t = etree.SubElement(r, f"{w}t")
            t.text = txt
            tc.append(p)
            tr.append(tc)
        return tr

    def _make_tc(text: str = "") -> etree._Element:
        tc = etree.Element(f"{w}tc")
        p = etree.Element(f"{w}p")
        r = etree.SubElement(p, f"{w}r")
        rpr = etree.SubElement(r, f"{w}rPr")
        rfonts = etree.SubElement(rpr, f"{w}rFonts")
        rfonts.set(f"{w}ascii", "Times New Roman")
        rfonts.set(f"{w}hAnsi", "Times New Roman")
        sz = etree.SubElement(rpr, f"{w}sz")
        sz.set(f"{w}val", "26")
        t = etree.SubElement(r, f"{w}t")
        t.text = text
        tc.append(p)
        return tc

    def _make_table_3col(col_widths: list[int]) -> etree._Element:
        tbl = etree.Element(f"{w}tbl")
        tblpr = etree.SubElement(tbl, f"{w}tblPr")
        layout = etree.SubElement(tblpr, f"{w}tblLayout")
        layout.set(f"{w}type", "fixed")
        borders = etree.SubElement(tblpr, f"{w}tblBorders")
        for side in ["top", "left", "bottom", "right", "insideH", "insideV"]:
            b = etree.SubElement(borders, f"{w}{side}")
            b.set(f"{w}val", "single")
            b.set(f"{w}sz", "8")
            b.set(f"{w}color", "000000")
        grid = etree.SubElement(tbl, f"{w}tblGrid")
        for cw in col_widths:
            gc = etree.SubElement(grid, f"{w}gridCol")
            gc.set(f"{w}w", str(cw))
        return tbl

    def _replace_para_with_tbl(
        root_el: etree._Element,
        anchor_text: str,
        tbl: etree._Element,
    ) -> bool:
        """Find paragraph with anchor_text and replace with table."""
        anchor_p = _find_anchor_paragraph(root_el, anchor_text)
        if anchor_p is None:
            return False
        parent = anchor_p.getparent()
        if parent is None:
            return False
        idx = parent.index(anchor_p)
        parent.insert(idx, tbl)
        parent.remove(anchor_p)
        return True

    khu_vuc_inserted = False
    tien_ban_quyen_inserted = False

    # -------------------------------------------------------------------------
    # BLOCK 1: {{khu_vuc_su_dung_nhac}} → bảng khu vực sử dụng âm nhạc
    # -------------------------------------------------------------------------
    # Try all possible anchors in priority order (from registry)
    khu_vuc_anchors = get_anchors_for_key("khu_vuc_su_dung_nhac")
    used_khu_vuc_anchor = None
    for anchor in khu_vuc_anchors:
        ap = _find_anchor_paragraph(root, anchor)
        if ap is not None:
            used_khu_vuc_anchor = anchor
            break

    if used_khu_vuc_anchor is not None:
        # Build the unified table
        tbl = _make_table_3col([3000, 3000, 3000])
        tbl.append(_make_3col_tr(
            "Vị trí / khu vực sử dụng âm nhạc",
            "Quy mô, sức chứa",
            "Hình thức sử dụng âm nhạc",
            shade=True,
        ))

        # Data rows from music_usage_areas
        has_data = False
        for area in music_areas:
            tr = etree.Element(f"{w}tr")
            # area_name: ưu tiên pricing_label (tên hiển thị in ấn), fallback area_name
            tc_area = _make_tc(_resolve_area_display_name(area))
            tr.append(tc_area)
            tc_scale = _make_tc(str(area.get("scale_description", "")))
            tr.append(tc_scale)
            tc_type = _make_tc(str(area.get("music_usage_type", "")))
            tr.append(tc_type)
            tbl.append(tr)
            has_data = True

        # Fallback: if no music_usage_areas data, show room summary
        if not has_data:
            summary = f"{tong_so_box} box" if loai_hinh == "BOX" and tong_so_box > 0 else f"{tong_so_phong} phòng"
            tr = etree.Element(f"{w}tr")
            tr.append(_make_tc(summary))
            tr.append(_make_tc(""))
            tr.append(_make_tc(""))
            tbl.append(tr)
            warnings.append("No music_usage_areas data — using room count fallback.")

        if _replace_para_with_tbl(root, used_khu_vuc_anchor, tbl):
            khu_vuc_inserted = True
        else:
            warnings.append(f"khu_vuc: anchor '{used_khu_vuc_anchor}' found but replacement failed.")
    else:
        warnings.append(
            f"khu_vuc: no anchor found. Tried: {khu_vuc_anchors}. "
            f"Template: {docx_path}. Ensure {{khu_vuc_su_dung_nhac}} exists in template."
        )

    # -------------------------------------------------------------------------
    # BLOCK 2: {{tien_ban_quyen}} — PRESERVED (no auto-render)
    # {{kien_ban_quyen}} is a PRESERVED placeholder. Users will copy their pricing
    # table from an external Excel file and paste it into the Word document.
    # We do NOT auto-render this block. We do NOT write a sentinel.
    # We leave the placeholder as-is (it stays in the docx after render_docx_text).
    # -------------------------------------------------------------------------
    tien_ban_quyen_inserted = None  # Not rendered — preserved

    # -------------------------------------------------------------------------
    # Write DOCX once
    # -------------------------------------------------------------------------
    out_xml = etree.tostring(root, encoding="utf-8", xml_declaration=True)
    with zipfile.ZipFile(docx_path, "w") as zout:
        zout.writestr("word/document.xml", out_xml)
        for item, data in other_items:
            zout.writestr(item, data)

    return {
        "khu_vuc_inserted": khu_vuc_inserted,
        "tien_ban_quyen_preserved": True,  # Always preserved, never rendered
        "warnings": warnings,
    }


# =============================================================================
# PHASE 2: MUSIC USAGE AREAS TABLE RENDERER
# =============================================================================
# DEPRECATED: Use insert_khu_vuc_and_tien_ban_quyen_blocks() instead.
# Kept for backward compatibility only.
# =============================================================================

def insert_music_usage_areas_table(
    *,
    docx_path: Path,
    render_ctx: dict,
) -> dict:
    """Insert Music Usage Areas table into a DOCX file."""
    warnings: list[str] = []
    music_areas = render_ctx.get("music_usage_areas") or []
    if isinstance(music_areas, str):
        try:
            import json
            music_areas = json.loads(music_areas)
        except Exception:
            music_areas = []

    if not music_areas:
        warnings.append("No music usage areas to insert")
        return {"music_usage_areas_table_inserted": False, "warnings": warnings}

    try:
        with zipfile.ZipFile(docx_path, "r") as zin:
            xml_bytes = zin.read("word/document.xml")
            other_items = [(item, zin.read(item.filename)) for item in zin.infolist() if item.filename != "word/document.xml"]
    except Exception as e:
        warnings.append(f"Failed to read DOCX: {e}")
        return {"music_usage_areas_table_inserted": False, "warnings": warnings}

    parser = etree.XMLParser(recover=True, huge_tree=True)
    root = etree.fromstring(xml_bytes, parser=parser)

    # Try all anchors for khu_vuc_su_dung_nhac (canonical + aliases + legacy sentinels)
    all_anchors = get_anchors_for_key("khu_vuc_su_dung_nhac")
    anchor_p = None
    used_anchor = None
    for anchor in all_anchors:
        anchor_p = _find_anchor_paragraph(root, anchor)
        if anchor_p is not None:
            used_anchor = anchor
            break

    if anchor_p is None:
        warnings.append(
            f"Music usage areas: no anchor found. Tried: {all_anchors}. "
            f"Template: {docx_path}. Ensure {{khu_vuc_su_dung_nhac}} exists in template."
        )
        return {"music_usage_areas_table_inserted": False, "warnings": warnings}

    parent = anchor_p.getparent()
    if parent is None:
        return {"music_usage_areas_table_inserted": False, "warnings": ["No parent"]}
    idx = parent.index(anchor_p)

    w = f"{{{W_NS}}}"

    def _apply_run_style(rpr: etree._Element, bold: bool = False, italic: bool = False) -> None:
        rfonts = etree.SubElement(rpr, f"{w}rFonts")
        rfonts.set(f"{w}ascii", "Times New Roman")
        rfonts.set(f"{w}hAnsi", "Times New Roman")
        color = etree.SubElement(rpr, f"{w}color")
        color.set(f"{w}val", "000000")
        sz = etree.SubElement(rpr, f"{w}sz")
        sz.set(f"{w}val", "26")
        if bold:
            etree.SubElement(rpr, f"{w}b")
        if italic:
            etree.SubElement(rpr, f"{w}i")

    def _make_tc(text: str = "", center: bool = False, bold: bool = False, shade: bool = False) -> etree._Element:
        tc = etree.Element(f"{w}tc")
        tcpr = etree.SubElement(tc, f"{w}tcPr")
        if shade:
            shd = etree.SubElement(tcpr, f"{w}shd")
            shd.set(f"{w}val", "clear")
            shd.set(f"{w}fill", "D9D9D9")
        p = etree.Element(f"{w}p")
        ppr = etree.SubElement(p, f"{w}pPr")
        if center:
            jc = etree.SubElement(ppr, f"{w}jc")
            jc.set(f"{w}val", "center")
        r = etree.SubElement(p, f"{w}r")
        rpr = etree.SubElement(r, f"{w}rPr")
        _apply_run_style(rpr, bold=bold)
        t = etree.SubElement(r, f"{w}t")
        t.text = _decode_mojibake_text(str(text or ""))
        tc.append(p)
        return tc

    def _make_tr(cells: list) -> etree._Element:
        tr = etree.Element(f"{w}tr")
        for c in cells:
            tr.append(c)
        return tr

    col_widths = [3000, 3000, 3000]
    tbl = etree.Element(f"{w}tbl")
    tblpr = etree.SubElement(tbl, f"{w}tblPr")
    layout = etree.SubElement(tblpr, f"{w}tblLayout")
    layout.set(f"{w}type", "fixed")
    borders = etree.SubElement(tblpr, f"{w}tblBorders")
    for side in ["top", "left", "bottom", "right", "insideH", "insideV"]:
        b = etree.SubElement(borders, f"{w}{side}")
        b.set(f"{w}val", "single")
        b.set(f"{w}sz", "8")
        b.set(f"{w}color", "000000")
    grid = etree.SubElement(tbl, f"{w}tblGrid")
    for width in col_widths:
        gc = etree.SubElement(grid, f"{w}gridCol")
        gc.set(f"{w}w", str(width))

    # Header
    tbl.append(_make_tr([
        _make_tc("Vị trí / khu vực sử dụng âm nhạc", center=True, bold=True, shade=True),
        _make_tc("Quy mô, sức chứa", center=True, bold=True, shade=True),
        _make_tc("Hình thức sử dụng âm nhạc", center=True, bold=True, shade=True),
    ]))

    # Data rows
    for area in music_areas:
        tbl.append(_make_tr([
            _make_tc(_resolve_area_display_name(area)),
            _make_tc(str(area.get("scale_description", ""))),
            _make_tc(str(area.get("music_usage_type", ""))),
        ]))

    parent.insert(idx, tbl)
    parent.remove(anchor_p)

    out_xml = etree.tostring(root, encoding="utf-8", xml_declaration=True)
    with zipfile.ZipFile(docx_path, "w") as zout:
        zout.writestr("word/document.xml", out_xml)
        for item, data in other_items:
            zout.writestr(item, data)

    return {"music_usage_areas_table_inserted": True, "warnings": warnings}


def replace_royalty_placeholders(
    *,
    docx_path: Path,
    render_ctx: dict,
) -> dict:
    """Replace {{tien_ban_quyen}} with a formatted royalty block table.

    Also handles individual royalty field placeholders ({{royalty_amount_before_vat}}, etc.)
    as a fallback for templates that use them.
    """
    warnings: list[str] = []

    def fmt_amount(value) -> str:
        try:
            num = int(value or 0)
            return f"{num:,}".replace(",", ".")
        except Exception:
            return str(value or "")

    try:
        with zipfile.ZipFile(docx_path, "r") as zin:
            xml_bytes = zin.read("word/document.xml")
            other_items = [(item, zin.read(item.filename)) for item in zin.infolist() if item.filename != "word/document.xml"]
    except Exception as e:
        warnings.append(f"Failed to read DOCX: {e}")
        return {"royalty_placeholders_replaced": False, "warnings": warnings}

    parser = etree.XMLParser(recover=True, huge_tree=True)
    root = etree.fromstring(xml_bytes, parser=parser)
    w = f"{{{W_NS}}}"

    def _make_para(text: str = "", bold: bool = False, indent: int = 0) -> etree._Element:
        p = etree.Element(f"{w}p")
        ppr = etree.SubElement(p, f"{w}pPr")
        if indent:
            ind = etree.SubElement(ppr, f"{w}ind")
            ind.set(f"{w}left", str(indent))
        r = etree.SubElement(p, f"{w}r")
        rpr = etree.SubElement(r, f"{w}rPr")
        rfonts = etree.SubElement(rpr, f"{w}rFonts")
        rfonts.set(f"{w}ascii", "Times New Roman")
        rfonts.set(f"{w}hAnsi", "Times New Roman")
        sz = etree.SubElement(rpr, f"{w}sz")
        sz.set(f"{w}val", "26")
        if bold:
            etree.SubElement(rpr, f"{w}b")
        t = etree.SubElement(r, f"{w}t")
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        t.text = text
        return p

    def _make_row(label: str, value: str, bold: bool = False) -> etree._Element:
        tr = etree.Element(f"{w}tr")
        tc1 = etree.Element(f"{w}tc")
        tcpr1 = etree.SubElement(tc1, f"{w}tcPr")
        ind = etree.SubElement(tcpr1, f"{w}ind")
        ind.set(f"{w}left", "450")
        p1 = etree.SubElement(tc1, f"{w}p")
        r1 = etree.SubElement(p1, f"{w}r")
        rpr1 = etree.SubElement(r1, f"{w}rPr")
        rfonts1 = etree.SubElement(rpr1, f"{w}rFonts")
        rfonts1.set(f"{w}ascii", "Times New Roman")
        rfonts1.set(f"{w}hAnsi", "Times New Roman")
        sz1 = etree.SubElement(rpr1, f"{w}sz")
        sz1.set(f"{w}val", "26")
        if bold:
            etree.SubElement(rpr1, f"{w}b")
        t1 = etree.SubElement(r1, f"{w}t")
        t1.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        t1.text = label

        tc2 = etree.Element(f"{w}tc")
        tcpr2 = etree.SubElement(tc2, f"{w}tcPr")
        jc = etree.SubElement(tcpr2, f"{w}jc")
        jc.set(f"{w}val", "right")
        p2 = etree.SubElement(tc2, f"{w}p")
        r2 = etree.SubElement(p2, f"{w}r")
        rpr2 = etree.SubElement(r2, f"{w}rPr")
        rfonts2 = etree.SubElement(rpr2, f"{w}rFonts")
        rfonts2.set(f"{w}ascii", "Times New Roman")
        rfonts2.set(f"{w}hAnsi", "Times New Roman")
        sz2 = etree.SubElement(rpr2, f"{w}sz")
        sz2.set(f"{w}val", "26")
        if bold:
            etree.SubElement(rpr2, f"{w}b")
        t2 = etree.SubElement(r2, f"{w}t")
        t2.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        t2.text = value

        tr.append(tc1)
        tr.append(tc2)
        return tr

    replaced_count = 0
    did_block_replace = False

    # Strategy 1: Replace {{tien_ban_quyen}} with a formatted royalty block
    tien_bq_anchor = _find_anchor_paragraph(root, KARAOKE_PRICING_PLACEHOLDER)
    if tien_bq_anchor is not None:
        parent = tien_bq_anchor.getparent()
        if parent is not None:
            idx = parent.index(tien_bq_anchor)

            tbl = etree.Element(f"{w}tbl")
            tblpr = etree.SubElement(tbl, f"{w}tblPr")
            layout = etree.SubElement(tblpr, f"{w}tblLayout")
            layout.set(f"{w}type", "fixed")
            borders = etree.SubElement(tblpr, f"{w}tblBorders")
            for side in ["top", "left", "bottom", "right", "insideH", "insideV"]:
                b = etree.SubElement(borders, f"{w}{side}")
                b.set(f"{w}val", "single")
                b.set(f"{w}sz", "8")
                b.set(f"{w}color", "000000")

            before_vat = fmt_amount(render_ctx.get("royalty_amount_before_vat"))
            vat_rate = f"{float(render_ctx.get('vat_rate') or 8):.0f}%"
            vat_amt = fmt_amount(render_ctx.get("vat_amount"))
            after_vat = fmt_amount(render_ctx.get("royalty_amount_after_vat"))
            in_words = str(render_ctx.get("royalty_amount_in_words") or "")

            tbl.append(_make_row("Tiền bản quyền trước thuế:", before_vat))
            tbl.append(_make_row(f"Thuế GTGT ({vat_rate}):", vat_amt))
            tbl.append(_make_row("Tổng giá trị hợp đồng sau thuế:", after_vat, bold=True))
            tbl.append(_make_row("Bằng chữ:", in_words))

            parent.insert(idx, tbl)
            parent.remove(tien_bq_anchor)
            replaced_count += 1
            did_block_replace = True

    # Strategy 2: Also handle individual field placeholders (for templates that use them)
    individual_replacements = {
        ROYALTY_BEFORE_VAT_PLACEHOLDER: before_vat if did_block_replace else fmt_amount(render_ctx.get("royalty_amount_before_vat")),
        VAT_RATE_PLACEHOLDER: f"{float(render_ctx.get('vat_rate') or 8):.0f}%",
        VAT_AMOUNT_PLACEHOLDER: fmt_amount(render_ctx.get("vat_amount")),
        ROYALTY_AFTER_VAT_PLACEHOLDER: after_vat if did_block_replace else fmt_amount(render_ctx.get("royalty_amount_after_vat")),
        ROYALTY_IN_WORDS_PLACEHOLDER: str(render_ctx.get("royalty_amount_in_words") or ""),
    }
    for placeholder, value in individual_replacements.items():
        for p in root.xpath(".//w:p", namespaces=NS):
            plain = _extract_paragraph_text(p)
            if placeholder in plain:
                for t in p.xpath(".//w:t", namespaces=NS):
                    if t.text and placeholder in t.text:
                        t.text = t.text.replace(placeholder, str(value))
                        replaced_count += 1

    out_xml = etree.tostring(root, encoding="utf-8", xml_declaration=True)
    with zipfile.ZipFile(docx_path, "w") as zout:
        zout.writestr("word/document.xml", out_xml)
        for item, data in other_items:
            zout.writestr(item, data)

    return {"royalty_placeholders_replaced": replaced_count > 0, "replacements_count": replaced_count, "warnings": warnings}


# =============================================================================
# PRICING TABLE PLACEHOLDER FILLER — for export_template_contract_1.docx
# Fills individual placeholders: tier labels, coefficients, amounts, support, VAT
# =============================================================================

def fill_pricing_table_placeholders(
    *,
    docx_path: Path,
    render_ctx: dict,
) -> dict:
    """Fill individual pricing table placeholders in export_template_contract_1.docx.

    This function replaces placeholder strings like {{tier_1_label}}, {{tier_1_amount}}
    with actual calculated values from the render context.

    Args:
        docx_path: Path to the rendered DOCX file.
        render_ctx: Dictionary containing:
            - tier_1_label, tier_2_label, tier_3_label
            - tier_1_coefficient, tier_2_coefficient, tier_3_coefficient
            - tier_1_amount, tier_2_amount, tier_3_amount
            - urban_support_label, urban_support_basis, urban_support_rate
            - royalty_amount_before_vat, vat_rate, vat_amount
            - duration_months, royalty_amount_after_vat, royalty_amount_in_words
            - karaoke_pricing_footer_note

    Returns:
        dict with insertion status and warnings
    """
    warnings: list[str] = []

    def fmt_amount(value) -> str:
        """Format amount as Vietnamese currency without 'đ' suffix."""
        try:
            return f"{int(value or 0):,}".replace(",", ".")
        except Exception:
            return str(value or "")

    def fmt_coeff(value) -> str:
        """Format coefficient with 2 decimal places, using comma as separator."""
        try:
            return f"{float(value or 0):.2f}".replace(".", ",")
        except Exception:
            return str(value or "0,00")

    # Read DOCX
    try:
        with zipfile.ZipFile(docx_path, "r") as zin:
            xml_bytes = zin.read("word/document.xml")
            other_items = [(item, zin.read(item.filename))
                          for item in zin.infolist() if item.filename != "word/document.xml"]
    except Exception as e:
        warnings.append(f"Failed to read DOCX: {e}")
        return {"pricing_placeholders_filled": False, "warnings": warnings}

    parser = etree.XMLParser(recover=True, huge_tree=True)
    root = etree.fromstring(xml_bytes, parser=parser)

    replaced_count = 0

    # Define all placeholders and their values
    # Note: muc_luong_co_so in template has "đ" after it, so format without
    muc_luong = render_ctx.get("muc_luong_co_so")
    if muc_luong:
        try:
            muc_luong_val = int(muc_luong)
            muc_luong_str = f"{muc_luong_val:,}".replace(",", ".")
        except (ValueError, TypeError):
            muc_luong_str = str(muc_luong)
    else:
        muc_luong_str = ""

    replacements = {
        "{{total_rooms_text}}": str(render_ctx.get("total_rooms_text") or ""),
        "{{tier_1_label}}": str(render_ctx.get("tier_1_label") or ""),
        "{{tier_2_label}}": str(render_ctx.get("tier_2_label") or ""),
        "{{tier_3_label}}": str(render_ctx.get("tier_3_label") or ""),
        "{{muc_luong_co_so}}": muc_luong_str,
        "{{tier_1_coefficient}}": fmt_coeff(render_ctx.get("tier_1_coefficient")),
        "{{tier_2_coefficient}}": fmt_coeff(render_ctx.get("tier_2_coefficient")),
        "{{tier_3_coefficient}}": fmt_coeff(render_ctx.get("tier_3_coefficient")),
        "{{tier_unit}}": str(render_ctx.get("tier_unit") or "phòng/năm"),
        "{{tier_1_amount}}": fmt_amount(render_ctx.get("tier_1_amount")),
        "{{tier_2_amount}}": fmt_amount(render_ctx.get("tier_2_amount")),
        "{{tier_3_amount}}": fmt_amount(render_ctx.get("tier_3_amount")),
        "{{urban_support_label}}": str(render_ctx.get("urban_support_label") or ""),
        "{{urban_support_basis}}": str(render_ctx.get("urban_support_basis") or ""),
        "{{urban_support_rate}}": str(render_ctx.get("urban_support_rate") or ""),
        "{{royalty_amount_before_vat}}": fmt_amount(render_ctx.get("royalty_amount_before_vat")),
        "{{vat_rate}}": str(render_ctx.get("vat_rate") or "8"),
        "{{vat_amount}}": fmt_amount(render_ctx.get("vat_amount")),
        "{{duration_months}}": str(render_ctx.get("duration_months") or "12"),
        "{{royalty_amount_after_vat}}": fmt_amount(render_ctx.get("royalty_amount_after_vat")),
        "{{royalty_amount_in_words}}": str(render_ctx.get("royalty_amount_in_words") or ""),
        "{{karaoke_pricing_footer_note}}": str(render_ctx.get("karaoke_pricing_footer_note") or ""),
    }

    # Replace placeholders in text nodes
    # IMPORTANT: We must replace ALL placeholders, even if value is empty string.
    # Empty tier labels/amounts for BOX contracts must still be replaced to avoid
    # literal {{tier_2_label}}, {{tier_3_label}} leaking into DOCX.
    for placeholder, value in replacements.items():
        if not placeholder:
            continue
        # Never skip due to empty value - we need to replace the placeholder even with ""
        # Use empty string as valid replacement value for unused tier rows

        for t in root.xpath(".//w:t", namespaces=NS):
            if t.text and placeholder in t.text:
                # Decode mojibake and replace placeholder with value (can be empty string)
                replacement_value = _decode_mojibake_text(str(value))
                t.text = t.text.replace(placeholder, replacement_value)
                replaced_count += 1

    # Write back atomically: write to temp file first, then replace
    # This prevents corrupting the output file if an error occurs mid-write
    import os
    import tempfile

    tmp_dir = str(docx_path.parent)
    tmp_fd, tmp_path_str = tempfile.mkstemp(suffix=".docx", dir=tmp_dir)
    os.close(tmp_fd)
    tmp_path = Path(tmp_path_str)

    try:
        out_xml = etree.tostring(root, encoding="utf-8", xml_declaration=True)
        with zipfile.ZipFile(tmp_path, "w") as zout:
            zout.writestr("word/document.xml", out_xml)
            for item, data in other_items:
                zout.writestr(item, data)
        # Atomic replace: this is atomic on POSIX and mostly atomic on Windows
        os.replace(tmp_path, docx_path)
    except Exception as write_err:
        # Clean up temp file on failure
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except Exception:
            pass
        warnings.append(f"Failed to write DOCX: {write_err}")
        return {"pricing_placeholders_filled": False, "warnings": warnings}

    if replaced_count == 0:
        # This is expected when docxtpl already rendered placeholders from basic_ctx
        warnings.append(
            "Pricing table placeholders already rendered by docxtpl (or missing in template). "
            "This is normal when basic_ctx contains all pricing values."
        )

    return {
        "pricing_placeholders_filled": replaced_count > 0,
        "replacements_count": replaced_count,
        "warnings": warnings,
    }
