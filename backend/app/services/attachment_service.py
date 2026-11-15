"""Pièces jointes du chat — stockage local, validé, jamais exécuté.

Le backend accepte des documents (PDF), des images et des vidéos. Les règles
sont volontairement strictes : type MIME autorisé, taille maximale, un fichier
aléatoire renommé côté serveur, et un chemin d'accès vérifié à chaque lecture
(l'utilisateur ne peut jamais lire le fichier d'un autre).
"""

from __future__ import annotations

import json
import os
import re
import uuid

from app.core.config import get_settings
from app.core.errors import NotFound, PayloadTooLarge, ValidationFailed

PUBLIC_PREFIX = "/api/v1/chat/attachments"

# Type MIME -> extension conservée. Aucun autre type n'est accepté.
_EXTENSIONS = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
}

_MEDIA_TYPES = {
    "application/pdf": "document",
    "image/png": "image",
    "image/jpeg": "image",
    "image/webp": "image",
    "video/mp4": "video",
    "video/quicktime": "video",
}

_SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._-]+")


def allowed_content_types() -> set[str]:
    settings = get_settings()
    return {item.strip() for item in settings.attachment_allowed_content_types.split(",") if item.strip()}


def _attachment_dir(user_id: str) -> str:
    base = get_settings().attachment_dir
    path = os.path.join(base, user_id)
    os.makedirs(path, exist_ok=True)
    return path


def sanitize_filename(filename: str | None, *, content_type: str) -> str:
    """Conserve un nom lisible mais sûr : jamais de chemin, jamais de script."""
    raw = os.path.basename(filename or "").strip()
    raw = _SAFE_FILENAME.sub("-", raw).strip("-.")
    if not raw:
        raw = "piece-jointe"
    extension = _EXTENSIONS.get(content_type, "")
    stem = os.path.splitext(raw)[0] or "piece-jointe"
    return f"{stem[:80]}{extension}"


def save_attachment(
    *,
    user_id: str,
    content: bytes,
    content_type: str,
    filename: str | None,
) -> dict:
    """Enregistre le fichier et renvoie ses métadonnées (sans le contenu)."""
    settings = get_settings()
    allowed = allowed_content_types()

    if not content:
        raise ValidationFailed("Fichier vide.")
    if content_type not in allowed:
        raise ValidationFailed(
            "Format non autorisé. Formats acceptés : "
            + ", ".join(sorted(allowed))
            + "."
        )
    if len(content) > settings.attachment_max_bytes:
        raise PayloadTooLarge(
            "Le fichier ne doit pas dépasser "
            f"{settings.attachment_max_bytes // (1024 * 1024)} Mo."
        )

    attachment_id = uuid.uuid4().hex
    name = f"{attachment_id}{_EXTENSIONS[content_type]}"
    directory = _attachment_dir(user_id)
    with open(os.path.join(directory, name), "wb") as handle:
        handle.write(content)

    display_name = sanitize_filename(filename, content_type=content_type)
    metadata = {
        "filename": display_name,
        "content_type": content_type,
        "size_bytes": len(content),
    }
    with open(os.path.join(directory, f"{attachment_id}.json"), "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, ensure_ascii=False)

    return {
        "attachment_id": attachment_id,
        "filename": display_name,
        "content_type": content_type,
        "media_type": _MEDIA_TYPES[content_type],
        "size_bytes": len(content),
        "url": f"{PUBLIC_PREFIX}/{attachment_id}",
    }


def attachment_path(attachment_id: str, *, user_id: str) -> str | None:
    """Chemin disque d'une pièce jointe, ou `None` si elle n'appartient pas à l'utilisateur.

    `user_id` vient de la session serveur : l'identifiant du dossier ne peut
    donc pas être falsifié depuis le navigateur.
    """
    if not re.fullmatch(r"[0-9a-f]{32}", attachment_id or ""):
        return None

    directory = os.path.join(get_settings().attachment_dir, user_id)
    if not os.path.isdir(directory):
        return None

    for extension in set(_EXTENSIONS.values()):
        path = os.path.join(directory, f"{attachment_id}{extension}")
        if os.path.isfile(path):
            return path
    return None


def describe(attachment_id: str, *, user_id: str) -> dict | None:
    """Métadonnées d'une pièce jointe déjà enregistrée, pour le rattachement au message."""
    path = attachment_path(attachment_id, user_id=user_id)
    if path is None:
        return None

    content_type = "application/octet-stream"
    filename = f"{attachment_id}{os.path.splitext(path)[1]}"
    size_bytes = os.path.getsize(path)

    sidecar = f"{os.path.splitext(path)[0]}.json"
    if os.path.isfile(sidecar):
        try:
            with open(sidecar, encoding="utf-8") as handle:
                stored = json.load(handle)
            content_type = stored.get("content_type") or content_type
            filename = stored.get("filename") or filename
            size_bytes = int(stored.get("size_bytes") or size_bytes)
        except (OSError, ValueError, TypeError):
            # Métadonnées illisibles : on retombe sur les valeurs du disque.
            pass

    return {
        "attachment_id": attachment_id,
        "filename": filename,
        "content_type": content_type,
        "media_type": _MEDIA_TYPES.get(content_type, "document"),
        "size_bytes": size_bytes,
        "url": f"{PUBLIC_PREFIX}/{attachment_id}",
    }


def require_all(attachment_ids: list[str], *, user_id: str) -> list[dict]:
    """Résout toutes les pièces jointes ou échoue (404) si l'une manque."""
    resolved: list[dict] = []
    for attachment_id in attachment_ids:
        described = describe(attachment_id, user_id=user_id)
        if described is None:
            raise NotFound("Pièce jointe introuvable.")
        resolved.append(described)
    return resolved


__all__ = [
    "PUBLIC_PREFIX",
    "allowed_content_types",
    "attachment_path",
    "describe",
    "require_all",
    "sanitize_filename",
    "save_attachment",
]