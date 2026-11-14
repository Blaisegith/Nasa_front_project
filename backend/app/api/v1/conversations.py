"""Routes de conversations."""

from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from app.api.deps import DbSession, PrincipalDep
from app.schemas.chat import ConversationCreate, ConversationOut, ConversationSummary
from app.services import conversation_service

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", summary="Lister mes conversations")
async def list_conversations(
    principal: PrincipalDep,
    db: DbSession,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict:
    items, total = await conversation_service.list_conversations(
        db, user_id=principal.user_id, limit=limit, offset=offset
    )
    await db.commit()
    return {
        "items": [ConversationSummary(**item) for item in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED, summary="Créer une conversation")
async def create_conversation(
    payload: ConversationCreate,
    principal: PrincipalDep,
    db: DbSession,
) -> ConversationOut:
    conversation = await conversation_service.create_conversation(
        db, user_id=principal.user_id, title=payload.title
    )
    await db.commit()
    return ConversationOut(
        id=conversation.id,
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages=[],
    )


@router.get("/{conversation_id}", response_model=ConversationOut, summary="Consulter une conversation")
async def read_conversation(
    conversation_id: str,
    principal: PrincipalDep,
    db: DbSession,
) -> ConversationOut:
    conversation = await conversation_service.get_conversation(
        db, user_id=principal.user_id, conversation_id=conversation_id
    )
    await db.commit()
    return ConversationOut(
        id=conversation.id,
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages=[message for message in conversation.messages],
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Supprimer une conversation")
async def delete_conversation(
    conversation_id: str,
    principal: PrincipalDep,
    db: DbSession,
) -> Response:
    await conversation_service.delete_conversation(
        db, user_id=principal.user_id, conversation_id=conversation_id
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["router"]