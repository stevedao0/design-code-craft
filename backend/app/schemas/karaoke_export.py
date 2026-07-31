"""Pydantic schemas for Karaoke export preview functionality."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class KaraokeExportPreviewRequest(BaseModel):
    """Request schema for karaoke export preview endpoint."""

    include_calculation: bool = Field(
        default=True,
        description="Include full calculation result in response"
    )
    render_mode: str = Field(
        default="table",
        description="Render mode: 'table' or 'text'"
    )
    pricing_render_mode: str = Field(
        default="TABLE",
        description="Pricing block render mode: 'TABLE' or 'ROWS'"
    )
    effective_term_months: int | None = Field(
        default=None,
        description="Override effective term months (6 or 12). If None, auto-detect from contract dates."
    )
    include_6_month_option: bool = Field(
        default=False,
        description="If True, show both 6-month and 12-month total lines in pricing. If False, show only 12-month."
    )


class KaraokeExportPreviewResponse(BaseModel):
    """Response schema for karaoke export preview endpoint."""

    ok: bool = Field(default=True, description="Whether the operation succeeded")
    contract_id: int = Field(description="Contract ID")
    contract_no: str | None = Field(default=None, description="Contract number")
    domain: str = Field(default="KARAOKE", description="Domain code")
    domain_label: str = Field(default="Karaoke", description="Human-readable domain label")
    karaoke_type: str = Field(description="Karaoke type: PHONG or BOX")
    total_rooms: int = Field(default=0, description="Total number of rooms")
    total_boxes: int = Field(default=0, description="Total number of boxes")
    term_months: int = Field(default=12, description="Contract term in months")
    nguoi_thuc_hien_email: str = Field(default="", description="Executor email for {{nguoi_thuc_hien_email}} placeholder")
    khu_vuc_su_dung_nhac: str = Field(default="", description="Khu vuc su dung nhac preview text (e.g. '8 phòng')")
    render_context: dict[str, Any] = Field(
        default_factory=dict,
        description="Render context for DOCX block insertion"
    )
    calculation: dict[str, Any] | None = Field(
        default=None,
        description="Full calculation result if include_calculation=True"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "ok": True,
                "contract_id": 1234,
                "contract_no": "KARAOKE-2026-001",
                "domain": "KARAOKE",
                "domain_label": "Karaoke",
                "karaoke_type": "PHONG",
                "total_rooms": 8,
                "total_boxes": 0,
                "term_months": 12,
                "nguoi_thuc_hien_email": "nguoithuchien@example.com",
                "khu_vuc_su_dung_nhac": "8 phòng",
                "render_context": {
                    "room_display_text": "Tầng trệt\t02 phòng\nTên phòng\tA1, A2",
                    "pricing_detail_text": "Từ 1 đến 4 phòng: 4 phòng x 2,340,000 đồng x 1.50\t14,976,000 đồng\nTừ phòng thứ 5 đến 10: 4 phòng x 2,340,000 đồng x 1.20\t11,232,000 đồng",
                    "pricing_total_text": "Cộng\t26,208,000 đồng\nTiền Thuế GTGT 8.0%\t2,096,640 đồng\nTổng giá trị hợp đồng cho 12 tháng sử dụng\t28,304,640 đồng\nTổng giá trị hợp đồng cho 6 tháng sử dụng\t14,152,320 đồng\n(Bằng chữ: Hai mươi tám triệu ba trăm linh bốn nghìn sáu trăm bốn mươi đồng.)",
                    "karaoke_pricing_render_mode": "TABLE",
                    "tong_so_phong": 8,
                    "tong_so_box": 0,
                    "loai_hinh_karaoke": "PHONG",
                    "contract_term_months": 12,
                    "muc_luong_co_so": "2530000",
                    "nguoi_thuc_hien_email": "nguoithuchien@example.com",
                    "khu_vuc_su_dung_nhac": "8 phòng",
                    "so_tien_bang_chu": "(Bằng chữ: Hai mươi tám triệu ba trăm linh bốn nghìn sáu trăm bốn mươi đồng.)",
                },
                "calculation": {
                    "ok": True,
                    "mode": "background_karaoke_calculation_dry_run",
                    "calculation": {
                        "term_months": 12,
                        "tiers": [
                            {"name": "Bậc 1 (1-4 phòng)", "rooms": 4, "coefficient": 1.5, "amount": 14976000},
                            {"name": "Bậc 2 (5-10 phòng)", "rooms": 4, "coefficient": 1.2, "amount": 11232000},
                            {"name": "Bậc 3 (11+ phòng)", "rooms": 0, "coefficient": 1.05, "amount": 0},
                        ],
                        "total_amount": 28304640,
                        "effective_total_amount": 28304640,
                    },
                },
            }
        }
