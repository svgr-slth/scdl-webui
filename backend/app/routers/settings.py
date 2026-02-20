from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as app_settings
from app.database import get_db
from app.models.global_settings import GlobalSetting
from app.schemas.settings import SettingsRead, SettingsUpdate
from app.services.auto_sync import auto_sync_scheduler
from app.services.library_mover import library_mover
from app.services.sync_manager import sync_manager

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTING_KEYS = [
    "auth_token", "default_audio_format", "default_name_format", "music_root",
    "auto_sync_enabled", "auto_sync_interval_minutes", "max_concurrent_syncs",
    "rekordbox_xml_path",
]


async def _get_all_settings(db: AsyncSession) -> dict[str, str | None]:
    result = await db.execute(select(GlobalSetting))
    rows = result.scalars().all()
    return {r.key: r.value for r in rows}


def _build_settings_read(settings: dict[str, str | None]) -> SettingsRead:
    return SettingsRead(
        auth_token=settings.get("auth_token"),
        default_audio_format=settings.get("default_audio_format", "mp3"),
        default_name_format=settings.get("default_name_format"),
        music_root=settings.get("music_root") or app_settings.music_root,
        auto_sync_enabled=settings.get("auto_sync_enabled") == "true",
        auto_sync_interval_minutes=int(settings["auto_sync_interval_minutes"])
        if settings.get("auto_sync_interval_minutes")
        else 60,
        max_concurrent_syncs=int(settings["max_concurrent_syncs"])
        if settings.get("max_concurrent_syncs")
        else 2,
        rekordbox_xml_path=settings.get("rekordbox_xml_path"),
    )


@router.get("", response_model=SettingsRead)
async def get_settings(db: AsyncSession = Depends(get_db)):
    settings = await _get_all_settings(db)
    return _build_settings_read(settings)


@router.put("", response_model=SettingsRead)
async def update_settings(payload: SettingsUpdate, db: AsyncSession = Depends(get_db)):
    for key, value in payload.model_dump(exclude_unset=True).items():
        # GlobalSetting stores strings — convert bool/int
        if isinstance(value, bool):
            db_value = "true" if value else "false"
        elif value is not None:
            db_value = str(value)
        else:
            db_value = value
        existing = await db.get(GlobalSetting, key)
        if existing:
            existing.value = db_value
        else:
            db.add(GlobalSetting(key=key, value=db_value))
    await db.commit()

    settings = await _get_all_settings(db)
    result = _build_settings_read(settings)

    # Notify scheduler if auto-sync settings were touched
    updated_keys = set(payload.model_dump(exclude_unset=True).keys())
    if updated_keys & {"auto_sync_enabled", "auto_sync_interval_minutes"}:
        await auto_sync_scheduler.update(
            result.auto_sync_enabled,
            result.auto_sync_interval_minutes,
        )

    # Update sync concurrency limit if changed
    if "max_concurrent_syncs" in updated_keys:
        sync_manager.update_max_concurrent(result.max_concurrent_syncs)

    return result


@router.get("/move-check")
async def move_check(
    new_music_root: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Pre-flight check: how many files would be moved."""
    if sync_manager.is_syncing:
        raise HTTPException(409, "Cannot move library while a sync is running")
    if library_mover.is_moving:
        raise HTTPException(409, "A library move is already in progress")

    row = await db.get(GlobalSetting, "music_root")
    old_root = Path(row.value if row and row.value else app_settings.music_root)
    new_root = Path(new_music_root)

    if old_root.resolve() == new_root.resolve():
        return {"needs_move": False, "source_count": 0, "total_files": 0, "total_size": 0}

    return await library_mover.pre_check(old_root, new_root)


@router.post("/move-library")
async def move_library(
    payload: SettingsUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Start the library move as a background task."""
    if sync_manager.is_syncing:
        raise HTTPException(409, "Cannot move library while a sync is running")
    if library_mover.is_moving:
        raise HTTPException(409, "A library move is already in progress")

    new_music_root = payload.music_root
    if not new_music_root:
        raise HTTPException(400, "music_root is required")

    row = await db.get(GlobalSetting, "music_root")
    old_root = Path(row.value if row and row.value else app_settings.music_root)
    new_root = Path(new_music_root)

    if old_root.resolve() == new_root.resolve():
        raise HTTPException(400, "New path is the same as the current path")

    archives_root = Path(app_settings.archives_root)
    library_mover.start_move(old_root, new_root, archives_root)

    return {"status": "started"}


@router.get("/move-status")
async def move_status():
    """Poll endpoint for move status (fallback if WS not connected)."""
    return {
        "is_moving": library_mover.is_moving,
        "status": library_mover.status,
        "total_files": library_mover.total_files,
        "moved_files": library_mover.moved_files,
        "current_file": library_mover.current_file,
        "error": library_mover.error,
    }
