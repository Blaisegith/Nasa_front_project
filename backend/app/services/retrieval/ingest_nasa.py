"""Ingestion du corpus public NASA (Images API).

Pourquoi ce module : le moteur ne trouve que ce qui est indexé. Un corpus vide
donne un index vide — c'est correct, mais ce n'est pas démontrable. Ce module
remplit le corpus avec des ressources **publiques et réelles** (NASA Images),
puis lance l'indexation incrémentale habituelle.

Règles tenues :

* aucune clé d'API, aucune donnée fabriquée : chaque fichier téléchargé est
  accompagné de ses métadonnées réelles (titre, description, NASA ID, date,
  centre) dans un `<nom>.nasa.json` — que le moteur indexe comme document ;
* aucun appel réseau depuis l'application : ce module est une commande
  (`python -m app.services.retrieval.ingest_nasa`) et n'est utilisable via l'API
  que si `MULTIMODAL_NASA_ENABLED=1` est explicitement positionné ;
* seuls les hôtes NASA sont acceptés, le flux est borné en taille et en nombre
  de fichiers, et un fichier existant n'est jamais retéléchargé.

Limite assumée : l'API ne fournit ni transcription ni mesures. Une vidéo NASA
apporte donc des frames horodatées réelles et une description, pas un contenu
verbal transcrit.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

from app.services.retrieval.config import RetrievalSettings, get_retrieval_settings

USER_AGENT = "frameinff-retrieval/1.0 (local indexer)"
METADATA_SUFFIX = ".nasa.json"

_IMAGE_SUFFIX = {".jpg", ".jpeg", ".png"}
_VIDEO_SUFFIX = {".mp4"}
_HOST_SUFFIX = ("nasa.gov",)


def _is_nasa_url(url: str) -> bool:
    """N'accepte que HTTPS et un hôte NASA (anti-« SSRF déguisé »)."""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        return False
    host = parsed.hostname.lower()
    return any(host == suffix or host.endswith("." + suffix) for suffix in _HOST_SUFFIX)


def _https(url: str) -> str:
    """L'API NASA annonce parfois `http://` : on force HTTPS, jamais l'inverse.

    La politique reste « HTTPS uniquement » ; c'est le lien qui est corrigé, pas
    la règle.
    """
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme == "https":
        return url
    return urllib.parse.urlunparse(parsed._replace(scheme="https"))


def _http_json(url: str, *, timeout: float) -> dict:
    """GET JSON. Fonction séparée pour pouvoir être remplacée dans les tests."""
    request = urllib.request.Request(
        _https(url),
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - URL NASA validée
        payload = response.read().decode("utf-8", errors="replace")
    data = json.loads(payload)
    if not isinstance(data, dict):  # pragma: no cover - réponse inattendue
        raise ValueError("réponse inattendue de l'API NASA")
    return data


def _download(url: str, dest: Path, *, timeout: float, max_bytes: int) -> int:
    """Télécharge en flux, borne la taille, écrit de façon atomique."""
    url = _https(url)
    if not _is_nasa_url(url):
        raise ValueError(f"hôte refusé : {url}")
    if dest.exists() and dest.stat().st_size > 0:
        return dest.stat().st_size

    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_suffix(dest.suffix + ".part")
    written = 0
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
            declared = response.headers.get("Content-Length")
            if declared and int(declared) > max_bytes:
                raise ValueError(f"fichier trop volumineux ({declared} octets)")
            with partial.open("wb") as handle:
                while True:
                    block = response.read(64 * 1024)
                    if not block:
                        break
                    written += len(block)
                    if written > max_bytes:
                        raise ValueError(f"fichier trop volumineux (> {max_bytes} octets)")
                    handle.write(block)
    except Exception:
        partial.unlink(missing_ok=True)
        raise
    partial.replace(dest)
    return written


@dataclass(slots=True)
class IngestReport:
    query: str
    dest: str
    searched: int = 0
    selected: int = 0
    downloaded: int = 0
    reused: int = 0
    skipped: int = 0
    indexed: int = 0
    errors: list[str] = field(default_factory=list)
    files: list[str] = field(default_factory=list)
    duration_s: float = 0.0

    def to_dict(self) -> dict[str, object]:
        return {
            "query": self.query,
            "dest": self.dest,
            "searched": self.searched,
            "selected": self.selected,
            "downloaded": self.downloaded,
            "reused": self.reused,
            "skipped": self.skipped,
            "indexed": self.indexed,
            "errors": self.errors[:20],
            "files": self.files[:50],
            "duration_s": self.duration_s,
        }


def search(
    settings: RetrievalSettings,
    query: str,
    *,
    page_size: int = 20,
    timeout: float = 20.0,
    media_type: str | None = None,
) -> list[dict]:
    """Résultats réels de l'API : `href`, `nasa_id`, titre, description, date.

    `media_type` vaut `image`, `video` ou `None` (les deux). Le filtre est fait
    côté client sur le type déclaré par l'API : un résultat sans type n'est pas
    écarté silencieusement, il est conservé avec un type vide.
    """
    wanted = (media_type or "").strip().lower()
    url = (
        f"{settings.nasa_api}/search"
        f"?q={urllib.parse.quote(query)}"
        f"&media_type={urllib.parse.quote(wanted or 'image,video')}"
        f"&page_size={page_size}"
    )
    data = _http_json(url, timeout=timeout)
    items = data.get("collection", {}).get("items", [])
    results: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        payload = item.get("data") or []
        meta = payload[0] if payload and isinstance(payload[0], dict) else {}
        results.append(
            {
                "href": item.get("href", ""),
                "nasa_id": meta.get("nasa_id", ""),
                "title": (meta.get("title") or "").strip(),
                "description": (meta.get("description") or "").strip(),
                "date_created": meta.get("date_created", ""),
                "center": meta.get("center", ""),
                "media_type": meta.get("media_type", ""),
                "keywords": meta.get("keywords") or [],
                "photographer": meta.get("photographer", ""),
            }
        )
    rows = [row for row in results if row["href"]]
    if wanted in {"image", "video"}:
        rows = [row for row in rows if not row["media_type"] or row["media_type"] == wanted]
    return rows


def pick_asset(manifest: list[dict], media_type: str) -> str | None:
    """Meilleur lien d'un manifeste d'assets : `~orig`, sinon `~large`, sinon le premier."""
    if media_type == "video":
        candidates = [
            asset.get("href", "")
            for asset in manifest
            if isinstance(asset, dict) and asset.get("href", "").lower().endswith(tuple(_VIDEO_SUFFIX))
        ]
    else:
        candidates = [
            asset.get("href", "")
            for asset in manifest
            if isinstance(asset, dict) and asset.get("href", "").lower().endswith(tuple(_IMAGE_SUFFIX))
        ]
    if not candidates:
        return None
    for marker in ("~orig", "~large", "~medium"):
        for href in candidates:
            if marker in href:
                return href
    return candidates[0]


def _safe_stem(nasa_id: str) -> str:
    cleaned = "".join(char if char.isalnum() or char in "-_" else "_" for char in nasa_id)
    return cleaned.strip("_")[:80] or "nasa"


def _write_metadata(dest: Path, item: dict, href: str, nasa_id: str) -> Path:
    """Métadonnées réelles, indexées comme document à côté du média."""
    meta_path = dest.with_suffix(METADATA_SUFFIX)
    payload = {
        "nasa_id": nasa_id,
        "title": item.get("title", ""),
        "description": item.get("description", ""),
        "date_created": item.get("date_created", ""),
        "center": item.get("center", ""),
        "media_type": item.get("media_type", ""),
        "keywords": item.get("keywords", []),
        "photographer": item.get("photographer", ""),
        "asset_href": href,
        "file": dest.name,
    }
    meta_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta_path


def ingest(
    settings: RetrievalSettings,
    query: str,
    *,
    limit: int = 4,
    dest: Path | None = None,
    page_size: int = 20,
    timeout: float = 20.0,
    download_timeout: float = 60.0,
    index: bool = True,
    media_type: str | None = None,
) -> IngestReport:
    """Télécharge jusqu'à `limit` ressources et les indexe (s'il y a lieu)."""
    report = IngestReport(query=query, dest=str(dest or ""))
    target = dest or (settings.resolved_corpus_dirs()[0] if settings.resolved_corpus_dirs() else Path("./var/corpus"))
    target = Path(target)
    target.mkdir(parents=True, exist_ok=True)
    report.dest = str(target)
    started = time.perf_counter()

    try:
        items = search(settings, query, page_size=page_size, timeout=timeout, media_type=media_type)
    except Exception as error:
        report.errors.append(f"recherche : {error}")
        report.duration_s = round(time.perf_counter() - started, 3)
        return report

    report.searched = len(items)

    for item in items:
        if report.selected >= limit:
            break
        nasa_id = item.get("nasa_id") or ""
        if not nasa_id:
            report.skipped += 1
            continue
        stem = _safe_stem(nasa_id)
        manifest_url = f"{settings.nasa_api}/asset/{urllib.parse.quote(nasa_id)}"

        try:
            manifest = _http_json(manifest_url, timeout=timeout).get("collection", {}).get("items", [])
            media_type = "video" if any(
                str(asset.get("href", "")).lower().endswith(tuple(_VIDEO_SUFFIX))
                for asset in manifest
                if isinstance(asset, dict)
            ) else "image"
            href = pick_asset(manifest, media_type)
            if not href:
                report.skipped += 1
                continue

            suffix = Path(urllib.parse.urlparse(href).path).suffix.lower()
            if suffix not in (_IMAGE_SUFFIX | _VIDEO_SUFFIX):
                suffix = ".mp4" if media_type == "video" else ".jpg"

            dest_path = target / f"nasa-{stem}{suffix}"
            report.selected += 1

            before = dest_path.exists() and dest_path.stat().st_size > 0
            _download(href, dest_path, timeout=download_timeout, max_bytes=settings.max_file_bytes)
            metadata_path = _write_metadata(dest_path, item, href, nasa_id)

            report.files.append(dest_path.name)
            report.files.append(metadata_path.name)
            if before:
                report.reused += 1
            else:
                report.downloaded += 1

        except Exception as error:  # pragma: no cover - réseau réel
            report.errors.append(f"{nasa_id}: {error}")
            report.skipped += 1

    if index and report.selected:
        try:
            from app.services.retrieval.service import reset, scan

            reset()
            scan_report = scan()
            report.indexed = scan_report.indexed
        except Exception as error:  # pragma: no cover - robustesse
            report.errors.append(f"indexation : {error}")

    report.duration_s = round(time.perf_counter() - started, 3)
    return report


async def ingest_async(settings: RetrievalSettings, query: str, **kwargs) -> IngestReport:
    """Enveloppe asynchrone : le réseau est bloquant, il ne l'est pas pour l'API."""
    return await asyncio.to_thread(ingest, settings, query, **kwargs)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingestion du corpus public NASA (Images API).")
    parser.add_argument("query", help="requête, par exemple « combustion microgravité »")
    parser.add_argument("--limit", type=int, default=4, help="nombre de ressources à télécharger")
    parser.add_argument("--dest", default=None, help="dossier de corpus (défaut : premier MULTIMODAL_CORPUS_DIRS)")
    parser.add_argument("--page-size", type=int, default=20)
    parser.add_argument("--media", choices=("image", "video"), default=None, help="se limiter aux images ou aux vidéos")
    parser.add_argument("--dry-run", action="store_true", help="recherche seulement, aucun téléchargement")
    args = parser.parse_args(argv)

    settings = get_retrieval_settings()
    if args.dry_run:
        items = search(settings, args.query, page_size=args.page_size, media_type=args.media)
        for item in items:
            print(f"- {item['nasa_id']} [{item['media_type']}] {item['title'][:70]}")
        print(f"{len(items)} résultat(s), aucun téléchargement.")
        return 0

    dest = Path(args.dest) if args.dest else None
    report = ingest(
        settings,
        args.query,
        limit=args.limit,
        dest=dest,
        page_size=args.page_size,
        media_type=args.media,
    )
    print(json.dumps(report.to_dict(), ensure_ascii=False, indent=2))
    return 0 if report.selected else 1


if __name__ == "__main__":  # pragma: no cover - CLI
    raise SystemExit(main())