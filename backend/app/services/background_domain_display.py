"""Background domain display name utilities.

This module provides helper functions for mapping domain codes to proper Vietnamese display names.
"""
from __future__ import annotations

import unicodedata


# =============================================================================
# DOMAIN DISPLAY NAME MAPPING
# =============================================================================

# Standard display names for all Background domains
BACKGROUND_DOMAIN_DISPLAY_NAMES: dict[str, str] = {
    # Karaoke
    "KARAOKE": "Karaoke",
    "karaoke": "Karaoke",

    # Phòng thu âm
    "PHONG_THU_AM": "Phòng Thu Âm",
    "phong_thu_am": "Phòng Thu Âm",
    "PHONG_GHI_AM": "Phòng Thu Âm",
    "phong_ghi_am": "Phòng Thu Âm",
    "PTA": "Phòng Thu Âm",
    "pta": "Phòng Thu Âm",
    "KARAOKE_PHONGTHUAM": "Phòng Thu Âm",
    "karaoke_phongthuam": "Phòng Thu Âm",

    # Khu vui chơi
    "KHU_VUI_CHOI": "Khu Vui Chơi",
    "khu_vui_choi": "Khu Vui Chơi",
    "KHU_VUI_CHOI_GIAI_TRI": "Khu Vui Chơi",
    "khu_vui_choi_giai_tri": "Khu Vui Chơi",
    "KVC": "Khu Vui Chơi",
    "kvc": "Khu Vui Chơi",
    "CITYGAMES": "Khu Vui Chơi",
    "citygames": "Khu Vui Chơi",

    # Chăm sóc sức khỏe
    "CHAM_SOC_SUC_KHOE": "Chăm Sóc Sức Khoẻ",
    "cham_soc_suc_khoe": "Chăm Sóc Sức Khoẻ",
    "CHAM_SOC_SUC_KHOE": "Chăm Sóc Sức Khoẻ",  # Exact match
    "Spa": "Chăm Sóc Sức Khoẻ",
    "spa": "Chăm Sóc Sức Khoẻ",

    # Cà phê
    "CAFE": "Cà Phê",
    "cafe": "Cà Phê",
    "CA_PHE": "Cà Phê",
    "ca_phe": "Cà Phê",
    "COFFEE": "Cà Phê",
    "coffee": "Cà Phê",

    # Nhà hàng
    "NHA_HANG": "Nhà Hàng",
    "nha_hang": "Nhà Hàng",
    "NHÀ_HÀNG": "Nhà Hàng",
    "RESTAURANT": "Nhà Hàng",
    "restaurant": "Nhà Hàng",

    # Khách sạn
    "KHACH_SAN": "Khách Sạn",
    "khach_san": "Khách Sạn",
    "RESORT": "Khách Sạn",
    "resort": "Khách Sạn",

    # Bar
    "BAR": "Bar",
    "bar": "Bar",

    # Siêu thị
    "SIEU_THI": "Siêu Thị",
    "sieu_thi": "Siêu Thị",
    "SIÊU_THỊ": "Siêu Thị",

    # Trung tâm thương mại
    "TRUNG_TAM_THUONG_MAI": "Trung Tâm Thương Mại",
    "trung_tam_thuong_mai": "Trung Tâm Thương Mại",
    "TTTM": "Trung Tâm Thương Mại",
    "tttm": "Trung Tâm Thương Mại",

    # Văn phòng
    "VAN_PHONG": "Văn Phòng",
    "van_phong": "Văn Phòng",
    "VĂN_PHÒNG": "Văn Phòng",

    # Cửa hàng
    "CUA_HANG": "Cửa Hàng",
    "cua_hang": "Cửa Hàng",
    "CỬA_HÀNG": "Cửa Hàng",

    # Rạp chiếu phim
    "RAP_CHIEU": "Rạp Chiếu Phim",
    "rap_chieu": "Rạp Chiếu Phim",
    "RẠP_CHIẾU_PHIM": "Rạp Chiếu Phim",

    # Phòng trà
    "PHONG_TRA": "Phòng Trà",
    "phong_tra": "Phòng Trà",
    "PHÒNG_TRÀ": "Phòng Trà",

    # SCTT
    "SCTT": "Sao Chép",
    "sctt": "Sao Chép",
    "SAO_CHEP": "Sao Chép",
    "sao_chep": "Sao Chép",

    # Biểu diễn
    "BD": "Biểu Diễn",
    "bd": "Biểu Diễn",
    "BIEU_DIEN": "Biểu Diễn",
    "bieu_dien": "Biểu Diễn",
}


def _normalize_key(value: str) -> str:
    """Normalize domain code for lookup."""
    if not value:
        return ""
    # Strip, uppercase, replace special chars
    text = str(value).strip().upper()
    text = text.replace("-", "_").replace("/", "_").replace(" ", "_")
    return text


def get_background_domain_display_name(domain_code: str | None) -> str:
    """Get the proper Vietnamese display name for a Background domain code.

    Args:
        domain_code: The domain code (e.g., "CHAM_SOC_SUC_KHOE", "karaoke", "KVC")

    Returns:
        Proper display name (e.g., "Chăm Sóc Sức Khoẻ", "Karaoke", "Khu Vui Chơi")

    Examples:
        >>> get_background_domain_display_name("CHAM_SOC_SUC_KHOE")
        'Chăm Sóc Sức Khoẻ'
        >>> get_background_domain_display_name("karaoke")
        'Karaoke'
        >>> get_background_domain_display_name("KVC")
        'Khu Vui Chơi'
    """
    if not domain_code:
        return ""

    normalized = _normalize_key(domain_code)

    # Try exact match first
    if normalized in BACKGROUND_DOMAIN_DISPLAY_NAMES:
        return BACKGROUND_DOMAIN_DISPLAY_NAMES[normalized]

    # Try without underscores
    without_underscores = normalized.replace("_", "")
    for key, value in BACKGROUND_DOMAIN_DISPLAY_NAMES.items():
        if key.replace("_", "") == without_underscores:
            return value

    # Try lowercase match
    for key, value in BACKGROUND_DOMAIN_DISPLAY_NAMES.items():
        if key.lower() == normalized.lower():
            return value

    # Try partial match
    for key, value in BACKGROUND_DOMAIN_DISPLAY_NAMES.items():
        key_norm = key.replace("_", "").lower()
        if key_norm in normalized.lower() or normalized.lower() in key_norm:
            return value

    # Fallback: title case the input
    if domain_code.isupper() or domain_code.islower():
        return domain_code.title()

    return domain_code


def normalize_domain_for_export(domain: str | None) -> str:
    """Normalize domain code for export context.

    This ensures consistent formatting in Word exports.

    Args:
        domain: Raw domain code

    Returns:
        Normalized display name
    """
    return get_background_domain_display_name(domain)
