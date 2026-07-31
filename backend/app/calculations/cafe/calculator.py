"""
Cà phê (Cafe) calculation module.

Status: PLANNING / NOT IMPLEMENTED

This module will handle Cà phê pricing calculations.
Do not implement until domain requirements are confirmed.

See: F:\APPs\docs\plans\BACKGROUND_AREA_PRICING_TODO.md
"""

from typing import Any, Dict, List


# Domain identifier
CAFE_DOMAIN = "CAFE"


def calculate_cafe(
    *,
    locations: List[Dict[str, Any]],
    gtgt_percent: float = 8.0,
    effective_term_months: int | None = None,
) -> Dict[str, Any]:
    """
    Calculate Cà phê pricing.

    Status: NOT IMPLEMENTED

    This function will calculate based on domain-specific logic once confirmed.

    Args:
        locations: List of location dicts with area and usage info
        gtgt_percent: GTGT percentage
        effective_term_months: Optional term months

    Returns:
        Placeholder response with NOT_IMPLEMENTED status

    Raises:
        NotImplementedError: Until calculation is confirmed
    """
    raise NotImplementedError(
        "Cà phê (Cafe) calculation is not yet implemented. "
        "See: F:\\APPs\\docs\\plans\\BACKGROUND_AREA_PRICING_TODO.md"
    )
