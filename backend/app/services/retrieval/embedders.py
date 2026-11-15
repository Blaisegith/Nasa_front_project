"""Embedders du moteur multimodal.

Deux familles, jamais confondues :

* **structurel** (`StructuralEmbedder`) — descripteur réel de l'image (histogramme
  chromatique, orientations de contours, luminance, format) et empreinte lexicale
  du texte. Chaque composante se calcule vraiment, mais l'espace image et l'espace
  texte sont **distincts** : l'embedder est déclaré `cross_modal = False`. Le
  moteur s'en sert pour décrire et dédoublonner, pas pour prétendre comprendre le
  contenu d'une image à partir d'une phrase.
* **sémantique** (`OnnxClipEmbedder`) — SigLIP/CLIP en ONNX, espace commun
  texte/image (`cross_modal = True`). Disponible uniquement si le modèle et son
  tokenizer sont présents : aucun téléchargement implicite, aucune substitution
  silencieuse.

`select_embedder` expose le choix et les raisons, pour que l'API et l'interface
puissent dire ce qui a réellement été utilisé.
"""

from __future__ import annotations

import hashlib
import math
from pathlib import Path
from typing import Literal, Protocol, runtime_checkable

from app.services.retrieval.config import RetrievalSettings

# Dimensions du descripteur structurel : 64 (couleur) + 128 (contours)
# + 16 (luminance) + 3 (format) = 211.
_COLOR_BINS = 4
_EDGE_BINS = 8
_EDGE_GRID = 4
_LUMA_GRID = 4
_STRUCT_DIM = (_COLOR_BINS**3) + (_EDGE_BINS * _EDGE_GRID * _EDGE_GRID) + (_LUMA_GRID**2) + 3

# Fenêtre de travail du descripteur : assez grande pour l'information de
# couleur, assez petite pour rester rapide.
_ANALYSIS_SIZE = 64


def l2_normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0.0:
        return vector
    return [value / norm for value in vector]


def cosine(left: list[float], right: list[float]) -> float:
    """Similarité cosinus entre deux vecteurs de même dimension."""
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = 0.0
    left_norm = 0.0
    right_norm = 0.0
    for a, b in zip(left, right, strict=True):
        dot += a * b
        left_norm += a * a
        right_norm += b * b
    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0
    return dot / (math.sqrt(left_norm) * math.sqrt(right_norm))


@runtime_checkable
class Embedder(Protocol):
    name: str
    kind: Literal["structural", "semantic"]
    dim: int
    available: bool
    cross_modal: bool

    def embed_text(self, text: str) -> list[float]: ...

    def embed_image(self, path: str | Path) -> list[float] | None: ...


class StructuralEmbedder:
    """Descripteur déterministe, sans dépendance réseau ni modèle téléchargé.

    * Image : histogramme chromatique 4×4×4, orientations de contours (8 bins sur
      une grille 4×4), luminance 4×4, et trois caractéristiques de format.
    * Texte : empreinte de trigrammes de caractères, normalisée. Espace lexical,
      **non comparable** à l'espace image.
    """

    name = "structural-v1"
    kind: Literal["structural", "semantic"] = "structural"
    dim = _STRUCT_DIM
    available = True
    cross_modal = False

    def embed_image(self, path: str | Path) -> list[float] | None:
        try:
            from PIL import Image  # import local : dépendance optionnelle
        except ImportError:  # pragma: no cover - dépendance déclarée
            return None

        try:
            with Image.open(path) as image:
                width_px, height_px = image.size
                rgb = image.convert("RGB").resize((_ANALYSIS_SIZE, _ANALYSIS_SIZE))
        except (OSError, ValueError):
            return None

        pixels = [rgb.getpixel((x, y)) for y in range(_ANALYSIS_SIZE) for x in range(_ANALYSIS_SIZE)]
        width = _ANALYSIS_SIZE

        # --- couleur : histogramme 4×4×4 ---
        color = [0.0] * (_COLOR_BINS**3)
        for red, green, blue in pixels:
            index = (
                (red * _COLOR_BINS // 256) * _COLOR_BINS * _COLOR_BINS
                + (green * _COLOR_BINS // 256) * _COLOR_BINS
                + (blue * _COLOR_BINS // 256)
            )
            color[index] += 1.0
        total_pixels = float(len(pixels)) or 1.0
        color = [value / total_pixels for value in color]

        # --- luminance : moyenne par cellule 4×4 ---
        luma = [0.0] * (_LUMA_GRID * _LUMA_GRID)
        counts = [0] * (_LUMA_GRID * _LUMA_GRID)
        cell = _ANALYSIS_SIZE // _LUMA_GRID
        for y in range(_ANALYSIS_SIZE):
            row = y * width
            grid_y = y // cell
            for x in range(_ANALYSIS_SIZE):
                red, green, blue = pixels[row + x]
                cell_index = grid_y * _LUMA_GRID + (x // cell)
                luma[cell_index] += 0.299 * red + 0.587 * green + 0.114 * blue
                counts[cell_index] += 1
        luma = [
            (luma[index] / counts[index] / 255.0) if counts[index] else 0.0
            for index in range(len(luma))
        ]

        # --- contours : orientations de Sobel simplifié, grille 4×4 ---
        edges = [0.0] * (_EDGE_BINS * _EDGE_GRID * _EDGE_GRID)
        for y in range(1, _ANALYSIS_SIZE - 1):
            grid_y = y * _EDGE_GRID // _ANALYSIS_SIZE
            row = y * width
            for x in range(1, _ANALYSIS_SIZE - 1):
                here = row + x
                left, right = here - 1, here + 1
                up, down = here - width, here + width
                gx = (
                    pixels[right][0] - pixels[left][0]
                    + pixels[right][1] - pixels[left][1]
                    + pixels[right][2] - pixels[left][2]
                )
                gy = (
                    pixels[down][0] - pixels[up][0]
                    + pixels[down][1] - pixels[up][1]
                    + pixels[down][2] - pixels[up][2]
                )
                magnitude = math.hypot(gx, gy)
                if magnitude <= 24.0:
                    continue
                # 0 = contour vertical, 4 = horizontal : 8 orientations.
                angle = math.atan2(gy, gx) % math.pi
                bin_index = int(angle / math.pi * _EDGE_BINS) % _EDGE_BINS
                grid_x = x * _EDGE_GRID // _ANALYSIS_SIZE
                edges[(grid_y * _EDGE_GRID + grid_x) * _EDGE_BINS + bin_index] += magnitude

        edges = l2_normalize(edges)

        # --- format ---
        ratio = (width_px / height_px) if height_px else 1.0
        shape = [
            math.log(ratio) if ratio > 0 else 0.0,
            min(1.0, (width_px * height_px) / (4000.0 * 3000.0)),
            1.0 if width_px >= height_px else 0.0,
        ]

        return l2_normalize(color + edges + luma + shape)

    def embed_text(self, text: str) -> list[float]:
        vector = [0.0] * self.dim
        normalised = "".join(char.lower() for char in text if char.isalnum())
        if not normalised:
            return vector
        padded = f"  {normalised}  "
        for index in range(len(padded) - 2):
            gram = padded[index : index + 3]
            digest = hashlib.blake2s(gram.encode("utf-8"), digest_size=4).digest()
            bucket = int.from_bytes(digest, "little") % self.dim
            sign = 1.0 if digest[-1] & 1 else -1.0
            vector[bucket] += sign
        return l2_normalize(vector)


class OnnxClipEmbedder:
    """SigLIP/CLIP en ONNX — espace commun texte/image.

    Disponible seulement si les trois conditions sont réunies :

    1. `onnxruntime` est installé ;
    2. un modèle `*.onnx` est présent dans `MULTIMODAL_MODEL_DIR` ;
    3. un `tokenizer.json` est présent dans le même dossier.

    Sans tokenizer, l'encodage du texte est impossible : l'embedder se déclare
    indisponible plutôt que de renvoyer des vecteurs fabriqués.
    """

    kind: Literal["structural", "semantic"] = "semantic"
    cross_modal = True
    available = False

    def __init__(self, settings: RetrievalSettings) -> None:
        self.settings = settings
        self.name = settings.embedder_name or "onnx-clip"
        self.dim = 0
        self._session = None
        self._tokenizer = None
        self._model_file: Path | None = None
        self._tokenizer_file: Path | None = None
        self._probe()

    def _probe(self) -> None:
        model_dir = self.settings.model_path
        if not model_dir.is_dir():
            return
        models = sorted(model_dir.glob("*.onnx"))
        tokenizers = sorted(model_dir.glob("tokenizer*.json"))
        if not models or not tokenizers:
            return
        try:
            import onnxruntime  # noqa: F401
        except ImportError:
            return
        self._model_file = models[0]
        self._tokenizer_file = tokenizers[0]
        self.available = True

    def _ensure_loaded(self) -> bool:
        if self._session is not None:
            return True
        if not self.available or self._model_file is None:
            return False
        try:
            import onnxruntime

            self._session = onnxruntime.InferenceSession(
                str(self._model_file), providers=["CPUExecutionProvider"]
            )
            output = self._session.get_outputs()[0]
            shape = output.shape
            self.dim = int(shape[-1]) if isinstance(shape[-1], int) else 0
            return self.dim > 0
        except Exception:  # pragma: no cover - dépend de l'environnement
            self.available = False
            return False

    def _load_tokenizer(self):
        if self._tokenizer is None and self._tokenizer_file is not None:
            try:
                from tokenizers import Tokenizer  # type: ignore

                self._tokenizer = Tokenizer.from_file(str(self._tokenizer_file))
            except ImportError:  # pragma: no cover - dépendance optionnelle
                self.available = False
        return self._tokenizer

    def _run(self, inputs: dict[str, object]) -> list[float] | None:
        if not self._ensure_loaded() or self._session is None:
            return None
        try:
            output = self._session.run(None, inputs)[0]
        except Exception:  # pragma: no cover - dépend du modèle
            return None
        vector = [float(value) for value in list(output[0])]
        return l2_normalize(vector) if vector else None

    def embed_text(self, text: str) -> list[float]:
        tokenizer = self._load_tokenizer()
        if tokenizer is None:
            return []
        encoding = tokenizer.encode(text)
        input_name = self._session.get_inputs()[0].name if self._session else "input_ids"
        return self._run({input_name: [encoding.ids]}) or []

    def embed_image(self, path: str | Path) -> list[float] | None:
        if not self._ensure_loaded():
            return None
        try:
            from PIL import Image

            import numpy as np

            with Image.open(path) as image:
                resized = image.convert("RGB").resize((224, 224))
            array = np.asarray(resized, dtype="float32") / 255.0
            array = (array - 0.5) / 0.5
            batch = np.transpose(array, (2, 0, 1))[None, ...]
            input_name = self._session.get_inputs()[0].name if self._session else "pixel_values"
            return self._run({input_name: batch})
        except ImportError:  # pragma: no cover - numpy non installé
            return None
        except (OSError, ValueError):
            return None


def select_embedder(settings: RetrievalSettings) -> tuple[Embedder, list[str]]:
    """Choisit l'embedder et explique le choix (remonte dans les métadonnées)."""
    notes: list[str] = []
    structural = StructuralEmbedder()

    if settings.embedder == "structural":
        notes.append("Embedder structurel imposé par la configuration.")
        return structural, notes

    if settings.embedder == "onnx":
        onnx = OnnxClipEmbedder(settings)
        if onnx.available:
            notes.append(f"Embedder sémantique ONNX chargé : {onnx.name}.")
            return onnx, notes
        notes.append(
            "Embedder sémantique demandé mais indisponible "
            "(modèle .onnx, tokenizer.json ou onnxruntime manquant)."
        )
        return structural, notes

    # `auto` : sémantique si réellement disponible, sinon structurel.
    onnx = OnnxClipEmbedder(settings)
    if onnx.available:
        notes.append(f"Embedder sémantique détecté et utilisé : {onnx.name}.")
        return onnx, notes

    notes.append(
        "Aucun modèle sémantique installé : descripteur structurel utilisé. "
        "La recherche visuelle par description s'appuie alors sur les métadonnées."
    )
    return structural, notes