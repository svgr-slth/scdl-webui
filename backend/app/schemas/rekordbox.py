from pydantic import BaseModel


class RekordboxExportResult(BaseModel):
    tracks_added: int
    tracks_skipped: int
    playlist_updated: int
    xml_path: str
    playlist_name: str
    is_rekordbox_running: bool


class RekordboxStatus(BaseModel):
    platform: str
    xml_exists: bool
    xml_path: str
    total_tracks: int
    total_playlists: int
    detected_paths: list[str] = []
