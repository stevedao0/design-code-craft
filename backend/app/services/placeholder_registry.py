"""Placeholder Registry — Single Source of Truth for all DOCX placeholders.

RULES (STRICT):
1. All placeholder/sentinel/anchor strings used in code MUST come from this registry.
2. No magic strings (hard-coded "{{...}}" or "__...__") allowed outside this file.
3. Whitelist: this file (placeholder_registry.py) and test fixtures.
4. Every placeholder MUST have a defined type: text, table, block, inline, or legacy_alias.
5. All handlers use registry helpers — no hard-coded anchor strings in renderer code.

LAYERS:
  Template Layer  — {{placeholder_key}} in .docx files (filled by docxtpl)
  Sentinel Layer  — __SENTINEL__ injected by docxtpl, found+replaced by post-render handlers
  Context Layer   — Python dict keys passed to docxtpl or used by handlers

VERSIONING:
  REGISTRY_VERSION tracks schema changes. Must match in audit report.
"""

from __future__ import annotations

from typing import TypedDict

# =============================================================================
# REGISTRY VERSION
# =============================================================================
REGISTRY_VERSION = "v1.1"
REGISTRY_VERSION_DATE = "2026-07-28"


# =============================================================================
# PLACEHOLDER TYPES
# =============================================================================
class PlaceholderType:
    """Enum-like constants for placeholder types."""
    TEXT = "text"           # Simple text replacement — rendered directly by docxtpl
    TABLE = "table"         # Block table inserted by post-render handler
    BLOCK = "block"         # Multi-line block (text+table mix) inserted by handler
    INLINE = "inline"       # Inline value inserted by docxtpl
    LEGACY_ALIAS = "legacy_alias"  # Deprecated — kept for backward compat only


# =============================================================================
# HANDLER METADATA
# =============================================================================
class BlockHandler(TypedDict):
    """Metadata for a block-table handler function."""
    func_name: str
    data_context_key: str
    anchor_priority: list[str]


# =============================================================================
# PLACEHOLDER DEFINITION
# =============================================================================
class PlaceholderDef:
    """Immutable definition of one placeholder."""

    def __init__(
        self,
        *,
        key: str,
        template_placeholder: str,
        description: str,
        ph_type: str,
        block_handler: BlockHandler | None = None,
        context_key: str | None = None,
        sentinel: str | None = None,
        aliases: list[str] | None = None,
        data_source: str | None = None,
    ) -> None:
        self.key = key
        self.template_placeholder = template_placeholder
        self.description = description
        self.ph_type = ph_type
        self.block_handler = block_handler
        self.context_key = context_key or key
        self.sentinel = sentinel
        self.aliases = aliases or []
        self.data_source = data_source

    def all_anchors(self) -> list[str]:
        """Return all anchor strings to try, in priority order: canonical + aliases + sentinel."""
        anchors = [self.template_placeholder]
        for alias in self.aliases:
            if alias not in anchors:
                anchors.append(alias)
        if self.sentinel and self.sentinel not in anchors:
            anchors.append(self.sentinel)
        return anchors

    def is_canonical(self, value: str) -> bool:
        """Check if a string matches the canonical template placeholder."""
        return value == self.template_placeholder

    def is_known_alias(self, value: str) -> str | None:
        """Check if a string is a known alias. Returns alias name if found, None otherwise."""
        if value in self.aliases:
            return value
        if self.sentinel and value == self.sentinel:
            return self.sentinel
        return None

    def __repr__(self) -> str:
        return f"<PlaceholderDef {self.key} [{self.ph_type}] -> {self.template_placeholder}>"


# =============================================================================
# PLACEHOLDER REGISTRY
# =============================================================================
# Format:
#   key: unique identifier (snake_case)
#   template_placeholder: the {{...}} string IN the Word template
#   ph_type: TEXT | TABLE | BLOCK | INLINE | LEGACY_ALIAS
#   sentinel: __SENTINEL__ injected by docxtpl (runtime only)
#   context_key: key used in Python context dict
#   data_source: which context key holds the data for this placeholder
#   aliases: other strings that should also be recognized (legacy/backward-compat)
#   block_handler: metadata for the handler that replaces this placeholder
# =============================================================================

PLACEHOLDERS: dict[str, PlaceholderDef] = {


    # -------------------------------------------------------------------------
    # {{khu_vuc_su_dung_nhac}} — Khu Vực Sử Dụng Âm Nhạc
    #   Type: TABLE (auto-rendered into a Word table)
    #   Present in: ALL Background templates (KA, KVC, CP, NH, CSSK, etc.)
    #   Sentinel: __KARAOKE_ROOM_BLOCK__ (injected by docxtpl)
    #   Handler: insert_khu_vuc_and_tien_ban_quyen_blocks()
    #   Data: music_usage_areas (list[dict])
    #
    #   Flow:
    #     1. basic_ctx["khu_vuc_su_dung_nhac"] = sentinel -> docxtpl writes sentinel
    #     2. insert_khu_vuc_and_tien_ban_quyen_blocks() finds sentinel and replaces
    #        with a 3-column table: Vị trí | Quy mô | Hình thức
    # -------------------------------------------------------------------------
    "khu_vuc_su_dung_nhac": PlaceholderDef(
        key="khu_vuc_su_dung_nhac",
        template_placeholder="{{khu_vuc_su_dung_nhac}}",
        description="Khu Vực Sử Dụng Âm Nhạc — 3-column TABLE: Vị trí/khu vực, Quy mô sức chứa, Hình thức sử dụng",
        ph_type=PlaceholderType.TABLE,
        context_key="khu_vuc_su_dung_nhac",
        sentinel="__KARAOKE_ROOM_BLOCK__",
        data_source="music_usage_areas",
        block_handler={
            "func_name": "insert_khu_vuc_and_tien_ban_quyen_blocks",
            "data_context_key": "music_usage_areas",
            "anchor_priority": [
                "{{khu_vuc_su_dung_nhac}}",
                "__KARAOKE_ROOM_BLOCK__",
            ],
        },
        aliases=[
            # LEGACY aliases — kept for backward compat only
            "__KVC_USAGE_BLOCK__",
        ],
    ),


    # -------------------------------------------------------------------------
    # {{tien_ban_quyen}} — Tiền Bản Quyền (PRESERVED — manual fill)
    #   DEPRECATED since v1.1 — superseded by `royalty_table`.
    #   Kept for backward compatibility with the legacy
    #   export_template_contract_2.docx. New templates must use
    #   {{bang_tinh_tien_ban_quyen}} instead.
    # -------------------------------------------------------------------------
    "tien_ban_quyen": PlaceholderDef(
        key="tien_ban_quyen",
        template_placeholder="{{tien_ban_quyen}}",
        description="Tiền Bản Quyền — DEPRECATED, kept for legacy template_2 backward compat.",
        ph_type="preserved",  # PRESERVED — not auto-rendered
        context_key="tien_ban_quyen",
        sentinel=None,
        data_source=None,
        block_handler=None,
        aliases=[],
    ),
    # v1.1: deprecated metadata is exposed via helpers below.
    # To check deprecation programmatically use is_deprecated_placeholder().


    # -------------------------------------------------------------------------
    # v1.1 — {{bang_tinh_tien_ban_quyen}} — Bảng tính tiền bản quyền
    #   Type: TABLE (auto-rendered into a Word table by handler)
    #   Present in: ALL new Background templates (export_template_contract_1.docx,
    #               export_template_contract_2.docx)
    #   Sentinel: __ROYALTY_TABLE__
    #   Handler: render_royalty_table (replace sentinel with Word table block)
    #   Data: royalty_snapshot (royalties breakdown rows from backend dry-run)
    #
    #   Flow:
    #     1. basic_ctx["bang_tinh_tien_ban_quyen"] = sentinel -> docxtpl writes sentinel
    #     2. render_royalty_table() finds __ROYALTY_TABLE__ and replaces it
    #        with the auditable multi-tier royalty table.
    # -------------------------------------------------------------------------
    "royalty_table": PlaceholderDef(
        key="royalty_table",
        template_placeholder="{{bang_tinh_tien_ban_quyen}}",
        description="Bảng tính tiền bản quyền — TABLE: STT | Bậc tính | Số lượng | Hệ số | Cách tính | Thành tiền | (Tổng)",
        ph_type=PlaceholderType.TABLE,
        context_key="bang_tinh_tien_ban_quyen",
        sentinel="__ROYALTY_TABLE__",
        data_source="royalty_snapshot",
        block_handler={
            "func_name": "render_royalty_table",
            "data_context_key": "royalty_snapshot",
            "anchor_priority": [
                "{{bang_tinh_tien_ban_quyen}}",
                "__ROYALTY_TABLE__",
            ],
        },
        aliases=[],
    ),


    # -------------------------------------------------------------------------
    # Individual royalty field placeholders (for export_template_contract_1.docx)
    #   Type: TEXT
    #   Present in: export_template_contract_1.docx
    #   These are filled by fill_pricing_table_placeholders()
    # -------------------------------------------------------------------------
    "royalty_amount_before_vat": PlaceholderDef(
        key="royalty_amount_before_vat",
        template_placeholder="{{royalty_amount_before_vat}}",
        description="Tiền bản quyền trước thuế (individual TEXT field)",
        ph_type=PlaceholderType.TEXT,
        context_key="royalty_amount_before_vat",
        aliases=[],
    ),
    "vat_rate": PlaceholderDef(
        key="vat_rate",
        template_placeholder="{{vat_rate}}",
        description="Thuế GTGT % (individual TEXT field)",
        ph_type=PlaceholderType.TEXT,
        context_key="vat_rate",
        aliases=[],
    ),
    "vat_amount": PlaceholderDef(
        key="vat_amount",
        template_placeholder="{{vat_amount}}",
        description="Tiền thuế GTGT (individual TEXT field)",
        ph_type=PlaceholderType.TEXT,
        context_key="vat_amount",
        aliases=[],
    ),
    "royalty_amount_after_vat": PlaceholderDef(
        key="royalty_amount_after_vat",
        template_placeholder="{{royalty_amount_after_vat}}",
        description="Tổng tiền bản quyền sau thuế (individual TEXT field)",
        ph_type=PlaceholderType.TEXT,
        context_key="royalty_amount_after_vat",
        aliases=[],
    ),
    "royalty_amount_in_words": PlaceholderDef(
        key="royalty_amount_in_words",
        template_placeholder="{{royalty_amount_in_words}}",
        description="Tiền bản quyền bằng chữ (individual TEXT field)",
        ph_type=PlaceholderType.TEXT,
        context_key="royalty_amount_in_words",
        aliases=[],
    ),

    # -------------------------------------------------------------------------
    # Template 1 pricing table placeholders
    # -------------------------------------------------------------------------
    "total_rooms_text": PlaceholderDef(
        key="total_rooms_text",
        template_placeholder="{{total_rooms_text}}",
        description="Text describing total rooms (e.g., '15 phòng')",
        ph_type=PlaceholderType.TEXT,
        context_key="total_rooms_text",
        aliases=[],
    ),
    "tier_1_label": PlaceholderDef(
        key="tier_1_label",
        template_placeholder="{{tier_1_label}}",
        description="Tier 1 label (e.g., 'Từ 1 đến 4 phòng')",
        ph_type=PlaceholderType.TEXT,
        context_key="tier_1_label",
        aliases=[],
    ),
    "tier_2_label": PlaceholderDef(
        key="tier_2_label",
        template_placeholder="{{tier_2_label}}",
        description="Tier 2 label (e.g., 'Từ phòng thứ 5 đến 10')",
        ph_type=PlaceholderType.TEXT,
        context_key="tier_2_label",
        aliases=[],
    ),
    "tier_3_label": PlaceholderDef(
        key="tier_3_label",
        template_placeholder="{{tier_3_label}}",
        description="Tier 3 label (e.g., 'Từ phòng thứ 11 trở đi')",
        ph_type=PlaceholderType.TEXT,
        context_key="tier_3_label",
        aliases=[],
    ),
    "muc_luong_co_so": PlaceholderDef(
        key="muc_luong_co_so",
        template_placeholder="{{muc_luong_co_so}}",
        description="Base salary amount (e.g., '2.530.000')",
        ph_type=PlaceholderType.TEXT,
        context_key="muc_luong_co_so",
        aliases=[],
    ),
    "tier_1_coefficient": PlaceholderDef(
        key="tier_1_coefficient",
        template_placeholder="{{tier_1_coefficient}}",
        description="Tier 1 coefficient (e.g., '1,50')",
        ph_type=PlaceholderType.TEXT,
        context_key="tier_1_coefficient",
        aliases=[],
    ),
    "tier_2_coefficient": PlaceholderDef(
        key="tier_2_coefficient",
        template_placeholder="{{tier_2_coefficient}}",
        description="Tier 2 coefficient (e.g., '1,20')",
        ph_type=PlaceholderType.TEXT,
        context_key="tier_2_coefficient",
        aliases=[],
    ),
    "tier_3_coefficient": PlaceholderDef(
        key="tier_3_coefficient",
        template_placeholder="{{tier_3_coefficient}}",
        description="Tier 3 coefficient (e.g., '1,05')",
        ph_type=PlaceholderType.TEXT,
        context_key="tier_3_coefficient",
        aliases=[],
    ),
    "tier_unit": PlaceholderDef(
        key="tier_unit",
        template_placeholder="{{tier_unit}}",
        description="Tier unit (e.g., 'phòng/năm')",
        ph_type=PlaceholderType.TEXT,
        context_key="tier_unit",
        aliases=[],
    ),
    "tier_1_amount": PlaceholderDef(
        key="tier_1_amount",
        template_placeholder="{{tier_1_amount}}",
        description="Tier 1 amount after support",
        ph_type=PlaceholderType.TEXT,
        context_key="tier_1_amount",
        aliases=[],
    ),
    "tier_2_amount": PlaceholderDef(
        key="tier_2_amount",
        template_placeholder="{{tier_2_amount}}",
        description="Tier 2 amount after support",
        ph_type=PlaceholderType.TEXT,
        context_key="tier_2_amount",
        aliases=[],
    ),
    "tier_3_amount": PlaceholderDef(
        key="tier_3_amount",
        template_placeholder="{{tier_3_amount}}",
        description="Tier 3 amount after support",
        ph_type=PlaceholderType.TEXT,
        context_key="tier_3_amount",
        aliases=[],
    ),
    "urban_support_label": PlaceholderDef(
        key="urban_support_label",
        template_placeholder="{{urban_support_label}}",
        description="Urban support label (e.g., 'Mức hỗ trợ thu đô thị loại II')",
        ph_type=PlaceholderType.TEXT,
        context_key="urban_support_label",
        aliases=[],
    ),
    "urban_support_basis": PlaceholderDef(
        key="urban_support_basis",
        template_placeholder="{{urban_support_basis}}",
        description="Urban support legal basis (e.g., 'NĐ 134/2026/NĐ-CP')",
        ph_type=PlaceholderType.TEXT,
        context_key="urban_support_basis",
        aliases=[],
    ),
    "urban_support_rate": PlaceholderDef(
        key="urban_support_rate",
        template_placeholder="{{urban_support_rate}}",
        description="Urban support rate percentage (e.g., '50%')",
        ph_type=PlaceholderType.TEXT,
        context_key="urban_support_rate",
        aliases=[],
    ),
    "duration_months": PlaceholderDef(
        key="duration_months",
        template_placeholder="{{duration_months}}",
        description="Contract duration in months (e.g., '12')",
        ph_type=PlaceholderType.TEXT,
        context_key="duration_months",
        aliases=[],
    ),
    "karaoke_pricing_footer_note": PlaceholderDef(
        key="karaoke_pricing_footer_note",
        template_placeholder="{{karaoke_pricing_footer_note}}",
        description="Footer note for karaoke pricing",
        ph_type=PlaceholderType.TEXT,
        context_key="karaoke_pricing_footer_note",
        aliases=[],
    ),
}


# =============================================================================
# CONVENIENCE CONSTANTS
# =============================================================================
# For renderer/export code: import these instead of hard-coding strings
KHU_VUC_SU_DUNG_NHAC = PLACEHOLDERS["khu_vuc_su_dung_nhac"]
TIEN_BAN_QUYEN = PLACEHOLDERS["tien_ban_quyen"]


# =============================================================================
# HELPER API
# =============================================================================

def get_placeholder(key: str) -> PlaceholderDef | None:
    """Get placeholder definition by registry key."""
    return PLACEHOLDERS.get(key)


def get_aliases(key: str) -> list[str]:
    """Get all aliases (including sentinel) for a placeholder key."""
    p = PLACEHOLDERS.get(key)
    if p is None:
        return []
    aliases = list(p.aliases)
    if p.sentinel and p.sentinel not in aliases:
        aliases.append(p.sentinel)
    return aliases


def get_handler(key: str) -> BlockHandler | None:
    """Get block handler metadata for a placeholder key."""
    p = PLACEHOLDERS.get(key)
    if p is None:
        return None
    return p.block_handler


def get_anchors_for_key(key: str) -> list[str]:
    """Get all anchor strings (canonical + aliases + sentinel) in priority order."""
    p = PLACEHOLDERS.get(key)
    if p is None:
        return []
    return p.all_anchors()


def get_sentinel_for_key(key: str) -> str | None:
    """Get the sentinel string for a placeholder key."""
    p = PLACEHOLDERS.get(key)
    if p is None:
        return None
    return p.sentinel


def get_data_source_for_key(key: str) -> str | None:
    """Get the data source context key for a placeholder key."""
    p = PLACEHOLDERS.get(key)
    if p is None:
        return None
    return p.data_source


def get_type(key: str) -> str | None:
    """Get the placeholder type."""
    p = PLACEHOLDERS.get(key)
    if p is None:
        return None
    return p.ph_type


def find_placeholder_by_alias(alias: str) -> tuple[str, str] | None:
    """Find which placeholder key owns a given alias string.

    Returns: (registry_key, matched_alias_string) or None if not found.
    """
    for key, p in PLACEHOLDERS.items():
        if alias == p.template_placeholder:
            return (key, alias)
        if alias in p.aliases:
            return (key, alias)
        if p.sentinel and alias == p.sentinel:
            return (key, alias)
    return None


def is_known_placeholder(value: str) -> bool:
    """Check if a string is a known template placeholder (canonical or alias)."""
    return find_placeholder_by_alias(value) is not None


# =============================================================================
# v1.1 — Backward-compat helpers for tien_ban_quyen / royalty_table migration
# =============================================================================
DEPRECATED_PLACEHOLDERS: dict[str, dict[str, object]] = {
    "tien_ban_quyen": {
        "deprecated": True,
        "superseded_by": "royalty_table",
        "note": (
            "tien_ban_quyen was a manual-fill PRESERVED placeholder used by the legacy "
            "export_template_contract_2.docx. New templates MUST use {{bang_tinh_tien_ban_quyen}} "
            "(royalty_table). tien_ban_quyen is kept for backward compat only — do NOT remove "
            "from registry or older Word exports will fail leftover validation."
        ),
    },
}


def is_deprecated_placeholder(key: str) -> bool:
    """Return True if a placeholder is marked as deprecated (v1.1+)."""
    return key in DEPRECATED_PLACEHOLDERS


def get_superseded_by(key: str) -> str | None:
    """Return the replacement registry key if `key` is deprecated, else None."""
    entry = DEPRECATED_PLACEHOLDERS.get(key)
    if not entry:
        return None
    return entry.get("superseded_by") if isinstance(entry, dict) else None


# Templates that REQUIRE the new royalty_table placeholder.
# Dry-run will hard-fail (without fallback) if these templates miss the placeholder.
ROYALTY_TABLE_REQUIRED_TEMPLATES: frozenset[str] = frozenset({
    "export_template_contract_1.docx",
    "export_template_contract_2.docx",
})


def template_requires_royalty_table(template_filename: str) -> bool:
    """Return True if `template_filename` is one of the templates that MUST
    declare {{bang_tinh_tien_ban_quyen}}."""
    return template_filename in ROYALTY_TABLE_REQUIRED_TEMPLATES


def template_has_royalty_table_placeholder(template_xml: str) -> bool:
    """Return True if the supplied Word document XML contains the
    {{bang_tinh_tien_ban_quyen}} canonical placeholder."""
    return "{{bang_tinh_tien_ban_quyen}}" in template_xml


def assert_royalty_table_placeholder(template_filename: str, template_xml: str) -> None:
    """Raise ValueError if `template_filename` requires the new placeholder
    but the supplied XML does NOT contain it.

    The error message is intentionally exact so callers (and tests) can match it:
        Template chưa có {{bang_tinh_tien_ban_quyen}}
    """
    if template_requires_royalty_table(template_filename):
        if not template_has_royalty_table_placeholder(template_xml):
            raise ValueError(
                f"Template chưa có {{bang_tinh_tien_ban_quyen}}: {template_filename}"
            )


def all_template_placeholders() -> list[str]:
    """List all canonical template placeholder strings."""
    return [p.template_placeholder for p in PLACEHOLDERS.values()]


def all_aliases() -> list[str]:
    """List all alias strings (sentinels + legacy) from all placeholders."""
    aliases: list[str] = []
    for p in PLACEHOLDERS.values():
        aliases.extend(p.aliases)
        if p.sentinel and p.sentinel not in aliases:
            aliases.append(p.sentinel)
    return aliases


def all_sentinels() -> list[str]:
    """List all sentinel strings."""
    return [p.sentinel for p in PLACEHOLDERS.values() if p.sentinel]


def all_placeholder_keys() -> list[str]:
    """List all registry keys."""
    return list(PLACEHOLDERS.keys())


def is_table_placeholder(key: str) -> bool:
    """Check if a placeholder is of type TABLE."""
    p = PLACEHOLDERS.get(key)
    return p is not None and p.ph_type == PlaceholderType.TABLE


def is_block_placeholder(key: str) -> bool:
    """Check if a placeholder is of type BLOCK."""
    p = PLACEHOLDERS.get(key)
    return p is not None and p.ph_type == PlaceholderType.BLOCK


def is_text_placeholder(key: str) -> bool:
    """Check if a placeholder is of type TEXT."""
    p = PLACEHOLDERS.get(key)
    return p is not None and p.ph_type == PlaceholderType.TEXT


def is_preserved_placeholder(key: str) -> bool:
    """Check if a placeholder is of type preserved (manual fill, not auto-rendered)."""
    p = PLACEHOLDERS.get(key)
    return p is not None and p.ph_type == "preserved"


def is_rendered_placeholder(key: str) -> bool:
    """Check if a placeholder is auto-rendered (has a handler)."""
    p = PLACEHOLDERS.get(key)
    return p is not None and p.ph_type in (
        PlaceholderType.TABLE,
        PlaceholderType.BLOCK,
        PlaceholderType.TEXT,
    )


def should_report_as_leftover(placeholder: str) -> bool:
    """Determine if a placeholder should be flagged as leftover in validation.

    Returns False for PRESERVED placeholders — they are intentionally kept in output.
    """
    for key, p in PLACEHOLDERS.items():
        if placeholder == p.template_placeholder:
            return p.ph_type != "preserved"
    return True  # Unknown placeholders should always be reported


# =============================================================================
# VALIDATION — detect magic strings outside registry
# =============================================================================
# These are the ONLY strings that are allowed to appear as literals in code.
# All other "{{...}}" or "__...__" strings are forbidden.
ALLOWED_PLACEHOLDER_LITERALS = set()
ALLOWED_SENTINEL_LITERALS = set()

for p in PLACEHOLDERS.values():
    ALLOWED_PLACEHOLDER_LITERALS.add(p.template_placeholder)
    ALLOWED_PLACEHOLDER_LITERALS.update(p.aliases)
    if p.sentinel:
        ALLOWED_SENTINEL_LITERALS.add(p.sentinel)
