"""Indexation incrémentale du corpus.

Le parcours :

1. lister les fichiers reconnus sous les dossiers de corpus ;
2. comparer l'empreinte SHA-256 à celle déjà enregistrée ;
3. n'extraire et n'encoder que les fichiers nouveaux ou modifiés ;
4. remplacer les enfants (chunks, frames, mesures) de la seule ressource
   concernée, et supprimer les frames orphelines ;
5. oublier les fichiers disparus du corpus.

Un fichier volumineux n'est jamais copié : seules les frames extraites sont
écrites, dans `var/retrieval/frames`.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path

from app.services.retrieval import extract
from app.services.retrieval.config import RetrievalSettings
from app.services.retrieval.embedders import Embedder
from app.services.retrieval.models import Measurement, Resource
from app.services.retrieval.store import IndexStore, content_sha256, file_sha256

_TEXT_MIME = {
    ".txt": "text/plain", ".md": "text/markdown", ".markdown": "text/markdown",
    ".rst": "text/x-rst", ".json": "application/json", ".jsonl": "application/x-ndjson",
    ".csv": "text/csv", ".tsv": "text/tab-separated-values", ".xml": "application/xml",
    ".html": "text/html", ".pdf": "application/pdf",
}
_IMAGE_MIME = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".bmp": "image/bmp", ".tif": "image/tiff", ".tiff": "image/tiff",
}
_VIDEO_MIME = {
    ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/x-m4v",
    ".webm": "video/webm", ".avi": "video/x-msvideo", ".mkv": "video/x-matroska",
}


def mime_for(path: Path) -> str:
    suffix = path.suffix.lower()
    for table in (_TEXT_MIME, _IMAGE_MIME, _VIDEO_MIME):
        if suffix in table:
            return table[suffix]
    return "application/octet-stream"


def resource_id_for(path: Path, root: Path | None = None) -> str:
    """Identifiant stable : chemin relatif au corpus, haché si nécessaire."""
    try:
        relative = path.relative_to(root) if root else Path(path.name)
    except ValueError:
        relative = Path(path.name)
    text = relative.as_posix()
    return content_sha256(text.encode("utf-8"))[:16]


@dataclass(slots=True)
class ScanReport:
    scanned: int = 0
    indexed: int = 0
    unchanged: int = 0
    removed: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)
    indexed_ids: list[str] = field(default_factory=list)
    duration_s: float = 0.0

    def to_dict(self) -> dict[str, object]:
        return {
            "scanned": self.scanned,
            "indexed": self.indexed,
            "unchanged": self.unchanged,
            "removed": self.removed,
            "skipped": self.skipped,
            "errors": self.errors[:20],
            "indexed_ids": self.indexed_ids[:50],
            "duration_s": self.duration_s,
        }


def _title_from_path(path: Path) -> str:
    stem = path.stem.replace("_", " ").replace("-", " ").strip()
    return stem or path.name


# Métadonnées d'un média, écrites par l'ingestion (voir `ingest_nasa.py`).
SIDECAR_SUFFIX = ".nasa.json"


def sidecar_for(path: Path) -> Path | None:
    """Fichier de métadonnées réellement présent à côté d'un média."""
    if path.suffix.lower() in {".json"}:
        return None
    candidate = path.with_name(path.stem + SIDECAR_SUFFIX)
    return candidate if candidate.is_file() else None


def read_sidecar(path: Path) -> dict:
    """Métadonnées réelles d'un média, ou `{}` si aucune n'est fournie.

    Rien n'est inventé : en l'absence de fichier, le média garde son nom de
    fichier pour titre et une description vide.
    """
    candidate = sidecar_for(path)
    if candidate is None:
        return {}
    try:
        import json

        payload = json.loads(candidate.read_text(encoding="utf-8", errors="replace"))
    except (OSError, ValueError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _media_text(resource: Resource, path: Path) -> str:
    """Texte cherchable d'un média : titre, nom de fichier, description, mots-clés."""
    parts = [resource.title, path.name, resource.description]
    keywords = resource.meta.get("keywords") or []
    if isinstance(keywords, list):
        parts.extend(str(keyword) for keyword in keywords if keyword)
    centre = resource.meta.get("center")
    if centre:
        parts.append(str(centre))
    return " ".join(part for part in parts if part).strip()


def _is_media_sidecar(path: Path) -> bool:
    """`nasa-X.nasa.json` est le compagnon de `nasa-X.jpg` : pas un document."""
    name = path.name.lower()
    if not name.endswith(SIDECAR_SUFFIX):
        return False
    stem = path.name[: -len(SIDECAR_SUFFIX)]
    for suffix in _IMAGE_MIME:
        if path.with_name(stem + suffix).is_file():
            return True
    for suffix in _VIDEO_MIME:
        if path.with_name(stem + suffix).is_file():
            return True
    return False


class Indexer:
    """Construit et entretient l'index."""

    def __init__(
        self,
        settings: RetrievalSettings,
        embedder: Embedder,
        store: IndexStore | None = None,
    ) -> None:
        self.settings = settings
        self.embedder = embedder
        self.store = store or IndexStore(settings)

    # ------------------------------------------------------------------ parcours
    def iter_files(self) -> list[tuple[Path, Path]]:
        """Fichiers exploitables, avec leur dossier racine."""
        found: list[tuple[Path, Path]] = []
        seen: set[str] = set()

        for root in self.settings.resolved_corpus_dirs():
            if not root.is_dir():
                continue
            for path in sorted(root.rglob("*")):
                if not path.is_file():
                    continue
                if path.stat().st_size > self.settings.max_file_bytes:
                    continue
                if path.stat().st_size == 0:
                    continue
                if extract.kind_for(path) is None:
                    continue
                # Métadonnées d'un média : leur contenu est rattaché au média
                # (titre, description), pas indexé comme un document distinct.
                if _is_media_sidecar(path):
                    continue
                key = str(path.resolve())
                if key in seen:
                    continue
                seen.add(key)
                found.append((path, root))
                if len(found) >= self.settings.scan_limit:
                    return found
        return found

    def scan(self, *, force: bool = False) -> ScanReport:
        """Indexation incrémentale. Ne recalcule jamais ce qui est déjà indexé."""
        report = ScanReport()
        present: set[str] = set()

        for path, root in self.iter_files():
            key = str(path.resolve())
            present.add(key)
            report.scanned += 1
            try:
                digest = file_sha256(path)
                if not force and self.store.indexed_file(key) == digest:
                    report.unchanged += 1
                    continue
                resource_id = self._index_file(path, root, digest)
                if resource_id:
                    report.indexed += 1
                    report.indexed_ids.append(resource_id)
            except Exception as error:  # pragma: no cover - robustesse
                report.errors.append(f"{path.name}: {error}")
                report.skipped += 1

        report.removed = self._forget_missing(present)
        return report

    def _forget_missing(self, present: set[str]) -> int:
        known = {row["path"]: row["sha256"] for row in self._all_files()}
        removed = 0
        for path in known:
            if path not in present:
                try:
                    self.store.forget_file(path)
                    removed += 1
                except Exception:  # pragma: no cover - robustesse
                    continue
        return removed

    def _all_files(self) -> list[dict]:
        import sqlite3

        connection = sqlite3.connect(self.store.path, timeout=10.0)
        connection.row_factory = sqlite3.Row
        try:
            rows = connection.execute("SELECT path, sha256 FROM mr_file").fetchall()
        finally:
            connection.close()
        return [dict(row) for row in rows]

    # ------------------------------------------------------------------ par type
    def _apply_sidecar(self, path: Path, resource: Resource) -> Resource:
        """Applique les métadonnées réelles du fichier compagnon, s'il existe."""
        metadata = read_sidecar(path)
        if not metadata:
            return resource

        title = str(metadata.get("title") or "").strip()
        description = str(metadata.get("description") or "").strip()
        if title:
            resource.title = title
        if description:
            resource.description = description

        for key in ("nasa_id", "center", "date_created", "photographer", "media_type"):
            value = metadata.get(key)
            if value:
                resource.meta[key] = value
        keywords = metadata.get("keywords")
        if isinstance(keywords, list) and keywords:
            resource.meta["keywords"] = [str(word) for word in keywords[:12]]
        return resource

    def _index_file(self, path: Path, root: Path, digest: str) -> str | None:
        kind = extract.kind_for(path)
        if kind is None:
            return None

        resource_id = resource_id_for(path, root)
        resource = Resource(
            id=resource_id,
            kind=kind,  # type: ignore[arg-type]
            path=str(path.resolve()),
            title=_title_from_path(path),
            description="",
            source=str(root),
            mime=mime_for(path),
            size_bytes=path.stat().st_size,
            sha256=digest,
            meta=extract.describe(path),
        )
        if kind in {"image", "video"}:
            resource = self._apply_sidecar(path, resource)

        chunks: list[tuple[str, int, str, list[float] | None]] = []
        frames: list[tuple[str, str, float, int, list[float] | None]] = []
        measurements: list[Measurement] = []

        if kind in {"document", "dataset"}:
            chunks = [
                (chunk.id, chunk.seq, chunk.text, self.embedder.embed_text(chunk.text) or None)
                for chunk in extract.extract_document(path, self.settings, resource_id)
            ]
            if kind == "dataset":
                measurements = extract.extract_measurements(path, resource_id)
                resource.description = _describe_measurements(measurements)

        elif kind == "image":
            vector = self.embedder.embed_image(path)
            facts = extract.extract_image_facts(path)
            if facts:
                resource.meta = {
                    **resource.meta,
                    "width": facts.width,
                    "height": facts.height,
                    "mode": facts.mode,
                }
            # Un média est aussi un fragment de texte : ses métadonnées réelles.
            # Le texte combine le titre, le nom du fichier et la description
            # issue du fichier compagnon, sinon une image ne serait cherchable
            # que par son identifiant.
            text = _media_text(resource, path)
            chunks = [
                (
                    f"{resource_id}:c0",
                    0,
                    text,
                    self.embedder.embed_text(text) or None,
                )
            ]

        elif kind == "video":
            frames = self._index_video(path, resource, resource_id)
            text = _media_text(resource, path)
            chunks = [
                (
                    f"{resource_id}:c0",
                    0,
                    text,
                    self.embedder.embed_text(text) or None,
                )
            ]

        vector_dim = self.embedder.dim if self.embedder.available else 0
        self.store.upsert_resource(resource, vector_dim=vector_dim)
        self.store.replace_children(
            resource_id,
            chunks=chunks,
            frames=frames,
            measurements=measurements,
        )
        self.store.record_file(str(path.resolve()), digest, kind)
        return resource_id

    def _index_video(
        self,
        path: Path,
        resource: Resource,
        resource_id: str,
    ) -> list[tuple[str, str, float, int, list[float] | None]]:
        facts = extract.probe_video(path)
        transcript = extract.extract_transcript(path)

        if facts:
            resource.meta = {
                **resource.meta,
                "duration_s": facts.duration_s,
                "width": facts.width,
                "height": facts.height,
                "fps": round(facts.fps, 3),
                "has_audio": facts.has_audio,
            }

        extracted = extract.extract_frames(path, self.settings, resource_id)
        rows: list[tuple[str, str, float, int, list[float] | None]] = []
        for frame in extracted:
            vector = self.embedder.embed_image(frame.path) if self.embedder.available else None
            rows.append((frame.id, frame.path, frame.timestamp_s, frame.seq, vector))

        # La transcription est indexée comme un document de la vidéo : c'est la
        # seule information textuelle réelle dont on dispose.
        if transcript:
            resource.description = transcript[:400]
        return rows


def _describe_measurements(measurements: list[Measurement]) -> str:
    if not measurements:
        return ""
    parts = [
        f"{measurement.name}" + (f" [{measurement.unit}]" if measurement.unit else "")
        + f" ({len(measurement.points)} points)"
        for measurement in measurements
    ]
    return "Mesures : " + ", ".join(parts)


def index_corpus(
    settings: RetrievalSettings,
    embedder: Embedder,
    *,
    force: bool = False,
    store: IndexStore | None = None,
) -> ScanReport:
    """Point d'entrée utilisé par l'API et les tests."""
    indexer = Indexer(settings, embedder, store=store)
    started = time.perf_counter()
    report = indexer.scan(force=force)
    report.duration_s = round(time.perf_counter() - started, 3)  # type: ignore[attr-defined]
    return report