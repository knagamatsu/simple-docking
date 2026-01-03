from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", case_sensitive=False)

    database_url: str = "sqlite+pysqlite:///./docking.db"
    broker_url: str = "redis://broker:6379/0"
    object_store_path: str = "/data/object_store"
    protein_library_path: str = "/protein_library"
    disable_celery: bool = False
    seed_proteins_on_startup: bool = True
