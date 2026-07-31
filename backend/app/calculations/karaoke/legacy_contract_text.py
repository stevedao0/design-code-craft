"""Karaoke contract-preview text adapter — Phase 2E.

Why this module exists
----------------------
``backend/app/services/contract_export_preview.py`` historically imported
``compute_karaoke_amounts``, ``build_pricing_detail_text``,
``build_pricing_total_text``, ``build_room_display_text`` and
``normalize_room_sections`` from the deprecated ``app.karaoke_calc`` facade
because the two text-builders (``build_pricing_detail_text`` and
``build_pricing_total_text``) consume a **legacy** dict shape
(``{detail_rows: [{label, count, coeff, subtotal, ...}], total_12_thang,
tong_vat, tong_cong_12_thang, ...}``).

The canonical calculator
(``app.calculations.karaoke.compute_karaoke_amounts``) returns a different
shape (``{detail_rows: [{label, room_count, formula, support_rate,
support_amount, net_amount}], so_tien_sau_ho_tro, thue_gtgt,
tong_gia_tri_hop_dong, ...}``) and produces Vietnamese-accented text that
breaks the DOCX preview byte-for-byte when substituted directly
(observed regression: "0 phong x 0 dong x 0").

This adapter:
  * calls the **canonical** calculator for all math (single source of
    truth, audit-correct per Nghị định 134/2026/NĐ-CP);
  * translates the canonical return dict into the legacy shape that the
    contract preview text-builders expect;
  * exposes pure ASCII text-builders that reproduce the legacy output
    formats exactly so that ``{{tien_ban_quyen}}`` and friends in
    ``export_template_contract_2.docx`` keep rendering identically.

Hard constraints
----------------
* No DB access.
* No DOCX template access.
* No PDF / frontend access.
* No formula change. All math comes from the canonical calculator.
* No deletion of ``backend/app/karaoke_calc.py`` — this is Phase 2E,
  the legacy facade must remain for
  ``karaoke_export_service.py`` / ``karaoke_old_app_direct_flow.py`` /
  ``calculations/karaoke/calculator.py`` / ``calculations/karaoke/docx_context.py``
  that still import from it.
* No hard-coded totals. All money values come from canonical outputs.
* No ``pricing_snapshot`` integration.
* No ``total_rooms_text`` auto-sum from ``music_usage_areas``.
"""

from __future__ import annotations

from typing import Any

from app.calculations.common.money import format_money_vn, format_coeff_vn
from app.calculations.karaoke import compute_karaoke_amounts as _canonical_compute
from app.calculations.karaoke.support import urban_support_label


__all__ = [
    "compute_contract_preview_karaoke_amounts",
    "build_legacy_pricing_detail_text_from_canonical",
    "build_legacy_pricing_total_text_from_canonical",
]


# ----------------------------------------------------------------------------
# 1. Adapter: canonical calc dict -> legacy calc dict
# ----------------------------------------------------------------------------
def _canonical_to_legacy_calc(
    *,
    canonical: dict[str, Any],
    karaoke_type: str,
    area_group: str,
    total_rooms: int,
    total_box: int,
    base_salary: int,
    support_percent: float,
    vat_percent: float,
    row_support_bac_1: float,
    row_support_bac_2: float,
    row_support_bac_3: float,
    effective_term_months: int,
) -> dict[str, Any]:
    """Translate the canonical ``compute_karaoke_amounts`` return dict into
    the legacy shape consumed by ``build_pricing_detail_text`` /
    ``build_pricing_total_text``.

    The translation is **structural only** — all numeric values come from the
    canonical calculator, no formula is duplicated.
    """
    coeffs = (
        canonical.get("he_so_1", 0.0),
        canonical.get("he_so_2", 0.0),
        canonical.get("he_so_3", 0.0),
    )
    tier_amounts = (
        canonical.get("tien_bac_1", 0),
        canonical.get("tien_bac_2", 0),
        canonical.get("tien_bac_3", 0),
    )
    tier_room_counts = (
        canonical.get("bac_1", 0),
        canonical.get("bac_2", 0),
        canonical.get("bac_3", 0),
    )
    canonical_kind = str(canonical.get("karaoke_type", "")).upper()
    canonical_box_count = int(canonical.get("total_box", 0))

    legacy_detail_rows: list[dict[str, Any]] = []
    if canonical_kind == "BOX":
        if canonical_box_count > 0:
            legacy_detail_rows.append({
                "label": "Box",
                "count": canonical_box_count,
                "coeff": coeffs[0],
                "amount_per_room": base_salary,
                "subtotal": tier_amounts[0],
                "support": 0,
                "support_percent": support_percent,
            })
    else:
        t1, t2, t3 = tier_room_counts
        if t1 > 0:
            legacy_detail_rows.append({
                "label": f"Tu 1 den {t1} phong",
                "count": t1,
                "coeff": coeffs[0],
                "amount_per_room": base_salary,
                "subtotal": tier_amounts[0],
                "support": 0,
                "support_percent": support_percent,
            })
        if t2 > 0:
            legacy_detail_rows.append({
                "label": f"Tu {t1 + 1} den {t1 + t2} phong",
                "count": t2,
                "coeff": coeffs[1],
                "amount_per_room": base_salary,
                "subtotal": tier_amounts[1],
                "support": 0,
                "support_percent": support_percent,
            })
        if t3 > 0:
            legacy_detail_rows.append({
                "label": f"Tu {t1 + t2 + 1} tro len",
                "count": t3,
                "coeff": coeffs[2],
                "amount_per_room": base_salary,
                "subtotal": tier_amounts[2],
                "support": 0,
                "support_percent": support_percent,
            })

    total_12 = int(canonical.get("so_tien_sau_ho_tro", 0))
    tong_vat = int(canonical.get("thue_gtgt", 0))
    tong_cong_12 = int(canonical.get("tong_gia_tri_hop_dong", 0))
    tong_cong_6 = int(canonical.get("tong_gia_tri_hop_dong_6_thang", 0))
    so_tien_bang_chu = str(canonical.get("so_tien_bang_chu", "") or "")

    # Legacy 6-month column: if canonical didn't emit a non-zero 6-month
    # value but the 12-month one is positive, expose half of 12 (mirrors the
    # legacy facade contract that contract_export_preview has been reading
    # since Phase 2B).
    if tong_cong_6 == 0 and total_12 > 0:
        tong_cong_6 = total_12 // 2

    return {
        "karaoke_type": karaoke_type,
        "area_group": area_group,
        "total_rooms": total_rooms,
        "total_box": total_box,
        "base_salary": base_salary,
        "support_percent": support_percent,
        "vat_percent": vat_percent,
        "detail_rows": legacy_detail_rows,
        # Legacy aggregate keys (audit-correct values from canonical).
        "total_12_thang": total_12,
        "total_6_thang": tong_cong_6,
        "tong_vat": tong_vat,
        "tong_cong_12_thang": tong_cong_12,
        "tong_cong_6_thang": tong_cong_6,
        "so_tien_bang_chu": so_tien_bang_chu,
        "effective_term_months": effective_term_months,
        # Canonical keys are also exposed for callers that want them.
        "_canonical": canonical,
    }


def compute_contract_preview_karaoke_amounts(
    *,
    karaoke_type: str,
    area_group: str,
    total_rooms: int,
    total_box: int,
    base_salary: int,
    support_percent: float,
    vat_percent: float,
    row_support_bac_1: float = 0.0,
    row_support_bac_2: float = 0.0,
    row_support_bac_3: float = 0.0,
    effective_term_months: int | None = None,
) -> dict[str, Any]:
    """Drop-in replacement for the legacy ``compute_karaoke_amounts`` facade
    call site used by ``contract_export_preview.py`` synthetic builders.

    Same call signature as ``app.karaoke_calc.compute_karaoke_amounts`` so
    existing call sites can switch imports without changing argument
    lists.

    Returns the legacy dict shape (so that ``build_pricing_detail_text`` /
    ``build_pricing_total_text`` below keep reading the same keys), but
    every numeric value originates from the canonical calculator — no
    formula is duplicated.
    """
    if effective_term_months is None:
        effective_term_months = 12

    canonical = _canonical_compute(
        karaoke_type=karaoke_type,
        area_group=area_group,
        total_rooms=total_rooms,
        total_box=total_box,
        muc_luong_co_so=base_salary,
        ty_le_ho_tro=support_percent,
        gtgt_percent=vat_percent,
        ty_le_ho_tro_bac_1=row_support_bac_1,
        ty_le_ho_tro_bac_2=row_support_bac_2,
        ty_le_ho_tro_bac_3=row_support_bac_3,
        effective_term_months=effective_term_months,
    )

    return _canonical_to_legacy_calc(
        canonical=canonical,
        karaoke_type=karaoke_type,
        area_group=area_group,
        total_rooms=total_rooms,
        total_box=total_box,
        base_salary=base_salary,
        support_percent=support_percent,
        vat_percent=vat_percent,
        row_support_bac_1=row_support_bac_1,
        row_support_bac_2=row_support_bac_2,
        row_support_bac_3=row_support_bac_3,
        effective_term_months=effective_term_months,
    )


# ----------------------------------------------------------------------------
# 2. Legacy ASCII pricing-detail text builder
# ----------------------------------------------------------------------------
def build_legacy_pricing_detail_text_from_canonical(
    calc: dict[str, Any],
    *,
    base_salary: int,
) -> str:
    """Reproduce the legacy ``build_pricing_detail_text`` ASCII output.

    Expected format (per row):

        ``Tu 1 den 4 phong: 4 phong x 2,530,000 dong x 1.5\\t15,180,000 dong``

    Multi-row output is joined with ``\\n``.

    Rows whose ``count`` is 0 are NOT rendered — that is what prevented the
    "0 phong x 0 dong x 0" regression when callers passed synthetic inputs
    with empty tiers. The legacy builder also skipped zero-count rows
    implicitly because the legacy facade only appended rows whose tier
    count was positive, so this behaviour is preserved here.
    """
    lines: list[str] = []
    detail_rows = calc.get("detail_rows", [])

    for row in detail_rows:
        label = str(row.get("label", ""))
        count = int(row.get("count", 0) or 0)
        coeff = float(row.get("coeff", 0.0) or 0.0)
        subtotal = int(row.get("subtotal", 0) or 0)

        # Skip zero-count rows so empty tiers never produce
        # "0 phong x 0 dong x 0" lines.
        if count <= 0:
            continue

        detail_line = (
            f"{label}: "
            f"{count} phong x {format_money_vn(base_salary)} dong x {format_coeff_vn(coeff)}"
        )
        total_line = f"{format_money_vn(subtotal)} dong"

        lines.append(f"{detail_line}\t{total_line}")

    return "\n".join(lines)


# ----------------------------------------------------------------------------
# 3. Legacy ASCII pricing-total text builder
# ----------------------------------------------------------------------------
def build_legacy_pricing_total_text_from_canonical(
    calc: dict[str, Any],
    *,
    support_percent: float,
    vat_percent: float,
    support_year: int | None = None,
    effective_term_months: int | None = 12,
) -> str:
    """Reproduce the legacy ``build_pricing_total_text`` ASCII output.

    Expected format (line list, joined by ``\\n``):

        ``<Muc thu ... or year-specific label>\\tNN,NNN,NNN đồng``
        ``Cong\\tNN,NNN,NNN dong``
        ``GTGT 8.0%\\tNN,NNN,NNN dong``
        ``Tong gia tri hop dong cho 12 thang\\tNN,NNN,NNN dong``
        ``Tong gia tri hop dong cho 6 thang\\tNN,NNN,NNN dong``  (when applicable)
        ``(Bang chu: <vietnamese words>)``

    Money unit style is preserved exactly as the legacy output:
      * support label line uses ``đồng`` (with diacritics)
      * subtotal/VAT/total lines use ``dong`` (ASCII)
      * "Bang chu" line uses ASCII parentheses
    """
    if effective_term_months is None:
        effective_term_months = 12

    lines: list[str] = []

    total_12 = int(calc.get("total_12_thang", 0) or 0)
    total_6 = int(calc.get("total_6_thang", 0) or 0)
    tong_vat = int(calc.get("tong_vat", 0) or 0)
    tong_cong_12 = int(calc.get("tong_cong_12_thang", 0) or 0)
    tong_cong_6 = int(calc.get("tong_cong_6_thang", 0) or 0)
    so_tien_bang_chu = str(calc.get("so_tien_bang_chu", "") or "")

    # Support line (if applicable). Uses the bucketed urban-support label
    # so each rate (100/80/50/20/10) maps to its own Nghị định 134/2026
    # wording. At 100% the label is "Mức thu ..."; at any value <100 the
    # label includes "đô thị loại I/II/III" or "vùng sâu, vùng xa, vùng
    # đặc biệt khó khăn".
    if support_percent and support_percent > 0:
        label = urban_support_label(support_percent)
        lines.append(f"{label}\t{format_money_vn(total_12)} đồng")

    # Subtotal line.
    lines.append(f"Cong\t{format_money_vn(total_12)} dong")

    # VAT line.
    if vat_percent and vat_percent > 0:
        vat_line = f"GTGT {vat_percent}%\t{format_money_vn(tong_vat)} dong"
        lines.append(vat_line)

    # Total for the effective term.
    lines.append(
        f"Tong gia tri hop dong cho {effective_term_months} thang"
        f"\t{format_money_vn(tong_cong_12)} dong"
    )

    # Total for 6 months (only when the term is 12 and we have a positive
    # 6-month aggregate).
    if effective_term_months == 12 and tong_cong_6 > 0:
        lines.append(
            f"Tong gia tri hop dong cho 6 thang"
            f"\t{format_money_vn(tong_cong_6)} dong"
        )

    # Vietnamese words representation (ASCII parentheses).
    if so_tien_bang_chu:
        lines.append(f"(Bang chu: {so_tien_bang_chu})")

    return "\n".join(lines)