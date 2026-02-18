import shutil
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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

    # Open with the native file manager
    if sys.platform == "linux":
        cmd = "xdg-open"
    elif sys.platform == "darwin":
        cmd = "open"
    elif sys.platform == "win32":
        cmd = "explorer"
    else:
        raise HTTPException(500, f"Unsupported platform: {sys.platform}")

    try:
        subprocess.Popen([cmd, str(folder)])
    except FileNotFoundError:
        raise HTTPException(500, f"Command '{cmd}' not found. Is it installed?")

    return {"status": "opened", "path": str(folder)}
