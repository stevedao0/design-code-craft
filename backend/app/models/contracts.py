from __future__ import annotations

from datetime import date
import json

from sqlalchemy import BigInteger, Boolean, Date, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class ContractRecordRow(Base):
    __tablename__ = "contract_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contract_no: Mapped[str] = mapped_column(String(128), nullable=False)
    contract_year: Mapped[int] = mapped_column(Integer, nullable=False)
    annex_no: Mapped[str | None] = mapped_column(String(64), nullable=True)

    don_vi_ten: Mapped[str | None] = mapped_column(String(255), nullable=True)
    don_vi_dia_chi: Mapped[str | None] = mapped_column(Text, nullable=True)
    don_vi_dien_thoai: Mapped[str | None] = mapped_column(String(255), nullable=True)
    don_vi_nguoi_dai_dien: Mapped[str | None] = mapped_column(String(255), nullable=True)
    don_vi_chuc_vu: Mapped[str | None] = mapped_column(String(255), nullable=True)
    don_vi_mst: Mapped[str | None] = mapped_column(String(64), nullable=True)
    don_vi_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ten_bang_hieu: Mapped[str | None] = mapped_column(Text, nullable=True)
    dia_chi_su_dung: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Post-2025 merger address fields
    legal_address_line: Mapped[str | None] = mapped_column(Text, nullable=True)
    legal_ward: Mapped[str | None] = mapped_column(Text, nullable=True)
    legal_province: Mapped[str | None] = mapped_column(Text, nullable=True)
    legal_full_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    usage_same_as_legal: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    usage_address_line: Mapped[str | None] = mapped_column(Text, nullable=True)
    usage_ward: Mapped[str | None] = mapped_column(Text, nullable=True)
    usage_province: Mapped[str | None] = mapped_column(Text, nullable=True)
    usage_full_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    linh_vuc: Mapped[str | None] = mapped_column(String(64), nullable=True)
    linh_vuc_hien_thi: Mapped[str | None] = mapped_column(Text, nullable=True)
    domain_group: Mapped[str | None] = mapped_column(String(32), nullable=True)
    field_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    region_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    contract_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    karaoke_room_details_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    room_display_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    ngay_lap_hop_dong: Mapped[date | None] = mapped_column(Date, nullable=True)
    ngay_bat_dau: Mapped[date | None] = mapped_column(Date, nullable=True)
    ngay_ket_thuc: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Legacy money fields (deprecated but kept for backward compatibility)
    so_tien_chua_gtgt_value: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    thue_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    thue_gtgt_value: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    so_tien_value: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    # New royalty fields (Phase 2: music usage areas + simplified royalty)
    music_usage_areas: Mapped[dict | None] = mapped_column(Text, nullable=True)  # JSON string
    royalty_amount_before_vat: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    vat_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    vat_amount: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    royalty_amount_after_vat: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    royalty_amount_in_words: Mapped[str | None] = mapped_column(Text, nullable=True)

    nguoi_thuc_hien_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    renewal_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_renewable: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    loai_hinh_karaoke: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tong_so_phong: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tong_so_box: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Contract notes
    contract_terms_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reference_contract_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reference_contract_no: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Source template fields (Phase TEMPLATE-CREATE-01)
    # source_template_* = hợp đồng dùng để lấy mẫu nhập liệu (không phải tái ký)
    source_template_contract_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_template_contract_no: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Export template selection (Phase BACKGROUND-TEMPLATE-REFACTOR)
    # contract_template_code = TEMPLATE_1 or TEMPLATE_2
    contract_template_code: Mapped[str | None] = mapped_column(String(32), nullable=True)

    def get_music_usage_areas(self) -> list[dict]:
        """Get music usage areas as list, returns empty list if null."""
        if not self.music_usage_areas:
            return []
        if isinstance(self.music_usage_areas, str):
            try:
                return json.loads(self.music_usage_areas)
            except json.JSONDecodeError:
                return []
        return self.music_usage_areas or []

    def set_music_usage_areas(self, areas: list[dict]) -> None:
        """Set music usage areas from list."""
        self.music_usage_areas = json.dumps(areas, ensure_ascii=False)
