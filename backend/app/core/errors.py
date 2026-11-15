"""Hiérarchie d'erreurs applicatives et gestionnaires HTTP."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Erreur métier remontée au client avec un code stable."""

    status_code: int = 400
    code: str = "bad_request"

    def __init__(self, message: str, *, detail: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail or {}

    def to_payload(self) -> dict:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                **({"detail": self.detail} if self.detail else {}),
            }
        }


class Unauthenticated(AppError):
    status_code = 401
    code = "unauthenticated"

    def __init__(self, message: str = "Session requise.") -> None:
        super().__init__(message)


class NotFound(AppError):
    status_code = 404
    code = "not_found"


class Conflict(AppError):
    status_code = 409
    code = "conflict"


class ValidationFailed(AppError):
    status_code = 422
    code = "validation_failed"


class RateLimited(AppError):
    status_code = 429
    code = "rate_limited"


class NotConfigured(AppError):
    """Composant ouvert mais non encore branché (RAG, média, science, génération)."""

    status_code = 501
    code = "not_implemented"


class PayloadTooLarge(AppError):
    status_code = 413
    code = "payload_too_large"


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.to_payload())

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        # Aucun détail technique n'est renvoyé au client.
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "internal_error", "message": "Erreur interne."}},
        )