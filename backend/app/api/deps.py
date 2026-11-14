"""Dépendances FastAPI partagées."""

from __future__ import annotations

from typing import Annotated, NamedTuple

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.models.user import Profile, SessionRecord, User
from app.services import auth_service

DbSession = Annotated[AsyncSession, Depends(get_db)]


class Principal(NamedTuple):
    """Identité dérivée de la session, jamais fournie par le client."""

    user: User
    session: SessionRecord
    profile: Profile

    @property
    def user_id(self) -> str:
        return self.user.id


def read_session_token(request: Request) -> str | None:
    return request.cookies.get(get_settings().session_cookie_name)


async def get_principal(db: DbSession, request: Request) -> Principal:
    user, record, profile = await auth_service.require_user(db, read_session_token(request))
    return Principal(user=user, session=record, profile=profile)


PrincipalDep = Annotated[Principal, Depends(get_principal)]