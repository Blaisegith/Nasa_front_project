"""Adaptateur `retrieval` : branche le moteur multimodal sur le backend.

C'est le seul adaptateur réellement implémenté à ce stade. Il ne fabrique aucun
contenu : il expose l'index local et ses résultats tels quels.

`available` est vrai dès que l'implémentation est chargée ; l'état de l'index
(index vide, embedder utilisé, nombre de ressources) est rendu par `status()`.
Cette distinction est essentielle : une index vide n'est pas un composant
absent.
"""

from __future__ import annotations

from pathlib import Path

from app.services.adapters.base import AdapterNotConfigured
from app.services.retrieval import ScanReport, get_engine, get_indexer, scan
from app.services.retrieval.config import get_retrieval_settings


class LocalRetrieval:
    """Recherche multimodale adossée à l'index SQLite local."""

    name = "retrieval-local"
    available = True

    def status(self) -> dict:
        return get_engine().status()

    def scan(self, *, force: bool = False) -> dict:
        report: ScanReport = scan(force=force)
        return report.to_dict()

    def search(self, question: str, *, limit: int | None = None):
        bundle = get_engine().retrieve(question, limit=limit)
        return bundle

    def resolve_file(self, path: str) -> Path | None:
        """Résout un chemin d'index en fichier réellement servi.

        Trois conditions, toutes vérifiées : le chemin est déclaré dans l'index,
        il est absolu, et il existe. Aucune traversée de répertoire n'est
        possible : un chemin absent de l'index est refusé.
        """
        if not path:
            return None
        engine = get_engine()
        store = engine.store

        candidate = Path(path)
        if not candidate.is_absolute() or not candidate.is_file():
            return None

        if store.resource_by_path(str(candidate)) is not None:
            return candidate

        # Frame extraite : rattachée à une vidéo de l'index.
        if store.frame_by_path(str(candidate)) is not None:
            return candidate

        return None

    def describe_index(self) -> dict:
        return get_engine().status()

    def ingest_nasa(self, query: str, *, limit: int = 4) -> dict:
        """Ingestion du corpus public NASA, seulement si elle est activée.

        Désactivée par défaut : sans `MULTIMODAL_NASA_ENABLED=1`, aucune requête
        réseau n'est émise, même sur appel explicite.
        """
        from app.services.retrieval import ingest_nasa as ingest_module

        settings = get_retrieval_settings()
        if not settings.nasa_enabled:
            raise AdapterNotConfigured("nasa", "Ingestion NASA désactivée.")
        report = ingest_module.ingest(
            settings,
            query,
            limit=max(1, min(limit, 20)),
            index=True,
        )
        return report.to_dict()


_retrieval = LocalRetrieval()


def get_retrieval() -> LocalRetrieval:
    return _retrieval


def require_retrieval() -> LocalRetrieval:
    """Adaptateur de recherche : toujours disponible, l'index peut être vide."""
    if not _retrieval.available:  # pragma: no cover - garde-fou
        raise AdapterNotConfigured("retrieval", "Recherche multimodale indisponible.")
    return _retrieval


__all__ = ["LocalRetrieval", "get_retrieval", "require_retrieval"]