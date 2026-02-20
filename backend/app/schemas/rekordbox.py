from pydantic import BaseModel


class RekordboxExportResult(BaseModel):
    tracks_added: int
    tracks_skipped: int
    xml_path: str
    playlist_name: str | None = None
    playlist_tracks: int | None = None


class RekordboxStatus(BaseModel):
    platform: str
    xml_exists: bool
    xml_path: str
    total_tracks: int
    total_playlists: int
