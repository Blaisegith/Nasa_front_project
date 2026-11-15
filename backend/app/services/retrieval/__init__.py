"""MULTIMODAL RETRIEVAL ENGINE.

Recherche scientifique multimodale : documents, images, vidéos (avec images
extraites et timestamps), mesures numériques.

Le paquet est autonome dans son organisation interne mais reste un module du
backend : il ne connaît ni FastAPI ni le frontend, et se branche par
`app.services.adapters.registry`.

Principe directeur : aucune donnée fabriquée. Un index vide produit un état
`empty`, pas des résultats d'illustration.
"""

from app.services.retrieval.config import RetrievalSettings, get_retrieval_settings
from app.services.retrieval.embedders import Embedder, select_embedder
from app.services.retrieval.engine import MultimodalEngine, detect_intent, tokenize
from app.services.retrieval.indexer import Indexer, ScanReport, index_corpus
from app.services.retrieval.models import (
    Chunk,
    DocumentHit,
    Frame,
    ImageHit,
    Intent,
    Measurement,
    MeasurementHit,
    Resource,
    RetrievalBundle,
    VideoHit,
    VideoSegment,
)
from app.services.retrieval.service import (
    build_engine,
    get_engine,
    get_indexer,
    reset,
    scan,
)
from app.services.retrieval.store import IndexStore

__all__ = [
    "Chunk",
    "DocumentHit",
    "Embedder",
    "Frame",
    "ImageHit",
    "IndexStore",
    "Indexer",
    "Intent",
    "Measurement",
    "MeasurementHit",
    "MultimodalEngine",
    "Resource",
    "RetrievalBundle",
    "RetrievalSettings",
    "ScanReport",
    "VideoHit",
    "VideoSegment",
    "build_engine",
    "detect_intent",
    "get_engine",
    "get_indexer",
    "get_retrieval_settings",
    "index_corpus",
    "reset",
    "scan",
    "select_embedder",
    "tokenize",
]