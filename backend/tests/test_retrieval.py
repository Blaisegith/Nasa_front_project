"""Tests du MULTIMODAL RETRIEVAL ENGINE.

Le corpus de test est **réel** : documents texte, image PNG et vidéo MP4 sont
générés dans un dossier temporaire (la vidéo par ffmpeg), puis indexés. Aucun
résultat n'est simulé.
"""

from __future__ import annotations

import csv
import shutil
import subprocess
from pathlib import Path

import pytest

from app.services.retrieval.config import RetrievalSettings
from app.services.retrieval.embedders import StructuralEmbedder, select_embedder
from app.services.retrieval.engine import MultimodalEngine, detect_intent, tokenize
from app.services.retrieval.indexer import Indexer, index_corpus
from app.services.retrieval.store import IndexStore

CORPUS_FILES = {
    "etude-propagation-flamme.md": (
        "# Propagation d'une flamme en microgravité\n\n"
        "En microgravité, la propagation d'une flamme suit un mécanisme de diffusion. "
        "La vitesse de propagation diminue fortement par rapport à la gravité terrestre.\n\n"
        "## Observations\n\n"
        "La flamme prend une forme sphérique. La température du gaz au voisinage atteint 1800 K. "
        "L'extinction survient lorsque la concentration en oxygène descend sous 15 %.\n"
    ),
    "flamme-microgravite.txt": (
        "Compte rendu d'expérience : combustion en microgravité.\n"
        "La propagation de la flamme a été observée pendant 12 secondes.\n"
        "Le front de flamme avance à 2,4 mm/s dans le mélange méthane-oxygène.\n"
    ),
    "mesures-temperature.csv": (
        "temps [s],temperature [K],pression [Pa]\n"
        "0,300,101325\n"
        "2,420,101325\n"
        "4,780,101300\n"
        "6,1120,101280\n"
        "8,1450,101250\n"
        "10,1620,101200\n"
    ),
    "experience-flamme.vtt": (
        "WEBVTT\n\n"
        "00:00:00.000 --> 00:00:01.500\n"
        "Allumage du mélange méthane-oxygène en microgravité.\n\n"
        "00:00:01.500 --> 00:00:03.000\n"
        "Propagation de la flamme et formation d'une enveloppe sphérique.\n"
    ),
}


def _make_png(path: Path) -> None:
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (640, 360), (12, 26, 48))
    draw = ImageDraw.Draw(image)
    for index in range(60):
        offset = index * 2
        left, right = 180 + offset, 460 - offset
        top, bottom = 90 + offset, 270 - offset
        if right - left < 4 or bottom - top < 4:
            break
        draw.ellipse(
            [left, top, right, bottom],
            fill=(min(255, 220 - index * 2), min(255, 110 + index * 2), 40),
        )
    draw.text((20, 20), "flame propagation microgravity", fill=(240, 240, 250))
    image.save(path, format="PNG")


def _make_video(path: Path, seconds: int = 3) -> bool:
    if shutil.which("ffmpeg") is None:
        return False
    result = subprocess.run(
        [
            "ffmpeg", "-nostdin", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", f"testsrc=size=320x240:rate=25:duration={seconds}",
            "-pix_fmt", "yuv420p", str(path),
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )
    return result.returncode == 0 and path.is_file()


@pytest.fixture()
def corpus(tmp_path: Path) -> Path:
    root = tmp_path / "corpus"
    root.mkdir()
    for name, content in CORPUS_FILES.items():
        (root / name).write_text(content, encoding="utf-8")
    _make_png(root / "flamme spherique.png")
    if _make_video(root / "combustion-microgravite.mp4"):
        # La vidéo de test n'a pas de transcription : on réutilise le VTT comme
        # fichier compagnon, ce que l'extracteur sait lire.
        (root / "combustion-microgravite.vtt").write_text(
            CORPUS_FILES["experience-flamme.vtt"], encoding="utf-8"
        )
    (root / "notes.txt").write_text("Notes sans rapport avec la combustion.", encoding="utf-8")
    return root


@pytest.fixture()
def settings(tmp_path: Path, corpus: Path) -> RetrievalSettings:
    return RetrievalSettings(
        corpus_dirs=(str(corpus),),
        index_db=str(tmp_path / "index.db"),
        frame_dir=str(tmp_path / "frames"),
        max_frames_per_video=6,
        frame_width=240,
        default_limit=8,
    )


@pytest.fixture()
def indexed(settings: RetrievalSettings):
    embedder, notes = select_embedder(settings)
    store = IndexStore(settings)
    report = index_corpus(settings, embedder, store=store)
    engine = MultimodalEngine(settings, embedder, store=store, notes=notes)
    return engine, store, report


# ----------------------------------------------------------------- intention
def test_intent_images_et_videos():
    images = detect_intent("Montre-moi les images de la propagation de flamme")
    assert images.kind == "show_images"
    assert images.weights["image"] == 1.0
    assert "text" in images.weights

    videos = detect_intent("Je voudrais voir les vidéos des expériences de combustion")
    assert videos.weights["video"] == 1.0

    temporal = detect_intent("Comment évolue la température pendant l'expérience ?")
    assert temporal.weights["measurement"] >= 0.8

    explain = detect_intent("Pourquoi la flamme s'éteint-elle ?")
    assert explain.kind == "explain"
    assert explain.weights["text"] == 1.0
    # Appui iconographique documenté : le phénomène est nommé, l'image vient en
    # renfort (0.3), jamais au premier plan.
    assert explain.weights.get("image", 0.0) == 0.3

    neutral = detect_intent("Quelle est la définition d'un mélange stœchiométrique ?")
    assert neutral.kind == "explain"
    assert "video" not in neutral.weights


def test_tokenize_ignore_les_mots_vides():
    tokens = tokenize("Montre-moi les images de la flamme")
    assert "flamme" in tokens
    assert "les" not in tokens
    assert "moi" not in tokens


# ---------------------------------------------------------------- indexation
def test_indexation_complete_et_metadonnees(indexed):
    engine, store, report = indexed
    assert report.indexed >= 4
    assert report.errors == []

    stats = store.stats()
    assert stats["documents"] >= 3
    assert stats["images"] == 1
    assert stats["videos"] == 1
    assert stats["datasets"] >= 1
    assert stats["frames"] > 0
    assert stats["chunks"] > 0


def test_frames_video_horodatees_et_rattachees(indexed):
    engine, store, _ = indexed
    videos = store.resources("video")
    assert len(videos) == 1
    video = videos[0]
    frames = store.frames([video["id"]])
    assert frames, "des frames doivent être extraites de la vidéo"

    timestamps = [float(frame["timestamp_s"]) for frame in frames]
    assert timestamps == sorted(timestamps), "les timestamps doivent être croissants"
    duration = float(video["meta"]["duration_s"])
    assert all(0 <= value <= duration + 0.01 for value in timestamps), (timestamps, duration)
    for frame in frames:
        assert frame["resource_id"] == video["id"]
        assert Path(frame["path"]).is_file(), "la frame extraite doit exister sur disque"


def test_transcription_indexee_comme_texte_de_la_video(indexed):
    engine, store, _ = indexed
    video = store.resources("video")[0]
    assert "propagation" in (video["description"] or "").lower()


def test_reindexation_incrementale(indexed, settings):
    engine, store, first = indexed
    embedder = engine.embedder

    second = index_corpus(settings, embedder, store=store)
    assert second.indexed == 0, "aucun fichier ne doit être réindexé"
    assert second.unchanged == first.indexed
    assert second.removed == 0


def test_fichier_modifie_reindexe_seul(indexed, settings, corpus):
    engine, store, first = indexed
    embedder = engine.embedder

    target = corpus / "flamme-microgravite.txt"
    target.write_text(target.read_text(encoding="utf-8") + "\nNouvelle observation.\n", encoding="utf-8")

    report = index_corpus(settings, embedder, store=store)
    assert report.indexed == 1
    assert report.unchanged == first.indexed - 1


def test_fichier_supprime_oublie(indexed, settings, corpus):
    engine, store, _ = indexed
    embedder = engine.embedder

    (corpus / "notes.txt").unlink()
    report = index_corpus(settings, embedder, store=store)
    assert report.removed == 1


# ----------------------------------------------------------------- recherche
def test_recherche_document(indexed):
    engine, _, _ = indexed
    bundle = engine.retrieve("mécanisme de propagation de la flamme en microgravité")
    assert bundle.status == "ok"
    assert bundle.documents, "le document doit être retrouvé"
    assert any("propagation" in hit.excerpt.lower() for hit in bundle.documents)
    assert all(hit.score > 0 for hit in bundle.documents)


def test_recherche_image_par_description(indexed):
    engine, _, _ = indexed
    bundle = engine.retrieve("Montre-moi les images de la propagation d'une flamme")
    assert bundle.images, "l'image doit être retrouvée par ses métadonnées"
    image = bundle.images[0]
    assert image.matched_by == "metadata-lexical"
    assert image.url.startswith("/api/v1/retrieval/files?path=")


def test_recherche_video_par_contenu_et_segments(indexed):
    engine, _, _ = indexed
    bundle = engine.retrieve("Je voudrais voir les vidéos des expériences de combustion en microgravité")
    assert bundle.videos, "la vidéo doit être retrouvée"
    video = bundle.videos[0]
    assert video.segments, "des segments horodatés doivent être proposés"
    assert video.segments[0].frame_url
    assert video.sampling in {"uniform", "embedding-visuel"}


def test_recherche_mesures_numériques(indexed):
    engine, _, _ = indexed
    bundle = engine.retrieve("évolution de la température pendant l'expérience")
    assert bundle.measurements, "la série de mesures doit être retrouvée"
    measurement = bundle.measurements[0]
    assert measurement.unit == "K"
    assert len(measurement.points) >= 5
    assert measurement.points[0][1] == 300.0


def test_recherche_hybride_combine_les_modalites(indexed):
    engine, _, _ = indexed
    bundle = engine.retrieve(
        "Montre-moi les images et les vidéos de la propagation de la flamme, "
        "et l'évolution de la température pendant l'essai"
    )
    modalities = [
        name
        for name, hits in (
            ("documents", bundle.documents),
            ("images", bundle.images),
            ("videos", bundle.videos),
            ("measurements", bundle.measurements),
        )
        if hits
    ]
    assert len(modalities) >= 3, modalities
    assert "images" in modalities
    assert "measurements" in modalities


def test_question_hors_corpus_ne_fabrique_rien(indexed):
    engine, _, _ = indexed
    bundle = engine.retrieve("résultats des essais de résistance des matériaux composites")
    assert bundle.status in {"empty", "ok"}
    for hits in (bundle.documents, bundle.images, bundle.videos, bundle.measurements):
        assert all(hit.score > 0 for hit in hits)


# -------------------------------------------------------------- index vide
def test_index_vide_renvoie_empty(tmp_path: Path):
    empty_dir = tmp_path / "vide"
    empty_dir.mkdir()
    settings = RetrievalSettings(
        corpus_dirs=(str(empty_dir),),
        index_db=str(tmp_path / "empty.db"),
        frame_dir=str(tmp_path / "frames"),
    )
    embedder, notes = select_embedder(settings)
    store = IndexStore(settings)
    report = index_corpus(settings, embedder, store=store)
    engine = MultimodalEngine(settings, embedder, store=store, notes=notes)

    assert report.indexed == 0
    bundle = engine.retrieve("Montre-moi les images de la flamme")
    assert bundle.status == "empty"
    assert not bundle.images
    assert any("index" in note.lower() for note in bundle.notes)

    status = engine.status()
    assert status["available"] is False


def test_embedder_structurel_est_explicite(settings: RetrievalSettings):
    embedder, notes = select_embedder(settings)
    assert embedder.kind in {"structural", "semantic"}
    assert embedder.cross_modal == (embedder.kind == "semantic")
    assert notes, "le choix de l'embedder doit être expliqué"


def test_descripteur_image_est_deterministe(corpus: Path):
    embedder = StructuralEmbedder()
    path = str(corpus / "flamme spherique.png")
    first = embedder.embed_image(path)
    second = embedder.embed_image(path)
    assert first is not None
    assert first == second
    assert len(first) == embedder.dim


def test_descripteur_image_distingue_deux_images(tmp_path: Path):
    from PIL import Image

    embedder = StructuralEmbedder()
    blue = tmp_path / "bleu.png"
    red = tmp_path / "rouge.png"
    Image.new("RGB", (120, 120), (10, 20, 240)).save(blue)
    Image.new("RGB", (120, 120), (240, 20, 10)).save(red)

    from app.services.retrieval.embedders import cosine

    left = embedder.embed_image(blue)
    right = embedder.embed_image(red)
    assert left and right
    assert cosine(left, right) < 0.95, "deux images de couleurs opposées doivent différer"


def test_csv_sans_valeurs_numeriques_ne_cree_pas_de_mesure(tmp_path: Path):
    from app.services.retrieval.extract import extract_measurements

    path = tmp_path / "vide.csv"
    path.write_text("nom,commentaire\nalpha,rien\nbeta,rien\n", encoding="utf-8")
    assert extract_measurements(path, "res1") == []


def test_csv_detecte_unites_dans_les_entetes(tmp_path: Path):
    from app.services.retrieval.extract import extract_measurements

    path = tmp_path / "mesures.csv"
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["temps [s]", "temperature (K)"])
        writer.writerow([0, 300])
        writer.writerow([1, 310])
    measurements = extract_measurements(path, "res1")
    assert len(measurements) == 1
    assert measurements[0].unit == "K"
    assert measurements[0].points == [[0.0, 300.0], [1.0, 310.0]]


def test_url_media_encode_le_chemin():
    from app.services.retrieval.engine import _media_url

    url = _media_url("D:\\corpus\\flamme sphérique.png")
    assert url.startswith("/api/v1/retrieval/files?path=")
    assert " " not in url
    assert "\\" not in url.split("path=")[1]