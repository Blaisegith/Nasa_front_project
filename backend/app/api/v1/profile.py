"""Routes de profil utilisateur."""

from __future__ import annotations

import os

from fastapi import APIRouter, File, UploadFile, status
from fastapi.responses import FileResponse

from app.api.deps import DbSession, PrincipalDep
from app.api.v1.auth import profile_out
from app.core.errors import NotFound, ValidationFailed
from app.schemas.profile import AvatarOut, ProfileOut, ProfileUpdate
from app.services import profile_service

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileOut, summary="Profil de l'utilisateur courant")
async def read_profile(principal: PrincipalDep, db: DbSession) -> ProfileOut:
    await db.commit()
    return profile_out(principal.user, principal.profile)


@router.patch("", response_model=ProfileOut, summary="Mettre à jour le profil")
async def update_profile(
    payload: ProfileUpdate,
    principal: PrincipalDep,
    db: DbSession,
) -> ProfileOut:
    profile = await profile_service.update_profile(
        db, profile=principal.profile, payload=payload
    )
    await db.commit()
    return profile_out(principal.user, profile)


@router.post(
    "/avatar",
    response_model=AvatarOut,
    status_code=status.HTTP_201_CREATED,
    summary="Téléverser une photo de profil",
)
async def upload_avatar(
    principal: PrincipalDep,
    db: DbSession,
    file: UploadFile = File(...),
) -> AvatarOut:
    content = await file.read()
    if not content:
        raise ValidationFailed("Fichier vide.")
    url = await profile_service.save_avatar(
        user_id=principal.user_id,
        content=content,
        content_type=file.content_type or "application/octet-stream",
        filename=file.filename,
    )
    principal.profile.avatar_url = url
    await db.commit()
    return AvatarOut(avatar_url=url)


@router.get(
    "/avatar/{owner_id}/{filename}",
    summary="Récupérer sa propre photo de profil",
    response_class=FileResponse,
)
async def read_avatar(
    principal: PrincipalDep,
    owner_id: str,
    filename: str,
) -> FileResponse:
    """L'URL contient l'`user_id`, mais l'accès est revérifié côté serveur."""
    if owner_id != principal.user_id:
        raise NotFound("Avatar introuvable.")
    url = f"/api/v1/profile/avatar/{owner_id}/{filename}"
    path = profile_service.avatar_path_from_url(url, user_id=principal.user_id)
    if path is None or not os.path.isfile(path):
        raise NotFound("Avatar introuvable.")
    return FileResponse(path)


__all__ = ["router"]