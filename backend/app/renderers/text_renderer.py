"""DOCX text placeholder rendering infrastructure (docxtpl + template repair).

This module provides text placeholder rendering for DOCX templates using docxtpl.
Derived from OLD APP: F:\VCPMC\APPS\contract\api\domains\common\renderers\docx\text_renderer.py
"""
from __future__ import annotations

import logging
import re
import tempfile
import zipfile
from pathlib import Path

from docxtpl import DocxTemplate, RichText

from app.renderers.karaoke_renderer import _decode_mojibake_text

logger = logging.getLogger("uvicorn.error")


def _repair_split_jinja_tags(xml_text: str) -> str:
    """Repair Word-inserted breaks/tabs inside Jinja tags that break docxtpl parsing."""

    def _fix_segment(seg: str) -> str:
        seg = re.sub(r"<w:proofErr[^>]*/>", "", seg)
        seg = re.sub(r"<w:(?:br|cr|tab)\b[^>]*/>", "", seg)
        seg = re.sub(
            r"</w:t>\s*</w:r>\s*(?:</w:proofErr>)?\s*<w:r[^>]*>\s*(?:<w:rPr>.*?</w:rPr>)?\s*<w:t[^>]*>",
            "",
            seg,
            flags=re.DOTALL,
        )
        seg = re.sub(
            r"</w:t>\s*</w:r>\s*<w:r[^>]*>\s*(?:<w:rPr>.*?</w:rPr>)?\s*<w:t[^>]*>",
            "",
            seg,
            flags=re.DOTALL,
        )
        return seg

    for pat in [
        re.compile(r"\{\%.*?\%\}", re.DOTALL),
        re.compile(r"\{\{.*?\}\}", re.DOTALL),
    ]:
        while True:
            m = pat.search(xml_text)
            if not m:
                break
            raw = m.group(0)
            fixed = _fix_segment(raw)
            if fixed == raw:
                break
            xml_text = xml_text[: m.start()] + fixed + xml_text[m.end() :]

    return xml_text


def _repair_khu_vuc_placeholder(xml_text: str) -> str:
    """Repair split khu_vuc_su_dung_nhac placeholder in the Karaoke template.

    The template has the placeholder split across multiple XML elements:
    <w:t>{{</w:t></w:r><w:r><w:rPr>...<w:t>khu</w:t></w:r><w:r>...<w:t>_</w:t></w:r>...
    <w:t>vuc_su_dung_nhac</w:t></w:r><w:r>...<w:t>}}</w:t>

    We need to replace this with a single element: <w:t>{{khu_vuc_su_dung_nhac}}</w:t>
    """
    # The exact sequence from the Karaoke template
    old_seq = (
        '<w:t>{{</w:t></w:r><w:r><w:rPr><w:iCs/><w:color w:val="EE0000"/>'
        '<w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t>khu</w:t></w:r>'
        '<w:r w:rsidRPr="00E46B63"><w:rPr><w:iCs/><w:color w:val="EE0000"/>'
        '<w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t>_</w:t></w:r>'
        '<w:r><w:rPr><w:iCs/><w:color w:val="EE0000"/>'
        '<w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t>vuc_su_dung_nhac</w:t></w:r>'
        '<w:r w:rsidRPr="00E46B63"><w:rPr><w:iCs/><w:color w:val="EE0000"/>'
        '<w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t>}}</w:t>'
    )
    new_seq = '<w:t>{{khu_vuc_su_dung_nhac}}</w:t>'
    if old_seq in xml_text:
        xml_text = xml_text.replace(old_seq, new_seq)
    return xml_text


def _repair_tien_ban_placeholder(xml_text: str) -> str:
    """Repair split tien_ban_quyen placeholder in the template.

    The template has the placeholder split across multiple XML elements.
    """
    old_seq = (
        '<w:t>{{</w:t></w:r><w:r><w:rPr><w:iCs/><w:color w:val="EE0000"/>'
        '<w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t>tien_ban_quyen</w:t></w:r>'
        '<w:r w:rsidRPr="00E46B63"><w:rPr><w:iCs/><w:color w:val="EE0000"/>'
        '<w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t>}}</w:t>'
    )
    new_seq = '<w:t>{{tien_ban_quyen}}</w:t>'
    if old_seq in xml_text:
        xml_text = xml_text.replace(old_seq, new_seq)
    return xml_text


def _repair_dia_chi_kinh_doanh_placeholder(xml_text: str) -> str:
    """Repair split dia_chi_kinh_doanh placeholder in the Karaoke template.

    The template has the placeholder split across three XML runs:
    <w:t>dia_chi</w:t> + <w:t>_kinh_doanh</w:t> + <w:t>}}</w:t>

    We need to replace this with a single element: <w:t>{{dia_chi_kinh_doanh}}</w:t>
    """
    old_seq = (
        '<w:t>dia_chi</w:t></w:r><w:r><w:rPr><w:iCs/><w:color w:val="EE0000"/>'
        '<w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t>_kinh_doanh</w:t></w:r>'
        '<w:r><w:rPr><w:iCs/><w:color w:val="EE0000"/>'
        '<w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t>}}</w:t>'
    )
    new_seq = '<w:t>{{dia_chi_kinh_doanh}}</w:t>'
    if old_seq in xml_text:
        xml_text = xml_text.replace(old_seq, new_seq)
        return xml_text

    # The real Karaoke template injects proofErr tags between the split runs.
    # Repair only the paragraph that contains _kinh_doanh; a document-wide
    # regex can accidentally consume the previous {{ung_dung}} placeholder.
    paragraph_pattern = re.compile(r"<w:p\b[^>]*>.*?</w:p>", flags=re.DOTALL)
    split_placeholder = re.compile(
        r"(<w:r\b[^>]*>\s*(?:<w:rPr>.*?</w:rPr>)?)\s*<w:t>\{\{</w:t>\s*</w:r>"
        r"(?:\s*<w:proofErr\b[^>]*/>)*"
        r"\s*<w:r\b[^>]*>\s*(?:<w:rPr>.*?</w:rPr>)?\s*<w:t>dia_chi</w:t>\s*</w:r>"
        r"(?:\s*<w:proofErr\b[^>]*/>)*"
        r"\s*<w:r\b[^>]*>\s*(?:<w:rPr>.*?</w:rPr>)?\s*<w:t>_kinh_doanh</w:t>\s*</w:r>"
        r"(?:\s*<w:proofErr\b[^>]*/>)*"
        r"\s*<w:r\b[^>]*>\s*(?:<w:rPr>.*?</w:rPr>)?\s*<w:t>\}\}</w:t>\s*</w:r>",
        flags=re.DOTALL,
    )

    def _repair_paragraph(match: re.Match[str]) -> str:
        paragraph = match.group(0)
        if "_kinh_doanh" not in paragraph or "dia_chi" not in paragraph:
            return paragraph
        return split_placeholder.sub(r"\1<w:t>{{dia_chi_kinh_doanh}}</w:t></w:r>", paragraph)

    xml_text = paragraph_pattern.sub(_repair_paragraph, xml_text)
    return xml_text


def _repair_common_channel_loop_glitches(xml_text: str) -> str:
    """Normalize badly-copied loop tags for channels table (SCTT only)."""
    xml_text = re.sub(
        r"\{%\s*for\s+channels\s*%\}",
        r"{% for ch in channels %}",
        xml_text,
        flags=re.IGNORECASE,
    )
    xml_text = re.sub(
        r"\{%\s*for\s+ch\s+channels\s*%\}",
        r"{% for ch in channels %}",
        xml_text,
        flags=re.IGNORECASE,
    )

    def _inject_link_if_missing(m: re.Match[str]) -> str:
        block = m.group(0)
        if re.search(r"ch\s*\.\s*link", block):
            return block
        block = re.sub(r"\{\{\s*(?=\{%\s*endfor\s*%\})", "", block, flags=re.IGNORECASE)
        block = re.sub(
            r"(\{%\s*endfor\s*%\})",
            r"{{ ch.link }}\1",
            block,
            count=1,
            flags=re.IGNORECASE,
        )
        return block

    xml_text = re.sub(
        r"\{%\s*for\s+ch\s+in\s+channels\s*\%\}[\s\S]*?\{%\s*endfor\s*%\}",
        _inject_link_if_missing,
        xml_text,
        flags=re.IGNORECASE,
    )

    def _fix_channels_tr(m: re.Match[str]) -> str:
        tr = m.group(0)
        if re.search(r"ch\s*\.\s*link", tr):
            return tr
        if not re.search(r"ch\s*\.\s*ten", tr):
            return tr
        tr2, n = re.subn(
            r"(\{%\s*endfor\s*%\})",
            r"{{ ch.link }}\1",
            tr,
            count=1,
            flags=re.IGNORECASE,
        )
        if n:
            return tr2
        return re.sub(r"\{\{\s*(?=\{%\s*endfor\s*%\})", "", tr, flags=re.IGNORECASE)

    xml_text = re.sub(
        r"<w:tr[\s\S]*?\{%\s*for\s+ch\s+in\s+channels\s*%\}[\s\S]*?</w:tr>",
        _fix_channels_tr,
        xml_text,
        flags=re.IGNORECASE,
    )
    return xml_text


def _repair_template_placeholders(*, template_path: Path) -> Path:
    """Repair known malformed placeholders introduced by template conversion."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="docx_tpl_repair_"))
    out_path = tmp_dir / template_path.name

    patterns: list[tuple[re.Pattern[str], str]] = []

    with zipfile.ZipFile(template_path, "r") as zin, zipfile.ZipFile(out_path, "w") as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename.startswith("word/") and item.filename.endswith(".xml"):
                try:
                    text = data.decode("utf-8")
                    for pat, repl in patterns:
                        text = pat.sub(repl, text)
                    text = _repair_split_jinja_tags(text)
                    text = _repair_khu_vuc_placeholder(text)
                    text = _repair_tien_ban_placeholder(text)
                    text = _repair_dia_chi_kinh_doanh_placeholder(text)
                    text = _repair_common_channel_loop_glitches(text)
                    data = text.encode("utf-8")
                except Exception:
                    pass
            zout.writestr(item, data)

    return out_path


def render_docx_text(*, template_path: Path, output_path: Path, context: dict) -> dict:
    """Render text placeholders only using docxtpl."""
    repaired_template_path = _repair_template_placeholders(template_path=template_path)
    logger.warning(
        "DOCX text render: template=%s repaired=%s", template_path, repaired_template_path
    )

    tpl = DocxTemplate(str(repaired_template_path))

    render_ctx = dict(context)
    bold_fields = ["nguoi_dai_dien", "NGUOI_DAI_DIEN", "chuc_vu", "CHUC_VU"]
    for field in bold_fields:
        if field in render_ctx and render_ctx[field] and isinstance(render_ctx[field], str):
            rt = RichText()
            rt.add(render_ctx[field], bold=True)
            render_ctx[field] = rt

    # Decode mojibake for all string values to fix encoding issues
    for key, value in render_ctx.items():
        if isinstance(value, str):
            render_ctx[key] = _decode_mojibake_text(value)

    tpl.render(render_ctx)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tpl.save(str(output_path))
    _repair_rendered_dia_chi_kinh_doanh(output_path=output_path, context=render_ctx)
    return render_ctx


def _repair_rendered_dia_chi_kinh_doanh(*, output_path: Path, context: dict) -> None:
    """Patch rendered Karaoke DOCX when Word/docxtpl drops split address value.

    Some copies of the Karaoke template split {{dia_chi_kinh_doanh}} across
    proofing runs. Even after pre-render repair, docxtpl can leave the "Dia chi
    kinh doanh:" paragraph with no value in the live app. This post-render
    guard only fills that empty paragraph from the already-rendered context.
    """
    business_address = _decode_mojibake_text(str(context.get("dia_chi_kinh_doanh") or "")).strip()
    if not business_address or not output_path.exists():
        return

    try:
        with zipfile.ZipFile(output_path, "r") as zin:
            items = [(item, zin.read(item.filename)) for item in zin.infolist()]
    except Exception:
        logger.warning("DOCX text render: could not open output for business address repair: %s", output_path)
        return

    changed = False
    repaired_items: list[tuple[zipfile.ZipInfo, bytes]] = []
    paragraph_re = re.compile(r"<w:p\b[^>]*>.*?</w:p>", flags=re.DOTALL)

    for item, data in items:
        if item.filename != "word/document.xml":
            repaired_items.append((item, data))
            continue
        try:
            xml_text = data.decode("utf-8")
        except Exception:
            repaired_items.append((item, data))
            continue

        def _repair_paragraph(match: re.Match[str]) -> str:
            nonlocal changed
            paragraph = match.group(0)
            plain = re.sub(r"<[^>]+>", "", paragraph)
            plain = plain.replace("&amp;", "&")
            normalized = plain.lower()
            if "kinh doanh" not in normalized or "dia_chi_kinh_doanh" in paragraph:
                return paragraph
            if business_address in plain:
                return paragraph
            if not normalized.rstrip().endswith("doanh:"):
                return paragraph

            insert = (
                '<w:r><w:rPr><w:iCs/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr>'
                f'<w:t xml:space="preserve">{_escape_xml_text(business_address)}</w:t></w:r>'
            )
            repaired, count = re.subn(r"</w:p>\s*$", insert + "</w:p>", paragraph, count=1)
            if count:
                changed = True
                return repaired
            return paragraph

        xml_text = paragraph_re.sub(_repair_paragraph, xml_text)
        repaired_items.append((item, xml_text.encode("utf-8")))

    if not changed:
        return

    with zipfile.ZipFile(output_path, "w") as zout:
        for item, data in repaired_items:
            zout.writestr(item, data)


def _escape_xml_text(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def extract_placeholders_from_template(*, template_path: Path) -> list[str]:
    """Extract all placeholder names from a DOCX template."""
    placeholders: set[str] = set()
    try:
        with zipfile.ZipFile(template_path, "r") as zf:
            xml = zf.read("word/document.xml").decode("utf-8", errors="ignore")
        matches = re.findall(r"\{\{(.*?)\}\}", xml)
        for m in matches:
            cleaned = m.strip()
            if cleaned and "w:" not in cleaned and "</" not in cleaned and ">" not in cleaned:
                placeholders.add(cleaned)
    except Exception:
        pass
    return sorted(list(placeholders))


def _read_docx_text(docx_path: Path) -> str:
    """Read all text content from a DOCX file."""
    try:
        with zipfile.ZipFile(docx_path, "r") as zf:
            xml = zf.read("word/document.xml").decode("utf-8", errors="ignore")
        text = re.sub(r"<[^>]+>", " ", xml)
        text = re.sub(r"\s+", " ", text)
        return _decode_mojibake_text(text)
    except Exception:
        return ""
