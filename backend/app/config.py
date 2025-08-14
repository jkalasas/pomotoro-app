from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    """Application configuration using pydantic-settings.

    This centralizes environment configuration and reads values from a .env file
    (if present) and the environment. Use the exported `settings` instance.
    """

    gemini_api_key: str
    gemini_model: str = "gemini-2.0-flash-lite"
    database_url: str = "sqlite:///database.db"
    environment: str = "development"
    log_level: str = "info"

    # pydantic-settings configuration
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


# singleton settings instance to import across the app
settings = Settings()
