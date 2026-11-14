"""Modèles ORM du backend TechLabs.

Le schéma est volontairement volontaire : `user_documents`, `media_assets` et
`ingestion_runs` (catalogue multimédia, documents privés) sont documentés dans
`backend/migrations/001_init.sql` mais pas encore utilisés par l'application.
Ils sont créés pour que le RAG et le multimodal puissent se brancher sans
migration destructive ultérieure.
"""

from app.models.conversation import Conversation, Message
from app.models.user import Profile, SessionRecord, User

__all__ = ["User", "Profile", "SessionRecord", "Conversation", "Message"]