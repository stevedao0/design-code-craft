"""KVC DOCX block insertion for Khu vui choi contracts.

This module provides KVC-specific block insertion into DOCX templates:
- KVC usage block (location/area table)
- KVC pricing block (pricing table)

All placeholder/sentinel strings come from the registry.
No magic strings allowed outside registry.
"""
from __future__ import annotations

import logging
import re
import zipfile
from pathlib import Path

from lxml import etree

from app.services.placeholder_registry import (
    PLACEHOLDERS,
    get_anchors_for_key,
)

logger = logging.getLogger("uvicorn.error")

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}

# Convenience aliases from registry
KVC_USAGE_PLACEHOLDER = PLACEHOLDERS["khu_vuc_su_dung_nhac"].template_placeholder
KVC_PRICING_PLACEHOLDER = PLACEHOLDERS["tien_ban_quyen"].template_placeholder
KVC_USAGE_SENTINEL = PLACEHOLDERS["khu_vuc_su_dung_nhac"].sentinel
KVC_PRICING_SENTINEL = PLACEHOLDERS["tien_ban_quyen"].sentinel


def _docx_contains_anchor(*, docx_path: Path, anchor_text: str) -> bool:
    """Check if a DOCX file contains a specific plain-text anchor."""
    try:
        with zipfile.ZipFile(docx_path, "r") as zf:
            xml = zf.read("word/document.xml").decode("utf-8", errors="ignore")
        plain = re.sub(r"<[^>]+>", "", xml)
        return anchor_text in plain
    except Exception:
        return False


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


def _resolve_area_display_name(area) -> str:
    """Resolve display name for music usage area row.

    pricing_label (tên hiển thị tùy chọn) ưu tiên hơn area_name khi user đã nhập.
    CHỈ dùng cho hiển thị/in ấn — không ảnh hưởng công thức tính tiền.
    """
    raw_label = ""
    raw_area = ""
    try:
        if isinstance(area, dict):
            raw_label = str(area.get("pricing_label") or "").strip()
            raw_area = str(area.get("area_name") or "").strip()
        else:
            raw_label = str(getattr(area, "pricing_label", "") or "").strip()
            raw_area = str(getattr(area, "area_name", "") or "").strip()
    except Exception:
        pass
    if raw_label:
        return raw_label
    if raw_area:
        return raw_area
    return ""


def _find_anchor_paragraph(root: etree._Element, anchor_text: str) -> etree._Element | None:
    """Find the paragraph element containing an anchor."""
    target = _norm_anchor(anchor_text)
    for p in root.xpath(".//w:p", namespaces=NS):
        if target in _norm_anchor(_extract_paragraph_text(p)):
            return p
    return None


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


def _strip_manual_dot_prefix(text: str) -> str:
    """Strip leading dots from text."""
    return re.sub(r"^\.+\s*", "", str(text or "").strip())


def insert_kvc_blocks(
    *,
    docx_path: Path,
    render_ctx: dict,
) -> dict:
    """Insert KVC usage block into a DOCX file.

    {{khu_vuc_su_dung_nhac}} → auto-rendered table.
    {{tien_ban_quyen}} → PRESERVED (no auto-render).
    """

    warnings: list[str] = []
    usage_inserted = False

    # Try all anchors for khu_vuc_su_dung_nhac (from registry)
    usage_anchor = None
    for anchor in get_anchors_for_key("khu_vuc_su_dung_nhac"):
        if _docx_contains_anchor(docx_path=docx_path, anchor_text=anchor):
            usage_anchor = anchor
            break

    if usage_anchor is None:
        all_anchors = get_anchors_for_key("khu_vuc_su_dung_nhac")
        warnings.append(f"KVC usage anchor not found. Tried: {all_anchors}. Template: {docx_path}")
    else:
        usage_inserted = _insert_kvc_usage_table_at_anchor(
            docx_path=docx_path,
            render_ctx=render_ctx,
            anchor_text=usage_anchor,
        )
        if not usage_inserted:
            warnings.append("KVC usage anchor found but insertion failed or no data to insert.")

    return {
        "kvc_usage_block_inserted": usage_inserted,
        "kvc_pricing_block_preserved": True,  # PRESERVED — never rendered
        "warnings": warnings,
    }


def _insert_kvc_usage_table_at_anchor(*, docx_path: Path, render_ctx: dict, anchor_text: str = KVC_USAGE_PLACEHOLDER) -> bool:
    """Insert KVC usage locations table at the {{khu_vuc_su_dung_nhac}} placeholder.

    Args:
        docx_path: Path to the DOCX file.
        render_ctx: Context containing background_usage_locations_block.
        anchor_text: Anchor text to find and replace.

    Returns:
        True if insertion successful, False otherwise.
    """
    rows = _build_kvc_usage_rows(render_ctx)
    if not rows:
        logger.warning("KVC usage: no rows to insert")
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

    def _apply_run_style(rpr: etree._Element, *, bold: bool = False, italic: bool = False) -> None:
        rfonts = etree.SubElement(rpr, f"{w}rFonts")
        rfonts.set(f"{w}ascii", "Times New Roman")
        rfonts.set(f"{w}hAnsi", "Times New Roman")
        rfonts.set(f"{w}cs", "Times New Roman")
        sz = etree.SubElement(rpr, f"{w}sz")
        sz.set(f"{w}val", "24")
        szcs = etree.SubElement(rpr, f"{w}szCs")
        szcs.set(f"{w}val", "24")
        if bold:
            etree.SubElement(rpr, f"{w}b")
            etree.SubElement(rpr, f"{w}bCs")
        if italic:
            etree.SubElement(rpr, f"{w}i")
            etree.SubElement(rpr, f"{w}iCs")

    def _mk_p(text: str, *, center: bool = False, bold: bool = False) -> etree._Element:
        p = etree.Element(f"{w}p")
        ppr = etree.SubElement(p, f"{w}pPr")
        spacing = etree.SubElement(ppr, f"{w}spacing")
        spacing.set(f"{w}before", "0")
        spacing.set(f"{w}after", "0")
        spacing.set(f"{w}line", "260")
        spacing.set(f"{w}lineRule", "auto")
        if center:
            jc = etree.SubElement(ppr, f"{w}jc")
            jc.set(f"{w}val", "center")
        r = etree.SubElement(p, f"{w}r")
        rpr = etree.SubElement(r, f"{w}rPr")
        _apply_run_style(rpr, bold=bold)
        t = etree.SubElement(r, f"{w}t")
        t.text = _decode_mojibake_text(text)
        return p

    def _make_tc(text: str, *, center: bool = False, bold: bool = False, shade_header: bool = False) -> etree._Element:
        tc = etree.Element(f"{w}tc")
        tcpr = etree.SubElement(tc, f"{w}tcPr")
        tc_mar = etree.SubElement(tcpr, f"{w}tcMar")
        for side, amount in (("top", 70), ("right", 90), ("bottom", 70), ("left", 90)):
            n = etree.SubElement(tc_mar, f"{w}{side}")
            n.set(f"{w}w", str(amount))
            n.set(f"{w}type", "dxa")
        if shade_header:
            shd = etree.SubElement(tcpr, f"{w}shd")
            shd.set(f"{w}val", "clear")
            shd.set(f"{w}color", "auto")
            shd.set(f"{w}fill", "D9D9D9")
        v = etree.SubElement(tcpr, f"{w}vAlign")
        v.set(f"{w}val", "center")
        tc.append(_mk_p(text, center=center, bold=bold))
        return tc

    def _make_tr(cells: list) -> etree._Element:
        tr = etree.Element(f"{w}tr")
        for c in cells:
            tr.append(c)
        return tr

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
    for width in [5200, 2100, 2300]:
        gc = etree.SubElement(grid, f"{w}gridCol")
        gc.set(f"{w}w", str(width))

    tbl.append(_make_tr([
        _make_tc("Khu vực sử dụng âm nhạc", center=True, bold=True, shade_header=True),
        _make_tc("Quy mô, sức chứa", center=True, bold=True, shade_header=True),
        _make_tc("Hình thức sử dụng âm nhạc", center=True, bold=True, shade_header=True),
    ]))

    for row in rows:
        tbl.append(_make_tr([
            _make_tc(str(row.get("music_area") or "")),
            _make_tc(str(row.get("area_text") or ""), center=True),
            _make_tc(str(row.get("usage_form") or ""), center=True),
        ]))

    parent.insert(idx, tbl)
    parent.remove(anchor_p)

    out_xml = etree.tostring(root, encoding="utf-8", xml_declaration=True)
    with zipfile.ZipFile(docx_path, "w") as zout:
        zout.writestr("word/document.xml", out_xml)
        for item, data in other_items:
            zout.writestr(item, data)

    return True


def _build_kvc_usage_rows(render_ctx: dict) -> list[dict]:
    """Build KVC usage rows from render context.

    Priority:
    1. music_usage_areas (Phase 2 - new contracts)
    2. background_usage_locations_block (legacy)
    3. Fallback from BANG_HIEU / area_m2

    Args:
        render_ctx: Context dictionary.

    Returns:
        List of row dicts with music_area, area_text, usage_form keys.
    """
    import logging as _log
    rows: list[dict] = []

    # DEBUG: Log data source
    music_areas = render_ctx.get("music_usage_areas") or []
    if isinstance(music_areas, str):
        try:
            import json
            music_areas = json.loads(music_areas)
        except Exception:
            music_areas = []

    # Priority 1: music_usage_areas (Phase 2 - new contracts)
    if music_areas and isinstance(music_areas, list) and len(music_areas) > 0:
        _log.getLogger("kvc_renderer").debug(
            f"[WORD_EXPORT_AREAS] source=music_usage_areas, count={len(music_areas)}"
        )
        for area in music_areas:
            rows.append({
                # Ưu tiên pricing_label (tên hiển thị in ấn), fallback area_name.
                "music_area": _resolve_area_display_name(area),
                "area_text": str(area.get("scale_description") or ""),
                "usage_form": str(area.get("music_usage_type") or ""),
            })
        return rows

    # Priority 2: background_usage_locations_block (legacy)
    bg_usage_block = render_ctx.get("background_usage_locations_block") or {}
    if isinstance(bg_usage_block, dict) and bg_usage_block.get("mode") == "table":
        table_rows = bg_usage_block.get("rows") or []
        for row in table_rows:
            if isinstance(row, (list, tuple)) and len(row) >= 3:
                rows.append({
                    "music_area": str(row[0] or ""),
                    "area_text": str(row[1] or ""),
                    "usage_form": str(row[2] or ""),
                })
        if rows:
            _log.getLogger("kvc_renderer").debug(
                f"[WORD_EXPORT_AREAS] source=background_usage_locations_block, count={len(rows)}"
            )
            return rows

    # Priority 3: Fallback from BANG_HIEU / area_m2 (legacy contracts)
    location = _decode_mojibake_text(
        str(render_ctx.get("BANG_HIEU") or render_ctx.get("ten_bang_hieu") or "")
    ).strip()
    area_text = _decode_mojibake_text(
        str(render_ctx.get("background_area_m2") or render_ctx.get("tong_dien_tich") or "")
    ).strip()
    if area_text and "m" not in area_text.lower():
        area_text = f"{area_text} m²"
    if location or area_text:
        rows.append({
            "music_area": location or "-",
            "area_text": area_text or "-",
            "usage_form": "Nhạc nền",
        })
        _log.getLogger("kvc_renderer").debug(
            f"[WORD_EXPORT_AREAS] source=legacy_fallback, count={len(rows)}"
        )

    return rows


def _insert_kvc_pricing_table_at_anchor(*, docx_path: Path, render_ctx: dict, anchor_text: str = KVC_PRICING_PLACEHOLDER) -> bool:
    """Insert KVC pricing table at the {{tien_ban_quyen}} placeholder.

    Supports both VCPMC_TARIFF (5-column) and ND17 (3-column) modes.

    Args:
        docx_path: Path to the DOCX file.
        render_ctx: Context containing pricing data.
        anchor_text: Anchor text to find and replace.

    Returns:
        True if insertion successful, False otherwise.
    """
    parsed = _parse_kvc_pricing_block(render_ctx)
    method = str(parsed.get("method") or "VCPMC_TARIFF").upper()
    detail_rows = parsed.get("detail_rows") or []
    summary_rows = parsed.get("summary_rows") or []
    words_line = str(parsed.get("words_line") or "").strip()
    footer_note = str(parsed.get("footer_note") or "").strip()

    if not detail_rows and not summary_rows and not words_line:
        logger.warning("KVC pricing: no data to insert")
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

    def _apply_run_style(rpr: etree._Element, *, bold: bool, italic: bool, red: bool = False) -> None:
        rfonts = etree.SubElement(rpr, f"{w}rFonts")
        rfonts.set(f"{w}ascii", "Times New Roman")
        rfonts.set(f"{w}hAnsi", "Times New Roman")
        rfonts.set(f"{w}cs", "Times New Roman")
        sz = etree.SubElement(rpr, f"{w}sz")
        sz.set(f"{w}val", "24")
        szcs = etree.SubElement(rpr, f"{w}szCs")
        szcs.set(f"{w}val", "24")
        if bold:
            etree.SubElement(rpr, f"{w}b")
            etree.SubElement(rpr, f"{w}bCs")
        if italic:
            etree.SubElement(rpr, f"{w}i")
            etree.SubElement(rpr, f"{w}iCs")
        if red:
            c = etree.SubElement(rpr, f"{w}color")
            c.set(f"{w}val", "FF0000")

    def _set_cell_margin(tcpr: etree._Element, *, top: int = 70, right: int = 90, bottom: int = 70, left: int = 90) -> None:
        tc_mar = etree.SubElement(tcpr, f"{w}tcMar")
        for side, amount in (("top", top), ("right", right), ("bottom", bottom), ("left", left)):
            n = etree.SubElement(tc_mar, f"{w}{side}")
            n.set(f"{w}w", str(amount))
            n.set(f"{w}type", "dxa")

    def _mk_p(text: str, *, center: bool = False, right: bool = False, bold: bool = False, italic: bool = False, red: bool = False) -> etree._Element:
        p = etree.Element(f"{w}p")
        ppr = etree.SubElement(p, f"{w}pPr")
        spacing = etree.SubElement(ppr, f"{w}spacing")
        spacing.set(f"{w}before", "0")
        spacing.set(f"{w}after", "0")
        spacing.set(f"{w}line", "260")
        spacing.set(f"{w}lineRule", "auto")
        if center:
            jc = etree.SubElement(ppr, f"{w}jc")
            jc.set(f"{w}val", "center")
        elif right:
            jc = etree.SubElement(ppr, f"{w}jc")
            jc.set(f"{w}val", "right")
        r = etree.SubElement(p, f"{w}r")
        rpr = etree.SubElement(r, f"{w}rPr")
        _apply_run_style(rpr, bold=bold, italic=italic)
        if red:
            clr = etree.SubElement(rpr, f"{w}color")
            clr.set(f"{w}val", "FF0000")
        t = etree.SubElement(r, f"{w}t")
        t.text = _decode_mojibake_text(text)
        return p

    def _make_tc(
        text: str = "",
        *,
        center: bool = True,
        right: bool = False,
        bold: bool = False,
        italic: bool = False,
        shade_header: bool = False,
        grid_span: int | None = None,
        red: bool = False,
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
        tc.append(_mk_p(text, center=center, right=right, bold=bold, italic=italic, red=red))
        return tc

    def _make_tr(cells: list) -> etree._Element:
        tr = etree.Element(f"{w}tr")
        for c in cells:
            tr.append(c)
        return tr

    if method == "VCPMC_TARIFF" or method == "LEGACY":
        col_widths = [1800, 1300, 1850, 3500, 1750]
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
        for width in col_widths:
            gc = etree.SubElement(grid, f"{w}gridCol")
            gc.set(f"{w}w", str(width))

        tbl.append(_make_tr([
            _make_tc("Địa Điểm", bold=True, shade_header=True),
            _make_tc("Diện\nTích", bold=True, shade_header=True),
            _make_tc("Đơn Vị Tính", bold=True, shade_header=True),
            _make_tc("Mức Tiền Bản Quyền\nChưa Thuế Gtgt (Vnđ)", bold=True, shade_header=True),
            _make_tc("Thành\nTiền\n(Vnđ)", bold=True, shade_header=True),
        ]))

        for row in detail_rows:
            tbl.append(_make_tr([
                _make_tc(str(row.get("unit") or ""), center=False),
                _make_tc(str(row.get("area") or ""), center=False),
                _make_tc(str(row.get("formula") or ""), center=False),
                _make_tc(str(row.get("amount") or ""), right=True),
                _make_tc(_normalize_amount_text(row.get("amount")), right=True),
            ]))

        for row in summary_rows:
            label = str(row.get("label") or "")
            amount = str(row.get("amount") or "")
            is_primary = bool(row.get("primary"))
            tbl.append(_make_tr([
                _make_tc(label, right=True, bold=is_primary, grid_span=4),
                _make_tc(_normalize_amount_text(amount), right=True, bold=is_primary),
            ]))

    else:
        col_widths = [1450, 6650, 2100]
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
        for width in col_widths:
            gc = etree.SubElement(grid, f"{w}gridCol")
            gc.set(f"{w}w", str(width))

        tbl.append(_make_tr([
            _make_tc("Diện tích", bold=True, shade_header=True),
            _make_tc("Mức tiền bản quyền chưa bao gồm thuế GTGT", bold=True, shade_header=True),
            _make_tc("Thành tiền\n(đồng)", bold=True, italic=True, shade_header=True),
        ]))

        tbl.append(_make_tr([
            _make_tc("", shade_header=True),
            _make_tc("(Số tiền bản quyền chi trả (tính theo năm) = Mức lương cơ sở x Hệ số điều chỉnh)", center=True, italic=True, shade_header=True),
            _make_tc("", shade_header=True),
        ]))

        for row in detail_rows:
            tbl.append(_make_tr([
                _make_tc(str(row.get("area_text") or ""), center=False),
                _make_tc(str(row.get("formula") or ""), center=False),
                _make_tc(_normalize_amount_text(row.get("amount")), right=True),
            ]))

        for row in summary_rows:
            label = str(row.get("label") or "")
            amount = str(row.get("amount") or "")
            is_primary = bool(row.get("primary"))
            red = "mức hỗ" in label.lower() or "%" in amount
            tbl.append(_make_tr([
                _make_tc(label, right=True, bold=is_primary, grid_span=2),
                _make_tc(_normalize_amount_text(amount), right=True, bold=is_primary, red=red),
            ]))

    if words_line:
        col_span = 5 if method in ("VCPMC_TARIFF", "LEGACY") else 3
        tbl.append(_make_tr([_make_tc(words_line, center=True, italic=True, grid_span=col_span)]))

    if footer_note:
        col_span = 5 if method in ("VCPMC_TARIFF", "LEGACY") else 3
        tbl.append(_make_tr([_make_tc(footer_note, center=True, italic=True, grid_span=col_span)]))

    parent.insert(idx, tbl)
    parent.remove(anchor_p)

    out_xml = etree.tostring(root, encoding="utf-8", xml_declaration=True)
    with zipfile.ZipFile(docx_path, "w") as zout:
        zout.writestr("word/document.xml", out_xml)
        for item, data in other_items:
            zout.writestr(item, data)

    return True


def _parse_kvc_pricing_block(render_ctx: dict) -> dict:
    """Parse KVC pricing context into structured format for rendering.

    Args:
        render_ctx: Context dictionary with pricing data.

    Returns:
        Structured dict with detail_rows, summary_rows, method, words_line, footer_note.
    """
    pricing_block = render_ctx.get("background_pricing_block") or {}
    method = str(render_ctx.get("background_pricing_method") or pricing_block.get("pricing_mode") or "VCPMC_TARIFF").upper()
    if method not in {"VCPMC_TARIFF", "ND17", "LEGACY"}:
        method = "VCPMC_TARIFF"

    area_label = ""
    raw_area = str(render_ctx.get("background_area_m2") or render_ctx.get("tong_dien_tich") or "").strip()
    raw_area = _decode_mojibake_text(raw_area)
    if raw_area:
        area_label = raw_area if "m" in raw_area.lower() else f"{raw_area} m²"
    else:
        area_label = "0 m²"

    detail_rows: list[dict] = []
    summary_rows: list[dict] = []

    pricing_rows = pricing_block.get("rows") or []
    for row in pricing_rows:
        if isinstance(row, (list, tuple)):
            if len(row) >= 4:
                detail_rows.append({
                    "area": str(row[1] if len(row) > 1 else ""),
                    "unit": str(row[0] if len(row) > 0 else ""),
                    "formula": str(row[2] if len(row) > 2 else ""),
                    "amount": str(row[3] if len(row) > 3 else ""),
                })
            elif len(row) >= 2:
                detail_rows.append({
                    "area": "",
                    "unit": str(row[0]),
                    "formula": "",
                    "amount": str(row[1]),
                })

    summary_data = pricing_block.get("summary_rows") or []
    for row in summary_data:
        if isinstance(row, (list, tuple)) and len(row) >= 2:
            label = str(row[0] or "")
            amount = str(row[1] or "")
            normalized_label = re.sub(r"[^a-zA-Z0-9]", "", label.lower())
            is_total = "tonggia" in normalized_label
            summary_rows.append({
                "label": label,
                "amount": amount,
                "primary": is_total,
            })

    words_line = str(render_ctx.get("amount_in_words") or render_ctx.get("pricing_total_text") or "").strip()
    if words_line and "(" in words_line:
        for part in words_line.split("\n"):
            if "bằng" in part.lower() or "bang chu" in part.lower():
                words_line = part.strip()
                break

    footer_note = str(render_ctx.get("kvc_pricing_footer_note") or "").strip()
    if not footer_note and method == "ND17":
        base_salary = str(render_ctx.get("muc_luong_co_so") or "2,530,000").strip()
        footer_note = (
            f"Mức lương cơ sở {base_salary}đ có thời hạn bắt đầu từ ngày 1/7/2026 "
            f"áp dụng khoản 2 Điều 3 Nghị định 161/2026/NĐ-CP ngày 15/5/2026"
        )

    return {
        "method": method,
        "area_label": area_label,
        "detail_rows": detail_rows,
        "summary_rows": summary_rows,
        "words_line": words_line,
        "footer_note": footer_note,
    }
