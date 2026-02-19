import mimetypes
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import FileResponse

from app.database import get_db
from app.models.source import Source
from app.models.sync_run import SyncRun
from app.schemas.source import SourceCreate, SourceRead, SourceUpdate
from app.services.sync_manager import sync_manager

router = APIRouter(prefix="/api/sources", tags=["sources"])


@router.get("", response_model=list[SourceRead])
async def list_sources(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Source).order_by(Source.name))
    sources = result.scalars().all()
    out = []
    for s in sources:
        data = SourceRead.model_validate(s)
        # Get last sync info
        last_run = await db.execute(
            select(SyncRun)
            .where(SyncRun.source_id == s.id)
            .order_by(SyncRun.started_at.desc())
            .limit(1)
        )
        run = last_run.scalar_one_or_none()
        if run:
            data.last_sync_status = run.status
            data.last_sync_at = run.started_at
        out.append(data)
    return out


@router.post("", response_model=SourceRead, status_code=201)
async def create_source(payload: SourceCreate, db: AsyncSession = Depends(get_db)):
    source = Source(**payload.model_dump())
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return SourceRead.model_validate(source)


@router.get("/{source_id}", response_model=SourceRead)
async def get_source(source_id: int, db: AsyncSession = Depends(get_db)):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(404, "Source not found")
    data = SourceRead.model_validate(source)
    last_run = await db.execute(
        select(SyncRun)
        .where(SyncRun.source_id == source.id)
        .order_by(SyncRun.started_at.desc())
        .limit(1)
    )
    run = last_run.scalar_one_or_none()
    if run:
        data.last_sync_status = run.status
        data.last_sync_at = run.started_at
    return data


@router.put("/{source_id}", response_model=SourceRead)
async def update_source(source_id: int, payload: SourceUpdate, db: AsyncSession = Depends(get_db)):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(404, "Source not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(source, key, value)
    await db.commit()
    await db.refresh(source)
    return SourceRead.model_validate(source)


@router.delete("/{source_id}", status_code=204)
async def delete_source(
    source_id: int,
    delete_files: bool = False,
    db: AsyncSession = Depends(get_db),
):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(404, "Source not found")

    if sync_manager.is_source_syncing(source_id):
        raise HTTPException(409, "Cannot delete source while sync is running")

    # Always clean up archive/sync/filemap files
    sync_manager.runner.delete_archive_files(source_id)

    # Optionally delete music files
    if delete_files:
        music_root = await sync_manager.get_current_music_root()
        music_folder = music_root / source.local_folder
        try:
            music_folder.resolve().relative_to(music_root.resolve())
        except ValueError:
            raise HTTPException(400, "Invalid music folder path")
        if music_folder.exists():
            shutil.rmtree(music_folder)

    await db.delete(source)
    await db.commit()


@router.post("/{source_id}/open-folder")
async def open_folder(source_id: int, db: AsyncSession = Depends(get_db)):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(404, "Source not found")

    music_root = await sync_manager.get_current_music_root()
    folder = music_root / source.local_folder

    # Directory traversal protection
    try:
        folder.resolve().relative_to(music_root.resolve())
    except ValueError:
        raise HTTPException(400, "Invalid folder path")

    # Create if it doesn't exist
    folder.mkdir(parents=True, exist_ok=True)

    target = folder

    # Try to open with the native file manager
    opened = False
    if sys.platform == "linux":
        cmd = "xdg-open"
    elif sys.platform == "darwin":
        cmd = "open"
    elif sys.platform == "win32":
        cmd = "explorer"
    else:
        cmd = None

    if cmd:
        try:
            subprocess.Popen([cmd, str(target)])
            opened = True
        except FileNotFoundError:
            pass

    return {"status": "opened" if opened else "path_only", "path": str(target)}


AUDIO_EXTENSIONS = {".mp3", ".flac", ".opus", ".ogg", ".wav", ".m4a", ".aac", ".wma"}


@router.get("/{source_id}/tracks")
async def list_tracks(source_id: int, db: AsyncSession = Depends(get_db)):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(404, "Source not found")

    music_root = await sync_manager.get_current_music_root()
    folder = music_root / source.local_folder

    try:
        folder.resolve().relative_to(music_root.resolve())
    except ValueError:
        raise HTTPException(400, "Invalid folder path")

    # Load filemap to associate track IDs with files on disk
    filemap = sync_manager.runner._load_filemap(source.id)
    filemap_paths: dict[str, str] = {v: k for k, v in filemap.items()}

    tracks = []

    # 1. Filemap entries for files that no longer exist → missing
    for track_id, filepath in filemap.items():
        p = Path(filepath)
        if not p.is_file():
            tracks.append({
                "name": p.stem,
                "relative_path": None,
                "size": 0,
                "modified_at": None,
                "status": "missing",
                "track_id": track_id,
            })

    # 2. Scan all audio files in the source folder — all are synced
    if folder.exists():
        for f in sorted(folder.rglob("*")):
            if f.is_file() and f.suffix.lower() in AUDIO_EXTENSIONS:
                stat = f.stat()
                track_id = filemap_paths.get(str(f))
                tracks.append({
                    "name": f.stem,
                    "relative_path": str(f.relative_to(folder)),
                    "size": stat.st_size,
                    "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                    "status": "synced",
                    "track_id": track_id,
                })

    return tracks


@router.get("/{source_id}/tracks/stream")
async def stream_track(
    source_id: int,
    path: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(404, "Source not found")

    music_root = await sync_manager.get_current_music_root()
    folder = music_root / source.local_folder
    file_path = (folder / path).resolve()

    # Traversal protection
    try:
        file_path.relative_to(folder.resolve())
    except ValueError:
        raise HTTPException(400, "Invalid file path")

    if not file_path.is_file():
        raise HTTPException(404, "File not found")

    media_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    return FileResponse(file_path, media_type=media_type)


@router.delete("/{source_id}/tracks")
async def delete_track(
    source_id: int,
    path: str = Query(...),
    track_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(404, "Source not found")

    music_root = await sync_manager.get_current_music_root()
    folder = music_root / source.local_folder
    file_path = (folder / path).resolve()

    # Traversal protection
    try:
        file_path.relative_to(folder.resolve())
    except ValueError:
        raise HTTPException(400, "Invalid file path")

    if not file_path.is_file():
        raise HTTPException(404, "File not found")

    # Resolve track_id: prefer the one from the client, fall back to filemap lookup
    filemap = sync_manager.runner._load_filemap(source.id)
    if not track_id:
        abs_path = str(file_path)
        for tid, fp in filemap.items():
            if fp == abs_path:
                track_id = tid
                break

    if track_id:
        filemap.pop(track_id, None)
        sync_manager.runner._save_filemap(source.id, filemap)

    # Delete the file — next sync's prepare_sync_files will exclude it
    file_path.unlink()

    return {"status": "deleted"}


