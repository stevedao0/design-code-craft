"""Alias matrix for canonical domain normalization.

DB invariant: contract_records.linh_vuc and field_code must contain ONLY
canonical codes (KARAOKE, PHONG_THU_AM, KHU_VUI_CHOI, BACKGROUND) — never
display labels like 'Karaoke', 'Phòng thu âm', 'Khu vui chơi', or retired
domains like SCTT, BD, Chăm sóc sức khỏe.

This test enforces both:
- canonicalize_domain() resolves every approved alias to its canonical code.
- canonicalize_domain() rejects unknown / retired inputs (returns None).
"""
from backend.app.services.domain_registry import canonicalize_domain


# (input -> expected canonical code)
POSITIVE_CASES = [
    ("KARAOKE", "KARAOKE"),
    ("Karaoke", "KARAOKE"),
    ("karaoke", "KARAOKE"),
    ("  Karaoke  ", "KARAOKE"),

    ("PHONG_THU_AM", "PHONG_THU_AM"),
    ("Phòng thu âm", "PHONG_THU_AM"),
    ("phòng thu âm", "PHONG_THU_AM"),
    ("PHÒNG THU ÂM", "PHONG_THU_AM"),
    ("phong thu am", "PHONG_THU_AM"),
    ("PTA", "PHONG_THU_AM"),
    ("PHONG_GHI_AM", "PHONG_THU_AM"),
    ("Phòng ghi âm", "PHONG_THU_AM"),
    ("phòng ghi âm", "PHONG_THU_AM"),

    ("KHU_VUI_CHOI", "KHU_VUI_CHOI"),
    ("Khu vui chơi", "KHU_VUI_CHOI"),
    ("khu vui chơi", "KHU_VUI_CHOI"),
    ("KHU VUI CHƠI", "KHU_VUI_CHOI"),
    ("khu vui choi", "KHU_VUI_CHOI"),
    ("KHU VUI CHOI", "KHU_VUI_CHOI"),
]


# (input -> expected None)
NEGATIVE_CASES = [
    ("ENTERTAINMENT", "ENTERTAINMENT is NOT an alias for KHU_VUI_CHOI"),
    ("RESTAURANT", "RESTAURANT is not a canonical domain"),
    ("SCTT", "SCTT was retired"),
    ("BD", "BD was retired"),
    ("Chăm sóc sức khỏe", "retired domain label"),
    ("unknown text", "random unknown string"),
    ("", "empty string"),
    (None, "None input"),
    ("studio", "studio alias was removed"),
    ("karaokez", "fuzzy match must not pass"),
    ("phongthuam", "diacritic-stripped alias was removed"),
    ("phong_thu_am_x", "diacritic-stripped alias was removed"),
    ("nhac nen", "diacritic-stripped alias was removed"),
    ("amusement", "removed alias — no fuzzy / family merge"),
]


def _run_alias_matrix():
    failures = []
    for raw, expected in POSITIVE_CASES:
        got = canonicalize_domain(raw)
        if got != expected:
            failures.append(f"  {raw!r}: expected {expected!r}, got {got!r}")
    for raw, _note in NEGATIVE_CASES:
        got = canonicalize_domain(raw)
        if got is not None:
            failures.append(f"  {raw!r}: expected None (rejected), got {got!r}")
    if failures:
        raise AssertionError(
            "canonicalize_domain alias matrix failed:\n" + "\n".join(failures)
        )


def test_positive_karaoke():
    assert canonicalize_domain("KARAOKE") == "KARAOKE"
    assert canonicalize_domain("Karaoke") == "KARAOKE"
    assert canonicalize_domain("karaoke") == "KARAOKE"
    assert canonicalize_domain("  Karaoke  ") == "KARAOKE"


def test_positive_phong_thu_am():
    cases = [
        "PHONG_THU_AM", "Phòng thu âm", "phòng thu âm", "PHÒNG THU ÂM",
        "phong thu am", "PTA", "PHONG_GHI_AM",
        "Phòng ghi âm", "phòng ghi âm",
    ]
    for c in cases:
        assert canonicalize_domain(c) == "PHONG_THU_AM", f"{c!r} should be PHONG_THU_AM"


def test_positive_khu_vui_choi():
    cases = [
        "KHU_VUI_CHOI", "Khu vui chơi", "khu vui chơi",
        "KHU VUI CHƠI", "khu vui choi", "KHU VUI CHOI",
    ]
    for c in cases:
        assert canonicalize_domain(c) == "KHU_VUI_CHOI", f"{c!r} should be KHU_VUI_CHOI"


def test_negative_retired():
    for raw in ("SCTT", "BD", "Chăm sóc sức khỏe"):
        assert canonicalize_domain(raw) is None, f"{raw!r} must be rejected"


def test_negative_other_domains():
    """ENTERTAINMENT, RESTAURANT and Karaokez must be rejected.
    BACKGROUND is a registered (but non-KPI) domain, NOT rejected."""
    for raw in ("ENTERTAINMENT", "RESTAURANT", "Karaokez"):
        assert canonicalize_domain(raw) is None, f"{raw!r} must be rejected"


def test_background_registered():
    """BACKGROUND is a separate registered domain, kept per user spec."""
    assert canonicalize_domain("BACKGROUND") == "BACKGROUND"
    assert canonicalize_domain("background") == "BACKGROUND"


def test_negative_garbage():
    for raw in ("unknown text", "", None):
        assert canonicalize_domain(raw) is None, f"{raw!r} must be rejected"


def test_negative_old_aliases_removed():
    """Aliases removed by domain normalization must be rejected."""
    for raw in ("studio", "phongthuam", "phong_thu_am_x", "nhac nen", "amusement"):
        assert canonicalize_domain(raw) is None, f"{raw!r} must be rejected (removed alias)"


def test_whitespace_collapse():
    """Per spec, whitespace is trimmed and collapsed before alias lookup."""
    assert canonicalize_domain("  KARAOKE  ") == "KARAOKE"
    assert canonicalize_domain("  Karaoke  ") == "KARAOKE"
    assert canonicalize_domain("KARAOKE ") == "KARAOKE"
    assert canonicalize_domain(" Phòng thu âm ") == "PHONG_THU_AM"


def test_full_alias_matrix():
    _run_alias_matrix()