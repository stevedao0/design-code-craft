from __future__ import annotations

from pydantic import BaseModel


class ExportTemplateCandidate(BaseModel):
    kind: str
    path: str
    exists: bool
    source: str
    note: str | None = None


class ExportPlanContractSummary(BaseModel):
    id: int
    contract_no: str
    domain: str | None = None
    field_code: str | None = None
    domain_group: str | None = None


class ContractExportPlanResponse(BaseModel):
    ok: bool = True
    mode: str = "resolver_only"
    contract: ExportPlanContractSummary
    domain: str
    domain_label: str
    doc_type: str
    template_root: str
    output_root: str
    candidates: list[ExportTemplateCandidate]
    selected: ExportTemplateCandidate | None = None
    render_enabled: bool = False
    db_attach_enabled: bool = False
    warnings: list[str]
    file_write_performed: bool = False
    db_write_performed: bool = False
