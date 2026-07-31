"""
Common calculation helpers.

This module contains shared utility functions for all Background calculation domains:
- money.py: Money formatting and conversion
- gtgt.py: VAT/GTGT calculations
- terms.py: Contract term calculations
- render_blocks.py: DOCX context block builders (domain-agnostic)
"""

from .money import (
    VIETNAMESE_DIGITS,
    VIETNAMESE_SCALES,
    DEFAULT_BASE_SALARY_VND,
    money_to_vietnamese_words,
    format_money_vn,
    format_coeff_vn,
    parse_int,
    parse_float,
)

from .gtgt import (
    compute_gtgt_amount,
)

from .terms import (
    detect_effective_term_months,
    _to_date_safe,
)

from .dates import (
    add_one_year_safe,
)

__all__ = [
    # money
    "VIETNAMESE_DIGITS",
    "VIETNAMESE_SCALES",
    "DEFAULT_BASE_SALARY_VND",
    "money_to_vietnamese_words",
    "format_money_vn",
    "format_coeff_vn",
    "parse_int",
    "parse_float",
    # gtgt
    "compute_gtgt_amount",
    # terms
    "detect_effective_term_months",
    "_to_date_safe",
    # dates
    "add_one_year_safe",
]
