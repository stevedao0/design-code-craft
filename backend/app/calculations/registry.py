"""
Calculation domain registry.

This module defines which Background domains have calculation support
and their current implementation status.

Rules:
- karaoke: Fully implemented
- phong_thu_am: Uses karaoke calculation
- kvc: Planned with modes VCPMC_TARIFF and ND17
- cafe/nha_hang/khach_san: Planned
- Media/SCTT/BD: Locked
"""

from enum import Enum
from typing import Dict, List, Optional, Set


class DomainCalcStatus(str, Enum):
    """Calculation status for a domain."""
    IMPLEMENTED = "implemented"      # Fully implemented
    PLANNED = "planned"            # Planned but not implemented
    LOCKED = "locked"              # Locked (Media/SCTT/BD)
    NOT_APPLICABLE = "not_applicable"  # Not applicable


# Background domain codes
BACKGROUND_DOMAINS = [
    "KARAOKE",
    "PHONG_THU_AM",
    "CAFE",
    "NHA_HANG",
    "KHU_VUI_CHOI",
    "KHACH_SAN",
    "SIEU_THI",
    "TRUNG_TAM_THUONG_MAI",
    "BAR",
    "VAN_PHONG",
    "CUA_HANG",
    "RAP_CHIEU",
    "PHONG_TRA",
    "CHAM_SOC_SUC_KHOE",
]

# Karaoke calculation domains
KARAOKE_CALC_DOMAINS = [
    "KARAOKE",
    "PHONG_THU_AM",
]

# Area-based domains
AREA_BASED_DOMAINS = [
    "CAFE",
    "NHA_HANG",
    "KHU_VUI_CHOI",
    "SIEU_THI",
    "TRUNG_TAM_THUONG_MAI",
    "BAR",
    "VAN_PHONG",
    "CUA_HANG",
    "RAP_CHIEU",
    "PHONG_TRA",
    "CHAM_SOC_SUC_KHOE",
]

# KVC pricing modes
KVC_PRICING_MODES = [
    "VCPMC_TARIFF",
    "ND17",
]

# Domain display names
DOMAIN_DISPLAY_NAMES: Dict[str, str] = {
    "KARAOKE": "Karaoke",
    "PHONG_THU_AM": "Phòng thu âm",
    "CAFE": "Cà phê / Coffee",
    "NHA_HANG": "Nhà hàng",
    "KHU_VUI_CHOI": "Khu vui chơi",
    "KHACH_SAN": "Khách sạn",
    "SIEU_THI": "Siêu thị",
    "TRUNG_TAM_THUONG_MAI": "Trung tâm thương mại",
    "BAR": "Bar",
    "VAN_PHONG": "Văn phòng",
    "CUA_HANG": "Cửa hàng",
    "RAP_CHIEU": "Rạp chiếu phim",
    "PHONG_TRA": "Phòng trà",
    "CHAM_SOC_SUC_KHOE": "Chăm sóc sức khỏe",
}

# Calculation status per domain
CALCULATION_STATUS: Dict[str, DomainCalcStatus] = {
    # Fully implemented
    "KARAOKE": DomainCalcStatus.IMPLEMENTED,
    "PHONG_THU_AM": DomainCalcStatus.IMPLEMENTED,  # Uses karaoke logic

    # KVC: Both modes implemented (KVC-02, KVC-02b, KVC-05)
    "KHU_VUI_CHOI": DomainCalcStatus.IMPLEMENTED,

    # Planned (area-based)
    "CAFE": DomainCalcStatus.PLANNED,
    "NHA_HANG": DomainCalcStatus.PLANNED,
    "KHACH_SAN": DomainCalcStatus.PLANNED,
    "SIEU_THI": DomainCalcStatus.PLANNED,
    "TRUNG_TAM_THUONG_MAI": DomainCalcStatus.PLANNED,
    "BAR": DomainCalcStatus.PLANNED,
    "VAN_PHONG": DomainCalcStatus.PLANNED,
    "CUA_HANG": DomainCalcStatus.PLANNED,
    "RAP_CHIEU": DomainCalcStatus.PLANNED,
    "PHONG_TRA": DomainCalcStatus.PLANNED,
    "CHAM_SOC_SUC_KHOE": DomainCalcStatus.PLANNED,

    # Media domains (locked)
    "SCTT": DomainCalcStatus.LOCKED,
    "BD": DomainCalcStatus.LOCKED,
}

# CALCULATION_DOMAINS for compatibility
CALCULATION_DOMAINS = BACKGROUND_DOMAINS


def get_domain_calc_status(domain_code: str) -> DomainCalcStatus:
    """
    Get calculation status for a domain.

    Args:
        domain_code: Domain code (e.g., "KARAOKE", "KVC", "CAFE")

    Returns:
        DomainCalcStatus enum value
    """
    return CALCULATION_STATUS.get(domain_code.upper(), DomainCalcStatus.NOT_APPLICABLE)


def is_domain_calculated(domain_code: str) -> bool:
    """
    Check if domain calculation is implemented.

    Args:
        domain_code: Domain code

    Returns:
        True if calculation is implemented
    """
    status = get_domain_calc_status(domain_code)
    return status == DomainCalcStatus.IMPLEMENTED


def is_domain_planned(domain_code: str) -> bool:
    """
    Check if domain calculation is planned.

    Args:
        domain_code: Domain code

    Returns:
        True if calculation is planned but not implemented
    """
    status = get_domain_calc_status(domain_code)
    return status == DomainCalcStatus.PLANNED


def is_domain_locked(domain_code: str) -> bool:
    """
    Check if domain is locked (Media/SCTT/BD).

    Args:
        domain_code: Domain code

    Returns:
        True if domain is locked
    """
    status = get_domain_calc_status(domain_code)
    return status == DomainCalcStatus.LOCKED


def is_karaoke_domain(domain_code: str) -> bool:
    """
    Check if domain uses karaoke calculation.

    Args:
        domain_code: Domain code

    Returns:
        True if domain uses karaoke calculation
    """
    return domain_code.upper() in KARAOKE_CALC_DOMAINS


def is_area_based_domain(domain_code: str) -> bool:
    """
    Check if domain is area-based.

    Args:
        domain_code: Domain code

    Returns:
        True if domain is area-based (uses location/area for pricing)
    """
    return domain_code.upper() in AREA_BASED_DOMAINS


def get_domain_pricing_modes(domain_code: str) -> List[str]:
    """
    Get available pricing modes for a domain.

    Args:
        domain_code: Domain code

    Returns:
        List of available pricing modes
    """
    if is_karaoke_domain(domain_code):
        return ["KARAOKE"]
    if domain_code.upper() == "KHU_VUI_CHOI":
        return KVC_PRICING_MODES
    if is_area_based_domain(domain_code):
        return ["PLACEHOLDER"]  # Will have modes once implemented
    if is_domain_locked(domain_code):
        return []
    return []
