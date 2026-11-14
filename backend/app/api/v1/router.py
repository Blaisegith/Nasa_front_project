"""Routeur agrégé /api/v1."""

from fastapi import APIRouter

from app.api.v1 import auth, capabilities, chat, conversations, profile, system

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(profile.router)
api_router.include_router(conversations.router)
api_router.include_router(chat.router)
api_router.include_router(capabilities.router)
api_router.include_router(system.router)

__all__ = ["api_router"]