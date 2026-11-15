"""Route de chat — point d'entrée unique du RAG et de la génération.

Le backend enregistre la question **avant** toute génération, puis tente de
produire une réponse via les adaptateurs. Si le composant n'est pas branché, la
réponse est un `501` explicite : aucune réponse, référence ou donnée n'est
fabriquée.

Les pièces jointes sont téléversées par `POST /chat/attachments`, puis
référencées par identifiant dans `POST /chat`. Le fichier reste la propriété de
l'utilisateur : chaque accès est revérifié côté serveur.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, File, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse

from app.api.deps import DbSession, PrincipalDep
from app.core.errors import NotFound, NotConfigured
from app.schemas.chat import Answer, AttachmentOut, ChatRequest
from app.services import attachment_service, conversation_service
from app.services.adapters import registry
from app.services.adapters.base import GenerationRequest
from app.services.retrieval import to_answer

router = APIRouter(prefix="/chat", tags=["chat"])

# Recherche multimodale : le moteur et sa conversion en schéma de réponse.
retrieval = registry.get_retrieval()


@router.post(
    "/attachments",
    response_model=AttachmentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Téléverser une pièce jointe (document, image, vidéo)",
)
async def upload_attachment(
    principal: PrincipalDep,
    db: DbSession,
    file: UploadFile = File(...),
) -> AttachmentOut:
    content = await file.read()
    saved = attachment_service.save_attachment(
        user_id=principal.user_id,
        content=content,
        content_type=file.content_type or "application/octet-stream",
        filename=file.filename,
    )
    await db.commit()
    return AttachmentOut(**saved)


@router.get(
    "/attachments/{attachment_id}",
    summary="Récupérer sa propre pièce jointe",
    response_class=FileResponse,
)
async def read_attachment(
    principal: PrincipalDep,
    db: DbSession,
    attachment_id: str,
) -> FileResponse:
    path = attachment_service.attachment_path(attachment_id, user_id=principal.user_id)
    if path is None or not os.path.isfile(path):
        raise NotFound("Pièce jointe introuvable.")
    return FileResponse(path, filename=os.path.basename(path))


@router.post("", summary="Poser une question (recherche + génération)")
async def chat(payload: ChatRequest, principal: PrincipalDep, db: DbSession):
    attachments = attachment_service.require_all(
        [item.attachment_id for item in payload.attachments],
        user_id=principal.user_id,
    )

    conversation, message = await conversation_service.prepare_chat(
        db,
        user_id=principal.user_id,
        conversation_id=payload.conversation_id,
        text=payload.text,
        attachments=attachments,
    )
    # Invariant : la question est validée **avant** toute recherche ou
    # génération. Si l'une échoue, la question reste dans l'historique.
    await db.commit()

    # Recherche multimodale : exécutée sur l'index local, elle ne dépend d'aucun
    # modèle distant. Les résultats sont réels ou absents, jamais fabriqués.
    retrieval_bundle = retrieval.search(payload.text)
    partial_answer = to_answer.build_partial_answer(retrieval_bundle)
    retrieval_payload = retrieval_bundle.to_dict()

    if retrieval_bundle.status == "ok":
        # Les médias, graphiques et références trouvés sont conservés dans la
        # conversation : le Chat les réaffiche à l'identique de l'Accueil.
        stored = await conversation_service.record_answer(
            db, conversation=conversation, answer=partial_answer
        )
        await db.commit()
    else:
        stored = message

    generation = registry.get_generation()
    if not generation.available:
        raise NotConfigured(
            "La génération de réponse n'est pas encore connectée. "
            "La question est enregistrée et les résultats de recherche sont joints.",
            detail={
                "component": "generation",
                "conversation_id": conversation.id,
                "message_id": message.id,
                "answer_message_id": stored.id,
                "question_persisted": True,
                "attachments_persisted": [item["attachment_id"] for item in attachments],
                "retrieval_status": retrieval_bundle.status,
                "retrieval": retrieval_payload,
                "answer": partial_answer.model_dump(mode="json"),
            },
        )

    answer = generation.generate(
        GenerationRequest(
            question=payload.text,
            chunks=[],
            media=partial_answer.media,
            science=[],
            attachments=attachments,
        )
    )
    stored = await conversation_service.record_answer(
        db, conversation=conversation, answer=Answer(**answer.__dict__)
    )
    await db.commit()
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            "conversation_id": conversation.id,
            "message_id": stored.id,
            "status": "completed",
            "answer": Answer(**answer.__dict__).model_dump(mode="json"),
            "retrieval": retrieval_payload,
        },
    )


__all__ = ["router"]