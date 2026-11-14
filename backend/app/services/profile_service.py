"""Service de profil utilisateur."""

from __future__ import annotations

import os
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import PayloadTooLarge, ValidationFailed
from app.models.user import Profile
from app.schemas.profile import ProfileUpdate

_AVATAR_PUBLIC_PREFIX = "/api/v1/profile/avatar"


def _avatar_dir(user_id: str | None = None) -> str:
    base = get_settings().avatar_dir
    path = os.path.join(base, user_id) if user_id else base
    os.makedirs(path, exist_ok=True)
    return path


async def update_profile(
    db: AsyncSession,
    *,
    profile: Profile,
    payload: ProfileUpdate,
) -> Profile:
    if payload.display_name is not None:
        if not payload.display_name.strip():
            raise ValidationFailed("Le nom affiché ne peut pas être vide.")
        profile.display_name = payload.display_name.strip()
    if payload.bio is not None:
        profile.bio = payload.bio.strip()
    await db.flush()
    return profile


async def save_avatar(
    *,
    user_id: str,
    content: bytes,
    content_type: str,
    filename: str | None,
) -> str:
    """Enregistre l'avatar et renvoie son URL publique."""
    settings = get_settings()
    allowed = {item.strip() for item in settings.avatar_allowed_content_types.split(",")}
    if content_type not in allowed:
        raise ValidationFailed(
            f"Format non autorisé. Formats acceptés : {', '.join(sorted(allowed))}."
        )
    if len(content) > settings.avatar_max_bytes:
        raise PayloadTooLarge(
            f"L'avatar ne doit pas dépasser {settings.avatar_max_bytes // 1024} Ko."
        )

    extension = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }.get(content_type, ".bin")
    if not extension or extension == ".bin":
        raise ValidationFailed("Extension non reconnue.")

    name = f"{uuid.uuid4().hex}{extension}"
    path = os.path.join(_avatar_dir(user_id), name)
    with open(path, "wb") as handle:
        handle.write(content)
    return f"{_AVATAR_PUBLIC_PREFIX}/{user_id}/{name}"


def avatar_path_from_url(url: str, *, user_id: str) -> str | None:
    """Traduit une URL d'avatar en chemin disque.

    `user_id` provient de la session serveur : un utilisateur ne peut donc
    jamais demander l'avatar d'un autre, même en fabriquant l'URL.
    """
    prefix = f"{_AVATAR_PUBLIC_PREFIX}/"
    if not url.startswith(prefix):
        return None
    relative = url[len(prefix) :]
    parts = relative.split("/")
    if len(parts) != 2:
        return None
    if parts[0] != user_id:
        return None
    filename = parts[1]
    if not filename or filename != os.path.basename(filename):
        return None
    return os.path.join(_avatar_dir(user_id), filename)