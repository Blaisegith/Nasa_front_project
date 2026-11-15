"""Schémas Pydantic — conversations, messages et réponses IA.

Ce module définit aussi le format de réponse versionné (blocs de contenu)
consommé à l'identique par l'Accueil et par le Chat.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

AnswerStatus = Literal["completed", "partial", "unavailable", "failed"]
MessageRole = Literal["user", "assistant", "system"]


# --------------------------------------------------------------------------- #
# Réponses IA — format versionné
# --------------------------------------------------------------------------- #
class Reference(BaseModel):
    """Référence documentaire. Aucune référence ne doit être fabriquée."""

    label: str
    source: str | None = None
    document_id: str | None = None
    page: int | None = None
    url: str | None = None
    doi: str | None = None


class MediaItem(BaseModel):
    media_id: str
    media_type: Literal["image", "video"]
    title: str
    description: str | None = None
    source: str | None = None
    experiment: str | None = None
    thumbnail_url: str | None = None
    file_url: str | None = None
    source_url: str | None = None
    license: str | None = None
    duration: float | None = None
    timestamp: float | None = None
    caption: str | None = None
    # Segments horodatés d'une vidéo : chaque entrée porte `start_s`, `end_s` et
    # l'image de la séquence. Vide pour une image.
    segments: list[dict[str, Any]] = Field(default_factory=list)


class ChartSeries(BaseModel):
    name: str
    points: list[tuple[float, float]]


ChartKind = Literal["line", "area", "bar"]


class Chart(BaseModel):
    """Graphique adossé à des données réelles uniquement."""

    chart_id: str
    title: str
    x_axis: str
    y_axis: str
    x_unit: str | None = None
    y_unit: str | None = None
    kind: ChartKind = "line"
    description: str | None = None
    series: list[ChartSeries] = Field(default_factory=list)
    source: str | None = None
    interpretation: str | None = None
    limitations: list[str] = Field(default_factory=list)


class DataBlock(BaseModel):
    kind: Literal[
        "text",
        "summary",
        "scientific",
        "simple",
        "argument",
        "reference",
        "image",
        "video",
        "chart",
        "table",
        "limitation",
        "notice",
    ]
    text: str | None = None
    items: list[Any] = Field(default_factory=list)


class Answer(BaseModel):
    schema_version: str = "1.0"
    summary: str | None = None
    scientific_explanation: str | None = None
    simple_explanation: str | None = None
    arguments: list[str] = Field(default_factory=list)
    references: list[Reference] = Field(default_factory=list)
    media: list[MediaItem] = Field(default_factory=list)
    charts: list[Chart] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    blocks: list[DataBlock] = Field(default_factory=list)


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    role: str
    status: str
    content: dict
    sequence: int
    created_at: datetime


class ConversationSummary(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    preview: str | None = None


class ConversationOut(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[MessageOut] = Field(default_factory=list)


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)

    @field_validator("title", mode="before")
    @classmethod
    def _clean(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class AttachmentRef(BaseModel):
    """Référence à une pièce jointe déjà téléversée (`POST /chat/attachments`).

    Le contenu binaire n'est jamais renvoyé ici : seul l'identifiant et ses
    métadonnées circulent, ce qui suffit au RAG et au multimodal.
    """

    attachment_id: str = Field(min_length=32, max_length=32)
    filename: str | None = Field(default=None, max_length=160)
    media_type: Literal["document", "image", "video"] | None = None
    size_bytes: int | None = Field(default=None, ge=0)
    url: str | None = None


class AttachmentOut(BaseModel):
    """Réponse de `POST /chat/attachments`."""

    attachment_id: str
    filename: str
    content_type: str
    media_type: Literal["document", "image", "video"]
    size_bytes: int
    url: str


class ChatRequest(BaseModel):
    conversation_id: str | None = None
    text: str = Field(min_length=1, max_length=4000)
    attachments: list[AttachmentRef] = Field(default_factory=list)

    @field_validator("text", mode="before")
    @classmethod
    def _clean(cls, value: str) -> str:
        return value.strip()

    @field_validator("attachments", mode="before")
    @classmethod
    def _clean_attachments(cls, value: list | None) -> list:
        if not value:
            return []
        cleaned: list = []
        seen: set[str] = set()
        for item in value:
            attachment_id = item.get("attachment_id") if isinstance(item, dict) else getattr(item, "attachment_id", None)
            if not attachment_id or attachment_id in seen:
                continue
            seen.add(attachment_id)
            cleaned.append(item)
        return cleaned

    @field_validator("attachments")
    @classmethod
    def _check_count(cls, value: list[AttachmentRef]) -> list[AttachmentRef]:
        from app.core.config import get_settings

        limit = get_settings().attachment_max_per_message
        if len(value) > limit:
            raise ValueError(f"Au plus {limit} pièces jointes par question.")
        return value


class ChatAccepted(BaseModel):
    """Accusé de prise en compte d'une question, avant génération."""

    conversation_id: str
    message_id: str
    status: AnswerStatus
    answer: Answer | None = None