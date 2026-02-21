from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite+aiosqlite:////data/db/scdl-web.db"
    music_root: str = "/data/music"
    archives_root: str = "/data/archives"


settings = Settings()
