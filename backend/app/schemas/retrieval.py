"""Schémas de l'API de recherche multimodale."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


class RetrievalSearchRequest(BaseModel):
    question: str = Field(min_length=2, max_length=4000)
    limit: int | None = Field(default=None, ge=1, le=25)

    @field_validator("question", mode="before")
    @classmethod
    def _clean(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class RetrievalSearchResponse(BaseModel):
    """Résultat brut du moteur + projection dans le schéma de réponse.

    `retrieval` est la vérité terrain (scores, provenance, notes) ; `answer`
    est la même information projetée dans le format déjà rendu par le frontend.
    """

    retrieval: dict[str, Any]
    answer: dict[str, Any]


class RetrievalIngestRequest(BaseModel):
    """Demande d'ingestion du corpus public NASA (désactivée par défaut)."""

    query: str = Field(min_length=2, max_length=200)
    limit: int = Field(default=4, ge=1, le=20)

    @field_validator("query", mode="before")
    @classmethod
    def _clean(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class RetrievalIngestResponse(BaseModel):
    """Compte rendu d'ingestion : ce qui a été trouvé, pris, écrit, indexé."""

    query: str
    dest: str
    searched: int = 0
    selected: int = 0
    downloaded: int = 0
    reused: int = 0
    skipped: int = 0
    indexed: int = 0
    errors: list[str] = Field(default_factory=list)
    files: list[str] = Field(default_factory=list)
    duration_s: float = 0.0


__all__ = [
    "RetrievalSearchRequest",
    "RetrievalSearchResponse",
    "RetrievalIngestRequest",
    "RetrievalIngestResponse",
]