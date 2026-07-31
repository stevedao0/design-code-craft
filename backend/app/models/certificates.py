from __future__ import annotations

from datetime import date, datetime
import json

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class CertificateRecordRow(Base):
    __tablename__ = "certificate_records"

    certificate_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contract_id: Mapped[int] = mapped_column(Integer, nullable=False)
    domain_group: Mapped[str] = mapped_column(String(64), nullable=False)
    field_code: Mapped[str] = mapped_column(String(64), nullable=False)
    certificate_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    certificate_issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(64), nullable=False)

    organization_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    business_registration_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    business_sign_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    business_location: Mapped[str | None] = mapped_column(Text, nullable=True)
    contract_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    effective_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)

    gcn_scope_col_1_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    gcn_scope_col_2_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    gcn_scope_col_3_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    offset_x_mm: Mapped[float] = mapped_column(Float, nullable=False)
    offset_y_mm: Mapped[float] = mapped_column(Float, nullable=False)
    printed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    printed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    print_count: Mapped[int] = mapped_column(Integer, nullable=False)
    last_printed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_print_file: Mapped[str | None] = mapped_column(String(512), nullable=True)
    last_printed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_print_reason: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    qr_image_data: Mapped[str | None] = mapped_column(Text, nullable=True)


class CertificatePrintLogRow(Base):
    __tablename__ = "certificate_print_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    certificate_id: Mapped[int] = mapped_column(nullable=False)
    contract_id: Mapped[int | None] = mapped_column(nullable=True)
    certificate_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    print_no: Mapped[int] = mapped_column(nullable=False, default=1)
    print_type: Mapped[str] = mapped_column(String(32), nullable=False, default="official")
    printed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    printed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    reason: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
