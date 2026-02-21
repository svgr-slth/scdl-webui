import asyncio
import json
import logging
import os
import re
import subprocess
import sys
import threading
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path

from app.models.source import Source

logger = logging.getLogger(__name__)

# Audio extensions that can be stored in the filemap (excludes thumbnails, etc.)
_AUDIO_EXTS = {".mp3", ".flac", ".opus", ".m4a", ".ogg", ".wav"}

# Matches literal \uXXXX / \UXXXXXXXX sequences written by Windows Python when
# stdout encoding falls back to ASCII (e.g. scdl subprocess without UTF-8 mode).
_UNICODE_ESCAPE_RE = re.compile(r"\\u([0-9a-fA-F]{4})|\\U([0-9a-fA-F]{8})")


def _fix_unicode_escapes(path: str) -> str:
    """Decode literal \\uXXXX / \\UXXXXXXXX sequences in a path string.

    On Windows, if the scdl subprocess runs without PYTHONUTF8=1, non-ASCII
    characters in file paths are printed as Python escape sequences instead of
    the real Unicode character.  This causes stored paths to not match what
    exists on disk.  The substitution is safe because it is only applied when
    the original path does NOT exist but the decoded one does.
    """
    def _replace(m: re.Match) -> str:
        code = m.group(1) or m.group(2)
        return chr(int(code, 16))
    return _UNICODE_ESCAPE_RE.sub(_replace, path)


def _find_scdl() -> str:
    """Return the full path to the scdl executable.

    Looks in the same Scripts/bin directory as the running Python interpreter
    first (reliable inside a venv), then falls back to PATH via shutil.which.
    """
    import shutil

    scripts_dir = os.path.dirname(os.path.abspath(sys.executable))
    name = "scdl.exe" if sys.platform == "win32" else "scdl"
    candidate = os.path.join(scripts_dir, name)
    if os.path.isfile(candidate):
        return candidate

    found = shutil.which("scdl")
    if found:
        return found

    raise FileNotFoundError(
        f"scdl not found next to {sys.executable} or in PATH. "
        "Ensure scdl is installed in the virtual environment."
    )


@dataclass
class SyncResult:
    success: bool
    output: str
    return_code: int
    tracks_added: int = 0
    tracks_removed: int = 0
    tracks_skipped: int = 0


class ScdlRunner:
    def __init__(self, music_root: str, archives_root: str):
        self.music_root = Path(music_root)
        self.archives_root = Path(archives_root)

    # ── Path helpers ──────────────────────────────────────────────

    def _archive_path(self, source_id: int) -> Path:
        return self.archives_root / f"source-{source_id}-archive.txt"

    def _sync_file_path(self, source_id: int) -> Path:
        return self.archives_root / f"source-{source_id}-sync.txt"

    def _filemap_path(self, source_id: int) -> Path:
        return self.archives_root / f"source-{source_id}-filemap.json"

    def get_music_folder(self, source: Source) -> Path:
        return self.music_root / source.local_folder

    # ── Filemap (track_id → filepath) ────────────────────────────

    def _load_filemap(self, source_id: int) -> dict[str, str]:
        path = self._filemap_path(source_id)
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                logger.warning("Corrupt filemap at %s, starting fresh", path)
        return {}

    def _save_filemap(self, source_id: int, filemap: dict[str, str]) -> None:
        path = self._filemap_path(source_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(filemap, indent=2), encoding="utf-8")

    # ── Pre-sync: regenerate archive files from disk ────────────

    def prepare_sync_files(self, source_id: int) -> int:
        """Regenerate archive and sync files from filemap.

        Only includes entries for files that exist on disk.  This makes
        the folder the source of truth: missing files are not archived,
        so scdl will re-download them.

        Returns count of pruned (missing) filemap entries.
        """
        filemap = self._load_filemap(source_id)

        archive_lines: list[str] = []
        sync_lines: list[str] = []
        live_filemap: dict[str, str] = {}
        pruned = 0

        for track_id, filepath in filemap.items():
            actual_path = filepath
            if not Path(filepath).exists():
                # Legacy filemap entries may have \uXXXX escape sequences
                # instead of real Unicode (Windows encoding bug). Try to repair.
                fixed = _fix_unicode_escapes(filepath)
                if fixed != filepath and Path(fixed).exists():
                    actual_path = fixed
                else:
                    pruned += 1
                    continue
            archive_lines.append(f"soundcloud {track_id}")
            sync_lines.append(f"soundcloud {track_id} {actual_path}")
            live_filemap[track_id] = actual_path

        self.archives_root.mkdir(parents=True, exist_ok=True)

        # Write archive (yt-dlp format: "soundcloud {id}")
        self._archive_path(source_id).write_text(
            "\n".join(archive_lines) + "\n" if archive_lines else "",
            encoding="utf-8",
        )
        # Write sync file (scdl format: "soundcloud {id} /path/to/file")
        # Must use UTF-8: paths may contain Unicode chars (U+FF1A, etc.) that
        # the Windows default encoding (CP1252) cannot represent.
        self._sync_file_path(source_id).write_text(
            "\n".join(sync_lines) + "\n" if sync_lines else "",
            encoding="utf-8",
        )

        if pruned > 0:
            self._save_filemap(source_id, live_filemap)
            logger.info("Pruned %d missing entries from source %d", pruned, source_id)

        return pruned

    # ── Cleanup / Reset ──────────────────────────────────────────

    def delete_archive_files(self, source_id: int) -> None:
        """Delete all archive-related files for a source."""
        for path in [
            self._archive_path(source_id),
            self._sync_file_path(source_id),
            self._filemap_path(source_id),
        ]:
            if path.exists():
                path.unlink()
                logger.info("Deleted %s", path)

    def reset_archive(self, source_id: int) -> None:
        """Wipe archive, sync, and filemap to force full re-download on next sync."""
        for path in [
            self._archive_path(source_id),
            self._sync_file_path(source_id),
            self._filemap_path(source_id),
        ]:
            if path.exists():
                path.unlink()
                logger.info("Reset: deleted %s", path)

    # ── Command building ─────────────────────────────────────────

    def build_command(self, source: Source, auth_token: str | None = None) -> list[str]:
        cmd = [_find_scdl(), "-l", source.url]

        type_flags: dict[str, list[str]] = {
            "likes": ["-f"],
            "artist_tracks": ["-t"],
            "artist_all": ["-a"],
            "user_reposts": ["-r"],
            "playlist": [],
        }
        cmd.extend(type_flags.get(source.source_type, []))

        download_path = self.music_root / source.local_folder
        cmd.extend(["--path", str(download_path)])

        archive_file = self._archive_path(source.id)
        sync_file = self._sync_file_path(source.id)
        cmd.extend(["--download-archive", str(archive_file)])
        cmd.extend(["--sync", str(sync_file)])

        format_flags: dict[str, list[str]] = {
            "mp3": ["--onlymp3"],
            "flac": ["--flac"],
            "opus": ["--opus"],
        }
        if source.audio_format in format_flags:
            cmd.extend(format_flags[source.audio_format])

        if source.original_art:
            cmd.append("--original-art")
        if source.extract_artist:
            cmd.append("--extract-artist")
        if source.name_format:
            cmd.extend(["--name-format", source.name_format])
        if auth_token:
            cmd.extend(["--auth-token", auth_token])

        cmd.append("--no-playlist-folder")
        cmd.append("-c")
        return cmd

    # ── Sync execution ───────────────────────────────────────────

    async def run_sync(
        self,
        source: Source,
        auth_token: str | None,
        on_output: Callable[[str], Awaitable[None]],
    ) -> SyncResult:
        cmd = self.build_command(source, auth_token)

        download_path = self.music_root / source.local_folder
        download_path.mkdir(parents=True, exist_ok=True)
        self.archives_root.mkdir(parents=True, exist_ok=True)

        # Load existing filemap to extend during sync
        filemap = self._load_filemap(source.id)

        # Run scdl in a thread so we work with any asyncio event loop type.
        # asyncio.create_subprocess_exec requires ProactorEventLoop on Windows,
        # which uvicorn --reload does not use (it uses SelectorEventLoop).
        # subprocess.Popen in a thread works universally.
        #
        # PYTHONUTF8=1 forces UTF-8 output so file paths with Unicode chars are
        # written correctly instead of \uXXXX escape sequences.
        # Merging stderr into stdout captures yt-dlp output (which goes to stderr).
        env = {**os.environ, "PYTHONUTF8": "1"}
        logger.debug("Launching scdl: %s", " ".join(str(c) for c in cmd))

        loop = asyncio.get_event_loop()
        line_queue: asyncio.Queue[str | None] = asyncio.Queue()
        return_code_holder: list[int] = [1]

        def _reader() -> None:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                env=env,
            )
            assert proc.stdout is not None
            try:
                for raw_line in proc.stdout:
                    line = raw_line.decode("utf-8", errors="replace").rstrip()
                    loop.call_soon_threadsafe(line_queue.put_nowait, line)
            finally:
                return_code_holder[0] = proc.wait()
                loop.call_soon_threadsafe(line_queue.put_nowait, None)

        _thread = threading.Thread(target=_reader, daemon=True)
        _thread.start()

        lines: list[str] = []
        current_track_id: str | None = None
        track_id_re = re.compile(r"\[soundcloud\]\s+(\d+):")
        destination_re = re.compile(r"Destination:\s+(.+)$")

        while True:
            line = await line_queue.get()
            if line is None:
                break
            lines.append(line)
            await on_output(line)

            # Track ID detection
            m = track_id_re.search(line)
            if m:
                current_track_id = m.group(1)

            # Filename detection — associate with current track ID.
            # Only store audio files; thumbnails (.jpg/.png) also produce
            # Destination: lines and must not overwrite the mp3 path.
            m = destination_re.search(line)
            if m and current_track_id:
                dest = m.group(1)
                if Path(dest).suffix.lower() in _AUDIO_EXTS:
                    filemap[current_track_id] = dest

            # Also capture "already downloaded" files (exist on disk but not in archive)
            if "has already been downloaded" in line and current_track_id:
                m = re.match(r"\[download\]\s+(.+?)\s+has already been downloaded", line)
                if m:
                    dest = m.group(1)
                    if Path(dest).suffix.lower() in _AUDIO_EXTS:
                        filemap[current_track_id] = dest

        _thread.join(timeout=10)
        return_code = return_code_holder[0]

        # Persist updated filemap
        self._save_filemap(source.id, filemap)

        added = sum(1 for l in lines if "Destination:" in l)
        skipped = sum(1 for l in lines if "has already been recorded in the archive" in l
                      or "has already been downloaded" in l)
        removed = sum(1 for l in lines if "Removing" in l)

        return SyncResult(
            success=return_code == 0,
            output="\n".join(lines),
            return_code=return_code,
            tracks_added=added,
            tracks_removed=removed,
            tracks_skipped=skipped,
        )
