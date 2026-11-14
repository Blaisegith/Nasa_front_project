"""Registre des adaptateurs.

Le backend résout ses dépendances ici. Remplacer un adaptateur (brancher le RAG,
le média, la science ou un LLM) se fait en enregistrant une implémentation :
aucun appelant n'a besoin d'être modifié.
"""

from __future__ import annotations

from app.services.adapters.base import (
    Capability,
    GenerationAdapter,
    MediaAdapter,
    RagAdapter,
    ScienceAdapter,
)
from app.services.adapters.stubs import (
    UnavailableGeneration,
    UnavailableMedia,
    UnavailableRag,
    UnavailableScience,
)

_rag: RagAdapter = UnavailableRag()
_media: MediaAdapter = UnavailableMedia()
_science: ScienceAdapter = UnavailableScience()
_generation: GenerationAdapter = UnavailableGeneration()


def get_rag() -> RagAdapter:
    return _rag


def get_media() -> MediaAdapter:
    return _media


def get_science() -> ScienceAdapter:
    return _science


def get_generation() -> GenerationAdapter:
    return _generation


def register(capability: Capability, adapter: object) -> None:
    """Enregistre une implémentation réelle (utilisé par les phases ultérieures)."""
    global _rag, _media, _science, _generation
    if capability == "rag":
        _rag = adapter  # type: ignore[assignment]
    elif capability == "media":
        _media = adapter  # type: ignore[assignment]
    elif capability == "science":
        _science = adapter  # type: ignore[assignment]
    elif capability == "generation":
        _generation = adapter  # type: ignore[assignment]
    else:  # pragma: no cover - garde-fou
        raise ValueError(f"Capacité inconnue : {capability}")


def capabilities_status() -> dict[str, dict]:
    """État des connecteurs, exposé par `/api/v1/system/capabilities`."""
    return {
        "rag": {"name": _rag.name, "connected": bool(_rag.available)},
        "media": {"name": _media.name, "connected": bool(_media.available)},
        "science": {"name": _science.name, "connected": bool(_science.available)},
        "generation": {"name": _generation.name, "connected": bool(_generation.available)},
    }