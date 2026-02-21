from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import update

from app.database import init_db, async_session
from app.models.sync_run import SyncRun
from app.routers import sources, settings, history, sync, filesystem, rekordbox
from app.ws.sync_progress import ws_manager
from app.services.auto_sync import auto_sync_scheduler
from app.services.library_mover import library_mover
from app.services.sync_manager import sync_manager


async def _cleanup_stale_runs() -> None:
    """Mark any SyncRun records stuck in 'running' status as 'interrupted'.

    These are left behind when the backend process is killed mid-sync.
    Without this, sources appear permanently stuck in the UI and cannot
    be deleted or synced again.
    """
    async with async_session() as db:
        result = await db.execute(
            update(SyncRun)
            .where(SyncRun.status == "running")
            .values(
                status="interrupted",
                finished_at=datetime.now(timezone.utc),
                error_message="Backend restarted while sync was in progress",
            )
        )
        await db.commit()
        if result.rowcount:
            import logging
            logging.getLogger(__name__).warning(
                "Marked %d stale sync run(s) as interrupted", result.rowcount
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await _cleanup_stale_runs()
    sync_manager.set_ws_manager(ws_manager)
    await sync_manager.load_max_concurrent()
    library_mover.set_ws_manager(ws_manager)
    ws_manager.set_log_buffer_provider(lambda sid: sync_manager.log_buffers.get(sid))
    await auto_sync_scheduler.start()
    yield
    auto_sync_scheduler.stop()


app = FastAPI(title="scdl-web", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sources.router)
app.include_router(settings.router)
app.include_router(history.router)
app.include_router(sync.router)
app.include_router(filesystem.router)
app.include_router(rekordbox.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/move-library/live")
async def get_move_live_state(cursor: int = 0):
    return library_mover.get_live_state(cursor)


@app.websocket("/ws/sync/{source_id}")
async def websocket_sync(websocket: WebSocket, source_id: int):
    await ws_manager.connect(source_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(source_id, websocket)


@app.websocket("/ws/move-library")
async def websocket_move(websocket: WebSocket):
    await ws_manager.connect(0, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(0, websocket)
