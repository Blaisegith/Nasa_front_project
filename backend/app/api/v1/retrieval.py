"""API de recherche multimodale.

Quatre routes, toutes authentifiées :

* `GET  /api/v1/retrieval/status`  — état de l'index et de l'embedder ;
* `POST /api/v1/retrieval/scan`    — indexation incrémentale ;
* `POST /api/v1/retrieval/search`  — recherche multimodale ;
* `GET  /api/v1/retrieval/files`   — fichier indexé (image, frame, vidéo).

Cette dernière route ne sert qu'un chemin **déjà présent dans l'index** : un
chemin arbitraire est refusé, ce qui empêche toute lecture hors corpus.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Query, status
from fastapi.responses import FileResponse

from app.api.deps import PrincipalDep
from app.core.errors import NotFound, NotConfigured, ValidationFailed
from app.schemas.retrieval import (
    RetrievalIngestRequest,
    RetrievalIngestResponse,
    RetrievalSearchRequest,
    RetrievalSearchResponse,
)
from app.services.adapters import registry
from app.services.adapters.base import AdapterNotConfigured
from app.services.retrieval import to_answer

router = APIRouter(prefix="/retrieval", tags=["retrieval"])


def _adapter():
    return registry.get_retrieval()


@router.get("/status", summary="État de l'index multimodal")
async def retrieval_status(principal: PrincipalDep) -> dict:
    adapter = _adapter()
    if not adapter.available:  # pragma: no cover - implémentation toujours branchée
        raise ValidationFailed("Recherche multimodale indisponible.")
    return adapter.status()


@router.post("/scan", summary="Indexation incrémentale du corpus")
async def retrieval_scan(
    principal: PrincipalDep,
    force: bool = Query(default=False, description="Réindexer même les fichiers inchangés"),
) -> dict:
    adapter = _adapter()
    if not adapter.available:  # pragma: no cover
        raise ValidationFailed("Recherche multimodale indisponible.")
    return adapter.scan(force=force)


@router.post(
    "/search",
    response_model=RetrievalSearchResponse,
    summary="Recherche multimodale (documents, images, vidéos, mesures)",
)
async def retrieval_search(payload: RetrievalSearchRequest, principal: PrincipalDep) -> RetrievalSearchResponse:
    adapter = _adapter()
    if not adapter.available:  # pragma: no cover
        raise ValidationFailed("Recherche multimodale indisponible.")

    bundle = adapter.search(payload.question, limit=payload.limit)
    answer = to_answer.build_partial_answer(bundle)

    return RetrievalSearchResponse(
        retrieval=bundle.to_dict(),
        answer=answer.model_dump(mode="json"),
    )


@router.get("/files", summary="Servir un fichier indexé (image, frame, vidéo)", response_class=FileResponse)
async def retrieval_file(
    principal: PrincipalDep,
    path: str = Query(..., description="Chemin absolu déclaré dans l'index"),
) -> FileResponse:
    adapter = _adapter()
    resolved: Path | None = adapter.resolve_file(path)
    if resolved is None:
        raise NotFound("Fichier introuvable dans l'index.")
    return FileResponse(resolved, filename=resolved.name)


@router.post(
    "/ingest/nasa",
    response_model=RetrievalIngestResponse,
    summary="Ingestion du corpus public NASA (désactivée par défaut)",
)
async def retrieval_ingest_nasa(
    payload: RetrievalIngestRequest,
    principal: PrincipalDep,
) -> RetrievalIngestResponse:
    """Renseigne le corpus à partir de l'API publique NASA, puis indexe.

    Aucune requête réseau n'est émise tant que `MULTIMODAL_NASA_ENABLED=1` n'est
    pas positionné : l'endpoint répond alors `501`, comme tout composant non
    branché.
    """
    adapter = _adapter()
    try:
        report = adapter.ingest_nasa(payload.query, limit=payload.limit)
    except AdapterNotConfigured as error:
        raise NotConfigured(str(error)) from error
    return RetrievalIngestResponse(**report)


__all__ = ["router"]