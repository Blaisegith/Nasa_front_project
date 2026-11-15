"""Conversion d'un `RetrievalBundle` en réponse structurée.

Le frontend sait déjà rendre des médias, des graphiques et des références
(`AnswerRenderer`). Plutôt que d'inventer un second format, on projette les
résultats réels du moteur dans ce schéma :

* images et vidéos → `media` ;
* mesures numériques → `charts` (points réels, unités réelles) ;
* documents → `references` ;
* limites et notes → `limitations`.

**Aucun texte de synthèse n'est produit ici.** Le champ `summary` reste vide
tant qu'un modèle de génération n'a pas répondu : la réponse est marquée
`partial`, pas `completed`.
"""

from __future__ import annotations

from app.schemas.chat import (
    Answer,
    Chart,
    ChartSeries,
    MediaItem,
    Reference,
)
from app.services.retrieval.models import RetrievalBundle

# Nombre maximal de points par graphique : au-delà, le rendu devient illisible
# et le fichier de mesures reste consultable en entier via sa référence.
_MAX_CHART_POINTS = 400


def build_partial_answer(bundle: RetrievalBundle) -> Answer:
    """Réponse structurée réellement étayée par l'index, sans synthèse inventée."""
    media: list[MediaItem] = []
    charts: list[Chart] = []
    references: list[Reference] = []

    for image in bundle.images:
        media.append(
            MediaItem(
                media_id=image.resource_id,
                media_type="image",
                title=image.title or image.resource_id,
                description=image.caption or None,
                source=image.source or None,
                experiment=image.experiment or None,
                thumbnail_url=image.thumb_url or image.url,
                file_url=image.url,
            )
        )

    for video in bundle.videos:
        media.append(
            MediaItem(
                media_id=video.resource_id,
                media_type="video",
                title=video.title or video.resource_id,
                description=video.description or None,
                source=video.source or None,
                experiment=video.experiment or None,
                thumbnail_url=video.thumb_url or None,
                file_url=video.url,
                duration=video.duration_s or None,
                segments=[segment.to_dict() for segment in video.segments],
            )
        )

    for index, measurement in enumerate(bundle.measurements):
        points = measurement.points[:_MAX_CHART_POINTS]
        name = measurement.title or f"Série {index + 1}"
        unit = measurement.unit
        charts.append(
            Chart(
                chart_id=f"chart-{index}",
                title=name,
                x_axis="temps",
                y_axis=f"{name}" + (f" ({unit})" if unit else ""),
                x_unit="s",
                y_unit=unit or None,
                kind="line",
                description=None,
                series=[ChartSeries(name=name, points=[tuple(point[:2]) for point in points])],
                source=measurement.source or None,
                interpretation=None,
                limitations=[],
            )
        )

    for document in bundle.documents:
        references.append(
            Reference(
                label=document.title or document.resource_id,
                source=document.source or None,
                document_id=document.resource_id,
                url=document.locator or None,
            )
        )

    limitations: list[str] = []
    if bundle.documents:
        limitations.append(
            "Les extraits proviennent des documents indexés ; aucun passage n'a été reformulé."
        )
    if bundle.images and not bundle.provenance.get("cross_modal", False):
        limitations.append(
            "Images appariées par leurs métadonnées réelles (descripteur structurel), "
            "sans analyse sémantique du contenu visuel."
        )
    if bundle.videos:
        limitations.append(
            "Segments proposés à partir des images extraites et de leurs timestamps ; "
            "aucun phénomène physique n'est détecté automatiquement."
        )
    if bundle.measurements:
        limitations.append(
            "Les points proviennent des fichiers de mesures indexés ; aucune valeur n'est interpolée."
        )

    if bundle.status == "empty":
        limitations.append("Aucun résultat dans l'index pour cette question.")

    return Answer(
        schema_version="1.0",
        summary=None,
        scientific_explanation=None,
        simple_explanation=None,
        arguments=[],
        references=references,
        media=media,
        charts=charts,
        limitations=limitations,
        blocks=[],
    )


__all__ = ["build_partial_answer"]