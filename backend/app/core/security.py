"""Jetons de session opaques.

Le jeton n'est jamais stocké en clair : seule son empreinte SHA-256 l'est.
Le client reçoit le jeton dans un cookie HttpOnly.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from app.core.config import get_settings

_TOKEN_BYTES = 32


def generate_token() -> str:
    return secrets.token_urlsafe(_TOKEN_BYTES)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def tokens_match(left: str, right: str) -> bool:
    return hmac.compare_digest(left, right)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(value: datetime) -> datetime:
    """SQLite perd le fuseau horaire : on normalise à la lecture."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def expiry_from_now() -> datetime:
    return utcnow() + timedelta(hours=get_settings().session_ttl_hours)


def cookie_settings() -> dict[str, object]:
    settings = get_settings()
    return {
        "key": settings.session_cookie_name,
        "httponly": True,
        "secure": settings.session_cookie_secure,
        "samesite": settings.session_cookie_samesite,
        "path": "/",
    }