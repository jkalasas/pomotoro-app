from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    """Application configuration using pydantic-settings.

    This centralizes environment configuration and reads values from a .env file
    (if present) and the environment. Use the exported `settings` instance.
    """

    database_url: str = "sqlite:///database.db"
    environment: str = "development"
    log_level: str = "info"
    secret_key: str = "please_change_this"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    # When true, access tokens will be created without an `exp` claim
    # Useful for local development or special environments. Do NOT enable in production.
    access_token_no_expiration: bool = False

    gemini_api_key: str
    gemini_model: str = "gemini-2.0-flash-lite"

    # pydantic-settings configuration
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


# singleton settings instance to import across the app
settings = Settings()
