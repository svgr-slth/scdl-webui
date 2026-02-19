from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import sources, settings, history, sync, filesystem
from app.ws.sync_progress import ws_manager
from app.services.library_mover import library_mover
from app.services.sync_manager import sync_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    sync_manager.set_ws_manager(ws_manager)
    library_mover.set_ws_manager(ws_manager)
    ws_manager.set_log_buffer_provider(lambda sid: sync_manager.log_buffers.get(sid))
    yield


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


@app.get("/api/health")
async def health():
    return {"status": "ok"}


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
