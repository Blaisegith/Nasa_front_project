"""Moteur de recherche multimodale.

Responsabilités :

* déduire l'intention de la question (déterministe, documentée) ;
* interroger l'index pour chaque modalité pertinente ;
* fusionner les classements (RRF) et produire un `RetrievalBundle`.

Le moteur ne fabrique rien. Si l'index est vide, il renvoie `empty` avec la
raison ; si une modalité n'est pas exploitable avec l'embedder courant, il le dit
dans `notes` et `provenance`.

Le RAG textuel existant n'est pas remplacé : `RagAdapter` reste la référence pour
la recherche documentaire, et ce moteur expose les modalités que le RAG ne
couvre pas (images, vidéos, mesures). La fusion des deux se fait au niveau de
l'orchestrateur (`pipeline.py`), pas ici.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Iterable, Sequence

from app.services.retrieval.config import RetrievalSettings
from app.services.retrieval.embedders import Embedder, cosine
from app.services.retrieval.models import (
    DocumentHit,
    ImageHit,
    Intent,
    MeasurementHit,
    Modality,
    RetrievalBundle,
    RetrievalStatus,
    VideoHit,
    VideoSegment,
)
from app.services.retrieval.store import IndexStore, decode_vector

# -----------------------------------------------------------------commentaires
# Règles d'intention : mots-clés explicites, dans les deux langues de
# l'interface. Elles produisent des poids de recrutement, jamais une exclusion
# sèche : une question ambiguë active plusieurs modalités.
_INTENT_RULES: tuple[tuple[str, tuple[str, ...], dict[str, float]], ...] = (
    (
        "show_videos",
        (
            "vidéo", "videos", "video", "videos", "séquence", "sequence", "clip",
            "enregistrement", "footage", "film", "观看",
        ),
        {"video": 1.0, "text": 0.35},
    ),
    (
        "show_images",
        (
            "image", "images", "photo", "photos", "illustration", "visuel",
            "montre", "montre-moi", "galerie", "gallery", "picture",
        ),
        {"image": 1.0, "text": 0.35},
    ),
    (
        "temporal",
        (
            "évolution", "evolution", "au cours", "pendant", "timeline", "temporel",
            "température", "temperature", "courbe", "curve", "profil", "profile",
            "varie", "change over time", "en fonction du temps",
        ),
        {"measurement": 1.0, "text": 0.6},
    ),
    (
        "compare",
        ("compar", "comparaison", "difference", "différence", "versus", "vs", "tableau", "table"),
        {"measurement": 0.8, "text": 0.7},
    ),
    (
        "explain",
        (
            "pourquoi", "comment", "explique", "expliquer", "pourquoi", "why", "how",
            "mécanisme", "mechanism", "définition", "definition", "analyse", "theory",
            "théorie", "theorie",
        ),
        {"text": 1.0},
    ),
)

_STOPWORDS = {
    "le", "la", "les", "de", "des", "du", "un", "une", "et", "en", "à", "au", "aux",
    "sur", "dans", "pour", "par", "que", "qui", "est", "sont", "the", "of", "and",
    "in", "on", "to", "for", "with", "a", "an", "is", "are", "what", "how", "why",
    "montre", "moi", "montrer", "donne", "trouve", "cherche", "recherche",
}

_TOKEN_RE = re.compile(r"[0-9a-zà-ÿ]{3,}", re.IGNORECASE)

# Noms de phénomènes visuels : ils justifient un appui iconographique même dans
# une question d'explication, sans jamais prendre le pas sur les documents.
_VISUAL_NOUNS = (
    "flamme", "flammes", "combustion", "propagation", "sphérique", "spherique",
    "mélange", "melange", "extinction", "gouttelette", "plume", "fumée", "fumee",
    "flamme", "jet", "injection", "allumage",
)


def _strip_accents(text: str) -> str:
    """Repli NFD sans accents : `température` doit matcher `temperature`."""
    import unicodedata

    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(char for char in decomposed if unicodedata.category(char) != "Mn")


def tokenize(text: str) -> list[str]:
    """Tokens de recherche : mots de 3 caractères et plus, sans accents ni mots vides."""
    return [
        token
        for token in _TOKEN_RE.findall(_strip_accents(text))
        if token not in _STOPWORDS
    ]


def detect_intent(question: str) -> Intent:
    """Déduit l'intention et les poids par modalité.

    Déterministe : mêmes mots, même résultat. Les règles sont cumulatives, puis
    le profil `explain` est ajouté si aucune modalité visuelle n'est demandée.
    """
    lowered = question.lower()
    weights: dict[str, float] = {}
    matched: list[str] = []
    notes: list[str] = []

    for kind, keywords, modality_weights in _INTENT_RULES:
        if any(keyword in lowered for keyword in keywords):
            matched.append(kind)
            for modality, weight in modality_weights.items():
                weights[modality] = max(weights.get(modality, 0.0), weight)

    if not weights:
        weights = {"text": 1.0}
        matched.append("explain")
        notes.append("Aucune modalité explicite : réponse documentaire privilégiée.")

    if "text" not in weights:
        weights["text"] = 0.35
        notes.append("Documents ajoutés en appui des visuels.")

    # Appui iconographique : un phénomène nommé visuellement justifie de
    # chercher une image, même si la question est formulée comme une
    # explication. Le poids reste faible : les documents gardent la main.
    if "image" not in weights and any(noun in lowered for noun in _VISUAL_NOUNS):
        weights["image"] = 0.3
        notes.append("Appui iconographique ajouté : la question nomme un phénomène visuel.")

    ordered = [name for name, _ in sorted(weights.items(), key=lambda item: -item[1])]
    kind = "complex" if len([name for name, weight in weights.items() if weight >= 0.8]) > 1 else (matched[0] if matched else "explain")

    modalities: list[Modality] = [
        name for name in ("text", "image", "video", "measurement") if name in weights
    ]  # type: ignore[assignment]

    return Intent(kind=kind, modalities=modalities, weights=weights, notes=notes)


# ------------------------------------------------------------------- lexical
@dataclass(slots=True)
class LexicalIndex:
    """Index inversé en mémoire, construit depuis les chunks stockés.

    Pour un corpus de cette taille, un index inversé simple est plus rapide et
    plus transparent qu'une base vectorielle : il est reconstruit à chaque
    requête à partir des `tokens` déjà stockés, sans recalcul d'embedding.
    """

    postings: dict[str, dict[str, int]]
    lengths: dict[str, int]
    total: int

    @classmethod
    def build(cls, rows: Iterable[dict]) -> "LexicalIndex":
        postings: dict[str, dict[str, int]] = {}
        lengths: dict[str, int] = {}
        total = 0
        for row in rows:
            text = row.get("text") or ""
            tokens = tokenize(text)
            if not tokens:
                continue
            identifier = str(row["id"])
            lengths[identifier] = len(tokens)
            total += 1
            for token in set(tokens):
                postings.setdefault(token, {})
                postings[token][identifier] = postings[token].get(identifier, 0) + tokens.count(token)
        return cls(postings=postings, lengths=lengths, total=max(total, 1))

    def score(self, identifier: str, terms: Sequence[str]) -> float:
        """BM25 simplifié (k1 = 1.2, b = 0.75)."""
        if not terms:
            return 0.0
        length = self.lengths.get(identifier, 0)
        if not length:
            return 0.0
        avg_length = (sum(self.lengths.values()) / len(self.lengths)) if self.lengths else 1.0
        score = 0.0
        for term in terms:
            bucket = self.postings.get(term)
            if not bucket or identifier not in bucket:
                continue
            frequency = bucket[identifier]
            doc_frequency = len(bucket)
            idf = math.log(1.0 + (self.total - doc_frequency + 0.5) / (doc_frequency + 0.5))
            denominator = frequency + 1.2 * (1.0 - 0.75 + 0.75 * length / (avg_length or 1.0))
            score += idf * (frequency * 2.2) / denominator
        return score


# -------------------------------------------------------------------- moteur
class MultimodalEngine:
    """Recherche multimodale sur l'index local."""

    def __init__(
        self,
        settings: RetrievalSettings,
        embedder: Embedder,
        store: IndexStore | None = None,
        *,
        notes: Sequence[str] = (),
    ) -> None:
        self.settings = settings
        self.embedder = embedder
        self.store = store or IndexStore(settings)
        self.notes = list(notes)

    # ----------------------------------------------------------------- API
    def status(self) -> dict:
        stats = self.store.stats()
        return {
            "available": stats["files"] > 0,
            "stats": stats,
            "embedder": {
                "name": self.embedder.name,
                "kind": self.embedder.kind,
                "dim": self.embedder.dim,
                "cross_modal": self.embedder.cross_modal,
            },
            "corpus_dirs": [str(path) for path in self.settings.resolved_corpus_dirs()],
            "notes": list(self.notes),
        }

    def retrieve(self, question: str, *, limit: int | None = None) -> RetrievalBundle:
        limit = limit or self.settings.default_limit
        intent = detect_intent(question)
        terms = tokenize(question)

        stats = self.store.stats()
        if stats["files"] == 0:
            return RetrievalBundle(
                question=question,
                intent=intent,
                status="empty",
                notes=[
                    *self.notes,
                    "Aucune ressource indexée : lancez une indexation du corpus avant de chercher.",
                ],
                provenance=self._provenance(),
            )

        documents = self._search_documents(terms, intent, limit)
        images = self._search_images(terms, intent, question, limit)
        videos = self._search_videos(terms, intent, limit)
        measurements = self._search_measurements(terms, intent, limit)

        if not any((documents, images, videos, measurements)):
            status: RetrievalStatus = "empty"
            notes = ["Aucun résultat pour cette question dans le corpus indexé."]
        else:
            status = "ok"
            notes = []

        return RetrievalBundle(
            question=question,
            intent=intent,
            status=status,
            notes=[*self.notes, *intent.notes, *notes],
            documents=documents,
            images=images,
            videos=videos,
            measurements=measurements,
            provenance=self._provenance(),
        )

    def _provenance(self) -> dict:
        stats = self.store.stats()
        return {
            "indexed_at": stats["last_indexed_at"],
            "embedder": self.embedder.name,
            "embedder_kind": self.embedder.kind,
            "cross_modal": self.embedder.cross_modal,
            "corpus_files": stats["files"],
            "resources": stats["resources"],
        }

    # ------------------------------------------------------------ documents
    def _search_documents(self, terms: Sequence[str], intent: Intent, limit: int) -> list[DocumentHit]:
        weight = intent.weights.get("text", 0.0)
        if weight <= 0.0 or not terms:
            return []

        rows = self.store.chunks()
        if not rows:
            return []

        index = LexicalIndex.build(rows)
        by_id = {str(row["id"]): row for row in rows}
        scored: list[tuple[float, str]] = []
        for identifier in by_id:
            score = index.score(identifier, terms)
            if score > 0:
                scored.append((score, identifier))
        scored.sort(reverse=True)
        if not scored:
            return []

        top = scored[: min(limit, self.settings.max_results_per_modality)]
        best_score = top[0][0] or 1.0
        resources = {row["id"]: row for row in self.store.resources()}
        hits: list[DocumentHit] = []
        for score, identifier in top:
            row = by_id[identifier]
            resource = resources.get(row["resource_id"], {})
            hits.append(
                DocumentHit(
                    resource_id=row["resource_id"],
                    title=resource.get("title") or resource.get("path", ""),
                    score=(score / best_score) * weight,
                    excerpt=row["text"][:320],
                    source=resource.get("source", ""),
                    locator=resource.get("path", ""),
                    chunk_id=identifier,
                )
            )
        return hits

    # --------------------------------------------------------------- images
    def _search_images(
        self,
        terms: Sequence[str],
        intent: Intent,
        question: str,
        limit: int,
    ) -> list[ImageHit]:
        weight = intent.weights.get("image", 0.0)
        if weight <= 0.0:
            return []

        resources = [row for row in self.store.resources("image")]
        if not resources:
            return []

        if self.embedder.cross_modal and terms:
            hits = self._search_images_semantic(terms, weight, limit)
            if hits:
                return hits

        # Repli documenté : appariement lexical sur les métadonnées réelles.
        return self._search_images_metadata(terms, question, weight, limit, resources)

    def _search_images_semantic(self, terms: Sequence[str], weight: float, limit: int) -> list[ImageHit]:
        query_vector = self.embedder.embed_text(" ".join(terms))
        if not query_vector:
            return []
        frames = [
            row
            for row in self.store.frames()
            if decode_vector(row["vector"])
        ]
        resources = {row["id"]: row for row in self.store.resources("image")}
        scored: list[tuple[float, dict]] = []
        for row in frames:
            score = cosine(query_vector, decode_vector(row["vector"]))
            if score > self.settings.min_score:
                scored.append((score, row))
        scored.sort(key=lambda item: -item[0])
        hits: list[ImageHit] = []
        seen: set[str] = set()
        for score, row in scored:
            resource_id = row["resource_id"]
            if resource_id in seen:
                continue
            seen.add(resource_id)
            resource = resources.get(resource_id, {})
            hits.append(
                ImageHit(
                    resource_id=resource_id,
                    title=resource.get("title", ""),
                    score=score * weight,
                    url=_media_url(resource.get("path", "")),
                    caption=resource.get("description", ""),
                    source=resource.get("source", ""),
                    matched_by="embedding-visuel",
                )
            )
            if len(hits) >= limit:
                break
        return hits

    def _search_images_metadata(
        self,
        terms: Sequence[str],
        question: str,
        weight: float,
        limit: int,
        resources: Sequence[dict],
    ) -> list[ImageHit]:
        index = LexicalIndex.build(
            [
                {
                    "id": row["id"],
                    "text": f"{row.get('title', '')} {row.get('description', '')} {row.get('path', '')}",
                }
                for row in resources
            ]
        )
        by_id = {row["id"]: row for row in resources}
        scored: list[tuple[float, str]] = []
        for identifier in by_id:
            score = index.score(identifier, terms)
            if score > 0:
                scored.append((score, identifier))
        scored.sort(reverse=True)
        top = scored[: min(limit, self.settings.max_results_per_modality)]
        if not top:
            return []
        best = top[0][0] or 1.0
        hits: list[ImageHit] = []
        for score, identifier in top:
            row = by_id[identifier]
            hits.append(
                ImageHit(
                    resource_id=identifier,
                    title=row.get("title", ""),
                    score=(score / best) * weight * 0.6,
                    url=_media_url(row.get("path", "")),
                    caption=row.get("description", ""),
                    source=row.get("source", ""),
                    experiment=row.get("experiment", ""),
                    matched_by="metadata-lexical",
                )
            )
        return hits

    # --------------------------------------------------------------- vidéos
    def _search_videos(self, terms: Sequence[str], intent: Intent, limit: int) -> list[VideoHit]:
        weight = intent.weights.get("video", 0.0)
        if weight <= 0.0:
            return []

        resources = [row for row in self.store.resources("video")]
        if not resources:
            return []

        index = LexicalIndex.build(
            [
                {
                    "id": row["id"],
                    "text": (
                        f"{row.get('title', '')} {row.get('description', '')} "
                        f"{row.get('experiment', '')} {row.get('path', '')}"
                    ),
                }
                for row in resources
            ]
        )
        by_id = {row["id"]: row for row in resources}
        scored: list[tuple[float, str]] = []
        for identifier in by_id:
            score = index.score(identifier, terms)
            if score > 0:
                scored.append((score, identifier))
        scored.sort(reverse=True)
        top = scored[: min(limit, self.settings.max_results_per_modality)]
        if not top:
            return []

        best = top[0][0] or 1.0
        frames_by_resource: dict[str, list[dict]] = {}
        for frame in self.store.frames():
            frames_by_resource.setdefault(frame["resource_id"], []).append(frame)

        hits: list[VideoHit] = []
        for score, identifier in top:
            row = by_id[identifier]
            segments = self._segments_for(row, frames_by_resource.get(identifier, []), score / best)
            hits.append(
                VideoHit(
                    resource_id=identifier,
                    title=row.get("title", ""),
                    score=(score / best) * weight,
                    url=_media_url(row.get("path", "")),
                    duration_s=float(row.get("meta", {}).get("duration_s", 0.0) or 0.0)
                    if isinstance(row.get("meta"), dict)
                    else 0.0,
                    thumb_url=_media_url(segments[0].frame_url) if segments and segments[0].frame_url else "",
                    description=row.get("description", ""),
                    source=row.get("source", ""),
                    experiment=row.get("experiment", ""),
                    segments=segments,
                    matched_by="metadata-lexical",
                    sampling="uniform" if self.embedder.kind == "structural" else "embedding-visuel",
                )
            )
        return hits

    def _segments_for(self, resource: dict, frames: Sequence[dict], video_score: float) -> list[VideoSegment]:
        """Segments proposés pour une vidéo.

        Sans classifieur de phénomènes, on ne prétend pas détecter un
        changement de comportement : les segments sont les frames
        représentatives, avec leur timestamp réel, et c'est ce qui est déclaré.
        """
        if not frames:
            return []
        ordered = sorted(frames, key=lambda frame: frame["seq"])
        step = max(
            float(resource.get("meta", {}).get("duration_s", 0.0) or 0.0) / max(len(ordered), 1),
            self.settings.min_segment_seconds,
        ) if isinstance(resource.get("meta"), dict) else self.settings.min_segment_seconds
        segments: list[VideoSegment] = []
        for frame in ordered[:6]:
            start = float(frame["timestamp_s"])
            segments.append(
                VideoSegment(
                    start_s=start,
                    end_s=round(start + step, 2),
                    score=video_score,
                    frame_url=_media_url(str(frame["path"])),
                    label="",
                )
            )
        return segments

    # ------------------------------------------------------------- mesures
    def _search_measurements(
        self,
        terms: Sequence[str],
        intent: Intent,
        limit: int,
    ) -> list[MeasurementHit]:
        weight = intent.weights.get("measurement", 0.0)
        if weight <= 0.0:
            return []

        rows = self.store.measurements()
        if not rows:
            return []

        resources = {row["id"]: row for row in self.store.resources()}
        index = LexicalIndex.build(
            [
                {
                    "id": row["id"],
                    "text": (
                        f"{row.get('name', '')} {row.get('unit', '')} "
                        f"{(resources.get(row.get('resource_id'), {}) or {}).get('title', '')}"
                    ),
                }
                for row in rows
            ]
        )
        scored: list[tuple[float, str]] = []
        for row in rows:
            score = index.score(str(row["id"]), terms)
            if score > 0:
                scored.append((score, str(row["id"])))
        scored.sort(reverse=True)
        top = scored[: min(limit, self.settings.max_results_per_modality)]
        if not top:
            return []
        best = top[0][0] or 1.0
        by_id = {str(row["id"]): row for row in rows}
        hits: list[MeasurementHit] = []
        for score, identifier in top:
            row = by_id[identifier]
            import json

            try:
                points = json.loads(row.get("points") or "[]")
            except json.JSONDecodeError:
                points = []
            resource = resources.get(row["resource_id"], {})
            hits.append(
                MeasurementHit(
                    resource_id=row["resource_id"],
                    title=row.get("name", ""),
                    score=(score / best) * weight,
                    unit=row.get("unit", ""),
                    points=[point for point in points if isinstance(point, list) and len(point) >= 2],
                    source=resource.get("path", ""),
                    variables=[row.get("name", "")],
                )
            )
        return hits


def _media_url(path: str) -> str:
    """URL publique d'une ressource de l'index.

    Les ressources du corpus sont servies par `GET /api/v1/retrieval/files/...`
    : le chemin absolu est converti en identifiant d'accès, jamais exposé tel
    quel.
    """
    if not path:
        return ""
    return f"/api/v1/retrieval/files?path={_quote(path)}"


def _quote(value: str) -> str:
    from urllib.parse import quote

    return quote(value, safe="")