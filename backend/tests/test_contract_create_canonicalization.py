"""Unit tests for canonicalize_domain resolution in contract_create.

Covers:
1. Module import (no NameError).
2. Karaoke / canonical aliases resolve correctly.
3. Empty / unknown domain raises HTTPException(422).
4. No raw fallback — never returns a non-canonical value.
5. field_code 'PR' / 'MR' resolve to themselves when known.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from fastapi import HTTPException  # noqa: E402

from app.services.contract_create import (  # noqa: E402
    _resolve_canonical_or_422,
    _resolve_field_code_or_422,
    build_contract_record_from_draft,
    insert_contract_record_simple,
)


def assert_eq(actual, expected, label):
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


def test_imports_present():
    assert callable(insert_contract_record_simple)
    assert callable(build_contract_record_from_draft)
    assert callable(_resolve_canonical_or_422)
    print("PASS test_imports_present")


def test_karaoke_alias_resolves_to_canonical():
    for raw in ("Karaoke", "karaoke", "KARAOKE", "  Karaoke  "):
        out = _resolve_canonical_or_422(raw=raw, field_label="linh_vuc")
        assert_eq(out, "KARAOKE", f"canonicalize({raw!r})")
    print("PASS test_karaoke_alias_resolves_to_canonical")


def test_khu_vui_choi_alias_resolves_to_canonical():
    for raw in ("Khu vui chơi", "khu vui choi", "KHU_VUI_CHOI", "khuvuichơi"):
        out = _resolve_canonical_or_422(raw=raw, field_label="linh_vuc")
        assert_eq(out, "KHU_VUI_CHOI", f"canonicalize({raw!r})")
    print("PASS test_khu_vui_choi_alias_resolves_to_canonical")


def test_phong_thu_am_alias_resolves_to_canonical():
    for raw in ("Phòng thu âm", "phong thu am", "PHONG_THU_AM", "studio"):
        out = _resolve_canonical_or_422(raw=raw, field_label="linh_vuc")
        assert_eq(out, "PHONG_THU_AM", f"canonicalize({raw!r})")
    print("PASS test_phong_thu_am_alias_resolves_to_canonical")


def test_background_alias_resolves_to_canonical():
    for raw in ("Nhạc nền", "background", "BACKGROUND", "nhac nen"):
        out = _resolve_canonical_or_422(raw=raw, field_label="linh_vuc")
        assert_eq(out, "BACKGROUND", f"canonicalize({raw!r})")
    print("PASS test_background_alias_resolves_to_canonical")


def test_field_code_pr_mr_pass_through():
    # 'PR' and 'MR' are suffix tags (contract scope), not canonical
    # domain codes. They must be accepted as-is.
    for raw in ("PR", "MR", "pr", "mr"):
        out = _resolve_field_code_or_422(raw=raw)
        assert out in ("PR", "MR"), f"expected PR/MR passthrough, got {out!r}"
    # Canonical domain codes are also accepted as field_code values
    for raw in ("KARAOKE", "KHU_VUI_CHOI"):
        out = _resolve_field_code_or_422(raw=raw)
        assert out == raw, f"expected {raw!r} passthrough, got {out!r}"
    print("PASS test_field_code_pr_mr_pass_through")


def test_field_code_unknown_rejected():
    for raw in ("XX", "BOGUS", "__X__"):
        try:
            _resolve_field_code_or_422(raw=raw)
        except HTTPException as e:
            if e.status_code != 422:
                raise AssertionError(f"expected 422, got {e.status_code}")
            continue
        raise AssertionError(f"expected 422 for unknown field_code {raw!r}")
    print("PASS test_field_code_unknown_rejected")


def test_empty_domain_raises_422():
    for raw in (None, "", "   "):
        try:
            _resolve_canonical_or_422(raw=raw, field_label="linh_vuc")
        except HTTPException as e:
            if e.status_code != 422:
                raise AssertionError(f"expected 422, got {e.status_code}")
            continue
        raise AssertionError(f"expected HTTPException 422 for {raw!r}")
    print("PASS test_empty_domain_raises_422")


def test_unknown_domain_raises_422():
    for raw in ("XYZ", "GIBBERISH_DOMAIN", "Foobar"):
        try:
            _resolve_canonical_or_422(raw=raw, field_label="linh_vuc")
        except HTTPException as e:
            if e.status_code != 422:
                raise AssertionError(f"expected 422, got {e.status_code}")
            assert "không thuộc danh mục" in e.detail, f"detail message: {e.detail}"
            continue
        raise AssertionError(f"expected HTTPException 422 for {raw!r}")
    print("PASS test_unknown_domain_raises_422")


def test_no_raw_fallback():
    """The old code did `canonicalize(raw) or raw`. Confirm that pattern is gone:
    unknown raw must NOT be returned as-is."""
    try:
        out = _resolve_canonical_or_422(raw="__UNKNOWN_RAW__", field_label="linh_vuc")
        raise AssertionError(f"expected 422, got {out!r}")
    except HTTPException as e:
        if e.status_code != 422:
            raise
    print("PASS test_no_raw_fallback")


if __name__ == "__main__":
    test_imports_present()
    test_karaoke_alias_resolves_to_canonical()
    test_khu_vui_choi_alias_resolves_to_canonical()
    test_phong_thu_am_alias_resolves_to_canonical()
    test_background_alias_resolves_to_canonical()
    test_field_code_pr_mr_pass_through()
    test_field_code_unknown_rejected()
    test_empty_domain_raises_422()
    test_unknown_domain_raises_422()
    test_no_raw_fallback()
    print("\nALL TESTS PASSED")
