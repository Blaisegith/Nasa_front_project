"""Assemblage du moteur : configuration, embedder, index, orchestrateur.

Le service est un singleton paresseux : l'index n'est ouvert qu'à la première
utilisation, et l'embedder est choisi une seule fois (le choix est remonté dans
les métadonnées de chaque recherche).

`build_engine()` est séparé pour les tests, qui doivent pouvoir injecter un
index temporaire et un embedder de rechange.
"""

from __future__ import annotations

from typing import Optional

from app.services.retrieval.config import RetrievalSettings, get_retrieval_settings
from app.services.retrieval.embedders import Embedder, select_embedder
from app.services.retrieval.engine import MultimodalEngine
from app.services.retrieval.indexer import Indexer, ScanReport, index_corpus
from app.services.retrieval.store import IndexStore

_engine: Optional[MultimodalEngine] = None
_indexer: Optional[Indexer] = None
_settings: Optional[RetrievalSettings] = None


def settings() -> RetrievalSettings:
    global _settings
    if _settings is None:
        _settings = get_retrieval_settings()
    return _settings


def build_engine(
    settings_override: RetrievalSettings | None = None,
    embedder_override: Embedder | None = None,
    store_override: IndexStore | None = None,
) -> tuple[MultimodalEngine, list[str]]:
    """Construit un moteur et les notes expliquant les choix techniques."""
    resolved = settings_override or settings()
    if embedder_override is not None:
        embedder, notes = embedder_override, ["Embedder fourni par l'appelant."]
    else:
        embedder, notes = select_embedder(resolved)
    store = store_override or IndexStore(resolved)
    engine = MultimodalEngine(resolved, embedder, store=store, notes=notes)
    return engine, notes


def get_engine() -> MultimodalEngine:
    """Moteur partagé par l'API."""
    global _engine, _indexer
    if _engine is None:
        resolved = settings()
        _engine, notes = build_engine(resolved)
        _indexer = Indexer(resolved, _engine.embedder, store=_engine.store)
        _engine.notes = notes
    return _engine


def get_indexer() -> Indexer:
    get_engine()
    assert _indexer is not None
    return _indexer


def scan(force: bool = False) -> ScanReport:
    """Indexation incrémentale du corpus configuré."""
    return index_corpus(settings(), get_engine().embedder, force=force, store=get_engine().store)


def reset() -> None:
    """Oublie le moteur en cache (tests, rechargement de configuration)."""
    global _engine, _indexer, _settings
    _engine = None
    _indexer = None
    _settings = None
    # La configuration est mémoïsée : sans cette purge, un changement de
    # variables d'environnement (tests, rechargement) resterait ignoré.
    get_retrieval_settings.cache_clear()