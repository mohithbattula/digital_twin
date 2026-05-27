"""
Jaswanth Digital Twin — Configuration
Loads and validates all environment variables via Pydantic Settings.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from .env file."""

    # ── Supabase ──
    supabase_url: str
    supabase_service_key: str
    supabase_anon_key: str = ""

    # ── OpenAI ──
    openai_api_key: str

    # ── LangSmith ──
    langchain_tracing_v2: bool = True
    langchain_endpoint: str = "https://api.smith.langchain.com"
    langchain_api_key: str = ""
    langchain_project: str = "jaswanth-twin-prod"

    # ── Webhook ──
    webhook_secret: str = ""

    # ── Server ──
    host: str = "0.0.0.0"
    port: int = 8000

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    """Cached singleton for app settings."""
    return Settings()
