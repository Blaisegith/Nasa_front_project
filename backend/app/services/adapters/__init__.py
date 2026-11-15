"""Adaptateurs (points de branchement RAG / média / science / génération)."""

from app.services.adapters.base import (
    AdapterNotConfigured,
    Capability,
    GeneratedAnswer,
    GenerationRequest,
    MediaQuery,
    RetrievedChunk,
    ScienceRequest,
    ScienceResult,
)

__all__ = [
    "AdapterNotConfigured",
    "Capability",
    "GeneratedAnswer",
    "GenerationRequest",
    "MediaQuery",
    "RetrievedChunk",
    "ScienceRequest",
    "ScienceResult",
]