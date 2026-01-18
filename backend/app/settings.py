import json
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", case_sensitive=False)

    database_url: str = "sqlite+pysqlite:///./docking.db"
    broker_url: str = "redis://broker:6379/0"
    object_store_path: str = "/data/object_store"
    protein_library_path: str = "/protein_library"
    disable_celery: bool = False
    seed_proteins_on_startup: bool = True

    # CORS settings
    cors_origins: str = "http://localhost:8090,http://localhost:3000"
    cors_allow_credentials: bool = True

    # Rate limiting
    rate_limit_enabled: bool = True
    rate_limit_per_minute: int = 60

    def cors_origins_list(self) -> list[str]:
        cleaned = (self.cors_origins or "").strip()
        if not cleaned:
            return []
        if cleaned.startswith("["):
            try:
                parsed = json.loads(cleaned)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            except json.JSONDecodeError:
                pass
        return [item.strip() for item in cleaned.split(",") if item.strip()]
