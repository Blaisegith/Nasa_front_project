"""Schémas Pydantic — profil utilisateur."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    bio: str | None = Field(default=None, max_length=1000)

    @field_validator("display_name", "bio", mode="before")
    @classmethod
    def _clean(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    email: str
    display_name: str
    bio: str
    avatar_url: str | None
    updated_at: datetime


class AvatarOut(BaseModel):
    avatar_url: str


class MeOut(BaseModel):
    """Profil + métadonnées de session sûres à exposer au client."""

    profile: ProfileOut
    session_expires_at: datetime
    weak_auth: bool = True