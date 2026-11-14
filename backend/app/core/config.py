"""Configuration centralisée du backend TechLabs.

Toutes les valeurs sont surchargeables par variables d'environnement ou `.env`.
Aucune valeur sensible ne doit être écrite en dur hors développement local.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Application ---
    backend_env: str = "development"
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    app_name: str = "TechLabs API"

    # --- Sécurité / sessions ---
    backend_secret_key: str = "dev-only-insecure-key-change-me"
    session_cookie_name: str = "techlabs_session"
    session_ttl_hours: int = 24 * 7
    session_cookie_secure: bool = False
    session_cookie_samesite: str = "lax"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    rate_limit_per_minute: int = 20

    # --- Base de données ---
    # Supabase (production) : postgresql+asyncpg://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:6543/postgres
    # Développement local   : sqlite+aiosqlite:///./techlabs.db
    database_url: str = "sqlite+aiosqlite:///./techlabs.db"
    database_echo: bool = False

    # --- Supabase (utilisé par les services, pas par le navigateur) ---
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    # --- Stockage des avatars ---
    avatar_dir: str = "./var/avatars"
    avatar_max_bytes: int = 2 * 1024 * 1024
    avatar_allowed_content_types: str = "image/jpeg,image/png,image/webp"

    # --- Fournisseur génératif (non branché) ---
    groq_api_key: str = ""

    # --- RAG / ChromaDB (non branché) ---
    chroma_persist_dir: str = "./var/chroma"
    embedding_model: str = "Qwen3-Embedding-0.6B"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.backend_env.lower() in {"prod", "production"}

    def validate_runtime(self) -> None:
        """Détecte les réglages dangereux avant de démarrer."""
        if self.is_production:
            if self.backend_secret_key == "dev-only-insecure-key-change-me":
                raise RuntimeError(
                    "BACKEND_SECRET_KEY doit être remplacé en production."
                )
            if not self.session_cookie_secure:
                raise RuntimeError(
                    "SESSION_COOKIE_SECURE doit être activé en production."
                )


@lru_cache
def get_settings() -> Settings:
    return Settings()