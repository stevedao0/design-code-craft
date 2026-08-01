"""Unified Background DOCX block renderer for all non-Karaoke Background domains.

This renderer provides a domain-agnostic approach to inserting music usage areas
tables into Background contract DOCX templates.

Supported domains:
- CAFE (Cà phê)
- NHA_HANG (Nhà hàng)
- CHAM_SOC_SUC_KHOE (Chăm sóc sức khỏe)
- KHU_VUI_CHOI (Khu vui chơi) - uses this for music areas, but KVC has its own renderer
- All other Background domains with Background templates

Key behaviors:
1. {{khu_vuc_su_dung_nhac}} → 3-column music usage areas table (if placeholder exists)
2. {{tien_ban_quyen}} → PRESERVED (never rendered, user fills manually)
3. All other text placeholders → normal docxtpl rendering

Template compatibility:
- Templates WITH {{khu_vuc_su_dung_nhac}}: render table at this placeholder
- Templates WITHOUT {{khu_vuc_su_dung_nhac}}: skip table rendering, preserve text
"""
from __future__ import annotations

import json
import logging
import re
import zipfile
from pathlib import Path
from typing import Any

from lxml import etree

from app.docx_helpers.validation import (
    validate_docx_can_open,
    validate_and_save_debug_copy,
)

logger = logging.getLogger("uvicorn.error")

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}


def _resolve_money_values(row: Any) -> dict:
    """Resolve royalty money values from a contract row.

    Priority:
    1. Model fields royalty_amount_before_vat / vat_amount / royalty_amount_after_vat
    2. Legacy DB columns amount_before_vat / amount_after_vat (vat_amount = after - before)

    Returns dict with keys: before_vat, vat_amount, after_vat (all int or None).
    """
    def _get(field: str) -> int | None:
        val = getattr(row, field, None)
        if val is None:
            return None
        try:
            return int(val)
        except (TypeError, ValueError):
            return None

    before_vat = _get("royalty_amount_before_vat")
    after_vat = _get("royalty_amount_after_vat")
    vat_amount = _get("vat_amount")

    if before_vat is None:
        before_vat = _get("amount_before_vat")
    if after_vat is None:
        after_vat = _get("amount_after_vat")
    if vat_amount is None and before_vat is not None and after_vat is not None:
        vat_amount = after_vat - before_vat

    return {
        "before_vat": before_vat,
        "vat_amount": vat_amount,
        "after_vat": after_vat,
    }


def _format_money_vnd(amount: int | None) -> str:
    """Format integer as Vietnamese VND with dot separators."""
    if amount is None:
        return ""
    return f"{int(amount):,}".replace(",", ".")


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


def _docx_has_placeholder(docx_path: Path, placeholder: str) -> bool:
    """Check if a DOCX template has a specific placeholder."""
    try:
        with zipfile.ZipFile(docx_path, "r") as zf:
            xml = zf.read("word/document.xml").decode("utf-8", errors="ignore")
        return placeholder in xml
    except Exception:
        return False


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


def _resolve_area_display_name(area: dict | Any) -> str:
    """Resolve the display name for a music usage area row.

    Logic (theo nghiệp vụ):
    - Nếu user đã nhập pricing_label → dùng pricing_label.
    - Ngược lại fallback về area_name.
    - Luôn trả về str không rỗng (fallback cuối là '-').

    pricing_label CHỈ dùng để hiển thị/in ấn — không ảnh hưởng công thức tính tiền.
    """
    raw_label = ""
    raw_area = ""
    try:
        raw_label = str(area.get("pricing_label") or "").strip()
    except Exception:
        raw_label = ""
    try:
        raw_area = str(area.get("area_name") or "").strip()
    except Exception:
        raw_area = ""
    if raw_label:
        return raw_label
    if raw_area:
        return raw_area
    return "-"


def _build_music_usage_rows(render_ctx: dict) -> list[dict]:
    """Build music usage area rows from render context.

    Args:
        render_ctx: Context dictionary with music_usage_areas or background data.

    Returns:
        List of row dicts with area_name, scale_description, music_usage_type keys.
    """
    import logging as _log

    rows: list[dict] = []

    # Priority 1: music_usage_areas (Phase 2 - new contracts)
    music_areas = render_ctx.get("music_usage_areas") or []
    if isinstance(music_areas, str):
        try:
            music_areas = json.loads(music_areas)
        except Exception:
            music_areas = []

    if music_areas and isinstance(music_areas, list) and len(music_areas) > 0:
        _log.getLogger("background_renderer").debug(
            f"[WORD_EXPORT_AREAS] source=music_usage_areas, count={len(music_areas)}"
        )
        for area in music_areas:
            rows.append({
                "area_name": _resolve_area_display_name(area),
                "scale_description": str(area.get("scale_description") or ""),
                "music_usage_type": str(area.get("music_usage_type") or ""),
            })
        return rows

    # Priority 2: Fallback to background data
    location = _decode_mojibake_text(
        str(render_ctx.get("BANG_HIEU") or render_ctx.get("ten_bang_hieu") or
            render_ctx.get("business_name") or "")
    ).strip()
    area_text = _decode_mojibake_text(
        str(render_ctx.get("background_area_m2") or render_ctx.get("tong_dien_tich") or "")
    ).strip()
    if area_text and "m" not in area_text.lower():
        area_text = f"{area_text} m²"
    if location or area_text:
        rows.append({
            "area_name": location or "-",
            "scale_description": area_text or "-",
            "music_usage_type": "Nhạc nền",
        })
        _log.getLogger("background_renderer").debug(
            f"[WORD_EXPORT_AREAS] source=legacy_fallback, count={len(rows)}"
        )

    return rows


def _insert_music_usage_table_at_anchor(
    *,
    docx_path: Path,
    render_ctx: dict,
    anchor_text: str = "{{khu_vuc_su_dung_nhac}}",
) -> tuple[bool, list[str]]:
    """Insert music usage areas table at the anchor placeholder.

    Args:
        docx_path: Path to the DOCX file.
        render_ctx: Context containing music_usage_areas.
        anchor_text: Anchor text to find and replace.

    Returns:
        Tuple of (success, warnings).
    """
    warnings: list[str] = []
    rows = _build_music_usage_rows(render_ctx)

    if not rows:
        warnings.append("No music usage areas to insert")
        return False, warnings

    try:
        with zipfile.ZipFile(docx_path, "r") as zin:
            xml_bytes = zin.read("word/document.xml")
            other_items = [
                (item, zin.read(item.filename))
                for item in zin.infolist()
                if item.filename != "word/document.xml"
            ]
    except Exception as e:
        warnings.append(f"Failed to read DOCX: {e}")
        return False, warnings

    parser = etree.XMLParser(recover=True, huge_tree=True)
    root = etree.fromstring(xml_bytes, parser=parser)

    anchor_p = _find_anchor_paragraph(root, anchor_text)
    if anchor_p is None:
        warnings.append(f"Anchor '{anchor_text}' not found in document")
        return False, warnings

    parent = anchor_p.getparent()
    if parent is None:
        warnings.append("Anchor paragraph has no parent")
        return False, warnings
    idx = parent.index(anchor_p)

    w = f"{{{W_NS}}}"

    def _apply_run_style(rpr: etree._Element, *, bold: bool = False, italic: bool = False) -> None:
        """Apply standard run properties."""
        rfonts = etree.SubElement(rpr, f"{w}rFonts")
        rfonts.set(f"{w}ascii", "Times New Roman")
        rfonts.set(f"{w}hAnsi", "Times New Roman")
        rfonts.set(f"{w}cs", "Times New Roman")
        sz = etree.SubElement(rpr, f"{w}sz")
        sz.set(f"{w}val", "26")
        szcs = etree.SubElement(rpr, f"{w}szCs")
        szcs.set(f"{w}val", "26")
        if bold:
            etree.SubElement(rpr, f"{w}b")
            etree.SubElement(rpr, f"{w}bCs")
        if italic:
            etree.SubElement(rpr, f"{w}i")
            etree.SubElement(rpr, f"{w}iCs")

    def _make_p(text: str, *, center: bool = False, bold: bool = False, italic: bool = False) -> etree._Element:
        """Create a paragraph element."""
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
        r = etree.SubElement(p, f"{w}r")
        rpr = etree.SubElement(r, f"{w}rPr")
        _apply_run_style(rpr, bold=bold, italic=italic)
        t = etree.SubElement(r, f"{w}t")
        t.text = _decode_mojibake_text(text)
        return p

    def _make_tc(
        text: str = "",
        *,
        center: bool = False,
        bold: bool = False,
        italic: bool = False,
        shade_header: bool = False,
    ) -> etree._Element:
        """Create a table cell element."""
        tc = etree.Element(f"{w}tc")
        tcpr = etree.SubElement(tc, f"{w}tcPr")

        # Cell margins
        tc_mar = etree.SubElement(tcpr, f"{w}tcMar")
        for side, amount in (("top", 70), ("right", 90), ("bottom", 70), ("left", 90)):
            n = etree.SubElement(tc_mar, f"{w}{side}")
            n.set(f"{w}w", str(amount))
            n.set(f"{w}type", "dxa")

        # Header shading
        if shade_header:
            shd = etree.SubElement(tcpr, f"{w}shd")
            shd.set(f"{w}val", "clear")
            shd.set(f"{w}color", "auto")
            shd.set(f"{w}fill", "D9D9D9")

        # Vertical alignment
        v = etree.SubElement(tcpr, f"{w}vAlign")
        v.set(f"{w}val", "center")

        tc.append(_make_p(text, center=center, bold=bold, italic=italic))
        return tc

    def _make_tr(cells: list) -> etree._Element:
        """Create a table row element."""
        tr = etree.Element(f"{w}tr")
        for c in cells:
            tr.append(c)
        return tr

    # Build table
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
        b.set(f"{w}space", "0")
        b.set(f"{w}color", "000000")
    tblw = etree.SubElement(tblpr, f"{w}tblW")
    tblw.set(f"{w}type", "pct")
    tblw.set(f"{w}w", "5000")
    grid = etree.SubElement(tbl, f"{w}tblGrid")
    for width in col_widths:
        gc = etree.SubElement(grid, f"{w}gridCol")
        gc.set(f"{w}w", str(width))

    # Header row
    tbl.append(_make_tr([
        _make_tc("Vị trí / khu vực sử dụng âm nhạc", center=True, bold=True, shade_header=True),
        _make_tc("Quy mô, sức chứa", center=True, bold=True, shade_header=True),
        _make_tc("Hình thức sử dụng âm nhạc", center=True, bold=True, shade_header=True),
    ]))

    # Data rows
    for row in rows:
        tbl.append(_make_tr([
            _make_tc(str(row.get("area_name") or "")),
            _make_tc(str(row.get("scale_description") or ""), center=True),
            _make_tc(str(row.get("music_usage_type") or ""), center=True),
        ]))

    # Insert table and remove anchor paragraph
    parent.insert(idx, tbl)
    parent.remove(anchor_p)

    out_xml = etree.tostring(root, encoding="utf-8", xml_declaration=True)
    with zipfile.ZipFile(docx_path, "w") as zout:
        zout.writestr("word/document.xml", out_xml)
        for item, data in other_items:
            zout.writestr(item.filename, data)

    logger.info(f"[BACKGROUND_RENDERER] Inserted music usage table with {len(rows)} rows")
    return True, warnings


def _insert_royalty_text_at_anchor(
    *,
    docx_path: Path,
    money: dict,
    anchor_text: str,
) -> tuple[bool, list[str]]:
    """Replace a money placeholder anchor with 3 lines of formatted text.

    Lines produced:
      Tiền bản quyền trước thuế: <before_vat> VNĐ
      Thuế GTGT 8%: <vat> VNĐ
      Tổng cộng sau thuế: <after_vat> VNĐ
    """
    warnings: list[str] = []
    before_vat = money.get("before_vat")
    vat_amount = money.get("vat_amount")
    after_vat = money.get("after_vat")

    if before_vat is None and after_vat is None:
        warnings.append("No money values available; royalty block not inserted.")
        return False, warnings

    try:
        with zipfile.ZipFile(docx_path, "r") as zin:
            xml_bytes = zin.read("word/document.xml")
            other_items = [
                (item, zin.read(item.filename))
                for item in zin.infolist()
                if item.filename != "word/document.xml"
            ]
    except Exception as e:
        warnings.append(f"Failed to read DOCX: {e}")
        return False, warnings

    parser = etree.XMLParser(recover=True, huge_tree=True)
    root = etree.fromstring(xml_bytes, parser=parser)

    anchor_p = _find_anchor_paragraph(root, anchor_text)
    if anchor_p is None:
        warnings.append(f"Royalty anchor '{anchor_text}' not found")
        return False, warnings

    parent = anchor_p.getparent()
    if parent is None:
        return False, warnings
    idx = parent.index(anchor_p)

    w = f"{{{W_NS}}}"

    def _apply_run_style(rpr: etree._Element) -> None:
        rfonts = etree.SubElement(rpr, f"{w}rFonts")
        rfonts.set(f"{w}ascii", "Times New Roman")
        rfonts.set(f"{w}hAnsi", "Times New Roman")
        rfonts.set(f"{w}cs", "Times New Roman")
        sz = etree.SubElement(rpr, f"{w}sz")
        sz.set(f"{w}val", "26")
        szcs = etree.SubElement(rpr, f"{w}szCs")
        szcs.set(f"{w}val", "26")

    def _make_p(text: str) -> etree._Element:
        p = etree.Element(f"{w}p")
        ppr = etree.SubElement(p, f"{w}pPr")
        spacing = etree.SubElement(ppr, f"{w}spacing")
        spacing.set(f"{w}before", "0")
        spacing.set(f"{w}after", "0")
        spacing.set(f"{w}line", "300")
        spacing.set(f"{w}lineRule", "auto")
        r = etree.SubElement(p, f"{w}r")
        rpr = etree.SubElement(r, f"{w}rPr")
        _apply_run_style(rpr)
        t = etree.SubElement(r, f"{w}t")
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        t.text = _decode_mojibake_text(text)
        return p

    lines = [
        f"Tiền bản quyền trước thuế: {_format_money_vnd(before_vat)} VNĐ",
        f"Thuế GTGT 8%: {_format_money_vnd(vat_amount)} VNĐ",
        f"Tổng cộng sau thuế: {_format_money_vnd(after_vat)} VNĐ",
    ]

    for i, line in enumerate(lines):
        parent.insert(idx + i, _make_p(line))
    parent.remove(anchor_p)

    out_xml = etree.tostring(root, encoding="utf-8", xml_declaration=True)
    with zipfile.ZipFile(docx_path, "w") as zout:
        zout.writestr("word/document.xml", out_xml)
        for item, data in other_items:
            zout.writestr(item.filename, data)

    logger.info(f"[BACKGROUND_RENDERER] Inserted royalty block at '{anchor_text}'")
    return True, warnings


def render_background_contract(
    *,
    template_path: Path,
    output_path: Path,
    context: dict,
    render_ctx: dict | None = None,
    money: dict | None = None,
) -> dict:
    """Unified renderer for all Background contract DOCX templates.

    This function:
    1. Renders text placeholders using docxtpl
    2. If template has {{khu_vuc_su_dung_nhac}}: inserts music usage table
    3. If template has {{bang_tinh_tien_ban_quyen}} or {{tien_ban_quyen}}: inserts royalty text block
    4. Validates output DOCX

    Args:
        template_path: Path to the DOCX template.
        output_path: Path for the rendered DOCX output.
        context: Context for text placeholder rendering.
        render_ctx: Context for block insertion (music_usage_areas, etc).
        money: Dict with before_vat/vat_amount/after_vat for royalty text block.

    Returns:
        Dict with render status.
    """
    from app.renderers.text_renderer import render_docx_text

    warnings: list[str] = []

    # Merge contexts
    full_ctx = dict(context)
    if render_ctx:
        full_ctx.update(render_ctx)

    # Check if template has music usage placeholder
    has_music_placeholder = _docx_has_placeholder(template_path, "{{khu_vuc_su_dung_nhac}}")

    # Check royalty placeholders
    has_bang_tinh = _docx_has_placeholder(template_path, "{{bang_tinh_tien_ban_quyen}}")
    has_tien_placeholder = _docx_has_placeholder(template_path, "{{tien_ban_quyen}}")

    if has_bang_tinh and money is None:
        money = render_ctx.get("money") if render_ctx else None

    # Pass sentinel so docxtpl does not delete the anchor (we will replace it post-render).
    if has_bang_tinh:
        full_ctx["bang_tinh_tien_ban_quyen"] = "__ROYALTY_TABLE__"
    if has_tien_placeholder:
        full_ctx["tien_ban_quyen"] = "__ROYALTY_BLOCK__"

    if not has_music_placeholder:
        logger.info(
            f"[BACKGROUND_RENDERER] Template {template_path.name} has no "
            "{{khu_vuc_su_dung_nhac}} - skipping music table insertion"
        )
        warnings.append(
            f"Template {template_path.name} does not have {{khu_vuc_su_dung_nhac}} placeholder. "
            "Music usage table not inserted."
        )

    # Step 1: Render text placeholders
    try:
        render_docx_text(
            template_path=template_path,
            output_path=output_path,
            context=full_ctx,
        )
        warnings.append("Text placeholders rendered successfully.")
    except Exception as e:
        logger.exception(f"[BACKGROUND_RENDERER] Text render failed: {e}")
        return {
            "ok": False,
            "docx_path": str(output_path),
            "music_table_inserted": False,
            "royalty_block_inserted": False,
            "validation_passed": False,
            "warnings": warnings + [f"Text render failed: {e}"],
        }

    # Step 2: Insert music usage table if placeholder exists
    # IMPORTANT: After docxtpl renders, {{khu_vuc_su_dung_nhac}} is replaced with
    # the sentinel __KARAOKE_ROOM_BLOCK__. We need to find the SENTINEL, not the original placeholder.
    music_table_inserted = False
    if has_music_placeholder and render_ctx:
        from app.services.placeholder_registry import KHU_VUC_SU_DUNG_NHAC
        sentinel_anchor = KHU_VUC_SU_DUNG_NHAC.sentinel  # "__KARAOKE_ROOM_BLOCK__"
        success, insert_warnings = _insert_music_usage_table_at_anchor(
            docx_path=output_path,
            render_ctx=full_ctx,
            anchor_text=sentinel_anchor,  # Use sentinel, not original placeholder
        )
        music_table_inserted = success
        warnings.extend(insert_warnings)

    # Step 3: Insert royalty text block if template has the placeholder
    royalty_block_inserted = False
    royalty_anchor = None
    if has_bang_tinh:
        royalty_anchor = "__ROYALTY_TABLE__"
    elif has_tien_placeholder:
        royalty_anchor = "__ROYALTY_BLOCK__"

    if royalty_anchor and money:
        success, insert_warnings = _insert_royalty_text_at_anchor(
            docx_path=output_path,
            money=money,
            anchor_text=royalty_anchor,
        )
        royalty_block_inserted = success
        warnings.extend(insert_warnings)

    # Step 4: Validate output DOCX
    is_valid, error_msg = validate_docx_can_open(output_path)
    if not is_valid:
        logger.error(f"[BACKGROUND_RENDERER] Validation failed: {error_msg}")
        debug_path = validate_and_save_debug_copy(output_path)
        return {
            "ok": False,
            "docx_path": str(output_path),
            "docx_debug_copy": str(debug_path) if debug_path else None,
            "music_table_inserted": music_table_inserted,
            "royalty_block_inserted": royalty_block_inserted,
            "validation_passed": False,
            "warnings": warnings + [
                f"VALIDATION FAILED: {error_msg}",
                "File may be corrupted. Debug copy saved." if debug_path else "",
            ],
        }

    warnings.append("DOCX validation passed - file can be opened by Word.")

    return {
        "ok": True,
        "docx_path": str(output_path),
        "music_table_inserted": music_table_inserted,
        "royalty_block_inserted": royalty_block_inserted,
        "validation_passed": True,
        "warnings": warnings,
    }
