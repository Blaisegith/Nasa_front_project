"""Service de conversations et de messages.

Règle d'or : **toute requête est filtrée par `user_id`**. Une conversation qui
n'appartient pas à l'utilisateur courant est traitée comme inexistante (404),
afin de ne pas révéler son existence.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound, ValidationFailed
from app.models.conversation import Conversation, Message
from app.schemas.chat import Answer, ChatAccepted


async def create_conversation(
    db: AsyncSession,
    *,
    user_id: str,
    title: str | None = None,
) -> Conversation:
    conversation = Conversation(user_id=user_id, title=title or "Nouvelle conversation")
    db.add(conversation)
    await db.flush()
    return conversation


async def get_conversation(
    db: AsyncSession,
    *,
    user_id: str,
    conversation_id: str,
    with_messages: bool = True,
) -> Conversation:
    stmt = select(Conversation).where(
        Conversation.id == conversation_id,
        Conversation.user_id == user_id,
        Conversation.archived_at.is_(None),
    )
    conversation = (await db.execute(stmt)).scalar_one_or_none()
    if conversation is None:
        raise NotFound("Conversation introuvable.")
    if with_messages:
        await db.refresh(conversation, attribute_names=["messages"])
    return conversation


async def list_conversations(
    db: AsyncSession,
    *,
    user_id: str,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    limit = max(1, min(limit, 100))
    offset = max(0, offset)

    total = (
        await db.execute(
            select(func.count())
            .select_from(Conversation)
            .where(Conversation.user_id == user_id, Conversation.archived_at.is_(None))
        )
    ).scalar_one()

    stmt = (
        select(Conversation)
        .where(Conversation.user_id == user_id, Conversation.archived_at.is_(None))
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
        .limit(limit)
        .offset(offset)
    )
    conversations = (await db.execute(stmt)).scalars().all()

    items: list[dict] = []
    for conversation in conversations:
        first_user = (
            await db.execute(
                select(Message)
                .where(
                    Message.conversation_id == conversation.id,
                    Message.role == "user",
                )
                .order_by(Message.sequence)
                .limit(1)
            )
        ).scalar_one_or_none()

        count = (
            await db.execute(
                select(func.count())
                .select_from(Message)
                .where(Message.conversation_id == conversation.id)
            )
        ).scalar_one()

        items.append(
            {
                "id": conversation.id,
                "title": conversation.title,
                "created_at": conversation.created_at,
                "updated_at": conversation.updated_at,
                "message_count": int(count),
                "preview": _preview(first_user.content if first_user else None),
            }
        )
    return items, int(total)


def _preview(content: dict | None) -> str | None:
    if not content:
        return None
    text = content.get("text")
    if not isinstance(text, str):
        return None
    text = text.strip()
    if not text:
        return None
    return text if len(text) <= 140 else text[:137] + "…"


async def delete_conversation(
    db: AsyncSession,
    *,
    user_id: str,
    conversation_id: str,
) -> None:
    conversation = (
        await db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if conversation is None:
        raise NotFound("Conversation introuvable.")
    await db.delete(conversation)


async def append_message(
    db: AsyncSession,
    *,
    conversation: Conversation,
    role: str,
    content: dict,
    status: str = "completed",
) -> Message:
    if role not in {"user", "assistant", "system"}:
        raise ValidationFailed("Rôle de message invalide.")

    next_sequence = (
        await db.execute(
            select(func.coalesce(func.max(Message.sequence), 0)).where(
                Message.conversation_id == conversation.id
            )
        )
    ).scalar_one()

    message = Message(
        conversation_id=conversation.id,
        role=role,
        status=status,
        content=content,
        sequence=int(next_sequence) + 1,
    )
    db.add(message)
    await db.flush()
    conversation.updated_at = message.created_at
    return message


async def prepare_chat(
    db: AsyncSession,
    *,
    user_id: str,
    conversation_id: str | None,
    text: str,
) -> tuple[Conversation, Message]:
    """Enregistre la question de l'utilisateur.

    La question est **persistée avant** toute tentative de génération : elle
    doit apparaître dans l'Accueil et dans le Chat, même si le service de
    génération n'est pas branché.
    """
    if conversation_id:
        conversation = await get_conversation(
            db, user_id=user_id, conversation_id=conversation_id, with_messages=False
        )
    else:
        conversation = await create_conversation(
            db, user_id=user_id, title=text[:80] if text else None
        )

    message = await append_message(
        db,
        conversation=conversation,
        role="user",
        content={"text": text},
    )
    return conversation, message


async def record_answer(
    db: AsyncSession,
    *,
    conversation: Conversation,
    answer: Answer,
) -> Message:
    """Enregistre une réponse générée (jamais appelée avec du contenu fabriqué)."""
    return await append_message(
        db,
        conversation=conversation,
        role="assistant",
        content=answer.model_dump(mode="json"),
        status=answer_status_to_message_status(answer),
    )


def answer_status_to_message_status(answer: Answer) -> str:
    if not (answer.summary or answer.scientific_explanation or answer.blocks):
        return "unavailable"
    if answer.limitations or not answer.references:
        return "partial"
    return "completed"


def accepted_payload(conversation: Conversation, message: Message) -> ChatAccepted:
    return ChatAccepted(
        conversation_id=conversation.id,
        message_id=message.id,
        status="unavailable",
        answer=None,
    )