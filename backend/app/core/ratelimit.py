"""Limitation de débit en mémoire, par processus.

Protection anti-abus pour l'établissement de session. Ce n'est pas un
remplacement d'un rate limiter distribué : en production multi-instances, la
limite doit être portée par Supabase (PostgreSQL) ou un reverse proxy.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import get_settings

_WINDOW_SECONDS = 60
_events: dict[str, deque[float]] = defaultdict(deque)


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    client = forwarded.split(",")[0].strip() if forwarded else ""
    return client or (request.client.host if request.client else "unknown")


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Limite les routes sensibles (`/auth/*`)."""

    _PROTECTED_PREFIXES = ("/api/v1/auth",)

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not any(path.startswith(prefix) for prefix in self._PROTECTED_PREFIXES):
            return await call_next(request)

        limit = get_settings().rate_limit_per_minute
        key = f"{_client_key(request)}:{path}"
        now = time.monotonic()
        bucket = _events[key]
        while bucket and now - bucket[0] > _WINDOW_SECONDS:
            bucket.popleft()

        if len(bucket) >= limit:
            retry_after = max(1, int(_WINDOW_SECONDS - (now - bucket[0])))
            return JSONResponse(
                status_code=429,
                content={
                    "error": {
                        "code": "rate_limited",
                        "message": "Trop de tentatives. Réessayez dans un instant.",
                    }
                },
                headers={"Retry-After": str(retry_after)},
            )

        bucket.append(now)
        return await call_next(request)


def reset_rate_limit() -> None:
    """Utilisé par les tests."""
    _events.clear()