"""
API Key Encryption — Fernet (AES-128-CBC) with PBKDF2 key derivation.

Usage:
    enc = APIKeyEncryptor()          # reads MASTER_ENCRYPTION_KEY from env
    cipher = enc.encrypt("AIzaSy…")
    plain  = enc.decrypt(cipher)

Environment setup (run once in PowerShell):
    python -c "import secrets; print(secrets.token_urlsafe(32))"
    # add to .env:  MASTER_ENCRYPTION_KEY=<that value>
"""

import os
import base64
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


_SALT = b"portfolio_gemini_key_2024"  # fixed salt for deterministic derivation
_ITERATIONS = 100_000


class APIKeyEncryptor:
    """Encrypt / decrypt Gemini API keys using a master key from the environment."""

    def __init__(self, master_key: Optional[str] = None):
        raw = master_key or os.getenv("MASTER_ENCRYPTION_KEY", "")

        # Fallback: try loading from .env file in project root
        if not raw:
            env_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                ".env",
            )
            if os.path.exists(env_path):
                try:
                    with open(env_path) as f:
                        for line in f:
                            line = line.strip()
                            if line.startswith("MASTER_ENCRYPTION_KEY"):
                                raw = line.split("=", 1)[1].strip().strip("\"'")
                                break
                except Exception:
                    pass

        if not raw:
            raise ValueError(
                "❌ MASTER_ENCRYPTION_KEY not set in environment!\n"
                "Generate one with:\n"
                "  python -c \"import secrets; print(secrets.token_urlsafe(32))\"\n"
                "Then add to .env:\n"
                "  MASTER_ENCRYPTION_KEY=your_generated_key"
            )
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=_SALT,
            iterations=_ITERATIONS,
        )
        derived = base64.urlsafe_b64encode(kdf.derive(raw.encode()))
        self._fernet = Fernet(derived)

    # ── public API ────────────────────────────────────────────────────
    def encrypt(self, plaintext: str) -> str:
        """Return URL-safe base64 cipher text."""
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        """Decrypt; raises ``InvalidToken`` if key / data is wrong."""
        return self._fernet.decrypt(ciphertext.encode()).decode()


# ── module-level helpers (safe to import without try/except) ─────────

def get_encryptor() -> Optional[APIKeyEncryptor]:
    """Return an ``APIKeyEncryptor`` or ``None`` if master key is missing.

    Callers that must handle the missing-master-key case gracefully
    (e.g. the UI settings page) should use this instead of the class
    directly.
    """
    try:
        return APIKeyEncryptor()
    except ValueError:
        return None


def encrypt_api_key(plaintext: str) -> Optional[str]:
    """Encrypt *plaintext* or return ``None`` on error."""
    enc = get_encryptor()
    if enc is None:
        return None
    try:
        return enc.encrypt(plaintext)
    except Exception:
        return None


def decrypt_api_key(ciphertext: str) -> Optional[str]:
    """Decrypt *ciphertext* or return ``None`` on error."""
    enc = get_encryptor()
    if enc is None:
        return None
    try:
        return enc.decrypt(ciphertext)
    except (InvalidToken, Exception):
        return None
