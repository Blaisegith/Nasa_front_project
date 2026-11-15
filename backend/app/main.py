"""Application FastAPI TechLabs.

Périmètre de cette version : sessions utilisateurs, profils, conversations et
messages. Les connecteurs RAG / média / science / génération sont exposés mais
non branchés (`501`).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.db import init_db
from app.core.errors import register_error_handlers
from app.core.ratelimit import RateLimitMiddleware

logger = logging.getLogger("techlabs")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    settings.validate_runtime()
    await init_db()
    logger.info("TechLabs API démarrée (%s)", settings.backend_env)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description=(
            "API TechLabs : sessions, profils, conversations. "
            "Les connecteurs RAG, média, science et génération ne sont pas encore branchés."
        ),
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
    )
    app.add_middleware(RateLimitMiddleware)

    register_error_handlers(app)
    app.include_router(api_router)

    @app.get("/", include_in_schema=False)
    async def root() -> dict:
        return {"service": settings.app_name, "docs": "/docs", "api": "/api/v1"}

    return app


app = create_app()