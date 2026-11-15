"""Mesures de performance du moteur multimodal (PHASE 9).

Chiffres réels, sur le corpus configuré (`MULTIMODAL_CORPUS_DIRS`), avec
l'embedder réellement sélectionné. La commande est sans effet sur le réseau et
n'invente aucune valeur : elle rapporte ce que le moteur met à faire.

    python -m tools.retrieval_bench --repeat 3
"""

from __future__ import annotations

import argparse
import json
import platform
import shutil
import statistics
import subprocess
import sys
import time
from pathlib import Path

from app.services.retrieval.config import get_retrieval_settings
from app.services.retrieval.embedders import select_embedder
from app.services.retrieval.engine import MultimodalEngine
from app.services.retrieval.indexer import Indexer, index_corpus
from app.services.retrieval.store import IndexStore

QUESTIONS = [
    "Comment se propage une flamme en microgravité ?",
    "Montre-moi les images de la chambre de combustion ACME",
    "Quelles vidéos montrent l'expérience de combustion ?",
    "Comment évolue la température pendant l'expérience ?",
    "Quels documents décrivent l'extinction de la flamme ?",
    "Comparaison des mesures de pression et de température",
]


def _ffmpeg_version() -> str:
    binary = shutil.which("ffmpeg")
    if not binary:
        return "absent"
    try:
        result = subprocess.run(
            [binary, "-version"], capture_output=True, text=True, timeout=15, encoding="utf-8", errors="replace"
        )
        return result.stdout.splitlines()[0] if result.stdout else "inconnu"
    except (OSError, subprocess.SubprocessError):
        return "inconnu"


def _time_scan(indexer: Indexer) -> float:
    started = time.perf_counter()
    indexer.scan(force=True)
    return time.perf_counter() - started


def _time_search(engine: MultimodalEngine, question: str, repeat: int) -> tuple[float, float]:
    durations: list[float] = []
    counts: list[int] = []
    for _ in range(max(1, repeat)):
        started = time.perf_counter()
        bundle = engine.retrieve(question)
        durations.append((time.perf_counter() - started) * 1000)
        counts.append(len(bundle.documents) + len(bundle.images) + len(bundle.videos) + len(bundle.measurements))
    return statistics.mean(durations), statistics.mean(counts)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Mesures de performance du moteur multimodal.")
    parser.add_argument("--repeat", type=int, default=3, help="nombre de passes par question")
    args = parser.parse_args(argv)

    settings = get_retrieval_settings()
    embedder, notes = select_embedder(settings)
    store = IndexStore(settings)
    indexer = Indexer(settings, embedder, store=store)

    files = [path for path, _ in indexer.iter_files()]
    total_bytes = sum(path.stat().st_size for path in files)

    # Mesure dans un index temporaire : le serveur peut être en train d'utiliser
    # l'index de production, on ne le remplace pas.
    import tempfile
    from dataclasses import replace

    workdir = Path(tempfile.mkdtemp(prefix="retrieval-bench-"))
    bench_settings = replace(
        settings,
        index_db=str(workdir / "index.db"),
        frame_dir=str(workdir / "frames"),
    )
    bench_embedder, bench_notes = select_embedder(bench_settings)

    started = time.perf_counter()
    report = index_corpus(bench_settings, bench_embedder, store=IndexStore(bench_settings))
    full_index_s = time.perf_counter() - started

    fresh = IndexStore(bench_settings)
    started = time.perf_counter()
    report_again = index_corpus(bench_settings, bench_embedder, store=fresh)
    incremental_s = time.perf_counter() - started

    engine = MultimodalEngine(bench_settings, bench_embedder, store=fresh, notes=bench_notes)

    rows: list[dict] = []
    for question in QUESTIONS:
        mean_ms, hits = _time_search(engine, question, args.repeat)
        rows.append({"question": question, "ms": round(mean_ms, 1), "results": hits})

    payload = {
        "environment": {
            "platform": platform.platform(),
            "python": sys.version.split()[0],
            "embedder": embedder.name,
            "embedder_kind": embedder.kind,
            "cross_modal": embedder.cross_modal,
            "vector_dim": embedder.dim,
            "ffmpeg": _ffmpeg_version(),
        },
        "corpus": {
            "files": len(files),
            "bytes": total_bytes,
            "dirs": [str(path) for path in settings.resolved_corpus_dirs()],
        },
        "index": {
            "full_index_s": round(full_index_s, 3),
            "incremental_s": round(incremental_s, 3),
            "indexed_ids": len(report.indexed_ids),
            "unchanged_on_second_pass": report_again.unchanged,
            "errors": report.errors[:5],
            "stats": fresh.stats(),
        },
        "search": {
            "repeat": args.repeat,
            "questions": rows,
            "mean_ms": round(statistics.mean(row["ms"] for row in rows), 1),
            "max_ms": max(row["ms"] for row in rows),
        },
        "notes": list(notes),
    }

    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())