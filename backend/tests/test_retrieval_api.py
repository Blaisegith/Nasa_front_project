"""Tests de l'API de recherche multimodale et de son intégration au chat.

Le corpus est réel (texte, image, vidéo ffmpeg, mesures) et isolé dans un
dossier temporaire ; la configuration du moteur est faite par variables
d'environnement avant l'appel de l'API, comme en production.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.services.retrieval import service as retrieval_service
from tests.test_retrieval import CORPUS_FILES, _make_png, _make_video


def _write_corpus(corpus: Path) -> None:
    corpus.mkdir(parents=True, exist_ok=True)
    for name, content in CORPUS_FILES.items():
        (corpus / name).write_text(content, encoding="utf-8")
    _make_png(corpus / "flamme spherique.png")
    if _make_video(corpus / "combustion-microgravite.mp4"):
        (corpus / "combustion-microgravite.vtt").write_text(
            CORPUS_FILES["experience-flamme.vtt"], encoding="utf-8"
        )


def _configure(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, corpus: Path) -> None:
    monkeypatch.setenv("MULTIMODAL_CORPUS_DIRS", str(corpus))
    monkeypatch.setenv("MULTIMODAL_INDEX_DB", str(tmp_path / "index.db"))
    monkeypatch.setenv("MULTIMODAL_FRAME_DIR", str(tmp_path / "frames"))
    retrieval_service.reset()


@pytest_asyncio.fixture
async def corpus_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Client authentifié, corpus indexable et moteur réinitialisé."""
    corpus = tmp_path / "corpus"
    _write_corpus(corpus)
    _configure(tmp_path, monkeypatch, corpus)

    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        session = await client.post(
            "/api/v1/auth/session",
            json={"email": "carol@example.com", "display_name": "Carol Index"},
        )
        assert session.status_code == 201, session.text
        yield client, corpus, tmp_path

    retrieval_service.reset()


async def test_status_indique_un_index_vide(client: AsyncClient, tmp_path: Path, monkeypatch) -> None:
    empty = tmp_path / "vide"
    empty.mkdir()
    _configure(tmp_path, monkeypatch, empty)

    await client.post(
        "/api/v1/auth/session",
        json={"email": "dave@example.com", "display_name": "Dave Vide"},
    )
    response = await client.get("/api/v1/retrieval/status")
    assert response.status_code == 200
    body = response.json()
    assert body["available"] is False
    assert body["stats"]["files"] == 0
    assert body["embedder"]["cross_modal"] is False
    assert body["notes"], "le choix de l'embedder doit être expliqué"

    retrieval_service.reset()


async def test_scan_indexe_le_corpus_et_search_renvoie_des_resultats(corpus_client) -> None:
    client, corpus, _ = corpus_client

    scan = await client.post("/api/v1/retrieval/scan")
    assert scan.status_code == 200, scan.text
    assert scan.json()["indexed"] >= 4
    assert scan.json()["errors"] == []

    # Deuxième passage : rien à réindexer.
    again = await client.post("/api/v1/retrieval/scan")
    assert again.json()["indexed"] == 0
    assert again.json()["unchanged"] >= 4

    response = await client.post(
        "/api/v1/retrieval/search",
        json={"question": "Montre-moi les images et vidéos de la propagation de la flamme"},
    )
    assert response.status_code == 200, response.text
    bundle = response.json()["retrieval"]
    assert bundle["status"] == "ok"
    assert bundle["results"]["documents"]
    assert bundle["results"]["images"]
    assert bundle["results"]["videos"]

    video = bundle["results"]["videos"][0]
    assert video["segments"], "des segments horodatés sont attendus"
    assert video["segments"][0]["frame_url"].startswith("/api/v1/retrieval/files")

    answer = response.json()["answer"]
    assert answer["media"], "les médias doivent être projetés dans la réponse"
    assert answer["summary"] is None, "aucune synthèse ne doit être fabriquée"
    assert any("métadonnées" in item for item in answer["limitations"])

    # Les graphiques ne sont produits que si la question porte sur les mesures :
    # on ne renvoie pas une modalité qui n'a pas été demandée.
    measured = await client.post(
        "/api/v1/retrieval/search",
        json={"question": "évolution de la température pendant l'expérience"},
    )
    measured_answer = measured.json()["answer"]
    assert measured_answer["charts"], "les mesures doivent produire des graphiques"
    chart = measured_answer["charts"][0]
    assert chart["y_unit"] == "K"
    assert chart["series"][0]["points"], "les points doivent venir du fichier réel"


async def test_fichier_indexe_servi_et_hors_index_refuse(corpus_client) -> None:
    client, corpus, tmp_path = corpus_client

    await client.post("/api/v1/retrieval/scan")

    image = str((corpus / "flamme spherique.png").resolve())
    served = await client.get("/api/v1/retrieval/files", params={"path": image})
    assert served.status_code == 200
    assert served.headers["content-type"].startswith("image/png")

    outside = tmp_path / "secret.txt"
    outside.write_text("hors corpus", encoding="utf-8")
    refused = await client.get("/api/v1/retrieval/files", params={"path": str(outside)})
    assert refused.status_code == 404

    traversal = await client.get(
        "/api/v1/retrieval/files",
        params={"path": str(corpus / ".." / "secret.txt")},
    )
    assert traversal.status_code == 404


async def test_chat_joint_les_resultats_et_persiste_la_reponse(corpus_client) -> None:
    client, _, _ = corpus_client

    await client.post("/api/v1/retrieval/scan")

    response = await client.post(
        "/api/v1/chat",
        json={"text": "Montre-moi les vidéos de la combustion en microgravité"},
    )
    assert response.status_code == 501
    detail = response.json()["error"]["detail"]
    assert detail["question_persisted"] is True
    assert detail["retrieval_status"] == "ok"
    assert detail["retrieval"]["results"]["videos"]

    conversation = await client.get(f"/api/v1/conversations/{detail['conversation_id']}")
    assert conversation.status_code == 200
    messages = conversation.json()["messages"]
    assert [message["role"] for message in messages] == ["user", "assistant"]

    assistant = messages[1]
    assert assistant["status"] == "partial"
    assert assistant["content"]["media"], "les médias doivent être dans l'historique"
    assert assistant["content"]["summary"] is None


async def test_recherche_exige_une_session(client: AsyncClient, tmp_path: Path, monkeypatch) -> None:
    _configure(tmp_path, monkeypatch, tmp_path)

    assert (await client.get("/api/v1/retrieval/status")).status_code == 401
    assert (
        await client.post("/api/v1/retrieval/search", json={"question": "flamme"})
    ).status_code == 401
    assert (await client.post("/api/v1/retrieval/scan")).status_code == 401

    retrieval_service.reset()


async def test_capabilities_expose_la_recherche(corpus_client) -> None:
    client, _, _ = corpus_client

    response = await client.get("/api/v1/system/capabilities")
    assert response.status_code == 200
    body = response.json()
    retrieval = body["capabilities"]["retrieval"]
    assert retrieval["connected"] is True
    assert retrieval["name"] == "retrieval-local"
    assert body["retrieval"] == "/api/v1/retrieval/search"