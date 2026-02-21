# Changelog

All notable changes to scdl-web are documented here.

## [Unreleased]

## [3.20.0] - 2026-02-21

### Added
- **Duplicate source detection**: creating a source with the same URL and type as an existing one shows a yellow warning with a "Create anyway" option; creating an exact duplicate (same URL, type, and target folder) is blocked with a red error

### Removed
- **Reset Archive** button and backend endpoint: redundant since `prepare_sync_files()` already detects missing files before every sync and removes them from the archive, causing scdl to re-download them automatically

### Changed
- **Rekordbox integration redesigned**:
  - Single "Export to Rekordbox" button — no more "Add to Collection" vs "Add as Playlist" split
  - Exports always create/update a playlist named after the source
  - Non-destructive: existing playlist entries are preserved; only newly synced tracks are appended
  - ID3 metadata (artist, title, album, BPM, genre) populated automatically via mutagen
  - Auto-detects the Rekordbox XML path on first export — no manual Settings step required
  - Result feedback shows whether Rekordbox is currently open (changes require a relaunch to appear)

## [3.19.0] - 2026-02-21

### Fixed
- **Sync always failing on Windows**: `asyncio.create_subprocess_exec` raises `NotImplementedError` when the event loop is `SelectorEventLoop` (used by uvicorn in production and with `--reload`). Replaced with `subprocess.Popen` in a background thread, streaming output via `asyncio.Queue + call_soon_threadsafe`. Works with any event loop type.
- Sources remaining stuck in "running" state after backend crash or unhandled exception
- Sync failure error message showing as empty string in the UI (exceptions with no message, e.g. `NotImplementedError`, now fall back to `repr(e)`)
- uvicorn `--reload` workers losing database and path settings on reload (pydantic-settings now reads `backend/.env` via `env_file`)

### Added
- **Browser dev mode** (`scripts/dev.ps1`): starts the backend with full DEBUG logging and the Vite dev server in a browser window — no full Wails build needed while iterating
- Timestamped log files written to `logs/scdl-web_<timestamp>.log` during dev mode for post-mortem debugging

## [3.18.0] - 2026-02-20

### Fixed
- File paths with Unicode characters (e.g. `：`, `？`) stored as literal `\uXXXX` escape sequences in the filemap, causing tracks to be treated as missing on every sync. Fixed by setting `PYTHONUTF8=1` on the scdl subprocess and auto-repairing existing corrupt filemap entries.
- Consecutive syncs on Windows sometimes failing due to stale subprocess state
- Sync log lines appearing duplicated in the UI on Windows (yt-dlp writes to both stdout and stderr; stdout alone is now captured)

## [3.17.0] - 2026-02-20

### Fixed
- CI pipeline stability: NSIS installer upload fallback glob, webkit4.0 artifact ordering, strict artifact validation

### Changed
- Concurrent sync limit introduced: at most 2 sources sync simultaneously (semaphore-controlled)

## [3.15.0] - 2026-02-20

### Fixed
- CI: NSIS fallback glob pattern, webkit4.0 vs webkit4.1 artifact upload ordering, strict artifact existence checks

## [3.14.0] - 2026-02-20

### Fixed
- Sync manager: live sync state not cleaned up correctly between runs, causing ghost "running" entries

## [3.13.0] - 2026-02-20

### Added
- Custom NSIS installer: kills the running app before upgrading, displays the current version, offers a launch-after-install option

## [3.12.0] - 2026-02-20

### Fixed
- App not quitting when an update is applied — closing the window left the process alive in the system tray

## [3.11.0] - 2026-02-20

### Added
- Single-instance guard: launching a second instance focuses the existing window instead of starting a new process
- Rekordbox integration: auto-discover `.m3u8` playlist files, configurable discovery path

## [3.10.0] - 2026-02-20

### Added
- Auto-install Python dependencies on first launch — no manual venv setup required

## [3.9.0] - 2026-02-20

### Added
- Enhanced NSIS installer with version info and improved UX
- Rekordbox playlist feature enhancements

## [3.7.0] - 2026-02-20

### Fixed
- WebSocket live-update connection broken in compiled executable (new IPC approach)

## [3.6.0] - 2026-02-19

### Added
- Auto-update feature: checks GitHub releases on startup, downloads and applies updates in-app

### Fixed
- Windows WebSocket broken for the move-library operation in compiled exe

## [3.5.0] - 2026-02-19

### Added
- Periodic auto-sync: configurable interval to automatically sync all enabled sources in the background

## [3.4.0] - 2026-02-19

### Changed
- Sync system redesigned: the local file tracklist is now the source of truth. Missing files are re-downloaded; extra files are pruned from the archive.

## [3.3.0] - 2026-02-19

### Fixed
- AppImage Linux build compatibility

## [3.2.3] - 2026-02-19

### Fixed
- Live sync log not updating in the compiled exe: sync events are now bridged through Wails IPC instead of direct HTTP polling (which broke under the `wails:` protocol)

## [3.2.2] - 2026-02-18

### Fixed
- `scdl` executable not found on Windows: path is now resolved relative to `sys.executable` (same venv `Scripts/` dir) instead of relying on `PATH`

## [3.2.1] - 2026-02-18

### Fixed
- NSIS installer created a double-nested folder (`Program Files\scdl-web\scdl-web\`) — fixed by clearing `author.name` in `wails.json`
- Sync error message is now shown in the UI instead of a generic "failed" label

## [3.2.0] - 2026-02-18

### Fixed
- Sync failing to find `scdl`: venv `Scripts/bin` is now prepended to `PATH` for backend subprocesses

## [3.1.6] - 2026-02-18

### Fixed
- Windows CI: prepend NSIS installation directory to `PATH` inline in the build step

## [3.1.5] - 2026-02-18

### Fixed
- Linux CI: use `webkit2_41` build tag for Ubuntu 24.04 (`libwebkit2gtk-4.1-dev`)

## [3.1.4] - 2026-02-18

### Fixed
- Windows CI: NSIS not in PATH after `choco install nsis`

## [3.1.3] - 2026-02-18

### Fixed
- Linux CI: `wails build` fails on headless runner — wrapped with `xvfb-run`

## [3.1.2] - 2026-02-18

### Fixed
- Windows CI: NSIS installer artifact upload used exact filename; switched to glob to handle version-suffixed names

## [3.1.1] - 2026-02-18

### Fixed
- CI builds failing across all platforms; dropped macOS (unsupported runner), fixed Windows and Linux pipelines

## [3.1.0] - 2026-02-18

### Added
- System tray icon with Show / Quit menu items (ICO on Windows, PNG on Linux)
- Platform-specific installers: NSIS on Windows, AppImage on Linux

## [3.0.1] - 2026-02-18

### Fixed
- "Open folder" button falls back correctly when the shell open call fails
- `music_root` settings field type mismatch

## [3.0.0] - 2026-02-18

### Changed
- **Full rewrite as a native desktop app** using Wails v2 — Go host embeds the React frontend and manages the Python backend as a subprocess; ships as a single `.exe` / AppImage

## [2.0.1] - 2026-02-18

### Fixed
- SQLite database path on Windows: use forward slashes in the SQLAlchemy connection URL

## [2.0.0] - 2026-02-18

### Changed
- Removed Docker dependency: the app now runs natively with Python (FastAPI + uvicorn), no container required

## [1.0.0] - 2026-02-18

### Added
- Initial release with GitHub Actions CI/CD pipeline
