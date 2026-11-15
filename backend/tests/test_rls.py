"""Contexte RLS : ce que le backend pose avant chaque requête.

Les politiques de `backend/migrations/001_init.sql` exigent la variable
`app.user_id`. Ces tests vérifient la mécanique (variable posée, portée locale,
absence d'effet hors PostgreSQL) sans serveur PostgreSQL : l'isolation réelle est
ensuite vérifiée par les politiques SQL elles-mêmes.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.core.rls import apply_rls_context


class _Dialect:
    def __init__(self, name: str) -> None:
        self.name = name


class _FakeSession:
    """Session minimale : retient les instructions exécutées."""

    def __init__(self, dialect: str = "postgresql") -> None:
        self._bind = SimpleNamespace(dialect=_Dialect(dialect))
        self.executed: list[tuple[str, dict]] = []

    def get_bind(self):
        return self._bind

    async def execute(self, statement, parameters=None):
        self.executed.append((str(statement), parameters or {}))
        return None


@pytest.mark.asyncio
async def test_contexte_pose_sur_postgresql():
    session = _FakeSession("postgresql")
    await apply_rls_context(session, "11111111-1111-1111-1111-111111111111")

    assert len(session.executed) == 1
    statement, parameters = session.executed[0]
    assert "set_config" in statement
    assert "'app.user_id'" in statement
    assert "true" in statement  # portée transactionnelle
    assert parameters == {"user_id": "11111111-1111-1111-1111-111111111111"}


@pytest.mark.asyncio
async def test_aucun_effet_sur_sqlite():
    session = _FakeSession("sqlite")
    await apply_rls_context(session, "11111111-1111-1111-1111-111111111111")
    assert session.executed == []


@pytest.mark.asyncio
async def test_identifiant_vide_refuse():
    """Sans identifiant, on ne pose rien : la RLS refusera tout, ce qui est voulu."""
    session = _FakeSession("postgresql")
    await apply_rls_context(session, "")
    assert session.executed == []