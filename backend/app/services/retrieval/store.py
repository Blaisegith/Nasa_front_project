"""Index persistant du moteur multimodal.

Une seule base SQLite, dans `var/retrieval/index.db` : pas de seconde base à
tenir cohérente avec celle de l'application. Elle stocke les ressources, leurs
fragments de texte, les frames extraites, les vecteurs (BLOB float32) et les
empreintes de contenu.

L'empreinte (`sha256`) est la clé de l'incrémental : un fichier identique n'est
ni relu ni réencodé, une ressource modifiée est réindexée seule, et ses frames
orphelines sont supprimées.
"""

from __future__ import annotations

import json
import math
import sqlite3
import struct
import time
from pathlib import Path
from typing import Any, Iterable, Sequence

from app.services.retrieval.config import RetrievalSettings
from app.services.retrieval.models import Measurement, Resource

_SCHEMA = """
CREATE TABLE IF NOT EXISTS mr_resource (
    id           TEXT PRIMARY KEY,
    kind         TEXT NOT NULL,
    path         TEXT NOT NULL,
    title        TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    source       TEXT NOT NULL DEFAULT '',
    experiment   TEXT NOT NULL DEFAULT '',
    mime         TEXT NOT NULL DEFAULT '',
    size_bytes   INTEGER NOT NULL DEFAULT 0,
    sha256       TEXT NOT NULL DEFAULT '',
    meta         TEXT NOT NULL DEFAULT '{}',
    indexed_at   REAL NOT NULL DEFAULT 0,
    vector_dim   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS mr_resource_kind ON mr_resource(kind);
CREATE INDEX IF NOT EXISTS mr_resource_sha ON mr_resource(sha256);

CREATE TABLE IF NOT EXISTS mr_chunk (
    id          TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL REFERENCES mr_resource(id) ON DELETE CASCADE,
    seq         INTEGER NOT NULL DEFAULT 0,
    text        TEXT NOT NULL,
    vector      BLOB,
    tokens      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS mr_chunk_resource ON mr_chunk(resource_id);

CREATE TABLE IF NOT EXISTS mr_frame (
    id          TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL REFERENCES mr_resource(id) ON DELETE CASCADE,
    path        TEXT NOT NULL,
    timestamp_s REAL NOT NULL DEFAULT 0,
    seq         INTEGER NOT NULL DEFAULT 0,
    vector      BLOB
);
CREATE INDEX IF NOT EXISTS mr_frame_resource ON mr_frame(resource_id);

CREATE TABLE IF NOT EXISTS mr_measurement (
    id          TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL REFERENCES mr_resource(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT '',
    unit        TEXT NOT NULL DEFAULT '',
    points      TEXT NOT NULL DEFAULT '[]',
    meta        TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS mr_measurement_resource ON mr_measurement(resource_id);

CREATE TABLE IF NOT EXISTS mr_file (
    path      TEXT PRIMARY KEY,
    sha256    TEXT NOT NULL,
    kind      TEXT NOT NULL DEFAULT '',
    indexed_at REAL NOT NULL DEFAULT 0
);
"""


def encode_vector(vector: Sequence[float]) -> bytes:
    return struct.pack(f"<{len(vector)}f", *[float(value) for value in vector])


def decode_vector(blob: bytes | None) -> list[float]:
    if not blob:
        return []
    count = len(blob) // 4
    return list(struct.unpack(f"<{count}f", blob[: count * 4]))


def file_sha256(path: Path, chunk_size: int = 1 << 20) -> str:
    import hashlib

    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(chunk_size), b""):
            digest.update(block)
    return digest.hexdigest()


def content_sha256(content: bytes) -> str:
    import hashlib

    return hashlib.sha256(content).hexdigest()


def _decode_row(row: sqlite3.Row) -> dict[str, Any]:
    """Ligne SQLite → dictionnaire, avec `meta` décodé en objet."""
    data: dict[str, Any] = dict(row)
    raw = data.get("meta")
    if isinstance(raw, str):
        try:
            data["meta"] = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            data["meta"] = {}
    elif not isinstance(raw, dict):
        data["meta"] = {}
    return data


class IndexStore:
    """Accès à l'index. Connexion courte : le moteur est appelé par requête."""

    def __init__(self, settings: RetrievalSettings) -> None:
        self.settings = settings
        self.path = settings.index_path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    def _ensure_schema(self) -> None:
        with self._connect() as connection:
            connection.executescript(_SCHEMA)

    # ------------------------------------------------------------------ écriture
    def clear(self) -> None:
        with self._connect() as connection:
            for table in ("mr_chunk", "mr_frame", "mr_measurement", "mr_resource", "mr_file"):
                connection.execute(f"DELETE FROM {table}")

    def upsert_resource(self, resource: Resource, *, vector_dim: int) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO mr_resource (id, kind, path, title, description, source, experiment,
                                         mime, size_bytes, sha256, meta, indexed_at, vector_dim)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                    kind=excluded.kind, path=excluded.path, title=excluded.title,
                    description=excluded.description, source=excluded.source,
                    experiment=excluded.experiment, mime=excluded.mime,
                    size_bytes=excluded.size_bytes, sha256=excluded.sha256,
                    meta=excluded.meta, indexed_at=excluded.indexed_at,
                    vector_dim=excluded.vector_dim
                """,
                (
                    resource.id, resource.kind, resource.path, resource.title,
                    resource.description, resource.source, resource.experiment,
                    resource.mime, resource.size_bytes, resource.sha256,
                    json.dumps(resource.meta, ensure_ascii=False),
                    time.time(), vector_dim,
                ),
            )

    def replace_children(
        self,
        resource_id: str,
        *,
        chunks: Iterable[tuple[str, int, str, list[float] | None]],
        frames: Iterable[tuple[str, str, float, int, list[float] | None]],
        measurements: Iterable[Measurement],
    ) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM mr_chunk WHERE resource_id = ?", (resource_id,))
            connection.execute("DELETE FROM mr_frame WHERE resource_id = ?", (resource_id,))
            connection.execute("DELETE FROM mr_measurement WHERE resource_id = ?", (resource_id,))
            for chunk_id, seq, text, vector in chunks:
                connection.execute(
                    "INSERT INTO mr_chunk (id, resource_id, seq, text, vector, tokens) VALUES (?,?,?,?,?,?)",
                    (chunk_id, resource_id, seq, text, encode_vector(vector) if vector else None, len(text.split())),
                )
            for frame_id, frame_path, timestamp, seq, vector in frames:
                connection.execute(
                    "INSERT INTO mr_frame (id, resource_id, path, timestamp_s, seq, vector) VALUES (?,?,?,?,?,?)",
                    (frame_id, resource_id, frame_path, timestamp, seq, encode_vector(vector) if vector else None),
                )
            for measurement in measurements:
                connection.execute(
                    "INSERT INTO mr_measurement (id, resource_id, name, unit, points, meta) VALUES (?,?,?,?,?,?)",
                    (
                        measurement.id, measurement.resource_id, measurement.name,
                        measurement.unit, json.dumps(measurement.points),
                        json.dumps(measurement.meta, ensure_ascii=False),
                    ),
                )

    def record_file(self, path: str, sha256: str, kind: str) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO mr_file (path, sha256, kind, indexed_at) VALUES (?,?,?,?)
                ON CONFLICT(path) DO UPDATE SET
                    sha256=excluded.sha256, kind=excluded.kind, indexed_at=excluded.indexed_at
                """,
                (path, sha256, kind, time.time()),
            )

    def forget_file(self, path: str) -> None:
        with self._connect() as connection:
            row = connection.execute("SELECT id FROM mr_resource WHERE path = ?", (path,)).fetchone()
            if row:
                connection.execute("DELETE FROM mr_resource WHERE id = ?", (row["id"],))
            connection.execute("DELETE FROM mr_file WHERE path = ?", (path,))

    # ------------------------------------------------------------------ lecture
    def indexed_file(self, path: str) -> str | None:
        with self._connect() as connection:
            row = connection.execute("SELECT sha256 FROM mr_file WHERE path = ?", (path,)).fetchone()
        return row["sha256"] if row else None

    def resource(self, resource_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM mr_resource WHERE id = ?", (resource_id,)).fetchone()
        return _decode_row(row) if row else None

    def resources(self, kind: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM mr_resource"
        params: tuple[Any, ...] = ()
        if kind:
            query += " WHERE kind = ?"
            params = (kind,)
        with self._connect() as connection:
            rows = connection.execute(query + " ORDER BY indexed_at DESC", params).fetchall()
        return [_decode_row(row) for row in rows]

    def resource_by_path(self, path: str) -> dict[str, Any] | None:
        """Ressource déclarée pour ce chemin (utilisé pour autoriser la lecture)."""
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM mr_resource WHERE path = ? LIMIT 1", (path,)
            ).fetchone()
        return _decode_row(row) if row else None

    def frame_by_path(self, path: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM mr_frame WHERE path = ? LIMIT 1", (path,)
            ).fetchone()
        return _decode_row(row) if row else None

    @staticmethod
    def _ids(resource_ids: Sequence[str] | str | None) -> tuple[str, ...]:
        """Normalise un identifiant isolé en séquence.

        Sans cela, `chunks("abc")` serait interprété comme trois identifiants
        d'un caractère et renverrait un résultat vide — un piège silencieux.
        """
        if resource_ids is None:
            return ()
        if isinstance(resource_ids, str):
            return (resource_ids,)
        return tuple(resource_ids)

    def chunks(self, resource_ids: Sequence[str] | str | None = None) -> list[dict[str, Any]]:
        ids = self._ids(resource_ids)
        with self._connect() as connection:
            if ids:
                placeholders = ",".join("?" for _ in ids)
                rows = connection.execute(
                    f"SELECT * FROM mr_chunk WHERE resource_id IN ({placeholders})",
                    ids,
                ).fetchall()
            else:
                rows = connection.execute("SELECT * FROM mr_chunk").fetchall()
        return [dict(row) for row in rows]

    def frames(self, resource_ids: Sequence[str] | str | None = None) -> list[dict[str, Any]]:
        ids = self._ids(resource_ids)
        with self._connect() as connection:
            if ids:
                placeholders = ",".join("?" for _ in ids)
                rows = connection.execute(
                    f"SELECT * FROM mr_frame WHERE resource_id IN ({placeholders})",
                    ids,
                ).fetchall()
            else:
                rows = connection.execute("SELECT * FROM mr_frame").fetchall()
        return [dict(row) for row in rows]

    def measurements(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute("SELECT * FROM mr_measurement").fetchall()
        return [dict(row) for row in rows]

    def stats(self) -> dict[str, Any]:
        with self._connect() as connection:
            counts = {
                row["kind"]: row["count"]
                for row in connection.execute(
                    "SELECT kind, COUNT(*) AS count FROM mr_resource GROUP BY kind"
                ).fetchall()
            }
            chunks = connection.execute("SELECT COUNT(*) AS count FROM mr_chunk").fetchone()["count"]
            frames = connection.execute("SELECT COUNT(*) AS count FROM mr_frame").fetchone()["count"]
            measurements = connection.execute(
                "SELECT COUNT(*) AS count FROM mr_measurement"
            ).fetchone()["count"]
            last = connection.execute("SELECT MAX(indexed_at) AS value FROM mr_resource").fetchone()["value"]
            files = connection.execute("SELECT COUNT(*) AS count FROM mr_file").fetchone()["count"]
        return {
            "resources": counts,
            "documents": counts.get("document", 0),
            "images": counts.get("image", 0),
            "videos": counts.get("video", 0),
            "datasets": counts.get("dataset", 0),
            "chunks": chunks,
            "frames": frames,
            "measurements": measurements,
            "files": files,
            "last_indexed_at": last or 0.0,
        }

    def vector_dim(self) -> int:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT vector_dim FROM mr_resource WHERE vector_dim > 0 LIMIT 1"
            ).fetchone()
        return int(row["vector_dim"]) if row else 0


def cosine(left: Sequence[float], right: Sequence[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0
    return dot / (left_norm * right_norm)