from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", case_sensitive=False)

    database_url: str = "sqlite+pysqlite:///./docking.db"
    broker_url: str = "redis://broker:6379/0"
    object_store_path: str = "/data/object_store"
    protein_library_path: str = "/protein_library"
    task_timeout_seconds: int = 300
    max_retries: int = 2
    pocket_method_default: str = "auto"
    pocket_padding: float = 6.0
    pocket_min_size: float = 18.0
    pocket_default_size: float = 20.0
