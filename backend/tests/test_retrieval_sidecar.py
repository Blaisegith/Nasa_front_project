"""Métadonnées de média : le fichier compagnon rend l'image cherchable.

Le moteur ne comprend pas les images sans modèle ONNX : une image n'est
retrouvée que par ses métadonnées réelles. Si ces métadonnées vivent dans un
fichier séparé (`.nasa.json`) et ne sont pas rattachées au média, l'image
devient introuvable — c'est exactement le bug que ces tests verrouillent.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.retrieval.config import RetrievalSettings
from app.services.retrieval.embedders import select_embedder
from app.services.retrieval.indexer import Indexer, read_sidecar, sidecar_for
from app.services.retrieval.store import IndexStore

SIDECAR = {
    "nasa_id": "GRC-2016-C-05051",
    "title": "Advanced Combustion via Microgravity Experiments, ACME chamber insert",
    "description": "Vue de l'insert de la chambre de combustion ACME installé dans le module Destiny.",
    "date_created": "2016-01-01T00:00:00Z",
    "center": "GRC",
    "media_type": "image",
    "keywords": ["combustion", "microgravity", "ACME"],
    "photographer": "",
}


def _png(path: Path) -> None:
    from PIL import Image

    Image.new("RGB", (320, 180), (20, 30, 50)).save(path, format="PNG")


@pytest.fixture()
def corpus(tmp_path: Path) -> Path:
    root = tmp_path / "corpus"
    root.mkdir()
    _png(root / "nasa-GRC-2016-C-05051.png")
    import json

    (root / "nasa-GRC-2016-C-05051.nasa.json").write_text(
        json.dumps(SIDECAR, ensure_ascii=False), encoding="utf-8"
    )
    # Un média sans compagnon : il garde son nom de fichier pour titre.
    _png(root / "sans-metadonnees.png")
    return root


@pytest.fixture()
def settings(tmp_path: Path, corpus: Path) -> RetrievalSettings:
    return RetrievalSettings(
        corpus_dirs=(str(corpus),),
        index_db=str(tmp_path / "index.db"),
        frame_dir=str(tmp_path / "frames"),
    )


def test_sidecar_detecte_et_relu(corpus: Path):
    media = corpus / "nasa-GRC-2016-C-05051.png"
    assert sidecar_for(media) == corpus / "nasa-GRC-2016-C-05051.nasa.json"
    payload = read_sidecar(media)
    assert payload["nasa_id"] == "GRC-2016-C-05051"
    assert "ACME" in payload["title"]

    orphan = corpus / "sans-metadonnees.png"
    assert sidecar_for(orphan) is None
    assert read_sidecar(orphan) == {}


def test_sidecar_non_indexe_comme_document(settings: RetrievalSettings):
    """Le compagnon n'est pas un document : sinon le texte serait en double."""
    embedder, _ = select_embedder(settings)
    indexer = Indexer(settings, embedder)
    files = [path for path, _ in indexer.iter_files()]
    names = sorted(path.name for path in files)
    assert "nasa-GRC-2016-C-05051.nasa.json" not in names
    assert "nasa-GRC-2016-C-05051.png" in names


def test_metadonnees_appliquees_a_l_image(settings: RetrievalSettings):
    embedder, _ = select_embedder(settings)
    store = IndexStore(settings)
    Indexer(settings, embedder, store=store).scan()

    images = store.resources("image")
    row = next(item for item in images if item["path"].endswith("nasa-GRC-2016-C-05051.png"))
    assert row["title"].startswith("Advanced Combustion")
    assert "ACME" in row["description"]
    assert row["meta"]["nasa_id"] == "GRC-2016-C-05051"
    assert row["meta"]["center"] == "GRC"

    # Sans compagnon, le titre reste celui du fichier : rien n'est inventé.
    plain = next(item for item in images if item["path"].endswith("sans-metadonnees.png"))
    assert plain["title"] == "sans metadonnees"
    assert plain["description"] == ""


def test_image_retrovable_par_son_titre_reel(settings: RetrievalSettings):
    """C'est le point fonctionnel : « chambre de combustion ACME » doit trouver l'image."""
    from app.services.retrieval.engine import MultimodalEngine

    embedder, notes = select_embedder(settings)
    store = IndexStore(settings)
    Indexer(settings, embedder, store=store).scan()
    engine = MultimodalEngine(settings, embedder, store=store, notes=notes)

    bundle = engine.retrieve("Montre-moi l'image de la chambre de combustion ACME")
    titles = [hit.title for hit in bundle.images]
    assert any("ACME" in title for title in titles), bundle.to_dict()


def test_chunks_de_l_image_portent_les_metadonnees(settings: RetrievalSettings):
    embedder, _ = select_embedder(settings)
    store = IndexStore(settings)
    Indexer(settings, embedder, store=store).scan()
    row = next(item for item in store.resources("image") if "nasa-GRC" in item["path"])
    text = " ".join(chunk["text"] for chunk in store.chunks(row["id"]))
    assert "Advanced Combustion" in text
    assert "ACME" in text
    assert row["id"] in text or "nasa-GRC-2016-C-05051.png" in text