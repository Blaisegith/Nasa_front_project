"""Configuration du moteur de recherche multimodale.

Toutes les valeurs sont surchargeables par variables d'environnement (préfixe
`MULTIMODAL_`). Les chemins par défaut restent dans `var/`, à côté des pièces
jointes et des avatars : aucune base supplémentaire, aucun répertoire à créer
ailleurs.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

_DEFAULT_EMBEDDER = "auto"


def _env(name: str, default: str) -> str:
    value = os.environ.get(f"MULTIMODAL_{name}")
    return default if value is None or value == "" else value


def _env_int(name: str, default: int) -> int:
    raw = _env(name, str(default))
    try:
        return int(raw)
    except ValueError:
        return default


def _split_dirs(raw: str) -> tuple[str, ...]:
    """Sépare une liste de dossiers (`;` sur Windows, `:` ailleurs)."""
    separator = ";" if os.name == "nt" else ":"
    normalised = raw.replace(";", separator)
    parts = [part.strip() for part in normalised.split(separator)]
    return tuple(part for part in parts if part)


@dataclass(frozen=True, slots=True)
class RetrievalSettings:
    """Réglages du moteur, figés après lecture."""

    # Corpus : un ou plusieurs dossiers racines, parcourus récursivement.
    corpus_dirs: tuple[str, ...] = field(default_factory=tuple)
    frame_dir: str = "./var/retrieval/frames"
    index_db: str = "./var/retrieval/index.db"
    model_dir: str = "./var/models"

    # Embedder : `auto` choisit le meilleur disponible (sémantique si présent,
    # structurel sinon), `structural` ou `onnx` l'imposent.
    embedder: str = _DEFAULT_EMBEDDER
    embedder_name: str = ""

    # Extraction vidéo.
    max_frames_per_video: int = 12
    frame_width: int = 480
    frame_quality: int = 82
    min_segment_seconds: float = 1.5

    # Bornes de sécurité.
    max_file_bytes: int = 512 * 1024 * 1024
    scan_limit: int = 5000
    max_chunk_chars: int = 1200
    chunk_overlap: int = 120

    # Recherche.
    default_limit: int = 8
    max_results_per_modality: int = 12
    min_score: float = 0.05

    # Origine distante (NASA Images API) — optionnelle.
    nasa_api: str = "https://images-api.nasa.gov"
    nasa_enabled: bool = False

    @property
    def frame_path(self) -> Path:
        return Path(self.frame_dir)

    @property
    def index_path(self) -> Path:
        return Path(self.index_db)

    @property
    def model_path(self) -> Path:
        return Path(self.model_dir)

    def resolved_corpus_dirs(self) -> tuple[Path, ...]:
        return tuple(Path(part) for part in self.corpus_dirs)


@lru_cache
def get_retrieval_settings() -> RetrievalSettings:
    corpus = _env("CORPUS_DIRS", "./var/corpus")
    return RetrievalSettings(
        corpus_dirs=_split_dirs(corpus),
        frame_dir=_env("FRAME_DIR", "./var/retrieval/frames"),
        index_db=_env("INDEX_DB", "./var/retrieval/index.db"),
        model_dir=_env("MODEL_DIR", "./var/models"),
        embedder=_env("EMBEDDER", _DEFAULT_EMBEDDER).lower(),
        embedder_name=_env("EMBEDDER_NAME", ""),
        max_frames_per_video=_env_int("MAX_FRAMES_PER_VIDEO", 12),
        frame_width=_env_int("FRAME_WIDTH", 480),
        frame_quality=_env_int("FRAME_QUALITY", 82),
        max_file_bytes=_env_int("MAX_FILE_BYTES", 512 * 1024 * 1024),
        scan_limit=_env_int("SCAN_LIMIT", 5000),
        max_chunk_chars=_env_int("MAX_CHUNK_CHARS", 1200),
        chunk_overlap=_env_int("CHUNK_OVERLAP", 120),
        default_limit=_env_int("DEFAULT_LIMIT", 8),
        nasa_enabled=_env("NASA_ENABLED", "0") in {"1", "true", "yes", "on"},
        nasa_api=_env("NASA_API", "https://images-api.nasa.gov"),
    )