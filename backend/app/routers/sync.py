from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.source import Source
from app.schemas.sync_run import SyncStatus
from app.services.sync_manager import sync_manager

router = APIRouter(prefix="/api/sync", tags=["sync"])


# Static routes MUST come before dynamic /{source_id} routes
@router.post("/all")
async def trigger_sync_all():
    count = await sync_manager.start_sync_all()
    return {"status": "started", "count": count}


@router.get("/status", response_model=SyncStatus)
async def get_sync_status(db: AsyncSession = Depends(get_db)):
    source_name = None
    if sync_manager.active_source_id:
        source = await db.get(Source, sync_manager.active_source_id)
        if source:
            source_name = source.name
    return SyncStatus(
        is_syncing=sync_manager.is_syncing,
        active_source_id=sync_manager.active_source_id,
        active_source_name=source_name,
    )


@router.get("/{source_id}/status")
async def get_source_sync_status(source_id: int):
    return {"is_syncing": sync_manager.is_source_syncing(source_id)}


@router.get("/{source_id}/live")
async def get_source_live_state(source_id: int, cursor: int = 0):
    state = sync_manager.get_live_state(source_id)
    effective_cursor = min(cursor, len(state.logs))
    return {
        "status": state.status,
        "logs": state.logs[effective_cursor:],
        "cursor": len(state.logs),
        "progress": state.progress,
        "stats": state.stats,
        "error": state.error,
    }


@router.post("/{source_id}")
async def trigger_sync(source_id: int, db: AsyncSession = Depends(get_db)):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(404, "Source not found")
    result = await sync_manager.start_sync(source_id)
    return {"status": result, "source_id": source_id}


@router.post("/{source_id}/cancel")
async def cancel_sync(source_id: int):
    cancelled = await sync_manager.cancel_sync(source_id)
    if not cancelled:
        raise HTTPException(404, "No active sync for this source")
    return {"status": "cancelled"}


@router.post("/{source_id}/reset-archive")
async def reset_archive(source_id: int, db: AsyncSession = Depends(get_db)):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(404, "Source not found")
    if sync_manager.is_source_syncing(source_id):
        raise HTTPException(409, "Cannot reset archive while sync is running")
    sync_manager.runner.reset_archive(source_id)
    return {"status": "reset", "source_id": source_id}
