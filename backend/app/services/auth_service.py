"""Service d'authentification et de session."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Unauthenticated
from app.core.security import (
    expiry_from_now,
    generate_token,
    hash_token,
    tokens_match,
    utcnow,
)
from app.models.user import Profile, SessionRecord, User


def default_display_name(email: str, provided: str | None = None) -> str:
    if provided:
        return provided
    local_part = email.split("@", 1)[0]
    cleaned = local_part.replace(".", " ").replace("_", " ").replace("-", " ").strip()
    if not cleaned:
        return "Explorateur"
    return " ".join(part.capitalize() for part in cleaned.split())


async def get_or_create_user(
    db: AsyncSession,
    *,
    email: str,
    display_name: str | None = None,
) -> tuple[User, Profile]:
    """Récupère ou crée l'utilisateur (accès faible, sans mot de passe)."""
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(email=email)
        db.add(user)
        try:
            await db.flush()
        except IntegrityError:
            # Course entre deux requêtes concurrentes : on relit.
            await db.rollback()
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one()

        db.add(Profile(user_id=user.id, display_name=default_display_name(email, display_name)))
        await db.flush()

    profile = (
        await db.execute(select(Profile).where(Profile.user_id == user.id))
    ).scalar_one()

    if display_name and profile.display_name == default_display_name(email) and profile.display_name != display_name:
        profile.display_name = display_name

    return user, profile


async def create_session(
    db: AsyncSession,
    *,
    user: User,
    ip_address: str | None,
    user_agent: str | None,
) -> tuple[SessionRecord, str]:
    """Crée une session et renvoie (enregistrement, jeton clair)."""
    token = generate_token()
    record = SessionRecord(
        user_id=user.id,
        token_hash=hash_token(token),
        expires_at=expiry_from_now(),
        ip_address=(ip_address or "")[:64] or None,
        user_agent=(user_agent or "")[:512] or None,
    )
    db.add(record)
    await db.flush()
    return record, token


async def revoke_session(db: AsyncSession, record: SessionRecord) -> None:
    if record.revoked_at is None:
        record.revoked_at = utcnow()


async def find_active_session(db: AsyncSession, token: str) -> SessionRecord | None:
    result = await db.execute(
        select(SessionRecord).where(SessionRecord.token_hash == hash_token(token))
    )
    record = result.scalar_one_or_none()
    if record is None:
        return None
    if not record.is_active:
        return None
    if not tokens_match(record.token_hash, hash_token(token)):
        return None
    return record


async def require_user(db: AsyncSession, token: str | None) -> tuple[User, SessionRecord, Profile]:
    """Lève `Unauthenticated` si le porteur n'a pas de session valide.

    Le profil est chargé explicitement : en SQLAlchemy asynchrone, un accès
    paresseux à une relation lèverait `MissingGreenlet`.
    """
    if not token:
        raise Unauthenticated()
    record = await find_active_session(db, token)
    if record is None:
        raise Unauthenticated("Session expirée ou révoquée.")
    user = (
        await db.execute(select(User).where(User.id == record.user_id))
    ).scalar_one_or_none()
    if user is None:
        raise Unauthenticated("Utilisateur introuvable.")
    profile = (
        await db.execute(select(Profile).where(Profile.user_id == user.id))
    ).scalar_one_or_none()
    if profile is None:
        raise Unauthenticated("Profil introuvable.")
    user.last_seen_at = utcnow()
    return user, record, profile


async def revoke_all_sessions(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(
        select(SessionRecord).where(
            SessionRecord.user_id == user_id,
            SessionRecord.revoked_at.is_(None),
        )
    )
    records = result.scalars().all()
    now: datetime = utcnow()
    for record in records:
        record.revoked_at = now
    return len(records)