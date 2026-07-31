from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class InternalQrPortalCredentialRow(Base):
    """
    Stores encrypted portal credentials per app user.

    Password is encrypted at rest using Fernet (AES-128-CBC).
    The encryption key is read from QR_PORTAL_CREDENTIAL_KEY env var.

    Unique constraint on (user_id, portal_url).
    """
    __tablename__ = "internal_qr_portal_credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    portal_url: Mapped[str] = mapped_column(String(512), nullable=False)
    portal_username: Mapped[str] = mapped_column(String(128), nullable=False)
    portal_password_encrypted: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
