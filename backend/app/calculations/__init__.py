"""
Calculation engine package.

This package contains modular calculation services for Background domains:
- common: Shared helpers (money, GTGT, terms, render blocks)
- karaoke: Karaoke/Phòng thu âm calculation
- kvc: Khu vui chơi calculation (placeholder)
- cafe: Cà phê calculation (placeholder)
- nha_hang: Nhà hàng calculation (placeholder)
- khach_san: Khách sạn calculation (placeholder)

Rules:
- Each domain has its own module for isolated fixes
- Calculation modules return table/context data for DOCX rendering
- Renderer must NOT recalculate money
- Backend calculation module is the source of truth for money
- Frontend only calls dry-run API
"""

from .registry import (
    CALCULATION_DOMAINS,
    CALCULATION_STATUS,
    DomainCalcStatus,
    get_domain_calc_status,
    is_domain_calculated,
    get_domain_pricing_modes,
)

__all__ = [
    "CALCULATION_DOMAINS",
    "CALCULATION_STATUS",
    "DomainCalcStatus",
    "get_domain_calc_status",
    "is_domain_calculated",
    "get_domain_pricing_modes",
]
