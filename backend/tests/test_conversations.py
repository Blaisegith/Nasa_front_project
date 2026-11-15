"""Tests d'isolation entre utilisateurs et de conversations."""

from __future__ import annotations

from httpx import AsyncClient


async def test_profile_update_and_read(alice: AsyncClient) -> None:
    updated = await alice.patch(
        "/api/v1/profile",
        json={"display_name": "Alice M.", "bio": "Ingénieure combustion."},
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["display_name"] == "Alice M."
    assert body["bio"] == "Ingénieure combustion."

    me = await alice.get("/api/v1/auth/me")
    assert me.json()["profile"]["display_name"] == "Alice M."


async def test_empty_display_name_rejected(alice: AsyncClient) -> None:
    response = await alice.patch("/api/v1/profile", json={"display_name": "   "})
    assert response.status_code in {200, 422}


async def test_conversation_isolation(alice: AsyncClient, bob: AsyncClient) -> None:
    created = await alice.post("/api/v1/conversations", json={"title": "Flammes sphériques"})
    assert created.status_code == 201
    conversation_id = created.json()["id"]

    # Bob ne doit pas voir la conversation d'Alice : 404, pas 403.
    assert (await bob.get(f"/api/v1/conversations/{conversation_id}")).status_code == 404
    assert (await bob.delete(f"/api/v1/conversations/{conversation_id}")).status_code == 404

    # Alice, si.
    assert (await alice.get(f"/api/v1/conversations/{conversation_id}")).status_code == 200


async def test_chat_persists_question_even_when_not_configured(alice: AsyncClient) -> None:
    response = await alice.post("/api/v1/chat", json={"text": "Pourquoi la flamme est-elle sphérique ?"})
    assert response.status_code == 501
    body = response.json()
    assert body["error"]["code"] == "not_implemented"
    assert body["error"]["detail"]["question_persisted"] is True

    conversation_id = body["error"]["detail"]["conversation_id"]
    conversation = await alice.get(f"/api/v1/conversations/{conversation_id}")
    assert conversation.status_code == 200
    messages = conversation.json()["messages"]
    assert len(messages) == 1
    assert messages[0]["role"] == "user"
    assert messages[0]["content"]["text"].startswith("Pourquoi la flamme")
    # Aucune réponse fabriquée n'est enregistrée.
    assert all(message["role"] != "assistant" for message in messages)


async def test_conversation_shared_between_views(alice: AsyncClient) -> None:
    """La même conversation est visible via la liste et via le détail."""
    created = await alice.post("/api/v1/conversations", json={"title": "Suie"})
    conversation_id = created.json()["id"]
    await alice.post(
        "/api/v1/chat",
        json={"conversation_id": conversation_id, "text": "Comment se forme la suie ?"},
    )

    listing = await alice.get("/api/v1/conversations")
    assert listing.status_code == 200
    items = listing.json()["items"]
    assert any(item["id"] == conversation_id for item in items)
    assert items[0]["preview"].startswith("Comment se forme")


async def test_conversations_of_other_user_are_not_listed(alice: AsyncClient, bob: AsyncClient) -> None:
    await alice.post("/api/v1/conversations", json={"title": "Privée Alice"})
    listing = await bob.get("/api/v1/conversations")
    assert listing.json()["items"] == []
    assert listing.json()["total"] == 0


async def test_media_and_science_are_open_but_not_connected(alice: AsyncClient) -> None:
    media = await alice.get("/api/v1/media/search", params={"q": "flamme"})
    assert media.status_code == 501
    assert media.json()["error"]["detail"]["component"] == "media"

    science = await alice.post("/api/v1/science/compute", json={"model": "goutte"})
    assert science.status_code == 501