"""Tests d'avatar : téléversement, restitution, isolation."""

from __future__ import annotations

import io

from httpx import AsyncClient

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 200


async def test_avatar_upload_and_fetch(alice: AsyncClient) -> None:
    upload = await alice.post(
        "/api/v1/profile/avatar",
        files={"file": ("avatar.png", io.BytesIO(PNG_BYTES), "image/png")},
    )
    assert upload.status_code == 201
    url = upload.json()["avatar_url"]
    assert url.startswith("/api/v1/profile/avatar/")

    fetched = await alice.get(url)
    assert fetched.status_code == 200
    assert fetched.content == PNG_BYTES
    assert fetched.headers["content-type"] == "image/png"

    profile = await alice.get("/api/v1/profile")
    assert profile.json()["avatar_url"] == url


async def test_avatar_of_another_user_is_not_readable(alice: AsyncClient, bob: AsyncClient) -> None:
    upload = await alice.post(
        "/api/v1/profile/avatar",
        files={"file": ("avatar.png", io.BytesIO(PNG_BYTES), "image/png")},
    )
    url = upload.json()["avatar_url"]
    assert (await bob.get(url)).status_code == 404


async def test_avatar_rejects_unsupported_type(alice: AsyncClient) -> None:
    response = await alice.post(
        "/api/v1/profile/avatar",
        files={"file": ("notes.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_failed"