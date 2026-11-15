"""Modèles de données du moteur de recherche multimodale.

Ces structures sont le **contrat** entre l'indexation, la recherche et la couche
HTTP. Aucune n'invente de contenu : un résultat absent est simplement absent, et
le statut global (`ok`, `empty`, `unavailable`) dit pourquoi.

Les objets sont volontairement plats et sérialisables (`to_dict`) : le frontend
reçoit exactement ce que le moteur a trouvé, sans transformation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

Kind = Literal["document", "image", "video", "dataset"]
Modality = Literal["text", "image", "video", "measurement"]

# Statut d'une recherche : `empty` signifie « index vide ou aucun résultat
# pertinent », `unavailable` signifie « composant non branché ». Les deux sont
# distincts : le premier est un fait, le second une configuration.
RetrievalStatus = Literal["ok", "empty", "unavailable"]


@dataclass(slots=True)
class Resource:
    """Ressource indexée (document, image, vidéo, jeu de mesures)."""

    id: str
    kind: Kind
    path: str
    title: str = ""
    description: str = ""
    source: str = ""
    experiment: str = ""
    mime: str = ""
    size_bytes: int = 0
    sha256: str = ""
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "path": self.path,
            "title": self.title,
            "description": self.description,
            "source": self.source,
            "experiment": self.experiment,
            "mime": self.mime,
            "size_bytes": self.size_bytes,
            "meta": self.meta,
        }


@dataclass(slots=True)
class Chunk:
    """Fragment de texte indexé, rattaché à sa ressource."""

    id: str
    resource_id: str
    text: str
    seq: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.id, "resource_id": self.resource_id, "text": self.text, "seq": self.seq}


@dataclass(slots=True)
class Frame:
    """Image extraite d'une vidéo, avec son timestamp.

    `timestamp_s` est la position réelle dans la vidéo : c'est ce qui permet de
    renvoyer vers la séquence, et non vers la vidéo entière.
    """

    id: str
    resource_id: str
    path: str
    timestamp_s: float
    seq: int
    sha256: str = ""
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "resource_id": self.resource_id,
            "path": self.path,
            "timestamp_s": self.timestamp_s,
            "seq": self.seq,
            "meta": self.meta,
        }


@dataclass(slots=True)
class Measurement:
    """Série numérique extraite d'un fichier de mesures (CSV, JSON)."""

    id: str
    resource_id: str
    name: str
    unit: str = ""
    points: list[list[float]] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)

    @property
    def variables(self) -> list[str]:
        return [self.name]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "resource_id": self.resource_id,
            "name": self.name,
            "unit": self.unit,
            "points": self.points,
            "meta": self.meta,
        }


@dataclass(slots=True)
class Intent:
    """Intention déduite de la question, avec les poids par modalité.

    Les poids sont des multiplicateurs de recrutement (0 = modalité écartée).
    Ils ne servent pas à noter les résultats : le classement reste fondé sur les
    similarités réelles.
    """

    kind: str
    modalities: list[Modality]
    weights: dict[str, float]
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "modalities": list(self.modalities),
            "weights": dict(self.weights),
            "notes": list(self.notes),
        }


@dataclass(slots=True)
class DocumentHit:
    resource_id: str
    title: str
    score: float
    excerpt: str
    source: str = ""
    locator: str = ""
    chunk_id: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.resource_id,
            "title": self.title,
            "score": round(self.score, 4),
            "excerpt": self.excerpt,
            "source": self.source,
            "locator": self.locator,
            "chunk_id": self.chunk_id,
        }


@dataclass(slots=True)
class ImageHit:
    resource_id: str
    title: str
    score: float
    url: str
    thumb_url: str = ""
    caption: str = ""
    source: str = ""
    experiment: str = ""
    matched_by: str = "metadata-lexical"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.resource_id,
            "title": self.title,
            "score": round(self.score, 4),
            "url": self.url,
            "thumb_url": self.thumb_url or self.url,
            "caption": self.caption,
            "source": self.source,
            "experiment": self.experiment,
            "matched_by": self.matched_by,
        }


@dataclass(slots=True)
class VideoSegment:
    start_s: float
    end_s: float
    score: float
    frame_url: str = ""
    label: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "start_s": round(self.start_s, 2),
            "end_s": round(self.end_s, 2),
            "score": round(self.score, 4),
            "frame_url": self.frame_url,
            "label": self.label,
        }


@dataclass(slots=True)
class VideoHit:
    resource_id: str
    title: str
    score: float
    url: str
    duration_s: float = 0.0
    thumb_url: str = ""
    description: str = ""
    source: str = ""
    experiment: str = ""
    segments: list[VideoSegment] = field(default_factory=list)
    matched_by: str = "metadata-lexical"
    sampling: str = "uniform"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.resource_id,
            "title": self.title,
            "score": round(self.score, 4),
            "url": self.url,
            "duration_s": round(self.duration_s, 2),
            "thumb_url": self.thumb_url,
            "description": self.description,
            "source": self.source,
            "experiment": self.experiment,
            "segments": [segment.to_dict() for segment in self.segments],
            "matched_by": self.matched_by,
            "sampling": self.sampling,
        }


@dataclass(slots=True)
class MeasurementHit:
    resource_id: str
    title: str
    score: float
    unit: str
    points: list[list[float]]
    source: str = ""
    variables: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.resource_id,
            "title": self.title,
            "score": round(self.score, 4),
            "unit": self.unit,
            "points": self.points,
            "source": self.source,
            "variables": list(self.variables),
        }


@dataclass(slots=True)
class RetrievalBundle:
    """Résultat complet d'une recherche multimodale."""

    question: str
    intent: Intent
    status: RetrievalStatus
    notes: list[str] = field(default_factory=list)
    documents: list[DocumentHit] = field(default_factory=list)
    images: list[ImageHit] = field(default_factory=list)
    videos: list[VideoHit] = field(default_factory=list)
    measurements: list[MeasurementHit] = field(default_factory=list)
    provenance: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "question": self.question,
            "intent": self.intent.to_dict(),
            "status": self.status,
            "notes": list(self.notes),
            "results": {
                "documents": [hit.to_dict() for hit in self.documents],
                "images": [hit.to_dict() for hit in self.images],
                "videos": [hit.to_dict() for hit in self.videos],
                "measurements": [hit.to_dict() for hit in self.measurements],
            },
            "provenance": dict(self.provenance),
        }