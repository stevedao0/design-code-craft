"""
Canonical Domain & KPI Group Registry — single source of truth.

All readers/writers (importer, contract create/update, API mutation,
Reports, KPI, portfolio, frontend options) MUST use this module.

Public API:
- canonicalize_domain(raw: str | None) -> str | None
    Resolve a stored/imported linh_vuc or field_code to a canonical
    domain code. Unknown/ambiguous → None (caller must reject/quarantine).
- kpi_groups() -> list[KpiGroup]
    Stable, ordered list of KPI groups.
- kpi_group_member_codes(group_code: str) -> tuple[str, ...]
- get_kpi_group_for_domain(domain_code: str) -> str | None
    Map a canonical domain code to its KPI group (or None if no group).
- is_known_canonical_domain(code: str) -> bool
- canonical_domains() -> list[str]

Spec rules encoded here:
- Unknown aliases NEVER become ENTERTAINMENT automatically. KHU_VUI_CHOI
  is the only domain for "Khu vui chơi". ENTERTAINMENT is an alias only.
- SCTT, BD, HOTEL etc. are NOT KPI group members unless explicitly added.
- A canonical domain code is uppercase snake_case with no diacritics.
"""
from __future__ import annotations

import unicodedata
from dataclasses import dataclass


# ─── Canonical domain catalog ────────────────────────────────────────────────
# Codes are the ONLY authoritative domain identifiers. All other inputs
# (raw linh_vuc, imported strings, field_code stored in old tables) must be
# passed through canonicalize_domain() before being persisted or queried.

_CANONICAL_DOMAINS: dict[str, dict] = {
    "KARAOKE":      {"label_vi": "Karaoke",        "sort_order": 1, "is_active": True, "is_locked": False},
    "PHONG_THU_AM": {"label_vi": "Phòng thu âm",   "sort_order": 2, "is_active": True, "is_locked": False},
    "KHU_VUI_CHOI": {"label_vi": "Khu vui chơi",    "sort_order": 3, "is_active": True, "is_locked": False},
    "SCTT":         {"label_vi": "SCTT",            "sort_order": 50, "is_active": True, "is_locked": False},
    "BD":           {"label_vi": "BD",              "sort_order": 51, "is_active": True, "is_locked": False},
    "BACKGROUND":   {"label_vi": "Nhạc nền",        "sort_order": 60, "is_active": True, "is_locked": False},
}


# ─── Alias map: normalized raw → canonical code ──────────────────────────────
# A row is rejected (None) when the raw is not in this map AND the raw is
# not already a canonical code. Quarantine tables must catch such rows.

_ALIAS_RAW_TO_CANONICAL: dict[str, str] = {
    # KARAOKE family
    "karaoke": "KARAOKE",
    "KARAOKE": "KARAOKE",

    # PHONG_THU_AM family (raw Vietnamese + ascii variants)
    "phòngthuâm": "PHONG_THU_AM",
    "phòng thu âm": "PHONG_THU_AM",
    "phong thu am": "PHONG_THU_AM",
    "phong_thu_am": "PHONG_THU_AM",
    "phongthuam": "PHONG_THU_AM",
    "studio": "PHONG_THU_AM",

    # KHU_VUI_CHOI family (raw + ENTERTAINMENT alias ONLY when explicitly approved)
    "khuvuichơi": "KHU_VUI_CHOI",
    "khu vui chơi": "KHU_VUI_CHOI",
    "khu vui choi": "KHU_VUI_CHOI",
    "khuvuichoi": "KHU_VUI_CHOI",
    "khu_vui_choi": "KHU_VUI_CHOI",
    "KHU_VUI_CHOI": "KHU_VUI_CHOI",
    "amusement": "KHU_VUI_CHOI",
    "entertainment": "KHU_VUI_CHOI",

    # SCTT and BD (currently unresolved/quarantined by default)
    "sctt": "SCTT",
    "SCTT": "SCTT",
    "bd": "BD",
    "BD": "BD",

    # Background family
    "background": "BACKGROUND",
    "BACKGROUND": "BACKGROUND",
    "background_music": "BACKGROUND",
    "nhạcnền": "BACKGROUND",
    "nhạc nền": "BACKGROUND",
    "nhac nen": "BACKGROUND",
    "nhacnen": "BACKGROUND",
}


# ─── KPI group registry ──────────────────────────────────────────────────────
# A KPI group is an aggregation unit shown as a single row in Reports/KPI.
# Karaoke KPI = KARAOKE + PHONG_THU_AM. Khu vui choi = KHU_VUI_CHOI only.

@dataclass(frozen=True)
class KpiGroup:
    code: str
    label_vi: str
    member_domain_codes: tuple[str, ...]
    sort_order: int


_KPI_GROUPS: list[KpiGroup] = [
    KpiGroup(
        code="KARAOKE",
        label_vi="Karaoke",
        member_domain_codes=("KARAOKE", "PHONG_THU_AM"),
        sort_order=1,
    ),
    KpiGroup(
        code="KHU_VUI_CHOI",
        label_vi="Khu vui chơi",
        member_domain_codes=("KHU_VUI_CHOI",),
        sort_order=2,
    ),
]


# Reverse map: canonical domain → its KPI group (or None)
_DOMAIN_TO_GROUP: dict[str, str] = {}
for _grp in _KPI_GROUPS:
    for _member in _grp.member_domain_codes:
        _DOMAIN_TO_GROUP[_member] = _grp.code


def _normalize_label(v: str | None) -> str:
    """
    Normalize a raw label for variant-insensitive alias lookup.

    - Strip leading/trailing whitespace.
    - Unicode NFKD → ASCII.
    - Lowercase.
    - Drop underscores and spaces.
    - Drop commas/periods.
    """
    if not v:
        return ""
    s = str(v).strip()
    nfkd = unicodedata.normalize("NFKD", s)
    ascii_val = "".join(c for c in nfkd if unicodedata.category(c) != "Mn")
    ascii_val = ascii_val.lower()
    for ch in ("_", " ", ",", ".", "-", "/"):
        ascii_val = ascii_val.replace(ch, "")
    return ascii_val


# Pre-compute normalized alias map once at import time
_NORMALIZED_ALIAS: dict[str, str] = {}
for _raw, _canon in _ALIAS_RAW_TO_CANONICAL.items():
    _NORMALIZED_ALIAS[_normalize_label(_raw)] = _canon


def canonicalize_domain(raw: str | None) -> str | None:
    """
    Resolve a stored/imported label to its canonical domain code.

    Returns None for unknown/ambiguous input. Callers MUST treat None as
    a reject/quarantine signal (never silently coerce).
    """
    if raw is None:
        return None
    norm = _normalize_label(raw)
    if not norm:
        return None
    return _NORMALIZED_ALIAS.get(norm)


def canonical_domains() -> list[str]:
    """All canonical domain codes in stable sort order."""
    return sorted(
        _CANONICAL_DOMAINS.keys(),
        key=lambda c: (_CANONICAL_DOMAINS[c]["sort_order"], c),
    )


def is_known_canonical_domain(code: str | None) -> bool:
    return code in _CANONICAL_DOMAINS


def kpi_groups() -> list[KpiGroup]:
    return list(_KPI_GROUPS)


def kpi_group_member_codes(group_code: str) -> tuple[str, ...]:
    for grp in _KPI_GROUPS:
        if grp.code == group_code:
            return grp.member_domain_codes
    return ()


def get_kpi_group_for_domain(domain_code: str | None) -> str | None:
    if domain_code is None:
        return None
    return _DOMAIN_TO_GROUP.get(domain_code)


def label_for_canonical(code: str | None) -> str | None:
    if not code:
        return None
    cfg = _CANONICAL_DOMAINS.get(code)
    return cfg["label_vi"] if cfg else code


def label_for_kpi_group(code: str | None) -> str | None:
    if not code:
        return None
    for grp in _KPI_GROUPS:
        if grp.code == code:
            return grp.label_vi
    return code


__all__ = [
    "KpiGroup",
    "canonicalize_domain",
    "canonical_domains",
    "is_known_canonical_domain",
    "kpi_groups",
    "kpi_group_member_codes",
    "get_kpi_group_for_domain",
    "label_for_canonical",
    "label_for_kpi_group",
]