from pydantic import BaseModel


class SettingsRead(BaseModel):
    auth_token: str | None = None
    default_audio_format: str = "mp3"
    default_name_format: str | None = None


class SettingsUpdate(BaseModel):
    auth_token: str | None = None
    default_audio_format: str | None = None
    default_name_format: str | None = None
