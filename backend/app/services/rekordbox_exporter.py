import logging
import sys
from pathlib import Path
from urllib.parse import quote

from app.config import settings
from app.database import async_session
from app.models.global_settings import GlobalSetting
from app.models.source import Source
from app.schemas.rekordbox import RekordboxExportResult, RekordboxStatus
from app.vendor.pyrekordbox.rbxml import RekordboxXml

logger = logging.getLogger(__name__)

AUDIO_EXTENSIONS = {".mp3", ".flac", ".opus", ".ogg", ".wav", ".m4a", ".aac", ".wma"}


def _get_data_dir() -> Path:
    """Derive data directory from the database URL (same dir as the SQLite file)."""
    url = settings.database_url
    # sqlite+aiosqlite:////data/db/scdl-web.db → /data/db/scdl-web.db
    prefix = "sqlite+aiosqlite:///"
    if url.startswith(prefix):
        db_path = Path(url[len(prefix):])
    else:
        db_path = Path(url.split("///")[-1])
    return db_path.parent


def _get_xml_path() -> Path:
    """Return the path to the shared Rekordbox XML export file."""
    import os

    custom = os.environ.get("REKORDBOX_XML_PATH")
    if custom:
        return Path(custom)
    return _get_data_dir() / "rekordbox-export.xml"


def _path_to_location(path: Path) -> str:
    """Convert an absolute filesystem path to a Rekordbox file:// URI."""
    abs_path = str(path.resolve())
    if sys.platform == "win32":
        # C:\Users\foo\bar.mp3 → file://localhost/C:/Users/foo/bar.mp3
        abs_path = abs_path.replace("\\", "/")
        return "file://localhost/" + quote(abs_path, safe=":/")
    else:
        return "file://localhost" + quote(abs_path, safe="/")


def _load_or_create_xml(xml_path: Path) -> "RekordboxXml":
    """Load existing XML or create a new one. Recreate if corrupted."""
    if xml_path.exists():
        try:
            return RekordboxXml(path=str(xml_path))
        except Exception:
            logger.warning("Corrupted Rekordbox XML at %s, recreating", xml_path)
    return RekordboxXml(name="rekordbox", version="6.0.0", company="AlphaTheta")


def _get_existing_locations(xml: "RekordboxXml") -> set[str]:
    """Build a set of all Location values already in the XML collection."""
    locations = set()
    for track in xml.get_tracks():
        loc = track.get("Location")
        if loc:
            locations.add(loc)
    return locations


async def _get_music_root() -> Path:
    """Read music_root from DB settings, falling back to env var default."""
    async with async_session() as db:
        row = await db.get(GlobalSetting, "music_root")
        return Path(row.value if row and row.value else settings.music_root)


async def _get_source(source_id: int) -> Source | None:
    async with async_session() as db:
        return await db.get(Source, source_id)


async def export_to_collection(source_id: int) -> RekordboxExportResult:
    """Add all synced tracks from a source to the Rekordbox XML collection."""
    source = await _get_source(source_id)
    if not source:
        raise FileNotFoundError(f"Source {source_id} not found")

    music_root = await _get_music_root()
    folder = music_root / source.local_folder

    if not folder.exists():
        raise FileNotFoundError(f"Source folder does not exist: {folder}")

    # Collect audio files
    audio_files = sorted(
        f for f in folder.rglob("*")
        if f.is_file() and f.suffix.lower() in AUDIO_EXTENSIONS
    )

    if not audio_files:
        raise FileNotFoundError(f"No audio files found in {folder}")

    xml_path = _get_xml_path()
    xml_path.parent.mkdir(parents=True, exist_ok=True)
    xml = _load_or_create_xml(xml_path)

    existing_locations = _get_existing_locations(xml)
    tracks_added = 0
    tracks_skipped = 0

    for audio_file in audio_files:
        location = _path_to_location(audio_file)
        if location in existing_locations:
            tracks_skipped += 1
            continue

        try:
            track = xml.add_track(location=location)
            track["Name"] = audio_file.stem
            tracks_added += 1
            existing_locations.add(location)
        except Exception as e:
            logger.warning("Failed to add track %s: %s", audio_file, e)
            tracks_skipped += 1

    xml.save(path=str(xml_path))

    return RekordboxExportResult(
        tracks_added=tracks_added,
        tracks_skipped=tracks_skipped,
        xml_path=str(xml_path),
    )


async def export_as_playlist(source_id: int) -> RekordboxExportResult:
    """Add all synced tracks and create a named playlist in the Rekordbox XML."""
    source = await _get_source(source_id)
    if not source:
        raise FileNotFoundError(f"Source {source_id} not found")

    music_root = await _get_music_root()
    folder = music_root / source.local_folder

    if not folder.exists():
        raise FileNotFoundError(f"Source folder does not exist: {folder}")

    audio_files = sorted(
        f for f in folder.rglob("*")
        if f.is_file() and f.suffix.lower() in AUDIO_EXTENSIONS
    )

    if not audio_files:
        raise FileNotFoundError(f"No audio files found in {folder}")

    xml_path = _get_xml_path()
    xml_path.parent.mkdir(parents=True, exist_ok=True)
    xml = _load_or_create_xml(xml_path)

    existing_locations = _get_existing_locations(xml)
    tracks_added = 0
    tracks_skipped = 0
    playlist_track_ids: list[int] = []

    for audio_file in audio_files:
        location = _path_to_location(audio_file)
        if location in existing_locations:
            tracks_skipped += 1
            # Find existing track ID for the playlist
            for t in xml.get_tracks():
                if t.get("Location") == location:
                    playlist_track_ids.append(int(t["TrackID"]))
                    break
            continue

        try:
            track = xml.add_track(location=location)
            track["Name"] = audio_file.stem
            tracks_added += 1
            existing_locations.add(location)
            playlist_track_ids.append(int(track["TrackID"]))
        except Exception as e:
            logger.warning("Failed to add track %s: %s", audio_file, e)
            tracks_skipped += 1

    # Remove existing playlist with the same name, then recreate
    playlist_name = source.name
    root_folder = xml.get_playlist("root")
    try:
        root_folder.remove_playlist(playlist_name)
    except Exception:
        pass  # Playlist didn't exist

    playlist = root_folder.add_playlist(playlist_name, keytype="TrackID")
    for track_id in playlist_track_ids:
        playlist.add_track(key=track_id)

    xml.save(path=str(xml_path))

    return RekordboxExportResult(
        tracks_added=tracks_added,
        tracks_skipped=tracks_skipped,
        xml_path=str(xml_path),
        playlist_name=playlist_name,
        playlist_tracks=len(playlist_track_ids),
    )


async def get_status() -> RekordboxStatus:
    """Return the current status of the Rekordbox XML export."""
    xml_path = _get_xml_path()
    total_tracks = 0
    total_playlists = 0

    if xml_path.exists():
        try:
            xml = RekordboxXml(path=str(xml_path))
            total_tracks = xml.num_tracks
            root = xml.get_playlist("root")
            total_playlists = len(root.get_playlists()) if root else 0
        except Exception:
            logger.warning("Failed to read Rekordbox XML at %s", xml_path)

    return RekordboxStatus(
        platform=sys.platform,
        xml_exists=xml_path.exists(),
        xml_path=str(xml_path),
        total_tracks=total_tracks,
        total_playlists=total_playlists,
    )
