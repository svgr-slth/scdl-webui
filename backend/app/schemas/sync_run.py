from datetime import datetime

from pydantic import BaseModel


class SyncRunRead(BaseModel):
    id: int
    source_id: int
    source_name: str | None = None
    status: str
    started_at: datetime
    finished_at: datetime | None = None
    tracks_added: int = 0
    tracks_removed: int = 0
    tracks_skipped: int = 0
    error_message: str | None = None

    model_config = {"from_attributes": True}


class SyncRunDetail(SyncRunRead):
    log_output: str | None = None


class SyncStatus(BaseModel):
    is_syncing: bool
    sources: dict[int, str] = {}
