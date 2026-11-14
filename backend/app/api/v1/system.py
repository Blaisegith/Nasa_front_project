"""Routes système : santé et état des connecteurs."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.config import get_settings
from app.services.adapters import registry

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/health", summary="Santé du service")
async def health() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "app": settings.app_name,
        "env": settings.backend_env,
        "database": "postgresql" if settings.database_url.startswith("postgresql") else "sqlite",
    }


@router.get("/capabilities", summary="État des connecteurs IA / science / média")
async def capabilities() -> dict:
    """Indique au frontend ce qui est réellement branché.

    Le frontend s'en sert pour afficher « service non configuré » au lieu de
    laisser croire qu'une réponse a été produite.
    """
    return {
        "capabilities": registry.capabilities_status(),
        "chat": "/api/v1/chat",
        "media": "/api/v1/media/search",
        "science": "/api/v1/science/compute",
    }


__all__ = ["router"]