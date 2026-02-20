from pydantic import BaseModel


class SettingsRead(BaseModel):
    auth_token: str | None = None
    default_audio_format: str = "mp3"
    default_name_format: str | None = None
    music_root: str = "/data/music"
    auto_sync_enabled: bool = False
    auto_sync_interval_minutes: int = 60
    max_concurrent_syncs: int = 2
    rekordbox_xml_path: str | None = None


class SettingsUpdate(BaseModel):
    auth_token: str | None = None
    default_audio_format: str | None = None
    default_name_format: str | None = None
    music_root: str | None = None
    auto_sync_enabled: bool | None = None
    auto_sync_interval_minutes: int | None = None
    max_concurrent_syncs: int | None = None
    rekordbox_xml_path: str | None = None
