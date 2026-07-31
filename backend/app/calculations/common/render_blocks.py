"""
Common DOCX render block helpers.

Domain-agnostic functions for building DOCX context blocks.
Each domain calculation module should return structured data that these
helpers can format into display text.

Rules:
- Renderer must NOT recalculate money
- Calculation module is the source of truth
- This module only formats existing data
"""

from typing import Any, Dict, List, Optional

from .money import format_money_vn, format_coeff_vn, money_to_vietnamese_words


def build_money_text_line(
    label: str,
    amount: int,
    suffix: str = "đồng",
    include_suffix: bool = True,
) -> str:
    """
    Build a single money line for display.

    Args:
        label: Line label
        amount: Amount in VND
        suffix: Currency suffix
        include_suffix: Whether to include suffix

    Returns:
        Formatted line: "Label\t1,000,000 đồng"
    """
    formatted = format_money_vn(amount)
    if include_suffix:
        return f"{label}\t{formatted} {suffix}"
    return f"{label}\t{formatted}"


def build_amount_in_words_line(amount: int, prefix: str = "Bằng chữ") -> str:
    """
    Build amount-in-words line.

    Args:
        amount: Amount in VND
        prefix: Prefix text

    Returns:
        "(Bằng chữ: Hai mươi bốn triệu đồng.)"
    """
    words = money_to_vietnamese_words(amount)
    if not words:
        return ""
    return f"({prefix}: {words.capitalize()}.)"


def build_table_header_row(
    columns: List[str],
    separator: str = "\t",
) -> str:
    """
    Build a table header row.

    Args:
        columns: Column names
        separator: Column separator

    Returns:
        Tab-separated header row
    """
    return separator.join(columns)


def build_table_data_row(
    values: List[Any],
    separator: str = "\t",
) -> str:
    """
    Build a table data row.

    Args:
        values: Row values (will be formatted)
        separator: Column separator

    Returns:
        Tab-separated data row
    """
    formatted = [str(v) for v in values]
    return separator.join(formatted)


def build_location_table_block(
    locations: List[Dict[str, Any]],
    columns: Optional[List[str]] = None,
) -> str:
    """
    Build a location table block for DOCX.

    Args:
        locations: List of location dicts
        columns: Optional column names (default: Địa điểm, Địa chỉ, Diện tích, Hình thức)

    Returns:
        Tab-separated table text
    """
    if columns is None:
        columns = ["Địa điểm", "Địa chỉ kinh doanh", "Diện tích (m²)", "Hình thức"]

    lines: List[str] = []

    # Header
    lines.append(build_table_header_row(columns))

    # Data rows
    for loc in locations:
        row = [
            loc.get("name", ""),
            loc.get("address", ""),
            str(loc.get("area_m2", "")),
            loc.get("usage_type", ""),
        ]
        lines.append(build_table_data_row(row))

    return "\n".join(lines)


def build_subtotal_block(
    subtotal_before_gtgt: int,
    gtgt_percent: float,
    gtgt_amount: int,
    total_amount: int,
    effective_term_months: Optional[int] = None,
) -> str:
    """
    Build a subtotal block for DOCX.

    Args:
        subtotal_before_gtgt: Amount before GTGT
        gtgt_percent: GTGT percentage
        gtgt_amount: Calculated GTGT amount
        total_amount: Total amount
        effective_term_months: Optional effective term (6 or 12)

    Returns:
        Formatted subtotal block text
    """
    lines: List[str] = []

    lines.append(build_money_text_line("Cộng", subtotal_before_gtgt))
    lines.append(build_money_text_line(f"Tiền Thuế GTGT {format_coeff_vn(gtgt_percent)}%", gtgt_amount))

    if effective_term_months == 6:
        lines.append(build_money_text_line("Tổng giá trị hợp đồng cho 6 tháng sử dụng", total_amount))
    else:
        lines.append(build_money_text_line("Tổng giá trị hợp đồng cho 12 tháng sử dụng", total_amount))

    lines.append(build_amount_in_words_line(total_amount))

    return "\n".join(lines)
