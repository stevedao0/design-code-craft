"""
Credential encryption service for internal QR portal.

Uses Fernet (AES-128-CBC) to encrypt/decrypt portal passwords.
The encryption key is read from QR_PORTAL_CREDENTIAL_KEY env var.

If the key is missing, encryption/decryption is disabled (returns None).
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
from typing import Literal

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

# Key from environment — must be 32 bytes, base64-encoded (Fernet format)
_ENCRYPTION_KEY: bytes | None = None


def _load_key() -> bytes | None:
    """Load the encryption key from env, derive a valid Fernet key."""
    raw = os.environ.get("QR_PORTAL_CREDENTIAL_KEY", "").strip()
    if not raw:
        logger.warning(
            "[CredentialCrypto] QR_PORTAL_CREDENTIAL_KEY not set. "
            "Password saving is DISABLED. Set the env var to enable credential storage."
        )
        return None

    # If it's already a valid Fernet key (base64-encoded 32 bytes), use it as-is
    try:
        # Fernet keys are 44 chars base64, start with 'g' or 'G'
        if len(raw) == 44:
            test = Fernet(raw)
            return raw.encode("ascii")
    except Exception:
        pass

    # Otherwise treat as raw secret — derive a key via SHA-256 + base64
    try:
        digest = hashlib.sha256(raw.encode("utf-8")).digest()
        fernet_key = base64.urlsafe_b64encode(digest)
        return fernet_key
    except Exception as exc:
        logger.error(f"[CredentialCrypto] Failed to derive key from QR_PORTAL_CREDENTIAL_KEY: {exc}")
        return None


def _get_fernet() -> Fernet | None:
    """Get a Fernet instance, or None if the key is not configured."""
    global _ENCRYPTION_KEY
    if _ENCRYPTION_KEY is None:
        _ENCRYPTION_KEY = _load_key()
    if _ENCRYPTION_KEY is None:
        return None
    return Fernet(_ENCRYPTION_KEY)


def encrypt_password(plain_password: str) -> str | None:
    """
    Encrypt a plain password. Returns the encrypted string, or None if encryption
    is not available (key missing or error).
    """
    fernet = _get_fernet()
    if fernet is None:
        return None
    try:
        encrypted = fernet.encrypt(plain_password.encode("utf-8"))
        return encrypted.decode("ascii")
    except Exception as exc:
        logger.error(f"[CredentialCrypto] Encrypt failed: {exc}")
        return None


def decrypt_password(encrypted_password: str) -> str | None:
    """
    Decrypt an encrypted password. Returns the plain string, or None if decryption
    fails or encryption is not configured.
    """
    fernet = _get_fernet()
    if fernet is None:
        return None
    try:
        decrypted = fernet.decrypt(encrypted_password.encode("ascii"))
        return decrypted.decode("utf-8")
    except InvalidToken:
        logger.warning("[CredentialCrypto] Decrypt failed: Invalid token (wrong key or corrupted data)")
        return None
    except Exception as exc:
        logger.error(f"[CredentialCrypto] Decrypt failed: {exc}")
        return None


def is_encryption_available() -> bool:
    """Return True if encryption key is configured."""
    return _get_fernet() is not None


def is_encryption_key_missing() -> bool:
    """Return True if encryption key is NOT configured (saving credentials will fail)."""
    return _get_fernet() is None


# Convenience: encrypt-only, raises ValueError if unavailable
def encrypt_password_strict(plain_password: str) -> str:
    """Encrypt password; raises ValueError if encryption is not available."""
    result = encrypt_password(plain_password)
    if result is None:
        raise ValueError(
            "CREDENTIAL_ENCRYPTION_KEY_MISSING: "
            "Set QR_PORTAL_CREDENTIAL_KEY env var to enable password saving."
        )
    return result
