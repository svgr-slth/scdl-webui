import asyncio
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from app.database import async_session
from app.models.global_settings import GlobalSetting
from app.models.source import Source
from app.models.sync_run import SyncRun
from app.services.scdl_runner import ScdlRunner
from app.config import settings


@dataclass
class SyncLiveState:
    status: str = "idle"
    logs: list[str] = field(default_factory=list)
    progress: dict | None = None
    stats: dict | None = None
    error: str | None = None


class SyncManager:
    def __init__(self):
        self.active_tasks: dict[int, asyncio.Task] = {}
        self.log_buffers: dict[int, list[str]] = {}
        self._live: dict[int, SyncLiveState] = {}
        self._runner = ScdlRunner(settings.music_root, settings.archives_root)
        self._ws_manager = None

    @property
    def runner(self) -> ScdlRunner:
        return self._runner

    async def get_current_music_root(self) -> Path:
        """Read music_root from DB settings, falling back to env var default."""
        async with async_session() as db:
            row = await db.get(GlobalSetting, "music_root")
            return Path(row.value if row and row.value else settings.music_root)

    def set_ws_manager(self, ws_manager):
        self._ws_manager = ws_manager

    def is_source_syncing(self, source_id: int) -> bool:
        return source_id in self.active_tasks

    @property
    def is_syncing(self) -> bool:
        return len(self.active_tasks) > 0

    @property
    def active_source_id(self) -> int | None:
        if self.active_tasks:
            return next(iter(self.active_tasks.keys()))
        return None

    def get_live_state(self, source_id: int) -> SyncLiveState:
        return self._live.get(source_id, SyncLiveState())

    async def start_sync(self, source_id: int) -> str:
        from app.services.library_mover import library_mover
        if library_mover.is_moving:
            return "blocked_by_move"
        if source_id in self.active_tasks:
            return "already_running"
        task = asyncio.create_task(self._run_sync(source_id))
        self.active_tasks[source_id] = task
        return "started"

    async def start_sync_all(self) -> int:
        from app.services.library_mover import library_mover
        if library_mover.is_moving:
            return 0
        async with async_session() as db:
            result = await db.execute(
                select(Source).where(Source.sync_enabled == True).order_by(Source.name)
            )
            sources = result.scalars().all()
            count = 0
            for source in sources:
                if source.id not in self.active_tasks:
                    task = asyncio.create_task(self._run_sync(source.id))
                    self.active_tasks[source.id] = task
                    count += 1
                    # Wait for each to finish before starting next (sequential)
                    await task
        return count

    async def cancel_sync(self, source_id: int) -> bool:
        task = self.active_tasks.get(source_id)
        if task:
            task.cancel()
            return True
        return False

    async def _run_sync(self, source_id: int):
        async with async_session() as db:
            source = await db.get(Source, source_id)
            if not source:
                self.active_tasks.pop(source_id, None)
                return

            # Get auth token
            token_row = await db.get(GlobalSetting, "auth_token")
            auth_token = token_row.value if token_row else None

            # Read current music_root setting
            music_root_row = await db.get(GlobalSetting, "music_root")
            current_music_root = music_root_row.value if music_root_row and music_root_row.value else settings.music_root
            self._runner.music_root = Path(current_music_root)

            # Create sync run
            run = SyncRun(source_id=source_id, status="running")
            db.add(run)
            await db.commit()
            await db.refresh(run)

            # Reset live state for this sync (clears previous run's data)
            self._live[source_id] = SyncLiveState(status="running")

            # Init log buffer for this source
            self.log_buffers[source_id] = []

            # Pre-sync: regenerate archive/sync files from disk state
            pruned = self._runner.prepare_sync_files(source.id)
            if pruned > 0:
                prune_msg = f"[pre-sync] {pruned} missing files will be re-downloaded"
                self.log_buffers.setdefault(source_id, []).append(prune_msg)
                self._live[source_id].logs.append(prune_msg)
                if self._ws_manager:
                    await self._ws_manager.broadcast(source_id, {
                        "type": "log",
                        "line": prune_msg,
                    })

            # Progress tracking
            item_re = re.compile(r"Downloading item (\d+) of (\d+)")
            total_items = 0
            processed_items = 0

            async def on_output(line: str):
                nonlocal total_items, processed_items
                self.log_buffers.setdefault(source_id, []).append(line)
                self._live[source_id].logs.append(line)
                if self._ws_manager:
                    await self._ws_manager.broadcast(source_id, {
                        "type": "log",
                        "line": line,
                    })

                # Detect total from "Downloading item X of Y"
                m = item_re.search(line)
                if m:
                    total_items = int(m.group(2))

                # Count processed tracks (downloaded, skipped, or removed)
                if ("Destination:" in line
                    or "has already been recorded in the archive" in line
                    or "Removing" in line):
                    processed_items += 1

                # Update live progress and broadcast
                if total_items > 0:
                    self._live[source_id].progress = {
                        "current": min(processed_items, total_items),
                        "total": total_items,
                    }
                    if self._ws_manager:
                        await self._ws_manager.broadcast(source_id, {
                            "type": "progress",
                            "current": min(processed_items, total_items),
                            "total": total_items,
                        })

            try:
                if self._ws_manager:
                    await self._ws_manager.broadcast(source_id, {
                        "type": "status",
                        "status": "running",
                    })

                result = await self._runner.run_sync(source, auth_token, on_output)

                run.status = "completed" if result.success else "failed"
                run.finished_at = datetime.now(timezone.utc)
                run.tracks_added = result.tracks_added
                run.tracks_removed = result.tracks_removed
                run.tracks_skipped = result.tracks_skipped
                run.log_output = result.output
                if not result.success:
                    run.error_message = f"Process exited with code {result.return_code}"

                await db.commit()

                # Update live state with final result
                self._live[source_id].status = run.status
                self._live[source_id].stats = {
                    "added": result.tracks_added,
                    "removed": result.tracks_removed,
                    "skipped": result.tracks_skipped,
                }
                if not result.success:
                    self._live[source_id].error = run.error_message

                if self._ws_manager:
                    await self._ws_manager.broadcast(source_id, {
                        "type": "stats",
                        "added": result.tracks_added,
                        "removed": result.tracks_removed,
                        "skipped": result.tracks_skipped,
                    })
                    msg: dict = {"type": "status", "status": run.status}
                    if not result.success:
                        msg["error"] = run.error_message
                    await self._ws_manager.broadcast(source_id, msg)

            except asyncio.CancelledError:
                run.status = "cancelled"
                run.finished_at = datetime.now(timezone.utc)
                await db.commit()
                self._live[source_id].status = "cancelled"
                if self._ws_manager:
                    await self._ws_manager.broadcast(source_id, {
                        "type": "status",
                        "status": "cancelled",
                    })
            except Exception as e:
                run.status = "failed"
                run.finished_at = datetime.now(timezone.utc)
                run.error_message = str(e)
                await db.commit()
                self._live[source_id].status = "failed"
                self._live[source_id].error = str(e)
                if self._ws_manager:
                    await self._ws_manager.broadcast(source_id, {
                        "type": "status",
                        "status": "failed",
                        "error": str(e),
                    })
            finally:
                self.active_tasks.pop(source_id, None)
                self.log_buffers.pop(source_id, None)
                # _live[source_id] intentionally kept so polling can read final state


sync_manager = SyncManager()
