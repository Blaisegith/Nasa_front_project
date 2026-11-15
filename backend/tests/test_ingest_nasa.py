"""Ingestion NASA : tests hors ligne.

Aucune requête réseau n'est émise. Les fonctions `_http_json` et `_download` du
module sont remplacées : on vérifie la logique (sélection, métadonnées, sécurité
d'URL, désactivation par défaut), pas la disponibilité d'Internet.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.retrieval import ingest_nasa as mod
from app.services.retrieval.config import RetrievalSettings
from app.services.retrieval.embedders import select_embedder
from app.services.retrieval.indexer import index_corpus
from app.services.retrieval.store import IndexStore

_SEARCH_ITEMS = [
    {
        "href": "https://images.nasa.gov/details/NASA-FLAME-1",
        "data": [
            {
                "nasa_id": "NASA-FLAME-1",
                "title": "Flamme sphérique en microgravité",
                "description": "Observation de la propagation d'une flamme en microgravité.",
                "date_created": "1997-08-12T00:00:00Z",
                "center": "MSFC",
                "media_type": "image",
                "keywords": ["combustion", "microgravity"],
                "photographer": "",
            }
        ],
    },
    {
        "href": "https://images.nasa.gov/details/NASA-FLAME-2",
        "data": [
            {
                "nasa_id": "NASA-FLAME-2",
                "title": "Propagation d'une flamme, séquence vidéo",
                "description": "Séquence de combustion filmée en microgravité.",
                "date_created": "1997-08-13T00:00:00Z",
                "center": "JSC",
                "media_type": "video",
                "keywords": ["combustion"],
                "photographer": "",
            }
        ],
    },
]

_ASSETS = {
    "NASA-FLAME-1": {
        "collection": {
            "items": [
                {"href": "https://images-assets.nasa.gov/image/NASA-FLAME-1/NASA-FLAME-1~thumb.jpg"},
                {"href": "https://images-assets.nasa.gov/image/NASA-FLAME-1/NASA-FLAME-1~orig.jpg"},
            ]
        }
    },
    "NASA-FLAME-2": {
        "collection": {
            "items": [
                {"href": "https://images-assets.nasa.gov/video/NASA-FLAME-2/NASA-FLAME-2~mobile.mp4"},
                {"href": "https://images-assets.nasa.gov/video/NASA-FLAME-2/NASA-FLAME-2~orig.mp4"},
            ]
        }
    },
}


@pytest.fixture()
def fake_network(monkeypatch: pytest.MonkeyPatch) -> dict[str, int]:
    """Remplace la recherche, le manifeste et le téléchargement."""
    calls = {"search": 0, "asset": 0, "download": 0}

    def _json(url: str, *, timeout: float) -> dict:
        if "/search" in url:
            calls["search"] += 1
            return {"collection": {"items": _SEARCH_ITEMS}}
        calls["asset"] += 1
        for nasa_id, payload in _ASSETS.items():
            if nasa_id in url:
                return payload
        return {"collection": {"items": []}}

    def _download(url: str, dest: Path, *, timeout: float, max_bytes: int) -> int:
        if dest.exists() and dest.stat().st_size > 0:  # comportement réel
            return dest.stat().st_size
        calls["download"] += 1
        dest.parent.mkdir(parents=True, exist_ok=True)
        payload = b"contenu reel du fichier" if dest.suffix == ".jpg" else b"\x00" * 512
        dest.write_bytes(payload)
        return len(payload)

    monkeypatch.setattr(mod, "_http_json", _json)
    monkeypatch.setattr(mod, "_download", _download)
    return calls


def test_urls_non_nasa_refusees():
    assert mod._is_nasa_url("https://images-assets.nasa.gov/image/x~orig.jpg")
    assert not mod._is_nasa_url("http://images-assets.nasa.gov/image/x.jpg")
    assert not mod._is_nasa_url("https://images-assets.nasa.gov.evil.com/x.jpg")
    assert not mod._is_nasa_url("https://nasa.gov.attacker.io/x.jpg")
    assert not mod._is_nasa_url("https://example.com/x.jpg")


def test_manifest_choisit_orig_puis_large():
    manifest = _ASSETS["NASA-FLAME-1"]["collection"]["items"]
    assert mod.pick_asset(manifest, "image").endswith("~orig.jpg")
    assert mod.pick_asset(_ASSETS["NASA-FLAME-2"]["collection"]["items"], "video").endswith("~orig.mp4")
    assert mod.pick_asset([{"href": "https://images-assets.nasa.gov/a/x.txt"}], "image") is None


def test_ingest_ecrit_medias_et_metadonnees_reelles(tmp_path: Path, fake_network):
    settings = RetrievalSettings(corpus_dirs=(str(tmp_path / "corpus"),), index_db=str(tmp_path / "index.db"))
    report = mod.ingest(settings, "flamme microgravité", limit=2, dest=tmp_path / "corpus")

    assert report.downloaded == 2
    assert report.selected == 2
    assert report.errors == []

    media = sorted(p.name for p in (tmp_path / "corpus").iterdir() if p.suffix in {".jpg", ".mp4"})
    assert media == ["nasa-NASA-FLAME-1.jpg", "nasa-NASA-FLAME-2.mp4"]

    metadata = sorted(p.name for p in (tmp_path / "corpus").glob("*.nasa.json"))
    assert len(metadata) == 2
    assert "nasa-NASA-FLAME-1.nasa.json" in metadata

    import json

    payload = json.loads((tmp_path / "corpus" / "nasa-NASA-FLAME-1.nasa.json").read_text(encoding="utf-8"))
    assert payload["title"] == "Flamme sphérique en microgravité"
    assert payload["center"] == "MSFC"
    assert payload["asset_href"].endswith("~orig.jpg")


def test_ingest_metadonnees_indexees_comme_document(tmp_path: Path, fake_network):
    """Les métadonnées réelles rendent l'image cherchable par son titre."""
    settings = RetrievalSettings(corpus_dirs=(str(tmp_path / "corpus"),), index_db=str(tmp_path / "index.db"))
    mod.ingest(settings, "flamme", limit=2, dest=tmp_path / "corpus")

    embedder, _ = select_embedder(settings)
    store = IndexStore(settings)
    index_corpus(settings, embedder, store=store)

    texts: list[str] = []
    for resource in store.resources():
        for row in store.chunks(resource["id"]):
            texts.append(row["text"])
    joined = " ".join(texts)
    assert "Flamme sphérique en microgravité" in joined


def test_ingest_deuxieme_passage_ne_telecharge_pas(tmp_path: Path, fake_network):
    settings = RetrievalSettings(corpus_dirs=(str(tmp_path / "corpus"),), index_db=str(tmp_path / "index.db"))
    mod.ingest(settings, "flamme", limit=2, dest=tmp_path / "corpus", index=False)
    assert fake_network["download"] == 2

    report = mod.ingest(settings, "flamme", limit=2, dest=tmp_path / "corpus", index=False)
    assert report.downloaded == 0
    assert report.reused == 2
    assert fake_network["download"] == 2  # aucun nouveau téléchargement


def test_ingest_respecte_la_limite_demandee(tmp_path: Path, fake_network):
    settings = RetrievalSettings(corpus_dirs=(str(tmp_path / "corpus"),), index_db=str(tmp_path / "index.db"))
    report = mod.ingest(settings, "flamme", limit=1, dest=tmp_path / "corpus")
    assert report.searched == 2  # deux ressources trouvées
    assert report.selected == 1  # une seule demandée