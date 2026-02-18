from datetime import datetime

from pydantic import BaseModel


class SourceBase(BaseModel):
    name: str
    url: str
    source_type: str
    local_folder: str
    audio_format: str = "mp3"
    name_format: str | None = None
    sync_enabled: bool = True
    original_art: bool = True
    extract_artist: bool = False


class SourceCreate(SourceBase):
    pass


class SourceUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    source_type: str | None = None
    local_folder: str | None = None
    audio_format: str | None = None
    name_format: str | None = None
    sync_enabled: bool | None = None
    original_art: bool | None = None
    extract_artist: bool | None = None


class SourceRead(SourceBase):
    id: int
    created_at: datetime
    updated_at: datetime
    last_sync_status: str | None = None
    last_sync_at: datetime | None = None

    model_config = {"from_attributes": True}
