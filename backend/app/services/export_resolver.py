"""Export template resolver for Background contracts.

This module resolves export templates based on business domain.
Uses the centralized business_domains registry for all domain mappings.

Phase BACKGROUND-TEMPLATE-REFACTOR:
- Uses contract_template_code (TEMPLATE_1 or TEMPLATE_2) from DB row
- Falls back to TEMPLATE_1 if not set
- Maps TEMPLATE_1 -> export_template_contract_1.docx
- Maps TEMPLATE_2 -> export_template_contract_2.docx
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterable

from ..core.config import settings
from ..core.business_domains import (
    DOMAIN_REGISTRY,
    DOMAIN_KARAOKE,
    DOMAIN_PHONG_THU_AM,
    get_domain_config,
    resolve_domain_code,
)
from ..models.contracts import ContractRecordRow
from ..schemas.export import (
    ContractExportPlanResponse,
    ExportPlanContractSummary,
    ExportTemplateCandidate,
)

logger = logging.getLogger("uvicorn.error")

# Phase BACKGROUND-TEMPLATE-REFACTOR: Template code to filename mapping
TEMPLATE_CODE_TO_FILENAME: dict[str, str] = {
    "TEMPLATE_1": "export_template_contract_1.docx",
    "TEMPLATE_2": "export_template_contract_2.docx",
}


def _candidate(
    template_root: Path,
    kind: str,
    relative_path: str,
    note: str | None = None,
) -> ExportTemplateCandidate:
    path = template_root / Path(relative_path)
    return ExportTemplateCandidate(
        kind=kind,
        path=str(path),
        exists=path.is_file(),
        source="new_app_template_root",
        note=note,
    )


def resolve_template_candidates(
    *,
    domain: str,
    doc_type: str = "contract",
    template_root: str | Path | None = None,
    bd_ticket_mode: str | None = None,
) -> list[ExportTemplateCandidate]:
    """Resolve template candidates for a domain using the centralized registry."""
    root = Path(template_root or settings.export_template_root)
    if doc_type != "contract":
        return []

    config = get_domain_config(domain)
    if not config or not config.template_filename:
        return []

    relative_path = f"Background\\{config.template_filename}"
    candidate = _candidate(root, "docx", relative_path)
    return [candidate]


def _first_existing(candidates: Iterable[ExportTemplateCandidate]) -> ExportTemplateCandidate | None:
    return next((candidate for candidate in candidates if candidate.exists), None)


def resolve_contract_export_plan(
    *,
    row: ContractRecordRow,
    doc_type: str = "contract",
) -> ContractExportPlanResponse:
    """Resolve export plan for a contract row.

    Phase BACKGROUND-TEMPLATE-REFACTOR:
    - Uses contract_template_code from row (TEMPLATE_1 or TEMPLATE_2)
    - Falls back to TEMPLATE_1 if not set
    - Maps to export_template_contract_1.docx or export_template_contract_2.docx
    """
    # Use the new registry for domain resolution
    domain_code, domain_config = resolve_domain_code(
        domain=row.linh_vuc,
        field_code=row.field_code,
        domain_group=row.domain_group,
        display=row.linh_vuc_hien_thi,
    )

    # Get display name from config or fallback
    if domain_config:
        display_name = domain_config.display_name
        canonical_code = domain_config.code
    else:
        display_name = domain_code.title() if domain_code else "Unknown"
        canonical_code = domain_code

    # Phase BACKGROUND-TEMPLATE-REFACTOR: Use contract_template_code for template selection
    template_code = str(row.contract_template_code or "TEMPLATE_1").upper()
    if template_code not in TEMPLATE_CODE_TO_FILENAME:
        template_code = "TEMPLATE_1"

    template_filename = TEMPLATE_CODE_TO_FILENAME[template_code]
    root = Path(settings.export_template_root)
    relative_path = f"Background\\{template_filename}"
    candidates = [_candidate(root, "docx", relative_path)]
    selected = _first_existing(candidates)

    warnings: list[str] = []
    if not candidates:
        warnings.append("No template candidates are configured for this domain.")
    elif selected is None:
        warnings.append(
            f"No template file exists for code '{template_code}' "
            f"at {settings.export_template_root}\\Background\\"
        )
        # List available templates
        bg_path = Path(settings.export_template_root) / "Background"
        if bg_path.exists():
            existing = [f.name for f in bg_path.iterdir() if f.suffix == ".docx"]
            if existing:
                warnings.append(f"Available templates: {', '.join(existing)}")

    return ContractExportPlanResponse(
        contract=ExportPlanContractSummary(
            id=int(row.id),
            contract_no=str(row.contract_no or ""),
            domain=row.linh_vuc_hien_thi or row.linh_vuc,
            field_code=row.field_code,
            domain_group=row.domain_group,
        ),
        domain=canonical_code,
        domain_label=display_name,
        doc_type=doc_type,
        template_root=str(Path(settings.export_template_root)),
        output_root=str(Path(settings.export_output_root)),
        candidates=candidates,
        selected=selected,
        render_enabled=bool(settings.export_render_enabled),
        db_attach_enabled=bool(settings.export_db_attach_enabled),
        warnings=warnings,
        file_write_performed=False,
        db_write_performed=False,
    )
