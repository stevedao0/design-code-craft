from __future__ import annotations

from pydantic import BaseModel


class CredentialGetResponse(BaseModel):
    ok: bool = True
    portal_url: str = "http://14.241.251.220:7879"
    portal_username: str | None = None
    has_saved_password: bool = False
    # Convenience: "saved" | "username_only" | "not_saved" | "error"
    credential_status: str = "not_saved"


class CredentialSaveRequest(BaseModel):
    portal_username: str
    portal_password: str | None = None  # optional — can be empty string to clear password
    remember_password: bool = False


class CredentialSaveResponse(BaseModel):
    ok: bool = True
    portal_url: str = "http://14.241.251.220:7879"
    portal_username: str
    has_saved_password: bool = False
    message: str = ""
    error_code: str | None = None


class CredentialDeleteResponse(BaseModel):
    ok: bool = True
    portal_url: str = "http://14.241.251.220:7879"
    message: str = ""
