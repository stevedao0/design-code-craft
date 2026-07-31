"""Business domain registry - shared across all Background domains.

This module centralizes all business domain definitions:
- Domain codes (KARAOKE, CAFE, NHA_HANG, etc.)
- Domain display names
- Template file mappings
- Alias normalization

All other modules should import from here instead of duplicating logic.
"""
from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable


# =============================================================================
# HELPER FUNCTIONS (must be defined before DOMAIN_REGISTRY initialization)
# =============================================================================

def _fold(value: str) -> str:
    """Normalize text for comparison: strip, NFD normalize, uppercase, replace special chars."""
    text = str(value or "").strip()
    normalized = unicodedata.normalize("NFD", text)
    ascii_text = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return ascii_text.upper().replace("-", "_").replace("/", "_").replace(" ", "_")


def _fold_text(text: str) -> str:
    """Same as _fold but for internal use."""
    return _fold(text)


# =============================================================================
# DOMAIN CODES
# =============================================================================

# Primary domain codes matching frontend BackgroundDomainCode
DOMAIN_KARAOKE = "KARAOKE"
DOMAIN_PHONG_THU_AM = "PHONG_THU_AM"
DOMAIN_CAFE = "CAFE"
DOMAIN_NHA_HANG = "NHA_HANG"
DOMAIN_KHU_VUI_CHOI = "KHU_VUI_CHOI"
DOMAIN_KHACH_SAN = "KHACH_SAN"
DOMAIN_CHAM_SOC_SUC_KHOE = "CHAM_SOC_SUC_KHOE"
DOMAIN_SIEU_THI = "SIEU_THI"
DOMAIN_TRUNG_TAM_THUONG_MAI = "TRUNG_TAM_THUONG_MAI"
DOMAIN_BAR = "BAR"
DOMAIN_VAN_PHONG = "VAN_PHONG"
DOMAIN_CUA_HANG = "CUA_HANG"
DOMAIN_RAP_CHIEU = "RAP_CHIEU"
DOMAIN_PHONG_TRA = "PHONG_TRA"
DOMAIN_SCTT = "SCTT"
DOMAIN_BD = "BD"


# =============================================================================
# DOMAIN REGISTRY
# =============================================================================

@dataclass
class DomainConfig:
    """Configuration for a business domain."""
    code: str
    display_name: str
    template_filename: str | None  # None if no template yet
    aliases: list[str] = field(default_factory=list)
    notes: str = ""


# All registered Background domains
DOMAIN_REGISTRY: list[DomainConfig] = [
    DomainConfig(
        code=DOMAIN_KARAOKE,
        display_name="Karaoke",
        template_filename="export_template_contract_karaoke_phongthuam.docx",
        aliases=["KARAOKE", "karaoke"],
    ),
    DomainConfig(
        code=DOMAIN_PHONG_THU_AM,
        display_name="Phòng thu âm",
        template_filename="export_template_contract_karaoke_phongthuam.docx",
        aliases=["PHONG_THU_AM", "PHONG_GHI_AM", "PTA", "Phòng thu âm", "Phòng ghi âm"],
    ),
    DomainConfig(
        code=DOMAIN_CAFE,
        display_name="Cà phê",
        template_filename="export_template_contract_caphe.docx",
        aliases=["CAFE", "COFFEE", "Cà phê", "Coffee", "Cafe", "CA_PHE"],
    ),
    DomainConfig(
        code=DOMAIN_NHA_HANG,
        display_name="Nhà hàng",
        template_filename="export_template_contract_nhahang.docx",
        aliases=["NHA_HANG", "Nhà hàng", "NHÀ_HÀNG"],
    ),
    DomainConfig(
        code=DOMAIN_KHU_VUI_CHOI,
        display_name="Khu vui chơi giải trí",
        template_filename="export_template_contract_khuvuichoi.docx",
        aliases=["KHU_VUI_CHOI", "KVC", "KTV", "Khu vui chơi", "Khu vui chơi giải trí", "KHU_VUI_CHOI_GIAI_TRI", "ENTERTAINMENT", "KHU_VUI_CHOI_GIAI_TRI"],
    ),
    DomainConfig(
        code=DOMAIN_KHACH_SAN,
        display_name="Khách sạn",
        template_filename="export_template_contract_khachsan.docx",
        aliases=["KHACH_SAN", "Khách sạn", "KHÁCH_SẠN", "Resort"],
    ),
    DomainConfig(
        code=DOMAIN_CHAM_SOC_SUC_KHOE,
        display_name="Chăm sóc sức khỏe",
        template_filename="export_template_contract_chamsocsuckhoe.docx",
        aliases=["CHAM_SOC_SUC_KHOE", "Chăm sóc sức khỏe", "CHĂM_SÓC_SỨC_KHỎE", "Spa", "Spa"],
    ),
    # Below domains don't have templates yet
    DomainConfig(
        code=DOMAIN_SIEU_THI,
        display_name="Siêu thị",
        template_filename=None,
        aliases=["SIEU_THI", "Siêu thị", "SIÊU_THỊ"],
    ),
    DomainConfig(
        code=DOMAIN_TRUNG_TAM_THUONG_MAI,
        display_name="Trung tâm thương mại",
        template_filename=None,
        aliases=["TRUNG_TAM_THUONG_MAI", "Trung tâm thương mại", "TTTM"],
    ),
    DomainConfig(
        code=DOMAIN_BAR,
        display_name="Bar",
        template_filename=None,
        aliases=["BAR", "Bar", "BAR_KARAOKE"],
    ),
    DomainConfig(
        code=DOMAIN_VAN_PHONG,
        display_name="Văn phòng",
        template_filename=None,
        aliases=["VAN_PHONG", "Văn phòng", "VĂN_PHÒNG"],
    ),
    DomainConfig(
        code=DOMAIN_CUA_HANG,
        display_name="Cửa hàng",
        template_filename=None,
        aliases=["CUA_HANG", "Cửa hàng", "CỬA_HÀNG"],
    ),
    DomainConfig(
        code=DOMAIN_RAP_CHIEU,
        display_name="Rạp chiếu phim",
        template_filename=None,
        aliases=["RAP_CHIEU", "Rạp chiếu phim", "RẠP_CHIẾU_PHIM"],
    ),
    DomainConfig(
        code=DOMAIN_PHONG_TRA,
        display_name="Phòng trà",
        template_filename=None,
        aliases=["PHONG_TRA", "Phòng trà", "PHÒNG_TRÀ", "Cao lâu"],
    ),
    DomainConfig(
        code=DOMAIN_SCTT,
        display_name="Sao chép",
        template_filename=None,
        aliases=["SCTT", "SAO_CHEP", "Sao chép"],
    ),
    DomainConfig(
        code=DOMAIN_BD,
        display_name="Biểu diễn",
        template_filename=None,
        aliases=["BD", "BIEU_DIEN", "Biểu diễn"],
    ),
]


# Build lookup maps for fast access
_CODE_TO_CONFIG: dict[str, DomainConfig] = {d.code: d for d in DOMAIN_REGISTRY}
_ALIAS_TO_CODE: dict[str, str] = {}
for domain in DOMAIN_REGISTRY:
    for alias in domain.aliases:
        _ALIAS_TO_CODE[alias.upper().replace("-", "_").replace("/", "_").replace(" ", "_")] = domain.code
    # Also map the code itself
    folded_code = _fold_text(domain.code)
    if folded_code not in _ALIAS_TO_CODE:
        _ALIAS_TO_CODE[folded_code] = domain.code


# =============================================================================
# PUBLIC API
# =============================================================================

DOC_TYPE_CONTRACT = "contract"


def get_domain_config(code: str) -> DomainConfig | None:
    """Get domain config by canonical code."""
    return _CODE_TO_CONFIG.get(code.upper())


def resolve_domain_code(
    domain: str | None = None,
    field_code: str | None = None,
    domain_group: str | None = None,
    display: str | None = None,
) -> tuple[str, DomainConfig | None]:
    """
    Resolve a domain from multiple input fields.

    Returns:
        tuple of (folded_code, domain_config or None)
    """
    values = [_fold(domain), _fold(field_code), _fold(domain_group), _fold(display)]
    joined = " ".join(v for v in values if v)

    # Try exact match on folded values
    for val in values:
        if val in _ALIAS_TO_CODE:
            code = _ALIAS_TO_CODE[val]
            return code, get_domain_config(code)

    # Try substring match in joined string
    for code, config in _CODE_TO_CONFIG.items():
        if code in joined or any(alias in joined for alias in config.aliases):
            return code, config

    # Return UNKNOWN
    return "UNKNOWN", None


def get_template_path(template_root: Path | str, domain_code: str) -> Path | None:
    """Get the template file path for a domain."""
    config = get_domain_config(domain_code)
    if config and config.template_filename:
        root = Path(template_root) if isinstance(template_root, str) else template_root
        path = root / "Background" / config.template_filename
        if path.is_file():
            return path
    return None


def get_all_domain_codes() -> list[str]:
    """Get all registered domain codes."""
    return list(_CODE_TO_CONFIG.keys())


def get_domains_with_templates() -> list[DomainConfig]:
    """Get all domains that have templates."""
    return [d for d in DOMAIN_REGISTRY if d.template_filename]
