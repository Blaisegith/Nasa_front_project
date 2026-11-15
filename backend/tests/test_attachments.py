"""Tests des pièces jointes du chat — validation, isolation, persistance."""

from __future__ import annotations

import io

from httpx import AsyncClient

_PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def _upload(client: AsyncClient, *, name: str, content_type: str, content: bytes):
    return client.post(
        "/api/v1/chat/attachments",
        files={"file": (name, io.BytesIO(content), content_type)},
    )


async def test_upload_pdf_then_download(alice: AsyncClient) -> None:
    response = await _upload(alice, name="rapport.pdf", content_type="application/pdf", content=_PDF)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["media_type"] == "document"
    assert body["filename"] == "rapport.pdf"
    assert body["size_bytes"] == len(_PDF)
    assert body["url"] == f"/api/v1/chat/attachments/{body['attachment_id']}"

    download = await alice.get(f"/api/v1/chat/attachments/{body['attachment_id']}")
    assert download.status_code == 200
    assert download.content == _PDF


async def test_upload_rejects_unsupported_type(alice: AsyncClient) -> None:
    response = await _upload(
        alice, name="notes.txt", content_type="text/plain", content=b"bonjour"
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_failed"


async def test_upload_rejects_empty_file(alice: AsyncClient) -> None:
    response = await _upload(alice, name="vide.pdf", content_type="application/pdf", content=b"")
    assert response.status_code == 422


async def test_attachment_is_not_readable_by_another_user(alice: AsyncClient, bob: AsyncClient) -> None:
    uploaded = await _upload(alice, name="prive.pdf", content_type="application/pdf", content=_PDF)
    attachment_id = uploaded.json()["attachment_id"]
    assert (await bob.get(f"/api/v1/chat/attachments/{attachment_id}")).status_code == 404
    assert (await alice.get(f"/api/v1/chat/attachments/{attachment_id}")).status_code == 200


async def test_attachment_is_persisted_with_the_question(alice: AsyncClient) -> None:
    uploaded = await _upload(alice, name="flamme.png", content_type="image/png", content=b"\x89PNG\r\n")
    attachment_id = uploaded.json()["attachment_id"]

    response = await alice.post(
        "/api/v1/chat",
        json={"text": "Analyse cette image.", "attachments": [{"attachment_id": attachment_id}]},
    )
    assert response.status_code == 501
    detail = response.json()["error"]["detail"]
    assert detail["question_persisted"] is True
    assert detail["attachments_persisted"] == [attachment_id]

    conversation_id = detail["conversation_id"]
    conversation = await alice.get(f"/api/v1/conversations/{conversation_id}")
    content = conversation.json()["messages"][0]["content"]
    assert content["text"] == "Analyse cette image."
    assert content["attachments"][0]["attachment_id"] == attachment_id
    assert content["attachments"][0]["media_type"] == "image"


async def test_chat_rejects_unknown_attachment(alice: AsyncClient) -> None:
    response = await alice.post(
        "/api/v1/chat",
        json={"text": "Question", "attachments": [{"attachment_id": "0" * 32}]},
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_too_many_attachments_rejected(alice: AsyncClient) -> None:
    response = await alice.post(
        "/api/v1/chat",
        json={
            "text": "Question",
            "attachments": [{"attachment_id": f"{index:032x}"} for index in range(6)],
        },
    )
    assert response.status_code == 422


async def test_upload_rejects_oversized_file(alice: AsyncClient, monkeypatch) -> None:
    from app.core.config import Settings
    from app.services import attachment_service

    settings = attachment_service.get_settings()
    tightened = Settings(
        **{**settings.model_dump(), "attachment_max_bytes": 4}
    )
    monkeypatch.setattr(attachment_service, "get_settings", lambda: tightened)

    response = await _upload(
        alice, name="gros.pdf", content_type="application/pdf", content=_PDF
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"