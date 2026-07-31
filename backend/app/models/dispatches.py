from __future__ import annotations

from datetime import date, datetime as dt

from sqlalchemy import Boolean, Date, DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base

datetime = dt

# =============================================================================
# Status Enums
# =============================================================================

TRANG_THAI_LIEN_HE = {
    "CHUA_LIEN_HE": "Chưa liên hệ",
    "DA_LIEN_HE": "Đã liên hệ",
    "DA_GUI_CONG_VAN": "Đã gửi công văn",
    "DA_PHAN_HOI": "Đã phản hồi",
    "DANG_THUONG_LUONG": "Đang thương lượng",
    "NGUNG_HOAT_DONG": "Ngưng hoạt động",
    "KHONG_HOP_TAC": "Không hợp tác",
    "SAI_THONG_TIN": "Sai thông tin",
}

TRANG_THAI_HOP_DONG = {
    "CHUA_KY_HOP_DONG": "Chưa ký hợp đồng",
    "DANG_XU_LY_HOP_DONG": "Đang xử lý hợp đồng",
    "DA_KY_HOP_DONG": "Đã ký hợp đồng",
    "TU_CHOI_KY": "Từ chối ký",
    "KHONG_DU_DIEU_KIEN": "Không đủ điều kiện",
}


class SystemSettingRow(Base):
    """Key-value store for application settings. Shared across both app instances."""
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[dt] = mapped_column(
        DateTime, nullable=False, default=dt.utcnow, onupdate=dt.utcnow
    )


class BgCongVanBatchRow(Base):
    """Batch metadata for grouped Công văn renewal letters."""
    __tablename__ = "bg_congvan_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    domain_group: Mapped[str] = mapped_column(String(32), nullable=False, default="background")
    field_code: Mapped[str] = mapped_column(String(64), nullable=False, default="karaoke")

    cong_van_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    dispatch_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    template_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Export options for this batch
    create_envelope: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    merge_output: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    envelope_recipient_mode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    envelope_custom_prefix: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Counts
    total_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ready_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    missing_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    merged_docx_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    envelope_docx_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    envelope_generated_at: Mapped[dt | None] = mapped_column(DateTime, nullable=True)
    envelope_total_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    envelope_calibration_docx_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    envelope_calibration_generated_at: Mapped[dt | None] = mapped_column(DateTime, nullable=True)

    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[dt] = mapped_column(DateTime, nullable=False, default=dt.utcnow)
    updated_at: Mapped[dt] = mapped_column(
        DateTime, nullable=False, default=dt.utcnow, onupdate=dt.utcnow
    )
    deleted_at: Mapped[dt | None] = mapped_column(DateTime, nullable=True)
    deleted_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    delete_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_bg_congvan_batches_dispatch_type", "dispatch_type"),
        Index("ix_bg_congvan_batches_issue_date", "issue_date"),
        Index("ix_bg_congvan_batches_cong_van_no", "cong_van_no"),
        Index("ix_bg_congvan_batches_domain_field", "domain_group", "field_code"),
    )


class BgCongVanRow(Base):
    """Individual Công văn records tied to a batch."""
    __tablename__ = "bg_congvan"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    domain_group: Mapped[str] = mapped_column(String(32), nullable=False, default="background")
    field_code: Mapped[str] = mapped_column(String(64), nullable=False, default="karaoke")
    batch_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    cong_van_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    contract_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    contract_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    recipient_unit: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recipient_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    recipient_contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recipient_phone: Mapped[str | None] = mapped_column(String(255), nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    dispatch_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    attempt_no: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Lần gửi (send round) — computed from previous items
    lan_gui: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # DONG_NGUOI_NHAN_BIA_THU (computed envelope recipient line)
    dong_nguoi_nhan_bia_thu: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Contact tracking status
    trang_thai_lien_he: Mapped[str] = mapped_column(String(32), nullable=False, default="DA_GUI_CONG_VAN")
    ngay_lien_he_gan_nhat: Mapped[dt | None] = mapped_column(DateTime, nullable=True)
    ghi_chu_lien_he: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Contract signing tracking status
    trang_thai_hop_dong: Mapped[str] = mapped_column(String(32), nullable=False, default="CHUA_KY_HOP_DONG")
    ngay_ky_hop_dong: Mapped[dt | None] = mapped_column(Date, nullable=True)

    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    docx_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[dt] = mapped_column(DateTime, nullable=False, default=dt.utcnow)
    updated_at: Mapped[dt] = mapped_column(
        DateTime, nullable=False, default=dt.utcnow, onupdate=dt.utcnow
    )
    deleted_at: Mapped[dt | None] = mapped_column(DateTime, nullable=True)
    deleted_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    delete_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_bg_congvan_domain_field_status", "domain_group", "field_code", "status"),
        Index("ix_bg_congvan_issue_date", "issue_date"),
        Index("ix_bg_congvan_contract_id", "contract_id"),
        Index("ix_bg_congvan_batch_id", "batch_id"),
        Index("ix_bg_congvan_dispatch_type", "dispatch_type"),
        Index("ix_bg_congvan_trang_thai_lien_he", "trang_thai_lien_he"),
        Index("ix_bg_congvan_trang_thai_hop_dong", "trang_thai_hop_dong"),
    )


class BgCongVanProcessRow(Base):
    """Audit/action log for Công văn records."""
    __tablename__ = "bg_congvan_process_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cong_van_id: Mapped[int] = mapped_column(Integer, nullable=False)
    action_type: Mapped[str] = mapped_column(String(64), nullable=False)
    status_after: Mapped[str | None] = mapped_column(String(32), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[dt] = mapped_column(DateTime, nullable=False, default=dt.utcnow)

    __table_args__ = (
        Index("ix_bg_congvan_logs_cong_van_id", "cong_van_id"),
        Index("ix_bg_congvan_logs_created_at", "created_at"),
    )
