"""Routes d'authentification."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from app.api.deps import DbSession, Principal, PrincipalDep
from app.core.config import get_settings
from app.core.security import cookie_settings
from app.models.user import Profile, User
from app.schemas.auth import SessionCreate, SessionRead
from app.schemas.profile import MeOut, ProfileOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def profile_out(user: User, profile: Profile) -> ProfileOut:
    """Le profil exposé contient l'e-mail du porteur de session, jamais d'un tiers."""
    return ProfileOut(
        user_id=user.id,
        email=user.email,
        display_name=profile.display_name,
        bio=profile.bio,
        avatar_url=profile.avatar_url,
        updated_at=profile.updated_at,
    )


def me_out(principal: Principal) -> MeOut:
    return MeOut(
        profile=profile_out(principal.user, principal.profile),
        session_expires_at=principal.session.expires_at,
        weak_auth=True,
    )


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post(
    "/session",
    response_model=SessionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Ouvrir une session (accès faible, sans mot de passe)",
)
async def create_session(
    payload: SessionCreate,
    request: Request,
    response: Response,
    db: DbSession,
) -> SessionRead:
    """Crée (ou retrouve) l'utilisateur à partir de son e-mail, puis ouvre une session.

    Avertissement : cette méthode ne prouve pas l'identité. Elle est fournie
    pour le prototype, avec limitation de débit et cookie HttpOnly.
    """
    user, profile = await auth_service.get_or_create_user(
        db, email=str(payload.email), display_name=payload.display_name
    )
    record, token = await auth_service.create_session(
        db,
        user=user,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    response.set_cookie(
        value=token,
        max_age=get_settings().session_ttl_hours * 3600,
        **cookie_settings(),  # type: ignore[arg-type]
    )
    return SessionRead(
        profile=profile_out(user, profile),
        session_expires_at=record.expires_at,
        weak_auth=True,
    )


@router.get("/session", response_model=MeOut, summary="Session courante")
async def read_session(principal: PrincipalDep, db: DbSession) -> MeOut:
    await db.commit()
    return me_out(principal)


@router.get("/me", response_model=MeOut, summary="Alias de /auth/session")
async def read_me(principal: PrincipalDep, db: DbSession) -> MeOut:
    await db.commit()
    return me_out(principal)


@router.delete("/session", status_code=status.HTTP_204_NO_CONTENT, summary="Fermer la session")
async def delete_session(
    principal: PrincipalDep,
    response: Response,
    db: DbSession,
) -> Response:
    await auth_service.revoke_session(db, principal.session)
    await db.commit()
    response.delete_cookie(
        key=get_settings().session_cookie_name,
        path=str(cookie_settings()["path"]),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["router", "profile_out", "me_out"]