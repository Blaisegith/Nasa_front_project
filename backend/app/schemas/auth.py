"""Schémas Pydantic — authentification."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

EMAIL_MAX = 320


def normalize_email(value: str) -> str:
    return value.strip().lower()


class SessionCreate(BaseModel):
    """Connexion simplifiée : e-mail (+ nom optionnel), sans mot de passe.

    Il s'agit d'un accès faible, documenté comme tel, et non d'une preuve
    d'identité. La vérification reste intégralement côté serveur.
    """

    email: EmailStr = Field(max_length=EMAIL_MAX)
    display_name: str | None = Field(default=None, max_length=120)

    @field_validator("email", mode="before")
    @classmethod
    def _normalize(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("display_name", mode="before")
    @classmethod
    def _clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class ProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    email: str
    display_name: str
    bio: str
    avatar_url: str | None
    updated_at: datetime


class SessionRead(BaseModel):
    """Réponse de connexion : profil + expiration de la session."""

    profile: ProfileRead
    session_expires_at: datetime
    weak_auth: bool = True