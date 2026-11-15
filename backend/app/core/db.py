"""Accès à la base de données (SQLAlchemy 2.0 asynchrone)."""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


class Base(DeclarativeBase):
    """Base déclarative de tous les modèles ORM."""


def _create_engine():
    settings = get_settings()
    connect_args: dict[str, object] = {}
    if settings.database_url.startswith("sqlite"):
        # Nécessaire pour SQLite en mode fichier avec plusieurs connexions.
        connect_args["check_same_thread"] = False
    return create_async_engine(
        settings.database_url,
        echo=settings.database_echo,
        pool_pre_ping=True,
        connect_args=connect_args,
    )


engine = _create_engine()
SessionFactory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncIterator[AsyncSession]:
    """Dépendance FastAPI : une session par requête."""
    async with SessionFactory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Crée les tables si elles n'existent pas — **SQLite uniquement**.

    En production Supabase, le schéma et les politiques RLS sont appliqués par
    `backend/migrations/*.sql` (source de vérité). Cette fonction ne sert qu'au
    développement local et aux tests : sur PostgreSQL, laisser l'ORM créer les
    tables produirait des colonnes `varchar(36)` au lieu des `uuid` du schéma et
    contournerait la RLS. Elle est donc explicitement écartée hors SQLite.
    """
    settings = get_settings()
    if not settings.database_url.startswith("sqlite"):
        return

    # Import tardif pour que les modèles soient enregistrés sur Base.metadata.
    from app import models  # noqa: F401

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)