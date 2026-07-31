from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class BackgroundContractScopeRow(Base):
    __tablename__ = "background_contract_scopes"

    scope_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contract_id: Mapped[int] = mapped_column(Integer, nullable=False)
    domain_group: Mapped[str] = mapped_column(String(32), nullable=False)
    field_code: Mapped[str] = mapped_column(String(64), nullable=False)
    position_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    position_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    room_names_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    extras_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
