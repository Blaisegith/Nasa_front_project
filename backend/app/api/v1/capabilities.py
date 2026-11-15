"""Routes multimédia et scientifiques — contrats ouverts, non branchés.

Elles existent pour que le frontend et la documentation disposent d'un contrat
stable. Elles renvoient `501` tant que les pipelines ne sont pas implémentés.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, status
from fastapi.responses import JSONResponse

from app.core.errors import NotConfigured
from app.services.adapters import registry
from app.services.adapters.base import MediaQuery

router = APIRouter(tags=["capabilities"])


@router.get("/media/search", summary="Rechercher des images et vidéos")
async def search_media(
    q: str = Query(min_length=1, max_length=400),
    media_type: str = Query(default="image,video"),
    experiment: str | None = None,
    limit: int = Query(default=8, ge=1, le=50),
):
    media = registry.get_media()
    if not media.available:
        raise NotConfigured(
            "Le catalogue multimédia n'est pas encore connecté.",
            detail={"component": "media", "query": q, "media_types": media_type.split(",")},
        )

    results = media.search(
        MediaQuery(
            text=q,
            media_types=[item for item in media_type.split(",") if item],
            experiment=experiment,
            limit=limit,
        ),
        user_id=None,
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"items": results, "total": len(results)},
    )


@router.post("/science/compute", summary="Exécuter un calcul scientifique")
async def compute_science(payload: dict):
    science = registry.get_science()
    if not science.available:
        raise NotConfigured(
            "Le moteur scientifique n'est pas encore connecté.",
            detail={"component": "science"},
        )
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={"error": {"code": "not_implemented", "message": "Adaptateur à implémenter."}},
    )


__all__ = ["router"]