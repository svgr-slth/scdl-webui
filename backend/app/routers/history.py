from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.source import Source
from app.models.sync_run import SyncRun
from app.schemas.sync_run import SyncRunDetail, SyncRunRead

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("", response_model=list[SyncRunRead])
async def list_history(
    source_id: int | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    query = select(SyncRun).order_by(SyncRun.started_at.desc()).limit(limit).offset(offset)
    if source_id is not None:
        query = query.where(SyncRun.source_id == source_id)
    result = await db.execute(query)
    runs = result.scalars().all()
    out = []
    for run in runs:
        data = SyncRunRead.model_validate(run)
        source = await db.get(Source, run.source_id)
        if source:
            data.source_name = source.name
        out.append(data)
    return out


@router.get("/{run_id}", response_model=SyncRunDetail)
async def get_run_detail(run_id: int, db: AsyncSession = Depends(get_db)):
    run = await db.get(SyncRun, run_id)
    if not run:
        raise HTTPException(404, "Sync run not found")
    data = SyncRunDetail.model_validate(run)
    source = await db.get(Source, run.source_id)
    if source:
        data.source_name = source.name
    return data
