"""
Khu vui choi (KVC) calculation module.

This module handles KVC area-based pricing calculations.

Status: VCPMC TARIFF IMPLEMENTED (KVC-02, KVC-02b), ND17 IMPLEMENTED (KVC-05)

Pricing modes:
- VCPMC tariff (Option A): ✅ IMPLEMENTED - area tariff (1-50m² base + 400,000/50m²)
- ND17/2023 (Option B): ✅ IMPLEMENTED (KVC-05) - coefficient × base_salary

Legal Basis: Nghị định 17/2023/NĐ-CP, Phụ lục II, Mục 8

See: F:\APPs\docs\plans\BACKGROUND_AREA_PRICING_TODO.md
"""

from .vcpmc_tariff import (
    KVC_BASE_FEE_VND,
    KVC_INCREMENT_FEE_VND,
    KVC_BASE_INCLUDED_AREA_M2,
    KVC_BLOCK_SIZE_M2,
    round_increment_blocks_half_up,
    calculate_location_tariff,
    calculate_kvc_vcpmc_tariff,
)

from .nd17 import (
    ND17_MODE,
    DEFAULT_BASE_SALARY_VND,
    ND17_KVC_BASE_COEFFICIENT,
    ND17_KVC_FIRST_THRESHOLD_M2,
    ND17_KVC_SECOND_THRESHOLD_M2,
    ND17_KVC_INCREMENT_200_500,
    ND17_KVC_INCREMENT_OVER_500,
    ND17_KVC_MAX_MULTIPLIER,
    URBAN_RATES,
    get_urban_rate,
    calculate_nd17_kvc_location,
    calculate_nd17_kvc_tariff,
    build_nd17_docx_context,
)

from .docx_context import (
    build_kvc_vcpmc_docx_context,
    build_kvc_vcpmc_docx_context_preview,
    build_usage_locations_context,
    build_kvc_vcpmc_pricing_context,
    get_effective_display_mode,
)

__all__ = [
    # VCPMC Tariff (KVC-02, KVC-02b)
    "KVC_BASE_FEE_VND",
    "KVC_INCREMENT_FEE_VND",
    "KVC_BASE_INCLUDED_AREA_M2",
    "KVC_BLOCK_SIZE_M2",
    "round_increment_blocks_half_up",
    "calculate_location_tariff",
    "calculate_kvc_vcpmc_tariff",
    # ND17 (KVC-05)
    "ND17_MODE",
    "DEFAULT_BASE_SALARY_VND",
    "ND17_KVC_BASE_COEFFICIENT",
    "ND17_KVC_FIRST_THRESHOLD_M2",
    "ND17_KVC_SECOND_THRESHOLD_M2",
    "ND17_KVC_INCREMENT_200_500",
    "ND17_KVC_INCREMENT_OVER_500",
    "ND17_KVC_MAX_MULTIPLIER",
    "URBAN_RATES",
    "get_urban_rate",
    "calculate_nd17_kvc_location",
    "calculate_nd17_kvc_tariff",
    "build_nd17_docx_context",
    # DOCX Context (KVC-03)
    "build_kvc_vcpmc_docx_context",
    "build_kvc_vcpmc_docx_context_preview",
    "build_usage_locations_context",
    "build_kvc_vcpmc_pricing_context",
    "get_effective_display_mode",
]
