"""Extraction des ressources du corpus.

Chaque fonction rend des objets du contrat (`Chunk`, `Frame`, `Measurement`) ou
`None` si la ressource n'est pas exploitable. Aucune valeur n'est devinée : une
durée absente reste absente, une unité inconnue reste vide.

Dépendances :

* `pillow` — images ;
* `ffmpeg` / `ffprobe` (binaires) — métadonnées et frames vidéo ;
* `pypdf` — texte des PDF (optionnel : sans lui, seules les métadonnées du PDF
  sont indexées, ce qui est signalé).
"""

from __future__ import annotations

import csv
import io
import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from app.services.retrieval.config import RetrievalSettings
from app.services.retrieval.models import Chunk, Frame, Measurement

TEXT_SUFFIXES = {".txt", ".md", ".markdown", ".rst", ".json", ".jsonl", ".csv", ".tsv", ".xml", ".html"}
DOCUMENT_SUFFIXES = {".pdf"}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"}
MEASUREMENT_SUFFIXES = {".csv", ".tsv", ".json", ".jsonl"}

_UNIT_ALIASES = {
    "s": "s", "sec": "s", "seconde": "s", "seconds": "s",
    "mm": "mm", "cm": "cm", "m": "m",
    "k": "K", "c": "°C", "celsius": "°C",
    "pa": "Pa", "kpa": "kPa",
    "w": "W", "kw": "kW",
    "v": "V", "a": "A",
}


def kind_for(path: Path) -> str | None:
    suffix = path.suffix.lower()
    if suffix in IMAGE_SUFFIXES:
        return "image"
    if suffix in VIDEO_SUFFIXES:
        return "video"
    if suffix in DOCUMENT_SUFFIXES:
        return "document"
    if suffix in MEASUREMENT_SUFFIXES:
        # Un JSON de métadonnées (titre, description, identifiant) n'est pas un
        # tableau de mesures : sans série numérique, il reste un document, donc
        # cherchable comme texte au lieu de disparaître de l'index.
        if suffix in {".json", ".jsonl"} and not _measurements_from_json(path, ""):
            return "document"
        return "dataset"
    if suffix in TEXT_SUFFIXES:
        return "document"
    return None


def _run(command: list[str], timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, capture_output=True, text=True, timeout=timeout, encoding="utf-8", errors="replace")


def have_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def have_ffprobe() -> bool:
    return shutil.which("ffprobe") is not None


def read_text(path: Path, limit: int = 8_000_000) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")[:limit]
    except OSError:
        return ""


def chunk_text(text: str, size: int, overlap: int) -> list[str]:
    """Découpe un texte en fragments, chevauchement inclus.

    Le découpage se fait sur des frontières de phrases quand c'est possible : un
    fragment coupé au milieu d'un mot est inutilisable pour la recherche.
    """
    cleaned = re.sub(r"[ \t]+", " ", text).strip()
    if not cleaned:
        return []
    if len(cleaned) <= size:
        return [cleaned]

    chunks: list[str] = []
    start = 0
    length = len(cleaned)
    while start < length:
        end = min(start + size, length)
        if end < length:
            boundary = max(
                cleaned.rfind(". ", start, end),
                cleaned.rfind("? ", start, end),
                cleaned.rfind("! ", start, end),
                cleaned.rfind("\n", start, end),
            )
            if boundary > start + size // 2:
                end = boundary + 1
        fragment = cleaned[start:end].strip()
        if fragment:
            chunks.append(fragment)
        if end >= length:
            break
        start = max(end - overlap, start + 1)
    return chunks


def extract_document(path: Path, settings: RetrievalSettings, resource_id: str) -> list[Chunk]:
    """Texte d'un document : texte brut, ou texte PDF si `pypdf` est présent."""
    if path.suffix.lower() == ".pdf":
        text = _pdf_text(path)
    else:
        text = read_text(path)

    if not text.strip():
        return []

    return [
        Chunk(id=f"{resource_id}:c{index}", resource_id=resource_id, text=fragment, seq=index)
        for index, fragment in enumerate(
            chunk_text(text, settings.max_chunk_chars, settings.chunk_overlap)
        )
    ]


def _pdf_text(path: Path) -> str:
    try:
        from pypdf import PdfReader  # type: ignore
    except ImportError:
        return ""

    try:
        reader = PdfReader(str(path))
    except Exception:  # pragma: no cover - PDF illisible
        return ""

    pages: list[str] = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or "")
        except Exception:  # pragma: no cover - page illisible
            continue
    return "\n".join(pages)


@dataclass(slots=True)
class ImageFacts:
    width: int = 0
    height: int = 0
    mode: str = ""


def extract_image_facts(path: Path) -> ImageFacts | None:
    try:
        from PIL import Image
    except ImportError:  # pragma: no cover - dépendance déclarée
        return None
    try:
        with Image.open(path) as image:
            return ImageFacts(width=image.width, height=image.height, mode=image.mode)
    except (OSError, ValueError):
        return None


@dataclass(slots=True)
class VideoFacts:
    duration_s: float
    width: int
    height: int
    fps: float
    has_audio: bool


def probe_video(path: Path) -> VideoFacts | None:
    """Métadonnées réelles via `ffprobe`, ou `None` si absent/illisible."""
    if not have_ffprobe():
        return None
    try:
        result = _run([
            "ffprobe", "-v", "error", "-print_format", "json",
            "-show_format", "-show_streams", str(path),
        ])
        if result.returncode != 0:
            return None
        payload = json.loads(result.stdout or "{}")
    except (subprocess.SubprocessError, json.JSONDecodeError):
        return None

    streams = payload.get("streams", [])
    video = next((item for item in streams if item.get("codec_type") == "video"), None)
    if video is None:
        return None

    duration = payload.get("format", {}).get("duration") or video.get("duration")
    try:
        duration_s = float(duration)
    except (TypeError, ValueError):
        duration_s = 0.0

    fps = 0.0
    rate = video.get("avg_frame_rate") or video.get("r_frame_rate") or "0/1"
    try:
        numerator, _, denominator = str(rate).partition("/")
        fps = float(numerator) / float(denominator or 1)
    except (TypeError, ValueError, ZeroDivisionError):
        fps = 0.0

    return VideoFacts(
        duration_s=duration_s,
        width=int(video.get("width") or 0),
        height=int(video.get("height") or 0),
        fps=fps,
        has_audio=any(item.get("codec_type") == "audio" for item in streams),
    )


def extract_frames(
    path: Path,
    settings: RetrievalSettings,
    resource_id: str,
    *,
    timestamps: list[float] | None = None,
) -> list[Frame]:
    """Frames représentatives d'une vidéo, horodatées.

    Les timestamps sont ceux fournis par l'appelant (métadonnées) ou, à défaut,
    un échantillonnage uniforme de la durée réelle. Chaque frame est écrite dans
    `frame_dir` et rattachée à sa vidéo : jamais de copie du fichier source.
    """
    if not have_ffmpeg():
        return []

    facts = probe_video(path)
    if facts is None or facts.duration_s <= 0:
        return []

    if not timestamps:
        count = max(1, min(settings.max_frames_per_video, 12))
        step = facts.duration_s / (count + 1)
        timestamps = [round(step * (index + 1), 2) for index in range(count)]

    frames: list[Frame] = []
    out_dir = settings.frame_path / resource_id
    out_dir.mkdir(parents=True, exist_ok=True)

    for index, timestamp in enumerate(timestamps[: settings.max_frames_per_video]):
        target = out_dir / f"{resource_id}-{index:03d}.jpg"
        result = _run([
            "ffmpeg", "-nostdin", "-loglevel", "error", "-y",
            "-ss", f"{max(timestamp, 0):.3f}", "-i", str(path),
            "-frames:v", "1",
            "-vf", f"scale={settings.frame_width}:-2",
            "-q:v", str(max(2, min(31, 31 - settings.frame_quality // 5))),
            str(target),
        ])
        if result.returncode != 0 or not target.is_file() or target.stat().st_size == 0:
            continue
        frames.append(
            Frame(
                id=f"{resource_id}:f{index}",
                resource_id=resource_id,
                path=str(target),
                timestamp_s=float(timestamp),
                seq=index,
            )
        )

    return frames


def extract_transcript(path: Path) -> str:
    """Sous-titres ou transcription présents à côté de la vidéo.

    On ne cherche que des fichiers réels : `.vtt`, `.srt`, `.txt` de même nom.
    Aucune transcription n'est produite par reconnaissance vocale.
    """
    for suffix in (".vtt", ".srt"):
        candidate = path.with_suffix(suffix)
        if candidate.is_file():
            raw = read_text(candidate)
            cleaned = re.sub(r"<[^>]+>", " ", raw)
            cleaned = re.sub(r"\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}", " ", cleaned)
            cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
            return cleaned
    return ""


def _normalise_unit(raw: str) -> str:
    unit = (raw or "").strip()
    if not unit:
        return ""
    return _UNIT_ALIASES.get(unit.lower(), unit)


def _numeric(value: object) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", ".")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def extract_measurements(path: Path, resource_id: str) -> list[Measurement]:
    """Séries numériques d'un CSV/TSV/JSON de mesures.

    Un fichier sans colonne ni tableau numérique ne produit rien : on ne crée pas
    une série vide « pour exister ».
    """
    suffix = path.suffix.lower()
    if suffix in {".csv", ".tsv"}:
        return _measurements_from_table(path, resource_id, delimiter="\t" if suffix == ".tsv" else ",")
    if suffix in {".json", ".jsonl"}:
        return _measurements_from_json(path, resource_id)
    return []


def _measurements_from_table(path: Path, resource_id: str, delimiter: str) -> list[Measurement]:
    try:
        with path.open("r", encoding="utf-8", errors="replace", newline="") as handle:
            sample = handle.read(4096)
            handle.seek(0)
            if not sample.strip():
                return []
            reader = csv.reader(handle, delimiter=delimiter)
            rows = [row for row in reader if any(cell.strip() for cell in row)]
    except OSError:
        return []

    if len(rows) < 2:
        return []

    header = [cell.strip() for cell in rows[0]]
    x_index = 0
    unit = ""

    # Unité éventuelle dans l'en-tête : `time [s]`, `temperature (K)`.
    def split_unit(label: str) -> tuple[str, str]:
        match = re.match(r"^(.*?)\s*[\[(]\s*([^)\]]+?)\s*[\])]\s*$", label)
        if match:
            return match.group(1).strip(), _normalise_unit(match.group(2))
        return label.strip(), ""

    measurements: list[Measurement] = []
    for index, label in enumerate(header):
        if index == 0:
            continue
        name, cell_unit = split_unit(label)
        if not name:
            continue
        points: list[list[float]] = []
        for row in rows[1:]:
            x_value = _numeric(row[x_index]) if x_index < len(row) else None
            y_value = _numeric(row[index]) if index < len(row) else None
            if x_value is None or y_value is None:
                continue
            points.append([x_value, y_value])
        if not points:
            continue
        unit = cell_unit or unit
        measurements.append(
            Measurement(
                id=f"{resource_id}:m{index}",
                resource_id=resource_id,
                name=name,
                unit=cell_unit,
                points=points,
                meta={"header": label, "columns": len(header)},
            )
        )
    return measurements


def _measurements_from_json(path: Path, resource_id: str) -> list[Measurement]:
    payload = _read_json(path)
    if payload is None:
        return []

    measurements: list[Measurement] = []

    def add(name: str, unit: str, series: object, meta: dict | None = None) -> None:
        if not isinstance(series, list) or len(series) < 2:
            return
        if all(isinstance(item, (int, float)) for item in series):
            points = [[float(index), float(value)] for index, value in enumerate(series)]
        else:
            points = []
            for item in series:
                if isinstance(item, dict):
                    x_value = _numeric(item.get("t", item.get("time", item.get("x"))))
                    y_value = _numeric(item.get("v", item.get("value", item.get("y"))))
                elif isinstance(item, list) and len(item) >= 2:
                    x_value, y_value = _numeric(item[0]), _numeric(item[1])
                else:
                    x_value = y_value = None
                if x_value is not None and y_value is not None:
                    points.append([x_value, y_value])
        if not points:
            return
        measurements.append(
            Measurement(
                id=f"{resource_id}:m{len(measurements)}",
                resource_id=resource_id,
                name=name,
                unit=_normalise_unit(unit),
                points=points,
                meta=meta or {},
            )
        )

    if isinstance(payload, dict):
        for key, value in payload.items():
            if isinstance(value, dict) and isinstance(value.get("values"), list):
                add(key, str(value.get("unit") or ""), value["values"], {"source_key": key})
            else:
                add(key, "", value, {"source_key": key})
    elif isinstance(payload, list):
        add("series", "", payload)

    return measurements


def _read_json(path: Path) -> object | None:
    try:
        if path.suffix.lower() == ".jsonl":
            lines = [line for line in read_text(path).splitlines() if line.strip()]
            values = []
            for line in lines:
                try:
                    values.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
            return values or None
        return json.loads(read_text(path))
    except json.JSONDecodeError:
        return None


def describe(path: Path) -> dict[str, object]:
    """Métadonnées de base d'un fichier, sans rien interpréter."""
    stat = path.stat()
    return {
        "size_bytes": stat.st_size,
        "suffix": path.suffix.lower(),
        "name": path.name,
        "parent": path.parent.name,
    }


def read_json_bytes(content: bytes) -> object | None:
    try:
        return json.loads(content.decode("utf-8", errors="replace"))
    except json.JSONDecodeError:
        return None


def decode_text(content: bytes) -> str:
    return content.decode("utf-8", errors="replace")


def measurement_from_bytes(content: bytes, name: str, resource_id: str) -> list[Measurement]:
    """Séries numériques depuis un contenu déjà chargé (ingestion distante)."""
    payload = read_json_bytes(content)
    if isinstance(payload, list):
        values = [item for item in payload if isinstance(item, (int, float))]
        if len(values) >= 2:
            return [Measurement(
                id=f"{resource_id}:m0",
                resource_id=resource_id,
                name=name,
                points=[[float(index), float(value)] for index, value in enumerate(values)],
            )]
    return []


def csv_from_text(text: str, delimiter: str = ",") -> list[list[str]]:
    return [row for row in csv.reader(io.StringIO(text), delimiter=delimiter) if any(cell.strip() for cell in row)]