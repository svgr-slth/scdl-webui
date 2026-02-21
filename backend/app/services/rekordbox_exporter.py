import logging
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

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
    prefix = "sqlite+aiosqlite:///"
    if url.startswith(prefix):
        db_path = Path(url[len(prefix):])
    else:
        db_path = Path(url.split("///")[-1])
    return db_path.parent


def discover_xml_paths() -> list[str]:
    """Scan default OS locations for existing rekordbox.xml files."""
    candidates: list[str] = []
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA", "")
        if appdata:
            for subdir in ["rekordbox", "rekordbox6", "rekordbox5"]:
                p = Path(appdata) / "Pioneer" / subdir / "rekordbox.xml"
                if p.exists():
                    candidates.append(str(p))
    elif sys.platform == "darwin":
        home = Path.home()
        for subdir in ["rekordbox", "rekordbox6", "rekordbox5"]:
            p = home / "Library" / "Pioneer" / subdir / "rekordbox.xml"
            if p.exists():
                candidates.append(str(p))
    return candidates


async def _get_or_auto_configure_xml_path() -> Path:
    """Resolve XML path; auto-detect Rekordbox installation and save if not yet configured."""
    async with async_session() as db:
        row = await db.get(GlobalSetting, "rekordbox_xml_path")
        if row and row.value:
            return Path(row.value)

    custom = os.environ.get("REKORDBOX_XML_PATH")
    if custom:
        return Path(custom)

    found = discover_xml_paths()
    if found:
        path = Path(found[0])
        async with async_session() as db:
            row = await db.get(GlobalSetting, "rekordbox_xml_path")
            if row:
                row.value = str(path)
            else:
                db.add(GlobalSetting(key="rekordbox_xml_path", value=str(path)))
            await db.commit()
        logger.info("Auto-configured Rekordbox XML path: %s", path)
        return path

    return _get_data_dir() / "rekordbox-export.xml"



def _load_or_create_xml(xml_path: Path) -> "RekordboxXml":
    """Load existing XML or create a new one. Recreate if corrupted."""
    if xml_path.exists():
        try:
            return RekordboxXml(path=str(xml_path))
        except Exception:
            logger.warning("Corrupted Rekordbox XML at %s, recreating", xml_path)
    return RekordboxXml(name="rekordbox", version="6.0.0", company="AlphaTheta")


def _read_metadata(path: Path) -> dict:
    """Read ID3/audio metadata from a file using mutagen. Falls back to filename on error."""
    meta: dict = {"Name": path.stem, "Artist": "", "Album": "", "Bpm": "", "Genre": ""}
    try:
        from mutagen import File as MutagenFile  # lazy import — may not be installed yet
        audio = MutagenFile(path, easy=True)
        if audio:
            meta["Name"] = audio.get("title", [path.stem])[0]
            meta["Artist"] = audio.get("artist", [""])[0]
            meta["Album"] = audio.get("album", [""])[0]
            meta["Genre"] = audio.get("genre", [""])[0]
            if "bpm" in audio:
                try:
                    meta["Bpm"] = str(int(float(audio["bpm"][0])))
                except (ValueError, IndexError):
                    pass
    except Exception as e:
        logger.debug("Could not read metadata from %s: %s", path, e)
    return meta


def _is_rekordbox_running() -> bool:
    """Return True if Rekordbox is currently running (best-effort, platform-specific)."""
    try:
        if sys.platform == "win32":
            r = subprocess.run(
                ["tasklist", "/FI", "IMAGENAME eq rekordbox.exe"],
                capture_output=True, text=True,
            )
            return "rekordbox.exe" in r.stdout
        elif sys.platform == "darwin":
            return subprocess.run(
                ["pgrep", "-x", "rekordbox"], capture_output=True
            ).returncode == 0
    except Exception:
        pass
    return False


async def _get_music_root() -> Path:
    """Read music_root from DB settings, falling back to env var default."""
    async with async_session() as db:
        row = await db.get(GlobalSetting, "music_root")
        return Path(row.value if row and row.value else settings.music_root)


async def _get_source(source_id: int) -> Source | None:
    async with async_session() as db:
        return await db.get(Source, source_id)


async def export_source(source_id: int) -> RekordboxExportResult:
    """Export all audio files from a source to Rekordbox XML as a playlist.

    - Auto-detects and saves the XML path on first use (no manual Settings step needed).
    - Reads ID3 metadata (artist, title, album, BPM, genre) via mutagen.
    - Non-destructive: existing playlist entries are preserved; only new tracks are appended.
    """
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

    xml_path = await _get_or_auto_configure_xml_path()
    xml_path.parent.mkdir(parents=True, exist_ok=True)
    xml = _load_or_create_xml(xml_path)
    # pyrekordbox bug: _parse() doesn't initialize _last_id from existing tracks
    # (only _init() does). Always sync it so add_track() doesn't collide.
    xml._last_id = max(xml.get_track_ids(), default=0)

    # Build OS-path → TrackID map for the existing collection.
    # pyrekordbox's decode_path() URL-decodes and strips the file://localhost/ prefix.
    # For previously-corrupt double-encoded entries (file://localhost/file://localhost/...
    # with %2520), a second unquote() recovers the real path (e.g. %20 → space).
    existing: dict[str, int] = {}
    for t in xml.get_tracks():
        try:
            decoded = t.get("Location")  # decode_path output: OS path, may have %20 literals
            normalized = os.path.normpath(unquote(decoded))  # second unquote heals %20→space
            existing[normalized] = int(t.get("TrackID"))
        except Exception:
            pass

    tracks_added = 0
    tracks_skipped = 0
    all_track_ids: list[int] = []

    for audio_file in audio_files:
        os_path = os.path.normpath(str(audio_file.resolve()))
        if os_path in existing:
            all_track_ids.append(existing[os_path])
            tracks_skipped += 1
        else:
            try:
                meta = _read_metadata(audio_file)
                # Pass the raw OS path — pyrekordbox's encode_path() handles URI encoding
                track = xml.add_track(str(audio_file.resolve()))
                for attr, val in [("Name", meta.get("Name")), ("Artist", meta.get("Artist")),
                                   ("Album", meta.get("Album")), ("Genre", meta.get("Genre")),
                                   ("AverageBpm", meta.get("Bpm"))]:
                    if val:
                        track[attr] = val
                track_id = int(track.get("TrackID"))
                existing[os_path] = track_id
                all_track_ids.append(track_id)
                tracks_added += 1
            except Exception as e:
                logger.warning("Failed to add track %s: %s", audio_file, e)
                tracks_skipped += 1

    # Non-destructive playlist update
    playlist_name = source.name
    root_folder = xml.get_playlist()  # no args = root playlist folder

    # Safe lookup: get_playlist(name) creates a spurious element when not found,
    # so iterate direct children instead.
    playlist_node = None
    for p in root_folder.get_playlists():
        try:
            if p.name == playlist_name:
                playlist_node = p
                break
        except ValueError:
            pass  # skip unnamed spurious nodes

    existing_playlist_ids: set[str] = set()
    if playlist_node is None:
        playlist_node = root_folder.add_playlist(playlist_name, keytype="TrackID")
    else:
        try:
            existing_playlist_ids = set(str(k) for k in playlist_node.get_tracks())
        except Exception:
            pass

    playlist_updated = 0
    for track_id in all_track_ids:
        if str(track_id) not in existing_playlist_ids:
            try:
                playlist_node.add_track(key=track_id)
                playlist_updated += 1
            except Exception as e:
                logger.warning("Failed to add track %d to playlist: %s", track_id, e)

    xml.save(path=str(xml_path))

    return RekordboxExportResult(
        tracks_added=tracks_added,
        tracks_skipped=tracks_skipped,
        playlist_updated=playlist_updated,
        xml_path=str(xml_path),
        playlist_name=playlist_name,
        is_rekordbox_running=_is_rekordbox_running(),
    )


async def get_status() -> RekordboxStatus:
    """Return the current status of the Rekordbox XML export."""
    xml_path = await _get_or_auto_configure_xml_path()
    total_tracks = 0
    total_playlists = 0

    if xml_path.exists():
        try:
            xml = RekordboxXml(path=str(xml_path))
            total_tracks = xml.num_tracks
            root_folder = xml.get_playlist()  # no args = root playlist folder
            total_playlists = sum(
                1 for p in root_folder.get_playlists()
                if p._element is not None and p._element.get("Name")
            )
        except Exception:
            logger.warning("Failed to read Rekordbox XML at %s", xml_path)

    return RekordboxStatus(
        platform=sys.platform,
        xml_exists=xml_path.exists(),
        xml_path=str(xml_path),
        total_tracks=total_tracks,
        total_playlists=total_playlists,
        detected_paths=discover_xml_paths(),
    )
