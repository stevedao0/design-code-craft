"""
Common money helpers.

Shared utility functions for money formatting and conversion.
Used by all Background calculation domains.
"""

from typing import Any


# Default base salary per Nghị định 161/2026/NĐ-CP, effective from 01/07/2026
DEFAULT_BASE_SALARY_VND = 2_530_000

# Vietnamese digit names
VIETNAMESE_DIGITS = [
    "không", "một", "hai", "ba", "bốn",
    "năm", "sáu", "bảy", "tám", "chín",
]

VIETNAMESE_SCALES = [
    "", "nghìn", "triệu", "tỷ",
]


def money_to_vietnamese_words(value: int | None) -> str:
    """Convert money number to Vietnamese words."""
    if value is None:
        return ""
    try:
        n = int(value)
    except Exception:
        return ""

    if n == 0:
        return "không đồng"

    negative = n < 0
    n = abs(n)

    parts: list[str] = []
    scale_idx = 0

    while n > 0:
        if n % 1000 != 0:
            part = _three_digit_to_words(n % 1000)
            if scale_idx > 0:
                part += " " + VIETNAMESE_SCALES[scale_idx]
            parts.append(part)
        n //= 1000
        scale_idx += 1

    result = " ".join(reversed(parts))
    if negative:
        result = "âm " + result
    return result


def _three_digit_to_words(n: int) -> str:
    """Convert a number 0-999 to Vietnamese words."""
    if n == 0:
        return ""

    words: list[str] = []
    hundreds = n // 100
    remainder = n % 100

    if hundreds > 0:
        words.append(VIETNAMESE_DIGITS[hundreds])
        words.append("trăm")

    if remainder > 0:
        if hundreds > 0 and remainder < 10:
            # For 101-109, 201-209, etc.: add "linh" between hundreds and unit
            words.append("linh")

        tens = remainder // 10
        ones = remainder % 10

        if tens >= 2:
            words.append(VIETNAMESE_DIGITS[tens])
            words.append("mươi")
            if ones == 5:
                words.append("lăm")
            elif ones != 0:
                words.append(VIETNAMESE_DIGITS[ones])
        elif tens == 1:
            # 10-19: "mười"
            words.append("mười")
            if ones == 5:
                words.append("lăm")
            elif ones != 0:
                words.append(VIETNAMESE_DIGITS[ones])
        else:
            # tens == 0, units only - "linh" was already handled above if needed
            pass

    return " ".join(words)


def parse_int(value: Any, default: int = 0) -> int:
    """Parse integer from various input formats."""
    if value is None:
        return default
    try:
        if isinstance(value, str):
            cleaned = value.replace(".", "").replace(",", ".").strip()
            if cleaned == "":
                return default
            return int(float(cleaned))
        return int(float(str(value)))
    except Exception:
        return default


def parse_float(value: Any, default: float = 0.0) -> float:
    """Parse float from various input formats."""
    if value is None:
        return default
    try:
        if isinstance(value, str):
            cleaned = value.replace(".", "").replace(",", ".").strip()
            if cleaned == "":
                return default
            return float(cleaned)
        return float(value)
    except Exception:
        return default


def format_money_vn(value: int | float | None) -> str:
    """Format money with Vietnamese thousand separators."""
    if value is None:
        return "0"
    try:
        return f"{int(round(float(value))):,}"
    except Exception:
        return "0"


def format_coeff_vn(value: float | None) -> str:
    """Format coefficient with minimal decimal places."""
    if value is None:
        return "0"
    text = f"{float(value):.4f}".rstrip("0").rstrip(".")
    return text
