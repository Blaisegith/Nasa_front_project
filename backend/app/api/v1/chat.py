"""Route de chat — point d'entrée unique du RAG et de la génération.

Le backend enregistre la question **avant** toute génération, puis tente de
produire une réponse via les adaptateurs. Si le composant n'est pas branché, la
réponse est un `501` explicite : aucune réponse, référence ou donnée n'est
fabriquée.
"""

from __future__ import annotations

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.api.deps import DbSession, PrincipalDep
from app.core.errors import NotConfigured
from app.schemas.chat import Answer, ChatRequest
from app.services import conversation_service
from app.services.adapters import registry
from app.services.adapters.base import GenerationRequest

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", summary="Poser une question (recherche + génération)")
async def chat(payload: ChatRequest, principal: PrincipalDep, db: DbSession):
    conversation, message = await conversation_service.prepare_chat(
        db,
        user_id=principal.user_id,
        conversation_id=payload.conversation_id,
        text=payload.text,
    )
    await db.commit()

    generation = registry.get_generation()
    if not generation.available:
        raise NotConfigured(
            "La génération de réponse n'est pas encore connectée.",
            detail={
                "component": "generation",
                "conversation_id": conversation.id,
                "message_id": message.id,
                "question_persisted": True,
            },
        )

    answer = generation.generate(GenerationRequest(question=payload.text))
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
        },
    )


__all__ = ["router"]