"""Contrats des adaptateurs IA / science / multimodal.

Cette couche est le **point de branchement** du projet : elle définit ce que le
backend attend du RAG, du moteur scientifique, du catalogue média et du
fournisseur de génération, sans en implémenter aucun.

Aucune implémentation livrée ne fabrique de résultat : un adaptateur non
configuré lève `AdapterNotConfigured`, et la couche HTTP la traduit en `501`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Protocol, runtime_checkable

Capability = Literal["rag", "media", "science", "generation"]


class AdapterNotConfigured(RuntimeError):
    """Le composant existe côté contrat mais n'est pas encore branché."""

    def __init__(self, component: str, message: str | None = None) -> None:
        self.component = component
        super().__init__(
            message
            or f"Le composant « {component} » n'est pas encore configuré sur ce serveur."
        )


@dataclass(slots=True)
class RetrievedChunk:
    chunk_id: str
    text: str
    score: float = 0.0
    metadata: dict = field(default_factory=dict)


@dataclass(slots=True)
class MediaQuery:
    text: str
    media_types: list[str] = field(default_factory=lambda: ["image", "video"])
    experiment: str | None = None
    limit: int = 8


@dataclass(slots=True)
class ScienceRequest:
    model: str
    inputs: dict = field(default_factory=dict)


@dataclass(slots=True)
class ScienceResult:
    model: str
    method: str
    inputs: dict
    outputs: dict
    units: dict = field(default_factory=dict)
    limitations: list[str] = field(default_factory=list)
    references: list[dict] = field(default_factory=list)


@dataclass(slots=True)
class GenerationRequest:
    question: str
    chunks: list[RetrievedChunk] = field(default_factory=list)
    media: list[dict] = field(default_factory=list)
    science: list[ScienceResult] = field(default_factory=list)
    history: list[dict] = field(default_factory=list)


@dataclass(slots=True)
class GeneratedAnswer:
    summary: str
    scientific_explanation: str
    simple_explanation: str
    arguments: list[str] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)


@runtime_checkable
class RagAdapter(Protocol):
    name: str
    available: bool

    def search(
        self,
        query: str,
        *,
        user_id: str | None,
        collections: list[str],
        limit: int,
    ) -> list[RetrievedChunk]: ...


@runtime_checkable
class MediaAdapter(Protocol):
    name: str
    available: bool

    def search(self, query: MediaQuery, *, user_id: str | None) -> list[dict]: ...


@runtime_checkable
class ScienceAdapter(Protocol):
    name: str
    available: bool

    def compute(self, request: ScienceRequest) -> ScienceResult: ...


@runtime_checkable
class GenerationAdapter(Protocol):
    name: str
    available: bool

    def generate(self, request: GenerationRequest) -> GeneratedAnswer: ...