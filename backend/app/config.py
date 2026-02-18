from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:////data/db/scdl-web.db"
    music_root: str = "/data/music"
    archives_root: str = "/data/archives"


settings = Settings()
