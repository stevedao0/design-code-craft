"""Urban-support helpers for Karaoke.

This module is the canonical home for the bucketed urban-support label
(Nghị định 134/2026/NĐ-CP wording). It exists as a separate sub-module so
that both the legacy `app.karaoke_calc` facade and the modular
`app.calculations.karaoke` package can import the same source of truth.

Behavioral contract is established by Phase 1.1:
- 100% is full collected tax ("Mức thu") — NOT "hỗ trợ thu".
- 80% → đô thị loại I, 50% → đô thị loại II, 20% → đô thị loại III.
- 10% → vùng sâu, vùng xa, vùng đặc biệt khó khăn.
- Other <100 → generic "Mức hỗ trợ thu theo Nghị định 134/2026/NĐ-CP".

Do NOT introduce new calculator semantics here. The semantic gap between
legacy `compute_karaoke_amounts` (additive support) and the modular
calculator (subtractive support) is unresolved and is tracked separately.
This module only owns the label bucketing — a pure de-dup of helpers that
already agreed on the same wording in two places.
"""

from __future__ import annotations

from typing import Any, Optional

from .calculator import compute_karaoke_amounts as _canonical_compute_karaoke_amounts
from app.calculations.common.money import money_to_vietnamese_words


def urban_support_label(percent: float) -> str:
    """Map an urban-support percentage to its Nghị định 134/2026/NĐ-CP label.

    At 100% the rate is the full collected tax — the wording is "Mức thu",
    not "Mức hỗ trợ thu". Below 100%, the rate is bucketed into the
    categories defined by the decree.

    Parameters
    ----------
    percent : float
        Support rate as a percentage in [0, 100]. Any negative or
        non-finite value falls through to the generic fallback.

    Returns
    -------
    str
        The Vietnamese label appropriate for the rate.
    """
    try:
        p = float(percent)
    except (TypeError, ValueError):
        p = 0.0

    if p >= 100:
        return "Mức thu theo Nghị định 134/2026/NĐ-CP"
    if p >= 80:
        return "Mức hỗ trợ thu đô thị loại I theo Nghị định 134/2026/NĐ-CP"
    if p >= 50:
        return "Mức hỗ trợ thu đô thị loại II theo Nghị định 134/2026/NĐ-CP"
    if p >= 20:
        return "Mức hỗ trợ thu đô thị loại III theo Nghị định 134/2026/NĐ-CP"
    if p >= 10:
        return (
            "Mức hỗ trợ thu vùng sâu, vùng xa, vùng đặc biệt khó khăn "
            "theo Nghị định 134/2026/NĐ-CP"
        )
    return "Mức hỗ trợ thu theo Nghị định 134/2026/NĐ-CP"


def compute_karaoke_amounts_with_urban_support(
    *,
    karaoke_type: str,
    area_group: str,
    total_rooms: int,
    total_box: int,
    base_salary: int,
    urban_support_percent: float,
    vat_percent: float,
    effective_term_months: Optional[int] = None,
) -> dict[str, Any]:
    """Compute karaoke pricing with audit-correct urban support semantics.

    Canonical home (Phase 2C). This is the same audit-correct math that
    lives in ``app.calculations.karaoke.compute_karaoke_amounts`` but exposed
    with the legacy "urban-support" parameter names and return-dict shape
    that the DOCX-template fill code (and a few service callers) still use.

    Audit-correct math (Nghị định 134/2026/NĐ-CP):

        raw_subtotal        = sum(tier amounts)
        amount_after_support= raw_subtotal * urban_support_percent / 100
        vat_amount          = amount_after_support * vat_percent / 100
        total_amount        = amount_after_support + vat_amount

    ``urban_support_percent`` is interpreted as the tax COLLECTION rate
    (100% = collect full, 0% = collect nothing).

    Raises:
        ValueError: If ``urban_support_percent`` is outside [0, 100].
    """
    if urban_support_percent < 0 or urban_support_percent > 100:
        raise ValueError(
            f"urban_support_percent must be between 0 and 100, got {urban_support_percent}"
        )

    if effective_term_months is None:
        effective_term_months = 12

    canonical = _canonical_compute_karaoke_amounts(
        karaoke_type=karaoke_type,
        area_group=area_group,
        total_rooms=total_rooms,
        total_box=total_box,
        muc_luong_co_so=base_salary,
        ty_le_ho_tro=urban_support_percent,
        gtgt_percent=vat_percent,
        effective_term_months=effective_term_months,
    )

    raw_subtotal = int(canonical.get("tong_truoc_ho_tro", 0))
    amount_after_support = int(canonical.get("so_tien_sau_ho_tro", 0))
    vat_amount = int(canonical.get("thue_gtgt", 0))
    amount_after_vat = amount_after_support + vat_amount

    # Translate canonical tier shape to the legacy "tiers" list shape.
    tier_labels = {
        "bac_1": "Từ 1 đến 4 phòng",
        "bac_2": "Từ phòng thứ 5 đến 10",
        "bac_3": "Từ phòng thứ 11 trở đi",
    }
    if str(canonical.get("karaoke_type", "")).upper() == "BOX":
        tier_labels = {"bac_1": "Box Karaoke", "bac_2": "", "bac_3": ""}

    tiers: list[dict[str, Any]] = []
    if canonical.get("bac_1", 0) > 0 or canonical.get("total_box", 0) > 0:
        tiers.append({
            "tier": 1,
            "label": tier_labels["bac_1"],
            "rooms": canonical.get("bac_1", canonical.get("total_box", 0)),
            "coefficient": canonical.get("he_so_1", 0.0),
            "amount": canonical.get("tien_bac_1", 0),
        })
    if canonical.get("bac_2", 0) > 0:
        tiers.append({
            "tier": 2,
            "label": tier_labels["bac_2"],
            "rooms": canonical.get("bac_2", 0),
            "coefficient": canonical.get("he_so_2", 0.0),
            "amount": canonical.get("tien_bac_2", 0),
        })
    if canonical.get("bac_3", 0) > 0:
        tiers.append({
            "tier": 3,
            "label": tier_labels["bac_3"],
            "rooms": canonical.get("bac_3", 0),
            "coefficient": canonical.get("he_so_3", 0.0),
            "amount": canonical.get("tien_bac_3", 0),
        })

    return {
        "karaoke_type": karaoke_type,
        "area_group": area_group,
        "total_rooms": total_rooms,
        "total_box": total_box,
        "base_salary": base_salary,
        "tiers": tiers,
        "total_before_support": raw_subtotal,
        "urban_support_percent": urban_support_percent,
        "urban_support_label": urban_support_label(urban_support_percent),
        "urban_support_basis": "NĐ 134/2026/NĐ-CP",
        "amount_after_support": amount_after_support,
        "vat_percent": vat_percent,
        "vat_amount": vat_amount,
        "amount_after_vat": amount_after_vat,
        "amount_in_words": money_to_vietnamese_words(amount_after_vat),
        "effective_term_months": effective_term_months,
    }


__all__ = ["urban_support_label", "compute_karaoke_amounts_with_urban_support"]