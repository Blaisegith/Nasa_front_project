"""Contexte de session PostgreSQL pour la Row Level Security Supabase.

Le schéma (`backend/migrations/001_init.sql`) protège chaque table par RLS avec
la politique « `user_id = public.current_user_id()` », où `current_user_id()`
lit la variable `app.user_id`. Sans cette variable, **aucune ligne n'est
renvoyée** : c'est le comportement « fail closed » voulu, mais il faut la poser
explicitement avant chaque requête.

Cette variable est posée **par requête** (`set_config(..., is_local => true)`),
donc dans la transaction courante : elle ne fuit pas vers une autre requête, même
si le pool réutilise la connexion.

En SQLite (développement et tests), l'isolation est assurée par les filtres
`WHERE user_id = :uid` du service : il n'y a pas de RLS, et l'appel ne fait rien.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def _is_postgres(session: AsyncSession) -> bool:
    bind = session.get_bind()
    dialect = getattr(getattr(bind, "dialect", None), "name", "")
    return dialect == "postgresql"


async def apply_rls_context(session: AsyncSession, user_id: str) -> None:
    """Pose `app.user_id` pour la transaction courante (PostgreSQL uniquement)."""
    if not user_id or not _is_postgres(session):
        return
    # `is_local => true` : la valeur disparaît à la fin de la transaction.
    await session.execute(
        text("select set_config('app.user_id', :user_id, true)"),
        {"user_id": user_id},
    )


__all__ = ["apply_rls_context"]