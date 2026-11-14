"""Tests d'authentification et de session."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


async def test_health_and_capabilities(client: AsyncClient) -> None:
    health = await client.get("/api/v1/system/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    capabilities = await client.get("/api/v1/system/capabilities")
    body = capabilities.json()["capabilities"]
    assert body["rag"]["connected"] is False
    assert body["media"]["connected"] is False
    assert body["science"]["connected"] is False
    assert body["generation"]["connected"] is False


async def test_create_session_sets_httponly_cookie(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/session",
        json={"email": "Alice@Example.com", "display_name": "Alice Martin"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["profile"]["display_name"] == "Alice Martin"
    assert body["profile"]["user_id"]
    assert body["weak_auth"] is True

    cookie = response.cookies.get("techlabs_session")
    assert cookie
    set_cookie = response.headers["set-cookie"].lower()
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie


async def test_email_is_normalized_and_reused(client: AsyncClient) -> None:
    first = await client.post("/api/v1/auth/session", json={"email": "Alice@Example.com"})
    second = await client.post("/api/v1/auth/session", json={"email": "  alice@example.com "})
    assert first.status_code == second.status_code == 201
    assert first.json()["profile"]["user_id"] == second.json()["profile"]["user_id"]


async def test_session_requires_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/auth/session")).status_code == 401
    assert (await client.get("/api/v1/profile")).status_code == 401


async def test_invalid_email_rejected(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/session", json={"email": "pas-un-email"})
    assert response.status_code == 422


async def test_logout_revokes_session(client: AsyncClient) -> None:
    await client.post("/api/v1/auth/session", json={"email": "carol@example.com"})
    assert (await client.get("/api/v1/auth/session")).status_code == 200

    deleted = await client.delete("/api/v1/auth/session")
    assert deleted.status_code == 204
    assert (await client.get("/api/v1/auth/session")).status_code == 401


async def test_forged_user_id_is_ignored(client: AsyncClient) -> None:
    """Le client ne peut pas choisir son `user_id`."""
    await client.post("/api/v1/auth/session", json={"email": "dave@example.com"})
    response = await client.patch(
        "/api/v1/profile",
        json={"display_name": "Usurpateur"},
        headers={"X-User-Id": "00000000-0000-0000-0000-000000000000"},
    )
    assert response.status_code == 200
    assert response.json()["display_name"] == "Usurpateur"
    assert response.json()["user_id"] != "00000000-0000-0000-0000-000000000000"