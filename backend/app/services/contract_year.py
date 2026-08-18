"""Unified contract_year helper.

Single source of truth for "which reporting year does this contract belong
to?" across the entire VCPMC backend.

Rule (per project spec):
    The reporting year is the 4-digit year token that appears between
    slashes inside ``contract_records.contract_no``. Examples:

        0798/2026/HĐQTGAN-PN/PR  -> 2026
        001/2025/KARAOKE          -> 2025
        VCPMC/88/2026/HD          -> 2026

    The signed date, created/updated date, ``contract_year``, and annex
    dates are NEVER used to determine the reporting year.

    If no valid /YYYY/ segment exists in [1990, 2100], the row is
    considered ``unresolved`` and MUST NOT silently fall back to any
    other column. Such rows are excluded from the reporting window
    but reported in the unresolved diagnostic count.

The helper is available both as a pure-Python function
(``parse_contract_year``) and as a SQL expression
(``contract_year_sql_expression``) so that:
  * in-memory list filtering (e.g. ``_load_canonical_rows_for_year``)
    uses the Python form;
  * database-side raw SQL queries (e.g. ``reports.py`` aggregations)
    use the SQL form.

Both produce identical results on identical inputs.
"""
from __future__ import annotations

import re
from typing import Iterable

from sqlalchemy import case, cast, Integer, or_, literal
from sqlalchemy.sql import ColumnElement


# ── Constants ────────────────────────────────────────────────────────────────

# Inclusive range of plausible contract-year tokens. Anything outside
# this window is treated as "not a year" (avoids matching sequence
# numbers like '9991' or '3141').
MIN_YEAR = 1990
MAX_YEAR = 2100

_YEAR_SEGMENT = r"/(\d{4})/"


# ── Python parser ────────────────────────────────────────────────────────────

# Pre-compiled regex. ``re.search`` is fine here because the year segment
# appears anywhere between slashes; we still post-validate the numeric
# range so that 4-digit sequence tokens are never mistaken for years.
def parse_contract_year(contract_no: str | None) -> int | None:
    """Return the reporting year token inside ``contract_no`` or None.

    Whitespace around the year segment is ignored. Leading and trailing
    whitespace on the whole string is ignored.
    """
    if not contract_no:
        return None
    s = str(contract_no).strip()
    if not s:
        return None
    # Scan all /YYYY/ candidates; take the LAST one that falls in range.
    # Multiple matches can occur on malformed inputs like
    # "VCPMC/88/2026/HD" (88 is 2-digit, fine) or
    # "9991/2026/HĐ" (9991 is 4-digit but out-of-range).
    candidate: int | None = None
    for m in re.finditer(_YEAR_SEGMENT, s):
        token = m.group(1).strip()
        try:
            yr = int(token)
        except ValueError:
            continue
        if MIN_YEAR <= yr <= MAX_YEAR:
            candidate = yr  # keep last valid candidate
    return candidate


# ── SQL expression ───────────────────────────────────────────────────────────
#
# Strategy:
#   * PostgreSQL: ``regexp_matches`` on `'(^|/)(\d{4})(/|$)'` and
#     pick the LAST match where the value lies in [MIN_YEAR, MAX_YEAR].
#     Implemented as a single CASE expression to keep it inline.
#
#   * The CASE chain enumerates up to 6 candidate positions (sufficient
#     for any sane contract_no — max 4 segments observed in production).

def contract_year_sql_expression(contract_no_col) -> ColumnElement:
    """Return a SQLAlchemy expression that yields the parsed year (int) or NULL.

    The expression walks up to 6 candidate positions (right-to-left) and
    returns the first 4-digit token between slashes that falls inside
    ``[MIN_YEAR, MAX_YEAR]``. Uses PostgreSQL ``regexp_substr``.
    """
    from sqlalchemy import literal_column

    col_label = contract_no_col.key if hasattr(contract_no_col, "key") else None
    col_str = col_label if col_label else str(contract_no_col).split(".")[-1]
    if col_str.startswith("Column "):
        col_str = col_str.split(".")[-1]

    arms = []
    for n in range(6, 0, -1):
        sub = f"regexp_substr({col_str}, '/(\\d{{4}})/', 1, {n})"
        inner = f"substring({sub} FROM 2 FOR 4)"
        arms.append(
            f"WHEN ({sub} IS NOT NULL AND ({inner})::int BETWEEN {MIN_YEAR} AND {MAX_YEAR}) "
            f"THEN ({inner})::int"
        )
    sql = "CASE " + " ".join(arms) + " ELSE NULL END"
    return literal_column(sql)


def contract_year_eq(contract_no_col, year: int):
    """Build a SQLAlchemy boolean expression that selects rows whose
    ``contract_no`` carries the given reporting year token. Use this
    in place of ``ContractRecordRow.contract_year == year`` everywhere.
    """
    return contract_year_sql_expression(contract_no_col) == year


def contract_year_le(contract_no_col, year: int):
    """Same as ``contract_year_eq`` but with a ``<=`` comparison. Used
    for renewals queries that select contracts signed in or before the
    reporting year.
    """
    return contract_year_sql_expression(contract_no_col) <= year


# ── Diagnostic counters ──────────────────────────────────────────────────────


def diagnose(contract_nos: Iterable[str | None]) -> dict:
    """Return a small diagnostic dict for an iterable of contract_no values.

    Useful for endpoint responses that want to surface how many rows were
    excluded due to missing year tokens.
    """
    total = 0
    resolved = 0
    unresolved = 0
    by_year: dict[int, int] = {}
    for cn in contract_nos:
        total += 1
        yr = parse_contract_year(cn)
        if yr is None:
            unresolved += 1
        else:
            resolved += 1
            by_year[yr] = by_year.get(yr, 0) + 1
    return {
        "total": total,
        "resolved": resolved,
        "unresolved": unresolved,
        "by_year": dict(sorted(by_year.items())),
    }