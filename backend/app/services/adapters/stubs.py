"""Adaptateurs par défaut : contrats respectés, aucun contenu fabriqué.

Ils lèvent `AdapterNotConfigured` tant que le composant réel n'est pas branché.
C'est ce qui garantit qu'aucune réponse scientifique, référence ou média
d'.inventé ne peut être renvoyé par le prototype.
"""

from __future__ import annotations

from app.services.adapters.base import (
    AdapterNotConfigured,
    GeneratedAnswer,
    GenerationRequest,
    MediaQuery,
    RetrievedChunk,
    ScienceRequest,
    ScienceResult,
)

_MESSAGE = (
    "Le composant {name} n'est pas encore connecté. "
    "Les connecteurs RAG, média, science et génération seront branchés dans une phase ultérieure."
)


class UnavailableRag:
    name = "rag-unavailable"
    available = False

    def search(
        self,
        query: str,
        *,
        user_id: str | None,
        collections: list[str],
        limit: int,
    ) -> list[RetrievedChunk]:
        raise AdapterNotConfigured("rag", _MESSAGE.format(name="RAG"))


class UnavailableMedia:
    name = "media-unavailable"
    available = False

    def search(self, query: MediaQuery, *, user_id: str | None) -> list[dict]:
        raise AdapterNotConfigured("media", _MESSAGE.format(name="catalogue média"))


class UnavailableScience:
    name = "science-unavailable"
    available = False

    def compute(self, request: ScienceRequest) -> ScienceResult:
        raise AdapterNotConfigured("science", _MESSAGE.format(name="moteur scientifique"))


class UnavailableGeneration:
    name = "generation-unavailable"
    available = False

    def generate(self, request: GenerationRequest) -> GeneratedAnswer:
        raise AdapterNotConfigured("generation", _MESSAGE.format(name="génération"))